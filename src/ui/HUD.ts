import { bus } from '../core/Events';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export const ICONS = {
  message: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.5 6.1L4.6 21l4.3-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/></svg>`,
  call: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>`,
};

/** Heads-up display: prompts, objective, toasts, subtitles, meters and banners. */
export class HUD {
  root: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private prompt: HTMLDivElement;
  private objective: HTMLDivElement;
  private objText: HTMLDivElement;
  private toasts: HTMLDivElement;
  private msg: HTMLDivElement;
  private sub: HTMLDivElement;
  private flashBar: HTMLDivElement;
  private flashFill: HTMLDivElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private miniBatt: HTMLDivElement;
  private banner: HTMLDivElement;
  private hintEl: HTMLDivElement;
  inventoryEl: HTMLDivElement;
  viewfinder: HTMLDivElement;
  flashWhite: HTMLDivElement;
  miniShot: HTMLImageElement;
  private msgTimer = 0;
  private subTimer = 0;
  private bannerTimer = 0;
  private hintTimer = 0;
  private objTimer = 0;

  constructor(ui: HTMLElement) {
    this.root = el('div', 'hud hidden', ui);
    el('div', 'vignette', this.root);
    this.crosshair = el('div', 'crosshair', this.root);
    this.prompt = el('div', 'prompt', this.root);
    this.objective = el('div', 'objective', this.root, '<div class="label">OBJECTIVE</div>');
    this.objText = el('div', 'text', this.objective);
    this.toasts = el('div', 'toasts', this.root);
    this.msg = el('div', 'message', this.root);
    this.sub = el('div', 'subtitle', ui);
    const bars = el('div', 'bars', this.root);
    this.flashBar = el('div', 'bar', bars, '<span>LIGHT</span><div class="track"><div class="fill"></div></div>');
    this.flashFill = this.flashBar.querySelector('.fill') as HTMLDivElement;
    this.stamina = el('div', 'stamina', this.root, '<div class="fill"></div>');
    this.staminaFill = this.stamina.querySelector('.fill') as HTMLDivElement;
    this.miniBatt = el('div', 'mini-battery', this.root, '<div class="battery-icon"><div class="lvl"></div></div><span></span>');
    this.banner = el('div', 'banner', ui);
    this.hintEl = el('div', 'hint', this.root);
    this.inventoryEl = el('div', 'inventory', this.root);
    this.viewfinder = el(
      'div',
      'viewfinder',
      ui,
      `<div class="frame"></div><div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div><div class="focus"></div><div class="rec">PHOTO</div><div class="bat"></div><div class="info">[CLICK] or [E] take photo (1%)  ·  [TAB] back</div>`,
    );
    this.flashWhite = el('div', 'flash-white', ui);
    this.miniShot = el('img', 'phone-mini-shot', ui);
    el('div', 'grain', ui);
    bus.on('flashlight:changed', () => undefined);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.prompt.innerHTML = `<kbd>E</kbd>${text}`;
      this.prompt.classList.add('show');
      this.crosshair.classList.add('active');
    } else {
      this.prompt.classList.remove('show');
      this.crosshair.classList.remove('active');
    }
  }

  setCrosshair(v: boolean): void {
    this.crosshair.style.display = v ? '' : 'none';
  }

  setObjective(text: string, flash = true): void {
    this.objText.textContent = text;
    this.objective.style.display = text ? '' : 'none';
    if (flash && text) {
      this.objective.classList.add('flash');
      this.objTimer = 7;
    }
  }

  toast(text: string, kind: 'clue' | 'item' | 'info' = 'info', label?: string): void {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    const lbl = label ?? (kind === 'clue' ? 'NOTE ADDED' : kind === 'item' ? 'PICKED UP' : '');
    t.innerHTML = `${lbl ? `<small>${lbl}</small>` : ''}${text}`;
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 5000);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
  }

  message(text: string, seconds = 3): void {
    this.msg.textContent = text;
    this.msg.classList.add('show');
    this.msgTimer = seconds;
  }

  subtitle(text: string, speaker: string | null, seconds: number, thought = false): void {
    this.sub.innerHTML = speaker ? `<span class="spk">${speaker}</span>${text}` : text;
    this.sub.classList.toggle('thought', thought);
    this.sub.classList.add('show');
    this.subTimer = seconds;
  }

  clearSubtitle(): void {
    this.sub.classList.remove('show');
    this.subTimer = 0;
  }

  hint(html: string, seconds = 6): void {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.add('show');
    this.hintTimer = seconds;
  }

  clearHint(): void {
    this.hintEl.classList.remove('show');
  }

  showBanner(title: string, text: string, kind: 'message' | 'call' = 'message', hint = '', seconds = 5): void {
    this.banner.innerHTML = `<div class="ico ${kind}">${ICONS[kind]}</div><div><div class="ttl">${title}</div><div class="txt">${text}</div></div><div class="hint">${hint}</div>`;
    this.banner.classList.add('show');
    this.bannerTimer = seconds;
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
    this.bannerTimer = 0;
  }

  setFlashlight(visible: boolean, charge: number, on: boolean): void {
    const show = visible && (on || charge < 100);
    this.flashBar.classList.toggle('show', show);
    this.flashBar.classList.toggle('low', charge < 15);
    this.flashFill.style.width = `${Math.max(0, Math.min(100, charge))}%`;
    this.flashBar.style.opacity = show ? (on ? '0.9' : '0.4') : '0';
  }

  setStamina(v: number): void {
    this.stamina.classList.toggle('show', v < 0.99);
    this.staminaFill.style.width = `${v * 100}%`;
  }

  setMiniBattery(show: boolean, pct: number, critical: boolean): void {
    this.miniBatt.classList.toggle('show', show);
    this.miniBatt.classList.toggle('critical', critical);
    (this.miniBatt.querySelector('span') as HTMLSpanElement).textContent = `${pct}%`;
    (this.miniBatt.querySelector('.lvl') as HTMLDivElement).style.width = `${Math.max(1, Math.min(22, (pct / 100) * 22))}px`;
  }

  flash(strength = 0.9): void {
    this.flashWhite.style.transition = 'none';
    this.flashWhite.style.opacity = String(strength);
    requestAnimationFrame(() => {
      this.flashWhite.style.transition = 'opacity 0.6s ease';
      this.flashWhite.style.opacity = '0';
    });
  }

  showShot(dataUrl: string): void {
    this.miniShot.src = dataUrl;
    this.miniShot.classList.add('show');
    setTimeout(() => this.miniShot.classList.remove('show'), 1800);
  }

  update(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('show');
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    }
    if (this.objTimer > 0) {
      this.objTimer -= dt;
      if (this.objTimer <= 0) this.objective.classList.remove('flash');
    }
  }
}
