import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { Inventory } from '../inventory/Inventory';
import { LevelManager, LEVEL_NAMES } from '../levels/LevelManager';
import { BatterySystem } from '../phone/BatterySystem';
import { Phone } from '../phone/Phone';
import { Flashlight } from '../player/Flashlight';
import { Player } from '../player/Player';
import { SaveManager } from '../save/SaveManager';
import { ClueSystem } from '../story/ClueSystem';
import { DialogueSystem } from '../story/DialogueSystem';
import { EndingSystem } from '../story/EndingSystem';
import { StoryManager } from '../story/StoryManager';
import { HUD } from '../ui/HUD';
import { MainMenu } from '../ui/MainMenu';
import { ModalUI } from '../ui/ModalUI';
import { PauseMenu } from '../ui/PauseMenu';
import { Transition } from '../ui/Transition';
import { VirtualCursor } from '../ui/VirtualCursor';
import { CollisionWorld } from '../world/Colliders';
import type { GameContext } from './Context';
import { bus } from './Events';
import { GameState } from './GameState';
import { Input } from './Input';
import { SceneManager } from './SceneManager';
import { Scheduler, sleep } from './Scheduler';
import { Settings } from './Settings';

export type Mode = 'boot' | 'menu' | 'play' | 'phone' | 'camera' | 'modal' | 'cutscene' | 'transition' | 'paused' | 'ending';

const ACTIVE_MODES: Mode[] = ['play', 'phone', 'camera', 'modal', 'cutscene'];

export class Game {
  ctx: GameContext;
  mode: Mode = 'boot';
  private prevMode: Mode = 'play';
  private clock = new THREE.Clock();
  private time = 0;
  private cursor: VirtualCursor;
  private menu: MainMenu;
  private pauseMenu: PauseMenu;
  private lockOverlay: HTMLDivElement;
  private fpsEl: HTMLDivElement;
  private inventoryOpen = false;
  private autosaveTimer = 0;
  private fpsAcc = { frames: 0, t: 0 };
  readonly params = new URLSearchParams(location.search);
  readonly noLock: boolean;
  private modalWasOpen = false;
  private levelStarting = false;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.noLock = this.params.has('nolock');
    const settings = new Settings();
    const sm = new SceneManager(canvas, settings.data.quality);
    const input = new Input(canvas);
    const audio = new AudioManager();
    const state = new GameState();
    const scheduler = new Scheduler();
    const collision = new CollisionWorld();
    const hud = new HUD(ui);
    this.cursor = new VirtualCursor(ui);
    const transition = new Transition(ui);
    const modal = new ModalUI(ui, input, audio, this.cursor);

    // Partially constructed context; systems are attached below.
    const ctx = {
      game: this,
      sceneManager: sm,
      scene: sm.scene,
      camera: sm.camera,
      renderer: sm.renderer,
      state,
      scheduler,
      input,
      settings,
      audio,
      hud,
      collision,
      modal,
      transition,
    } as unknown as GameContext;
    this.ctx = ctx;
    ctx.save = new SaveManager(ctx);
    ctx.interaction = new InteractionSystem(ctx);
    ctx.player = new Player(ctx);
    ctx.battery = new BatterySystem(ctx);
    ctx.inventory = new Inventory(ctx);
    ctx.clues = new ClueSystem(ctx);
    ctx.story = new StoryManager(ctx);
    ctx.dialogue = new DialogueSystem(ctx);
    ctx.flashlight = new Flashlight(ctx);
    ctx.phone = new Phone(ctx, ui, this.cursor);
    ctx.endings = new EndingSystem(ctx, ui);
    ctx.levels = new LevelManager(ctx);

    this.menu = new MainMenu(ctx, ui);
    this.pauseMenu = new PauseMenu(ctx, ui);
    this.lockOverlay = document.createElement('div');
    this.lockOverlay.className = 'lock-overlay hidden';
    this.lockOverlay.textContent = 'CLICK TO CONTINUE';
    this.lockOverlay.addEventListener('click', () => {
      this.ctx.audio.init();
      this.ctx.input.lock();
    });
    ui.appendChild(this.lockOverlay);
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    ui.appendChild(this.fpsEl);
    if (this.params.has('debug') || this.params.has('fps')) this.fpsEl.classList.add('show');

    this.applyVolumes();
    bus.on('settings:changed', (k: string) => {
      if (['master', 'music', 'sfx'].includes(k)) this.applyVolumes();
      if (k === 'quality') this.applyQuality();
    });
    bus.on('input:lock-lost', () => {
      if (ACTIVE_MODES.includes(this.mode) && !this.noLock) this.pause();
    });
    bus.on('input:lock-changed', () => this.updateLockOverlay());
    bus.on('input:key', (code: string) => this.onKey(code));
    bus.on('battery:dead', () => {
      if (this.mode !== 'menu' && this.mode !== 'ending' && !ctx.endings.running) {
        ctx.endings.battery();
      }
    });
    bus.on('modal:open', () => {
      if (this.mode === 'play' || this.mode === 'phone' || this.mode === 'camera') {
        this.modalReturn = this.mode;
        this.setMode('modal');
      }
    });
    bus.on('modal:close', () => {
      if (this.mode === 'modal') this.setMode(this.modalReturn === 'camera' && !this.ctx.phone.viewfinder ? 'phone' : this.modalReturn);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && ACTIVE_MODES.includes(this.mode)) this.pause();
    });
    if (this.params.has('debug')) (window as any).__game = this;
  }

  private modalReturn: Mode = 'play';

  private applyVolumes(): void {
    const s = this.ctx.settings.data;
    this.ctx.audio.setVolumes(s.master, s.music, s.sfx);
  }

  private applyQuality(): void {
    const q = this.ctx.settings.data.quality;
    this.ctx.sceneManager.applyQuality(q);
    this.ctx.hud.toast('Some graphics changes apply on the next level load.', 'info', 'GRAPHICS');
  }

  start(): void {
    this.menu.showClickToStart(() => {
      this.ctx.audio.init();
      this.ctx.audio.prewarm();
      this.toMenu();
      const lvl = Number(this.params.get('level'));
      if (lvl >= 1 && lvl <= 5) this.debugStart(lvl);
    });
    this.loop();
  }

  // ------------------------------------------------------------ modes

  setMode(m: Mode): void {
    const prev = this.mode;
    this.mode = m;
    const { hud, player } = this.ctx;
    hud.setCrosshair(m === 'play');
    if (m !== 'play') hud.setPrompt(null);
    player.move.speedScale = m === 'phone' ? 0.55 : m === 'camera' ? 0.4 : 1;
    this.ctx.battery.active = ACTIVE_MODES.includes(m) && m !== 'cutscene';
    if (m === 'phone' || m === 'modal') {
      if (!this.ctx.input.isLocked()) document.body.classList.remove('cursor-hidden');
    }
    if (m !== 'play' && this.inventoryOpen) this.toggleInventory(false);
    if (prev === 'paused' && m !== 'paused') this.ctx.audio.setMuffled(false);
    this.updateLockOverlay();
  }

  private updateLockOverlay(): void {
    const need = ACTIVE_MODES.includes(this.mode) && this.mode !== 'cutscene' && !this.ctx.input.isLocked() && !this.noLock;
    this.lockOverlay.classList.toggle('hidden', !need);
    document.body.classList.toggle('cursor-hidden', this.ctx.input.isLocked());
  }

  releasePointer(): void {
    this.ctx.input.unlock();
  }

  pause(): void {
    if (!ACTIVE_MODES.includes(this.mode)) return;
    this.prevMode = this.mode;
    this.mode = 'paused';
    this.ctx.battery.active = false;
    this.ctx.audio.setMuffled(true);
    this.ctx.input.releaseAll();
    this.pauseMenu.show();
    this.updateLockOverlay();
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.pauseMenu.hide();
    this.ctx.input.lock();
    this.setMode(this.prevMode);
    this.clock.getDelta();
  }

  // ------------------------------------------------------------ flow

  toMenu(): void {
    const { ctx } = this;
    this.pauseMenu.hide();
    ctx.endings.reset();
    ctx.phone.reset();
    ctx.dialogue.cancel();
    ctx.scheduler.clear();
    ctx.flashlight.disabled = false;
    ctx.flashlight.setOn(false, true);
    ctx.hud.show(false);
    ctx.hud.hideBanner();
    ctx.hud.clearHint();
    ctx.modal.close();
    ctx.levels.load(0 as number);
    const lv = ctx.levels.current!;
    ctx.player.teleport(lv.spawn.x, lv.spawn.z, lv.spawn.yaw);
    ctx.audio.setAmbience(lv.ambience, 2);
    ctx.audio.playMusic('menu', 4);
    this.releasePointer();
    this.setMode('menu');
    ctx.transition.fadeIn(2);
    this.menu.show();
  }

  newGame(loop?: number): void {
    const { ctx } = this;
    const meta = ctx.save.meta();
    const l = loop ?? meta.loops;
    if (loop !== undefined) ctx.save.saveMeta({ ...meta, loops: loop });
    ctx.save.clear();
    ctx.save.clearCheckpoint();
    ctx.state.reset(l);
    ctx.battery.resetWarnings();
    ctx.endings.reset();
    this.menu.hide();
    ctx.input.lock();
    ctx.audio.init();
    ctx.audio.playMusic('none', 2);
    this.startLevel(1, false);
  }

  continueGame(): void {
    const { ctx } = this;
    const data = ctx.save.load();
    if (!data) return;
    ctx.state.load(data);
    ctx.battery.resetWarnings();
    ctx.endings.reset();
    this.menu.hide();
    ctx.input.lock();
    ctx.audio.init();
    ctx.audio.playMusic('none', 2);
    this.startLevel(data.level, true);
  }

  retryCheckpoint(): void {
    const { ctx } = this;
    const data = ctx.save.loadCheckpoint();
    if (!data) {
      this.toMenu();
      return;
    }
    ctx.state.load(data);
    ctx.battery.resetWarnings();
    ctx.endings.reset();
    ctx.input.lock();
    this.startLevel(data.level, false, true);
  }

  async startLevel(n: number, fromSave: boolean, isRetry = false): Promise<void> {
    if (this.levelStarting) return;
    this.levelStarting = true;
    const { ctx } = this;
    try {
      this.setMode('transition');
      ctx.hud.show(false);
      if (!ctx.transition.isBlack) await ctx.transition.fadeOut(1.2);
      ctx.audio.stopAmbience(1);
      ctx.phone.reset();
      ctx.dialogue.cancel();
      ctx.scheduler.clear();
      ctx.modal.close();
      ctx.flashlight.disabled = false;
      ctx.endings.running = false;
      ctx.player.cam.release();
      ctx.player.cam.eyeOffset = 0;
      ctx.player.cam.roll = 0;
      ctx.player.canMove = true;
      ctx.state.data.level = n;
      if (n === 5) ctx.state.setFlag('L5');
      await sleep(30);
      const lv = ctx.levels.load(n);
      const sp = fromSave && ctx.state.data.player ? ctx.state.data.player : lv.spawn;
      ctx.player.teleport(sp.x, sp.z, sp.yaw);
      ctx.hud.setObjective(ctx.state.data.objective, false);
      ctx.story.resume();
      try {
        ctx.renderer.compile(ctx.scene, ctx.camera);
      } catch {
        /* optional */
      }
      if (!fromSave) {
        ctx.state.data.player = null;
        ctx.save.save();
        if (!isRetry) ctx.save.checkpoint();
      }
      const skipTitle = this.params.has('fast');
      if (!skipTitle) await ctx.transition.title(`LEVEL ${n}`, LEVEL_NAMES[n], fromSave ? 'continued' : isRetry ? 'again' : '');
      ctx.audio.setAmbience(lv.ambience, 3);
      this.setMode('play');
      ctx.hud.show(true);
      this.clock.getDelta();
      if (!(lv.customFadeIn && !fromSave)) ctx.transition.fadeIn(1.6);
      lv.onStart(fromSave);
    } finally {
      this.levelStarting = false;
    }
  }

  completeLevel(n: number): void {
    const next = n + 1;
    if (next > 5) return;
    this.startLevel(next, false);
  }

  private debugStart(n: number): void {
    const { ctx } = this;
    ctx.state.reset();
    const inv: Record<number, string[]> = { 2: ['flashlight'], 3: ['flashlight', 'police_key'], 4: ['flashlight'], 5: ['flashlight', 'basement_key'] };
    ctx.state.data.inventory = inv[n] ?? [];
    ctx.state.data.battery = [5, 5, 2, 1, 6, 3][n];
    ctx.state.data.battery = Number(this.params.get('battery') ?? ctx.state.data.battery);
    this.menu.hide();
    this.startLevel(n, false);
  }

  // ------------------------------------------------------------ input

  private onKey(code: string): void {
    const { ctx } = this;
    if (this.mode === 'phone') {
      if (code !== 'Tab') ctx.phone.handleKey(code);
    }
    if (code === 'Escape' && this.noLock && ACTIVE_MODES.includes(this.mode) && !ctx.modal.isOpen) this.pause();
    else if (code === 'Escape' && this.mode === 'paused' && this.noLock) this.resume();
  }

  private toggleInventory(force?: boolean): void {
    this.inventoryOpen = force ?? !this.inventoryOpen;
    if (this.inventoryOpen) this.ctx.inventory.render(this.ctx.hud.inventoryEl);
    this.ctx.hud.inventoryEl.classList.toggle('show', this.inventoryOpen);
  }

  private handleInput(): void {
    const { ctx } = this;
    const { input } = ctx;
    const m = this.mode;
    if (m === 'play') {
      if (input.wasPressed('KeyE')) ctx.interaction.interact();
      if (input.wasPressed('KeyF')) ctx.flashlight.toggle();
      if (input.wasPressed('Tab')) ctx.phone.open();
      if (input.wasPressed('KeyI')) this.toggleInventory();
      if (ctx.phone.call && ctx.phone.call.phase === 'ringing' && input.wasPressed('Tab') === false && input.wasPressed('KeyE') === false) {
        /* ringing: TAB opens phone to answer */
      }
    } else if (m === 'phone') {
      this.driveCursor();
      if (input.wasPressed('Tab')) ctx.phone.close();
      if (input.wasPressed('KeyF')) ctx.flashlight.toggle();
    } else if (m === 'camera') {
      if (input.mouseClicked || input.wasPressed('KeyE') || input.wasPressed('Space')) ctx.phone.camera.capture();
      if (input.wasPressed('Tab') || input.wasPressed('Backspace') || input.rightClicked) ctx.phone.exitViewfinder();
      if (input.wasPressed('KeyF')) ctx.flashlight.toggle();
    } else if (m === 'modal') {
      this.driveCursor();
    }
  }

  /** Virtual cursor while locked; with a free pointer the real mouse clicks natively. */
  private driveCursor(): void {
    const { input } = this.ctx;
    if (input.isLocked()) {
      const d = input.consumeMouse();
      this.cursor.move(d.dx * 1.1, d.dy * 1.1);
      if (input.mouseClicked) this.cursor.click();
    } else {
      this.cursor.setPos(input.clientX, input.clientY);
    }
  }

  // ------------------------------------------------------------ loop

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    let dt = this.clock.getDelta();
    dt = Math.min(dt, 0.1);
    try {
      this.update(dt);
      this.ctx.sceneManager.render();
    } catch (err) {
      console.error('[game] frame error', err);
    }
    this.ctx.input.endFrame();
    this.fpsAcc.frames++;
    this.fpsAcc.t += dt;
    if (this.fpsAcc.t > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsAcc.frames / this.fpsAcc.t)} fps · ${this.ctx.renderer.info.render.calls} calls`;
      this.fpsAcc = { frames: 0, t: 0 };
    }
  };

  private update(dt: number): void {
    const { ctx } = this;
    const m = this.mode;
    if (m === 'paused' || m === 'boot') return;
    this.time += dt;
    if (m === 'menu' || m === 'ending') {
      // slow drifting camera for the menu background
      if (m === 'menu') {
        const t = this.time;
        ctx.player.cam.yaw = Math.sin(t * 0.03) * 0.5 + 0.3;
        ctx.player.cam.pitch = 0.02 + Math.sin(t * 0.05) * 0.03;
        ctx.player.pos.z = -18 + Math.sin(t * 0.018) * 22;
        ctx.player.pos.x = Math.sin(t * 0.02) * 3;
        ctx.player.cam.update(dt, ctx.player.pos, 1.7, 0, false, t);
        ctx.levels.update(dt, this.time);
        ctx.audio.updateListener(ctx.camera);
      }
      return;
    }
    if (m === 'transition') return;
    this.handleInput();
    ctx.scheduler.update(dt);
    const playing = m === 'play' || m === 'phone' || m === 'camera';
    const lookEnabled = m === 'play' || m === 'camera' || m === 'cutscene';
    ctx.player.canMove = m === 'play' || m === 'phone' || m === 'camera';
    ctx.player.update(dt, this.time, lookEnabled);
    ctx.interaction.update(m === 'play');
    ctx.flashlight.update(dt, m !== 'cutscene');
    ctx.battery.update(dt);
    ctx.phone.update(dt);
    ctx.levels.update(dt, this.time);
    ctx.hud.update(dt);
    ctx.audio.updateListener(ctx.camera);
    if (playing || m === 'modal') {
      ctx.state.data.playTime += dt;
      ctx.state.data.clock += dt / 40;
    }
    // HUD meters
    const b = ctx.battery;
    ctx.hud.setFlashlight(ctx.inventory.has('flashlight'), ctx.flashlight.charge, ctx.flashlight.on);
    ctx.hud.setStamina(ctx.player.move.stamina);
    ctx.hud.setMiniBattery(!ctx.phone.isOpen && (b.value <= 2 || b.activeDrains().length > 0), b.display, b.critical);
    // autosave
    if (playing) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 20) {
        this.autosaveTimer = 0;
        ctx.save.save();
      }
    }
  }
}
