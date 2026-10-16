// Physics world (planck.js / Box2D). Static city colliders + impact reporting.
import * as planck from 'planck';
import type { City } from '../world/city';
import { P, Roof } from '../world/types';

export const CAT_STATIC = 0x0001;
export const CAT_VEHICLE = 0x0002;
export const CAT_CHAR = 0x0004;
export const CAT_DEAD = 0x0008;
export const CAT_DEBRIS = 0x0010;
export const CAT_BARRIER = 0x0020;

export type PhysKind = 'static' | 'vehicle' | 'char' | 'barrier' | 'debris';

export interface PhysTag {
  kind: PhysKind;
  /** owning entity (Vehicle or Character) */
  ref?: unknown;
  /** material: 'wall' | 'tree' | 'metal' | 'glass' ... used for impact sounds */
  mat?: string;
}

export interface Impact {
  a: PhysTag;
  b: PhysTag;
  impulse: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
}

const wm = { normal: { x: 0, y: 0 }, points: [] as planck.Vec2Value[], separations: [] as number[], pointCount: 0 };

export class Physics {
  readonly world: planck.World;
  private staticBodies: planck.Body[] = [];
  private barrierBodies = new Map<number, planck.Body[]>();
  impacts: Impact[] = [];
  /** Max impulse per contact pair per step (dedupe). */
  private pairSeen = new Map<string, Impact>();

  constructor(city: City | null) {
    this.world = new planck.World({ gravity: planck.Vec2(0, 0) });
    this.world.on('post-solve', (contact, impulse) => {
      const fa = contact.getFixtureA();
      const fb = contact.getFixtureB();
      const ta = fa.getUserData() as PhysTag | undefined;
      const tb = fb.getUserData() as PhysTag | undefined;
      if (!ta || !tb) return;
      let imp = 0;
      const ni = impulse.normalImpulses;
      for (let i = 0; i < ni.length; i++) imp += ni[i];
      if (imp < 50) return;
      const m = contact.getWorldManifold(null);
      const px = m && m.pointCount > 0 ? m.points[0].x : fa.getBody().getPosition().x;
      const py = m && m.pointCount > 0 ? m.points[0].y : fa.getBody().getPosition().y;
      const key = `${fa.getBody().getUserData() ?? 's'}-${fb.getBody().getUserData() ?? 's'}`;
      const prev = this.pairSeen.get(key);
      if (prev) {
        if (imp > prev.impulse) {
          prev.impulse = imp;
          prev.x = px;
          prev.y = py;
        }
        return;
      }
      const it: Impact = { a: ta, b: tb, impulse: imp, x: px, y: py, nx: m ? m.normal.x : 0, ny: m ? m.normal.y : 0 };
      this.pairSeen.set(key, it);
      this.impacts.push(it);
    });
    void wm;
    if (city) this.buildStatic(city);
  }

  private newStaticBody(): planck.Body {
    const b = this.world.createBody({ type: 'static', position: planck.Vec2(0, 0) });
    this.staticBodies.push(b);
    return b;
  }

  private buildStatic(city: City): void {
    // One static body per 128 m cell keeps fixture trees balanced.
    const cells = new Map<number, planck.Body>();
    const bodyAt = (x: number, y: number): planck.Body => {
      const key = Math.floor(y / 128) * 64 + Math.floor(x / 128);
      let b = cells.get(key);
      if (!b) {
        b = this.newStaticBody();
        cells.set(key, b);
      }
      return b;
    };
    const opt = (mat: string) => ({
      friction: 0.35,
      restitution: 0.1,
      filterCategoryBits: CAT_STATIC,
      filterMaskBits: CAT_VEHICLE | CAT_CHAR | CAT_DEBRIS,
      userData: { kind: 'static', mat } as PhysTag,
    });
    for (const bd of city.buildings) {
      const cx = bd.x + bd.w / 2;
      const cy = bd.y + bd.h / 2;
      const body = bodyAt(cx, cy);
      if (bd.roof === Roof.Round) {
        body.createFixture(new planck.Circle(planck.Vec2(cx, cy), Math.min(bd.w, bd.h) / 2), opt('metal'));
      } else {
        body.createFixture(new planck.Box(bd.w / 2, bd.h / 2, planck.Vec2(cx, cy), 0), opt('wall'));
      }
    }
    for (const r of city.railings) {
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      bodyAt(cx, cy).createFixture(new planck.Box((r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2, planck.Vec2(cx, cy), 0), opt('metal'));
    }
    for (const p of city.props) {
      const body = bodyAt(p.x, p.y);
      switch (p.t) {
        case P.Tree:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 0.35), opt('tree'));
          break;
        case P.TreeSmall:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 0.22), opt('tree'));
          break;
        case P.Bollard:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 0.2), opt('metal'));
          break;
        case P.Litfass:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 0.65), opt('wall'));
          break;
        case P.Fountain:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 2.6), opt('wall'));
          break;
        case P.TrafficLight:
          body.createFixture(new planck.Circle(planck.Vec2(p.x, p.y), 0.16), opt('metal'));
          break;
        case P.Phone:
          body.createFixture(new planck.Box(0.55, 0.55, planck.Vec2(p.x, p.y), 0), opt('glass'));
          break;
        case P.Kiosk:
          body.createFixture(new planck.Box(1.6, 1.3, planck.Vec2(p.x, p.y), p.rot), opt('wall'));
          break;
        case P.Hedge:
          body.createFixture(new planck.Box((p.w ?? 1) / 2, (p.h ?? 1) / 2, planck.Vec2(p.x, p.y), 0), opt('hedge'));
          break;
        case P.Fence:
          body.createFixture(new planck.Box((p.w ?? 4) / 2, (p.h ?? 0.2) / 2, planck.Vec2(p.x, p.y), 0), opt('metal'));
          break;
        case P.BusStop:
          body.createFixture(new planck.Box(1.6, 0.25, planck.Vec2(p.x - Math.cos(p.rot) * 0.6, p.y - Math.sin(p.rot) * 0.6), p.rot + Math.PI / 2), opt('glass'));
          break;
        case P.Crane: {
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          for (const [ax, ay] of [
            [-5, -6],
            [5, -6],
            [-5, 6],
            [5, 6],
          ]) {
            body.createFixture(new planck.Box(0.55, 0.55, planck.Vec2(p.x + ax * c - ay * s, p.y + ax * s + ay * c), p.rot), opt('metal'));
          }
          break;
        }
        default:
          break;
      }
    }
    // zone barriers
    city.zoneBarriers.forEach((zb, i) => {
      const b = this.world.createBody({ type: 'static', position: planck.Vec2(0, 0) });
      b.createFixture(new planck.Box((zb.x1 - zb.x0) / 2, (zb.y1 - zb.y0) / 2, planck.Vec2((zb.x0 + zb.x1) / 2, (zb.y0 + zb.y1) / 2), 0), {
        friction: 0.4,
        restitution: 0.2,
        filterCategoryBits: CAT_BARRIER,
        filterMaskBits: CAT_VEHICLE | CAT_CHAR,
        userData: { kind: 'barrier', mat: 'wood' } as PhysTag,
      });
      const list = this.barrierBodies.get(zb.zone) ?? [];
      list.push(b);
      this.barrierBodies.set(zb.zone, list);
      void i;
    });
  }

  /** Remove the barriers that lock a zone. */
  unlockZone(zone: number): void {
    const list = this.barrierBodies.get(zone);
    if (!list) return;
    for (const b of list) this.world.destroyBody(b);
    this.barrierBodies.delete(zone);
  }

  isZoneLocked(zone: number): boolean {
    return this.barrierBodies.has(zone);
  }

  step(dt: number): void {
    this.impacts.length = 0;
    this.pairSeen.clear();
    this.world.step(dt, 8, 3);
  }

  /** First static/vehicle hit along a ray. */
  rayCast(x0: number, y0: number, x1: number, y1: number, mask = CAT_STATIC | CAT_VEHICLE | CAT_BARRIER): { x: number; y: number; frac: number; tag: PhysTag } | null {
    let best: { x: number; y: number; frac: number; tag: PhysTag } | null = null;
    this.world.rayCast(planck.Vec2(x0, y0), planck.Vec2(x1, y1), (fixture, point, _normal, fraction) => {
      if (fixture.isSensor()) return -1;
      const cat = fixture.getFilterCategoryBits();
      if (!(cat & mask)) return -1;
      best = { x: point.x, y: point.y, frac: fraction, tag: fixture.getUserData() as PhysTag };
      return fraction;
    });
    return best;
  }
}
