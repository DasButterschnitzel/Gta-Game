// Combat smoke test: weapons, tracers, molotov fire, grenade explosion, pickups.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const outDir = process.argv[2] || 'test-output';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
await page.waitForTimeout(800);
const r = await page.evaluate(() => {
  const g = window.__game;
  g.peds.enabled = false;
  g.traffic.enabled = false;
  const out = {};
  // three targets in front (player faces west = PI)
  const t1 = g.spawnPed(-6, 0);
  const t2 = g.spawnPed(-9, 1.5);
  const t3 = g.spawnPed(-12, -1.5);
  g.give('pistol', 50);
  g.simulate(0.05, { fire: true, firePressed: true, moveX: -1, moveY: 0 });
  g.simulate(1.5, { fire: true, moveX: -0.01, moveY: 0 });
  out.pistol = { ammo: g.player.char.arsenal.ammoOf('pistol'), hp: [t1.health, t2.health, t3.health].map(Math.round) };
  g.give('smg', 90);
  g.simulate(1.2, { fire: true });
  out.smg = { ammo: g.player.char.arsenal.ammoOf('smg'), hp: [t1.health, t2.health, t3.health].map(Math.round), dead: [t1.dead, t2.dead, t3.dead] };
  out.drops = g.pickups.list.filter((p) => p.life !== Infinity).length;
  out.staticPickups = g.pickups.list.filter((p) => p.life === Infinity).length;
  return out;
});
console.log('combat', JSON.stringify(r));
await page.screenshot({ path: path.join(outDir, 'c1_guns.png') });
const r2 = await page.evaluate(() => {
  const g = window.__game;
  g.give('molotov', 3);
  g.simulate(0.02, { fire: true, firePressed: true });
  g.simulate(1.3, {});
  const fires = g.combat.fires.length;
  return { fires };
});
console.log('molotov', JSON.stringify(r2));
await page.screenshot({ path: path.join(outDir, 'c2_molotov.png') });
const r3 = await page.evaluate(() => {
  const g = window.__game;
  const v = g.spawnVehicle('golfo', g.player.x - 10, g.player.y + 4, 0);
  g.give('grenade', 2);
  g.player.char.heading = Math.atan2(4, -10);
  g.simulate(0.02, { fire: true, firePressed: true });
  g.simulate(2.3, {});
  return { carHealth: Math.round(v.health), burning: v.burning > 0, exploded: v.exploded };
});
console.log('grenade', JSON.stringify(r3));
await page.screenshot({ path: path.join(outDir, 'c3_grenade.png') });
// drive-by
const r4 = await page.evaluate(() => {
  const g = window.__game;
  const gis = g.vehicles.find((v) => v.missionTag === 'gisela');
  g.teleport(gis.x + 3, gis.y);
  g.simulate(0.05, { enterPressed: true });
  g.simulate(2.0, {});
  const t = g.spawnPed(0, 6);
  g.give('smg', 60);
  g.simulate(1.0, { fire: true });
  return { inVehicle: g.player.inVehicle, target: Math.round(t.health), smg: g.player.char.arsenal.ammoOf('smg') };
});
console.log('driveby', JSON.stringify(r4));
await page.screenshot({ path: path.join(outDir, 'c4_driveby.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
