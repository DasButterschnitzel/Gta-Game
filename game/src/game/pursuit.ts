// Pursuit driving shared by police units, gang chasers and scripted mission drivers:
// lane routing (A*) when far away, a direct chase with a local obstacle planner up close.
import type { Game } from './game';
import type { Vehicle } from './vehicle';
import { findRoute } from '../world/route';
import { projectOnEdge } from './traffic';
import { clamp, angleDiff } from '../core/math';
import { CAT_STATIC, CAT_BARRIER, CAT_VEHICLE } from '../physics/physics';
import { Turn } from '../world/types';

export interface DriveState {
  edge: number;
  s: number;
  path: number[];
  routeT: number;
  stuckT: number;
  reverseT: number;
  reverseSteer: number;
  lostT: number;
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

export function newDriveState(x: number, y: number, angle: number): DriveState {
  return { edge: -1, s: 0, path: [], routeT: 0, stuckT: 0, reverseT: 0, reverseSteer: 0, lostT: 0, gx: x, gy: y, offroad: 0, goalT: 0, planT: 0, planHeading: angle, planFree: 1 };
}

const tmp = { x: 0, y: 0, h: 0 };

export class PursuitDriver {
  constructor(private g: Game) {}

  /** left/right feelers against walls; returns a steering bias */
  whiskers(v: Vehicle): number {
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
  plan(st: DriveState, v: Vehicle, desired: number, dt: number, avoid: Vehicle | null | undefined = undefined): void {
    st.planT -= dt;
    if (st.planT > 0) return;
    st.planT = 0.1;
    const g = this.g;
    // avoid !== undefined: also steer around other cars (except `avoid`, the one we're after)
    const mask = avoid !== undefined ? CAT_STATIC | CAT_BARRIER | CAT_VEHICLE : CAT_STATIC | CAT_BARRIER;
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
        const hit = g.combat.ray(ox, oy, ox + c * L, oy + s * L, v, avoid ?? null, mask);
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
    st.planHeading = best;
    st.planFree = bestFree;
  }

  /** drive straight at a point (around obstacles); sets the vehicle controls */
  chaseTo(st: DriveState, v: Vehicle, ax: number, ay: number, dt: number, speedCap = Infinity, avoid: Vehicle | null | undefined = undefined): void {
    const want = Math.atan2(ay - v.y, ax - v.x);
    this.plan(st, v, want, dt, avoid);
    const err = angleDiff(v.angle, st.planHeading);
    const steer = clamp(err * 2.4, -1, 1);
    let throttle = st.planFree < 0.45 ? 0.55 : 1;
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
    if (sp > speedCap) {
      throttle = 0;
      if (sp > speedCap + 2) brake = Math.max(brake, 0.5);
    }
    v.steerIn = steer;
    v.throttle = throttle;
    v.brake = brake;
    v.handbrake = hb;
  }

  /** stop where you are */
  hold(v: Vehicle): void {
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

  private lookAhead(st: DriveState, dist: number, out: { x: number; y: number; h: number }): void {
    const lanes = this.g.city.lanes;
    let e = lanes[st.edge];
    let s = st.s + dist;
    let i = 0;
    while (s > e.len && i < st.path.length) {
      s -= e.len;
      e = lanes[st.path[i++]];
    }
    this.g.city.lanePoint(e, Math.min(s, e.len), out);
  }

  /** remaining route length in metres (rough) */
  routeLeft(st: DriveState): number {
    const lanes = this.g.city.lanes;
    if (st.edge < 0) return Infinity;
    let d = lanes[st.edge].len - st.s;
    for (const id of st.path) d += lanes[id].len;
    return d;
  }

  /**
   * Follow the lane graph towards (tx, ty). Returns false when there is no usable lane / route
   * (the caller should chase directly). `calm` = obey a normal speed and keep distance.
   */
  route(st: DriveState, v: Vehicle, tx: number, ty: number, dt: number, speedMul: number, calm = false): boolean {
    const g = this.g;
    const city = g.city;
    if (st.edge < 0) {
      const hit = city.nearestLane(v.x, v.y, 14, v.angle, Math.PI * 0.6, false) ?? city.nearestLane(v.x, v.y, 30, undefined, Math.PI, false);
      if (!hit) return false;
      st.edge = hit.edge;
      st.s = hit.s;
      st.path = [];
      st.routeT = 0;
    }
    let e = city.lanes[st.edge];
    const proj = projectOnEdge(e, v.x, v.y, st.s);
    st.s = proj.s;
    if (proj.dist > 8) {
      st.lostT += dt;
      if (st.lostT > 0.8) {
        st.lostT = 0;
        st.edge = -1;
        return true;
      }
    } else st.lostT = 0;
    while (st.s >= e.len - 0.3 && st.path.length) {
      st.s -= e.len;
      st.edge = st.path.shift()!;
      e = city.lanes[st.edge];
    }
    st.routeT -= dt;
    if (st.routeT <= 0 || st.path.length === 0) {
      st.routeT = 2.5;
      const r = findRoute(city, st.edge, tx, ty, 26, 2500, (id) => g.laneBlocked(id));
      if (!r || !r.length) return false;
      st.path = r;
    }
    const speed = v.speed;
    const Ld = clamp(5 + speed * 0.6, 6, 26);
    this.lookAhead(st, Ld, tmp);
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
    let target = (calm ? e.speed * 1.1 : Math.max(e.speed * 1.55, 16)) * speedMul;
    let distAhead = e.len - st.s;
    for (let i = 0; i < st.path.length && distAhead < 50; i++) {
      const ne = city.lanes[st.path[i]];
      if (ne.turn === Turn.Left || ne.turn === Turn.Right) target = Math.min(target, (calm ? 7 : 11) + distAhead * 0.45);
      else if (ne.turn === Turn.UTurn) target = Math.min(target, 6 + distAhead * 0.4);
      distAhead += ne.len;
    }
    // brake for cars right in front (pursuers push through, but don't plough into a queue)
    const range = 6 + speed * 0.8;
    for (const o of g.vehicles) {
      if (o === v || o.dead || (!calm && o === g.player.vehicle)) continue;
      const ox = o.x - v.x;
      const oy = o.y - v.y;
      if (Math.abs(ox) > range + 6 || Math.abs(oy) > range + 6) continue;
      const fx = ox * ca + oy * sa;
      const fy = -ox * sa + oy * ca;
      if (fx > 0 && fx < range && Math.abs(fy) < v.def.width / 2 + o.def.width / 2 + 0.3) {
        const gap = fx - v.def.length / 2 - o.def.length / 2;
        target = Math.min(target, Math.max(calm ? 0 : 4, gap * (calm ? 1.0 : 1.6)));
      }
    }
    const err = target - v.forwardSpeed;
    v.throttle = err > 0 ? clamp(err * 0.5 + 0.2, 0, 1) : 0;
    v.brake = err < -1.5 ? clamp(-err * 0.3, 0, 1) : target < 0.5 && v.forwardSpeed < 1 ? 1 : 0;
    v.handbrake = false;
    v.steerIn = steer;
    return true;
  }

  /** backing out after getting stuck: true while reversing (controls are set) */
  reversing(st: DriveState, v: Vehicle, dt: number): boolean {
    if (st.reverseT <= 0) return false;
    st.reverseT -= dt;
    v.throttle = 0;
    v.brake = 1;
    v.handbrake = false;
    v.steerIn = st.reverseSteer;
    return true;
  }

  /** stuck detection (call after setting the controls): pushing without moving → back out */
  checkStuck(st: DriveState, v: Vehicle, dt: number): void {
    if (v.throttle > 0.4 && v.speed < 1.2) {
      st.stuckT += dt;
      if (st.stuckT > 1.3) {
        st.stuckT = 0;
        st.reverseT = 1.1;
        st.reverseSteer = v.steerIn > 0 ? -1 : 1;
      }
    } else st.stuckT = Math.max(0, st.stuckT - dt);
  }

  /** the closest road point to the target (refreshed every 1.2 s) */
  updateGoal(st: DriveState, tx: number, ty: number, dt: number): void {
    st.goalT -= dt;
    if (st.goalT <= 0) {
      st.goalT = 1.2;
      const h = this.g.city.nearestLane(tx, ty, 160, undefined, Math.PI, false);
      st.gx = h ? h.px : tx;
      st.gy = h ? h.py : ty;
      st.offroad = h ? h.dist : 999;
    }
  }
}
