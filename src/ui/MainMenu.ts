import type { GameContext } from '../core/Context';
import { ENDINGS } from '../story/StoryData';
import { buildSettings } from './SettingsPanel';

/** Title screen over a slowly moving night forest. */
export class MainMenu {
  private el: HTMLDivElement;
  private settings: HTMLDivElement;
  private click: HTMLDivElement;
  private loading: HTMLDivElement;

  constructor(private ctx: GameContext, ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'menu hidden';
    ui.appendChild(this.el);
    this.settings = document.createElement('div');
    this.settings.className = 'panel hidden';
    ui.appendChild(this.settings);
    this.click = document.createElement('div');
    this.click.className = 'click-start hidden';
    this.click.innerHTML = `<div class="t">CLICK TO BEGIN</div><div class="h">Best played with headphones, in the dark.<br/>This game uses your mouse and keyboard.</div>`;
    ui.appendChild(this.click);
    this.loading = document.createElement('div');
    this.loading.className = 'loading';
    this.loading.textContent = 'LOADING';
    ui.appendChild(this.loading);
  }

  showClickToStart(onStart: () => void): void {
    this.loading.classList.add('hidden');
    this.click.classList.remove('hidden');
    const go = () => {
      this.click.classList.add('hidden');
      this.click.removeEventListener('click', go);
      onStart();
    };
    this.click.addEventListener('click', go);
  }

  show(): void {
    const meta = this.ctx.save.meta();
    const hasSave = this.ctx.save.hasSave();
    const endings = Object.entries(ENDINGS)
      .sort((a, b) => a[1].num - b[1].num)
      .map(([id, e]) => `<span class="${meta.endings.includes(id) ? 'got' : ''}">${meta.endings.includes(id) ? e.title : '? ? ?'}</span>`)
      .join('');
    this.el.innerHTML = `
      <h1>THE LAST <span class="red">BATTERY</span></h1>
      <div class="subtitle-line">"You have <span class="pct">5%</span> remaining."</div>
      <div class="btns">
        <button class="menu-btn" data-a="new">NEW GAME</button>
        <button class="menu-btn" data-a="continue" ${hasSave ? '' : 'disabled'}>CONTINUE</button>
        <button class="menu-btn" data-a="settings">SETTINGS</button>
      </div>
      <div class="meta">${meta.endings.length ? `<div class="endings">ENDINGS ${meta.endings.length}/4 &nbsp; ${endings}</div>` : ''}<div>WASD MOVE · MOUSE LOOK · E INTERACT · F FLASHLIGHT · TAB PHONE · ESC PAUSE</div></div>
      <div class="corner">A SHORT STORY ABOUT A LONG NIGHT<br/>HEADPHONES RECOMMENDED</div>`;
    this.el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', async () => {
        this.ctx.audio.init();
        const a = (b as HTMLButtonElement).dataset.a;
        if (a === 'new') {
          if (hasSave) {
            const ok = await this.confirmOverwrite();
            if (!ok) return;
          }
          this.ctx.game.newGame();
        } else if (a === 'continue') this.ctx.game.continueGame();
        else if (a === 'settings') this.openSettings();
      }),
    );
    this.el.classList.remove('hidden');
  }

  private confirmOverwrite(): Promise<boolean> {
    return new Promise((resolve) => {
      this.settings.innerHTML = `<div class="box"><h2>NEW GAME</h2><p style="color:#aaa;font-size:14px;line-height:1.6">Starting a new game will overwrite your saved progress.</p><div class="actions"><button class="act danger" data-v="1">START OVER</button><button class="act" data-v="0">CANCEL</button></div></div>`;
      this.settings.classList.remove('hidden');
      this.settings.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          this.settings.classList.add('hidden');
          resolve((b as HTMLButtonElement).dataset.v === '1');
        }),
      );
    });
  }

  private openSettings(): void {
    this.settings.innerHTML = `<div class="box"><h2>SETTINGS</h2><div class="s"></div><div class="actions"><button class="act">BACK</button></div></div>`;
    buildSettings(this.ctx, this.settings.querySelector('.s') as HTMLDivElement);
    (this.settings.querySelector('.actions .act') as HTMLButtonElement).addEventListener('click', () => this.settings.classList.add('hidden'));
    this.settings.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.settings.classList.add('hidden');
  }
}
