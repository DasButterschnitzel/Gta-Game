// Helpers that find concrete places for mission scripts in the generated city.
import type { City } from '../world/city';
import { D, F_ROAD, G, MAP_W, P, TILE, Zone } from '../world/types';
import { RNG } from '../core/rng';

export interface Spot {
  x: number;
  y: number;
}

export interface LaneSpot extends Spot {
  h: number;
  edge: number;
  s: number;
}

/** nearest point on a driving lane (with heading) */
export function lanePoint(city: City, x: number, y: number, r = 60, heading?: number): LaneSpot | null {
  const hit = (heading !== undefined ? city.nearestLane(x, y, r, heading, Math.PI * 0.35, true) : null) ?? city.nearestLane(x, y, r, undefined, Math.PI, true);
  if (!hit) return null;
  const e = city.lanes[hit.edge];
  const out = { x: 0, y: 0, h: 0 };
  const s = Math.min(Math.max(hit.s, 3), e.len - 3);
  city.lanePoint(e, s, out);
  return { x: out.x, y: out.y, h: out.h, edge: hit.edge, s };
}

/** a walkable sidewalk / plaza tile between rMin and rMax metres from (x, y) */
export function sidewalkNear(city: City, x: number, y: number, rMin: number, rMax: number, rng: RNG, district?: D): Spot | null {
  for (let i = 0; i < 400; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(rMin, rMax);
    const tx = Math.floor((x + Math.cos(a) * r) / TILE);
    const ty = Math.floor((y + Math.sin(a) * r) / TILE);
    if (!city.inBounds(tx, ty)) continue;
    const idx = ty * MAP_W + tx;
    if (city.solid[idx] !== 0 || city.flags[idx] & F_ROAD) continue;
    if (district !== undefined && city.district[idx] !== district) continue;
    if (!city.isSidewalk(tx, ty) && city.ground[idx] !== G.Plaza && city.ground[idx] !== G.Pavers) continue;
    if (city.zoneAt(0, ty * TILE) !== Zone.Sued) continue;
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}

/** sidewalk points in front of buildings with ground-floor shops in a district */
export function shopFronts(city: City, district: D, near: Spot, maxDist: number, count: number, minSpacing: number, rng: RNG): Spot[] {
  const cands: Spot[] = [];
  for (const b of city.buildings) {
    if (!b.shops) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (city.districtAt(cx, cy) !== district) continue;
    if (Math.hypot(cx - near.x, cy - near.y) > maxDist) continue;
    const dirs: [number, number, number][] = [];
    if (b.shops & 1) dirs.push([b.x + b.w + 2.2, cy, 0]);
    if (b.shops & 2) dirs.push([cx, b.y + b.h + 2.2, 0]);
    if (b.shops & 4) dirs.push([b.x - 2.2, cy, 0]);
    if (b.shops & 8) dirs.push([cx, b.y - 2.2, 0]);
    for (const [x, y] of dirs) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!city.isWalkableTile(tx, ty)) continue;
      cands.push({ x, y });
    }
  }
  rng.shuffle(cands);
  const out: Spot[] = [];
  for (const c of cands) {
    if (Math.hypot(c.x - near.x, c.y - near.y) < 25) continue;
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > minSpacing)) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

export function playgroundNear(city: City, x: number, y: number, district?: D): Spot | null {
  let best: Spot | null = null;
  let bd = Infinity;
  for (const p of city.props) {
    if (p.t !== P.Playground) continue;
    if (district !== undefined && city.districtAt(p.x, p.y) !== district) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd && d > 40) {
      bd = d;
      best = { x: p.x, y: p.y };
    }
  }
  return best;
}

/** centre of a parking area near (x, y) */
export function parkingNear(city: City, x: number, y: number, rMin: number, rMax: number, rng: RNG): Spot | null {
  for (let i = 0; i < 600; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(rMin, rMax);
    const tx = Math.floor((x + Math.cos(a) * r) / TILE);
    const ty = Math.floor((y + Math.sin(a) * r) / TILE);
    if (!city.inBounds(tx, ty)) continue;
    const idx = ty * MAP_W + tx;
    if (city.ground[idx] !== G.Parking || city.solid[idx] !== 0) continue;
    if (city.zoneAt(0, ty * TILE) !== Zone.Sued) continue;
    // a little lot: the 8 neighbours are parking/drivable too
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!city.isWalkableTile(tx + dx, ty + dy)) ok = false;
    if (!ok) continue;
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}

/** the raised canal bridge closest to a point (approach side in the south zone) */
export function canalBridge(city: City, x: number, y: number): Spot {
  let best: Spot = { x, y: 420 };
  let bd = Infinity;
  for (const zb of city.zoneBarriers) {
    if (zb.zone !== Zone.Hafen) continue;
    const cx = (zb.x0 + zb.x1) / 2;
    const cy = zb.y1 + 6;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bd) {
      bd = d;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

/**
 * A lane point between rMin and rMax from (x, y), heading along the lane. `ok` can reject spots
 * (visible on screen, wrong direction …); `dir` biases the search towards a direction.
 */
export function laneSpotAround(city: City, x: number, y: number, rMin: number, rMax: number, rng: RNG, ok?: (s: LaneSpot) => boolean, dir?: number): LaneSpot | null {
  for (let i = 0; i < 80; i++) {
    const a = dir !== undefined && i < 50 ? dir + rng.range(-0.9, 0.9) : rng.range(0, Math.PI * 2);
    const r = rng.range(rMin, rMax);
    const sp = lanePoint(city, x + Math.cos(a) * r, y + Math.sin(a) * r, 25);
    if (!sp) continue;
    const d = Math.hypot(sp.x - x, sp.y - y);
    if (d < rMin * 0.8 || d > rMax * 1.25) continue;
    if (city.zoneAt(sp.x, sp.y) !== city.zoneAt(x, y)) continue;
    if (ok && !ok(sp)) continue;
    return sp;
  }
  return null;
}

/** heading of a lane spot points roughly towards (x, y) */
export function facing(sp: LaneSpot, x: number, y: number, tol = 1.7): boolean {
  const a = Math.atan2(y - sp.y, x - sp.x) - sp.h;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < tol;
}

/** nearest walkable, non-road tile centre to (x, y) within maxR metres */
export function walkableNear(city: City, x: number, y: number, maxR: number, allowRoad = false): Spot | null {
  const tx0 = Math.floor(x / TILE);
  const ty0 = Math.floor(y / TILE);
  const R = Math.ceil(maxR / TILE);
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (!city.inBounds(tx, ty) || !city.isWalkableTile(tx, ty)) continue;
        if (!allowRoad && city.flags[ty * MAP_W + tx] & F_ROAD) continue;
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
  }
  return null;
}

/** a walkable spot of a district (any zone) between rMin and rMax from (x, y) */
export function districtSpot(city: City, district: D, x: number, y: number, rMin: number, rMax: number, rng: RNG): Spot | null {
  for (let i = 0; i < 800; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(rMin, rMax);
    const tx = Math.floor((x + Math.cos(a) * r) / TILE);
    const ty = Math.floor((y + Math.sin(a) * r) / TILE);
    if (!city.inBounds(tx, ty)) continue;
    const idx = ty * MAP_W + tx;
    if (city.district[idx] !== district || !city.isWalkableTile(tx, ty)) continue;
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
