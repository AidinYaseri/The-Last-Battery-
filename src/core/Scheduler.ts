/**
 * Game-time scheduler. Timers and tweens only advance while the game updates,
 * so pausing the game also pauses scripted sequences.
 */
interface Timer {
  at: number;
  resolve: () => void;
}

interface Tween {
  start: number;
  duration: number;
  ease: (t: number) => number;
  onUpdate: (t: number) => void;
  resolve: () => void;
  cancelled: boolean;
}

export const Ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
};

export class Scheduler {
  time = 0;
  private timers: Timer[] = [];
  private tweens: Tween[] = [];

  update(dt: number): void {
    this.time += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > this.time);
        due.forEach((t) => t.resolve());
      }
    }
    if (this.tweens.length) {
      for (const tw of this.tweens) {
        if (tw.cancelled) continue;
        const p = Math.min(1, (this.time - tw.start) / tw.duration);
        tw.onUpdate(tw.ease(p));
        if (p >= 1) {
          tw.cancelled = true;
          tw.resolve();
        }
      }
      this.tweens = this.tweens.filter((t) => !t.cancelled);
    }
  }

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ at: this.time + seconds, resolve }));
  }

  tween(duration: number, onUpdate: (t: number) => void, ease = Ease.inOut): Promise<void> & { cancel: () => void } {
    let tw!: Tween;
    const p = new Promise<void>((resolve) => {
      tw = { start: this.time, duration: Math.max(0.0001, duration), ease, onUpdate, resolve, cancelled: false };
      this.tweens.push(tw);
    }) as Promise<void> & { cancel: () => void };
    p.cancel = () => {
      tw.cancelled = true;
    };
    return p;
  }

  clear(): void {
    this.timers = [];
    this.tweens.forEach((t) => (t.cancelled = true));
    this.tweens = [];
  }
}

/** Real-time sleep for UI flows that run outside of gameplay. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
