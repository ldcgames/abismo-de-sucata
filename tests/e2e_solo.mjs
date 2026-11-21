// E2E no Chrome real (SwiftShader). Dirige o jogo pelas mesmas rotas do jogador:
// teclas/mouse injetados no módulo de entrada, cliques reais em botões do DOM, servidor local de regras.
// A simulação é avançada com game.step() porque o renderizador por software roda a ~1-3 FPS.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://localhost:8090/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 650 } });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
let ok = 0, falhas = 0;
const check = (cond, nome, extra = '') => { if (cond) { ok++; console.log('  ✔', nome, extra); } else { falhas++; console.log('  ✘', nome, extra); } };
const ev = (f, a) => page.evaluate(f, a);
const sleep = (ms) => page.waitForTimeout(ms);

await page.goto(base + '?q=0&semdesenho');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '?q=0&semdesenho&auto=solo');
await page.waitForFunction(() => window.__jogo?.me && window.__jogo.t > 0, null, { timeout: 120000 });
console.log('Carregou.');
check(erros.length === 0, 'sem erros de JS ao carregar', erros.join(' | '));

// ---------- andar
const p0 = await ev(() => __jogo.me.pos.slice());
await ev(() => { const g = __jogo; g.me.camYaw = g.me.yaw; g.input.keys.add('KeyW'); g.step(30); g.input.keys.delete('KeyW'); g.step(5); });
const p1 = await ev(() => __jogo.me.pos.slice());
check(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 2, 'W move o personagem', `${Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1)} m`);

// ---------- terminal: compra real pelo botão
await ev(() => { const g = __jogo; const t = g.stations[g.slot].pontos(g.perfil.estacao).find((q) => q.id === 'terminal'); g.me.pos = t.pos.slice(); g.me.pos[1] = 1.55; g.step(2); g.input.press('KeyE'); g.step(1); });
check(await ev(() => __jogo.ui.aberto === 'terminal'), 'E no terminal abre o painel');
await page.click('#abas button[data-aba="estacao"]');
const dinAntes = await ev(() => __jogo.perfil.dinheiro);
const bt = page.locator('#painelCorpo .card', { hasText: 'Decoração' }).locator('button');
await bt.click();
await sleep(300);
check(await ev(() => __jogo.perfil.estacao.decoracao === true), 'botão Construir aplica a compra (decoração)');
check(await ev(() => __jogo.perfil.dinheiro) === dinAntes - 120, 'saldo debitado exatamente', `${dinAntes} → ${await ev(() => __jogo.perfil.dinheiro)}`);
await page.keyboard.press('Escape');
await sleep(200);

// ---------- pesca completa
const pescar = async () => {
  await ev(async () => { const g = __jogo; const st = g.stations[g.slot]; // anda em passos curtos (a sala recusa teletransporte), contornando o berço
    for (const wp of [[-1.9, 1.5, 10], [-1.9, 1.3, 50], [0, 1.3, 56]]) { const alvo = st.toWorld(...wp);
    for (let k = 0; k < 200; k++) { const d = [alvo[0] - g.me.pos[0], alvo[2] - g.me.pos[2]]; const L = Math.hypot(d[0], d[1]); if (L < 0.05) break; const s = Math.min(2.5, L) / L; g.me.pos = [g.me.pos[0] + d[0] * s, alvo[1], g.me.pos[2] + d[1] * s]; g.me.vel = [0, 0, 0]; g.step(3); await new Promise((r) => setTimeout(r, 15)); } }
    g.me.modo = 'terra'; g.me.camYaw = st.yaw; g.me.camPitch = 0; g.step(2); if (g.pesca.estado === 'off') { g.input.press('KeyF'); g.step(1); } });
  await ev(() => { const g = __jogo; g.input.mouse.down = true; g.input.mouse.clicked = true; g.step(1); g.input.mouse.down = true; g.step(12); g.input.mouse.down = false; g.step(25); });
  for (let i = 0; i < 40; i++) { const e = await ev(() => __jogo.pesca.estado); if (e === 'esperando' || e === 'mordida') break; await ev(() => __jogo.step(2)); await sleep(100); }
  for (let i = 0; i < 120; i++) { const e = await ev(() => { __jogo.step(1); return __jogo.pesca.estado; }); if (e === 'mordida') break; if (e === 'pronto') return 'nada'; await sleep(100); }
  if (await ev(() => __jogo.pesca.estado) !== 'mordida') return 'sem_mordida';
  await ev(() => { const g = __jogo; g.input.mouse.clicked = true; g.step(1); });
  // briga: segura quando a tensão está baixa, solta quando sobe
  for (let i = 0; i < 2000; i++) {
    const e = await ev(() => { const g = __jogo; const P = g.pesca; if (P.estado !== 'brigando') return P.estado; g.input.mouse.down = P.tensao < 70; g.step(1); return P.estado; });
    if (e !== 'brigando') break;
    if (i % 20 === 0) await sleep(30);
  }
  await ev(() => { __jogo.input.mouse.down = false; });
  for (let i = 0; i < 80; i++) { const e = await ev(() => __jogo.pesca.estado); if (e !== 'resolvendo') break; await sleep(150); await ev(() => __jogo.step(1)); }
  return await ev(() => (__jogo.perfil.mao ? 'peixe' : 'escapou'));
};
let res = null;
for (let tent = 0; tent < 6 && res !== 'peixe'; tent++) { res = await pescar(); console.log('    tentativa de pesca:', res); }
check(res === 'peixe', 'pesca real: lançar → mordida → briga → peixe na mão');
const mao = await ev(() => __jogo.perfil.mao);
if (mao) {
  console.log('    pescou', mao.esp, mao.cm, 'cm');
  // aquário nano: só aceita ≤ 12 cm
  await ev(() => { const g = __jogo; if (g.pesca.estado !== 'off') g.cancelarPesca(); const q = g.stations[g.slot].pontos(g.perfil.estacao).find((x) => x.id === 'aquario'); g.me.pos = q.pos.slice(); g.me.pos[1] = 1.55; g.step(2); g.input.press('KeyE'); g.step(1); });
  await sleep(400);
  const aq = await ev(() => __jogo.perfil.aquario.peixes.length);
  if (mao.cm <= 12) check(aq === 1, 'peixe pequeno entra no aquário nano [1/1]');
  else check(aq === 0 && (await ev(() => !!__jogo.perfil.mao)), 'peixe maior que 12 cm é recusado pelo aquário nano');
  if (await ev(() => !!__jogo.perfil.mao)) {
    await ev(() => { __jogo.input.press('KeyX'); __jogo.step(1); });
    await sleep(400);
    check(await ev(() => __jogo.perfil.mao === null), 'X solta o peixe (sai do inventário)');
  }
}

// ---------- submarino: guindaste desce, respingo, mergulho, coleta, volta
await ev(() => { const g = __jogo; const q = g.stations[g.slot].pontos(g.perfil.estacao).find((x) => x.id === 'berco'); g.me.pos = q.pos.slice(); g.me.pos[1] = 1.55; g.step(2); g.input.press('KeyE'); g.step(1); g.step(20); });
check(await ev(() => __jogo.me.modo === 'sub'), 'E no berço entra no submarino (animação de embarque)');
await ev(() => { const g = __jogo; g.input.press('KeyE'); g.step(1); });
check(await ev(() => __jogo.crane.estado === 'descendo'), 'E inicia a descida pelo guindaste');
const pico = await ev(() => { const g = __jogo; let maxY = -99, minDist = 99, splash = 0; const st = g.stations[g.slot];
  for (let i = 0; i < 200; i++) { const n0 = g.particles.list.length; g.step(1); maxY = Math.max(maxY, g.sub.pos[1]); const l = st.toLocal(g.sub.pos); if (g.sub.pos[1] < 3) minDist = Math.min(minDist, Math.abs(l[0])); if (g.particles.list.length - n0 > 60) splash++; if (g.crane.estado === 'livre') break; }
  return { maxY, minDist, splash, estado: g.crane.estado, y: g.sub.pos[1] }; });
check(pico.estado === 'livre', 'guindaste termina com o sub na água', JSON.stringify(pico));
check(pico.maxY > 6, 'sub é içado acima do cais antes de girar a lança');
check(pico.minDist > 3.5, 'sub desce ao lado do cais (sem atravessar as tábuas)', `distância lateral ${pico.minDist.toFixed(2)} m`);
check(pico.splash > 0, 'respingo de água ao tocar a superfície (partículas emitidas)');
await ev(() => { const g = __jogo; g.input.keys.add('ControlLeft'); g.step(80); g.input.keys.delete('ControlLeft'); g.step(5); });
check(await ev(() => __jogo.sub.pos[1] < -3), 'Ctrl mergulha', `${(await ev(() => __jogo.sub.pos[1])).toFixed(1)} m`);
// física: não atravessa o fundo
const fundo = await ev(() => { const g = __jogo; g.input.keys.add('ControlLeft'); g.step(400); g.input.keys.delete('ControlLeft'); return { y: g.sub.pos[1], sdf: 0 }; });
const sdf = await ev(() => import('/shared/world.js').then((w) => w.navSDF(...__jogo.sub.pos)));
check(sdf > 0, 'descer com força não atravessa o fundo do lago', `y=${fundo.y.toFixed(1)} sdf=${sdf.toFixed(2)}`);
// coleta: leva o sub perto de um item raso
const item = await ev(() => { const g = __jogo; let best = null; for (const n of g.items.values()) { if (n.pos[1] > -60 && n.pos[1] < -4 && (!best || n.pos[1] > best.pos[1])) best = n; } g.sub.pos = [best.pos[0] + 1.5, best.pos[1] + 1.4, best.pos[2]]; g.sub.vel = [0, 0, 0]; g.step(1); return { id: best.item.id, tipo: best.item.tipo }; });
await ev(() => { __jogo.input.press('KeyE'); __jogo.step(1); });
await sleep(1200);
await ev(() => __jogo.step(5));
check(await ev((id) => __jogo.perfil.carga.length === 1 && !__jogo.items.has(id), item.id), 'E com a garra recolhe a sucata (sai do mundo, entra na carga)', item.tipo);
// volta ao cais e içamento
await ev(() => { const g = __jogo; g.sub.pos = [g.launchPos[0] + 3, -0.45, g.launchPos[2]]; g.sub.vel = [0, 0, 0]; g.step(2); g.input.press('KeyE'); g.step(1); });
check(await ev(() => __jogo.crane.estado === 'subindo'), 'perto do cais, E prende o gancho e iça');
const sobe = await ev(() => { const g = __jogo; let drip = 0; for (let i = 0; i < 220; i++) { g.step(1); if (g.sub.pos[1] > 0.5 && g.particles.list.some((q) => q.kind === 'gota')) drip++; if (g.crane.estado === 'berco') break; } return { estado: g.crane.estado, drip }; });
check(sobe.estado === 'berco', 'guindaste devolve o sub ao berço');
check(sobe.drip > 0, 'água escorre do casco ao ser içado');
// vender a sucata
await ev(() => { const g = __jogo; g.input.press('KeyQ'); g.step(1); const t = g.stations[g.slot].pontos(g.perfil.estacao).find((q) => q.id === 'terminal'); g.me.pos = t.pos.slice(); g.me.pos[1] = 1.55; g.step(2); g.input.press('KeyE'); g.step(1); });
await page.click('#abas button[data-aba="vender"]');
const d0 = await ev(() => __jogo.perfil.dinheiro);
await page.locator('#painelCorpo .item', { hasNotText: '🐟' }).locator('button', { hasText: 'Vender' }).first().click();
await sleep(300);
const d1 = await ev(() => __jogo.perfil.dinheiro);
check(d1 > d0 && (await ev(() => __jogo.perfil.carga.length)) === 0, 'vender retira 1 item e soma o valor', `${d0} → ${d1}`);
// mochila com até 5 peixes, aparecendo na aba "Vender" com Pegar/Vender
const moc = await ev(async () => {
  const g = __jogo; if (g.perfil.mao) await g.acao({ tipo: 'peixe_vender' });
  for (let k = 0; k < 6; k++) { g.perfil.mao = { uid: 'm' + k, esp: 'lambari', cm: 9 + k }; await g.acao({ tipo: 'mochila_guardar' }); }
  g.perfil.mao = null;
  return { n: g.perfil.mochila.length, aba: document.querySelector('#abas button[data-aba="vender"]')?.textContent };
});
await page.click('#abas button[data-aba="vender"]');
const linhas = await page.locator('#painelCorpo .item', { hasText: 'Lambari' }).count();
const m0 = await ev(() => __jogo.perfil.dinheiro);
await page.locator('#painelCorpo .item', { hasText: 'Lambari' }).first().locator('button', { hasText: 'Vender' }).click();
await sleep(300);
const mv = await ev(() => ({ n: __jogo.perfil.mochila.length, d: __jogo.perfil.dinheiro }));
check(moc.n === 5 && moc.aba === 'Vender' && linhas >= 5 && mv.n === 4 && mv.d > m0, 'mochila guarda até 5 peixes e a aba "Vender" vende peixe da mochila', JSON.stringify({ moc, linhas, mv, m0 }));
await page.keyboard.press('Escape');
// salvamento: recarrega a página e confere
await sleep(300);
await page.goto(base + '?q=0&semdesenho&auto=solo');
await page.waitForFunction(() => window.__jogo?.me && window.__jogo.t > 0, null, { timeout: 120000 });
check((await ev(() => __jogo.perfil.dinheiro)) === mv.d && (await ev(() => __jogo.perfil.estacao.decoracao)), 'progresso persiste após recarregar (localStorage)');
await ev(() => { __jogo.input.press('KeyM'); __jogo.step(1); });
check(await ev(() => __jogo.ui.aberto === 'mapa' && !!document.getElementById('mapaCv')), 'M abre o mapa do lago');
await ev(() => { __jogo.input.press('KeyM'); __jogo.step(1); });
// ---------- v0.4: roda de emotes, câmera de ombro, escorregar na encosta, parede invisível, bolsa inicial
check(await ev(() => __jogo.perfil.baloes >= 1), 'jogador começa com bolsa de tinta', await ev(() => __jogo.perfil.baloes));
const roda = await ev(() => { const g = __jogo; g.me.emote = null; g.input.wheel = 1; g.step(1); const aberta = !document.getElementById('rodaEmotes').hidden; g.input.wheel = 1; g.step(1); const sel = g.roda?.sel; g.input.mouse.clicked = true; g.step(1); return { aberta, sel, emote: g.me.emote?.i, fechou: document.getElementById('rodaEmotes').hidden }; });
check(roda.aberta && roda.fechou && roda.emote === roda.sel, 'scroll abre a roda de emotes e o clique faz o escolhido', JSON.stringify(roda));
const ombro = await ev(() => { const g = __jogo; g.me.emote = null; g.perfil.mao = { uid: 'tt', esp: 'lambari', cm: 10 }; g.me.camYaw = g.me.yaw; g.me.vYaw = g.me.camYaw; g.me.camPitch = 0; g.me.vPitch = 0; g.step(30); const c0 = g.cam.pos.slice(); g.me.mirando = true; g.step(40); const c1 = g.cam.pos.slice(); g.me.mirando = false; g.perfil.mao = null; g.step(5);
  const right = [-Math.cos(g.me.camYaw), Math.sin(g.me.camYaw)]; return (c1[0] - c0[0]) * right[0] + (c1[2] - c0[2]) * right[1]; });
check(ombro > 0.6, 'G (mira) leva a câmera para o lado do ombro', `${ombro.toFixed(2)} m para a direita`);
// ---------- v0.5: lixo da margem, loja de armas, tiro, estátua
const cata = await ev(async () => {
  const g = __jogo; g.roda = null; g.me.emote = null; g.me.escorrega = null; g.me.voo = null;
  let alvo = null; for (const n of g.items.values()) if (n.item.tipo === 'garrafa_pet' || n.item.tipo === 'latinha') { alvo = n; break; }
  const s0 = g.perfil.saco.length;
  // anda até o lixo em passos curtos
  for (let k = 0; k < 900; k++) { const d = [alvo.pos[0] + 1 - g.me.pos[0], alvo.pos[2] - g.me.pos[2]]; const L = Math.hypot(d[0], d[1]); if (L < 0.3) break; const st = Math.min(1.2, L) / L; g.me.pos = [g.me.pos[0] + d[0] * st, g.groundAt(g.me.pos[0] + d[0] * st, g.me.pos[2] + d[1] * st) + 0.05, g.me.pos[2] + d[1] * st]; g.me.vel = [0, 0, 0]; g.me.escorrega = null; g.step(5); await new Promise((r) => setTimeout(r, 25)); }
  g.step(5); g.input.press('KeyE'); g.step(1);
  const anim = g.me.acao?.tipo;
  for (let k = 0; k < 30; k++) { await new Promise((r) => setTimeout(r, 60)); g.step(2); }
  return { anim, s0, s1: g.perfil.saco.length, some: !g.items.has(alvo.item.id), av: [...document.querySelectorAll('#avisos *')].map((x) => x.textContent).slice(-2), d: Math.hypot(alvo.pos[0] - g.me.pos[0], alvo.pos[2] - g.me.pos[2]) };
});
check(cata.anim === 'pegar' && cata.s1 === cata.s0 + 1 && cata.some, 'E na margem: abaixa, cata o lixo e vai para o saco', JSON.stringify(cata));
const armas = await ev(async () => {
  const g = __jogo; const st = g.stations[g.slot];
  for (const wp of [[-1.9, 1.5, 10], [10, 1.6, -6], [14.4, 1.7, -3.6]]) { const a = st.toWorld(...wp); for (let k = 0; k < 200; k++) { const d = [a[0] - g.me.pos[0], a[2] - g.me.pos[2]]; const L = Math.hypot(d[0], d[1]); if (L < 0.05) break; const s = Math.min(2.5, L) / L; g.me.pos = [g.me.pos[0] + d[0] * s, a[1], g.me.pos[2] + d[1] * s]; g.me.vel = [0, 0, 0]; g.step(3); await new Promise((r) => setTimeout(r, 10)); } }
  g.perfil.dinheiro = 5000;
  g.step(3); g.input.press('KeyE'); g.step(1);
  const painel = g.ui.aberto;
  const bt = [...document.querySelectorAll('#painelCorpo [data-acao]')].find((b) => /Comprar arma/.test(b.textContent));
  bt?.click(); await new Promise((r) => setTimeout(r, 400));
  g.ui.fechar(); g.step(2);
  const tem = !!g.perfil.armas.pistola, bal0 = g.perfil.municao.pistola;
  g.input.press('Digit1'); g.step(3);
  const segura = g.me.segura, naMao = !!g.myChar._arma;
  g.input.mouse.clicked = true; g.input.mouse.down = true; g.step(1); g.input.mouse.down = false;
  await new Promise((r) => setTimeout(r, 400)); g.step(2);
  const bal1 = g.perfil.municao.pistola;
  g.input.press('KeyH'); g.step(2);
  return { painel, tem, segura, naMao, bal0, bal1, dinheiro: g.perfil.dinheiro, guardou: !g.me.arma };
});
check(armas.painel === 'armas', 'E no computador da barraca abre a loja de armas');
check(armas.tem && armas.dinheiro === 5000 - 900, 'comprar a pistola pelo botão', JSON.stringify(armas));
check(armas.segura === 'arma' && armas.naMao, 'tecla 1 equipa a pistola (modelo na mão)');
check(armas.bal1 === armas.bal0 - 1, 'clique atira (gasta 1 bala)', `${armas.bal0} → ${armas.bal1}`);
check(armas.guardou, 'H guarda a arma');
const est = await ev(async () => {
  const w = await import('/shared/world.js'); const g = __jogo;
  const al = [w.ESTATUA.x - 6, 0, w.ESTATUA.z + 2];
  for (let k = 0; k < 900; k++) { const d = [al[0] - g.me.pos[0], al[2] - g.me.pos[2]]; const L = Math.hypot(d[0], d[1]); if (L < 0.3) break; const st = Math.min(1.2, L) / L; const nx = g.me.pos[0] + d[0] * st, nz = g.me.pos[2] + d[1] * st; g.me.pos = [nx, g.groundAt(nx, nz) + 0.05, nz]; g.me.vel = [0, 0, 0]; g.me.escorrega = null; g.step(5); await new Promise((r) => setTimeout(r, 25)); }
  g.perfil.deposito.push({ uid: 'e2e_t', tipo: 'estatua_tenis_e' });
  g.input.press('KeyE'); g.step(1); await new Promise((r) => setTimeout(r, 300)); g.step(3);
  return { col: g.perfil.estatua.colocadas.slice(), mult: g.statue.placaTxt, vis: g.statue.pecas.tenis_e.n.visible };
});
check(est.col.includes('tenis_e') && est.vis, 'E na estátua coloca a peça (aparece enferrujada)', JSON.stringify(est));
check(/×1\.6/.test(est.mult), 'placa mostra o multiplicador novo', est.mult);
const voo = await ev(async () => {
  const g = __jogo; const p0 = g.me.pos.slice();
  g.onEvents([{ t: 'atordoado', alvo: g.slot, por: 'L', ms: 7000, arma: 'bazuca', empurrao: [16 * Math.sin(g.me.yaw + Math.PI), 11, 16 * Math.cos(g.me.yaw + Math.PI)] }]);
  let maxY = 0; for (let i = 0; i < 120; i++) { g.step(1); maxY = Math.max(maxY, g.me.pos[1] - p0[1]); }
  const txt = document.querySelector('#acertado .t').textContent;
  const dist = Math.hypot(g.me.pos[0] - p0[0], g.me.pos[2] - p0[2]);
  g.me.stunUntil = 0; g.onEvents([{ t: 'fim_atordoado', alvo: g.slot }]);
  const p1 = g.me.pos.slice();
  g.onEvents([{ t: 'atordoado', alvo: g.slot, por: 'L', ms: 2000, arma: 'pistola', empurrao: [3, 2.5, 0] }]);
  for (let i = 0; i < 80; i++) g.step(1);
  const distP = Math.hypot(g.me.pos[0] - p1[0], g.me.pos[2] - p1[2]);
  g.me.stunUntil = 0; g.onEvents([{ t: 'fim_atordoado', alvo: g.slot }]);
  return { dist, maxY, txt, distP };
});
check(voo.dist > 12 && voo.maxY > 1.5, 'bazuca joga o jogador longe pelo ar', JSON.stringify(voo));
check(voo.distP > 0.3 && voo.distP < 3, 'pistola empurra só um pouquinho', voo.distP.toFixed(2) + ' m');
check(/VOOU LONGE/.test(voo.txt), 'aviso da bazuca na tela', voo.txt);
const esc = await ev(async () => { const w = await import('/shared/world.js'); const g = __jogo; const d = g.stations[g.slot].st.dir; const R = w.SLIDE_R + 1.5; g.me.pos = [d[0] * R + 25 * d[1], w.terrainHeight(d[0] * R + 25 * d[1], d[1] * R - 25 * d[0]) + 0.1, d[1] * R - 25 * d[0]]; g.me.vel = [0, 0, 0];
  const r0 = Math.hypot(g.me.pos[0], g.me.pos[2]); g.step(3); const anim = g.animNome(); g.input.keys.add('KeyW'); g.step(60); g.input.keys.delete('KeyW'); const r1 = Math.hypot(g.me.pos[0], g.me.pos[2]);
  // parede: mesmo forçando a posição além do limite, não passa
  g.me.escorrega = null; g.me.pos = [d[0] * (w.PLAY_R - 0.5), 40, d[1] * (w.PLAY_R - 0.5)]; for (let i = 0; i < 30; i++) { g.me.vel = [d[0] * 6, 0, d[1] * 6]; g.me.escorrega = null; g.step(1); }
  return { r0, r1, anim, rMax: Math.hypot(g.me.pos[0], g.me.pos[2]), PLAY_R: w.PLAY_R, SLIDE_R: w.SLIDE_R }; });
check(esc.anim === 'escorrega' && esc.r1 < esc.SLIDE_R - 10, 'subir a encosta faz escorregar sentado de volta', JSON.stringify(esc));
check(esc.rMax < esc.PLAY_R, 'não passa do limite do mapa (parede de segurança)', esc.rMax.toFixed(1));
// ---------- v0.7: submarino bate no cais e nas pedras; câmera nunca dentro da rocha
const cais = await ev(() => {
  const g = __jogo; const st = g.stations[g.slot];
  g.me.modo = 'sub'; g.crane.estado = 'livre';
  const p0 = st.toWorld(6, -1.2, 40); g.sub.pos = p0; g.sub.vel = [0, 0, 0];
  const ex = st.toWorld(-1, 0, 40); const dir = [ex[0] - p0[0], ex[2] - p0[2]]; const L = Math.hypot(...dir);
  g.sub.yaw = Math.atan2(dir[0], dir[1]);
  let minX = 99;
  for (let i = 0; i < 160; i++) { g.sub.vel[0] = dir[0] / L * 4; g.sub.vel[2] = dir[1] / L * 4; g.step(1); minX = Math.min(minX, Math.abs(st.toLocal(g.sub.pos)[0])); }
  return { minX, cr: g.crane.estado, modo: g.me.modo, loc: st.toLocal(g.sub.pos), stun: g.me.stunUntil - performance.now(), ui: g.ui.aberto };
});
check(cais.minX > 2.6 && cais.minX < 5.9, 'submarino encosta (de bico) e não atravessa o cais', `menor distância do eixo do cais: ${cais.minX.toFixed(2)} m ` + JSON.stringify(cais));
const camRocha = await ev(async () => {
  const w = await import('/shared/world.js'); const g = __jogo;
  let pior = 99;
  for (let a = 0; a < 6.28; a += 0.4) {
    g.sub.pos = [w.SHAFT_C.x + 30, -120, w.SHAFT_C.z]; g.sub.vel = [0, 0, 0];
    g.me.camYaw = g.me.vYaw = a; g.me.camPitch = g.me.vPitch = -0.3; g.step(3);
    pior = Math.min(pior, w.navSDF(...g.cam.pos));
  }
  g.me.modo = 'terra'; return pior;
});
check(camRocha > 0, 'câmera do submarino nunca entra na rocha (perto da parede da fenda)', camRocha.toFixed(2));
check(erros.length === 0, 'nenhum erro de JS durante o teste', erros.slice(0, 3).join(' | '));
console.log(`\nE2E solo: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
