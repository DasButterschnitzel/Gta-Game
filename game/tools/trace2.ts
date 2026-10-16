import { Physics } from '../src/physics/physics';
import { Vehicle } from '../src/game/vehicle';
import { VEHICLES } from '../src/game/vehicleDefs';
const id = process.argv[2] ?? 'golfo';
const mode = process.argv[3] ?? 'hb';
const p = new Physics(null);
const v = new Vehicle(VEHICLES[id], p, 0, 0, 0, 0xffffff);
v.driver = {}; v.assisted = true;
v.body.setLinearVelocity({ x: mode === 'hb' ? 20 : 15, y: 0 });
const DT = 1 / 60;
for (let i = 0; i < 360; i++) {
  const t = i * DT;
  if (mode === 'hb') { v.steerIn = t < 0.7 ? 1 : 0; v.handbrake = t < 0.7; v.throttle = t < 0.7 ? 0 : 0.6; }
  else { v.steerIn = 1; v.throttle = v.speed < 15 ? 0.6 : 0.2; }
  v.step(DT); p.step(DT);
  if (i % 6 === 0) {
    const vel = v.body.getLinearVelocity();
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const vx = vel.x * c + vel.y * s, vy = -vel.x * s + vel.y * c;
    console.log(`t=${t.toFixed(2)} steer=${v.steer.toFixed(3)} yaw=${v.body.getAngularVelocity().toFixed(2)} vx=${vx.toFixed(1)} vy=${vy.toFixed(2)} beta=${(Math.atan2(vy, Math.abs(vx))*57.3).toFixed(0)} ang=${(v.angle*57.3).toFixed(0)}`);
  }
}
