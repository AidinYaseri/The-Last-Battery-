import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { CollisionWorld } from '../world/Colliders';

/** WASD movement with sprint stamina, acceleration and collisions. */
export class MovementController {
  velocity = new THREE.Vector2();
  stamina = 1;
  sprinting = false;
  walkSpeed = 2.7;
  sprintSpeed = 5.0;
  speedScale = 1;
  private exhausted = false;
  stepDistance = 0;
  onStep: (() => void) | null = null;

  constructor(private input: Input, private collision: CollisionWorld) {}

  update(dt: number, pos: THREE.Vector3, yaw: number, radius: number, enabled: boolean): number {
    let fx = 0;
    let fz = 0;
    if (enabled) {
      if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) fz -= 1;
      if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) fz += 1;
      if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) fx -= 1;
      if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    const wantsSprint = enabled && (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight')) && fz < 0 && len > 0;
    this.sprinting = wantsSprint && !this.exhausted && this.stamina > 0 && this.speedScale >= 0.99;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt / 7);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + dt / (len > 0 ? 9 : 5));
      if (this.stamina > 0.35) this.exhausted = false;
    }
    const speed = (this.sprinting ? this.sprintSpeed : this.walkSpeed) * this.speedScale * (this.exhausted ? 0.8 : 1);
    // rotate by yaw (forward = -Z)
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    const tx = wx * speed;
    const tz = wz * speed;
    const accel = len > 0 ? 10 : 12;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (tx - this.velocity.x) * k;
    this.velocity.y += (tz - this.velocity.y) * k;
    const nx = pos.x + this.velocity.x * dt;
    const nz = pos.z + this.velocity.y * dt;
    const r = this.collision.resolve(nx, nz, radius);
    const moved = Math.hypot(r.x - pos.x, r.z - pos.z);
    // adjust velocity when blocked so we slide instead of sticking
    if (dt > 0) {
      this.velocity.x = (r.x - pos.x) / dt;
      this.velocity.y = (r.z - pos.z) / dt;
    }
    pos.x = r.x;
    pos.z = r.z;
    this.stepDistance += moved;
    const stride = this.sprinting ? 2.0 : 1.55;
    if (this.stepDistance > stride) {
      this.stepDistance = 0;
      this.onStep?.();
    }
    return dt > 0 ? moved / dt : 0;
  }

  get exhaustedState(): boolean {
    return this.exhausted;
  }
}
