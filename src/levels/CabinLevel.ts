import * as THREE from 'three';
import { BaseLevel, type Destination } from './BaseLevel';
import { buildCabin, BASEMENT, photoCollage, type CabinRefs } from './CabinBuilder';
import { texMat, colorMat } from '../world/Materials';
import { fbm } from '../world/Textures';
import { drawPhoto } from '../world/PhotoArt';
import type { Surface } from '../player/Player';
import { sleep } from '../core/Scheduler';
import type { SoundHandle } from '../audio/AudioManager';
import { smoothstep } from './util';

/**
 * LEVEL 4 - THE CABIN.
 * Restore power (fuel from the car + fuse from the shed), open the office
 * drawer (1017), find the basement and watch the recording.
 */
export class CabinLevel extends BaseLevel {
  id = 4;
  name = 'THE CABIN';
  mapName = 'Alder Ridge Rd';
  cabin!: CabinRefs;
  private genLoop: SoundHandle | null = null;
  private monitorTimer = 0;
  private arrivedToast = false;

  get power(): boolean {
    return this.has('power');
  }

  groundHeight(x: number, z: number): number {
    if (z < -150) return 0;
    const d = Math.hypot(x, z - 4);
    const drive = Math.abs(x - 1.5) < 3 && z > 0 ? 1 : 0;
    const k = smoothstep(22, 40, d) * (1 - drive * 0.8);
    return (fbm(x * 0.03 + 11, z * 0.03 - 4, 3) - 0.45) * 5 * k;
  }

  surfaceAt(x: number, z: number): Surface {
    if (z < -150) return 'concrete';
    if (Math.abs(x) < 7 && z > -5.5 && z < 8.1) return 'wood';
    if (x > -16 && x < -12 && z > 3 && z < 7) return 'wood';
    if (Math.abs(x - 1.5) < 2 && z > 8) return 'gravel';
    return 'leaves';
  }

  ambientAt(x: number, z: number): number {
    if (z < -150) return 0.12;
    if (Math.abs(x) < 7 && z > -5.5 && z < 5.5) return 0.4;
    if (x > -16 && x < -12 && z > 3 && z < 7) return 0.4;
    return 1;
  }

  signalAt(): number {
    return 1;
  }

  gpsDestination(): Destination | null {
    return { x: 0, z: 0, label: 'HOME', sub: '14 Alder Ridge Rd · You have arrived.' };
  }

  build(): void {
    const b = this.b;
    const ctx = this.ctx;
    this.setupAtmosphere({
      fogColor: 0x0a0d12,
      fogDensity: 0.045,
      skyTop: 0x04060c,
      skyBottom: 0x10161e,
      moon: true,
      stars: true,
      moonDir: [-0.5, 0.5, -0.6],
      moonIntensity: 0.42,
      hemiSky: 0x283248,
      hemiGround: 0x12100c,
      hemiIntensity: 0.55,
      particles: 'dust',
      exposure: 1.3,
    });
    this.ambience = { wind: 0.55, crickets: 0.5, reverb: 0.3 };
    this.mapBounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 58 };
    ctx.collision.setBounds(-46, 46, -212, 60);
    ctx.collision.addBox(0, -42, 120, 3);
    this.spawn = { x: 1.5, z: 52, yaw: 0 };

    const h = (x: number, z: number) => this.groundHeight(x, z);
    b.terrain({ x0: -80, z0: -70, w: 160, d: 150, seg: 90, height: h, color: (x, z) => (Math.abs(x - 1.5) < 2.2 && z > 8 ? [1.1, 1.0, 0.9] : [0.8, 0.85, 0.75]) });
    b.strip(
      [
        [1.5, 62],
        [1.5, 30],
        [3, 18],
        [2, 9],
      ],
      3.4,
      texMat('gravel', 1),
      h,
      0.03,
      3,
    );
    const clearing = (x: number, z: number) => Math.hypot(x, z - 3) < 20 || (Math.abs(x - 1.5) < 4.5 && z > 0);
    b.forest({ minX: -80, maxX: 80, minZ: -70, maxZ: 80, count: 1100, seed: 41, height: h, exclude: clearing, collide: (x, z) => Math.abs(x) < 50 && z > -45 && z < 62, bushes: 350, minSpacing: 2.3 });
    b.grass({ minX: -30, maxX: 30, minZ: -30, maxZ: 60, count: 4000, seed: 42, height: h, exclude: (x, z) => (Math.abs(x) < 7.5 && z > -6.5 && z < 8.5) || Math.abs(x - 1.5) < 2 || (x > -16.5 && x < -11.5 && z > 2.5 && z < 7.5) });
    b.sign(4, 44, -0.2, ['PRIVATE', 'NO TRESPASSING'], { w: 1.2, h: 0.8, bg: '#e8e0c8', fg: '#8a1a1a', poleH: 1.2, poles: 1 });
    b.textPlane(['14'], 0.4, 0.3, { bg: '#2a2a2a', fg: '#e0d8c0', size: 150 }, -1.5, 1.3, 30, 0);
    b.box(0.1, 1.2, 0.1, texMat('bark', 1), -1.5, 0, 30.1, {});

    this.cabin = buildCabin(b);
    this.landmark('cabin', 'The cabin', 0, 0, 14);
    this.landmark('shed', 'Shed', -14, 5, 6);
    this.landmark('gen', 'Generator', 9.6, -2.5, 5);
    this.landmark('car', 'Parked car', 6, 15, 6);
    this.mapRoads = [{ pts: [[1.5, 58], [1.5, 30], [3, 18], [2, 9]], w: 3, kind: 'path', always: true }];
    this.mapAreas = [
      { x: 0, z: 0, w: 14, d: 11, landmark: 'cabin' },
      { x: -14, z: 5, w: 4, d: 4, landmark: 'shed' },
    ];
    this.setupInteractions();
    this.setupEvents();
    if (this.power) this.applyPower(true, true);
  }

  // ------------------------------------------------------------------ interactions
  private setupInteractions(): void {
    const c = this.cabin;
    const { ctx } = this;
    this.readable({
      id: 'photowall',
      object: c.photoWall,
      prompt: 'Look at the photographs',
      note: { title: 'The photo wall', text: 'Dozens of photographs, pinned in rows and joined with red string.\n\nMe at the campsite. Me in town. Me on the highway. Me inside this cabin.\n\nSome of the date stamps say OCT 30. That\'s tonight.', image: photoCollage(0), imageWidth: 480 },
      clue: 'photo_wall',
      onRead: () => {
        ctx.audio.stinger();
        ctx.dialogue.thought('Who took these? ...Did I?', 3);
      },
    });
    this.readable({ id: 'calendar', object: c.calendar, prompt: 'Look at calendar', note: { title: 'Kitchen calendar', text: 'October.\n\nThe 17th is circled in red, with "M." written underneath.\nAt the bottom, in different ink: "THE DAY IT STARTED."' }, clue: 'calendar' });
    this.readable({ id: 'sticky', object: c.sticky, prompt: 'Read sticky note', note: { title: 'Sticky note', text: '"The day everything started. MMDD."\n\nIt\'s my handwriting again.' }, clue: 'office_sticky' });
    this.readable({ id: 'cork', object: c.corkboard, prompt: 'Read clippings', note: { title: 'Newspaper clippings', text: 'HIKER STILL MISSING - "Search for Mara Vance enters second week." (Oct 24)\n\nHALVORSEN LAB CLOSED - "Memory research cabin shut down after complaints from volunteers." (1997)\n\nLOCAL VANISHINGS - "Alder Falls residents report \'lost days\'. Council dismisses claims." (1998)\n\nAnd a photo of Mara and me, smiling, somewhere sunny.' } });
    this.readable({
      id: 'bedphoto',
      object: c.bedPhoto,
      prompt: 'Examine photo on the pillow',
      note: () => {
        const st = ctx.state;
        const when = `${st.dateString(9)} ${st.clockAt(9)}`;
        return { title: 'A Polaroid on the pillow', text: `Me. Asleep. In this bed.\n\nThe stamp says ${when}.\n\nI check my phone. It's ${st.clockString()}. That photo hasn't been taken yet.`, image: drawPhoto('portrait_sleep', { date: when, seed: 71 }), imageWidth: 300 };
      },
      onRead: () => ctx.audio.play('heartbeat', { volume: 0.6 }),
    });
    this.photoTargets.push({
      id: 'mirror',
      pos: c.mirrorPos.clone(),
      range: 5,
      onReveal: async (url) => {
        await ctx.modal.note({ title: 'The photo of the mirror', text: 'Words written in the condensation. I couldn\'t see them until the flash:\n\n"YOU\'VE BEEN HERE 4 TIMES."', image: url, imageWidth: 360 });
        ctx.clues.add('mirror');
      },
    });
    // mirror hint
    this.addInteractable({ id: 'mirrorlook', object: this.b.hitbox(0.1, 0.6, 0.5, 1.4, 1.25, -1.6), prompt: 'Look in the mirror', onInteract: () => ctx.dialogue.thought('I look exhausted. The glass is fogged in odd streaks, like something was written there.', 3.5) });

    // generator puzzle
    this.addInteractable({
      id: 'generator',
      object: c.generator,
      prompt: () => {
        if (this.power) return 'Generator (running)';
        if (!this.has('fuel')) return ctx.inventory.has('fuel_can') ? 'Pour fuel into generator' : 'Generator (no fuel)';
        if (!this.has('fuse')) return ctx.inventory.has('gen_fuse') ? 'Insert fuse' : 'Generator (fuse missing)';
        return 'Pull the start cord';
      },
      onInteract: () => this.useGenerator(),
    });
    // car
    this.searchable({
      id: 'samcar',
      object: c.carBody,
      prompt: 'Search the car',
      sound: 'car_door',
      onSearch: async () => {
        await ctx.modal.note({ title: 'Glovebox', text: 'Insurance card and registration.\n\nOWNER: SAM REYES\n\nThis is my car. I drove here. I don\'t remember driving here.' });
        ctx.dialogue.thought('My car. Then how did I end up in the forest?', 3);
      },
    });
    this.pickup({
      id: 'fuel',
      object: c.trunkHit,
      glint: true,
      keep: false,
      prompt: 'Open the trunk',
      onPick: () => {
        ctx.audio.play('car_door');
        ctx.inventory.add('fuel_can');
        ctx.hud.message('A red fuel can, half full.', 3);
      },
    });
    const aa = this.b.box(0.12, 0.05, 0.08, colorMat(0xd8b020, 0.4, 0.3), -15.5, 0.69, 4.4);
    this.pickup({
      id: 'aa4',
      object: aa,
      prompt: 'Take batteries',
      onPick: () => {
        ctx.flashlight.addCharge(60);
        ctx.hud.toast('Flashlight batteries (+60%)', 'item');
        ctx.audio.play('pickup');
      },
    });
    this.pickup({
      id: 'genfuse',
      object: c.shedFuse,
      prompt: 'Search toolbox',
      onPick: () => {
        ctx.inventory.add('gen_fuse');
        ctx.hud.message('A heavy cartridge fuse, labelled "GEN 30A".', 3);
      },
    });
    // drawer
    this.addInteractable({
      id: 'drawer',
      object: c.drawerHit,
      prompt: () => (this.has('drawer') ? 'Drawer (empty)' : this.power ? 'Locked drawer (keypad)' : 'Locked drawer (keypad is dark)'),
      onInteract: () => {
        if (this.has('drawer')) return;
        if (!this.power) {
          ctx.audio.play('locked');
          ctx.hud.message('An electronic keypad lock. No power.');
          ctx.story.setObjective('Restore power. There must be a generator outside.');
          return;
        }
        ctx.modal.keypad({ title: 'DESK DRAWER', length: 4, check: (code) => code === '1017', onSuccess: () => this.openDrawer(), hint: 'Four digits · ENTER · E to close' });
      },
    });
    // charger
    this.addInteractable({
      id: 'charger',
      object: c.charger,
      prompt: () => (this.has('charged') ? 'Wall outlet (dead)' : this.power ? 'Charge phone' : 'Wall outlet (no power)'),
      onInteract: () => this.charge(),
    });
    // cellar
    this.addInteractable({
      id: 'cellar',
      object: c.cellar,
      prompt: () => (this.has('cellarOpen') ? 'Go down to the basement' : ctx.inventory.has('basement_key') ? 'Unlock cellar door' : 'Cellar door (padlocked)'),
      onInteract: () => {
        if (!this.has('cellarOpen')) {
          if (!ctx.inventory.has('basement_key')) {
            ctx.audio.play('locked');
            ctx.hud.message('A heavy padlock. The key must be somewhere in the cabin.');
            return;
          }
          this.set('cellarOpen');
          ctx.audio.play('unlock');
        }
        this.goBasement(true);
      },
    });
    const bs = c.basement;
    this.addInteractable({ id: 'stairs', object: bs.stairsHit, prompt: 'Go upstairs', onInteract: () => this.goBasement(false) });
    this.addInteractable({
      id: 'monitors',
      object: bs.monitorHit,
      prompt: 'Watch the monitors',
      onInteract: async () => {
        await ctx.modal.note({ style: 'screen', title: 'SECURITY FOOTAGE', text: 'CAM 01 · OCT 22 · 03:09\nA figure walks up the driveway and opens the front door. It\'s me.\n\nCAM 02 · OCT 25 · 02:51\nMe again. Same clothes. Same slow walk. I look lost.\n\nCAM 03 · OCT 28 · 03:12\nMe. I stop at the door and look straight into the camera, like I know it\'s there.\n\nCAM 04 · LIVE\nThe basement. A figure standing in front of the monitors.', image: drawPhoto('cctv', { cam: 'CAM 03 · OCT 28', figureX: 0.5, w: 320, h: 240 }), imageWidth: 320 });
        ctx.clues.add('cctv');
        ctx.dialogue.thought("I don't remember any of this.", 3);
      },
    });
    this.addInteractable({
      id: 'tv',
      object: bs.tvHit,
      prompt: () => (ctx.inventory.has('cassette') ? 'Play the tape ("FOR ME")' : 'Old TV and VCR'),
      onInteract: () => {
        if (!ctx.inventory.has('cassette')) {
          ctx.hud.message('A VCR. There is no tape inside.');
          return;
        }
        this.playRecording();
      },
    });
    this.addInteractable({
      id: 'array',
      object: bs.arrayHit,
      prompt: 'Examine the machine',
      onInteract: async () => {
        await ctx.modal.note({ title: 'The machine', text: 'Racks of old equipment wired into the walls. Reel-to-reel tapes, a transmitter, bundles of cable running up through the ceiling toward the cabin.\n\nIt hums like it\'s breathing. The metal is warm.' });
        ctx.clues.add('array');
      },
    });
    this.searchable({
      id: 'boxes',
      object: bs.boxesHit,
      prompt: 'Search the boxes',
      onSearch: () => ctx.hud.message('A red jacket with "M.V." on the tag. Dozens of tapes labelled with dates. A backpack exactly like the one in the forest.', 5),
    });
  }

  private useGenerator(): void {
    const { ctx } = this;
    if (this.power) return;
    const pos = this.cabin.genPos;
    if (!this.has('fuel')) {
      if (!ctx.inventory.has('fuel_can')) {
        ctx.hud.message('The tank is bone dry.');
        ctx.story.setObjective('Find fuel for the generator.');
        return;
      }
      this.set('fuel');
      ctx.inventory.remove('fuel_can');
      ctx.audio.playAt('rustle', pos);
      ctx.hud.message('You pour the fuel in.');
      if (!this.has('fuse')) ctx.story.setObjective(ctx.inventory.has('gen_fuse') ? 'Insert the fuse into the generator.' : 'The generator needs a fuse. Check the shed.');
      return;
    }
    if (!this.has('fuse')) {
      if (!ctx.inventory.has('gen_fuse')) {
        ctx.hud.message('The fuse holder is empty.');
        ctx.story.setObjective('Find a fuse for the generator. Check the shed.');
        return;
      }
      this.set('fuse');
      ctx.inventory.remove('gen_fuse');
      ctx.audio.playAt('click', pos);
      ctx.hud.message('The fuse clicks into place.');
      ctx.story.setObjective('Start the generator.');
      return;
    }
    this.set('power');
    ctx.audio.playAt('generator_start', pos, { volume: 1.2 });
    ctx.scheduler.wait(2.4).then(() => this.applyPower(true));
  }

  private applyPower(on: boolean, silent = false): void {
    const { ctx } = this;
    this.cabin.setPower(on);
    this.cabin.basement.light.intensity = on ? 9 : 0;
    this.genLoop?.stop(0.3);
    if (on) {
      this.genLoop = ctx.audio.playAt('generator_loop', this.cabin.genPos, { loop: true, volume: 0.6, refDist: 3 });
      ctx.audio.setAmbience({ ...this.ambience, hum: 0.3 }, 2);
    }
    if (!silent) {
      ctx.audio.play('power_up', { volume: 0.7 });
      ctx.dialogue.thought('Power.', 2);
      if (!this.has('drawer')) ctx.story.setObjective('Open the locked drawer in the office.');
    }
  }

  private async charge(): Promise<void> {
    const { ctx } = this;
    if (!this.power) {
      ctx.hud.message('No power.');
      return;
    }
    if (this.has('charged') || this.has('charging')) return;
    this.set('charging');
    ctx.hud.message('Charging...', 2);
    for (let i = 0; i < 2; i++) {
      await ctx.scheduler.wait(1.5);
      ctx.battery.charge(1);
    }
    this.set('charged');
    ctx.audio.play('spark');
    ctx.hud.message('+2%. Then the outlet sparks, and the charger light dies.', 4);
  }

  private async openDrawer(): Promise<void> {
    const { ctx } = this;
    this.set('drawer');
    ctx.audio.play('drawer');
    await ctx.modal.note({
      title: 'Inside the drawer',
      text: 'An iron key tagged "DOWN".\nA cracked flip phone.\nA photo of Mara and me.\nA VHS tape labelled, in my handwriting: "FOR ME. PLAY IN THE BASEMENT."\nAnd a thick folder: "VANCE, M."',
      image: drawPhoto('mara_sam', { seed: 8, w: 280, h: 200 }),
      imageWidth: 260,
    });
    ['basement_key', 'old_phone', 'mara_photo', 'cassette'].forEach((i) => ctx.inventory.add(i, true));
    ctx.hud.toast('Key, old phone, photo, tape', 'item');
    await ctx.modal.note({ title: 'Folder: VANCE, M.', text: "My notes. My handwriting.\n\nMara was my friend. She came here chasing an old story: the cabin's owner, a Dr. Halvorsen, ran \"memory studies\" in the basement in the 90s. People who stayed here lost days. Sometimes weeks.\n\nMara went in on the 17th. I came to find her.\n\nI think I found the machine instead." });
    ctx.clues.add('case_file');
    await ctx.scheduler.wait(0.5);
    ctx.audio.play('tape_click');
    await ctx.dialogue.say([
      { text: '(the old phone plays a voice memo)', voice: 'none', dur: 2 },
      { text: 'Day four. Every time I reach this cabin, I lose everything after the forest.', speaker: 'OLD PHONE', voice: 'recording' },
      { text: "So I'm leaving myself clues. Photos. Notes. The radio. If this works, the next me will be faster.", speaker: 'OLD PHONE', voice: 'recording' },
    ]);
    ctx.clues.add('old_phone');
    ctx.story.setObjective('Find the way into the basement. The cellar door is behind the cabin.');
  }

  private async goBasement(down: boolean): Promise<void> {
    const { ctx } = this;
    ctx.game.setMode('cutscene');
    ctx.audio.play(down ? 'metal_door' : 'door_open', { volume: 0.8 });
    await ctx.transition.fadeOut(0.6);
    for (let i = 0; i < 5; i++) ctx.audio.play('step_wood', { delay: i * 0.3, volume: 0.5 });
    await sleep(1400);
    if (down) {
      ctx.player.teleport(BASEMENT.x - 4.5, BASEMENT.z + 2.2, Math.PI * 0.95);
      ctx.audio.setAmbience({ wind: 0.1, crickets: 0, hum: 0.5, rumble: 0.2, reverb: 0.5 }, 1.5);
      if (!this.has('inBasement')) {
        this.set('inBasement');
        ctx.story.setObjective('Search the basement.');
      }
    } else {
      ctx.player.teleport(-4.5, -8.2, Math.PI);
      ctx.audio.setAmbience({ ...this.ambience, hum: this.power ? 0.3 : 0 }, 1.5);
    }
    ctx.game.setMode('play');
    await ctx.transition.fadeIn(0.8);
  }

  private async playRecording(): Promise<void> {
    if (this.has('watched')) return;
    this.set('watched');
    const { ctx } = this;
    const tv = this.cabin.basement.tv;
    ctx.game.setMode('cutscene');
    ctx.player.cam.lookAtPoint(ctx.camera.position, new THREE.Vector3(BASEMENT.x - 4.6, 1.0, BASEMENT.z - 0.8), 2);
    ctx.audio.play('tape_click');
    ctx.audio.playMusic('reveal', 3);
    const g = tv.canvas.getContext('2d')!;
    const frame = (text: string, noise: number) => {
      const p = drawPhoto('portrait', { seed: 9, w: 256, h: 192, date: "REC  OCT 28 '26  03:10" });
      g.drawImage(p, 0, 0);
      for (let i = 0; i < noise * 400; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.4})`;
        g.fillRect(Math.random() * 256, Math.random() * 192, 3, 1);
      }
      if (text) {
        g.fillStyle = '#fff';
        g.font = '12px monospace';
        g.fillText(text, 10, 20);
      }
      tv.texture.needsUpdate = true;
    };
    frame('PLAY ▶', 1);
    await ctx.scheduler.wait(2.5);
    frame('', 0.2);
    await ctx.scheduler.wait(1.5);
    await ctx.dialogue.say([{ text: "If you're watching this...", speaker: 'YOU (ON TAPE)', voice: 'self', volume: 1, pos: { x: BASEMENT.x - 4.6, y: 1, z: BASEMENT.z - 0.8 } }]);
    frame('', 0.4);
    await ctx.dialogue.say([{ text: "...you don't remember.", speaker: 'YOU (ON TAPE)', voice: 'self', volume: 1, pos: { x: BASEMENT.x - 4.6, y: 1, z: BASEMENT.z - 0.8 } }]);
    // cut
    ctx.audio.play('glitch', { volume: 1 });
    for (let i = 0; i < 8; i++) {
      frame('', 3);
      await ctx.scheduler.wait(0.08);
    }
    ctx.clues.add('basement_recording');
    ctx.audio.stinger();
    ctx.player.cam.shake = 1;
    this.cabin.basement.light.intensity = 0;
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 192);
    tv.texture.needsUpdate = true;
    await ctx.scheduler.wait(0.4);
    ctx.transition.black();
    ctx.audio.stopAll();
    await sleep(1500);
    ctx.audio.voice('Sam...', 'whisper', { volume: 1.3 });
    await sleep(2000);
    await ctx.transition.story(['The tape ends.', 'And so does everything else.'], 2.4);
    ctx.player.cam.release();
    this.complete();
  }

  private setupEvents(): void {
    const { ctx } = this;
    this.events = [
      () => ctx.audio.playAt('branch', this.around(12, true), { volume: 1 }),
      () => ctx.audio.playAt('owl', this.around(30), { volume: 0.7 }),
      () => ctx.audio.playAt('thud', new THREE.Vector3(Math.random() * 10 - 5, 1, Math.random() * 8 - 4), { volume: 0.8 }),
      () => {
        if (!this.power) return;
        this.cabin.setPower(false);
        ctx.audio.play('spark', { volume: 0.4 });
        ctx.scheduler.wait(0.4 + Math.random()).then(() => this.cabin.setPower(true));
      },
      async () => {
        for (let i = 0; i < 5; i++) {
          ctx.audio.playAt('step_wood', this.around(6, true), { volume: 0.7 });
          await ctx.scheduler.wait(0.6);
        }
      },
      () => ctx.audio.playAt('door_open', this.around(8), { volume: 0.6 }),
    ];
    this.eventTimer = 35;
  }

  update(dt: number, t: number): void {
    super.update(dt, t);
    const { ctx } = this;
    // basement monitors animate
    this.monitorTimer += dt;
    if (this.monitorTimer > 0.6 && ctx.player.pos.z < -150) {
      this.monitorTimer = 0;
      for (const m of this.cabin.basement.monitors) {
        const fx = m.kind === 3 ? 0.5 + Math.sin(t * 0.3) * 0.05 : 0.2 + ((t * 0.05 + m.kind * 0.3) % 0.6);
        const c = drawPhoto('cctv', { cam: m.kind === 3 ? 'CAM 04 LIVE' : `CAM 0${m.kind + 1} OCT ${[22, 25, 28][m.kind]}`, figureX: fx, w: 200, h: 150, seed: Math.floor(t * 10) });
        m.canvas.getContext('2d')!.drawImage(c, 0, 0);
        m.texture.needsUpdate = true;
      }
    }
    this.cabin.basement.leds.forEach((l, i) => (l.visible = Math.sin(t * (2 + (i % 5)) + i) > -0.3));
    if (ctx.phone.gpsOn && !this.arrivedToast && Math.hypot(ctx.player.pos.x, ctx.player.pos.z) < 12) {
      this.arrivedToast = true;
      ctx.phone.toast('You have arrived: HOME');
      ctx.dialogue.thought('Home? This place?', 2.5);
    }
  }

  onStart(fromSave: boolean): void {
    const { ctx } = this;
    if (fromSave) {
      if (ctx.player.pos.z < -150) ctx.audio.setAmbience({ wind: 0.1, crickets: 0, hum: 0.5, rumble: 0.2, reverb: 0.5 }, 1.5);
      return;
    }
    ctx.story.setObjective('Explore the cabin.');
    ctx.scheduler.wait(2).then(() => ctx.dialogue.thought("A cabin. It's the one from the photo on my phone.", 3.5));
    ctx.scheduler.wait(12).then(() => {
      if (ctx.levels.current === this) ctx.story.deliver('unknown', 'msg_unknown_l4');
    });
  }

  dispose(): void {
    this.genLoop?.stop(0.2);
    super.dispose();
  }
}
