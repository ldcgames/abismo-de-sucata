// E2E multiplayer real: dois navegadores independentes conectados ao servidor WebSocket.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const base = process.argv[2] || 'http://localhost:8090/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctxA = await browser.newContext({ viewport: { width: 900, height: 560 }, permissions: ['microphone'] });
const ctxB = await browser.newContext({ viewport: { width: 900, height: 560 }, permissions: ['microphone'] });
const A = await ctxA.newPage(), B = await ctxB.newPage();
const erros = [];
for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', (e) => erros.push(n + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(n + ': ' + m.text()); }); }
let ok = 0, falhas = 0;
const check = (c, nome, extra = '') => { if (c) { ok++; console.log('  ✔', nome, extra); } else { falhas++; console.log('  ✘', nome, extra); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pronto = (p) => p.waitForFunction(() => window.__jogo?.me && window.__jogo.t > 0, null, { timeout: 150000 });

await A.goto(base + '?q=0&semdesenho');
await A.fill('#nome', 'Ana');
await A.waitForFunction(() => !document.getElementById('btSalas').disabled && /online/.test(document.getElementById('srvStatus').textContent), null, { timeout: 10000 });
await A.click('#btSalas');
await A.waitForFunction(() => !/Carregando/.test(document.getElementById('salasLista').textContent), null, { timeout: 10000 });
check(/ainda não tem salas/.test(await A.textContent('#salasLista')), 'lista de salas vazia para jogador novo');
await A.click('#btCriar');
await pronto(A);
const code = await A.evaluate(() => __jogo.net.code);
check(/^[A-Z2-9]{6}$/.test(code), 'A criou a sala no servidor', code);
await B.goto(base + `?q=0&semdesenho&sala=${code}`);
await B.fill('#nome', 'Beto');
await B.waitForFunction((c) => document.getElementById('codigo').value === c, code, { timeout: 10000 });
check(await B.inputValue('#codigo') === code, 'link de convite abre "minhas salas" com o código preenchido');
// mesma cor da Ana (laranja): o servidor recusa com aviso
await B.click('#btEntrar');
await B.waitForFunction(() => !document.getElementById('menu').hidden && /cor/.test(document.getElementById('srvStatus').textContent), null, { timeout: 20000 });
check(/Alguém já está com essa cor/.test(await B.textContent('#srvStatus')), 'cor repetida: "Alguém já está com essa cor"', await B.textContent('#srvStatus'));
await B.click('#cores button:nth-child(2)');
await B.click('#btEntrar');
await pronto(B);
const [sa, sb] = [await A.evaluate(() => __jogo.slot), await B.evaluate(() => __jogo.slot)];
check(sa !== sb, 'cada jogador ocupa uma estação diferente', `${sa} / ${sb}`);
await sleep(1500);
check(await A.evaluate(() => Object.values(__jogo.remotos).some((r) => r.nome === 'Beto')), 'A vê o Beto');
check(await B.evaluate(() => Object.values(__jogo.remotos).some((r) => r.nome === 'Ana')), 'B vê a Ana');
const ativas = await A.evaluate(() => Object.entries(__jogo.stations).filter(([, s]) => s.ativa).map(([k]) => k).sort().join(','));
check(ativas === 'L,N', 'só aparecem as bases de quem está na sala (vizinhas)', ativas);
const link = await A.evaluate(() => { __jogo.ui.abrir('sala'); return document.querySelector('#painelCorpo input')?.value; });
check(link && link.includes('?sala=' + code), 'painel da sala mostra o link de convite', link);
await A.evaluate(() => __jogo.ui.fechar());

// A pesca de verdade no cais (servidor sorteia)
const pescar = async (P) => {
  await P.evaluate(() => { const g = __jogo; const st = g.stations[g.slot]; g.me.vel = [0, 0, 0]; g.me.camYaw = st.yaw; g.me.camPitch = 0; g.step(2); if (g.pesca.estado === 'off') { g.input.press('KeyF'); g.step(1); } g.input.mouse.down = true; g.input.mouse.clicked = true; g.step(1); g.input.mouse.down = true; g.step(12); g.input.mouse.down = false; g.step(25); });
  for (let i = 0; i < 160; i++) { const e = await P.evaluate(() => { __jogo.step(1); return __jogo.pesca.estado; }); if (e === 'mordida') break; if (e === 'pronto' && i > 30) return 'nada'; await sleep(100); }
  { const est = await P.evaluate(() => __jogo.pesca.estado + '|' + __jogo.prompt?.textContent); if (!est.startsWith('mordida')) return 'sem:' + est; }
  await P.evaluate(() => { __jogo.input.mouse.clicked = true; __jogo.step(1); });
  for (let i = 0; i < 2000; i++) { const e = await P.evaluate(() => { const g = __jogo, Pp = g.pesca; if (Pp.estado !== 'brigando') return Pp.estado; g.input.mouse.down = Pp.tensao < 70; g.step(1); return Pp.estado; }); if (e !== 'brigando') break; if (i % 20 === 0) await sleep(30); }
  await P.evaluate(() => { __jogo.input.mouse.down = false; });
  for (let i = 0; i < 80; i++) { const e = await P.evaluate(() => __jogo.pesca.estado); if (e !== 'resolvendo') break; await sleep(150); }
  return P.evaluate(() => (__jogo.perfil.mao ? 'peixe' : 'escapou'));
};
// leva a Ana para o cais da estação dela (passo a passo, o servidor recusa teletransporte)
const caminhar = async (P, destino) => {
  for (let k = 0; k < 400; k++) {
    const fim = await P.evaluate((d) => { const g = __jogo; const p = g.me.pos; const dx = d[0] - p[0], dz = d[2] - p[2]; const L = Math.hypot(dx, dz); if (L < 0.5) return true; const s = Math.min(1.4, L); g.me.pos = [p[0] + dx / L * s, d[1], p[2] + dz / L * s]; g.sendAcc = 1; g.step(1); return false; }, destino);
    if (fim) return true;
    if (k % 12 === 0) await sleep(260);
  }
  return false;
};
// contorna o berço do sub pela esquerda e segue pelo cais (o servidor recusa teletransporte)
for (const wp of [[-1.9, 1.5, 10], [-1.9, 1.3, 50], [0, 1.3, 56]]) await caminhar(A, await A.evaluate((w) => __jogo.stations[__jogo.slot].toWorld(...w), wp));
let r = null;
for (let t = 0; t < 6 && r !== 'peixe'; t++) { r = await pescar(A); console.log('    pesca A:', r); }
check(r === 'peixe', 'A pescou um peixe no servidor');
await A.evaluate(() => { if (__jogo.pesca.estado !== 'off') __jogo.cancelarPesca(); });
// as duas na estação de A, em terra
for (const wp of [[-1.9, 1.3, 50], [-1.9, 1.5, 10]]) await caminhar(A, await A.evaluate((w) => __jogo.stations[__jogo.slot].toWorld(...w), wp));
const alvoA = await A.evaluate(() => __jogo.stations[__jogo.slot].toWorld(6, 1.55, 0));
const alvoB = await A.evaluate(() => __jogo.stations[__jogo.slot].toWorld(-4, 1.55, 0));
await caminhar(A, alvoA);
const bInicio = await B.evaluate(() => __jogo.me.pos.slice());
// B atravessa a margem até a estação de A
const meio = [(bInicio[0] + alvoB[0]) * 0.5 * 1.25, 1.6, (bInicio[2] + alvoB[2]) * 0.5 * 1.25];
await caminhar(B, meio); await caminhar(B, alvoB);
await sleep(800);
const servidorVeB = await A.evaluate(() => Object.values(__jogo.remotos)[0].pos);
check(Math.hypot(servidorVeB[0] - alvoB[0], servidorVeB[2] - alvoB[2]) < 3, 'servidor aceitou a caminhada de B (posição sincronizada)', JSON.stringify(servidorVeB.map((v) => +v.toFixed(1))));
// A mira e arremessa (G)
// A segura o peixe (G) e coloca a mira (centro da tela, câmera no ombro) em cima do Beto
const marca = await A.evaluate((b) => { const g = __jogo; g.input.press('KeyG'); g.step(1);
  for (let k = 0; k < 6; k++) { const c = g.cam.pos, dx = b[0] - c[0], dz = b[2] - c[2], dy = b[1] + 1.0 - c[1]; g.me.camYaw = g.me.vYaw = Math.atan2(dx, dz); g.me.camPitch = g.me.vPitch = Math.atan2(dy, Math.hypot(dx, dz)); g.step(8); }
  return { vis: g.miraMarca.visible, pos: g.miraMarca.pos.slice() }; }, servidorVeB);
check(marca.vis, 'com G aparece o marcador de onde o peixe vai cair', JSON.stringify(marca.pos.map((v) => +v.toFixed(1))));
await A.evaluate(() => { const g = __jogo; g.input.mouse.clicked = true; g.step(1); });
await sleep(1500);
const vis = await B.evaluate(() => ({ hidden: document.getElementById('acertado').hidden, txt: document.querySelector('#acertado .t').textContent, stun: __jogo.me.stunUntil - performance.now() }));
check(!vis.hidden && vis.txt === 'VOCÊ FOI ACERTADO POR UM PEIXE!', 'B vê "VOCÊ FOI ACERTADO POR UM PEIXE!"', JSON.stringify(vis));
check(vis.stun > 500 && vis.stun <= 3000, 'B fica imobilizado (≈3 s)', `${Math.round(vis.stun)} ms restantes`);
check(await A.evaluate(() => __jogo.perfil.mao === null), 'peixe saiu do inventário de A (sem duplicar)');
const pb0 = await B.evaluate(() => __jogo.me.pos.slice());
await B.evaluate(() => { const g = __jogo; g.input.keys.add('KeyW'); g.step(10); g.input.keys.delete('KeyW'); });
const pb1 = await B.evaluate(() => __jogo.me.pos.slice());
const andou = Math.hypot(pb1[0] - pb0[0], pb1[2] - pb0[2]);
check(andou < 0.4, 'B não consegue andar enquanto atordoado (andar 10 passos daria ~1,6 m)', `${andou.toFixed(2)} m`);
await sleep(3200);
check(await B.evaluate(() => document.getElementById('acertado').hidden), 'aviso some após o atordoamento');

// queda de conexão de B e retorno pelo mesmo link: mesma vaga e mesmo perfil
const dinB = await B.evaluate(() => __jogo.perfil.dinheiro);
await B.close();
await sleep(1500);
check(await A.evaluate(() => Object.values(__jogo.remotos).some((r) => !r.conectado)), 'A vê B como "reconectando…"');
const B2 = await ctxB.newPage();
B2.on('pageerror', (e) => erros.push('B2: ' + e.message));
await B2.goto(base + `?q=0&semdesenho&sala=${code}`);
await B2.waitForFunction(() => !document.getElementById('btEntrar').disabled, null, { timeout: 10000 });
await B2.click('#btEntrar');
await pronto(B2);
check(await B2.evaluate(() => __jogo.slot) === sb, 'B volta para a mesma estação', await B2.evaluate(() => __jogo.slot));
check(await B2.evaluate(() => __jogo.perfil.dinheiro) === dinB, 'perfil de B preservado no servidor');
// todos saem (já salvo) e voltam pela lista de salas
await A.evaluate(() => { __jogo.ui.abrir('sala'); document.querySelector('[data-sair]').click(); });
await A.waitForURL((u) => !u.toString().includes('sala='), { timeout: 10000 }).catch(() => {});
await A.waitForFunction(() => !document.getElementById('menu').hidden, null, { timeout: 20000 });
await A.waitForFunction(() => !document.getElementById('btSalas').disabled && /online/.test(document.getElementById('srvStatus').textContent), null, { timeout: 10000 });
await A.click('#btSalas');
await A.waitForFunction((c) => document.getElementById('salasLista').textContent.includes(c), code, { timeout: 10000 });
const item = await A.textContent('#salasLista');
check(/Sala 1/.test(item) && item.includes(code) && /\d+%/.test(item), 'lista mostra "Sala 1", o código e a % de evolução', item.replace(/\s+/g, ' ').trim());
const dinA = await A.evaluate(() => 0);
await A.click(`[data-entrar="${code}"]`);
await pronto(A);
check(await A.evaluate(() => __jogo.slot) === sa && await A.evaluate(() => __jogo.net.code) === code, 'líder volta para a mesma sala (mesmo código) e mesma estação');
// ---------- v0.9: chat de voz (M), ranking, corrida de submarino entre os dois navegadores
const voz = await A.evaluate(async () => {
  const g = __jogo; g.input.press('KeyM'); g.step(1);
  for (let k = 0; k < 40 && !g.voz.ligado; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  return { ligado: g.voz.ligado, aviso: document.getElementById('vozAviso').textContent, avisoVis: !document.getElementById('vozAviso').hidden, hud: document.getElementById('vozHud').textContent };
});
check(voz.ligado && voz.avisoVis && /ativado/.test(voz.aviso) && /ligado/.test(voz.hud), 'M liga o chat de voz: "Chat de voz ativado" em cima e "ligado" no canto', JSON.stringify(voz));
const conexaoVoz = await B2.evaluate(async (sa) => {
  const g = __jogo; let st = null, bytes = 0;
  for (let k = 0; k < 120; k++) {
    g.step(1); const p = g.voz.peers.get(sa);
    st = p?.pc?.connectionState;
    if (st === 'connected' && p.tr) { const rep = await p.pc.getStats(p.tr.receiver.track); rep.forEach((x) => { if (x.type === 'inbound-rtp') bytes = x.bytesReceived; }); if (bytes > 2000) break; }
    await new Promise((r) => setTimeout(r, 150));
  }
  const p = g.voz.peers.get(sa);
  return { st, bytes, vol: p?.audio?.volume, dist: Math.round(Math.hypot(...[0, 1, 2].map((i) => g.remotos[sa].char.root.pos[i] - g.me.pos[i]))) };
}, sa);
check(conexaoVoz.st === 'connected' && conexaoVoz.bytes > 2000, 'chat de voz conecta os dois navegadores e o áudio chega', JSON.stringify(conexaoVoz));
check(conexaoVoz.dist > 69 ? conexaoVoz.vol < 0.01 : conexaoVoz.vol > 0, 'volume pela distância: de outra estação não se ouve', JSON.stringify(conexaoVoz));
const rank = await A.evaluate(() => document.querySelector('#topoDir .ranking')?.textContent || '');
check(/Ana/.test(rank) && /Beto/.test(rank) && /S\$/.test(rank), 'ranking top 3 do dinheiro no canto (embaixo da estação)', rank);
// A vai até a barraca da corrida, escolhe o Beto e chama
const chamou = await A.evaluate(async (sb) => {
  const g = __jogo, st = g.stations[g.slot]; g.net.enviar({ t: 'teste_dinheiro', v: 1000 }); await new Promise((r) => setTimeout(r, 300));
  for (const wp of [[-1.9, 1.5, 10], [9.5, 1.6, -6], [12.8, 1.6, -7.3]]) { const a = st.toWorld(...wp); for (let k = 0; k < 200; k++) { const d = [a[0] - g.me.pos[0], a[2] - g.me.pos[2]]; const L = Math.hypot(d[0], d[1]); if (L < 0.05) break; const s = Math.min(2.5, L) / L; g.me.pos = [g.me.pos[0] + d[0] * s, a[1], g.me.pos[2] + d[1] * s]; g.me.vel = [0, 0, 0]; g.step(3); await new Promise((r) => setTimeout(r, 10)); } }
  g.step(3); const prompt = document.getElementById('prompt').textContent;
  g.input.press('KeyE'); g.step(1);
  const painel = g.ui.aberto;
  document.querySelector(`[data-escolher="${sb}"]`)?.click();
  const cinza = document.querySelector(`[data-escolher="${sb}"]`)?.className;
  document.querySelector('[data-chamar]')?.click();
  await new Promise((r) => setTimeout(r, 600));
  return { prompt, painel, cinza, fechou: !g.ui.aberto, pos: g.me.pos.slice(), modo: g.me.modo };
}, sb);
check(chamou.painel === 'corrida' && /Corrida/.test(chamou.prompt), 'E na bola da barraca abre a corrida de submarino', JSON.stringify(chamou));
check(chamou.cinza === 'cinza' && chamou.fechou, 'Escolher fica cinza e "Chamar para corrida" envia o convite', JSON.stringify(chamou));
const convite = await B2.evaluate(async () => {
  const g = __jogo; for (let k = 0; k < 40 && document.getElementById('corridaConvite').hidden; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  const txt = document.getElementById('corridaConvite').textContent, vis = !document.getElementById('corridaConvite').hidden;
  const antes = { modo: g.me.modo, pos: g.me.pos.slice(), din: g.perfil.dinheiro };
  g.net.enviar({ t: 'teste_dinheiro', v: 1000 }); await new Promise((r) => setTimeout(r, 300));
  g.input.press('KeyY'); g.step(1);
  for (let k = 0; k < 40 && !g.corrida; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  return { vis, txt, antes, modo: g.me.modo, crane: g.crane.estado, corrida: !!g.corrida, palitos: g.palitos?.length, cont: document.getElementById('corridaContagem').textContent };
});
check(convite.vis && /Ana/.test(convite.txt) && /S\$ 200/.test(convite.txt), 'Beto recebe o convite com o prêmio escrito', convite.txt);
check(convite.corrida && convite.modo === 'sub' && convite.crane === 'livre' && convite.palitos === 5, 'Y aceita: vai para dentro do submarino na água, com 5 palitos', JSON.stringify(convite));
const lado = await A.evaluate(async (sb) => {
  const g = __jogo; for (let k = 0; k < 20 && !g.corrida; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  const r = g.remotos[sb]; const dist = () => Math.hypot(g.sub.pos[0] - r.sub.pos[0], g.sub.pos[2] - r.sub.pos[2]);
  for (let k = 0; k < 30 && dist() > 15; k++) { await new Promise((res) => setTimeout(res, 100)); g.step(1); }
  return { modo: g.me.modo, d: dist(), contagem: !document.getElementById('corridaContagem').hidden, hud: document.getElementById('corridaHud').textContent };
}, sb);
check(lado.modo === 'sub' && lado.d < 15 && lado.contagem, 'Ana também está no sub, lado a lado com o Beto, com contagem regressiva', JSON.stringify(lado));
// os dois estão perto: o volume do chat de voz sobe
const perto = await B2.evaluate(async (sa) => { const g = __jogo; for (let k = 0; k < 15; k++) { g.step(1); await new Promise((r) => setTimeout(r, 80)); } return g.voz.peers.get(sa)?.audio?.volume; }, sa);
check(perto > 0.9, 'perto um do outro o volume do amigo fica alto', String(perto));
// Beto passa pelos 5 palitos (o sub é levado até cada um) e vence
const fim = await B2.evaluate(async () => {
  const g = __jogo; const C = g.corrida;
  while (performance.now() < C.largaEm + 100) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  const din0 = g.perfil.dinheiro;
  for (const c of C.checkpoints) { g.sub.pos = [c[0], -0.5, c[2]]; g.sub.vel = [0, 0, 0]; for (let k = 0; k < 6; k++) { g.step(1); await new Promise((r) => setTimeout(r, 70)); } }
  for (let k = 0; k < 40 && g.corrida; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  for (let k = 0; k < 10; k++) { await new Promise((r) => setTimeout(r, 80)); g.step(1); }
  return { acabou: !g.corrida, din0, din1: g.perfil.dinheiro, res: document.getElementById('corridaResultado').textContent, modo: g.me.modo, crane: g.crane.estado, pos: g.me.pos.slice() };
});
check(fim.acabou && fim.din1 === fim.din0 + 200 && /VENCEU/.test(fim.res), 'Beto pega os 5 palitos, vence e ganha S$ 200', JSON.stringify(fim));
check(fim.modo === convite.antes.modo && Math.hypot(fim.pos[0] - convite.antes.pos[0], fim.pos[2] - convite.antes.pos[2]) < 1, 'Beto volta para onde estava antes da corrida', JSON.stringify({ fim, antes: convite.antes }));
const fimA = await A.evaluate(async (pos0) => {
  const g = __jogo; for (let k = 0; k < 30 && g.corrida; k++) { await new Promise((r) => setTimeout(r, 100)); g.step(1); }
  g.step(2);
  return { modo: g.me.modo, crane: g.crane.estado, d: Math.hypot(g.me.pos[0] - pos0[0], g.me.pos[2] - pos0[2]), res: document.getElementById('corridaResultado').textContent, din: g.perfil.dinheiro };
}, chamou.pos);
check(fimA.modo === 'terra' && fimA.crane === 'berco' && fimA.d < 1 && /perdeu S\$ 200/.test(fimA.res), 'Ana perde S$ 200 e volta a pé para a barraca (sub de volta no berço)', JSON.stringify(fimA));

// servidor grátis "dormindo": reinicia sem nenhum arquivo e os jogadores voltam sozinhos pela cópia guardada no aparelho
// (só roda se E2E_REINICIAR tiver o comando que reinicia o servidor com uma pasta de dados vazia)
if (process.env.E2E_REINICIAR) {
  await sleep(2500); // dá tempo de chegar a cópia mais nova
  const antes = await A.evaluate(() => ({ d: __jogo.perfil.dinheiro, deco: __jogo.perfil.estacao.decoracao, copia: Object.keys(localStorage).filter((k) => k.startsWith('abismo_copia_')).length }));
  const { execSync } = await import('node:child_process');
  execSync(process.env.E2E_REINICIAR, { stdio: 'ignore' });
  await A.waitForFunction((c) => __jogo.net.ws?.readyState === 1 && __jogo.net.code === c && /Online/.test(__jogo.net.status), code, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  const depois = await A.evaluate(() => ({ d: __jogo.perfil.dinheiro, deco: __jogo.perfil.estacao.decoracao, code: __jogo.net.code, slot: __jogo.slot, st: __jogo.net.status }));
  check(antes.copia >= 1 && depois.code === code && depois.slot === sa && depois.d === antes.d && depois.deco === antes.deco && /Online/.test(depois.st), 'servidor reiniciou sem arquivos: A volta sozinho para a mesma sala, estação e dinheiro (cópia do aparelho)', JSON.stringify({ antes, depois }));
  await B2.waitForFunction((c) => __jogo.net.ws?.readyState === 1 && __jogo.net.code === c && /Online/.test(__jogo.net.status), code, { timeout: 40000 }).catch(() => {});
  check(await B2.evaluate(() => __jogo.slot) === sb && await B2.evaluate(() => __jogo.perfil.dinheiro) === dinB, 'B também volta com a mesma estação e o mesmo dinheiro');
}
{ const reais = erros.filter((e) => !(process.env.E2E_REINICIAR && /ERR_CONNECTION_REFUSED/.test(e))); check(reais.length === 0, 'sem erros de JS nos dois navegadores', reais.slice(0, 4).join(' | ')); }
console.log(`\nE2E multiplayer: ${ok} ok, ${falhas} falha(s)`);
await browser.close();
process.exit(falhas ? 1 : 0);
