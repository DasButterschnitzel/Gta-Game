// "Richtung" touch steering: the stick angle becomes a world heading and the car turns to it.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
const res = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  // 1) input mapping: stick up = north (world +y) in a vehicle
  g.input.dirSteer = true;
  const t = g.input.touch;
  t.stickActive = true;
  t.stickX = 0;
  t.stickY = 1;
  const s1 = g.input.poll(1 / 60, true, 10);
  t.stickX = -1;
  t.stickY = 0;
  for (let i = 0; i < 30; i++) g.input.poll(1 / 60, true, 10);
  const s2 = g.input.poll(1 / 60, true, 10);
  const s3 = g.input.poll(1 / 60, false, 0);
  t.stickActive = false;
  out.mapping = { north: s1.steerHeading?.toFixed(2), west: s2.steerHeading?.toFixed(2), onFootHeading: s3.steerHeading, onFootMoveX: s3.moveX };
  // 2) the car follows: drive east on a long lane, then point north / west / south
  const lane = g.city.lanes.filter((e) => e.road >= 0 && e.len > 120)[10];
  const p = { x: 0, y: 0, h: 0 };
  g.city.lanePoint(lane, 20, p);
  for (const v of [...g.vehicles]) if (Math.hypot(v.x - p.x, v.y - p.y) < 40) g.removeVehicle(v);
  const car = g.spawnVehicle('golfo', p.x, p.y, p.h);
  g.seatPlayer(car);
  g.simulate(1.5, { throttle: 1 });
  const turns = [];
  for (const d of [Math.PI / 2, -Math.PI / 2, Math.PI / 4]) {
    // fresh start on the lane each time (the city is full of walls)
    for (const v of [...g.vehicles]) if (v !== car && Math.hypot(v.x - p.x, v.y - p.y) < 40) g.removeVehicle(v);
    car.body.setTransform({ x: p.x, y: p.y }, p.h);
    car.body.setAngularVelocity(0);
    car.body.setLinearVelocity({ x: Math.cos(p.h) * 12, y: Math.sin(p.h) * 12 });
    const want = p.h + d;
    g.simulate(1.6, { throttle: 0.5, steerHeading: want });
    const vel = car.body.getLinearVelocity();
    const travel = Math.atan2(vel.y, vel.x);
    const err = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    turns.push(`${Math.round((d * 180) / Math.PI)}°→err ${Math.round((err * 180) / Math.PI)}°`);
  }
  out.turns = turns.join(', ');
  // 3) reverse: stop, hold BREMSE, point behind the car → backs up straight
  car.body.setTransform({ x: p.x, y: p.y }, p.h);
  car.body.setLinearVelocity({ x: 0, y: 0 });
  car.body.setAngularVelocity(0);
  g.simulate(0.3, { brake: 1 });
  const back = car.angle + Math.PI;
  const a0 = car.angle;
  g.simulate(1.5, { brake: 1, steerHeading: back });
  out.reverse = { speed: car.forwardSpeed.toFixed(1), turned: Math.round(((car.angle - a0) * 180) / Math.PI) };
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
