// Mission runner: missions are async scripts that await conditions evaluated every frame.
// A fail condition (or the player dying / getting busted) rejects every pending wait, which
// unwinds the script; everything the mission spawned is cleaned up afterwards.
import type { Game } from '../game/game';
import type { Vehicle } from '../game/vehicle';
import type { Character, Role } from '../game/character';
import type { Line } from '../ui/dialogue';
import type { Marker, MarkerColor } from '../render/markers';
import type { Blip } from '../ui/hud';
import type { CharLook } from '../render/charSprites';
import { findRoute } from '../world/route';

export class MissionAbort extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface MissionDef {
  id: string;
  title: string;
  /** face id of the contact (start marker letter) */
  giver: string;
  /** start position (POI id or coordinates); missing = starts automatically */
  start?: string | { x: number; y: number };
  reward: number;
  /** dying / getting busted doesn't fail it (prologue) */
  noFail?: boolean;
  run(m: MissionCtx): Promise<void>;
}

interface Wait {
  pred: () => boolean;
  resolve: () => void;
  reject: (e: unknown) => void;
}

export interface Target {
  x: () => number;
  y: () => number;
  color: MarkerColor;
  kind: 'ring' | 'arrow';
  r: number;
  blip: boolean;
  gps: boolean;
  z: number;
  /** the main target gets the off-screen arrow */
  primary: boolean;
}

const BLIP_COLOR: Record<MarkerColor, string> = {
  yellow: '#ffd84a',
  blue: '#5aa8ff',
  red: '#ff4a3a',
  green: '#5aff6a',
  white: '#ffffff',
  purple: '#d87aff',
};

export class MissionRunner {
  active: MissionDef | null = null;
  ctx: MissionCtx | null = null;
  private waits: Wait[] = [];
  private fails: { pred: () => boolean; reason: string }[] = [];
  readonly targets: Target[] = [];
  objective = '';
  timer: { left: number; label: string } | null = null;
  gps: { x: number; y: number }[] = [];
  private gpsT = 0;
  private spawnedV: Vehicle[] = [];
  private spawnedC: Character[] = [];
  private keepV = new Set<Vehicle>();
  private aborting: string | null = null;
  time = 0;

  constructor(readonly g: Game) {}

  get running(): boolean {
    return this.active !== null;
  }

  async start(def: MissionDef): Promise<'pass' | 'fail'> {
    if (this.active) return 'fail';
    this.active = def;
    this.aborting = null;
    this.time = 0;
    const ctx = new MissionCtx(this, this.g);
    this.ctx = ctx;
    // the player dying or getting arrested fails any mission
    if (!def.noFail) {
      this.failIf(() => this.g.player.char.dead, 'Du bist gestorben.');
      this.failIf(() => this.g.isBusted, 'Du wurdest festgenommen.');
    }
    let result: 'pass' | 'fail' = 'pass';
    try {
      await def.run(ctx);
    } catch (e) {
      result = 'fail';
      const reason = e instanceof MissionAbort ? e.reason : 'Fehler';
      if (!(e instanceof MissionAbort)) console.error(e);
      this.cleanup();
      this.active = null;
      this.ctx = null;
      this.g.onMissionFail(def, reason);
      return result;
    }
    this.cleanup();
    this.active = null;
    this.ctx = null;
    this.g.onMissionPass(def);
    return result;
  }

  /** resolve when pred() becomes true (checked every frame) */
  until(pred: () => boolean): Promise<void> {
    if (this.aborting) return Promise.reject(new MissionAbort(this.aborting));
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => this.waits.push({ pred, resolve, reject }));
  }

  failIf(pred: () => boolean, reason: string): () => void {
    const f = { pred, reason };
    this.fails.push(f);
    return () => {
      const i = this.fails.indexOf(f);
      if (i >= 0) this.fails.splice(i, 1);
    };
  }

  abort(reason: string): void {
    if (!this.active || this.aborting) return;
    this.aborting = reason;
    const ws = this.waits.splice(0);
    for (const w of ws) w.reject(new MissionAbort(reason));
  }

  /** called every frame while the game runs */
  frame(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    if (this.aborting) return;
    for (const f of this.fails) {
      if (f.pred()) {
        this.abort(f.reason);
        return;
      }
    }
    if (this.timer) {
      this.timer.left -= dt;
      if (this.timer.left <= 0) {
        this.timer = null;
        this.abort('Die Zeit ist abgelaufen.');
        return;
      }
    }
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i];
      let ok = false;
      try {
        ok = w.pred();
      } catch (e) {
        console.error(e);
      }
      if (ok) {
        this.waits.splice(i, 1);
        w.resolve();
      }
    }
    // GPS route to the first GPS target
    this.gpsT -= dt;
    if (this.gpsT <= 0) {
      this.gpsT = 1.2;
      this.updateGps();
    }
  }

  private updateGps(): void {
    const g = this.g;
    const t = this.targets.find((o) => o.gps);
    const v = g.player.vehicle;
    if (!t || !v) {
      this.gps = [];
      return;
    }
    const tx = t.x();
    const ty = t.y();
    if (Math.hypot(tx - v.x, ty - v.y) < 30) {
      this.gps = [];
      return;
    }
    const city = g.city;
    const from = city.nearestLane(v.x, v.y, 16, v.angle, Math.PI * 0.6, false) ?? city.nearestLane(v.x, v.y, 30, undefined, Math.PI, false);
    if (!from) {
      this.gps = [];
      return;
    }
    const goal = city.nearestLane(tx, ty, 120, undefined, Math.PI, false);
    const gx = goal ? goal.px : tx;
    const gy = goal ? goal.py : ty;
    const route = findRoute(city, from.edge, gx, gy, 24, 6000, (id) => g.laneBlocked(id));
    const pts: { x: number; y: number }[] = [{ x: v.x, y: v.y }];
    if (route) {
      for (const id of route) {
        const e = city.lanes[id];
        const step = Math.max(1, Math.floor(e.xs.length / 6));
        for (let i = 0; i < e.xs.length; i += step) pts.push({ x: e.xs[i], y: e.ys[i] });
      }
    }
    pts.push({ x: tx, y: ty });
    this.gps = pts;
  }

  addTarget(t: Partial<Target> & { x: () => number; y: () => number }): Target {
    const full: Target = { color: 'yellow', kind: 'ring', r: 4, blip: true, gps: false, z: 2.4, primary: this.targets.length === 0, ...t };
    this.targets.push(full);
    this.gpsT = 0;
    return full;
  }

  removeTarget(t: Target): void {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
    if (t.primary && this.targets.length) this.targets[0].primary = true;
    if (!this.targets.some((o) => o.gps)) this.gps = [];
  }

  markers(out: Marker[]): void {
    for (const t of this.targets) out.push({ x: t.x(), y: t.y(), r: t.r, color: t.color, kind: t.kind, z: t.z });
  }

  blips(out: Blip[]): void {
    for (const t of this.targets) if (t.blip) out.push({ x: t.x(), y: t.y(), color: BLIP_COLOR[t.color], size: 6, shape: t.kind === 'arrow' ? 'tri' : 'square' });
  }

  primaryTarget(): Target | null {
    return this.targets.find((t) => t.primary) ?? this.targets[0] ?? null;
  }

  track(v: Vehicle | null, c: Character | null, keep = false): void {
    if (v) {
      this.spawnedV.push(v);
      if (keep) this.keepV.add(v);
    }
    if (c) this.spawnedC.push(c);
  }

  keep(v: Vehicle): void {
    this.keepV.add(v);
  }

  cleanup(): void {
    const g = this.g;
    this.waits.length = 0;
    this.fails.length = 0;
    this.targets.length = 0;
    this.timer = null;
    this.objective = '';
    this.gps = [];
    for (const c of this.spawnedC) {
      if (c === g.player.char) continue;
      if (c.vehicle) {
        const i = c.vehicle.passengers.indexOf(c);
        if (i >= 0) c.vehicle.passengers.splice(i, 1);
        c.vehicle = null;
      }
      g.removeChar(c);
    }
    for (const v of this.spawnedV) {
      if (this.keepV.has(v) || v === g.player.vehicle) {
        v.missionTag = v.missionTag === 'gisela' ? 'gisela' : '';
        continue;
      }
      // leave wrecks/visible cars to the normal clean-up; remove the rest
      if (!g.isVisible(v.x, v.y, 10)) g.removeVehicle(v);
      else v.missionTag = '';
    }
    this.spawnedV.length = 0;
    this.spawnedC.length = 0;
    this.keepV.clear();
  }
}

/** The API mission scripts use. */
export class MissionCtx {
  constructor(
    private r: MissionRunner,
    readonly g: Game,
  ) {}

  get time(): number {
    return this.r.time;
  }

  /** comic dialogue (game paused while it plays) */
  say(lines: Line[]): Promise<void> {
    return this.g.playDialogue(lines);
  }

  until(pred: () => boolean): Promise<void> {
    return this.r.until(pred);
  }

  wait(seconds: number): Promise<void> {
    const end = this.r.time + seconds;
    return this.r.until(() => this.r.time >= end);
  }

  objective(text: string): void {
    this.r.objective = text;
    if (text) this.g.hud.objectiveFlash();
  }

  failIf(pred: () => boolean, reason: string): () => void {
    return this.r.failIf(pred, reason);
  }

  fail(reason: string): never {
    this.r.abort(reason);
    throw new MissionAbort(reason);
  }

  timer(seconds: number, label = ''): { stop(): void; left(): number } {
    this.r.timer = { left: seconds, label };
    const t = this.r.timer;
    return {
      stop: () => {
        if (this.r.timer === t) this.r.timer = null;
      },
      left: () => t.left,
    };
  }

  target(t: Partial<Target> & { x: () => number; y: () => number }): Target {
    return this.r.addTarget(t);
  }

  untarget(t: Target): void {
    this.r.removeTarget(t);
  }

  /** go to a point (on foot or by car). `stop` = must be slow when arriving in a vehicle */
  async goTo(x: number, y: number, text: string, opts: { r?: number; vehicle?: boolean | Vehicle; stop?: boolean; color?: MarkerColor; gps?: boolean } = {}): Promise<void> {
    const r = opts.r ?? 4;
    this.objective(text);
    const t = this.target({ x: () => x, y: () => y, r, color: opts.color ?? 'yellow', kind: 'ring', gps: opts.gps ?? true });
    const g = this.g;
    try {
      await this.until(() => {
        const pl = g.player;
        if (Math.hypot(pl.x - x, pl.y - y) > r) return false;
        if (opts.vehicle === true && !pl.vehicle) return false;
        if (opts.vehicle && opts.vehicle !== true && pl.vehicle !== opts.vehicle) return false;
        if (opts.stop && pl.vehicle && pl.vehicle.speed > 3) return false;
        return true;
      });
    } finally {
      this.untarget(t);
    }
  }

  /** get into a specific vehicle */
  async enter(v: Vehicle, text: string, color: MarkerColor = 'blue'): Promise<void> {
    this.objective(text);
    const t = this.target({ x: () => v.x, y: () => v.y, kind: 'arrow', color, r: 3, gps: true });
    try {
      await this.until(() => this.g.player.vehicle === v);
    } finally {
      this.untarget(t);
    }
  }

  vehicle(id: string, x: number, y: number, angle: number, opts: { paint?: number; tag?: string; keep?: boolean; locked?: boolean } = {}): Vehicle {
    const v = this.g.spawnVehicle(id, x, y, angle, opts.paint);
    v.missionTag = opts.tag ?? 'mission';
    v.locked = !!opts.locked;
    this.r.track(v, null, opts.keep);
    return v;
  }

  char(look: CharLook, x: number, y: number, role: Role = 'story', heading = 0): Character {
    const c = this.g.spawnChar(x, y, look, role);
    c.heading = heading;
    this.r.track(null, c);
    return c;
  }

  /** a passenger sitting (hidden) in a vehicle */
  passenger(look: CharLook, v: Vehicle): Character {
    const c = this.char(look, v.x, v.y, 'story');
    c.hide();
    c.vehicle = v;
    c.state = 'driving';
    v.passengers.push(c);
    return c;
  }

  keep(v: Vehicle): void {
    this.r.keep(v);
  }

  /** big title card */
  title(text: string, sub = '', secs = 2.6): Promise<void> {
    this.g.hud.titleCard(text, sub, secs);
    return this.wait(secs);
  }
}
