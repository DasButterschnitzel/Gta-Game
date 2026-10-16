// Police helicopter (top-down sprite with spinning rotor), its searchlight, and spike strips.
import * as THREE from 'three';
import { makeCanvas } from './texgen';
import { GU } from './globals';
import type { Heli, SpikeStrip } from '../game/police';

function heliTexture(): THREE.Texture {
  const W = 128;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  // nose points up (towards +y in texture space = -v)
  const cx = W / 2;
  // skids
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(cx - 34, 70, 6, 92);
  ctx.fillRect(cx + 28, 70, 6, 92);
  ctx.fillRect(cx - 30, 92, 60, 4);
  ctx.fillRect(cx - 30, 140, 60, 4);
  // tail boom
  ctx.fillStyle = '#1f3c8c';
  ctx.fillRect(cx - 6, 140, 12, 96);
  // tail fin / stabiliser
  ctx.fillStyle = '#183070';
  ctx.fillRect(cx - 22, 222, 44, 8);
  ctx.fillStyle = '#d8f01a';
  ctx.fillRect(cx - 22, 222, 6, 8);
  ctx.fillRect(cx + 16, 222, 6, 8);
  // fuselage (teardrop)
  const grad = ctx.createLinearGradient(cx - 30, 0, cx + 30, 0);
  grad.addColorStop(0, '#16306e');
  grad.addColorStop(0.5, '#2a52b0');
  grad.addColorStop(1, '#16306e');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, 22);
  ctx.bezierCurveTo(cx + 34, 26, cx + 32, 110, cx + 18, 150);
  ctx.lineTo(cx - 18, 150);
  ctx.bezierCurveTo(cx - 32, 110, cx - 34, 26, cx, 22);
  ctx.fill();
  // cockpit glazing
  ctx.fillStyle = '#26323e';
  ctx.beginPath();
  ctx.moveTo(cx, 26);
  ctx.bezierCurveTo(cx + 24, 30, cx + 24, 60, cx + 20, 68);
  ctx.lineTo(cx - 20, 68);
  ctx.bezierCurveTo(cx - 24, 60, cx - 24, 30, cx, 26);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,200,230,0.35)';
  ctx.fillRect(cx - 10, 34, 8, 22);
  // neon stripe + lettering on the roof
  ctx.fillStyle = '#d8f01a';
  ctx.fillRect(cx - 24, 76, 48, 5);
  ctx.save();
  ctx.translate(cx, 112);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POLIZEI', 0, 0);
  ctx.restore();
  // engine housing / rotor hub
  ctx.fillStyle = '#9aa0a8';
  ctx.beginPath();
  ctx.arc(cx, 96, 9, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rotorTexture(): THREE.Texture {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  // motion-blurred disc
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(30,30,34,0.0)');
  g.addColorStop(0.7, 'rgba(30,30,34,0.16)');
  g.addColorStop(0.97, 'rgba(30,30,34,0.24)');
  g.addColorStop(1, 'rgba(30,30,34,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // four blades
  ctx.fillStyle = 'rgba(24,24,28,0.85)';
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate((k * Math.PI) / 2);
    ctx.fillRect(4, -3, S / 2 - 6, 6);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function spikeTexture(): THREE.Texture {
  const W = 256;
  const H = 32;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#26282c';
  ctx.fillRect(0, 10, W, 12);
  ctx.fillStyle = '#c8ccd2';
  for (let x = 2; x < W; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x + 3, 2);
    ctx.lineTo(x + 6, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 2, 22);
    ctx.lineTo(x + 5, 30);
    ctx.lineTo(x + 8, 22);
    ctx.fill();
  }
  ctx.fillStyle = '#e8c81a';
  for (let x = 0; x < W; x += 32) ctx.fillRect(x, 14, 12, 4);
  const t = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class PoliceView {
  readonly root = new THREE.Group();
  private heli: THREE.Group;
  private body: THREE.Mesh;
  private rotor: THREE.Mesh;
  private tailRotor: THREE.Mesh;
  private light: THREE.Mesh;
  private lightMat: THREE.MeshBasicMaterial;
  private spikeMat: THREE.MeshBasicMaterial;
  private spikeMeshes: THREE.Mesh[] = [];
  private spikeGeo = new THREE.PlaneGeometry(1, 1);

  constructor() {
    this.heli = new THREE.Group();
    const bodyMat = new THREE.MeshBasicMaterial({ map: heliTexture(), transparent: true, depthWrite: false });
    // texture is 128 x 256 px for an 6 x 12 m footprint; nose along +x after rotation
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(6, 12), bodyMat);
    this.body.rotation.z = -Math.PI / 2;
    this.body.renderOrder = 20;
    const rotorMat = new THREE.MeshBasicMaterial({ map: rotorTexture(), transparent: true, depthWrite: false });
    this.rotor = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), rotorMat);
    this.rotor.position.set(1.5, 0, 0.6);
    this.rotor.renderOrder = 21;
    this.tailRotor = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), rotorMat);
    this.tailRotor.position.set(-5.4, 0.9, 0.3);
    this.tailRotor.renderOrder = 21;
    this.heli.add(this.body, this.rotor, this.tailRotor);
    this.heli.visible = false;
    // searchlight pool on the ground
    const { canvas, ctx } = makeCanvas(64, 64);
    const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,230,0.9)');
    gr.addColorStop(0.6, 'rgba(255,250,230,0.45)');
    gr.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 64, 64);
    this.lightMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas as HTMLCanvasElement), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.light = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.lightMat);
    this.light.position.z = 0.25;
    this.light.renderOrder = 5;
    this.light.visible = false;
    this.spikeMat = new THREE.MeshBasicMaterial({ map: spikeTexture(), transparent: true, depthWrite: false });
    this.root.add(this.heli, this.light);
  }

  update(heli: Heli | null, spikes: SpikeStrip[], alpha: number): void {
    void alpha;
    if (heli) {
      this.heli.visible = true;
      this.heli.position.set(heli.x, heli.y, heli.z);
      this.heli.rotation.z = heli.angle;
      this.rotor.rotation.z = heli.rotor;
      this.tailRotor.rotation.z = heli.rotor * 1.7;
      const night = 1 - GU.uDay.value;
      if (night > 0.2 && !heli.leaving) {
        this.light.visible = true;
        this.light.position.x = heli.lx;
        this.light.position.y = heli.ly;
        this.lightMat.opacity = Math.min(0.85, night) * (0.85 + Math.sin(heli.rotor * 0.05) * 0.05);
      } else this.light.visible = false;
    } else {
      this.heli.visible = false;
      this.light.visible = false;
    }
    while (this.spikeMeshes.length < spikes.length) {
      const m = new THREE.Mesh(this.spikeGeo, this.spikeMat);
      m.renderOrder = 2;
      this.root.add(m);
      this.spikeMeshes.push(m);
    }
    for (let i = 0; i < this.spikeMeshes.length; i++) {
      const m = this.spikeMeshes[i];
      const s = spikes[i];
      if (!s) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.set(s.x, s.y, 0.06);
      m.rotation.z = s.a;
      m.scale.set(s.len, 0.9, 1);
    }
  }
}
