import { bus } from './Events';

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  quality: Quality;
  invertY: boolean;
  phoneBrightness: number;
  phoneTextSize: number;
  vibration: boolean;
}

const KEY = 'tlb_settings_v1';

function detectQuality(): Quality {
  try {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory || 8;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    let renderer = '';
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    }
    if (/swiftshader|llvmpipe|software/.test(renderer)) return 'low';
    if (/intel|mali|adreno|powervr/.test(renderer) || cores <= 4 || mem <= 4) return 'medium';
    return 'high';
  } catch {
    return 'medium';
  }
}

export class Settings {
  data: SettingsData;

  constructor() {
    const defaults: SettingsData = {
      master: 0.8,
      music: 0.7,
      sfx: 0.9,
      sensitivity: 1,
      quality: detectQuality(),
      invertY: false,
      phoneBrightness: 1,
      phoneTextSize: 1,
      vibration: true,
    };
    let stored: Partial<SettingsData> = {};
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      stored = {};
    }
    this.data = { ...defaults, ...stored };
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.save();
    bus.emit('settings:changed', key, value);
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable */
    }
  }
}
