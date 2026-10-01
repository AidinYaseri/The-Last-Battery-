import { BaseLevel } from './BaseLevel';
import { fbm } from '../world/Textures';
import { texMat } from '../world/Materials';

/** Background scene for the main menu: a slow drift down a foggy forest trail. */
export class MenuLevel extends BaseLevel {
  id = 0;
  name = 'MENU';
  mapName = '';

  groundHeight(x: number, z: number): number {
    const trail = Math.max(0, 1 - Math.abs(x) / 4);
    return (fbm(x * 0.03 + 5, z * 0.03, 3) - 0.5) * 5 * (1 - trail * 0.8);
  }

  build(): void {
    this.setupAtmosphere({ fogColor: 0x0b1016, fogDensity: 0.045, skyTop: 0x05080f, skyBottom: 0x121a24, moon: true, stars: true, moonDir: [0.3, 0.5, -0.8], moonIntensity: 0.5, hemiIntensity: 0.6, particles: 'dust', shadows: false, exposure: 1.1 });
    const h = (x: number, z: number) => this.groundHeight(x, z);
    this.b.terrain({ x0: -60, z0: -80, w: 120, d: 110, seg: 60, height: h, color: (x) => (Math.abs(x) < 2 ? [0.9, 0.8, 0.7] : [0.8, 0.85, 0.75]) });
    this.b.strip(
      [
        [0, 20],
        [0, -80],
      ],
      2.5,
      texMat('dirt', 1),
      h,
      0.04,
      4,
    );
    this.b.forest({ minX: -55, maxX: 55, minZ: -80, maxZ: 25, count: 520, seed: 3, height: h, exclude: (x) => Math.abs(x) < 3.5, collide: () => false, bushes: 200 });
    this.b.grass({ minX: -30, maxX: 30, minZ: -80, maxZ: 25, count: 2500, seed: 5, height: h, exclude: (x) => Math.abs(x) < 1.5 });
    for (let i = 0; i < 14; i++) {
      const x = Math.sin(i * 7.1) * 20 + (i % 2 ? 6 : -6);
      const z = -i * 6 + 10;
      this.b.rock(x, z, 0.5 + (i % 3) * 0.3, h(x, z), i, false);
    }
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.ambience = { wind: 0.5, crickets: 0.6, reverb: 0.3 };
  }

  onStart(): void {}
}
