import { bus } from '../core/Events';
import type { Input } from '../core/Input';
import type { AudioManager } from '../audio/AudioManager';
import type { VirtualCursor } from './VirtualCursor';

export interface NoteOpts {
  title?: string;
  text: string;
  style?: 'paper' | 'report' | 'screen';
  image?: HTMLCanvasElement | string;
  imageWidth?: number;
}

export interface KeypadOpts {
  title: string;
  length: number;
  check: (code: string) => boolean;
  onSuccess: () => void;
  hint?: string;
}

/** Modal overlays: notes/documents, keypads and confirmation dialogs. */
export class ModalUI {
  private back: HTMLDivElement;
  isOpen = false;
  private closeFn: (() => void) | null = null;
  private keyHandler: ((code: string, e: KeyboardEvent) => void) | null = null;

  constructor(ui: HTMLElement, private input: Input, private audio: AudioManager, private cursor: VirtualCursor) {
    this.back = document.createElement('div');
    this.back.className = 'modal-back';
    this.back.style.display = 'none';
    ui.appendChild(this.back);
    bus.on('input:key', (code: string, e: KeyboardEvent) => {
      if (!this.isOpen || !this.keyHandler) return;
      this.keyHandler(code, e);
    });
  }

  private open(content: HTMLElement, keyHandler: (code: string, e: KeyboardEvent) => void, onClose: () => void): void {
    if (this.isOpen) this.close();
    this.back.innerHTML = '';
    this.back.appendChild(content);
    this.back.style.display = 'flex';
    this.back.classList.add('interactive');
    requestAnimationFrame(() => this.back.classList.add('show'));
    this.isOpen = true;
    this.keyHandler = keyHandler;
    this.closeFn = onClose;
    this.cursor.show(content, false);
    this.cursor.setPos(window.innerWidth / 2, window.innerHeight * 0.62);
    bus.emit('modal:open');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.back.classList.remove('show');
    this.back.style.display = 'none';
    this.back.innerHTML = '';
    this.keyHandler = null;
    this.cursor.hide();
    const fn = this.closeFn;
    this.closeFn = null;
    ['KeyE', 'Enter', 'Space', 'Tab', 'Backspace'].forEach((k) => this.input.consume(k));
    bus.emit('modal:close');
    fn?.();
  }

  note(o: NoteOpts): Promise<void> {
    return new Promise((resolve) => {
      const paper = document.createElement('div');
      paper.className = `paper ${o.style && o.style !== 'paper' ? o.style : ''} clickable modal-x`;
      if (o.image) {
        const img = document.createElement('img');
        img.className = 'img';
        img.src = typeof o.image === 'string' ? o.image : o.image.toDataURL('image/jpeg', 0.9);
        if (o.imageWidth) img.style.width = `${o.imageWidth}px`;
        paper.appendChild(img);
      }
      if (o.title) {
        const h = document.createElement('h2');
        h.textContent = o.title;
        paper.appendChild(h);
      }
      const body = document.createElement('div');
      body.textContent = o.text;
      paper.appendChild(body);
      const hint = document.createElement('div');
      hint.className = 'close-hint';
      hint.textContent = '[E] / [CLICK] CLOSE';
      paper.appendChild(hint);
      paper.addEventListener('click', () => this.close());
      this.audio.play('paper', { bus: 'ui', volume: 0.7 });
      this.open(
        paper,
        (code) => {
          if (['KeyE', 'Enter', 'Space', 'Backspace', 'Escape', 'Tab'].includes(code)) this.close();
          if (code === 'ArrowDown' || code === 'KeyS') paper.scrollTop += 60;
          if (code === 'ArrowUp' || code === 'KeyW') paper.scrollTop -= 60;
        },
        resolve,
      );
    });
  }

  keypad(o: KeypadOpts): void {
    const box = document.createElement('div');
    box.className = 'keypad';
    box.innerHTML = `<div class="kt">${o.title}</div><div class="disp"></div><div class="keys"></div><div class="foot">${o.hint ?? 'Type digits · ENTER to confirm · E to close'}</div>`;
    const disp = box.querySelector('.disp') as HTMLDivElement;
    const keys = box.querySelector('.keys') as HTMLDivElement;
    let code = '';
    let locked = false;
    const render = () => {
      disp.textContent = code.padEnd(o.length, '_');
    };
    const submit = () => {
      if (locked) return;
      if (code.length < o.length) return;
      if (o.check(code)) {
        this.audio.play('keypad_ok', { bus: 'ui' });
        disp.textContent = 'OPEN';
        locked = true;
        setTimeout(() => {
          this.close();
          o.onSuccess();
        }, 500);
      } else {
        this.audio.play('keypad_err', { bus: 'ui' });
        disp.textContent = 'ERROR';
        disp.classList.add('err');
        locked = true;
        setTimeout(() => {
          code = '';
          locked = false;
          disp.classList.remove('err');
          render();
        }, 700);
      }
    };
    const press = (k: string) => {
      if (locked) return;
      if (k === 'C') code = '';
      else if (k === 'OK') return submit();
      else if (code.length < o.length) code += k;
      this.audio.play('keypad', { bus: 'ui', rate: 0.95 + Math.random() * 0.1 });
      render();
      if (code.length === o.length) setTimeout(submit, 250);
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].forEach((k) => {
      const b = document.createElement('div');
      b.className = 'key clickable';
      b.textContent = k;
      b.addEventListener('click', () => press(k));
      keys.appendChild(b);
    });
    render();
    this.open(
      box,
      (c) => {
        const m = c.match(/^(?:Digit|Numpad)(\d)$/);
        if (m) press(m[1]);
        else if (c === 'Backspace') {
          code = code.slice(0, -1);
          render();
        } else if (c === 'Enter' || c === 'NumpadEnter') submit();
        else if (c === 'KeyE' || c === 'Escape' || c === 'Tab') this.close();
      },
      () => undefined,
    );
  }

  confirm<T>(text: string, options: { label: string; value: T; danger?: boolean }[]): Promise<T> {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.className = 'confirm';
      const p = document.createElement('p');
      p.textContent = text;
      box.appendChild(p);
      const row = document.createElement('div');
      row.className = 'row';
      let result: T = options[options.length - 1].value;
      options.forEach((opt, i) => {
        const b = document.createElement('div');
        b.className = `opt clickable ${opt.danger ? 'danger' : ''}`;
        b.textContent = `${i + 1}. ${opt.label}`;
        b.addEventListener('click', () => {
          result = opt.value;
          this.close();
        });
        row.appendChild(b);
      });
      box.appendChild(row);
      this.open(
        box,
        (c) => {
          const m = c.match(/^(?:Digit|Numpad)(\d)$/);
          if (m) {
            const idx = Number(m[1]) - 1;
            if (options[idx]) {
              result = options[idx].value;
              this.close();
            }
          } else if (c === 'Escape' || c === 'Tab' || c === 'Backspace') this.close();
        },
        () => resolve(result),
      );
    });
  }
}
