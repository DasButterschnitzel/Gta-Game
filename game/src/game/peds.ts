// Pedestrians walking sidewalk rings around blocks; panic & flee; streaming around the player.
import type { WorldAPI } from './world';
import { Character, randomLook, WALK_SPEED, RUN_SPEED } from './character';
import { RNG } from '../core/rng';
import { D, TILE, type Block } from '../world/types';
import { clamp } from '../core/math';

export interface PedAI {
  kind: 'ped';
  block: number;
  s: number;
  dir: number;
  offset: number;
  speed: number;
  mode: 'walk' | 'flee' | 'idle' | 'return' | 'dodge';
  t: number;
  fx: number;
  fy: number;
}

const DENSITY: Partial<Record<D, number>> = {
  [D.Kiez]: 1.3,
  [D.Bahnhof]: 1.4,
  [D.Altstadt]: 1.3,
  [D.Platte]: 0.8,
  [D.Hafen]: 0.35,
  [D.Industrie]: 0.3,
  [D.Turm]: 1.0,
  [D.Villen]: 0.45,
  [D.Uni]: 1.1,
  [D.Park]: 0.9,
  [D.Nordend]: 1.0,
};

function ringLen(b: Block): number {
  return 2 * (b.rx1 - b.rx0) + 2 * (b.ry1 - b.ry0);
}

function ringPoint(b: Block, s: number, offset: number, out: { x: number; y: number }): void {
  const w = b.rx1 - b.rx0;
  const h = b.ry1 - b.ry0;
  const P = 2 * w + 2 * h;
  s = ((s % P) + P) % P;
  if (s < w) {
    out.x = b.rx0 + s;
    out.y = b.ry0 + offset;
  } else if (s < w + h) {
    out.x = b.rx1 - offset;
    out.y = b.ry0 + (s - w);
  } else if (s < 2 * w + h) {
    out.x = b.rx1 - (s - w - h);
    out.y = b.ry1 - offset;
  } else {
    out.x = b.rx0 + offset;
    out.y = b.ry1 - (s - 2 * w - h);
  }
}

function ringProject(b: Block, x: number, y: number): number {
  const w = b.rx1 - b.rx0;
  const h = b.ry1 - b.ry0;
  const cx = clamp(x, b.rx0, b.rx1);
  const cy = clamp(y, b.ry0, b.ry1);
  const dB = Math.abs(cy - b.ry0);
  const dR = Math.abs(cx - b.rx1);
  const dT = Math.abs(cy - b.ry1);
  const dL = Math.abs(cx - b.rx0);
  const m = Math.min(dB, dR, dT, dL);
  if (m === dB) return cx - b.rx0;
  if (m === dR) return w + (cy - b.ry0);
  if (m === dT) return w + h + (b.rx1 - cx);
  return 2 * w + h + (b.ry1 - cy);
}

const tmp = { x: 0, y: 0 };

export class PedSystem {
  readonly peds: Character[] = [];
  private rng = new RNG(777);
  maxPeds = 34;
  private spawnT = 0;
  enabled = true;

  constructor(private w: WorldAPI) {}

  manage(dt: number, px: number, py: number): void {
    if (!this.enabled) return;
    // despawn
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const c = this.peds[i];
      const d = Math.hypot(c.x - px, c.y - py);
      const gone = c.removeMe || (d > 120 && !this.w.isVisible(c.x, c.y, 6)) || (c.dead && c.deadT > 40 && !this.w.isVisible(c.x, c.y, 6));
      if (gone) {
        this.peds.splice(i, 1);
        this.w.removeChar(c);
      }
    }
    const district = this.w.city.districtAt(px, py);
    const dens = DENSITY[district] ?? 0.8;
    const max = Math.round(this.maxPeds * dens);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.peds.length < max) {
      this.spawnT = 0.08;
      this.trySpawn(px, py);
    }
  }

  private trySpawn(px: number, py: number): void {
    const city = this.w.city;
    for (let a = 0; a < 5; a++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(30, 85);
      const x = px + Math.cos(ang) * r;
      const y = py + Math.sin(ang) * r;
      const bid = city.blockAtWorld(x, y);
      if (bid < 0) continue;
      const b = city.blocks[bid];
      if (b.park && this.rng.chance(0.5)) continue;
      const s = ringProject(b, x, y);
      const offset = this.rng.range(-0.9, 0.9);
      ringPoint(b, s, offset, tmp);
      if (this.w.isVisible(tmp.x, tmp.y, 3)) continue;
      const tx = Math.floor(tmp.x / TILE);
      const ty = Math.floor(tmp.y / TILE);
      if (!city.isWalkableTile(tx, ty)) continue;
      const c = this.w.spawnChar(tmp.x, tmp.y, randomLook(this.rng), 'ped');
      const ai: PedAI = {
        kind: 'ped',
        block: bid,
        s,
        dir: this.rng.chance(0.5) ? 1 : -1,
        offset,
        speed: this.rng.range(1.15, WALK_SPEED),
        mode: 'walk',
        t: 0,
        fx: 0,
        fy: 0,
      };
      c.ai = ai;
      c.heading = this.rng.range(0, Math.PI * 2);
      this.peds.push(c);
      return;
    }
  }

  /** Make peds near (x,y) flee. */
  alarm(x: number, y: number, radius: number, severity: number): void {
    for (const c of this.peds) {
      const ai = c.ai as PedAI;
      if (!ai || c.dead) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > radius) continue;
      ai.mode = 'flee';
      ai.t = 3 + severity * 3 + this.rng.range(0, 2);
      ai.fx = x;
      ai.fy = y;
      c.panic = 1;
    }
  }

  step(dt: number): void {
    const city = this.w.city;
    for (const c of this.peds) {
      const ai = c.ai as PedAI;
      if (!ai || c.hidden) continue;
      if (c.isDown) {
        c.setMove(0, 0);
        continue;
      }
      // dodge fast cars heading at us
      if (ai.mode !== 'dodge') {
        for (const v of this.w.vehicles) {
          if (v.speed < 7 || v.dead) continue;
          const dx = c.x - v.x;
          const dy = c.y - v.y;
          if (Math.abs(dx) > 14 || Math.abs(dy) > 14) continue;
          const vel = v.body.getLinearVelocity();
          const sp = v.speed;
          const along = (dx * vel.x + dy * vel.y) / sp;
          if (along < 0 || along > 12) continue;
          const lat = (dx * vel.y - dy * vel.x) / sp;
          if (Math.abs(lat) < v.def.width / 2 + 1.0 && this.rng.chance(0.6)) {
            ai.mode = 'dodge';
            ai.t = 0.7;
            const side = lat >= 0 ? 1 : -1;
            ai.fx = (vel.y / sp) * side;
            ai.fy = (-vel.x / sp) * side;
            break;
          }
        }
      }
      const b = city.blocks[ai.block];
      switch (ai.mode) {
        case 'dodge': {
          ai.t -= dt;
          c.setMove(ai.fx * 5.5, ai.fy * 5.5);
          if (ai.t <= 0) ai.mode = 'return';
          break;
        }
        case 'flee': {
          ai.t -= dt;
          let dx = c.x - ai.fx;
          let dy = c.y - ai.fy;
          const d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
          c.setMove(dx * RUN_SPEED * 1.1, dy * RUN_SPEED * 1.1);
          if (ai.t <= 0) {
            ai.mode = 'return';
            c.panic = 0;
          }
          break;
        }
        case 'return': {
          // re-attach to the block we are standing in (or the nearest)
          const bid = city.blockAtWorld(c.x, c.y);
          if (bid >= 0) {
            ai.block = bid;
            ai.s = ringProject(city.blocks[bid], c.x, c.y);
          }
          ai.mode = 'walk';
          break;
        }
        case 'idle': {
          ai.t -= dt;
          c.setMove(0, 0);
          if (ai.t <= 0) ai.mode = 'walk';
          break;
        }
        default: {
          // walk along the ring
          const P = ringLen(b);
          ringPoint(b, ai.s + ai.dir * 2.2, ai.offset, tmp);
          let dx = tmp.x - c.x;
          let dy = tmp.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.01) {
            dx /= d;
            dy /= d;
          }
          const sp = d > 6 ? ai.speed * 1.3 : ai.speed;
          c.setMove(dx * sp, dy * sp);
          // advance the ring parameter only as fast as we actually follow
          const prog = d < 3.5 ? ai.speed * dt : ai.speed * dt * 0.2;
          ai.s = (ai.s + ai.dir * prog + P) % P;
          if (this.rng.chance(0.0012)) {
            ai.mode = 'idle';
            ai.t = this.rng.range(1, 4);
          } else if (this.rng.chance(0.0006)) ai.dir *= -1;
        }
      }
    }
  }
}
