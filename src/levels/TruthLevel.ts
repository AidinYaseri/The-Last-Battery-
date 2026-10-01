import * as THREE from 'three';
import { BaseLevel, type Destination } from './BaseLevel';
import { buildCabin, BASEMENT, type CabinRefs } from './CabinBuilder';
import { colorMat, texMat } from '../world/Materials';
import { fbm } from '../world/Textures';
import { drawPhoto, polaroid } from '../world/PhotoArt';
import type { Surface } from '../player/Player';
import { sleep } from '../core/Scheduler';
import { smoothstep, paintTexture } from './util';
import { CLUES } from '../story/StoryData';

const ROAD_Z = -92;
const FRAGS = ['frag_campsite', 'frag_motel', 'frag_highway', 'frag_tunnel'];

interface Mover {
  obj: THREE.Object3D;
  spots: THREE.Vector3[];
  idx: number;
  cooldown: number;
}

/**
 * LEVEL 5 - THE TRUTH.
 * The cabin and the forest, but wrong. Fragments of earlier places drift in the
 * trees. Collect the memories, then choose: break the machine, follow the
 * white marks to the road, or follow the GPS "home".
 */
export class TruthLevel extends BaseLevel {
  id = 5;
  name = 'THE TRUTH';
  mapName = '???';
  customFadeIn = true;
  cabin!: CabinRefs;
  private movers: Mover[] = [];
  private marks: THREE.Object3D[] = [];
  private daylight = false;
  private ending = false;
  private wrapCooldown = 0;
  private glitchTimer = 20;
  private escapeCar?: { group: THREE.Group; headlights: THREE.Mesh[]; body: THREE.Mesh };
  private carLight?: THREE.SpotLight;
  private dayCars: { group: THREE.Group; speed: number }[] = [];
  private windowLight?: THREE.PointLight;
  private windowGlow?: THREE.Sprite;

  groundHeight(x: number, z: number): number {
    if (z < -150) return 0;
    const d = Math.hypot(x, z - 3);
    const k = smoothstep(18, 34, d) * (1 - (Math.abs(x) < 5 && z < 0 ? 0.8 : 0));
    const roadFlat = 1 - smoothstep(4, 9, Math.abs(z - ROAD_Z));
    return (fbm(x * 0.03 + 21, z * 0.03 + 4, 3) - 0.45) * 4 * k * (1 - roadFlat);
  }

  surfaceAt(x: number, z: number): Surface {
    if (z < -150) return 'concrete';
    if (Math.abs(z - ROAD_Z) < 3.4) return 'asphalt';
    if (Math.abs(x) < 7 && z > -5.5 && z < 8.1) return 'wood';
    return 'leaves';
  }

  ambientAt(x: number, z: number): number {
    if (z < -150) return 0.12;
    if (Math.abs(x) < 7 && z > -5.5 && z < 5.5) return 0.4;
    if (x > -16 && x < -12 && z > 3 && z < 7) return 0.4;
    return 1;
  }

  signalAt(): number {
    return this.daylight ? 3 : 1;
  }

  signalLabel(): string | undefined {
    return this.daylight ? undefined : 'SOS';
  }

  gpsDestination(): Destination | null {
    return { x: 0, z: 7.5, label: 'HOME', sub: '14 Alder Ridge Rd · 40 m' };
  }

  build(): void {
    const b = this.b;
    const ctx = this.ctx;
    this.setupAtmosphere({
      fogColor: 0x120a0c,
      fogDensity: 0.05,
      skyTop: 0x080306,
      skyBottom: 0x2a1014,
      moon: true,
      stars: true,
      moonDir: [0.2, 0.45, -0.85],
      moonColor: 0xc89090,
      moonIntensity: 0.4,
      hemiSky: 0x3a2830,
      hemiGround: 0x140c0c,
      hemiIntensity: 0.6,
      particles: 'ash',
      exposure: 1.3,
    });
    this.ambience = { wind: 0.6, windTone: 380, crickets: 0.15, hum: 0.15, reverb: 0.45 };
    this.mapBounds = { minX: -55, maxX: 55, minZ: -98, maxZ: 50 };
    ctx.collision.setBounds(-52, 52, -212, 50);
    ctx.collision.addBox(0, -100, 140, 4);
    this.spawn = { x: -3.2, z: 2.6, yaw: Math.PI / 2 };

    const h = (x: number, z: number) => this.groundHeight(x, z);
    b.terrain({ x0: -90, z0: -120, w: 180, d: 180, seg: 90, height: h, color: () => [0.75, 0.68, 0.66] });
    // road
    b.box(140, 0.03, 7, texMat('asphalt', 1), 0, h(0, ROAD_Z) - 0.01, ROAD_Z, { uvScale: 5, cast: false });
    for (let x = -66; x < 70; x += 7) b.box(3, 0.01, 0.14, colorMat(0xc8a840, 0.6), x, h(0, ROAD_Z) + 0.03, ROAD_Z, { cast: false });

    const corridor = (x: number, z: number) => z < -6 && z > ROAD_Z + 3 && Math.abs(x) < 4.5;
    const clear = (x: number, z: number) =>
      Math.hypot(x, z - 3) < 17 || corridor(x, z) || Math.abs(z - ROAD_Z) < 6 || Math.hypot(x + 28, z + 22) < 7 || Math.hypot(x - 28, z + 24) < 6 || Math.hypot(x - 34, z - 14) < 6 || Math.hypot(x + 34, z - 10) < 7;
    b.forest({ minX: -90, maxX: 90, minZ: -120, maxZ: 70, count: 1400, seed: 51, height: h, exclude: clear, collide: (x, z) => Math.abs(x) < 56 && z > -100 && z < 54, deadRatio: 0.35, bushes: 300, minSpacing: 2.2 });
    b.grass({ minX: -40, maxX: 40, minZ: -90, maxZ: 40, count: 3500, seed: 52, height: h, color: 0x3a3028, exclude: (x, z) => (Math.abs(x) < 7.5 && z > -6.5 && z < 8.5) || Math.abs(z - ROAD_Z) < 4 });

    this.cabin = buildCabin(b, { truth: true });
    this.buildFragments();
    this.buildMarks();
    this.buildEndings();
    this.buildMovers();
    this.setupInteractions();

    this.landmark('cabin', 'The cabin', 0, 0, 12);
    this.landmark('camp', 'The campsite?', -28, -22, 8);
    this.landmark('motel', 'Room 4?', 28, -24, 8);
    this.landmark('highway', 'The red car?', 34, 14, 8);
    this.landmark('tunnel', 'The tunnel?', -34, 10, 8);
    this.landmark('road', 'The road', 0, ROAD_Z, 10);
    this.mapRoads = [{ pts: [[-55, ROAD_Z], [55, ROAD_Z]], w: 6, kind: 'road' }];
    this.mapAreas = [{ x: 0, z: 0, w: 14, d: 11, landmark: 'cabin' }];
  }

  // ------------------------------------------------------------------ memory fragments
  private fragment(id: string, pos: THREE.Vector3, obj: THREE.Object3D, prompt: string, memory: string[], extra?: () => void): void {
    const glow = this.b.glow(pos.x, pos.y + 0.3, pos.z, 0xffe0c0, 1.2, 0.5);
    glow.userData.dynamic = true;
    this.onUpdate((_dt, t) => {
      glow.visible = !this.ctx.clues.has(id);
      (glow.material as THREE.SpriteMaterial).opacity = 0.35 + Math.sin(t * 2 + pos.x) * 0.2;
    });
    this.addInteractable({
      id,
      object: obj,
      prompt: () => (this.ctx.clues.has(id) ? 'Remembered' : prompt),
      onInteract: async () => {
        if (this.ctx.clues.has(id)) return;
        const { ctx } = this;
        ctx.game.setMode('cutscene');
        ctx.audio.play('whoosh', { volume: 0.9 });
        ctx.hud.flash(0.95);
        ctx.audio.setMuffled(true, 900);
        extra?.();
        await ctx.dialogue.say(memory.map((m) => ({ text: m, speaker: 'MEMORY', voice: 'self' as const, volume: 0.7 })));
        ctx.audio.setMuffled(false);
        ctx.clues.add(id);
        const n = FRAGS.filter((f) => ctx.clues.has(f)).length;
        ctx.hud.toast(`Memories recovered: ${n}/4`, 'info', 'MEMORY');
        ctx.game.setMode('play');
        this.updateObjective();
        this.glitch();
      },
    });
  }

  private buildFragments(): void {
    const b = this.b;
    const h = (x: number, z: number) => this.groundHeight(x, z);
    // the campsite, drifted into the wrong part of the forest
    const cy = h(-28, -22);
    b.tent(-30, -24, 0.9, cy);
    b.firePit(-27, -20, cy, true);
    b.campChair(-25.5, -22.5, -1, cy);
    const stump = b.cyl(0.35, 0.42, 0.6, texMat('bark', 1), -27.6, cy, -21.5, { collideR: 0.4 });
    const pol = b.canvasPlane(polaroid(drawPhoto('campsite_figure', { date: "OCT 22 '26 23:14", seed: 22 }), 'for you'), 0.22, -27.6, cy + 0.62, -21.5, 0, -Math.PI / 2);
    this.fragment('frag_campsite', new THREE.Vector3(-27.6, cy + 0.8, -21.5), stump, 'Touch the Polaroid', ['I set this tent up myself. October 21st.', 'I took the photo on the 22nd and pinned it where the next me would find it.']);
    void pol;
    const aa = b.box(0.12, 0.05, 0.08, colorMat(0xd8b020, 0.4, 0.3), -25.6, cy + 0.47, -22.4);
    this.pickup({
      id: 'aa5',
      object: aa,
      prompt: 'Take batteries',
      onPick: () => {
        this.ctx.flashlight.addCharge(50);
        this.ctx.hud.toast('Flashlight batteries (+50%)', 'item');
        this.ctx.audio.play('pickup');
      },
    });
    const ember = new THREE.PointLight(0xff6a30, 2.5, 7, 1.5);
    ember.position.set(-27, cy + 0.5, -20);
    b.add(ember);
    this.onUpdate((_dt, t) => (ember.intensity = 2 + Math.sin(t * 9) * 0.5 + Math.sin(t * 23) * 0.3));
    // a motel door, standing alone in the trees
    const my = h(28, -24);
    b.box(1.4, 2.4, 0.4, texMat('siding', 1, { color: 0xb09878 }), 28, my, -24, { collide: true });
    b.box(0.95, 2.05, 0.05, texMat('planks', 1, { color: 0x6a5040 }), 28, my, -23.78, {});
    b.textPlane(['4'], 0.25, 0.25, { bg: '#d8c890', fg: '#222', size: 180 }, 28, my + 2.3, -23.75, 0);
    b.table(28.2, -22.4, 0.8, 0.5, 0.2);
    const reg = b.box(0.3, 0.04, 0.4, colorMat(0x5a2020, 0.7), 28.2, my + 0.78, -22.4);
    this.fragment('frag_motel', new THREE.Vector3(28.2, my + 0.9, -22.4), reg, 'Read the register', ['Every loop I go back to room 4 and sign the register again.', "It's how I count. This is the fifth time. Maybe the sixth."]);
    const neon = b.textPlane(['MOTEL'], 2, 0.6, { fg: '#ff4040', size: 150 }, 28, my + 3.4, -24.25, 0, 0, false);
    neon.userData.dynamic = true;
    this.onUpdate((_dt, t) => (neon.visible = Math.sin(t * 7) > -0.6));
    // the red car with its radio
    const car = b.car({ x: 34, z: 14, rot: 0.8, color: 0x8a1a1a, type: 'hatch', y: h(34, 14) });
    const rpos = new THREE.Vector3(34, h(34, 14) + 1.2, 14);
    this.ctx.audio.playAt('static', rpos, { loop: true, volume: 0.25, refDist: 2 });
    this.fragment('frag_highway', rpos, car.body, 'Listen to the radio', ["If you're hearing this, do not go back to the cabin.", 'That was my voice. I recorded the warning and left the radio looping it, so I would hear it on the way.'], () => this.ctx.clues.add('radio_warning', true));
    // the tunnel mouth, half swallowed by the forest
    const ty = h(-34, 10);
    const tm = texMat('concrete', 1, { color: 0x7a7a74 });
    b.box(1.2, 4.5, 8, tm, -34, ty, 10, { collide: true, uvScale: 2 }).visible = false;
    b.box(4, 4.5, 1.2, tm, -34, ty, 6.6, { collide: true, uvScale: 2 });
    b.box(4, 4.5, 1.2, tm, -34, ty, 13.4, { collide: true, uvScale: 2 });
    b.box(4, 1.5, 8, tm, -34, ty + 4.5, 10, { uvScale: 2 });
    b.box(0.2, 4.5, 5.6, colorMat(0x000000, 1), -35.8, ty, 10, { collide: true });
    b.textPlane(['HOLLOW RIDGE TUNNEL'], 3.6, 0.4, { bg: '#1f5a2e', fg: '#fff', size: 80 }, -31.95, ty + 4.8, 10, Math.PI / 2);
    const note = b.paper(-32.1, ty + 1.5, 10, Math.PI / 2, false, 0.24, 0.32, 0xf0ead8);
    this.fragment('frag_tunnel', new THREE.Vector3(-32.1, ty + 1.5, 10), note, 'Read the note', ['There is a machine in the basement. When I reach the cabin, it takes everything since the forest.', 'Break it. Or follow the white marks to the road and never look back.', 'And never follow the GPS. "Home" is the cabin.']);
    // missing poster of me, nailed to a tree near the driveway
    const py = h(4, 18);
    b.cyl(0.25, 0.3, 6, texMat('bark', 1), 4, py, 18, { collideR: 0.3 });
    const poster = b.canvasPlane(drawPhoto('portrait', { seed: 9, w: 200, h: 240, mono: true, caption: 'MISSING: SAM REYES' }), 0.45, 4, py + 1.6, 18.27, 0);
    this.readable({ id: 'myposter', object: poster, prompt: 'Read poster', note: { title: 'MISSING', text: 'SAM REYES, 29.\nLast seen October 22, Alder Falls.\n\nThe paper is old. Sun-bleached. Years old.' } });
  }

  // ------------------------------------------------------------------ white marks
  private buildMarks(): void {
    const b = this.b;
    // dead tree with painted message, photo-only
    const x = 2.5;
    const z = -11;
    const y = this.groundHeight(x, z);
    b.cyl(0.25, 0.4, 7, texMat('bark', 1, { color: 0x3a3430 }), x, y, z, { collideR: 0.4, occlude: true });
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: paintTexture(['FOLLOW THE', 'WHITE MARKS'], '#f4f4f4'), transparent: true }));
    paint.position.set(x, y + 1.9, z + 0.42);
    b.add(paint);
    b.photoOnly(paint);
    this.addInteractable({ id: 'deadtree', object: b.hitbox(0.9, 3, 0.9, x, y, z), prompt: 'Examine dead tree', onInteract: () => this.ctx.dialogue.thought('The bark has been scraped smooth here. Like the tree in the forest. A photo might show something.', 3.5) });
    this.photoTargets.push({
      id: 'marks',
      pos: new THREE.Vector3(x, y + 1.9, z + 0.42),
      range: 14,
      onReveal: async (url) => {
        await this.ctx.modal.note({ title: 'The photo', text: 'Painted on the dead tree, invisible until the flash:\n\n"FOLLOW THE WHITE MARKS."\n\nAnd now that I know to look, I can see them. White slashes on the trees, leading north.', image: url, imageWidth: 360 });
        this.revealMarks();
      },
    });
    // marks along the corridor, hidden until revealed
    for (let zz = -18; zz > ROAD_Z + 4; zz -= 7) {
      const side = (Math.floor(-zz / 7) % 2 ? 1 : -1) * 4.6;
      const yy = this.groundHeight(side, zz);
      b.cyl(0.24, 0.34, 8, texMat('bark', 1, { color: 0x4a4038 }), side, yy, zz, { collideR: 0.35 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.7), new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }));
      m.position.set(side - Math.sign(side) * 0.27, yy + 1.6, zz);
      m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.visible = false;
      m.userData.dynamic = true;
      b.add(m);
      this.marks.push(m);
    }
    if (this.has('marks')) this.marks.forEach((m) => (m.visible = true));
  }

  private revealMarks(): void {
    this.set('marks');
    this.ctx.clues.add('marks_path');
    this.marks.forEach((m) => (m.visible = true));
    this.ctx.audio.play('whoosh', { volume: 0.5 });
    this.updateObjective();
  }

  // ------------------------------------------------------------------ endings setup
  private buildEndings(): void {
    const b = this.b;
    // escape car (waits off to the east)
    const car = b.car({ x: 70, z: ROAD_Z - 1.8, rot: Math.PI / 2, color: 0x6a6a64, type: 'sedan', y: this.groundHeight(0, ROAD_Z), lights: true });
    car.group.userData.dynamic = true;
    car.group.visible = false;
    this.escapeCar = car;
    this.carLight = new THREE.SpotLight(0xfff0d0, 0, 40, 0.5, 0.6, 1.2);
    this.carLight.position.set(0, 0.8, -2.4);
    this.carLight.target.position.set(0, 0, -20);
    car.group.add(this.carLight, this.carLight.target);
    this.addTrigger({
      id: 'road',
      box: { minX: -60, maxX: 60, minZ: ROAD_Z - 5, maxZ: ROAD_Z + 6 },
      enabled: () => !this.ending,
      onEnter: () => (this.daylight ? this.finalShot() : this.escapeSequence()),
    });
    // cabin window light for the final shot
    this.windowLight = new THREE.PointLight(0xffc27a, 0, 10, 1.5);
    this.windowLight.position.set(-5.5, 1.5, 6.4);
    b.add(this.windowLight);
    this.windowGlow = b.glow(-5.5, 1.5, 5.9, 0xffc27a, 5, 0);
    this.windowGlow.userData.dynamic = true;
    // day cars (hidden until the loop breaks)
    for (let i = 0; i < 3; i++) {
      const c = b.car({ x: -60 + i * 45, z: ROAD_Z + (i % 2 ? 1.8 : -1.8), rot: i % 2 ? -Math.PI / 2 : Math.PI / 2, color: [0x2a4a8a, 0xb0b0a8, 0x8a2a1a][i], type: i === 1 ? 'pickup' : 'sedan', y: this.groundHeight(0, ROAD_Z) });
      c.group.userData.dynamic = true;
      c.group.visible = false;
      this.dayCars.push({ group: c.group, speed: (i % 2 ? -1 : 1) * (9 + i * 2) });
    }
    // the cabin door as "HOME"
    const home = b.hitbox(1.2, 2.2, 0.6, -3, 0, 6.2);
    this.addInteractable({
      id: 'home',
      object: home,
      enabled: () => this.ctx.phone.gpsOn && this.has('leftCabin') && !this.daylight,
      prompt: 'You have arrived: HOME',
      onInteract: () => this.loopEnding(),
    });
  }

  // ------------------------------------------------------------------ unstable world
  private buildMovers(): void {
    const b = this.b;
    const h = (x: number, z: number) => this.groundHeight(x, z);
    const sign = b.sign(0, 0, 0, ['CABIN — 3 KM'], { w: 2, h: 0.8, bg: '#5a3a1a', fg: '#f0e0c0', poleH: 1.4 });
    sign.userData.dynamic = true;
    this.movers.push({ obj: sign, spots: [new THREE.Vector3(-9, h(-9, 18), 18), new THREE.Vector3(12, h(12, -14), -14), new THREE.Vector3(-14, h(-14, -6), -6), new THREE.Vector3(9, h(9, 20), 20)], idx: 0, cooldown: 0 });
    const chair = b.chair(0, 0, 0);
    chair.userData.dynamic = true;
    this.movers.push({ obj: chair, spots: [new THREE.Vector3(-2, 0.18, 6.6), new THREE.Vector3(4, 0, 3.8), new THREE.Vector3(-5, 0, -3), new THREE.Vector3(2, h(2, 12), 12)], idx: 0, cooldown: 0 });
    const bp = b.backpack(0, 0, 0.4, 0);
    bp.userData.dynamic = true;
    this.movers.push({ obj: bp, spots: [new THREE.Vector3(-8, h(-8, 10), 10), new THREE.Vector3(10, h(10, 2), 2), new THREE.Vector3(-3.5, 0, 2.8), new THREE.Vector3(0, h(0, -20), -20)], idx: 0, cooldown: 0 });
    this.movers.forEach((m) => m.obj.position.copy(m.spots[0]));
  }

  private updateMovers(dt: number): void {
    const cam = this.ctx.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    for (const m of this.movers) {
      m.cooldown -= dt;
      if (m.cooldown > 0) continue;
      const to = m.obj.position.clone().sub(cam.position);
      const d = to.length();
      if (d < 7) continue;
      if (to.normalize().dot(fwd) < -0.2) {
        m.idx = (m.idx + 1) % m.spots.length;
        m.obj.position.copy(m.spots[m.idx]);
        m.obj.rotation.y += 1.3;
        m.cooldown = 6 + Math.random() * 6;
      }
    }
  }

  private async glitch(): Promise<void> {
    const { ctx } = this;
    if (this.daylight) return;
    ctx.audio.play('glitch', { volume: 0.5 });
    this.atmosphere.setPulse(1);
    ctx.player.cam.shake = 0.3;
    await ctx.scheduler.wait(0.4);
    this.atmosphere.setPulse(0);
  }

  // ------------------------------------------------------------------ interactions
  private setupInteractions(): void {
    const { ctx } = this;
    const c = this.cabin;
    this.readable({ id: 'photowall5', object: c.photoWall, prompt: 'Look at the photographs', note: { title: 'The photo wall', text: 'The photos have changed.\n\nEvery single one is me. Sitting in this room. Standing where I am standing now.\n\nThe newest one has tomorrow\'s date.' } });
    this.readable({ id: 'calendar5', object: c.calendar, prompt: 'Look at calendar', note: { title: 'Kitchen calendar', text: 'October 17 circled: "M."\n\nNow the 21st, 25th, 28th and 30th are crossed out too. Same pen. Mine.' } });
    this.readable({ id: 'cork5', object: c.corkboard, prompt: 'Read clippings', note: { title: 'Clippings', text: 'The clippings are the same, except one:\n\nJOURNALIST STILL MISSING - "Sam Reyes, 29, vanished while investigating the Vance case. Family asks for help." \n\nThe paper is yellow with age.' } });
    this.addInteractable({ id: 'drawer5', object: c.drawerHit, prompt: 'Drawer', onInteract: () => ctx.hud.message('Empty. Just scratches inside: tally marks. Five of them.', 4) });
    this.addInteractable({
      id: 'cellar5',
      object: c.cellar,
      prompt: 'Go down to the basement',
      onInteract: () => this.goBasement(true),
    });
    const bs = c.basement;
    this.addInteractable({ id: 'stairs5', object: bs.stairsHit, prompt: 'Go upstairs', onInteract: () => this.goBasement(false) });
    this.addInteractable({
      id: 'tv5',
      object: bs.tvHit,
      prompt: 'Play the tape again',
      onInteract: async () => {
        ctx.audio.play('tape_click');
        await ctx.dialogue.say([
          { text: "If you're watching this, you don't remember.", speaker: 'YOU (ON TAPE)', voice: 'self' },
          { text: "You've watched this five times now. Please. Make this one the last.", speaker: 'YOU (ON TAPE)', voice: 'self' },
        ]);
      },
    });
    this.addInteractable({
      id: 'monitors5',
      object: bs.monitorHit,
      prompt: 'Watch the monitors',
      onInteract: () => ctx.dialogue.thought('Every screen shows the same thing now. Me, standing in this basement, looking at the screens.', 4),
    });
    this.addInteractable({
      id: 'array5',
      object: bs.arrayHit,
      prompt: () => (ctx.clues.allMajor() ? 'Destroy the machine' : 'Examine the machine'),
      onInteract: () => this.useArray(),
    });
  }

  private async useArray(): Promise<void> {
    const { ctx } = this;
    ctx.clues.add('array');
    if (!ctx.clues.allMajor()) {
      const missing = ctx.clues.majorTotal() - ctx.clues.majorFound();
      await ctx.modal.note({ title: 'The machine', text: `It hums. Reels turning. Cables running up into the cabin's door frame.\n\nI could tear it apart, but something stops me. I don't understand it yet. If I break it now, I'll never know what I'm breaking.\n\n(Key clues found: ${ctx.clues.majorFound()}/${ctx.clues.majorTotal()}. ${missing} still missing. Check your Notes.)` });
      return;
    }
    const choice = await ctx.modal.confirm('You understand now. The recordings, the photos, the radio: all to get you here, knowing. Destroy the machine?', [
      { label: 'Destroy it', value: true, danger: true },
      { label: 'Not yet', value: false },
    ]);
    if (choice) this.breakLoop();
  }

  private async goBasement(down: boolean): Promise<void> {
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.audio.play(down ? 'metal_door' : 'door_open', { volume: 0.8 });
    await ctx.transition.fadeOut(0.6);
    await sleep(900);
    if (down) {
      ctx.player.teleport(BASEMENT.x - 4.5, BASEMENT.z + 2.2, Math.PI * 0.95);
      ctx.audio.setAmbience({ wind: 0.1, hum: 0.6, rumble: 0.3, reverb: 0.5 }, 1.5);
      this.cabin.basement.light.intensity = 7;
    } else {
      ctx.player.teleport(-4.5, -8.2, Math.PI);
      ctx.audio.setAmbience(this.ambience, 1.5);
    }
    ctx.game.setMode('play');
    await ctx.transition.fadeIn(0.8);
  }

  private updateObjective(): void {
    const { ctx } = this;
    const n = FRAGS.filter((f) => ctx.clues.has(f)).length;
    if (n < 4) {
      ctx.story.setObjective(`Remember what happened. Memories: ${n}/4.${this.has('marks') ? ' (White marks lead north.)' : ''}`);
    } else {
      ctx.story.setObjective(this.has('marks') ? 'Break the machine in the basement, or follow the white marks to the road.' : 'Break the machine in the basement, or find the white marks and follow them to the road.');
    }
  }

  // ------------------------------------------------------------------ endings
  private async escapeSequence(): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    const car = this.escapeCar!;
    car.group.visible = true;
    this.carLight!.intensity = 60;
    const py = this.groundHeight(0, ROAD_Z);
    const px = ctx.player.pos.x;
    car.group.position.set(px + 70, py, ROAD_Z - 1.8);
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(px + 40, 1.5, ROAD_Z), 1.5);
    await ctx.dialogue.thought('Headlights.', 2);
    const engine = ctx.audio.playAt('engine_idle', car.group.position, { loop: true, volume: 0.9, refDist: 4 });
    await ctx.scheduler.tween(5, (t) => {
      car.group.position.x = px + 70 - 64 * t;
      engine.setPos(car.group.position);
      ctx.player.cam.lookAtPoint(ctx.camera.position, car.group.position.clone().setY(1.2), 3);
    }, (t) => 1 - (1 - t) * (1 - t));
    ctx.audio.playAt('car_door', car.group.position);
    this.ending = false;
    ctx.player.cam.release();
    ctx.game.setMode('play');
    this.ending = true;
    this.addInteractable({
      id: 'getin',
      object: car.body,
      prompt: 'Get in the car',
      onInteract: () => this.escapeFinal(engine),
    });
    ctx.story.setObjective('Get in the car.');
  }

  private async escapeFinal(engine: { stop: (f?: number) => void }): Promise<void> {
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.audio.play('car_door');
    await ctx.transition.fadeOut(2);
    engine.stop(2);
    ctx.audio.stopAll();
    await sleep(1500);
    await ctx.transition.story(['You made it out.'], 3);
    await sleep(1500);
    ctx.audio.play('phone_vibrate', { volume: 1 });
    const n = document.createElement('div');
    n.className = 'banner show';
    n.style.top = '45%';
    n.style.zIndex = '60';
    n.innerHTML = `<div class="ico message"></div><div><div class="ttl">UNKNOWN</div><div class="txt">Did you?</div></div>`;
    document.getElementById('ui')!.appendChild(n);
    await sleep(3500);
    n.remove();
    ctx.endings.finish('escape');
  }

  private async loopEnding(): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.phone.close();
    ctx.audio.play('door_open');
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(-3, 1.6, 0), 2);
    await ctx.scheduler.wait(1);
    ctx.audio.play('whoosh', { volume: 1 });
    ctx.audio.play('glitch', { volume: 0.8 });
    await ctx.transition.fadeOut(0.4, true);
    ctx.audio.stopAll();
    await sleep(1000);
    await ctx.transition.fadeOut(1.5);
    await ctx.transition.story(['Welcome home, Sam.'], 2.5);
    ctx.endings.finish('loop');
  }

  private async breakLoop(): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    const bs = this.cabin.basement;
    ctx.player.cam.lookAtPoint(ctx.camera.position, bs.array.position.clone().add(new THREE.Vector3(0, 1.2, 1)), 3);
    await ctx.scheduler.wait(0.6);
    for (let i = 0; i < 5; i++) {
      ctx.audio.playAt('spark', bs.array.position, { volume: 1 });
      ctx.audio.playAt('thud', bs.array.position, { volume: 0.8, delay: 0.1 });
      ctx.player.cam.shake = 0.5;
      bs.leds.forEach((l) => (l.visible = Math.random() > 0.5));
      bs.light.intensity = Math.random() * 9;
      await ctx.scheduler.wait(0.35);
    }
    ctx.audio.play('crash', { volume: 1 });
    ctx.audio.play('power_down', { volume: 1 });
    bs.leds.forEach((l) => (l.visible = false));
    bs.array.rotation.z = 0.08;
    bs.light.intensity = 0;
    ctx.audio.stopAll();
    await ctx.transition.fadeOut(0.15, true);
    await sleep(2500);
    // daylight
    this.daylight = true;
    this.cabin.setPower(false);
    this.atmosphere.setSky(0x6a92c0, 0xc8d4dc, 0xaab8c4);
    this.atmosphere.fog.density = 0.011;
    this.atmosphere.hemi.color.setHex(0xc8d8ff);
    this.atmosphere.hemi.groundColor.setHex(0x6a5a40);
    this.atmosphere.baseHemi = 1.3;
    this.atmosphere.moonLight.color.setHex(0xfff0d8);
    this.atmosphere.baseMoon = 2.2;
    this.atmosphere.skyGroup.children.forEach((c) => {
      if (c !== this.atmosphere.sky) c.visible = false;
    });
    this.atmosphere.group.children.forEach((c) => {
      if (c instanceof THREE.Points) c.visible = false;
    });
    ctx.renderer.toneMappingExposure = 1.1;
    ctx.flashlight.setOn(false, true);
    if (ctx.flashlight.phoneOn) ctx.flashlight.setPhoneLight(false);
    this.dayCars.forEach((c) => (c.group.visible = true));
    ctx.player.teleport(-1, 9.5, Math.PI * 0.98);
    ctx.audio.setAmbience({ wind: 0.35, windTone: 900, birds: 1, crickets: 0, reverb: 0.2 }, 3);
    ctx.audio.playMusic('daylight', 6);
    ctx.game.setMode('play');
    await ctx.transition.fadeIn(4);
    ctx.player.cam.yaw = 0;
    ctx.story.setObjective('Walk to the road.');
    this.ending = false;
    await ctx.dialogue.thought('Daylight. When was the last time I saw daylight?', 3.5);
    ctx.dialogue.thought('...cars. I can hear cars.', 3);
  }

  private async finalShot(): Promise<void> {
    if (this.ending) return;
    this.ending = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    await ctx.dialogue.thought('The road. Real cars. People.', 3);
    ctx.player.teleport(0.5, ROAD_Z + 3.5, ctx.player.yaw);
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(-3, 2, 3), 1.2);
    await ctx.scheduler.wait(4);
    ctx.audio.play('click', { volume: 0.25 });
    this.windowLight!.intensity = 8;
    (this.windowGlow!.material as THREE.SpriteMaterial).opacity = 0.9;
    await ctx.scheduler.wait(2.6);
    ctx.transition.black();
    ctx.audio.stopAll();
    await sleep(2000);
    ctx.endings.finish('break');
  }

  // ------------------------------------------------------------------ loop
  update(dt: number, t: number): void {
    super.update(dt, t);
    const { ctx } = this;
    const p = ctx.player.pos;
    if (!this.has('leftCabin') && (Math.abs(p.x) > 7.5 || p.z > 8.5 || p.z < -6) && p.z > -150) this.set('leftCabin');
    if (!this.daylight) {
      this.updateMovers(dt);
      // the forest folds back on itself
      this.wrapCooldown -= dt;
      const outside = Math.hypot(p.x, p.z - 3) > 46 && p.z > -150;
      const inCorridor = this.has('marks') && Math.abs(p.x) < 5 && p.z < -10;
      if (outside && !inCorridor && this.wrapCooldown <= 0 && ctx.game.mode === 'play' && !this.ending) this.wrap();
      // reality flickers
      this.glitchTimer -= dt;
      if (this.glitchTimer <= 0) {
        this.glitchTimer = 25 + Math.random() * 30;
        this.glitch();
        if (Math.random() > 0.5) {
          this.cabin.setPower(true);
          ctx.scheduler.wait(0.2 + Math.random() * 0.6).then(() => !this.daylight && this.cabin.setPower(false));
        }
      }
      this.cabin.basement.leds.forEach((l, i) => (l.visible = Math.sin(t * (2 + (i % 5)) + i) > -0.3));
    } else {
      for (const c of this.dayCars) {
        c.group.position.x += c.speed * dt;
        if (c.group.position.x > 70) c.group.position.x = -70;
        if (c.group.position.x < -70) c.group.position.x = 70;
      }
    }
  }

  private async wrap(): Promise<void> {
    const { ctx } = this;
    this.wrapCooldown = 4;
    ctx.game.setMode('cutscene');
    ctx.audio.play('whoosh', { volume: 0.7 });
    await ctx.transition.fadeOut(0.5);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * 20;
    const z = 3 + Math.sin(a) * 20;
    ctx.player.teleport(x, z, Math.atan2(x, z - 3));
    await sleep(400);
    ctx.game.setMode('play');
    await ctx.transition.fadeIn(0.8);
    const n = ((ctx.state.flag('L5.wraps') as number) || 0) + 1;
    ctx.state.setFlag('L5.wraps', n);
    if (n === 1) ctx.dialogue.thought('No... I walked straight. How am I back at the cabin?', 3.5);
    else if (n === 2) ctx.dialogue.thought("The forest keeps folding back. There has to be a way through. Marks, like the ones in the forest?", 4);
    else if (n % 3 === 0) ctx.hud.hint('The forest loops. The note in the tunnel mentioned white marks. A photo might reveal them.', 6);
  }

  onStart(fromSave: boolean): void {
    const { ctx } = this;
    if (fromSave) {
      ctx.transition.fadeIn(1.5);
      this.updateObjective();
      return;
    }
    this.intro();
  }

  private async intro(): Promise<void> {
    const { ctx } = this;
    const cam = ctx.player.cam;
    ctx.game.setMode('cutscene');
    ctx.hud.show(false);
    cam.eyeOffset = -1.35;
    cam.pitch = 0.5;
    cam.roll = -0.3;
    await sleep(800);
    ctx.audio.play('heartbeat', { volume: 0.6 });
    await ctx.transition.fadeIn(2.5);
    await ctx.dialogue.thought('The tape... I remember the tape.', 3);
    await ctx.scheduler.tween(2.5, (t) => {
      cam.eyeOffset = -1.35 * (1 - t);
      cam.pitch = 0.5 * (1 - t);
      cam.roll = -0.3 * (1 - t);
    });
    ctx.hud.show(true);
    ctx.audio.playMusic('dread', 4);
    await ctx.dialogue.thought("Something's wrong with this place. It feels... thinner.", 3.5);
    ctx.game.setMode('play');
    this.updateObjective();
    await ctx.scheduler.wait(3);
    ctx.story.deliver('unknown', 'L5_msg', 'Look at the number, Sam.');
    ctx.scheduler.wait(20).then(() => ctx.audio.playMusic('none', 8));
    ctx.save.save();
  }
}

void CLUES;
