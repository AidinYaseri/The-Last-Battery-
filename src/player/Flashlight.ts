import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';

/**
 * Physical flashlight (F) with its own battery, plus the weaker phone torch.
 * Lights always stay in the scene (intensity 0 when off) to avoid shader recompiles.
 */
export class Flashlight {
  physical: THREE.SpotLight;
  phoneLight: THREE.SpotLight;
  on = false;
  phoneOn = false;
  private flicker = 0;
  private flickerTimer = 0;
  private baseIntensity = 95;
  private phoneIntensity = 16;
  /** Charge drained per second while on (100 = full). */
  drainRate = 100 / 420;
  disabled = false;

  constructor(private ctx: GameContext) {
    const cam = ctx.camera;
    this.physical = new THREE.SpotLight(0xfff1dc, 0, 42, 0.42, 0.55, 1.6);
    this.physical.position.set(0.18, -0.2, 0.1);
    this.physical.target.position.set(0, -0.3, -10);
    this.physical.castShadow = ctx.sceneManager.profile.shadows;
    this.physical.shadow.mapSize.set(ctx.sceneManager.profile.shadowMap, ctx.sceneManager.profile.shadowMap);
    this.physical.shadow.camera.near = 0.3;
    this.physical.shadow.camera.far = 40;
    this.physical.shadow.bias = -0.0008;
    this.physical.shadow.normalBias = 0.02;
    this.phoneLight = new THREE.SpotLight(0xe8f0ff, 0, 15, 0.75, 0.85, 1.8);
    this.phoneLight.position.set(-0.1, -0.25, -0.1);
    this.phoneLight.target.position.set(0, -0.8, -6);
    cam.add(this.physical, this.physical.target, this.phoneLight, this.phoneLight.target);
    bus.on('settings:changed', (k: string) => {
      if (k === 'quality') {
        this.physical.castShadow = ctx.sceneManager.profile.shadows;
        this.physical.shadow.mapSize.set(ctx.sceneManager.profile.shadowMap, ctx.sceneManager.profile.shadowMap);
        this.physical.shadow.map?.dispose();
        (this.physical.shadow as any).map = null;
      }
    });
  }

  get charge(): number {
    return this.ctx.state.data.flashCharge;
  }

  set charge(v: number) {
    this.ctx.state.data.flashCharge = Math.max(0, Math.min(100, v));
  }

  toggle(): void {
    if (this.disabled) return;
    const { inventory, hud, audio } = this.ctx;
    if (!inventory.has('flashlight')) {
      hud.message("You don't have a flashlight. Your phone has a torch (TAB).");
      return;
    }
    if (!this.on && this.charge <= 0) {
      audio.play('flash_on');
      hud.message('The flashlight is dead. You need batteries.');
      return;
    }
    this.setOn(!this.on);
  }

  setOn(on: boolean, silent = false): void {
    this.on = on;
    if (!silent) this.ctx.audio.play(on ? 'flash_on' : 'flash_off', { bus: 'ui' });
    bus.emit('flashlight:changed', this.on);
  }

  setPhoneLight(on: boolean): void {
    if (on && this.ctx.battery.value <= 0) return;
    this.phoneOn = on;
    this.ctx.battery.setDrain('torch', on ? 1 / 60 : 0);
    this.ctx.audio.play('click', { bus: 'ui', volume: 0.5 });
    bus.emit('phonelight:changed', on);
  }

  /** Everything goes dark (battery death ending). */
  killAll(): void {
    this.on = false;
    this.phoneOn = false;
    this.ctx.battery.setDrain('torch', 0);
    this.physical.intensity = 0;
    this.phoneLight.intensity = 0;
    this.disabled = true;
  }

  addCharge(v: number): void {
    this.charge = this.charge + v;
    bus.emit('flashlight:changed', this.on);
  }

  update(dt: number, draining: boolean): void {
    if (this.disabled) {
      this.physical.intensity = 0;
      this.phoneLight.intensity = 0;
      return;
    }
    if (this.on && draining) {
      this.charge = this.charge - this.drainRate * dt;
      if (this.charge <= 0) {
        this.setOn(false, true);
        this.ctx.audio.play('flash_off');
        this.ctx.hud.message('The flashlight dies.');
      }
    }
    let intensity = this.on ? this.baseIntensity : 0;
    if (this.on) {
      // flicker when low, and a very rare random stutter otherwise
      this.flickerTimer -= dt;
      const low = this.charge < 15;
      if (this.flickerTimer <= 0) {
        const chance = low ? 0.35 : 0.01;
        this.flicker = Math.random() < chance ? 0.12 + Math.random() * 0.25 : 0;
        this.flickerTimer = low ? 0.05 + Math.random() * 0.3 : 0.5 + Math.random() * 2;
      }
      if (this.flicker > 0) {
        intensity *= Math.random() > 0.5 ? 0.15 : 0.6;
        this.flicker -= dt;
      }
      if (low) intensity *= 0.55 + (this.charge / 15) * 0.45;
    }
    this.physical.intensity = intensity;
    this.phoneLight.intensity = this.phoneOn ? this.phoneIntensity : 0;
    if (this.phoneOn && this.ctx.battery.value <= 0) {
      this.phoneOn = false;
      this.ctx.battery.setDrain('torch', 0);
    }
  }
}
