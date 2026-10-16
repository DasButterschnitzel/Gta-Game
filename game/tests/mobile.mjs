// Mobile emulation test: touch UI layout + runtime errors on the production bundle.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
const outDir = process.argv[2] || 'test-output';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
await page.goto('http://localhost:8765/', { waitUntil: 'commit' });
await page.waitForSelector('.startbtn', { timeout: 120000 });
await page.screenshot({ path: path.join(outDir, 'm0_title.png') });
await page.tap('.startbtn');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, 'm1_foot.png') });
// tap EINSTEIGEN via touch at the button position
const btn = await page.evaluate(() => { const els = [...document.querySelectorAll('.tbtn')].filter(e => e.style.display !== 'none' && e.textContent.includes('EINSTEIGEN')); const r = els[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.touchscreen.tap(btn.x, btn.y);
await page.waitForTimeout(2500);
const s1 = await page.evaluate(() => window.__game.stats());
console.log('after touch-enter', JSON.stringify(s1));
await page.screenshot({ path: path.join(outDir, 'm2_car.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
