import type { GameContext } from '../core/Context';
import { appHeader, h, APP_ICONS, type PhoneApp } from './PhoneApp';

/**
 * Map of the current area. Viewing costs 0.2%, GPS drains 1% / 30 s,
 * downloading the full area map costs 1% and needs signal.
 */
export class MapApp implements PhoneApp {
  id = 'map';
  name = 'Maps';
  color = 'linear-gradient(#6ad3ff,#1e88e5)';
  icon = APP_ICONS.map;
  private canvas: HTMLCanvasElement | null = null;
  private timer = 0;

  constructor(private ctx: GameContext) {}

  async onOpen(): Promise<boolean> {
    return this.ctx.battery.request(0.2, 'Checking the map');
  }

  get gpsOn(): boolean {
    return this.ctx.phone.gpsOn;
  }

  private downloaded(): boolean {
    const lv = this.ctx.levels.current;
    return !!lv && (this.ctx.state.has(`map:${lv.id}`) || (lv.id === 1 && this.ctx.inventory.has('area_map')));
  }

  render(root: HTMLElement): void {
    const app = h('div', 'app');
    app.appendChild(appHeader('Maps', () => this.ctx.phone.goHome(), 'Home'));
    const body = h('div', 'app-body');
    const c = document.createElement('canvas');
    c.width = 560;
    c.height = 560;
    c.className = 'map-canvas';
    this.canvas = c;
    body.appendChild(c);
    const ctrl = h('div', 'map-controls');
    const gps = h('div', 'btn', `<span>GPS location <span class="cost">1% / 30s</span></span><div class="toggle ${this.gpsOn ? 'on' : ''}"></div>`, () => this.ctx.phone.setGPS(!this.gpsOn));
    ctrl.appendChild(gps);
    const lv = this.ctx.levels.current;
    if (!this.downloaded()) {
      ctrl.appendChild(
        h('div', 'btn', `<span>Download area map</span><span class="cost">1%</span>`, async () => {
          if (!this.ctx.phone.hasSignal()) {
            this.ctx.phone.toast('No service. Download failed.');
            return;
          }
          if (await this.ctx.battery.request(1, 'Downloading the map')) {
            if (lv) this.ctx.state.setFlag(`map:${lv.id}`);
            this.ctx.phone.toast('Area map downloaded.');
            this.ctx.phone.refresh();
          }
        }),
      );
    }
    body.appendChild(ctrl);
    const dest = lv?.gpsDestination?.();
    let note = this.gpsOn ? 'GPS is on and draining battery. Turn it off when you are done.' : 'GPS is off. Only places you have visited are shown.';
    if (dest && this.gpsOn) note = `DESTINATION: <b>${dest.label}</b><br/>${dest.sub ?? ''}`;
    if (!this.ctx.phone.hasSignal()) note += '<br/><span style="color:#ff9f0a">No service in this area.</span>';
    body.appendChild(h('div', 'gps-note', note));
    app.appendChild(body);
    root.appendChild(app);
    this.draw();
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer > 0.25) {
      this.timer = 0;
      this.draw();
    }
  }

  draw(): void {
    const c = this.canvas;
    const lv = this.ctx.levels.current;
    if (!c || !c.isConnected || !lv) return;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#12171d';
    g.fillRect(0, 0, W, H);
    const b = lv.mapBounds;
    const sx = (W - 40) / (b.maxX - b.minX);
    const sz = (H - 40) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (W - (b.maxX - b.minX) * s) / 2;
    const oz = (H - (b.maxZ - b.minZ) * s) / 2;
    const tx = (x: number) => ox + (x - b.minX) * s;
    const tz = (z: number) => oz + (z - b.minZ) * s;
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    g.lineWidth = 1;
    for (let i = 0; i < W; i += 28) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, H);
      g.moveTo(0, i);
      g.lineTo(W, i);
      g.stroke();
    }
    const full = this.downloaded();
    const disc = this.ctx.state.data.discovered;
    // roads: shown fully when downloaded, else only near discovered places
    for (const r of lv.mapRoads) {
      if (!full && !(r.always ?? false)) {
        const near = lv.landmarks.some((l) => disc.includes(`${lv.id}:${l.id}`) && r.pts.some(([x, z]) => Math.hypot(x - l.x, z - l.z) < 30));
        if (!near) continue;
      }
      g.strokeStyle = r.kind === 'road' ? '#4a5260' : '#5a4a36';
      g.lineWidth = Math.max(2, r.w * s);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.setLineDash(r.kind === 'path' ? [6, 5] : []);
      g.beginPath();
      r.pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
      g.stroke();
      g.setLineDash([]);
    }
    for (const a of lv.mapAreas) {
      if (!full && !disc.includes(`${lv.id}:${a.landmark ?? ''}`)) continue;
      g.fillStyle = '#2b323c';
      g.fillRect(tx(a.x - a.w / 2), tz(a.z - a.d / 2), a.w * s, a.d * s);
    }
    g.font = '600 15px Inter, sans-serif';
    g.textAlign = 'center';
    for (const l of lv.landmarks) {
      const known = disc.includes(`${lv.id}:${l.id}`);
      if (!known && !full) continue;
      g.fillStyle = known ? '#ffcc4d' : '#6a7280';
      g.beginPath();
      g.arc(tx(l.x), tz(l.z), 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = known ? '#e8ecf2' : '#8a92a0';
      g.fillText(l.name, tx(l.x), tz(l.z) - 12);
    }
    const dest = lv.gpsDestination?.();
    if (dest && this.gpsOn) {
      g.fillStyle = '#ff453a';
      g.beginPath();
      g.arc(tx(dest.x), tz(dest.z), 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff8a80';
      g.fillText('HOME', tx(dest.x), tz(dest.z) + 24);
    }
    if (this.gpsOn && this.ctx.phone.hasSignal(true)) {
      const p = this.ctx.player.pos;
      const yaw = this.ctx.player.yaw;
      if (dest) {
        g.strokeStyle = 'rgba(10,132,255,0.7)';
        g.setLineDash([4, 6]);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(tx(p.x), tz(p.z));
        g.lineTo(tx(dest.x), tz(dest.z));
        g.stroke();
        g.setLineDash([]);
      }
      g.save();
      g.translate(tx(p.x), tz(p.z));
      g.rotate(-yaw);
      g.fillStyle = 'rgba(10,132,255,0.25)';
      g.beginPath();
      g.arc(0, 0, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0a84ff';
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(8, 9);
      g.lineTo(0, 5);
      g.lineTo(-8, 9);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    } else if (this.gpsOn) {
      g.fillStyle = '#ff9f0a';
      g.fillText('Searching for GPS signal...', W / 2, H - 16);
    }
    g.fillStyle = '#8a92a0';
    g.font = '600 13px Inter, sans-serif';
    g.textAlign = 'left';
    g.fillText('N ↑', 12, 22);
    g.textAlign = 'right';
    g.fillText(lv.mapName, W - 12, 22);
  }
}
