// Non-police cars with a will of their own: gang chasers that ram and shoot out of the windows,
// Kronwache SUVs, escorts that tail another car, and calm scripted drivers heading somewhere.
import type { Game } from './game';
import type { Vehicle } from './vehicle';
import type { Character, Role } from './character';
import type { CharLook } from '../render/charSprites';
import { Arsenal, WEAPONS, type WeaponId } from './weapons';
import { PursuitDriver, newDriveState, type DriveState } from './pursuit';
import { RNG } from '../core/rng';
import { clamp } from '../core/math';

export type ChaserMode = 'chase' | 'follow' | 'goto' | 'hold' | 'out';

export interface Chaser extends DriveState {
  kind: 'chaser';
  v: Vehicle;
  crew: Character[];
  inCar: Character[];
  mode: ChaserMode;
  /** chase: whom to hunt (the player, usually) */
  target: Character | null;
  /** follow: the car to tail */
  lead: Vehicle | null;
  /** goto: destination */
  dx: number;
  dy: number;
  arrived: boolean;
  ram: boolean;
  driveBy: boolean;
  accuracy: number;
  shootT: number;
  /** crew bails out below this fraction of vehicle health */
  bailAt: number;
  speedMul: number;
  /** crew becomes hostile on foot (else they flee) */
  hostile: boolean;
  gang: number;
  weapon: WeaponId | null;
  crewHealth: number;
  age: number;
  losT: number;
  sees: boolean;
  /** seconds without real progress (stuck → the crew gives up and gets out) */
  slowT: number;
  role: Role;
}

export interface ChaserOptions {
  crew: CharLook[];
  mode?: ChaserMode;
  target?: Character | null;
  lead?: Vehicle | null;
  dest?: { x: number; y: number };
  weapon?: WeaponId | null;
  /** per crew member (overrides `weapon`) */
  weapons?: (WeaponId | null)[];
  accuracy?: number;
  ram?: boolean;
  driveBy?: boolean;
  bailAt?: number;
  speedMul?: number;
  hostile?: boolean;
  gang?: number;
  paint?: number;
  health?: number;
  crewHealth?: number;
  role?: Role;
}

export class ChaserSystem {
  readonly list: Chaser[] = [];
  private driver: PursuitDriver;
  private rng = new RNG(4711);

  constructor(private g: Game) {
    this.driver = new PursuitDriver(g);
  }

  spawn(defId: string, x: number, y: number, angle: number, o: ChaserOptions): Chaser {
    const g = this.g;
    const v = g.spawnVehicle(defId, x, y, angle, o.paint);
    if (o.health) v.health = v.maxHealth = o.health;
    v.lightsOn = true;
    const crew: Character[] = [];
    o.crew.forEach((look, i) => {
      const c = g.spawnChar(x, y, look, o.role ?? 'gang');
      c.hide();
      c.vehicle = v;
      c.state = 'driving';
      c.arsenal = new Arsenal();
      const w = o.weapons ? o.weapons[i % o.weapons.length] : o.weapon;
      if (w) c.arsenal.give(w, 9999, true);
      if (o.crewHealth) c.health = c.maxHealth = o.crewHealth;
      crew.push(c);
    });
    v.driver = crew[0] ?? null;
    const ch: Chaser = {
      ...newDriveState(x, y, angle),
      kind: 'chaser',
      v,
      crew,
      inCar: crew.slice(),
      mode: o.mode ?? 'chase',
      target: o.target ?? g.player.char,
      lead: o.lead ?? null,
      dx: o.dest?.x ?? x,
      dy: o.dest?.y ?? y,
      arrived: false,
      ram: o.ram ?? true,
      driveBy: o.driveBy ?? !!o.weapon,
      accuracy: o.accuracy ?? 0.4,
      shootT: this.rng.range(0.8, 1.6),
      bailAt: o.bailAt ?? 0.3,
      speedMul: o.speedMul ?? 1,
      hostile: o.hostile ?? true,
      gang: o.gang ?? -1,
      weapon: o.weapon ?? null,
      crewHealth: o.crewHealth ?? 0,
      age: 0,
      losT: 0,
      sees: false,
      slowT: 0,
      role: o.role ?? 'gang',
    };
    v.ai = ch;
    this.list.push(ch);
    return ch;
  }

  /** give a calm destination to a chaser (or a scripted driver) */
  goto(ch: Chaser, x: number, y: number, speedMul = 0.6): void {
    ch.mode = 'goto';
    ch.dx = x;
    ch.dy = y;
    ch.arrived = false;
    ch.speedMul = speedMul;
    ch.path = [];
    ch.routeT = 0;
  }

  clear(): void {
    this.list.length = 0;
  }

  step(dt: number): void {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ch = this.list[i];
      const v = ch.v;
      ch.age += dt;
      if (!g.vehicles.includes(v)) {
        this.list.splice(i, 1);
        continue;
      }
      if (v.exploded || v.sunk) {
        // nobody walks away from that
        for (const c of ch.inCar) {
          if (v.driver === c) v.driver = null;
          c.vehicle = null;
          g.removeChar(c);
        }
        ch.inCar = [];
        ch.mode = 'out';
      }
      // somebody else took the wheel (the player jacked it): everybody out
      if (ch.mode !== 'out' && ch.crew.length && v.driver !== ch.crew[0]) {
        this.bail(ch, false);
        continue;
      }
      if (ch.mode === 'out') {
        if (v.ai === ch) v.ai = null;
        this.list.splice(i, 1);
        continue;
      }
      if (v.dead || v.burning > 0 || !v.drivable || v.health < v.maxHealth * ch.bailAt) {
        this.bail(ch, true);
        continue;
      }
      this.drive(ch, dt);
      // wedged somewhere for a long time: the crew gives up and gets out
      const busy = ch.mode === 'goto' ? !ch.arrived : ch.mode === 'chase' || ch.mode === 'follow';
      if (busy && v.speed < 1.2) ch.slowT += dt;
      else ch.slowT = Math.max(0, ch.slowT - dt * 2);
      if (ch.slowT > 7) this.bail(ch, false);
    }
  }

  private targetPos(ch: Chaser): { x: number; y: number; inCar: boolean } | null {
    const t = ch.target;
    if (!t || t.dead) return null;
    const pl = this.g.player;
    if (t === pl.char) return { x: pl.x, y: pl.y, inCar: pl.inVehicle };
    if (t.vehicle) return { x: t.vehicle.x, y: t.vehicle.y, inCar: true };
    return { x: t.x, y: t.y, inCar: false };
  }

  private drive(ch: Chaser, dt: number): void {
    const v = ch.v;
    const d = this.driver;
    if (d.reversing(ch, v, dt)) return;
    switch (ch.mode) {
      case 'hold':
        d.hold(v);
        return;
      case 'goto': {
        const dist = Math.hypot(ch.dx - v.x, ch.dy - v.y);
        if (dist < 7) {
          ch.arrived = true;
          d.hold(v);
          return;
        }
        if (dist < 20 || !d.route(ch, v, ch.dx, ch.dy, dt, ch.speedMul, true)) d.chaseTo(ch, v, ch.dx, ch.dy, dt, 9 * ch.speedMul + 3);
        break;
      }
      case 'follow': {
        const L = ch.lead;
        if (!L || L.dead) {
          d.hold(v);
          return;
        }
        const back = L.localToWorld(-L.def.length / 2 - 7, 0);
        const dist = Math.hypot(back.x - v.x, back.y - v.y);
        if (dist > 45) {
          if (!d.route(ch, v, back.x, back.y, dt, 1.1)) d.chaseTo(ch, v, back.x, back.y, dt);
        } else {
          d.chaseTo(ch, v, back.x, back.y, dt, L.speed + clamp(dist - 4, -4, 8));
          if (dist < 3) {
            v.throttle = 0;
            v.brake = 0.6;
          }
        }
        break;
      }
      case 'chase': {
        const tp = this.targetPos(ch);
        if (!tp) {
          d.hold(v);
          return;
        }
        const dist = Math.hypot(tp.x - v.x, tp.y - v.y);
        if (!tp.inCar && dist < 16) {
          // target on foot right here: stop and pile out
          d.hold(v);
          if (v.speed < 2.5) this.bail(ch, false);
          return;
        }
        d.updateGoal(ch, tp.x, tp.y, dt);
        // close (or the target left the roads): straight at it; otherwise follow the lanes
        ch.losT -= dt;
        if (ch.losT <= 0) {
          ch.losT = 0.3;
          ch.sees = dist < 60 && this.g.combat.los(v.x, v.y, tp.x, tp.y);
        }
        const tv = ch.target === this.g.player.char ? this.g.player.vehicle : ch.target?.vehicle ?? null;
        if (dist < 26 || (ch.sees && dist < 45) || (dist < 90 && ch.offroad > 15)) {
          let ax = tp.x;
          let ay = tp.y;
          const pv = this.g.player.vehicle;
          if (ch.target === this.g.player.char && pv && ch.ram) {
            const vel = pv.body.getLinearVelocity();
            const lead = clamp(dist / 22, 0, 1.1);
            ax += vel.x * lead;
            ay += vel.y * lead;
          }
          // drive-by crews keep some distance alongside instead of ramming; a target on foot is
          // approached slowly (they pile out, they don't mow people down on arrival)
          const cap = !tp.inCar ? Math.max(3, (dist - 12) * 0.6) : !ch.ram && dist < 12 ? Math.max(4, (pv?.speed ?? 0) + 1) : Infinity;
          d.chaseTo(ch, v, ax, ay, dt, cap, tv);
        } else {
          // far behind: drive harder to catch up (GTA-style rubber band)
          const catchUp = 1 + clamp((dist - 35) / 70, 0, 0.9);
          if (!d.route(ch, v, ch.gx, ch.gy, dt, ch.speedMul * catchUp)) d.chaseTo(ch, v, tp.x, tp.y, dt);
        }
        if (ch.driveBy) this.shoot(ch, tp.x, tp.y, dist, dt);
        break;
      }
    }
    d.checkStuck(ch, v, dt);
  }

  /** passengers (or a lone driver) shoot out of the windows */
  private shoot(ch: Chaser, tx: number, ty: number, dist: number, dt: number): void {
    ch.shootT -= dt;
    if (ch.shootT > 0 || dist > 26 || dist < 2) return;
    const g = this.g;
    const v = ch.v;
    const shooters = ch.inCar.length > 1 ? ch.inCar.slice(1) : ch.inCar;
    const c = shooters[this.rng.int(0, shooters.length - 1)];
    const wid = c?.arsenal?.driveByWeapon();
    if (!c || !wid) {
      ch.shootT = 2;
      return;
    }
    const def = WEAPONS[wid];
    const ang0 = Math.atan2(ty - v.y, tx - v.x);
    const local = ang0 - v.angle;
    const side = Math.sin(local) >= 0 ? 1 : -1;
    const fwd = Math.cos(local);
    const m = v.localToWorld(0.2 + fwd * 0.6, side * (v.def.width / 2 + 0.25));
    if (!g.combat.los(m.x, m.y, tx, ty)) {
      ch.shootT = 0.4;
      return;
    }
    const ang = Math.atan2(ty - m.y, tx - m.x);
    g.combat.fireGun(c, wid, m.x, m.y, ang, ch.accuracy, v);
    // short bursts with pauses (a lone driver shoots less)
    ch.shootT = def.interval * (def.id === 'smg' ? 1.3 : 1.8) + (this.rng.chance(0.25) ? this.rng.range(0.8, 1.6) : 0) + (shooters === ch.inCar ? 0.6 : 0);
  }

  /** everybody out: hostile crews attack on foot, others run */
  bail(ch: Chaser, hurry: boolean): void {
    const g = this.g;
    const v = ch.v;
    ch.mode = 'out';
    if (v.ai === ch) v.ai = null;
    v.throttle = 0;
    v.steerIn = 0;
    v.brake = v.dead ? 0 : 1;
    const hw = v.def.width / 2;
    let k = 0;
    for (const c of ch.inCar) {
      if (c.dead) continue;
      if (v.driver === c) v.driver = null;
      const side = k % 2 === 0 ? 1 : -1;
      const lx = (k >> 1) === 0 ? v.def.length * 0.08 : -v.def.length * 0.22;
      const p = v.localToWorld(lx, side * (hw + 0.6));
      c.vehicle = null;
      // (a driver the player pulled out is already standing next to the car)
      if (c.hidden) {
        c.showAt(p.x, p.y, v.angle + side * Math.PI / 2);
        if (hurry && v.speed > 6) c.knockDown(0, 0, 0.8);
      }
      c.role = ch.role;
      const target = ch.target && !ch.target.dead ? ch.target : g.player.char;
      const own = c.arsenal?.def;
      g.npcs.add(c, {
        mode: ch.hostile ? 'attack' : 'flee',
        target,
        weapon: own && own.id !== 'fists' ? own.id : ch.weapon,
        accuracy: ch.accuracy,
        fleeAt: 0.25,
        gang: ch.gang,
        health: ch.crewHealth || undefined,
      });
      k++;
    }
    ch.inCar = [];
  }

  /** the mission is over: these cars stop being chasers (their crews get removed separately) */
  forget(vehicles: Vehicle[]): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ch = this.list[i];
      if (!vehicles.includes(ch.v)) continue;
      const v = ch.v;
      if (v.ai === ch) v.ai = null;
      if (v.driver && ch.crew.includes(v.driver as Character)) v.driver = null;
      v.throttle = 0;
      v.steerIn = 0;
      v.brake = 1;
      this.list.splice(i, 1);
    }
  }

  isChaser(v: Vehicle): Chaser | null {
    const ai = v.ai as { kind?: string } | null;
    return ai && ai.kind === 'chaser' ? (ai as Chaser) : null;
  }
}
