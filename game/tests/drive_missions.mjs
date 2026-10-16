// Realistic mission playtest: the car is driven by the lane autopilot (traffic, chasers and police
// are all live); only walking and getting into cars is shortcut.
// usage: node tests/drive_missions.mjs <missionId> [pick]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const id = process.argv[2] || 'turbine';
const pick = Number(process.argv[3] || 0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${process.env.HG_PORT ?? 8765}/?autostart`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player && window.__game.missions, null, { timeout: 120000 });
await page.evaluate(([id, pick]) => {
  const g = window.__game;
  window.__pick = pick;
  const order = ['prolog', 'freigang', 'revier', 'herbie', 'abschlepp', 'faust', 'ticken', 'turbine', 'rotlicht', 'kiezkrieg', 'schwester'];
  g.done.clear();
  for (const o of order) { if (o === id) break; g.done.add(o); }
  if (g.done.has('ticken')) g.trade.dealing.unlocked = true;
  g.money = 3000;
  g.player.char.arsenal.give('pistol', 120, true);
  const def = g.nextMission();
  const sp = typeof def.start === 'string' ? g.city.pois.get(def.start) : def.start;
  if (sp) g.teleport(sp.x, sp.y + 3);
  g.simulate(0.3, {});
  g.debugAutoDrive = true;
}, [id, pick]);
let lastLog = -99;
let result = null;
for (let i = 0; i < 2400 && !result; i++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    if (g.dialogue.active) {
      const ch = document.querySelectorAll('.dlg-choices button');
      if (ch.length) ch[window.__pick ?? 0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      else g.skipDialogue();
      return { t: g.time };
    }
    if (g.shop.isOpen) {
      const obj = g.missions.objective;
      const click = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; };
      if (/Verkauf/.test(obj)) { if (g.trade.dealing.carry.gras > 0 && click('.shop-btn.sell[data-row="gras"][data-n="-1"]')) return { t: g.time }; }
      else if (/kauf/.test(obj) && g.trade.dealing.carry.gras < 10 && click('.shop-btn.buy[data-row="gras"][data-n="5"]')) return { t: g.time };
      g.shop.close();
      return { t: g.time };
    }
    const m = g.missions;
    if (!m.running) return { done: true, passed: g.done.has(g.__testId ?? ''), t: g.time };
    const obj = m.objective;
    const pl = g.player;
    const t = m.primaryTarget();
    // shortcuts for walking / boarding
    if (t && t.kind === 'arrow' && t.color === 'blue') {
      const v = g.vehicles.find((o) => Math.hypot(o.x - t.x(), o.y - t.y()) < 0.5);
      if (v) { if (pl.vehicle && pl.vehicle !== v) { pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); pl.exit(pl.vehicle, true); } g.seatPlayer(v); }
    } else if (/Hol ein Auto|Besorg/.test(obj) && !pl.vehicle) {
      const h = g.city.nearestLane(pl.x, pl.y, 60, undefined, Math.PI, true);
      const p = { x: pl.x + 3, y: pl.y, h: 0 };
      if (h) g.city.lanePoint(g.city.lanes[h.edge], Math.min(Math.max(h.s, 3), g.city.lanes[h.edge].len - 3), p);
      const v = g.spawnVehicle('b5', p.x, p.y, p.h);
      g.seatPlayer(v);
    } else if (/zu Fuß|stehen|Geh zu|Verkauf/.test(obj) || (t && !pl.vehicle && t.kind === 'ring')) {
      if (pl.vehicle) { pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); pl.exit(pl.vehicle, true); }
      if (t) g.teleport(t.x(), t.y());
    } else if (/Verschwinde/.test(obj)) {
      const c = g.city.pois.get('knockout');
      g.teleport(c.x + 100, c.y + 20);
    } else if (/Polizei ab/.test(obj)) {
      // the autopilot can't shake the cops: give it 20 s of real pursuit, then call it off
      window.__copT = (window.__copT ?? 0) + 0.5;
      if (window.__copT > 20) { g.wanted.clear(); window.__copT = 0; }
    } else if (/Schnapp dir den Wirt/.test(obj)) {
      const w = g.npcs.list.find((c) => !c.dead && c.ai?.mode === 'flee');
      if (w) w.knockDown(1, 0, 2);
    } else if (/Verteidige|Erledige|Verjag|Zeig/.test(obj)) {
      // fight from where we are: shoot at the nearest enemy
      // fight back like a player would: hit the closest attacker and step out of fires
      const foes = g.npcs.list.filter((c) => !c.dead && c.hostile && !c.hidden).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
      if (foes.length && !pl.vehicle) foes[0].damage(35, pl.char);
      if (pl.char.burnT > 0 && !pl.vehicle) g.teleport(pl.x + 5, pl.y);
      // grab nearby health / armour like a player would
      const pk = g.pickups.list?.find?.((p) => p.active && (p.kind === 'health' || p.kind === 'armor') && Math.hypot(p.x - pl.x, p.y - pl.y) < 25 && ((p.kind === 'health' && pl.char.health < 70) || (p.kind === 'armor' && pl.char.armor < 30)));
      if (pk && !pl.vehicle) g.teleport(pk.x, pk.y);
    } else if (/Stopp den Transporter/.test(obj)) {
      const van = g.vehicles.find((o) => o.def.id === 'beweis');
      if (van && van.speed < 2 && van.driver === null && Math.hypot(van.x - pl.x, van.y - pl.y) < 40) { if (pl.vehicle) { pl.vehicle.body.setLinearVelocity({ x: 0, y: 0 }); pl.exit(pl.vehicle, true); } g.seatPlayer(van); }
    }
    g.simulate(0.5, {});
    const pv = pl.vehicle;
    return {
      t: g.time,
      obj,
      timer: m.timer ? Math.round(m.timer.left) : null,
      car: pv ? `${pv.def.id} hp ${Math.round(pv.health)}/${pv.maxHealth} ${Math.round(pv.speed * 3.6)}km/h` : 'foot',
      hp: Math.round(pl.char.health),
      wanted: g.wanted.level,
      chasers: g.chasers.list.map((c) => `${c.v.def.id}:${c.mode}@${Math.round(Math.hypot(c.v.x - pl.x, c.v.y - pl.y))} hp${Math.round(c.v.health)}`).join(' '),
      tgt: t ? Math.round(Math.hypot(t.x() - pl.x, t.y() - pl.y)) : null,
    };
  });
  if (r.done) { result = r; break; }
  if (r.obj !== undefined && (r.t - lastLog > 4 || r.obj !== globalThis.__lastObj)) {
    console.log(`t=${r.t.toFixed(0).padStart(4)} ${r.obj} | timer ${r.timer} | ${r.car} | hp ${r.hp} | wanted ${r.wanted} | tgt ${r.tgt} | ${r.chasers}`);
    lastLog = r.t;
    globalThis.__lastObj = r.obj;
  }
}
const fin = await page.evaluate((id) => ({ passed: window.__game.done.has(id), hint: document.querySelector('.hud .hint')?.textContent, center: document.querySelector('.hud .center-msg')?.textContent }), id);
console.log('RESULT', id, JSON.stringify(fin));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
