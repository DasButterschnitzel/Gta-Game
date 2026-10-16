// Takes screenshots of the running game at several places/times for visual review.
// Usage: node tests/shots.mjs <outdir> [spec...]   spec = name:x:y:h:day
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2] || 'test-output';
fs.mkdirSync(outDir, { recursive: true });
const url = process.env.GAME_URL || 'http://localhost:8765/?autostart';
const specs = process.argv.slice(3);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game && window.__game.cityRenderer, null, { timeout: 120000 });
await page.waitForTimeout(500);
for (const spec of specs) {
  const [name, x, y, h, day] = spec.split(':');
  await page.evaluate(([x, y, h, day]) => {
    const g = window.__game;
    let px = Number(x), py = Number(y);
    if (isNaN(px)) { const p = g.poi(x); px = p.x; py = p.y; }
    g.debugView(px, py, Number(h), Number(day));
  }, [x, y, h, day ?? '1']);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}
console.log(logs.slice(-30).join('\n'));
await browser.close();
