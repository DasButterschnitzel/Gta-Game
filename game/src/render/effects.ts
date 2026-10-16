// Particles (smoke, fire, sparks, debris), skid marks and decals.
import * as THREE from 'three';
import { makeCanvas } from './texgen';
import { GU, SHADER_COMMON } from './globals';
import { RNG } from '../core/rng';

const rng = new RNG(31337);

function puffTexture(): THREE.Texture {
  const S = 64;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const x = 32 + rng.range(-12, 12);
    const y = 32 + rng.range(-12, 12);
    const r = rng.range(10, 20);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function dotTexture(): THREE.Texture {
  const S = 32;
  const { canvas, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function decalTexture(): THREE.Texture {
  // 2x2 atlas: blood, scorch, oil, glass shards
  const S = 128;
  const { canvas, ctx } = makeCanvas(S * 2, S * 2);
  ctx.clearRect(0, 0, S * 2, S * 2);
  const blob = (ox: number, oy: number, col: string, n: number, rmin: number, rmax: number): void => {
    for (let i = 0; i < n; i++) {
      const x = ox + 64 + rng.range(-30, 30) * (i / n);
      const y = oy + 64 + rng.range(-30, 30) * (i / n);
      const r = rng.range(rmin, rmax) * (1 - i / (n * 1.4));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  blob(0, 0, 'rgba(110,8,8,0.55)', 26, 6, 26);
  blob(S, 0, 'rgba(10,10,10,0.5)', 30, 10, 40);
  blob(0, S, 'rgba(20,20,26,0.4)', 18, 8, 28);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(200,230,255,${rng.range(0.3, 0.8)})`;
    ctx.fillRect(S + 64 + rng.range(-40, 40), S + 64 + rng.range(-40, 40), rng.range(1, 4), rng.range(1, 4));
  }
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

class ParticlePool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private n = 0;
  // state arrays
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private cr: Float32Array;
  private cg: Float32Array;
  private cb: Float32Array;
  private ca: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;

  constructor(
    readonly max: number,
    tex: THREE.Texture,
    additive: boolean,
    darkenAtNight: boolean,
  ) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iCol', this.aCol);
    const rot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    rot.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iRot', rot);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: tex }, uDay: GU.uDay, uNightDark: { value: darkenAtNight ? 1 : 0 } },
      vertexShader: /* glsl */ `
        in vec4 iPos;
        in vec4 iCol;
        in float iRot;
        out vec2 vUv;
        out vec4 vCol;
        void main() {
          float c = cos(iRot);
          float s = sin(iRot);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iPos.w;
          vUv = uv;
          vCol = iCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos.xy + p, iPos.z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uTex;
        uniform float uDay;
        uniform float uNightDark;
        in vec2 vUv;
        in vec4 vCol;
        out vec4 fragColor;
        void main() {
          vec4 t = texture(uTex, vUv);
          vec3 c = vCol.rgb * mix(1.0, mix(0.35, 1.0, uDay), uNightDark);
          fragColor = vec4(c, t.a * vCol.a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 9 : 8;
    const f = (): Float32Array => new Float32Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.size = f();
    this.grow = f();
    this.life = f();
    this.maxLife = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.ca = f();
    this.drag = f();
    this.rot = f();
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, grow: number, life: number, color: number, alpha: number, drag = 1): void {
    let i = this.n;
    if (i >= this.max) {
      // replace a random old particle
      i = Math.floor(Math.random() * this.max);
    } else this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.cr[i] = ((color >> 16) & 255) / 255;
    this.cg[i] = ((color >> 8) & 255) / 255;
    this.cb[i] = (color & 255) / 255;
    this.ca[i] = alpha;
    this.drag[i] = drag;
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt: number): void {
    let n = this.n;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const R = this.geo.getAttribute('iRot').array as Float32Array;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k;
      this.vy[i] *= k;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.size[i] += this.grow[i] * dt;
      this.rot[i] += dt * 0.4;
    }
    this.n = n;
    for (let i = 0; i < n; i++) {
      const t = this.life[i] / this.maxLife[i];
      P[i * 4] = this.px[i];
      P[i * 4 + 1] = this.py[i];
      P[i * 4 + 2] = this.pz[i];
      P[i * 4 + 3] = this.size[i];
      C[i * 4] = this.cr[i];
      C[i * 4 + 1] = this.cg[i];
      C[i * 4 + 2] = this.cb[i];
      C[i * 4 + 3] = this.ca[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8 + 0.3);
      R[i] = this.rot[i];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.geo.getAttribute('iRot').needsUpdate = true;
  }

  private copy(from: number, to: number): void {
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.size[to] = this.size[from];
    this.grow[to] = this.grow[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.cr[to] = this.cr[from];
    this.cg[to] = this.cg[from];
    this.cb[to] = this.cb[from];
    this.ca[to] = this.ca[from];
    this.drag[to] = this.drag[from];
    this.rot[to] = this.rot[from];
  }
}

/** Ring buffer of flat quads on the ground (skid marks / decals). */
class GroundQuads {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private uv: Float32Array;
  private alpha: Float32Array;
  private head = 0;
  private geo: THREE.BufferGeometry;

  constructor(
    private max: number,
    material: THREE.Material,
    private z: number,
  ) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.uv = new Float32Array(max * 4 * 2);
    this.alpha = new Float32Array(max * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  add(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, uv: [number, number, number, number], a: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const p = this.pos;
    const o = i * 12;
    p[o] = x0;
    p[o + 1] = y0;
    p[o + 2] = this.z;
    p[o + 3] = x1;
    p[o + 4] = y1;
    p[o + 5] = this.z;
    p[o + 6] = x2;
    p[o + 7] = y2;
    p[o + 8] = this.z;
    p[o + 9] = x3;
    p[o + 10] = y3;
    p[o + 11] = this.z;
    const u = this.uv;
    const q = i * 8;
    u[q] = uv[0];
    u[q + 1] = uv[1];
    u[q + 2] = uv[2];
    u[q + 3] = uv[1];
    u[q + 4] = uv[2];
    u[q + 5] = uv[3];
    u[q + 6] = uv[0];
    u[q + 7] = uv[3];
    this.alpha.fill(a, i * 4, i * 4 + 4);
    const posAttr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const uvAttr = this.geo.getAttribute('uv') as THREE.BufferAttribute;
    const aAttr = this.geo.getAttribute('aAlpha') as THREE.BufferAttribute;
    posAttr.addUpdateRange(o, 12);
    uvAttr.addUpdateRange(q, 8);
    aAttr.addUpdateRange(i * 4, 4);
    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    aAttr.needsUpdate = true;
  }
}

function groundQuadMaterial(tex: THREE.Texture | null, color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: {
      uTex: { value: tex },
      uHasTex: { value: tex ? 1 : 0 },
      uColor: { value: color },
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
      in float aAlpha;
      out vec2 vUv;
      out float vA;
      out vec3 vPos;
      void main() {
        vUv = uv;
        vA = aAlpha;
        vPos = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uTex;
      uniform float uHasTex;
      uniform vec3 uColor;
      ${SHADER_COMMON}
      in vec2 vUv;
      in float vA;
      in vec3 vPos;
      out vec4 fragColor;
      void main() {
        vec4 t = uHasTex > 0.5 ? texture(uTex, vUv) : vec4(uColor, 1.0);
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        vec3 c = applyLight(t.rgb, lm, 0.3);
        fragColor = vec4(c, t.a * vA);
      }`,
  });
}

/** Short-lived additive line quads for bullet tracers. */
class TracerPool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private seg: Float32Array; // x0 y0 x1 y1 life maxLife width bright
  private n = 0;

  constructor(private max: number) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    this.seg = new Float32Array(max * 8);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        in vec4 aCol;
        out vec4 vCol;
        void main() {
          vCol = aCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec4 vCol;
        out vec4 fragColor;
        void main() { fragColor = vec4(vCol.rgb * vCol.a, vCol.a); }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  add(x0: number, y0: number, x1: number, y1: number, bright: number): void {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.n++;
    const o = i * 8;
    this.seg[o] = x0;
    this.seg[o + 1] = y0;
    this.seg[o + 2] = x1;
    this.seg[o + 3] = y1;
    this.seg[o + 4] = 0.075;
    this.seg[o + 5] = 0.075;
    this.seg[o + 6] = 0.06 + bright * 0.03;
    this.seg[o + 7] = bright;
  }

  update(dt: number): void {
    const S = this.seg;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      S[i * 8 + 4] -= dt;
      if (S[i * 8 + 4] <= 0) {
        n--;
        S.copyWithin(i * 8, n * 8, n * 8 + 8);
        i--;
      }
    }
    this.n = n;
    const P = this.pos;
    const C = this.col;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      const x0 = S[o];
      const y0 = S[o + 1];
      const x1 = S[o + 2];
      const y1 = S[o + 3];
      const t = S[o + 4] / S[o + 5];
      const w = S[o + 6];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const L = Math.hypot(dx, dy) || 1;
      // the visible streak travels towards the hit point while fading
      const head = 1 - t * 0.6;
      const tail = Math.max(0, head - Math.min(1, 9 / L));
      const ax = x0 + dx * tail;
      const ay = y0 + dy * tail;
      const bx = x0 + dx * head;
      const by = y0 + dy * head;
      const nx = (-dy / L) * w;
      const ny = (dx / L) * w;
      const p = i * 12;
      P[p] = ax - nx;
      P[p + 1] = ay - ny;
      P[p + 2] = 1.0;
      P[p + 3] = bx - nx;
      P[p + 4] = by - ny;
      P[p + 5] = 0.95;
      P[p + 6] = bx + nx;
      P[p + 7] = by + ny;
      P[p + 8] = 0.95;
      P[p + 9] = ax + nx;
      P[p + 10] = ay + ny;
      P[p + 11] = 1.0;
      const a = Math.min(1, t * 1.6) * (0.55 + 0.45 * S[o + 7]);
      const c = i * 16;
      for (let k = 0; k < 4; k++) {
        C[c + k * 4] = 1.0;
        C[c + k * 4 + 1] = 0.86;
        C[c + k * 4 + 2] = 0.5;
        C[c + k * 4 + 3] = k === 0 || k === 3 ? a * 0.25 : a;
      }
    }
    this.geo.setDrawRange(0, n * 6);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aCol') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Effects {
  readonly root = new THREE.Group();
  private soft: ParticlePool;
  private glow: ParticlePool;
  private skids: GroundQuads;
  private decals: GroundQuads;
  private tracers: TracerPool;
  private lastWheel = new Map<string, { x: number; y: number; t: number }>();
  time = 0;
  /** quality: 0 low .. 1 high (scales emission) */
  quality = 1;

  constructor() {
    this.soft = new ParticlePool(700, puffTexture(), false, true);
    this.glow = new ParticlePool(500, dotTexture(), true, false);
    this.skids = new GroundQuads(2400, groundQuadMaterial(null, new THREE.Color(0.06, 0.06, 0.07)), 0.035);
    this.decals = new GroundQuads(160, groundQuadMaterial(decalTexture(), new THREE.Color(1, 1, 1)), 0.03);
    this.tracers = new TracerPool(96);
    this.root.add(this.skids.mesh, this.decals.mesh, this.soft.mesh, this.glow.mesh, this.tracers.mesh);
  }

  update(dt: number): void {
    this.time += dt;
    this.soft.update(dt);
    this.glow.update(dt);
    this.tracers.update(dt);
  }

  private q(n: number): number {
    return Math.max(1, Math.round(n * this.quality));
  }

  // --- emitters --------------------------------------------------------------------------
  tireSmoke(x: number, y: number, amount: number, color = 0xd8d8d8): void {
    if (Math.random() > amount * this.quality) return;
    this.soft.emit(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), 0.6, rng.range(-0.8, 0.8), rng.range(-0.8, 0.8), 0.4, 1.1, 2.4, rng.range(0.9, 1.6), color, 0.42 * Math.min(1, amount + 0.3), 1.2);
  }

  dust(x: number, y: number, amount: number): void {
    if (Math.random() > amount * this.quality) return;
    this.soft.emit(x, y, 0.4, rng.range(-1, 1), rng.range(-1, 1), 0.3, 0.9, 2.0, rng.range(0.6, 1.1), 0x9a8a68, 0.35, 1.5);
  }

  engineSmoke(x: number, y: number, dark: number): void {
    const c = dark > 0.5 ? 0x2a2a2a : 0x9a9a9a;
    this.soft.emit(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), 1.4, rng.range(-0.5, 0.5), rng.range(-0.5, 0.5), 2.2, 0.8, 1.8, rng.range(1.2, 2.0), c, 0.5, 0.6);
  }

  fire(x: number, y: number, intensity = 1): void {
    for (let i = 0; i < this.q(2 * intensity); i++) {
      this.glow.emit(x + rng.range(-0.6, 0.6), y + rng.range(-0.6, 0.6), 1.2, rng.range(-0.4, 0.4), rng.range(-0.4, 0.4), 3, rng.range(1.0, 1.8), -0.6, rng.range(0.25, 0.5), rng.pick([0xff8a20, 0xffb030, 0xff5010]), 0.85, 0.5);
    }
    if (Math.random() < 0.5) this.soft.emit(x, y, 2.5, rng.range(-0.6, 0.6), rng.range(-0.6, 0.6), 3, 1.4, 2.6, rng.range(1.4, 2.4), 0x1e1e1e, 0.55, 0.4);
  }

  sparks(x: number, y: number, nx: number, ny: number, n: number): void {
    for (let i = 0; i < this.q(n); i++) {
      const a = Math.atan2(ny, nx) + rng.range(-1.2, 1.2);
      const sp = rng.range(4, 12);
      this.glow.emit(x, y, 0.6, Math.cos(a) * sp, Math.sin(a) * sp, 0, rng.range(0.15, 0.3), -0.2, rng.range(0.15, 0.4), rng.pick([0xffe080, 0xffffff, 0xffb040]), 1, 3);
    }
  }

  glass(x: number, y: number): void {
    for (let i = 0; i < this.q(10); i++) {
      this.glow.emit(x, y, 0.8, rng.range(-4, 4), rng.range(-4, 4), 0, 0.12, 0, rng.range(0.3, 0.6), 0xbfe0ff, 0.8, 4);
    }
    const s = 1.2;
    this.decals.add(x - s, y - s, x + s, y - s, x + s, y + s, x - s, y + s, [0.5, 0.5, 1, 1], 0.9);
  }

  blood(x: number, y: number, size = 1.3): void {
    for (let i = 0; i < this.q(8); i++) {
      this.soft.emit(x, y, 0.6, rng.range(-3, 3), rng.range(-3, 3), 0, 0.25, 0.2, rng.range(0.3, 0.6), 0x8a0a0a, 0.9, 5);
    }
    const a = rng.range(0, Math.PI * 2);
    const c = Math.cos(a) * size;
    const s = Math.sin(a) * size;
    this.decals.add(x - c + s, y - s - c, x + c + s, y + s - c, x + c - s, y + s + c, x - c - s, y - s + c, [0, 0, 0.5, 0.5], 0.85);
  }

  splash(x: number, y: number): void {
    for (let i = 0; i < this.q(24); i++) {
      this.soft.emit(x + rng.range(-1, 1), y + rng.range(-1, 1), 0.5, rng.range(-3, 3), rng.range(-3, 3), rng.range(1, 4), 0.6, 1.5, rng.range(0.5, 1.0), 0xdfefff, 0.7, 2);
    }
  }

  explosion(x: number, y: number): void {
    // flash
    this.glow.emit(x, y, 2, 0, 0, 0, 10, 30, 0.25, 0xfff2c0, 1, 0);
    for (let i = 0; i < this.q(34); i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(3, 11);
      this.glow.emit(x, y, 1.5, Math.cos(a) * sp, Math.sin(a) * sp, rng.range(1, 5), rng.range(1.8, 3.4), rng.range(1, 3), rng.range(0.4, 0.9), rng.pick([0xff9a20, 0xffc040, 0xff6010, 0xffe0a0]), 0.95, 2.5);
    }
    for (let i = 0; i < this.q(24); i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(1, 5);
      this.soft.emit(x, y, 2, Math.cos(a) * sp, Math.sin(a) * sp, rng.range(2, 5), rng.range(2, 3.5), 3, rng.range(1.8, 3.2), rng.pick([0x1a1a1a, 0x2e2a26, 0x3a3632]), 0.7, 0.8);
    }
    this.sparks(x, y, 0, 0, 30);
    const s = 4.5;
    this.decals.add(x - s, y - s, x + s, y - s, x + s, y + s, x - s, y + s, [0.5, 0, 1, 0.5], 0.95);
  }

  muzzle(x: number, y: number, a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.glow.emit(x + c * 0.25, y + s * 0.25, 1.0, 0, 0, 0, 0.9, 2, 0.05, 0xfff0a0, 1, 0);
    this.glow.emit(x + c * 0.55, y + s * 0.55, 1.0, 0, 0, 0, 0.55, 1.5, 0.04, 0xffc860, 0.9, 0);
    // a faint gun-smoke puff
    this.soft.emit(x + c * 0.4, y + s * 0.4, 1.0, c * 0.8, s * 0.8, 0.3, 0.35, 0.9, 0.5, 0xb8b8b8, 0.22, 2);
  }

  tracer(x0: number, y0: number, x1: number, y1: number, bright = 1): void {
    this.tracers.add(x0, y0, x1, y1, bright);
  }

  /** One-frame sprite for a thrown object (molotov / grenade). */
  projectile(x: number, y: number, z: number, kind: 'molotov' | 'grenade'): void {
    const s = 0.32 + z * 0.05;
    if (kind === 'molotov') {
      this.soft.emit(x, y, z + 0.1, 0, 0, 0, s, 0, 0.02, 0x2e5a2a, 1, 0);
      this.glow.emit(x, y, z + 0.2, 0, 0, 0, 0.35, 0, 0.02, 0xffa030, 0.9, 0);
      if (Math.random() < 0.5) this.soft.emit(x, y, z, 0, 0, 0.5, 0.2, 0.6, 0.35, 0x444444, 0.25, 1);
    } else {
      this.soft.emit(x, y, z + 0.1, 0, 0, 0, s * 0.85, 0, 0.02, 0x3a4a2a, 1, 0);
    }
  }

  /** Flash of flames when a molotov bursts. */
  fireBurst(x: number, y: number): void {
    this.glow.emit(x, y, 1.5, 0, 0, 0, 5, 12, 0.18, 0xffb040, 0.9, 0);
    for (let i = 0; i < this.q(18); i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = rng.range(2, 6);
      this.glow.emit(x, y, 0.8, Math.cos(a) * sp, Math.sin(a) * sp, rng.range(1, 3), rng.range(0.8, 1.6), 1.5, rng.range(0.3, 0.6), rng.pick([0xff9a20, 0xffc040, 0xff6010]), 0.9, 4);
    }
  }

  /** Dark burn mark on the ground. */
  scorch(x: number, y: number, size: number): void {
    const a = rng.range(0, Math.PI * 2);
    const c = Math.cos(a) * size;
    const s = Math.sin(a) * size;
    this.decals.add(x - c + s, y - s - c, x + c + s, y + s - c, x + c - s, y + s + c, x - c - s, y - s + c, [0.5, 0, 1, 0.5], 0.8);
  }

  /** draw a skid-mark segment for a wheel; key identifies vehicle+wheel */
  skid(key: string, x: number, y: number, width: number, intensity: number): void {
    const last = this.lastWheel.get(key);
    if (!last || this.time - last.t > 0.12) {
      this.lastWheel.set(key, { x, y, t: this.time });
      return;
    }
    const dx = x - last.x;
    const dy = y - last.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.35) return;
    if (len > 4) {
      this.lastWheel.set(key, { x, y, t: this.time });
      return;
    }
    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;
    this.skids.add(last.x - nx, last.y - ny, x - nx, y - ny, x + nx, y + ny, last.x + nx, last.y + ny, [0, 0, 1, 1], Math.min(0.55, 0.18 + intensity * 0.45));
    last.x = x;
    last.y = y;
    last.t = this.time;
  }
}
