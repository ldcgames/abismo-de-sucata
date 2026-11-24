// Modo celular: joga só com toques (joystick, arrastar para olhar e botões) num celular deitado (844×390).
// Também confere que no computador nada disso aparece.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.env.BASE || 'http://localhost:8090/';
const FOTOS = process.env.FOTOS || '';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let ok = 0, falhas = 0; const check = (c, nome, extra = '') => { if (c) { ok++; console.log('  ✔', nome, extra); } else { falhas++; console.log('  ✘', nome, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const erros = [];

// ---------- computador: igual a antes
{
  const p = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  p.on('pageerror', (e) => erros.push('PC: ' + e.message));
  await p.goto(base + '?auto=solo&q=0&semdesenho');
  await p.waitForFunction(() => window.__jogo && __jogo.t > 0, null, { timeout: 150000 });
  const pc = await p.evaluate(() => ({ cls: document.documentElement.className, cel: !!__jogo.cel, vis: !!document.querySelector('#cel')?.offsetParent }));
  check(!pc.cls.includes('celular') && !pc.cel && !pc.vis, 'no computador: sem botões de toque, tudo como antes', JSON.stringify(pc));
  await p.close();
}

// ---------- celular
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage(); p.on('pageerror', (e) => erros.push(e.message));
const foto = async (nome) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/${nome}.png` }); };
await p.goto(base + '?auto=solo&q=0');
await p.waitForFunction(() => window.__jogo && __jogo.t > 0 && __jogo.cel, null, { timeout: 180000 });
await p.evaluate(() => {
  const ev = (tipo, alvo, id, x, y) => alvo.dispatchEvent(new PointerEvent('pointer' + tipo, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
  const cv = document.getElementById('gl');
  window.__dedo = { baixo: (id, x, y) => ev('down', cv, id, x, y), mover: (id, x, y) => ev('move', cv, id, x, y), cima: (id, x, y) => ev('up', cv, id, x, y) };
  // toca num botão (acha pelo data-k ou pelo texto) e segura ms
  window.__tocar = async (achar, ms = 120) => {
    const b = [...document.querySelectorAll('#cel button, #celArmas button, #painelFechar')].find((x) => x.offsetParent && (x.dataset.k === achar || x.dataset.cel === achar || x.textContent.includes(achar)));
    if (!b) return false;
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
    if (b.id === 'painelFechar') b.click();
    await new Promise((r) => setTimeout(r, ms));
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
    return true;
  };
  window.__botoes = () => [...document.querySelectorAll('#celAcoes button, #celCtx button')].filter((b) => b.offsetParent).map((b) => b.dataset.k + ':' + b.textContent.trim());
});
const botoes = () => p.evaluate(() => __botoes());
const tocar = (a, ms) => p.evaluate(([a, ms]) => __tocar(a, ms), [a, ms]);
await sleep(1500);
await foto('cel_1_a_pe');
const est = await p.evaluate(() => ({ cls: document.documentElement.className, grafico: __jogo.pausa.cfg.grafico, prompt: getComputedStyle(document.getElementById('prompt')).display, voz: getComputedStyle(document.getElementById('vozHud')).display }));
check(est.cls.includes('celular'), 'celular detectado sozinho (tela de toque)');
check((await botoes()).some((b) => b.startsWith('Space:') && b.includes('Pular')), 'botão Pular', JSON.stringify(await botoes()));

// joystick: dedo na esquerda, empurra para cima → anda para a frente
const pos0 = await p.evaluate(() => __jogo.me.pos.slice());
await p.evaluate(() => { __dedo.baixo(1, 130, 300); __dedo.mover(1, 130, 262); __jogo.step(30); }); // 1,5 s de jogo
const pos1 = await p.evaluate(() => __jogo.me.pos.slice());
const andou = Math.hypot(pos1[0] - pos0[0], pos1[2] - pos0[2]);
await p.evaluate(() => __dedo.mover(1, 130, 200)); await sleep(300);
const corre = await p.evaluate(() => __jogo.input.keys.has('ShiftLeft'));
await p.evaluate(() => __dedo.cima(1, 130, 200)); await sleep(200);
check(andou > 1.5, 'joystick anda', andou.toFixed(1) + ' m');
check(corre && !(await p.evaluate(() => __jogo.input.keys.has('ShiftLeft'))), 'empurrar até o fim corre; soltar para');

// olhar: arrastar na direita gira a câmera; dois dedos ao mesmo tempo (andar + olhar)
const yaw0 = await p.evaluate(() => __jogo.me.camYaw);
await p.evaluate(async () => { __dedo.baixo(1, 130, 300); __dedo.mover(1, 130, 270); __dedo.baixo(2, 600, 200); for (let i = 1; i <= 10; i++) { __dedo.mover(2, 600 + i * 12, 200); await new Promise((r) => setTimeout(r, 30)); } __dedo.cima(2, 720, 200); __dedo.cima(1, 130, 270); });
await sleep(300);
const yaw1 = await p.evaluate(() => __jogo.me.camYaw);
check(Math.abs(yaw1 - yaw0) > 0.3, 'arrastar à direita gira a câmera (andando junto)', (yaw1 - yaw0).toFixed(2) + ' rad');
check(await p.evaluate(() => !__jogo.input.mouse.down && !__jogo.input.mouse.clicked), 'tocar na tela não vira clique (não atira sem querer)');

// computador da estação: botão "usar" aparece sozinho
await p.evaluate(() => { const g = __jogo; const t = g.stations[g.slot].pontos(g.perfil.estacao).find((q) => q.id === 'terminal'); g.me.pos = t.pos.slice(); g.me.pos[1] = 1.55; g.me.vel = [0, 0, 0]; });
await sleep(600);
const bE = await botoes();
check(bE.some((b) => b.startsWith('KeyE:')), 'perto do computador aparece o botão de usar', JSON.stringify(bE));
await foto('cel_2_botao_usar');
await tocar('KeyE'); await sleep(500);
check(await p.evaluate(() => __jogo.ui.aberto === 'terminal'), 'tocar no botão abre o computador');
await foto('cel_3_computador');
await tocar('painelFechar'); await p.evaluate(() => __jogo.ui.fechar()); await sleep(300);

// barra de cima: menu e inventário
await tocar('Escape'); await sleep(300);
check(await p.evaluate(() => __jogo.pausa.aberto), '☰ abre o menu (pausa)');
await foto('cel_4_menu');
await p.evaluate(() => document.querySelector('[data-a="continuar"]')?.click()); await sleep(300);
check(await p.evaluate(() => !__jogo.pausa.aberto), 'Continuar fecha o menu');
await tocar('KeyI'); await sleep(300);
check(await p.evaluate(() => __jogo.ui.aberto === 'inventario'), '🎒 abre o inventário');
await p.evaluate(() => __jogo.ui.fechar()); await sleep(200);
// dinheiro: toque mostra os detalhes e missões
await p.evaluate(() => document.getElementById('topoEsq').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(200);
check(await p.evaluate(() => document.getElementById('hud').classList.contains('detalhes') && !!document.querySelector('#topoEsq .missoes').offsetParent), 'tocar no dinheiro abre mochila e missões');
await foto('cel_5_detalhes');
await p.evaluate(() => document.getElementById('topoEsq').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));

// pesca: na beira d'água aparece Pescar; segurar Puxar lança
const agua = await p.evaluate(async () => {
  const g = __jogo; const st = g.stations[g.slot];
  for (const z of [44, 46, 48, 50, 52, 54, 56]) { const w = st.toWorld(-1.9, 1.3, z); g.me.pos = [w[0], g.groundAt(w[0], w[2]), w[2]]; g.me.vel = [0, 0, 0]; g.step(1); if (g.pertoDaAgua()) return z; }
  return null;
});
await sleep(500);
check(agua && (await botoes()).some((b) => b.startsWith('KeyF:')), 'na beira d\'água aparece Pescar', JSON.stringify(await botoes()));
await tocar('KeyF'); await sleep(400);
check(await p.evaluate(() => __jogo.pesca.estado !== 'off'), 'tocar em Pescar pega a vara');
await tocar('Space', 900); await sleep(1200);
const pesca = await p.evaluate(() => __jogo.pesca.estado);
check(!['off', 'pronto'].includes(pesca), 'segurar Puxar e soltar lança a linha', pesca);
await foto('cel_6_pesca');
await tocar('KeyF'); await p.evaluate(() => { if (__jogo.pesca.estado !== 'off') __jogo.cancelarPesca(); }); await sleep(300);

// arma: dá uma pistola, escolhe pelo botão Armas e atira
await p.evaluate(() => { const g = __jogo, pl = g.net.room.players.get(g.slot); pl.profile.armas.pistola = true; pl.profile.municao.pistola = 12; g.perfil.armas.pistola = true; g.perfil.municao.pistola = 12; const t = g.stations[g.slot].toWorld(-1.9, 1.5, 10); g.me.pos = [t[0], 1.55, t[2]]; });
await sleep(400);
await tocar('Armas'); await sleep(200);
const vis = await p.evaluate(() => !document.getElementById('celArmas').hidden);
await tocar('Pistola'); await sleep(400);
check(vis && (await p.evaluate(() => __jogo.me.arma)) === 'pistola', 'Armas → Pistola equipa');
await foto('cel_7_arma');
const bal0 = await p.evaluate(() => __jogo.perfil.municao.pistola);
await tocar('MouseL', 150); await sleep(600);
check((await p.evaluate(() => __jogo.perfil.municao.pistola)) < bal0, 'botão Atirar atira', `${bal0} → ${await p.evaluate(() => __jogo.perfil.municao.pistola)}`);
await tocar('KeyH'); await sleep(300);
check(!(await p.evaluate(() => __jogo.me.arma)), 'Guardar tira a arma da mão');

// dança: roda abre e tocar numa fatia escolhe
await tocar('Roda'); await sleep(400);
const abriu = await p.evaluate(() => !!__jogo.roda);
await p.evaluate(() => { const f = document.querySelectorAll('#rodaEmotes .fatia')[2].getBoundingClientRect(); document.getElementById('rodaEmotes').dispatchEvent(new PointerEvent('pointerdown', { clientX: f.left + f.width / 2, clientY: f.top + f.height / 2, bubbles: true, cancelable: true })); });
await sleep(400);
check(abriu && (await p.evaluate(() => __jogo.me.emote?.i)) === 2, 'Dançar abre a roda e tocar na fatia dança', String(await p.evaluate(() => __jogo.me.emote?.i)));

// carro: compra, entra pelo botão e dirige com o joystick
await p.evaluate(async () => { const g = __jogo, pl = g.net.room.players.get(g.slot); pl.profile.dinheiro = 50000; await g.acao({ tipo: 'comprar', cat: 'veiculo', chave: 'carro' }); });
await sleep(800);
await p.evaluate(() => { const g = __jogo, e = g.veic[g.slot], a = e.pose.rot; g.me.pos = [e.pose.pos[0] + Math.cos(a) * 2.2, e.pose.pos[1], e.pose.pos[2] - Math.sin(a) * 2.2]; g.me.vel = [0, 0, 0]; });
await sleep(700);
check((await botoes()).some((b) => b.startsWith('KeyE:')), 'perto do carro aparece Entrar', JSON.stringify(await botoes()));
await tocar('KeyE'); await sleep(1800);
const noCarro = await p.evaluate(() => __jogo.me.modo);
const bCarro = await botoes();
check(noCarro === 'carro', 'tocar em Entrar entra no carro', noCarro);
check(['KeyE', 'Space', 'KeyT', 'KeyB', 'KeyL'].every((k) => bCarro.some((b) => b.startsWith(k + ':'))), 'no carro: Sair, Freio, Trancar, Buzina e Farol', JSON.stringify(bCarro));
const c0 = await p.evaluate(() => __jogo.veic[__jogo.slot].pose.pos.slice());
await p.evaluate(() => { __dedo.baixo(1, 130, 300); __dedo.mover(1, 130, 250); __jogo.step(45); }); await sleep(300);
await foto('cel_8_carro');
await p.evaluate(() => __dedo.cima(1, 130, 250));
const c1 = await p.evaluate(() => __jogo.veic[__jogo.slot].pose.pos.slice());
check(Math.hypot(c1[0] - c0[0], c1[2] - c0[2]) > 3, 'joystick dirige o carro', Math.hypot(c1[0] - c0[0], c1[2] - c0[2]).toFixed(1) + ' m');
await sleep(1200);
await tocar('KeyE'); await sleep(800);
check((await p.evaluate(() => __jogo.me.modo)) === 'terra', 'Sair desce do carro');

// submarino: entra pelo botão, desce com o guindaste e mergulha segurando Afundar
await p.evaluate(() => { const g = __jogo; const q = g.stations[g.slot].pontos(g.perfil.estacao).find((x) => x.id === 'berco'); g.me.pos = q.pos.slice(); g.me.pos[1] = 1.55; g.me.vel = [0, 0, 0]; });
await sleep(600); await tocar('KeyE'); await p.evaluate(() => __jogo.step(40)); await sleep(300);
check((await p.evaluate(() => __jogo.me.modo)) === 'sub', 'botão entra no submarino');
await tocar('KeyE'); // desce com o guindaste
await p.evaluate(() => { for (let i = 0; i < 400 && __jogo.crane.estado !== 'livre'; i++) __jogo.step(1); });
await sleep(600);
const bSub = await botoes();
check(['KeyC', 'KeyQ', 'KeyL', 'KeyR'].every((k) => bSub.some((b) => b.startsWith(k + ':'))), 'no submarino: Afundar, Subir, Faróis, Sonar…', JSON.stringify(bSub));
const y0 = await p.evaluate(() => __jogo.sub.pos[1]);
await p.evaluate(async () => { const b = document.querySelector('#celCtx [data-k="KeyC"]'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true, cancelable: true })); __jogo.step(40); b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true, cancelable: true })); });
const y1 = await p.evaluate(() => __jogo.sub.pos[1]);
check(y1 < y0 - 1, 'segurar Afundar mergulha', `${y0.toFixed(1)} → ${y1.toFixed(1)} m`);
await p.evaluate(() => { __dedo.baixo(1, 130, 300); __dedo.mover(1, 130, 250); __jogo.step(20); }); await sleep(500);
await foto('cel_9_sub');
await p.evaluate(() => __dedo.cima(1, 130, 250));

// celular em pé: pede para girar
await p.setViewportSize({ width: 390, height: 844 }); await sleep(400);
check(await p.evaluate(() => getComputedStyle(document.getElementById('celGire')).display !== 'none'), 'celular em pé: aviso para girar');
await foto('cel_10_gire');
check(!erros.length, 'sem erros de JS', erros.join(' | '));
console.log(`celular: ${ok} ok, ${falhas} falha(s)`); await browser.close();
