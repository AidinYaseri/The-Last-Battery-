import * as THREE from 'three';
import { BaseLevel, type Destination } from './BaseLevel';
import { colorMat, texMat, Mats } from '../world/Materials';
import type { Surface } from '../player/Player';
import { rng } from '../world/Textures';
import type { SoundHandle } from '../audio/AudioManager';

const TUNNEL_X0 = 80;
const TUNNEL_X1 = 140;

/**
 * LEVEL 3 - THE HIGHWAY.
 * An open, abandoned highway. A radio warns about "the cabin". The GPS has a
 * saved destination called HOME. A car charger (key + fuse) gives +5%.
 * The tunnel goes dark; at its end a sign reads CABIN - 3 KM.
 */
export class HighwayLevel extends BaseLevel {
  id = 3;
  name = 'THE HIGHWAY';
  mapName = 'Highway 14';
  private tunnelLights: { mesh: THREE.Mesh; light?: THREE.PointLight }[] = [];
  private tunnelDark = false;
  private charging = false;

  surfaceAt(x: number, z: number): Surface {
    if (x > TUNNEL_X0 && x < TUNNEL_X1) return 'concrete';
    if (Math.abs(z) < 9.5) return 'asphalt';
    if (x > -42 && x < -4 && z < -12 && z > -38) return x > -36 && x < -24 && z < -24 ? 'concrete' : 'asphalt';
    return 'leaves';
  }

  signalAt(x: number, _z: number, gps: boolean): number {
    if (x > TUNNEL_X0 + 2 && x < TUNNEL_X1 - 2) return 0;
    if (gps) return 1;
    return x > TUNNEL_X1 ? 1 : 2;
  }

  ambientAt(x: number, z: number): number {
    if (x > TUNNEL_X0 + 2 && x < TUNNEL_X1 - 2) {
      const depth = Math.min(x - TUNNEL_X0, TUNNEL_X1 - x);
      const k = Math.max(0, 1 - depth / 14);
      return (this.tunnelDark ? 0.03 : 0.25) + k * 0.35;
    }
    if (x > -36 && x < -24 && z < -27 && z > -35) return 0.4;
    return 1;
  }

  signalLabel(): string | undefined {
    const x = this.ctx.player.pos.x;
    return x > TUNNEL_X0 + 2 && x < TUNNEL_X1 - 2 ? 'No Service' : undefined;
  }

  gpsDestination(): Destination | null {
    if (!this.ctx.state.has('gps_home_seen')) return null;
    return { x: 172, z: -30, label: 'HOME', sub: '14 Alder Ridge Rd · 3.1 km' };
  }

  build(): void {
    const b = this.b;
    const ctx = this.ctx;
    this.setupAtmosphere({
      fogColor: 0x0d1118,
      fogDensity: 0.024,
      skyTop: 0x060a12,
      skyBottom: 0x1a2230,
      moon: true,
      stars: true,
      moonDir: [0.6, 0.45, -0.5],
      moonIntensity: 0.55,
      hemiSky: 0x303c54,
      hemiGround: 0x16140f,
      hemiIntensity: 0.65,
      particles: 'dust',
      exposure: 1.3,
    });
    this.ambience = { wind: 0.75, windTone: 650, crickets: 0.3, reverb: 0.25 };
    this.mapBounds = { minX: -125, maxX: 178, minZ: -50, maxZ: 40 };
    ctx.collision.setBounds(-122, 172, -38, 26);
    this.spawn = { x: -112, z: 5.5, yaw: -Math.PI / 2 };

    // ground
    b.box(420, 0.1, 200, texMat('forestFloor', 1, { color: 0x8a8a7a }), 25, -0.12, 0, { uvScale: 7, cast: false });
    b.box(330, 0.02, 19, texMat('asphalt', 1), 10, -0.02, 0, { uvScale: 5, cast: false });
    // lane markings
    const white = colorMat(0xc8c8c0, 0.6);
    const yellow = colorMat(0xc8a840, 0.6);
    for (let x = -150; x < 175; x += 7) {
      if (x > TUNNEL_X0 - 2 && x < TUNNEL_X1 + 2) continue;
      b.box(3, 0.01, 0.14, white, x, 0.001, 4.6, { cast: false });
      b.box(3, 0.01, 0.14, white, x, 0.001, -4.6, { cast: false });
    }
    for (const z of [1.1, -1.1, 8.7, -8.7]) b.box(330, 0.01, 0.12, z === 8.7 || z === -8.7 ? white : yellow, 10, 0.001, z, { cast: false });
    // median barrier
    const barrierMat = texMat('concrete', 1, { color: 0xb8b4a8 });
    for (let x = -150; x < TUNNEL_X0 - 3; x += 6) {
      if (Math.abs(x + 60) < 5 || Math.abs(x - 12) < 5) continue; // gaps
      b.box(5.9, 0.8, 0.5, barrierMat, x, 0, 0, { collide: true, uvScale: 2 });
    }
    // guardrails
    b.guardrail(-122, 10.5, TUNNEL_X0 - 1, 10.5);
    b.guardrail(-122, -10.5, -44, -10.5);
    b.guardrail(-2, -10.5, TUNNEL_X0 - 1, -10.5);
    b.guardrail(TUNNEL_X1 + 1, 10.5, 172, 10.5);
    b.guardrail(TUNNEL_X1 + 1, -10.5, 172, -10.5);

    // forest on both sides
    b.forest({ minX: -160, maxX: 180, minZ: 14, maxZ: 90, count: 1100, seed: 31, collide: () => false, bushes: 250 });
    b.forest({ minX: -160, maxX: 180, minZ: -95, maxZ: -12, count: 1000, seed: 32, exclude: (x, z) => (x > -46 && x < 0 && z > -42) || (x > TUNNEL_X0 - 6 && x < TUNNEL_X1 + 6), collide: () => false, bushes: 250 });
    b.grass({ minX: -122, maxX: 172, minZ: -38, maxZ: 26, count: 6000, seed: 33, exclude: (x, z) => Math.abs(z) < 10 || (x > -44 && x < -2 && z < -11) || (x > TUNNEL_X0 - 3 && x < TUNNEL_X1 + 3) });

    this.buildRestStop();
    this.buildCars();
    this.buildTunnel();
    this.buildSigns();
    this.setupEvents();

    this.landmark('start', 'Highway 14', -110, 5, 10);
    this.landmark('rest', 'Rest area', -24, -26, 14);
    this.landmark('tunnel', 'Hollow Ridge Tunnel', TUNNEL_X0, 0, 14);
    this.landmark('sign', 'Road sign', 152, 7, 10);
    this.mapRoads = [
      { pts: [[-122, 0], [TUNNEL_X0, 0]], w: 18, kind: 'road', always: true },
      { pts: [[TUNNEL_X0, 0], [TUNNEL_X1, 0]], w: 16, kind: 'road' },
      { pts: [[TUNNEL_X1, 0], [172, 0]], w: 18, kind: 'road' },
      { pts: [[-44, -10], [-24, -18], [-4, -10]], w: 7, kind: 'road' },
    ];
    this.mapAreas = [{ x: -30, z: -30, w: 12, d: 8, landmark: 'rest' }];
  }

  // ---------------------------------------------------------------- rest stop
  private buildRestStop(): void {
    const b = this.b;
    // exit ramp & lot
    b.box(40, 0.02, 24, texMat('asphalt', 1), -23, -0.015, -24, { uvScale: 5, cast: false });
    b.room({ x: -30, z: -31, w: 12, d: 8, h: 3.2, wallMat: texMat('concrete', 1, { color: 0xb0a898 }), innerMat: texMat('tiles', 1, { color: 0xc8c8c0 }), floorMat: texMat('tiles', 1), roof: 'flat', s: [{ off: 0, w: 1.6 }, { off: -3.5, w: 2.4, bottom: 1, top: 2.3, glass: Mats.windowLit() }, { off: 3.5, w: 2.4, bottom: 1, top: 2.3, glass: Mats.glass() }] });
    b.textPlane(['REST AREA'], 4, 0.7, { bg: '#1f5a2e', fg: '#fff', size: 100 }, -30, 3.35, -26.88, 0);
    // interior partitions: office on the east (x > -26), restrooms on the west
    const wall = texMat('tiles', 1, { color: 0xc8c8c0 });
    b.wall(-26, -35, -26, -27, 3.2, wall, [{ off: 1.8, w: 1.0 }], 0.15);
    b.wall(-34, -35, -34, -27, 3.2, wall, [{ off: 1.8, w: 1.0 }], 0.15);
    b.door({ id: 'office', x: -26, z: -29.2, axis: 'z', width: 1.0, swing: 1 });
    // vending machines (glowing)
    for (let i = 0; i < 2; i++) {
      b.box(1, 1.9, 0.8, colorMat(0x8a1a1a, 0.5, 0.3), -31 + i * 1.3, 0, -34.4, { collide: true });
      b.box(0.8, 1.2, 0.02, colorMat(0x101418, 0.2, 0.2, 0xa0d0ff, 0.6), -31 + i * 1.3, 0.5, -33.99, { cast: false });
    }
    const vend = new THREE.PointLight(0xa0d0ff, 3, 6, 1.5);
    vend.position.set(-30.3, 1.2, -33);
    b.add(vend);
    b.box(1.8, 0.05, 0.6, colorMat(0x7a6a5a, 0.8), -29, 0.45, -28, { collide: true });
    // office contents
    b.desk(-23, -33.5, Math.PI);
    b.chair(-23, -32.5, Math.PI);
    b.shelf(-21.4, -30, 1.8, -Math.PI / 2, 1.8, 0.4, true, 61);
    const drawer = b.hitbox(0.5, 0.7, 0.3, -22.3, 0.05, -33.1);
    this.searchable({
      id: 'officedrawer',
      object: drawer,
      prompt: 'Open desk drawer',
      sound: 'drawer',
      onSearch: () => {
        this.ctx.inventory.add('car_key');
        this.ctx.hud.message('A car key with a blue tag: "SEDAN - TOW LOT".', 4);
        this.ctx.story.setObjective('Find the blue sedan and use its charger.');
        this.maybeCall();
      },
    });
    const log = b.paper(-23.4, 0.79, -33.6, 0.3);
    this.readable({
      id: 'towlog',
      object: log,
      prompt: 'Read tow log',
      note: { title: 'Tow log (clipboard)', text: 'OCT 21 - Blue sedan, eastbound shoulder near the tunnel. Owner never came back. Key in drawer.\n  Note: 12V socket dead. Blown fuse (15A). Spares in the truck.\n\nOCT 21 - 19 vehicles abandoned. All eastbound. All doors open.\nNobody answered the radio.' },
    });
    // restroom mirror + sink
    b.sink(-35.4, -33.8, 0);
    b.toilet(-35.3, -30, Math.PI / 2);
    // pumps canopy
    b.box(9, 0.35, 6, colorMat(0xd0d0d0, 0.5, 0.2), -12, 4, -22, { cast: true });
    for (const [x, z] of [
      [-16, -20],
      [-8, -20],
      [-16, -24],
      [-8, -24],
    ])
      b.box(0.3, 4, 0.3, colorMat(0xbbbbbb, 0.5), x, 0, z, { collide: true });
    for (const x of [-14, -10]) {
      b.box(0.8, 1.6, 0.5, colorMat(0x2a5aa0, 0.6), x, 0, -22, { collide: true });
    }
    // parked truck
    const truck = b.car({ x: -34, z: -18, rot: Math.PI / 2, color: 0x7a7a70, type: 'truck' });
    this.searchable({
      id: 'resttruck',
      object: truck.body,
      prompt: 'Search truck cab',
      sound: 'car_door',
      onSearch: () => {
        this.ctx.inventory.add('car_fuse');
        this.ctx.hud.message('A box of spare fuses in the glovebox. You take a 15A one.', 4);
      },
    });
    b.streetLight(-20, -14, Math.PI, { light: true, intensity: 22 });
  }

  // ---------------------------------------------------------------- cars
  private buildCars(): void {
    const b = this.b;
    const r = rng(77);
    const place: [number, number, number, number, 'sedan' | 'hatch' | 'truck' | 'pickup'][] = [
      [-92, 4.5, -Math.PI / 2 + 0.1, 0x3a3a3a, 'sedan'],
      [-70, 6, -Math.PI / 2 - 0.2, 0x8a1a1a, 'hatch'],
      [-52, -5, Math.PI / 2 + 0.05, 0x9a9a90, 'truck'],
      [-38, 2.5, -Math.PI / 2 + 0.3, 0x2a4a3a, 'pickup'],
      [-18, 5, -Math.PI / 2, 0x5a4a3a, 'sedan'],
      [4, -4.5, Math.PI / 2 - 0.15, 0x303a4a, 'hatch'],
      [18, 2.8, -Math.PI / 2 + 0.08, 0xc0c0b8, 'sedan'],
      [46, 6.5, -Math.PI / 2 - 0.4, 0x4a2a4a, 'hatch'],
      [58, -3, Math.PI / 2 + 0.2, 0x1a1a1a, 'pickup'],
      [68, 3.5, -Math.PI / 2 + 0.05, 0x6a5a2a, 'sedan'],
    ];
    const cars = place.map(([x, z, rot, color, type]) => b.car({ x, z, rot, color, type }));
    // 1: radio car (red hatch)
    const radioPos = new THREE.Vector3(-70, 1.2, 6);
    let radioOn = false;
    let radioHandle: SoundHandle | null = null;
    this.addInteractable({
      id: 'radiocar',
      object: cars[1].body,
      prompt: () => (radioOn ? 'Turn off car radio' : 'Turn on car radio'),
      onInteract: async () => {
        radioOn = !radioOn;
        this.ctx.audio.playAt('radio_on', radioPos);
        if (!radioOn) {
          radioHandle?.stop(0.2);
          this.ctx.dialogue.cancel();
          return;
        }
        radioHandle = this.ctx.audio.playAt('static', radioPos, { loop: true, volume: 0.35 });
        if (!this.has('radio')) {
          this.set('radio');
          await this.ctx.scheduler.wait(1.8);
          await this.ctx.dialogue.say([
            { text: '[static] ...is anyone... [static]', speaker: 'RADIO', voice: 'radio', pos: radioPos },
            { text: "If you're hearing this, do not go back to the cabin.", speaker: 'RADIO', voice: 'self', pos: radioPos, volume: 1 },
          ]);
          radioHandle?.setVolume(0.6);
          this.ctx.clues.add('radio_warning');
          await this.ctx.scheduler.wait(0.8);
          this.ctx.dialogue.thought('What cabin? ...and why did that voice sound so familiar?');
          this.maybeCall();
        }
      },
    });
    b.glint(-70, 1.3, 6);
    // 2: truck - food & notes
    this.searchable({ id: 'car_truck', object: cars[2].body, prompt: 'Search truck', sound: 'car_door', onSearch: () => this.ctx.hud.message('A cold coffee, a logbook with the last entry on OCT 21. Nothing useful.', 4) });
    this.searchable({
      id: 'car_pickup',
      object: cars[3].body,
      prompt: 'Search pickup',
      sound: 'car_door',
      onSearch: () => {
        this.ctx.flashlight.addCharge(50);
        this.ctx.hud.toast('Flashlight batteries (+50%)', 'item');
        this.ctx.audio.play('pickup');
      },
    });
    const note = b.paper(-18.2, 1.25, 5.2, 0.2, true, 0.18, 0.22, 0xf0e8c8);
    this.readable({
      id: 'dashnote',
      object: note,
      prompt: 'Read note on dashboard',
      note: { title: 'Note on the dashboard', text: "Everyone just got out of their cars and walked into the trees.\nNo one said a word.\n\nI'm staying put. I am NOT going to the cabin." },
      clue: 'traffic_note',
    });
    this.searchable({ id: 'car_hatch2', object: cars[5].body, prompt: 'Search car', sound: 'car_door', onSearch: () => this.ctx.hud.message("Half a granola bar. You eat it. You didn't realise how hungry you were.", 4) });
    this.searchable({
      id: 'car_sedan3',
      object: cars[6].body,
      prompt: 'Search car',
      sound: 'car_door',
      onSearch: () => {
        this.ctx.state.setFlag('map:3');
        this.ctx.hud.message('A road atlas, open to this highway. (Map updated.)', 4);
      },
    });
    this.searchable({ id: 'car_hatch3', object: cars[7].body, prompt: 'Search car', sound: 'car_door', onSearch: () => this.ctx.hud.message('A child\'s car seat. A drawing on the seat: a cabin, and stick figures walking toward it.', 5) });
    this.searchable({ id: 'car_pickup2', object: cars[8].body, prompt: 'Search pickup', sound: 'car_door', onSearch: () => this.ctx.hud.message('Empty. The keys are still in the ignition. The battery is dead.', 4) });
    this.searchable({ id: 'car_sedan4', object: cars[9].body, prompt: 'Search car', sound: 'car_door', onSearch: () => this.ctx.hud.message('A phone charger cable, but no power. A receipt from the Quik Mart, dated OCT 21.', 4) });
    void r;

    // The charger car: blue sedan on the shoulder near the tunnel
    const blue = b.car({ x: 30, z: 8, rot: -Math.PI / 2 + 0.03, color: 0x1e4a9a, type: 'sedan' });
    b.glint(30, 1.4, 8);
    this.addInteractable({
      id: 'bluecar',
      object: blue.body,
      prompt: () => {
        if (!this.has('carOpen')) return this.ctx.inventory.has('car_key') ? 'Unlock the sedan' : 'Blue sedan (locked)';
        if (!this.has('fuse')) return this.ctx.inventory.has('car_fuse') ? 'Replace blown fuse (15A)' : 'Check the 12V socket';
        if (this.has('charged')) return 'Car battery is dead';
        return this.charging ? 'Charging...' : 'Plug in phone';
      },
      onInteract: () => this.useBlueCar(blue),
    });
  }

  private async useBlueCar(blue: { headlights: THREE.Mesh[] }): Promise<void> {
    const { ctx } = this;
    const pos = new THREE.Vector3(30, 1, 8);
    if (!this.has('carOpen')) {
      if (!ctx.inventory.has('car_key')) {
        ctx.audio.playAt('locked', pos);
        ctx.hud.message('Locked. Through the window you see a phone cable plugged into the dash.');
        if (!ctx.state.data.objective.includes('key')) ctx.story.setObjective('Find the key to the blue sedan.');
        return;
      }
      this.set('carOpen');
      ctx.audio.playAt('unlock', pos);
      ctx.audio.playAt('car_door', pos, { delay: 0.4 });
      ctx.hud.message('Unlocked. You turn the key: the dash lights up, but the 12V socket is dead.', 4);
      return;
    }
    if (!this.has('fuse')) {
      if (!ctx.inventory.has('car_fuse')) {
        ctx.hud.message('The socket is dead. The fuse labelled "12V ACC 15A" is blackened.', 4);
        ctx.story.setObjective('Find a 15A fuse for the sedan.');
        return;
      }
      this.set('fuse');
      ctx.inventory.remove('car_fuse');
      ctx.audio.playAt('click', pos);
      ctx.hud.message('You swap in the new fuse. The charging light blinks on.', 4);
      blue.headlights.forEach((h) => ((h.material as THREE.MeshBasicMaterial).color.setHex(0x8a8a70)));
      return;
    }
    if (this.has('charged') || this.charging) return;
    this.charging = true;
    ctx.audio.playAt('engine_idle', pos, { volume: 0.2 });
    ctx.hud.message('Charging. Stay close to the car.', 3);
    let gained = (ctx.state.flag(this.flagKey('chargedAmt')) as number) || 0;
    while (gained < 5) {
      await ctx.scheduler.wait(1.6);
      if (ctx.player.pos.distanceTo(new THREE.Vector3(30, ctx.player.pos.y, 8)) > 4) {
        ctx.hud.message('You pulled the cable out. Go back to the car to keep charging.', 3);
        this.charging = false;
        return;
      }
      ctx.battery.charge(1);
      gained++;
      this.set('chargedAmt', gained);
    }
    this.set('charged');
    this.charging = false;
    ctx.audio.playAt('power_down', pos, { volume: 0.5 });
    blue.headlights.forEach((h) => ((h.material as THREE.MeshBasicMaterial).color.setHex(0x333330)));
    ctx.hud.message('+5%. The car battery gives out with a click.', 4);
    ctx.story.setObjective('Follow the highway east, through the tunnel.');
  }

  private maybeCall(): void {
    if (this.has('call')) return;
    this.set('call');
    const { ctx } = this;
    ctx.scheduler.wait(14).then(() => {
      if (ctx.levels.current !== this) return;
      ctx.phone.startCall({
        who: 'UNKNOWN',
        incoming: true,
        ringFor: 20,
        lines: [
          { text: '(slow breathing)', voice: 'none', dur: 3 },
          { text: "Sam. It's me. Listen...", speaker: 'UNKNOWN', voice: 'self' },
          { text: "Don't go inside. Whatever you do, don't...", speaker: 'UNKNOWN', voice: 'self' },
          { text: '(the line fills with static)', voice: 'none', dur: 2.5 },
        ],
        onAnswer: () => ctx.state.setFlag('call_answered'),
        onMissed: () => ctx.state.setFlag('call_missed'),
        onEnd: () => {
          ctx.state.setFlag('call_answered');
          ctx.clues.add('call_self');
          ctx.scheduler.wait(1).then(() => ctx.dialogue.thought('That was my voice. How is that possible?'));
        },
      });
    });
  }

  // ---------------------------------------------------------------- tunnel
  private buildTunnel(): void {
    const b = this.b;
    const len = TUNNEL_X1 - TUNNEL_X0;
    const cx = (TUNNEL_X0 + TUNNEL_X1) / 2;
    const conc = texMat('concrete', 1, { color: 0x8a8a84 });
    // walls & ceiling
    b.box(len, 7, 1, conc, cx, 0, 9.5, { collide: true, uvScale: 3 });
    b.box(len, 7, 1, conc, cx, 0, -9.5, { collide: true, uvScale: 3 });
    b.box(len, 1, 20, conc, cx, 7, 0, { uvScale: 3 });
    b.box(len, 0.02, 19, texMat('asphalt', 1), cx, -0.01, 0, { uvScale: 5, cast: false });
    for (let x = TUNNEL_X0 + 2; x < TUNNEL_X1; x += 7) b.box(3, 0.01, 0.14, colorMat(0xc8c8c0, 0.6), x, 0.012, 0, { cast: false });
    b.box(len, 0.3, 1, colorMat(0x5a5a56, 0.8), cx, 0, 8.6, { collide: true });
    b.box(len, 0.3, 1, colorMat(0x5a5a56, 0.8), cx, 0, -8.6, { collide: true });
    // portals
    for (const px of [TUNNEL_X0, TUNNEL_X1]) {
      b.box(2, 3, 26, texMat('concrete', 1, { color: 0x9a9a92 }), px, 7, 0, { uvScale: 3 });
      b.box(2, 10, 6, texMat('concrete', 1, { color: 0x9a9a92 }), px, 0, 12.5, { collide: true, uvScale: 3 });
      b.box(2, 10, 6, texMat('concrete', 1, { color: 0x9a9a92 }), px, 0, -12.5, { collide: true, uvScale: 3 });
    }
    b.textPlane(['HOLLOW RIDGE TUNNEL'], 8, 0.9, { bg: '#1f5a2e', fg: '#ffffff', size: 90 }, TUNNEL_X0 - 1.05, 8.5, 0, -Math.PI / 2);
    // mountain
    const rockMat = texMat('rock', 1, { color: 0x6a6a64 });
    const r = rng(90);
    for (let i = 0; i < 26; i++) {
      const x = TUNNEL_X0 + r() * len;
      const side = i % 2 ? 1 : -1;
      const s = 12 + r() * 16;
      const z = side * (s + 11 + r() * 22);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockMat);
      m.position.set(x, s * 0.35, z);
      m.scale.set(1, 0.8 + r() * 0.5, 1);
      m.rotation.set(r(), r(), r());
      m.receiveShadow = true;
      b.add(m);
    }
    for (let x = TUNNEL_X0 + 6; x < TUNNEL_X1; x += 12) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 1), rockMat);
      m.position.set(x, 16, 0);
      m.scale.set(1, 0.6, 1.6);
      b.add(m);
    }
    // blockers outside the tunnel, so the only way east is through it
    this.ctx.collision.addBox(cx, 32, len + 4, 44);
    this.ctx.collision.addBox(cx, -32, len + 4, 44);
    // lights
    let real = 0;
    for (let x = TUNNEL_X0 + 3; x < TUNNEL_X1; x += 6) {
      for (const z of [-8.9, 8.9]) {
        const mesh = b.box(1.2, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: 0xffc27a }), x, 6.2, z, { cast: false });
        mesh.userData.dynamic = true;
        let light: THREE.PointLight | undefined;
        if (z > 0 && (x - TUNNEL_X0) % 18 === 3 && real < 3) {
          light = new THREE.PointLight(0xffb060, 14, 14, 1.4);
          light.position.set(x, 5.6, 0);
          b.add(light);
          real++;
        }
        this.tunnelLights.push({ mesh, light });
      }
    }
    // abandoned cars inside
    b.car({ x: 100, z: 4.5, rot: -Math.PI / 2 + 0.2, color: 0x4a4a4a, type: 'sedan' });
    b.car({ x: 122, z: -5, rot: Math.PI / 2 - 0.1, color: 0x6a2a2a, type: 'hatch' });
    // triggers
    this.addTrigger({
      id: 'tunnelEnter',
      box: { minX: TUNNEL_X0 - 8, maxX: TUNNEL_X0 + 4, minZ: -10, maxZ: 10 },
      onEnter: () => {
        this.ctx.story.setObjective('Get through the tunnel.');
        this.ctx.audio.setAmbience({ wind: 0.2, crickets: 0, rumble: 0.5, reverb: 0.8 }, 3);
      },
    });
    this.addTrigger({ id: 'tunnelDark', box: { minX: TUNNEL_X0 + 16, maxX: TUNNEL_X1, minZ: -10, maxZ: 10 }, onEnter: () => this.lightsOut() });
    this.addTrigger({
      id: 'tunnelExit',
      box: { minX: TUNNEL_X1 + 1, maxX: 175, minZ: -12, maxZ: 12 },
      onEnter: () => {
        this.ctx.audio.setAmbience({ wind: 0.6, crickets: 0.5, reverb: 0.25 }, 3);
        this.ctx.story.setObjective('Keep going.');
      },
    });
    // tunnel figure
    const fig = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    fig.position.set(TUNNEL_X1 + 1, 0.9, -2);
    fig.rotation.y = -Math.PI / 2;
    fig.visible = false;
    fig.userData.dynamic = true;
    b.add(fig);
    this.addTrigger({
      id: 'tunnelFigure',
      box: { minX: 112, maxX: 118, minZ: -10, maxZ: 10 },
      onEnter: async () => {
        fig.visible = true;
        this.ctx.audio.playAt('step_concrete', new THREE.Vector3(TUNNEL_X1, 0.5, -2), { volume: 1 });
        await this.ctx.scheduler.wait(1.2);
        fig.visible = false;
      },
    });
  }

  private async lightsOut(): Promise<void> {
    if (this.tunnelDark) return;
    this.tunnelDark = true;
    const { ctx } = this;
    ctx.audio.play('power_down', { volume: 0.8 });
    for (let k = 0; k < 6; k++) {
      const on = k % 2 === 1;
      this.tunnelLights.forEach((l) => {
        (l.mesh.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xffc27a : 0x151515);
        if (l.light) l.light.intensity = on ? 14 : 0;
      });
      await ctx.scheduler.wait(0.12 + Math.random() * 0.2);
    }
    this.tunnelLights.forEach((l) => {
      (l.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x111111);
      if (l.light) l.light.intensity = 0;
    });
    ctx.phone.refresh();
    if (ctx.phone.gpsOn) ctx.phone.toast('GPS signal lost.');
    await ctx.scheduler.wait(1);
    ctx.dialogue.thought(ctx.flashlight.on ? 'The lights... and no signal.' : 'Pitch black. I need light.', 3);
    ctx.scheduler.wait(6).then(async () => {
      for (let i = 0; i < 6; i++) {
        ctx.audio.playAt('step_concrete', this.around(10, true), { volume: 0.8, reverb: 1 });
        await ctx.scheduler.wait(0.5);
      }
    });
  }

  // ---------------------------------------------------------------- signs
  private buildSigns(): void {
    const b = this.b;
    b.sign(-104, 11.5, -Math.PI / 2, ['← ALDER FALLS 6'], { w: 2.2, h: 0.6, poleH: 2 });
    b.sign(-60, 11.5, -Math.PI / 2, ['REST AREA 1 KM'], { w: 2.2, h: 0.6, poleH: 2, bg: '#1a3a7a' });
    b.sign(40, 11.5, -Math.PI / 2, ['HOLLOW RIDGE TUNNEL', 'TURN ON HEADLIGHTS'], { w: 2.6, h: 1, poleH: 2 });
    b.sign(10, 11.5, -Math.PI / 2, ['SPEED', 'LIMIT', '90'], { w: 0.8, h: 1.1, bg: '#f0f0f0', fg: '#111', poleH: 1.6, border: '#111' });
    // overhead gantry
    b.box(0.4, 7, 0.4, colorMat(0x777777, 0.5, 0.6), -80, 0, 9.8, { collide: true });
    b.box(0.4, 7, 0.4, colorMat(0x777777, 0.5, 0.6), -80, 0, -9.8, { collide: true });
    b.box(0.4, 0.4, 20, colorMat(0x777777, 0.5, 0.6), -80, 6.6, 0);
    b.textPlane(['EXIT 14 · REST AREA', '→'], 5, 1.4, { bg: '#1f5a2e', fg: '#ffffff', size: 70 }, -80.25, 5.2, 4.5, -Math.PI / 2);
    // the sign at the end
    b.sign(152, 11, -Math.PI / 2, ['CABIN — 3 KM', '→'], { w: 2.6, h: 1.2, bg: '#5a3a1a', fg: '#f0e0c0', poleH: 1.6 });
    const hit = b.hitbox(3, 3, 1, 152, 0, 11);
    this.addInteractable({
      id: 'cabinsign',
      object: hit,
      prompt: 'Read sign',
      onInteract: () => this.finish(),
    });
    this.addTrigger({ id: 'signNear', x: 152, z: 8, r: 6, onEnter: () => this.finish() });
    // the road beyond: turns into a dirt road into the woods
    b.box(40, 0.02, 7, texMat('dirt', 1), 175, -0.01, -14, { uvScale: 4, cast: false, rotY: 0.6 });
  }

  private finishing = false;

  private async finish(): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(152, 2.3, 11), 2);
    ctx.clues.add('cabin_sign');
    ctx.audio.playMusic('dread', 2);
    await ctx.dialogue.thought('CABIN. Three kilometres.', 3);
    await ctx.dialogue.thought('"Do not go back to the cabin." ...Back.', 3.2);
    await ctx.dialogue.thought("It's the only road there is.", 2.5);
    await ctx.transition.fadeOut(3);
    ctx.audio.playMusic('none', 2);
    ctx.player.cam.release();
    this.complete();
  }

  private setupEvents(): void {
    const { ctx } = this;
    this.events = [
      () => ctx.audio.playAt('car_pass', this.around(40), { volume: 0.6, refDist: 12 }),
      () => ctx.audio.playAt('howl', this.around(80), { volume: 0.5, refDist: 25 }),
      () => ctx.audio.playAt('branch', this.around(18), { volume: 1 }),
      () => ctx.audio.playAt('static', this.around(12), { volume: 0.3 }),
      async () => {
        for (let i = 0; i < 4; i++) {
          ctx.audio.playAt('step_asphalt', this.around(9, true), { volume: 0.8 });
          await ctx.scheduler.wait(0.55);
        }
      },
      () => ctx.audio.playAt('owl', this.around(40), { volume: 0.6, refDist: 10 }),
    ];
    this.eventTimer = 40;
  }

  update(dt: number, t: number): void {
    super.update(dt, t);
    const { ctx } = this;
    if (ctx.phone.gpsOn && !ctx.state.has('gps_home_seen') && ctx.player.pos.x < TUNNEL_X0) {
      ctx.state.setFlag('gps_home_seen');
      ctx.phone.refresh();
      ctx.clues.add('gps_home');
      ctx.phone.toast('Route found: HOME');
      ctx.scheduler.wait(10).then(() => {
        if (ctx.levels.current === this) ctx.story.deliver('unknown', 'msg_unknown_gps');
      });
      ctx.scheduler.wait(2).then(() => ctx.dialogue.thought("HOME? 14 Alder Ridge Road... I've never heard of it.", 3.5));
    }
  }

  onStart(fromSave: boolean): void {
    const { ctx } = this;
    if (fromSave) return;
    ctx.story.setObjective('Follow the highway east.');
    ctx.scheduler.wait(2).then(() => ctx.dialogue.thought('A highway. Not a single car moving.', 3));
    ctx.scheduler.wait(25).then(() => {
      if (ctx.levels.current === this && !ctx.state.has('gps_home_seen')) ctx.hud.hint('Your GPS might show where this road goes. It costs 1% every 30 seconds.', 6);
    });
  }
}
