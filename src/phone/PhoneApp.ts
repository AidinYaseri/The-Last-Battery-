export interface PhoneApp {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Called when the app is launched. Return false to cancel. */
  onOpen?(): Promise<boolean> | boolean;
  onClose?(): void;
  render(root: HTMLElement): void;
  /** Handle "back"; return true if handled inside the app. */
  onBack?(): boolean;
  onKey?(code: string): boolean;
  badge?(): number;
}

/** Tiny DOM helper for phone apps. */
export function h(tag: string, cls = '', html = '', onClick?: () => void): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  if (onClick) {
    e.classList.add('clickable');
    e.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
  }
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function appHeader(title: string, onBack: () => void, backLabel = 'Back'): HTMLElement {
  const head = h('div', 'app-head');
  head.appendChild(h('div', 'back', `‹ ${backLabel}`, onBack));
  head.appendChild(h('h2', '', esc(title)));
  return head;
}

export const APP_ICONS = {
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  messages: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.5 6.1L4.6 21l4.3-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  calls: `<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  torch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2h8v5l-2 3v12h-4V10L8 7z"/><path d="M11 13h2"/></svg>`,
  gps: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 21l8-4 8 4z"/></svg>`,
};
