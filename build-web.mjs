// Builds the web / iPhone / iPad version into web-dist/ (a static site, deployed to GitHub Pages).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const out = 'web-dist';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'engine'), { recursive: true });

await esbuild.build({
  entryPoints: { app: 'src/web/main.js' },
  bundle: true,
  format: 'esm',
  target: ['safari15', 'chrome100'],
  outdir: out,
  minify: true,
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
  define: { 'globalThis.__APP_VERSION__': JSON.stringify(pkg.version) },
  logLevel: 'info',
});

const copy = (from, to) => fs.copyFileSync(from, path.join(out, to));
copy('web/index.html', 'index.html');
copy('web/manifest.webmanifest', 'manifest.webmanifest');
for (const s of [180, 192, 512]) copy(`assets/web/icon-${s}.png`, `icon-${s}.png`);
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) copy(`node_modules/stockfish/bin/${f}`, `engine/${f}`);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// Service worker: cache every file; the version is a hash of their contents so any change triggers an update.
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!e.name.startsWith('.')) files.push(p); } };
walk(out);
const hash = crypto.createHash('sha256');
for (const f of files.sort()) hash.update(f).update(fs.readFileSync(f));
const version = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
const urls = ['./', ...files.map((f) => path.relative(out, f).split(path.sep).join('/')).filter((f) => f !== 'index.html')];
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync('web/sw.js', 'utf8')
  .replace('__VERSION__', version).replace('__FILES__', JSON.stringify(urls, null, 2)));
console.log(`web build ${version}: ${urls.length} files in ${out}/`);
