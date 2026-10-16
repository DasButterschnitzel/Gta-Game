// WebAudio engine: positional one-shots, looping voices, crossfaded engine sounds.
import { clamp, clamp01, smoothstep } from '../core/math';
import type { EngineSound } from '../game/vehicleDefs';

export const SOUND_FILES = [
  'eng_i4_lo', 'eng_i4_hi', 'eng_i6_lo', 'eng_i6_hi', 'eng_v8_lo', 'eng_v8_hi', 'eng_boxer_lo', 'eng_boxer_hi',
  'eng_diesel_lo', 'eng_diesel_hi', 'eng_two_lo', 'eng_two_hi', 'eng_truck_lo', 'eng_truck_hi', 'eng_ev_lo', 'eng_ev_hi',
  'skid', 'crash_light', 'crash_mid', 'crash_heavy', 'glass', 'explosion', 'horn', 'horn_truck', 'siren', 'thud', 'punch',
  'step0', 'step1', 'step2', 'door', 'click', 'money', 'pickup', 'pass', 'wasted', 'splash', 'fire', 'ambient',
  'pistol', 'smg', 'shotgun', 'rifle', 'swing', 'throw', 'bat_hit', 'hit_metal', 'hit_flesh', 'clink', 'molotov',
  'heli', 'spray', 'takedown', 'busted', 'static', 'sms', 'ring',
];

/** sample rpm points must match tools/gen_audio.py */
const ENGINE_SPEC: Record<EngineSound, { idle: number; red: number; lo: number; hi: number }> = {
  i4: { idle: 850, red: 6800, lo: 1100, hi: 4400 },
  i6: { idle: 800, red: 7000, lo: 1100, hi: 4400 },
  v8: { idle: 750, red: 6500, lo: 1000, hi: 4000 },
  boxer: { idle: 950, red: 8200, lo: 1300, hi: 5200 },
  diesel: { idle: 800, red: 4500, lo: 900, hi: 3000 },
  two: { idle: 1800, red: 7500, lo: 2400, hi: 6600 },
  truck: { idle: 600, red: 2400, lo: 700, hi: 2100 },
  ev: { idle: 300, red: 1300, lo: 340, hi: 1150 },
};

export interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
  stop(): void;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  listenerX = 0;
  listenerY = 0;
  /** metres at which sounds are at half volume */
  refDist = 22;
  ready = false;
  private ambient: Loop | null = null;
  volumes = { master: 0.9, sfx: 1, music: 0.6 };

  async init(base = 'audio/'): Promise<void> {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    // gentle limiter so crashes never clip
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = this.volumes.sfx;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = this.volumes.music;
    this.music.connect(this.master);
    const ctx = this.ctx;
    await Promise.all(
      SOUND_FILES.map(async (name) => {
        try {
          const res = await fetch(`${base}${name}.ogg`);
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          this.buffers.set(name, buf);
        } catch (e) {
          console.warn('audio load failed', name, e);
        }
      }),
    );
    this.ready = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.suspend();
      else this.resume();
    });
  }

  /** must be called from a user gesture on mobile */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => undefined);
  }

  setVolumes(v: Partial<{ master: number; sfx: number; music: number }>): void {
    Object.assign(this.volumes, v);
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music;
  }

  private spatial(x: number | undefined, y: number | undefined): { g: number; p: number } {
    if (x === undefined || y === undefined) return { g: 1, p: 0 };
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const d = Math.hypot(dx, dy);
    const g = 1 / (1 + (d / this.refDist) ** 2);
    return { g, p: clamp(dx / 45, -0.85, 0.85) };
  }

  play(name: string, opts: { x?: number; y?: number; vol?: number; rate?: number; vary?: number; bus?: 'sfx' | 'music' } = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || ctx.state !== 'running') return;
    const { g, p } = this.spatial(opts.x, opts.y);
    const vol = (opts.vol ?? 1) * g;
    if (vol < 0.01) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() - 0.5) * (opts.vary ?? 0.08));
    const gain = ctx.createGain();
    gain.gain.value = vol;
    let node: AudioNode = gain;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = p;
      gain.connect(pan);
      node = pan;
    }
    node.connect(opts.bus === 'music' ? this.music : this.sfx);
    src.connect(gain);
    src.start();
  }

  loop(name: string, vol = 0, rate = 1, bus: 'sfx' | 'music' = 'sfx'): Loop | null {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    let pan: StereoPannerNode | null = null;
    src.connect(gain);
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      gain.connect(pan);
      pan.connect(bus === 'music' ? this.music : this.sfx);
    } else gain.connect(bus === 'music' ? this.music : this.sfx);
    src.start(0, Math.random() * buf.duration);
    return {
      src,
      gain,
      pan,
      stop: () => {
        try {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          src.stop(ctx.currentTime + 0.3);
        } catch {
          /* ignore */
        }
      },
    };
  }

  setLoop(l: Loop | null, vol: number, x?: number, y?: number, rate?: number): void {
    if (!l || !this.ctx) return;
    const { g, p } = this.spatial(x, y);
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(vol * g, t, 0.04);
    if (l.pan) l.pan.pan.setTargetAtTime(p, t, 0.05);
    if (rate !== undefined) l.src.playbackRate.setTargetAtTime(rate, t, 0.03);
  }

  startAmbient(): void {
    if (this.ambient || !this.ctx) return;
    this.ambient = this.loop('ambient', 0.18);
  }

  setAmbient(vol: number): void {
    this.setLoop(this.ambient, vol);
  }

  engineVoice(kind: EngineSound): EngineVoice | null {
    if (!this.ctx) return null;
    return new EngineVoice(this, kind);
  }
}

export class EngineVoice {
  private lo: Loop | null;
  private hi: Loop | null;
  private filter: BiquadFilterNode | null = null;
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private spec: { idle: number; red: number; lo: number; hi: number };

  constructor(
    private a: AudioEngine,
    kind: EngineSound,
  ) {
    this.spec = ENGINE_SPEC[kind];
    const ctx = a.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2500;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.out);
    if (ctx.createStereoPanner) {
      this.pan = ctx.createStereoPanner();
      this.out.connect(this.pan);
      this.pan.connect(a.sfx);
    } else this.out.connect(a.sfx);
    this.lo = this.makeLoop(`eng_${kind}_lo`);
    this.hi = this.makeLoop(`eng_${kind}_hi`);
  }

  private makeLoop(name: string): Loop | null {
    const l = this.a.loop(name, 0);
    if (!l) return null;
    // reroute through our filter instead of the default output
    l.gain.disconnect();
    l.gain.connect(this.filter!);
    return l;
  }

  /** rpm01 0..1, throttle 0..1, vol 0..1 */
  update(rpm01: number, throttle: number, vol: number, x: number, y: number): void {
    const ctx = this.a.ctx;
    if (!ctx || !this.out) return;
    const s = this.spec;
    const rpm = s.idle + clamp01(rpm01) * (s.red - s.idle);
    const w = smoothstep(s.lo * 1.35, s.hi * 0.8, rpm);
    const t = ctx.currentTime;
    if (this.lo) {
      this.lo.src.playbackRate.setTargetAtTime(rpm / s.lo, t, 0.03);
      this.lo.gain.gain.setTargetAtTime(1 - w, t, 0.04);
    }
    if (this.hi) {
      this.hi.src.playbackRate.setTargetAtTime(rpm / s.hi, t, 0.03);
      this.hi.gain.gain.setTargetAtTime(w, t, 0.04);
    }
    const dx = x - this.a.listenerX;
    const dy = y - this.a.listenerY;
    const d = Math.hypot(dx, dy);
    const g = 1 / (1 + (d / this.a.refDist) ** 2);
    this.out.gain.setTargetAtTime(vol * g * (0.45 + 0.55 * clamp01(throttle * 0.8 + rpm01 * 0.4)), t, 0.05);
    this.filter!.frequency.setTargetAtTime(700 + throttle * 3500 + rpm01 * 2500, t, 0.05);
    if (this.pan) this.pan.pan.setTargetAtTime(clamp(dx / 45, -0.8, 0.8), t, 0.05);
  }

  stop(): void {
    this.lo?.stop();
    this.hi?.stop();
    const ctx = this.a.ctx;
    if (ctx && this.out) this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(() => {
      try {
        this.out?.disconnect();
        this.pan?.disconnect();
      } catch {
        /* ignore */
      }
    }, 500);
  }
}
