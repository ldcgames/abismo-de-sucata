// Gera um único HTML jogável (modo solo + online se houver servidor em config.js)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const out = process.argv[2] || 'dist/abismo-de-sucata.html';
fs.rmSync('/tmp/site', { recursive: true, force: true });
fs.cpSync('client', '/tmp/site', { recursive: true });
fs.cpSync('shared', '/tmp/site/shared', { recursive: true });
execSync('/opt/npm-tools/node_modules/.bin/esbuild /tmp/site/src/main.js --bundle --format=esm --minify --outfile=/tmp/site/bundle.js', { stdio: 'inherit' });
let html = fs.readFileSync('/tmp/site/index.html', 'utf8');
const css = fs.readFileSync('/tmp/site/style.css', 'utf8');
const cfg = fs.readFileSync('/tmp/site/config.js', 'utf8');
const js = fs.readFileSync('/tmp/site/bundle.js', 'utf8').replace(/<\/script/g, '<\\/script');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
  .replace('<script src="config.js"></script>', () => `<script>${cfg}</script>`)
  .replace('src="ldc-logo.jpg"', () => `src="data:image/jpeg;base64,${fs.readFileSync('/tmp/site/ldc-logo.jpg').toString('base64')}"`)
  .replace(/<script type="module" src="src\/main.js"><\/script>/, () => `<script type="module">${js}</script>`);
fs.mkdirSync(out.replace(/\/[^/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(out, html);
console.log('ok', out, (html.length / 1024).toFixed(0) + ' KB');
function* walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) yield* walk(p); else if (p.endsWith('.js')) yield p; } }
