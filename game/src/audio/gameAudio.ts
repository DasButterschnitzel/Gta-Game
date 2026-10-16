// Binds game state to the audio engine: engine voices, skids, horns, sirens, impacts, footsteps.
import { AudioEngine, EngineVoice, type Loop } from './audio';
import type { Vehicle } from '../game/vehicle';
import { clamp01 } from '../core/math';

interface VoiceSlot {
  v: Vehicle;
  engine: EngineVoice | null;
  skid: Loop | null;
  horn: Loop | null;
  siren: Loop | null;
  fire: Loop | null;
}

export class GameAudio {
  private slots = new Map<Vehicle, VoiceSlot>();
  private stepT = 0;
  private stepIdx = 0;
  maxAIVoices = 3;

  constructor(readonly a: AudioEngine) {}

  get ok(): boolean {
    return this.a.ready && !!this.a.ctx && this.a.ctx.state === 'running';
  }

  setListener(x: number, y: number): void {
    this.a.listenerX = x;
    this.a.listenerY = y;
  }

  private slotFor(v: Vehicle): VoiceSlot {
    let s = this.slots.get(v);
    if (!s) {
      s = { v, engine: null, skid: null, horn: null, siren: null, fire: null };
      this.slots.set(v, s);
    }
    return s;
  }

  private release(s: VoiceSlot): void {
    s.engine?.stop();
    s.skid?.stop();
    s.horn?.stop();
    s.siren?.stop();
    s.fire?.stop();
    this.slots.delete(s.v);
  }

  /** called every frame */
  update(vehicles: Vehicle[], player: Vehicle | null, lx: number, ly: number): void {
    if (!this.ok) return;
    this.setListener(lx, ly);
    // choose which vehicles get voices: player + nearest moving AI cars (+ any with siren/fire)
    const wanted = new Set<Vehicle>();
    if (player && !player.dead) wanted.add(player);
    const near = vehicles
      .filter((v) => v !== player && !v.dead && (v.driver || v.burning > 0 || v.sirenOn))
      .map((v) => ({ v, d: Math.hypot(v.x - lx, v.y - ly) }))
      .filter((o) => o.d < 70)
      .sort((p, q) => p.d - q.d);
    let ai = 0;
    for (const o of near) {
      if (o.v.sirenOn || o.v.burning > 0) wanted.add(o.v);
      else if (ai < this.maxAIVoices) {
        wanted.add(o.v);
        ai++;
      }
    }
    for (const s of [...this.slots.values()]) if (!wanted.has(s.v)) this.release(s);
    for (const v of wanted) {
      const s = this.slotFor(v);
      const isPlayer = v === player;
      const vol = isPlayer ? 0.62 : 0.4;
      // engine
      if (v.driver && v.drivable) {
        if (!s.engine) s.engine = this.a.engineVoice(v.def.engine);
        s.engine?.update(v.rpm, Math.max(v.throttle, v.reversing ? 0.5 : 0), vol, v.x, v.y);
      } else if (s.engine) {
        s.engine.stop();
        s.engine = null;
      }
      // skid
      const sk = v.skid * clamp01(v.speed / 6);
      if (sk > 0.05) {
        if (!s.skid) s.skid = this.a.loop('skid', 0);
        this.a.setLoop(s.skid, sk * (isPlayer ? 0.55 : 0.4), v.x, v.y, 0.9 + v.speed * 0.006);
      } else if (s.skid) this.a.setLoop(s.skid, 0, v.x, v.y);
      // horn
      if (v.horn && v.drivable) {
        if (!s.horn) s.horn = this.a.loop(v.def.heavy ? 'horn_truck' : 'horn', 0);
        this.a.setLoop(s.horn, 0.5, v.x, v.y);
      } else if (s.horn) {
        s.horn.stop();
        s.horn = null;
      }
      // siren
      if (v.sirenOn && !v.dead) {
        if (!s.siren) s.siren = this.a.loop('siren', 0);
        this.a.setLoop(s.siren, 0.55, v.x, v.y);
      } else if (s.siren) {
        s.siren.stop();
        s.siren = null;
      }
      // fire crackle
      if (v.burning > 0 && !v.exploded) {
        if (!s.fire) s.fire = this.a.loop('fire', 0);
        this.a.setLoop(s.fire, 0.6, v.x, v.y);
      } else if (s.fire) {
        s.fire.stop();
        s.fire = null;
      }
    }
  }

  crash(x: number, y: number, dv: number, heavy: boolean): void {
    if (!this.ok) return;
    if (dv > 9 || heavy) {
      this.a.play('crash_heavy', { x, y, vol: Math.min(1, 0.5 + dv * 0.05) });
      if (dv > 7) this.a.play('glass', { x, y, vol: 0.5 });
    } else if (dv > 4.5) this.a.play('crash_mid', { x, y, vol: Math.min(1, 0.35 + dv * 0.06) });
    else this.a.play('crash_light', { x, y, vol: Math.min(0.9, 0.25 + dv * 0.08) });
  }

  play(name: string, x?: number, y?: number, vol = 1, rate = 1): void {
    if (!this.ok) return;
    this.a.play(name, { x, y, vol, rate });
  }

  footstep(dt: number, x: number, y: number, speed: number): void {
    if (!this.ok || speed < 0.5) return;
    this.stepT -= dt * (speed > 4 ? 2.6 : 1.7);
    if (this.stepT <= 0) {
      this.stepT = 1;
      this.stepIdx = (this.stepIdx + 1) % 3;
      this.a.play(`step${this.stepIdx}`, { x, y, vol: speed > 4 ? 0.32 : 0.2, vary: 0.15 });
    }
  }

  stopAll(): void {
    for (const s of [...this.slots.values()]) this.release(s);
  }
}
