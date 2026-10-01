import * as THREE from 'three';

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distToPolyline(px: number, pz: number, pts: [number, number][]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Carved spiral symbol texture (the recurring mark). */
export function spiralTexture(color = 'rgba(210,190,160,0.95)', paint = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = paint ? 7 : 5;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.1) {
    const r = 4 + a * 2.9;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  if (!paint) {
    g.strokeStyle = 'rgba(40,25,15,0.6)';
    g.lineWidth = 2;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hand-painted text texture (for walls, trees, mirrors). */
export function paintTexture(lines: string[], color = '#e8e8e0', w = 512, h = 256, font = 'bold 54px "Special Elite", "Courier New", monospace'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 6;
  const lh = h / (lines.length + 0.5);
  lines.forEach((l, i) => {
    g.save();
    g.translate(w / 2, lh * (i + 0.75));
    g.rotate((Math.random() - 0.5) * 0.06);
    g.fillText(l, 0, 0);
    g.restore();
    // drips
    for (let k = 0; k < 4; k++) {
      const x = w / 2 + (Math.random() - 0.5) * w * 0.7;
      g.fillRect(x, lh * (i + 0.75) + 18, 3, 10 + Math.random() * 30);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
