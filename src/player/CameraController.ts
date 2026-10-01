import * as THREE from 'three';

/** First-person camera: mouse look, head bob, shake and scripted look-at. */
export class CameraController {
  yaw = 0;
  pitch = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  shake = 0;
  roll = 0;
  eyeOffset = 0;
  private scripted: { yaw: number; pitch: number; k: number } | null = null;
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(public camera: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    if (this.scripted) return;
    const s = 0.0022 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  /** Smoothly steer the view toward a yaw/pitch (for cutscenes). */
  lookTowards(yaw: number, pitch: number, k = 2.5): void {
    this.scripted = { yaw, pitch, k };
  }

  release(): void {
    this.scripted = null;
  }

  lookAtPoint(from: THREE.Vector3, to: THREE.Vector3, k = 2.5): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.lookTowards(yaw, pitch, k);
  }

  update(dt: number, feet: THREE.Vector3, eyeHeight: number, speed: number, sprinting: boolean, time: number): void {
    if (this.scripted) {
      let dyaw = this.scripted.yaw - this.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const k = 1 - Math.exp(-this.scripted.k * dt);
      this.yaw += dyaw * k;
      this.pitch += (this.scripted.pitch - this.pitch) * k;
    }
    const moving = Math.min(1, speed / 2.5);
    this.bobAmount += (moving - this.bobAmount) * Math.min(1, dt * 6);
    this.bobPhase += dt * (sprinting ? 11.5 : 8.2) * Math.min(1.3, speed / 2.7 + 0.1);
    const bobY = Math.sin(this.bobPhase) * 0.035 * this.bobAmount * (sprinting ? 1.5 : 1);
    const bobX = Math.cos(this.bobPhase * 0.5) * 0.025 * this.bobAmount;
    // subtle idle breathing
    const breath = Math.sin(time * 1.4) * 0.006;
    const sh = this.shake;
    const shx = sh ? (Math.random() - 0.5) * sh * 0.05 : 0;
    const shy = sh ? (Math.random() - 0.5) * sh * 0.05 : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);

    this.euler.set(this.pitch + shy, this.yaw + shx, this.roll + bobX * 0.15);
    this.camera.quaternion.setFromEuler(this.euler);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(feet.x + right.x * bobX, feet.y + eyeHeight + this.eyeOffset + bobY + breath, feet.z + right.z * bobX);
  }

  get bobStep(): number {
    return this.bobPhase;
  }
}
