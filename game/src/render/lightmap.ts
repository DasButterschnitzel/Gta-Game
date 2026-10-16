// Bakes a world-space lightmap: R = sun shadow + AO, G = street-lamp light, B = neon/shop glow.
import * as THREE from 'three';
import type { City } from '../world/city';
import { WORLD_W, WORLD_H, P, D, Roof, BKind } from '../world/types';
import { makeCanvas } from './texgen';
import { SHADOW_DIR } from './globals';

export const LM_SCALE = 1; // pixels per metre

export function buildLightmap(city: City): THREE.DataTexture {
  const W = Math.round(WORLD_W * LM_SCALE);
  const H = Math.round(WORLD_H * LM_SCALE);
  const { ctx } = makeCanvas(W, H);
  const out = new Uint8Array(W * H * 4);
  const S = LM_SCALE;

  const tmpA = new Uint8Array(W * H);
  const tmpB = new Uint8Array(W * H);
  const readChannel = (ch: number, blurR: number, passes = 2): void => {
    const img = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; j < tmpA.length; i += 4, j++) tmpA[j] = img[i];
    for (let k = 0; k < passes && blurR > 0; k++) {
      boxBlurH(tmpA, tmpB, W, H, blurR);
      boxBlurV(tmpB, tmpA, W, H, blurR);
    }
    for (let j = 0, o = ch; j < tmpA.length; j++, o += 4) out[o] = tmpA[j];
  };

  // ---- R: shadows + ambient occlusion ---------------------------------------------------
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(255,255,255)';
  for (const b of city.buildings) {
    let h = Math.min(b.height, 34);
    if (b.roof === Roof.GableX || b.roof === Roof.GableY) h += 2;
    const dx = SHADOW_DIR.x * h * 0.85;
    const dy = SHADOW_DIR.y * h * 0.85;
    const x0 = b.x * S;
    const y0 = b.y * S;
    const x1 = (b.x + b.w) * S;
    const y1 = (b.y + b.h) * S;
    if (b.roof === Roof.Round) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = Math.min(x1 - x0, y1 - y0) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx + dx * S, cy + dy * S, r, 0, Math.PI * 2);
      ctx.fill();
      // connecting band
      const len = Math.hypot(dx, dy) * S;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillRect(0, -r, len, r * 2);
      ctx.restore();
      continue;
    }
    // hexagon hull of rect and offset rect (shadow toward -x, +y)
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + dx * S, y1 + dy * S);
    ctx.lineTo(x0 + dx * S, y1 + dy * S);
    ctx.lineTo(x0 + dx * S, y0 + dy * S);
    ctx.closePath();
    ctx.fill();
  }
  // tree shadows
  for (const p of city.props) {
    if (p.t === P.Tree || p.t === P.TreeSmall) {
      const r = (p.t === P.Tree ? 2.8 : 1.9) * S;
      const z = p.t === P.Tree ? 6.5 : 4.5;
      ctx.beginPath();
      ctx.arc((p.x + SHADOW_DIR.x * z) * S, (p.y + SHADOW_DIR.y * z) * S, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.t === P.Crane) {
      // long thin shadow of the boom
      ctx.save();
      ctx.translate((p.x + SHADOW_DIR.x * 17) * S, (p.y + SHADOW_DIR.y * 17) * S);
      ctx.rotate(p.rot);
      ctx.fillRect(-14 * S, -1.2 * S, 40 * S, 2.4 * S);
      ctx.restore();
    }
  }
  // ambient occlusion rim around buildings (softer, partial)
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const b of city.buildings) {
    if (b.kind === BKind.Container) continue;
    ctx.fillRect((b.x - 0.8) * S, (b.y - 0.8) * S, (b.w + 1.6) * S, (b.h + 1.6) * S);
  }
  readChannel(0, 1, 2);

  // ---- G: street lamps & warm shop light ---------------------------------------------
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const lampR = 11 * S;
  const lampGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, lampR);
  lampGrad.addColorStop(0, 'rgba(255,255,255,0.85)');
  lampGrad.addColorStop(0.45, 'rgba(150,150,150,0.45)');
  lampGrad.addColorStop(1, 'rgba(0,0,0,0)');
  for (const p of city.props) {
    if (p.t !== P.Lamp) continue;
    const hx = p.x + Math.cos(p.rot) * 1.6;
    const hy = p.y + Math.sin(p.rot) * 1.6;
    ctx.save();
    ctx.translate(hx * S, hy * S);
    ctx.fillStyle = lampGrad;
    ctx.fillRect(-lampR, -lampR, lampR * 2, lampR * 2);
    ctx.restore();
  }
  // shop windows spill warm light onto sidewalks
  const spill = (b: { x: number; y: number; w: number; h: number; shops: number }, alpha: number): void => {
    const depth = 3.2;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    if (b.shops & 8) ctx.fillRect(b.x * S, (b.y - depth) * S, b.w * S, depth * S);
    if (b.shops & 2) ctx.fillRect(b.x * S, (b.y + b.h) * S, b.w * S, depth * S);
    if (b.shops & 1) ctx.fillRect((b.x + b.w) * S, b.y * S, depth * S, b.h * S);
    if (b.shops & 4) ctx.fillRect((b.x - depth) * S, b.y * S, depth * S, b.h * S);
  };
  for (const b of city.buildings) if (b.shops) spill(b, 0.28);
  readChannel(1, 1, 1);

  // ---- B: neon (Kiez, clubs) -----------------------------------------------------------
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const b of city.buildings) {
    if (!b.shops) continue;
    const d = city.districtAt(b.x + b.w / 2, b.y + b.h / 2);
    if (d === D.Kiez || b.name === 'Turbine' || b.name === 'Club Knockout') spill(b, d === D.Kiez ? 0.45 : 0.6);
    else if (d === D.Bahnhof && ((b.x * 7 + b.y) | 0) % 3 === 0) spill(b, 0.3);
  }
  ctx.globalCompositeOperation = 'source-over';
  readChannel(2, 2, 2);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Separable box blur helpers on single-channel images (radius r). */
function boxBlurH(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number): void {
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      dst[row + x] = (acc / div) | 0;
      const xa = Math.min(w - 1, x + r + 1);
      const xr = Math.max(0, x - r);
      acc += src[row + xa] - src[row + xr];
    }
  }
}

function boxBlurV(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number): void {
  const div = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = (acc / div) | 0;
      const ya = Math.min(h - 1, y + r + 1);
      const yr = Math.max(0, y - r);
      acc += src[ya * w + x] - src[yr * w + x];
    }
  }
}
