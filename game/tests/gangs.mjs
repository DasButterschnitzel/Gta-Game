// Ambient gang members: spawn in their turf, hostile at low respect, gang war between Kiez and NEON.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto('http://localhost:8765/?autostart', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 120000 });
const res = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  g.done.add('freigang');
  g.player.char.health = g.player.char.maxHealth = 5000;
  const club = g.city.pois.get('knockout');
  // 1) neutral respect: groups spawn on the Kiez, nobody attacks
  g.teleport(club.x + 20, club.y - 10);
  for (let i = 0; i < 12; i++) g.simulate(1, {});
  const gs = g.gangStreet;
  out.neutral = { members: gs.members.length, gangs: [...new Set(gs.members.map((m) => m.gang.id))].join(','), attacking: gs.members.filter((m) => m.c.ai?.mode === 'attack').length };
  // 2) hostile: Kiez respect -60, walk up to a group
  g.respect.values.kiez = -60;
  const m0 = gs.members.find((m) => !m.c.dead);
  if (m0) {
    g.teleport(m0.c.x + 6, m0.c.y);
    for (let i = 0; i < 4; i++) g.simulate(1, {});
    out.hostile = { attacking: gs.members.filter((m) => m.c.ai?.mode === 'attack' && m.c.ai.target === g.player.char).length, playerHP: Math.round(g.player.char.health) };
  }
  // 3) gang war: NEON raiders vs Kiez on the Kiez
  g.respect.values.kiez = 0;
  for (const m of gs.members) if (m.c.ai) { m.c.ai.mode = 'guard'; m.c.ai.target = null; m.c.lastAttacker = null; }
  g.flags.add('gangwar');
  gs.clear();
  g.teleport(club.x + 40, club.y - 30);
  let fights = 0;
  let kinds = new Set();
  for (let i = 0; i < 40; i++) {
    g.simulate(1, {});
    for (const m of gs.members) {
      kinds.add(m.gang.id);
      if (m.c.ai?.mode === 'attack' && m.c.ai.target !== g.player.char) fights++;
    }
  }
  out.war = { members: gs.members.length, gangs: [...kinds].join(','), fightTicks: fights, dead: gs.members.filter((m) => m.c.dead).length, playerAttacked: gs.members.filter((m) => m.c.ai?.target === g.player.char).length };
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
