/**
 * 2D (XZ plane) collision world. The player is a circle; the world is made of
 * circles (trees, rocks) and oriented boxes (walls, cars, furniture).
 */
export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  enabled: boolean;
}

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  cos: number;
  sin: number;
  enabled: boolean;
}

export type Collider = CircleCollider | BoxCollider;

export class CollisionWorld {
  colliders: Collider[] = [];
  bounds = { minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 };
  private grid = new Map<string, Collider[]>();
  private cell = 8;
  private dirty = true;

  clear(): void {
    this.colliders = [];
    this.grid.clear();
    this.dirty = true;
    this.bounds = { minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 };
  }

  setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  addCircle(x: number, z: number, r: number): CircleCollider {
    const c: CircleCollider = { kind: 'circle', x, z, r, enabled: true };
    this.colliders.push(c);
    this.dirty = true;
    return c;
  }

  /** Box centred at x,z with full width w (local X) and depth d (local Z), rotated by rot around Y. */
  addBox(x: number, z: number, w: number, d: number, rot = 0): BoxCollider {
    const c: BoxCollider = { kind: 'box', x, z, hw: w / 2, hd: d / 2, rot, cos: Math.cos(rot), sin: Math.sin(rot), enabled: true };
    this.colliders.push(c);
    this.dirty = true;
    return c;
  }

  remove(c: Collider): void {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    this.dirty = true;
  }

  private rebuild(): void {
    this.grid.clear();
    for (const c of this.colliders) {
      const ext = c.kind === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
      const x0 = Math.floor((c.x - ext) / this.cell);
      const x1 = Math.floor((c.x + ext) / this.cell);
      const z0 = Math.floor((c.z - ext) / this.cell);
      const z1 = Math.floor((c.z + ext) / this.cell);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const k = `${gx},${gz}`;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(c);
        }
      }
    }
    this.dirty = false;
  }

  private nearby(x: number, z: number): Collider[] {
    if (this.dirty) this.rebuild();
    const gx = Math.floor(x / this.cell);
    const gz = Math.floor(z / this.cell);
    const out = new Set<Collider>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.grid.get(`${gx + dx},${gz + dz}`);
        if (arr) arr.forEach((c) => out.add(c));
      }
    }
    return Array.from(out);
  }

  /** Pushes a circle out of all colliders. Returns corrected position. */
  resolve(x: number, z: number, r: number): { x: number; z: number } {
    for (let iter = 0; iter < 3; iter++) {
      const list = this.nearby(x, z);
      for (const c of list) {
        if (!c.enabled) continue;
        if (c.kind === 'circle') {
          const dx = x - c.x;
          const dz = z - c.z;
          const d2 = dx * dx + dz * dz;
          const rr = r + c.r;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.0001;
            x = c.x + (dx / d) * rr;
            z = c.z + (dz / d) * rr;
          }
        } else {
          // to local space
          const dx = x - c.x;
          const dz = z - c.z;
          const lx = dx * c.cos - dz * c.sin;
          const lz = dx * c.sin + dz * c.cos;
          const cx = Math.max(-c.hw, Math.min(c.hw, lx));
          const cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let px = lx - cx;
          let pz = lz - cz;
          const d2 = px * px + pz * pz;
          let nlx = lx;
          let nlz = lz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              nlx = cx + (px / d) * r;
              nlz = cz + (pz / d) * r;
            } else {
              // centre inside box: push out along smallest axis
              const ox = c.hw - Math.abs(lx);
              const oz = c.hd - Math.abs(lz);
              if (ox < oz) nlx = Math.sign(lx || 1) * (c.hw + r);
              else nlz = Math.sign(lz || 1) * (c.hd + r);
            }
            // back to world
            x = c.x + nlx * c.cos + nlz * c.sin;
            z = c.z - nlx * c.sin + nlz * c.cos;
          }
        }
      }
    }
    x = Math.max(this.bounds.minX + r, Math.min(this.bounds.maxX - r, x));
    z = Math.max(this.bounds.minZ + r, Math.min(this.bounds.maxZ - r, z));
    return { x, z };
  }

  /** True if a point (with radius) overlaps any collider. */
  blocked(x: number, z: number, r: number): boolean {
    const p = this.resolve(x, z, r);
    return Math.abs(p.x - x) > 1e-3 || Math.abs(p.z - z) > 1e-3;
  }
}
