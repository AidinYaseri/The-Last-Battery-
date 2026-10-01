import * as THREE from 'three';
import { tex, texRepeat, type TexName } from './Textures';

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(m: T): T {
  m.userData.shared = true;
  return m;
}

/** Cached standard material using a procedural texture. */
export function texMat(name: TexName, repeat = 1, opts: { rough?: number; metal?: number; color?: number; bump?: number } = {}): THREE.MeshStandardMaterial {
  const key = `tex:${name}:${repeat}:${opts.rough ?? ''}:${opts.metal ?? ''}:${opts.color ?? ''}:${opts.bump ?? ''}`;
  const hit = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (hit) return hit;
  const map = repeat === 1 ? tex(name) : texRepeat(name, repeat);
  const m = shared(
    new THREE.MeshStandardMaterial({
      map,
      roughness: opts.rough ?? 0.9,
      metalness: opts.metal ?? 0,
      color: opts.color ?? 0xffffff,
      bumpMap: opts.bump ? map : null,
      bumpScale: opts.bump ?? 0,
    }),
  );
  cache.set(key, m);
  return m;
}

/** Cached flat colour material. */
export function colorMat(color: number, rough = 0.8, metal = 0, emissive = 0, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `col:${color}:${rough}:${metal}:${emissive}:${emissiveIntensity}`;
  const hit = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (hit) return hit;
  const m = shared(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity }));
  cache.set(key, m);
  return m;
}

/** Cached unlit material (emissive screens, lamps, glow). */
export function basicMat(color: number, opts: { transparent?: boolean; opacity?: number; additive?: boolean; fog?: boolean; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const key = `basic:${color}:${opts.transparent}:${opts.opacity}:${opts.additive}:${opts.fog}:${opts.side}`;
  const hit = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (hit) return hit;
  const m = shared(
    new THREE.MeshBasicMaterial({
      color,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !opts.additive,
      fog: opts.fog ?? true,
      side: opts.side ?? THREE.FrontSide,
    }),
  );
  cache.set(key, m);
  return m;
}

export const Mats = {
  glass: () => {
    const key = 'glass';
    const hit = cache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = shared(new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.72 }));
    m.userData.batchable = true;
    cache.set(key, m);
    return m;
  },
  windowLit: () => colorMat(0x2a2010, 0.6, 0, 0xd89850, 0.55),
  windowDark: () => colorMat(0x05070a, 0.2, 0.3),
};

/**
 * Adds a gentle wind sway to a material's vertex shader.
 * Displacement scales with local vertex height so trunks stay planted.
 */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

export function addWind(m: THREE.Material, strength = 0.08, heightScale = 0.15): THREE.Material {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float h = max(0.0, position.y) * ${heightScale.toFixed(3)};
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #endif
          float ph = ip.x * 0.21 + ip.z * 0.17;
          float s = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25 + sin(uTime * 0.4 + ph * 0.3) * 0.5;
          transformed.x += s * h * h * ${strength.toFixed(3)} * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * h * h * ${(strength * 0.6).toFixed(3)} * uWind;
        }`,
      );
  };
  m.customProgramCacheKey = () => `wind${strength}_${heightScale}`;
  return m;
}
