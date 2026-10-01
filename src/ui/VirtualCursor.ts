/**
 * A software cursor used while the pointer is locked (phone, keypads, notes).
 * Mouse deltas move it; clicks are forwarded to the element underneath.
 */
export class VirtualCursor {
  el: HTMLDivElement;
  x = window.innerWidth / 2;
  y = window.innerHeight / 2;
  active = false;
  private hovered: HTMLElement | null = null;
  bounds: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'vcursor';
    this.el.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1 L1 17 L5.5 13 L8.5 20 L11 19 L8 12 L14 12 Z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>`;
    root.appendChild(this.el);
  }

  show(bounds: HTMLElement | null = null, center = true): void {
    this.bounds = bounds;
    this.active = true;
    if (center && bounds) {
      const r = bounds.getBoundingClientRect();
      this.x = r.left + r.width / 2;
      this.y = r.top + r.height * 0.55;
    }
    this.el.classList.add('show');
    this.apply();
  }

  hide(): void {
    this.active = false;
    this.el.classList.remove('show');
    this.setHover(null);
  }

  move(dx: number, dy: number): void {
    if (!this.active) return;
    this.x += dx;
    this.y += dy;
    let minX = 0,
      minY = 0,
      maxX = window.innerWidth,
      maxY = window.innerHeight;
    if (this.bounds) {
      const r = this.bounds.getBoundingClientRect();
      minX = r.left;
      minY = r.top;
      maxX = r.right;
      maxY = r.bottom;
    }
    this.x = Math.max(minX, Math.min(maxX - 2, this.x));
    this.y = Math.max(minY, Math.min(maxY - 2, this.y));
    this.apply();
  }

  setPos(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.apply();
  }

  private apply(): void {
    this.el.style.left = `${this.x}px`;
    this.el.style.top = `${this.y}px`;
    this.setHover(this.target());
  }

  refreshHover(): void {
    if (this.active) this.setHover(this.target());
  }

  private target(): HTMLElement | null {
    this.el.style.display = 'none';
    const under = document.elementFromPoint(this.x, this.y) as HTMLElement | null;
    this.el.style.display = '';
    return under?.closest('.clickable') as HTMLElement | null;
  }

  private setHover(el: HTMLElement | null): void {
    if (el === this.hovered) return;
    this.hovered?.classList.remove('hover');
    this.hovered = el;
    el?.classList.add('hover');
  }

  click(): boolean {
    if (!this.active) return false;
    const t = this.target();
    if (t) {
      t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      this.refreshHover();
      return true;
    }
    return false;
  }
}
