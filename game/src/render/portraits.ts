// Comic-style character portraits drawn procedurally on a canvas (cel shading, thick outlines,
// halftone background). Each story character is described by a small set of features.

type HairStyle = 'short' | 'messy' | 'buzz' | 'bald' | 'bob' | 'ponytail' | 'curly' | 'slick' | 'perm' | 'receding';
type Collar = 'jacket' | 'hoodie' | 'suit' | 'tracksuit' | 'turtleneck' | 'cardigan' | 'apron' | 'vest' | 'tshirt' | 'uniform';

export interface Face {
  skin: string;
  hair: string;
  style: HairStyle;
  beard?: 'stubble' | 'full' | 'moustache' | 'braid' | 'white';
  beardColor?: string;
  glasses?: 'round' | 'square' | 'shades';
  hat?: 'flatcap' | 'captain' | 'beanie' | 'cap' | 'capback' | 'police';
  hatColor?: string;
  brows?: 'flat' | 'angry' | 'raised' | 'worried';
  mouth?: 'smile' | 'flat' | 'grin' | 'frown' | 'smirk' | 'open';
  eyes?: 'calm' | 'narrow' | 'wide';
  shirt: string;
  collar: Collar;
  accent?: string;
  bg: string;
  age?: number; // 0..1 wrinkles
  scar?: boolean;
  earrings?: string;
  pipe?: boolean;
  chain?: boolean;
  jaw?: 'square' | 'round' | 'narrow';
  brokenNose?: boolean;
}

export const FACES: Record<string, Face> = {
  kai: { skin: '#e2b28e', hair: '#2a221c', style: 'messy', beard: 'stubble', brows: 'flat', mouth: 'flat', eyes: 'narrow', shirt: '#2a2d33', collar: 'jacket', accent: '#4a4e56', bg: '#2a6f8a', jaw: 'square' },
  dende: { skin: '#eac2a0', hair: '#c89a4a', style: 'short', hat: 'capback', hatColor: '#c8302a', brows: 'raised', mouth: 'grin', eyes: 'wide', shirt: '#3a7a3a', collar: 'hoodie', bg: '#e07a2a', chain: true, jaw: 'round' },
  gul: { skin: '#c89070', hair: '#2a1a14', style: 'curly', brows: 'raised', mouth: 'smile', eyes: 'calm', shirt: '#6a2a3a', collar: 'apron', accent: '#f2f2ea', bg: '#c83a2a', earrings: '#e8c040', age: 0.5, jaw: 'round' },
  herbie: { skin: '#e8bca0', hair: '#9a9a9a', style: 'short', hat: 'flatcap', hatColor: '#5a4a3a', beard: 'moustache', beardColor: '#b8b8b0', brows: 'raised', mouth: 'smile', eyes: 'calm', shirt: '#7a5a3a', collar: 'cardigan', accent: '#d8d0c0', bg: '#6a7a3a', age: 0.85, jaw: 'round' },
  uschi: { skin: '#e8b898', hair: '#e8d090', style: 'perm', brows: 'flat', mouth: 'smirk', eyes: 'narrow', shirt: '#d8a820', collar: 'tracksuit', accent: '#c82a2a', bg: '#8a1a1a', earrings: '#f2d040', age: 0.55, brokenNose: true, jaw: 'square' },
  lenny: { skin: '#f2d0b6', hair: '#e8d8a0', style: 'slick', glasses: 'round', brows: 'raised', mouth: 'smirk', eyes: 'calm', shirt: '#151515', collar: 'turtleneck', bg: '#2ad85a', jaw: 'narrow' },
  ruhland: { skin: '#e0b08a', hair: '#3a2a1e', style: 'receding', beard: 'moustache', beardColor: '#3a2a1e', brows: 'angry', mouth: 'flat', eyes: 'narrow', shirt: '#6a4024', collar: 'jacket', accent: '#3a2414', bg: '#1e2a4a', age: 0.5, jaw: 'square' },
  lena: { skin: '#e8bc9a', hair: '#4a2a1a', style: 'ponytail', glasses: 'square', brows: 'worried', mouth: 'flat', eyes: 'calm', shirt: '#3a5a8a', collar: 'jacket', accent: '#2a4064', bg: '#6a3a8a', jaw: 'narrow' },
  achterberg: { skin: '#f0c8a8', hair: '#b8b8b8', style: 'slick', brows: 'flat', mouth: 'smile', eyes: 'calm', shirt: '#1e2a44', collar: 'suit', accent: '#a82a2a', bg: '#d8d8d8', age: 0.6, jaw: 'square' },
  tamsen: { skin: '#d8a080', hair: '#e8e8e8', style: 'short', hat: 'captain', hatColor: '#1e2a44', beard: 'white', beardColor: '#eeeeee', brows: 'flat', mouth: 'flat', eyes: 'narrow', shirt: '#1e2a44', collar: 'jacket', accent: '#e8e8e8', bg: '#3a6aa8', age: 0.9, pipe: true, jaw: 'square' },
  bulle: { skin: '#e0a888', hair: '#5a3a24', style: 'bald', beard: 'braid', beardColor: '#6a4024', brows: 'angry', mouth: 'frown', eyes: 'narrow', shirt: '#1a1a1a', collar: 'vest', accent: '#c8602a', bg: '#a8481a', jaw: 'square', scar: true },
  kalle: { skin: '#e2b490', hair: '#3a3a3a', style: 'short', hat: 'beanie', hatColor: '#3a5a2a', beard: 'stubble', brows: 'flat', mouth: 'smirk', eyes: 'narrow', shirt: '#4a5a3a', collar: 'vest', bg: '#2a4a2a', jaw: 'square' },
  mikki: { skin: '#f2cdb0', hair: '#6a4a2a', style: 'messy', brows: 'worried', mouth: 'open', eyes: 'wide', shirt: '#3a3a5a', collar: 'hoodie', bg: '#4a4a6a', jaw: 'narrow' },
  jansen: { skin: '#d8a888', hair: '#5a5048', style: 'buzz', beard: 'stubble', brows: 'angry', mouth: 'flat', eyes: 'narrow', shirt: '#1e1e22', collar: 'jacket', bg: '#3a2a2a', scar: true, age: 0.4, jaw: 'square' },
  cop: { skin: '#e8b896', hair: '#3a2a1e', style: 'short', hat: 'police', hatColor: '#1e2a44', brows: 'flat', mouth: 'flat', eyes: 'calm', shirt: '#2a3e72', collar: 'uniform', accent: '#d8e01a', bg: '#1e3a7a', jaw: 'square' },
  wirt: { skin: '#eab898', hair: '#8a6a4a', style: 'receding', beard: 'full', beardColor: '#7a5a3a', brows: 'worried', mouth: 'frown', eyes: 'wide', shirt: '#e8e8e8', collar: 'tshirt', bg: '#5a4a2a', age: 0.6, jaw: 'round' },
  neon: { skin: '#f0d0b8', hair: '#2ad85a', style: 'buzz', brows: 'angry', mouth: 'smirk', eyes: 'narrow', shirt: '#101010', collar: 'hoodie', accent: '#2ad85a', bg: '#103a1a', jaw: 'narrow' },
  tuersteher: { skin: '#9a6444', hair: '#1a1a1a', style: 'bald', beard: 'full', beardColor: '#1a1a1a', brows: 'angry', mouth: 'frown', eyes: 'narrow', shirt: '#151515', collar: 'tshirt', bg: '#5a1a1a', jaw: 'square', chain: true },
  mehlhorn: { skin: '#f0c0a0', hair: '#d8c8a0', style: 'slick', beard: 'moustache', beardColor: '#c8b890', brows: 'raised', mouth: 'grin', eyes: 'calm', shirt: '#8a2a2a', collar: 'suit', accent: '#e8c040', bg: '#c8a040', age: 0.5, chain: true, jaw: 'round' },
};

const cache = new Map<string, string>();

type Ctx = CanvasRenderingContext2D;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

const INK = '#141414';

function path(ctx: Ctx, pts: [number, number][], close = true): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

function fillStroke(ctx: Ctx, fill: string, w = 5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** Render a portrait (256 x 256) and return a data URL (cached). */
export function portrait(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const f = FACES[id] ?? FACES.cop;
  const S = 256;
  // a real DOM canvas: we need toDataURL() for the <img> in the dialogue panel
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // background with halftone dots
  ctx.fillStyle = f.bg;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < S; y += 10) {
    for (let x = (y / 10) % 2 ? 5 : 0; x < S; x += 10) {
      const r = 1 + (y / S) * 2.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const cx = 128;
  const age = f.age ?? 0;
  // ---- torso & collar ----
  const shirt = f.shirt;
  path(ctx, [[18, 256], [34, 205], [86, 182], [170, 182], [222, 205], [238, 256]]);
  fillStroke(ctx, shirt, 6);
  ctx.fillStyle = shade(shirt, 0.72);
  path(ctx, [[150, 184], [170, 182], [222, 205], [238, 256], [176, 256]]);
  ctx.fill();
  switch (f.collar) {
    case 'jacket':
    case 'uniform': {
      path(ctx, [[96, 184], [128, 232], [112, 256], [76, 256], [86, 190]]);
      fillStroke(ctx, f.accent ?? shade(shirt, 0.8), 4);
      path(ctx, [[160, 184], [128, 232], [144, 256], [180, 256], [170, 190]]);
      fillStroke(ctx, f.accent ?? shade(shirt, 0.8), 4);
      path(ctx, [[110, 182], [128, 228], [146, 182]]);
      fillStroke(ctx, f.collar === 'uniform' ? '#c8d0e0' : '#d8d0c4', 3);
      if (f.collar === 'uniform') {
        ctx.fillStyle = f.accent ?? '#d8e01a';
        ctx.fillRect(40, 222, 40, 8);
        ctx.fillStyle = '#e8e8e8';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('POLIZEI', 176, 236);
      }
      break;
    }
    case 'hoodie': {
      path(ctx, [[78, 186], [128, 214], [178, 186], [168, 176], [128, 196], [88, 176]]);
      fillStroke(ctx, shade(shirt, 0.85), 4);
      ctx.strokeStyle = f.accent ?? '#e8e8e8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(116, 208);
      ctx.lineTo(112, 240);
      ctx.moveTo(140, 208);
      ctx.lineTo(144, 240);
      ctx.stroke();
      break;
    }
    case 'suit': {
      path(ctx, [[110, 182], [128, 240], [146, 182]]);
      fillStroke(ctx, '#f2f2f2', 3);
      path(ctx, [[122, 196], [134, 196], [138, 236], [128, 248], [118, 236]]);
      fillStroke(ctx, f.accent ?? '#a82a2a', 3);
      path(ctx, [[96, 184], [124, 236], [104, 256], [70, 256], [84, 192]]);
      fillStroke(ctx, shade(shirt, 0.9), 4);
      path(ctx, [[160, 184], [132, 236], [152, 256], [186, 256], [172, 192]]);
      fillStroke(ctx, shade(shirt, 0.9), 4);
      break;
    }
    case 'tracksuit': {
      path(ctx, [[100, 180], [128, 214], [156, 180], [150, 172], [128, 198], [106, 172]]);
      fillStroke(ctx, shade(shirt, 1.15), 4);
      ctx.strokeStyle = f.accent ?? '#c82a2a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(48, 214);
      ctx.lineTo(30, 256);
      ctx.moveTo(208, 214);
      ctx.lineTo(226, 256);
      ctx.stroke();
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(128, 214);
      ctx.lineTo(128, 256);
      ctx.stroke();
      break;
    }
    case 'turtleneck': {
      path(ctx, [[96, 170], [160, 170], [164, 196], [92, 196]]);
      fillStroke(ctx, shade(shirt, 1.4), 4);
      break;
    }
    case 'cardigan': {
      path(ctx, [[108, 182], [128, 224], [148, 182]]);
      fillStroke(ctx, f.accent ?? '#d8d0c0', 3);
      ctx.fillStyle = INK;
      for (const y of [232, 248]) {
        ctx.beginPath();
        ctx.arc(128, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'apron': {
      path(ctx, [[86, 196], [170, 196], [176, 256], [80, 256]]);
      fillStroke(ctx, f.accent ?? '#f2f2ea', 4);
      ctx.fillStyle = '#c83a2a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("GÜL'S GRILL", 128, 232);
      break;
    }
    case 'vest': {
      path(ctx, [[80, 186], [112, 256], [60, 256]]);
      fillStroke(ctx, f.accent ?? '#2a2a2a', 4);
      path(ctx, [[176, 186], [144, 256], [196, 256]]);
      fillStroke(ctx, f.accent ?? '#2a2a2a', 4);
      break;
    }
    default:
      path(ctx, [[104, 182], [128, 202], [152, 182]], false);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
  }
  if (f.chain) {
    ctx.strokeStyle = '#e8c040';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 176, 36, 0.35 * Math.PI, 0.65 * Math.PI);
    ctx.stroke();
  }
  // ---- neck ----
  path(ctx, [[104, 150], [152, 150], [156, 190], [128, 200], [100, 190]]);
  fillStroke(ctx, shade(f.skin, 0.82), 5);
  // ---- hair behind the head ----
  const hair = f.hair;
  if (f.style === 'ponytail') {
    ctx.beginPath();
    ctx.ellipse(186, 96, 22, 46, 0.35, 0, Math.PI * 2);
    fillStroke(ctx, hair, 5);
  } else if (f.style === 'perm' || f.style === 'curly' || f.style === 'bob') {
    ctx.beginPath();
    ctx.ellipse(cx, 92, 74, f.style === 'bob' ? 78 : 70, 0, 0, Math.PI * 2);
    fillStroke(ctx, hair, 5);
  }
  // ---- head ----
  const jaw = f.jaw ?? 'round';
  const jw = jaw === 'square' ? 50 : jaw === 'narrow' ? 40 : 46;
  ctx.beginPath();
  ctx.moveTo(cx - 58, 84);
  ctx.bezierCurveTo(cx - 60, 28, cx + 60, 28, cx + 58, 84);
  ctx.bezierCurveTo(cx + 58, 122, cx + jw, 150, cx + 18, 168);
  ctx.quadraticCurveTo(cx, 176, cx - 18, 168);
  ctx.bezierCurveTo(cx - jw, 150, cx - 58, 122, cx - 58, 84);
  ctx.closePath();
  fillStroke(ctx, f.skin, 6);
  // cel shadow on the right
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shade(f.skin, 0.8);
  ctx.beginPath();
  ctx.moveTo(cx + 20, 20);
  ctx.bezierCurveTo(cx + 46, 70, cx + 40, 140, cx + 6, 180);
  ctx.lineTo(cx + 90, 180);
  ctx.lineTo(cx + 90, 20);
  ctx.fill();
  ctx.restore();
  // ears
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 60, 100, 10, 16, 0, 0, Math.PI * 2);
    fillStroke(ctx, s > 0 ? shade(f.skin, 0.8) : f.skin, 4);
    if (f.earrings) {
      ctx.beginPath();
      ctx.arc(cx + s * 62, 120, 5, 0, Math.PI * 2);
      fillStroke(ctx, f.earrings, 2);
    }
  }
  // wrinkles
  if (age > 0.3) {
    ctx.strokeStyle = shade(f.skin, 0.62);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 26, 54);
    ctx.lineTo(cx + 22, 54);
    if (age > 0.6) {
      ctx.moveTo(cx - 20, 61);
      ctx.lineTo(cx + 16, 61);
    }
    ctx.moveTo(cx - 34, 124);
    ctx.quadraticCurveTo(cx - 30, 136, cx - 22, 140);
    ctx.moveTo(cx + 34, 124);
    ctx.quadraticCurveTo(cx + 30, 136, cx + 22, 140);
    ctx.stroke();
  }
  // ---- eyes ----
  const eyes = f.eyes ?? 'calm';
  const eh = eyes === 'wide' ? 9 : eyes === 'narrow' ? 4.5 : 6.5;
  for (const s of [-1, 1]) {
    const ex = cx + s * 24;
    ctx.beginPath();
    ctx.ellipse(ex, 92, 12, eh, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ffffff', 3);
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath();
    ctx.arc(ex + 2, 92, Math.min(5.5, eh), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ex + 2, 92, Math.min(3, eh * 0.6), 0, Math.PI * 2);
    ctx.fill();
    // eyelid line
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(ex, 92, 12, eh, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  // brows
  const brows = f.brows ?? 'flat';
  ctx.strokeStyle = f.style === 'bald' ? shade(f.skin, 0.45) : shade(hair, 0.75);
  ctx.lineWidth = 7;
  for (const s of [-1, 1]) {
    const bx = cx + s * 24;
    let y0 = 76;
    let y1 = 76;
    if (brows === 'angry') {
      y0 = 72;
      y1 = 82;
    } else if (brows === 'raised') {
      y0 = 72;
      y1 = 68;
    } else if (brows === 'worried') {
      y0 = 74;
      y1 = 68;
    }
    // inner end = y1 (towards the centre)
    ctx.beginPath();
    ctx.moveTo(bx + s * 14, y0);
    ctx.lineTo(bx - s * 12, y1);
    ctx.stroke();
  }
  // ---- nose ----
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (f.brokenNose) {
    ctx.moveTo(cx - 2, 96);
    ctx.lineTo(cx + 6, 110);
    ctx.lineTo(cx - 4, 122);
  } else {
    ctx.moveTo(cx + 2, 98);
    ctx.quadraticCurveTo(cx + 10, 116, cx - 2, 122);
  }
  ctx.stroke();
  ctx.fillStyle = shade(f.skin, 0.7);
  ctx.beginPath();
  ctx.ellipse(cx + 6, 122, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // ---- mouth ----
  const mouth = f.mouth ?? 'flat';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  switch (mouth) {
    case 'smile':
      ctx.moveTo(cx - 18, 140);
      ctx.quadraticCurveTo(cx, 152, cx + 18, 140);
      break;
    case 'grin':
      ctx.moveTo(cx - 22, 138);
      ctx.quadraticCurveTo(cx, 158, cx + 22, 138);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    case 'frown':
      ctx.moveTo(cx - 16, 146);
      ctx.quadraticCurveTo(cx, 136, cx + 16, 146);
      break;
    case 'smirk':
      ctx.moveTo(cx - 14, 143);
      ctx.quadraticCurveTo(cx + 6, 146, cx + 18, 136);
      break;
    case 'open':
      ctx.ellipse(cx, 143, 9, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5a1a1a';
      ctx.fill();
      break;
    default:
      ctx.moveTo(cx - 15, 142);
      ctx.lineTo(cx + 15, 142);
  }
  ctx.stroke();
  // ---- facial hair ----
  const bc = f.beardColor ?? hair;
  if (f.beard === 'stubble') {
    ctx.fillStyle = 'rgba(30,24,20,0.22)';
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI;
      const r = 30 + Math.random() * 26;
      const x = cx + Math.cos(a) * r * 0.95;
      const y = 120 + Math.sin(a) * r * 0.85;
      if (y < 124) continue;
      ctx.fillRect(x, y, 2, 2);
    }
  } else if (f.beard === 'moustache') {
    ctx.beginPath();
    ctx.moveTo(cx - 22, 134);
    ctx.quadraticCurveTo(cx, 120, cx + 22, 134);
    ctx.quadraticCurveTo(cx, 128, cx - 22, 134);
    fillStroke(ctx, bc, 3);
  } else if (f.beard === 'full' || f.beard === 'white' || f.beard === 'braid') {
    ctx.beginPath();
    ctx.moveTo(cx - 56, 108);
    ctx.quadraticCurveTo(cx - 52, 170, cx, 182);
    ctx.quadraticCurveTo(cx + 52, 170, cx + 56, 108);
    ctx.quadraticCurveTo(cx + 40, 150, cx + 18, 150);
    ctx.quadraticCurveTo(cx, 128, cx - 18, 150);
    ctx.quadraticCurveTo(cx - 40, 150, cx - 56, 108);
    fillStroke(ctx, bc, 4);
    if (f.beard === 'braid') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(cx, 192 + i * 16, 10 - i, 9, 0, 0, Math.PI * 2);
        fillStroke(ctx, shade(bc, 1 - i * 0.05), 3);
      }
    }
    // mouth on top of the beard
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 12, 144);
    ctx.lineTo(cx + 12, 144);
    ctx.stroke();
  }
  if (f.scar) {
    ctx.strokeStyle = shade(f.skin, 0.55);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 40, 76);
    ctx.lineTo(cx - 24, 116);
    ctx.stroke();
  }
  if (f.pipe) {
    ctx.strokeStyle = '#4a2a14';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx + 8, 142);
    ctx.lineTo(cx + 40, 150);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + 44, 140, 8, 12, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#5a341a', 3);
    ctx.fillStyle = 'rgba(220,220,220,0.6)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + 50 + i * 6, 122 - i * 12, 5 + i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // ---- hair on top ----
  ctx.fillStyle = hair;
  switch (f.style) {
    case 'short':
    case 'messy':
    case 'receding': {
      ctx.beginPath();
      const front = f.style === 'receding' ? 50 : 62;
      ctx.moveTo(cx - 60, 86);
      ctx.bezierCurveTo(cx - 66, 18, cx + 66, 18, cx + 60, 86);
      if (f.style === 'messy') {
        for (let i = 0; i <= 6; i++) {
          const x = cx + 56 - i * 19;
          ctx.lineTo(x, front + (i % 2 ? 6 : -4));
        }
      } else {
        ctx.quadraticCurveTo(cx + 40, front - 10, cx + 10, front - 4);
        ctx.quadraticCurveTo(cx - 30, front - 2, cx - 60, 86);
      }
      ctx.closePath();
      fillStroke(ctx, hair, 5);
      break;
    }
    case 'buzz': {
      ctx.beginPath();
      ctx.moveTo(cx - 58, 80);
      ctx.bezierCurveTo(cx - 60, 24, cx + 60, 24, cx + 58, 80);
      ctx.quadraticCurveTo(cx, 50, cx - 58, 80);
      fillStroke(ctx, hair, 4);
      break;
    }
    case 'slick': {
      ctx.beginPath();
      ctx.moveTo(cx - 60, 90);
      ctx.bezierCurveTo(cx - 70, 10, cx + 70, 10, cx + 60, 90);
      ctx.quadraticCurveTo(cx + 54, 50, cx - 20, 52);
      ctx.quadraticCurveTo(cx - 48, 56, cx - 60, 90);
      fillStroke(ctx, hair, 5);
      ctx.strokeStyle = shade(hair, 1.25);
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 40 + i * 20, 46 - i * 2);
        ctx.quadraticCurveTo(cx + i * 10, 26, cx + 40, 36 + i * 4);
        ctx.stroke();
      }
      break;
    }
    case 'perm':
    case 'curly': {
      for (let i = 0; i < 26; i++) {
        const a = Math.PI + (i / 25) * Math.PI;
        const r = 58 + (i % 3) * 4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r, 74 + Math.sin(a) * r * 0.75, 15, 0, Math.PI * 2);
        fillStroke(ctx, i % 4 === 0 && f.style === 'curly' && age > 0.3 ? '#9a9a9a' : hair, 3);
      }
      break;
    }
    case 'bob':
    case 'ponytail': {
      ctx.beginPath();
      ctx.moveTo(cx - 62, 104);
      ctx.bezierCurveTo(cx - 70, 14, cx + 70, 14, cx + 62, 104);
      ctx.quadraticCurveTo(cx + 50, 56, cx - 6, 58);
      ctx.quadraticCurveTo(cx - 50, 62, cx - 62, 104);
      fillStroke(ctx, hair, 5);
      break;
    }
    default:
      break; // bald
  }
  if (f.style === 'bald') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - 20, 40, 18, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- glasses ----
  if (f.glasses) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (f.glasses === 'round') ctx.arc(cx + s * 24, 92, 15, 0, Math.PI * 2);
      else ctx.rect(cx + s * 24 - 17, 82, 34, 21);
      if (f.glasses === 'shades') {
        ctx.fillStyle = '#101010';
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(200,230,255,0.25)';
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 9, 90);
    ctx.lineTo(cx + 9, 90);
    ctx.stroke();
  }
  // ---- hats ----
  const hc = f.hatColor ?? '#2a2a2a';
  switch (f.hat) {
    case 'flatcap':
      ctx.beginPath();
      ctx.moveTo(cx - 64, 66);
      ctx.bezierCurveTo(cx - 64, 18, cx + 70, 14, cx + 66, 62);
      ctx.quadraticCurveTo(cx + 80, 74, cx + 30, 70);
      ctx.lineTo(cx - 64, 66);
      fillStroke(ctx, hc, 5);
      break;
    case 'captain':
      ctx.beginPath();
      ctx.moveTo(cx - 62, 64);
      ctx.lineTo(cx - 54, 22);
      ctx.quadraticCurveTo(cx, 8, cx + 54, 22);
      ctx.lineTo(cx + 62, 64);
      ctx.closePath();
      fillStroke(ctx, '#f2f2f2', 5);
      ctx.beginPath();
      ctx.rect(cx - 62, 52, 124, 14);
      fillStroke(ctx, hc, 4);
      ctx.beginPath();
      ctx.moveTo(cx - 50, 66);
      ctx.quadraticCurveTo(cx, 84, cx + 50, 66);
      fillStroke(ctx, '#151515', 4);
      ctx.fillStyle = '#e8c040';
      ctx.beginPath();
      ctx.arc(cx, 46, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'police':
      ctx.beginPath();
      ctx.moveTo(cx - 60, 64);
      ctx.lineTo(cx - 52, 24);
      ctx.quadraticCurveTo(cx, 12, cx + 52, 24);
      ctx.lineTo(cx + 60, 64);
      ctx.closePath();
      fillStroke(ctx, hc, 5);
      ctx.fillStyle = '#d8e01a';
      ctx.fillRect(cx - 60, 52, 120, 6);
      ctx.beginPath();
      ctx.moveTo(cx - 48, 64);
      ctx.quadraticCurveTo(cx, 82, cx + 48, 64);
      fillStroke(ctx, '#101010', 4);
      break;
    case 'beanie':
      ctx.beginPath();
      ctx.moveTo(cx - 62, 72);
      ctx.bezierCurveTo(cx - 66, 6, cx + 66, 6, cx + 62, 72);
      ctx.closePath();
      fillStroke(ctx, hc, 5);
      ctx.beginPath();
      ctx.rect(cx - 64, 58, 128, 16);
      fillStroke(ctx, shade(hc, 0.8), 4);
      break;
    case 'cap':
    case 'capback':
      ctx.beginPath();
      ctx.moveTo(cx - 60, 70);
      ctx.bezierCurveTo(cx - 62, 14, cx + 62, 14, cx + 60, 70);
      ctx.closePath();
      fillStroke(ctx, hc, 5);
      if (f.hat === 'cap') {
        ctx.beginPath();
        ctx.moveTo(cx - 40, 66);
        ctx.quadraticCurveTo(cx + 20, 90, cx + 76, 70);
        ctx.lineTo(cx + 50, 60);
        fillStroke(ctx, shade(hc, 0.8), 4);
      } else {
        ctx.beginPath();
        ctx.rect(cx - 20, 60, 40, 9);
        fillStroke(ctx, '#e8e8e8', 3);
      }
      break;
    default:
      break;
  }
  const url = canvas.toDataURL('image/png');
  cache.set(id, url);
  return url;
}
