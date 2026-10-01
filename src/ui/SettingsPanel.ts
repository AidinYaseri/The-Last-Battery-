import type { GameContext } from '../core/Context';
import type { Quality } from '../core/Settings';

/** Builds the shared settings form (used by main menu and pause menu). */
export function buildSettings(ctx: GameContext, container: HTMLElement): void {
  const s = ctx.settings;
  container.innerHTML = '';
  const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'sensitivity', min: number, max: number, step: number, fmt: (v: number) => string) => {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${s.data[key]}"/><span class="val">${fmt(s.data[key])}</span>`;
    const input = row.querySelector('input') as HTMLInputElement;
    const val = row.querySelector('.val') as HTMLSpanElement;
    input.addEventListener('input', () => {
      s.set(key, Number(input.value));
      val.textContent = fmt(Number(input.value));
    });
    container.appendChild(row);
  };
  const pct = (v: number) => `${Math.round(v * 100)}`;
  slider('Master volume', 'master', 0, 1, 0.05, pct);
  slider('Music volume', 'music', 0, 1, 0.05, pct);
  slider('SFX volume', 'sfx', 0, 1, 0.05, pct);
  slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));

  const q = document.createElement('div');
  q.className = 'set-row';
  q.innerHTML = `<label>Graphics quality</label><div class="seg"></div>`;
  const seg = q.querySelector('.seg') as HTMLDivElement;
  (['low', 'medium', 'high'] as Quality[]).forEach((level) => {
    const b = document.createElement('button');
    b.textContent = level.toUpperCase();
    b.className = s.data.quality === level ? 'on' : '';
    b.addEventListener('click', () => {
      s.set('quality', level);
      seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    });
    seg.appendChild(b);
  });
  container.appendChild(q);

  const inv = document.createElement('div');
  inv.className = 'set-row';
  inv.innerHTML = `<label>Invert mouse Y</label><div class="seg"><button>OFF</button><button>ON</button></div>`;
  const ib = inv.querySelectorAll('button');
  const refreshInv = () => {
    ib[0].className = s.data.invertY ? '' : 'on';
    ib[1].className = s.data.invertY ? 'on' : '';
  };
  ib[0].addEventListener('click', () => {
    s.set('invertY', false);
    refreshInv();
  });
  ib[1].addEventListener('click', () => {
    s.set('invertY', true);
    refreshInv();
  });
  refreshInv();
  container.appendChild(inv);

  const fs = document.createElement('div');
  fs.className = 'set-row';
  fs.innerHTML = `<label>Fullscreen</label><div class="seg"><button class="fsb">${document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'}</button></div>`;
  const fsb = fs.querySelector('.fsb') as HTMLButtonElement;
  fsb.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed */
    }
    setTimeout(() => (fsb.textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN'), 200);
  });
  container.appendChild(fs);

  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = `<div><kbd>WASD</kbd>Move</div><div><kbd>SHIFT</kbd>Sprint</div><div><kbd>MOUSE</kbd>Look</div><div><kbd>E</kbd>Interact</div><div><kbd>F</kbd>Flashlight</div><div><kbd>TAB</kbd>Phone</div><div><kbd>I</kbd>Inventory</div><div><kbd>ESC</kbd>Pause</div>`;
  container.appendChild(controls);
}
