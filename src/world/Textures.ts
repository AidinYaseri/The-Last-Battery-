import * as THREE from 'three';

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on a grid of `period` cells. */
export function makeNoise(seed: number) {
  const r = rng(seed);
  const perm = new Float32Array(256 * 256);
  for (let i = 0; i < perm.length; i++) perm[i] = r();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, period = 256): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const p = Math.min(256, Math.max(1, Math.floor(period)));
    const ix0 = ((xi % p) + p) % p;
    const iy0 = ((yi % p) + p) % p;
    const ix1 = (ix0 + 1) % p;
    const iy1 = (iy0 + 1) % p;
    const v00 = perm[iy0 * 256 + ix0];
    const v10 = perm[iy0 * 256 + ix1];
    const v01 = perm[iy1 * 256 + ix0];
    const v11 = perm[iy1 * 256 + ix1];
    return v00 + (v10 - v00) * xf + (v01 - v00) * yf + (v00 - v10 - v01 + v11) * xf * yf;
  };
}

/** Fractal noise helper for terrain etc (non-tiling, world space). */
const worldNoise = makeNoise(1337);
export function fbm(x: number, y: number, octaves = 4): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += worldNoise(x * f + i * 17.3, y * f - i * 9.1) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return v;
}

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.shared = true;
  return t;
}

type RGB = [number, number, number];

function noiseFill(ctx: CanvasRenderingContext2D, size: number, seed: number, base: RGB, variance: RGB, scale: number, octaves = 4): void {
  const n = makeNoise(seed);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let f = 1;
      for (let o = 0; o < octaves; o++) {
        const period = scale * f;
        v += n((x / size) * period, (y / size) * period, period) * amp;
        amp *= 0.5;
        f *= 2;
      }
      v = v * 2 - 0.9;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] + variance[0] * v));
      img.data[i + 1] = Math.max(0, Math.min(255, base[1] + variance[1] * v));
      img.data[i + 2] = Math.max(0, Math.min(255, base[2] + variance[2] * v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx: CanvasRenderingContext2D, size: number, seed: number, count: number, colors: string[], min: number, max: number, shape: 'dot' | 'leaf' | 'line' = 'dot'): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.strokeStyle = ctx.fillStyle;
    const x = r() * size;
    const y = r() * size;
    const s = min + r() * (max - min);
    ctx.globalAlpha = 0.35 + r() * 0.6;
    if (shape === 'dot') {
      ctx.fillRect(x, y, s, s);
    } else if (shape === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.45, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = Math.max(1, s * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, y);
      const a = r() * Math.PI * 2;
      ctx.lineTo(x + Math.cos(a) * s * 3, y + Math.sin(a) * s * 3);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

export type TexName =
  | 'forestFloor'
  | 'dirt'
  | 'bark'
  | 'asphalt'
  | 'concrete'
  | 'planks'
  | 'wallpaper'
  | 'metal'
  | 'tiles'
  | 'siding'
  | 'gravel'
  | 'rock'
  | 'carpet'
  | 'roof';

export function tex(name: TexName): THREE.Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  let t: THREE.Texture;
  const S = 256;
  switch (name) {
    case 'forestFloor': {
      const [c, ctx] = canvas(512);
      noiseFill(ctx, 512, 11, [48, 44, 32], [30, 28, 20], 8, 5);
      speckle(ctx, 512, 12, 1800, ['#5a4526', '#3d3620', '#6b5a33', '#2c3a22', '#473219'], 2, 5, 'leaf');
      speckle(ctx, 512, 13, 300, ['#2a2418', '#6b6048'], 3, 8, 'line');
      t = finish(c, 1);
      break;
    }
    case 'dirt': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 21, [70, 58, 42], [30, 26, 20], 6, 5);
      speckle(ctx, S, 22, 500, ['#3e3325', '#86735a', '#5a4a38'], 1, 3);
      t = finish(c, 1);
      break;
    }
    case 'gravel': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 23, [86, 82, 76], [30, 30, 30], 10, 3);
      speckle(ctx, S, 24, 1600, ['#9a958c', '#5d5a55', '#77726a', '#3f3d3a'], 1, 4);
      t = finish(c, 1);
      break;
    }
    case 'bark': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 31, [58, 46, 36], [36, 30, 24], 4, 4);
      const r = rng(32);
      for (let i = 0; i < 90; i++) {
        ctx.strokeStyle = r() > 0.5 ? 'rgba(20,14,10,0.55)' : 'rgba(110,95,80,0.25)';
        ctx.lineWidth = 1 + r() * 3;
        const x = r() * S;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        let xx = x;
        for (let y = 0; y <= S; y += 16) {
          xx += (r() - 0.5) * 6;
          ctx.lineTo(xx, y);
        }
        ctx.stroke();
      }
      t = finish(c, 1);
      break;
    }
    case 'asphalt': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 41, [44, 44, 46], [16, 16, 16], 12, 4);
      speckle(ctx, S, 42, 2200, ['#1d1d1e', '#5c5c5f', '#3a3a3c'], 1, 2);
      const r = rng(43);
      ctx.strokeStyle = 'rgba(10,10,10,0.6)';
      for (let i = 0; i < 6; i++) {
        ctx.lineWidth = 1 + r();
        ctx.beginPath();
        let x = r() * S;
        let y = r() * S;
        ctx.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += (r() - 0.5) * 30;
          y += (r() - 0.5) * 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      t = finish(c, 1);
      break;
    }
    case 'concrete': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 51, [120, 118, 112], [34, 34, 32], 5, 5);
      speckle(ctx, S, 52, 400, ['#6e6b64', '#9a978f'], 1, 2);
      speckle(ctx, S, 53, 12, ['rgba(40,35,25,0.5)'], 10, 30, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'planks': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 61, [92, 68, 46], [34, 26, 18], 3, 4);
      const r = rng(62);
      const rows = 8;
      for (let i = 0; i < rows; i++) {
        const y = (i * S) / rows;
        ctx.fillStyle = `rgba(${40 + r() * 30},${28 + r() * 20},${18 + r() * 10},0.35)`;
        ctx.fillRect(0, y, S, S / rows);
        ctx.fillStyle = 'rgba(15,10,6,0.8)';
        ctx.fillRect(0, y, S, 2);
        const off = r() * S;
        ctx.fillRect(off, y, 2, S / rows);
        for (let g = 0; g < 10; g++) {
          ctx.strokeStyle = 'rgba(30,20,12,0.25)';
          ctx.beginPath();
          const gy = y + r() * (S / rows);
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(S * 0.3, gy + (r() - 0.5) * 6, S * 0.6, gy + (r() - 0.5) * 6, S, gy);
          ctx.stroke();
        }
      }
      t = finish(c, 1);
      break;
    }
    case 'siding': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 65, [150, 146, 132], [30, 30, 26], 4, 3);
      for (let i = 0; i < 12; i++) {
        const y = (i * S) / 12;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y, S, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, y + 2, S, 2);
      }
      speckle(ctx, S, 66, 30, ['rgba(60,70,40,0.35)', 'rgba(50,40,30,0.3)'], 6, 20, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'wallpaper': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 71, [118, 104, 82], [18, 16, 14], 3, 3);
      ctx.fillStyle = 'rgba(80,60,40,0.25)';
      for (let x = 0; x < S; x += 32) {
        for (let y = 0; y < S; y += 32) {
          ctx.beginPath();
          ctx.arc(x + ((y / 32) % 2) * 16 + 8, y + 16, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (let x = 0; x < S; x += 16) {
        ctx.fillStyle = 'rgba(60,45,30,0.12)';
        ctx.fillRect(x, 0, 3, S);
      }
      speckle(ctx, S, 72, 20, ['rgba(60,50,30,0.25)'], 10, 40, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'metal': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 81, [110, 112, 116], [20, 20, 22], 16, 3);
      const r = rng(82);
      for (let i = 0; i < 200; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${r() * 0.06})`;
        ctx.beginPath();
        const y = r() * S;
        ctx.moveTo(0, y);
        ctx.lineTo(S, y + (r() - 0.5) * 4);
        ctx.stroke();
      }
      speckle(ctx, S, 83, 40, ['rgba(90,50,20,0.4)'], 3, 12, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'tiles': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 91, [170, 168, 160], [20, 20, 20], 6, 3);
      ctx.strokeStyle = 'rgba(40,40,40,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= S; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, S);
        ctx.moveTo(0, i);
        ctx.lineTo(S, i);
        ctx.stroke();
      }
      speckle(ctx, S, 92, 25, ['rgba(80,70,40,0.25)'], 6, 18, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'rock': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 101, [88, 88, 86], [44, 44, 42], 6, 5);
      speckle(ctx, S, 102, 120, ['rgba(60,80,50,0.5)', 'rgba(40,40,38,0.6)'], 3, 9, 'leaf');
      t = finish(c, 1);
      break;
    }
    case 'carpet': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 111, [78, 42, 38], [20, 12, 10], 20, 3);
      speckle(ctx, S, 112, 1500, ['#3a1d1a', '#6d3a33'], 1, 2);
      t = finish(c, 1);
      break;
    }
    case 'roof': {
      const [c, ctx] = canvas(S);
      noiseFill(ctx, S, 121, [52, 48, 46], [20, 18, 18], 8, 3);
      for (let y = 0; y < S; y += 16) {
        const off = (y / 16) % 2 ? 16 : 0;
        for (let x = -off; x < S; x += 32) {
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.strokeRect(x, y, 32, 16);
        }
      }
      t = finish(c, 1);
      break;
    }
  }
  cache.set(name, t!);
  return t!;
}

/** Clone of a cached texture with its own repeat (clones share the image). */
export function texRepeat(name: TexName, rx: number, ry = rx): THREE.Texture {
  const key = `${name}@${rx.toFixed(2)}x${ry.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = tex(name).clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

export interface TextTexOptions {
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  font?: string;
  size?: number;
  align?: CanvasTextAlign;
  padding?: number;
  lineHeight?: number;
  paper?: boolean;
  border?: string;
  rotate?: number;
}

/** Renders text into a (non-shared) texture for signs, notes, graffiti etc. */
export function textTexture(lines: string[], o: TextTexOptions = {}): THREE.CanvasTexture {
  const w = o.width ?? 512;
  const h = o.height ?? 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  if (o.paper) {
    const r = rng(w + h);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(80,60,30,${r() * 0.05})`;
      ctx.fillRect(r() * w, r() * h, 2 + r() * 20, 2 + r() * 20);
    }
  }
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(4, w * 0.02);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  const size = o.size ?? 48;
  ctx.fillStyle = o.fg ?? '#111';
  ctx.font = o.font ?? `bold ${size}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  const lh = o.lineHeight ?? size * 1.2;
  const total = lh * lines.length;
  const pad = o.padding ?? 20;
  const x = ctx.textAlign === 'left' ? pad : ctx.textAlign === 'right' ? w - pad : w / 2;
  lines.forEach((line, i) => {
    const y = h / 2 - total / 2 + lh * (i + 0.5);
    if (o.rotate) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(o.rotate);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(line, x, y);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
