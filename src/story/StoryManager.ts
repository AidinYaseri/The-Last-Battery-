import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';
import { THREADS } from './StoryData';

/** Objectives, story flags, incoming messages and scheduled replies. */
export class StoryManager {
  constructor(private ctx: GameContext) {}

  setObjective(text: string, announce = true): void {
    const st = this.ctx.state;
    if (st.data.objective === text) return;
    st.data.objective = text;
    this.ctx.hud.setObjective(text, announce);
    if (announce) this.ctx.audio.play('ui_back', { bus: 'ui', volume: 0.5 });
    this.ctx.save.autosave();
  }

  /** Delivers a message to the phone: sets its flag, marks unread, vibrates. */
  deliver(threadId: string, flag: string, preview?: string): void {
    const st = this.ctx.state;
    if (st.has(flag)) return;
    st.setFlag(flag);
    st.setFlag(`unread:${threadId}`, ((st.flag(`unread:${threadId}`) as number) || 0) + 1);
    const thread = THREADS.find((t) => t.id === threadId);
    const msg = thread?.messages.find((m) => m.requires === flag);
    this.ctx.phone.notify(thread?.name ?? threadId, preview ?? msg?.text ?? '');
    bus.emit('phone:refresh');
  }

  /** Sends a reply from the Messages app. Costs 2% battery. */
  async sendReply(threadId: string, replyId: string): Promise<boolean> {
    const thread = THREADS.find((t) => t.id === threadId);
    const reply = thread?.replies?.find((r) => r.id === replyId);
    if (!thread || !reply) return false;
    if (!this.ctx.phone.hasSignal()) {
      this.ctx.phone.toast('No service. Message not sent.');
      return false;
    }
    const ok = await this.ctx.battery.request(2, 'Sending this message');
    if (!ok) return false;
    this.ctx.state.setFlag(reply.sets);
    this.ctx.audio.play('ui_tap', { bus: 'ui' });
    bus.emit('phone:refresh');
    if (reply.answer) this.scheduleAnswer(threadId, reply.answer.flag, reply.answer.delay, reply.answer.notify);
    return true;
  }

  private scheduleAnswer(threadId: string, flag: string, delay: number, notify: string): void {
    this.ctx.scheduler.wait(delay).then(() => {
      if (this.ctx.game.mode === 'menu') return;
      this.deliver(threadId, flag, notify);
    });
  }

  /** After loading a save, re-schedule replies that never arrived. */
  resume(): void {
    const st = this.ctx.state;
    for (const t of THREADS) {
      for (const r of t.replies ?? []) {
        if (st.has(r.sets) && r.answer && !st.has(r.answer.flag)) this.scheduleAnswer(t.id, r.answer.flag, 5, r.answer.notify);
      }
    }
    this.ctx.hud.setObjective(st.data.objective, false);
  }
}
