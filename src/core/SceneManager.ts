import * as THREE from 'three';
import type { Quality } from './Settings';

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  treeDensity: number;
  grassDensity: number;
  particles: number;
  moonShadows: boolean;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 512, treeDensity: 0.55, grassDensity: 0.25, particles: 120, moonShadows: false },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 512, treeDensity: 0.8, grassDensity: 0.6, particles: 260, moonShadows: false },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, treeDensity: 1, grassDensity: 1, particles: 420, moonShadows: true },
};

/** Owns the renderer, the main scene and the player camera. */
export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  profile: QualityProfile;
  quality: Quality;

  constructor(public canvas: HTMLCanvasElement, quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
    this.scene.add(this.camera);
    this.quality = quality;
    this.profile = QUALITY[quality];
    this.applyQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    this.profile = QUALITY[q];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.min(dpr, this.profile.pixelRatio * (dpr > 1 ? 1 : 1)));
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
