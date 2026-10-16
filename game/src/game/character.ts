// Characters (player and pedestrians): circle body, simple state machine, sprite frames.
import * as planck from 'planck';
import { Physics, CAT_CHAR, CAT_STATIC, CAT_VEHICLE, CAT_BARRIER, CAT_DEAD, type PhysTag } from '../physics/physics';
import { F_WALK, F_RUN, F_IDLE, F_PUNCH, F_DEAD, F_DOWN, F_PISTOL, F_RIFLE, F_BAT, F_SIT, type CharLook } from '../render/charSprites';
import type { Vehicle } from './vehicle';
import { clamp, angleDiff } from '../core/math';
import { RNG } from '../core/rng';

export type CharState = 'idle' | 'walk' | 'run' | 'attack' | 'aim' | 'down' | 'dead' | 'driving' | 'entering' | 'sitting';
export type Role = 'player' | 'ped' | 'cop' | 'gang' | 'driver' | 'medic' | 'story';

let nextCharId = 1;

export const WALK_SPEED = 1.7;
export const RUN_SPEED = 4.6;
export const SPRINT_SPEED = 6.6;

export class Character {
  readonly id = nextCharId++;
  readonly body: planck.Body;
  readonly fixture: planck.Fixture;
  readonly tag: PhysTag;
  heading = 0;
  health = 100;
  maxHealth = 100;
  armor = 0;
  state: CharState = 'idle';
  anim = 0;
  vehicle: Vehicle | null = null;
  role: Role;
  /** desired velocity (m/s) */
  wantX = 0;
  wantY = 0;
  /** turn towards movement direction */
  faceMove = true;
  wantHeading: number | null = null;
  downT = 0;
  deadT = 0;
  attackT = 0;
  attackFrame = 0;
  flash = 0;
  prevX: number;
  prevY: number;
  weaponPose: 'none' | 'pistol' | 'rifle' | 'bat' = 'none';
  /** AI controller (pedestrian / cop / gang) */
  ai: unknown = null;
  gang = -1;
  hidden = false;
  /** for fleeing peds etc. */
  panic = 0;
  lastAttacker: Character | null = null;
  removeMe = false;

  constructor(
    readonly physics: Physics,
    x: number,
    y: number,
    public look: CharLook,
    role: Role = 'ped',
  ) {
    this.role = role;
    this.prevX = x;
    this.prevY = y;
    this.tag = { kind: 'char', ref: this, mat: 'flesh' };
    this.body = physics.world.createBody({ type: 'dynamic', position: planck.Vec2(x, y), fixedRotation: true, linearDamping: 0, allowSleep: true });
    this.body.setUserData(1000000 + this.id);
    this.fixture = this.body.createFixture(new planck.Circle(planck.Vec2(0, 0), 0.32), {
      density: 75 / (Math.PI * 0.32 * 0.32),
      friction: 0,
      restitution: 0,
      filterCategoryBits: CAT_CHAR,
      filterMaskBits: CAT_STATIC | CAT_VEHICLE | CAT_CHAR | CAT_BARRIER,
      userData: this.tag,
    });
  }

  get x(): number {
    return this.body.getPosition().x;
  }
  get y(): number {
    return this.body.getPosition().y;
  }
  get dead(): boolean {
    return this.state === 'dead';
  }
  get alive(): boolean {
    return this.state !== 'dead';
  }
  get active(): boolean {
    return !this.hidden && this.state !== 'dead';
  }
  get isDown(): boolean {
    return this.state === 'down' || this.state === 'dead';
  }

  setMove(vx: number, vy: number): void {
    this.wantX = vx;
    this.wantY = vy;
  }

  step(dt: number): void {
    const pos = this.body.getPosition();
    this.prevX = pos.x;
    this.prevY = pos.y;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    if (this.hidden) return;
    const v = this.body.getLinearVelocity();
    if (this.state === 'dead') {
      this.deadT += dt;
      this.body.setLinearVelocity(planck.Vec2(v.x * (1 - Math.min(1, dt * 5)), v.y * (1 - Math.min(1, dt * 5))));
      return;
    }
    if (this.state === 'down') {
      this.downT -= dt;
      this.body.setLinearVelocity(planck.Vec2(v.x * (1 - Math.min(1, dt * 4)), v.y * (1 - Math.min(1, dt * 4))));
      if (this.downT <= 0) this.standUp();
      return;
    }
    if (this.attackT > 0) this.attackT -= dt;
    // velocity control
    const accel = 28;
    const dvx = this.wantX - v.x;
    const dvy = this.wantY - v.y;
    const dl = Math.hypot(dvx, dvy);
    const maxD = accel * dt;
    const k = dl > maxD ? maxD / dl : 1;
    this.body.setLinearVelocity(planck.Vec2(v.x + dvx * k, v.y + dvy * k));
    const sp = Math.hypot(this.wantX, this.wantY);
    // heading
    let target: number | null = this.wantHeading;
    if (target === null && this.faceMove && sp > 0.2) target = Math.atan2(this.wantY, this.wantX);
    if (target !== null) {
      const d = angleDiff(this.heading, target);
      const turn = 12 * dt;
      this.heading += clamp(d, -turn, turn);
    }
    // animation state
    const actual = Math.hypot(v.x, v.y);
    if (this.state !== 'attack' && this.state !== 'aim' && this.state !== 'sitting' && this.state !== 'entering') {
      this.state = actual > RUN_SPEED * 0.75 ? 'run' : actual > 0.3 ? 'walk' : 'idle';
    }
    if (this.state === 'attack' && this.attackT <= 0) this.state = 'idle';
    const stride = this.state === 'run' ? 1.9 : 1.15;
    this.anim += (actual / stride) * dt;
  }

  /** Knock down with an impulse; recovers after t seconds. */
  knockDown(vx: number, vy: number, t: number): void {
    if (this.state === 'dead' || this.hidden) return;
    this.state = 'down';
    this.downT = Math.max(this.downT, t);
    this.body.setLinearVelocity(planck.Vec2(vx, vy));
    this.setCollideChars(false);
    if (Math.hypot(vx, vy) > 0.5) this.heading = Math.atan2(vy, vx) + Math.PI;
  }

  standUp(): void {
    if (this.state === 'dead') return;
    this.state = 'idle';
    this.downT = 0;
    this.setCollideChars(true);
  }

  kill(vx = 0, vy = 0): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.health = 0;
    this.deadT = 0;
    this.body.setLinearVelocity(planck.Vec2(vx, vy));
    this.fixture.setFilterData({ groupIndex: 0, categoryBits: CAT_DEAD, maskBits: CAT_STATIC });
    if (Math.hypot(vx, vy) > 0.5) this.heading = Math.atan2(vy, vx) + Math.PI;
  }

  private setCollideChars(on: boolean): void {
    this.fixture.setFilterData({
      groupIndex: 0,
      categoryBits: CAT_CHAR,
      maskBits: on ? CAT_STATIC | CAT_VEHICLE | CAT_CHAR | CAT_BARRIER : CAT_STATIC | CAT_BARRIER | CAT_VEHICLE,
    });
  }

  /** returns true if the hit killed the character */
  damage(amount: number, by: Character | null = null, vx = 0, vy = 0): boolean {
    if (this.state === 'dead') return false;
    let a = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, a * 0.7);
      this.armor -= absorbed;
      a -= absorbed;
    }
    this.health -= a;
    this.flash = 1;
    if (by) this.lastAttacker = by;
    if (this.health <= 0) {
      this.kill(vx, vy);
      return true;
    }
    return false;
  }

  hide(): void {
    this.hidden = true;
    this.body.setActive(false);
  }

  showAt(x: number, y: number, heading: number): void {
    this.hidden = false;
    this.body.setTransform(planck.Vec2(x, y), 0);
    this.body.setLinearVelocity(planck.Vec2(0, 0));
    this.body.setActive(true);
    this.prevX = x;
    this.prevY = y;
    this.heading = heading;
    this.state = 'idle';
  }

  punch(): void {
    if (this.isDown || this.attackT > 0) return;
    this.state = 'attack';
    this.attackT = 0.32;
    this.attackFrame = (this.attackFrame + 1) % 2;
  }

  frame(): number {
    switch (this.state) {
      case 'dead':
        return F_DEAD + (this.id % 2);
      case 'down':
        return F_DOWN;
      case 'sitting':
        return F_SIT;
      case 'attack':
        if (this.weaponPose === 'bat') return F_BAT + (this.attackT > 0.16 ? 0 : 1);
        return F_PUNCH + (this.attackT > 0.16 ? 0 : 1);
      case 'aim':
        return this.weaponPose === 'rifle' ? F_RIFLE : F_PISTOL;
      case 'run':
        return F_RUN + (Math.floor(this.anim * 8) % 8);
      case 'walk':
      case 'entering':
        return F_WALK + (Math.floor(this.anim * 8) % 8);
      default:
        if (this.weaponPose === 'pistol' || this.weaponPose === 'rifle') return this.weaponPose === 'rifle' ? F_RIFLE : F_PISTOL;
        return F_IDLE;
    }
  }

  destroy(): void {
    this.physics.world.destroyBody(this.body);
  }
}

// ------------------------------------------------------------------------------------------
// Looks
// ------------------------------------------------------------------------------------------
const SKINS = [0xf2d0b6, 0xe8b896, 0xd8a07a, 0xc08060, 0x9a6444, 0x6e4430, 0x4e3022, 0xf6dcc8];
const HAIRS = [0x1e1a16, 0x3a2a1e, 0x6a4a2a, 0xa8743a, 0xd8b060, 0xe8d8a0, 0x8a8a8a, 0xd8d8d8, 0x7a2a1a, 0x2a2a2a];
const TOPS = [0x2a4a7a, 0x7a1e22, 0x2e5a3a, 0x1e1e22, 0xe8e8e4, 0x8a8a8e, 0xd0a020, 0x5a3a6a, 0xc8602a, 0x3a8ab0, 0xa04060, 0x4a6a2a, 0xe8c8c8, 0x26303a];
const BOTTOMS = [0x1e2a44, 0x2a2a2e, 0x3a4a5a, 0x6a5a4a, 0x1a1a1a, 0x8a7a5a, 0x4a4a52, 0x2e3a5a];
const SHOES = [0x1a1a1a, 0xe8e8e8, 0x5a3a2a, 0x8a8a8a, 0xc83a2a];
const ACCENTS = [0xc8302a, 0x2a6ab0, 0xe0c020, 0x1a1a1a, 0xe8e8e8, 0x3a8a3a];

export function randomLook(rng: RNG): CharLook {
  return {
    skin: rng.pick(SKINS),
    hair: rng.pick(HAIRS),
    top: rng.pick(TOPS),
    bottom: rng.pick(BOTTOMS),
    shoes: rng.pick(SHOES),
    accent: rng.pick(ACCENTS),
  };
}

export const LOOKS = {
  kai: { skin: 0xe2b28e, hair: 0x2a221c, top: 0x2a2d33, bottom: 0x3a4a62, shoes: 0x1a1a1a, accent: 0x8a8a8a } as CharLook,
  cop: { skin: 0xe8b896, hair: 0x1e2a44, top: 0x2a3e72, bottom: 0x1e2436, shoes: 0x111111, accent: 0xd8e01a } as CharLook,
  medic: { skin: 0xd8a07a, hair: 0x3a2a1e, top: 0xff5a2a, bottom: 0xe8e8e8, shoes: 0x1a1a1a, accent: 0xe8e8e8 } as CharLook,
};
