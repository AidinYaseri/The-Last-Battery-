import * as THREE from 'three';
import type { Builder, Door } from '../world/Builder';
import { colorMat, texMat, Mats } from '../world/Materials';
import { drawPhoto, type PhotoKind } from '../world/PhotoArt';
import { rng } from '../world/Textures';
import { paintTexture } from './util';

export const BASEMENT = { x: 0, z: -200 };

export interface CabinRefs {
  frontDoor: Door;
  officeDoor: Door;
  bathDoor: Door;
  shedDoor: Door;
  setPower: (on: boolean) => void;
  photoWall: THREE.Mesh;
  calendar: THREE.Mesh;
  mirrorPos: THREE.Vector3;
  drawerHit: THREE.Mesh;
  sticky: THREE.Mesh;
  corkboard: THREE.Mesh;
  charger: THREE.Mesh;
  cellar: THREE.Mesh;
  generator: THREE.Mesh;
  genPos: THREE.Vector3;
  carBody: THREE.Mesh;
  trunkHit: THREE.Mesh;
  shedFuse: THREE.Mesh;
  bedPhoto: THREE.Mesh;
  basement: {
    monitors: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; kind: number }[];
    tv: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture };
    tvHit: THREE.Mesh;
    monitorHit: THREE.Mesh;
    stairsHit: THREE.Mesh;
    array: THREE.Group;
    arrayHit: THREE.Mesh;
    leds: THREE.Sprite[];
    light: THREE.PointLight;
    boxesHit: THREE.Mesh;
  };
}

/** Builds the cabin, its surroundings and the basement. Shared by levels 4 and 5. */
export function buildCabin(b: Builder, o: { truth?: boolean } = {}): CabinRefs {
  const outer = texMat('planks', 1, { color: o.truth ? 0x5a3a30 : 0x6a5040 });
  const inner = texMat('planks', 1, { color: 0x9a8068 });
  const glass = Mats.glass();
  // ---------------------------------------------------------------- shell
  b.room({
    x: 0,
    z: 0,
    w: 14,
    d: 11,
    h: 2.9,
    wallMat: outer,
    innerMat: inner,
    floorMat: texMat('planks', 1, { color: 0x7a6048 }),
    ceilMat: texMat('planks', 1, { color: 0x5a4838 }),
    roof: 'gable',
    roofMat: texMat('roof', 1, { color: 0x6a6460 }),
    s: [
      { off: -3, w: 1.0 },
      { off: -5.5, w: 1.2, bottom: 0.9, top: 2.0, glass },
      { off: 4, w: 1.4, bottom: 0.9, top: 2.0, glass },
    ],
    n: [
      { off: -4.5, w: 1.2, bottom: 1.0, top: 2.0, glass },
      { off: 4.5, w: 1.2, bottom: 1.0, top: 2.0, glass },
    ],
    e: [{ off: 2.5, w: 1.2, bottom: 0.9, top: 2.0, glass }],
  });
  const part = texMat('planks', 1, { color: 0x8a7058 });
  b.wall(-7, 0, 7, 0, 2.9, part, [{ off: -4.5, w: 1.0 }, { off: -0.2, w: 0.9 }, { off: 4.5, w: 1.0 }], 0.12);
  b.wall(-2, -5.5, -2, 0, 2.9, part, [], 0.12);
  b.wall(1.5, -5.5, 1.5, 0, 2.9, part, [], 0.12);
  b.wall(1, 0, 1, 5.5, 2.9, part, [{ off: -0.55, w: 1.4 }], 0.12);

  const frontDoor = b.door({ id: 'cabin_front', x: -3, z: 5.5, axis: 'x', width: 1.0, swing: -1, mat: texMat('planks', 1, { color: 0x4a3020 }) });
  const bathDoor = b.door({ id: 'cabin_bath', x: -0.2, z: 0, axis: 'x', width: 0.9, swing: 1 });
  const officeDoor = b.door({ id: 'cabin_office', x: 4.5, z: 0, axis: 'x', width: 1.0, swing: 1 });

  // porch
  b.box(14, 0.18, 2.6, texMat('planks', 1, { color: 0x6a5444 }), 0, 0, 6.8, { uvScale: 2 });
  for (const x of [-6.8, -1.2, 3, 6.8]) b.box(0.18, 2.6, 0.18, texMat('bark', 1), x, 0.18, 8, { collide: true });
  b.box(14.4, 0.12, 3, texMat('roof', 1), 0, 2.75, 6.9, { rotY: 0 });
  b.chair(-5.2, 6.8, Math.PI * 0.9);
  // chimney
  b.box(1.2, 7, 1.2, texMat('rock', 1, { color: 0x7a7470 }), -2.2, 0, -0.1, { collide: true, uvScale: 1.5 });

  // ---------------------------------------------------------------- living room
  const r = rng(o.truth ? 404 : 44);
  const wallCanvas = photoCollage(o.truth ? 1 : 0);
  const photoWall = b.canvasPlane(wallCanvas, 4.6, -6.86, 1.55, 2.75, Math.PI / 2);
  b.sofa(-3.6, 4.4, Math.PI);
  b.table(-3.6, 2.8, 1.2, 0.6, 0, 0.45);
  b.box(2.6, 0.01, 2, colorMat(0x5a2a22, 1), -3.6, 0.03, 3, { cast: false });
  b.box(0.9, 0.9, 0.25, colorMat(0x1a1a1a, 0.6), -1.2, 0.15, 4.9, { collide: true });
  b.box(0.2, 0.16, 0.08, colorMat(0xc8a060, 0.4), -3.5, 0.47, 2.7);
  // fireplace
  b.box(1.4, 1.1, 0.5, texMat('rock', 1, { color: 0x6a6460 }), -2.2, 0, 0.55, { collide: true });
  b.box(0.8, 0.6, 0.05, colorMat(0x050505, 1), -2.2, 0.15, 0.81, { cast: false });

  // ---------------------------------------------------------------- kitchen
  b.counter(6.55, 2, 0.7, 1.0, 0, 0.92, texMat('planks', 1, { color: 0x6a5040 }));
  b.sink(6.55, 1.0, -Math.PI / 2);
  b.stove(6.55, 3.1, -Math.PI / 2);
  b.fridge(6.5, 4.8, -Math.PI / 2);
  b.table(3.6, 3.2, 1.3, 0.8, 0);
  b.chair(3.0, 3.8, Math.PI);
  b.chair(4.3, 2.4, 0.3, o.truth);
  const cal = document.createElement('canvas');
  cal.width = 256;
  cal.height = 320;
  drawCalendar(cal, o.truth);
  const calendar = b.canvasPlane(cal, 0.45, 3, 1.5, 0.08, 0);
  const charger = b.box(0.08, 0.12, 0.03, colorMat(0xeeeeee, 0.4), 6.95, 1.15, 0.6, { rotY: Math.PI / 2 });

  // ---------------------------------------------------------------- bedroom
  b.bed(-5.2, -3.3, 0, true);
  b.box(0.45, 0.55, 0.4, texMat('planks', 1), -6.5, 0, -4.9, { collide: true });
  b.box(1.1, 2, 0.55, texMat('planks', 1, { color: 0x5a4030 }), -2.7, 0, -4.9, { collide: true });
  const bedPhoto = b.canvasPlane(drawPhoto('portrait_sleep', { date: o.truth ? "OCT 30 '26 00:31" : "OCT 30 '26 00:14", seed: 71 }), 0.3, -4.9, 0.64, -3.7, 0.3, -Math.PI / 2 + 0.05);

  // ---------------------------------------------------------------- bathroom
  b.bathtub(-0.2, -4.6, Math.PI / 2);
  b.sink(1.05, -1.6, -Math.PI / 2);
  b.toilet(-1.5, -1.4, Math.PI / 2);
  const mirror = b.box(0.03, 0.6, 0.5, colorMat(0x9aa4aa, 0.05, 0.9), 1.42, 1.25, -1.6, { cast: false });
  mirror.castShadow = false;
  const mirrorText = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.34), new THREE.MeshBasicMaterial({ map: paintTexture(["YOU'VE BEEN", 'HERE 4 TIMES'], '#e8eef0', 512, 320), transparent: true }));
  mirrorText.position.set(1.4, 1.55, -1.6);
  mirrorText.rotation.y = -Math.PI / 2;
  b.add(mirrorText);
  b.photoOnly(mirrorText);

  // ---------------------------------------------------------------- office
  b.desk(4.3, -4.7, 0, 1.6);
  b.chair(4.2, -3.8, Math.PI);
  b.shelf(1.75, -2.8, 2, Math.PI / 2, 2, 0.35, true, 81);
  const crt = document.createElement('canvas');
  crt.width = 160;
  crt.height = 120;
  const cg = crt.getContext('2d')!;
  cg.fillStyle = '#021';
  cg.fillRect(0, 0, 160, 120);
  cg.fillStyle = '#3f8';
  cg.font = '12px monospace';
  cg.fillText('HALVORSEN SYS 2.1', 8, 20);
  cg.fillText('SUBJECT: S.R.', 8, 40);
  cg.fillText('CYCLE: 5', 8, 56);
  cg.fillText('STATUS: RESET PENDING', 8, 72);
  cg.fillText('>_', 8, 100);
  b.monitor(3.8, 0.78, -4.9, 0, crt, 0.42);
  const sticky = b.paper(4.9, 0.79, -4.5, -0.3, true, 0.09, 0.09, 0xf8e860);
  const corkCanvas = corkboard();
  const corkboard_ = b.canvasPlane(corkCanvas, 1.6, 6.86, 1.5, -2.8, -Math.PI / 2);
  const drawerHit = b.hitbox(0.5, 0.7, 0.3, 4.95, 0.05, -4.35);

  // ---------------------------------------------------------------- exterior
  // cellar doors
  const cellar = b.box(1.8, 0.12, 1.6, texMat('planks', 1, { color: 0x4a3a2a }), -4.5, 0.25, -6.5, { rotY: 0, collide: true });
  cellar.rotation.x = -0.3;
  b.box(2.1, 0.5, 1.9, texMat('concrete', 1, { color: 0x7a7a74 }), -4.5, -0.3, -6.5, {});
  // generator
  const generator = b.box(1.3, 0.9, 0.8, colorMat(0x8a6a1a, 0.6, 0.3), 9.6, 0, -2.5, { collide: true });
  b.box(1.1, 0.25, 0.6, colorMat(0x2a2a2a, 0.6, 0.5), 9.6, 0.9, -2.5);
  b.cyl(0.03, 0.03, 3.5, colorMat(0x111111), 8.2, 0.05, -2.5, { rotY: 0 }).rotation.z = Math.PI / 2;
  // shed
  b.room({ x: -14, z: 5, w: 4, d: 4, h: 2.4, wallMat: texMat('planks', 1, { color: 0x5a4838 }), floorMat: texMat('planks', 1), roof: 'flat', e: [{ off: 0, w: 1.0 }] });
  const shedDoor = b.door({ id: 'shed', x: -12, z: 5, axis: 'z', width: 1.0, swing: -1 });
  b.shelf(-15.6, 5, 2.5, Math.PI / 2, 1.8, 0.4, true, 91);
  b.table(-14, 3.6, 1.6, 0.6, 0);
  const shedFuse = b.box(0.35, 0.18, 0.2, colorMat(0xa02020, 0.5, 0.3), -14.2, 0.78, 3.6);
  // Sam's car
  const car = b.car({ x: 6, z: 15, rot: 0.25, color: 0x3a4a5a, type: 'sedan' });
  const trunkHit = b.hitbox(1.6, 1.1, 0.8, 6 + Math.sin(0.25) * 2.3, 0.2, 15 + Math.cos(0.25) * 2.3, 0.25);
  // wood pile, axe stump
  for (let i = 0; i < 6; i++) b.log(9.5, 4 + i * 0.35, 1.2, Math.PI / 2, 0.15 + (i % 2) * 0.3, 0.14);
  b.cyl(0.35, 0.4, 0.5, texMat('bark', 1), 11, 1, 0, { collideR: 0.4 });

  // ---------------------------------------------------------------- lights (start off)
  const lights: { light: THREE.PointLight; bulb: THREE.MeshBasicMaterial; base: number }[] = [];
  const addLight = (x: number, y: number, z: number, intensity: number, color = 0xffc27a) => {
    const light = new THREE.PointLight(color, 0, 9, 1.5);
    light.position.set(x, y, z);
    b.add(light);
    const bulb = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const bm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulb);
    bm.position.set(x, y + 0.2, z);
    bm.userData.dynamic = true;
    b.add(bm);
    lights.push({ light, bulb, base: intensity });
  };
  addLight(-3.4, 2.5, 2.8, 7);
  addLight(4, 2.5, 2.8, 6);
  addLight(4.3, 2.5, -2.6, 6);
  addLight(-3, 2.5, 7, 5);

  // ---------------------------------------------------------------- basement
  const B = BASEMENT;
  b.room({ x: B.x, z: B.z, w: 12, d: 10, h: 2.7, wallMat: texMat('concrete', 1, { color: 0x6a6a64 }), innerMat: texMat('concrete', 1, { color: 0x7a7a72 }), floorMat: texMat('concrete', 1, { color: 0x5a5a56 }), ceilMat: texMat('planks', 1, { color: 0x3a3028 }), roof: 'flat' });
  // stairs (south side) rising toward the cellar hatch
  for (let i = 0; i < 6; i++) b.box(1.4, 0.4 * (i + 1), 0.32, texMat('planks', 1, { color: 0x5a4838 }), B.x - 4.5, 0, B.z + 3.0 + i * 0.32, {});
  b.ctx.collision.addBox(B.x - 4.5, B.z + 4.0, 1.4, 1.9);
  const stairsHit = b.hitbox(1.4, 1.6, 1.8, B.x - 4.5, 0, B.z + 3.9);
  // monitor desk (north wall)
  b.table(B.x, B.z - 4.2, 5, 0.9, 0, 0.8, colorMat(0x3a3a3a, 0.6, 0.3));
  const monitors: CabinRefs['basement']['monitors'] = [];
  for (let i = 0; i < 4; i++) {
    const c = drawPhoto('cctv', { cam: `CAM 0${i + 1}`, figureX: 0.3 + i * 0.1, w: 200, h: 150 });
    const m = b.monitor(B.x - 1.8 + i * 1.2, i % 2 ? 1.5 : 0.82, B.z - 4.2, 0, c, 0.62);
    monitors.push({ canvas: c, texture: m.texture, kind: i });
  }
  b.box(0.8, 0.35, 0.6, colorMat(0x2a2a2a, 0.5), B.x - 0.6, 0.82, B.z - 4.3);
  const monitorHit = b.hitbox(5, 1.6, 0.6, B.x, 0.8, B.z - 4.4);
  // TV + VCR on a cart (west)
  b.table(B.x - 4.6, B.z - 0.8, 1, 0.7, Math.PI / 2, 0.7, colorMat(0x3a3a3a, 0.6, 0.3));
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 256;
  tvCanvas.height = 192;
  const tg = tvCanvas.getContext('2d')!;
  tg.fillStyle = '#05070a';
  tg.fillRect(0, 0, 256, 192);
  tg.fillStyle = '#3a6a8a';
  tg.font = 'bold 20px monospace';
  tg.fillText('INSERT TAPE', 60, 100);
  const tv = b.monitor(B.x - 4.6, 0.72, B.z - 0.8, Math.PI / 2, tvCanvas, 0.7);
  const tvHit = b.hitbox(0.9, 1.2, 1.2, B.x - 4.5, 0.6, B.z - 0.8);
  b.box(0.45, 0.1, 0.35, colorMat(0x1a1a1a, 0.4), B.x - 4.5, 0.72, B.z - 0.1);
  b.chair(B.x - 3.4, B.z - 0.8, -Math.PI / 2);
  // storage boxes, belongings
  for (let i = 0; i < 7; i++) b.cardboard(B.x + 3.5 + (i % 3) * 0.6, B.z + 3.8 - Math.floor(i / 3) * 0.55, 0.55, 0.4 + (i % 2) * 0.1, 0.5, (i > 2 ? 0.45 : 0) * (i % 2), (i % 3) * 0.2, true);
  const boxesHit = b.hitbox(2, 1.2, 1.6, B.x + 4.1, 0, B.z + 3.4);
  b.backpack(B.x + 1.5, B.z + 4.2, 0.3, 0);
  b.box(0.6, 0.8, 0.1, colorMat(0xa02a22, 0.9), B.x + 2.3, 0.5, B.z + 4.8, { cast: false });
  // cameras on tripods
  for (const [x, z, rot] of [
    [B.x - 2.5, B.z + 2.5, Math.PI * 0.8],
    [B.x + 2.5, B.z + 1.5, -Math.PI * 0.7],
  ]) {
    for (let k = 0; k < 3; k++) {
      const leg = b.cyl(0.015, 0.015, 1.4, colorMat(0x222222), x + Math.cos(k * 2.1) * 0.25, 0, z + Math.sin(k * 2.1) * 0.25);
      leg.rotation.set(Math.sin(k * 2.1) * 0.2, 0, -Math.cos(k * 2.1) * 0.2);
    }
    b.box(0.25, 0.18, 0.35, colorMat(0x1a1a1a, 0.4), x, 1.35, z, { rotY: rot });
  }
  // pinned photographs (west wall)
  b.canvasPlane(photoCollage(2), 3.4, B.x - 5.86, 1.5, B.z + 1.8, Math.PI / 2);
  // the machine ("the Array")
  const array = new THREE.Group();
  const leds: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.7), colorMat(0x2a2c30, 0.4, 0.6));
    rack.position.set(0, 1.1, i * 0.85);
    rack.castShadow = true;
    array.add(rack);
    for (let k = 0; k < 6; k++) {
      const led = b.glow(0, 0, 0, k % 3 === 0 ? 0xff3030 : 0x30ff60, 0.12, 0.9);
      led.parent?.remove(led);
      led.position.set(-0.41, 0.4 + k * 0.3, i * 0.85 + (k % 2 ? 0.15 : -0.15));
      array.add(led);
      leds.push(led);
    }
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), colorMat(0x888888, 0.3, 0.7));
    reel.rotation.z = Math.PI / 2;
    reel.position.set(-0.42, 1.8, i * 0.85);
    array.add(reel);
  }
  array.position.set(B.x + 5.3, 0, B.z - 3.4);
  array.userData.dynamic = true;
  b.add(array);
  b.ctx.collision.addBox(B.x + 5.3, B.z - 2.55, 0.9, 2.6);
  const arrayHit = b.hitbox(1, 2.2, 2.6, B.x + 5.3, 0, B.z - 2.55);
  // cables
  for (let i = 0; i < 5; i++) b.box(0.04, 0.04, 3 + i * 0.3, colorMat(0x111111, 0.8), B.x + 4.5 - i * 0.15, 0.02, B.z - 1.5 + i * 0.2, { rotY: 0.3 + i * 0.1, cast: false });
  const light = new THREE.PointLight(0xffc890, 0, 12, 1.4);
  light.position.set(B.x, 2.35, B.z);
  b.add(light);
  b.glow(B.x, 2.5, B.z, 0xffc890, 0.8, 0.8);
  // keep basement enclosed; collision ring around it
  b.ctx.collision.addBox(B.x, B.z - 6, 14, 2);
  b.ctx.collision.addBox(B.x, B.z + 6, 14, 2);
  b.ctx.collision.addBox(B.x - 7, B.z, 2, 14);
  b.ctx.collision.addBox(B.x + 7, B.z, 2, 14);

  void r;
  const setPower = (on: boolean) => {
    lights.forEach((l) => {
      l.light.intensity = on ? l.base : 0;
      l.bulb.color.setHex(on ? 0xfff0d0 : 0x222222);
    });
  };

  return {
    frontDoor,
    officeDoor,
    bathDoor,
    shedDoor,
    setPower,
    photoWall,
    calendar,
    mirrorPos: new THREE.Vector3(1.4, 1.5, -1.6),
    drawerHit,
    sticky,
    corkboard: corkboard_,
    charger,
    cellar,
    generator,
    genPos: new THREE.Vector3(9.6, 0.8, -2.5),
    carBody: car.body,
    trunkHit,
    shedFuse,
    bedPhoto,
    basement: { monitors, tv: { canvas: tvCanvas, texture: tv.texture }, tvHit, monitorHit, stairsHit, array, arrayHit, leds, light, boxesHit },
  };
}

/** A wall of pinned photographs, joined by red string. */
export function photoCollage(variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 450;
  const g = c.getContext('2d')!;
  g.fillStyle = variant === 2 ? '#5a5a54' : '#6a5440';
  g.fillRect(0, 0, 1024, 450);
  const r = rng(300 + variant);
  const kinds: PhotoKind[] = ['campsite', 'campsite_figure', 'town', 'motel', 'highway', 'tunnel', 'cabin_ext', 'cabin_int', 'portrait', 'police', 'portrait_sleep'];
  const pts: [number, number][] = [];
  const dates = ['OCT 22', 'OCT 23', 'OCT 25', 'OCT 26', 'OCT 28', 'OCT 30'];
  for (let i = 0; i < 26; i++) {
    const x = 20 + (i % 9) * 110 + r() * 20;
    const y = 18 + Math.floor(i / 9) * 145 + r() * 20;
    const kind = variant === 1 ? 'portrait' : kinds[Math.floor(r() * kinds.length)];
    const p = drawPhoto(kind, { seed: i * 13 + variant, w: 96, h: 72, date: dates[Math.floor(r() * dates.length)] + (i % 5 === 0 ? ' 00:0' + (i % 9) : '') });
    g.save();
    g.translate(x + 48, y + 55);
    g.rotate((r() - 0.5) * 0.25);
    g.fillStyle = '#e8e2d0';
    g.fillRect(-52, -46, 104, 104);
    g.drawImage(p, -48, -42);
    g.fillStyle = '#1b2a6b';
    g.font = 'italic 11px cursive';
    g.textAlign = 'center';
    g.fillText(variant === 1 ? 'me' : ['me?', 'again', 'day 3', 'why', 'me', '???'][Math.floor(r() * 6)], 0, 50);
    g.restore();
    g.fillStyle = '#b01818';
    g.beginPath();
    g.arc(x + 48, y + 12, 5, 0, Math.PI * 2);
    g.fill();
    pts.push([x + 48, y + 12]);
  }
  g.strokeStyle = 'rgba(180,20,20,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = pts[Math.floor(r() * pts.length)];
    const bb = pts[Math.floor(r() * pts.length)];
    g.moveTo(a[0], a[1]);
    g.lineTo(bb[0], bb[1]);
  }
  g.stroke();
  return c;
}

function drawCalendar(c: HTMLCanvasElement, truth?: boolean): void {
  const g = c.getContext('2d')!;
  g.fillStyle = '#f0ebe0';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#2a5a3a';
  g.fillRect(0, 0, 256, 90);
  g.fillStyle = '#fff';
  g.font = 'bold 30px Arial';
  g.textAlign = 'center';
  g.fillText('OCTOBER', 128, 55);
  g.fillStyle = '#222';
  g.font = '15px Arial';
  let day = 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < 4) continue;
      if (day > 31) break;
      const x = 20 + col * 36;
      const y = 120 + row * 40;
      g.fillStyle = '#222';
      g.fillText(String(day), x, y);
      if (day === 17) {
        g.strokeStyle = '#c01818';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y - 5, 15, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#c01818';
        g.font = 'italic bold 12px cursive';
        g.fillText('M.', x, y + 16);
        g.font = '15px Arial';
      }
      if (truth && [21, 25, 28, 30].includes(day)) {
        g.strokeStyle = '#1b2a6b';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 12, y - 14);
        g.lineTo(x + 12, y + 4);
        g.moveTo(x + 12, y - 14);
        g.lineTo(x - 12, y + 4);
        g.stroke();
      }
      day++;
    }
  }
  g.fillStyle = '#c01818';
  g.font = 'italic bold 16px cursive';
  g.fillText('THE DAY IT STARTED', 128, 312);
}

function corkboard(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a7040';
  g.fillRect(0, 0, 512, 320);
  const r = rng(12);
  for (let i = 0; i < 2000; i++) {
    g.fillStyle = `rgba(60,40,20,${r() * 0.3})`;
    g.fillRect(r() * 512, r() * 320, 2, 2);
  }
  const clip = (x: number, y: number, w: number, h: number, title: string, lines: string[]) => {
    g.fillStyle = '#e8e4d8';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#222';
    g.font = 'bold 14px Georgia';
    g.fillText(title, x + 8, y + 20);
    g.font = '10px Georgia';
    lines.forEach((l, i) => g.fillText(l, x + 8, y + 38 + i * 13));
  };
  clip(20, 20, 200, 120, 'HIKER STILL MISSING', ['Search for Mara Vance', 'enters second week.', 'Police have no leads.', 'OCT 24']);
  clip(240, 30, 240, 100, 'HALVORSEN LAB CLOSED', ['"Memory research" cabin', 'shut down after complaints', 'from volunteers. 1997.']);
  g.drawImage(drawPhoto('mara_sam', { seed: 8, w: 160, h: 120 }), 60, 170);
  clip(260, 160, 220, 130, 'LOCAL VANISHINGS', ['Alder Falls residents report', '"lost days". Town council', 'dismisses claims as rumor.', '1998']);
  g.fillStyle = '#b01818';
  for (const [x, y] of [
    [120, 22],
    [360, 32],
    [140, 172],
    [370, 162],
  ]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
