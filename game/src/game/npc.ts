// Scripted NPCs (mission thugs, gang members, allies): attack / guard / flee / follow / go-to.
import type { Game } from './game';
import { Character, RUN_SPEED, WALK_SPEED } from './character';
import { Arsenal, type WeaponId } from './weapons';
import { findFootPath, walkableLine } from '../world/route';
import { RNG } from '../core/rng';

export type NpcMode = 'idle' | 'attack' | 'flee' | 'goto' | 'guard' | 'follow';

export interface NpcAI {
  kind: 'npc';
  mode: NpcMode;
  target: Character | null;
  gx: number;
  gy: number;
  accuracy: number;
  /** guard/idle: attack the target when it comes this close */
  aggro: number;
  /** flee when health drops below this fraction */
  fleeAt: number;
  speed: number;
  arrived: boolean;
  burstT: number;
  losT: number;
  los: boolean;
  path: { x: number; y: number }[] | null;
  pathT: number;
  stuckT: number;
  sideT: number;
  sideDir: number;
  /** gang index (-1 none) for respect bookkeeping */
  gang: number;
}

export interface NpcOptions {
  mode?: NpcMode;
  target?: Character | null;
  weapon?: WeaponId | null;
  accuracy?: number;
  aggro?: number;
  fleeAt?: number;
  speed?: number;
  health?: number;
  armor?: number;
  gang?: number;
  gx?: number;
  gy?: number;
}

export class NpcSystem {
  readonly list: Character[] = [];
  private rng = new RNG(808);

  constructor(private g: Game) {}

  /** turn a character into a scripted NPC */
  add(c: Character, o: NpcOptions = {}): NpcAI {
    const ai: NpcAI = {
      kind: 'npc',
      mode: o.mode ?? 'idle',
      target: o.target ?? null,
      gx: o.gx ?? c.x,
      gy: o.gy ?? c.y,
      accuracy: o.accuracy ?? 0.5,
      aggro: o.aggro ?? 18,
      fleeAt: o.fleeAt ?? 0,
      speed: o.speed ?? RUN_SPEED,
      arrived: false,
      burstT: this.rng.range(0.6, 1.4),
      losT: 0,
      los: false,
      path: null,
      pathT: 0,
      stuckT: 0,
      sideT: 0,
      sideDir: 1,
      gang: o.gang ?? -1,
    };
    c.ai = ai;
    c.arsenal = new Arsenal();
    if (o.weapon) c.arsenal.give(o.weapon, 9999, true);
    if (o.health) c.health = c.maxHealth = o.health;
    if (o.armor) c.armor = o.armor;
    c.hostile = ai.mode === 'attack';
    if (!this.list.includes(c)) this.list.push(c);
    return ai;
  }

  step(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (!this.g.chars.includes(c)) {
        this.list.splice(i, 1);
        continue;
      }
      const ai = c.ai as NpcAI | null;
      if (!ai || ai.kind !== 'npc' || c.hidden || c.dead) continue;
      if (c.isDown) {
        c.setMove(0, 0);
        continue;
      }
      this.think(c, ai, dt);
    }
  }

  private think(c: Character, ai: NpcAI, dt: number): void {
    const t = ai.target;
    if (ai.fleeAt > 0 && c.health < c.maxHealth * ai.fleeAt && ai.mode !== 'flee') {
      ai.mode = 'flee';
      c.hostile = false;
    }
    switch (ai.mode) {
      case 'idle':
        c.setMove(0, 0);
        if (t && !t.dead && c.hostile && this.dist(c, t) < ai.aggro) ai.mode = 'attack';
        break;
      case 'guard': {
        if (t && !t.dead && this.dist(c, t) < ai.aggro && this.g.combat.los(c.x, c.y, this.tx(t), this.ty(t))) {
          ai.mode = 'attack';
          c.hostile = true;
          break;
        }
        this.moveTo(c, ai, ai.gx, ai.gy, dt, WALK_SPEED, 0.8);
        break;
      }
      case 'goto': {
        const d = Math.hypot(ai.gx - c.x, ai.gy - c.y);
        if (d < 1.2) {
          ai.arrived = true;
          c.setMove(0, 0);
        } else this.moveTo(c, ai, ai.gx, ai.gy, dt, ai.speed, 1);
        break;
      }
      case 'follow': {
        if (!t || t.dead) {
          c.setMove(0, 0);
          break;
        }
        const d = this.dist(c, t);
        if (d > 3) this.moveTo(c, ai, this.tx(t), this.ty(t), dt, d > 8 ? RUN_SPEED : WALK_SPEED * 1.4, 1);
        else c.setMove(0, 0);
        break;
      }
      case 'flee': {
        const fx = t ? this.tx(t) : this.g.player.x;
        const fy = t ? this.ty(t) : this.g.player.y;
        let dx = c.x - fx;
        let dy = c.y - fy;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        c.wantHeading = null;
        c.setMove(dx * RUN_SPEED * 1.1, dy * RUN_SPEED * 1.1);
        c.panic = 1;
        break;
      }
      case 'attack':
        this.attack(c, ai, dt);
        break;
    }
  }

  private tx(t: Character): number {
    return t === this.g.player.char ? this.g.player.x : t.x;
  }

  private ty(t: Character): number {
    return t === this.g.player.char ? this.g.player.y : t.y;
  }

  private dist(c: Character, t: Character): number {
    return Math.hypot(this.tx(t) - c.x, this.ty(t) - c.y);
  }

  private attack(c: Character, ai: NpcAI, dt: number): void {
    const g = this.g;
    const t = ai.target;
    if (!t || t.dead) {
      ai.mode = 'idle';
      c.setMove(0, 0);
      return;
    }
    const tx = this.tx(t);
    const ty = this.ty(t);
    const dx = tx - c.x;
    const dy = ty - c.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    ai.losT -= dt;
    if (ai.losT <= 0) {
      ai.losT = 0.25;
      ai.los = dist < 32 && g.combat.los(c.x, c.y, tx, ty);
    }
    const ars = c.arsenal;
    const def = ars?.def;
    const ang = Math.atan2(dy, dx);
    if (def && def.kind === 'throw') {
      // molotov / grenade throwers keep their distance and lob
      if (ai.los && dist < 15 && dist > 3.5) {
        c.setMove(0, 0);
        c.wantHeading = ang;
        c.heading = ang;
        ai.burstT -= dt;
        if (ars!.cooldown <= 0 && ai.burstT <= 0) {
          ars!.cooldown = 1.2;
          ai.burstT = this.rng.range(2.4, 4.0);
          c.throwAnim();
          const j = 1.5 + dist * 0.12;
          g.combat.throwItem(c, def.id as 'molotov' | 'grenade', c.x + Math.cos(ang) * 0.5, c.y + Math.sin(ang) * 0.5, tx + this.rng.range(-j, j), ty + this.rng.range(-j, j), null);
        }
        return;
      }
      c.wantHeading = null;
      this.moveTo(c, ai, tx, ty, dt, ai.speed, 9);
      return;
    }
    if (def && def.kind === 'gun') {
      if (ai.los && dist < def.range * 0.8 && dist > 1.5) {
        ai.burstT -= dt;
        if (ai.burstT > 0) {
          c.setMove(0, 0);
          c.wantHeading = ang;
          c.heading = ang;
          c.aim(0.5);
          if (ars!.cooldown <= 0) {
            ars!.cooldown = def.interval * (def.id === 'pistol' ? 2.0 : 1.6) + this.rng.range(0, 0.2);
            g.combat.fireGun(c, def.id, c.x + Math.cos(ang) * 0.55, c.y + Math.sin(ang) * 0.55, ang, ai.accuracy, null);
          }
          return;
        }
        if (ai.burstT < -this.rng.range(0.6, 1.4)) ai.burstT = this.rng.range(1.0, 2.0);
      }
      c.wantHeading = null;
      this.moveTo(c, ai, tx, ty, dt, ai.speed, 6);
      return;
    }
    // melee
    if (dist < 1.35 && !(t.hidden && t.vehicle)) {
      c.setMove(0, 0);
      c.wantHeading = ang;
      c.heading = ang;
      if (ars && ars.cooldown <= 0 && !t.isDown) {
        ars.cooldown = (def?.interval ?? 0.4) * 2.6 + this.rng.range(0.1, 0.5);
        g.combat.melee(c, def?.id ?? 'fists', ang);
      }
      return;
    }
    c.wantHeading = null;
    this.moveTo(c, ai, tx, ty, dt, ai.speed, 1.1);
  }

  /** move towards (tx, ty), with foot path-finding around buildings and side-stepping */
  moveTo(c: Character, ai: NpcAI, tx: number, ty: number, dt: number, speed: number, stopAt: number): void {
    const g = this.g;
    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d <= stopAt) {
      c.setMove(0, 0);
      return;
    }
    let mx = dx / d;
    let my = dy / d;
    ai.pathT -= dt;
    if (d > 4 && !walkableLine(g.city, c.x, c.y, tx, ty)) {
      if (!ai.path || ai.pathT <= 0) {
        ai.pathT = 1.2;
        ai.path = findFootPath(g.city, c.x, c.y, tx, ty, 2500);
      }
      const p = ai.path;
      while (p && p.length && Math.hypot(p[0].x - c.x, p[0].y - c.y) < 1.2) p.shift();
      if (p && p.length) {
        const px = p[0].x - c.x;
        const py = p[0].y - c.y;
        const pl = Math.hypot(px, py) || 0.001;
        mx = px / pl;
        my = py / pl;
      }
    } else ai.path = null;
    const vel = c.body.getLinearVelocity();
    if (Math.hypot(vel.x, vel.y) < 0.5) {
      ai.stuckT += dt;
      if (ai.stuckT > 0.5) {
        ai.stuckT = 0;
        ai.sideT = 0.7;
        ai.sideDir = this.rng.chance(0.5) ? 1 : -1;
      }
    } else ai.stuckT = 0;
    if (ai.sideT > 0) {
      ai.sideT -= dt;
      const sx = -my * ai.sideDir;
      const sy = mx * ai.sideDir;
      mx = mx * 0.3 + sx;
      my = my * 0.3 + sy;
      const l = Math.hypot(mx, my) || 1;
      mx /= l;
      my /= l;
    }
    c.setMove(mx * speed, my * speed);
  }

  /** all listed NPCs dead (or fled far / knocked out when `downOk`) */
  allDown(list: Character[], fledDist = 60): boolean {
    const p = this.g.player;
    return list.every((c) => c.dead || !this.g.chars.includes(c) || ((c.ai as NpcAI | null)?.mode === 'flee' && Math.hypot(c.x - p.x, c.y - p.y) > fledDist));
  }
}
