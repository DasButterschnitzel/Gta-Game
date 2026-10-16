// Soft blob shadows for vehicles (rounded rectangles) and characters (circles). Instanced.
import * as THREE from 'three';
import { makeCanvas } from './texgen';
import { GU, SHADOW_DIR } from './globals';

function softTexture(rect: boolean): THREE.Texture {
  const S = 64;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  if (rect) {
    // blurred rounded rectangle via layered strokes
    for (let i = 0; i < 12; i++) {
      const inset = 4 + i * 1.6;
      ctx.fillStyle = `rgba(0,0,0,${0.09})`;
      const r = 10;
      const x = inset;
      const y = inset;
      const w = S - inset * 2;
      const h = S - inset * 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();
    }
  } else {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class BlobShadows {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private mat: THREE.MeshBasicMaterial;

  constructor(rect: boolean, max: number) {
    this.mat = new THREE.MeshBasicMaterial({ map: softTexture(rect), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
    this.mat.opacity = 0.32 + 0.3 * GU.uDay.value;
  }

  /** add a shadow; height (m) offsets it in the sun direction */
  add(x: number, y: number, rot: number, len: number, wid: number, height: number): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    const k = 0.35 * GU.uDay.value;
    this.p.set(x + SHADOW_DIR.x * height * k, y + SHADOW_DIR.y * height * k, 0.04);
    this.q.setFromAxisAngle(this.zAxis, rot);
    this.s.set(len, wid, 1);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.count++, this.m);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
