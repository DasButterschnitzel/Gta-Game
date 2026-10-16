// Procedural top-down pixel-art people. Region-id atlas + per-instance palettes, one draw call.
import * as THREE from 'three';
import { GU, SHADER_COMMON } from './globals';
import { rgb } from './geom';

export const FRAME_PX = 64; // 2 m x 2 m per frame (32 px per metre)
const COLS = 8;
const ROWS = 4;
const W = FRAME_PX * COLS;
const H = FRAME_PX * ROWS;

// Frame indices
export const F_WALK = 0; // 0..7
export const F_RUN = 8; // 8..15
export const F_IDLE = 16;
export const F_PUNCH = 17; // 17,18
export const F_PISTOL = 19;
export const F_RIFLE = 20;
export const F_BAT = 21; // 21,22
export const F_THROW = 23;
export const F_DEAD = 24; // 24,25
export const F_DOWN = 26;
export const F_SIT = 27;

// region ids
const SKIN = 1;
const HAIR = 2;
const TOP = 3;
const BOTTOM = 4;
const SHOES = 5;
const ACCENT = 6;
const DARK = 7;

class Raster {
  id = new Uint8Array(W * H);
  shade = new Uint8Array(W * H);
  ox = 0;
  oy = 0;
  setFrame(f: number): void {
    this.ox = (f % COLS) * FRAME_PX;
    this.oy = Math.floor(f / COLS) * FRAME_PX;
  }
  /** filled ellipse in frame-local pixel coords (centre 32,32; forward = -y) */
  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, id: number, light = 1): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const R = Math.ceil(Math.max(rx, ry)) + 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        const d = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
        if (d > 1) continue;
        if (x < 0 || y < 0 || x >= FRAME_PX || y >= FRAME_PX) continue;
        const i = (this.oy + y) * W + this.ox + x;
        this.id[i] = id;
        // pseudo 3D shading: lighter towards the upper-left, darker at the rim
        const nx = lx / rx;
        const ny = ly / ry;
        const l = 0.72 + 0.28 * (1 - d) + 0.12 * (-nx * 0.6 - ny * 0.8);
        this.shade[i] = Math.max(0, Math.min(255, Math.round(255 * Math.min(1, l * light))));
      }
    }
  }
  rect(cx: number, cy: number, w: number, h: number, rot: number, id: number, light = 1): void {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const R = Math.ceil(Math.hypot(w, h) / 2) + 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) > w / 2 || Math.abs(ly) > h / 2) continue;
        if (x < 0 || y < 0 || x >= FRAME_PX || y >= FRAME_PX) continue;
        const i = (this.oy + y) * W + this.ox + x;
        this.id[i] = id;
        this.shade[i] = Math.round(255 * Math.min(1, 0.85 * light));
      }
    }
  }
  outline(): void {
    // 1px dark outline around the silhouette (pixel-art readability)
    const src = this.id.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (src[i] !== 0) continue;
        if (src[i - 1] || src[i + 1] || src[i - W] || src[i + W]) {
          // stay inside the frame cell
          if (x % FRAME_PX === 0 || x % FRAME_PX === FRAME_PX - 1 || y % FRAME_PX === 0 || y % FRAME_PX === FRAME_PX - 1) continue;
          this.id[i] = DARK;
          this.shade[i] = 40;
        }
      }
    }
  }
}

interface Pose {
  legL: number; // forward offset (px) of left leg
  legR: number;
  armL: number; // forward offset of left arm
  armR: number;
  armLOut?: number; // sideways extension
  armROut?: number;
  lean?: number;
  weapon?: 'pistol' | 'rifle' | 'bat' | null;
  batAngle?: number;
}

function drawStanding(r: Raster, p: Pose): void {
  const cx = 32;
  const cy = 32 + (p.lean ?? 0);
  // legs (behind torso)
  for (const [side, off] of [
    [-1, p.legL],
    [1, p.legR],
  ] as const) {
    const lx = cx + side * 3.2;
    const ly = cy - off;
    r.ellipse(lx, ly, 2.3, 4.2, 0, BOTTOM, 0.9);
    r.ellipse(lx, ly - Math.sign(off || 1) * 3.6 * (Math.abs(off) > 1 ? 1 : 0.3), 2.0, 2.4, 0, SHOES, 0.85);
  }
  // arms
  const armY = (o: number): number => cy - o;
  const aL = p.armL;
  const aR = p.armR;
  r.ellipse(cx - 8.2 - (p.armLOut ?? 0), armY(aL), 2.0, 4.0, 0, TOP, 0.9);
  r.ellipse(cx - 8.4 - (p.armLOut ?? 0), armY(aL) - Math.sign(aL || 1) * 3.6, 1.6, 1.6, 0, SKIN, 1);
  r.ellipse(cx + 8.2 + (p.armROut ?? 0), armY(aR), 2.0, 4.0, 0, TOP, 0.9);
  r.ellipse(cx + 8.4 + (p.armROut ?? 0), armY(aR) - Math.sign(aR || 1) * 3.6, 1.6, 1.6, 0, SKIN, 1);
  // weapon
  if (p.weapon === 'pistol') {
    r.rect(cx + 8.2, cy - 15, 2, 6, 0, DARK, 0.6);
  } else if (p.weapon === 'rifle') {
    r.rect(cx + 3, cy - 14, 2.2, 15, 0.05, DARK, 0.6);
  } else if (p.weapon === 'bat') {
    const a = p.batAngle ?? 0;
    r.rect(cx + 8 + Math.sin(a) * 6, cy - 10 - Math.cos(a) * 6, 2.4, 14, a, ACCENT, 0.9);
  }
  // torso (shoulders)
  r.ellipse(cx, cy, 8.2, 4.6, 0, TOP, 1);
  // collar / neck hint
  r.ellipse(cx, cy - 1.5, 2.6, 1.6, 0, SKIN, 0.9);
  // head: hair with a face crescent at the front
  r.ellipse(cx, cy - 1.2, 3.8, 4.0, 0, SKIN, 1);
  r.ellipse(cx, cy + 0.2, 3.7, 3.4, 0, HAIR, 1);
}

function drawLying(r: Raster, variant: number): void {
  const cx = 32;
  const cy = 32;
  const tilt = variant === 1 ? 0.35 : variant === 2 ? -0.2 : 0;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const P = (x: number, y: number): [number, number] => [cx + x * c - y * s, cy + x * s + y * c];
  // legs
  let [x, y] = P(-3.5, 12);
  r.ellipse(x, y, 2.6, 9, tilt + 0.12, BOTTOM, 0.9);
  [x, y] = P(3.8, 12);
  r.ellipse(x, y, 2.6, 9, tilt - 0.2, BOTTOM, 0.9);
  [x, y] = P(-4.5, 21);
  r.ellipse(x, y, 2.2, 2.4, tilt, SHOES, 0.85);
  [x, y] = P(5.5, 21);
  r.ellipse(x, y, 2.2, 2.4, tilt, SHOES, 0.85);
  // torso
  [x, y] = P(0, -2);
  r.ellipse(x, y, 7.4, 9.5, tilt, TOP, 1);
  // arms spread
  [x, y] = P(-11, -6);
  r.ellipse(x, y, 2.2, 6.5, tilt + 0.9, TOP, 0.9);
  [x, y] = P(11, -4);
  r.ellipse(x, y, 2.2, 6.5, tilt - (variant === 1 ? 0.3 : 1.0), TOP, 0.9);
  [x, y] = P(-15.5, -9);
  r.ellipse(x, y, 1.8, 1.8, 0, SKIN, 1);
  [x, y] = P(15, -8);
  r.ellipse(x, y, 1.8, 1.8, 0, SKIN, 1);
  // head
  [x, y] = P(0, -14.5);
  r.ellipse(x, y, 3.9, 4.2, tilt, SKIN, 1);
  [x, y] = P(0, -15.5);
  r.ellipse(x, y, 3.8, 3.2, tilt, HAIR, 1);
}

function drawSitting(r: Raster): void {
  // seated (e.g. on a bench), legs forward
  const cx = 32;
  const cy = 30;
  r.ellipse(cx - 3.2, cy - 7, 2.3, 5, 0, BOTTOM, 0.9);
  r.ellipse(cx + 3.2, cy - 7, 2.3, 5, 0, BOTTOM, 0.9);
  r.ellipse(cx - 3.2, cy - 12.5, 2, 2, 0, SHOES, 0.85);
  r.ellipse(cx + 3.2, cy - 12.5, 2, 2, 0, SHOES, 0.85);
  r.ellipse(cx, cy, 8.2, 4.6, 0, TOP, 1);
  r.ellipse(cx - 8, cy - 2, 2, 3.6, 0, TOP, 0.9);
  r.ellipse(cx + 8, cy - 2, 2, 3.6, 0, TOP, 0.9);
  r.ellipse(cx, cy - 1.2, 3.8, 4.0, 0, SKIN, 1);
  r.ellipse(cx, cy + 0.2, 3.7, 3.4, 0, HAIR, 1);
}

let atlasTex: THREE.DataTexture | null = null;

export function characterAtlas(): THREE.DataTexture {
  if (atlasTex) return atlasTex;
  const r = new Raster();
  for (let i = 0; i < 8; i++) {
    const ph = (i / 8) * Math.PI * 2;
    const sw = Math.sin(ph);
    r.setFrame(F_WALK + i);
    drawStanding(r, { legL: sw * 4.2, legR: -sw * 4.2, armL: -sw * 2.6, armR: sw * 2.6 });
    r.setFrame(F_RUN + i);
    drawStanding(r, { legL: sw * 6.5, legR: -sw * 6.5, armL: -sw * 4.2, armR: sw * 4.2, lean: -1 });
  }
  r.setFrame(F_IDLE);
  drawStanding(r, { legL: 0.5, legR: -0.5, armL: 0, armR: 0 });
  r.setFrame(F_PUNCH);
  drawStanding(r, { legL: 1.5, legR: -1.5, armL: 0, armR: 9, armROut: -2.5 });
  r.setFrame(F_PUNCH + 1);
  drawStanding(r, { legL: 1.5, legR: -1.5, armL: 3, armR: 3 });
  r.setFrame(F_PISTOL);
  drawStanding(r, { legL: 1, legR: -1, armL: 2, armR: 8, armROut: -1, weapon: 'pistol' });
  r.setFrame(F_RIFLE);
  drawStanding(r, { legL: 1.5, legR: -1.5, armL: 7, armR: 5, armLOut: -3.5, armROut: -2, weapon: 'rifle' });
  r.setFrame(F_BAT);
  drawStanding(r, { legL: 1.5, legR: -1.5, armL: 2, armR: 4, weapon: 'bat', batAngle: -0.9 });
  r.setFrame(F_BAT + 1);
  drawStanding(r, { legL: 2, legR: -2, armL: 3, armR: 8, armROut: -2, weapon: 'bat', batAngle: 0.6 });
  r.setFrame(F_THROW);
  drawStanding(r, { legL: 2, legR: -2, armL: -2, armR: 9, armROut: 1 });
  r.setFrame(F_DEAD);
  drawLying(r, 0);
  r.setFrame(F_DEAD + 1);
  drawLying(r, 1);
  r.setFrame(F_DOWN);
  drawLying(r, 2);
  r.setFrame(F_SIT);
  drawSitting(r);
  r.outline();
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const id = r.id[i];
    data[i * 4] = id * 32 + 16;
    data[i * 4 + 1] = r.shade[i];
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = id ? 255 : 0;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  atlasTex = tex;
  return tex;
}

export interface CharLook {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  accent: number;
}

export interface CharDraw {
  x: number;
  y: number;
  z: number;
  rot: number; // heading (rad, 0 = east)
  frame: number;
  look: CharLook;
  flash: number;
}

/** Instanced renderer for all characters. */
export class CharacterRenderer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private iPos: THREE.InstancedBufferAttribute;
  private iFrame: THREE.InstancedBufferAttribute;
  private iCol: THREE.InstancedBufferAttribute[] = [];
  readonly max: number;

  constructor(max = 220) {
    this.max = max;
    const base = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.iFrame = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.iPos.setUsage(THREE.DynamicDrawUsage);
    this.iFrame.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.iPos);
    this.geo.setAttribute('iFrame', this.iFrame);
    const names = ['iSkin', 'iHair', 'iTop', 'iBottom', 'iShoes', 'iAccent'];
    for (const n of names) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(n, a);
      this.iCol.push(a);
    }
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uAtlas: { value: characterAtlas() },
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
      },
      vertexShader: /* glsl */ `
        in vec4 iPos;
        in vec2 iFrame;
        in vec3 iSkin;
        in vec3 iHair;
        in vec3 iTop;
        in vec3 iBottom;
        in vec3 iShoes;
        in vec3 iAccent;
        out vec2 vUv;
        out vec3 vWorld;
        flat out vec3 vPal[6];
        flat out float vFlash;
        void main() {
          // sprite drawn facing +y (up); rotate so it faces heading
          float a = iPos.w - 1.5707963;
          float c = cos(a);
          float s = sin(a);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
          vec3 wp = vec3(iPos.xy + p, iPos.z);
          vWorld = wp;
          float f = iFrame.x;
          float col = mod(f, 8.0);
          float row = floor(f / 8.0);
          // texture row 0 is the first (top) canvas row; uv.y=1 at the sprite top
          vUv = vec2((col + uv.x) / 8.0, (row + (1.0 - uv.y)) / 4.0);
          vPal[0] = iSkin; vPal[1] = iHair; vPal[2] = iTop; vPal[3] = iBottom; vPal[4] = iShoes; vPal[5] = iAccent;
          vFlash = iFrame.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uAtlas;
        ${SHADER_COMMON}
        in vec2 vUv;
        in vec3 vWorld;
        flat in vec3 vPal[6];
        flat in float vFlash;
        out vec4 fragColor;
        void main() {
          vec4 t = texture(uAtlas, vUv);
          if (t.a < 0.5) discard;
          int id = int(floor(t.r * 255.0 / 32.0));
          vec3 col = vec3(0.12);
          if (id == 1) col = vPal[0];
          else if (id == 2) col = vPal[1];
          else if (id == 3) col = vPal[2];
          else if (id == 4) col = vPal[3];
          else if (id == 5) col = vPal[4];
          else if (id == 6) col = vPal[5];
          col *= t.g;
          vec3 lm = texture(uLightmap, vWorld.xy / uWorldSize).rgb;
          col = applyLight(col, vec3(lm.r * 0.5, lm.g, lm.b), 1.0);
          col = mix(col, vec3(1.0, 0.25, 0.2), vFlash);
          fragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  update(list: CharDraw[]): void {
    const n = Math.min(list.length, this.max);
    const pos = this.iPos.array as Float32Array;
    const fr = this.iFrame.array as Float32Array;
    const cols = this.iCol.map((a) => a.array as Float32Array);
    for (let i = 0; i < n; i++) {
      const d = list[i];
      pos[i * 4] = d.x;
      pos[i * 4 + 1] = d.y;
      pos[i * 4 + 2] = d.z;
      pos[i * 4 + 3] = d.rot;
      fr[i * 2] = d.frame;
      fr[i * 2 + 1] = d.flash;
      const L = d.look;
      const pal = [L.skin, L.hair, L.top, L.bottom, L.shoes, L.accent];
      for (let k = 0; k < 6; k++) {
        const [r, g, b] = rgb(pal[k]);
        cols[k][i * 3] = r;
        cols[k][i * 3 + 1] = g;
        cols[k][i * 3 + 2] = b;
      }
    }
    this.geo.instanceCount = n;
    this.iPos.needsUpdate = true;
    this.iFrame.needsUpdate = true;
    for (const a of this.iCol) a.needsUpdate = true;
  }
}
