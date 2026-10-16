// Runs the browser test suite against a running dev server (node build.mjs --dev --serve) and
// reports which scripts printed page errors or crashed.
// usage: node tests/run.mjs [outDir] [name ...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = process.argv[2] || path.join(here, '..', 'test-output');
const only = process.argv.slice(3);
fs.mkdirSync(outDir, { recursive: true });

// [script, args, what to look for in the output besides "errors: none"]
const SUITE = [
  ['mobile.mjs', [outDir]],
  ['steer.mjs', []],
  ['chase.mjs', []],
  ['gangs.mjs', []],
  ['combat.mjs', [outDir]],
  ['police.mjs', [outDir]],
  ['pursuit.mjs', []],
  ['menu.mjs', [outDir]],
  ['fixes.mjs', []],
  ['story.mjs', [outDir]],
  ['missions.mjs', [outDir], /"done":\[[^\]]*"schwester"/],
];

let failed = 0;
for (const [script, args, expect] of SUITE) {
  const name = script.replace('.mjs', '');
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(here, script), ...args], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const clean = /errors: none/.test(out);
  const ok = r.status === 0 && clean && (!expect || expect.test(out));
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s`);
  if (!ok) console.log(out.split('\n').slice(-25).join('\n'));
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
