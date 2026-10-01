import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';
import type { Line } from '../story/DialogueSystem';
import { PhoneUI } from '../ui/PhoneUI';
import type { VirtualCursor } from '../ui/VirtualCursor';
import { CallsApp } from './CallsApp';
import { CameraApp } from './CameraApp';
import { MapApp } from './MapApp';
import { MessagesApp } from './MessagesApp';
import { NotesApp } from './NotesApp';
import type { PhoneApp } from './PhoneApp';
import { SettingsApp } from './SettingsApp';

export interface CallOpts {
  who: string;
  incoming: boolean;
  lines: Line[];
  ringFor?: number;
  onAnswer?: () => void;
  onMissed?: () => void;
  onEnd?: () => void;
}

interface CallState {
  opts: CallOpts;
  phase: 'ringing' | 'active';
  t: number;
  ringTimer: number;
  token: number;
}

/** The smartphone: apps, notifications, calls, GPS, torch and camera mode. */
export class Phone {
  isOpen = false;
  app: PhoneApp | null = null;
  apps: PhoneApp[];
  ui: PhoneUI;
  gpsOn = false;
  viewfinder = false;
  screenOff = false;
  call: CallState | null = null;
  map: MapApp;
  camera: CameraApp;
  messages: MessagesApp;
  private callToken = 0;

  constructor(private ctx: GameContext, uiRoot: HTMLElement, cursor: VirtualCursor) {
    this.map = new MapApp(ctx);
    this.camera = new CameraApp(ctx);
    this.messages = new MessagesApp(ctx);
    this.apps = [this.map, this.camera, this.messages, new NotesApp(ctx), new CallsApp(ctx), new SettingsApp(ctx)];
    this.ui = new PhoneUI(ctx, this, uiRoot, cursor);
    bus.on('phone:refresh', () => this.refresh());
    bus.on('battery:changed', () => this.ui.renderStatus());
    bus.on('battery:low', (lvl: number) => {
      this.ctx.audio.play('low_battery', { bus: 'ui' });
      this.vibrate();
      if (this.isOpen) this.ui.showLowBattery(lvl);
      else this.ctx.hud.showBanner('Low Battery', `${lvl}% battery remaining.`, 'message', '', 4);
    });
    bus.on('settings:changed', () => this.ui.applySettings());
  }

  get torchOn(): boolean {
    return this.ctx.flashlight.phoneOn;
  }

  toggle(): void {
    if (this.viewfinder) {
      this.exitViewfinder();
      return;
    }
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.ui.setOpen(true);
    this.ctx.audio.play('ui_tap', { bus: 'ui', volume: 0.5 });
    this.ctx.game.setMode('phone');
    this.ctx.hud.hideBanner();
    this.refresh();
    if (!this.ctx.state.has('tut:phone')) {
      this.ctx.state.setFlag('tut:phone');
    }
  }

  close(): void {
    if (this.viewfinder) this.exitViewfinder(false);
    if (!this.isOpen) return;
    this.isOpen = false;
    this.ui.setOpen(false);
    this.app?.onClose?.();
    if (this.ctx.game.mode === 'phone' || this.ctx.game.mode === 'camera') this.ctx.game.setMode('play');
  }

  goHome(): void {
    this.app?.onClose?.();
    this.app = null;
    this.ctx.audio.play('ui_back', { bus: 'ui' });
    this.refresh();
  }

  async launch(id: string): Promise<void> {
    const app = this.apps.find((a) => a.id === id);
    if (!app || this.screenOff) return;
    this.ctx.audio.play('ui_tap', { bus: 'ui' });
    if (app.onOpen) {
      const ok = await app.onOpen();
      if (!ok) return;
    }
    this.app = app;
    this.refresh();
  }

  back(): void {
    if (this.call) return;
    if (this.app) {
      if (this.app.onBack?.()) {
        this.ctx.audio.play('ui_back', { bus: 'ui' });
        this.refresh();
      } else this.goHome();
    } else this.close();
  }

  refresh(): void {
    if (this.isOpen) this.ui.render();
    else this.ui.renderStatus();
  }

  hasSignal(forGps = false): boolean {
    const lv = this.ctx.levels.current;
    if (!lv) return false;
    return lv.signalAt(this.ctx.player.pos.x, this.ctx.player.pos.z, forGps) > 0;
  }

  signalBars(): number {
    const lv = this.ctx.levels.current;
    return lv ? lv.signalAt(this.ctx.player.pos.x, this.ctx.player.pos.z, false) : 0;
  }

  vibrate(): void {
    if (this.ctx.settings.data.vibration) {
      this.ctx.audio.play('phone_vibrate', { volume: 0.8, bus: 'ui' });
      this.ctx.player.cam.shake = Math.max(this.ctx.player.cam.shake, 0.15);
    }
  }

  notify(title: string, text: string): void {
    this.vibrate();
    this.ctx.audio.play('notify', { bus: 'ui', volume: 0.6, delay: 0.1 });
    if (this.isOpen) this.ui.showToast(`${title}: ${text}`);
    else this.ctx.hud.showBanner(title, text, 'message', '[TAB]', 6);
    this.refresh();
  }

  toast(text: string): void {
    if (this.isOpen) this.ui.showToast(text);
    else this.ctx.hud.message(text);
  }

  setGPS(on: boolean): void {
    if (on && this.ctx.battery.dead) return;
    this.gpsOn = on;
    this.ctx.battery.setDrain('GPS', on ? 1 / 30 : 0);
    this.ctx.audio.play('ui_tap', { bus: 'ui' });
    bus.emit('gps:changed', on);
    this.refresh();
  }

  setTorch(on: boolean): void {
    this.ctx.flashlight.setPhoneLight(on);
    this.refresh();
  }

  enterViewfinder(): void {
    if (this.screenOff) return;
    this.viewfinder = true;
    this.ui.setViewfinder(true);
    this.ctx.game.setMode('camera');
  }

  exitViewfinder(reopen = true): void {
    if (!this.viewfinder) return;
    this.viewfinder = false;
    this.ui.setViewfinder(false);
    if (reopen && this.isOpen) {
      this.ctx.game.setMode('phone');
      this.refresh();
    }
  }

  // ------------------------------------------------------------ calls

  startCall(opts: CallOpts): void {
    if (this.call) return;
    const token = ++this.callToken;
    this.call = { opts, phase: opts.incoming ? 'ringing' : 'active', t: 0, ringTimer: 0, token };
    if (opts.incoming) {
      this.vibrate();
      this.ctx.audio.play('ring', { bus: 'ui', volume: 0.35 });
      if (!this.isOpen) this.ctx.hud.showBanner(opts.who, 'Incoming call...', 'call', '[TAB] answer', opts.ringFor ?? 18);
    } else {
      this.beginActive();
    }
    this.refresh();
  }

  answer(): void {
    if (!this.call || this.call.phase !== 'ringing') return;
    this.call.opts.onAnswer?.();
    this.ctx.hud.hideBanner();
    this.beginActive();
    this.refresh();
  }

  decline(): void {
    if (!this.call) return;
    const c = this.call;
    this.call = null;
    this.ctx.audio.play('hangup', { bus: 'ui', volume: 0.5 });
    this.ctx.hud.hideBanner();
    if (c.phase === 'ringing') c.opts.onMissed?.();
    else {
      this.ctx.dialogue.cancel();
      c.opts.onEnd?.();
    }
    this.ctx.battery.setDrain('call', 0);
    this.refresh();
  }

  private async beginActive(): Promise<void> {
    const c = this.call;
    if (!c) return;
    c.phase = 'active';
    c.t = 0;
    this.ctx.battery.setDrain('call', 1 / 10);
    this.ctx.audio.play('click', { bus: 'ui' });
    await this.ctx.dialogue.say(c.opts.lines);
    if (this.call && this.call.token === c.token) {
      this.call = null;
      this.ctx.battery.setDrain('call', 0);
      this.ctx.audio.play('hangup', { bus: 'ui', volume: 0.5 });
      c.opts.onEnd?.();
      this.refresh();
    }
  }

  forceScreenOff(): void {
    this.screenOff = true;
    this.ui.setScreenOff(true);
    if (this.gpsOn) this.setGPS(false);
    if (this.call) this.decline();
  }

  /** Reset between runs/levels. */
  reset(): void {
    this.close();
    this.app = null;
    this.screenOff = false;
    this.ui.setScreenOff(false);
    this.gpsOn = false;
    this.call = null;
    this.ctx.battery.clearDrains();
  }

  handleKey(code: string): void {
    if (!this.isOpen || this.viewfinder) return;
    if (this.call) {
      if (this.call.phase === 'ringing' && (code === 'KeyE' || code === 'Enter')) this.answer();
      else if (code === 'Backspace') this.decline();
      return;
    }
    if (code === 'Backspace' || code === 'Escape') this.back();
    if (!this.app) {
      const m = code.match(/^Digit([1-6])$/);
      if (m) this.launch(this.apps[Number(m[1]) - 1].id);
      if (code === 'KeyT') this.setTorch(!this.torchOn);
    } else this.app.onKey?.(code);
  }

  update(dt: number): void {
    if (this.call) {
      this.call.t += dt;
      if (this.call.phase === 'ringing') {
        this.call.ringTimer += dt;
        if (this.call.ringTimer > 3) {
          this.call.ringTimer = 0;
          this.ctx.audio.play('ring', { bus: 'ui', volume: 0.35 });
          this.vibrate();
        }
        if (this.call.t > (this.call.opts.ringFor ?? 18)) this.decline();
      }
      this.ui.updateCall();
    }
    if (this.isOpen && this.app === this.map) this.map.update(dt);
    this.ui.update(dt);
  }
}
