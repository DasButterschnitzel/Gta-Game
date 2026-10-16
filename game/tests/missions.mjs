// Mission autopilot: completes the story missions by teleporting / cheating to validate the scripts.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const outDir = process.argv[2] || 'test-output';
const only = process.argv[3] || '';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.missions, null, { timeout: 120000 });
// pretend the prologue and Freigang are done
await page.evaluate(() => { const g = window.__game; g.done.clear(); g.done.add('prolog'); g.done.add('freigang'); });
const step = () => page.evaluate(() => {
  const g = window.__game;
  if (g.dialogue.active) { g.skipDialogue(); return { act: 'skip' }; }
  const m = g.missions;
  if (!m.running) {
    const next = g.nextMission();
    if (!next) return { act: 'finished' };
    const sp = next.start ? (typeof next.start === 'string' ? g.city.pois.get(next.start) : next.start) : null;
    if (g.player.vehicle) { g.player.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); g.player.exit(g.player.vehicle, true); }
    if (sp) g.teleport(sp.x, sp.y + 3);
    g.simulate(0.3, {});
    return { act: 'start ' + next.id };
  }
  const obj = m.objective;
  const t = m.primaryTarget();
  const pl = g.player;
  // enemies: take them out
  const enemies = g.npcs.list.filter((c) => !c.dead && c.hostile);
  if (enemies.length && /Verjag|Erledige|Zeig|Verprügel/.test(obj)) {
    for (const e of enemies) e.damage(999, pl.char);
    g.simulate(0.5, {});
    return { act: 'kill', obj };
  }
  if (/Hol ein Auto|Besorg/.test(obj)) {
    const v = g.spawnVehicle('golfo', pl.x + 3, pl.y, 0);
    g.seatPlayer(v);
    g.simulate(0.4, {});
    return { act: 'car', obj };
  }
  if (/Schnapp dir den Wirt/.test(obj)) {
    const w = g.npcs.list.find((c) => !c.dead && c.ai?.mode === 'flee');
    if (w) w.knockDown(1, 0, 2);
    g.simulate(0.5, {});
    return { act: 'catch', obj };
  }
  if (/Häng die Polizei ab/.test(obj)) {
    g.wanted.clear();
    g.simulate(0.5, {});
    return { act: 'lose cops', obj };
  }
  if (t) {
    const tx = t.x(), ty = t.y();
    if (t.kind === 'arrow' && t.color === 'blue') {
      const v = g.vehicles.find((o) => Math.hypot(o.x - tx, o.y - ty) < 0.5);
      if (v) { g.seatPlayer(v); g.simulate(0.4, {}); return { act: 'enter', obj }; }
    }
    if (pl.vehicle) {
      pl.vehicle.body.setTransform({ x: tx, y: ty }, pl.vehicle.angle);
      pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 });
      g.camera.snap(tx, ty);
    } else g.teleport(tx, ty);
    g.simulate(0.6, {});
    return { act: 'goto', obj };
  }
  g.simulate(0.5, {});
  return { act: 'wait', obj };
});
let last = '';
for (let i = 0; i < 260; i++) {
  const r = await step();
  await page.waitForTimeout(60);
  const s = `${r.act} | ${r.obj ?? ''}`;
  if (s !== last) console.log(i, s);
  last = s;
  if (r.act === 'finished') break;
  if (r.act.startsWith('start') && only && !r.act.includes(only)) {}
}
const fin = await page.evaluate(() => ({ done: [...window.__game.done], money: window.__game.money, respect: window.__game.respect.values, weapons: window.__game.player.char.arsenal.toJSON() }));
console.log('final', JSON.stringify(fin));
await page.screenshot({ path: path.join(outDir, 'm_final.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
