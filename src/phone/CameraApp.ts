import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PhotoRecord } from '../core/GameState';
import { drawPhoto } from '../world/PhotoArt';
import { PHOTO_LAYER } from '../world/Builder';
import { PRESET_PHOTOS } from '../story/StoryData';
import { appHeader, esc, h, APP_ICONS, type PhoneApp } from './PhoneApp';

export interface PhotoTarget {
  id: string;
  pos: THREE.Vector3;
  /** max distance */
  range: number;
  once?: boolean;
  enabled?: () => boolean;
  onReveal: (dataUrl: string) => void;
}

/**
 * Camera + gallery. Photos cost 1%. Objects on PHOTO_LAYER are only visible
 * in photographs, so some clues can only be found this way.
 */
export class CameraApp implements PhoneApp {
  id = 'camera';
  name = 'Camera';
  color = 'linear-gradient(#8e8e93,#48484a)';
  icon = APP_ICONS.camera;
  private viewing: string | null = null;
  private presetCache = new Map<string, string>();
  flash: THREE.PointLight;
  private capturing = false;

  constructor(private ctx: GameContext) {
    this.flash = new THREE.PointLight(0xf0f4ff, 0, 18, 1.5);
    this.flash.position.set(0, 0, -0.3);
    ctx.camera.add(this.flash);
  }

  onOpen(): boolean {
    this.viewing = null;
    return true;
  }

  onBack(): boolean {
    if (this.viewing) {
      this.viewing = null;
      return true;
    }
    return false;
  }

  /** Preset photos that were already on the phone (they change in level 5). */
  presets(): PhotoRecord[] {
    const l5 = this.ctx.state.has('L5');
    return PRESET_PHOTOS.map((p) => {
      const kind = l5 && p.l5kind ? p.l5kind : p.kind;
      const key = `${p.id}:${kind}`;
      let url = this.presetCache.get(key);
      if (!url) {
        url = drawPhoto(kind, { date: p.date, seed: p.id.charCodeAt(1) * 7, w: 320, h: 240 }).toDataURL('image/jpeg', 0.8);
        this.presetCache.set(key, url);
      }
      return { id: p.id, label: p.label, dataUrl: url, time: p.date, level: 0, preset: true };
    });
  }

  allPhotos(): PhotoRecord[] {
    return [...this.ctx.state.data.photos.filter((p) => p.dataUrl).reverse(), ...this.presets().reverse()];
  }

  render(root: HTMLElement): void {
    const app = h('div', 'app');
    if (this.viewing) {
      const ph = this.allPhotos().find((p) => p.id === this.viewing);
      app.appendChild(appHeader(ph?.label ?? 'Photo', () => this.back(), 'Photos'));
      const body = h('div', 'app-body photo-view');
      if (ph) {
        body.innerHTML = `<img src="${ph.dataUrl}"/><div class="cap">${esc(ph.time)}${ph.preset ? '<br/><br/><i>You don\'t remember taking this.</i>' : ''}</div>`;
      }
      app.appendChild(body);
      root.appendChild(app);
      return;
    }
    app.appendChild(appHeader('Camera', () => this.ctx.phone.goHome(), 'Home'));
    const body = h('div', 'app-body');
    body.appendChild(h('div', 'btn primary', `<span>Open viewfinder</span><span class="cost">1% per photo</span>`, () => this.ctx.phone.enterViewfinder()));
    body.appendChild(h('div', 'gps-note', 'Some things only show up in photos.'));
    const grid = h('div', 'gallery');
    grid.style.marginTop = '12px';
    for (const p of this.allPhotos()) {
      const cell = h('div', 'ph', '', () => {
        this.viewing = p.id;
        this.ctx.audio.play('ui_tap', { bus: 'ui' });
        this.ctx.phone.refresh();
      });
      cell.style.backgroundImage = `url(${p.dataUrl})`;
      grid.appendChild(cell);
    }
    body.appendChild(grid);
    app.appendChild(body);
    root.appendChild(app);
  }

  private back(): void {
    this.viewing = null;
    this.ctx.audio.play('ui_back', { bus: 'ui' });
    this.ctx.phone.refresh();
  }

  /** Takes a photo from the player's view. */
  async capture(): Promise<void> {
    if (this.capturing) return;
    this.capturing = true;
    try {
      const ok = await this.ctx.battery.request(1, 'Taking a photo');
      if (!ok) return;
      const { renderer, scene, camera, audio, hud } = this.ctx;
      audio.play('shutter', { bus: 'ui' });
      camera.layers.enable(PHOTO_LAYER);
      this.flash.intensity = 60;
      renderer.render(scene, camera);
      const src = renderer.domElement;
      const out = document.createElement('canvas');
      out.width = 400;
      out.height = 300;
      const g = out.getContext('2d')!;
      const aspect = 4 / 3;
      let sw = src.width;
      let sh = src.width / aspect;
      if (sh > src.height) {
        sh = src.height;
        sw = sh * aspect;
      }
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 400, 300);
      camera.layers.disable(PHOTO_LAYER);
      this.flash.intensity = 0;
      // date stamp
      g.font = 'bold 18px "Courier New", monospace';
      g.fillStyle = 'rgba(255,140,40,0.9)';
      g.textAlign = 'right';
      g.fillText(`${this.ctx.state.dateString()} ${this.ctx.state.clockString()}`, 390, 290);
      const url = out.toDataURL('image/jpeg', 0.72);
      hud.flash(0.85);
      hud.showShot(url);
      const rec: PhotoRecord = { id: `u${Date.now()}`, label: `IMG_${2000 + this.ctx.state.data.photos.length}`, dataUrl: url, time: `Today ${this.ctx.state.clockString()}`, level: this.ctx.state.data.level };
      const photos = this.ctx.state.data.photos;
      photos.push(rec);
      while (photos.length > 12) photos.shift();
      this.checkReveals(url);
      this.ctx.save.autosave();
    } finally {
      this.capturing = false;
    }
  }

  private checkReveals(url: string): void {
    const lv = this.ctx.levels.current;
    if (!lv) return;
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const ray = new THREE.Raycaster();
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    for (const t of lv.photoTargets) {
      if (t.enabled && !t.enabled()) continue;
      const d = t.pos.distanceTo(camPos);
      if (d > t.range) continue;
      if (!frustum.containsPoint(t.pos)) continue;
      // must be reasonably centred
      const ndc = t.pos.clone().project(cam);
      if (Math.abs(ndc.x) > 0.75 || Math.abs(ndc.y) > 0.8) continue;
      ray.set(camPos, t.pos.clone().sub(camPos).normalize());
      ray.far = d - 0.4;
      const occ = ray.intersectObjects(lv.occluders.filter((o) => o.parent), true);
      if (occ.length) continue;
      if (t.once !== false) lv.photoTargets = lv.photoTargets.filter((x) => x !== t);
      t.onReveal(url);
      break;
    }
  }
}
