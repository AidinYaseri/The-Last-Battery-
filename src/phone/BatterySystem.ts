import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';

/**
 * The phone battery: the heart of the game. Stored as a float percentage
 * that persists between levels. Continuous drains (GPS, torch, calls) are
 * expressed in percent per second.
 */
export class BatterySystem {
  private drains = new Map<string, number>();
  private lastDisplay = -1;
  private warned2 = false;
  private warned1 = false;
  /** Set false during cutscenes/menus so nothing drains. */
  active = true;

  constructor(private ctx: GameContext) {}

  get value(): number {
    return this.ctx.state.data.battery;
  }

  private set value(v: number) {
    this.ctx.state.data.battery = Math.max(0, Math.min(100, v));
  }

  /** What the phone shows: rounds up so "1%" means "some left". */
  get display(): number {
    const v = this.value;
    if (v <= 0) return 0;
    return Math.max(1, Math.ceil(v - 0.001));
  }

  get critical(): boolean {
    return this.value <= 1;
  }

  get dead(): boolean {
    return this.value <= 0;
  }

  resetWarnings(): void {
    this.warned2 = this.value <= 2;
    this.warned1 = this.value <= 1;
    this.lastDisplay = -1;
  }

  setDrain(key: string, perSecond: number): void {
    if (perSecond <= 0) this.drains.delete(key);
    else this.drains.set(key, perSecond);
    bus.emit('battery:drains', this.activeDrains());
  }

  activeDrains(): string[] {
    return Array.from(this.drains.keys());
  }

  clearDrains(): void {
    this.drains.clear();
  }

  /** Immediately consume battery. */
  consume(amount: number, reason = ''): void {
    if (amount <= 0 || this.dead) return;
    this.value = this.value - amount;
    bus.emit('battery:consumed', amount, reason);
    this.afterChange();
  }

  /**
   * Asks the player to confirm when an action would kill the phone,
   * so a battery death is always a conscious choice.
   */
  async request(amount: number, label: string): Promise<boolean> {
    if (this.dead) return false;
    if (amount >= this.value - 0.0001) {
      const ok = await this.ctx.modal.confirm(`${label} will use the last of your battery. Your phone will die.`, [
        { label: 'Do it anyway', value: true, danger: true },
        { label: 'Cancel', value: false },
      ]);
      if (!ok) return false;
    }
    this.consume(amount, label);
    return true;
  }

  charge(amount: number): void {
    this.value = this.value + amount;
    if (this.value > 2) this.warned2 = false;
    if (this.value > 1) this.warned1 = false;
    this.ctx.audio.play('charge', { bus: 'ui' });
    this.afterChange();
  }

  private afterChange(): void {
    const d = this.display;
    if (d !== this.lastDisplay) {
      this.lastDisplay = d;
      bus.emit('battery:changed', this.value, d);
    }
    if (!this.warned2 && this.value <= 2 && this.value > 1) {
      this.warned2 = true;
      bus.emit('battery:low', 2);
    }
    if (!this.warned1 && this.value <= 1 && this.value > 0) {
      this.warned1 = true;
      bus.emit('battery:low', 1);
    }
    if (this.dead) {
      this.drains.clear();
      bus.emit('battery:dead');
    }
  }

  update(dt: number): void {
    if (!this.active || this.dead || this.drains.size === 0) return;
    let total = 0;
    this.drains.forEach((v) => (total += v));
    this.value = this.value - total * dt;
    this.afterChange();
  }
}
