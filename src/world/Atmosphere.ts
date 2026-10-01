import * as THREE from 'three';
import { glowTexture } from './Builder';
import { rng } from './Textures';

export interface AtmosphereConfig {
  fogColor: number;
  fogDensity: number;
  skyTop: number;
  skyBottom: number;
  moon?: boolean;
  stars?: boolean;
  moonDir?: [number, number, number];
  moonColor?: number;
  moonIntensity?: number;
  hemiSky?: number;
  hemiGround?: number;
  hemiIntensity?: number;
  particles?: 'dust' | 'fireflies' | 'ash' | 'none';
  particleCount?: number;
  exposure?: number;
  shadows?: boolean;
}

/** Sky dome, moon, fog, ambient lights and floating particles for a level. */
export class Atmosphere {
  group = new THREE.Group();
  /** Follows the camera: sky dome, stars and moon. */
  skyGroup = new THREE.Group();
  moonLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  private particles?: THREE.Points;
  private pVel?: Float32Array;
  private fireflies = false;
  moonSprite?: THREE.Sprite;
  fog: THREE.FogExp2;
  cfg: AtmosphereConfig;
  /** Base (outdoor) light levels; scaled down indoors. */
  baseHemi = 0.5;
  baseMoon = 0.35;
  private ambientScale = 1;
  targetAmbient = 1;

  constructor(private scene: THREE.Scene, cfg: AtmosphereConfig, shadowsAllowed: boolean, shadowMapSize: number) {
    this.cfg = cfg;
    this.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.fog = this.fog;
    scene.background = new THREE.Color(cfg.fogColor);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(cfg.skyTop) },
        bottom: { value: new THREE.Color(cfg.skyBottom) },
        fogCol: { value: new THREE.Color(cfg.fogColor) },
        time: { value: 0 },
        pulse: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 fogCol; uniform float time; uniform float pulse; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 c = mix(bottom, top, smoothstep(0.0, 0.7, h));
          c = mix(fogCol, c, smoothstep(-0.05, 0.25, h));
          c += vec3(0.25,0.02,0.02) * pulse * (0.5 + 0.5*sin(time*3.0 + vDir.x*4.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.skyGroup.add(this.sky);
    this.group.add(this.skyGroup);

    if (cfg.stars) {
      const r = rng(9);
      const n = 900;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = r() * Math.PI * 2;
        const v = 0.08 + r() * 0.92;
        const rad = 280;
        pos[i * 3] = Math.cos(u) * Math.sqrt(1 - v * v) * rad;
        pos[i * 3 + 1] = v * rad;
        pos[i * 3 + 2] = Math.sin(u) * Math.sqrt(1 - v * v) * rad;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaab4c8, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
      stars.frustumCulled = false;
      this.skyGroup.add(stars);
    }

    const md = new THREE.Vector3(...(cfg.moonDir ?? [0.4, 0.6, -0.7])).normalize();
    if (cfg.moon) {
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdfe8ff, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      moon.position.copy(md).multiplyScalar(260);
      moon.scale.set(40, 40, 1);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(), color: 0xeef2fa, fog: false, transparent: true, depthWrite: false }));
      core.position.copy(md).multiplyScalar(270);
      core.scale.set(9, 9, 1);
      this.skyGroup.add(moon, core);
      this.moonSprite = moon;
    }

    this.moonLight = new THREE.DirectionalLight(cfg.moonColor ?? 0x8fa6d8, cfg.moonIntensity ?? 0.35);
    this.moonLight.position.copy(md).multiplyScalar(60);
    this.moonLight.target.position.set(0, 0, 0);
    if (shadowsAllowed && cfg.shadows !== false) {
      this.moonLight.castShadow = true;
      this.moonLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      const s = 35;
      Object.assign(this.moonLight.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
      this.moonLight.shadow.bias = -0.0015;
      this.moonLight.shadow.normalBias = 0.04;
    }
    this.group.add(this.moonLight, this.moonLight.target);

    this.hemi = new THREE.HemisphereLight(cfg.hemiSky ?? 0x33405a, cfg.hemiGround ?? 0x16140f, cfg.hemiIntensity ?? 0.5);
    this.baseHemi = cfg.hemiIntensity ?? 0.5;
    this.baseMoon = cfg.moonIntensity ?? 0.35;
    this.group.add(this.hemi);

    if (cfg.particles && cfg.particles !== 'none') this.makeParticles(cfg.particles, cfg.particleCount ?? 250);
    scene.add(this.group);
  }

  private makeParticles(kind: 'dust' | 'fireflies' | 'ash', n: number): void {
    const r = rng(4);
    const pos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 30;
      pos[i * 3 + 1] = r() * 6;
      pos[i * 3 + 2] = (r() - 0.5) * 30;
      this.pVel[i * 3] = (r() - 0.5) * 0.2;
      this.pVel[i * 3 + 1] = kind === 'ash' ? -0.2 - r() * 0.2 : (r() - 0.5) * 0.08;
      this.pVel[i * 3 + 2] = (r() - 0.5) * 0.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = kind === 'fireflies';
    const mat = new THREE.PointsMaterial({
      map: glowTexture(),
      color: kind === 'fireflies' ? 0xd8ff90 : kind === 'ash' ? 0x999999 : 0xb8c0cc,
      size: kind === 'fireflies' ? 0.12 : 0.05,
      transparent: true,
      opacity: kind === 'fireflies' ? 0.9 : 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(g, mat);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  setPulse(v: number): void {
    this.skyMat.uniforms.pulse.value = v;
  }

  setSky(top: number, bottom: number, fog: number): void {
    this.skyMat.uniforms.top.value.setHex(top);
    this.skyMat.uniforms.bottom.value.setHex(bottom);
    this.skyMat.uniforms.fogCol.value.setHex(fog);
    this.fog.color.setHex(fog);
    (this.scene.background as THREE.Color).setHex(fog);
  }

  update(dt: number, t: number, camPos: THREE.Vector3): void {
    this.skyGroup.position.copy(camPos);
    this.skyMat.uniforms.time.value = t;
    this.ambientScale += (this.targetAmbient - this.ambientScale) * Math.min(1, dt * 3);
    this.hemi.intensity = this.baseHemi * this.ambientScale;
    this.moonLight.intensity = this.baseMoon * this.ambientScale;
    // keep moon shadow frustum centred on player
    this.moonLight.target.position.set(camPos.x, 0, camPos.z);
    const md = new THREE.Vector3(...(this.cfg.moonDir ?? [0.4, 0.6, -0.7])).normalize();
    this.moonLight.position.set(camPos.x + md.x * 60, md.y * 60, camPos.z + md.z * 60);

    if (this.particles && this.pVel) {
      const pos = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const n = arr.length / 3;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        arr[k] += (this.pVel[k] + Math.sin(t * 0.5 + i) * 0.05) * dt;
        arr[k + 1] += (this.pVel[k + 1] + (this.fireflies ? Math.sin(t * 1.3 + i * 1.7) * 0.15 : 0)) * dt;
        arr[k + 2] += (this.pVel[k + 2] + Math.cos(t * 0.4 + i) * 0.05) * dt;
        // wrap around camera
        const dx = arr[k] - camPos.x;
        const dz = arr[k + 2] - camPos.z;
        if (dx > 15) arr[k] -= 30;
        if (dx < -15) arr[k] += 30;
        if (dz > 15) arr[k + 2] -= 30;
        if (dz < -15) arr[k + 2] += 30;
        if (arr[k + 1] > camPos.y + 5) arr[k + 1] -= 6;
        if (arr[k + 1] < camPos.y - 2) arr[k + 1] += 6;
      }
      pos.needsUpdate = true;
      if (this.fireflies) (this.particles.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 2) * 0.3;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.moonLight.dispose();
    if (this.moonLight.shadow.map) this.moonLight.shadow.map.dispose();
  }
}

let disc: THREE.Texture | null = null;
function discTexture(): THREE.Texture {
  if (disc) return disc;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(28, 28, 4, 32, 32, 30);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.85, '#dfe6f2');
  grad.addColorStop(1, 'rgba(220,230,245,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(150,160,175,0.35)';
  for (const [x, y, r] of [[24, 26, 6], [38, 36, 5], [30, 42, 3], [40, 22, 3]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  disc = new THREE.CanvasTexture(c);
  disc.userData.shared = true;
  return disc;
}
