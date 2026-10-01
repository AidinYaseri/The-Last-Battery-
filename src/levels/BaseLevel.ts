import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Interactable } from '../interaction/Interactable';
import type { PhotoTarget } from '../phone/CameraApp';
import type { Surface } from '../player/Player';
import { Atmosphere, type AtmosphereConfig } from '../world/Atmosphere';
import { Builder } from '../world/Builder';
import type { NoteOpts } from '../ui/ModalUI';
import type { AmbienceConfig } from '../audio/AudioManager';
import { windUniforms } from '../world/Materials';
import { batchStatic } from '../world/StaticBatcher';

export interface Landmark {
  id: string;
  name: string;
  x: number;
  z: number;
  r?: number;
}

export interface MapRoad {
  pts: [number, number][];
  w: number;
  kind: 'road' | 'path';
  always?: boolean;
}

export interface MapArea {
  x: number;
  z: number;
  w: number;
  d: number;
  landmark?: string;
}

export interface Trigger {
  id: string;
  x?: number;
  z?: number;
  r?: number;
  box?: { minX: number; maxX: number; minZ: number; maxZ: number };
  once?: boolean;
  enabled?: () => boolean;
  onEnter: () => void;
  onExit?: () => void;
  inside?: boolean;
}

export interface Destination {
  x: number;
  z: number;
  label: string;
  sub?: string;
}

/** Base class for the five levels: building helpers, triggers, pickups, events. */
export abstract class BaseLevel {
  abstract id: number;
  abstract name: string;
  abstract mapName: string;
  group = new THREE.Group();
  b: Builder;
  occluders: THREE.Object3D[] = [];
  glints: THREE.Sprite[] = [];
  photoTargets: PhotoTarget[] = [];
  landmarks: Landmark[] = [];
  mapRoads: MapRoad[] = [];
  mapAreas: MapArea[] = [];
  mapBounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  triggers: Trigger[] = [];
  interactables: Interactable[] = [];
  private updaters: ((dt: number, t: number) => void)[] = [];
  atmosphere!: Atmosphere;
  spawn = { x: 0, z: 0, yaw: 0 };
  protected eventTimer = 40;
  protected events: (() => void)[] = [];
  ambience: AmbienceConfig = { wind: 0.5, crickets: 0.5 };
  exposure = 1;
  disposed = false;
  /** Level handles its own fade-in on a fresh start (intro cutscenes). */
  customFadeIn = false;
  /** Objects that must stay separate meshes (pickups that get removed, animated props). */
  keepSeparate = new Set<THREE.Object3D>();

  constructor(public ctx: GameContext) {
    this.b = new Builder(this);
    this.group.name = 'level';
  }

  abstract build(): void;

  /** Called after the fade-in. `fromSave` is true when continuing a saved game. */
  abstract onStart(fromSave: boolean): void;

  groundHeight(_x: number, _z: number): number {
    return 0;
  }

  surfaceAt(_x: number, _z: number): Surface {
    return 'dirt';
  }

  /** Ambient light multiplier at a position (interiors are darker). */
  ambientAt(_x: number, _z: number): number {
    return 1;
  }

  signalAt(_x: number, _z: number, _gps: boolean): number {
    return 1;
  }

  signalLabel(): string | undefined {
    return undefined;
  }

  gpsDestination(): Destination | null {
    return null;
  }

  // ------------------------------------------------------------ helpers

  get state() {
    return this.ctx.state;
  }

  flagKey(k: string): string {
    return `L${this.id}.${k}`;
  }

  has(k: string): boolean {
    return this.ctx.state.has(this.flagKey(k));
  }

  set(k: string, v: boolean | number | string = true): void {
    this.ctx.state.setFlag(this.flagKey(k), v);
  }

  setupAtmosphere(cfg: AtmosphereConfig): void {
    const p = this.ctx.sceneManager.profile;
    this.atmosphere = new Atmosphere(this.ctx.scene, { particleCount: p.particles, ...cfg }, p.moonShadows && cfg.shadows !== false, p.shadowMap);
    this.exposure = cfg.exposure ?? 1;
    this.ctx.renderer.toneMappingExposure = this.exposure;
  }

  addInteractable(i: Interactable): Interactable {
    this.keepSeparate.add(i.object);
    this.interactables.push(i);
    this.ctx.interaction.register(i);
    return i;
  }

  removeInteractable(i: Interactable): void {
    this.interactables = this.interactables.filter((x) => x !== i);
    this.ctx.interaction.unregister(i);
  }

  onUpdate(fn: (dt: number, t: number) => void): void {
    this.updaters.push(fn);
  }

  addTrigger(t: Trigger): Trigger {
    this.triggers.push(t);
    return t;
  }

  landmark(id: string, name: string, x: number, z: number, r = 12): void {
    this.landmarks.push({ id, name, x, z, r });
  }

  /** A pickup that disappears once taken (persisted across saves). */
  pickup(o: { id: string; object: THREE.Object3D; prompt: string; onPick: () => void; hitbox?: THREE.Object3D; glint?: boolean; enabled?: () => boolean; keep?: boolean }): Interactable | null {
    const key = `got:${o.id}`;
    this.keepSeparate.add(o.object);
    if (this.has(key) && !o.keep) {
      o.object.parent?.remove(o.object);
      o.hitbox?.parent?.remove(o.hitbox);
      return null;
    }
    let glint: THREE.Sprite | null = null;
    if (o.glint !== false) {
      const p = o.object.getWorldPosition(new THREE.Vector3());
      glint = this.b.glint(p.x, p.y + 0.15, p.z);
    }
    const inter: Interactable = {
      id: o.id,
      object: o.hitbox ?? o.object,
      prompt: o.prompt,
      enabled: o.enabled,
      onInteract: () => {
        this.set(key);
        if (!o.keep) {
          this.removeInteractable(inter);
          o.hitbox?.parent?.remove(o.hitbox);
          this.animatePickup(o.object);
        }
        glint?.parent?.remove(glint);
        o.onPick();
      },
    };
    return this.addInteractable(inter);
  }

  /** Item flies toward the camera and shrinks away. */
  private animatePickup(obj: THREE.Object3D): void {
    const start = obj.position.clone();
    const scale = obj.scale.clone();
    const cam = this.ctx.camera.getWorldPosition(new THREE.Vector3());
    const end = cam.clone().add(new THREE.Vector3(0, -0.35, 0));
    obj.userData.dynamic = true;
    this.ctx.scheduler
      .tween(0.35, (t) => {
        obj.position.lerpVectors(start, end, t);
        obj.scale.copy(scale).multiplyScalar(Math.max(0.01, 1 - t));
      })
      .then(() => obj.parent?.remove(obj));
  }

  /** A readable document; shows a note modal and optionally adds a clue. */
  readable(o: { id: string; object: THREE.Object3D; prompt?: string; note: NoteOpts | (() => NoteOpts); clue?: string; onRead?: () => void; glint?: boolean; enabled?: () => boolean }): Interactable {
    if (o.glint !== false && !this.has(`read:${o.id}`)) {
      const p = o.object.getWorldPosition(new THREE.Vector3());
      const g = this.b.glint(p.x, p.y + 0.1, p.z, 0xfff8e0);
      g.userData.readId = o.id;
    }
    return this.addInteractable({
      id: o.id,
      object: o.object,
      prompt: o.prompt ?? 'Read',
      enabled: o.enabled,
      onInteract: async () => {
        const first = !this.has(`read:${o.id}`);
        this.set(`read:${o.id}`);
        this.glints.filter((g) => g.userData.readId === o.id).forEach((g) => g.parent?.remove(g));
        await this.ctx.modal.note(typeof o.note === 'function' ? o.note() : o.note);
        if (o.clue) this.ctx.clues.add(o.clue);
        if (first) o.onRead?.();
      },
    });
  }

  /** Searchable container (car, drawer, box). */
  searchable(o: { id: string; object: THREE.Object3D; prompt: string; onSearch: () => void; emptyText?: string; enabled?: () => boolean; sound?: string }): Interactable {
    return this.addInteractable({
      id: o.id,
      object: o.object,
      enabled: o.enabled,
      prompt: () => (this.has(`searched:${o.id}`) ? `${o.prompt} (searched)` : o.prompt),
      onInteract: () => {
        const p = o.object.getWorldPosition(new THREE.Vector3());
        this.ctx.audio.playAt(o.sound ?? 'rustle', p, { volume: 0.7 });
        if (this.has(`searched:${o.id}`)) {
          this.ctx.hud.message(o.emptyText ?? 'Nothing else here.');
          return;
        }
        this.set(`searched:${o.id}`);
        o.onSearch();
      },
    });
  }

  /** Merge static geometry after building (big draw-call savings). */
  optimize(): void {
    const n = batchStatic(this.group, this.keepSeparate, this.occluders);
    if (n && new URLSearchParams(location.search).has('debug')) console.log(`LOG: batched ${n} meshes in level ${this.id}`);
  }

  complete(): void {
    this.ctx.game.completeLevel(this.id);
  }

  // ------------------------------------------------------------ loop

  update(dt: number, t: number): void {
    windUniforms.uTime.value = t;
    const p = this.ctx.player.pos;
    for (const u of this.updaters) u(dt, t);
    for (const tr of this.triggers) {
      if (tr.enabled && !tr.enabled()) continue;
      let inside = false;
      if (tr.box) inside = p.x >= tr.box.minX && p.x <= tr.box.maxX && p.z >= tr.box.minZ && p.z <= tr.box.maxZ;
      else if (tr.x !== undefined && tr.z !== undefined) inside = Math.hypot(p.x - tr.x, p.z - tr.z) < (tr.r ?? 3);
      if (inside && !tr.inside) {
        tr.inside = true;
        if (tr.once !== false) this.triggers = this.triggers.filter((x) => x !== tr);
        tr.onEnter();
      } else if (!inside && tr.inside) {
        tr.inside = false;
        tr.onExit?.();
      }
    }
    for (const l of this.landmarks) {
      if (Math.hypot(p.x - l.x, p.z - l.z) < (l.r ?? 12)) {
        if (this.ctx.state.discover(`${this.id}:${l.id}`)) this.ctx.hud.toast(l.name, 'info', 'LOCATION');
      }
    }
    // glints pulse
    const pulse = 0.18 + Math.sin(t * 2.2) * 0.1;
    for (const g of this.glints) (g.material as THREE.SpriteMaterial).opacity = pulse;
    if (this.atmosphere) {
      this.atmosphere.targetAmbient = this.ambientAt(p.x, p.z);
      this.atmosphere.update(dt, t, this.ctx.camera.position);
    }
    // random atmospheric events
    if (this.events.length) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this.eventTimer = 35 + Math.random() * 45;
        const e = this.events[Math.floor(Math.random() * this.events.length)];
        try {
          e();
        } catch (err) {
          console.error(err);
        }
      }
    }
  }

  /** A position somewhere around the player at a given distance (for positional events). */
  around(dist: number, behind = false): THREE.Vector3 {
    const p = this.ctx.player.pos;
    let a = Math.random() * Math.PI * 2;
    if (behind) {
      const yaw = this.ctx.player.yaw;
      a = -yaw + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      // forward is (-sin yaw, -cos yaw); behind is opposite
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const side = (Math.random() - 0.5) * 0.8;
      return new THREE.Vector3(p.x + (fx + side * fz) * dist, 0.5, p.z + (fz - side * fx) * dist);
    }
    return new THREE.Vector3(p.x + Math.cos(a) * dist, 0.5, p.z + Math.sin(a) * dist);
  }

  dispose(): void {
    this.disposed = true;
    this.ctx.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (mat.userData?.shared) continue;
        const anyMat = mat as any;
        for (const key of ['map', 'emissiveMap', 'bumpMap']) {
          const t = anyMat[key] as THREE.Texture | undefined;
          if (t && !t.userData?.shared) t.dispose();
        }
        mat.dispose();
      }
      const l = o as THREE.Light;
      if ((l as any).isLight && (l as any).shadow?.map) (l as any).shadow.map.dispose();
    });
    this.atmosphere?.dispose();
    this.interactables.forEach((i) => this.ctx.interaction.unregister(i));
  }
}
