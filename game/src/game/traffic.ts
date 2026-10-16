// Traffic: AI drivers following the lane graph, plus streaming of parked cars.
import type { WorldAPI } from './world';
import type { Vehicle } from './vehicle';
import { VEHICLES, trafficPool } from './vehicleDefs';
import { RNG } from '../core/rng';
import { clamp, clamp01 } from '../core/math';
import { Turn, type LaneEdge, TILE } from '../world/types';
import { randomLook } from './character';

export interface Driver {
  v: Vehicle;
  edge: number;
  s: number;
  path: number[];
  cruise: number;
  stuck: number;
  reverseT: number;
  wait: number;
  honkT: number;
  aggressive: boolean;
  /** last recovery attempt */
  lostT: number;
  despawn: boolean;
  /** seconds of panic driving left (shot at, crashed into by the player) */
  panicT: number;
}

const tmp = { x: 0, y: 0, h: 0 };

export class TrafficSystem {
  readonly drivers: Driver[] = [];
  private rng = new RNG(4242);
  maxCars = 20;
  private parkedSpawned = new Map<number, Vehicle>();
  private spawnTimer = 0;
  private parkTimer = 0;
  enabled = true;

  constructor(private w: WorldAPI) {}

  /** called once per fixed step before physics */
  step(dt: number): void {
    for (let i = this.drivers.length - 1; i >= 0; i--) {
      const d = this.drivers[i];
      if (d.v.dead || d.v.ai !== d || d.despawn) {
        if (d.v.ai === d) d.v.ai = null;
        this.drivers.splice(i, 1);
        continue;
      }
      this.drive(d, dt);
    }
  }

  /** called once per frame for spawning/despawning */
  manage(dt: number, px: number, py: number): void {
    if (!this.enabled) return;
    this.spawnTimer -= dt;
    this.parkTimer -= dt;
    // despawn far drivers
    for (const d of this.drivers) {
      const dist = Math.hypot(d.v.x - px, d.v.y - py);
      if ((dist > 230 || (d.stuck > 25 && dist > 40)) && !this.w.isVisible(d.v.x, d.v.y, 10)) {
        d.despawn = true;
        this.w.removeVehicle(d.v);
      }
    }
    if (this.spawnTimer <= 0 && this.drivers.length < this.maxCars) {
      this.spawnTimer = 0.15;
      this.trySpawn(px, py);
    }
    if (this.parkTimer <= 0) {
      this.parkTimer = 0.5;
      this.streamParked(px, py);
    }
  }

  private trySpawn(px: number, py: number): void {
    const city = this.w.city;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(75, 170);
      const x = px + Math.cos(ang) * r;
      const y = py + Math.sin(ang) * r;
      const hit = city.nearestLane(x, y, 30, undefined, Math.PI, true);
      if (!hit) continue;
      const e = city.lanes[hit.edge];
      if (e.len < 12 || this.w.laneBlocked(hit.edge)) continue;
      const s = clamp(hit.s, 3, e.len - 6);
      city.lanePoint(e, s, tmp);
      if (this.w.isVisible(tmp.x, tmp.y, 6)) continue;
      if (this.w.city.zoneAt(tmp.x, tmp.y) !== this.w.city.zoneAt(px, py)) continue;
      // keep spacing
      let blocked = false;
      for (const v of this.w.vehicles) {
        if (Math.abs(v.x - tmp.x) < 14 && Math.abs(v.y - tmp.y) < 14) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const district = city.districtAt(tmp.x, tmp.y);
      const pool = trafficPool(district, false);
      const id = this.rng.weighted(pool.ids, pool.weights);
      const def = VEHICLES[id];
      const v = this.w.spawnVehicle(id, tmp.x, tmp.y, tmp.h, this.rng.pick(def.colors));
      const vel = e.speed * 0.7;
      v.body.setLinearVelocity({ x: Math.cos(tmp.h) * vel, y: Math.sin(tmp.h) * vel });
      const driverChar = this.w.spawnChar(tmp.x, tmp.y, randomLook(this.rng), 'driver');
      driverChar.hide();
      driverChar.vehicle = v;
      driverChar.state = 'driving';
      v.driver = driverChar;
      this.attach(v, hit.edge, s);
      return;
    }
  }

  attach(v: Vehicle, edge: number, s: number): Driver {
    const d: Driver = {
      v,
      edge,
      s,
      path: [],
      cruise: this.rng.range(0.82, 1.12),
      stuck: 0,
      reverseT: 0,
      wait: 0,
      honkT: 0,
      aggressive: this.rng.chance(0.15),
      lostT: 0,
      despawn: false,
      panicT: 0,
    };
    v.ai = d;
    this.drivers.push(d);
    return d;
  }

  private streamParked(px: number, py: number): void {
    const city = this.w.city;
    // despawn far parked cars
    for (const [idx, v] of this.parkedSpawned) {
      const far = Math.hypot(v.x - px, v.y - py) > 190;
      if (v.dead || v.driver || v.ai || v.stolen) {
        // the car left its spot (stolen/driven) -> forget it, game owns it now
        if (v.driver || v.stolen) this.parkedSpawned.delete(idx);
        continue;
      }
      if (far && !this.w.isVisible(v.x, v.y, 10)) {
        this.w.removeVehicle(v);
        this.parkedSpawned.delete(idx);
      }
    }
    if (this.parkedSpawned.size > 40) return;
    for (let i = 0; i < city.parked.length; i++) {
      if (this.parkedSpawned.has(i)) continue;
      const p = city.parked[i];
      const d = Math.hypot(p.x - px, p.y - py);
      if (d > 140 || d < 30) continue;
      if (this.w.isVisible(p.x, p.y, 4)) continue;
      // deterministic but sparse
      if (((i * 2654435761) >>> 0) % 100 > 70) continue;
      const pool = trafficPool(p.district, false);
      const r = new RNG(i * 977 + 3);
      let id = r.weighted(pool.ids, pool.weights);
      if (VEHICLES[id].heavy && VEHICLES[id].length > 7) id = 'golfo';
      const def = VEHICLES[id];
      const v = this.w.spawnVehicle(id, p.x, p.y, p.rot, r.pick(def.colors));
      v.parked = true;
      this.parkedSpawned.set(i, v);
      if (this.parkedSpawned.size > 40) break;
    }
  }

  /** a lane that is closed, or a junction connector whose only way out is closed */
  private blockedAhead(id: number): boolean {
    if (this.w.laneBlocked(id)) return true;
    const e = this.w.city.lanes[id];
    return e.road < 0 && e.next.length > 0 && e.next.every((n) => this.w.laneBlocked(n));
  }

  /** The driver of v panics: floors it and ignores lights for a while. */
  panic(v: Vehicle): void {
    const d = this.drivers.find((o) => o.v === v);
    if (!d) return;
    d.panicT = 10;
    d.honkT = 1.2;
  }

  forgetParked(v: Vehicle): void {
    for (const [idx, pv] of this.parkedSpawned) if (pv === v) this.parkedSpawned.delete(idx);
  }

  // ----------------------------------------------------------------------------------------
  private ensurePath(d: Driver): void {
    const lanes = this.w.city.lanes;
    let last = d.path.length ? d.path[d.path.length - 1] : d.edge;
    while (d.path.length < 4) {
      const e = lanes[last];
      if (!e.next.length) break;
      // prefer not to U-turn; mild preference for straight; never into a closed bridge
      let opts = e.next.filter((id) => !this.blockedAhead(id));
      if (!opts.length) opts = e.next.filter((id) => lanes[id].turn === Turn.UTurn);
      if (!opts.length) break;
      let pick = opts[0];
      if (opts.length > 1) {
        const weights = opts.map((id) => {
          const t = lanes[id].turn;
          return t === Turn.Straight ? 2.2 : t === Turn.UTurn ? 0.05 : 1;
        });
        pick = this.rng.weighted(opts, weights);
      }
      d.path.push(pick);
      last = pick;
    }
  }

  /** position along path: returns point at distance ahead from the current s */
  private lookAhead(d: Driver, dist: number, out: { x: number; y: number; h: number }): void {
    const lanes = this.w.city.lanes;
    let e = lanes[d.edge];
    let s = d.s + dist;
    let i = 0;
    while (s > e.len && i < d.path.length) {
      s -= e.len;
      e = lanes[d.path[i++]];
    }
    this.w.city.lanePoint(e, Math.min(s, e.len), out);
  }

  private relocate(d: Driver): boolean {
    const v = d.v;
    const hit = this.w.city.nearestLane(v.x, v.y, 14, v.angle, Math.PI * 0.45, false);
    if (!hit || this.w.laneBlocked(hit.edge)) return false;
    d.edge = hit.edge;
    d.s = hit.s;
    d.path.length = 0;
    return true;
  }

  private drive(d: Driver, dt: number): void {
    const v = d.v;
    const w = this.w;
    const city = w.city;
    const lanes = city.lanes;
    if (!v.drivable) {
      v.throttle = 0;
      v.brake = 1;
      return;
    }
    // --- progress along the current edge ---
    let e: LaneEdge = lanes[d.edge];
    const proj = projectOnEdge(e, v.x, v.y, d.s);
    d.s = proj.s;
    if (proj.dist > 7) {
      d.lostT += dt;
      if (d.lostT > 1.0) {
        d.lostT = 0;
        if (!this.relocate(d)) d.stuck += 3;
      }
    } else d.lostT = 0;
    while (d.s >= e.len - 0.3) {
      this.ensurePath(d);
      if (!d.path.length) break;
      d.s -= e.len;
      d.edge = d.path.shift()!;
      e = lanes[d.edge];
    }
    this.ensurePath(d);

    const speed = v.speed;
    const vx = v.forwardSpeed;
    // --- reversing out of trouble ---
    if (d.reverseT > 0) {
      d.reverseT -= dt;
      v.throttle = 0;
      v.brake = 0.8;
      v.handbrake = false;
      this.lookAhead(d, 8, tmp);
      const a = Math.atan2(tmp.y - v.y, tmp.x - v.x) - v.angle;
      v.steerIn = -clamp(Math.sin(a) * 2, -1, 1);
      return;
    }

    // --- steering: pure pursuit ---
    const Ld = clamp(4.5 + speed * 0.55, 5, 20);
    this.lookAhead(d, Ld, tmp);
    const dx = tmp.x - v.x;
    const dy = tmp.y - v.y;
    const ca = Math.cos(v.angle);
    const sa = Math.sin(v.angle);
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const alpha = Math.atan2(ly, Math.max(0.5, lx));
    const kappa = (2 * Math.sin(alpha)) / Math.max(4, Math.hypot(lx, ly));
    const delta = Math.atan(kappa * v.def.wheelbase);
    v.steerIn = clamp(delta / Math.max(0.05, v.maxSteerAt(speed)), -1, 1);

    // --- target speed ---
    if (d.panicT > 0) d.panicT -= dt;
    const panic = d.panicT > 0;
    let target = e.speed * d.cruise * (panic ? 1.6 : 1);
    // anticipate turns and stops along the path
    let distAhead = e.len - d.s;
    for (let i = 0; i < d.path.length && distAhead < 45; i++) {
      const ne = lanes[d.path[i]];
      if (ne.turn === Turn.Left || ne.turn === Turn.Right || ne.turn === Turn.UTurn) {
        target = Math.min(target, ne.speed + distAhead * 0.32);
      }
      distAhead += ne.len;
    }
    // dead end (closed bridge ahead): stop before the end of the lane
    if (!d.path.length) {
      const toEnd = e.len - d.s;
      target = Math.min(target, toEnd < 8 ? 0 : Math.sqrt(2 * 4 * Math.max(0, toEnd - 8)));
      if (toEnd < 10 && speed < 0.5) d.stuck += dt * 4;
    }
    // traffic lights & yielding at the end of the current lane edge (or the next one)
    const stopCheck = (edge: LaneEdge, distToEnd: number): void => {
      if (edge.junction < 0) return;
      const stopDist = distToEnd - edge.stopOffset;
      if (edge.signal >= 0) {
        const j = city.junctions[edge.junction];
        const st = w.signalState(j.id, edge.signal);
        const mustStop = st === 0 || st === 1 || (st === 3 && stopDist > Math.max(6, speed * 1.1));
        if (mustStop && stopDist > -1.5) {
          target = Math.min(target, stopDist <= 0.6 ? 0 : Math.sqrt(2 * 4.2 * Math.max(0, stopDist - 0.6)));
        }
      } else if (edge.yieldAtEnd && stopDist < 25) {
        target = Math.min(target, 3.5 + Math.max(0, stopDist) * 0.4);
        if (stopDist < 3 && this.crossTrafficNear(edge)) target = 0;
      }
    };
    if (e.road >= 0 && !panic) stopCheck(e, e.len - d.s);
    else if (d.path.length) {
      // currently inside a junction: nothing to stop for
    }
    if (e.road >= 0 && e.len - d.s < 40 && d.path.length > 1) {
      const conn = lanes[d.path[0]];
      const after = lanes[d.path[1]];
      void conn;
      void after;
    }

    // --- obstacles ahead (vehicles, characters) ---
    const range = 10 + speed * 1.6;
    const halfW = v.def.width / 2 + 0.8;
    let nearest = Infinity;
    let nearestIsPerson = false;
    for (const o of w.vehicles) {
      if (o === v || o.dead) continue;
      const ox = o.x - v.x;
      const oy = o.y - v.y;
      if (Math.abs(ox) > range + 10 || Math.abs(oy) > range + 10) continue;
      const fx = ox * ca + oy * sa;
      const fy = -ox * sa + oy * ca;
      // widen the corridor towards the steering direction
      const bend = fy - fx * Math.tan(clamp(alpha, -0.6, 0.6)) * 0.6;
      if (fx > 0 && fx < range + o.def.length / 2 && Math.abs(bend) < halfW + o.def.width / 2) {
        const gap = fx - v.def.length / 2 - o.def.length / 2;
        if (gap < nearest) nearest = gap;
      }
    }
    for (const c of w.chars) {
      if (c.hidden || c.dead) continue;
      const ox = c.x - v.x;
      const oy = c.y - v.y;
      if (Math.abs(ox) > range || Math.abs(oy) > range) continue;
      const fx = ox * ca + oy * sa;
      const fy = -ox * sa + oy * ca;
      if (fx > 0 && fx < range && Math.abs(fy) < halfW) {
        const gap = fx - v.def.length / 2 - 0.4;
        if (gap < nearest) {
          nearest = gap;
          nearestIsPerson = true;
        }
      }
    }
    if (nearest < Infinity) {
      const safe = 2.2 + speed * 0.45;
      target = Math.min(target, Math.max(0, Math.sqrt(2 * 5 * Math.max(0, nearest - safe))));
      if (nearest < 6 && nearestIsPerson) d.honkT = Math.max(d.honkT, 0.4);
    }

    // --- controller ---
    const err = target - vx;
    if (target < 0.3 && vx < 0.8) {
      v.throttle = 0;
      v.brake = 0;
      v.handbrake = true; // hold position
    } else {
      v.handbrake = false;
      v.throttle = err > 0 ? clamp01(err * 0.45 + 0.1) : 0;
      v.brake = err < -0.6 ? clamp01(-err * 0.35) : 0;
    }
    if ((d.aggressive || panic) && v.throttle > 0) v.throttle = Math.min(1, v.throttle * 1.3);
    v.lightsOn = true;
    // horn
    d.honkT -= dt;
    v.horn = d.honkT > 0;

    // --- stuck handling ---
    if (target > 2.5 && speed < 0.6) {
      d.stuck += dt;
      if (d.stuck > 3.5 && d.stuck < 25) {
        d.reverseT = 1.4;
        d.stuck = 0.5;
        if (this.rng.chance(0.5)) d.honkT = 0.6;
      }
    } else if (speed > 2) d.stuck = Math.max(0, d.stuck - dt * 2);
    void TILE;
  }

  private crossTrafficNear(edge: LaneEdge): boolean {
    const n = edge.xs.length;
    const ex = edge.xs[n - 1];
    const ey = edge.ys[n - 1];
    for (const o of this.w.vehicles) {
      if (o.speed < 2) continue;
      const dx = ex - o.x;
      const dy = ey - o.y;
      const d = Math.hypot(dx, dy);
      if (d > 28) continue;
      // approaching the junction?
      const vel = o.body.getLinearVelocity();
      if ((vel.x * dx + vel.y * dy) / d > 1.5) return true;
    }
    return false;
  }
}

/** Project a point onto an edge polyline near s, returning arc length and distance. */
export function projectOnEdge(e: LaneEdge, x: number, y: number, sHint: number): { s: number; dist: number } {
  const n = e.xs.length;
  let bestS = sHint;
  let bestD = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const ax = e.xs[i];
    const ay = e.ys[i];
    const bx = e.xs[i + 1];
    const by = e.ys[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const l2 = abx * abx + aby * aby;
    if (l2 < 1e-6) continue;
    let t = ((x - ax) * abx + (y - ay) * aby) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + abx * t;
    const py = ay + aby * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestD) {
      bestD = d;
      bestS = e.cum[i] + Math.sqrt(l2) * t;
    }
  }
  return { s: bestS, dist: bestD };
}
