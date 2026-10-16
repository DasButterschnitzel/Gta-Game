// Combat: gunfire (hitscan with tracers), melee, thrown molotovs/grenades, fire areas, explosions.
import * as planck from 'planck';
import { CAT_STATIC, CAT_VEHICLE, CAT_CHAR, CAT_BARRIER, type PhysTag } from '../physics/physics';
import { WEAPONS, type WeaponId } from './weapons';
import type { Character } from './character';
import type { Vehicle } from './vehicle';
import type { Game } from './game';
import { RNG } from '../core/rng';
import { angleDiff, clamp } from '../core/math';

export interface Projectile {
  kind: 'molotov' | 'grenade';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  owner: Character | null;
  ignore: Vehicle | null;
  spin: number;
}

export interface FireArea {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  owner: Character | null;
}

export interface AimTarget {
  x: number;
  y: number;
  char: Character | null;
  vehicle: Vehicle | null;
}

interface RayHit {
  x: number;
  y: number;
  nx: number;
  ny: number;
  frac: number;
  tag: PhysTag;
}

const GRAVITY = 16;

export class CombatSystem {
  readonly projectiles: Projectile[] = [];
  readonly fires: FireArea[] = [];
  private rng = new RNG(5150);

  constructor(private g: Game) {}

  // ------------------------------------------------------------------------------------
  /** Raycast for bullets: nearest static/vehicle/character hit, ignoring the shooter. */
  ray(x0: number, y0: number, x1: number, y1: number, ignoreA: unknown, ignoreB: unknown, mask = CAT_STATIC | CAT_VEHICLE | CAT_CHAR | CAT_BARRIER): RayHit | null {
    let best: RayHit | null = null;
    this.g.physics.world.rayCast(planck.Vec2(x0, y0), planck.Vec2(x1, y1), (fixture, point, normal, fraction) => {
      if (fixture.isSensor()) return -1;
      const cat = fixture.getFilterCategoryBits();
      if (!(cat & mask)) return -1;
      const tag = fixture.getUserData() as PhysTag | undefined;
      if (!tag) return -1;
      if (tag.ref !== undefined && (tag.ref === ignoreA || tag.ref === ignoreB)) return -1;
      if (tag.kind === 'char') {
        const c = tag.ref as Character;
        if (c.hidden || c.dead) return -1;
      }
      best = { x: point.x, y: point.y, nx: normal.x, ny: normal.y, frac: fraction, tag };
      return fraction;
    });
    return best;
  }

  /** Line of sight between two points (static geometry only). */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.ray(x0, y0, x1, y1, null, null, CAT_STATIC) === null;
  }

  // ------------------------------------------------------------------------------------
  /**
   * Choose an auto-aim target for a shooter looking along `dir`.
   * `hostileFirst` prefers cops/gangsters/attackers over bystanders.
   */
  autoAim(c: Character, dir: number, range: number, cone: number, ignoreVehicle: Vehicle | null = null, ox = c.x, oy = c.y): AimTarget | null {
    let best: AimTarget | null = null;
    let bestScore = Infinity;
    const g = this.g;
    for (const o of g.chars) {
      if (o === c || o.hidden || o.dead) continue;
      const dx = o.x - ox;
      const dy = o.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 0.3) continue;
      const da = Math.abs(angleDiff(dir, Math.atan2(dy, dx)));
      if (da > cone) continue;
      let score = d * (1 + (da / cone) * 1.6);
      if (o.role === 'cop' || o.role === 'gang' || o.lastAttacker === c || o.hostile) score *= 0.55;
      if (o.isDown) score *= 2.5;
      if (score < bestScore && this.los(ox, oy, o.x, o.y)) {
        bestScore = score;
        best = { x: o.x, y: o.y, char: o, vehicle: null };
      }
    }
    if (best) return best;
    for (const v of g.vehicles) {
      if (v === ignoreVehicle || v.dead) continue;
      const dx = v.x - ox;
      const dy = v.y - oy;
      const d = Math.hypot(dx, dy);
      if (d > range * 0.8) continue;
      const da = Math.abs(angleDiff(dir, Math.atan2(dy, dx)));
      if (da > cone * 0.8) continue;
      let score = d * (1 + da / cone);
      if (!v.driver) score *= 1.8;
      if (v.def.emergency === 'police' || v.def.emergency === 'sek') score *= 0.6;
      if (score < bestScore && this.los(ox, oy, v.x, v.y)) {
        bestScore = score;
        best = { x: v.x, y: v.y, char: null, vehicle: v };
      }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------
  /**
   * Player (or NPC) attack with the current weapon on foot.
   * `pressed` = the button went down this step (throwables and melee need a fresh press or hold).
   */
  attackOnFoot(c: Character, pressed: boolean, aimDir: number, target: AimTarget | null): void {
    const ars = c.arsenal;
    if (!ars || ars.cooldown > 0 || c.isDown) return;
    const def = ars.def;
    if (def.kind === 'throw' && !pressed) return;
    let ang = aimDir;
    if (target) ang = Math.atan2(target.y - c.y, target.x - c.x);
    c.heading = ang;
    ars.cooldown = def.interval;
    if (def.kind === 'melee') {
      this.melee(c, def.id, ang);
      return;
    }
    if (def.kind === 'gun') {
      c.aim(0.45);
      const mx = c.x + Math.cos(ang) * 0.55;
      const my = c.y + Math.sin(ang) * 0.55;
      this.fireGun(c, def.id, mx, my, ang, 1, null);
      ars.useAmmo(def.id);
      return;
    }
    // throwables
    let tx: number;
    let ty: number;
    if (target) {
      tx = target.x;
      ty = target.y;
    } else {
      tx = c.x + Math.cos(ang) * 13;
      ty = c.y + Math.sin(ang) * 13;
    }
    c.throwAnim();
    this.throwItem(c, def.id as 'molotov' | 'grenade', c.x + Math.cos(ang) * 0.5, c.y + Math.sin(ang) * 0.5, tx, ty, null);
    ars.useAmmo(def.id);
  }

  /** Shoot out of a car window. */
  driveBy(c: Character, v: Vehicle): boolean {
    const ars = c.arsenal;
    if (!ars || ars.cooldown > 0) return false;
    const wid = ars.driveByWeapon();
    if (!wid) return false;
    const def = WEAPONS[wid];
    // look all around, prefer the sides
    let target: AimTarget | null = null;
    let bestScore = Infinity;
    for (const dir of [v.angle + Math.PI / 2, v.angle - Math.PI / 2, v.angle]) {
      const t = this.autoAim(c, dir, Math.min(def.range, 26), Math.PI * 0.42, v, v.x, v.y);
      if (!t) continue;
      const d = Math.hypot(t.x - v.x, t.y - v.y) * (dir === v.angle ? 1.3 : 1);
      if (d < bestScore) {
        bestScore = d;
        target = t;
      }
    }
    let ang: number;
    if (target) ang = Math.atan2(target.y - v.y, target.x - v.x);
    else ang = v.angle;
    // muzzle at the window on the target side (or the bonnet when shooting forward)
    const local = ang - v.angle;
    const side = Math.sin(local) >= 0 ? 1 : -1;
    const fwd = Math.cos(local);
    const m = Math.abs(fwd) > 0.85 && !target ? v.localToWorld(v.def.length / 2 + 0.3, 0.4) : v.localToWorld(0.2 + fwd * 0.6, side * (v.def.width / 2 + 0.25));
    // aim from the muzzle itself, otherwise the window offset makes shots miss sideways
    if (target) ang = Math.atan2(target.y - m.y, target.x - m.x);
    ars.cooldown = def.interval * 1.15;
    this.fireGun(c, wid, m.x, m.y, ang, 0.85, v);
    ars.useAmmo(wid);
    return true;
  }

  // ------------------------------------------------------------------------------------
  fireGun(shooter: Character | null, wid: WeaponId, mx: number, my: number, ang: number, accuracy: number, ignoreVehicle: Vehicle | null): void {
    const def = WEAPONS[wid];
    const g = this.g;
    const spreadMul = 2 - clamp(accuracy, 0, 1.5);
    for (let p = 0; p < def.pellets; p++) {
      const a = ang + this.rng.gauss() * def.spread * spreadMul * 0.6;
      const range = def.range * (def.pellets > 1 ? this.rng.range(0.75, 1) : 1);
      const ex = mx + Math.cos(a) * range;
      const ey = my + Math.sin(a) * range;
      const hit = this.ray(mx, my, ex, ey, shooter, ignoreVehicle ?? shooter?.vehicle ?? null);
      const hx = hit ? hit.x : ex;
      const hy = hit ? hit.y : ey;
      g.fx.tracer(mx, my, hx, hy, def.pellets > 1 ? 0.6 : 1);
      if (!hit) continue;
      const dist = Math.hypot(hx - mx, hy - my);
      const dmg = def.damage * (1 - 0.35 * (dist / def.range));
      const tag = hit.tag;
      if (tag.kind === 'char') {
        const c = tag.ref as Character;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const killed = c.damage(dmg, shooter, dx * def.knock * 1.5, dy * def.knock * 1.5);
        g.fx.blood(c.x, c.y, killed ? 1.3 : 0.6);
        if (!killed && def.knock > 3 && this.rng.chance(0.5)) c.knockDown(dx * def.knock, dy * def.knock, 1.2);
        g.sound.play('hit_flesh', c.x, c.y, 0.5);
        g.onCharHit(c, shooter, dmg, killed, wid);
      } else if (tag.kind === 'vehicle') {
        const v = tag.ref as Vehicle;
        v.damage(dmg * def.vsVehicle, shooter);
        g.fx.sparks(hx, hy, hit.nx, hit.ny, 4);
        if (this.rng.chance(0.5)) g.sound.play('hit_metal', hx, hy, 0.45);
        g.onVehicleShot(v, shooter, dmg * def.vsVehicle);
      } else {
        g.fx.sparks(hx, hy, hit.nx, hit.ny, 2);
        g.fx.dust(hx + hit.nx * 0.2, hy + hit.ny * 0.2, 0.25);
        if (this.rng.chance(0.18)) g.sound.play('hit_metal', hx, hy, 0.25, 1.3);
      }
    }
    g.fx.muzzle(mx, my, ang);
    g.sound.play(def.sound, mx, my, shooter === g.player.char ? 0.8 : 0.65);
    g.alarm(mx, my, 34, 1.2);
    if (shooter) g.onShot(shooter, mx, my, wid);
  }

  melee(c: Character, wid: WeaponId, ang: number): void {
    const def = WEAPONS[wid];
    const g = this.g;
    c.punch(wid === 'bat');
    const reach = def.range;
    const tx = c.x + Math.cos(ang) * reach * 0.6;
    const ty = c.y + Math.sin(ang) * reach * 0.6;
    const target = g.findCharacterNear(tx, ty, reach * 0.85, c);
    if (target) {
      const dir = Math.atan2(target.y - c.y, target.x - c.x);
      const killed = target.damage(def.damage, c, Math.cos(dir) * def.knock, Math.sin(dir) * def.knock);
      g.sound.play(def.sound, target.x, target.y, 0.8);
      if (killed) g.fx.blood(target.x, target.y, 1.2);
      const kdChance = wid === 'bat' ? 0.75 : 0.35;
      if (!killed && this.rng.chance(kdChance)) target.knockDown(Math.cos(dir) * def.knock, Math.sin(dir) * def.knock, wid === 'bat' ? 1.8 : 1.4);
      g.alarm(target.x, target.y, 12, 0.6);
      g.onCharHit(target, c, def.damage, killed, wid);
      return;
    }
    if (wid === 'bat') {
      // smash cars
      for (const v of g.vehicles) {
        if (v.dead) continue;
        if (Math.hypot(v.x - tx, v.y - ty) > v.def.length / 2 + 0.6) continue;
        v.damage(def.damage * def.vsVehicle, c);
        g.sound.play('crash_light', tx, ty, 0.6);
        g.fx.glass(tx, ty);
        g.alarm(tx, ty, 14, 0.5);
        g.onVehicleShot(v, c, def.damage * def.vsVehicle);
        return;
      }
    }
    g.sound.play('swing', c.x, c.y, 0.35);
  }

  // ------------------------------------------------------------------------------------
  throwItem(owner: Character | null, kind: 'molotov' | 'grenade', x: number, y: number, tx: number, ty: number, ignore: Vehicle | null): void {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.min(Math.hypot(dx, dy), WEAPONS[kind].range);
    const a = Math.atan2(dy, dx);
    const T = clamp(d / 15, 0.35, 1.05);
    const sp = d / T;
    this.projectiles.push({
      kind,
      x,
      y,
      z: 1.3,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      vz: (GRAVITY * T) / 2 - 1.3 / T,
      t: 0,
      owner,
      ignore,
      spin: this.rng.range(-12, 12),
    });
    this.g.sound.play('throw', x, y, 0.5);
  }

  step(dt: number): void {
    const g = this.g;
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      p.vz -= GRAVITY * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      let nz = p.z + p.vz * dt;
      let remove = false;
      const mask = p.z < 1.6 ? CAT_STATIC | CAT_VEHICLE | CAT_BARRIER : CAT_STATIC | CAT_BARRIER;
      const hit = this.ray(p.x, p.y, nx, ny, p.owner, p.ignore, mask);
      if (hit && p.t > 0.04) {
        if (p.kind === 'molotov') {
          this.burst(p, hit.x + hit.nx * 0.4, hit.y + hit.ny * 0.4);
          remove = true;
        } else {
          // bounce off
          const vn = p.vx * hit.nx + p.vy * hit.ny;
          p.vx = (p.vx - 2 * vn * hit.nx) * 0.45;
          p.vy = (p.vy - 2 * vn * hit.ny) * 0.45;
          p.x = hit.x + hit.nx * 0.15;
          p.y = hit.y + hit.ny * 0.15;
          if (Math.abs(vn) > 2) g.sound.play('clink', p.x, p.y, 0.5);
        }
      } else {
        p.x = nx;
        p.y = ny;
      }
      if (!remove && nz <= 0.12) {
        if (p.kind === 'molotov') {
          this.burst(p, p.x, p.y);
          remove = true;
        } else {
          nz = 0.12;
          if (p.vz < -2.5) g.sound.play('clink', p.x, p.y, 0.45);
          p.vz = -p.vz * 0.32;
          if (p.vz < 1) p.vz = 0;
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
      }
      p.z = nz;
      if (p.kind === 'molotov' && g.city.isWaterAt(p.x, p.y) && p.z < 0.3) remove = true;
      if (p.kind === 'grenade' && p.t > 2.1) {
        g.explosionAt(p.x, p.y, 7, 0.85, p.owner, null);
        remove = true;
      }
      if (remove) this.projectiles.splice(i, 1);
    }
    // fire areas
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      const r = f.r * Math.min(1, f.t / 1.5 + 0.3);
      for (const c of g.chars) {
        if (c.hidden || c.dead) continue;
        if (Math.hypot(c.x - f.x, c.y - f.y) < r) c.ignite(f.owner);
      }
      for (const v of g.vehicles) {
        if (v.dead) continue;
        if (Math.hypot(v.x - f.x, v.y - f.y) < r + v.def.width / 2) v.damage(14 * dt, f.owner);
      }
    }
    // burning people
    for (const c of g.chars) {
      if (c.burnT <= 0) continue;
      c.burnT -= dt;
      if (c.hidden || c.dead || g.city.isWaterAt(c.x, c.y)) {
        c.burnT = 0;
        continue;
      }
      const killed = c.damage(18 * dt, c.burnBy);
      if (killed) {
        g.onCharHit(c, c.burnBy, 18 * dt, true, 'molotov');
        g.fx.scorch(c.x, c.y, 0.8);
      } else if (c !== g.player.char && c.ai) c.panic = 1;
    }
  }

  private burst(p: Projectile, x: number, y: number): void {
    const g = this.g;
    g.sound.play('molotov', x, y, 0.85);
    g.fx.glass(x, y);
    g.fx.fireBurst(x, y);
    this.fires.push({ x, y, r: 3.2, t: 7.5, max: 7.5, owner: p.owner });
    g.fx.scorch(x, y, 2.6);
    g.alarm(x, y, 22, 1.2);
    if (p.owner) g.onShot(p.owner, x, y, 'molotov');
  }

  /** visual update (per frame) */
  frame(dt: number): void {
    const g = this.g;
    for (const p of this.projectiles) {
      p.spin += dt;
      g.fx.projectile(p.x, p.y, p.z, p.kind);
    }
    for (const f of this.fires) {
      const k = Math.min(1, f.t / 1.5);
      const n = Math.random() < dt * 30 * k ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * f.r * 0.85;
        g.fx.fire(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 0.75 * k + 0.25);
      }
    }
    for (const c of g.chars) {
      if (c.burnT > 0 && !c.hidden && Math.random() < dt * 25) g.fx.fire(c.x, c.y, 0.6);
    }
  }

  clear(): void {
    this.projectiles.length = 0;
    this.fires.length = 0;
  }
}
