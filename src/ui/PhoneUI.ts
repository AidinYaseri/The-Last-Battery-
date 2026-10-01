import type { GameContext } from '../core/Context';
import type { Phone } from '../phone/Phone';
import { APP_ICONS, h } from '../phone/PhoneApp';
import type { VirtualCursor } from './VirtualCursor';

/** DOM rendering for the phone: frame, status bar, home screen, apps, call screen. */
export class PhoneUI {
  wrap: HTMLDivElement;
  screen: HTMLDivElement;
  private status: HTMLDivElement;
  private area: HTMLDivElement;
  private callEl: HTMLDivElement | null = null;
  private toastEl: HTMLDivElement | null = null;
  private toastTimer = 0;
  private statusTimer = 0;

  constructor(private ctx: GameContext, private phone: Phone, root: HTMLElement, private cursor: VirtualCursor) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'phone-wrap interactive';
    this.wrap.innerHTML = `<div class="phone-help">
        <div><kbd>MOUSE</kbd> move cursor · <kbd>CLICK</kbd> select</div>
        <div><kbd>1</kbd>-<kbd>6</kbd> open apps · <kbd>T</kbd> torch</div>
        <div><kbd>BACKSPACE</kbd> back · <kbd>TAB</kbd> put away</div>
        <div>You can still walk with <kbd>WASD</kbd></div>
      </div><div class="phone"><div class="screen"><div class="island"></div><div class="statusbar"></div><div class="app-area"></div><div class="home-bar clickable"><i></i></div></div></div>`;
    root.appendChild(this.wrap);
    this.screen = this.wrap.querySelector('.screen') as HTMLDivElement;
    this.status = this.wrap.querySelector('.statusbar') as HTMLDivElement;
    this.area = this.wrap.querySelector('.app-area') as HTMLDivElement;
    (this.wrap.querySelector('.home-bar') as HTMLDivElement).addEventListener('click', () => {
      if (this.phone.app) this.phone.goHome();
    });
    this.applySettings();
  }

  applySettings(): void {
    const s = this.ctx.settings.data;
    this.screen.style.filter = `brightness(${s.phoneBrightness})`;
    this.screen.style.fontSize = `${s.phoneTextSize}em`;
    (this.area.style as any).zoom = String(s.phoneTextSize);
  }

  setOpen(open: boolean): void {
    this.wrap.classList.toggle('open', open);
    if (open) this.cursor.show(this.screen);
    else this.cursor.hide();
  }

  setViewfinder(on: boolean): void {
    this.ctx.hud.viewfinder.classList.toggle('show', on);
    this.wrap.classList.toggle('open', !on && this.phone.isOpen);
    if (on) this.cursor.hide();
    else if (this.phone.isOpen) this.cursor.show(this.screen, false);
    this.updateViewfinder();
  }

  updateViewfinder(): void {
    const bat = this.ctx.hud.viewfinder.querySelector('.bat') as HTMLDivElement;
    bat.textContent = `BATTERY ${this.ctx.battery.display}%`;
    bat.style.color = this.ctx.battery.critical ? '#ff453a' : '#fff';
  }

  setScreenOff(off: boolean): void {
    this.screen.classList.toggle('off', off);
  }

  renderStatus(): void {
    const b = this.ctx.battery;
    const pct = b.display;
    const bars = this.phone.signalBars();
    const lv = this.ctx.levels.current;
    const special = lv?.signalLabel?.();
    const sig = special
      ? `<span class="nosvc">${special}</span>`
      : bars > 0
        ? `<div class="sig">${[1, 2, 3, 4].map((i) => `<i class="${i <= bars ? 'on' : ''}" style="height:${i * 2.5}px"></i>`).join('')}</div>`
        : `<span class="nosvc">No Svc</span>`;
    const gps = this.phone.gpsOn ? `<span style="color:#0a84ff">➤</span>` : '';
    const lvlW = Math.max(1, Math.min(18, (pct / 100) * 18));
    this.status.className = `statusbar ${b.critical ? 'low' : ''}`;
    this.status.innerHTML = `<div class="time">${this.ctx.state.clockString()}</div><div class="right">${gps}${sig}<div class="batt">${pct}%<div class="battery-icon"><div class="lvl" style="width:${lvlW}px"></div></div></div></div>`;
    if (this.phone.viewfinder) this.updateViewfinder();
  }

  render(): void {
    this.renderStatus();
    this.area.innerHTML = '';
    if (this.phone.app) this.phone.app.render(this.area);
    else this.renderHome();
    if (this.phone.call) this.renderCall();
    else {
      this.callEl?.remove();
      this.callEl = null;
    }
    this.cursor.refreshHover();
  }

  private renderHome(): void {
    const b = this.ctx.battery;
    const home = h('div', 'home');
    home.appendChild(h('div', 'clock', this.ctx.state.clockString()));
    home.appendChild(h('div', 'date', this.ctx.state.longDate()));
    home.appendChild(h('div', `bigbatt ${b.critical ? 'low' : ''}`, `<div class="battery-icon" style="width:30px;height:14px"><div class="lvl" style="width:${Math.max(1, (b.display / 100) * 26)}px"></div></div> BATTERY: <b>${b.display}%</b>`));
    const grid = h('div', 'grid');
    this.phone.apps.forEach((a, i) => {
      const icon = h('div', 'app-icon', '', () => this.phone.launch(a.id));
      const badge = a.badge?.() ?? 0;
      icon.innerHTML = `<div class="ic" style="background:${a.color}">${a.icon}</div><span>${i + 1} · ${a.name}</span>${badge ? `<div class="badge">${badge}</div>` : ''}`;
      grid.appendChild(icon);
    });
    home.appendChild(grid);
    home.appendChild(h('div', 'spacer'));
    const row = h('div', 'torch-row');
    const torch = h('div', `round-btn ${this.phone.torchOn ? 'on' : ''}`, `${APP_ICONS.torch}<small>T · TORCH 1%/min</small>`, () => this.phone.setTorch(!this.phone.torchOn));
    const gps = h('div', `round-btn ${this.phone.gpsOn ? 'on' : ''}`, `${APP_ICONS.gps}<small>GPS 1%/30s</small>`, () => this.phone.setGPS(!this.phone.gpsOn));
    row.append(torch, gps);
    home.appendChild(row);
    const drains = this.ctx.battery.activeDrains();
    home.appendChild(h('div', 'tip', drains.length ? `<span style="color:#ff9f0a">Draining: ${drains.join(', ')}</span>` : 'Opening the phone is free. Using it is not.'));
    this.area.appendChild(home);
  }

  private renderCall(): void {
    const c = this.phone.call!;
    this.callEl?.remove();
    const el = h('div', 'call-screen');
    const unknown = c.opts.who === 'UNKNOWN';
    el.innerHTML = `<div class="avatar ${unknown ? 'unknown' : ''}">${unknown ? '?' : c.opts.who[0]}</div><div class="who">${c.opts.who}</div><div class="st"></div>`;
    const btns = h('div', 'btns');
    if (c.phase === 'ringing') {
      btns.appendChild(h('div', 'call-btn decline', `${APP_ICONS.calls}<small>Decline</small>`, () => this.phone.decline()));
      btns.appendChild(h('div', 'call-btn accept', `${APP_ICONS.calls}<small>Answer (E)</small>`, () => this.phone.answer()));
    } else {
      btns.appendChild(h('div', 'call-btn decline', `${APP_ICONS.calls}<small>End (Backspace)</small>`, () => this.phone.decline()));
    }
    el.appendChild(btns);
    this.screen.appendChild(el);
    this.callEl = el as HTMLDivElement;
    this.updateCall();
  }

  updateCall(): void {
    const c = this.phone.call;
    if (!c || !this.callEl) return;
    const st = this.callEl.querySelector('.st') as HTMLDivElement;
    if (c.phase === 'ringing') st.textContent = 'incoming call · answering uses 1% / 10s';
    else {
      const s = Math.floor(c.t);
      st.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · using battery`;
    }
    if (c.phase === 'active' && this.callEl.querySelector('.accept')) this.render();
  }

  showToast(text: string): void {
    this.toastEl?.remove();
    this.toastEl = h('div', 'no-signal-toast', text) as HTMLDivElement;
    this.screen.appendChild(this.toastEl);
    this.toastTimer = 2.8;
  }

  showLowBattery(lvl: number): void {
    const el = h('div', 'phone-lowbatt', `<b>Low Battery</b><p>${lvl}% battery remaining.</p>`);
    el.appendChild(h('div', 'btn primary', '<span style="margin:auto">OK</span>', () => el.remove()));
    this.screen.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEl?.remove();
        this.toastEl = null;
      }
    }
    this.statusTimer += dt;
    if (this.statusTimer > 1) {
      this.statusTimer = 0;
      this.renderStatus();
    }
  }
}
