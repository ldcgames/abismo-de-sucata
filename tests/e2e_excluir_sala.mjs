// Excluir sala pela lixeira da lista: duas confirmações; o líder apaga para todos, o amigo só tira da lista dele.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.env.BASE || 'http://localhost:8090/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const A = await (await browser.newContext({ viewport: { width: 900, height: 640 } })).newPage();
const B = await (await browser.newContext({ viewport: { width: 900, height: 640 } })).newPage();
const erros = []; for (const [n, p] of [['A', A], ['B', B]]) p.on('pageerror', (e) => erros.push(n + ': ' + e.message));
let ok = 0, falhas = 0; const check = (c, nome, extra = '') => { if (c) { ok++; console.log('  ✔', nome, extra); } else { falhas++; console.log('  ✘', nome, extra); } };
const pronto = (p) => p.waitForFunction(() => window.__jogo?.me && window.__jogo.t > 0, null, { timeout: 150000 });
const servidorOk = (p) => p.waitForFunction(() => !document.getElementById('btSalas').disabled && /online/.test(document.getElementById('srvStatus').textContent), null, { timeout: 15000 });
const abrirLista = async (p) => { await p.goto(base + '?q=0&semdesenho'); await servidorOk(p); await p.click('#btSalas'); await p.waitForFunction(() => !/Carregando|Excluindo/.test(document.getElementById('salasLista').textContent)); };
const codigos = (p) => p.evaluate(() => [...document.querySelectorAll('[data-excluir]')].map((b) => b.dataset.excluir));
// Ana cria a sala, Beto entra; os dois saem
await A.goto(base + '?q=0&semdesenho'); await A.fill('#nome', 'Ana'); await servidorOk(A);
await A.click('#btSalas'); await A.waitForFunction(() => !/Carregando/.test(document.getElementById('salasLista').textContent)); await A.click('#btCriar'); await pronto(A);
const code = await A.evaluate(() => __jogo.net.code);
await B.goto(base + `?q=0&semdesenho&sala=${code}`); await B.fill('#nome', 'Beto'); await B.waitForFunction((c) => document.getElementById('codigo').value === c, code);
await B.click('#cores button:nth-child(2)'); await B.click('#btEntrar'); await pronto(B);
// enquanto o Beto está jogando, a Ana (já fora) não consegue excluir
await abrirLista(A);
check((await codigos(A)).includes(code), 'a sala aparece na lista da Ana com a lixeira 🗑️', await A.evaluate(() => document.querySelector('[data-excluir]')?.textContent));
check(!(await A.evaluate(() => !!document.querySelector('[data-copiar]'))), 'o papelzinho que não funcionava saiu');
// clique sem querer: primeira pergunta → Não
await A.click(`[data-excluir="${code}"]`); const t1 = await A.textContent('.confirmaCaixa');
await A.click('.confirmaCaixa [data-r="0"]');
check(/Tem certeza que quer excluir/.test(t1) && (await codigos(A)).includes(code), '1ª pergunta "Tem certeza?" e Não cancela', t1);
// Sim na primeira, Cancelar na segunda
await A.click(`[data-excluir="${code}"]`); await A.click('.confirmaCaixa [data-r="1"]'); const t2 = await A.textContent('.confirmaCaixa');
await A.click('.confirmaCaixa [data-r="0"]');
check(/Posso excluir mesmo/.test(t2) && (await codigos(A)).includes(code), '2ª pergunta "Posso excluir mesmo?" e Cancelar também não apaga', t2);
// Sim e Sim, mas o Beto está jogando: recusa
await A.click(`[data-excluir="${code}"]`); await A.click('.confirmaCaixa [data-r="1"]'); await A.click('.confirmaCaixa [data-r="1"]');
await A.waitForFunction(() => !/Excluindo/.test(document.getElementById('salasLista').textContent));
check(/Tem gente jogando/.test(await A.textContent('#salasLista')), 'com gente jogando, não deixa excluir', await A.textContent('#salasLista'));
// Beto sai; ele tira a sala só da lista dele
await abrirLista(B);
await B.click(`[data-excluir="${code}"]`); const tb = await B.textContent('.confirmaCaixa'); await B.click('.confirmaCaixa [data-r="1"]'); await B.click('.confirmaCaixa [data-r="1"]');
await B.waitForFunction(() => !/Excluindo|Carregando/.test(document.getElementById('salasLista').textContent));
check(/Tirar a sala/.test(tb) && !(await codigos(B)).includes(code), 'para quem não é líder: só tira da própria lista', tb);
await abrirLista(A);
check((await codigos(A)).includes(code), 'a sala continua para a Ana');
// Ana exclui de verdade (Sim, Sim)
await A.click(`[data-excluir="${code}"]`); await A.click('.confirmaCaixa [data-r="1"]'); await A.click('.confirmaCaixa [data-r="1"]');
await A.waitForFunction(() => !/Excluindo|Carregando/.test(document.getElementById('salasLista').textContent));
check(!(await codigos(A)).includes(code), 'Sim + Sim: a Ana exclui a sala');
await abrirLista(A);
check(!(await codigos(A)).includes(code), 'recarregando, a sala não volta (nem pela cópia guardada no navegador)');
// o código não serve mais
await A.fill('#codigo', code); await A.click('#btEntrar'); await A.waitForTimeout(3000);
const st = await A.evaluate(() => ({ menu: !document.getElementById('menu').hidden, msg: document.getElementById('srvStatus').textContent }));
check(st.menu && /n[ãa]o existe|n[ãa]o encontr|exclu/i.test(st.msg), 'entrar com o código da sala excluída não funciona', st.msg);
check(!erros.length, 'sem erros de JS', erros.join(' | '));
console.log(`excluir sala: ${ok} ok, ${falhas} falha(s)`); await browser.close();
