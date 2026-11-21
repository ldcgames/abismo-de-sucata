// ABISMO DE SUCATA — servidor autoritativo (HTTP estático + WebSocket).
//   npm install && npm start      → http://localhost:8080
// Variáveis: PORT (padrão 8080), DATA_DIR (padrão ./data), ORIGENS (lista separada por vírgula, opcional),
//   SEGREDO (opcional; assina as cópias das salas guardadas nos aparelhos dos jogadores — o render.yaml gera um)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from '../shared/room.js';
import { Store, assinar, copiaValida } from './store.js';
import { progresso, migrateProfile } from '../shared/rules.js';
import { CORES_JOGADOR } from '../shared/data.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const ORIGENS = (process.env.ORIGENS || '').split(',').map((s) => s.trim()).filter(Boolean);
const PROTO = 1;
const SEGREDO = process.env.SEGREDO || '';

const store = new Store(DATA_DIR);
const rooms = new Map(); // salas abertas agora: code -> { room, clients:Set, vaziaDesde, meta }
const MAX_SALAS_POR_CONTA = 12;

// ------------------------------------------------------------ HTTP estático
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/saude') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, salas: rooms.size, proto: PROTO })); }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/client/index.html';
    else if (!rel.startsWith('/client/') && !rel.startsWith('/shared/')) rel = '/client' + rel;
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(path.join(ROOT, 'client')) && !file.startsWith(path.join(ROOT, 'shared'))) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Não encontrado');
  }
});

// ------------------------------------------------------------ salas (permanentes: o código nunca muda)
function broadcast(entry, msg, exceto) {
  const s = JSON.stringify(msg);
  for (const c of entry.clients) if (c !== exceto && c.readyState === 1) c.send(s);
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

// salva tudo o que é do jogador (progresso na sala, conta) e a sala
function salvar(ws) {
  const ps = [];
  if (ws.entry && ws.conta) ps.push(store.salvarPerfil(ws.entry.room.code, ws.conta.id));
  if (ws.entry) { ws.entry.meta.tempoJogo = ws.entry.room.worldTime(Date.now()); ps.push(store.salvarSala(ws.entry.room.code)); }
  return Promise.all(ps);
}

async function listaSalas(conta) {
  const out = [];
  for (const code of conta.salas) {
    const meta = await store.carregarSala(code); if (!meta) continue;
    const p = await store.espiarPerfil(code, conta.id);
    out.push({ code, nome: meta.nome, dono: meta.donoNome, souDono: meta.dono === conta.id, progresso: p ? progresso(p) : 0, jogadores: Object.keys(meta.membros).length, online: rooms.get(code)?.clients.size || 0, criadaEm: meta.criadaEm });
  }
  return out;
}

async function abrirSala(meta) {
  let entry = rooms.get(meta.code);
  if (!entry) {
    const room = new Room({ code: meta.code, seed: meta.seed, now: Date.now(), horaInicial: meta.tempoJogo || 0 });
    entry = { room, clients: new Set(), vaziaDesde: 0, meta };
    rooms.set(meta.code, entry);
    console.log(`[sala ${meta.code}] aberta (${meta.nome} de ${meta.donoNome})`);
  }
  return entry;
}

async function entrar(ws, meta, pref) {
  const entry = await abrirSala(meta);
  const conta = ws.conta;
  const profile = await store.carregarPerfil(meta.code, conta);
  profile.nome = conta.nome; profile.cor = conta.cor;
  const membro = meta.membros[conta.id];
  const r = entry.room.join(profile, membro?.slot || pref, Date.now());
  if (!r.ok) return send(ws, { t: 'erro', msg: r.msg, codigo: r.codigo || 'sala', usadas: r.usadas });
  // mesmo jogador conectado em outra aba/aparelho: derruba a conexão antiga
  for (const c of entry.clients) if (c !== ws && c.conta?.id === conta.id) { send(c, { t: 'erro', msg: 'Você entrou em outro aparelho' }); c.entry = null; c.close(); entry.clients.delete(c); }
  ws.entry = entry; ws.slot = r.slot; ws.profile = profile;
  entry.clients.add(ws); entry.vaziaDesde = 0;
  // a sala entra na lista do jogador e ele guarda a mesma estação para as próximas vezes
  meta.membros[conta.id] = { nome: conta.nome, slot: r.slot, cor: conta.cor, visto: Date.now() };
  if (!conta.salas.includes(meta.code)) { conta.salas.push(meta.code); store.salvarConta(conta.id); }
  await salvar(ws);
  agendarCopia(entry, 300);
  send(ws, { t: 'sala', code: meta.code, nome: meta.nome, slot: r.slot, reconectou: !!r.reconectou, mundo: entry.room.worldSnapshot(), snap: entry.room.snapshot(), perfil: profile, host: meta.dono === conta.id });
  broadcast(entry, { t: 'ev', ev: [{ t: 'entrou', slot: r.slot, nome: conta.nome }] }, ws);
  console.log(`[sala ${meta.code}] ${conta.nome} entrou na ${r.slot} (${entry.room.players.size}/5)`);
}

// ---------- cópia da sala nos aparelhos (para o servidor sem disco que esquece tudo ao dormir) ----------
async function copiaDaSala(code) {
  const meta = await store.carregarSala(code); if (!meta) return null;
  const perfis = {}, contas = {};
  for (const id of Object.keys(meta.membros)) {
    const p = await store.espiarPerfil(code, id); if (p) perfis[id] = p;
    const r = await store.contaRec(id); if (r) contas[id] = { tokenHash: r.tokenHash, nome: r.conta.nome, cor: r.conta.cor };
  }
  const dados = { v: 1, code, ts: Date.now(), meta: { ...meta, tempoJogo: rooms.get(code)?.room.worldTime(Date.now()) ?? meta.tempoJogo }, perfis, contas };
  return { dados, sig: assinar(dados, SEGREDO) };
}
async function enviarCopia(entry) {
  if (!entry.clients.size) return;
  const copia = await copiaDaSala(entry.room.code); if (!copia) return;
  broadcast(entry, { t: 'copia', copia });
}
function agendarCopia(entry, ms = 2000) {
  if (entry.copiaTimer) return;
  entry.copiaTimer = setTimeout(() => { entry.copiaTimer = null; enviarCopia(entry).catch((e) => console.error('[copia]', e.message)); }, ms);
}
// recria a sala a partir da cópia de um jogador (só se o servidor não a conhece, ou se a que ele tem também veio de uma cópia mais velha e ninguém jogou ainda)
async function restaurarSala(ws, copia) {
  const erro = copiaValida(copia, SEGREDO); if (erro) return { ok: false, msg: erro };
  const d = copia.dados, code = d.code;
  if (!d.meta.membros?.[ws.conta.id]) return { ok: false, msg: 'Você não faz parte dessa sala' };
  if (await store.salaExiste(code)) {
    const atual = await store.carregarSala(code);
    if (!(atual?.restaurada && !rooms.has(code) && d.ts > atual.restaurada)) return { ok: true, code, ja: true };
  }
  const meta = { ...d.meta, code, restaurada: d.ts };
  store.salas.set(code, meta); await store.salvarSala(code);
  for (const [id, p] of Object.entries(d.perfis)) { store.perfis.set(code + '/' + id, migrateProfile(p)); await store.salvarPerfil(code, id); }
  for (const id of Object.keys(meta.membros)) {
    const c = d.contas[id];
    const rec = await store.contaRec(id);
    if (rec) { if (!rec.conta.salas.includes(code)) { rec.conta.salas.push(code); await store.salvarConta(id); } }
    else if (c && typeof c.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(c.tokenHash)) await store.recriarConta(id, c.tokenHash, String(c.nome || '').slice(0, 18), Number.isInteger(c.cor) ? c.cor : 0, [code]);
  }
  if (!ws.conta.salas.includes(code)) { ws.conta.salas.push(code); await store.salvarConta(ws.conta.id); }
  console.log(`[sala ${code}] restaurada pela cópia de ${ws.conta.nome}`);
  return { ok: true, code };
}

function sairDaSala(ws, definitivo) {
  const entry = ws.entry; if (!entry) return;
  const code = entry.room.code;
  salvar(ws);
  entry.room.leave(ws.slot, Date.now(), definitivo);
  entry.clients.delete(ws);
  broadcast(entry, { t: 'ev', ev: [{ t: definitivo ? 'saiu' : 'caiu', slot: ws.slot }] });
  if (!entry.clients.size) entry.vaziaDesde = Date.now();
  ws.entry = null; ws.slot = null;
  return code;
}

// ------------------------------------------------------------ WebSocket
const wss = new WebSocketServer({ server, maxPayload: 1024 * 1024 });
wss.on('connection', (ws, req) => {
  if (ORIGENS.length && !ORIGENS.includes(req.headers.origin)) { ws.close(1008, 'origem'); return; }
  ws.ok = false; ws.balde = 60; ws.ultimoBalde = Date.now(); ws.vivo = true;
  ws.on('pong', () => { ws.vivo = true; });
  ws.on('message', async (buf) => {
    // limite de taxa simples (balde de fichas)
    const agora = Date.now();
    ws.balde = Math.min(60, ws.balde + (agora - ws.ultimoBalde) * 0.05); ws.ultimoBalde = agora;
    if (ws.balde < 1) return; ws.balde -= 1;
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t !== 'restaurar_sala' && buf.length > 64 * 1024) return; // só a cópia da sala pode ser grande
    // uma mensagem por vez, na ordem em que chegaram (a restauração termina antes do "entrar na sala")
    ws.fila = (ws.fila || Promise.resolve()).then(() => handle(ws, m)).catch((e) => { console.error('[ws] erro', e); send(ws, { t: 'erro', msg: 'Erro interno no servidor' }); });
  });
  ws.on('close', () => { if (ws.entry) sairDaSala(ws, false); });
});

async function handle(ws, m) {
  if (m.t === 'ola') {
    if (m.v !== PROTO) return send(ws, { t: 'erro', msg: 'Versão do jogo diferente do servidor. Recarregue a página.' });
    let conta = null, id = m.id, token = m.token;
    if (typeof id === 'string' && typeof token === 'string') { try { conta = await store.carregarConta(id, token); } catch { conta = null; } }
    const nome = typeof m.nome === 'string' && m.nome.trim() ? m.nome.trim().slice(0, 18) : null;
    const cor = Number.isInteger(m.cor) && m.cor >= 0 && m.cor < CORES_JOGADOR.length ? m.cor : null;
    // servidor acordou sem os arquivos (plano grátis): a conta volta com o mesmo id e o mesmo token
    if (!conta && typeof id === 'string' && /^[a-z0-9]{16,40}$/.test(id) && typeof token === 'string' && token.length >= 16 && !(await store.existeConta(id))) conta = await store.recriarConta(id, Store.hash(token), nome, cor);
    if (!conta) { const c = await store.criarConta(nome, cor); conta = c.conta; id = c.id; token = c.token; }
    if (nome) conta.nome = nome;
    if (cor !== null) conta.cor = cor;
    ws.conta = conta; ws.ok = true;
    store.salvarConta(id);
    return send(ws, { t: 'bemvindo', id, token, conta: { nome: conta.nome, cor: conta.cor }, salas: await listaSalas(conta) });
  }
  if (!ws.ok) return send(ws, { t: 'erro', msg: 'Faça login primeiro' });
  switch (m.t) {
    case 'minhas_salas': return send(ws, { t: 'salas', salas: await listaSalas(ws.conta) });
    case 'criar_sala': {
      if (ws.entry) return send(ws, { t: 'erro', msg: 'Você já está numa sala' });
      const minhas = ws.conta.salas.filter((c) => store.salas.get(c)?.dono === ws.conta.id).length;
      if (minhas >= MAX_SALAS_POR_CONTA) return send(ws, { t: 'erro', msg: `Você já tem ${MAX_SALAS_POR_CONTA} salas. Continue uma delas.` });
      const meta = await store.criarSala(ws.conta);
      return entrar(ws, meta, 'N');
    }
    case 'entrar_sala': {
      if (ws.entry) return send(ws, { t: 'erro', msg: 'Você já está numa sala' });
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      let meta = null; try { meta = await store.carregarSala(code); } catch { meta = null; }
      if (!meta) return send(ws, { t: 'erro', msg: `Sala ${code} não existe. Confira o código.`, codigo: 'sem_sala' });
      return entrar(ws, meta, m.pref);
    }
    case 'restaurar_sala': {
      if (ws.entry) return send(ws, { t: 'restaurada', ok: false, msg: 'Você já está numa sala' });
      const r = await restaurarSala(ws, m.copia);
      return send(ws, { t: 'restaurada', ...r });
    }
    case 'esquecer_sala': {
      // tira a sala da SUA lista (ela continua existindo para os amigos)
      const code = String(m.code || '').toUpperCase();
      ws.conta.salas = ws.conta.salas.filter((c) => c !== code);
      await store.salvarConta(ws.conta.id);
      return send(ws, { t: 'salas', salas: await listaSalas(ws.conta) });
    }
    case 'estado': {
      if (!ws.entry) return;
      const ev = ws.entry.room.setState(ws.slot, m.s, Date.now());
      if (ev.length) {
        if (ev.some((e) => e.t === 'descoberta' || e.t === 'missao_ok')) { send(ws, { t: 'perfil', perfil: ws.profile }); salvar(ws); }
        broadcast(ws.entry, { t: 'ev', ev });
      }
      return;
    }
    case 'acao': {
      if (!ws.entry) return send(ws, { t: 'res', req: m.req, res: { ok: false, msg: 'Fora de uma sala' } });
      const { res, events, dirty } = ws.entry.room.action(ws.slot, m.a, Date.now());
      if (dirty) { await salvar(ws); agendarCopia(ws.entry); } // confirma só depois de gravado
      const pub = { ...res }; delete pub.events;
      send(ws, { t: 'res', req: m.req, res: pub, perfil: ws.profile });
      if (events.length) {
        broadcast(ws.entry, { t: 'ev', ev: events });
        // quem ganhou missão por acertar alguém recebe o perfil novo
        for (const e of events) if (e.t === 'missao_ok' && e.slot !== ws.slot) for (const c of ws.entry.clients) if (c.slot === e.slot) { send(c, { t: 'perfil', perfil: c.profile }); salvar(c); }
      }
      return;
    }
    case 'perfil_cfg': {
      const nome = typeof m.nome === 'string' && m.nome.trim() ? m.nome.trim().slice(0, 18) : null;
      const cor = Number.isInteger(m.cor) && m.cor >= 0 && m.cor < CORES_JOGADOR.length ? m.cor : null;
      if (ws.entry) {
        for (const o of ws.entry.room.players.values()) {
          if (o.profile === ws.profile) continue;
          if (cor !== null && o.profile.cor === cor) return send(ws, { t: 'erro', msg: 'Alguém já está com essa cor' });
          if (nome && o.profile.nome.toLowerCase() === nome.toLowerCase()) return send(ws, { t: 'erro', msg: 'Já tem um jogador com esse nome nesta sala' });
        }
      }
      if (nome) { ws.conta.nome = nome; if (ws.profile) ws.profile.nome = nome; }
      if (cor !== null) { ws.conta.cor = cor; if (ws.profile) ws.profile.cor = cor; }
      store.salvarConta(ws.conta.id); await salvar(ws);
      return ws.profile && send(ws, { t: 'perfil', perfil: ws.profile });
    }
    case 'sair': {
      if (!ws.entry) return;
      { const c = await copiaDaSala(ws.entry.room.code); if (c) send(ws, { t: 'copia', copia: c }); }
      sairDaSala(ws, true);
      return send(ws, { t: 'saiu_ok' });
    }
    case 'ping': return send(ws, { t: 'pong', ts: m.ts });
  }
}

// ------------------------------------------------------------ laço da simulação (20 Hz) e snapshots (12 Hz)
let ultimo = Date.now(), contSnap = 0;
setInterval(() => {
  const agora = Date.now();
  const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
  contSnap++;
  for (const [code, entry] of rooms) {
    const ev = entry.room.tick(agora, dt);
    if (ev.length) broadcast(entry, { t: 'ev', ev });
    if (contSnap % 2 === 0 && entry.clients.size) {
      const snap = { t: 'snap', snap: entry.room.snapshot(agora), proj: entry.room.world.projeteis.map((p) => ({ id: p.id, tipo: p.tipo, pos: p.pos, vel: p.vel, esp: p.peixe?.esp })) };
      broadcast(entry, snap);
    }
    // sala vazia sai da memória (continua salva em disco; volta igual quando alguém entrar com o código)
    if (!entry.clients.size && entry.vaziaDesde && agora - entry.vaziaDesde > 5 * 60_000) { entry.meta.tempoJogo = entry.room.worldTime(agora); store.salvarSala(code); rooms.delete(code); console.log(`[sala ${code}] fechada (vazia, continua salva)`); }
  }
}, 50);
// heartbeat: derruba conexões mortas
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.vivo) { ws.terminate(); continue; } ws.vivo = false; ws.ping(); if (ws.entry) salvar(ws); } // salvamento automático
  for (const entry of rooms.values()) if (entry.clients.size) agendarCopia(entry, 500); // cópia atualizada nos aparelhos
}, 15000);

// ao desligar o servidor (deploy/reinício), grava tudo antes de sair
async function desligar() {
  const ps = []; for (const ws of wss.clients) if (ws.entry) ps.push(salvar(ws));
  await Promise.allSettled(ps); process.exit(0);
}
process.on('SIGTERM', desligar); process.on('SIGINT', desligar);

server.listen(PORT, () => console.log(`ABISMO DE SUCATA — servidor em http://localhost:${PORT}  (dados em ${DATA_DIR})`));
export { server, rooms };
