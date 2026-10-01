import * as THREE from 'three';
import { BaseLevel } from './BaseLevel';
import { colorMat, texMat, Mats } from '../world/Materials';
import { drawPhoto } from '../world/PhotoArt';
import type { Surface } from '../player/Player';
import type { Door } from '../world/Builder';

/**
 * LEVEL 2 - THE TOWN.
 * Alder Falls looks like everyone simply left. The police station is locked;
 * the spare key is in motel room 4 (code = first check-in date, 1021).
 */
export class TownLevel extends BaseLevel {
  id = 2;
  name = 'THE TOWN';
  mapName = 'Alder Falls';
  private storeLight?: THREE.PointLight;
  private h1Door?: Door;
  private h2Window?: THREE.MeshStandardMaterial;
  private radio?: { on: boolean; handle: { stop: (f?: number) => void } | null };
  private flicker: { set: (on: boolean, lvl?: number) => void; t: number }[] = [];

  surfaceAt(x: number, z: number): Surface {
    const inside = this.insideBuilding(x, z);
    if (inside) return inside === 'police' || inside === 'gas' || inside === 'store' ? 'concrete' : 'wood';
    if (Math.abs(x) < 4.2 && z > -45 && z < 90) return 'asphalt';
    if (Math.abs(z - 16) < 4.2 && Math.abs(x) < 42) return 'asphalt';
    if (x > 7.5 && x < 17.5 && z > -40 && z < -8) return 'asphalt';
    if (Math.abs(x) < 6.6) return 'concrete';
    return 'dirt';
  }

  private insideBuilding(x: number, z: number): string | null {
    const r = (cx: number, cz: number, w: number, d: number) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
    if (r(-22, 40, 8, 7)) return 'gas';
    if (r(20, 40, 10, 9)) return 'store';
    if (r(-22, 4, 8, 8)) return 'house';
    if (r(22, -24, 8, 29)) return 'motel';
    if (r(0, -50, 14, 10)) return 'police';
    return null;
  }

  signalAt(): number {
    return 2;
  }

  ambientAt(x: number, z: number): number {
    return this.insideBuilding(x, z) ? 0.35 : 1;
  }

  build(): void {
    const b = this.b;
    const ctx = this.ctx;
    this.setupAtmosphere({
      fogColor: 0x0c1016,
      fogDensity: 0.032,
      skyTop: 0x05080f,
      skyBottom: 0x151c28,
      moon: true,
      stars: true,
      moonDir: [-0.4, 0.5, -0.7],
      moonIntensity: 0.4,
      hemiSky: 0x2c3548,
      hemiGround: 0x15130f,
      hemiIntensity: 0.6,
      particles: 'dust',
      exposure: 1.3,
    });
    this.ambience = { wind: 0.45, crickets: 0.35, hum: 0.25, reverb: 0.35 };
    this.mapBounds = { minX: -45, maxX: 45, minZ: -62, maxZ: 80 };
    ctx.collision.setBounds(-40, 40, -60, 78);
    this.spawn = { x: 0, z: 74, yaw: 0 };

    // ground & streets
    b.box(160, 0.1, 200, texMat('forestFloor', 1, { color: 0x8a8a78 }), 0, -0.12, 10, { uvScale: 6, cast: false });
    const asphalt = texMat('asphalt', 1);
    b.box(8.4, 0.02, 140, asphalt, 0, -0.02, 20, { uvScale: 5, cast: false });
    b.box(84, 0.02, 8.4, asphalt, 0, -0.016, 16, { uvScale: 5, cast: false });
    b.box(10, 0.02, 32, asphalt, 12.5, -0.014, -24, { uvScale: 5, cast: false });
    const conc = texMat('concrete', 1, { color: 0xa0a09a });
    for (const sx of [-1, 1]) {
      b.box(2.2, 0.05, 116, conc, sx * 5.3, -0.02, 22, { uvScale: 2, cast: false });
    }
    // road markings
    const lineMat = colorMat(0xc8a840, 0.6, 0, 0x151000);
    for (let z = -40; z < 88; z += 6) b.box(0.15, 0.01, 3, lineMat, 0, 0.001, z, { cast: false, receive: true });
    for (let z = -37; z <= -11; z += 3.4) b.box(4, 0.01, 0.1, colorMat(0xbbbbbb, 0.7), 12.5, 0.001, z, { cast: false });

    // surrounding forest & fences
    b.forest({ minX: -80, maxX: 80, minZ: -110, maxZ: 120, count: 900, seed: 21, exclude: (x, z) => Math.abs(x) < 44 && z > -64 && z < 82 && !(Math.abs(x) > 34 && z < 70 && z > -58 && Math.random() < 0.02), collide: () => false, bushes: 250 });
    b.forest({ minX: -80, maxX: 80, minZ: 82, maxZ: 120, count: 60, seed: 22, exclude: (x) => Math.abs(x) < 7, collide: () => false });
    b.fence(-38, -58, -38, 74);
    b.fence(38, -58, 38, 74);
    b.fence(-38, -58, 38, -58);
    b.grass({ minX: -38, maxX: 38, minZ: -58, maxZ: 76, count: 5000, seed: 23, exclude: (x, z) => Math.abs(x) < 7 || Math.abs(z - 16) < 5 || !!this.insideBuilding(x, z) || (x > 7 && x < 18 && z < -8 && z > -40) });

    b.sign(7.5, 64, -0.3, ['WELCOME TO', 'ALDER FALLS', 'POP. 1,204'], { w: 2.6, h: 1.5, bg: '#2a4a36', poleH: 1.2 });

    this.buildGasStation();
    this.buildStore();
    this.buildHouses();
    this.buildMotel();
    this.buildPolice();
    this.buildStreetLights();
    this.buildParkedCars();

    this.landmark('gas', 'Gas station', -16, 42, 12);
    this.landmark('store', 'Quik Mart', 20, 40, 11);
    this.landmark('houses', 'Houses', -22, 4, 12);
    this.landmark('motel', 'Pines Motel', 18, -20, 14);
    this.landmark('police', 'Police station', 0, -46, 12);
    this.mapRoads = [
      { pts: [[0, 78], [0, -44]], w: 8, kind: 'road', always: true },
      { pts: [[-38, 16], [38, 16]], w: 8, kind: 'road', always: true },
    ];
    this.mapAreas = [
      { x: -22, z: 40, w: 8, d: 7, landmark: 'gas' },
      { x: 20, z: 40, w: 10, d: 9, landmark: 'store' },
      { x: -22, z: 4, w: 8, d: 8, landmark: 'houses' },
      { x: 22, z: 4, w: 8, d: 8, landmark: 'houses' },
      { x: -22, z: -16, w: 8, d: 8, landmark: 'houses' },
      { x: 22, z: -24, w: 8, d: 29, landmark: 'motel' },
      { x: 0, z: -50, w: 14, d: 10, landmark: 'police' },
    ];
    this.setupTriggers();
    this.setupEvents();
  }

  // ------------------------------------------------------------------ gas station
  private buildGasStation(): void {
    const b = this.b;
    const glass = Mats.glass();
    b.room({ x: -22, z: 40, w: 8, d: 7, h: 3, wallMat: texMat('concrete', 1, { color: 0xc8c0b0 }), innerMat: texMat('tiles', 1, { color: 0xd8d0c0 }), floorMat: texMat('tiles', 1), roof: 'flat', e: [{ off: 1.8, w: 1.2 }, { off: -1.2, w: 2.4, bottom: 0.9, top: 2.3, glass }], n: [{ off: 0, w: 2, bottom: 1.1, top: 2.1, glass }] });
    b.door({ id: 'gas', x: -18, z: 41.8, axis: 'z', width: 1.2, mat: colorMat(0x8a9090, 0.3, 0.6), sound: 'metal' });
    b.textPlane(['GAS & GO'], 5, 0.8, { bg: '#b02020', fg: '#fff', size: 100 }, -17.88, 3.3, 40, Math.PI / 2);
    // canopy
    b.box(10, 0.4, 9, colorMat(0xd8d8d8, 0.5, 0.2), -11, 4.2, 44, { cast: true });
    b.box(10.1, 0.5, 9.1, colorMat(0xb02020, 0.6), -11, 4.6, 44, { cast: false });
    for (const [x, z] of [
      [-15, 40.5],
      [-7, 40.5],
      [-15, 47.5],
      [-7, 47.5],
    ])
      b.box(0.35, 4.2, 0.35, colorMat(0xcccccc, 0.5), x, 0, z, { collide: true });
    for (const z of [42, 46]) {
      b.box(1.4, 0.2, 0.9, conc(), -11, 0, z, { collide: true });
      const pump = b.box(0.8, 1.6, 0.5, colorMat(0xc03030, 0.6), -11, 0.2, z);
      b.box(0.5, 0.3, 0.02, colorMat(0x102010, 0.3, 0, 0x30ff60, 0.4), -11, 1.2, z + 0.26, { cast: false });
      pump.castShadow = true;
    }
    const canopyLight = new THREE.PointLight(0xe8f0ff, 9, 18, 1.4);
    canopyLight.position.set(-11, 3.4, 44);
    b.add(canopyLight);
    b.box(3, 0.05, 1, new THREE.MeshBasicMaterial({ color: 0xe8f0ff }), -11, 4.15, 44, { cast: false });
    // interior
    b.counter(-24.5, 39, 2.6, 0.8, Math.PI / 2);
    b.shelf(-22, 42.5, 2.5, Math.PI, 1.5, 0.4, true, 31);
    b.shelf(-22, 37.5, 2.5, 0, 1.5, 0.4, true, 32);
    // radio on the counter
    const radio = b.box(0.35, 0.2, 0.18, colorMat(0x3a2a20, 0.5), -24.5, 0.95, 38.6, { rotY: Math.PI / 2 });
    b.box(0.1, 0.1, 0.01, colorMat(0x806040, 0.4, 0, 0x402000, 0.5), -24.4, 1.02, 38.6, { rotY: Math.PI / 2, cast: false });
    const radioPos = new THREE.Vector3(-24.5, 1.1, 38.6);
    this.radio = { on: false, handle: null };
    this.addInteractable({
      id: 'gasradio',
      object: radio,
      prompt: () => (this.radio!.on ? 'Turn radio off' : 'Turn radio on'),
      onInteract: () => this.setRadio(!this.radio!.on, radioPos),
    });
    // batteries
    const aa = b.box(0.12, 0.05, 0.08, colorMat(0xd8b020, 0.4, 0.3), -24.3, 0.95, 39.8);
    this.pickup({
      id: 'aa',
      object: aa,
      prompt: 'Take AA batteries',
      onPick: () => {
        this.ctx.flashlight.addCharge(60);
        this.ctx.hud.toast('AA batteries (flashlight +60%)', 'item');
        this.ctx.audio.play('pickup');
      },
    });
    // missing poster in the window
    const poster = b.canvasPlane(missingPoster(), 0.55, -17.88, 1.6, 38.3, Math.PI / 2);
    this.readable({ id: 'poster', object: poster, prompt: 'Read poster', note: { title: 'MISSING', text: 'MARA VANCE, 27\n5\'6", brown hair, red jacket.\nLast seen OCTOBER 17 near the Hollow Pines trail.\n\nIf you have any information call the Alder Falls Police Department.', image: missingPoster(), imageWidth: 260 }, clue: 'mara_poster' });
  }

  private setRadio(on: boolean, pos: THREE.Vector3, scripted = false): void {
    const r = this.radio!;
    r.on = on;
    this.ctx.audio.playAt('radio_on', pos, { volume: 0.7 });
    if (on) {
      r.handle = this.ctx.audio.playAt('static', pos, { loop: true, volume: 0.35, refDist: 2 });
      if (scripted) {
        this.ctx.dialogue.say([
          { text: '...repeat, all residents of Alder Falls... remain...', speaker: 'RADIO', voice: 'radio', pos },
          { text: '...do not approach the... [static] ...north of...', speaker: 'RADIO', voice: 'radio', pos },
        ]);
      }
    } else {
      r.handle?.stop(0.2);
      r.handle = null;
    }
  }

  // ------------------------------------------------------------------ store
  private buildStore(): void {
    const b = this.b;
    const lit = Mats.windowLit();
    b.room({ x: 20, z: 40, w: 10, d: 9, h: 3.2, wallMat: texMat('siding', 1, { color: 0xa8b0a0 }), innerMat: texMat('wallpaper', 1, { color: 0xd8d8d0 }), floorMat: texMat('tiles', 1), roof: 'flat', w_: [{ off: 2.5, w: 1.4 }, { off: -1.5, w: 3.5, bottom: 0.8, top: 2.4, glass: lit }] });
    b.door({ id: 'store', x: 15, z: 42.5, axis: 'z', width: 1.4, mat: colorMat(0x9aa0a0, 0.3, 0.6), sound: 'metal', swing: -1 });
    b.textPlane(['QUIK MART'], 5, 0.8, { bg: '#1c3c78', fg: '#ffd84a', size: 92 }, 14.88, 3.5, 40, -Math.PI / 2);
    this.storeLight = new THREE.PointLight(0xe8f4ff, 7, 14, 1.4);
    this.storeLight.position.set(20, 2.9, 40);
    b.add(this.storeLight);
    const tube = b.box(2.2, 0.05, 0.2, new THREE.MeshBasicMaterial({ color: 0xe8f4ff }), 20, 3.12, 40, { cast: false });
    this.onUpdate((_dt, t) => {
      const f = Math.sin(t * 37) > 0.93 || (Math.sin(t * 0.7) > 0.97 && Math.random() > 0.3) ? 0.15 : 1;
      this.storeLight!.intensity = 7 * f;
      (tube.material as THREE.MeshBasicMaterial).color.setScalar(f);
    });
    this.ctx.audio.playAt('electric_buzz', new THREE.Vector3(20, 3, 40), { loop: true, volume: 0.12, refDist: 2 });
    b.shelf(20, 37.5, 4, 0, 1.7, 0.5, true, 41);
    b.shelf(20, 40.5, 4, Math.PI, 1.7, 0.5, true, 42);
    b.shelf(20, 41.2, 4, 0, 1.7, 0.5, true, 43);
    // fridges along the east wall (emissive)
    for (let i = 0; i < 3; i++) {
      b.box(0.8, 2, 1.1, colorMat(0x303438, 0.4, 0.5), 24.4, 0, 37 + i * 1.2, { collide: true });
      b.box(0.02, 1.7, 0.95, colorMat(0x0a1418, 0.1, 0.4, 0x7ab0d0, 0.5), 23.99, 0.15, 37 + i * 1.2, { cast: false });
    }
    b.counter(17, 36.8, 2.2, 0.8, 0);
    b.box(0.4, 0.25, 0.3, colorMat(0x2a2a2a, 0.5), 16.6, 0.95, 36.8);
    // corkboard + note
    b.box(0.9, 0.7, 0.03, texMat('planks', 1, { color: 0xb08a5a }), 17, 1.4, 35.62, { cast: false });
    const note = b.paper(17.1, 1.45, 35.65, 0, false, 0.2, 0.26, 0xf0e8a0);
    this.readable({
      id: 'storenote',
      object: note,
      prompt: 'Read note',
      note: { title: 'Note on the corkboard', text: 'Marge -\n\nThe Chief left his spare station key in room 4 AGAIN.\nThe reporter from the city has that room now.\nGet it back before he notices.\n\n- T.' },
      clue: 'store_note',
      onRead: () => {
        if (!this.ctx.inventory.has('police_key')) this.ctx.story.setObjective('Find the spare key in room 4 at the motel.');
      },
    });
    const pb = b.box(0.08, 0.02, 0.14, colorMat(0x222222, 0.4, 0.4), 20.6, 1.22, 37.4);
    this.pickup({
      id: 'powerbank',
      object: pb,
      prompt: 'Take power bank',
      onPick: () => {
        this.ctx.hud.toast('Power bank', 'item');
        this.ctx.battery.charge(1);
        this.ctx.hud.message('Almost empty. You squeeze 1% out of it before it dies.', 4);
      },
    });
    // outlet teaser
    const outlet = b.box(0.1, 0.14, 0.02, colorMat(0xeeeeee, 0.4), 18.5, 0.4, 44.39);
    this.addInteractable({
      id: 'outlet',
      object: outlet,
      prompt: 'Plug in phone',
      onInteract: () => {
        this.ctx.audio.play('spark');
        this.ctx.hud.message('The outlet sparks and goes dead. No luck.');
      },
    });
  }

  // ------------------------------------------------------------------ houses
  private buildHouses(): void {
    const b = this.b;
    const glass = Mats.glass();
    const siding = texMat('siding', 1, { color: 0xa89a88 });
    const wp = texMat('wallpaper', 1);
    // H1 (enterable)
    b.room({ x: -22, z: 4, w: 8, d: 8, h: 2.8, wallMat: siding, innerMat: wp, floorMat: texMat('planks', 1), roof: 'gable', e: [{ off: 0, w: 1.0 }, { off: 2.4, w: 1.4, bottom: 0.9, top: 2.1, glass }], n: [{ off: 1, w: 1.4, bottom: 0.9, top: 2.1, glass }] });
    this.h1Door = b.door({ id: 'h1', x: -18, z: 4, axis: 'z', width: 1.0, swing: -1 });
    b.box(1.6, 0.15, 2.4, texMat('planks', 1), -17.2, 0, 4, { cast: false });
    b.sofa(-24, 6.5, Math.PI);
    b.table(-22.5, 4, 1.2, 0.8, 0);
    b.chair(-23.4, 2.6, Math.PI * 0.8, true);
    b.box(1.1, 0.7, 0.1, colorMat(0x111111, 0.3), -22, 0.9, 0.3, { cast: false });
    b.box(1.2, 0.5, 0.4, texMat('planks', 1), -22, 0, 0.4, { collide: true });
    b.fridge(-25.4, 1.2, Math.PI / 2);
    const fnote = b.paper(-24.99, 1.4, 1.2, Math.PI / 2, false, 0.16, 0.2, 0xfff4a0);
    this.readable({
      id: 'fridge',
      object: fnote,
      prompt: 'Read note on fridge',
      note: { title: 'Note on the fridge', text: "Harold -\n\nIf the lights go out again, DON'T go outside.\nStay in until morning.\nThe ones who go out come back wrong.\n\n- June" },
    });
    const photo = b.canvasPlane(drawPhoto('mara', { seed: 5, date: "JUL 04 '19" }), 0.4, -25.85, 1.5, 5.5, Math.PI / 2);
    photo.castShadow = false;
    // H2 (locked, window light event)
    this.h2Window = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.2, emissive: 0xffb060, emissiveIntensity: 0 });
    b.room({ x: 22, z: 4, w: 8, d: 8, h: 2.8, wallMat: texMat('siding', 1, { color: 0x8a9aa8 }), floorMat: null, ceilMat: null, roof: 'gable', w_: [{ off: 0, w: 1.0 }, { off: -2.4, w: 1.4, bottom: 0.9, top: 2.1, glass: this.h2Window }] });
    b.door({ id: 'h2', x: 18, z: 4, axis: 'z', width: 1.0, locked: true, lockedText: 'Locked. You hear something shift inside.' });
    // H3 (locked)
    b.room({ x: -22, z: -16, w: 8, d: 8, h: 2.8, wallMat: texMat('siding', 1, { color: 0x9a8a78 }), floorMat: null, ceilMat: null, roof: 'gable', e: [{ off: 0, w: 1.0 }, { off: -2.4, w: 1.4, bottom: 0.9, top: 2.1, glass: Mats.windowDark() }] });
    b.door({ id: 'h3', x: -18, z: -16, axis: 'z', width: 1.0, locked: true });
    // porches & mailboxes
    for (const [x, z, rot] of [
      [-16.5, 7.5, 0],
      [16.5, 0.5, 0],
      [-16.5, -12.5, 0],
    ]) {
      b.box(0.08, 1.1, 0.08, colorMat(0x333333), x, 0, z, { rotY: rot });
      b.box(0.25, 0.25, 0.45, colorMat(0x3a4a5a, 0.5, 0.5), x, 1.1, z);
    }
  }

  // ------------------------------------------------------------------ motel
  private buildMotel(): void {
    const b = this.b;
    const glass = Mats.glass();
    const x0 = 18;
    const officeZ = -12;
    // shell: z from -38.5 to -9.5
    b.room({
      x: 22,
      z: -24,
      w: 8,
      d: 29,
      h: 3,
      wallMat: texMat('siding', 1, { color: 0xb09878 }),
      innerMat: texMat('wallpaper', 1, { color: 0xa89878 }),
      floorMat: texMat('carpet', 1),
      roof: 'flat',
      w_: [
        { off: 12, w: 1.1 },
        { off: 13.5, w: 1.2, bottom: 0.9, top: 2.1, glass: Mats.windowLit() },
        { off: 6.5, w: 1.0 },
        { off: 8.3, w: 1.2, bottom: 1.0, top: 2.0, glass },
        { off: 0.5, w: 1.0 },
        { off: 2.3, w: 1.2, bottom: 1.0, top: 2.0, glass },
        { off: -5.5, w: 1.0 },
        { off: -3.7, w: 1.2, bottom: 1.0, top: 2.0, glass },
        { off: -11.5, w: 1.0 },
        { off: -9.7, w: 1.2, bottom: 1.0, top: 2.0, glass: Mats.windowDark() },
      ],
    });
    const wall = texMat('wallpaper', 1, { color: 0xa89878 });
    for (const z of [-14.5, -20.5, -26.5, -32.5]) b.wall(18.1, z, 25.9, z, 3, wall, [], 0.15);
    // covered walkway
    b.box(2.2, 0.15, 30, colorMat(0x6a5a4a, 0.8), 16.8, 2.9, -24, { cast: true });
    for (let z = -38; z <= -10; z += 5.6) b.box(0.15, 2.9, 0.15, colorMat(0xdddddd, 0.6), 15.9, 0, z);
    b.box(2.2, 0.08, 30, conc(), 16.8, -0.02, -24, { cast: false });
    // office
    b.door({ id: 'motel_office', x: x0, z: officeZ, axis: 'z', width: 1.1, swing: -1 });
    b.counter(22, -12, 0.8, 3, 0);
    const lamp = b.cyl(0.12, 0.18, 0.3, colorMat(0x444444), 22.2, 0.95, -10.8);
    lamp.castShadow = false;
    b.glow(22.2, 1.4, -10.8, 0xffb060, 0.9, 0.7);
    const officeLight = new THREE.PointLight(0xffb060, 5, 7, 1.5);
    officeLight.position.set(22.2, 1.6, -10.8);
    b.add(officeLight);
    b.box(0.1, 1.5, 2, colorMat(0x4a3020, 0.7), 25.8, 0.7, -12, { cast: false });
    for (let i = 0; i < 4; i++) b.box(0.03, 0.03, 0.03, colorMat(0xb0a070, 0.3, 0.8), 25.7, 1.8 - (i % 2) * 0.3, -12.5 + i * 0.3, { cast: false });
    const register = b.box(0.35, 0.05, 0.45, colorMat(0x5a2020, 0.7), 22, 0.95, -12.6);
    this.readable({
      id: 'register',
      object: register,
      prompt: 'Read guest register',
      note: { title: 'Pines Motel - Guest Register', text: 'ROOM 2 ... D. Hale ......... OCT 14\nROOM 1 ... M. Vance ........ OCT 16\nROOM 4 ... S. Reyes ........ OCT 21\nROOM 4 ... S. Reyes ........ OCT 25\nROOM 4 ... S. Reyes ........ OCT 28\n\nThe last three entries are all in the same handwriting.\nMine.\n\nA sticky note on the desk:\n"Room door codes = FIRST check-in date (MMDD).\nWe had to change them after the lockouts. - Marge"', style: 'report' },
      clue: 'motel_register',
      onRead: () => this.ctx.dialogue.thought('Three times? I have never been here before. Have I?'),
    });
    // rooms 1-3 locked, room 4 keypad
    const doorZ = [-17.5, -23.5, -29.5, -35.5];
    doorZ.forEach((z, i) => {
      const n = i + 1;
      b.textPlane([`${n}`], 0.25, 0.25, { bg: '#d8c890', fg: '#222', size: 180 }, x0 - 0.12, 2.35, z, -Math.PI / 2);
      if (n < 4) b.door({ id: `motel${n}`, x: x0, z, axis: 'z', width: 1.0, locked: true, lockedText: n === 1 ? 'Locked. A "DO NOT DISTURB" tag hangs from the handle.' : "Locked." });
      else {
        b.door({
          id: 'motel4',
          x: x0,
          z,
          axis: 'z',
          width: 1.0,
          locked: true,
          code: '1021',
          codeTitle: 'PINES MOTEL · ROOM 4',
          onUnlock: () => this.ctx.dialogue.thought('October 21st. It worked.'),
        });
        b.box(0.12, 0.2, 0.04, colorMat(0x222222, 0.4, 0.2, 0x103010, 0.3), x0 - 0.12, 1.1, z + 0.72, { rotY: Math.PI / 2, cast: false });
      }
      // beds in rooms
      b.bed(24.4, z + 0.3, -Math.PI / 2, n === 4);
    });
    // room 4 contents
    const z4 = -35.5;
    b.box(0.5, 0.55, 0.45, texMat('planks', 1), 24.8, 0, z4 + 1.9, { collide: true });
    const key = b.box(0.08, 0.02, 0.05, colorMat(0xb0a070, 0.3, 0.8), 24.8, 0.56, z4 + 1.9);
    this.pickup({
      id: 'police_key',
      object: key,
      prompt: 'Take keys',
      onPick: () => {
        this.ctx.inventory.add('police_key');
        this.ctx.story.setObjective('Get into the police station.');
      },
    });
    b.chair(21, z4 - 1.6, 0.8);
    b.box(0.5, 0.6, 0.15, colorMat(0x2a3a4a, 0.9), 21, 0.46, z4 - 1.75, { rotY: 0.8, cast: false });
    const jacket = b.hitbox(0.6, 0.9, 0.5, 21, 0.3, z4 - 1.6);
    this.readable({
      id: 'room4',
      object: jacket,
      prompt: 'Examine jacket and notepad',
      note: { title: 'Room 4', text: 'My jacket is hanging on the chair. It fits perfectly.\nIn the pocket: a motel notepad. My handwriting:\n\n"It always ends at the cabin."\n\nThe page underneath has been torn out.' },
      clue: 'room4',
    });
    b.table(20.6, z4 + 1.8, 0.9, 0.6);
    // shadow in the office window (event)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 }));
    shadow.position.set(17.86, 1.45, -11.9);
    shadow.rotation.y = -Math.PI / 2;
    shadow.visible = false;
    shadow.userData.dynamic = true;
    b.add(shadow);
    this.addTrigger({
      id: 'motelshadow',
      box: { minX: 4, maxX: 16, minZ: -20, maxZ: -4 },
      onEnter: () => {
        shadow.visible = true;
        let t = 0;
        this.ctx.audio.playAt('step_wood', new THREE.Vector3(19, 0.5, -11), { volume: 0.6 });
        this.onUpdate((dt) => {
          if (!shadow.visible) return;
          t += dt;
          shadow.position.z = -11.9 + t * 1.4;
          if (t > 1.7) shadow.visible = false;
        });
      },
    });
    // motel sign
    const signPos = new THREE.Vector3(10, 0, -8);
    b.box(0.25, 5, 0.25, colorMat(0x444444, 0.5, 0.5), signPos.x, 0, signPos.z);
    const neon = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 3), colorMat(0x2a1a1a, 0.6));
    sign.position.set(signPos.x, 5.4, signPos.z);
    b.add(sign);
    const txt = b.textPlane(['MOTEL'], 2.8, 0.9, { fg: '#ff4040', size: 150 }, signPos.x - 0.11, 5.4, signPos.z, -Math.PI / 2, 0, false);
    const txt2 = b.textPlane(['MOTEL'], 2.8, 0.9, { fg: '#ff4040', size: 150 }, signPos.x + 0.11, 5.4, signPos.z, Math.PI / 2, 0, false);
    const vac = b.textPlane(['VACANCY'], 1.8, 0.4, { fg: '#40ff80', size: 110 }, signPos.x - 0.11, 4.5, signPos.z, -Math.PI / 2, 0, false);
    const glow = b.glow(signPos.x - 0.5, 5.4, signPos.z, 0xff3030, 4, 0.35);
    neon.dispose();
    this.onUpdate((_dt, t) => {
      const on = !(Math.sin(t * 13) > 0.8 && Math.sin(t * 0.9) > 0.5);
      txt.visible = txt2.visible = on;
      glow.visible = on;
      vac.visible = Math.sin(t * 0.5) > -0.6;
    });
  }

  // ------------------------------------------------------------------ police
  private buildPolice(): void {
    const b = this.b;
    const glass = Mats.windowDark();
    b.room({ x: 0, z: -50, w: 14, d: 10, h: 3.4, wallMat: texMat('concrete', 1, { color: 0xb8b0a0 }), innerMat: texMat('wallpaper', 1, { color: 0x9aa8a0 }), floorMat: texMat('tiles', 1, { color: 0xb0b0a8 }), roof: 'flat', s: [{ off: 0, w: 1.6 }, { off: -4, w: 2, bottom: 1, top: 2.4, glass }, { off: 4, w: 2, bottom: 1, top: 2.4, glass }] });
    b.door({
      id: 'police',
      x: 0,
      z: -45,
      axis: 'x',
      width: 1.6,
      locked: true,
      keyItem: 'police_key',
      keyName: 'the station key',
      lockedText: 'Locked. "ALDER FALLS POLICE DEPT. - CLOSED"',
      mat: colorMat(0x3a4a5a, 0.4, 0.4),
      sound: 'metal',
      onUnlock: () => this.ctx.story.setObjective('Search the police station.'),
    });
    this.addTrigger({
      id: 'policeLocked',
      x: 0,
      z: -43.5,
      r: 2,
      onEnter: () => {
        if (!this.ctx.inventory.has('police_key')) {
          this.ctx.story.setObjective('Find a key to the police station.');
        }
      },
    });
    b.textPlane(['POLICE'], 4, 0.8, { bg: '#1a2a4a', fg: '#e8e8e8', size: 120 }, 0, 3.0, -44.88, 0);
    // interior partition with a doorway
    b.wall(-7, -50, 7, -50, 3.4, texMat('wallpaper', 1, { color: 0x9aa8a0 }), [{ off: 3.5, w: 1.1 }], 0.15);
    b.counter(-3, -47.5, 4, 0.7, 0);
    for (let i = 0; i < 3; i++) b.chair(-5.8 + i * 0.6, -46.2, Math.PI, false);
    b.box(1.6, 1.1, 0.04, texMat('planks', 1, { color: 0xb08a5a }), -4, 1.2, -49.9, { cast: false });
    for (let i = 0; i < 4; i++) {
      const c = drawPhoto(i % 2 ? 'portrait' : 'mara', { seed: 40 + i, w: 120, h: 160 });
      b.canvasPlane(c, 0.25, -4.6 + i * 0.4, 1.3 + (i % 2) * 0.12, -49.86, 0);
    }
    // back office
    b.desk(3, -53.5, Math.PI);
    b.chair(3, -52.6, Math.PI);
    b.shelf(-3, -54.6, 3, 0, 2, 0.4, true, 51);
    b.box(0.5, 1.3, 0.6, colorMat(0x5a6068, 0.5, 0.5), 6.2, 0, -54.4, { collide: true });
    const report = b.paper(3.1, 0.79, -53.4, 0.2, true, 0.22, 0.3, 0xf4f2ea);
    this.readable({
      id: 'report',
      object: report,
      prompt: 'Read report',
      glint: true,
      note: {
        style: 'report',
        title: 'MISSING PERSON REPORT',
        image: drawPhoto('portrait', { seed: 9, w: 200, h: 240, mono: true }),
        imageWidth: 150,
        text: 'CASE #: 26-1047\nNAME: SAM REYES\nAGE: 29\nREPORTED: OCT 26 by D. Okafor (employer)\nLAST SEEN: Pines Motel, Room 4, Alder Falls\nVEHICLE: none\nNOTES: Journalist. Was reporting on the Vance disappearance. Asked locals about "the cabin" on Hollow Ridge Rd.\n\nSTATUS: MISSING',
      },
      clue: 'missing_report',
      onRead: () => this.ending(),
    });
    const pc = b.car({ x: 9, z: -42, rot: 0.2, color: 0x1a1a1a, type: 'police' });
    this.searchable({
      id: 'policecar',
      object: pc.body,
      prompt: 'Search police car',
      sound: 'car_door',
      onSearch: () => this.ctx.hud.message('Empty. The radio is dead. A coffee cup on the dash is still half full.', 4),
    });
    // flag pole
    b.cyl(0.05, 0.07, 7, colorMat(0x999999, 0.3, 0.8), -9, 0, -42.5, { collideR: 0.1 });
  }

  private async ending(): Promise<void> {
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.audio.stinger();
    ctx.player.cam.shake = 0.6;
    await ctx.dialogue.thought("That's me.", 2.5);
    await ctx.dialogue.thought("Reported missing four days ago. I don't... I don't remember any of it.", 4);
    ctx.phone.vibrate();
    await ctx.scheduler.wait(1.2);
    await ctx.dialogue.thought('I need to get out of this town.', 2.5);
    await ctx.transition.fadeOut(3);
    this.complete();
  }

  // ------------------------------------------------------------------ misc
  private buildStreetLights(): void {
    const zs = [60, 46, 32, 4, -10, -24, -38];
    zs.forEach((z, i) => {
      const side = i % 2 ? 1 : -1;
      const real = z === 46 || z === 4 || z === -24;
      const sl = this.b.streetLight(side * 6.6, z, side > 0 ? -Math.PI / 2 : Math.PI / 2, { light: real, intensity: 26, on: z !== 32 });
      if (z === -10) this.flicker.push({ set: sl.setOn, t: 0 });
      if (z === 60) {
        this.onUpdate((_dt, t) => sl.setOn(Math.sin(t * 5.1) > -0.9 || Math.random() > 0.5));
      }
    });
    this.onUpdate((dt) => {
      for (const f of this.flicker) {
        f.t -= dt;
        if (f.t <= 0) {
          f.t = Math.random() * 0.25;
          f.set(Math.random() > 0.35, 0.6 + Math.random() * 0.4);
        }
      }
    });
    // cross street light (dead)
    this.b.streetLight(-8, 20.6, Math.PI / 2, { on: false });
  }

  private buildParkedCars(): void {
    const b = this.b;
    b.car({ x: 12.5, z: -30, rot: Math.PI / 2, color: 0x6a1a1a, type: 'sedan' });
    b.car({ x: 12.5, z: -17, rot: -Math.PI / 2 + 0.05, color: 0x2a3a2a, type: 'hatch' });
    b.car({ x: -3, z: 26, rot: 0.08, color: 0x3a4a6a, type: 'sedan', doorOpen: true });
    b.car({ x: 10, z: 12.5, rot: Math.PI / 2 + 0.1, color: 0x8a8a80, type: 'pickup' });
    b.car({ x: -12, z: 48, rot: 0, color: 0x1a2a3a, type: 'sedan' });
  }

  private setupTriggers(): void {
    const { ctx } = this;
    this.addTrigger({
      id: 'unknown',
      box: { minX: -40, maxX: 40, minZ: -60, maxZ: 30 },
      enabled: () => !ctx.state.has('msg_unknown1'),
      onEnter: async () => {
        await ctx.scheduler.wait(2.5);
        ctx.story.deliver('unknown', 'msg_unknown1');
        ctx.clues.add('unknown_msg', true);
        await ctx.scheduler.wait(2);
        ctx.dialogue.thought('"Come back"? I have never been here.');
        if (!ctx.inventory.has('police_key')) ctx.story.setObjective('Find out what happened here. Try the police station at the end of the street.');
      },
    });
    this.addTrigger({
      id: 'h2light',
      box: { minX: -40, maxX: 40, minZ: -60, maxZ: 10 },
      onEnter: () => {
        this.h2Window!.emissiveIntensity = 1.2;
        ctx.audio.playAt('click', new THREE.Vector3(22, 1.5, 4), { volume: 1 });
        this.set('h2light');
      },
    });
    this.addTrigger({
      id: 'gasradio',
      box: { minX: -26, maxX: -18.2, minZ: 36.5, maxZ: 43.5 },
      enabled: () => !this.has('radioPlayed'),
      onEnter: () => {
        this.set('radioPlayed');
        if (!this.radio!.on) this.setRadio(true, new THREE.Vector3(-24.5, 1.1, 38.6), true);
      },
    });
    this.addTrigger({
      id: 'h1slam',
      box: { minX: -25.8, maxX: -21, minZ: 0.2, maxZ: 7.8 },
      onEnter: async () => {
        await ctx.scheduler.wait(0.6);
        this.h1Door?.slam();
        ctx.player.cam.shake = 0.3;
        await ctx.scheduler.wait(1);
        ctx.dialogue.thought('...the wind. Just the wind.');
      },
    });
    if (this.has('h2light')) this.h2Window!.emissiveIntensity = 1.2;
  }

  private setupEvents(): void {
    const { ctx } = this;
    this.events = [
      async () => {
        for (let i = 0; i < 5; i++) {
          ctx.audio.playAt('step_concrete', this.around(8, true), { volume: 0.9 });
          await ctx.scheduler.wait(0.5);
        }
      },
      () => ctx.audio.playAt('door_slam', this.around(30), { volume: 0.8, refDist: 6 }),
      () => ctx.audio.playAt('howl', this.around(70), { volume: 0.5, refDist: 20 }),
      () => ctx.audio.playAt('thud', this.around(15), { volume: 0.8 }),
      () => {
        ctx.phone.vibrate();
        ctx.scheduler.wait(1.5).then(() => ctx.dialogue.thought('My phone buzzed. Nothing on the screen.'));
      },
      () => ctx.audio.playAt('glass', this.around(25), { volume: 0.5 }),
    ];
    this.eventTimer = 50;
  }

  onStart(fromSave: boolean): void {
    const { ctx } = this;
    if (fromSave) return;
    ctx.story.setObjective('Find help in town.');
    ctx.scheduler.wait(1.5).then(() => ctx.dialogue.thought('Hello? ...Is anyone here?', 3));
  }
}

function conc(): THREE.Material {
  return texMat('concrete', 1, { color: 0x9a9a94 });
}

function missingPoster(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 400;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efe9da';
  g.fillRect(0, 0, 300, 400);
  g.fillStyle = '#b01818';
  g.font = 'bold 56px Arial';
  g.textAlign = 'center';
  g.fillText('MISSING', 150, 62);
  g.drawImage(drawPhoto('mara', { seed: 3, w: 200, h: 170 }), 50, 80, 200, 170);
  g.fillStyle = '#222';
  g.font = 'bold 26px Arial';
  g.fillText('MARA VANCE, 27', 150, 290);
  g.font = '17px Arial';
  g.fillText('Last seen OCTOBER 17', 150, 322);
  g.fillText('Hollow Pines trail', 150, 346);
  g.font = '13px Arial';
  g.fillText('Alder Falls P.D.', 150, 380);
  return c;
}
