import type { GameContext } from '../core/Context';
import { PLAYER_NUMBER, THREADS, type ThreadDef } from '../story/StoryData';
import { appHeader, esc, h, APP_ICONS, type PhoneApp } from './PhoneApp';

/** Old messages, unknown messages and replies (sending costs 2%). */
export class MessagesApp implements PhoneApp {
  id = 'messages';
  name = 'Messages';
  color = 'linear-gradient(#5cf07a,#20b845)';
  icon = APP_ICONS.messages;
  private thread: string | null = null;

  constructor(private ctx: GameContext) {}

  private visible(): ThreadDef[] {
    const st = this.ctx.state;
    return THREADS.filter((t) => !t.requires || st.has(t.requires));
  }

  badge(): number {
    const st = this.ctx.state;
    return this.visible().reduce((n, t) => n + (((st.flag(`unread:${t.id}`) as number) || 0) > 0 ? 1 : 0), 0);
  }

  onOpen(): boolean {
    this.thread = null;
    return true;
  }

  onBack(): boolean {
    if (this.thread) {
      this.thread = null;
      return true;
    }
    return false;
  }

  openThread(id: string): void {
    this.thread = id;
    this.ctx.state.setFlag(`unread:${id}`, 0);
  }

  render(root: HTMLElement): void {
    const st = this.ctx.state;
    const app = h('div', 'app');
    if (this.thread) {
      const t = THREADS.find((x) => x.id === this.thread)!;
      const number = t.id === 'unknown' && st.has('L5') ? PLAYER_NUMBER : t.number;
      app.appendChild(appHeader(t.name, () => this.back(), 'Messages'));
      const body = h('div', 'app-body');
      body.appendChild(h('div', 'bubble-time', esc(number)));
      const bubbles = h('div', 'bubbles');
      let lastTime = '';
      for (const m of t.messages) {
        if (m.requires && !st.has(m.requires)) continue;
        if (m.hideIf && st.has(m.hideIf)) continue;
        if (m.time !== lastTime) {
          bubbles.appendChild(h('div', 'bubble-time', esc(m.time)));
          lastTime = m.time;
        }
        bubbles.appendChild(h('div', `bubble ${m.from}`, esc(m.text)));
      }
      body.appendChild(bubbles);
      app.appendChild(body);
      const replies = (t.replies ?? []).filter((r) => (!r.requires || st.has(r.requires)) && !st.has(r.sets));
      if (replies.length) {
        const bar = h('div', 'reply-bar');
        for (const r of replies) {
          bar.appendChild(
            h('div', 'reply-opt', `${esc(r.text)} <small>SEND · 2%</small>`, () => {
              this.ctx.story.sendReply(t.id, r.id).then(() => this.ctx.phone.refresh());
            }),
          );
        }
        app.appendChild(bar);
      }
      root.appendChild(app);
      requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
      return;
    }
    app.appendChild(appHeader('Messages', () => this.ctx.phone.goHome(), 'Home'));
    const body = h('div', 'app-body');
    for (const t of this.visible()) {
      const msgs = t.messages.filter((m) => (!m.requires || st.has(m.requires)) && !(m.hideIf && st.has(m.hideIf)));
      const last = msgs[msgs.length - 1];
      const unread = ((st.flag(`unread:${t.id}`) as number) || 0) > 0;
      const it = h('div', 'list-item', '', () => {
        this.openThread(t.id);
        this.ctx.audio.play('ui_tap', { bus: 'ui' });
        this.ctx.phone.refresh();
      });
      const initials = t.id === 'unknown' ? '?' : t.name[0];
      it.innerHTML = `${unread ? '<div class="dot"></div>' : ''}<div class="avatar ${t.id === 'unknown' ? 'unknown' : ''}">${initials}</div><div class="main"><div class="t">${esc(t.name)}<span>${esc(last?.time ?? '')}</span></div><div class="p">${esc(last?.text ?? '')}</div></div>`;
      body.appendChild(it);
    }
    app.appendChild(body);
    root.appendChild(app);
  }

  private back(): void {
    this.thread = null;
    this.ctx.audio.play('ui_back', { bus: 'ui' });
    this.ctx.phone.refresh();
  }
}
