// Headless vehicle handling tests. Prints metrics per vehicle.
import { Physics } from '../src/physics/physics';
import { Vehicle, TUNE } from '../src/game/vehicle';
import { VEHICLES } from '../src/game/vehicleDefs';

const DT = 1 / 60;

function mk(id: string): { p: Physics; v: Vehicle } {
  const p = new Physics(null);
  const v = new Vehicle(VEHICLES[id], p, 0, 0, 0, 0xffffff);
  v.driver = {};
  v.assisted = true;
  return { p, v };
}
function run(p: Physics, v: Vehicle, secs: number, ctl: (t: number) => void, each?: (t: number) => boolean | void): number {
  let t = 0;
  for (let i = 0; i < secs / DT; i++) {
    ctl(t);
    v.step(DT);
    p.step(DT);
    t += DT;
    if (each && each(t)) break;
  }
  return t;
}
const kmh = (ms: number) => (ms * 3.6).toFixed(0);

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['golfo', 'b5', 'elfer', 'quadro', 'rennpappe', 'sprinto', 'polizei', 'bus'];
console.log(`TUNE ${JSON.stringify(TUNE)}`);
for (const id of ids) {
  const out: string[] = [];
  // 1) acceleration & top speed
  {
    const { p, v } = mk(id);
    let t100 = -1;
    run(p, v, 40, () => { v.throttle = 1; v.steerIn = 0; }, (t) => { if (t100 < 0 && v.speed >= 27.78) t100 = t; });
    out.push(`0-100 ${t100 < 0 ? 'n/a' : t100.toFixed(1) + 's'} top ${kmh(v.speed)}km/h gear ${v.gear} rpm ${v.rpm.toFixed(2)}`);
  }
  // 2) braking from 100
  {
    const { p, v } = mk(id);
    v.body.setLinearVelocity({ x: 27.78, y: 0 });
    let dist = 0;
    const t = run(p, v, 10, () => { v.throttle = 0; v.brake = 1; }, () => { dist = v.x; return v.speed < 0.3; });
    out.push(`brake100 ${dist.toFixed(1)}m ${t.toFixed(1)}s`);
  }
  // 3) steady turn at 15 m/s with full lock (throttle to hold speed)
  {
    const { p, v } = mk(id);
    v.body.setLinearVelocity({ x: 15, y: 0 });
    let maxLat = 0, spun = false;
    run(p, v, 6, () => { v.steerIn = 1; v.throttle = v.speed < 15 ? 0.6 : 0.2; }, () => {
      const w = v.body.getAngularVelocity();
      const lat = Math.abs(w * v.speed);
      if (lat > maxLat) maxLat = lat;
      const vel = v.body.getLinearVelocity();
      const heading = v.angle; const velAng = Math.atan2(vel.y, vel.x);
      let d = Math.abs(((heading - velAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (d > 1.2 && v.speed > 3) spun = true;
    });
    const w = v.body.getAngularVelocity();
    out.push(`turn15 lat ${(Math.abs(w) * v.speed / 9.81).toFixed(2)}g radius ${(v.speed / Math.max(0.01, Math.abs(w))).toFixed(1)}m spd ${kmh(v.speed)} ${spun ? 'SPUN' : 'ok'}`);
  }
  // 4) low speed turning circle
  {
    const { p, v } = mk(id);
    run(p, v, 8, (t) => { v.steerIn = t > 0.5 ? 1 : 0; v.throttle = v.speed < 5 ? 0.5 : 0; });
    const w = v.body.getAngularVelocity();
    out.push(`circle5 r ${(v.speed / Math.max(0.01, Math.abs(w))).toFixed(1)}m`);
  }
  // 5) handbrake turn from 20 m/s
  {
    const { p, v } = mk(id);
    v.body.setLinearVelocity({ x: 20, y: 0 });
    const a0 = v.angle;
    run(p, v, 0.7, () => { v.steerIn = 1; v.handbrake = true; v.throttle = 0; });
    const mid = v.angle - a0;
    run(p, v, 2.0, () => { v.steerIn = 0; v.handbrake = false; v.throttle = 0.6; });
    const vel = v.body.getLinearVelocity();
    const slip = Math.abs(((v.angle - Math.atan2(vel.y, vel.x) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    out.push(`hbturn rot ${(mid * 57.3).toFixed(0)}° after2s rot ${((v.angle - a0) * 57.3).toFixed(0)}° slip ${(slip * 57.3).toFixed(0)}° spd ${kmh(v.speed)}`);
  }
  // 6) high speed lane change stability
  {
    const { p, v } = mk(id);
    v.body.setLinearVelocity({ x: Math.min(45, VEHICLES[id].topSpeed * 0.9), y: 0 });
    let maxYaw = 0;
    run(p, v, 4, (t) => { v.throttle = 0.7; v.steerIn = t < 0.4 ? 0.5 : t < 0.8 ? -0.5 : 0; }, () => { maxYaw = Math.max(maxYaw, Math.abs(v.body.getAngularVelocity())); });
    const w = v.body.getAngularVelocity();
    out.push(`lanechg maxYaw ${maxYaw.toFixed(2)} endYaw ${w.toFixed(3)} y ${v.y.toFixed(1)}`);
  }
  // 7) reverse
  {
    const { p, v } = mk(id);
    run(p, v, 5, () => { v.brake = 1; });
    out.push(`reverse ${kmh(-v.forwardSpeed)}km/h`);
  }
  console.log(`${id.padEnd(10)} ${out.join(' | ')}`);
}
