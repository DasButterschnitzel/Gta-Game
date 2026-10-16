// Lightweight geometry builders producing THREE.BufferGeometry from plain arrays.
import * as THREE from 'three';

export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  extra = new Map<string, { size: number; data: number[] }>();
  count = 0;

  constructor(extras: Record<string, number> = {}) {
    for (const [k, size] of Object.entries(extras)) this.extra.set(k, { size, data: [] });
  }

  /** push a vertex; extraVals keyed by attribute name */
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, r = 1, g = 1, b = 1): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, w);
    this.col.push(r, g, b);
    return this.count++;
  }

  ex(name: string, ...vals: number[]): void {
    const e = this.extra.get(name)!;
    for (const v of vals) e.data.push(v);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  get empty(): boolean {
    return this.count === 0;
  }

  build(opts: { normals?: boolean; colors?: boolean; uvs?: boolean } = {}): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (opts.normals !== false) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    if (opts.uvs !== false) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (opts.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [k, e] of this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(e.data, e.size));
    if (this.count > 65535) g.setIndex(new THREE.Uint32BufferAttribute(this.idx, 1));
    else g.setIndex(new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/**
 * Add an oriented box (no bottom face) to a vertex-coloured builder with an emit attribute.
 * Box centred at (cx, cy) on the ground plane, from z0 up to z0+h, rotated by rot.
 */
export function addBox(
  gb: GeoBuilder,
  cx: number,
  cy: number,
  z0: number,
  w: number,
  d: number,
  h: number,
  rot: number,
  color: number,
  emit: [number, number, number, number] = [0, 0, 0, 0],
  topColor?: number,
): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hw = w / 2;
  const hd = d / 2;
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const P = corners.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  const [r, g, b] = rgb(color);
  const [tr, tg, tb] = rgb(topColor ?? color);
  const z1 = z0 + h;
  // sides
  for (let i = 0; i < 4; i++) {
    const a = P[i];
    const bb = P[(i + 1) % 4];
    const ex = bb[0] - a[0];
    const ey = bb[1] - a[1];
    const len = Math.hypot(ex, ey) || 1;
    const nx = ey / len;
    const ny = -ex / len;
    const i0 = gb.v(a[0], a[1], z0, nx, ny, 0, 0, 0, r, g, b);
    const i1 = gb.v(bb[0], bb[1], z0, nx, ny, 0, 1, 0, r, g, b);
    const i2 = gb.v(bb[0], bb[1], z1, nx, ny, 0, 1, 1, r, g, b);
    const i3 = gb.v(a[0], a[1], z1, nx, ny, 0, 0, 1, r, g, b);
    for (let k = 0; k < 4; k++) gb.ex('aEmit', ...emit);
    gb.quad(i0, i1, i2, i3);
  }
  // top
  const t0 = gb.v(P[0][0], P[0][1], z1, 0, 0, 1, 0, 0, tr, tg, tb);
  const t1 = gb.v(P[1][0], P[1][1], z1, 0, 0, 1, 1, 0, tr, tg, tb);
  const t2 = gb.v(P[2][0], P[2][1], z1, 0, 0, 1, 1, 1, tr, tg, tb);
  const t3 = gb.v(P[3][0], P[3][1], z1, 0, 0, 1, 0, 1, tr, tg, tb);
  for (let k = 0; k < 4; k++) gb.ex('aEmit', ...emit);
  gb.quad(t0, t1, t2, t3);
}

/** Vertical prism with n sides (cylinder approximation), vertex coloured. */
export function addCyl(
  gb: GeoBuilder,
  cx: number,
  cy: number,
  z0: number,
  r: number,
  h: number,
  color: number,
  topColor?: number,
  n = 8,
  emit: [number, number, number, number] = [0, 0, 0, 0],
): void {
  const [cr, cg, cb] = rgb(color);
  const [tr, tg, tb] = rgb(topColor ?? color);
  const z1 = z0 + h;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am);
    const ny = Math.sin(am);
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const i0 = gb.v(x0, y0, z0, nx, ny, 0, 0, 0, cr, cg, cb);
    const i1 = gb.v(x1, y1, z0, nx, ny, 0, 1, 0, cr, cg, cb);
    const i2 = gb.v(x1, y1, z1, nx, ny, 0, 1, 1, cr, cg, cb);
    const i3 = gb.v(x0, y0, z1, nx, ny, 0, 0, 1, cr, cg, cb);
    for (let k = 0; k < 4; k++) gb.ex('aEmit', ...emit);
    gb.quad(i0, i1, i2, i3);
  }
  const c0 = gb.v(cx, cy, z1, 0, 0, 1, 0.5, 0.5, tr, tg, tb);
  gb.ex('aEmit', ...emit);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push(gb.v(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1, 0, 0, 1, 0, 0, tr, tg, tb));
    gb.ex('aEmit', ...emit);
  }
  for (let i = 0; i < n; i++) gb.tri(c0, ring[i], ring[(i + 1) % n]);
}

/** Make a texture array from raw RGBA layers. */
export function makeArrayTexture(data: Uint8Array, w: number, h: number, depth: number, opts: { nearest?: boolean; repeat?: boolean } = {}): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, w, h, depth);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  if (opts.nearest) {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapNearestFilter;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.generateMipmaps = true;
  tex.wrapS = opts.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = opts.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
