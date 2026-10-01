import { bus } from './Events';

export interface PhotoRecord {
  id: string;
  label: string;
  dataUrl: string;
  time: string;
  level: number;
  preset?: boolean;
}

export interface SaveData {
  version: number;
  level: number;
  battery: number;
  flashCharge: number;
  inventory: string[];
  clues: string[];
  flags: Record<string, boolean | number | string>;
  photos: PhotoRecord[];
  player: { x: number; z: number; yaw: number } | null;
  playTime: number;
  /** In-game clock in minutes after midnight (23:47 start = -13) */
  clock: number;
  objective: string;
  discovered: string[];
  loop: number;
}

export const SAVE_VERSION = 2;

export function defaultSave(loop = 5): SaveData {
  return {
    version: SAVE_VERSION,
    level: 1,
    battery: 5,
    flashCharge: 70,
    inventory: [],
    clues: [],
    flags: {},
    photos: [],
    player: null,
    playTime: 0,
    clock: -13,
    objective: '',
    discovered: [],
    loop,
  };
}

/** Central mutable game state. All persistent progress lives in `data`. */
export class GameState {
  data: SaveData = defaultSave();

  reset(loop?: number): void {
    this.data = defaultSave(loop);
  }

  load(data: SaveData): void {
    this.data = { ...defaultSave(), ...data };
  }

  flag(key: string): boolean | number | string | undefined {
    return this.data.flags[key];
  }

  has(key: string): boolean {
    return !!this.data.flags[key];
  }

  setFlag(key: string, value: boolean | number | string = true): void {
    if (this.data.flags[key] === value) return;
    this.data.flags[key] = value;
    bus.emit('flag', key, value);
    bus.emit('state:changed');
  }

  clockString(): string {
    let m = Math.floor(this.data.clock);
    m = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** Short date for photo stamps: the night starts Oct 30 and crosses into Oct 31. */
  dateString(offsetMin = 0): string {
    return this.data.clock + offsetMin < 0 ? "OCT 30 '26" : "OCT 31 '26";
  }

  longDate(): string {
    return this.data.clock < 0 ? 'Friday, October 30' : 'Saturday, October 31';
  }

  /** Clock string at an offset in minutes. */
  clockAt(offsetMin: number): string {
    let m = Math.floor(this.data.clock + offsetMin);
    m = ((m % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  discover(id: string): boolean {
    if (this.data.discovered.includes(id)) return false;
    this.data.discovered.push(id);
    bus.emit('map:discovered', id);
    return true;
  }
}
