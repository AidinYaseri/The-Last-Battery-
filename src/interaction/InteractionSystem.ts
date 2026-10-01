import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { Interactable } from './Interactable';

/** Ray-casts from the camera to find the interactable under the crosshair. */
export class InteractionSystem {
  private list: Interactable[] = [];
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  current: Interactable | null = null;
  occluders: THREE.Object3D[] = [];
  private byObject = new Map<THREE.Object3D, Interactable>();

  constructor(private ctx: GameContext) {
    this.raycaster.far = 3.6;
  }

  register(i: Interactable): void {
    this.list.push(i);
    this.byObject.set(i.object, i);
  }

  unregister(i: Interactable): void {
    this.list = this.list.filter((x) => x !== i);
    this.byObject.delete(i.object);
    if (this.current === i) this.current = null;
  }

  clear(): void {
    this.list = [];
    this.byObject.clear();
    this.current = null;
    this.occluders = [];
  }

  private findOwner(o: THREE.Object3D | null): Interactable | null {
    while (o) {
      const i = this.byObject.get(o);
      if (i) return i;
      o = o.parent;
    }
    return null;
  }

  update(enabled: boolean): void {
    this.current = null;
    if (enabled) {
      const cam = this.ctx.camera;
      this.raycaster.setFromCamera(this.center, cam);
      this.raycaster.layers.set(0);
      const camPos = cam.position;
      const targets: THREE.Object3D[] = [];
      for (const i of this.list) {
        if (i.enabled && !i.enabled()) continue;
        if (!i.object.parent) continue;
        const wp = i.object.getWorldPosition(new THREE.Vector3());
        if (wp.distanceToSquared(camPos) > 36) continue;
        targets.push(i.object);
      }
      if (targets.length) {
        const tmp = new THREE.Vector3();
        const near = this.occluders.filter((o) => {
          if (!o.parent) return false;
          const m = o as THREE.Mesh;
          let r = 1;
          if (m.geometry) {
            if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
            r = m.geometry.boundingSphere!.radius;
          }
          return o.getWorldPosition(tmp).distanceTo(camPos) - r < 4;
        });
        const hits = this.raycaster.intersectObjects([...targets, ...near], true);
        for (const h of hits) {
          const owner = this.findOwner(h.object);
          if (owner && (!owner.enabled || owner.enabled())) {
            if (h.distance <= (owner.range ?? 3.0)) this.current = owner;
            break;
          }
          // first hit is an occluder: blocked
          if (!owner) break;
        }
      }
    }
    const p = this.current ? (typeof this.current.prompt === 'function' ? this.current.prompt() : this.current.prompt) : null;
    this.ctx.hud.setPrompt(p);
  }

  interact(): void {
    if (this.current) {
      const c = this.current;
      try {
        c.onInteract();
      } catch (err) {
        console.error('[interaction] failed', c.id, err);
      }
    }
  }
}
