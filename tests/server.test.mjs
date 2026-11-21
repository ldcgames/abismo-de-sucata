// Teste de integração do servidor real: sobe o processo, conecta clientes WebSocket de verdade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'abismo-'));
let proc; // processo do servidor (reiniciado em um dos testes)

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const fila = []; const espera = [];
  ws.on('message', (b) => {
    const m = JSON.parse(b);
    const i = espera.findIndex((w) => w.pred(m));
    if (i >= 0) { const w = espera.splice(i, 1)[0]; w.res(m); } else fila.push(m);
  });
  const api = {
    ws,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (m) => ws.send(JSON.stringify(m)),
    wait: (pred, ms = 3000) => new Promise((res, rej) => {
      const i = fila.findIndex(pred);
      if (i >= 0) return res(fila.splice(i, 1)[0]);
      const t = setTimeout(() => rej(new Error('timeout esperando mensagem')), ms);
      espera.push({ pred, res: (m) => { clearTimeout(t); res(m); } });
    }),
    close: () => ws.close(),
  };
  return api;
}

async function andar(c, de, para) {
  const n = Math.ceil(Math.hypot(para[0] - de[0], para[2] - de[2]) / 2.5);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    c.send({ t: 'estado', s: { pos: [de[0] + (para[0] - de[0]) * t, de[1] + (para[1] - de[1]) * t, de[2] + (para[2] - de[2]) * t], modo: 'terra', rot: 0 } });
    await new Promise((r) => setTimeout(r, 90));
  }
}

test.before(async () => { proc = await subir(); });
test.after(() => { proc.kill(); });

test('HTTP serve o cliente e a rota de saúde', async () => {
  const r = await fetch(`http://localhost:${PORT}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /ABISMO DE SUCATA/);
  const s = await (await fetch(`http://localhost:${PORT}/saude`)).json();
  assert.equal(s.ok, true);
  const sh = await fetch(`http://localhost:${PORT}/shared/rules.js`);
  assert.equal(sh.status, 200);
  const trav = await fetch(`http://localhost:${PORT}/../server/store.js`);
  assert.notEqual(trav.status, 200);
});

function subir() {
  const pr = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((r) => pr.stdout.on('data', (d) => { if (String(d).includes('servidor em')) r(pr); }));
}
async function ola(c, extra) { c.send({ t: 'ola', v: 1, ...extra }); return c.wait((m) => m.t === 'bemvindo'); }

test('salas permanentes: 5 entram por código em estações vizinhas, 6º recebe "sala cheia", cor e nome únicos', async () => {
  const cs = [0, 1, 2, 3, 4, 5].map(() => client());
  await Promise.all(cs.map((c) => c.open()));
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(await ola(cs[i], { nome: 'J' + i, cor: i }));
  assert.deepEqual(ids[0].salas, [], 'conta nova sem salas');
  cs[0].send({ t: 'criar_sala' });
  const sala = await cs[0].wait((m) => m.t === 'sala');
  assert.match(sala.code, /^[A-Z2-9]{6}$/); assert.equal(sala.slot, 'N'); assert.equal(sala.host, true); assert.equal(sala.nome, 'Sala 1');
  // cor repetida é recusada com aviso
  const repetido = client(); await repetido.open(); await ola(repetido, { nome: 'Outro', cor: 0 });
  repetido.send({ t: 'entrar_sala', code: sala.code });
  const er = await repetido.wait((m) => m.t === 'erro'); assert.match(er.msg, /Alguém já está com essa cor/); repetido.close();
  const xara = client(); await xara.open(); await ola(xara, { nome: 'j0', cor: 5 });
  xara.send({ t: 'entrar_sala', code: sala.code });
  const en = await xara.wait((m) => m.t === 'erro'); assert.match(en.msg, /nome/); xara.close();
  const slots = [sala.slot];
  for (let i = 1; i < 5; i++) { cs[i].send({ t: 'entrar_sala', code: sala.code.toLowerCase() }); const s = await cs[i].wait((m) => m.t === 'sala'); slots.push(s.slot); }
  assert.deepEqual(slots, ['N', 'L', 'SE', 'SO', 'O'], 'estações em sequência');
  cs[5].send({ t: 'entrar_sala', code: sala.code });
  const cheio = await cs[5].wait((m) => m.t === 'erro');
  assert.match(cheio.msg, /cheia/);
  const snap = await cs[1].wait((m) => m.t === 'snap' && Object.keys(m.snap.players).length === 5);
  assert.equal(Object.keys(snap.snap.players).length, 5);
  cs.forEach((c) => c.close());
  await new Promise((r) => setTimeout(r, 300));
});

test('salvamento automático: sair, voltar com o mesmo código, reiniciar o servidor, várias salas com % de evolução', { timeout: 30000 }, async () => {
  const a = client(); await a.open();
  const ida = await ola(a, { nome: 'Lider', cor: 2 });
  a.send({ t: 'criar_sala' }); const s1 = await a.wait((m) => m.t === 'sala');
  const amigo = client(); await amigo.open(); const idb = await ola(amigo, { nome: 'Amigo', cor: 3 });
  amigo.send({ t: 'entrar_sala', code: s1.code }); const sb = await amigo.wait((m) => m.t === 'sala'); assert.equal(sb.slot, 'L');
  // compra na estação → grava antes de confirmar
  a.send({ t: 'acao', req: 1, a: { tipo: 'comprar', cat: 'estacao', chave: 'decoracao', aid: 'compra-1' } });
  const r1 = await a.wait((m) => m.t === 'res' && m.req === 1);
  assert.equal(r1.res.ok, true, r1.res.msg);
  const dinheiro = r1.perfil.dinheiro;
  a.send({ t: 'acao', req: 2, a: { tipo: 'comprar', cat: 'estacao', chave: 'decoracao', aid: 'compra-1' } });
  assert.equal((await a.wait((m) => m.t === 'res' && m.req === 2)).perfil.dinheiro, dinheiro, 'mesma ação repetida não cobra duas vezes');
  // todos saem do jogo
  a.send({ t: 'sair' }); await a.wait((m) => m.t === 'saiu_ok'); a.close();
  amigo.send({ t: 'sair' }); await amigo.wait((m) => m.t === 'saiu_ok'); amigo.close();
  await new Promise((r) => setTimeout(r, 300));
  // arquivos em disco (token nunca em texto puro)
  const fp = path.join(DATA, 'salas', s1.code, ida.id + '.json');
  assert.equal(JSON.parse(fs.readFileSync(fp, 'utf8')).estacao.decoracao, true);
  const fc = fs.readFileSync(path.join(DATA, 'contas', ida.id + '.json'), 'utf8');
  assert.ok(!fc.includes(ida.token));
  // reinicia o servidor (simula desligar e ligar no outro dia)
  proc.kill(); await new Promise((r) => setTimeout(r, 400));
  proc = await subir();
  const a2 = client(); await a2.open();
  const bv = await ola(a2, { id: ida.id, token: ida.token });
  assert.equal(bv.salas.length, 1); assert.equal(bv.salas[0].code, s1.code); assert.equal(bv.salas[0].nome, 'Sala 1'); assert.equal(bv.salas[0].souDono, true);
  assert.equal(typeof bv.salas[0].progresso, 'number'); assert.equal(bv.salas[0].jogadores, 2);
  a2.send({ t: 'entrar_sala', code: s1.code }); const v = await a2.wait((m) => m.t === 'sala');
  assert.equal(v.code, s1.code, 'o código nunca muda'); assert.equal(v.slot, 'N', 'mesma estação');
  assert.equal(v.perfil.estacao.decoracao, true); assert.equal(v.perfil.dinheiro, dinheiro, 'progresso continua');
  const b2 = client(); await b2.open(); await ola(b2, { id: idb.id, token: idb.token });
  b2.send({ t: 'entrar_sala', code: s1.code }); const vb = await b2.wait((m) => m.t === 'sala'); assert.equal(vb.slot, 'L', 'amigo volta para a mesma estação');
  // segunda sala: progresso separado
  a2.send({ t: 'sair' }); await a2.wait((m) => m.t === 'saiu_ok');
  a2.send({ t: 'criar_sala' }); const s2 = await a2.wait((m) => m.t === 'sala');
  assert.notEqual(s2.code, s1.code); assert.equal(s2.nome, 'Sala 2');
  assert.equal(s2.perfil.estacao.decoracao, false, 'cada sala é um jogo salvo separado');
  a2.send({ t: 'sair' }); await a2.wait((m) => m.t === 'saiu_ok');
  a2.send({ t: 'minhas_salas' }); const lista = await a2.wait((m) => m.t === 'salas');
  assert.deepEqual(lista.salas.map((x) => x.nome), ['Sala 1', 'Sala 2']);
  assert.ok(lista.salas[0].progresso >= 0 && lista.salas[0].progresso <= 100);
  // código inexistente
  a2.send({ t: 'entrar_sala', code: 'ZZZZZZ' }); const ne = await a2.wait((m) => m.t === 'erro'); assert.match(ne.msg, /não existe/);
  // token errado não abre a conta de outra pessoa
  const intruso = client(); await intruso.open();
  const bi = await ola(intruso, { id: ida.id, token: 'errado' });
  assert.notEqual(bi.id, ida.id); assert.deepEqual(bi.salas, []);
  [a2, b2, intruso].forEach((c) => c.close());
});

test('pesca + arremesso entre dois clientes reais: alvo recebe atordoamento de 3 s', { timeout: 90000 }, async () => {
  const a = client(), b = client(); await a.open(); await b.open();
  await ola(a, { nome: 'A', cor: 0 }); await ola(b, { nome: 'B', cor: 1 });
  a.send({ t: 'criar_sala' }); const sa = await a.wait((m) => m.t === 'sala');
  b.send({ t: 'entrar_sala', code: sa.code }); await b.wait((m) => m.t === 'sala');
  // posiciona os dois perto da estação N, em terra
  a.send({ t: 'estado', s: { pos: [-1.0, 1.5, -111], modo: 'terra', rot: 0 } });
  // B caminha da Estação Leste até perto de A (o servidor recusa teletransporte)
  const caminhadaB = andar(b, [99.9, 1.6, -32.4], [9, 1.5, -111]);
  // sem peixe na mão: recusado
  a.send({ t: 'acao', req: 9, a: { tipo: 'arremessar_peixe', dir: [1, 0.05, 0] } });
  const neg = await a.wait((m) => m.t === 'res' && m.req === 9);
  assert.equal(neg.res.ok, false);
  // pesca de verdade no cais (servidor sorteia a mordida)
  await andar(a, [-1, 1.5, -111], [0, 1.25, -58]);
  let req = 10, peguei = false;
  for (let tent = 0; tent < 4 && !peguei; tent++) {
    a.send({ t: 'acao', req: ++req, a: { tipo: 'pesca_lancar', x: 0, z: -47, linha: 6 } });
    const l = await a.wait((m) => m.t === 'res' && m.req === req);
    assert.equal(l.res.ok, true, l.res.msg);
    await new Promise((r) => setTimeout(r, l.res.pesca.mordidaEm + 1200 + l.res.pesca.kg * 400));
    a.send({ t: 'acao', req: ++req, a: { tipo: 'pesca_puxar', sid: l.res.pesca.sid, resultado: 'ok' } });
    const p = await a.wait((m) => m.t === 'res' && m.req === req, 8000);
    peguei = p.res.ok;
  }
  assert.ok(peguei, 'pescou um peixe');
  await caminhadaB;
  await andar(a, [0, 1.25, -58], [-1, 1.5, -111]);
  a.send({ t: 'acao', req: 99, a: { tipo: 'arremessar_peixe', dir: [1, 0.0, 0] } });
  const ok = await a.wait((m) => m.t === 'res' && m.req === 99);
  assert.equal(ok.res.ok, true, ok.res.msg);
  assert.equal(ok.perfil.mao, null, 'peixe saiu da mão');
  const ev = await b.wait((m) => m.t === 'ev' && m.ev.some((e) => e.t === 'atordoado'), 4000);
  const at = ev.ev.find((e) => e.t === 'atordoado');
  assert.equal(at.alvo, 'L'); assert.equal(at.ms, 3000);
  // durante o atordoamento o servidor corrige tentativa de andar
  b.send({ t: 'estado', s: { pos: [15, 1.5, -111], modo: 'terra', rot: 0 } });
  const corr = await b.wait((m) => m.t === 'ev' && m.ev.some((e) => e.t === 'corrigir'), 2000);
  assert.ok(corr);
  b.close(); a.close();
});
