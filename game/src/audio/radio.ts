// Car radio: five fictional stations with procedurally composed loops (tools/gen_music.py).
// Stations "run" continuously: tuning in starts at the station's current live position.
import type { AudioEngine } from './audio';

export interface Station {
  id: string;
  name: string;
  tagline: string;
}

export const STATIONS: Station[] = [
  { id: 'radio_neon', name: 'NEON 101', tagline: 'Techno aus der Turbine' },
  { id: 'radio_kiez', name: 'Kiez FM 93,1', tagline: 'Beats aus Sankt Paula' },
  { id: 'radio_heimat', name: 'Heimatwelle 98,4', tagline: 'Schlager & Disco' },
  { id: 'radio_motorik', name: 'Motorik 4', tagline: 'Krautrock nonstop' },
  { id: 'radio_welle', name: 'Welle 80', tagline: 'Neue Welle, alte Liebe' },
];

export class RadioPlayer {
  /** -1 = off */
  current = -1;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  /** per-station phase so the stations don't all start at the same bar */
  private phase = STATIONS.map((_, i) => i * 17.3);
  private token = 0;
  volume = 0.85;

  constructor(
    private a: AudioEngine,
    private base = 'audio/',
  ) {}

  private load(id: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    let p = this.loading.get(id);
    if (!p) {
      const ctx = this.a.ctx;
      if (!ctx) return Promise.resolve(null);
      p = fetch(`${this.base}${id}.ogg`)
        .then((r) => r.arrayBuffer())
        .then((arr) => ctx.decodeAudioData(arr))
        .then((buf) => {
          this.buffers.set(id, buf);
          return buf;
        })
        .catch((e) => {
          console.warn('radio load failed', id, e);
          return null;
        });
      this.loading.set(id, p);
    }
    return p;
  }

  /** start decoding a station in the background (e.g. when entering a car) */
  preload(index: number): void {
    if (index >= 0 && index < STATIONS.length) void this.load(STATIONS[index].id);
  }

  private stopSource(fade = 0.12): void {
    const ctx = this.a.ctx;
    if (this.src && this.gain && ctx) {
      const g = this.gain;
      const s = this.src;
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
      s.stop(ctx.currentTime + fade + 0.02);
    }
    this.src = null;
    this.gain = null;
  }

  /** Tune to a station (-1 = off). */
  tune(index: number, withStatic = true): void {
    const ctx = this.a.ctx;
    this.current = index;
    const tok = ++this.token;
    this.stopSource();
    if (!ctx || index < 0) return;
    if (withStatic) this.a.play('static', { vol: 0.35, bus: 'music' });
    const st = STATIONS[index];
    void this.load(st.id).then((buf) => {
      if (!buf || tok !== this.token || this.current !== index) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + (withStatic ? 0.5 : 0.25));
      src.connect(g).connect(this.a.music);
      const offset = (ctx.currentTime + this.phase[index]) % buf.duration;
      src.start(ctx.currentTime + (withStatic ? 0.18 : 0), offset);
      this.src = src;
      this.gain = g;
    });
  }

  next(): number {
    const n = this.current + 1 >= STATIONS.length ? -1 : this.current + 1;
    this.tune(n);
    return n;
  }

  off(): void {
    this.token++;
    this.current = -1;
    this.stopSource(0.3);
  }

  /** duck while the game is paused / a cutscene plays */
  setVolume(v: number): void {
    this.volume = v;
    const ctx = this.a.ctx;
    if (this.gain && ctx) this.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  }
}
