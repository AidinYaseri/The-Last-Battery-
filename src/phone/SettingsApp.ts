import type { GameContext } from '../core/Context';
import { PLAYER_FULL, PLAYER_NUMBER } from '../story/StoryData';
import { appHeader, h, APP_ICONS, type PhoneApp } from './PhoneApp';

/** Phone brightness / interface settings and "about" (your own number). */
export class SettingsApp implements PhoneApp {
  id = 'settings';
  name = 'Settings';
  color = 'linear-gradient(#aeaeb2,#636366)';
  icon = APP_ICONS.settings;

  constructor(private ctx: GameContext) {}

  render(root: HTMLElement): void {
    const s = this.ctx.settings;
    const app = h('div', 'app');
    app.appendChild(appHeader('Settings', () => this.ctx.phone.goHome(), 'Home'));
    const body = h('div', 'app-body');
    const row = (label: string, right: HTMLElement) => {
      const r = h('div', 'settings-row', `<span>${label}</span>`);
      r.appendChild(right);
      body.appendChild(r);
    };
    const stepper = (get: () => number, set: (v: number) => void, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const w = h('div', 'stepper');
      const val = h('span', 'v', fmt(get()));
      val.style.width = '44px';
      val.style.background = 'none';
      w.appendChild(
        h('span', '', '−', () => {
          set(Math.max(min, +(get() - step).toFixed(2)));
          this.ctx.phone.refresh();
        }),
      );
      w.appendChild(val);
      w.appendChild(
        h('span', '', '+', () => {
          set(Math.min(max, +(get() + step).toFixed(2)));
          this.ctx.phone.refresh();
        }),
      );
      return w;
    };
    row(
      'Brightness',
      stepper(
        () => s.data.phoneBrightness,
        (v) => s.set('phoneBrightness', v),
        0.4,
        1.3,
        0.1,
        (v) => `${Math.round(v * 100)}%`,
      ),
    );
    row(
      'Text size',
      stepper(
        () => s.data.phoneTextSize,
        (v) => s.set('phoneTextSize', v),
        0.9,
        1.2,
        0.05,
        (v) => `${Math.round(v * 100)}%`,
      ),
    );
    const vib = h('div', `toggle ${s.data.vibration ? 'on' : ''}`, '', () => {
      s.set('vibration', !s.data.vibration);
      this.ctx.phone.refresh();
    });
    row('Vibration', vib);
    body.appendChild(h('div', 'gps-note', 'BATTERY'));
    const b = this.ctx.battery;
    row('Battery level', h('span', 'v', `${b.display}%`));
    row('Battery health', h('span', 'v', 'Service recommended'));
    const drains = b.activeDrains();
    row('Now using battery', h('span', 'v', drains.length ? drains.join(', ') : 'Nothing'));
    body.appendChild(h('div', 'gps-note', 'ABOUT'));
    row('Owner', h('span', 'v', PLAYER_FULL));
    row('My number', h('span', 'v', PLAYER_NUMBER));
    row('Model', h('span', 'v', 'Lumen 12'));
    app.appendChild(body);
    root.appendChild(app);
  }
}
