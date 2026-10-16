// Procedural low-poly vehicle models, liveries and the vehicle shader.
import * as THREE from 'three';
import { GeoBuilder, rgb } from './geom';
import type { VehicleDef } from '../game/vehicleDefs';
import { GU, SHADER_COMMON } from './globals';
import { makeCanvas } from './texgen';

// emissive slots
export const E_HEAD = 1;
export const E_TAIL = 2;
export const E_REVERSE = 3;
export const E_BLUE_A = 4;
export const E_BLUE_B = 5;
export const E_AMBER = 6;
export const E_WHITE = 7;
export const E_TAXI = 8;

const GLASS = 0x16202a;
const TRIM = 0x24262a;
const TYRE = 0x141414;

interface VB {
  gb: GeoBuilder;
}

function vert(
  b: VB,
  x: number,
  y: number,
  z: number,
  n: [number, number, number],
  color: number,
  paint: number,
  emit = 0,
  wheel: [number, number, number] = [0, 0, 0],
  gloss = 0,
): number {
  const [r, g, bb] = rgb(color);
  const i = b.gb.v(x, y, z, n[0], n[1], n[2], 0, 0, r, g, bb);
  b.gb.ex('aPaint', paint);
  b.gb.ex('aEmit', emit);
  b.gb.ex('aWheel', ...wheel);
  b.gb.ex('aGloss', gloss);
  return i;
}

/** Extruded prism from a CCW polygon (local xy), z0 -> z1 (per-vertex top heights allowed). */
function prism(
  b: VB,
  poly: [number, number][],
  z0: number,
  zTop: number | ((x: number, y: number) => number),
  sideColor: number,
  sidePaint: number,
  topColor: number,
  topPaint: number,
  opts: { emit?: number; wheel?: [number, number, number]; gloss?: number; sideGloss?: number; noTop?: boolean } = {},
): void {
  const zt = typeof zTop === 'number' ? () => zTop : zTop;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey) || 1;
    const nrm: [number, number, number] = [ey / len, -ex / len, 0];
    const i0 = vert(b, ax, ay, z0, nrm, sideColor, sidePaint, opts.emit ?? 0, opts.wheel, opts.sideGloss ?? 0);
    const i1 = vert(b, bx, by, z0, nrm, sideColor, sidePaint, opts.emit ?? 0, opts.wheel, opts.sideGloss ?? 0);
    const i2 = vert(b, bx, by, zt(bx, by), nrm, sideColor, sidePaint, opts.emit ?? 0, opts.wheel, opts.sideGloss ?? 0);
    const i3 = vert(b, ax, ay, zt(ax, ay), nrm, sideColor, sidePaint, opts.emit ?? 0, opts.wheel, opts.sideGloss ?? 0);
    b.gb.quad(i0, i1, i2, i3);
  }
  if (opts.noTop) return;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of poly) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  const up: [number, number, number] = [0, 0, 1];
  const c = vert(b, cx, cy, zt(cx, cy), up, topColor, topPaint, opts.emit ?? 0, opts.wheel, opts.gloss ?? 0);
  const ring = poly.map(([x, y]) => vert(b, x, y, zt(x, y), up, topColor, topPaint, opts.emit ?? 0, opts.wheel, opts.gloss ?? 0));
  for (let i = 0; i < n; i++) b.gb.tri(c, ring[i], ring[(i + 1) % n]);
}

function rect(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

function chamferRect(x0: number, y0: number, x1: number, y1: number, c: number): [number, number][] {
  return [
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
    [x0 + c, y0],
    [x1 - c, y0],
  ];
}

/** Tapered cabin: base rect at z0 to top rect at z1. Faces: front, rear, sides, top. */
function cabin(
  b: VB,
  bx0: number,
  bx1: number,
  bw: number,
  tx0: number,
  tx1: number,
  tw: number,
  z0: number,
  z1: number,
  frontColor: number,
  rearColor: number,
  sideColor: number,
  roofPaint: boolean,
  sidePaint = 0,
  frontPaint = 0,
  rearPaint = 0,
): void {
  const face = (p: [number, number, number][], color: number, paint: number, gloss: number): void => {
    // normal from first three points
    const ux = p[1][0] - p[0][0];
    const uy = p[1][1] - p[0][1];
    const uz = p[1][2] - p[0][2];
    const vx = p[2][0] - p[0][0];
    const vy = p[2][1] - p[0][1];
    const vz = p[2][2] - p[0][2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const ids = p.map(([x, y, z]) => vert(b, x, y, z, [nx, ny, nz], color, paint, 0, [0, 0, 0], gloss));
    b.gb.quad(ids[0], ids[1], ids[2], ids[3]);
  };
  // front (windshield) facing +x
  face(
    [
      [bx1, -bw, z0],
      [bx1, bw, z0],
      [tx1, tw, z1],
      [tx1, -tw, z1],
    ],
    frontColor,
    frontPaint,
    1,
  );
  // rear facing -x
  face(
    [
      [bx0, bw, z0],
      [bx0, -bw, z0],
      [tx0, -tw, z1],
      [tx0, tw, z1],
    ],
    rearColor,
    rearPaint,
    1,
  );
  // left side (+y)
  face(
    [
      [bx1, bw, z0],
      [bx0, bw, z0],
      [tx0, tw, z1],
      [tx1, tw, z1],
    ],
    sideColor,
    sidePaint,
    0.6,
  );
  // right side (-y)
  face(
    [
      [bx0, -bw, z0],
      [bx1, -bw, z0],
      [tx1, -tw, z1],
      [tx0, -tw, z1],
    ],
    sideColor,
    sidePaint,
    0.6,
  );
  // roof
  face(
    [
      [tx0, -tw, z1],
      [tx1, -tw, z1],
      [tx1, tw, z1],
      [tx0, tw, z1],
    ],
    roofPaint ? 0xffffff : sideColor,
    roofPaint ? 1 : 0,
    1,
  );
}

function box(
  b: VB,
  cx: number,
  cy: number,
  z0: number,
  lx: number,
  ly: number,
  h: number,
  color: number,
  paint = 0,
  emit = 0,
  wheel: [number, number, number] = [0, 0, 0],
  topColor?: number,
): void {
  prism(b, rect(cx - lx / 2, cy - ly / 2, cx + lx / 2, cy + ly / 2), z0, z0 + h, color, paint, topColor ?? color, paint, { emit, wheel });
}

const geoCache = new Map<string, THREE.BufferGeometry>();

export function vehicleGeometry(def: VehicleDef): THREE.BufferGeometry {
  const cached = geoCache.get(def.id);
  if (cached) return cached;
  const gb = new GeoBuilder({ aPaint: 1, aEmit: 1, aWheel: 3, aGloss: 1 });
  const b: VB = { gb };
  const m = def.model;
  const L = def.length;
  const W = def.width;
  const hl = L / 2;
  const hw = W / 2;
  const clear = def.heavy ? 0.45 : 0.24;
  const at = (f: number): number => -hl + f * L; // fraction along length -> local x

  // ---- wheels (drawn first so the body overlaps) ----
  const wr = m.wheelR ?? (def.heavy ? 0.5 : 0.33);
  const wbh = def.wheelbase / 2;
  const frontX = def.model.body === 'bus' ? hl - 2.6 : wbh;
  const rearX = def.model.body === 'bus' ? -hl + 3.2 : -wbh;
  const ww = def.heavy ? 0.36 : 0.24;
  const wy = hw - ww / 2 + 0.04;
  for (const side of [-1, 1]) {
    box(b, frontX, side * wy, 0, wr * 2, ww, wr * 2, TYRE, 0, 0, [1, frontX, side * wy]);
    box(b, rearX, side * wy, 0, wr * 2, ww, wr * 2, TYRE, 0, 0);
    if (def.heavy && L > 8) box(b, rearX + wr * 2.3, side * wy, 0, wr * 2, ww, wr * 2, TYRE, 0, 0);
  }

  // ---- lower body ----
  const body = m.body;
  const lowerTop = (x: number, _y: number): number => {
    // hood drop towards the front
    const f = (x + hl) / L;
    return m.beltZ - Math.max(0, (f - 0.75) / 0.25) * m.hoodDrop;
  };
  const hullPoly = chamferRect(-hl, -hw, hl, hw, m.chamfer);
  prism(b, hullPoly, clear, lowerTop, 0xffffff, 1, 0xffffff, 1, { gloss: 1, sideGloss: 0.6 });

  // bumpers
  box(b, hl - 0.06, 0, clear - 0.05, 0.16, W - m.chamfer * 1.4, 0.26, TRIM);
  box(b, -hl + 0.06, 0, clear - 0.05, 0.16, W - m.chamfer * 1.4, 0.26, TRIM);

  // ---- upper structures by body style ----
  const glass = m.glass ?? GLASS;
  if (body === 'hatch' || body === 'sedan' || body === 'wagon' || body === 'coupe' || body === 'micro') {
    cabin(b, at(m.cabRear), at(m.cabFront), hw - 0.08, at(m.roofRear), at(m.roofFront), hw - m.roofInset, m.beltZ, m.roofZ, glass, glass, glass, true);
    // mirrors
    const mx = at(m.cabFront) - 0.15;
    box(b, mx, hw + 0.08, m.beltZ - 0.02, 0.14, 0.18, 0.12, 0xffffff, 1);
    box(b, mx, -hw - 0.08, m.beltZ - 0.02, 0.14, 0.18, 0.12, 0xffffff, 1);
  } else if (body === 'van') {
    if (m.box) {
      // RTW: cab + box
      cabin(b, at(m.cabRear), at(m.cabFront), hw - 0.06, at(m.roofRear), at(m.roofFront), hw - m.roofInset, m.beltZ, m.roofZ, glass, 0xffffff, glass, true, 0, 0, 1);
      prism(b, rect(at(m.box.from), -hw + 0.02, at(m.box.to), hw - 0.02), clear + 0.1, m.box.z, 0xffffff, 1, 0xffffff, 1, { gloss: 0.6, sideGloss: 0.3 });
    } else {
      // panel van: glass windscreen, painted body
      cabin(b, at(0.02), at(m.cabFront), hw - 0.05, at(0.02), at(m.roofFront), hw - m.roofInset, m.beltZ, m.roofZ, glass, 0xffffff, 0xffffff, true, 1, 0, 1);
    }
    const mx = at(m.cabFront) - 0.2;
    box(b, mx, hw + 0.12, m.beltZ + 0.1, 0.16, 0.24, 0.3, TRIM);
    box(b, mx, -hw - 0.12, m.beltZ + 0.1, 0.16, 0.24, 0.3, TRIM);
  } else if (body === 'truck' || body === 'firetruck' || body === 'garbage') {
    // cab
    cabin(b, at(m.cabRear), at(m.cabFront), hw - 0.04, at(m.roofRear), at(m.roofFront), hw - m.roofInset, m.beltZ, m.roofZ, glass, 0xffffff, 0xffffff, true, 1, 0, 1);
    const bx = m.box!;
    const bc = bx.color ?? 0xffffff;
    const bp = bx.color ? 0 : 1;
    if (body === 'garbage') {
      // rounded-ish body: chamfered prism
      prism(b, chamferRect(at(bx.from), -hw + 0.04, at(bx.to), hw - 0.04, 0.35), clear + 0.3, bx.z, bc, bp, bc, bp, { gloss: 0.5 });
    } else {
      prism(b, rect(at(bx.from), -hw + 0.02, at(bx.to), hw - 0.02), clear + 0.3, bx.z, bc, bp, bc, bp, { gloss: 0.4 });
    }
    if (m.ladder) {
      // turntable ladder on the roof (fire)
      const lx0 = at(0.06);
      const lx1 = at(0.98);
      const lz = bx.z;
      box(b, (lx0 + lx1) / 2, -0.45, lz, lx1 - lx0, 0.12, 0.25, 0xb8bcc2);
      box(b, (lx0 + lx1) / 2, 0.45, lz, lx1 - lx0, 0.12, 0.25, 0xb8bcc2);
      for (let x = lx0 + 0.3; x < lx1; x += 0.5) box(b, x, 0, lz + 0.05, 0.08, 0.9, 0.12, 0xd8dce0);
      box(b, at(0.08), 0, lz, 1.2, 1.4, 0.6, 0x8a8e94);
    }
    const mx = at(m.cabFront) - 0.3;
    box(b, mx, hw + 0.15, m.beltZ + 0.4, 0.16, 0.3, 0.4, TRIM);
    box(b, mx, -hw - 0.15, m.beltZ + 0.4, 0.16, 0.3, 0.4, TRIM);
  } else if (body === 'bus') {
    // body box with window band
    prism(b, chamferRect(-hl + 0.05, -hw + 0.02, hl - 0.05, hw - 0.02, 0.3), m.beltZ - 0.05, m.beltZ + 1.1, glass, 0, glass, 0, { noTop: true, sideGloss: 1 });
    prism(b, chamferRect(-hl + 0.05, -hw + 0.02, hl - 0.05, hw - 0.02, 0.3), m.beltZ + 1.1, m.roofZ, 0xffffff, 1, 0xffffff, 1, { gloss: 0.6 });
    // roof AC units
    box(b, -hl + 3.0, 0, m.roofZ, 2.2, 1.6, 0.35, 0xd0d4d8);
    box(b, 1.5, 0, m.roofZ, 1.4, 1.4, 0.3, 0xd0d4d8);
  }

  // ---- lights ----
  const hz = def.heavy ? m.beltZ - 0.35 : lowerTop(hl, 0) - 0.12;
  const hlw = Math.min(0.42, W * 0.22);
  for (const side of [-1, 1]) {
    box(b, hl - 0.06, side * (hw - m.chamfer * 0.6 - hlw / 2), hz, 0.14, hlw, 0.12, 0xdedad0, 0, E_HEAD);
    box(b, -hl + 0.05, side * (hw - m.chamfer * 0.5 - 0.22), (def.heavy ? 0.6 : m.beltZ - 0.18), 0.12, 0.4, 0.13, 0x8a1010, 0, E_TAIL);
  }
  // grille
  box(b, hl - 0.02, 0, hz - 0.02, 0.08, W * 0.36, 0.16, TRIM);

  // ---- extras ----
  if (m.spoiler) {
    const sx = -hl + 0.28;
    const sz = lowerTop(sx, 0) + 0.22;
    box(b, sx, 0, sz, 0.28, W - 0.3, 0.06, 0xffffff, 1);
    box(b, sx, 0.5, sz - 0.2, 0.1, 0.06, 0.2, TRIM);
    box(b, sx, -0.5, sz - 0.2, 0.1, 0.06, 0.2, TRIM);
  }
  if (m.taxiSign) {
    const tx = at((m.roofRear + m.roofFront) / 2);
    box(b, tx, 0, m.roofZ, 0.24, 0.62, 0.2, 0xf2d21a, 0, E_TAXI);
  }
  if (m.lightbar) {
    const roofTop = body === 'van' && m.box ? m.box.z : body === 'truck' || body === 'firetruck' || body === 'garbage' ? m.roofZ : m.roofZ;
    const lx = body === 'van' || body === 'firetruck' || body === 'garbage' ? at(m.roofFront) - 0.4 : at((m.roofRear + m.roofFront) / 2) + 0.15;
    const lw = Math.min(W - 0.3, 1.3);
    if (m.lightbar === 'yellow') {
      box(b, lx, -lw / 3, roofTop, 0.3, 0.32, 0.18, 0xd89a10, 0, E_AMBER);
      box(b, lx, lw / 3, roofTop, 0.3, 0.32, 0.18, 0xd89a10, 0, E_AMBER);
    } else if (m.lightbar === 'magnet') {
      // unmarked car: one magnetic blue beacon on the driver's side + flashers behind the grille
      box(b, lx, hw - 0.45, roofTop, 0.26, 0.26, 0.16, 0x1a3aa8, 0, E_BLUE_A);
      box(b, at(1) - 0.04, -0.35, m.beltZ - 0.25, 0.06, 0.18, 0.08, 0x1a3aa8, 0, E_BLUE_B);
      box(b, at(1) - 0.04, 0.35, m.beltZ - 0.25, 0.06, 0.18, 0.08, 0x1a3aa8, 0, E_BLUE_A);
    } else {
      box(b, lx, 0, roofTop, 0.32, lw * 0.36, 0.12, 0xe8e8e8, 0, E_WHITE);
      box(b, lx, -lw * 0.34, roofTop, 0.34, lw * 0.32, 0.16, 0x1a3aa8, 0, E_BLUE_A);
      box(b, lx, lw * 0.34, roofTop, 0.34, lw * 0.32, 0.16, 0x1a3aa8, 0, E_BLUE_B);
      if (m.lightbar === 'ambulance' || m.lightbar === 'fire') {
        // rear beacons
        const rx = body === 'van' ? at(m.box ? m.box.from : 0.02) + 0.25 : at(0.04);
        const rz = m.box ? m.box.z : m.roofZ;
        box(b, rx, -hw + 0.25, rz, 0.24, 0.24, 0.16, 0x1a3aa8, 0, E_BLUE_B);
        box(b, rx, hw - 0.25, rz, 0.24, 0.24, 0.16, 0x1a3aa8, 0, E_BLUE_A);
      }
    }
  }

  const g = gb.build({ colors: true, uvs: false });
  geoCache.set(def.id, g);
  return g;
}

// ------------------------------------------------------------------------------------------
// Liveries (256 x 128 canvas: top half = top projection, bottom half = side projection)
// ------------------------------------------------------------------------------------------

const liveryCache = new Map<string, THREE.Texture>();

export function vehicleLivery(def: VehicleDef): THREE.Texture | null {
  const key = def.model.livery;
  if (!key) return null;
  const cached = liveryCache.get(def.id);
  if (cached) return cached;
  const W = 256;
  const H = 128;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  // top half: u along length (0 = rear .. 1 = front), v 0..64 = left(+y) .. right(-y)
  const top = { x: 0, y: 0, w: W, h: 64 };
  const side = { x: 0, y: 64, w: W, h: 64 };
  const text = (t: string, x: number, y: number, size: number, color: string, rot = 0, font = 'bold'): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.font = `${font} ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 0, 0);
    ctx.restore();
  };
  const L = def.length;
  const fx = (f: number): number => f * W; // fraction of length -> x pixel
  switch (key) {
    case 'police': {
      // hood and tailgate blue, neon-yellow edge lines, roof number
      ctx.fillStyle = '#1f3c8c';
      ctx.fillRect(fx(0.72), top.y, fx(0.28), top.h);
      ctx.fillRect(0, top.y, fx(0.08), top.h);
      text('POLIZEI', fx(0.86), 32, 13, '#ffffff', -Math.PI / 2);
      ctx.fillStyle = '#d8f01a';
      ctx.fillRect(0, 2, W, 3);
      ctx.fillRect(0, 59, W, 3);
      text('NH 3-17', fx(0.33), 32, 15, '#10141c', -Math.PI / 2);
      // side: blue band with neon stripe and text
      ctx.fillStyle = '#1f3c8c';
      ctx.fillRect(0, side.y + 26, W, 26);
      ctx.fillStyle = '#d8f01a';
      ctx.fillRect(0, side.y + 22, W, 4);
      text('POLIZEI', fx(0.5), side.y + 39, 18, '#ffffff');
      break;
    }
    case 'sek': {
      text('POLIZEI', fx(0.45), 32, 22, '#e8e8e8', -Math.PI / 2);
      ctx.fillStyle = '#c8d0d8';
      ctx.fillRect(0, side.y + 30, W, 4);
      text('POLIZEI', fx(0.5), side.y + 44, 18, '#e8e8e8');
      break;
    }
    case 'taxi': {
      text('TAXI 2 22 22', fx(0.5), side.y + 30, 16, '#1a1a1a');
      break;
    }
    case 'kronwache': {
      // private security: gloss black, thin gold pinstripe, crown on the bonnet
      ctx.fillStyle = '#b8962e';
      ctx.fillRect(0, side.y + 24, W, 2);
      text('KRONWACHE', fx(0.5), side.y + 36, 11, '#8a7438');
      text('♛', fx(0.88), 32, 20, '#b8962e', -Math.PI / 2);
      // roof rails
      ctx.fillStyle = '#8a9098';
      ctx.fillRect(fx(0.12), 11, fx(0.44), 3);
      ctx.fillRect(fx(0.12), 50, fx(0.44), 3);
      break;
    }
    case 'beweis': {
      // police transporter: blue/neon side band, bonnet "POLIZEI", roof number
      ctx.fillStyle = '#1f3c8c';
      ctx.fillRect(fx(0.8), top.y, fx(0.2), top.h);
      text('POLIZEI', fx(0.9), 32, 12, '#ffffff', -Math.PI / 2);
      text('NH 1-40', fx(0.4), 32, 18, '#10141c', -Math.PI / 2);
      ctx.fillStyle = '#d8f01a';
      ctx.fillRect(0, 2, W, 3);
      ctx.fillRect(0, 59, W, 3);
      ctx.fillStyle = '#1f3c8c';
      ctx.fillRect(0, side.y + 28, W, 22);
      ctx.fillStyle = '#d8f01a';
      ctx.fillRect(0, side.y + 24, W, 4);
      text('POLIZEI', fx(0.5), side.y + 39, 16, '#ffffff');
      break;
    }
    case 'bse': {
      // federal special unit: matt olive, armour plates, yellow unit code
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 8; x < W; x += 36) ctx.fillRect(x, 6, 2, 52);
      text('BSE-9', fx(0.45), 32, 24, '#d8c01a', -Math.PI / 2);
      ctx.fillStyle = '#d8c01a';
      ctx.fillRect(0, side.y + 46, W, 4);
      text('BUNDESSICHERHEIT', fx(0.5), side.y + 30, 13, '#d8d8c8');
      break;
    }
    case 'ambulance': {
      // red-orange reflective bands along the top edges and the sides
      ctx.fillStyle = '#ff4a1a';
      ctx.fillRect(0, 0, W, 9);
      ctx.fillRect(0, 55, W, 9);
      for (let x = 0; x < 50; x += 14) {
        ctx.fillStyle = x % 28 ? '#ffd21a' : '#ff4a1a';
        ctx.fillRect(x, 9, 14, 46);
      }
      text('112', fx(0.62), 32, 22, '#ff4a1a', -Math.PI / 2);
      ctx.fillStyle = '#ff4a1a';
      ctx.fillRect(0, side.y + 34, W, 16);
      text('RETTUNGSDIENST', fx(0.5), side.y + 24, 15, '#c81e1e');
      break;
    }
    case 'fire': {
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, 3, W, 5);
      ctx.fillRect(0, 56, W, 5);
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(0, side.y + 36, W, 6);
      text('FEUERWEHR', fx(0.45), side.y + 22, 18, '#f2f2f2');
      text('NEUHAFEN', fx(0.45), side.y + 52, 11, '#f2f2f2');
      break;
    }
    case 'parcel': {
      ctx.fillStyle = '#d42020';
      ctx.fillRect(0, 26, W, 12);
      text('PAKETBLITZ', fx(0.42), 32, 15, '#f2c41a', 0);
      ctx.fillStyle = '#d42020';
      ctx.fillRect(0, side.y + 40, W, 10);
      text('PAKETBLITZ', fx(0.45), side.y + 24, 20, '#d42020');
      break;
    }
    case 'gti': {
      ctx.fillStyle = '#121212';
      ctx.fillRect(fx(0.05), 20, fx(0.95), 7);
      ctx.fillRect(fx(0.05), 37, fx(0.95), 7);
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, side.y + 48, W, 5);
      text('GISELA', fx(0.4), side.y + 30, 12, '#121212', 0, 'italic bold');
      break;
    }
    case 'race': {
      ctx.fillStyle = '#121212';
      ctx.fillRect(fx(0.0), 24, W, 6);
      ctx.fillRect(fx(0.0), 34, W, 6);
      break;
    }
    case 'bus': {
      text('N7', fx(0.5), 32, 26, '#2a2a2a', -Math.PI / 2);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(0, side.y + 2, W, 3);
      text('NVB', fx(0.85), side.y + 50, 12, '#2a2a2a');
      break;
    }
    case 'garbage': {
      for (let x = 0; x < 40; x += 10) {
        ctx.fillStyle = x % 20 ? '#ffffff' : '#c81e1e';
        ctx.fillRect(x, 0, 10, 64);
      }
      text('STADTREINIGUNG', fx(0.5), side.y + 30, 14, '#ffffff');
      break;
    }
  }
  void L;
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  liveryCache.set(def.id, tex);
  return tex;
}

// ------------------------------------------------------------------------------------------
// Material
// ------------------------------------------------------------------------------------------

export function vehicleMaterial(def: VehicleDef, paint: number): THREE.ShaderMaterial {
  const liv = vehicleLivery(def);
  const [r, g, b] = rgb(paint);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uTime: GU.uTime,
      uDay: GU.uDay,
      uAmbientNight: GU.uAmbientNight,
      uDayTint: GU.uDayTint,
      uLampColor: GU.uLampColor,
      uNeonColor: GU.uNeonColor,
      uLightmap: GU.uLightmap,
      uWorldSize: GU.uWorldSize,
      uRain: GU.uRain,
      uFlash: GU.uFlash,
      uPaint: { value: new THREE.Color(r, g, b) },
      uSteer: { value: 0 },
      uDamage: { value: 0 },
      uBurnt: { value: 0 },
      uLights: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSirenT: { value: 0 },
      uLivery: { value: liv },
      uHasLivery: { value: liv ? 1 : 0 },
      uSize: { value: new THREE.Vector3(def.length, def.width, def.model.box?.z ?? def.model.roofZ) },
      uHighlight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uSteer;
      in vec3 color;
      in float aPaint;
      in float aEmit;
      in vec3 aWheel;
      in float aGloss;
      out vec3 vColor;
      out float vPaint;
      flat out float vEmit;
      out vec3 vLocal;
      out vec3 vNLocal;
      out vec3 vNWorld;
      out vec3 vWorld;
      out float vGloss;
      void main() {
        vec3 p = position;
        vec3 n = normal;
        if (aWheel.x > 0.5) {
          vec2 d = p.xy - aWheel.yz;
          float c = cos(uSteer);
          float s = sin(uSteer);
          p.xy = aWheel.yz + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
          n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
        }
        vLocal = p;
        vNLocal = n;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNWorld = normalize(mat3(modelMatrix) * n);
        vColor = color;
        vPaint = aPaint;
        vEmit = aEmit;
        vGloss = aGloss;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${SHADER_COMMON}
      uniform vec3 uPaint;
      uniform float uDamage;
      uniform float uBurnt;
      uniform vec4 uLights;
      uniform float uSirenT;
      uniform sampler2D uLivery;
      uniform float uHasLivery;
      uniform vec3 uSize;
      uniform float uHighlight;
      in vec3 vColor;
      in float vPaint;
      flat in float vEmit;
      in vec3 vLocal;
      in vec3 vNLocal;
      in vec3 vNWorld;
      in vec3 vWorld;
      in float vGloss;
      out vec4 fragColor;
      void main() {
        vec3 base = mix(vColor, vColor * uPaint, vPaint);
        if (uHasLivery > 0.5 && vPaint > 0.5) {
          vec2 uv;
          if (vNLocal.z > 0.55) {
            uv = vec2(vLocal.x / uSize.x + 0.5, clamp(0.5 - vLocal.y / uSize.y, 0.0, 1.0) * 0.5);
          } else {
            float u = vLocal.x / uSize.x + 0.5;
            if (vNLocal.y > 0.0) u = 1.0 - u;
            uv = vec2(u, 0.5 + clamp(1.0 - vLocal.z / uSize.z, 0.0, 1.0) * 0.5);
          }
          vec4 lv = texture(uLivery, uv);
          base = mix(base, lv.rgb, lv.a);
        }
        vec3 n = normalize(vNWorld);
        float diff = max(dot(n, normalize(vec3(0.45, -0.62, 0.65))), 0.0);
        float hemi = 0.5 + 0.5 * n.z;
        vec3 col = base * (0.38 * hemi + 0.62 * diff + 0.1);
        // glossy paint / glass reflection streak
        float streak = smoothstep(0.55, 1.0, n.z) * (0.5 + 0.5 * sin((vWorld.x * 0.7 + vWorld.y * 0.5)));
        col += vec3(0.32, 0.36, 0.42) * vGloss * streak * 0.28 * uDay;
        // damage & burn
        float scratch = hash12(floor(vLocal.xy * 7.0 + vLocal.z * 3.0));
        col *= 1.0 - uDamage * (0.25 + 0.3 * scratch);
        col = mix(col, vec3(0.04, 0.035, 0.03) * (0.6 + 0.4 * scratch), uBurnt);
        vec3 lm = texture(uLightmap, vWorld.xy / uWorldSize).rgb;
        col = applyLight(col, vec3(lm.r * 0.55, lm.g, lm.b), 1.0);
        // emissive
        float e = vEmit;
        float night = 1.0 - uDay;
        if (e > 0.5) {
          if (e < 1.5) {
            col = mix(col, vec3(1.0, 0.97, 0.85) * 1.6, clamp(uLights.x * (0.35 + night), 0.0, 1.0) * (1.0 - uBurnt));
          } else if (e < 2.5) {
            float k = clamp(uLights.x * 0.45 * (0.3 + night) + uLights.y, 0.0, 1.0) * (1.0 - uBurnt);
            col = mix(col, vec3(1.0, 0.08, 0.05) * 1.7, k);
          } else if (e < 3.5) {
            col = mix(col, vec3(1.0), uLights.z);
          } else if (e < 5.5) {
            float ph = fract(uSirenT * 2.2 + (e > 4.5 ? 0.5 : 0.0));
            float on = uLights.w * step(ph, 0.42) * (0.6 + 0.4 * step(fract(uSirenT * 13.0), 0.5));
            col = mix(col * 0.6, vec3(0.2, 0.45, 1.0) * 2.2, on);
          } else if (e < 6.5) {
            float on = uLights.w * step(fract(uSirenT * 1.6), 0.5);
            col = mix(col * 0.7, vec3(1.0, 0.65, 0.1) * 2.0, on);
          } else if (e < 7.5) {
            col = mix(col, vec3(1.0) * 1.3, uLights.w * step(fract(uSirenT * 4.0), 0.25));
          } else {
            col = mix(col, vec3(1.0, 0.86, 0.2) * 1.5, 0.3 + 0.7 * night);
          }
        }
        col += uHighlight * vec3(0.35, 0.3, 0.08) * (0.5 + 0.5 * sin(uTime * 6.0));
        fragColor = vec4(col, 1.0);
      }`,
  });
}
