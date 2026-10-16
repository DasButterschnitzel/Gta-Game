// Story flow test: prologue -> Freigang -> Altes Revier start.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const outDir = process.argv[2] || 'test-output';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8765/?autostart&story', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.missions, null, { timeout: 120000 });
const shot = (n) => page.screenshot({ path: path.join(outDir, n + '.png') });
const st = (label) => page.evaluate((label) => {
  const g = window.__game;
  return { label, mission: g.missions.active?.id ?? null, obj: g.missions.objective, dlg: g.dialogue.active, inVeh: g.player.vehicle?.def.id ?? null, wanted: g.wanted.level, done: [...g.done], money: g.money, rain: g.renderer.rainOn ?? null, x: Math.round(g.player.x), y: Math.round(g.player.y) };
}, label);
const skip = async () => {
  for (let i = 0; i < 20; i++) {
    const a = await page.evaluate(() => window.__game.dialogue.active);
    if (!a) return;
    await page.evaluate(() => window.__game.skipDialogue());
    await page.waitForTimeout(150);
  }
};
const sim = (s, inp = {}) => page.evaluate(([s, inp]) => window.__game.simulate(s, inp), [s, inp]);
await page.waitForTimeout(800);
console.log(JSON.stringify(await st('prolog-start')));
await shot('s1_prolog_dialogue');
await skip();
await sim(2, { throttle: 0.6 });
console.log(JSON.stringify(await st('prolog-drive')));
await page.evaluate(() => window.__game.setClock(1.4));
await shot('s2_prolog_drive');
// jump to the bridge
await page.evaluate(() => {
  const g = window.__game;
  const t = g.missions.targets[0];
  const v = g.player.vehicle;
  v.body.setTransform({ x: t.x(), y: t.y() + 18 }, -Math.PI / 2);
  v.body.setLinearVelocity({ x: 0, y: -10 });
});
await sim(1.0, { throttle: 0.5 });
console.log(JSON.stringify(await st('at-bridge')));
await shot('s3_bridge_dialogue');
await skip();
// crash + fade + title (real time)
for (let i = 0; i < 14; i++) { await sim(0.5, {}); await page.waitForTimeout(400); await skip(); }
console.log(JSON.stringify(await st('after-prolog')));
await shot('s4_freigang');
await skip();
await sim(0.5, {});
console.log(JSON.stringify(await st('freigang-obj')));
// get into Gisela
await page.evaluate(() => {
  const g = window.__game;
  const gis = g.vehicles.find((v) => v.missionTag === 'gisela');
  g.teleport(gis.x + 2.6, gis.y);
});
await sim(0.05, { enterPressed: true });
await sim(2.0, {});
console.log(JSON.stringify(await st('in-gisela')));
await shot('s5_gps');
// drive (teleport) to the grill
await page.evaluate(() => {
  const g = window.__game;
  const t = g.missions.targets[0];
  g.player.vehicle.body.setTransform({ x: t.x(), y: t.y() }, 0);
  g.player.vehicle.body.setLinearVelocity({ x: 0, y: 0 });
});
await sim(1.0, {});
console.log(JSON.stringify(await st('at-grill')));
await shot('s6_gul');
await skip();
await sim(1.0, {});
await page.waitForTimeout(500);
console.log(JSON.stringify(await st('freigang-done')));
await sim(4.0, {});
await shot('s7_after');
console.log('save:', await page.evaluate(() => localStorage.getItem('hafengold.save1')?.slice(0, 160)));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
