// A* route planning on the lane graph (used by police pursuits and later by mission AI / GPS).
import type { City } from './city';
import { Turn } from './types';

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Find a sequence of lane edges leading from `from` (exclusive) to an edge that ends within
 * `goalR` metres of (tx, ty). Returns null if nothing is found within `maxExpand` expansions.
 */
export function findRoute(city: City, from: number, tx: number, ty: number, goalR = 26, maxExpand = 2500, blocked?: (id: number) => boolean): number[] | null {
  const lanes = city.lanes;
  const start = lanes[from];
  if (!start) return null;
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const open = new MinHeap();
  const endX = (id: number): number => lanes[id].xs[lanes[id].xs.length - 1];
  const endY = (id: number): number => lanes[id].ys[lanes[id].ys.length - 1];
  const h = (id: number): number => Math.hypot(endX(id) - tx, endY(id) - ty);
  g.set(from, 0);
  open.push(h(from), from);
  let expanded = 0;
  let best = from;
  let bestH = h(from);
  while (open.size && expanded < maxExpand) {
    const cur = open.pop();
    expanded++;
    const hc = h(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    if (hc < goalR && cur !== from) return unwind(parent, from, cur);
    const gc = g.get(cur)!;
    for (const nx of lanes[cur].next) {
      if (blocked && (blocked(nx) || (lanes[nx].road < 0 && lanes[nx].next.length > 0 && lanes[nx].next.every((n) => blocked(n))))) continue;
      const e = lanes[nx];
      // police may take any turn; U-turns cost extra
      const cost = e.len * (e.turn === Turn.UTurn ? 3 : 1) + (e.turn === Turn.Left || e.turn === Turn.Right ? 4 : 0);
      const ng = gc + cost;
      const old = g.get(nx);
      if (old !== undefined && old <= ng) continue;
      g.set(nx, ng);
      parent.set(nx, cur);
      open.push(ng + h(nx), nx);
    }
  }
  // fall back to the closest edge reached
  if (best !== from && bestH < Math.hypot(endX(from) - tx, endY(from) - ty)) return unwind(parent, from, best);
  return null;
}

function unwind(parent: Map<number, number>, from: number, to: number): number[] {
  const path: number[] = [];
  let c = to;
  let guard = 0;
  while (c !== from && guard++ < 5000) {
    path.push(c);
    const p = parent.get(c);
    if (p === undefined) break;
    c = p;
  }
  path.reverse();
  return path;
}

/** Walk forward along the lane graph preferring straight ahead; returns edges covering `dist` metres. */
export function walkAhead(city: City, from: number, s: number, dist: number): { edge: number; s: number } {
  const lanes = city.lanes;
  let e = from;
  let rem = dist + s;
  let guard = 0;
  while (rem > lanes[e].len && guard++ < 50) {
    rem -= lanes[e].len;
    const nx = lanes[e].next;
    if (!nx.length) return { edge: e, s: lanes[e].len };
    let pick = nx[0];
    for (const n of nx) if (lanes[n].turn === Turn.Straight || lanes[n].turn === Turn.Lane) pick = n;
    e = pick;
  }
  return { edge: e, s: Math.min(rem, lanes[e].len) };
}

// ------------------------------------------------------------------------------------------
// On-foot navigation: A* over walkable tiles (8-neighbourhood, no corner cutting) + string pulling.

/** true if the straight segment between two world points stays on walkable tiles */
export function walkableLine(city: City, x0: number, y0: number, x1: number, y1: number): boolean {
  const T = 4;
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / (T * 0.45)));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const tx = Math.floor((x0 + (x1 - x0) * t) / T);
    const ty = Math.floor((y0 + (y1 - y0) * t) / T);
    if (!city.isWalkableTile(tx, ty)) return false;
  }
  return true;
}

/**
 * Tile path from (x0,y0) to (x1,y1) in world metres. Returns waypoints (world metres, excluding the
 * start) or null. Search is limited to `maxNodes` expansions.
 */
export function findFootPath(city: City, x0: number, y0: number, x1: number, y1: number, maxNodes = 3000): { x: number; y: number }[] | null {
  const T = 4;
  const W = city.w;
  const sx = Math.floor(x0 / T);
  const sy = Math.floor(y0 / T);
  let gx = Math.floor(x1 / T);
  let gy = Math.floor(y1 / T);
  if (!city.inBounds(sx, sy) || !city.inBounds(gx, gy)) return null;
  // goal inside a building? use the nearest walkable tile
  if (!city.isWalkableTile(gx, gy)) {
    let found = false;
    for (let r = 1; r <= 3 && !found; r++) {
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          if (city.isWalkableTile(gx + dx, gy + dy)) {
            gx += dx;
            gy += dy;
            found = true;
          }
        }
      }
    }
    if (!found) return null;
  }
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const open = new MinHeap();
  const h = (i: number): number => {
    const dx = Math.abs((i % W) - gx);
    const dy = Math.abs(Math.floor(i / W) - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  g.set(start, 0);
  open.push(h(start), start);
  let expanded = 0;
  let best = start;
  let bestH = h(start);
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];
  let reached = false;
  while (open.size && expanded < maxNodes) {
    const cur = open.pop();
    expanded++;
    if (cur === goal) {
      reached = true;
      best = cur;
      break;
    }
    const hc = h(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    const gc = g.get(cur)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!city.isWalkableTile(nx, ny)) continue;
      if (dx && dy && (!city.isWalkableTile(cx + dx, cy) || !city.isWalkableTile(cx, cy + dy))) continue;
      const ni = ny * W + nx;
      const ng = gc + cost;
      const old = g.get(ni);
      if (old !== undefined && old <= ng) continue;
      g.set(ni, ng);
      parent.set(ni, cur);
      open.push(ng + h(ni), ni);
    }
  }
  if (!reached && best === start) return null;
  // unwind
  const tiles: number[] = [];
  let c = best;
  let guard = 0;
  while (c !== start && guard++ < 20000) {
    tiles.push(c);
    const p = parent.get(c);
    if (p === undefined) break;
    c = p;
  }
  tiles.reverse();
  const pts = tiles.map((i) => ({ x: ((i % W) + 0.5) * T, y: (Math.floor(i / W) + 0.5) * T }));
  if (reached) pts[pts.length - 1] = { x: x1, y: y1 };
  // string pulling
  const out: { x: number; y: number }[] = [];
  let ax = x0;
  let ay = y0;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !walkableLine(city, ax, ay, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    ax = pts[j].x;
    ay = pts[j].y;
    i = j + 1;
  }
  return out;
}
