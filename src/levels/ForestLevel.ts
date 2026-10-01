import * as THREE from 'three';
import { BaseLevel } from './BaseLevel';
import { fbm } from '../world/Textures';
import { colorMat, texMat, basicMat } from '../world/Materials';
import { drawPhoto, polaroid } from '../world/PhotoArt';
import { distToPolyline, smoothstep, lerp, spiralTexture, paintTexture } from './util';
import type { Surface } from '../player/Player';
import { sleep } from '../core/Scheduler';

const PATH: [number, number][] = [
  [0, 2],
  [2, -10],
  [-4, -24],
  [-13, -37],
  [-19, -45],
  [-17, -58],
  [-8, -72],
  [0, -86],
  [5, -98],
  [6, -106],
];
const ROAD_Z = -108;
const CAMP = { x: -21, z: -46 };

/**
 * LEVEL 1 - THE FOREST.
 * Wake up with 5% battery. Find the backpack (flashlight), the campsite
 * (photo taken days ago), the carved marks, and reach the old road.
 */
export class ForestLevel extends BaseLevel {
  id = 1;
  name = 'THE FOREST';
  mapName = 'Hollow Pines';
  customFadeIn = true;
  private lights?: THREE.Group;
  private lightsOn = false;

  groundHeight(x: number, z: number): number {
    let y = (fbm(x * 0.018 + 3, z * 0.018 + 7, 4) - 0.5) * 7 + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 0.7;
    const flat = (cx: number, cz: number, r: number, target: number) => {
      const d = Math.hypot(x - cx, z - cz);
      y = lerp(y, target, 1 - smoothstep(r, r + 6, d));
    };
    flat(0, 0, 5, this.baseAt(0, 0));
    flat(CAMP.x, CAMP.z, 8, this.baseAt(CAMP.x, CAMP.z));
    // path smoothing
    const dp = distToPolyline(x, z, PATH);
    y = lerp(y, y * 0.85, 1 - smoothstep(1, 4, dp));
    // road
    const roadY = this.baseAt(0, ROAD_Z);
    y = lerp(y, roadY, 1 - smoothstep(4, 10, Math.abs(z - ROAD_Z)));
    return y;
  }

  private baseAt(x: number, z: number): number {
    return (fbm(x * 0.018 + 3, z * 0.018 + 7, 4) - 0.5) * 7;
  }

  surfaceAt(x: number, z: number): Surface {
    if (Math.abs(z - ROAD_Z) < 3.2) return 'asphalt';
    if (distToPolyline(x, z, PATH) < 1.3) return 'dirt';
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 6) return 'dirt';
    return 'leaves';
  }

  signalAt(_x: number, z: number, gps: boolean): number {
    if (gps) return 1;
    return z < -85 ? 2 : z < -40 ? 1 : 0;
  }

  build(): void {
    const b = this.b;
    const ctx = this.ctx;
    this.setupAtmosphere({
      fogColor: 0x0a0e13,
      fogDensity: 0.05,
      skyTop: 0x04070d,
      skyBottom: 0x101722,
      moon: true,
      stars: true,
      moonDir: [0.35, 0.55, -0.75],
      moonColor: 0x8ea4d6,
      moonIntensity: 0.45,
      hemiSky: 0x2c3a52,
      hemiGround: 0x14120e,
      hemiIntensity: 0.6,
      particles: 'fireflies',
      exposure: 1.3,
    });
    this.ambience = { wind: 0.6, crickets: 0.75, reverb: 0.3 };
    this.mapBounds = { minX: -62, maxX: 62, minZ: -120, maxZ: 14 };
    ctx.collision.setBounds(-60, 60, -117, 12);
    const h = (x: number, z: number) => this.groundHeight(x, z);

    // terrain with the path painted into vertex colours
    b.terrain({
      x0: -90,
      z0: -150,
      w: 180,
      d: 185,
      seg: 110,
      height: h,
      color: (x, z) => {
        const dp = distToPolyline(x, z, PATH);
        const p = 1 - smoothstep(0.8, 2.2, dp);
        const camp = 1 - smoothstep(4, 8, Math.hypot(x - CAMP.x, z - CAMP.z));
        const v = Math.max(p, camp * 0.7);
        return [lerp(0.8, 1.15, v), lerp(0.85, 0.95, v), lerp(0.75, 0.8, v)];
      },
    });
    b.strip(PATH, 1.6, texMat('dirt', 1, { color: 0x9a8a78 }), h, 0.035, 3);
    // old road
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.95 });
    b.strip(
      [
        [-100, ROAD_Z],
        [100, ROAD_Z],
      ],
      6.5,
      roadMat,
      h,
      0.05,
      8,
      4,
    );
    this.mapRoads = [
      { pts: PATH, w: 1.5, kind: 'path' },
      {
        pts: [
          [-60, ROAD_Z],
          [60, ROAD_Z],
        ],
        w: 5,
        kind: 'road',
      },
    ];

    // forest
    const clear = (x: number, z: number) =>
      distToPolyline(x, z, PATH) < 2.6 || Math.hypot(x, z) < 6.5 || Math.hypot(x - CAMP.x, z - CAMP.z) < 9.5 || Math.abs(z - ROAD_Z) < 6 || Math.hypot(x - 4.5, z + 9.5) < 2;
    b.forest({ minX: -85, maxX: 85, minZ: -150, maxZ: 30, count: 1500, seed: 11, height: h, exclude: clear, collide: (x, z) => x > -64 && x < 64 && z > -120 && z < 16, bushes: 500, minSpacing: 2.2 });
    b.grass({ minX: -40, maxX: 40, minZ: -115, maxZ: 12, count: 5000, seed: 12, height: h, exclude: (x, z) => distToPolyline(x, z, PATH) < 0.9 || Math.abs(z - ROAD_Z) < 3.5 });

    // rocks and fallen logs
    const rocks: [number, number, number][] = [
      [3, 4, 0.9],
      [-5, -3, 0.6],
      [6, -18, 1.3],
      [-10, -30, 0.8],
      [-26, -40, 1.6],
      [-12, -60, 1.1],
      [-4, -78, 0.7],
      [9, -90, 1.4],
      [-28, -52, 0.9],
      [14, -40, 2.2],
      [-2, -48, 1.8],
    ];
    rocks.forEach(([x, z, s], i) => b.rock(x, z, s, h(x, z), i + 3));
    b.log(-3.5, -7, 5, 0.5, h(-3.5, -7));
    b.log(-9, -63, 6, 1.9, h(-9, -63));
    b.log(-25, -50, 4, 0.4, h(-25, -50));
    b.log(4, -80, 7, -0.3, h(4, -80));

    this.landmark('wake', 'Where I woke up', 0, 0, 6);
    this.landmark('camp', 'Abandoned campsite', CAMP.x, CAMP.z, 10);
    this.landmark('road', 'Old road', 5, ROAD_Z, 8);
    this.landmark('truck', 'Abandoned pickup', 16, ROAD_Z + 1, 8);

    this.buildBackpack();
    this.buildCampsite();
    this.buildMarkings();
    this.buildRoad();
    this.setupEvents();

    this.spawn = { x: 0.5, z: 0.5, yaw: 0.3 };
  }

  private buildBackpack(): void {
    const h = (x: number, z: number) => this.groundHeight(x, z);
    const bp = this.b.backpack(4.5, -9.5, 0.8, h(4.5, -9.5));
    this.pickup({
      id: 'backpack',
      object: bp,
      prompt: 'Search backpack',
      onPick: async () => {
        this.ctx.audio.play('zip', { volume: 0.8 });
        this.ctx.inventory.add('flashlight');
        await this.ctx.modal.note({ title: 'Folded note (in the backpack)', text: "Sam, if you're reading this, look at the photos.\nDon't waste the battery. You'll need it at the end.\n\n- S." });
        this.ctx.clues.add('backpack_note');
        this.ctx.hud.hint('Press <kbd>F</kbd> to toggle the flashlight. It has its own batteries.', 7);
        this.ctx.dialogue.thought("That's... my handwriting.");
        this.ctx.story.setObjective('Find a way out. Follow the trail.');
      },
    });
  }

  private buildCampsite(): void {
    const b = this.b;
    const h = (x: number, z: number) => this.groundHeight(x, z);
    const y = h(CAMP.x, CAMP.z);
    const tent = b.tent(CAMP.x - 3, CAMP.z - 2, 0.5, y);
    b.firePit(CAMP.x + 1, CAMP.z + 1, y, false);
    b.campChair(CAMP.x + 2.6, CAMP.z + 0.2, -1.2, y);
    b.campChair(CAMP.x - 0.8, CAMP.z + 3, 2.6, y, true);
    b.log(CAMP.x + 1.2, CAMP.z + 3.4, 2.6, 0.1, y, 0.2);
    // lantern (dead)
    const lantern = b.cyl(0.08, 0.1, 0.28, colorMat(0x2a3a2a, 0.5, 0.4), CAMP.x + 2.9, y, CAMP.z - 0.8);
    lantern.castShadow = true;
    // cooler
    const cooler = b.box(0.7, 0.45, 0.45, colorMat(0x2e5a8a, 0.5), CAMP.x - 0.5, y, CAMP.z - 3.8, { rotY: 0.3, collide: true });
    b.box(0.72, 0.08, 0.47, colorMat(0xdddddd, 0.5), CAMP.x - 0.5, y + 0.45, CAMP.z - 3.8, { rotY: 0.3 });
    this.searchable({
      id: 'cooler',
      object: cooler,
      prompt: 'Search cooler',
      onSearch: async () => {
        this.ctx.hud.toast('Power bank (almost empty)', 'item');
        await this.ctx.scheduler.wait(0.4);
        this.ctx.battery.charge(1);
        this.ctx.hud.message('A power bank with a sliver of charge left. +1% battery.', 4);
      },
    });
    // tarp and clothes line props
    b.box(0.05, 1.8, 0.05, texMat('bark', 1), CAMP.x + 5, y, CAMP.z - 3);
    b.box(0.05, 1.8, 0.05, texMat('bark', 1), CAMP.x + 5, y, CAMP.z + 2);
    b.box(0.02, 0.02, 5, colorMat(0x888877), CAMP.x + 5, y + 1.7, CAMP.z - 0.5);
    const shirt = b.plane(0.6, 0.7, new THREE.MeshStandardMaterial({ color: 0x5a2a2a, side: THREE.DoubleSide, roughness: 1 }), CAMP.x + 5, y + 1.32, CAMP.z - 1, Math.PI / 2);
    shirt.userData.dynamic = true;
    this.onUpdate((_dt, t) => (shirt.rotation.z = Math.sin(t * 1.3) * 0.08));

    // The photograph: pinned to the tent
    const photoCanvas = polaroid(drawPhoto('campsite_figure', { date: "OCT 22 '26 23:14", seed: 22 }), 'you were here');
    const tp = new THREE.Vector3(1.2, 0.7, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).add(tent.position);
    const photo = b.canvasPlane(photoCanvas, 0.22, tp.x, tp.y, tp.z, 0.5 + Math.PI / 2 - 0.9, -0.5);
    this.readable({
      id: 'polaroid',
      object: photo,
      prompt: 'Examine photograph',
      note: { title: 'A Polaroid, pinned to the tent', text: "It's this campsite. The same tent, the same fire pit.\nSomeone is standing by the tent, looking at the camera.\n\nThe date stamp says OCT 22.\nI don't remember taking it. I don't remember being here.\nThe person looks like me.", image: photoCanvas, imageWidth: 300 },
      clue: 'campsite_photo',
      onRead: () => {
        this.ctx.inventory.add('polaroid', true);
        this.ctx.audio.playMusic('dread', 4);
        this.ctx.scheduler.wait(20).then(() => this.ctx.audio.playMusic('none', 8));
        this.ctx.story.setObjective('Find a way out. The road must be north.');
        this.ctx.dialogue.thought('October 22nd. What day is it today?');
      },
    });

    // journal page on the log seat
    const page = b.paper(CAMP.x + 1.4, y + 0.42, CAMP.z + 3.4, 0.4);
    this.readable({
      id: 'journal',
      object: page,
      prompt: 'Read torn page',
      note: { title: 'Torn journal page', text: "Day 2.\n\nFound Mara's bracelet near the fire pit. People in town say she walked into the woods on the 17th and never came back.\n\nThere's a cabin further north they won't talk about.\nI'll check it tomorrow." },
      clue: 'journal_page',
      onRead: () => this.ctx.inventory.add('journal', true),
    });
    // bracelet
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), colorMat(0xaa2222, 0.6));
    brace.position.set(CAMP.x + 1.9, y + 0.03, CAMP.z + 0.2);
    brace.rotation.x = Math.PI / 2;
    b.add(brace);
    const braceHit = b.hitbox(0.35, 0.2, 0.35, CAMP.x + 1.9, y - 0.05, CAMP.z + 0.2);
    this.pickup({
      id: 'bracelet',
      object: brace,
      hitbox: braceHit,
      prompt: 'Pick up bracelet',
      onPick: () => {
        this.ctx.inventory.add('bracelet');
        this.ctx.dialogue.thought('Red and white thread. The tag says "M."');
      },
    });
  }

  private markedTree(x: number, z: number, faceX: number, faceZ: number, photoText?: string[]): THREE.Vector3 {
    const b = this.b;
    const y = this.groundHeight(x, z);
    b.cyl(0.28, 0.4, 9, texMat('bark', 1, { color: 0x6b5a4a }), x, y - 0.2, z, { collideR: 0.45, seg: 8, occlude: true });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * 0.5, 3, 7), colorMat(0x1a2618, 0.95));
      c.position.set(x, y + 5 + i * 1.6, z);
      c.castShadow = true;
      b.add(c);
    }
    const ang = Math.atan2(faceX - x, faceZ - z);
    const off = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(0.36);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: spiralTexture(), transparent: true, roughness: 1 }));
    mark.position.set(x + off.x, y + 1.5, z + off.z);
    mark.rotation.y = ang;
    b.add(mark);
    this.addInteractable({
      id: `mark${x}`,
      object: mark,
      prompt: 'Examine carving',
      onInteract: () => {
        this.set('sawMark');
        this.ctx.dialogue.thought(photoText ? 'A spiral, carved deep. The bark around it looks... painted? I can\'t make anything out. Maybe a photo would.' : 'A spiral carved into the bark. The cuts look fresh.');
      },
    });
    if (photoText) {
      const t = paintTexture(photoText, '#f0f0f0', 512, 256);
      const paint = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      const o2 = off.clone().multiplyScalar(1.1);
      paint.position.set(x + o2.x, y + 2.4, z + o2.z);
      paint.rotation.y = ang;
      b.add(paint);
      b.photoOnly(paint);
    }
    return mark.position.clone();
  }

  private buildMarkings(): void {
    this.markedTree(-6.8, -26, -4, -24);
    const p = this.markedTree(-11.5, -55, -17, -58, ["THE ROAD IS NORTH", "YOU'VE BEEN HERE BEFORE"]);
    this.markedTree(-6, -76, -8, -72);
    this.photoTargets.push({
      id: 'marks',
      pos: p.clone().add(new THREE.Vector3(0, 0.9, 0)),
      range: 13,
      onReveal: async (url) => {
        await this.ctx.modal.note({ title: 'The photo', text: 'The flash lit up words painted on the bark, words I could not see with my own eyes:\n\n"THE ROAD IS NORTH.\nYOU\'VE BEEN HERE BEFORE."', image: url, imageWidth: 360 });
        this.ctx.clues.add('markings');
      },
    });
    // warning sign
    const x = -10.5;
    const z = -69;
    const y = this.groundHeight(x, z);
    this.b.box(0.08, 1.4, 0.08, texMat('bark', 1), x, y, z);
    this.b.textPlane(['PRIVATE LAND', 'TURN BACK'], 0.8, 0.5, { bg: '#8a7a5a', fg: '#2a1a10', size: 70, font: 'bold 70px "Special Elite", monospace' }, x, y + 1.2, z + 0.05, 0.6);
  }

  private buildRoad(): void {
    const b = this.b;
    const h = (x: number, z: number) => this.groundHeight(x, z);
    const y = h(16, ROAD_Z);
    const truck = b.car({ x: 16, z: ROAD_Z + 1.3, rot: Math.PI / 2 + 0.25, color: 0x5a3a28, type: 'pickup', y, wrecked: true });
    this.searchable({
      id: 'truck',
      object: truck.body,
      prompt: 'Search the pickup',
      sound: 'car_door',
      onSearch: async () => {
        await this.ctx.modal.note({ title: 'Glovebox', text: 'Registration card:\nOWNER: MARA VANCE\n\nA folded trail map of the Hollow Pines area, with a circle drawn north of the town. Someone wrote "CABIN?" next to it.' });
        this.ctx.clues.add('truck_note');
        this.ctx.inventory.add('area_map');
        this.ctx.hud.hint('The trail map is now on your phone\'s Maps app. Checking the map costs 0.2%.', 6);
      },
    });
    b.sign(-7, ROAD_Z + 4.2, 0, ['HOLLOW PINES RD'], { w: 1.6, h: 0.35, bg: '#1f5a2e', poleH: 1.9 });
    b.sign(-7, ROAD_Z + 4.21, 0, ['ALDER FALLS 4 KM →'], { w: 1.6, h: 0.35, bg: '#1f5a2e', poleH: 1.5 });
    // guard posts along the road edge
    for (let x = -50; x <= 50; x += 7) {
      const yy = h(x, ROAD_Z - 4);
      b.box(0.12, 0.8, 0.12, colorMat(0xbab6aa, 0.7), x, yy, ROAD_Z - 4, { cast: false });
    }
    // Distant lights (appear later)
    this.lights = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = b.glow(110 + i * 7, h(60, ROAD_Z) + 2 + (i % 3) * 1.5, ROAD_Z - 6 + (i % 2) * 10, 0xffc27a, 6 + (i % 3) * 2, 0.8);
      (s.material as THREE.SpriteMaterial).fog = false;
      this.lights.add(s);
    }
    b.root.add(this.lights);
    this.lights.visible = false;

    // road trigger
    this.addTrigger({
      id: 'road',
      box: { minX: -60, maxX: 60, minZ: ROAD_Z - 5, maxZ: ROAD_Z + 4 },
      onEnter: () => this.reachRoad(),
    });
  }

  private reachRoad(): void {
    if (this.lightsOn) return;
    this.lightsOn = true;
    this.set('road');
    this.lights!.visible = true;
    this.ctx.audio.play('whoosh', { volume: 0.4 });
    this.ctx.dialogue.thought('The road. And there, to the east... lights.');
    if (this.ctx.clues.has('campsite_photo')) this.ctx.story.setObjective('Walk toward the lights.');
    else this.ctx.story.setObjective('Walk toward the lights. (Something about the campsite is bothering you.)');
    this.addTrigger({
      id: 'exit',
      box: { minX: 34, maxX: 70, minZ: ROAD_Z - 6, maxZ: ROAD_Z + 5 },
      once: false,
      onEnter: () => this.tryExit(),
    });
  }

  private exiting = false;

  private async tryExit(): Promise<void> {
    if (this.exiting) return;
    if (!this.ctx.clues.has('campsite_photo')) {
      this.ctx.dialogue.thought("I can't leave yet. That campsite back there... I need to know what happened.");
      this.ctx.story.setObjective('Go back and search the campsite.');
      return;
    }
    this.exiting = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(120, 3, ROAD_Z), 1.5);
    await ctx.dialogue.thought('A town. Maybe someone can help.', 3);
    await ctx.transition.fadeOut(3);
    ctx.player.cam.release();
    this.complete();
  }

  private setupEvents(): void {
    const { ctx } = this;
    this.events = [
      () => ctx.audio.playAt('branch', this.around(10 + Math.random() * 8, true), { volume: 1.3 }),
      () => ctx.audio.playAt('owl', this.around(30), { volume: 0.8, refDist: 8 }),
      () => ctx.audio.playAt('howl', this.around(60), { volume: 0.7, refDist: 20 }),
      () => ctx.audio.playAt('animal_run', this.around(12), { volume: 1.0 }),
      () => ctx.audio.playAt('rustle', this.around(6, true), { volume: 0.9 }),
      () => this.distantFlashlight(),
      () => this.phantomFootsteps(),
    ];
    this.eventTimer = 45;
  }

  private distantFlashlight(): void {
    const p = this.around(35);
    const s = this.b.glow(p.x, this.groundHeight(p.x, p.z) + 1.4, p.z, 0xfff0d0, 1.6, 0.9);
    let t = 0;
    const fn = (dt: number) => {
      t += dt;
      s.visible = t < 3.5 && Math.random() > 0.05;
      if (t > 3.6) s.parent?.remove(s);
    };
    this.onUpdate(fn);
  }

  private async phantomFootsteps(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      this.ctx.audio.playAt('step_leaves', this.around(7, true), { volume: 0.9 });
      await this.ctx.scheduler.wait(0.55);
    }
  }

  onStart(fromSave: boolean): void {
    const { ctx } = this;
    if (fromSave) {
      ctx.story.setObjective(ctx.state.data.objective || 'Find a way out.', false);
      if (this.has('road')) this.reachRoad();
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
    cam.pitch = 0.9;
    cam.roll = 0.35;
    ctx.audio.setAmbience({ wind: 0.3, crickets: 0.4 }, 1);
    ctx.audio.setMuffled(true, 500);
    await sleep(1200);
    ctx.audio.play('breath', { volume: 0.7 });
    ctx.audio.play('heartbeat', { volume: 0.5 });
    await ctx.transition.story(['...'], 1.2);
    await ctx.transition.fadeIn(2.2);
    await ctx.transition.fadeOut(0.25);
    await sleep(500);
    ctx.audio.setMuffled(false);
    ctx.audio.setAmbience(this.ambience, 4);
    await ctx.transition.fadeIn(1.4);
    await ctx.dialogue.thought('...where am I?', 2.6);
    await ctx.scheduler.tween(3, (t) => {
      cam.eyeOffset = -1.35 * (1 - t);
      cam.pitch = 0.9 * (1 - t) + 0.05 * t;
      cam.roll = 0.35 * (1 - t);
    });
    ctx.hud.show(true);
    ctx.clues.add('wake', true);
    ctx.state.setFlag('unread:mom', 3);
    ctx.state.setFlag('unread:dana', 1);
    ctx.state.setFlag('unread:mara', 1);
    await ctx.scheduler.wait(0.8);
    ctx.phone.vibrate();
    ctx.hud.showBanner('Battery Low', '5% battery remaining.', 'message', '[TAB]', 6);
    await ctx.dialogue.thought("My phone. Five percent. I don't remember how I got here.", 3.5);
    ctx.game.setMode('play');
    ctx.story.setObjective('Find a way out.');
    ctx.hud.hint('Press <kbd>TAB</kbd> to check your phone. Opening it is free, using it is not.', 8);
    ctx.save.save();
    // nudge toward the backpack if the player is struggling in the dark
    ctx.scheduler.wait(40).then(() => {
      if (!ctx.inventory.has('flashlight') && ctx.levels.current === this) ctx.hud.hint('Too dark? Your phone has a torch: <kbd>TAB</kbd> then <kbd>T</kbd>. It drains 1% per minute.', 8);
    });
  }
}

function roadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2e2e30';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.05)`;
    g.fillRect(Math.random() * 256, Math.random() * 512, 2, 2);
  }
  g.fillStyle = 'rgba(200,170,60,0.55)';
  g.fillRect(124, 0, 4, 200);
  g.fillRect(124, 300, 4, 150);
  g.fillStyle = 'rgba(210,210,200,0.35)';
  g.fillRect(8, 0, 4, 512);
  g.fillRect(244, 0, 4, 512);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 50;
      y += Math.random() * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export { basicMat };
