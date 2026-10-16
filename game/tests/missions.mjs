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
  if (g.dialogue.active) {
    const ch = document.querySelectorAll('.dlg-choices button');
    if (ch.length) { ch[window.__pick ?? 0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return { act: 'choose' }; }
    g.skipDialogue();
    return { act: 'skip' };
  }
  if (g.shop.isOpen) {
    const obj = g.missions.objective;
    const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; };
    if (/Verkauf/.test(obj)) {
      if (g.trade.dealing.carry.gras > 0) { click('.shop-btn.sell[data-row="gras"][data-n="-1"]'); return { act: 'sell', obj }; }
    } else if (/kauf/.test(obj) && g.trade.dealing.carry.gras < 10) { click('.shop-btn.buy[data-row="gras"][data-n="5"]'); return { act: 'buy', obj }; }
    click('[data-close]');
    return { act: 'close shop', obj };
  }
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
  if (/Verteidige|Erledige den Rest/.test(obj)) {
    for (const ch of g.chasers.list) g.explode(ch.v);
    for (const e of g.npcs.list) if (!e.dead && e.hostile) e.damage(999, pl.char);
    g.simulate(0.6, {});
    return { act: 'defend', obj };
  }
  if (/Kronwache/.test(obj) && pl.vehicle) {
    const v = pl.vehicle;
    const h = g.city.nearestLane(v.x + 90, v.y + 30, 60, undefined, Math.PI, true);
    const p = { x: 0, y: 0, h: 0 };
    if (h) g.city.lanePoint(g.city.lanes[h.edge], Math.min(Math.max(h.s, 3), g.city.lanes[h.edge].len - 3), p);
    v.body.setTransform({ x: h ? p.x : v.x + 90, y: h ? p.y : v.y }, v.angle);
    v.body.setLinearVelocity({ x: 0, y: 0 });
    g.simulate(1.0, {});
    return { act: 'flee', obj };
  }
  if (/Transporter/.test(obj) && !/Bring/.test(obj)) {
    const van = g.vehicles.find((o) => o.def.id === 'beweis');
    if (van && g.player.vehicle !== van) { if (pl.vehicle) { pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); pl.exit(pl.vehicle, true); } g.seatPlayer(van); g.simulate(0.5, {}); return { act: 'jack van', obj }; }
  }
  if (/Verschwinde/.test(obj)) {
    const c = g.city.pois.get('knockout');
    if (pl.vehicle) { pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); pl.exit(pl.vehicle, true); }
    g.teleport(c.x + 100, c.y + 20);
    g.simulate(0.5, {});
    return { act: 'leave', obj };
  }
  if (/stehen/.test(obj) || /verstecken/.test(obj)) {
    if (t) g.teleport(t.x(), t.y());
    g.simulate(0.5, {});
    return { act: 'hold', obj };
  }
  if (/zu Fuß/.test(obj) && pl.vehicle) {
    pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 });
    pl.exit(pl.vehicle, true);
    g.simulate(0.3, {});
    return { act: 'exit', obj };
  }
  if (/Hol ein Auto|Besorg/.test(obj) && !pl.vehicle) {
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
for (let i = 0; i < 700; i++) {
  const r = await step();
  await page.waitForTimeout(60);
  const s = `${r.act} | ${r.obj ?? ''}`;
  if (s !== last) console.log(i, s);
  last = s;
  if (r.act === 'finished') break;
  if (r.act.startsWith('start') && only && !r.act.includes(only)) {}
}
const fin = await page.evaluate(() => ({ done: [...window.__game.done], money: Math.round(window.__game.money), respect: window.__game.respect.values, weapons: window.__game.player.char.arsenal.toJSON(), flags: [...window.__game.flags], dealing: window.__game.trade.dealing.toJSON(), hafenOpen: !window.__game.physics.isZoneLocked(1) }));
console.log('final', JSON.stringify(fin));
await page.screenshot({ path: path.join(outDir, 'm_final.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
