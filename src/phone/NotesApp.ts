import type { GameContext } from '../core/Context';
import { CLUES } from '../story/StoryData';
import { appHeader, esc, h, APP_ICONS, type PhoneApp } from './PhoneApp';

/** Clues are stored here automatically. */
export class NotesApp implements PhoneApp {
  id = 'notes';
  name = 'Notes';
  color = 'linear-gradient(#f7c948,#e0a800)';
  icon = APP_ICONS.notes;
  private selected: string | null = null;

  constructor(private ctx: GameContext) {}

  onOpen(): boolean {
    this.selected = null;
    return true;
  }

  onBack(): boolean {
    if (this.selected) {
      this.selected = null;
      return true;
    }
    return false;
  }

  render(root: HTMLElement): void {
    const app = h('div', 'app');
    const clues = this.ctx.clues.list().reverse();
    if (this.selected) {
      const c = CLUES[this.selected];
      app.appendChild(appHeader(c.title, () => this.back(), 'Notes'));
      const body = h('div', 'app-body');
      body.appendChild(h('div', `note-body ${c.major ? 'major' : ''}`, esc(c.text)));
      app.appendChild(body);
    } else {
      app.appendChild(appHeader(`Notes`, () => this.ctx.phone.goHome(), 'Home'));
      const body = h('div', 'app-body');
      const major = this.ctx.clues.majorFound();
      body.appendChild(h('div', 'gps-note', `${clues.length} notes · key clues ${major}/${this.ctx.clues.majorTotal()}`));
      if (!clues.length) body.appendChild(h('div', 'gps-note', 'No notes yet.'));
      for (const id of clues) {
        const c = CLUES[id];
        const it = h('div', 'list-item', '', () => {
          this.selected = id;
          this.ctx.audio.play('ui_tap', { bus: 'ui' });
          this.ctx.phone.refresh();
        });
        it.innerHTML = `<div class="main"><div class="t">${esc(c.title)}${c.major ? '<span style="color:#ff9f0a">KEY</span>' : ''}</div><div class="p">${esc(c.text.split('\n')[0])}</div></div>`;
        body.appendChild(it);
      }
      app.appendChild(body);
    }
    root.appendChild(app);
  }

  private back(): void {
    this.selected = null;
    this.ctx.audio.play('ui_back', { bus: 'ui' });
    this.ctx.phone.refresh();
  }
}
