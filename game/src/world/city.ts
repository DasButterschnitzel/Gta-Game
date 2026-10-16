// The City container: tile layers + derived structures, plus fast query helpers.
import {
  MAP_W,
  MAP_H,
  TILE,
  G,
  D,
  F_ROAD,
  F_SIDEWALK,
  SOLID_WATER,
  type Road,
  type Junction,
  type Block,
  type Building,
  type Prop,
  type LaneEdge,
  type ParkedSpot,
  type POI,
  type Railing,
  Zone,
  zoneOfTileY,
} from './types';

export const LANE_CELL = 32; // metres per lane-index cell

export class City {
  readonly w = MAP_W;
  readonly h = MAP_H;
  ground = new Uint8Array(MAP_W * MAP_H);
  district = new Uint8Array(MAP_W * MAP_H);
  solid = new Uint8Array(MAP_W * MAP_H);
  flags = new Uint8Array(MAP_W * MAP_H);
  /** variant/rotation bits for ground rendering */
  gvar = new Uint8Array(MAP_W * MAP_H);
  blockAt = new Int32Array(MAP_W * MAP_H).fill(-1);
  roadAt = new Int32Array(MAP_W * MAP_H).fill(-1);
  junctionAt = new Int32Array(MAP_W * MAP_H).fill(-1);
  buildingAt = new Int32Array(MAP_W * MAP_H).fill(-1);

  roads: Road[] = [];
  junctions: Junction[] = [];
  blocks: Block[] = [];
  buildings: Building[] = [];
  props: Prop[] = [];
  lanes: LaneEdge[] = [];
  parked: ParkedSpot[] = [];
  railings: Railing[] = [];
  pois = new Map<string, POI>();
  /** zone barriers: list of railing indices per zone lock */
  zoneBarriers: { zone: Zone; x0: number; y0: number; x1: number; y1: number }[] = [];

  /** lane spatial index: cell -> lane ids */
  laneGrid = new Map<number, number[]>();
  /** incoming / outgoing lane ids per junction */
  jIn: number[][] = [];
  jOut: number[][] = [];

  idx(tx: number, ty: number): number {
    return ty * MAP_W + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
  }

  groundAt(tx: number, ty: number): G {
    if (!this.inBounds(tx, ty)) return G.Wall;
    return this.ground[ty * MAP_W + tx];
  }

  isRoad(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && (this.flags[ty * MAP_W + tx] & F_ROAD) !== 0;
  }

  isSidewalk(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && (this.flags[ty * MAP_W + tx] & F_SIDEWALK) !== 0;
  }

  isWaterTile(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.solid[ty * MAP_W + tx] === SOLID_WATER;
  }

  /** world metres -> is the point over (deep) water? */
  isWaterAt(x: number, y: number): boolean {
    return this.isWaterTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  districtAt(x: number, y: number): D {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!this.inBounds(tx, ty)) return D.None;
    return this.district[ty * MAP_W + tx];
  }

  zoneAt(_x: number, y: number): Zone {
    return zoneOfTileY(Math.floor(y / TILE));
  }

  blockAtWorld(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!this.inBounds(tx, ty)) return -1;
    return this.blockAt[ty * MAP_W + tx];
  }

  /** Build the lane spatial index (call after lanes are created). */
  indexLanes(): void {
    this.laneGrid.clear();
    const cols = Math.ceil((MAP_W * TILE) / LANE_CELL);
    for (const e of this.lanes) {
      const seen = new Set<number>();
      const n = e.xs.length;
      for (let i = 0; i < n - 1; i++) {
        const ax = e.xs[i];
        const ay = e.ys[i];
        const bx = e.xs[i + 1];
        const by = e.ys[i + 1];
        const segLen = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(segLen / (LANE_CELL * 0.5)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          const key = Math.floor(y / LANE_CELL) * cols + Math.floor(x / LANE_CELL);
          if (!seen.has(key)) {
            seen.add(key);
            let arr = this.laneGrid.get(key);
            if (!arr) this.laneGrid.set(key, (arr = []));
            arr.push(e.id);
          }
        }
      }
    }
  }

  /**
   * Find nearest lane point. If heading is given, lanes whose direction differs by more than
   * maxAngle are skipped. Returns null when nothing within radius.
   */
  nearestLane(
    x: number,
    y: number,
    radius = 24,
    heading?: number,
    maxAngle = Math.PI / 2,
    lanesOnly = false,
  ): { edge: number; s: number; dist: number; px: number; py: number } | null {
    const cols = Math.ceil((MAP_W * TILE) / LANE_CELL);
    const cx0 = Math.floor((x - radius) / LANE_CELL);
    const cx1 = Math.floor((x + radius) / LANE_CELL);
    const cy0 = Math.floor((y - radius) / LANE_CELL);
    const cy1 = Math.floor((y + radius) / LANE_CELL);
    let best: { edge: number; s: number; dist: number; px: number; py: number } | null = null;
    const checked = new Set<number>();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.laneGrid.get(cy * cols + cx);
        if (!arr) continue;
        for (const id of arr) {
          if (checked.has(id)) continue;
          checked.add(id);
          const e = this.lanes[id];
          if (lanesOnly && e.road < 0) continue;
          const n = e.xs.length;
          for (let i = 0; i < n - 1; i++) {
            const ax = e.xs[i];
            const ay = e.ys[i];
            const bx = e.xs[i + 1];
            const by = e.ys[i + 1];
            const abx = bx - ax;
            const aby = by - ay;
            const l2 = abx * abx + aby * aby;
            if (l2 < 1e-6) continue;
            if (heading !== undefined) {
              const segH = Math.atan2(aby, abx);
              let d = Math.abs(segH - heading) % (Math.PI * 2);
              if (d > Math.PI) d = Math.PI * 2 - d;
              if (d > maxAngle) continue;
            }
            let t = ((x - ax) * abx + (y - ay) * aby) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + abx * t;
            const py = ay + aby * t;
            const dist = Math.hypot(x - px, y - py);
            if (dist <= radius && (!best || dist < best.dist)) {
              best = { edge: id, s: e.cum[i] + Math.sqrt(l2) * t, dist, px, py };
            }
          }
        }
      }
    }
    return best;
  }

  /** Point and heading at distance s along lane edge. */
  lanePoint(e: LaneEdge, s: number, out: { x: number; y: number; h: number }): void {
    const n = e.xs.length;
    if (s <= 0) {
      out.x = e.xs[0];
      out.y = e.ys[0];
      out.h = Math.atan2(e.ys[1] - e.ys[0], e.xs[1] - e.xs[0]);
      return;
    }
    if (s >= e.len) {
      out.x = e.xs[n - 1];
      out.y = e.ys[n - 1];
      out.h = Math.atan2(e.ys[n - 1] - e.ys[n - 2], e.xs[n - 1] - e.xs[n - 2]);
      return;
    }
    // binary search segment
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (e.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const segLen = e.cum[hi] - e.cum[lo];
    const t = segLen > 0 ? (s - e.cum[lo]) / segLen : 0;
    out.x = e.xs[lo] + (e.xs[hi] - e.xs[lo]) * t;
    out.y = e.ys[lo] + (e.ys[hi] - e.ys[lo]) * t;
    out.h = Math.atan2(e.ys[hi] - e.ys[lo], e.xs[hi] - e.xs[lo]);
  }

  /** Is the tile walkable for pedestrians (sidewalk-like, no building/water)? */
  isWalkableTile(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * MAP_W + tx;
    return this.solid[i] === 0;
  }

  isDriveTile(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const i = ty * MAP_W + tx;
    return (this.flags[i] & F_ROAD) !== 0;
  }

  /** ground kind under a world point, used for surface sounds / grip */
  surfaceAt(x: number, y: number): G {
    return this.groundAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }
}
