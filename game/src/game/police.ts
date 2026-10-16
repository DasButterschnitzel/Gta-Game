// Police: patrol cars, pursuits (lane routing far away, direct chase and ramming up close),
// officers on foot (arrest / shoot), roadblocks with spike strips, SEK / BKA / BSE-9 escalation
// and the helicopter.
import type { Game } from './game';
import type { Vehicle } from './vehicle';
import { Character, LOOKS, RUN_SPEED, WALK_SPEED, zivilLook } from './character';
import { Arsenal, type WeaponId } from './weapons';
import { findRoute, walkAhead, findFootPath, walkableLine } from '../world/route';
import { projectOnEdge } from './traffic';
import { RNG } from '../core/rng';
import { clamp, angleDiff } from '../core/math';
import { CAT_STATIC, CAT_BARRIER } from '../physics/physics';
import { TILE, Turn } from '../world/types';
import type { Blip } from '../ui/hud';

export type UnitKind = 'polizei' | 'sek' | 'zivil' | 'bse';
type UnitMode = 'patrol' | 'pursue' | 'stopped' | 'disabled' | 'block' | 'leave';

export interface Unit {
  id: number;
  kind: UnitKind;
  v: Vehicle;
  crew: Character[];
  inCar: Character[];
  mode: UnitMode;
  edge: number;
  s: number;
  path: number[];
  routeT: number;
  stuckT: number;
  reverseT: number;
  reverseSteer: number;
  sees: boolean;
  lostT: number;
  age: number;
  /** already counted as a takedown */
  counted: boolean;
  /** closest road point to the target (re-evaluated periodically) */
  gx: number;
  gy: number;
  offroad: number;
  goalT: number;
  /** local planner cache */
  planT: number;
  planHeading: number;
  planFree: number;
}

export interface OfficerAI {
  kind: 'cop';
  unit: Unit | null;
  mode: 'chase' | 'return' | 'guard' | 'leave';
  burstT: number;
  arrestT: number;
  sideT: number;
  sideDir: number;
  stuckT: number;
  accuracy: number;
  hx: number;
  hy: number;
  losT: number;
  los: boolean;
  path: { x: number; y: number }[] | null;
  pathT: number;
}

export interface SpikeStrip {
  x: number;
  y: number;
  /** direction along the strip */
  a: number;
  len: number;
  life: number;
}

export interface Heli {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  angle: number;
  rotor: number;
  orbit: number;
  leaving: boolean;
  /** searchlight spot on the ground */
  lx: number;
  ly: number;
}

const CREW: Record<UnitKind, number> = { polizei: 2, sek: 4, zivil: 2, bse: 3 };
const ACCURACY: Record<UnitKind, number> = { polizei: 0.5, zivil: 0.6, sek: 0.72, bse: 0.82 };
const SIGHT_CAR = 48;
const SIGHT_FOOT = 30;
const SIGHT_HELI = 85;
const tmp = { x: 0, y: 0, h: 0 };

export class PoliceSystem {
  readonly units: Unit[] = [];
  readonly officers: Character[] = [];
  readonly spikes: SpikeStrip[] = [];
  heli: Heli | null = null;
  /** somebody from the police currently sees the player */
  seen = false;
  enabled = true;
  private rng = new RNG(110);
  private nextId = 1;
  private dispatchT = 1.2;
  private blockT = 8;
  private losT = 0;
  private patrolT = 4;

  constructor(private g: Game) {}

  private get level(): number {
    return this.g.wanted.level;
  }

  // ------------------------------------------------------------------------------------
  // spawning
  private crewLook(kind: UnitKind): import('../render/charSprites').CharLook {
    switch (kind) {
      case 'sek':
        return LOOKS.sek;
      case 'bse':
        return LOOKS.bse;
      case 'zivil':
        return zivilLook(this.rng);
      default:
        return LOOKS.cop;
    }
  }

  private crewWeapon(kind: UnitKind, level: number): WeaponId | null {
    switch (kind) {
      case 'polizei':
        return level >= 2 ? 'pistol' : null;
      case 'zivil':
        return level >= 5 ? 'smg' : 'pistol';
      case 'sek':
        return level >= 6 ? 'rifle' : 'smg';
      case 'bse':
        return 'rifle';
    }
  }

  private arm(c: Character, kind: UnitKind): void {
    const w = this.crewWeapon(kind, this.level);
    if (!c.arsenal) c.arsenal = new Arsenal();
    if (w && !c.arsenal.has(w)) c.arsenal.give(w, 9999, true);
  }

  spawnUnit(kind: UnitKind, x: number, y: number, angle: number, mode: UnitMode): Unit {
    const g = this.g;
    const v = g.spawnVehicle(kind, x, y, angle);
    v.lightsOn = true;
    v.sirenOn = mode === 'pursue' || mode === 'block';
    const crew: Character[] = [];
    for (let i = 0; i < CREW[kind]; i++) {
      const c = g.spawnChar(x, y, this.crewLook(kind), 'cop');
      c.hide();
      c.vehicle = v;
      c.state = 'driving';
      c.arsenal = new Arsenal();
      this.arm(c, kind);
      if (kind === 'sek' || kind === 'bse') c.armor = 60;
      crew.push(c);
    }
    v.driver = crew[0];
    const u: Unit = { id: this.nextId++, kind, v, crew, inCar: crew.slice(), mode, edge: -1, s: 0, path: [], routeT: 0, stuckT: 0, reverseT: 0, reverseSteer: 0, sees: false, lostT: 0, age: 0, counted: false, gx: x, gy: y, offroad: 0, goalT: 0, planT: 0, planHeading: angle, planFree: 1 };
    if (mode !== 'patrol') v.ai = u;
    this.units.push(u);
    return u;
  }

  private findSpawn(px: number, py: number, rMin: number, rMax: number, toward: boolean): { edge: number; s: number; x: number; y: number; h: number } | null {
    const g = this.g;
    const city = g.city;
    const pv = g.player.vehicle;
    const pvel = pv ? pv.body.getLinearVelocity() : null;
    const moving = !!pvel && Math.hypot(pvel.x, pvel.y) > 6;
    for (let attempt = 0; attempt < 12; attempt++) {
      // when the player is driving, most units come from ahead to cut them off
      const ang = moving && attempt < 8 && this.rng.chance(0.7) ? Math.atan2(pvel!.y, pvel!.x) + this.rng.range(-1.1, 1.1) : this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(rMin, rMax);
      const hit = city.nearestLane(px + Math.cos(ang) * r, py + Math.sin(ang) * r, 30, undefined, Math.PI, true);
      if (!hit) continue;
      const e = city.lanes[hit.edge];
      if (e.len < 10) continue;
      const s = clamp(hit.s, 2, e.len - 4);
      city.lanePoint(e, s, tmp);
      if (g.isVisible(tmp.x, tmp.y, 8)) continue;
      if (city.zoneAt(tmp.x, tmp.y) !== city.zoneAt(px, py)) continue;
      let blocked = false;
      for (const v of g.vehicles) {
        if (Math.abs(v.x - tmp.x) < 9 && Math.abs(v.y - tmp.y) < 9) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (toward && attempt < 8) {
        const dirToP = Math.atan2(py - tmp.y, px - tmp.x);
        if (Math.abs(angleDiff(tmp.h, dirToP)) > 2.0) continue;
      }
      return { edge: hit.edge, s, x: tmp.x, y: tmp.y, h: tmp.h };
    }
    return null;
  }

  private pickKind(lvl: number): UnitKind {
    const r = this.rng.next();
    if (lvl >= 6) return r < 0.4 ? 'bse' : r < 0.7 ? 'sek' : 'zivil';
    if (lvl >= 5) return r < 0.4 ? 'polizei' : r < 0.7 ? 'zivil' : 'sek';
    if (lvl >= 4) return r < 0.6 ? 'polizei' : 'sek';
    return 'polizei';
  }

  private dispatch(px: number, py: number, lvl: number): void {
    const kind = this.pickKind(lvl);
    // during a search the units head for the last known position
    const sp = this.findSpawn(px, py, 70, 130, true);
    if (!sp) return;
    const u = this.spawnUnit(kind, sp.x, sp.y, sp.h, 'pursue');
    u.edge = sp.edge;
    u.s = sp.s;
    u.v.body.setLinearVelocity({ x: Math.cos(sp.h) * 9, y: Math.sin(sp.h) * 9 });
  }

  private spawnPatrol(px: number, py: number): void {
    const sp = this.findSpawn(px, py, 90, 170, false);
    if (!sp) return;
    const u = this.spawnUnit('polizei', sp.x, sp.y, sp.h, 'patrol');
    this.g.traffic.attach(u.v, sp.edge, sp.s);
    u.v.body.setLinearVelocity({ x: Math.cos(sp.h) * 6, y: Math.sin(sp.h) * 6 });
  }

  /** a patrol (or leaving) unit joins the pursuit */
  private pursue(u: Unit): void {
    if (u.mode === 'disabled' || u.mode === 'block') return;
    const v = u.v;
    if (u.inCar.length === 0) return;
    u.mode = 'pursue';
    v.ai = u;
    v.sirenOn = true;
    const hit = this.g.city.nearestLane(v.x, v.y, 14, v.angle, Math.PI * 0.5, false);
    u.edge = hit ? hit.edge : -1;
    u.s = hit ? hit.s : 0;
    u.path = [];
    u.routeT = 0;
    for (const c of u.crew) this.arm(c, u.kind);
  }

  /** patrols near a reported crime respond */
  alert(x: number, y: number): void {
    for (const u of this.units) {
      if (u.mode !== 'patrol' && u.mode !== 'leave') continue;
      if (Math.hypot(u.v.x - x, u.v.y - y) < 160) this.pursue(u);
    }
  }

  /** wanted level dropped to zero: everybody goes home */
  private leave(u: Unit): void {
    if (u.mode === 'disabled' || u.mode === 'block' || u.mode === 'patrol' || u.mode === 'leave') return;
    u.v.sirenOn = false;
    const alive = u.crew.filter((c) => !c.dead && !c.removeMe);
    if (alive.length && alive.every((c) => c.hidden)) this.handToTraffic(u);
    else u.mode = 'stopped';
  }

  private handToTraffic(u: Unit): void {
    const v = u.v;
    const city = this.g.city;
    const hit = city.nearestLane(v.x, v.y, 16, v.angle, Math.PI * 0.6, false) ?? city.nearestLane(v.x, v.y, 30, undefined, Math.PI, false);
    u.mode = 'leave';
    v.sirenOn = false;
    if (!v.driver && u.inCar.length) v.driver = u.inCar[0];
    if (hit) this.g.traffic.attach(v, hit.edge, hit.s);
  }

  // ------------------------------------------------------------------------------------
  // per-frame management
  manage(dt: number): void {
    if (!this.enabled) return;
    const g = this.g;
    const px = g.player.x;
    const py = g.player.y;
    const lvl = this.level;
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.2;
      this.updateSight(px, py);
    }
    const active = this.units.filter((u) => u.mode === 'pursue' || u.mode === 'stopped').length;
    const want = [0, 2, 3, 4, 5, 5, 6][lvl];
    this.dispatchT -= dt;
    if (lvl > 0 && active < want && this.dispatchT <= 0) {
      this.dispatchT = lvl >= 3 ? 1.6 : 2.4;
      const patrol = this.units.find((u) => (u.mode === 'patrol' || u.mode === 'leave') && u.inCar.length > 0 && Math.hypot(u.v.x - px, u.v.y - py) < 170);
      if (patrol) this.pursue(patrol);
      else this.dispatch(px, py, lvl);
    }
    if (lvl >= 3) {
      this.blockT -= dt;
      if (this.blockT <= 0) {
        this.blockT = lvl >= 5 ? 16 : 24;
        this.tryRoadblock(lvl);
      }
    } else this.blockT = Math.max(this.blockT, 6);
    if (lvl >= 4 && (!this.heli || this.heli.leaving)) {
      if (!this.heli) this.spawnHeli(px, py);
      else this.heli.leaving = false;
    }
    if (this.heli && lvl < 4) this.heli.leaving = true;
    if (lvl === 0) {
      this.patrolT -= dt;
      if (this.patrolT <= 0) {
        this.patrolT = 4;
        if (this.units.filter((u) => u.mode === 'patrol').length < 2) this.spawnPatrol(px, py);
      }
      for (const u of this.units) this.leave(u);
    }
    this.cleanup(px, py);
  }

  private updateSight(px: number, py: number): void {
    const g = this.g;
    let seen = false;
    for (const u of this.units) {
      u.sees = false;
      if (u.mode === 'disabled' || u.inCar.length === 0) continue;
      const d = Math.hypot(u.v.x - px, u.v.y - py);
      if (d < SIGHT_CAR && g.combat.los(u.v.x, u.v.y, px, py)) {
        u.sees = true;
        if (u.mode !== 'leave' && u.mode !== 'patrol') seen = true;
      }
    }
    for (const c of this.officers) {
      if (c.dead || c.isDown || c.hidden) continue;
      const ai = c.ai as OfficerAI | null;
      if (ai?.mode === 'leave') continue;
      if (Math.hypot(c.x - px, c.y - py) < SIGHT_FOOT && g.combat.los(c.x, c.y, px, py)) seen = true;
    }
    if (this.heli && !this.heli.leaving && Math.hypot(this.heli.x - px, this.heli.y - py) < SIGHT_HELI) seen = true;
    this.seen = seen;
    if (this.level > 0) {
      for (const u of this.units) if ((u.mode === 'patrol' || u.mode === 'leave') && u.sees) this.pursue(u);
      if (seen) for (const u of this.units) if (u.mode === 'patrol' && Math.hypot(u.v.x - px, u.v.y - py) < 120) this.pursue(u);
    }
  }

  /** does any police unit see the point (crime witnessing)? */
  isWitnessed(x: number, y: number): boolean {
    const g = this.g;
    for (const u of this.units) {
      if (u.mode === 'disabled' || u.inCar.length === 0) continue;
      const d = Math.hypot(u.v.x - x, u.v.y - y);
      if (d < SIGHT_CAR && g.combat.los(u.v.x, u.v.y, x, y)) return true;
    }
    for (const c of this.officers) {
      if (c.dead || c.isDown || c.hidden) continue;
      if (Math.hypot(c.x - x, c.y - y) < SIGHT_FOOT && g.combat.los(c.x, c.y, x, y)) return true;
    }
    if (this.heli && !this.heli.leaving && Math.hypot(this.heli.x - x, this.heli.y - y) < SIGHT_HELI) return true;
    return false;
  }

  isPoliceVehicle(v: Vehicle): Unit | null {
    for (const u of this.units) if (u.v === v) return u;
    return null;
  }

  private cleanup(px: number, py: number): void {
    const g = this.g;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = u.v;
      const gone = !g.vehicles.includes(v);
      const stolen = v.driver === g.player.char;
      const d = Math.hypot(v.x - px, v.y - py);
      const visible = !gone && g.isVisible(v.x, v.y, 10);
      let remove = gone || stolen;
      if (!remove && !visible) {
        if (u.mode === 'disabled' && d > 90) remove = true;
        else if (u.mode === 'block' && d > 170) remove = true;
        else if (u.mode === 'stopped' && this.level === 0 && d > 120) remove = true;
        else if (d > 240) remove = true;
      }
      if (remove) this.removeUnit(u, gone || stolen);
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const c = this.officers[i];
      if (c.removeMe || !g.chars.includes(c) || c.hidden) {
        this.officers.splice(i, 1);
        if (c.removeMe) g.removeChar(c);
        continue;
      }
      const d = Math.hypot(c.x - px, c.y - py);
      if (!g.isVisible(c.x, c.y, 6) && (d > 130 || (c.dead && c.deadT > 25) || ((c.ai as OfficerAI).mode === 'leave' && d > 60))) {
        this.officers.splice(i, 1);
        this.forgetCrew(c);
        g.removeChar(c);
      }
    }
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.life -= 0.016;
      if (s.life <= 0 || (Math.hypot(s.x - px, s.y - py) > 170 && !g.isVisible(s.x, s.y, 6))) this.spikes.splice(i, 1);
    }
  }

  private forgetCrew(c: Character): void {
    for (const u of this.units) {
      const i = u.crew.indexOf(c);
      if (i >= 0) u.crew.splice(i, 1);
    }
  }

  private removeUnit(u: Unit, vehicleGone: boolean): void {
    const g = this.g;
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    for (const c of u.crew) {
      if (c.hidden) {
        if (c === u.v.driver) u.v.driver = null;
        g.removeChar(c);
      } else {
        const ai = c.ai as OfficerAI | null;
        if (ai) {
          ai.unit = null;
          if (ai.mode === 'return') ai.mode = this.level > 0 ? 'chase' : 'leave';
        }
      }
    }
    if (!vehicleGone) {
      if (u.v.ai === u) u.v.ai = null;
      g.removeVehicle(u.v);
    } else if (u.v.ai === u) u.v.ai = null;
  }

  /** the player took a police car: throw the remaining crew out */
  onVehicleStolen(v: Vehicle): void {
    const u = this.isPoliceVehicle(v);
    if (!u) return;
    const stay = u.inCar.filter((c) => c !== v.driver && c.hidden);
    u.inCar = stay;
    if (stay.length) this.deploy(u, 'chase');
    u.inCar = [];
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    for (const c of u.crew) {
      const ai = c.ai as OfficerAI | null;
      if (ai && ai.kind === 'cop') ai.unit = null;
    }
    v.sirenOn = false;
  }

  clearAll(): void {
    const g = this.g;
    for (const u of [...this.units]) this.removeUnit(u, !g.vehicles.includes(u.v) || u.v.driver === g.player.char);
    for (const c of this.officers) g.removeChar(c);
    this.officers.length = 0;
    this.spikes.length = 0;
    this.heli = null;
    this.seen = false;
  }

  // ------------------------------------------------------------------------------------
  // fixed step
  step(dt: number): void {
    if (!this.enabled) return;
    for (const u of this.units) {
      u.age += dt;
      this.checkTakedown(u);
      if (u.mode === 'pursue') this.drivePursuit(u, dt);
      else if (u.mode === 'stopped' || u.mode === 'disabled' || u.mode === 'block') this.hold(u);
    }
    for (const c of this.officers) this.officerStep(c, dt);
    this.spikeStep();
    if (this.heli) this.heliStep(dt);
  }

  private checkTakedown(u: Unit): void {
    if (u.mode === 'disabled' || u.mode === 'patrol' || u.mode === 'leave') return;
    const v = u.v;
    if (!(v.dead || v.burning > 0 || v.sunk || v.health < v.maxHealth * 0.42)) return;
    u.mode = 'disabled';
    v.sirenOn = false;
    v.throttle = 0;
    if (v.dead || v.sunk) {
      for (const c of u.inCar) {
        if (c === v.driver) v.driver = null;
        this.g.removeChar(c);
        const k = u.crew.indexOf(c);
        if (k >= 0) u.crew.splice(k, 1);
      }
      u.inCar = [];
    } else if (u.inCar.length) {
      this.deploy(u, this.level > 0 ? 'chase' : 'leave');
    }
    // only wrecks the player caused count as takedowns
    if (this.level > 0 && !u.counted && v.lastHitBy === this.g.player.char && Math.hypot(v.x - this.g.player.x, v.y - this.g.player.y) < 120) {
      u.counted = true;
      this.g.onTakedown(v);
    }
  }

  private hold(u: Unit): void {
    const v = u.v;
    v.steerIn = 0;
    v.throttle = 0;
    if (v.forwardSpeed > 1) {
      v.brake = 1;
      v.handbrake = false;
    } else {
      v.brake = 0;
      v.handbrake = true;
    }
  }

  // ------------------------------------------------------------------------------------
  // pursuit driving
  private drivePursuit(u: Unit, dt: number): void {
    const g = this.g;
    const v = u.v;
    if (u.inCar.length === 0 || !v.drivable) {
      this.hold(u);
      return;
    }
    const w = g.wanted;
    const tx = w.searching ? w.lastKnownX : g.player.x;
    const ty = w.searching ? w.lastKnownY : g.player.y;
    const dist = Math.hypot(tx - v.x, ty - v.y);
    v.sirenOn = true;
    v.lightsOn = true;
    if (u.reverseT > 0) {
      u.reverseT -= dt;
      v.throttle = 0;
      v.brake = 1;
      v.handbrake = false;
      v.steerIn = u.reverseSteer;
      return;
    }
    // the target may be off the road network (parks, courtyards): aim for the closest road point
    u.goalT -= dt;
    if (u.goalT <= 0) {
      u.goalT = 1.2;
      const h = g.city.nearestLane(tx, ty, 160, undefined, Math.PI, false);
      u.gx = h ? h.px : tx;
      u.gy = h ? h.py : ty;
      u.offroad = h ? h.dist : 999;
    }
    const toGoal = Math.hypot(u.gx - v.x, u.gy - v.y);
    const pv = g.player.vehicle;
    if (w.searching && dist < 12) {
      // reached the last known position: cruise around it
      this.route(u, tx + Math.cos(u.age * 0.3) * 60, ty + Math.sin(u.age * 0.3) * 60, dt, 0.8);
    } else if ((dist < 55 && (u.sees || dist < 25)) || (dist < 90 && u.offroad > 15 && toGoal < 22)) this.chase(u, tx, ty, dist);
    else this.route(u, u.gx, u.gy, dt, 1);
    // a target on foot the car can't reach: send the crew
    if (!pv && dist < 50 && !w.searching && (u.stuckT > 0.8 || (toGoal < 20 && u.offroad > 12 && v.speed < 4))) {
      this.deploy(u, 'chase');
      return;
    }
    // stuck: back out
    if (v.throttle > 0.4 && v.speed < 1.2) {
      u.stuckT += dt;
      if (u.stuckT > 1.3) {
        u.stuckT = 0;
        u.reverseT = 1.1;
        u.reverseSteer = v.steerIn > 0 ? -1 : 1;
      }
    } else u.stuckT = Math.max(0, u.stuckT - dt);
  }

  /** left/right feelers against walls; returns a steering bias */
  private whiskers(v: Vehicle): number {
    const g = this.g;
    const c = Math.cos(v.angle);
    const s = Math.sin(v.angle);
    const fx = v.x + c * v.def.length * 0.5;
    const fy = v.y + s * v.def.length * 0.5;
    const L = 4 + v.speed * 0.75;
    const probe = (da: number): number => {
      const a = v.angle + da;
      const hit = g.combat.ray(fx, fy, fx + Math.cos(a) * L, fy + Math.sin(a) * L, v, null, CAT_STATIC | CAT_BARRIER);
      return hit ? 1 - hit.frac : 0;
    };
    const l = probe(0.42);
    const r = probe(-0.42);
    const m = probe(0);
    let bias = (r - l) * 1.1;
    if (m > 0.3) bias += (l <= r ? 1 : -1) * m * 0.9;
    return bias;
  }

  /**
   * Local planner: probe headings around the desired one (two parallel rays per heading so the
   * whole car width is checked) and pick the clearest that still points towards the target.
   */
  private plan(u: Unit, desired: number, dt: number): void {
    u.planT -= dt;
    if (u.planT > 0) return;
    u.planT = 0.1;
    const g = this.g;
    const v = u.v;
    const L = 7 + v.speed * 0.9;
    const half = v.def.width / 2 + 0.25;
    const fx = v.x + Math.cos(v.angle) * v.def.length * 0.35;
    const fy = v.y + Math.sin(v.angle) * v.def.length * 0.35;
    let best = desired;
    let bestScore = -Infinity;
    let bestFree = 1;
    for (let k = -5; k <= 5; k++) {
      const a = desired + k * 0.24;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let free = 1;
      for (const side of [-1, 1]) {
        const ox = fx - s * half * side;
        const oy = fy + c * half * side;
        const hit = g.combat.ray(ox, oy, ox + c * L, oy + s * L, v, null, CAT_STATIC | CAT_BARRIER);
        if (hit) free = Math.min(free, hit.frac);
      }
      // turning far away from the current heading costs a little, pointing away from the target a lot
      const score = free * 1.2 - Math.abs(k) * 0.07 - Math.abs(angleDiff(v.angle, a)) * 0.05 - (free < 0.3 ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = a;
        bestFree = free;
      }
    }
    u.planHeading = best;
    u.planFree = bestFree;
  }

  private chase(u: Unit, tx: number, ty: number, dist: number): void {
    const g = this.g;
    const v = u.v;
    const pv = g.player.vehicle;
    let ax = tx;
    let ay = ty;
    if (pv && !g.wanted.searching) {
      const vel = pv.body.getLinearVelocity();
      const lead = clamp(dist / 22, 0, 1.1);
      ax += vel.x * lead;
      ay += vel.y * lead;
    }
    const want = Math.atan2(ay - v.y, ax - v.x);
    this.plan(u, want, 1 / 60);
    const err = angleDiff(v.angle, u.planHeading);
    const steer = clamp(err * 2.4, -1, 1);
    let throttle = u.planFree < 0.45 ? 0.55 : 1;
    let brake = 0;
    let hb = false;
    const sp = v.speed;
    if (Math.abs(err) > 1.6 && sp > 6) {
      throttle = 0.3;
      hb = true;
    } else if (Math.abs(err) > 0.9 && sp > 17) {
      throttle = 0;
      brake = 0.7;
    }
    if (!pv && dist < 14) {
      throttle = 0;
      brake = v.forwardSpeed > 1 ? 1 : 0;
      hb = v.forwardSpeed <= 1;
      if (sp < 2.2) this.deploy(u, 'chase');
    } else if (pv && pv.speed < 1.5 && dist < 9) {
      throttle = 0;
      brake = v.forwardSpeed > 1 ? 1 : 0;
      hb = v.forwardSpeed <= 1;
      if (sp < 1.6) this.deploy(u, 'chase');
    }
    v.steerIn = steer;
    v.throttle = throttle;
    v.brake = brake;
    v.handbrake = hb;
  }

  private lookAhead(u: Unit, dist: number, out: { x: number; y: number; h: number }): void {
    const lanes = this.g.city.lanes;
    let e = lanes[u.edge];
    let s = u.s + dist;
    let i = 0;
    while (s > e.len && i < u.path.length) {
      s -= e.len;
      e = lanes[u.path[i++]];
    }
    this.g.city.lanePoint(e, Math.min(s, e.len), out);
  }

  private route(u: Unit, tx: number, ty: number, dt: number, speedMul: number): void {
    const g = this.g;
    const city = g.city;
    const v = u.v;
    if (u.edge < 0) {
      const hit = city.nearestLane(v.x, v.y, 14, v.angle, Math.PI * 0.6, false) ?? city.nearestLane(v.x, v.y, 30, undefined, Math.PI, false);
      if (!hit) {
        this.chase(u, tx, ty, Math.hypot(tx - v.x, ty - v.y));
        return;
      }
      u.edge = hit.edge;
      u.s = hit.s;
      u.path = [];
      u.routeT = 0;
    }
    let e = city.lanes[u.edge];
    const proj = projectOnEdge(e, v.x, v.y, u.s);
    u.s = proj.s;
    if (proj.dist > 8) {
      u.lostT += dt;
      if (u.lostT > 0.8) {
        u.lostT = 0;
        u.edge = -1;
        return;
      }
    } else u.lostT = 0;
    while (u.s >= e.len - 0.3 && u.path.length) {
      u.s -= e.len;
      u.edge = u.path.shift()!;
      e = city.lanes[u.edge];
    }
    u.routeT -= dt;
    if (u.routeT <= 0 || u.path.length === 0) {
      u.routeT = 2.5;
      const r = findRoute(city, u.edge, tx, ty, 26, 2500);
      if (!r || !r.length) {
        this.chase(u, tx, ty, Math.hypot(tx - v.x, ty - v.y));
        return;
      }
      u.path = r;
    }
    const speed = v.speed;
    const Ld = clamp(5 + speed * 0.6, 6, 26);
    this.lookAhead(u, Ld, tmp);
    const dx = tmp.x - v.x;
    const dy = tmp.y - v.y;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const alpha = Math.atan2(ly, Math.max(0.5, lx));
    const kappa = (2 * Math.sin(alpha)) / Math.max(4, Math.hypot(lx, ly));
    const delta = Math.atan(kappa * v.def.wheelbase);
    const steer = clamp(clamp(delta / Math.max(0.05, v.maxSteerAt(speed)), -1, 1) + this.whiskers(v) * 0.6, -1, 1);
    let target = Math.max(e.speed * 1.55, 16) * speedMul;
    let distAhead = e.len - u.s;
    for (let i = 0; i < u.path.length && distAhead < 50; i++) {
      const ne = city.lanes[u.path[i]];
      if (ne.turn === Turn.Left || ne.turn === Turn.Right) target = Math.min(target, 11 + distAhead * 0.45);
      else if (ne.turn === Turn.UTurn) target = Math.min(target, 6 + distAhead * 0.4);
      distAhead += ne.len;
    }
    // brake for cars right in front (police push through, but don't plough into a queue)
    const range = 6 + speed * 0.8;
    for (const o of g.vehicles) {
      if (o === v || o.dead || o === g.player.vehicle) continue;
      const ox = o.x - v.x;
      const oy = o.y - v.y;
      if (Math.abs(ox) > range + 6 || Math.abs(oy) > range + 6) continue;
      const fx = ox * ca + oy * sa;
      const fy = -ox * sa + oy * ca;
      if (fx > 0 && fx < range && Math.abs(fy) < v.def.width / 2 + o.def.width / 2 + 0.3) {
        const gap = fx - v.def.length / 2 - o.def.length / 2;
        target = Math.min(target, Math.max(4, gap * 1.6));
      }
    }
    const err = target - v.forwardSpeed;
    v.throttle = err > 0 ? clamp(err * 0.5 + 0.2, 0, 1) : 0;
    v.brake = err < -1.5 ? clamp(-err * 0.3, 0, 1) : 0;
    v.handbrake = false;
    v.steerIn = steer;
  }

  // ------------------------------------------------------------------------------------
  // officers on foot
  private deploy(u: Unit, mode: OfficerAI['mode']): void {
    const g = this.g;
    const v = u.v;
    let i = 0;
    for (const c of u.inCar) {
      if (c.dead) continue;
      const side = i % 2 === 0 ? 1 : -1;
      const lx = 0.4 - Math.floor(i / 2) * 1.5;
      let p = v.localToWorld(lx, side * (v.def.width / 2 + 0.6));
      if (!g.isFreeSpot(p.x, p.y, 0.35)) {
        p = v.localToWorld(lx, -side * (v.def.width / 2 + 0.6));
        if (!g.isFreeSpot(p.x, p.y, 0.35)) p = v.localToWorld(-v.def.length / 2 - 0.9, 0);
      }
      c.showAt(p.x, p.y, v.angle + (side * Math.PI) / 2);
      c.vehicle = null;
      c.ai = this.newAI(u, mode, p.x, p.y);
      this.officers.push(c);
      i++;
    }
    u.inCar = [];
    v.driver = null;
    if (u.mode === 'pursue') u.mode = 'stopped';
    g.sound.play('door', v.x, v.y, 0.6);
  }

  private newAI(u: Unit | null, mode: OfficerAI['mode'], hx: number, hy: number): OfficerAI {
    return { kind: 'cop', unit: u, mode, burstT: this.rng.range(0.6, 1.4), arrestT: 0, sideT: 0, sideDir: 1, stuckT: 0, accuracy: u ? ACCURACY[u.kind] : 0.5, hx, hy, losT: 0, los: false, path: null, pathT: 0 };
  }

  private unitUsable(u: Unit): boolean {
    const g = this.g;
    const v = u.v;
    return this.units.includes(u) && g.vehicles.includes(v) && v.drivable && u.mode !== 'disabled' && u.mode !== 'block' && v.driver !== g.player.char && v.health > v.maxHealth * 0.42;
  }

  private officerStep(c: Character, dt: number): void {
    const ai = c.ai as OfficerAI | null;
    if (!ai || ai.kind !== 'cop' || c.hidden || c.dead) return;
    if (c.isDown) {
      c.setMove(0, 0);
      return;
    }
    const g = this.g;
    const pl = g.player;
    const lvl = this.level;
    const dx = pl.x - c.x;
    const dy = pl.y - c.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    ai.losT -= dt;
    if (ai.losT <= 0) {
      ai.losT = 0.25;
      ai.los = dist < 28 && g.combat.los(c.x, c.y, pl.x, pl.y);
    }
    if (lvl === 0 && (ai.mode === 'chase' || ai.mode === 'guard')) ai.mode = ai.unit && this.unitUsable(ai.unit) ? 'return' : 'leave';
    if (pl.char.dead) {
      c.setMove(0, 0);
      return;
    }
    switch (ai.mode) {
      case 'chase':
        this.officerChase(c, ai, dist, dx, dy, dt);
        break;
      case 'guard': {
        const onFoot = !pl.inVehicle;
        if (onFoot && dist < 14) {
          ai.mode = 'chase';
          break;
        }
        const hx = ai.hx - c.x;
        const hy = ai.hy - c.y;
        const hd = Math.hypot(hx, hy);
        if (hd > 0.6) c.setMove((hx / hd) * RUN_SPEED * 0.7, (hy / hd) * RUN_SPEED * 0.7);
        else c.setMove(0, 0);
        c.wantHeading = Math.atan2(dy, dx);
        this.maybeShoot(c, ai, dist, dx, dy, dt, 26);
        break;
      }
      case 'return': {
        const u = ai.unit;
        if (!u || !this.unitUsable(u)) {
          ai.mode = lvl > 0 ? 'chase' : 'leave';
          break;
        }
        const v = u.v;
        const door = v.localToWorld(0.3, (v.def.width / 2 + 0.55) * (u.crew.indexOf(c) % 2 === 0 ? 1 : -1));
        const ddx = door.x - c.x;
        const ddy = door.y - c.y;
        const dd = Math.hypot(ddx, ddy);
        c.wantHeading = null;
        if (dd < 1.4 || (dd < 3 && Math.hypot(v.x - c.x, v.y - c.y) < v.def.length / 2 + 1)) {
          c.hide();
          c.vehicle = v;
          c.state = 'driving';
          c.ai = null;
          u.inCar.push(c);
          if (!v.driver) v.driver = c;
          const alive = u.crew.filter((o) => !o.dead && !o.removeMe);
          if (alive.every((o) => o.hidden)) {
            if (lvl > 0) {
              u.mode = 'pursue';
              v.ai = u;
              u.edge = -1;
              u.path = [];
            } else this.handToTraffic(u);
          }
        } else {
          const sp = lvl > 0 ? RUN_SPEED : WALK_SPEED * 1.2;
          const m = this.steerTo(c, ai, door.x, door.y, dt);
          c.setMove(m.mx * sp, m.my * sp);
        }
        break;
      }
      case 'leave': {
        c.wantHeading = null;
        c.setMove((-dx / dist) * WALK_SPEED, (-dy / dist) * WALK_SPEED);
        break;
      }
    }
  }

  /** move towards (tx, ty), using a tile path when there is no straight walkable line */
  private steerTo(c: Character, ai: OfficerAI, tx: number, ty: number, dt: number): { mx: number; my: number } {
    const g = this.g;
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 0.001;
    ai.pathT -= dt;
    if (d < 4 || walkableLine(g.city, c.x, c.y, tx, ty)) {
      ai.path = null;
      return { mx: dx / d, my: dy / d };
    }
    if (!ai.path || ai.pathT <= 0) {
      ai.pathT = 1.1;
      ai.path = findFootPath(g.city, c.x, c.y, tx, ty, 2500);
    }
    const path = ai.path;
    while (path && path.length && Math.hypot(path[0].x - c.x, path[0].y - c.y) < 1.2) path.shift();
    if (!path || !path.length) return { mx: dx / d, my: dy / d };
    const px = path[0].x - c.x;
    const py = path[0].y - c.y;
    const pl = Math.hypot(px, py) || 0.001;
    return { mx: px / pl, my: py / pl };
  }

  private maybeShoot(c: Character, ai: OfficerAI, dist: number, dx: number, dy: number, dt: number, range: number): boolean {
    const g = this.g;
    const lvl = this.level;
    const ars = c.arsenal;
    if (!ars || ars.def.kind !== 'gun') return false;
    const pa = g.player.char.arsenal;
    const playerArmed = !!pa && pa.def.kind !== 'melee';
    if (!(lvl >= 3 || (lvl >= 2 && playerArmed))) return false;
    if (!ai.los || dist > range || dist < 1.5) return false;
    ai.burstT -= dt;
    if (ai.burstT <= 0) {
      if (ai.burstT < -this.rng.range(0.7, 1.5)) ai.burstT = this.rng.range(1.0, 2.2);
      return false;
    }
    const ang = Math.atan2(dy, dx);
    c.wantHeading = ang;
    c.heading = ang;
    c.aim(0.5);
    if (ars.cooldown <= 0) {
      const def = ars.def;
      ars.cooldown = def.interval * (def.id === 'pistol' ? 2.2 : 1.7) + this.rng.range(0, 0.15);
      g.combat.fireGun(c, def.id, c.x + Math.cos(ang) * 0.55, c.y + Math.sin(ang) * 0.55, ang, ai.accuracy, null);
    }
    return true;
  }

  private officerChase(c: Character, ai: OfficerAI, dist: number, dx: number, dy: number, dt: number): void {
    const g = this.g;
    const pl = g.player;
    const pv = pl.vehicle;
    if (pv && pv.speed > 5 && dist > 16 && ai.unit && this.unitUsable(ai.unit) && Math.hypot(ai.unit.v.x - c.x, ai.unit.v.y - c.y) < 40) {
      ai.mode = 'return';
      return;
    }
    let mx = 0;
    let my = 0;
    const shooting = this.maybeShoot(c, ai, dist, dx, dy, dt, 20);
    if (!shooting) {
      c.wantHeading = null;
      if (dist > 1.0) {
        const m = this.steerTo(c, ai, pl.x, pl.y, dt);
        mx = m.mx;
        my = m.my;
      }
    }
    // side-step around obstacles when stuck
    const vel = c.body.getLinearVelocity();
    if ((mx || my) && Math.hypot(vel.x, vel.y) < 0.5) {
      ai.stuckT += dt;
      if (ai.stuckT > 0.45) {
        ai.stuckT = 0;
        ai.sideT = 0.8;
        ai.sideDir = this.rng.chance(0.5) ? 1 : -1;
      }
    } else ai.stuckT = 0;
    if (ai.sideT > 0) {
      ai.sideT -= dt;
      const sx = -my * ai.sideDir;
      const sy = mx * ai.sideDir;
      mx = mx * 0.3 + sx;
      my = my * 0.3 + sy;
    }
    const sp = dist > 6 ? RUN_SPEED * 1.08 : RUN_SPEED * 0.9;
    const ml = Math.hypot(mx, my);
    if (ml > 0.01) c.setMove((mx / ml) * sp, (my / ml) * sp);
    else c.setMove(0, 0);
    // arrests
    if (!pv) {
      if (dist < 1.35 && !pl.char.isDown) {
        ai.arrestT += dt;
        if (ai.arrestT > 0.7) g.bust();
      } else ai.arrestT = Math.max(0, ai.arrestT - dt * 2);
    } else {
      const d1 = pl.doorPoint(pv, 1);
      const d2 = pl.doorPoint(pv, -1);
      const dd = Math.min(Math.hypot(d1.x - c.x, d1.y - c.y), Math.hypot(d2.x - c.x, d2.y - c.y));
      if (pv.speed < 1.5 && dd < 1.9) {
        c.setMove(0, 0);
        ai.arrestT += dt;
        if (ai.arrestT > 1.2) g.bust();
      } else {
        ai.arrestT = Math.max(0, ai.arrestT - dt * 2);
        if (pv.speed < 1.5 && dist < 8) {
          // walk to the nearer door
          const tgt = Math.hypot(d1.x - c.x, d1.y - c.y) < Math.hypot(d2.x - c.x, d2.y - c.y) ? d1 : d2;
          const tx = tgt.x - c.x;
          const ty = tgt.y - c.y;
          const tl = Math.hypot(tx, ty) || 1;
          c.setMove((tx / tl) * RUN_SPEED, (ty / tl) * RUN_SPEED);
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------
  // roadblocks & spikes
  tryRoadblock(lvl: number): void {
    const g = this.g;
    const pv = g.player.vehicle;
    if (!pv || pv.speed < 7) return;
    const city = g.city;
    const vel = pv.body.getLinearVelocity();
    const head = Math.atan2(vel.y, vel.x);
    const hit = city.nearestLane(pv.x, pv.y, 10, head, 0.7, true);
    if (!hit) return;
    for (const ahead of [125, 155, 100]) {
      const a = walkAhead(city, hit.edge, hit.s, ahead);
      const e = city.lanes[a.edge];
      if (e.road < 0 || a.s < 6 || a.s > e.len - 6) continue;
      city.lanePoint(e, a.s, tmp);
      if (g.isVisible(tmp.x, tmp.y, 6)) continue;
      const h = tmp.h;
      const nx = -Math.sin(h);
      const ny = Math.cos(h);
      const offs: number[] = [];
      for (let o = -11; o <= 11; o += 1) {
        const x = tmp.x + nx * o;
        const y = tmp.y + ny * o;
        if (city.isRoad(Math.floor(x / TILE), Math.floor(y / TILE))) offs.push(o);
      }
      if (offs.length < 4) continue;
      const lo = Math.min(...offs) + 1.2;
      const hi = Math.max(...offs) - 1.2;
      const n = clamp(Math.round((hi - lo) / 3.4) + 1, 2, 4);
      const cx = tmp.x;
      const cy = tmp.y;
      let placed = 0;
      for (let k = 0; k < n; k++) {
        const o = lo + ((hi - lo) * k) / (n - 1);
        const x = cx + nx * o;
        const y = cy + ny * o;
        if (g.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) < 3.5)) continue;
        const kind: UnitKind = lvl >= 6 && k === 1 ? 'bse' : lvl >= 5 && k % 2 === 1 ? 'sek' : 'polizei';
        const u = this.spawnUnit(kind, x, y, h + Math.PI / 2 + (k % 2 ? 0.3 : -0.3), 'block');
        const bx = x - Math.cos(h) * 3.4;
        const by = y - Math.sin(h) * 3.4;
        const guards = u.inCar.slice(0, 2);
        u.inCar = guards;
        this.deploy(u, 'guard');
        for (const c of u.crew) {
          if (c.hidden) {
            // the rest of the crew stays inside
            u.inCar.push(c);
            if (!u.v.driver) u.v.driver = c;
          } else {
            const ai = c.ai as OfficerAI;
            ai.hx = bx + nx * this.rng.range(-1.5, 1.5);
            ai.hy = by + ny * this.rng.range(-1.5, 1.5);
          }
        }
        u.mode = 'block';
        placed++;
      }
      if (!placed) continue;
      // spike strip in front of the block, across the whole carriageway
      const mid = (lo + hi) / 2;
      this.spikes.push({ x: cx - Math.cos(h) * 12 + nx * mid, y: cy - Math.sin(h) * 12 + ny * mid, a: h + Math.PI / 2, len: hi - lo + 4, life: 90 });
      return;
    }
  }

  private spikeStep(): void {
    const g = this.g;
    for (const sp of this.spikes) {
      const c = Math.cos(sp.a);
      const s = Math.sin(sp.a);
      for (const v of g.vehicles) {
        if (v.flatTires || v.dead) continue;
        if (Math.abs(v.x - sp.x) > sp.len && Math.abs(v.y - sp.y) > sp.len) continue;
        if (this.isPoliceVehicle(v)) continue;
        for (const ax of [v.def.wheelbase / 2, -v.def.wheelbase / 2]) {
          const p = v.localToWorld(ax, 0);
          const dx = p.x - sp.x;
          const dy = p.y - sp.y;
          const along = dx * c + dy * s;
          const across = -dx * s + dy * c;
          if (Math.abs(along) < sp.len / 2 && Math.abs(across) < 0.7) {
            v.flatTires = true;
            g.onTiresPopped(v);
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------
  // helicopter
  private spawnHeli(px: number, py: number): void {
    const a = this.rng.range(0, Math.PI * 2);
    this.heli = { x: px + Math.cos(a) * 170, y: py + Math.sin(a) * 170, z: 30, vx: 0, vy: 0, angle: a + Math.PI, rotor: 0, orbit: this.rng.range(0, 6.28), leaving: false, lx: px, ly: py };
  }

  private heliStep(dt: number): void {
    const h = this.heli!;
    const g = this.g;
    const px = g.player.x;
    const py = g.player.y;
    h.rotor += dt * 42;
    let tx: number;
    let ty: number;
    if (h.leaving) {
      const away = Math.atan2(h.y - py, h.x - px);
      tx = h.x + Math.cos(away) * 100;
      ty = h.y + Math.sin(away) * 100;
    } else {
      h.orbit += dt * 0.22;
      const pv = g.player.vehicle;
      const vel = pv ? pv.body.getLinearVelocity() : { x: 0, y: 0 };
      tx = px + vel.x * 1.3 + Math.cos(h.orbit) * 13;
      ty = py + vel.y * 1.3 + Math.sin(h.orbit) * 13;
    }
    const dx = tx - h.x;
    const dy = ty - h.y;
    const d = Math.hypot(dx, dy);
    const maxV = h.leaving ? 30 : 44;
    const dvx = d > 0.1 ? (dx / d) * Math.min(maxV, d * 0.9) : 0;
    const dvy = d > 0.1 ? (dy / d) * Math.min(maxV, d * 0.9) : 0;
    const k = 1 - Math.exp(-dt * 1.4);
    h.vx += (dvx - h.vx) * k;
    h.vy += (dvy - h.vy) * k;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    const sp = Math.hypot(h.vx, h.vy);
    if (sp > 2) h.angle += angleDiff(h.angle, Math.atan2(h.vy, h.vx)) * (1 - Math.exp(-dt * 2));
    // searchlight lags behind the player
    const kl = 1 - Math.exp(-dt * 2.5);
    h.lx += (px - h.lx) * kl;
    h.ly += (py - h.ly) * kl;
    if (h.leaving && Math.hypot(h.x - px, h.y - py) > 260) this.heli = null;
  }

  // ------------------------------------------------------------------------------------
  blips(out: Blip[], time: number): void {
    if (this.level === 0) return;
    const flash = Math.floor(time * 4) % 2 === 0;
    for (const u of this.units) {
      if (u.mode === 'disabled' || u.mode === 'leave' || u.mode === 'patrol') continue;
      out.push({ x: u.v.x, y: u.v.y, color: flash ? '#3a6aff' : '#ff3a3a', size: 4, shape: 'square' });
    }
    for (const c of this.officers) {
      if (c.dead || c.hidden) continue;
      out.push({ x: c.x, y: c.y, color: '#6a9aff', size: 2.5 });
    }
    if (this.heli && !this.heli.leaving) out.push({ x: this.heli.x, y: this.heli.y, color: flash ? '#ffffff' : '#3a6aff', size: 5 });
  }
}
