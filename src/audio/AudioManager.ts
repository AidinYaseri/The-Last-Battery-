import * as THREE from 'three';
import { GENS, voiceGen, type Gen } from './Synth';

export interface PlayOpts {
  volume?: number;
  rate?: number;
  loop?: boolean;
  pos?: THREE.Vector3 | { x: number; y: number; z: number };
  /** reference distance for positional sounds */
  refDist?: number;
  maxDist?: number;
  bus?: 'sfx' | 'music' | 'amb' | 'ui';
  fadeIn?: number;
  delay?: number;
  lowpass?: number;
  reverb?: number;
}

export interface SoundHandle {
  stop(fade?: number): void;
  setVolume(v: number, fade?: number): void;
  setPos(p: { x: number; y: number; z: number }): void;
  setRate(r: number): void;
  duration: number;
  ended: Promise<void>;
}

const NULL_HANDLE: SoundHandle = {
  stop() {},
  setVolume() {},
  setPos() {},
  setRate() {},
  duration: 0,
  ended: Promise.resolve(),
};

export interface AmbienceConfig {
  wind?: number;
  windTone?: number;
  crickets?: number;
  hum?: number;
  rumble?: number;
  birds?: number;
  reverb?: number;
}

interface MusicTrack {
  stop(fade: number): void;
}

/**
 * WebAudio based sound engine: procedural buffers, positional audio,
 * ambience beds, a reverb send and generative music.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private ui!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;
  private buffers = new Map<string, AudioBuffer[]>();
  private voiceCache = new Map<string, AudioBuffer>();
  private beds = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode; lfo?: OscillatorNode }>();
  private currentMusic: MusicTrack | null = null;
  private vol = { master: 0.8, music: 0.7, sfx: 0.9 };
  private muffle!: BiquadFilterNode;
  private loops = new Set<SoundHandle>();
  private tmp = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private up = new THREE.Vector3();

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.ui = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.amb.connect(this.sfx);
    this.ui.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.5);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.25;
    this.reverb.connect(this.reverbGain).connect(this.sfx);
    this.applyVolumes();
    if (ctx.state === 'suspended') ctx.resume();
  }

  private impulse(dur: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.8, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ui.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.05);
  }

  /** Muffle everything (used for pause / unconsciousness). */
  setMuffled(on: boolean, freq = 600): void {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? freq : 20000, this.ctx.currentTime, 0.2);
  }

  setReverb(wet: number, dur = 2.4): void {
    if (!this.ctx) return;
    this.reverbGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.5);
    if (Math.abs((this.reverb.buffer?.duration ?? 0) - dur) > 0.2) this.reverb.buffer = this.impulse(dur, 2.5);
  }

  private makeBuffer(gen: Gen): AudioBuffer {
    const ctx = this.ctx!;
    const data = gen(ctx.sampleRate);
    if (Array.isArray(data)) {
      const b = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
      b.copyToChannel(data[0] as Float32Array<ArrayBuffer>, 0);
      b.copyToChannel(data[1] as Float32Array<ArrayBuffer>, 1);
      return b;
    }
    const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  private getBuffer(name: string): AudioBuffer | null {
    if (!this.ctx) return null;
    let list = this.buffers.get(name);
    if (!list) {
      const gens = GENS[name];
      if (!gens) {
        console.warn(`[audio] unknown sound ${name}`);
        return null;
      }
      list = gens.map((g) => this.makeBuffer(g));
      this.buffers.set(name, list);
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Pre-generates buffers in small idle chunks to avoid hitches later. */
  prewarm(): void {
    if (!this.ctx) return;
    const names = Object.keys(GENS).filter((n) => !this.buffers.has(n));
    const step = () => {
      const n = names.shift();
      if (!n) return;
      this.getBuffer(n);
      setTimeout(step, 16);
    };
    setTimeout(step, 50);
  }

  play(name: string, o: PlayOpts = {}): SoundHandle {
    const b = this.getBuffer(name);
    if (!b) return NULL_HANDLE;
    return this.playBuffer(b, o);
  }

  playAt(name: string, pos: { x: number; y: number; z: number }, o: PlayOpts = {}): SoundHandle {
    return this.play(name, { ...o, pos });
  }

  playBuffer(b: AudioBuffer, o: PlayOpts = {}): SoundHandle {
    const ctx = this.ctx;
    if (!ctx) return NULL_HANDLE;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = !!o.loop;
    const rate = o.rate ?? 1;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    const v = o.volume ?? 1;
    const start = ctx.currentTime + (o.delay ?? 0);
    if (o.fadeIn) {
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(v, start + o.fadeIn);
    } else gain.gain.value = v;
    let node: AudioNode = src;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    let panner: PannerNode | null = null;
    const busNode = o.bus === 'music' ? this.music : o.bus === 'amb' ? this.amb : o.bus === 'ui' ? this.ui : this.sfx;
    if (o.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = o.refDist ?? 2;
      panner.maxDistance = o.maxDist ?? 80;
      panner.rolloffFactor = 1.2;
      panner.positionX.value = o.pos.x;
      panner.positionY.value = o.pos.y;
      panner.positionZ.value = o.pos.z;
      gain.connect(panner).connect(busNode);
      if (o.reverb !== 0) {
        const send = ctx.createGain();
        send.gain.value = o.reverb ?? 0.6;
        panner.connect(send).connect(this.reverb);
      }
    } else {
      gain.connect(busNode);
      if (o.reverb) {
        const send = ctx.createGain();
        send.gain.value = o.reverb;
        gain.connect(send).connect(this.reverb);
      }
    }
    src.start(start);
    let resolveEnded!: () => void;
    const ended = new Promise<void>((r) => (resolveEnded = r));
    src.onended = () => {
      resolveEnded();
      try {
        gain.disconnect();
        panner?.disconnect();
      } catch {
        /* ignore */
      }
    };
    let stopped = false;
    const handle: SoundHandle = {
      duration: b.duration / rate,
      ended,
      stop: (fade = 0.05) => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fade);
        try {
          src.stop(t + fade + 0.02);
        } catch {
          /* already stopped */
        }
      },
      setVolume: (vv, fade = 0.1) => {
        gain.gain.setTargetAtTime(vv, ctx.currentTime, Math.max(0.01, fade / 3));
      },
      setPos: (p) => {
        if (!panner) return;
        panner.positionX.value = p.x;
        panner.positionY.value = p.y;
        panner.positionZ.value = p.z;
      },
      setRate: (r) => {
        src.playbackRate.value = r;
      },
    };
    if (o.loop) {
      this.loops.add(handle);
      ended.then(() => this.loops.delete(handle));
    }
    return handle;
  }

  /** Stops every looping one-shot (radios, generators...) e.g. on level change. */
  stopLoops(fade = 0.3): void {
    this.loops.forEach((h) => h.stop(fade));
    this.loops.clear();
  }

  /** Speech-like murmur synthesised for a line of dialogue. */
  voice(text: string, type: 'radio' | 'recording' | 'whisper' | 'phone' | 'self', o: PlayOpts = {}): SoundHandle {
    if (!this.ctx) return NULL_HANDLE;
    const key = `${type}:${text}`;
    let b = this.voiceCache.get(key);
    if (!b) {
      b = this.makeBuffer(voiceGen(text, type));
      this.voiceCache.set(key, b);
    }
    return this.playBuffer(b, { reverb: type === 'whisper' ? 0.5 : 0.15, ...o });
  }

  updateListener(camera: THREE.Camera): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    camera.getWorldPosition(this.tmp);
    camera.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(this.tmp.x, t, 0.02);
      l.positionY.setTargetAtTime(this.tmp.y, t, 0.02);
      l.positionZ.setTargetAtTime(this.tmp.z, t, 0.02);
      l.forwardX.setTargetAtTime(this.fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(this.fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(this.fwd.z, t, 0.02);
      l.upX.setTargetAtTime(this.up.x, t, 0.02);
      l.upY.setTargetAtTime(this.up.y, t, 0.02);
      l.upZ.setTargetAtTime(this.up.z, t, 0.02);
    } else {
      (l as any).setPosition(this.tmp.x, this.tmp.y, this.tmp.z);
      (l as any).setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }
  }

  // ------------------------------------------------------------ ambience beds

  private bed(name: string, buffer: string, level: number, fade: number, filterCfg?: { type: BiquadFilterType; freq: number; q?: number; lfo?: number; lfoDepth?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    let b = this.beds.get(name);
    if (!b && level > 0.0001) {
      const buf = this.getBuffer(buffer);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let node: AudioNode = src;
      let filter: BiquadFilterNode | undefined;
      let lfo: OscillatorNode | undefined;
      if (filterCfg) {
        filter = ctx.createBiquadFilter();
        filter.type = filterCfg.type;
        filter.frequency.value = filterCfg.freq;
        filter.Q.value = filterCfg.q ?? 0.7;
        node.connect(filter);
        node = filter;
        if (filterCfg.lfo) {
          lfo = ctx.createOscillator();
          lfo.frequency.value = filterCfg.lfo;
          const lg = ctx.createGain();
          lg.gain.value = filterCfg.lfoDepth ?? filterCfg.freq * 0.5;
          lfo.connect(lg).connect(filter.frequency);
          lfo.start();
        }
      }
      node.connect(gain).connect(this.amb);
      src.start(ctx.currentTime, Math.random() * buf.duration);
      b = { src, gain, filter, lfo };
      this.beds.set(name, b);
    }
    if (!b) return;
    b.gain.gain.setTargetAtTime(level, ctx.currentTime, fade / 3);
    if (filterCfg && b.filter) b.filter.frequency.setTargetAtTime(filterCfg.freq, ctx.currentTime, fade / 3);
  }

  setAmbience(cfg: AmbienceConfig, fade = 2): void {
    if (!this.ctx) return;
    this.bed('wind', 'noise_pink', (cfg.wind ?? 0) * 0.35, fade, { type: 'lowpass', freq: cfg.windTone ?? 500, q: 0.8, lfo: 0.07, lfoDepth: 300 });
    this.bed('wind2', 'noise_pink', (cfg.wind ?? 0) * 0.12, fade, { type: 'bandpass', freq: 1400, q: 2.5, lfo: 0.11, lfoDepth: 700 });
    this.bed('crickets', 'crickets', (cfg.crickets ?? 0) * 0.12, fade);
    this.bed('hum', 'hum', (cfg.hum ?? 0) * 0.06, fade, { type: 'lowpass', freq: 400 });
    this.bed('rumble', 'noise_brown', (cfg.rumble ?? 0) * 0.5, fade, { type: 'lowpass', freq: 180 });
    this.bed('birds', 'birds', (cfg.birds ?? 0) * 0.25, fade);
    if (cfg.reverb !== undefined) this.setReverb(cfg.reverb);
  }

  stopAmbience(fade = 1): void {
    this.setAmbience({}, fade);
  }

  // ------------------------------------------------------------ music

  playMusic(kind: 'menu' | 'dread' | 'reveal' | 'daylight' | 'ending' | 'none', fade = 3): void {
    if (!this.ctx) return;
    this.currentMusic?.stop(fade);
    this.currentMusic = null;
    if (kind === 'none') return;
    this.currentMusic = this.createMusic(kind, fade);
  }

  stinger(): void {
    this.play('stinger', { bus: 'music', volume: 0.9 });
  }

  private createMusic(kind: 'menu' | 'dread' | 'reveal' | 'daylight' | 'ending', fade: number): MusicTrack {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, fade / 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = kind === 'daylight' ? 1400 : 700;
    lp.connect(out).connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    out.connect(send).connect(this.reverb);
    const nodes: AudioScheduledSourceNode[] = [];
    let timer: number | undefined;

    const osc = (type: OscillatorType, f: number, g: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const gn = ctx.createGain();
      gn.gain.value = g;
      o.connect(gn).connect(lp);
      o.start();
      nodes.push(o);
      return { o, gn };
    };
    const pluck = (f: number, g = 0.15, len = 3) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const gn = ctx.createGain();
      const t = ctx.currentTime;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(g, t + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(gn).connect(lp);
      o.start(t);
      o.stop(t + len + 0.1);
    };

    if (kind === 'menu' || kind === 'ending') {
      osc('sawtooth', 55, 0.05);
      osc('sawtooth', 55, 0.05, 7);
      osc('sine', 110, 0.04);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const lg = ctx.createGain();
      lg.gain.value = 250;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      nodes.push(lfo);
      const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
      const loop = () => {
        pluck(scale[Math.floor(Math.random() * scale.length)] * (Math.random() > 0.7 ? 0.5 : 1), 0.12, 4);
        timer = window.setTimeout(loop, 2500 + Math.random() * 4000);
      };
      timer = window.setTimeout(loop, 1500);
    } else if (kind === 'dread') {
      osc('sawtooth', 41.2, 0.06);
      osc('sawtooth', 41.2, 0.06, 12);
      osc('sine', 1318, 0.006);
      osc('sine', 1396, 0.005);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lg = ctx.createGain();
      lg.gain.value = 200;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      nodes.push(lfo);
    } else if (kind === 'reveal') {
      [55, 58.27, 82.4, 87.3, 164.8].forEach((f, i) => osc(i % 2 ? 'triangle' : 'sawtooth', f, 0.05, (i - 2) * 5));
      lp.frequency.setValueAtTime(200, ctx.currentTime);
      lp.frequency.linearRampToValueAtTime(1600, ctx.currentTime + 20);
      const loop = () => {
        pluck(110 * (Math.random() > 0.5 ? 1 : 1.059), 0.2, 5);
        timer = window.setTimeout(loop, 4000 + Math.random() * 3000);
      };
      timer = window.setTimeout(loop, 3000);
    } else if (kind === 'daylight') {
      [130.8, 164.8, 196, 246.9, 329.6].forEach((f, i) => osc(i === 0 ? 'sine' : 'triangle', f, 0.035, (i - 2) * 3));
      const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
      const loop = () => {
        pluck(scale[Math.floor(Math.random() * scale.length)], 0.07, 3);
        timer = window.setTimeout(loop, 1800 + Math.random() * 2500);
      };
      timer = window.setTimeout(loop, 1200);
    }

    return {
      stop: (f: number) => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, Math.max(0.05, f / 3));
        if (timer) clearTimeout(timer);
        setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              /* ignore */
            }
          });
          out.disconnect();
        }, f * 1000 + 500);
      },
    };
  }

  stopAll(): void {
    this.playMusic('none', 0.5);
    this.stopAmbience(0.5);
  }
}
