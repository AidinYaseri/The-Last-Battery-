import { sleep } from '../core/Scheduler';

/** Full-screen fades, level title cards and story text. Real-time based. */
export class Transition {
  el: HTMLDivElement;
  private card: HTMLDivElement;
  private text: HTMLDivElement;

  constructor(ui: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fade';
    this.card = document.createElement('div');
    this.card.className = 'title-card';
    this.text = document.createElement('div');
    this.text.className = 'story-text';
    this.el.append(this.card, this.text);
    ui.appendChild(this.el);
  }

  get isBlack(): boolean {
    return this.el.style.opacity === '1';
  }

  async fadeOut(sec = 1, white = false): Promise<void> {
    this.el.classList.toggle('white', white);
    this.el.style.transition = `opacity ${sec}s ease`;
    this.el.style.opacity = '1';
    await sleep(sec * 1000 + 30);
  }

  async fadeIn(sec = 1): Promise<void> {
    this.el.style.transition = `opacity ${sec}s ease`;
    this.el.style.opacity = '0';
    await sleep(sec * 1000 + 30);
    this.el.classList.remove('white');
  }

  black(): void {
    this.el.classList.remove('white');
    this.el.style.transition = 'none';
    this.el.style.opacity = '1';
  }

  clear(): void {
    this.el.style.transition = 'none';
    this.el.style.opacity = '0';
    this.card.classList.remove('show');
    this.text.classList.remove('show');
  }

  async title(level: string, name: string, sub = '', hold = 2.6): Promise<void> {
    this.card.innerHTML = `<div class="lv">${level}</div><div class="nm">${name}</div>${sub ? `<div class="sub">${sub}</div>` : ''}`;
    this.text.classList.remove('show');
    this.card.style.display = '';
    this.text.style.display = 'none';
    await sleep(60);
    this.card.classList.add('show');
    await sleep(hold * 1000);
    this.card.classList.remove('show');
    await sleep(1400);
    this.card.style.display = 'none';
  }

  async story(lines: string[], hold = 3): Promise<void> {
    this.card.style.display = 'none';
    this.text.style.display = '';
    for (const l of lines) {
      this.text.textContent = l;
      await sleep(60);
      this.text.classList.add('show');
      await sleep(hold * 1000);
      this.text.classList.remove('show');
      await sleep(1500);
    }
    this.text.style.display = 'none';
  }
}
