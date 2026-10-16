// Small math helpers. Hot paths avoid allocations, so most helpers take and return plain numbers.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Move value toward target by at most maxDelta. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Signed shortest difference b - a in radians. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + angleDiff(current, target) * (1 - Math.exp(-lambda * dt));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function len2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Distance from point p to segment ab, also returns t along segment via out param. */
export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number, out?: { t: number }): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp01(t);
  if (out) out.t = t;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return dist2(px, py, cx, cy);
}

/** 32-bit integer hash (used for deterministic per-tile variation). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return h >>> 0;
}

export function hash01(x: number, y: number, seed = 0): number {
  return hash2(x, y, seed) / 4294967296;
}

/** Format euros the German way: 12.345 € */
export function formatEuro(v: number): string {
  const n = Math.round(v);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + s + ' €';
}
