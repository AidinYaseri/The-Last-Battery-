import type { GameContext } from '../core/Context';
import { bus } from '../core/Events';
import { ITEMS } from '../story/StoryData';

/** Simple list-based inventory stored in the save data. */
export class Inventory {
  constructor(private ctx: GameContext) {}

  get items(): string[] {
    return this.ctx.state.data.inventory;
  }

  has(id: string): boolean {
    return this.items.includes(id);
  }

  add(id: string, silent = false): void {
    if (this.has(id)) return;
    this.items.push(id);
    if (!silent) {
      this.ctx.hud.toast(ITEMS[id]?.name ?? id, 'item');
      this.ctx.audio.play('pickup', { bus: 'ui' });
    }
    bus.emit('inventory:changed');
    this.ctx.save.autosave();
  }

  remove(id: string): void {
    const i = this.items.indexOf(id);
    if (i >= 0) this.items.splice(i, 1);
    bus.emit('inventory:changed');
  }

  render(el: HTMLElement): void {
    const list = this.items
      .map((id) => ITEMS[id])
      .filter(Boolean)
      .map((it) => `<div class="item"><b>${it.name}</b><div>${it.desc}</div></div>`)
      .join('');
    const c = this.ctx.state.data.flashCharge;
    el.innerHTML = `<h3>INVENTORY</h3>${list || '<div class="empty">Nothing but your phone.</div>'}${
      this.has('flashlight') ? `<div class="foot">FLASHLIGHT CHARGE: ${Math.round(c)}%</div>` : ''
    }<div class="foot">[I] CLOSE</div>`;
  }
}
