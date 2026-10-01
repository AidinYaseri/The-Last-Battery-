import { bus } from './Events';

/**
 * Keyboard / mouse input with pointer lock management.
 * Keys are tracked by KeyboardEvent.code so layouts do not matter.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseClicked = false;
  rightClicked = false;
  /** absolute mouse position when pointer is not locked */
  clientX = 0;
  clientY = 0;
  private intentionalUnlock = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      // Prevent browser behaviour for game keys (TAB focus change, space scroll...)
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(e.code)) {
        const tgt = e.target as HTMLElement | null;
        if (!tgt || (tgt.tagName !== 'INPUT' && tgt.tagName !== 'TEXTAREA')) e.preventDefault();
      }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      bus.emit('input:key', e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      this.clientX = e.clientX;
      this.clientY = e.clientY;
      if (this.isLocked()) {
        // Guard against the occasional huge spike some browsers emit on lock
        if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
          this.mouseDX += e.movementX;
          this.mouseDY += e.movementY;
        }
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseClicked = true;
      if (e.button === 2) this.rightClicked = true;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = this.isLocked();
      if (!locked && !this.intentionalUnlock) bus.emit('input:lock-lost');
      this.intentionalUnlock = false;
      bus.emit('input:lock-changed', locked);
    });
    document.addEventListener('pointerlockerror', () => bus.emit('input:lock-error'));
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    if (this.isLocked()) return;
    try {
      const r = (this.canvas.requestPointerLock as any)({ unadjustedMovement: false });
      if (r && typeof r.catch === 'function') r.catch(() => bus.emit('input:lock-error'));
    } catch {
      try {
        this.canvas.requestPointerLock();
      } catch {
        bus.emit('input:lock-error');
      }
    }
  }

  unlock(): void {
    if (!this.isLocked()) return;
    this.intentionalUnlock = true;
    document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Swallow a key press so no other system reacts to it this frame. */
  consume(code: string): void {
    this.pressed.delete(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Called at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
    this.rightClicked = false;
  }

  consumeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return r;
  }

  releaseAll(): void {
    this.down.clear();
    this.pressed.clear();
  }
}
