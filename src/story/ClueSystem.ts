import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';
import { CLUES, MAJOR_CLUES } from './StoryData';

/** Tracks discovered clues. Clues are auto-stored in the phone's Notes app. */
export class ClueSystem {
  constructor(private ctx: GameContext) {}

  has(id: string): boolean {
    return this.ctx.state.data.clues.includes(id);
  }

  add(id: string, silent = false): boolean {
    if (this.has(id) || !CLUES[id]) return false;
    this.ctx.state.data.clues.push(id);
    if (!silent) {
      this.ctx.hud.toast(CLUES[id].title, 'clue', CLUES[id].major ? 'KEY CLUE · NOTES' : 'NOTE ADDED');
      this.ctx.audio.play('ui_tap', { bus: 'ui', volume: 0.6 });
    }
    bus.emit('clue:added', id);
    this.ctx.save.autosave();
    return true;
  }

  list(): string[] {
    return [...this.ctx.state.data.clues];
  }

  majorFound(): number {
    return MAJOR_CLUES.filter((c) => this.has(c)).length;
  }

  majorTotal(): number {
    return MAJOR_CLUES.length;
  }

  allMajor(): boolean {
    return this.majorFound() === this.majorTotal();
  }
}
