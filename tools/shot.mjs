// Abre o jogo no Chrome (headless) e tira capturas.  Uso: node tools/shot.mjs <url> <saida.png> [espera_ms] [scriptJS]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const [url, out, wait = '6000', script = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (script) { try { const r = await page.evaluate(script); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); } catch (e) { logs.push('[evalerr] ' + e.message); } await page.waitForTimeout(1500); }
await page.screenshot({ path: out });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
