import type { GameContext } from '../core/Context';
import type { BaseLevel } from './BaseLevel';
import { ForestLevel } from './ForestLevel';
import { TownLevel } from './TownLevel';
import { HighwayLevel } from './HighwayLevel';
import { CabinLevel } from './CabinLevel';
import { TruthLevel } from './TruthLevel';
import { MenuLevel } from './MenuLevel';

export const LEVEL_NAMES: Record<number, string> = {
  1: 'THE FOREST',
  2: 'THE TOWN',
  3: 'THE HIGHWAY',
  4: 'THE CABIN',
  5: 'THE TRUTH',
};

/** Builds / disposes levels. Only one level exists in memory at a time. */
export class LevelManager {
  current: BaseLevel | null = null;

  constructor(private ctx: GameContext) {}

  create(n: number): BaseLevel {
    switch (n) {
      case 0:
        return new MenuLevel(this.ctx);
      case 1:
        return new ForestLevel(this.ctx);
      case 2:
        return new TownLevel(this.ctx);
      case 3:
        return new HighwayLevel(this.ctx);
      case 4:
        return new CabinLevel(this.ctx);
      default:
        return new TruthLevel(this.ctx);
    }
  }

  unload(): void {
    if (!this.current) return;
    this.current.dispose();
    this.ctx.audio.stopLoops();
    this.current = null;
    this.ctx.collision.clear();
    this.ctx.interaction.clear();
  }

  /** Builds level n into the scene. */
  load(n: number): BaseLevel {
    this.unload();
    const lv = this.create(n);
    this.current = lv;
    this.ctx.scene.add(lv.group);
    lv.build();
    lv.optimize();
    this.ctx.interaction.occluders = lv.occluders;
    this.ctx.player.heightAt = (x, z) => lv.groundHeight(x, z);
    this.ctx.player.surfaceAt = (x, z) => lv.surfaceAt(x, z);
    lv.group.updateMatrixWorld(true);
    return lv;
  }

  update(dt: number, t: number): void {
    this.current?.update(dt, t);
  }
}
