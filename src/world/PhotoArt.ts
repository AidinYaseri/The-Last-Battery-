import { rng } from './Textures';

export type PhotoKind =
  | 'campsite'
  | 'campsite_figure'
  | 'trees'
  | 'town'
  | 'highway'
  | 'cabin_ext'
  | 'cabin_int'
  | 'portrait'
  | 'portrait_sleep'
  | 'mara'
  | 'mara_sam'
  | 'cctv'
  | 'tunnel'
  | 'police'
  | 'motel';

export interface PhotoOpts {
  date?: string;
  seed?: number;
  w?: number;
  h?: number;
  mono?: boolean;
  caption?: string;
  /** CCTV: horizontal position (0..1) of the figure */
  figureX?: number;
  cam?: string;
}

function figure(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color = '#050505', facing = 0): void {
  ctx.fillStyle = color;
  const hw = h * 0.13;
  ctx.beginPath();
  ctx.arc(x, y - h + hw * 0.9, hw * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - hw * 1.4, y - h * 0.18);
  ctx.quadraticCurveTo(x - hw * 1.6, y - h + hw * 2.2, x, y - h + hw * 1.9);
  ctx.quadraticCurveTo(x + hw * 1.6, y - h + hw * 2.2, x + hw * 1.4, y - h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - hw * 0.9, y - h * 0.22, hw * 0.75, h * 0.22);
  ctx.fillRect(x + hw * 0.15 + facing, y - h * 0.22, hw * 0.75, h * 0.22);
}

function pine(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, base - h);
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 5;
    ctx.lineTo(x + h * 0.22 * t, base - h + h * t * 0.95);
    ctx.lineTo(x + h * 0.08 * t, base - h + h * t * 0.95 - h * 0.05);
  }
  ctx.lineTo(x + 3, base);
  ctx.lineTo(x - 3, base);
  for (let i = 4; i >= 0; i--) {
    const t = (i + 1) / 5;
    ctx.lineTo(x - h * 0.08 * t, base - h + h * t * 0.95 - h * 0.05);
    ctx.lineTo(x - h * 0.22 * t, base - h + h * t * 0.95);
  }
  ctx.closePath();
  ctx.fill();
}

function grainAndVignette(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 1): void {
  const r = rng(seed * 7 + 3);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 38 * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function stamp(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  ctx.font = `bold ${Math.round(h * 0.07)}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,140,40,0.9)';
  ctx.shadowColor = 'rgba(255,100,20,0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, w - w * 0.04, h - h * 0.04);
  ctx.shadowBlur = 0;
}

/** Draws a moody pseudo-photograph onto a canvas. */
export function drawPhoto(kind: PhotoKind, o: PhotoOpts = {}): HTMLCanvasElement {
  const w = o.w ?? 320;
  const h = o.h ?? 240;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const r = rng(o.seed ?? kind.length * 131);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  const night = kind !== 'mara' && kind !== 'mara_sam';
  if (night) {
    sky.addColorStop(0, '#0b1018');
    sky.addColorStop(0.6, '#141a20');
    sky.addColorStop(1, '#0a0b0c');
  } else {
    sky.addColorStop(0, '#8aa3b4');
    sky.addColorStop(0.6, '#c9b99a');
    sky.addColorStop(1, '#5c5a40');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const horizon = h * 0.62;

  const flash = (x: number, y: number, rad: number, a = 0.35) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(230,225,200,${a})`);
    g.addColorStop(1, 'rgba(230,225,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  switch (kind) {
    case 'trees':
    case 'campsite':
    case 'campsite_figure': {
      for (let i = 0; i < 26; i++) pine(ctx, r() * w, horizon + r() * 20, 80 + r() * 140, `rgba(${8 + r() * 10},${12 + r() * 12},${10 + r() * 8},1)`);
      ctx.fillStyle = '#1b1712';
      ctx.fillRect(0, horizon + 10, w, h);
      flash(w / 2, h * 0.7, w * 0.5, 0.3);
      if (kind !== 'trees') {
        // tent
        ctx.fillStyle = '#4b5a3a';
        ctx.beginPath();
        ctx.moveTo(w * 0.28, h * 0.84);
        ctx.lineTo(w * 0.42, h * 0.58);
        ctx.lineTo(w * 0.58, h * 0.84);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a2014';
        ctx.beginPath();
        ctx.moveTo(w * 0.4, h * 0.84);
        ctx.lineTo(w * 0.42, h * 0.66);
        ctx.lineTo(w * 0.46, h * 0.84);
        ctx.closePath();
        ctx.fill();
        // fire pit
        ctx.fillStyle = '#50463c';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(w * 0.7 + Math.cos(a) * 18, h * 0.86 + Math.sin(a) * 6, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,120,40,0.5)';
        ctx.beginPath();
        ctx.arc(w * 0.7, h * 0.86, 7, 0, Math.PI * 2);
        ctx.fill();
        // chair
        ctx.fillStyle = '#2d3b52';
        ctx.fillRect(w * 0.8, h * 0.76, 20, 16);
      }
      if (kind === 'campsite_figure') figure(ctx, w * 0.62, h * 0.86, h * 0.42, '#080808');
      break;
    }
    case 'town':
    case 'motel':
    case 'police': {
      ctx.fillStyle = '#16181b';
      ctx.fillRect(0, horizon, w, h);
      ctx.fillStyle = '#23252a';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, horizon);
      ctx.lineTo(w * 0.58, horizon);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const bx = i < 3 ? w * (0.02 + i * 0.13) : w * (0.66 + (i - 3) * 0.17);
        const bw = w * 0.12;
        const bh = h * (0.18 + r() * 0.15);
        ctx.fillStyle = '#0c0e10';
        ctx.fillRect(bx, horizon - bh, bw, bh + 10);
        if (r() > 0.4) {
          ctx.fillStyle = 'rgba(255,190,110,0.7)';
          ctx.fillRect(bx + bw * 0.3, horizon - bh * 0.7, bw * 0.3, bh * 0.2);
        }
      }
      // streetlight
      ctx.fillStyle = '#050505';
      ctx.fillRect(w * 0.75, h * 0.25, 3, h * 0.55);
      const g = ctx.createRadialGradient(w * 0.75, h * 0.26, 0, w * 0.75, h * 0.26, w * 0.25);
      g.addColorStop(0, 'rgba(255,200,120,0.8)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (kind === 'motel') {
        ctx.fillStyle = 'rgba(220,60,60,0.9)';
        ctx.font = `bold ${h * 0.09}px Arial`;
        ctx.fillText('MOTEL', w * 0.66, horizon - h * 0.28);
      }
      if (kind === 'police') {
        ctx.fillStyle = '#0d0f12';
        ctx.fillRect(w * 0.3, horizon - h * 0.3, w * 0.4, h * 0.3);
        ctx.fillStyle = 'rgba(80,120,255,0.8)';
        ctx.fillRect(w * 0.47, horizon - h * 0.34, w * 0.06, h * 0.03);
      }
      figure(ctx, w * 0.52, horizon + h * 0.12, h * 0.2, '#030303');
      break;
    }
    case 'highway':
    case 'tunnel': {
      ctx.fillStyle = '#101214';
      ctx.fillRect(0, horizon, w, h);
      for (let i = 0; i < 14; i++) pine(ctx, r() * w, horizon, 40 + r() * 60, '#07090a');
      ctx.fillStyle = '#26282b';
      ctx.beginPath();
      ctx.moveTo(w * 0.47, horizon);
      ctx.lineTo(w * 0.53, horizon);
      ctx.lineTo(w * 0.95, h);
      ctx.lineTo(w * 0.05, h);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,210,150,0.6)';
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(w / 2, horizon);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.setLineDash([]);
      if (kind === 'tunnel') {
        ctx.fillStyle = '#1c1d1f';
        ctx.fillRect(w * 0.25, horizon - h * 0.35, w * 0.5, h * 0.35);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(w / 2, horizon, w * 0.14, h * 0.2, 0, Math.PI, 0);
        ctx.fill();
      } else {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = '#0a0a0b';
          const cx = w * (0.3 + i * 0.18);
          const cy = horizon + h * (0.08 + i * 0.05);
          ctx.fillRect(cx, cy, w * 0.1, h * 0.05);
        }
      }
      figure(ctx, w * 0.5, horizon + h * 0.25, h * 0.2, '#040404');
      break;
    }
    case 'cabin_ext': {
      for (let i = 0; i < 20; i++) pine(ctx, r() * w, horizon, 90 + r() * 90, '#070a08');
      ctx.fillStyle = '#121310';
      ctx.fillRect(0, horizon, w, h);
      ctx.fillStyle = '#1c1612';
      ctx.fillRect(w * 0.28, horizon - h * 0.2, w * 0.44, h * 0.26);
      ctx.beginPath();
      ctx.moveTo(w * 0.24, horizon - h * 0.2);
      ctx.lineTo(w * 0.5, horizon - h * 0.38);
      ctx.lineTo(w * 0.76, horizon - h * 0.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,200,120,0.85)';
      ctx.fillRect(w * 0.36, horizon - h * 0.12, w * 0.07, h * 0.07);
      ctx.fillStyle = '#060505';
      ctx.fillRect(w * 0.53, horizon - h * 0.14, w * 0.07, h * 0.2);
      figure(ctx, w * 0.565, horizon + h * 0.06, h * 0.2, '#020202');
      break;
    }
    case 'cabin_int':
    case 'portrait_sleep': {
      ctx.fillStyle = '#20180f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b2117';
      ctx.fillRect(0, h * 0.65, w, h);
      flash(w * 0.5, h * 0.5, w * 0.6, 0.45);
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(w * 0.15, h * 0.62, w * 0.6, h * 0.18);
      ctx.fillStyle = '#c9c4b8';
      ctx.fillRect(w * 0.16, h * 0.6, w * 0.14, h * 0.07);
      // sleeping figure
      ctx.fillStyle = '#0b0b0b';
      ctx.beginPath();
      ctx.ellipse(w * 0.45, h * 0.62, w * 0.2, h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w * 0.24, h * 0.6, h * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'portrait':
    case 'mara':
    case 'mara_sam': {
      if (kind === 'portrait') {
        ctx.fillStyle = '#1a1c1f';
        ctx.fillRect(0, 0, w, h);
        flash(w / 2, h * 0.45, w * 0.5, 0.5);
        figure(ctx, w * 0.5, h * 1.35, h * 1.2, '#15120f');
        // obscured face
        ctx.fillStyle = 'rgba(200,190,170,0.25)';
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.3, h * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        for (let i = 0; i < 12; i++) pine(ctx, r() * w, horizon, 60 + r() * 60, '#2c3a24');
        ctx.fillStyle = '#6d6a44';
        ctx.fillRect(0, horizon, w, h);
        figure(ctx, w * (kind === 'mara' ? 0.5 : 0.4), h * 1.05, h * 0.75, '#6a3b2b');
        ctx.fillStyle = '#d9b48f';
        ctx.beginPath();
        ctx.arc(w * (kind === 'mara' ? 0.5 : 0.4), h * 0.39, h * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b2616';
        ctx.fillRect(w * (kind === 'mara' ? 0.5 : 0.4) - h * 0.08, h * 0.3, h * 0.16, h * 0.05);
        if (kind === 'mara_sam') {
          figure(ctx, w * 0.62, h * 1.05, h * 0.8, '#2b3a4a');
          ctx.fillStyle = '#caa27d';
          ctx.beginPath();
          ctx.arc(w * 0.62, h * 0.35, h * 0.07, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'cctv': {
      ctx.fillStyle = '#2a2d2a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3b3f3a';
      ctx.fillRect(w * 0.1, h * 0.25, w * 0.8, h * 0.6);
      ctx.fillStyle = '#1b1d1b';
      ctx.fillRect(w * 0.42, h * 0.25, w * 0.14, h * 0.4);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(w * 0.1, h * 0.25, w * 0.8, h * 0.6);
      figure(ctx, w * (o.figureX ?? 0.5), h * 0.86, h * 0.34, '#0a0a0a');
      ctx.fillStyle = '#e8e8e8';
      ctx.font = `bold ${h * 0.07}px "Courier New", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(o.cam ?? 'CAM 02', w * 0.04, h * 0.1);
      break;
    }
  }

  grainAndVignette(ctx, w, h, o.seed ?? 3, kind === 'cctv' ? 1.6 : 1);
  if (o.mono || kind === 'cctv') {
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const l = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
      img.data[i] = l * 0.9;
      img.data[i + 1] = l;
      img.data[i + 2] = l * 0.9;
    }
    ctx.putImageData(img, 0, 0);
    if (kind === 'cctv') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    }
  }
  if (o.date) stamp(ctx, w, h, o.date);
  if (o.caption) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h - h * 0.14, w, h * 0.14);
    ctx.fillStyle = '#ddd';
    ctx.font = `${h * 0.06}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.caption, w * 0.04, h - h * 0.07);
  }
  return c;
}

/** Polaroid-style frame around a photo canvas, for props in the world. */
export function polaroid(photo: HTMLCanvasElement, handwriting?: string): HTMLCanvasElement {
  const pad = Math.round(photo.width * 0.06);
  const bottom = Math.round(photo.height * 0.28);
  const c = document.createElement('canvas');
  c.width = photo.width + pad * 2;
  c.height = photo.height + pad + bottom;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e8e2d2';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(photo, pad, pad);
  if (handwriting) {
    ctx.fillStyle = '#1b2a6b';
    ctx.font = `italic ${Math.round(bottom * 0.38)}px "Segoe Print", "Comic Sans MS", cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(handwriting, c.width / 2, photo.height + pad + bottom / 2);
  }
  return c;
}
