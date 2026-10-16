import { Physics } from '../src/physics/physics';
import { Vehicle } from '../src/game/vehicle';
import { VEHICLES } from '../src/game/vehicleDefs';
const id = process.argv[2] ?? 'golfo';
const p = new Physics(null);
const v = new Vehicle(VEHICLES[id], p, 0, 0, 0, 0xffffff);
v.driver = {}; v.assisted = process.argv[3] !== 'noassist';
v.body.setLinearVelocity({ x: 40, y: 0 });
const DT = 1 / 60;
for (let i = 0; i < 150; i++) {
  const t = i * DT;
  v.throttle = 0.7; v.steerIn = t < 0.4 ? 0.5 : t < 0.8 ? -0.5 : 0;
  v.step(DT); p.step(DT);
  if (i % 6 === 0) {
    const vel = v.body.getLinearVelocity();
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const vx = vel.x * c + vel.y * s, vy = -vel.x * s + vel.y * c;
    console.log(`t=${t.toFixed(2)} steer=${v.steer.toFixed(3)} yaw=${v.body.getAngularVelocity().toFixed(3)} vx=${vx.toFixed(1)} vy=${vy.toFixed(2)} ang=${(v.angle*57.3).toFixed(1)}`);
  }
}
