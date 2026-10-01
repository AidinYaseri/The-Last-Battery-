import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { ENDINGS, PLAYER_NAME } from './StoryData';
import { sleep } from '../core/Scheduler';

/** Runs ending sequences and shows the ending card. */
export class EndingSystem {
  running = false;
  private card: HTMLDivElement;

  constructor(private ctx: GameContext, ui: HTMLElement) {
    this.card = document.createElement('div');
    this.card.className = 'ending-card';
    ui.appendChild(this.card);
  }

  reset(): void {
    this.running = false;
    this.card.classList.remove('show');
    this.card.innerHTML = '';
  }

  /** ENDING 2: the phone dies. */
  async battery(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const { ctx } = this;
    const { game, audio, hud, flashlight, player, dialogue } = ctx;
    game.setMode('cutscene');
    ctx.phone.forceScreenOff();
    await sleep(900);
    ctx.phone.close();
    flashlight.killAll();
    audio.play('power_down', { volume: 0.6 });
    hud.show(false);
    const r = ctx.renderer;
    const start = r.toneMappingExposure;
    await ctx.scheduler.tween(3, (t) => (r.toneMappingExposure = start * (1 - t * 0.92)));
    audio.setAmbience({ wind: 0.4, crickets: 0 }, 3);
    await dialogue.thought('No. No, no, no...', 2.5);
    await ctx.scheduler.wait(1.5);
    // footsteps approach from behind
    const back = player.forward().multiplyScalar(-1);
    for (let i = 0; i < 9; i++) {
      const d = 14 - i * 1.5;
      const p = new THREE.Vector3(player.pos.x + back.x * d, 0.1, player.pos.z + back.z * d);
      audio.playAt('step_leaves', p, { volume: 1.1, refDist: 3 });
      await ctx.scheduler.wait(0.62 - i * 0.02);
    }
    await ctx.scheduler.wait(0.6);
    const ear = new THREE.Vector3().copy(ctx.camera.position).add(back.multiplyScalar(0.4));
    audio.voice(`${PLAYER_NAME}...`, 'whisper', { pos: ear, volume: 1.4, refDist: 1 });
    hud.subtitle(`${PLAYER_NAME}...`, null, 2, true);
    await ctx.scheduler.wait(1.6);
    ctx.transition.black();
    audio.stopAll();
    audio.setMuffled(false);
    await sleep(2500);
    r.toneMappingExposure = start;
    this.finish('battery');
  }

  /** Records the ending and shows the end card. */
  finish(id: 'escape' | 'battery' | 'break' | 'loop'): void {
    const { ctx } = this;
    this.running = true;
    ctx.game.setMode('ending');
    ctx.transition.black();
    const meta = ctx.save.recordEnding(id);
    const e = ENDINGS[id];
    const st = ctx.state.data;
    const mins = Math.floor(st.playTime / 60);
    const secs = Math.floor(st.playTime % 60);
    const found = ctx.clues.majorFound();
    const total = ctx.clues.majorTotal();
    const checkpoint = ctx.save.hasCheckpoint();
    let buttons = '';
    if (id === 'loop') buttons = `<button class="act interactive" data-a="wake">WAKE UP</button>`;
    else if (id === 'battery' && checkpoint) buttons = `<button class="act interactive" data-a="retry">RETRY FROM LEVEL ${ctx.save.checkpointLevel()}</button> <button class="act interactive" data-a="menu">MAIN MENU</button>`;
    else buttons = `<button class="act interactive" data-a="menu">MAIN MENU</button>`;
    this.card.innerHTML = `
      <div class="en">ENDING ${e.num} / 4</div>
      <div class="et">${e.title}</div>
      <div class="ed">${e.desc}</div>
      <div class="stats">TIME ${mins}:${String(secs).padStart(2, '0')} · KEY CLUES ${found}/${total} · BATTERY LEFT ${ctx.battery.display}%<br/>ENDINGS DISCOVERED ${meta.endings.length}/4</div>
      <div>${buttons}</div>`;
    this.card.classList.add('show');
    this.card.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const a = (b as HTMLButtonElement).dataset.a;
        this.card.classList.remove('show');
        if (a === 'wake') ctx.game.newGame(st.loop + 1);
        else if (a === 'retry') ctx.game.retryCheckpoint();
        else ctx.game.toMenu();
      }),
    );
    ctx.save.clear();
    if (id !== 'battery') ctx.save.clearCheckpoint();
    ctx.game.releasePointer();
  }
}
