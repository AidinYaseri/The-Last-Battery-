import type { GameContext } from '../core/Context';
import { buildSettings } from './SettingsPanel';

/** ESC menu: resume, settings, save & quit. */
export class PauseMenu {
  private el: HTMLDivElement;
  private box: HTMLDivElement;

  constructor(private ctx: GameContext, ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'panel hidden';
    this.box = document.createElement('div');
    this.box.className = 'box';
    this.el.appendChild(this.box);
    ui.appendChild(this.el);
  }

  show(): void {
    this.renderMain();
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  private renderMain(): void {
    const st = this.ctx.state.data;
    const mins = Math.floor(st.playTime / 60);
    this.box.innerHTML = `<h2>PAUSED</h2>
      <div style="font-size:13px;color:#8a867e;line-height:1.9;margin-bottom:6px">
        LEVEL ${st.level} · BATTERY ${this.ctx.battery.display}% · ${mins} MIN PLAYED<br/>
        ${st.objective ? `OBJECTIVE: ${st.objective}` : ''}
      </div>
      <div class="actions">
        <button class="act" data-a="resume">RESUME</button>
        <button class="act" data-a="settings">SETTINGS</button>
        <button class="act danger" data-a="quit">SAVE &amp; QUIT</button>
      </div>`;
    this.box.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const a = (b as HTMLButtonElement).dataset.a;
        if (a === 'resume') this.ctx.game.resume();
        if (a === 'settings') this.renderSettings();
        if (a === 'quit') {
          this.ctx.save.save();
          this.ctx.game.toMenu();
        }
      }),
    );
  }

  private renderSettings(): void {
    this.box.innerHTML = `<h2>SETTINGS</h2><div class="s"></div><div class="actions"><button class="act">BACK</button></div>`;
    buildSettings(this.ctx, this.box.querySelector('.s') as HTMLDivElement);
    (this.box.querySelector('.actions .act') as HTMLButtonElement).addEventListener('click', () => this.renderMain());
  }
}
