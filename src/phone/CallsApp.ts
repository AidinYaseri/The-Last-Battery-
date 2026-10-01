import type { GameContext } from '../core/Context';
import { CALLS } from '../story/StoryData';
import type { Line } from '../story/DialogueSystem';
import { appHeader, esc, h, APP_ICONS, type PhoneApp } from './PhoneApp';

interface Contact {
  name: string;
  lines: () => Line[];
  requires?: string;
}

/** Call history (some entries appear mysteriously) and outgoing calls (1% / 10 s). */
export class CallsApp implements PhoneApp {
  id = 'calls';
  name = 'Phone';
  color = 'linear-gradient(#5cf07a,#20b845)';
  icon = APP_ICONS.calls;
  private tab: 'recent' | 'contacts' = 'recent';

  constructor(private ctx: GameContext) {}

  private contacts(): Contact[] {
    const st = this.ctx.state;
    return [
      {
        name: 'Mom',
        lines: () => [
          { text: '(ringing...)', voice: 'none', dur: 3 },
          { text: 'The number you have dialed is not in service. Please check the number and try again.', speaker: 'RECORDING', voice: 'phone' },
        ],
      },
      {
        name: 'Dana (Editor)',
        lines: () => [
          { text: '(ringing...)', voice: 'none', dur: 3 },
          { text: "Hi, you've reached Dana Okafor at the Ledger. Leave a message.", speaker: 'DANA', voice: 'phone' },
          { text: '(beep)', voice: 'none', dur: 1.5 },
        ],
      },
      {
        name: 'Mara',
        lines: () => [
          { text: '(static)', voice: 'none', dur: 3 },
          { text: 'it keeps resetting...', speaker: '???', voice: 'whisper' },
          { text: '(the line goes dead)', voice: 'none', dur: 2 },
        ],
      },
      ...(st.has('L5')
        ? [
            {
              name: 'Me',
              lines: (): Line[] => [
                { text: '(it rings once)', voice: 'none', dur: 2 },
                { text: "You found the number. Good. Listen, we don't have long.", speaker: 'YOU', voice: 'self' },
                { text: "The machine is in the basement. If you know everything, you can break it. If you don't, follow the white marks and don't look back.", speaker: 'YOU', voice: 'self' },
              ],
            },
          ]
        : []),
    ];
  }

  onOpen(): boolean {
    this.tab = 'recent';
    return true;
  }

  render(root: HTMLElement): void {
    const st = this.ctx.state;
    const app = h('div', 'app');
    app.appendChild(appHeader(this.tab === 'recent' ? 'Recents' : 'Contacts', () => this.ctx.phone.goHome(), 'Home'));
    const body = h('div', 'app-body');
    const tabs = h('div', 'map-controls');
    tabs.style.flexDirection = 'row';
    tabs.style.marginTop = '0';
    tabs.style.marginBottom = '8px';
    tabs.appendChild(h('div', `btn ${this.tab === 'recent' ? 'primary' : ''}`, 'Recents', () => this.setTab('recent')));
    tabs.appendChild(h('div', `btn ${this.tab === 'contacts' ? 'primary' : ''}`, 'Contacts', () => this.setTab('contacts')));
    body.appendChild(tabs);
    if (this.tab === 'recent') {
      for (const c of CALLS) {
        if (c.requires && !st.has(c.requires)) continue;
        if (c.hideIf && st.has(c.hideIf)) continue;
        const it = h('div', `list-item ${c.kind === 'missed' ? 'missed' : ''}`);
        const kind = c.kind === 'in' ? '↙ Incoming' : c.kind === 'out' ? '↗ Outgoing' : '✕ Missed';
        it.innerHTML = `<div class="avatar ${c.name === 'UNKNOWN' ? 'unknown' : ''}">${c.name === 'UNKNOWN' ? '?' : c.name[0]}</div><div class="main"><div class="t">${esc(c.name)}<span>${esc(c.time)}</span></div><div class="p">${kind}${c.duration ? ` · ${c.duration}` : ''}</div></div>`;
        body.appendChild(it);
      }
    } else {
      body.appendChild(h('div', 'gps-note', 'Calls use 1% battery every 10 seconds.'));
      for (const c of this.contacts()) {
        const it = h('div', 'list-item', '', () => this.call(c));
        it.innerHTML = `<div class="avatar">${c.name[0]}</div><div class="main"><div class="t">${esc(c.name)}<span style="color:#30d158">CALL</span></div></div>`;
        body.appendChild(it);
      }
    }
    app.appendChild(body);
    root.appendChild(app);
  }

  private setTab(t: 'recent' | 'contacts'): void {
    this.tab = t;
    this.ctx.audio.play('ui_tap', { bus: 'ui' });
    this.ctx.phone.refresh();
  }

  private call(c: Contact): void {
    if (!this.ctx.phone.hasSignal()) {
      this.ctx.phone.toast('No service.');
      return;
    }
    this.ctx.phone.startCall({ who: c.name, incoming: false, lines: c.lines() });
  }
}
