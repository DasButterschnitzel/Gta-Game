// Police smoke test: pursuit, takedown, bust, helicopter, roadblock + spikes, Lackiererei.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const outDir = process.argv[2] || 'test-output';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
await page.waitForTimeout(500);
const st = (label) => page.evaluate((label) => {
  const g = window.__game;
  const units = g.police.units.map((u) => `${u.kind}:${u.mode}:${Math.round(Math.hypot(u.v.x - g.player.x, u.v.y - g.player.y))}m`);
  return { label, busted: +g.bustedT.toFixed(1), lvl: g.wanted.level, heat: +g.wanted.heat.toFixed(2), seen: g.police.seen, units, officers: g.police.officers.length, heli: !!g.police.heli, spikes: g.police.spikes.length, takedowns: g.wanted.takedowns, inVeh: g.player.inVehicle, flat: g.player.vehicle?.flatTires ?? null, money: g.money };
}, label);
// place the player in a fresh car on a long straight lane, driving along it
const onLane = (kind, speed) => page.evaluate(([kind, speed]) => {
  const g = window.__game;
  g.police.clearAll();
  g.wanted.clear();
  const lanes = g.city.lanes.filter((e) => e.road >= 0 && e.len > 220 && e.speed >= 13);
  const e = lanes[Math.floor(lanes.length / 2)];
  const p = { x: 0, y: 0, h: 0 };
  g.city.lanePoint(e, 20, p);
  // clear the spot
  for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - p.x, v.y - p.y) < 12) g.removeVehicle(v);
  if (!g.player.vehicle) {
    const v = g.spawnVehicle(kind, p.x, p.y, p.h);
    g.teleport(p.x + Math.cos(p.h + Math.PI / 2) * 2.6, p.y + Math.sin(p.h + Math.PI / 2) * 2.6);
    g.simulate(0.05, { enterPressed: true });
    g.simulate(1.4, {});
  }
  const v = g.player.vehicle;
  if (!v) return { inVeh: false };
  v.body.setTransform({ x: p.x, y: p.y }, p.h);
  v.body.setAngularVelocity(0);
  v.body.setLinearVelocity({ x: Math.cos(p.h) * speed, y: Math.sin(p.h) * speed });
  v.health = v.maxHealth;
  v.flatTires = false;
  g.camera.snap(p.x, p.y);
  return { inVeh: true, lane: e.id, len: Math.round(e.len) };
}, [kind, speed]);

// 1) pursuit while driving with 2 stars
console.log('lane', JSON.stringify(await onLane('b5', 15)));
await page.evaluate(() => { const g = window.__game; g.wanted.atLeast(2, g.player.x, g.player.y); });
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__game.simulate(2.0, { throttle: 0.55 }));
  console.log(JSON.stringify(await st('pursuit' + i)));
}
await page.screenshot({ path: path.join(outDir, 'p1_pursuit.png') });
// 2) takedown by the player
const td = await page.evaluate(() => {
  const g = window.__game;
  g.wanted.atLeast(3, g.player.x, g.player.y);
  const u = g.police.spawnUnit('polizei', g.player.x + 9, g.player.y + 9, 0, 'pursue');
  const before = g.wanted.heat;
  u.v.damage(100, g.player.char);
  g.simulate(0.3, {});
  return { before: +before.toFixed(2), after: +g.wanted.heat.toFixed(2), mode: u.mode, takedowns: g.wanted.takedowns };
});
console.log('takedown', JSON.stringify(td));
// 3) roadblock + spike strip ahead at 4 stars, plus the helicopter
console.log('lane', JSON.stringify(await onLane('b5', 18)));
const rb = await page.evaluate(() => {
  const g = window.__game;
  g.wanted.atLeast(4, g.player.x, g.player.y);
  g.police.tryRoadblock(4);
  const blocks = g.police.units.filter((u) => u.mode === 'block').length;
  return { blocks, spikes: g.police.spikes.map((s) => ({ d: Math.round(Math.hypot(s.x - g.player.x, s.y - g.player.y)), len: Math.round(s.len) })) };
});
console.log('roadblock', JSON.stringify(rb));
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.__game.simulate(1.5, { throttle: 0.6 }));
  console.log(JSON.stringify(await st('toBlock' + i)));
}
await page.screenshot({ path: path.join(outDir, 'p2_roadblock.png') });
await page.evaluate(() => { const g = window.__game; g.setClock(23); g.simulate(0.1, {}); });
await page.screenshot({ path: path.join(outDir, 'p3_heli_night.png') });
// 4) bust on foot
const bust = await page.evaluate(() => {
  const g = window.__game;
  g.setClock(12);
  if (g.player.vehicle) {
    g.player.vehicle.body.setLinearVelocity({ x: 0, y: 0 });
    g.player.exit(g.player.vehicle, true);
  }
  g.player.char.standUp();
  g.police.clearAll();
  g.wanted.clear();
  g.wanted.atLeast(1, g.player.x, g.player.y);
  const u = g.police.spawnUnit('polizei', g.player.x + 6, g.player.y, Math.PI, 'pursue');
  g.simulate(4, {});
  return { busted: g.bustedT > 0 || g.money < 250, officers: g.police.officers.length };
});
console.log('bust', JSON.stringify(bust));
await page.evaluate(() => window.__game.simulate(4, {}));
console.log(JSON.stringify(await st('afterBust')));
// 5) Lackiererei
const ls = await page.evaluate(() => {
  const g = window.__game;
  const p = g.city.pois.get('paint1');
  const v = g.spawnVehicle('golfo', p.x, p.y - 8, Math.PI / 2);
  g.teleport(v.x - 2.6, v.y);
  g.simulate(0.05, { enterPressed: true });
  g.simulate(1.5, {});
  if (!g.player.inVehicle) return { err: 'not in vehicle' };
  g.police.clearAll();
  g.police.enabled = false;
  g.police.seen = false;
  g.money = 1000;
  g.wanted.atLeast(2, 0, 0);
  g.wanted.unseenT = 30;
  g.teleport(p.x, p.y);
  g.player.vehicle.body.setLinearVelocity({ x: 0, y: 0 });
  g.simulate(0.6, {});
  return { lvl: g.wanted.level, money: g.money };
});
console.log('lackiererei', JSON.stringify(ls));
await page.screenshot({ path: path.join(outDir, 'p4_paint.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
