// Regression checks for the v0.2 field reports: exiting cars at an angle, traffic at closed bridges.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
// 1) exit at many angles, on a road, next to another car
const exits = await page.evaluate(() => {
  const g = window.__game;
  const lanes = g.city.lanes.filter((e) => e.road >= 0 && e.len > 60);
  const e = lanes[50];
  const p = { x: 0, y: 0, h: 0 };
  g.city.lanePoint(e, 30, p);
  const res = [];
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - p.x, v.y - p.y) < 12) g.removeVehicle(v);
    if (g.player.vehicle) { g.player.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); g.player.exit(g.player.vehicle, true); g.simulate(0.5, {}); }
    const car = g.spawnVehicle('golfo', p.x, p.y, ang);
    const other = g.spawnVehicle('passant', p.x + Math.cos(ang + Math.PI / 2) * 2.4, p.y + Math.sin(ang + Math.PI / 2) * 2.4, ang);
    g.seatPlayer(car);
    g.simulate(0.3, {});
    g.simulate(0.05, { enterPressed: true });
    g.simulate(0.4, {});
    res.push(g.player.inVehicle ? 'STUCK' : 'out');
    g.removeVehicle(other);
  }
  return res;
});
console.log('exit at 12 angles (blocked on one side):', exits.join(' '));
// 2) traffic near a closed canal bridge
const bridge = await page.evaluate(() => {
  const g = window.__game;
  if (g.player.vehicle) g.player.exit(g.player.vehicle, true);
  const zb = g.city.zoneBarriers.find((z) => z.zone === 1);
  const blocked = g.city.lanes.filter((e) => e.barrier !== undefined).length;
  g.teleport((zb.x0 + zb.x1) / 2 + 20, zb.y1 + 40);
  for (let i = 0; i < 12; i++) g.simulate(5, {});
  const near = g.vehicles.filter((v) => Math.abs(v.x - (zb.x0 + zb.x1) / 2) < 30 && Math.abs(v.y - zb.y1) < 15);
  return { blockedLanes: blocked, vehicles: g.vehicles.length, burning: g.vehicles.filter((v) => v.burning > 0 || v.exploded).length, nearBarrier: near.length };
});
console.log('closed bridge:', JSON.stringify(bridge));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
