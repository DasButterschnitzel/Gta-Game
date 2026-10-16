// Visible barriers where the story keeps a zone closed: raised bascule bridges over the
// Hafenkanal and construction barriers on the Lauter bridges ("Brückensanierung").
// They disappear when the zone opens.
import * as THREE from 'three';
import { GeoBuilder, addBox, addCyl } from './geom';
import { propMaterial } from './materials';
import type { City } from '../world/city';
import { Zone } from '../world/types';

interface ZoneMeshes {
  body: THREE.Mesh;
  lamps: THREE.Mesh;
}

export class BarrierView {
  readonly root = new THREE.Group();
  private zones = new Map<number, ZoneMeshes>();
  private t = 0;

  constructor(city: City) {
    const mat = propMaterial();
    const parts = new Map<number, { gb: GeoBuilder; lb: GeoBuilder }>();
    for (const zb of city.zoneBarriers) {
      let p = parts.get(zb.zone);
      if (!p) {
        p = { gb: new GeoBuilder({ aEmit: 4 }), lb: new GeoBuilder({ aEmit: 4 }) };
        parts.set(zb.zone, p);
      }
      const w = zb.x1 - zb.x0;
      const cx = (zb.x0 + zb.x1) / 2;
      const y = (zb.y0 + zb.y1) / 2;
      // posts
      const nPosts = Math.max(2, Math.round(w / 2.2) + 1);
      for (let i = 0; i < nPosts; i++) addBox(p.gb, zb.x0 + 0.25 + (i / (nPosts - 1)) * (w - 0.5), y, 0, 0.14, 0.14, 1.1, 0, 0x2a2c30);
      // two red/white striped boards
      const n = Math.max(2, Math.round(w / 0.9));
      for (let i = 0; i < n; i++) {
        const sx = zb.x0 + (i + 0.5) * (w / n);
        addBox(p.gb, sx, y, 0.78, w / n, 0.12, 0.28, 0, i % 2 ? 0xf2f2f2 : 0xd8261e);
        addBox(p.gb, sx, y, 0.3, w / n, 0.12, 0.2, 0, i % 2 ? 0xd8261e : 0xf2f2f2);
      }
      // blinking warning lamps
      for (let x = zb.x0 + 0.9; x < zb.x1 - 0.4; x += 2.6) addBox(p.lb, x, y, 1.06, 0.24, 0.2, 0.24, 0, 0xffb81a, [3, 0, 0, 0]);
      if (zb.zone === Zone.Hafen) {
        // the raised bascule leaf just beyond the barrier (towards the harbour)
        addBox(p.gb, cx, zb.y0 - 1.6, 0, w + 0.6, 0.8, 12, 0, 0x4e545c, [0, 0, 0, 0], 0xb8402a);
        // its counterweight housings on both banks of the gap
        addBox(p.gb, zb.x0 - 0.9, zb.y0 - 1.6, 0, 1.2, 2.2, 3.2, 0, 0x6a6e74);
        addBox(p.gb, zb.x1 + 0.9, zb.y0 - 1.6, 0, 1.2, 2.2, 3.2, 0, 0x6a6e74);
        // red stop lights on the leaf edge
        addBox(p.lb, zb.x0 + 0.6, zb.y0 - 1.1, 11.4, 0.4, 0.3, 0.4, 0, 0xff2a1a, [3, 0, 0, 0]);
        addBox(p.lb, zb.x1 - 0.6, zb.y0 - 1.1, 11.4, 0.4, 0.3, 0.4, 0, 0xff2a1a, [3, 0, 0, 0]);
      } else {
        // closed for renovation: traffic cones in front and a construction sign
        for (let x = zb.x0 + 0.7; x < zb.x1 - 0.3; x += 1.5) {
          addCyl(p.gb, x, y - 2.4, 0, 0.22, 0.55, 0xff6a1a, 0xf2f2f2, 6);
        }
        addBox(p.gb, cx, y - 0.9, 1.15, Math.min(3.2, w * 0.4), 0.1, 1.2, 0, 0xf2c41a, [3, 0, 0, 0]);
        addBox(p.gb, cx, y - 0.9, 0, 0.12, 0.12, 1.2, 0, 0x2a2c30);
      }
    }
    for (const [zone, p] of parts) {
      const body = new THREE.Mesh(p.gb.build({ colors: true }), mat);
      const lamps = new THREE.Mesh(p.lb.build({ colors: true }), mat);
      body.frustumCulled = false;
      lamps.frustumCulled = false;
      this.root.add(body, lamps);
      this.zones.set(zone, { body, lamps });
    }
  }

  update(dt: number, locked: (zone: number) => boolean): void {
    this.t += dt;
    for (const [zone, m] of this.zones) {
      const on = locked(zone);
      m.body.visible = on;
      m.lamps.visible = on && this.t % 1 < 0.55;
    }
  }
}
