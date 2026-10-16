// Vehicle entity: rigid body + two-axle tyre model. Render-independent (testable headless).
import * as planck from 'planck';
import { Physics, CAT_VEHICLE, CAT_STATIC, CAT_CHAR, CAT_DEBRIS, CAT_BARRIER, type PhysTag } from '../physics/physics';
import type { VehicleDef } from './vehicleDefs';
import { G } from '../world/types';
import { clamp, clamp01, approach, lerp } from '../core/math';

/** Global tuning knobs (exposed for the debug panel). */
export const TUNE = {
  gripScale: 1.25,
  stiffness: 18, // cornering stiffness per unit load (1/rad)
  steerRate: 3.6, // rad/s towards target
  steerReturn: 5.5, // rad/s back to centre
  highSpeedSteer: 0.3, // fraction of steer lock left at high speed
  handbrakeGrip: 0.4, // rear lateral grip multiplier with handbrake
  driftAssist: 0.55, // counter-steer assistance for the player (0..1)
  slipFloor: 5, // m/s floor for slip angle computation (low-speed stability)
  inertiaScale: 1.0,
  espPlayer: 3.2, // yaw stabiliser gain for the player
  espAI: 6,
  cgHeight: 0.55,
};

export interface SurfaceInfo {
  grip: number;
  roll: number;
  water: boolean;
}

export function surfaceInfo(g: G): SurfaceInfo {
  switch (g) {
    case G.Grass:
    case G.Forest:
      return { grip: 0.72, roll: 5, water: false };
    case G.Dirt:
    case G.Path:
      return { grip: 0.78, roll: 3.5, water: false };
    case G.Gravel:
      return { grip: 0.75, roll: 3.5, water: false };
    case G.Sand:
      return { grip: 0.6, roll: 9, water: false };
    case G.Cobble:
    case G.Pavers:
      return { grip: 0.93, roll: 1.4, water: false };
    case G.Water:
      return { grip: 0.1, roll: 20, water: true };
    default:
      return { grip: 1, roll: 1, water: false };
  }
}

let nextVehicleId = 1;

export class Vehicle {
  readonly id = nextVehicleId++;
  readonly body: planck.Body;
  // --- controls (written by player input or AI) ---
  throttle = 0;
  brake = 0;
  steerIn = 0;
  handbrake = false;
  horn = false;
  /** player controlled: enables drift assist */
  assisted = false;
  // --- state ---
  steer = 0;
  health: number;
  readonly maxHealth: number;
  burning = 0; // seconds burning (>0 = on fire)
  exploded = false;
  sinking = 0;
  sunk = false;
  rpm = 0.15; // 0..1
  gear = 1;
  private shiftT = 0;
  private ax = 0;
  private lastVx = 0;
  /** lateral sliding intensity 0..1 for skid marks / screech */
  skid = 0;
  /** rear wheels slipping (burnout) 0..1 */
  spin = 0;
  speed = 0;
  forwardSpeed = 0;
  private sinceHandbrake = 9;
  sirenOn = false;
  lightsOn = false;
  /** tyres shredded by a spike strip */
  flatTires = false;
  private wobble = 0;
  reversing = false;
  braking = false;
  surface: SurfaceInfo = { grip: 1, roll: 1, water: false };
  lastSurface: G = G.Asphalt;
  /** occupant references (set by game) */
  driver: unknown = null;
  passengers: unknown[] = [];
  /** misc game flags */
  locked = false;
  parked = false;
  stolen = false;
  missionTag = '';
  lastHitBy: unknown = null;
  /** time since last significant crash (for AI recovery etc.) */
  sinceCrash = 99;
  view: { dispose(): void } | null = null;
  prevX = 0;
  prevY = 0;
  prevA = 0;
  ai: unknown = null;
  readonly tag: PhysTag;

  constructor(
    readonly def: VehicleDef,
    readonly physics: Physics,
    x: number,
    y: number,
    angle: number,
    public paint: number,
  ) {
    this.health = def.health;
    this.maxHealth = def.health;
    this.tag = { kind: 'vehicle', ref: this, mat: def.heavy ? 'heavy' : 'metal' };
    this.body = physics.world.createBody({
      type: 'dynamic',
      position: planck.Vec2(x, y),
      angle,
      linearDamping: 0,
      angularDamping: 0,
      allowSleep: true,
    });
    this.body.setUserData(this.id);
    this.prevX = x;
    this.prevY = y;
    this.prevA = angle;
    const hl = def.length / 2;
    const hw = def.width / 2;
    const c = Math.min(def.model.chamfer, hw * 0.6);
    const verts = [
      planck.Vec2(hl, -hw + c),
      planck.Vec2(hl, hw - c),
      planck.Vec2(hl - c, hw),
      planck.Vec2(-hl + c, hw),
      planck.Vec2(-hl, hw - c),
      planck.Vec2(-hl, -hw + c),
      planck.Vec2(-hl + c, -hw),
      planck.Vec2(hl - c, -hw),
    ];
    const area = def.length * def.width - 2 * c * c;
    this.body.createFixture(new planck.Polygon(verts), {
      density: def.mass / area,
      friction: 0.28,
      restitution: 0.12,
      filterCategoryBits: CAT_VEHICLE,
      filterMaskBits: CAT_STATIC | CAT_VEHICLE | CAT_CHAR | CAT_DEBRIS | CAT_BARRIER,
      userData: this.tag,
    });
    // more agile yaw than a uniform box
    const md = { mass: 0, center: planck.Vec2(0, 0), I: 0 };
    this.body.getMassData(md);
    md.I *= TUNE.inertiaScale;
    this.body.setMassData(md);
  }

  get x(): number {
    return this.body.getPosition().x;
  }
  get y(): number {
    return this.body.getPosition().y;
  }
  get angle(): number {
    return this.body.getAngle();
  }
  get dead(): boolean {
    return this.exploded || this.sunk;
  }
  get drivable(): boolean {
    return !this.exploded && !this.sunk && this.burning <= 0;
  }

  /** Point in world space from local coordinates. */
  localToWorld(lx: number, ly: number): { x: number; y: number } {
    const a = this.angle;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c };
  }

  /** Steering lock available at a given speed (mirrors the logic in step()). */
  maxSteerAt(speed: number): number {
    const muEst = this.def.grip * TUNE.gripScale * this.surface.grip;
    return Math.min(this.def.steerMax, (this.def.wheelbase * muEst * 9.81 * 1.2) / Math.max(speed * speed, 1) + 0.035);
  }

  setSurface(g: G): void {
    if (g !== this.lastSurface) {
      this.lastSurface = g;
      this.surface = surfaceInfo(g);
    }
  }

  /** Physics step: compute tyre forces and apply them. */
  /** Store pose before the physics step (render interpolation). */
  savePrev(): void {
    const p = this.body.getPosition();
    this.prevX = p.x;
    this.prevY = p.y;
    this.prevA = this.body.getAngle();
  }

  step(dt: number): void {
    const def = this.def;
    const b = this.body;
    const ang = b.getAngle();
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const v = b.getLinearVelocity();
    const w = b.getAngularVelocity();
    const vx = v.x * c + v.y * s; // forward
    const vy = -v.x * s + v.y * c; // left
    const speed = Math.hypot(v.x, v.y);
    this.speed = speed;
    this.forwardSpeed = vx;
    const m = b.getMass();
    const L = def.wheelbase;
    const a = L * 0.48; // CG slightly forward
    const bb = L - a;
    const g = 9.81;
    const surf = this.surface;
    const alive = this.drivable && this.health > 0;

    // ---- steering: lock limited so full input ~ maximum cornering at this speed ----
    const muEst = def.grip * TUNE.gripScale * surf.grip;
    const vRef = Math.max(Math.abs(vx), speed * 0.9);
    const maxSteer = Math.min(def.steerMax, (L * muEst * g * 1.2) / Math.max(vRef * vRef, 1) + 0.035);
    let target = clamp(this.steerIn, -1, 1) * maxSteer;
    if (this.flatTires && speed > 3) {
      this.wobble += dt * (4 + speed * 0.4);
      target += Math.sin(this.wobble) * 0.03 + Math.sin(this.wobble * 2.3) * 0.015;
    }
    // drift assist: when the rear is sliding, help counter-steer
    const beta = speed > 3 ? Math.atan2(vy, Math.max(Math.abs(vx), 0.1)) : 0;
    if (this.assisted && vx > 6 && Math.abs(beta) > 0.08 && Math.abs(beta) < 1.0 && !this.handbrake) {
      const counter = clamp(beta * 1.2, -maxSteer, maxSteer) * Math.sign(vx);
      // blend towards counter-steer if the player isn't actively steering into the slide
      const k = TUNE.driftAssist * (1 - Math.abs(this.steerIn) * 0.6);
      target = lerp(target, target + counter, k);
    }
    const rate = Math.abs(target) > Math.abs(this.steer) && Math.sign(target) === Math.sign(this.steer || target) ? TUNE.steerRate : TUNE.steerReturn;
    this.steer = approach(this.steer, clamp(target, -def.steerMax, def.steerMax), rate * dt);

    // ---- drive / brake inputs ----
    let throttle = alive ? clamp01(this.throttle) : 0;
    let brakeIn = clamp01(this.brake);
    this.reversing = false;
    if (alive && brakeIn > 0.1 && throttle < 0.05 && vx < 0.8) {
      // reverse gear
      this.reversing = true;
      throttle = -brakeIn;
      brakeIn = vx > 0.3 ? brakeIn : 0;
    }
    this.braking = brakeIn > 0.1 && !this.reversing;
    const damageFactor = this.health < this.maxHealth * 0.3 ? 0.55 + 0.45 * (this.health / (this.maxHealth * 0.3)) : 1;
    let Fdrive = 0;
    if (throttle > 0) {
      const p = def.power * damageFactor * (this.flatTires ? 0.55 : 1);
      Fdrive = throttle * Math.min(def.accelCap * m, p / Math.max(Math.abs(vx), 2.5));
      if (this.shiftT > 0) Fdrive *= 0.35;
      if (vx < -0.5) Fdrive += throttle * m * 4; // help stop when rolling backwards
    } else if (throttle < 0) {
      const maxRev = 9;
      Fdrive = vx > -maxRev ? throttle * def.accelCap * m * 0.55 : 0;
    }
    // aerodynamic drag tuned so drive == drag at top speed
    const Cd = def.power / (def.topSpeed * def.topSpeed * def.topSpeed);
    const Fdrag = -Cd * vx * Math.abs(vx);
    const rollC = m * g * 0.013 * surf.roll;
    const Froll = Math.abs(vx) > 0.5 ? -Math.sign(vx) * rollC : -vx * rollC * 2;
    // engine braking when coasting
    const Fengine = throttle === 0 && Math.abs(vx) > 0.5 ? -Math.sign(vx) * m * 0.9 : 0;

    // ---- loads with longitudinal weight transfer ----
    const transfer = (m * this.ax * TUNE.cgHeight) / L;
    const Wf = Math.max(0.2 * m * g, (m * g * bb) / L - transfer);
    const Wr = Math.max(0.2 * m * g, (m * g * a) / L + transfer);
    const mu = def.grip * surf.grip * TUNE.gripScale * (this.flatTires ? 0.6 : 1);

    let FxF = 0;
    let FxR = 0;
    if (def.drive === 'FWD') FxF = Fdrive;
    else if (def.drive === 'RWD') FxR = Fdrive;
    else {
      FxF = Fdrive * 0.4;
      FxR = Fdrive * 0.6;
    }
    // brakes
    const sv = vx > 0.05 ? 1 : vx < -0.05 ? -1 : 0;
    const parking = ((!this.driver && !this.ai) && speed < 2.5) || (!alive && speed < 1);
    if (!this.driver && !this.ai && speed >= 2.5) brakeIn = Math.max(brakeIn, 0.15);
    let brakeForce = brakeIn * def.brake * m;
    if (parking) brakeForce = Math.max(brakeForce, 6 * m);
    if (Math.abs(vx) < 0.6 && brakeForce > 0) {
      // smooth stop without sign chatter
      FxF -= vx * m * 6 * 0.6;
      FxR -= vx * m * 6 * 0.4;
    } else {
      FxF -= brakeForce * 0.62 * sv;
      FxR -= brakeForce * 0.38 * sv;
    }
    FxF += Fengine * 0.5;
    FxR += Fengine * 0.5;

    // ---- slip angles ----
    const cd = Math.cos(this.steer);
    const sd = Math.sin(this.steer);
    const vfx = vx;
    const vfy = vy + w * a;
    const vwx = vfx * cd + vfy * sd;
    const vwy = -vfx * sd + vfy * cd;
    const floorV = TUNE.slipFloor;
    const alphaF = Math.atan2(vwy, Math.max(Math.abs(vwx), floorV));
    const vry = vy - w * bb;
    const alphaR = Math.atan2(vry, Math.max(Math.abs(vx), floorV));

    let muRlat = mu;
    const hb = this.handbrake && alive;
    if (hb) {
      muRlat = mu * TUNE.handbrakeGrip;
      if (Math.abs(vx) > 0.3) FxR = -sv * mu * Wr * 0.7;
      else FxR -= vx * m * 3;
    }
    const CF = TUNE.stiffness * Wf;
    const CR = TUNE.stiffness * 1.08 * Wr;
    let FyF = -tyre(alphaF, CF, mu * Wf);
    let FyR = -tyre(alphaR, CR, muRlat * Wr);

    // friction circles
    const capF = mu * Wf;
    const totF = Math.hypot(FxF, FyF);
    if (totF > capF) {
      const k = capF / totF;
      FxF *= k;
      FyF *= k;
    }
    const capR = (hb ? mu * 0.85 : mu) * Wr;
    const totR = Math.hypot(FxR, FyR);
    let spin = 0;
    if (totR > capR) {
      const k = capR / totR;
      // wheelspin: longitudinal demand eats lateral grip (power oversteer)
      const longShare = Math.abs(FxR) / totR;
      spin = (1 - k) * longShare;
      FxR *= k;
      FyR *= k * (1 - spin * 0.35);
    }
    this.spin = lerp(this.spin, clamp01(spin * 2.5 * (speed < 12 ? 1 : 0.6)), 0.2);

    // ---- assemble ----
    const Fx = FxF * cd - FyF * sd + FxR + Fdrag + Froll;
    const Fy = FxF * sd + FyF * cd + FyR - Cd * 3 * vy * Math.abs(vy);
    let torque = a * (FxF * sd + FyF * cd) - bb * FyR;
    // yaw damping at very low speed to prevent pirouettes on the spot
    if (speed < 2) torque -= w * m * 2.5;
    // ESP-style yaw stabiliser (disabled briefly after handbrake so drifts can be held)
    if (hb) this.sinceHandbrake = 0;
    else this.sinceHandbrake += dt;
    const espGain = this.assisted ? TUNE.espPlayer : TUNE.espAI;
    const I = b.getInertia();
    if (hb && Math.abs(w) > 3.2) torque -= (w - Math.sign(w) * 3.2) * I * 8;
    if (!hb && this.sinceHandbrake < 0.6 && alive) torque -= w * I * 3.2 * (1 - this.sinceHandbrake / 0.6);
    if (alive && espGain > 0 && !hb && this.sinceHandbrake > 0.3 && Math.abs(vx) > 4) {
      const rDes = (vx * Math.tan(this.steer)) / L;
      const rMax = (mu * g * 0.95) / Math.max(Math.abs(vx), 1);
      const rT = clamp(rDes, -rMax, rMax);
      if (Math.abs(w) > Math.abs(rT) + 0.04 || (Math.sign(w) !== Math.sign(rT) && Math.abs(w) > 0.1)) {
        torque -= (w - rT) * I * espGain;
      }
    }
    b.applyForceToCenter(planck.Vec2(Fx * c - Fy * s, Fx * s + Fy * c), true);
    b.applyTorque(torque, true);

    // ---- bookkeeping ----
    const axNow = (vx - this.lastVx) / dt;
    this.ax = lerp(this.ax, clamp(axNow, -15, 15), 0.15);
    this.lastVx = vx;
    const slideLat = Math.max(Math.abs(vry), Math.abs(vwy) * 0.8);
    const lock = (hb || (this.braking && brakeIn > 0.8)) && Math.abs(vx) > 6 ? 0.6 : 0;
    this.skid = clamp01(Math.max((slideLat - 2.2) / 5, lock * (hb ? 1 : 0.5), this.spin));
    if (speed < 2) this.skid *= speed / 2;

    // ---- gearbox (for sound) ----
    this.updateGearbox(dt, Math.abs(vx), throttle);

    // ---- water ----
    if (surf.water && !this.sunk) {
      this.sinking += dt;
      b.setLinearDamping(3);
      b.setAngularDamping(3);
      if (this.sinking > 2.5) this.sunk = true;
    }
    if (this.burning > 0) this.burning += dt;
    this.sinceCrash += dt;
  }

  private updateGearbox(dt: number, v: number, throttle: number): void {
    const top = this.def.topSpeed;
    const ratios = this.def.engine === 'ev' ? [1] : this.def.heavy ? [0.14, 0.26, 0.4, 0.56, 0.76, 1.0] : [0.2, 0.34, 0.5, 0.67, 0.84, 1.0];
    if (this.shiftT > 0) this.shiftT -= dt;
    let gear = this.gear;
    const upper = (gg: number): number => ratios[Math.min(ratios.length - 1, gg - 1)] * top;
    const lower = (gg: number): number => (gg <= 1 ? 0 : ratios[gg - 2] * top);
    if (gear < ratios.length && v > upper(gear) * 0.96) {
      gear++;
      this.shiftT = 0.16;
    } else if (gear > 1 && v < lower(gear) * 0.82) gear--;
    this.gear = gear;
    const lo = lower(gear) * 0.55;
    const hi = upper(gear);
    let r = clamp01((v - lo) / Math.max(1, hi - lo));
    r = 0.18 + r * 0.82;
    if (this.reversing) r = 0.2 + clamp01(v / 9) * 0.5;
    const idle = throttle !== 0 ? 0.28 : 0.12;
    const targetRpm = Math.max(idle, v < 0.5 ? (Math.abs(throttle) > 0 ? 0.38 + this.spin * 0.4 : idle) : r) + this.spin * 0.35;
    this.rpm = lerp(this.rpm, clamp01(targetRpm), this.shiftT > 0 ? 0.35 : 0.18);
  }

  /** Apply damage (and start fire / explode thresholds are handled by game). */
  damage(amount: number, by: unknown = null): void {
    if (this.exploded) return;
    this.health -= amount * (this.def.armor ?? 1);
    if (by) this.lastHitBy = by;
    if (this.health <= 0 && this.burning <= 0) {
      this.health = 0;
      this.burning = 0.001;
    }
  }

  destroy(): void {
    this.physics.world.destroyBody(this.body);
    this.view?.dispose();
  }
}

/** Simplified Pacejka "magic formula": peak at ~10°, slides at ~85% of peak. */
function tyre(alpha: number, C: number, Fmax: number): number {
  if (Fmax <= 0) return 0;
  const Cs = 1.35;
  const B = C / (Cs * Fmax);
  return Fmax * Math.sin(Cs * Math.atan(B * alpha));
}
