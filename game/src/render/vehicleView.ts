// Scene representation of a Vehicle (mesh + per-vehicle uniforms).
import * as THREE from 'three';
import type { Vehicle } from '../game/vehicle';
import { vehicleGeometry, vehicleMaterial } from './vehicleModel';

export class VehicleView {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private sirenT = Math.random() * 10;

  constructor(
    readonly v: Vehicle,
    private scene: THREE.Scene,
  ) {
    this.mat = vehicleMaterial(v.def, v.paint);
    this.mesh = new THREE.Mesh(vehicleGeometry(v.def), this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  update(x: number, y: number, angle: number, dt: number, night: number): void {
    const v = this.v;
    const z = v.sinking > 0 ? -Math.min(2.2, v.sinking * 0.9) : 0;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, 0, angle);
    this.mesh.updateMatrix();
    const u = this.mat.uniforms;
    u.uSteer.value = v.steer;
    u.uDamage.value = 1 - v.health / v.maxHealth;
    u.uBurnt.value = v.exploded ? 1 : 0;
    const lights = u.uLights.value as THREE.Vector4;
    const occupied = !!v.driver;
    lights.x = occupied && !v.exploded ? Math.max(night > 0.3 ? 1 : 0.15, v.lightsOn ? 1 : 0) : 0;
    lights.y = occupied && v.braking ? 1 : 0;
    lights.z = occupied && v.reversing ? 1 : 0;
    lights.w = v.sirenOn && !v.exploded ? 1 : 0;
    this.sirenT += dt;
    u.uSirenT.value = this.sirenT;
  }

  setHighlight(on: number): void {
    this.mat.uniforms.uHighlight.value = on;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mat.dispose();
  }
}
