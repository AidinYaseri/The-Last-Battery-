import type { GameContext } from '../core/Context';

export interface Line {
  text: string;
  speaker?: string;
  voice?: 'radio' | 'recording' | 'whisper' | 'phone' | 'self' | 'none';
  dur?: number;
  thought?: boolean;
  pos?: { x: number; y: number; z: number };
  volume?: number;
}

/** Subtitled lines with synthesised voices. Lines play one after another. */
export class DialogueSystem {
  busy = false;
  private token = 0;

  constructor(private ctx: GameContext) {}

  async say(lines: Line[]): Promise<void> {
    const my = ++this.token;
    this.busy = true;
    for (const l of lines) {
      if (my !== this.token) return;
      const words = l.text.split(/\s+/).length;
      let dur = l.dur ?? Math.max(2.2, words * 0.36 + 1);
      if (l.voice && l.voice !== 'none') {
        const h = this.ctx.audio.voice(l.text, l.voice, { pos: l.pos, volume: l.volume ?? 0.8, refDist: 3 });
        if (!l.dur) dur = Math.max(dur, h.duration + 0.5);
      }
      this.ctx.hud.subtitle(l.text, l.speaker ?? null, dur + 0.3, l.thought);
      await this.ctx.scheduler.wait(dur);
    }
    if (my === this.token) this.busy = false;
  }

  /** The protagonist's inner voice (no audio). */
  thought(text: string, dur?: number): Promise<void> {
    return this.say([{ text, thought: true, dur }]);
  }

  cancel(): void {
    this.token++;
    this.busy = false;
    this.ctx.hud.clearSubtitle();
  }
}
