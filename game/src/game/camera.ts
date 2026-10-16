// Follow camera: rises with speed (GTA2-style zoom) and leads in the direction of travel.
import { clamp, damp } from '../core/math';

export class CameraRig {
  x = 0;
  y = 0;
  h = 46;
  private leadX = 0;
  private leadY = 0;
  private shake = 0;
  shakeX = 0;
  shakeY = 0;
  /** extra zoom-out requested by gameplay (e.g. wanted level, cutscenes) */
  zoomBias = 0;
  footHeight = 34;
  carHeight = 54;

  snap(x: number, y: number, h?: number): void {
    this.x = x;
    this.y = y;
    if (h) this.h = h;
    this.leadX = this.leadY = 0;
  }

  addShake(s: number): void {
    this.shake = Math.min(1.6, this.shake + s);
  }

  update(dt: number, tx: number, ty: number, vx: number, vy: number, inVehicle: boolean, halfW: number, halfH: number): void {
    const speed = Math.hypot(vx, vy);
    const targetH = (inVehicle ? this.carHeight + Math.min(speed, 60) * 0.5 : this.footHeight) + this.zoomBias;
    this.h = damp(this.h, targetH, inVehicle ? 1.4 : 2.0, dt);
    const lookT = inVehicle ? 0.7 : 0.28;
    // north/south travel gets a bit more lead because the landscape view is shorter vertically
    const lx = clamp(vx * lookT, -halfW * 0.4, halfW * 0.4);
    const ly = clamp(vy * lookT * 1.15, -halfH * 0.5, halfH * 0.5);
    this.leadX = damp(this.leadX, lx, 2.2, dt);
    this.leadY = damp(this.leadY, ly, 2.2, dt);
    this.x = damp(this.x, tx + this.leadX, 9, dt);
    this.y = damp(this.y, ty + this.leadY, 9, dt);
    if (this.shake > 0.001) {
      const t = performance.now() * 0.05;
      this.shakeX = Math.sin(t * 1.7) * this.shake * 0.6;
      this.shakeY = Math.cos(t * 2.3) * this.shake * 0.6;
      this.shake = damp(this.shake, 0, 6, dt);
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }
}
