import type { GameContext } from '../core/Context';
import { SAVE_VERSION, type SaveData } from '../core/GameState';

const SAVE_KEY = 'tlb_save_v1';
const META_KEY = 'tlb_meta_v1';
const CHECK_KEY = 'tlb_checkpoint_v1';

export interface MetaData {
  endings: string[];
  loops: number;
  completions: number;
}

/** localStorage persistence for the run (save) and cross-run meta progress. */
export class SaveManager {
  private lastAuto = 0;
  enabled = true;

  constructor(private ctx: GameContext) {}

  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw) as SaveData;
      return d && d.version === SAVE_VERSION;
    } catch {
      return false;
    }
  }

  save(): void {
    if (!this.enabled) return;
    const st = this.ctx.state.data;
    const p = this.ctx.player;
    st.player = { x: p.pos.x, z: p.pos.z, yaw: p.yaw };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(st));
    } catch (err) {
      // quota: drop photo images and retry
      try {
        const slim = { ...st, photos: st.photos.map((ph) => ({ ...ph, dataUrl: ph.preset ? ph.dataUrl : '' })) };
        localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
      } catch {
        console.warn('[save] failed', err);
      }
    }
  }

  /** Throttled save used after small events. */
  autosave(): void {
    const now = performance.now();
    if (now - this.lastAuto < 1500) return;
    this.lastAuto = now;
    this.save();
  }

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (d.version !== SAVE_VERSION) return null;
      return d;
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Snapshot taken at the start of every level (used to retry after a battery death). */
  checkpoint(): void {
    try {
      const st = { ...this.ctx.state.data, player: null };
      localStorage.setItem(CHECK_KEY, JSON.stringify({ ...st, photos: st.photos.filter((p) => !p.preset).slice(-6) }));
    } catch {
      /* ignore */
    }
  }

  hasCheckpoint(): boolean {
    return !!this.loadCheckpoint();
  }

  checkpointLevel(): number {
    return this.loadCheckpoint()?.level ?? 1;
  }

  loadCheckpoint(): SaveData | null {
    try {
      const raw = localStorage.getItem(CHECK_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return d.version === SAVE_VERSION ? d : null;
    } catch {
      return null;
    }
  }

  clearCheckpoint(): void {
    try {
      localStorage.removeItem(CHECK_KEY);
    } catch {
      /* ignore */
    }
  }

  meta(): MetaData {
    try {
      const m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return { endings: m.endings ?? [], loops: m.loops ?? 5, completions: m.completions ?? 0 };
    } catch {
      return { endings: [], loops: 5, completions: 0 };
    }
  }

  saveMeta(m: MetaData): void {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(m));
    } catch {
      /* ignore */
    }
  }

  recordEnding(id: string): MetaData {
    const m = this.meta();
    if (!m.endings.includes(id)) m.endings.push(id);
    m.completions++;
    this.saveMeta(m);
    return m;
  }
}
