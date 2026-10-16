// WebGL renderer wrapper with a north-up perspective camera looking straight down (GTA2 style).
import * as THREE from 'three';
import { GU } from './globals';

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** camera state */
  camX = 0;
  camY = 0;
  camH = 60;
  /** small forward tilt (radians) for extra depth; 0 = straight down */
  tilt = 0.0;
  shakeX = 0;
  shakeY = 0;
  pixelRatio = 1;
  readonly fov = 40;
  private rain: THREE.Mesh;
  private rainMat: THREE.ShaderMaterial;

  constructor(private container: HTMLElement, opts: { antialias: boolean; maxPixelRatio: number }) {
    this.three = new THREE.WebGLRenderer({
      antialias: opts.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.setClearColor(0x0d0f14, 1);
    this.three.sortObjects = true;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio);
    this.three.setPixelRatio(this.pixelRatio);
    container.appendChild(this.three.domElement);
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 2, 400);
    this.camera.up.set(0, 1, 0);
    this.scene.matrixWorldAutoUpdate = true;
    // full-screen procedural rain streaks (drawn last, in clip space)
    this.rainMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uTime: GU.uTime, uRain: GU.uRain, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uRain;
        uniform vec2 uRes;
        out vec4 fragColor;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 uv = gl_FragCoord.xy / uRes.y;
          float a = 0.0;
          for (int L = 0; L < 3; L++) {
            float fl = float(L);
            float s = 16.0 + fl * 13.0;
            vec2 p = uv * vec2(s, s * 0.14);
            p.y += uTime * (2.4 + fl * 0.9);
            p.x += p.y * 0.18;
            vec2 id = floor(p);
            vec2 f = fract(p);
            float h = hash(id + fl * 17.0);
            float x0 = 0.2 + 0.6 * hash(id * 1.7 + 3.0);
            float streak = step(0.8, h) * smoothstep(0.07, 0.0, abs(f.x - x0)) * smoothstep(0.0, 0.25, f.y) * smoothstep(1.0, 0.55, f.y);
            a += streak * (0.55 - fl * 0.13);
          }
          fragColor = vec4(0.78, 0.85, 0.96, clamp(a, 0.0, 1.0) * 0.33 * uRain);
        }`,
    });
    this.rain = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 100;
    this.rain.visible = false;
    this.scene.add(this.rain);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setRain(v: number): void {
    this.rain.visible = v > 0.01;
  }

  setMaxPixelRatio(r: number): void {
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, r);
    this.three.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.rainMat.uniforms.uRes.value as THREE.Vector2).set(w * this.pixelRatio, h * this.pixelRatio);
  }

  get aspect(): number {
    return this.camera.aspect;
  }

  /** Half extents of the visible ground area at the current camera height. */
  halfExtents(h = this.camH): { hw: number; hh: number } {
    const hh = h * Math.tan(((this.fov / 2) * Math.PI) / 180);
    return { hw: hh * this.camera.aspect, hh };
  }

  updateCamera(): void {
    const x = this.camX + this.shakeX;
    const y = this.camY + this.shakeY;
    const off = this.camH * Math.tan(this.tilt);
    this.camera.position.set(x, y - off, this.camH);
    this.camera.lookAt(x, y, 0);
    this.camera.far = this.camH + 60;
    this.camera.near = Math.max(1, this.camH - 50);
    this.camera.updateProjectionMatrix();
  }

  viewRect(margin = 0): ViewRect {
    const { hw, hh } = this.halfExtents();
    return { x0: this.camX - hw - margin, y0: this.camY - hh - margin, x1: this.camX + hw + margin, y1: this.camY + hh + margin };
  }

  /** Project world point to screen pixels (CSS). */
  project(x: number, y: number, z: number, out: { x: number; y: number }): void {
    const v = _v.set(x, y, z).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    out.x = (v.x * 0.5 + 0.5) * w;
    out.y = (-v.y * 0.5 + 0.5) * h;
  }

  render(): void {
    this.three.render(this.scene, this.camera);
  }
}

const _v = new THREE.Vector3();
