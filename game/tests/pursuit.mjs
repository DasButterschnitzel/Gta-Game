// Pursuit AI trace: player waits in a car, police approach; log every unit's state.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
const where = process.argv[2] || 'start';
await page.evaluate((where) => {
  const g = window.__game;
  const p = g.city.pois.get(where);
  const v = g.spawnVehicle('golfo', p.x, p.y, 0);
  g.teleport(p.x, p.y);
  g.teleport(v.x - 2.5, v.y + 1.6);
  g.simulate(0.05, { enterPressed: true });
  g.simulate(1.5, {});
  g.traffic.enabled = true;
  g.wanted.atLeast(2, g.player.x, g.player.y);
}, where);
for (let i = 0; i < 14; i++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.simulate(1.5, { handbrake: true });
    g.wanted.seenAt(g.player.x, g.player.y);
    return {
      t: +g.time.toFixed(1), lvl: g.wanted.level, seen: g.police.seen, inVeh: g.player.inVehicle, busted: g.bustedT ?? 0,
      units: g.police.units.map((u) => `${u.kind}/${u.mode} d=${Math.round(Math.hypot(u.v.x - g.player.x, u.v.y - g.player.y))} v=${u.v.speed.toFixed(0)} hp=${Math.round(u.v.health)} path=${u.path.length} stuck=${u.stuckT.toFixed(1)} rev=${u.reverseT.toFixed(1)}`),
      officers: g.police.officers.map((c) => `${c.ai?.mode} d=${Math.round(Math.hypot(c.x - g.player.x, c.y - g.player.y))}`),
    };
  });
  console.log(JSON.stringify(r));
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
