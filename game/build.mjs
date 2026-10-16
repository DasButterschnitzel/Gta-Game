// Build script: bundles the game with esbuild and copies static files.
// Usage: node build.mjs [--dev] [--serve] [--android]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const serve = args.has('--serve');
const root = path.dirname(new URL(import.meta.url).pathname);
const dist = path.join(root, 'dist');
const androidAssets = path.join(root, '..', 'android', 'app', 'src', 'main', 'assets', 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  const t0 = Date.now();
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'main.ts')],
    bundle: true,
    format: 'iife',
    target: ['chrome80'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    outfile: path.join(dist, 'game.js'),
    define: {
      __VERSION__: JSON.stringify(pkg.version),
      __DEV__: JSON.stringify(dev),
    },
    logLevel: 'warning',
  });
  let html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  html = html.replace(/__VERSION__/g, pkg.version);
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'src', 'ui', 'style.css'), path.join(dist, 'style.css'));
  copyDir(path.join(root, 'public'), dist);
  const size = fs.statSync(path.join(dist, 'game.js')).size;
  console.log(`built v${pkg.version} in ${Date.now() - t0} ms, game.js ${(size / 1024).toFixed(0)} KB`);
  if (args.has('--android')) {
    fs.rmSync(androidAssets, { recursive: true, force: true });
    copyDir(dist, androidAssets);
    console.log('copied to', androidAssets);
  }
}

await build();

if (serve) {
  const port = Number(process.env.PORT || 8765);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ogg': 'audio/ogg', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
  http
    .createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = path.join(dist, url === '/' ? 'index.html' : url);
      if (!file.startsWith(dist) || !fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, () => console.log(`serving http://localhost:${port}/`));
}
