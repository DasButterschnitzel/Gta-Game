// Spinning pickup crates with icons (drawn in code) and a soft pulsing glow underneath.
import * as THREE from 'three';
import { makeCanvas } from './texgen';
import { GU } from './globals';
import type { Pickup } from '../game/pickups';
import { pickupIcon } from '../game/pickups';

const CELL = 64;
const COLS = 8;
export const ICON_COUNT = 11;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function crate(ctx: Ctx, ox: number, oy: number, border: string): void {
  const r = 10;
  const x = ox + 5;
  const y = oy + 5;
  const w = CELL - 10;
  ctx.fillStyle = 'rgba(14,16,20,0.92)';
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + w, r);
  ctx.arcTo(x + w, y + w, x, y + w, r);
  ctx.arcTo(x, y + w, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawIcons(): HTMLCanvasElement | OffscreenCanvas {
  const { canvas, ctx } = makeCanvas(CELL * COLS, CELL * 2);
  ctx.clearRect(0, 0, CELL * COLS, CELL * 2);
  const at = (i: number): [number, number] => [(i % COLS) * CELL, Math.floor(i / COLS) * CELL];
  const gun = '#e8e8e8';
  const weaponBorder = '#ff4a3a';
  // 0 pistol
  {
    const [ox, oy] = at(0);
    crate(ctx, ox, oy, weaponBorder);
    ctx.fillStyle = gun;
    ctx.fillRect(ox + 16, oy + 22, 30, 8); // slide
    ctx.fillRect(ox + 18, oy + 29, 9, 16); // grip
    ctx.fillRect(ox + 27, oy + 30, 5, 5); // trigger guard
  }
  // 1 smg
  {
    const [ox, oy] = at(1);
    crate(ctx, ox, oy, weaponBorder);
    ctx.fillStyle = gun;
    ctx.fillRect(ox + 12, oy + 22, 38, 8);
    ctx.fillRect(ox + 44, oy + 24, 8, 3); // barrel
    ctx.fillRect(ox + 20, oy + 29, 7, 13); // grip
    ctx.fillRect(ox + 31, oy + 29, 6, 17); // magazine
    ctx.fillRect(ox + 8, oy + 23, 6, 4); // stock
  }
  // 2 shotgun
  {
    const [ox, oy] = at(2);
    crate(ctx, ox, oy, weaponBorder);
    ctx.fillStyle = '#b07a42';
    ctx.fillRect(ox + 9, oy + 28, 14, 9); // stock
    ctx.fillStyle = gun;
    ctx.fillRect(ox + 21, oy + 26, 33, 5);
    ctx.fillRect(ox + 21, oy + 31, 24, 4);
  }
  // 3 rifle
  {
    const [ox, oy] = at(3);
    crate(ctx, ox, oy, weaponBorder);
    ctx.fillStyle = gun;
    ctx.fillRect(ox + 9, oy + 26, 44, 6);
    ctx.fillRect(ox + 50, oy + 27, 6, 3);
    ctx.fillRect(ox + 30, oy + 31, 6, 14); // curved mag (approx)
    ctx.fillRect(ox + 22, oy + 31, 5, 9);
    ctx.fillRect(ox + 8, oy + 25, 10, 10); // stock
  }
  // 4 bat
  {
    const [ox, oy] = at(4);
    crate(ctx, ox, oy, '#ffb03a');
    ctx.save();
    ctx.translate(ox + 32, oy + 32);
    ctx.rotate(-0.7);
    ctx.fillStyle = '#d8a868';
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.lineTo(10, -5);
    ctx.quadraticCurveTo(22, -5, 22, 0);
    ctx.quadraticCurveTo(22, 5, 10, 5);
    ctx.lineTo(-20, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(-22, -3, 6, 6);
    ctx.restore();
  }
  // 5 molotov
  {
    const [ox, oy] = at(5);
    crate(ctx, ox, oy, '#ff8a2a');
    ctx.fillStyle = '#4a8a3a';
    ctx.fillRect(ox + 24, oy + 26, 16, 22);
    ctx.fillRect(ox + 28, oy + 18, 8, 9);
    ctx.fillStyle = '#f0e0c0';
    ctx.fillRect(ox + 29, oy + 12, 6, 7); // rag
    ctx.fillStyle = '#ffb030';
    ctx.beginPath();
    ctx.arc(ox + 32, oy + 11, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 6 grenade
  {
    const [ox, oy] = at(6);
    crate(ctx, ox, oy, '#9ad040');
    ctx.fillStyle = '#5a6a3a';
    ctx.beginPath();
    ctx.ellipse(ox + 32, oy + 35, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(ox + 27, oy + 17, 10, 7);
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox + 41, oy + 20, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 7 health
  {
    const [ox, oy] = at(7);
    crate(ctx, ox, oy, '#ffffff');
    ctx.fillStyle = '#e8302a';
    ctx.fillRect(ox + 26, oy + 15, 12, 34);
    ctx.fillRect(ox + 15, oy + 26, 34, 12);
  }
  // 8 armour vest
  {
    const [ox, oy] = at(8);
    crate(ctx, ox, oy, '#4aa0ff');
    ctx.fillStyle = '#3a4a6a';
    ctx.beginPath();
    ctx.moveTo(ox + 20, oy + 14);
    ctx.lineTo(ox + 27, oy + 14);
    ctx.lineTo(ox + 32, oy + 20);
    ctx.lineTo(ox + 37, oy + 14);
    ctx.lineTo(ox + 44, oy + 14);
    ctx.lineTo(ox + 47, oy + 48);
    ctx.lineTo(ox + 17, oy + 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d0e0ff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCHUTZ', ox + 32, oy + 37);
  }
  // 9 money
  {
    const [ox, oy] = at(9);
    crate(ctx, ox, oy, '#7ce07c');
    ctx.fillStyle = '#3e8a4a';
    ctx.fillRect(ox + 12, oy + 20, 40, 24);
    ctx.strokeStyle = '#a8e0a0';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 14, oy + 22, 36, 20);
    ctx.fillStyle = '#e8ffe0';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('€', ox + 32, oy + 33);
  }
  // 10 police bribe: envelope with a blue star
  {
    const [ox, oy] = at(10);
    crate(ctx, ox, oy, '#3a7aff');
    ctx.fillStyle = '#f0e8d0';
    ctx.fillRect(ox + 13, oy + 20, 38, 26);
    ctx.strokeStyle = '#a89870';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + 13, oy + 20);
    ctx.lineTo(ox + 32, oy + 34);
    ctx.lineTo(ox + 51, oy + 20);
    ctx.stroke();
    ctx.fillStyle = '#2a5aff';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? 4 : 9;
      const px = ox + 32 + Math.cos(a) * r;
      const py = oy + 40 + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

const MAX = 128;

export class PickupRenderer {
  readonly root = new THREE.Group();
  private icons: THREE.Mesh;
  private glow: THREE.Mesh;
  private geoI: THREE.InstancedBufferGeometry;
  private geoG: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private gPos: THREE.InstancedBufferAttribute;
  private gCol: THREE.InstancedBufferAttribute;

  constructor() {
    const tex = new THREE.CanvasTexture(drawIcons() as HTMLCanvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const base = new THREE.PlaneGeometry(1, 1);
    // icons
    this.geoI = new THREE.InstancedBufferGeometry();
    this.geoI.index = base.index;
    this.geoI.setAttribute('position', base.getAttribute('position'));
    this.geoI.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.geoI.setAttribute('iPos', this.aPos);
    this.geoI.setAttribute('iData', this.aData);
    this.geoI.instanceCount = 0;
    const matI = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      uniforms: { uTex: { value: tex }, uDay: GU.uDay },
      vertexShader: /* glsl */ `
        in vec4 iPos;   // x y z size
        in vec2 iData;  // icon, rotation
        out vec2 vUv;
        void main() {
          float c = cos(iData.y);
          float s = sin(iData.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iPos.w;
          float icon = iData.x;
          vec2 cell = vec2(mod(icon, ${COLS}.0), floor(icon / ${COLS}.0));
          vUv = vec2((cell.x + uv.x) / ${COLS}.0, 1.0 - (cell.y + 1.0 - uv.y) / 2.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xy + p, iPos.z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uTex;
        uniform float uDay;
        in vec2 vUv;
        out vec4 fragColor;
        void main() {
          vec4 t = texture(uTex, vUv);
          if (t.a < 0.02) discard;
          fragColor = vec4(t.rgb * mix(0.85, 1.0, uDay), t.a);
        }`,
    });
    this.icons = new THREE.Mesh(this.geoI, matI);
    this.icons.frustumCulled = false;
    this.icons.renderOrder = 7;
    // glow
    const { canvas, ctx } = makeCanvas(64, 64);
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    const gtex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
    this.geoG = new THREE.InstancedBufferGeometry();
    this.geoG.index = base.index;
    this.geoG.setAttribute('position', base.getAttribute('position'));
    this.geoG.setAttribute('uv', base.getAttribute('uv'));
    this.gPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.gCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geoG.setAttribute('iPos', this.gPos);
    this.geoG.setAttribute('iCol', this.gCol);
    this.geoG.instanceCount = 0;
    const matG = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: gtex } },
      vertexShader: /* glsl */ `
        in vec4 iPos;
        in vec4 iCol;
        out vec2 vUv;
        out vec4 vCol;
        void main() {
          vUv = uv;
          vCol = iCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xy + position.xy * iPos.w, iPos.z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uTex;
        in vec2 vUv;
        in vec4 vCol;
        out vec4 fragColor;
        void main() { float a = texture(uTex, vUv).a * vCol.a; fragColor = vec4(vCol.rgb * a, a); }`,
    });
    this.glow = new THREE.Mesh(this.geoG, matG);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 6;
    this.root.add(this.glow, this.icons);
  }

  update(list: Pickup[], time: number, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const P = this.aPos.array as Float32Array;
    const D = this.aData.array as Float32Array;
    const GP = this.gPos.array as Float32Array;
    const GC = this.gCol.array as Float32Array;
    let n = 0;
    for (const p of list) {
      if (!p.active) continue;
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      if (n >= MAX) break;
      const ph = p.id * 1.7;
      const blink = p.life < 6 ? (Math.sin(time * 18) > 0 ? 1 : 0.15) : 1;
      const size = (1.25 + Math.sin(time * 3.2 + ph) * 0.08) * (blink > 0.5 ? 1 : 0.85);
      P[n * 4] = p.x;
      P[n * 4 + 1] = p.y;
      P[n * 4 + 2] = 0.9;
      P[n * 4 + 3] = size;
      D[n * 2] = pickupIcon(p);
      D[n * 2 + 1] = Math.sin(time * 1.6 + ph) * 0.35;
      GP[n * 4] = p.x;
      GP[n * 4 + 1] = p.y;
      GP[n * 4 + 2] = 0.3;
      GP[n * 4 + 3] = 3.2 + Math.sin(time * 4 + ph) * 0.4;
      const col = p.kind === 'weapon' ? [1, 0.45, 0.3] : p.kind === 'health' ? [1, 0.4, 0.4] : p.kind === 'armor' ? [0.4, 0.65, 1] : p.kind === 'money' ? [0.5, 1, 0.5] : [0.4, 0.55, 1];
      GC[n * 4] = col[0];
      GC[n * 4 + 1] = col[1];
      GC[n * 4 + 2] = col[2];
      GC[n * 4 + 3] = 0.42 * blink;
      n++;
    }
    this.geoI.instanceCount = n;
    this.geoG.instanceCount = n;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.gPos.needsUpdate = true;
    this.gCol.needsUpdate = true;
  }
}
