import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BaseLevel } from '../levels/BaseLevel';
import { colorMat, basicMat, texMat, Mats, addWind } from './Materials';
import { rng, textTexture, type TextTexOptions, tex } from './Textures';
import type { BoxCollider } from './Colliders';

export interface BoxOpts {
  rotY?: number;
  collide?: boolean;
  cast?: boolean;
  receive?: boolean;
  occlude?: boolean;
  parent?: THREE.Object3D;
  uvScale?: number;
}

export interface Opening {
  /** offset of opening centre from wall centre along the wall */
  off: number;
  w: number;
  bottom?: number;
  top?: number;
  glass?: THREE.Material | null;
}

export interface RoomOpts {
  x: number;
  z: number;
  w: number;
  d: number;
  h?: number;
  wallMat?: THREE.Material;
  innerMat?: THREE.Material;
  floorMat?: THREE.Material | null;
  ceilMat?: THREE.Material | null;
  roof?: 'flat' | 'gable' | 'none';
  roofMat?: THREE.Material;
  n?: Opening[];
  s?: Opening[];
  e?: Opening[];
  w_?: Opening[];
  t?: number;
}

export const PHOTO_LAYER = 2;
const SHELF_PALETTE = [0x8a3a2a, 0x2a5a8a, 0xc8a040, 0x3a7a3a, 0xd8d0c0, 0x6a3a7a, 0xb85a20, 0x2a2a2a];

export interface DoorOpts {
  id: string;
  x: number;
  z: number;
  /** 'x' = panel spans along X (wall runs along X) */
  axis: 'x' | 'z';
  width?: number;
  height?: number;
  mat?: THREE.Material;
  /** which way it swings: 1 or -1 */
  swing?: number;
  label?: string;
  locked?: boolean;
  keyItem?: string;
  keyName?: string;
  code?: string;
  codeTitle?: string;
  lockedText?: string;
  /** Extra gate: return a message to block opening, or null to allow. */
  gate?: () => string | null;
  onOpen?: () => void;
  onUnlock?: () => void;
  startOpen?: boolean;
  sound?: 'wood' | 'metal' | 'glass';
}

export class Door {
  pivot = new THREE.Group();
  panel: THREE.Mesh;
  isOpen = false;
  collider: BoxCollider;
  private anim = 0;
  private target = 0;

  constructor(private b: Builder, public o: DoorOpts) {
    const w = o.width ?? 1.0;
    const h = o.height ?? 2.1;
    const mat = o.mat ?? texMat('planks', 1, { color: 0x8a7a68 });
    const geo = new THREE.BoxGeometry(w - 0.04, h - 0.02, 0.06);
    geo.translate(w / 2, h / 2, 0);
    this.panel = new THREE.Mesh(geo, mat);
    this.panel.castShadow = true;
    this.panel.receiveShadow = true;
    const k1 = new THREE.SphereGeometry(0.04, 8, 6);
    k1.translate(w - 0.12, 1.0, 0.06);
    const k2 = new THREE.SphereGeometry(0.04, 8, 6);
    k2.translate(w - 0.12, 1.0, -0.06);
    const knob = new THREE.Mesh(mergeGeometries([k1, k2])!, colorMat(0xb0a070, 0.3, 0.8));
    this.panel.add(knob);
    this.pivot.add(this.panel);
    if (o.axis === 'x') {
      this.pivot.position.set(o.x - w / 2, 0, o.z);
    } else {
      this.pivot.position.set(o.x, 0, o.z + w / 2);
      this.pivot.rotation.y = Math.PI / 2;
    }
    this.baseRot = this.pivot.rotation.y;
    this.pivot.userData.dynamic = true;
    b.root.add(this.pivot);
    b.level.occluders.push(this.panel);
    this.collider =
      o.axis === 'x' ? b.ctx.collision.addBox(o.x, o.z, w, 0.14) : b.ctx.collision.addBox(o.x, o.z, 0.14, w);

    const st = b.ctx.state;
    if (st.has(`door:${o.id}:open`) || o.startOpen) this.setOpen(true, true);

    b.level.addInteractable({
      id: `door:${o.id}`,
      object: this.panel,
      prompt: () => {
        if (this.isOpen) return `Close ${o.label ?? 'door'}`;
        if (this.isLocked()) {
          if (o.keyItem && b.ctx.inventory.has(o.keyItem)) return `Unlock with ${o.keyName ?? 'key'}`;
          if (o.code) return `Enter code`;
          return `${o.label ? o.label[0].toUpperCase() + o.label.slice(1) : 'Door'} (locked)`;
        }
        return `Open ${o.label ?? 'door'}`;
      },
      onInteract: () => this.interact(),
    });
    b.level.onUpdate((dt) => this.update(dt));
  }

  private baseRot = 0;

  isLocked(): boolean {
    return !!this.o.locked && !this.b.ctx.state.has(`door:${this.o.id}:unlocked`);
  }

  unlock(): void {
    this.b.ctx.state.setFlag(`door:${this.o.id}:unlocked`);
    this.b.ctx.audio.playAt('unlock', this.worldPos());
    this.o.onUnlock?.();
  }

  worldPos(): THREE.Vector3 {
    return new THREE.Vector3(this.o.x, 1.1, this.o.z);
  }

  interact(): void {
    const ctx = this.b.ctx;
    if (this.isOpen) {
      this.setOpen(false);
      return;
    }
    if (this.isLocked()) {
      if (this.o.keyItem && ctx.inventory.has(this.o.keyItem)) {
        this.unlock();
        ctx.hud.message(`Unlocked with ${this.o.keyName ?? 'the key'}.`);
        return;
      }
      if (this.o.code) {
        ctx.modal.keypad({
          title: this.o.codeTitle ?? 'KEYPAD',
          length: this.o.code.length,
          check: (code) => code === this.o.code,
          onSuccess: () => {
            this.unlock();
            this.setOpen(true);
          },
        });
        return;
      }
      ctx.audio.playAt('locked', this.worldPos());
      ctx.hud.message(this.o.lockedText ?? "It's locked.");
      return;
    }
    const gate = this.o.gate?.();
    if (gate) {
      ctx.audio.playAt('locked', this.worldPos());
      ctx.hud.message(gate);
      return;
    }
    this.setOpen(true);
  }

  setOpen(open: boolean, instant = false): void {
    if (open === this.isOpen && !instant) return;
    this.isOpen = open;
    this.target = open ? 1 : 0;
    this.collider.enabled = !open;
    const ctx = this.b.ctx;
    if (open) ctx.state.setFlag(`door:${this.o.id}:open`, true);
    else ctx.state.setFlag(`door:${this.o.id}:open`, false);
    if (instant) {
      this.anim = this.target;
      this.apply();
      return;
    }
    const snd = this.o.sound === 'metal' ? (open ? 'metal_door' : 'door_close') : open ? 'door_open' : 'door_close';
    ctx.audio.playAt(snd, this.worldPos());
    if (open) this.o.onOpen?.();
  }

  /** Slams the door shut (for scripted scares). */
  slam(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.target = 0;
    this.collider.enabled = true;
    this.b.ctx.state.setFlag(`door:${this.o.id}:open`, false);
    this.b.ctx.audio.playAt('door_slam', this.worldPos(), { volume: 1.2 });
    this.anim = 0.05;
  }

  private apply(): void {
    const s = this.o.swing ?? 1;
    this.pivot.rotation.y = this.baseRot + s * this.anim * (Math.PI / 2) * 0.95;
  }

  update(dt: number): void {
    if (Math.abs(this.anim - this.target) > 0.001) {
      const speed = 2.4;
      this.anim += Math.sign(this.target - this.anim) * Math.min(Math.abs(this.target - this.anim), dt * speed);
      this.apply();
    }
  }
}

/** Box geometry with UVs scaled to world size so textures tile evenly. */
export function worldBox(w: number, h: number, d: number, scale = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export class Builder {
  constructor(public level: BaseLevel) {}

  get ctx() {
    return this.level.ctx;
  }

  get root() {
    return this.level.group;
  }

  get quality() {
    return this.ctx.sceneManager.profile;
  }

  add<T extends THREE.Object3D>(o: T, parent?: THREE.Object3D): T {
    (parent ?? this.root).add(o);
    return o;
  }

  /** Box with its BASE at y. */
  box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, o: BoxOpts = {}): THREE.Mesh {
    const geo = o.uvScale ? worldBox(w, h, d, o.uvScale) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = o.rotY ?? 0;
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    this.add(m, o.parent);
    if (o.collide) this.ctx.collision.addBox(x, z, w, d, o.rotY ?? 0);
    if (o.occlude ?? o.collide) this.level.occluders.push(m);
    return m;
  }

  cyl(rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, o: BoxOpts & { seg?: number; collideR?: number } = {}): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 10), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = o.rotY ?? 0;
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    this.add(m, o.parent);
    if (o.collideR) this.ctx.collision.addCircle(x, z, o.collideR);
    if (o.occlude) this.level.occluders.push(m);
    return m;
  }

  plane(w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, rotY = 0, rotX = 0, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.order = 'YXZ';
    m.rotation.y = rotY;
    m.rotation.x = rotX;
    m.receiveShadow = true;
    this.add(m, parent);
    return m;
  }

  textPlane(lines: string[], w: number, h: number, t: TextTexOptions, x: number, y: number, z: number, rotY = 0, rotX = 0, lit = true): THREE.Mesh {
    const cw = w / h > 2 ? 1024 : 512;
    const texture = textTexture(lines, { width: cw, height: Math.max(64, Math.round((cw * h) / w)), ...t });
    const mat = lit
      ? new THREE.MeshStandardMaterial({ map: texture, transparent: !t.bg, roughness: 0.9, alphaTest: t.bg ? 0 : 0.05 })
      : new THREE.MeshBasicMaterial({ map: texture, transparent: !t.bg });
    return this.plane(w, h, mat, x, y, z, rotY, rotX);
  }

  canvasPlane(c: HTMLCanvasElement, w: number, x: number, y: number, z: number, rotY = 0, rotX = 0, emissive = 0): THREE.Mesh {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const h = (w * c.height) / c.width;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? t : null, emissiveIntensity: emissive });
    const m = this.plane(w, h, mat, x, y, z, rotY, rotX);
    m.castShadow = false;
    return m;
  }

  /** Only visible to the phone camera. */
  photoOnly(o: THREE.Object3D): THREE.Object3D {
    o.traverse((c) => c.layers.set(PHOTO_LAYER));
    return o;
  }

  /** A wall from a to b (axis aligned), with optional openings. */
  wall(ax: number, az: number, bx: number, bz: number, h: number, mat: THREE.Material, openings: Opening[] = [], t = 0.2, y0 = 0): void {
    const alongX = Math.abs(bz - az) < 1e-6;
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const sorted = [...openings].sort((p, q) => p.off - q.off);
    let cursor = -len / 2;
    const seg = (from: number, to: number, yb: number, yt: number, collide: boolean) => {
      const l = to - from;
      if (l <= 0.001 || yt - yb <= 0.001) return;
      const mid = (from + to) / 2;
      const x = alongX ? cx + mid : cx;
      const z = alongX ? cz : cz + mid;
      const w = alongX ? l : t;
      const d = alongX ? t : l;
      const m = this.box(w, yt - yb, d, mat, x, y0 + yb, z, { uvScale: 2.5, cast: true, occlude: true });
      m.userData.wall = true;
      if (collide) this.ctx.collision.addBox(x, z, w, d);
    };
    for (const op of sorted) {
      const a = op.off - op.w / 2;
      const b2 = op.off + op.w / 2;
      seg(cursor, a, 0, h, true);
      const bottom = op.bottom ?? 0;
      const top = op.top ?? 2.15;
      if (bottom > 0) seg(a, b2, 0, bottom, true);
      if (top < h) seg(a, b2, top, h, false);
      if (bottom > 0) {
        // windows block movement
        const mid = op.off;
        const x = alongX ? cx + mid : cx;
        const z = alongX ? cz : cz + mid;
        this.ctx.collision.addBox(x, z, alongX ? op.w : t, alongX ? t : op.w);
        if (op.glass !== null) {
          const g = new THREE.Mesh(new THREE.PlaneGeometry(op.w, top - bottom), op.glass ?? Mats.glass());
          g.position.set(x, y0 + (bottom + top) / 2, z);
          if (!alongX) g.rotation.y = Math.PI / 2;
          this.add(g);
          const g2 = g.clone();
          g2.rotation.y += Math.PI;
          this.add(g2);
        }
      }
      cursor = b2;
    }
    seg(cursor, len / 2, 0, h, true);
  }

  /** Rectangular room/building shell centred on x,z. */
  room(o: RoomOpts): THREE.Group {
    const h = o.h ?? 2.8;
    const t = o.t ?? 0.2;
    const wallMat = o.wallMat ?? texMat('siding');
    const x0 = o.x - o.w / 2;
    const x1 = o.x + o.w / 2;
    const z0 = o.z - o.d / 2;
    const z1 = o.z + o.d / 2;
    this.wall(x0, z0, x1, z0, h, wallMat, o.n ?? [], t);
    this.wall(x0, z1, x1, z1, h, wallMat, o.s ?? [], t);
    this.wall(x1, z0, x1, z1, h, wallMat, o.e ?? [], t);
    this.wall(x0, z0, x0, z1, h, wallMat, o.w_ ?? [], t);
    if (o.innerMat) {
      // thin inner lining so interiors look different from exteriors
      const lining = (ax: number, az: number, bx: number, bz: number, ops: Opening[], inset: [number, number]) =>
        this.wall(ax + inset[0], az + inset[1], bx + inset[0], bz + inset[1], h - 0.01, o.innerMat!, ops.map((p) => ({ ...p, glass: null })), 0.02);
      lining(x0 + t / 2, z0, x1 - t / 2, z0, o.n ?? [], [0, t / 2 + 0.01]);
      lining(x0 + t / 2, z1, x1 - t / 2, z1, o.s ?? [], [0, -t / 2 - 0.01]);
      lining(x1, z0 + t / 2, x1, z1 - t / 2, o.e ?? [], [-t / 2 - 0.01, 0]);
      lining(x0, z0 + t / 2, x0, z1 - t / 2, o.w_ ?? [], [t / 2 + 0.01, 0]);
    }
    const g = new THREE.Group();
    if (o.floorMat !== null) {
      const f = this.box(o.w, 0.06, o.d, o.floorMat ?? texMat('planks', 1), o.x, -0.02, o.z, { uvScale: 2, cast: false });
      f.receiveShadow = true;
    }
    if (o.ceilMat !== null && o.roof !== 'none') {
      this.box(o.w, 0.06, o.d, o.ceilMat ?? colorMat(0x5a5650), o.x, h, o.z, { cast: false, uvScale: 3 });
    }
    const roofMat = o.roofMat ?? texMat('roof', 1);
    if (o.roof === 'gable') {
      const rh = Math.min(o.w, o.d) * 0.35;
      const shape = new THREE.Shape();
      shape.moveTo(-o.w / 2 - 0.4, 0);
      shape.lineTo(0, rh);
      shape.lineTo(o.w / 2 + 0.4, 0);
      shape.lineTo(-o.w / 2 - 0.4, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: o.d + 0.6, bevelEnabled: false });
      geo.translate(0, 0, -(o.d + 0.6) / 2);
      const rm = new THREE.Mesh(geo, roofMat);
      rm.position.set(o.x, h + 0.03, o.z);
      rm.castShadow = true;
      this.add(rm);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.4, uv.getY(i) * 0.4);
    } else if (o.roof !== 'none') {
      this.box(o.w + 0.4, 0.2, o.d + 0.4, roofMat, o.x, h + 0.02, o.z, { cast: true, uvScale: 3 });
    }
    return g;
  }

  door(o: DoorOpts): Door {
    return new Door(this, o);
  }

  // ---------------------------------------------------------------- nature

  terrain(o: { x0: number; z0: number; w: number; d: number; seg?: number; height: (x: number, z: number) => number; color?: (x: number, z: number) => [number, number, number]; mat?: THREE.Material; uv?: number }): THREE.Mesh {
    const segX = o.seg ?? 96;
    const segZ = Math.round((segX * o.d) / o.w);
    const geo = new THREE.PlaneGeometry(o.w, o.d, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(o.x0 + o.w / 2, 0, o.z0 + o.d / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const uvs = o.uv ?? 5;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, o.height(x, z));
      uv.setXY(i, x / uvs, z / uvs);
      const c = o.color ? o.color(x, z) : [1, 1, 1];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = o.mat ?? new THREE.MeshStandardMaterial({ map: tex('forestFloor'), vertexColors: true, roughness: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.add(m);
    return m;
  }

  /** Ribbon along a polyline, sitting on the given height function. */
  strip(points: [number, number][], width: number, mat: THREE.Material, height: (x: number, z: number) => number, yOff = 0.03, uvScale = 4, subdivide = 2): THREE.Mesh {
    // densify
    const pts: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / subdivide));
      for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    pts.push(points[points.length - 1]);
    const verts: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const nx = -dz;
      const nz = dx;
      if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (const s of [-1, 1]) {
        const x = p[0] + nx * (width / 2) * s;
        const z = p[1] + nz * (width / 2) * s;
        verts.push(x, height(x, z) + yOff, z);
        uvs.push(s < 0 ? 0 : 1, dist / uvScale);
      }
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.add(m);
    return m;
  }

  /** Instanced forest (pines + dead trees + bushes). */
  forest(o: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    count: number;
    seed: number;
    height?: (x: number, z: number) => number;
    exclude?: (x: number, z: number) => boolean;
    collide?: (x: number, z: number) => boolean;
    deadRatio?: number;
    bushes?: number;
    scale?: number;
    minSpacing?: number;
  }): { positions: [number, number, number][] } {
    const r = rng(o.seed);
    const hf = o.height ?? (() => 0);
    const count = Math.round(o.count * this.quality.treeDensity);
    const positions: [number, number, number][] = [];
    const spacing = o.minSpacing ?? 1.6;
    let tries = 0;
    while (positions.length < count && tries < count * 20) {
      tries++;
      const x = o.minX + r() * (o.maxX - o.minX);
      const z = o.minZ + r() * (o.maxZ - o.minZ);
      if (o.exclude?.(x, z)) continue;
      let ok = true;
      for (let i = Math.max(0, positions.length - 60); i < positions.length; i++) {
        const p = positions[i];
        if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < spacing * spacing) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      positions.push([x, z, (0.75 + r() * 0.6) * (o.scale ?? 1)]);
    }

    const deadRatio = o.deadRatio ?? 0.12;
    const pines = positions.filter(() => r() > deadRatio);
    const dead = positions.filter((p) => !pines.includes(p));

    // pine geometry
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.26, 4, 6);
    trunkGeo.translate(0, 2, 0);
    const cones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry(2.2 - i * 0.45, 3.2 - i * 0.3, 7, 1);
      c.translate(0, 3 + i * 1.7, 0);
      cones.push(c);
    }
    const foliageGeo = mergeGeometries(cones)!;
    const trunkMat = texMat('bark', 1, { color: 0x6b5a4a });
    const foliageMat = addWind(new THREE.MeshStandardMaterial({ color: 0x1a2618, roughness: 0.95, flatShading: true }), 0.05, 0.12) as THREE.MeshStandardMaterial;

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pines.length + dead.length);
    const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, Math.max(1, pines.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    pines.forEach(([x, z, sc], i) => {
      const y = hf(x, z) - 0.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      s.set(sc, sc * (0.9 + r() * 0.5), sc);
      p.set(x, y, z);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      foliage.setMatrixAt(i, m);
      col.setHSL(0.28 + r() * 0.08, 0.25 + r() * 0.2, 0.55 + r() * 0.45);
      foliage.setColorAt(i, col);
    });
    // dead trees: taller bare trunks with branches
    const branchGeos: THREE.BufferGeometry[] = [];
    const bt = new THREE.CylinderGeometry(0.1, 0.24, 7, 6);
    bt.translate(0, 3.5, 0);
    branchGeos.push(bt);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.CylinderGeometry(0.02, 0.07, 1.8, 4);
      b.translate(0, 0.9, 0);
      b.rotateZ(0.7 + r() * 0.5);
      b.rotateY((i / 5) * Math.PI * 2);
      b.translate(0, 2.5 + i * 0.8, 0);
      branchGeos.push(b);
    }
    const deadGeo = mergeGeometries(branchGeos)!;
    const deadMesh = new THREE.InstancedMesh(deadGeo, texMat('bark', 1, { color: 0x4a4038 }), Math.max(1, dead.length));
    dead.forEach(([x, z, sc], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      s.set(sc, sc, sc);
      p.set(x, hf(x, z) - 0.1, z);
      m.compose(p, q, s);
      deadMesh.setMatrixAt(i, m);
    });
    trunks.count = pines.length;
    foliage.count = pines.length;
    deadMesh.count = dead.length;
    for (const im of [trunks, foliage, deadMesh]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.instanceMatrix.needsUpdate = true;
      this.add(im);
    }
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    // colliders only where the player can actually reach
    for (const [x, z, sc] of positions) {
      if (!o.collide || o.collide(x, z)) this.ctx.collision.addCircle(x, z, 0.28 * sc + 0.05);
    }

    // bushes / undergrowth
    const nb = Math.round((o.bushes ?? 0) * this.quality.grassDensity);
    if (nb > 0) {
      const bg = new THREE.IcosahedronGeometry(0.7, 0);
      bg.scale(1, 0.6, 1);
      bg.translate(0, 0.25, 0);
      const bm = new THREE.InstancedMesh(bg, addWind(new THREE.MeshStandardMaterial({ color: 0x223020, roughness: 1, flatShading: true }), 0.25, 1.2), nb);
      let placed = 0;
      for (let i = 0; i < nb * 4 && placed < nb; i++) {
        const x = o.minX + r() * (o.maxX - o.minX);
        const z = o.minZ + r() * (o.maxZ - o.minZ);
        if (o.exclude?.(x, z)) continue;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
        const sc = 0.5 + r() * 1.1;
        s.set(sc, sc * (0.6 + r() * 0.6), sc);
        p.set(x, hf(x, z), z);
        m.compose(p, q, s);
        bm.setMatrixAt(placed, m);
        col.setHSL(0.22 + r() * 0.12, 0.3, 0.5 + r() * 0.5);
        bm.setColorAt(placed, col);
        placed++;
      }
      bm.count = placed;
      bm.frustumCulled = false;
      bm.receiveShadow = true;
      this.add(bm);
    }
    return { positions };
  }

  /** Grass tufts (no alpha textures: cheap thin blades). */
  grass(o: { minX: number; maxX: number; minZ: number; maxZ: number; count: number; seed: number; height?: (x: number, z: number) => number; exclude?: (x: number, z: number) => boolean; color?: number }): void {
    const n = Math.round(o.count * this.quality.grassDensity);
    if (n <= 0) return;
    const r = rng(o.seed);
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(0.03, 0.45 + r() * 0.3, 3, 1);
      g.translate((r() - 0.5) * 0.25, 0.25, (r() - 0.5) * 0.25);
      g.rotateZ((r() - 0.5) * 0.5);
      blades.push(g);
    }
    const geo = mergeGeometries(blades)!;
    const mat = addWind(new THREE.MeshStandardMaterial({ color: o.color ?? 0x3a4428, roughness: 1 }), 0.6, 1.6);
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < n * 3 && placed < n; i++) {
      const x = o.minX + r() * (o.maxX - o.minX);
      const z = o.minZ + r() * (o.maxZ - o.minZ);
      if (o.exclude?.(x, z)) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
      const sc = 0.6 + r() * 0.9;
      s.set(sc, sc, sc);
      p.set(x, (o.height?.(x, z) ?? 0) - 0.02, z);
      m.compose(p, q, s);
      im.setMatrixAt(placed++, m);
    }
    im.count = placed;
    im.frustumCulled = false;
    this.add(im);
  }

  rock(x: number, z: number, size: number, y = 0, seed = 1, collide = true): THREE.Mesh {
    const r = rng(seed);
    const g = new THREE.DodecahedronGeometry(size, 1);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + r() * 0.4;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, texMat('rock', 1, { color: 0x9a9890 }));
    m.position.set(x, y + size * 0.2, z);
    m.rotation.y = r() * 6;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    if (collide && size > 0.35) this.ctx.collision.addCircle(x, z, size * 0.85);
    return m;
  }

  log(x: number, z: number, len: number, rot: number, y = 0, radius = 0.28): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, len, 8), texMat('bark', 1, { color: 0x5a4a3a }));
    m.rotation.set(0, rot, Math.PI / 2);
    m.rotation.order = 'YXZ';
    m.position.set(x, y + radius * 0.8, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    this.ctx.collision.addBox(x, z, len, radius * 2, rot);
    this.level.occluders.push(m);
    return m;
  }

  // ---------------------------------------------------------------- props

  tent(x: number, z: number, rot: number, y = 0): THREE.Group {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-1.2, 0);
    shape.lineTo(0, 1.4);
    shape.lineTo(1.2, 0);
    shape.lineTo(-1.2, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
    geo.translate(0, 0, -1.2);
    const tent = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.95, side: THREE.DoubleSide }));
    tent.castShadow = true;
    tent.receiveShadow = true;
    g.add(tent);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), colorMat(0x10140c));
    flap.position.set(0, 0.5, 1.22);
    g.add(flap);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, 2.4, 2.4, rot);
    this.level.occluders.push(tent);
    return g;
  }

  firePit(x: number, z: number, y = 0, ember = true): THREE.Group {
    const g = new THREE.Group();
    const stoneMat = texMat('rock', 1, { color: 0x77726a });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stoneMat);
      s.position.set(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
      s.rotation.set(a, a * 2, 0);
      s.castShadow = true;
      g.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 5), colorMat(0x1a1410));
      l.rotation.set(Math.PI / 2 - 0.3, (i / 4) * Math.PI * 2, 0);
      l.position.set(0, 0.12, 0);
      g.add(l);
    }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), ember ? colorMat(0x201510, 1, 0, 0x5a1a05, 0.6) : colorMat(0x161412));
    ash.rotation.x = -Math.PI / 2;
    ash.position.y = 0.02;
    g.add(ash);
    g.position.set(x, y, z);
    this.add(g);
    this.ctx.collision.addCircle(x, z, 0.7);
    return g;
  }

  campChair(x: number, z: number, rot: number, y = 0, fallen = false): THREE.Group {
    const g = new THREE.Group();
    const fabric = colorMat(0x2d3b52, 0.9);
    const frame = colorMat(0x333333, 0.4, 0.7);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.5), fabric);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.05), fabric);
    back.position.set(0, 0.72, -0.25);
    back.rotation.x = -0.15;
    g.add(seat, back);
    for (const [lx, lz] of [
      [-0.25, -0.22],
      [0.25, -0.22],
      [-0.25, 0.22],
      [0.25, 0.22],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46), frame);
      leg.position.set(lx, 0.23, lz);
      g.add(leg);
    }
    g.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    g.position.set(x, y, z);
    g.rotation.y = rot;
    if (fallen) g.rotation.z = Math.PI / 2 - 0.1;
    this.add(g);
    this.ctx.collision.addCircle(x, z, 0.35);
    return g;
  }

  backpack(x: number, z: number, rot: number, y = 0, color = 0x7a3a22): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.25), colorMat(color, 0.95));
    body.position.y = 0.27;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), colorMat(color, 0.95));
    top.scale.set(1, 0.4, 0.62);
    top.position.y = 0.55;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.08), colorMat(0x3a2a1a, 0.95));
    pocket.position.set(0, 0.2, 0.15);
    g.add(body, top, pocket);
    g.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    g.position.set(x, y, z);
    g.rotation.set(0.15, rot, 0.2);
    this.add(g);
    return g;
  }

  crate(x: number, z: number, s = 0.6, y = 0, rot = 0, collide = true): THREE.Mesh {
    return this.box(s, s, s, texMat('planks', 1, { color: 0x9a8a70 }), x, y, z, { rotY: rot, collide });
  }

  cardboard(x: number, z: number, w = 0.5, h = 0.4, d = 0.4, y = 0, rot = 0, collide = true): THREE.Mesh {
    return this.box(w, h, d, colorMat(0x8a6a44, 0.95), x, y, z, { rotY: rot, collide });
  }

  table(x: number, z: number, w: number, d: number, rot = 0, h = 0.76, mat?: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const m = mat ?? texMat('planks', 1, { color: 0xa08868 });
    const top = new THREE.Mesh(worldBox(w, 0.05, d, 1), m);
    top.position.y = h;
    g.add(top);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), m);
        leg.position.set(sx * (w / 2 - 0.06), h / 2, sz * (d / 2 - 0.06));
        g.add(leg);
      }
    g.traverse((c) => {
      (c as THREE.Mesh).castShadow = true;
      (c as THREE.Mesh).receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, w, d, rot);
    return g;
  }

  chair(x: number, z: number, rot = 0, fallen = false): THREE.Group {
    const g = new THREE.Group();
    const m = texMat('planks', 1, { color: 0x7a6048 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), m);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.04), m);
    back.position.set(0, 0.72, -0.2);
    g.add(seat, back);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), m);
        leg.position.set(sx * 0.19, 0.23, sz * 0.19);
        g.add(leg);
      }
    g.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    if (fallen) {
      g.rotation.x = -Math.PI / 2;
      g.position.y = 0.2;
    }
    this.add(g);
    this.ctx.collision.addCircle(x, z, 0.3);
    return g;
  }

  bed(x: number, z: number, rot = 0, messy = true): THREE.Group {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(worldBox(1.5, 0.35, 2.1, 1), texMat('planks', 1, { color: 0x6a5038 }));
    frame.position.y = 0.175;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 2.0), colorMat(0xb8b0a0, 0.95));
    mattress.position.y = 0.45;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.3), colorMat(0x4a5a6a, 0.95));
    blanket.position.set(0, 0.58, 0.35);
    if (messy) blanket.rotation.y = 0.12;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.35), colorMat(0xd8d2c4, 0.95));
    pillow.position.set(-0.3, 0.6, -0.75);
    const head = new THREE.Mesh(worldBox(1.5, 0.9, 0.08, 1), texMat('planks', 1, { color: 0x5a4030 }));
    head.position.set(0, 0.45, -1.05);
    g.add(frame, mattress, blanket, pillow, head);
    g.traverse((c) => {
      (c as THREE.Mesh).castShadow = true;
      (c as THREE.Mesh).receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, 1.5, 2.1, rot);
    return g;
  }

  shelf(x: number, z: number, w: number, rot = 0, h = 1.8, d = 0.4, items = true, seed = 5): THREE.Group {
    const g = new THREE.Group();
    const m = colorMat(0x6a6a6a, 0.6, 0.4);
    const r = rng(seed);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), m);
      s.position.y = 0.1 + (i * (h - 0.1)) / 3;
      g.add(s);
      if (items && i < 3) {
        let cx = -w / 2 + 0.1;
        while (cx < w / 2 - 0.15) {
          if (r() > 0.25) {
            const iw = 0.08 + r() * 0.15;
            const ih = 0.12 + r() * 0.2;
            const it = new THREE.Mesh(new THREE.BoxGeometry(iw, ih, 0.12 + r() * 0.12), colorMat(SHELF_PALETTE[Math.floor(r() * SHELF_PALETTE.length)], 0.7));
            it.position.set(cx + iw / 2, s.position.y + ih / 2 + 0.015, (r() - 0.5) * 0.1);
            if (r() > 0.92) {
              it.rotation.z = Math.PI / 2;
              it.position.y = s.position.y + iw / 2;
            }
            g.add(it);
            cx += iw + 0.02;
          } else cx += 0.12;
        }
      }
    }
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, d), m);
      side.position.set((sx * w) / 2, h / 2, 0);
      g.add(side);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), m);
    back.position.set(0, h / 2, -d / 2);
    g.add(back);
    g.traverse((c) => {
      (c as THREE.Mesh).castShadow = true;
      (c as THREE.Mesh).receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, w, d, rot);
    this.level.occluders.push(back);
    return g;
  }

  counter(x: number, z: number, w: number, d: number, rot = 0, h = 0.95, mat?: THREE.Material): THREE.Mesh {
    const body = this.box(w, h - 0.05, d, mat ?? colorMat(0x5a4a3c, 0.7), x, 0, z, { rotY: rot, collide: true });
    this.box(w + 0.05, 0.05, d + 0.05, colorMat(0x9a9488, 0.4), x, h - 0.05, z, { rotY: rot });
    return body;
  }

  sofa(x: number, z: number, rot = 0, color = 0x4a3a30): THREE.Group {
    const g = new THREE.Group();
    const m = colorMat(color, 0.95);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 0.9), m);
    base.position.y = 0.225;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.2), m);
    back.position.set(0, 0.7, -0.35);
    const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.9), m);
    a1.position.set(-0.9, 0.6, 0);
    const a2 = a1.clone();
    a2.position.x = 0.9;
    g.add(base, back, a1, a2);
    g.traverse((c) => {
      (c as THREE.Mesh).castShadow = true;
      (c as THREE.Mesh).receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, 2, 0.9, rot);
    return g;
  }

  fridge(x: number, z: number, rot = 0): THREE.Mesh {
    const m = this.box(0.75, 1.8, 0.7, colorMat(0xd0ccc0, 0.4, 0.1), x, 0, z, { rotY: rot, collide: true });
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.04), colorMat(0x888888, 0.3, 0.8));
    h.position.set(0.3, 0.2, 0.36);
    m.add(h);
    return m;
  }

  stove(x: number, z: number, rot = 0): THREE.Mesh {
    const m = this.box(0.75, 0.9, 0.65, colorMat(0xe0dcd0, 0.4, 0.1), x, 0, z, { rotY: rot, collide: true });
    for (const [bx, bz] of [
      [-0.18, -0.15],
      [0.18, -0.15],
      [-0.18, 0.15],
      [0.18, 0.15],
    ]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), colorMat(0x222222, 0.5));
      b.position.set(bx, 0.46, bz);
      m.add(b);
    }
    return m;
  }

  sink(x: number, z: number, rot = 0): THREE.Mesh {
    const m = this.box(0.6, 0.85, 0.5, colorMat(0xe8e8e0, 0.3), x, 0, z, { rotY: rot, collide: true });
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.35), colorMat(0x999999, 0.2, 0.6));
    basin.position.y = 0.43;
    m.add(basin);
    return m;
  }

  toilet(x: number, z: number, rot = 0): THREE.Group {
    const g = new THREE.Group();
    const m = colorMat(0xe8e8e0, 0.25);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 12), m);
    bowl.position.set(0, 0.21, 0.1);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.18), m);
    tank.position.set(0, 0.6, -0.15);
    g.add(bowl, tank);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addCircle(x, z, 0.3);
    return g;
  }

  bathtub(x: number, z: number, rot = 0): THREE.Mesh {
    const m = this.box(0.8, 0.55, 1.7, colorMat(0xe0ddd5, 0.25), x, 0, z, { rotY: rot, collide: true });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 1.5), colorMat(0x3a3a38, 0.2, 0.2));
    inner.position.y = 0.27;
    m.add(inner);
    return m;
  }

  desk(x: number, z: number, rot = 0, w = 1.4): THREE.Group {
    const g = new THREE.Group();
    const m = texMat('planks', 1, { color: 0x6a4a32 });
    const top = new THREE.Mesh(worldBox(w, 0.05, 0.7, 1), m);
    top.position.y = 0.76;
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.74, 0.66), m);
    ped.position.set(w / 2 - 0.25, 0.37, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.66), m);
    leg.position.set(-w / 2 + 0.04, 0.37, 0);
    g.add(top, ped, leg);
    for (let i = 0; i < 3; i++) {
      const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), colorMat(0xb0a070, 0.3, 0.8));
      hnd.position.set(w / 2 - 0.25, 0.62 - i * 0.22, 0.34);
      g.add(hnd);
    }
    g.traverse((c) => {
      (c as THREE.Mesh).castShadow = true;
      (c as THREE.Mesh).receiveShadow = true;
    });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.ctx.collision.addBox(x, z, w, 0.7, rot);
    return g;
  }

  /** A CRT/LCD monitor whose screen shows a canvas; returns the screen mesh and its texture. */
  monitor(x: number, y: number, z: number, rot: number, canvasEl: HTMLCanvasElement, size = 0.5, crt = true): { screen: THREE.Mesh; texture: THREE.CanvasTexture; group: THREE.Group } {
    const g = new THREE.Group();
    const w = size;
    const h = size * 0.75;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, crt ? size * 0.8 : 0.05), colorMat(0x2a2a28, 0.6));
    body.position.set(0, h / 2 + 0.05, crt ? -size * 0.35 : 0);
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    screen.position.set(0, h / 2 + 0.05, crt ? 0.06 : 0.03);
    g.add(body, screen);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    body.castShadow = true;
    this.add(g);
    return { screen, texture, group: g };
  }

  /** Fake volumetric glow sprite. */
  glow(x: number, y: number, z: number, color: number, size: number, opacity = 0.6): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(x, y, z);
    s.scale.set(size, size, size);
    this.add(s);
    return s;
  }

  /** Additive light cone under a lamp (cheap "volumetric" light). */
  lightCone(x: number, y: number, z: number, height: number, radius: number, color: number, opacity = 0.07): THREE.Mesh {
    const geo = new THREE.ConeGeometry(radius, height, 20, 1, true);
    geo.translate(0, -height / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    this.add(m);
    return m;
  }

  /** Street light. If `light` is true a real PointLight is created (use sparingly). */
  streetLight(x: number, z: number, rot: number, o: { on?: boolean; light?: boolean; color?: number; intensity?: number; height?: number } = {}): { bulb: THREE.Mesh; light?: THREE.PointLight; cone: THREE.Mesh; glow: THREE.Sprite; setOn: (on: boolean, level?: number) => void } {
    const h = o.height ?? 6;
    const color = o.color ?? 0xffc27a;
    const pole = this.cyl(0.07, 0.1, h, colorMat(0x3a3c3e, 0.5, 0.6), x, 0, z, { collideR: 0.15, seg: 8 });
    pole.castShadow = true;
    const armLen = 1.4;
    const ax = x + Math.sin(rot) * armLen;
    const az = z + Math.cos(rot) * armLen;
    const arm = this.box(0.08, 0.08, armLen, colorMat(0x3a3c3e, 0.5, 0.6), x + Math.sin(rot) * armLen * 0.5, h - 0.2, z + Math.cos(rot) * armLen * 0.5, { rotY: rot });
    arm.castShadow = false;
    const head = this.box(0.5, 0.12, 0.3, colorMat(0x2a2c2e, 0.5, 0.6), ax, h - 0.32, az, { rotY: rot });
    head.castShadow = false;
    const bulbMat = new THREE.MeshBasicMaterial({ color });
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.22), bulbMat);
    bulb.userData.dynamic = true;
    bulb.position.set(ax, h - 0.34, az);
    bulb.rotation.y = rot;
    this.add(bulb);
    const cone = this.lightCone(ax, h - 0.35, az, h - 0.3, 2.6, color, 0.05);
    const gl = this.glow(ax, h - 0.45, az, color, 2.2, 0.55);
    let light: THREE.PointLight | undefined;
    if (o.light) {
      light = new THREE.PointLight(color, o.intensity ?? 22, 16, 1.6);
      light.position.set(ax, h - 0.6, az);
      this.add(light);
    }
    const base = o.intensity ?? 22;
    const setOn = (on: boolean, level = 1) => {
      bulbMat.color.setHex(on ? color : 0x222222);
      bulbMat.color.multiplyScalar(on ? level : 1);
      cone.visible = on;
      gl.visible = on;
      (gl.material as THREE.SpriteMaterial).opacity = 0.55 * level;
      if (light) light.intensity = on ? base * level : 0;
    };
    setOn(o.on ?? true);
    return { bulb, light, cone, glow: gl, setOn };
  }

  sign(x: number, z: number, rot: number, lines: string[], o: { w?: number; h?: number; bg?: string; fg?: string; poleH?: number; poles?: 1 | 2; size?: number; border?: string } = {}): THREE.Group {
    const g = new THREE.Group();
    const w = o.w ?? 2;
    const h = o.h ?? 1;
    const ph = o.poleH ?? 2;
    const t = textTexture(lines, { width: 512, height: Math.round((512 * h) / w), bg: o.bg ?? '#1f5a2e', fg: o.fg ?? '#f2f2f2', size: o.size ?? Math.round(((512 * h) / w / Math.max(lines.length, 1)) * 0.55), border: o.border ?? (o.fg ?? '#f2f2f2') });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 }));
    face.position.set(0, ph + h / 2, 0.03);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), colorMat(0x777777, 0.5, 0.6));
    back.position.set(0, ph + h / 2, 0);
    g.add(face, back);
    const poles = o.poles ?? (w > 1.6 ? 2 : 1);
    const pm = colorMat(0x6a6a6a, 0.5, 0.7);
    for (let i = 0; i < poles; i++) {
      const px = poles === 1 ? 0 : (i === 0 ? -1 : 1) * (w / 2 - 0.15);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ph + h * 0.8, 6), pm);
      p.position.set(px, (ph + h * 0.8) / 2, -0.04);
      g.add(p);
    }
    g.traverse((c) => ((c as THREE.Mesh).castShadow = true));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    return g;
  }

  /** A paper note lying on a surface / pinned to a wall. */
  paper(x: number, y: number, z: number, rotY = 0, flat = true, w = 0.21, h = 0.28, color = 0xe8e2d0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), colorMat(color, 0.95));
    m.position.set(x, y, z);
    m.rotation.order = 'YXZ';
    m.rotation.y = rotY;
    if (flat) m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    // pseudo text lines
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.75, h * 0.6), new THREE.MeshBasicMaterial({ map: scribbleTexture(), transparent: true, opacity: 0.6, color: 0x333344 }));
    lines.position.z = 0.001;
    m.add(lines);
    this.add(m);
    return m;
  }

  /** Invisible box used as a big interaction target. */
  hitbox(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    this.add(m);
    return m;
  }

  /** Small glinting marker to hint at interactable items in the dark. */
  glint(x: number, y: number, z: number, color = 0xfff2d0): THREE.Sprite {
    const s = this.glow(x, y, z, color, 0.35, 0.25);
    s.userData.glint = true;
    this.level.glints.push(s);
    return s;
  }

  // ---------------------------------------------------------------- vehicles

  car(o: { x: number; z: number; rot: number; color: number; type?: 'sedan' | 'hatch' | 'truck' | 'pickup' | 'police'; y?: number; doorOpen?: boolean; wrecked?: boolean; lights?: boolean }): { group: THREE.Group; body: THREE.Mesh; headlights: THREE.Mesh[]; tail: THREE.Mesh[] } {
    const type = o.type ?? 'sedan';
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: o.color, roughness: o.wrecked ? 0.8 : 0.35, metalness: 0.5 });
    const dims = {
      sedan: { L: 4.4, W: 1.8, H: 0.75, cab: [2.2, 0.62, 0.1] },
      police: { L: 4.6, W: 1.85, H: 0.75, cab: [2.3, 0.62, 0.1] },
      hatch: { L: 3.8, W: 1.72, H: 0.78, cab: [2.1, 0.66, -0.35] },
      truck: { L: 6.2, W: 2.3, H: 1.4, cab: [1.8, 1.0, 1.9] },
      pickup: { L: 5.0, W: 1.9, H: 0.85, cab: [1.6, 0.72, 0.6] },
    }[type];
    const { L, W, H } = dims;
    const clearance = 0.32;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), paint);
    body.position.y = clearance + H / 2;
    g.add(body);
    const [cl, ch, coff] = dims.cab as number[];
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, ch, cl), paint);
    cab.position.set(0, clearance + H + ch / 2, coff);
    g.add(cab);
    const glass = Mats.glass();
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, ch * 0.85), glass);
    ws.position.set(0, clearance + H + ch / 2, coff - cl / 2 - 0.005);
    ws.rotation.y = Math.PI;
    const rw = ws.clone();
    rw.position.z = coff + cl / 2 + 0.005;
    rw.rotation.y = 0;
    const sw1 = new THREE.Mesh(new THREE.PlaneGeometry(cl * 0.9, ch * 0.75), glass);
    sw1.position.set(W * 0.45 + 0.005, clearance + H + ch / 2, coff);
    sw1.rotation.y = Math.PI / 2;
    const sw2 = sw1.clone();
    sw2.position.x = -W * 0.45 - 0.005;
    sw2.rotation.y = -Math.PI / 2;
    g.add(ws, rw, sw1, sw2);
    if (type === 'truck') {
      const box = new THREE.Mesh(worldBox(W, 2.2, L - 2.2, 2), texMat('metal', 1, { color: 0xb8b4aa }));
      box.position.set(0, clearance + 0.3 + 1.1, -1.0);
      g.add(box);
    }
    if (type === 'police') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.25), colorMat(0x222222));
      bar.position.set(0, clearance + H + ch + 0.05, coff);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.2), colorMat(0x550000, 0.4, 0, 0x220000));
      red.position.set(-0.3, 0.02, 0);
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.2), colorMat(0x000055, 0.4, 0, 0x000022));
      blue.position.set(0.3, 0.02, 0);
      bar.add(red, blue);
      g.add(bar);
    }
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const tire = colorMat(0x151515, 0.9);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const wh = new THREE.Mesh(wheelGeo, tire);
        wh.position.set(sx * (W / 2 - 0.08), 0.34, sz * (L / 2 - 0.85));
        if (o.wrecked && sx > 0 && sz > 0) wh.position.y = 0.22;
        g.add(wh);
      }
    const headlights: THREE.Mesh[] = [];
    const tail: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.04), new THREE.MeshBasicMaterial({ color: o.lights ? 0xfff4d0 : 0x444440 }));
      hl.position.set(sx * (W / 2 - 0.3), clearance + H * 0.65, -L / 2 - 0.01);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: o.lights ? 0xff2010 : 0x3a0808 }));
      tl.position.set(sx * (W / 2 - 0.3), clearance + H * 0.7, L / 2 + 0.01);
      g.add(hl, tl);
      headlights.push(hl);
      tail.push(tl);
    }
    g.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.material !== glass) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    g.position.set(o.x, o.y ?? 0, o.z);
    g.rotation.y = o.rot;
    if (o.wrecked) g.rotation.z = 0.04;
    this.add(g);
    this.ctx.collision.addBox(o.x, o.z, W, L, o.rot);
    this.level.occluders.push(body, cab);
    return { group: g, body, headlights, tail };
  }

  guardrail(ax: number, az: number, bx: number, bz: number, collide = true): void {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const rail = this.box(0.06, 0.3, len, colorMat(0x8a8c8e, 0.4, 0.8), cx, 0.45, cz, { rotY: rot, cast: false });
    rail.receiveShadow = true;
    const n = Math.floor(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      this.box(0.1, 0.7, 0.1, colorMat(0x6a6c6e, 0.5, 0.6), ax + (bx - ax) * t, 0, az + (bz - az) * t, { cast: false });
    }
    if (collide) this.ctx.collision.addBox(cx, cz, 0.3, len, rot);
  }

  fence(ax: number, az: number, bx: number, bz: number, h = 1.3, collide = true): void {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    const m = texMat('planks', 1, { color: 0x7a6a58 });
    const n = Math.floor(len / 2.2);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      this.box(0.12, h, 0.12, m, ax + (bx - ax) * t, 0, az + (bz - az) * t, { cast: true });
    }
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    for (const y of [h * 0.35, h * 0.8]) this.box(0.05, 0.12, len, m, cx, y, cz, { rotY: rot, cast: false });
    if (collide) this.ctx.collision.addBox(cx, cz, 0.3, len, rot);
  }
}

let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.userData.shared = true;
  return glowTex;
}

let scribbleTex: THREE.Texture | null = null;
function scribbleTexture(): THREE.Texture {
  if (scribbleTex) return scribbleTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const r = rng(77);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  for (let y = 10; y < 124; y += 11) {
    ctx.beginPath();
    let x = 4;
    ctx.moveTo(x, y);
    const end = 60 + r() * 64;
    while (x < end) {
      x += 3 + r() * 5;
      ctx.lineTo(x, y + (r() - 0.5) * 4);
    }
    ctx.stroke();
  }
  scribbleTex = new THREE.CanvasTexture(c);
  scribbleTex.userData.shared = true;
  return scribbleTex;
}

export { basicMat };
