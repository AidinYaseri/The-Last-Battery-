/**
 * Offline procedural sound generation. Every sound in the game is synthesised
 * here at start-up so the game ships without any audio files.
 */
import { rng } from '../world/Textures';

export type Gen = (sr: number) => Float32Array | [Float32Array, Float32Array];

const TAU = Math.PI * 2;

class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  x1 = 0;
  x2 = 0;
  y1 = 0;
  y2 = 0;
  constructor(type: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number) {
    this.set(type, f, q, sr);
  }
  set(type: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number): void {
    const w0 = (TAU * Math.min(f, sr * 0.45)) / sr;
    const alpha = Math.sin(w0) / (2 * q);
    const cw = Math.cos(w0);
    let b0: number, b1: number, b2: number;
    const a0 = 1 + alpha;
    if (type === 'lp') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else if (type === 'hp') {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function buf(sr: number, dur: number): Float32Array {
  return new Float32Array(Math.max(1, Math.floor(sr * dur)));
}

function filter(a: Float32Array, type: 'lp' | 'hp' | 'bp', f: number, q: number, sr: number): Float32Array {
  const bq = new Biquad(type, f, q, sr);
  for (let i = 0; i < a.length; i++) a[i] = bq.run(a[i]);
  return a;
}

function normalize(a: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
  return a;
}

/** Crossfade the tail into the head so the buffer loops cleanly. */
function loopable(a: Float32Array, sr: number, fade = 0.2): Float32Array {
  const n = Math.floor(sr * fade);
  const out = a.slice(0, a.length - n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    out[i] = out[i] * t + a[a.length - n + i] * (1 - t);
  }
  return out;
}

function mix(target: Float32Array, src: Float32Array, at: number, gain = 1): void {
  for (let i = 0; i < src.length && at + i < target.length; i++) if (at + i >= 0) target[at + i] += src[i] * gain;
}

function env(i: number, sr: number, attack: number, decay: number): number {
  const t = i / sr;
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

function noiseBurst(sr: number, dur: number, seed: number, attack: number, decay: number): Float32Array {
  const r = rng(seed);
  const a = buf(sr, dur);
  for (let i = 0; i < a.length; i++) a[i] = (r() * 2 - 1) * env(i, sr, attack, decay);
  return a;
}

function tone(sr: number, dur: number, f: number | ((t: number) => number), type: 'sine' | 'square' | 'saw' | 'tri', attack: number, decay: number, gain = 1): Float32Array {
  const a = buf(sr, dur);
  let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const freq = typeof f === 'number' ? f : f(t);
    ph += freq / sr;
    const p = ph % 1;
    let v: number;
    if (type === 'sine') v = Math.sin(p * TAU);
    else if (type === 'square') v = p < 0.5 ? 1 : -1;
    else if (type === 'saw') v = p * 2 - 1;
    else v = 1 - 4 * Math.abs(p - 0.5);
    a[i] = v * env(i, sr, attack, decay) * gain;
  }
  return a;
}

// ------------------------------------------------------------------ generators

export const GENS: Record<string, Gen[]> = {};

function reg(name: string, ...gens: Gen[]): void {
  GENS[name] = gens;
}

// Noise beds
reg('noise_pink', (sr) => {
  const r = rng(1);
  const a = buf(sr, 6.2);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0;
  for (let i = 0; i < a.length; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
  }
  return loopable(normalize(a, 0.7), sr, 0.2);
});

reg('noise_brown', (sr) => {
  const r = rng(2);
  const a = buf(sr, 6.2);
  let last = 0;
  for (let i = 0; i < a.length; i++) {
    last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
    a[i] = last * 3.5;
  }
  return loopable(normalize(a, 0.8), sr, 0.2);
});

reg('crickets', (sr) => {
  const r = rng(3);
  const a = buf(sr, 8.2);
  const crickets = 5;
  for (let c = 0; c < crickets; c++) {
    const f = 4000 + r() * 1200;
    const gain = 0.2 + r() * 0.5;
    const period = 0.45 + r() * 0.5;
    let t = r() * period;
    while (t < 8.2) {
      const pulses = 2 + Math.floor(r() * 3);
      for (let p = 0; p < pulses; p++) {
        const start = Math.floor((t + p * 0.035) * sr);
        const len = Math.floor(0.022 * sr);
        for (let i = 0; i < len && start + i < a.length; i++) {
          const e = Math.sin((i / len) * Math.PI);
          a[start + i] += Math.sin((TAU * f * i) / sr) * e * gain;
        }
      }
      t += period * (0.9 + r() * 0.2);
    }
  }
  // soft distant katydid texture
  const n = noiseBurst(sr, 8.2, 33, 0.01, 1000);
  filter(n, 'bp', 6500, 4, sr);
  for (let i = 0; i < a.length; i++) a[i] += n[i] * 0.05 * (0.5 + 0.5 * Math.sin((TAU * i) / sr * 0.3));
  return loopable(normalize(a, 0.5), sr, 0.2);
});

reg('hum', (sr) => {
  const a = buf(sr, 2);
  const r = rng(4);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    a[i] = Math.sin(TAU * 60 * t) * 0.5 + Math.sin(TAU * 120 * t) * 0.35 + Math.sin(TAU * 180 * t) * 0.15 + Math.sin(TAU * 240 * t) * 0.08 + (r() - 0.5) * 0.04;
  }
  return normalize(a, 0.5);
});

reg('electric_buzz', (sr) => {
  const a = buf(sr, 1);
  const r = rng(5);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const saw = ((t * 120) % 1) * 2 - 1;
    a[i] = saw * 0.4 + Math.sin(TAU * 240 * t) * 0.2 + (r() - 0.5) * 0.15 * (Math.sin(TAU * 7 * t) > 0.6 ? 1 : 0.2);
  }
  filter(a, 'lp', 2500, 0.7, sr);
  return normalize(a, 0.5);
});

reg('static', (sr) => {
  const r = rng(6);
  const a = buf(sr, 3.2);
  for (let i = 0; i < a.length; i++) {
    a[i] = (r() * 2 - 1) * 0.5;
    if (r() < 0.0008) {
      const len = Math.floor(r() * 200);
      for (let k = 0; k < len && i + k < a.length; k++) a[i + k] += (r() * 2 - 1) * 1.5;
    }
  }
  filter(a, 'bp', 2200, 0.6, sr);
  return loopable(normalize(a, 0.6), sr, 0.2);
});

reg('birds', (sr) => {
  const r = rng(7);
  const a = buf(sr, 8.2);
  for (let k = 0; k < 26; k++) {
    const start = r() * 7.6;
    const f0 = 2500 + r() * 2500;
    const n = 2 + Math.floor(r() * 4);
    for (let j = 0; j < n; j++) {
      const len = 0.05 + r() * 0.08;
      const sweep = r() > 0.5 ? 900 : -600;
      const b = tone(sr, len, (t) => f0 + Math.sin((t / len) * Math.PI) * sweep, 'sine', 0.005, len * 0.5, 0.3 + r() * 0.3);
      mix(a, b, Math.floor((start + j * (len + 0.03)) * sr), 1);
    }
  }
  return loopable(normalize(a, 0.5), sr, 0.2);
});

reg('rain_drip', (sr) => {
  const a = tone(sr, 0.25, (t) => 1400 - t * 2000, 'sine', 0.001, 0.04, 0.6);
  return a;
});

// Footsteps
function step(seed: number, surface: string): Gen {
  return (sr) => {
    const r = rng(seed);
    const dur = surface === 'leaves' ? 0.32 : 0.22;
    const a = buf(sr, dur);
    const n = noiseBurst(sr, dur, seed, 0.004, surface === 'leaves' ? 0.07 : 0.035);
    if (surface === 'dirt') filter(n, 'lp', 900, 0.7, sr);
    if (surface === 'gravel') filter(n, 'bp', 2500, 0.8, sr);
    if (surface === 'wood') filter(n, 'lp', 1400, 0.7, sr);
    if (surface === 'concrete') filter(n, 'bp', 1800, 1.0, sr);
    if (surface === 'asphalt') filter(n, 'bp', 1200, 0.9, sr);
    if (surface === 'leaves') filter(n, 'hp', 1500, 0.7, sr);
    mix(a, n, 0, 1);
    if (surface === 'gravel' || surface === 'leaves') {
      for (let k = 0; k < 14; k++) {
        const c = noiseBurst(sr, 0.01, seed + k * 7, 0.0005, 0.002);
        filter(c, 'hp', 3000, 0.7, sr);
        mix(a, c, Math.floor(r() * a.length * 0.6), 0.6);
      }
    }
    if (surface === 'wood') mix(a, tone(sr, 0.15, 95 + r() * 30, 'sine', 0.002, 0.04), 0, 0.9);
    if (surface === 'dirt' || surface === 'asphalt' || surface === 'concrete') mix(a, tone(sr, 0.1, 70 + r() * 20, 'sine', 0.002, 0.025), 0, 0.5);
    return normalize(a, 0.7);
  };
}
for (const s of ['dirt', 'gravel', 'wood', 'concrete', 'asphalt', 'leaves']) {
  reg(`step_${s}`, step(10, s), step(20, s), step(30, s), step(40, s));
}

// Doors & locks
reg('door_open', (sr) => {
  const a = buf(sr, 1.4);
  const r = rng(50);
  let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const f = 18 + Math.sin(t * 3) * 10 + t * 25;
    ph += f / sr;
    if (ph >= 1) {
      ph -= 1;
      const len = 120;
      for (let k = 0; k < len && i + k < a.length; k++) a[i + k] += Math.sin(k * 0.35) * Math.exp(-k / 25) * (0.6 + r() * 0.4);
    }
  }
  filter(a, 'bp', 900, 1.5, sr);
  for (let i = 0; i < a.length; i++) a[i] *= Math.min(1, (i / sr) * 8) * Math.max(0, 1 - i / a.length);
  mix(a, noiseBurst(sr, 0.05, 51, 0.001, 0.008), 0, 1.5);
  return normalize(a, 0.8);
});

reg('door_close', (sr) => {
  const a = buf(sr, 0.6);
  mix(a, tone(sr, 0.4, 70, 'sine', 0.002, 0.08), 0, 1);
  const n = noiseBurst(sr, 0.3, 52, 0.001, 0.05);
  filter(n, 'lp', 1500, 0.7, sr);
  mix(a, n, 0, 0.8);
  mix(a, noiseBurst(sr, 0.03, 53, 0.0005, 0.005), Math.floor(sr * 0.07), 0.8);
  return normalize(a, 0.85);
});

reg('door_slam', (sr) => {
  const a = buf(sr, 1.6);
  mix(a, tone(sr, 1.0, (t) => 55 - t * 10, 'sine', 0.001, 0.2), 0, 1);
  const n = noiseBurst(sr, 1.2, 54, 0.001, 0.12);
  filter(n, 'lp', 2200, 0.7, sr);
  mix(a, n, 0, 1.2);
  const r = rng(55);
  for (let k = 0; k < 6; k++) mix(a, noiseBurst(sr, 0.02, 56 + k, 0.0005, 0.004), Math.floor(sr * (0.05 + k * 0.04 + r() * 0.02)), 0.4);
  return normalize(a, 1);
});

reg('metal_door', (sr) => {
  const a = tone(sr, 1.2, (t) => 300 + Math.sin(t * 17) * 60 + t * 90, 'saw', 0.05, 0.6, 0.4);
  filter(a, 'bp', 1600, 3, sr);
  mix(a, tone(sr, 0.6, 80, 'sine', 0.002, 0.1), Math.floor(sr * 0.6), 0.8);
  return normalize(a, 0.7);
});

reg('locked', (sr) => {
  const a = buf(sr, 0.5);
  const r = rng(60);
  for (let k = 0; k < 5; k++) {
    const c = noiseBurst(sr, 0.04, 61 + k, 0.0005, 0.006);
    filter(c, 'bp', 2800 + r() * 800, 3, sr);
    mix(a, c, Math.floor(sr * (k * 0.07 + r() * 0.02)), 1);
    mix(a, tone(sr, 0.05, 900 + r() * 300, 'sine', 0.001, 0.01), Math.floor(sr * (k * 0.07)), 0.2);
  }
  return normalize(a, 0.7);
});

reg('unlock', (sr) => {
  const a = buf(sr, 0.6);
  mix(a, noiseBurst(sr, 0.03, 70, 0.0005, 0.004), 0, 1);
  mix(a, noiseBurst(sr, 0.03, 71, 0.0005, 0.004), Math.floor(sr * 0.18), 1.2);
  mix(a, tone(sr, 0.4, 2400, 'sine', 0.001, 0.08), Math.floor(sr * 0.18), 0.15);
  filter(a, 'hp', 800, 0.7, sr);
  return normalize(a, 0.7);
});

reg('keypad', (sr) => tone(sr, 0.09, 1250, 'sine', 0.002, 0.05, 0.5));
reg('keypad_ok', (sr) => {
  const a = buf(sr, 0.4);
  mix(a, tone(sr, 0.12, 1320, 'sine', 0.002, 0.06), 0, 0.5);
  mix(a, tone(sr, 0.2, 1760, 'sine', 0.002, 0.08), Math.floor(sr * 0.12), 0.5);
  return a;
});
reg('keypad_err', (sr) => {
  const a = tone(sr, 0.35, 180, 'square', 0.002, 0.2, 0.35);
  return filter(a, 'lp', 1200, 0.7, sr);
});

reg('pickup', (sr) => {
  const a = buf(sr, 0.35);
  const n = noiseBurst(sr, 0.25, 80, 0.01, 0.05);
  filter(n, 'bp', 3000, 0.8, sr);
  mix(a, n, 0, 0.6);
  mix(a, noiseBurst(sr, 0.02, 81, 0.0005, 0.004), Math.floor(sr * 0.12), 0.7);
  return normalize(a, 0.6);
});

reg('paper', (sr) => {
  const a = buf(sr, 0.6);
  const r = rng(82);
  for (let k = 0; k < 20; k++) {
    const c = noiseBurst(sr, 0.05, 83 + k, 0.002, 0.012);
    filter(c, 'bp', 3000 + r() * 3000, 1.2, sr);
    mix(a, c, Math.floor(r() * a.length * 0.8), 0.5 + r() * 0.5);
  }
  return normalize(a, 0.5);
});

reg('zip', (sr) => {
  const a = buf(sr, 0.7);
  const r = rng(84);
  let t = 0;
  let rate = 30;
  while (t < 0.65) {
    const c = noiseBurst(sr, 0.01, Math.floor(r() * 1000), 0.0003, 0.002);
    filter(c, 'hp', 2000, 0.7, sr);
    mix(a, c, Math.floor(t * sr), 0.8);
    t += 1 / rate;
    rate += 3;
  }
  return normalize(a, 0.5);
});

reg('click', (sr) => {
  const a = noiseBurst(sr, 0.04, 90, 0.0003, 0.003);
  filter(a, 'bp', 3500, 1.5, sr);
  return normalize(a, 0.6);
});
reg('flash_on', (sr) => {
  const a = buf(sr, 0.08);
  mix(a, noiseBurst(sr, 0.03, 91, 0.0003, 0.002), 0, 1);
  mix(a, tone(sr, 0.05, 2200, 'sine', 0.0005, 0.008), 0, 0.3);
  return normalize(filter(a, 'hp', 1200, 0.7, sr), 0.5);
});
reg('flash_off', (sr) => {
  const a = buf(sr, 0.08);
  mix(a, noiseBurst(sr, 0.03, 92, 0.0003, 0.002), 0, 1);
  mix(a, tone(sr, 0.05, 1600, 'sine', 0.0005, 0.008), 0, 0.3);
  return normalize(filter(a, 'hp', 1000, 0.7, sr), 0.45);
});

// Phone
reg('phone_vibrate', (sr) => {
  const a = buf(sr, 1.1);
  for (const start of [0, 0.55]) {
    const b = tone(sr, 0.42, 165, 'square', 0.01, 10, 0.5);
    for (let i = 0; i < b.length; i++) b[i] *= Math.min(1, (b.length - i) / (sr * 0.02)) * (0.7 + 0.3 * Math.sin((TAU * 22 * i) / sr));
    filter(b, 'lp', 600, 0.8, sr);
    mix(a, b, Math.floor(start * sr), 1);
  }
  return normalize(a, 0.8);
});
reg('notify', (sr) => {
  const a = buf(sr, 0.6);
  mix(a, tone(sr, 0.3, 988, 'sine', 0.003, 0.09), 0, 0.5);
  mix(a, tone(sr, 0.4, 1480, 'sine', 0.003, 0.12), Math.floor(sr * 0.11), 0.5);
  return a;
});
reg('ui_tap', (sr) => tone(sr, 0.03, 2200, 'sine', 0.0005, 0.006, 0.35));
reg('ui_back', (sr) => tone(sr, 0.04, 1500, 'sine', 0.0005, 0.008, 0.3));
reg('shutter', (sr) => {
  const a = buf(sr, 0.3);
  const n1 = noiseBurst(sr, 0.05, 95, 0.0005, 0.006);
  filter(n1, 'hp', 1500, 0.7, sr);
  mix(a, n1, 0, 1);
  const n2 = noiseBurst(sr, 0.08, 96, 0.001, 0.015);
  filter(n2, 'bp', 2500, 1, sr);
  mix(a, n2, Math.floor(sr * 0.09), 0.9);
  return normalize(a, 0.7);
});
reg('low_battery', (sr) => {
  const a = buf(sr, 0.7);
  [880, 740, 587].forEach((f, k) => mix(a, tone(sr, 0.2, f, 'sine', 0.003, 0.07), Math.floor(sr * k * 0.17), 0.45));
  return a;
});
reg('ring', (sr) => {
  const a = buf(sr, 3);
  for (const s of [0, 0.5]) {
    const b = buf(sr, 0.4);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      b[i] = (Math.sin(TAU * 440 * t) + Math.sin(TAU * 480 * t)) * 0.25 * Math.min(1, t * 80, (0.4 - t) * 80);
    }
    mix(a, b, Math.floor(s * sr), 1);
  }
  return a;
});
reg('hangup', (sr) => {
  const a = buf(sr, 0.9);
  for (let k = 0; k < 3; k++) mix(a, tone(sr, 0.18, 620, 'sine', 0.003, 0.2), Math.floor(sr * k * 0.28), 0.35);
  return a;
});
reg('charge', (sr) => {
  const a = buf(sr, 0.6);
  mix(a, tone(sr, 0.18, 660, 'sine', 0.003, 0.08), 0, 0.4);
  mix(a, tone(sr, 0.3, 990, 'sine', 0.003, 0.12), Math.floor(sr * 0.12), 0.4);
  return a;
});

// Nature / atmosphere
reg(
  'branch',
  (sr) => {
    const a = buf(sr, 0.5);
    const r = rng(100);
    for (let k = 0; k < 5; k++) {
      const c = noiseBurst(sr, 0.05, 101 + k, 0.0003, 0.008 + r() * 0.01);
      filter(c, 'bp', 1200 + r() * 2000, 0.8, sr);
      mix(a, c, Math.floor(sr * (k === 0 ? 0 : 0.02 + r() * 0.12)), k === 0 ? 1.4 : 0.6);
    }
    return normalize(a, 0.9);
  },
  (sr) => {
    const a = buf(sr, 0.4);
    mix(a, noiseBurst(sr, 0.06, 110, 0.0003, 0.01), 0, 1);
    mix(a, noiseBurst(sr, 0.04, 111, 0.0003, 0.006), Math.floor(sr * 0.05), 0.7);
    return normalize(filter(a, 'bp', 1800, 0.7, sr), 0.9);
  },
);
reg('owl', (sr) => {
  const a = buf(sr, 2.2);
  const hoot = (start: number, len: number, f: number) => {
    const b = buf(sr, len);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const e = Math.sin((Math.PI * t) / len) ** 2;
      b[i] = Math.sin(TAU * (f - t * 40) * t + Math.sin(TAU * 5 * t) * 0.3) * e;
    }
    mix(a, b, Math.floor(start * sr), 0.8);
  };
  hoot(0, 0.35, 390);
  hoot(0.55, 0.18, 380);
  hoot(0.8, 0.5, 370);
  return normalize(a, 0.6);
});
reg('howl', (sr) => {
  const a = buf(sr, 4.5);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const f = t < 1 ? 380 + t * 320 : t < 3 ? 700 - (t - 1) * 40 : 620 - (t - 3) * 180;
    const e = Math.min(1, t * 2) * Math.max(0, 1 - Math.max(0, t - 3) / 1.5);
    a[i] = (Math.sin(TAU * f * t) * 0.7 + Math.sin(TAU * f * 2 * t) * 0.2) * e * (1 + Math.sin(TAU * 5 * t) * 0.05);
  }
  // distance: echo + lowpass
  const out = a.slice();
  mix(out, a, Math.floor(sr * 0.35), 0.3);
  mix(out, a, Math.floor(sr * 0.8), 0.15);
  return normalize(filter(out, 'lp', 1500, 0.7, sr), 0.5);
});
reg('scream', (sr) => {
  const a = buf(sr, 2);
  const r = rng(120);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const f = 520 + Math.sin(t * 2.5) * 180 + t * 60;
    const e = Math.min(1, t * 8) * Math.max(0, 1 - t / 1.9);
    a[i] = ((((t * f) % 1) * 2 - 1) * 0.6 + (r() - 0.5) * 0.3) * e;
  }
  filter(a, 'bp', 1400, 1.5, sr);
  const out = a.slice();
  mix(out, a, Math.floor(sr * 0.25), 0.4);
  return normalize(filter(out, 'lp', 1800, 0.7, sr), 0.4);
});
reg('rustle', (sr) => {
  const a = buf(sr, 1.2);
  const r = rng(130);
  for (let k = 0; k < 40; k++) {
    const c = noiseBurst(sr, 0.08, 131 + k, 0.005, 0.02);
    filter(c, 'bp', 2000 + r() * 3000, 1, sr);
    mix(a, c, Math.floor(r() * a.length * 0.85), 0.3 + r() * 0.5);
  }
  return normalize(a, 0.6);
});
reg('animal_run', (sr) => {
  const a = buf(sr, 1.6);
  for (let k = 0; k < 10; k++) {
    const c = noiseBurst(sr, 0.1, 140 + k, 0.003, 0.03);
    filter(c, 'bp', 1500 + k * 150, 0.9, sr);
    mix(a, c, Math.floor(sr * k * 0.13), 1 - k * 0.07);
  }
  return normalize(a, 0.6);
});
reg('thud', (sr) => {
  const a = buf(sr, 0.8);
  mix(a, tone(sr, 0.6, (t) => 80 - t * 40, 'sine', 0.001, 0.1), 0, 1);
  const n = noiseBurst(sr, 0.3, 150, 0.001, 0.04);
  filter(n, 'lp', 900, 0.7, sr);
  mix(a, n, 0, 0.7);
  return normalize(a, 0.9);
});
reg('glass', (sr) => {
  const a = buf(sr, 1.2);
  const r = rng(151);
  for (let k = 0; k < 14; k++) mix(a, tone(sr, 0.4, 2500 + r() * 4000, 'sine', 0.0005, 0.05 + r() * 0.1), Math.floor(r() * sr * 0.5), 0.25);
  mix(a, filter(noiseBurst(sr, 0.3, 152, 0.0005, 0.03), 'hp', 2000, 0.7, sr), 0, 1);
  return normalize(a, 0.7);
});

reg('radio_on', (sr) => {
  const a = buf(sr, 0.8);
  mix(a, noiseBurst(sr, 0.03, 160, 0.0003, 0.004), 0, 1);
  const s = noiseBurst(sr, 0.7, 161, 0.01, 0.4);
  filter(s, 'bp', 2000, 0.7, sr);
  mix(a, s, Math.floor(sr * 0.05), 0.6);
  return normalize(a, 0.7);
});

reg('generator_start', (sr) => {
  const a = buf(sr, 2.6);
  for (let k = 0; k < 6; k++) {
    const st = Math.floor(sr * k * 0.22);
    mix(a, tone(sr, 0.18, 45 + k * 3, 'saw', 0.01, 0.06), st, 0.6);
    mix(a, filter(noiseBurst(sr, 0.15, 170 + k, 0.005, 0.05), 'lp', 600, 0.7, sr), st, 0.5);
  }
  const run = buf(sr, 1.3);
  for (let i = 0; i < run.length; i++) {
    const t = i / sr;
    const p = (t * 28) % 1;
    run[i] = (p < 0.2 ? 1 : 0) * Math.min(1, t * 3) + Math.sin(TAU * 56 * t) * 0.3;
  }
  filter(run, 'lp', 400, 0.8, sr);
  mix(a, run, Math.floor(sr * 1.3), 0.8);
  return normalize(a, 0.8);
});
reg('generator_loop', (sr) => {
  const a = buf(sr, 2);
  const r = rng(175);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const p = (t * 28) % 1;
    a[i] = (p < 0.18 ? 1 : 0) * 0.9 + Math.sin(TAU * 56 * t) * 0.3 + Math.sin(TAU * 112 * t) * 0.1 + (r() - 0.5) * 0.2;
  }
  filter(a, 'lp', 500, 0.8, sr);
  return normalize(a, 0.6);
});
reg('spark', (sr) => {
  const a = buf(sr, 0.7);
  const r = rng(180);
  for (let k = 0; k < 25; k++) {
    const c = noiseBurst(sr, 0.02, 181 + k, 0.0003, 0.003);
    filter(c, 'hp', 2500, 0.7, sr);
    mix(a, c, Math.floor(r() * a.length * 0.9), 0.4 + r() * 0.6);
  }
  mix(a, tone(sr, 0.5, 120, 'saw', 0.001, 0.08), 0, 0.3);
  return normalize(a, 0.8);
});
reg('crash', (sr) => {
  const a = buf(sr, 2.5);
  mix(a, tone(sr, 1.5, (t) => 60 - t * 20, 'sine', 0.001, 0.3), 0, 1);
  const n = noiseBurst(sr, 2, 190, 0.001, 0.3);
  filter(n, 'lp', 3500, 0.7, sr);
  mix(a, n, 0, 1.2);
  const r = rng(191);
  for (let k = 0; k < 30; k++) mix(a, tone(sr, 0.3, 2000 + r() * 5000, 'sine', 0.0005, 0.04 + r() * 0.08), Math.floor(r() * sr * 1.2), 0.2);
  return normalize(a, 1);
});
reg('power_down', (sr) => {
  const a = tone(sr, 1.6, (t) => Math.max(20, 120 - t * 80), 'saw', 0.005, 0.7, 0.6);
  filter(a, 'lp', 800, 0.8, sr);
  mix(a, noiseBurst(sr, 0.05, 195, 0.0005, 0.01), 0, 0.8);
  return normalize(a, 0.7);
});
reg('power_up', (sr) => {
  const a = buf(sr, 1.5);
  mix(a, noiseBurst(sr, 0.06, 196, 0.0005, 0.012), 0, 1);
  const h = tone(sr, 1.4, (t) => 40 + t * 60, 'saw', 0.3, 5, 0.5);
  filter(h, 'lp', 700, 0.8, sr);
  mix(a, h, Math.floor(sr * 0.05), 0.6);
  return normalize(a, 0.7);
});
reg('car_pass', (sr) => {
  const a = buf(sr, 6);
  const r = rng(200);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const d = t - 3;
    const amp = 1 / (1 + d * d * 1.2);
    const f = 90 * (d < 0 ? 1.15 : 0.87);
    a[i] = (Math.sin(TAU * f * t) * 0.4 + (r() - 0.5) * 0.8) * amp;
  }
  filter(a, 'lp', 1200, 0.7, sr);
  return normalize(a, 0.8);
});
reg('engine_idle', (sr) => {
  const a = buf(sr, 2);
  const r = rng(205);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    a[i] = Math.sin(TAU * 32 * t) * 0.5 + (((t * 32) % 1) < 0.3 ? 0.4 : 0) + (r() - 0.5) * 0.15;
  }
  filter(a, 'lp', 350, 0.8, sr);
  return normalize(a, 0.6);
});
reg('car_door', (sr) => {
  const a = buf(sr, 0.5);
  mix(a, tone(sr, 0.3, 90, 'sine', 0.001, 0.05), 0, 1);
  mix(a, filter(noiseBurst(sr, 0.2, 210, 0.0005, 0.03), 'lp', 2500, 0.7, sr), 0, 0.9);
  return normalize(a, 0.85);
});
reg('heartbeat', (sr) => {
  const a = buf(sr, 1.1);
  mix(a, tone(sr, 0.25, 55, 'sine', 0.005, 0.05), 0, 1);
  mix(a, tone(sr, 0.25, 50, 'sine', 0.005, 0.06), Math.floor(sr * 0.28), 0.8);
  return normalize(a, 0.8);
});
reg('whoosh', (sr) => {
  const a = buf(sr, 1.8);
  const r = rng(220);
  const bq = new Biquad('bp', 400, 1, sr);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    bq.set('bp', 300 + Math.sin((Math.PI * t) / 1.8) * 1800, 1.2, sr);
    a[i] = bq.run(r() * 2 - 1) * Math.sin((Math.PI * t) / 1.8) ** 2;
  }
  return normalize(a, 0.7);
});
reg('glitch', (sr) => {
  const a = buf(sr, 0.7);
  const r = rng(230);
  let i = 0;
  while (i < a.length) {
    const len = Math.floor(sr * (0.01 + r() * 0.05));
    const f = 100 + r() * 2000;
    const type = r();
    for (let k = 0; k < len && i < a.length; k++, i++) {
      const t = k / sr;
      a[i] = type < 0.4 ? (Math.sin(TAU * f * t) > 0 ? 0.5 : -0.5) : type < 0.7 ? r() * 2 - 1 : 0;
    }
  }
  return normalize(a, 0.5);
});
reg('drawer', (sr) => {
  const a = noiseBurst(sr, 0.5, 240, 0.05, 0.2);
  filter(a, 'bp', 700, 1.5, sr);
  mix(a, noiseBurst(sr, 0.03, 241, 0.0005, 0.006), Math.floor(sr * 0.42), 1.2);
  return normalize(a, 0.6);
});
reg('tape_click', (sr) => {
  const a = buf(sr, 0.3);
  mix(a, noiseBurst(sr, 0.03, 250, 0.0005, 0.004), 0, 1);
  mix(a, tone(sr, 0.2, 60, 'sine', 0.002, 0.04), 0, 0.3);
  return normalize(filter(a, 'hp', 300, 0.7, sr), 0.6);
});
reg('breath', (sr) => {
  const a = buf(sr, 3);
  const r = rng(260);
  const bq = new Biquad('bp', 900, 0.8, sr);
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    const e = Math.max(0, Math.sin((Math.PI * t) / 1.3)) * (t < 1.3 ? 1 : 0) + Math.max(0, Math.sin((Math.PI * (t - 1.5)) / 1.4)) * (t > 1.5 ? 0.8 : 0);
    a[i] = bq.run(r() * 2 - 1) * e;
  }
  return normalize(a, 0.4);
});
reg('stinger', (sr) => {
  const out: [Float32Array, Float32Array] = [buf(sr, 5), buf(sr, 5)];
  const freqs = [55, 58.3, 82.4, 116.5, 164.8, 174.6, 233];
  freqs.forEach((f, k) => {
    const t = tone(sr, 5, f, 'saw', 0.01, 1.4, 0.3);
    filter(t, 'lp', 1800, 0.7, sr);
    mix(out[k % 2], t, 0, 1);
  });
  const n = noiseBurst(sr, 2, 270, 0.002, 0.25);
  filter(n, 'lp', 3000, 0.7, sr);
  mix(out[0], n, 0, 0.8);
  mix(out[1], n, 30, 0.8);
  normalize(out[0], 0.9);
  normalize(out[1], 0.9);
  return out;
});

/** Speech-like murmur (formant synthesis) for radio / recordings / whispers. */
export function voiceGen(text: string, type: 'radio' | 'recording' | 'whisper' | 'phone' | 'self'): Gen {
  return (sr) => {
    const r = rng(text.length * 97 + text.charCodeAt(0));
    const syll = Math.max(2, Math.round(text.replace(/[^a-z]/gi, '').length / 2.8));
    const syllDur = type === 'whisper' ? 0.2 : 0.16;
    const dur = syll * syllDur + 0.4 + (text.match(/[.,?!]/g)?.length ?? 0) * 0.25;
    const a = buf(sr, dur);
    const f1 = new Biquad('bp', 700, 6, sr);
    const f2 = new Biquad('bp', 1200, 8, sr);
    const f3 = new Biquad('bp', 2500, 8, sr);
    const vowels: [number, number][] = [
      [730, 1090],
      [530, 1840],
      [270, 2290],
      [570, 840],
      [440, 1020],
      [300, 870],
      [660, 1720],
    ];
    let ph = 0;
    const baseF0 = type === 'self' ? 125 : type === 'whisper' ? 0 : 115 + r() * 30;
    let t0 = 0.1;
    let i = Math.floor(t0 * sr);
    const words = text.split(/\s+/);
    for (const w of words) {
      const n = Math.max(1, Math.round(w.replace(/[^a-z]/gi, '').length / 2.8));
      for (let s = 0; s < n; s++) {
        const v = vowels[Math.floor(r() * vowels.length)];
        const len = Math.floor(sr * syllDur * (0.7 + r() * 0.6));
        f1.set('bp', v[0], 5, sr);
        f2.set('bp', v[1], 7, sr);
        for (let k = 0; k < len && i < a.length; k++, i++) {
          const t = k / len;
          const e = Math.sin(Math.PI * t) ** 0.7;
          const f0 = baseF0 * (1 + 0.08 * Math.sin(t * 3 + s) - 0.1 * (i / a.length));
          let src: number;
          if (type === 'whisper') src = r() * 2 - 1;
          else {
            ph += f0 / sr;
            src = (ph % 1) * 2 - 1 + (r() - 0.5) * 0.25;
          }
          a[i] = (f1.run(src) * 1.0 + f2.run(src) * 0.6 + f3.run(src) * 0.2) * e;
        }
      }
      i += Math.floor(sr * (0.04 + r() * 0.05));
      if (/[.,?!]$/.test(w)) i += Math.floor(sr * 0.22);
    }
    if (type === 'radio' || type === 'phone') filter(a, 'bp', 1400, 0.9, sr);
    if (type === 'recording') filter(a, 'lp', 3500, 0.7, sr);
    return normalize(a, type === 'whisper' ? 0.5 : 0.7);
  };
}
