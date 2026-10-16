// Mission markers: pulsing ground rings with a soft vertical light beam (visible from the top-down
// camera as a glowing disc), plus a bouncing chevron above vehicles/people to pick up.
import * as THREE from 'three';
import { makeCanvas } from './texgen';

export type MarkerColor = 'yellow' | 'blue' | 'red' | 'green' | 'white' | 'purple';

export interface Marker {
  x: number;
  y: number;
  r: number;
  color: MarkerColor;
  /** 'ring' = area on the ground, 'arrow' = chevron above an entity */
  kind: 'ring' | 'arrow';
  /** height of the arrow (above vehicles ~2.4, people ~2.2) */
  z?: number;
}

const COLORS: Record<MarkerColor, [number, number, number]> = {
  yellow: [1, 0.85, 0.2],
  blue: [0.35, 0.65, 1],
  red: [1, 0.3, 0.25],
  green: [0.4, 1, 0.45],
  white: [1, 1, 1],
  purple: [0.85, 0.45, 1],
};

function ringTexture(): THREE.Texture {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.86, 'rgba(255,255,255,1)');
  g.addColorStop(0.93, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function arrowTexture(): THREE.Texture {
  const S = 64;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 58);
  ctx.lineTo(6, 22);
  ctx.lineTo(22, 22);
  ctx.lineTo(22, 4);
  ctx.lineTo(42, 4);
  ctx.lineTo(42, 22);
  ctx.lineTo(58, 22);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const MAX = 24;

export class MarkerRenderer {
  readonly root = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private arrows: THREE.Mesh[] = [];
  private ringMat: THREE.MeshBasicMaterial[] = [];
  private arrowMat: THREE.MeshBasicMaterial[] = [];

  constructor() {
    const rt = ringTexture();
    const at = arrowTexture();
    const plane = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX; i++) {
      const rm = new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const r = new THREE.Mesh(plane, rm);
      r.renderOrder = 6;
      r.visible = false;
      this.rings.push(r);
      this.ringMat.push(rm);
      const am = new THREE.MeshBasicMaterial({ map: at, transparent: true, depthWrite: false });
      const a = new THREE.Mesh(plane, am);
      a.renderOrder = 22;
      a.visible = false;
      this.arrows.push(a);
      this.arrowMat.push(am);
      this.root.add(r, a);
    }
  }

  update(list: Marker[], time: number): void {
    let ri = 0;
    let ai = 0;
    for (const m of list) {
      const [cr, cg, cb] = COLORS[m.color];
      if (m.kind === 'ring' && ri < MAX) {
        const mesh = this.rings[ri];
        const mat = this.ringMat[ri];
        const pulse = 1 + Math.sin(time * 3) * 0.06;
        mesh.visible = true;
        mesh.position.set(m.x, m.y, 0.2);
        mesh.scale.set(m.r * 2 * pulse, m.r * 2 * pulse, 1);
        mat.color.setRGB(cr, cg, cb);
        mat.opacity = 0.85;
        ri++;
      } else if (m.kind === 'arrow' && ai < MAX) {
        const mesh = this.arrows[ai];
        const mat = this.arrowMat[ai];
        mesh.visible = true;
        // the arrow points "down" on screen (south); bob up and down in world z (perspective scale)
        const bob = Math.sin(time * 4) * 0.35;
        mesh.position.set(m.x, m.y + 1.2 + bob * 0.6, (m.z ?? 2.4) + 1.5 + bob);
        mesh.scale.set(1.6, 1.6, 1);
        mat.color.setRGB(cr, cg, cb);
        ai++;
      }
    }
    for (let i = ri; i < MAX; i++) this.rings[i].visible = false;
    for (let i = ai; i < MAX; i++) this.arrows[i].visible = false;
  }
}
