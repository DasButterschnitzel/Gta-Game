// Gang chasers: catch up with the player's car, ram / shoot, pile out when the player is on foot.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
const res = await page.evaluate(() => {
  const g = window.__game;
  const out = { log: [] };
  const lane = g.city.lanes.filter((e) => e.road >= 0 && e.len > 100)[30];
  const p = { x: 0, y: 0, h: 0 };
  g.city.lanePoint(lane, 10, p);
  for (const v of [...g.vehicles]) if (Math.hypot(v.x - p.x, v.y - p.y) < 30) g.removeVehicle(v);
  const car = g.spawnVehicle('b5', p.x, p.y, p.h);
  car.health = car.maxHealth = 2000;
  g.seatPlayer(car);
  g.player.char.health = g.player.char.maxHealth = 5000;
  const look = { skin: 0xd8a07a, hair: 0x1a1a1a, top: 0xd8a820, bottom: 0x1a1a1a, shoes: 0xe8e8e8, accent: 0xc82a2a };
  // spawn on lanes ~80 m away (like the missions do)
  // lane spots ~80 m behind, heading roughly towards the player
  const near = (a) => { const q = { x: 0, y: 0, h: 0 }; const hit = g.city.nearestLane(p.x - Math.cos(p.h + a) * 80, p.y - Math.sin(p.h + a) * 80, 80, Math.atan2(Math.sin(p.h + a), Math.cos(p.h + a)), 1.4, false) ?? g.city.nearestLane(p.x - Math.cos(p.h + a) * 80, p.y - Math.sin(p.h + a) * 80, 80, undefined, Math.PI, false); const e = g.city.lanes[hit.edge]; g.city.lanePoint(e, Math.min(Math.max(hit.s, 3), e.len - 3), q); return q; };
  const s1 = near(0.3);
  const s2 = near(-0.4);
  const c1 = g.chasers.spawn('mercator', s1.x, s1.y, s1.h, { crew: [look, look], weapons: ['bat', 'pistol'], ram: true });
  const c2 = g.chasers.spawn('golfo', s2.x, s2.y, s2.h, { crew: [look, look], weapons: ['bat', 'pistol'], ram: false });
  // the player cruises along slowly (simple lane autopilot: follow the lane graph forward)
  let minD = 999;
  let carDmg0 = car.health;
  for (let t = 0; t < 20; t += 1) {
    g.simulate(1, { throttle: 0.35 });
    const d1 = Math.hypot(c1.v.x - car.x, c1.v.y - car.y);
    const d2 = Math.hypot(c2.v.x - car.x, c2.v.y - car.y);
    minD = Math.min(minD, d1, d2);
    if (t % 4 === 3) out.log.push(`t=${t + 1} d1=${d1.toFixed(0)} d2=${d2.toFixed(0)} mode=${c1.mode}/${c2.mode} carHP=${car.health.toFixed(0)}`);
  }
  out.minDist = minD.toFixed(1);
  out.carDamage = (carDmg0 - car.health).toFixed(0);
  // player gets out: chasers should stop and attack on foot
  car.body.setLinearVelocity({ x: 0, y: 0 });
  g.simulate(1.5, { brake: 1 });
  g.player.exit(car, true);
  for (let t = 0; t < 10; t++) g.simulate(1, {});
  out.afterExit = { modes: `${c1.mode}/${c2.mode}`, npcs: g.npcs.list.filter((c) => !c.dead).map((c) => `${c.ai.mode}@${Math.hypot(c.x - g.player.x, c.y - g.player.y).toFixed(0)}`).join(' '), playerHP: g.player.char.health.toFixed(0) };
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
