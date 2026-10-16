// Procedural texture generation (Canvas 2D). Produces layer stacks for DataArrayTextures.
import { G, FAC, RS, FAC_COUNT, RS_COUNT } from '../world/types';
import { RNG } from '../core/rng';

export const GROUND_SIZE = 128;
export const FACADE_SIZE = 128;
export const ROOF_SIZE = 128;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx } {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
  else {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx;
  return { canvas, ctx };
}

// ---------------------------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------------------------
export function hex(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

function shadeHex(c: number, f: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function rgba(c: number, a: number): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

// tileable value noise
function makeNoise(size: number, cells: number, rng: RNG): (x: number, y: number) => number {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return (x: number, y: number) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[((y0 % cells) + cells) % cells * cells + (((x0 % cells) + cells) % cells)];
    const b = g[((y0 % cells) + cells) % cells * cells + ((((x0 + 1) % cells) + cells) % cells)];
    const c = g[((((y0 + 1) % cells) + cells) % cells) * cells + (((x0 % cells) + cells) % cells)];
    const d = g[((((y0 + 1) % cells) + cells) % cells) * cells + ((((x0 + 1) % cells) + cells) % cells)];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Apply multiplicative noise to the whole canvas. */
function grain(ctx: Ctx, size: number, rng: RNG, amount: number, cells = 16, fine = 0.5): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const n1 = makeNoise(size, cells, rng);
  const n2 = makeNoise(size, cells * 4, rng);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = 1 + ((n1(x, y) - 0.5) * amount + (n2(x, y) - 0.5) * amount * fine + (rng.next() - 0.5) * amount * 0.6);
      d[i] = Math.min(255, d[i] * v);
      d[i + 1] = Math.min(255, d[i + 1] * v);
      d[i + 2] = Math.min(255, d[i + 2] * v);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function speckle(ctx: Ctx, size: number, rng: RNG, n: number, colors: number[], rMin = 0.5, rMax = 1.5, alpha = 1): void {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rgba(rng.pick(colors), alpha);
    const r = rng.range(rMin, rMax);
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    ctx.fillRect(x, y, r, r);
    if (x + r > size) ctx.fillRect(x - size, y, r, r);
    if (y + r > size) ctx.fillRect(x, y - size, r, r);
  }
}

// ---------------------------------------------------------------------------------------------
// Ground tiles
// ---------------------------------------------------------------------------------------------

/** Ground layers: index = GROUND_LAYER[g] + variant (variants count in GROUND_VARIANTS). */
export const GROUND_VARIANTS: Record<number, number> = {
  [G.Grass]: 4,
  [G.Asphalt]: 4,
  [G.Sidewalk]: 3,
  [G.Cobble]: 2,
  [G.Water]: 1,
  [G.Concrete]: 3,
  [G.Dirt]: 2,
  [G.Gravel]: 2,
  [G.Plaza]: 2,
  [G.Courtyard]: 2,
  [G.Parking]: 2,
  [G.Sand]: 1,
  [G.Pavers]: 2,
  [G.Rail]: 1,
  [G.Wall]: 1,
  [G.Quay]: 1,
  [G.Path]: 1,
  [G.Runway]: 1,
  [G.Bridge]: 1,
  [G.Pool]: 1,
  [G.Forest]: 2,
  [G.BridgeWalk]: 1,
};

export const GROUND_LAYER: Record<number, number> = {};
export let GROUND_LAYER_COUNT = 0;
{
  let n = 0;
  for (let g = 0; g < 22; g++) {
    GROUND_LAYER[g] = n;
    n += GROUND_VARIANTS[g] ?? 1;
  }
  GROUND_LAYER_COUNT = n;
}

function fill(ctx: Ctx, size: number, c: number): void {
  ctx.fillStyle = hex(c);
  ctx.fillRect(0, 0, size, size);
}

function drawAsphalt(ctx: Ctx, s: number, rng: RNG, v: number, base = 0x3b3d42): void {
  fill(ctx, s, base);
  grain(ctx, s, rng, 0.16, 8, 0.8);
  speckle(ctx, s, rng, 900, [0x55575c, 0x2c2e31, 0x606266, 0x46484c], 0.6, 1.4, 0.7);
  if (v === 1) {
    // cracks
    ctx.strokeStyle = 'rgba(20,20,22,0.55)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      let x = rng.range(0, s);
      let y = rng.range(0, s);
      ctx.moveTo(x, y);
      for (let i = 0; i < 8; i++) {
        x += rng.range(-10, 10);
        y += rng.range(-10, 10);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (v === 2) {
    // patch
    ctx.fillStyle = 'rgba(25,26,28,0.45)';
    const w = rng.range(30, 70);
    const h = rng.range(20, 50);
    ctx.fillRect(rng.range(0, s - w), rng.range(0, s - h), w, h);
  } else if (v === 3) {
    // oil stain
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, rng.range(20, 34));
    g.addColorStop(0, 'rgba(10,10,12,0.5)');
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
}

function drawSlabs(ctx: Ctx, s: number, rng: RNG, base: number, joint: number, cell: number, jitter = 0.06): void {
  fill(ctx, s, joint);
  for (let y = 0; y < s; y += cell) {
    for (let x = 0; x < s; x += cell) {
      ctx.fillStyle = shadeHex(base, 1 + rng.range(-jitter, jitter));
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }
}

function drawCobble(ctx: Ctx, s: number, rng: RNG, base: number, joint: number, r: number): void {
  fill(ctx, s, joint);
  const rows = Math.round(s / (r * 2));
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * (s / rows);
    const off = row % 2 ? r : 0;
    for (let x = -r; x < s + r; x += r * 2) {
      ctx.fillStyle = shadeHex(base, 1 + rng.range(-0.12, 0.12));
      ctx.beginPath();
      const rx = r * rng.range(0.75, 0.92);
      const ry = r * rng.range(0.7, 0.9);
      ctx.ellipse(x + off, y, rx, ry, rng.range(-0.3, 0.3), 0, Math.PI * 2);
      ctx.fill();
      // wrap horizontally
      if (x + off + r > s) {
        ctx.beginPath();
        ctx.ellipse(x + off - s, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawGrass(ctx: Ctx, s: number, rng: RNG, v: number): void {
  const bases = [0x5a8a3a, 0x56863a, 0x5e8c3c, 0x5b8838];
  fill(ctx, s, bases[v % bases.length]);
  grain(ctx, s, rng, 0.2, 4, 1.0);
  const blade = (x: number, y: number, dx: number, dy: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  };
  for (let i = 0; i < 800; i++) {
    ctx.strokeStyle = rgba(rng.pick([0x467a2c, 0x6fa04a, 0x3f6e28, 0x78a852]), 0.75);
    ctx.lineWidth = 1;
    const x = rng.range(0, s);
    const y = rng.range(0, s);
    const dx = rng.range(-1.5, 1.5);
    const dy = rng.range(-3, 3);
    blade(x, y, dx, dy);
    if (x > s - 3) blade(x - s, y, dx, dy);
    if (y > s - 4) blade(x, y - s, dx, dy);
    if (y < 4) blade(x, y + s, dx, dy);
  }
  if (v === 2) speckle(ctx, s, rng, 26, [0xf2f2f2, 0xf5e04a, 0xe8b0d0], 1.2, 2.0);
  if (v === 3) speckle(ctx, s, rng, 300, [0x8a9a4a, 0x7a8a40], 1, 2.5, 0.5);
}

function drawGround(g: G, v: number, ctx: Ctx, s: number, rng: RNG): void {
  switch (g) {
    case G.Grass:
      drawGrass(ctx, s, rng, v);
      break;
    case G.Asphalt:
      drawAsphalt(ctx, s, rng, v);
      break;
    case G.Parking:
      drawAsphalt(ctx, s, rng, v === 1 ? 3 : 0, 0x46484d);
      break;
    case G.Bridge:
      drawAsphalt(ctx, s, rng, 0, 0x45474d);
      ctx.fillStyle = 'rgba(30,30,30,0.6)';
      ctx.fillRect(0, 60, s, 3);
      break;
    case G.Runway:
      drawAsphalt(ctx, s, rng, 0, 0x2f3134);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < s; y += 8) ctx.fillRect(0, y, s, 2);
      break;
    case G.Sidewalk:
      if (v === 2) {
        // small granite mosaic
        drawCobble(ctx, s, rng, 0x9c9a94, 0x6e6c68, 4);
      } else drawSlabs(ctx, s, rng, v === 1 ? 0xb0aea6 : 0xa6a49d, 0x84827d, 32, 0.05);
      grain(ctx, s, rng, 0.08, 8);
      break;
    case G.BridgeWalk:
      drawSlabs(ctx, s, rng, 0x9a9893, 0x777570, 64, 0.03);
      grain(ctx, s, rng, 0.06, 8);
      break;
    case G.Cobble:
      drawCobble(ctx, s, rng, v ? 0x7f776c : 0x8a8276, 0x45413b, 7);
      grain(ctx, s, rng, 0.1, 8);
      break;
    case G.Pavers: {
      fill(ctx, s, 0x6a3c30);
      // herringbone-ish bricks
      const bw = 16;
      const bh = 8;
      for (let y = 0; y < s; y += bh) {
        for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < s; x += bw) {
          ctx.fillStyle = shadeHex(v ? 0x8f5444 : 0x9c5a48, 1 + rng.range(-0.1, 0.1));
          ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        }
      }
      grain(ctx, s, rng, 0.08, 8);
      break;
    }
    case G.Water:
      fill(ctx, s, 0x2a5a78);
      grain(ctx, s, rng, 0.18, 4, 0.6);
      break;
    case G.Pool:
      drawSlabs(ctx, s, rng, 0x5cc8e2, 0x4aa8c4, 16, 0.03);
      break;
    case G.Concrete:
      fill(ctx, s, v === 2 ? 0x8f8e89 : 0x9b9a95);
      grain(ctx, s, rng, 0.12, 6, 0.8);
      ctx.fillStyle = 'rgba(60,60,58,0.55)';
      ctx.fillRect(0, 0, s, 1.5);
      ctx.fillRect(0, 0, 1.5, s);
      if (v === 1) speckle(ctx, s, rng, 6, [0x3a3a3a], 6, 14, 0.18);
      break;
    case G.Dirt:
      fill(ctx, s, v ? 0x6f5a40 : 0x7a644a);
      grain(ctx, s, rng, 0.3, 6, 1);
      speckle(ctx, s, rng, 300, [0x5a4834, 0x8c7656, 0x947e5c], 0.8, 2);
      break;
    case G.Gravel:
      fill(ctx, s, v ? 0x9a9284 : 0xa39a88);
      speckle(ctx, s, rng, 1600, [0x8a8274, 0xb8af9c, 0x6f685c, 0xc4bca8], 1, 2.2);
      break;
    case G.Plaza:
      drawSlabs(ctx, s, rng, v ? 0xc2baa8 : 0xb8b2a4, 0x9a948a, 64, 0.04);
      ctx.fillStyle = 'rgba(120,112,100,0.5)';
      ctx.fillRect(0, 31, s, 2);
      grain(ctx, s, rng, 0.07, 8);
      break;
    case G.Courtyard:
      fill(ctx, s, v ? 0x87827a : 0x8f8a80);
      grain(ctx, s, rng, 0.2, 6, 0.8);
      speckle(ctx, s, rng, 200, [0x6e6a62, 0x9a958a], 1, 2);
      break;
    case G.Sand:
      fill(ctx, s, 0xd4c08a);
      speckle(ctx, s, rng, 1200, [0xc4ae78, 0xe2d09c, 0xb89e68], 0.8, 1.6);
      break;
    case G.Rail:
      fill(ctx, s, 0x6e6658);
      speckle(ctx, s, rng, 1500, [0x5a5246, 0x8a8070, 0x4a443a], 1, 2);
      ctx.fillStyle = '#5a4030';
      for (let y = 4; y < s; y += 16) ctx.fillRect(16, y, 96, 6);
      ctx.fillStyle = '#9a9aa0';
      ctx.fillRect(36, 0, 5, s);
      ctx.fillRect(87, 0, 5, s);
      break;
    case G.Wall:
      fill(ctx, s, 0x2c302c);
      grain(ctx, s, rng, 0.2, 8);
      break;
    case G.Quay:
      drawSlabs(ctx, s, rng, 0x8e8c86, 0x6a6864, 32, 0.08);
      grain(ctx, s, rng, 0.1, 8);
      break;
    case G.Path:
      fill(ctx, s, 0xb8a27a);
      speckle(ctx, s, rng, 900, [0xa89068, 0xc8b28a, 0x9a845e], 0.8, 1.8);
      break;
    case G.Forest: {
      fill(ctx, s, 0x2c4a24);
      for (let i = 0; i < 26; i++) {
        const x = rng.range(0, s);
        const y = rng.range(0, s);
        const r = rng.range(10, 22);
        for (const [dx, dy] of [
          [0, 0],
          [s, 0],
          [-s, 0],
          [0, s],
          [0, -s],
        ]) {
          const grd = ctx.createRadialGradient(x + dx - r * 0.3, y + dy - r * 0.3, 1, x + dx, y + dy, r);
          grd.addColorStop(0, v ? '#4f7a36' : '#4a7432');
          grd.addColorStop(1, '#1f3a1a');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    default:
      fill(ctx, s, 0xff00ff);
  }
}

export function generateGroundLayers(seed = 7): Uint8Array {
  const s = GROUND_SIZE;
  const out = new Uint8Array(s * s * 4 * GROUND_LAYER_COUNT);
  const { ctx } = makeCanvas(s, s);
  for (let g = 0; g < 22; g++) {
    const vars = GROUND_VARIANTS[g] ?? 1;
    for (let v = 0; v < vars; v++) {
      const rng = new RNG(seed * 1000 + g * 17 + v);
      ctx.clearRect(0, 0, s, s);
      ctx.globalAlpha = 1;
      drawGround(g as G, v, ctx, s, rng);
      const img = ctx.getImageData(0, 0, s, s);
      out.set(img.data, (GROUND_LAYER[g] + v) * s * s * 4);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Facades. Each style has two layers: ground floor (even) and upper floor (odd).
// Alpha channel: 255 wall, ~190 window (may light at night), ~128 shop window (lit at night).
// ---------------------------------------------------------------------------------------------

interface FacadeSpec {
  wall: number;
  trim: number;
  frame: number;
  glass: number;
  kind: 'alt' | 'platte' | 'glass' | 'office' | 'brick' | 'fachwerk' | 'metal' | 'concrete' | 'villa' | 'container' | 'station' | 'prison' | 'church' | 'tank' | 'kiosk';
  accent?: number;
}

const FACADES: FacadeSpec[] = [];
FACADES[FAC.AltCream] = { wall: 0xe0d2b0, trim: 0xf2ead6, frame: 0xf6f2ea, glass: 0x2c3a48, kind: 'alt' };
FACADES[FAC.AltOchre] = { wall: 0xd2a860, trim: 0xe8cc90, frame: 0xf4f0e6, glass: 0x2c3a48, kind: 'alt' };
FACADES[FAC.AltBlue] = { wall: 0x9cb4c8, trim: 0xd6e0e8, frame: 0xf6f6f2, glass: 0x26323e, kind: 'alt' };
FACADES[FAC.AltRose] = { wall: 0xd8a8a0, trim: 0xeed4cc, frame: 0xf6f2ee, glass: 0x2c3440, kind: 'alt' };
FACADES[FAC.AltWhite] = { wall: 0xe8e6e0, trim: 0xd0ccc4, frame: 0x5a4a3a, glass: 0x28323c, kind: 'alt' };
FACADES[FAC.AltGray] = { wall: 0x9a9894, trim: 0xb8b4ae, frame: 0xe8e4dc, glass: 0x222a32, kind: 'alt' };
FACADES[FAC.AltGreen] = { wall: 0xa8c0a0, trim: 0xd8e4d0, frame: 0xf6f6f0, glass: 0x26323a, kind: 'alt' };
FACADES[FAC.PlatteGray] = { wall: 0xa4a29c, trim: 0x8a8882, frame: 0xd8d6d0, glass: 0x2a3440, kind: 'platte', accent: 0xc87a4a };
FACADES[FAC.PlatteBeige] = { wall: 0xcfc2a4, trim: 0xb0a488, frame: 0xe6e2d8, glass: 0x2a3440, kind: 'platte', accent: 0x6a9ac0 };
FACADES[FAC.PlattePastel] = { wall: 0xe6dcc8, trim: 0xc8bca4, frame: 0xf2f0ea, glass: 0x2a3440, kind: 'platte', accent: 0x8cc06a };
FACADES[FAC.GlassBlue] = { wall: 0x3e6a8c, trim: 0xb8c8d4, frame: 0x8aa0b0, glass: 0x4f86ad, kind: 'glass' };
FACADES[FAC.GlassGreen] = { wall: 0x3e7a72, trim: 0xb4ccc6, frame: 0x86aaa2, glass: 0x4f9a90, kind: 'glass' };
FACADES[FAC.Office] = { wall: 0xc8c6c0, trim: 0xa8a6a0, frame: 0x6a6e74, glass: 0x34485a, kind: 'office' };
FACADES[FAC.Brick] = { wall: 0x9a4a36, trim: 0x7a3a2a, frame: 0xe8e0d0, glass: 0x24303a, kind: 'brick' };
FACADES[FAC.BrickDark] = { wall: 0x6a3a2e, trim: 0x4a2a22, frame: 0xc8c0b0, glass: 0x1e262e, kind: 'brick' };
FACADES[FAC.Fachwerk] = { wall: 0xf0ebe0, trim: 0x5a3a26, frame: 0x5a3a26, glass: 0x2a3036, kind: 'fachwerk' };
FACADES[FAC.FachwerkOchre] = { wall: 0xe8d098, trim: 0x4e3020, frame: 0x4e3020, glass: 0x2a3036, kind: 'fachwerk' };
FACADES[FAC.Metal] = { wall: 0x8a9096, trim: 0x6a7076, frame: 0x50565c, glass: 0x2a3440, kind: 'metal' };
FACADES[FAC.MetalRust] = { wall: 0x8a5a3a, trim: 0x6a4028, frame: 0x50565c, glass: 0x2a3440, kind: 'metal' };
FACADES[FAC.Concrete] = { wall: 0x9c9a94, trim: 0x84827c, frame: 0x60646a, glass: 0x26303a, kind: 'concrete' };
FACADES[FAC.Villa] = { wall: 0xf2f0ea, trim: 0xd8d4cc, frame: 0x3a3a3a, glass: 0x2a3a4a, kind: 'villa' };
FACADES[FAC.VillaCream] = { wall: 0xebe0c6, trim: 0xd0c4a8, frame: 0x6a5a48, glass: 0x2a3a4a, kind: 'villa' };
FACADES[FAC.Container] = { wall: 0xc8c8c8, trim: 0x9a9a9a, frame: 0x8a8a8a, glass: 0x404040, kind: 'container' };
FACADES[FAC.Station] = { wall: 0xc8b490, trim: 0xa8946e, frame: 0x5a5a5a, glass: 0x3a4a5a, kind: 'station' };
FACADES[FAC.Prison] = { wall: 0x9a9890, trim: 0x7a7870, frame: 0x3a3a3a, glass: 0x1e2226, kind: 'prison' };
FACADES[FAC.Church] = { wall: 0x8a8070, trim: 0x6a6052, frame: 0x4a4038, glass: 0x3a4a6a, kind: 'church' };
FACADES[FAC.Tank] = { wall: 0xe8e8e4, trim: 0xb8b8b4, frame: 0x9a9a96, glass: 0x404040, kind: 'tank' };
FACADES[FAC.Kiosk] = { wall: 0xe8e0d0, trim: 0xc0392b, frame: 0x8a2a20, glass: 0x2c3a48, kind: 'kiosk' };

function windowRect(ctx: Ctx, x: number, y: number, w: number, h: number, sp: FacadeSpec, rng: RNG, alpha = 190): void {
  ctx.fillStyle = hex(sp.frame);
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const grd = ctx.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, shadeHex(sp.glass, 1.35));
  grd.addColorStop(0.5, hex(sp.glass));
  grd.addColorStop(1, shadeHex(sp.glass, 0.8));
  ctx.fillStyle = grd;
  ctx.fillRect(x, y, w, h);
  // curtains / reflections
  if (rng.chance(0.4)) {
    ctx.fillStyle = rgba(rng.pick([0xe8dcc0, 0xc8d0d8, 0xd8c0b0]), 0.35);
    ctx.fillRect(x, y, w * rng.range(0.2, 0.45), h);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + 2, y + 2, w * 0.3, h * 0.5);
  // mullion
  ctx.fillStyle = hex(sp.frame);
  ctx.fillRect(x + w / 2 - 1, y, 2, h);
  markAlpha(ctx, x, y, w, h, alpha);
}

const alphaMarks: { x: number; y: number; w: number; h: number; a: number }[] = [];
function markAlpha(_ctx: Ctx, x: number, y: number, w: number, h: number, a: number): void {
  alphaMarks.push({ x, y, w, h, a });
}

function shopFront(ctx: Ctx, s: number, sp: FacadeSpec, rng: RNG): void {
  // big glass shop windows with a coloured fascia
  const fascia = rng.pick([0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0x34495e, 0xd35400, 0x16a085]);
  ctx.fillStyle = hex(fascia);
  ctx.fillRect(0, 6, s, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 4; i++) ctx.fillRect(10 + i * 26 + rng.range(0, 6), 12, rng.range(8, 16), 5);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 26, s, s - 26);
  const grd = ctx.createLinearGradient(0, 30, 0, s);
  grd.addColorStop(0, '#5a7088');
  grd.addColorStop(1, '#2a3646');
  ctx.fillStyle = grd;
  ctx.fillRect(6, 30, 52, s - 34);
  ctx.fillRect(70, 30, 52, s - 34);
  ctx.fillStyle = 'rgba(255,240,200,0.25)';
  ctx.fillRect(8, 34, 20, s - 40);
  markAlpha(ctx, 6, 30, 52, s - 34, 128);
  markAlpha(ctx, 70, 30, 52, s - 34, 128);
  void sp;
}

function drawFacade(ctx: Ctx, s: number, sp: FacadeSpec, ground: boolean, rng: RNG): void {
  alphaMarks.length = 0;
  fill(ctx, s, sp.wall);
  switch (sp.kind) {
    case 'alt': {
      grain(ctx, s, rng, 0.08, 8);
      if (ground) {
        // rusticated base + door
        ctx.fillStyle = shadeHex(sp.wall, 0.85);
        for (let y = 0; y < s; y += 16) ctx.fillRect(0, y, s, 2);
        windowRect(ctx, 14, 40, 34, 56, sp, rng);
        ctx.fillStyle = '#4a3a2e';
        ctx.fillRect(78, 36, 34, 92);
        ctx.fillStyle = shadeHex(sp.trim, 1);
        ctx.fillRect(74, 32, 42, 4);
      } else {
        ctx.fillStyle = hex(sp.trim);
        ctx.fillRect(0, 0, s, 6); // cornice band
        for (const x of [16, 76]) {
          ctx.fillStyle = hex(sp.trim);
          ctx.fillRect(x - 6, 16, 48, 6); // window head
          ctx.fillRect(x - 4, 106, 44, 5); // sill
          windowRect(ctx, x, 26, 36, 78, sp, rng);
        }
      }
      break;
    }
    case 'platte': {
      grain(ctx, s, rng, 0.07, 8);
      ctx.fillStyle = shadeHex(sp.wall, 0.82);
      ctx.fillRect(0, 0, s, 2);
      ctx.fillRect(0, 0, 2, s);
      ctx.fillRect(63, 0, 2, s);
      if (ground) {
        ctx.fillStyle = shadeHex(sp.wall, 0.9);
        ctx.fillRect(0, 70, s, 58);
        windowRect(ctx, 14, 30, 36, 30, sp, rng);
        ctx.fillStyle = '#3a3e44';
        ctx.fillRect(80, 40, 30, 88);
      } else {
        windowRect(ctx, 10, 22, 44, 46, sp, rng);
        // balcony with coloured panel
        ctx.fillStyle = hex(sp.accent ?? 0x888888);
        ctx.fillRect(68, 60, 56, 34);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(68, 92, 56, 4);
        windowRect(ctx, 76, 18, 40, 38, sp, rng);
      }
      break;
    }
    case 'glass': {
      ctx.fillStyle = hex(sp.glass);
      ctx.fillRect(0, 0, s, s);
      const grd = ctx.createLinearGradient(0, 0, s, s);
      grd.addColorStop(0, 'rgba(255,255,255,0.25)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      grd.addColorStop(1, 'rgba(255,255,255,0.18)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = hex(sp.frame);
      for (let x = 0; x <= s; x += 32) ctx.fillRect(x - 1, 0, 3, s);
      ctx.fillRect(0, 0, s, 5);
      ctx.fillRect(0, 96, s, 3);
      for (let x = 0; x < s; x += 32) markAlpha(ctx, x + 2, 6, 28, 88, ground ? 128 : 190);
      break;
    }
    case 'office': {
      grain(ctx, s, rng, 0.05, 8);
      ctx.fillStyle = hex(sp.trim);
      ctx.fillRect(0, 0, s, 10);
      ctx.fillStyle = hex(sp.glass);
      ctx.fillRect(0, 28, s, 62);
      ctx.fillStyle = hex(sp.frame);
      for (let x = 0; x <= s; x += 21) ctx.fillRect(x, 28, 3, 62);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, 30, s, 14);
      markAlpha(ctx, 0, 28, s, 62, ground ? 128 : 190);
      break;
    }
    case 'brick': {
      // bricks
      ctx.fillStyle = shadeHex(sp.wall, 0.72);
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 6) {
        for (let x = (y / 6) % 2 ? -6 : 0; x < s; x += 12) {
          ctx.fillStyle = shadeHex(sp.wall, 1 + rng.range(-0.12, 0.1));
          ctx.fillRect(x + 1, y + 1, 10, 4);
        }
      }
      // arched windows
      for (const x of [18, 76]) {
        ctx.fillStyle = shadeHex(sp.trim, 1);
        ctx.beginPath();
        ctx.arc(x + 17, 40, 21, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x - 4, 40, 42, 66);
        windowRect(ctx, x, 36, 34, 66, sp, rng);
      }
      if (ground) {
        ctx.fillStyle = '#3a2a22';
        ctx.fillRect(76, 50, 34, 78);
      }
      break;
    }
    case 'fachwerk': {
      grain(ctx, s, rng, 0.06, 8);
      ctx.fillStyle = hex(sp.trim);
      // posts & beams
      for (const x of [0, 42, 84, 124]) ctx.fillRect(x, 0, 6, s);
      ctx.fillRect(0, 0, s, 7);
      ctx.fillRect(0, 118, s, 10);
      ctx.lineWidth = 6;
      ctx.strokeStyle = hex(sp.trim);
      ctx.beginPath();
      ctx.moveTo(6, 118);
      ctx.lineTo(42, 70);
      ctx.moveTo(124, 118);
      ctx.lineTo(90, 70);
      ctx.stroke();
      windowRect(ctx, 52, 30, 26, 38, sp, rng);
      if (ground) {
        ctx.fillStyle = '#5a3a26';
        ctx.fillRect(12, 40, 26, 78);
      } else windowRect(ctx, 14, 26, 22, 34, sp, rng);
      break;
    }
    case 'metal': {
      for (let x = 0; x < s; x += 8) {
        ctx.fillStyle = shadeHex(sp.wall, x % 16 ? 0.92 : 1.06);
        ctx.fillRect(x, 0, 8, s);
      }
      grain(ctx, s, rng, 0.12, 6);
      if (rng.chance(0.5) && !ground) {
        ctx.fillStyle = hex(sp.frame);
        ctx.fillRect(10, 30, s - 20, 22);
        ctx.fillStyle = hex(sp.glass);
        ctx.fillRect(12, 32, s - 24, 18);
        markAlpha(ctx, 12, 32, s - 24, 18, 190);
      }
      if (ground) {
        ctx.fillStyle = '#5a6066';
        ctx.fillRect(20, 30, 88, 98);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = 34; y < s; y += 8) ctx.fillRect(20, y, 88, 2);
      }
      break;
    }
    case 'concrete': {
      grain(ctx, s, rng, 0.12, 8);
      windowRect(ctx, 20, 34, 30, 34, sp, rng);
      windowRect(ctx, 78, 34, 30, 34, sp, rng);
      break;
    }
    case 'villa': {
      grain(ctx, s, rng, 0.04, 8);
      if (ground) {
        windowRect(ctx, 10, 30, 70, 80, sp, rng);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(92, 40, 26, 88);
      } else {
        windowRect(ctx, 22, 28, 30, 50, sp, rng);
        windowRect(ctx, 76, 28, 30, 50, sp, rng);
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(14, 28, 6, 50);
        ctx.fillRect(54, 28, 6, 50);
      }
      break;
    }
    case 'container': {
      for (let x = 0; x < s; x += 6) {
        ctx.fillStyle = x % 12 ? '#bdbdbd' : '#e0e0e0';
        ctx.fillRect(x, 0, 6, s);
      }
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, s, 6);
      ctx.fillRect(0, s - 6, s, 6);
      grain(ctx, s, rng, 0.1, 6);
      break;
    }
    case 'station': {
      grain(ctx, s, rng, 0.08, 8);
      ctx.fillStyle = shadeHex(sp.wall, 0.85);
      for (let y = 0; y < s; y += 14) ctx.fillRect(0, y, s, 2);
      ctx.fillStyle = hex(sp.trim);
      ctx.beginPath();
      ctx.arc(64, 44, 34, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(30, 44, 68, 70);
      windowRect(ctx, 36, 40, 56, 74, sp, rng, ground ? 128 : 190);
      break;
    }
    case 'prison': {
      grain(ctx, s, rng, 0.12, 8);
      for (const x of [26, 86]) {
        ctx.fillStyle = hex(sp.glass);
        ctx.fillRect(x, 36, 16, 40);
        ctx.fillStyle = '#5a5a5a';
        for (let k = 0; k < 4; k++) ctx.fillRect(x + 2 + k * 4, 36, 2, 40);
        markAlpha(ctx, x, 36, 16, 40, 190);
      }
      break;
    }
    case 'church': {
      grain(ctx, s, rng, 0.1, 8);
      ctx.fillStyle = hex(sp.glass);
      ctx.beginPath();
      ctx.moveTo(44, 120);
      ctx.lineTo(44, 40);
      ctx.lineTo(64, 12);
      ctx.lineTo(84, 40);
      ctx.lineTo(84, 120);
      ctx.fill();
      markAlpha(ctx, 46, 30, 36, 88, 160);
      break;
    }
    case 'tank': {
      grain(ctx, s, rng, 0.06, 8);
      ctx.fillStyle = shadeHex(sp.wall, 0.85);
      for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 2);
      for (let x = 0; x < s; x += 42) ctx.fillRect(x, 0, 2, s);
      break;
    }
    case 'kiosk': {
      grain(ctx, s, rng, 0.05, 8);
      // red awning + menu board + glass
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(0, 0, s, 26);
      ctx.fillStyle = '#f4f0e8';
      for (let x = 0; x < s; x += 16) ctx.fillRect(x, 0, 8, 26);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(4, 30, s - 8, 20);
      ctx.fillStyle = '#ffd34e';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(ground ? 'DÖNER  IMBISS' : 'PIZZA  GRILL', 10, 46);
      windowRect(ctx, 8, 56, 112, 60, sp, rng, 128);
      break;
    }
  }
  // apply alpha marks
  const img = ctx.getImageData(0, 0, s, s);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  for (const m of alphaMarks) {
    for (let y = Math.max(0, Math.floor(m.y)); y < Math.min(s, Math.ceil(m.y + m.h)); y++) {
      for (let x = Math.max(0, Math.floor(m.x)); x < Math.min(s, Math.ceil(m.x + m.w)); x++) d[(y * s + x) * 4 + 3] = m.a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function generateFacadeLayers(seed = 11): Uint8Array {
  const s = FACADE_SIZE;
  const out = new Uint8Array(s * s * 4 * FAC_COUNT * 2);
  const { ctx } = makeCanvas(s, s);
  for (let f = 0; f < FAC_COUNT; f++) {
    for (let k = 0; k < 2; k++) {
      const rng = new RNG(seed * 977 + f * 31 + k);
      ctx.clearRect(0, 0, s, s);
      drawFacade(ctx, s, FACADES[f], k === 0, rng);
      const img = ctx.getImageData(0, 0, s, s);
      out.set(img.data, (f * 2 + k) * s * s * 4);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Roofs (one layer per style, 4 m x 4 m repeat)
// ---------------------------------------------------------------------------------------------

function drawTiles(ctx: Ctx, s: number, rng: RNG, base: number, rowH = 10): void {
  fill(ctx, s, base);
  for (let y = 0; y < s; y += rowH) {
    ctx.fillStyle = shadeHex(base, 0.7);
    ctx.fillRect(0, y + rowH - 2, s, 2);
    for (let x = (y / rowH) % 2 ? -6 : 0; x < s; x += 12) {
      ctx.fillStyle = shadeHex(base, 1 + rng.range(-0.1, 0.1));
      ctx.fillRect(x + 1, y, 10, rowH - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 2, y, 3, rowH - 3);
    }
  }
}

function drawRoof(r: number, ctx: Ctx, s: number, rng: RNG): void {
  switch (r) {
    case RS.Gravel:
      fill(ctx, s, 0x8e8a82);
      speckle(ctx, s, rng, 1800, [0x7a766e, 0xa29e96, 0x6a665e, 0xb0aca4], 1, 2);
      break;
    case RS.Tar:
      fill(ctx, s, 0x4a4a4c);
      grain(ctx, s, rng, 0.14, 6);
      ctx.fillStyle = 'rgba(30,30,32,0.6)';
      for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 2, s);
      break;
    case RS.Green:
      fill(ctx, s, 0x6a8a4a);
      speckle(ctx, s, rng, 1400, [0x5a7a3a, 0x8aa05a, 0xa08a4a, 0x4e6e34], 1, 2.5);
      break;
    case RS.Metal:
      fill(ctx, s, 0x8a9096);
      for (let x = 0; x < s; x += 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, 0, 2, s);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + 2, 0, 1, s);
      }
      grain(ctx, s, rng, 0.08, 6);
      break;
    case RS.TileRed:
      drawTiles(ctx, s, rng, 0xa8452e);
      break;
    case RS.TileBrown:
      drawTiles(ctx, s, rng, 0x7a4a32);
      break;
    case RS.TileAnthracite:
      drawTiles(ctx, s, rng, 0x4a4c50);
      break;
    case RS.Slate:
      drawTiles(ctx, s, rng, 0x5a6068, 8);
      break;
    case RS.Copper:
      fill(ctx, s, 0x5f9a86);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(30,60,50,0.35)';
        ctx.fillRect(x, 0, 2, s);
      }
      grain(ctx, s, rng, 0.14, 6);
      break;
    case RS.Glass:
      fill(ctx, s, 0x6a7c8a);
      ctx.fillStyle = '#3e4a54';
      for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 4, s);
      for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(6, 0, 10, s);
      break;
    case RS.Solar:
      fill(ctx, s, 0x8e8a82);
      speckle(ctx, s, rng, 600, [0x7a766e, 0xa29e96], 1, 2);
      for (let y = 8; y < s - 20; y += 30) {
        for (let x = 8; x < s - 16; x += 38) {
          ctx.fillStyle = '#1e2a44';
          ctx.fillRect(x, y, 34, 24);
          ctx.fillStyle = 'rgba(120,150,200,0.35)';
          for (let k = 1; k < 4; k++) ctx.fillRect(x + k * 8.5, y, 1, 24);
          ctx.fillRect(x, y + 12, 34, 1);
        }
      }
      break;
    case RS.Container:
      for (let x = 0; x < s; x += 6) {
        ctx.fillStyle = x % 12 ? '#c4c4c4' : '#dcdcdc';
        ctx.fillRect(x, 0, 6, s);
      }
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(0, 0, s, 4);
      ctx.fillRect(0, s - 4, s, 4);
      grain(ctx, s, rng, 0.1, 6);
      break;
    case RS.Concrete:
      fill(ctx, s, 0x9a9892);
      grain(ctx, s, rng, 0.12, 6);
      break;
    case RS.Helipad:
      fill(ctx, s, 0x4a4c50);
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(64, 64, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(44, 36, 9, 56);
      ctx.fillRect(75, 36, 9, 56);
      ctx.fillRect(44, 60, 40, 8);
      break;
    case RS.SawGlass:
      fill(ctx, s, 0x7a8086);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = '#9ab0c0';
        ctx.fillRect(x, 0, 6, s);
      }
      break;
    case RS.TankTop:
      fill(ctx, s, 0xb4b4b0);
      ctx.strokeStyle = 'rgba(80,80,80,0.6)';
      ctx.lineWidth = 2;
      for (let r = 16; r < 90; r += 16) {
        ctx.beginPath();
        ctx.arc(64, 64, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    default:
      fill(ctx, s, 0xff00ff);
  }
}

export function generateRoofLayers(seed = 13): Uint8Array {
  const s = ROOF_SIZE;
  const out = new Uint8Array(s * s * 4 * RS_COUNT);
  const { ctx } = makeCanvas(s, s);
  for (let r = 0; r < RS_COUNT; r++) {
    const rng = new RNG(seed * 131 + r);
    ctx.clearRect(0, 0, s, s);
    drawRoof(r, ctx, s, rng);
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    out.set(d, r * s * s * 4);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Shop fronts (ground-floor variants), tree canopies, markings atlas, glow sprite
// ---------------------------------------------------------------------------------------------
export const SHOP_VARIANTS = 4;

export function generateShopLayers(seed = 21): Uint8Array {
  const s = FACADE_SIZE;
  const out = new Uint8Array(s * s * 4 * SHOP_VARIANTS);
  const { ctx } = makeCanvas(s, s);
  const walls = [0xd8ccb0, 0xb8b4ae, 0xe4ddd0, 0xc8b8a0];
  for (let k = 0; k < SHOP_VARIANTS; k++) {
    const rng = new RNG(seed * 53 + k);
    alphaMarks.length = 0;
    ctx.clearRect(0, 0, s, s);
    fill(ctx, s, walls[k]);
    grain(ctx, s, rng, 0.06, 8);
    shopFront(ctx, s, FACADES[FAC.AltCream], rng);
    // awning on some
    if (k % 2 === 0) {
      const c = rng.pick([0xc0392b, 0x1f6f4a, 0x2e5f9a, 0xd8a020]);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = x % 32 ? '#f2eee6' : hex(c);
        ctx.fillRect(x, 24, 16, 10);
      }
    }
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    for (const m of alphaMarks) {
      for (let y = Math.max(0, Math.floor(m.y)); y < Math.min(s, Math.ceil(m.y + m.h)); y++)
        for (let x = Math.max(0, Math.floor(m.x)); x < Math.min(s, Math.ceil(m.x + m.w)); x++) d[(y * s + x) * 4 + 3] = m.a;
    }
    out.set(d, k * s * s * 4);
  }
  return out;
}

export const TREE_VARIANTS = 4;
export const TREE_SIZE = 128;

export function generateTreeLayers(seed = 5): Uint8Array {
  const s = TREE_SIZE;
  const out = new Uint8Array(s * s * 4 * TREE_VARIANTS);
  const { ctx } = makeCanvas(s, s);
  const palettes = [
    [0x2f5a24, 0x4a7a32, 0x6a9a44, 0x86b456],
    [0x2a5226, 0x3e6e30, 0x5a8c3c, 0x7aa850],
    [0x34502a, 0x4e6e36, 0x6e8c46, 0x94ac5c],
    [0x5a3a1a, 0xa0581e, 0xd08a2a, 0xe8b440],
  ];
  for (let v = 0; v < TREE_VARIANTS; v++) {
    const rng = new RNG(seed * 71 + v);
    ctx.clearRect(0, 0, s, s);
    const pal = palettes[v];
    // shadowy base disc
    ctx.fillStyle = hex(pal[0]);
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 1; layer < 4; layer++) {
      const n = 14 - layer * 2;
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const rr = rng.range(0, 34 - layer * 6);
        const x = 64 + Math.cos(a) * rr - layer * 3;
        const y = 64 + Math.sin(a) * rr - layer * 3;
        const r = rng.range(12, 22) - layer * 2;
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
        g.addColorStop(0, hex(pal[Math.min(3, layer + 1)]));
        g.addColorStop(1, hex(pal[layer - 1]));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // leafy edge noise
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = (y * s + x) * 4;
        const dist = Math.hypot(x - 64, y - 64);
        const edge = 50 + Math.sin(Math.atan2(y - 64, x - 64) * 9 + v) * 3 + rng.range(-3, 3);
        if (dist > edge) d[i + 3] = 0;
        else {
          const k = 0.88 + rng.next() * 0.24;
          d[i] *= k;
          d[i + 1] *= k;
          d[i + 2] *= k;
          d[i + 3] = 255;
        }
      }
    }
    out.set(d, v * s * s * 4);
  }
  return out;
}

/** Markings atlas: white block (0..0.25, 0..0.25), arrows in the right part. */
export const MARK_UV = {
  white: [0.02, 0.02, 0.2, 0.2] as [number, number, number, number],
  arrowStraight: [0.25, 0, 0.5, 0.5] as [number, number, number, number],
  arrowLeft: [0.5, 0, 0.75, 0.5] as [number, number, number, number],
  arrowRight: [0.75, 0, 1, 0.5] as [number, number, number, number],
  arrowStraightLeft: [0.25, 0.5, 0.5, 1] as [number, number, number, number],
  arrowStraightRight: [0.5, 0.5, 0.75, 1] as [number, number, number, number],
};

export function makeMarkingsCanvas(): HTMLCanvasElement | OffscreenCanvas {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  const arrow = (ox: number, oy: number, kind: 'S' | 'L' | 'R' | 'SL' | 'SR'): void => {
    ctx.save();
    ctx.translate(ox + 64, oy + 128);
    ctx.fillStyle = '#ffffff';
    // canvas y down = texture v up after mapping; draw arrow pointing towards -y (top of canvas)
    const shaft = (): void => ctx.fillRect(-7, -100, 14, 100);
    const headUp = (x: number, y: number): void => {
      ctx.beginPath();
      ctx.moveTo(x, y - 26);
      ctx.lineTo(x - 20, y);
      ctx.lineTo(x + 20, y);
      ctx.fill();
    };
    if (kind === 'S' || kind === 'SL' || kind === 'SR') {
      shaft();
      headUp(0, -96);
    }
    if (kind === 'L' || kind === 'SL') {
      if (kind === 'L') ctx.fillRect(-7, -70, 14, 70);
      ctx.fillRect(-40, -70, 40, 14);
      ctx.beginPath();
      ctx.moveTo(-58, -63);
      ctx.lineTo(-36, -84);
      ctx.lineTo(-36, -42);
      ctx.fill();
    }
    if (kind === 'R' || kind === 'SR') {
      if (kind === 'R') ctx.fillRect(-7, -70, 14, 70);
      ctx.fillRect(0, -70, 40, 14);
      ctx.beginPath();
      ctx.moveTo(58, -63);
      ctx.lineTo(36, -84);
      ctx.lineTo(36, -42);
      ctx.fill();
    }
    ctx.restore();
  };
  arrow(128, 0, 'S');
  arrow(256, 0, 'L');
  arrow(384, 0, 'R');
  arrow(128, 128, 'SL');
  arrow(256, 128, 'SR');
  return canvas;
}

export function makeGlowCanvas(size = 64): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(160,160,160,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
