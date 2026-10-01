import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { CameraController } from './CameraController';
import { MovementController } from './MovementController';

export type Surface = 'dirt' | 'gravel' | 'wood' | 'concrete' | 'asphalt' | 'leaves';

/** The first-person player: position, look, movement and footsteps. */
export class Player {
  pos = new THREE.Vector3();
  radius = 0.33;
  eyeHeight = 1.65;
  cam: CameraController;
  move: MovementController;
  canMove = true;
  canLook = true;
  speed = 0;
  heightAt: (x: number, z: number) => number = () => 0;
  surfaceAt: (x: number, z: number) => Surface = () => 'dirt';
  private y = 0;

  constructor(private ctx: GameContext) {
    this.cam = new CameraController(ctx.camera);
    this.move = new MovementController(ctx.input, ctx.collision);
    this.move.onStep = () => this.footstep();
  }

  get yaw(): number {
    return this.cam.yaw;
  }

  teleport(x: number, z: number, yaw?: number, pitch = 0): void {
    this.pos.set(x, this.heightAt(x, z), z);
    this.y = this.pos.y;
    if (yaw !== undefined) {
      this.cam.yaw = yaw;
      this.cam.pitch = pitch;
    }
    this.move.velocity.set(0, 0);
    this.cam.update(0, this.pos, this.eyeHeight, 0, false, 0);
  }

  footstep(): void {
    const s = this.surfaceAt(this.pos.x, this.pos.z);
    const vol = this.move.sprinting ? 0.55 : 0.35;
    this.ctx.audio.play(`step_${s}`, { volume: vol, rate: 0.9 + Math.random() * 0.2, reverb: 0.15 });
  }

  update(dt: number, time: number, lookEnabled: boolean): void {
    const { input, settings } = this.ctx;
    if (lookEnabled && this.canLook) {
      const m = input.consumeMouse();
      this.cam.look(m.dx, m.dy, settings.data.sensitivity, settings.data.invertY);
    }
    this.speed = this.move.update(dt, this.pos, this.cam.yaw, this.radius, this.canMove);
    const gy = this.heightAt(this.pos.x, this.pos.z);
    this.y += (gy - this.y) * Math.min(1, dt * 12);
    this.pos.y = this.y;
    this.cam.update(dt, this.pos, this.eyeHeight, this.speed, this.move.sprinting, time);
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
  }
}
