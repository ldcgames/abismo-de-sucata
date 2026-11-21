// Camada de rede com a MESMA interface para:
//  - modo SOLO: a sala roda dentro do navegador (shared/room.js) e o perfil fica no localStorage;
//  - modo ONLINE: servidor WebSocket autoritativo (server/server.js) e perfil salvo no servidor.
import { Room } from '../../shared/room.js';
import { newProfile, migrateProfile, uid } from '../../shared/rules.js';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const fn of this.h[ev] || []) fn(...a); }
}

// ------------------------------------------------------------------ SOLO
const SAVE_KEY = 'abismo_perfil_solo_v1';
export function carregarSolo() {
  for (const k of [SAVE_KEY, SAVE_KEY + '_bak']) {
    try { const raw = localStorage.getItem(k); if (!raw) continue; const o = JSON.parse(raw); if (o && o.profile) return migrateProfile(o.profile); } catch { /* corrompido: tenta o backup */ }
  }
  return null;
}
function salvarSolo(p) {
  try {
    const raw = JSON.stringify({ v: 1, salvoEm: Date.now(), profile: p });
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_KEY + '_bak', prev);
    localStorage.setItem(SAVE_KEY, raw);
    return true;
  } catch (e) { console.warn('[save] falhou', e); return false; }
}
export function apagarSolo() { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_KEY + '_bak'); }

export class SoloNet extends Emitter {
  constructor({ nome, cor, pref }) {
    super();
    this.mode = 'solo';
    let p = carregarSolo();
    if (!p) p = newProfile(uid() + uid(), nome);
    if (nome) p.nome = nome;
    if (Number.isInteger(cor)) p.cor = cor;
    this.perfil = p;
    this.pref = pref || p.slotPreferido || 'N';
    this.status = 'Modo solo: progresso salvo neste navegador';
  }
  async connect() {
    const savedTime = +(localStorage.getItem('abismo_solo_tempo') || 0);
    this.room = new Room({ code: 'SOLO', seed: 7, now: Date.now(), horaInicial: savedTime });
    const r = this.room.join(this.perfil, this.pref, Date.now());
    this.slot = r.slot; this.code = 'SOLO';
    salvarSolo(this.perfil);
    let last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const ev = this.room.tick(now, Math.min(0.1, (now - last) / 1000)); last = now;
      if (ev.length) this.emit('ev', ev);
      this.emit('snap', this.room.snapshot(now), this.room.world.projeteis.map((p) => ({ id: p.id, tipo: p.tipo, pos: p.pos, vel: p.vel, esp: p.peixe?.esp })));
    }, 50);
    this.saveTimer = setInterval(() => { salvarSolo(this.perfil); localStorage.setItem('abismo_solo_tempo', String(this.room.worldTime(Date.now()))); }, 10000);
    return { slot: this.slot, code: this.code, mundo: this.room.worldSnapshot(), snap: this.room.snapshot(), perfil: this.perfil };
  }
  sendState(s) {
    const ev = this.room.setState(this.slot, s, Date.now());
    if (ev.length) { this.emit('ev', ev); if (ev.some((e) => e.t === 'descoberta')) salvarSolo(this.perfil); }
  }
  async action(a) {
    a.aid = a.aid || uid() + uid();
    const { res, events, dirty } = this.room.action(this.slot, a, Date.now());
    if (dirty) salvarSolo(this.perfil);
    if (events.length) setTimeout(() => this.emit('ev', events), 0);
    return { res, perfil: this.perfil };
  }
  setCfg(nome, cor) { if (nome) this.perfil.nome = nome; if (Number.isInteger(cor)) this.perfil.cor = cor; salvarSolo(this.perfil); }
  close() { clearInterval(this.timer); clearInterval(this.saveTimer); salvarSolo(this.perfil); localStorage.setItem('abismo_solo_tempo', String(this.room.worldTime(Date.now()))); }
}

// ------------------------------------------------------------------ ONLINE
export function serverUrl() {
  const q = new URLSearchParams(location.search).get('servidor');
  const cfg = window.ABISMO_SERVIDOR;
  let base = q || cfg || '';
  if (!base) {
    if (location.protocol === 'file:') return null;
    base = location.origin;
  }
  return base.replace(/^http/, 'ws').replace(/\/$/, '');
}
export async function servidorDisponivel() {
  const ws = serverUrl();
  if (!ws) return false;
  try {
    const http = ws.replace(/^ws/, 'http');
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(http + '/saude', { signal: ctl.signal });
    if (!r.ok) return false;
    const j = await r.json(); return !!j.ok;
  } catch { return false; }
}

export class OnlineNet extends Emitter {
  constructor({ nome, cor, pref, code, criar }) {
    super();
    this.mode = 'online';
    this.url = serverUrl();
    this.nome = nome; this.cor = cor; this.pref = pref; this.code = code ? code.toUpperCase() : null; this.criar = !!criar;
    this.pend = new Map(); this.req = 0; this.fila = [];
    this.credKey = 'abismo_cred_' + this.url;
    this.status = 'Conectando…';
    this.tentativas = 0;
  }
  enviar(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  cred() { try { return JSON.parse(localStorage.getItem(this.credKey) || 'null'); } catch { return null; } }
  connect() {
    return new Promise((resolve, reject) => {
      if (!this.url) return reject(new Error('Servidor não configurado'));
      this.primeiro = { resolve, reject };
      this.abrir();
    });
  }
  abrir() {
    const ws = this.ws = new WebSocket(this.url);
    ws.onopen = () => {
      this.tentativas = 0;
      const c = this.cred();
      this.enviar(({ t: 'ola', v: 1, id: c?.id, token: c?.token, nome: this.nome, cor: this.cor }));
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.recv(m); };
    ws.onclose = () => {
      this.status = 'Conexão perdida — reconectando…';
      this.emit('status', this.status, false);
      if (this.primeiro && !this.slot) { const p = this.primeiro; this.primeiro = null; p.reject(new Error('Não foi possível conectar ao servidor')); return; }
      if (this.fechado) return;
      const espera = Math.min(8000, 500 * 2 ** this.tentativas++);
      setTimeout(() => this.abrir(), espera);
    };
    ws.onerror = () => {};
  }
  recv(m) {
    switch (m.t) {
      case 'bemvindo':
        localStorage.setItem(this.credKey, JSON.stringify({ id: m.id, token: m.token }));
        if (this.slot && this.code) this.enviar(({ t: 'entrar_sala', code: this.code, pref: this.slot }));
        else if (this.criar && !this.code) this.enviar(({ t: 'criar_sala' }));
        else this.enviar(({ t: 'entrar_sala', code: this.code, pref: this.pref }));
        break;
      case 'sala': {
        const reconexao = !!this.slot;
        this.slot = m.slot; this.code = m.code; this.perfil = m.perfil; this.host = m.host; this.salaNome = m.nome;
        this.status = `Online — sala ${m.code}`;
        this.emit('status', this.status, true);
        if (this.primeiro) { const p = this.primeiro; this.primeiro = null; p.resolve({ slot: m.slot, code: m.code, nome: m.nome, mundo: m.mundo, snap: m.snap, perfil: m.perfil }); }
        else if (reconexao) this.emit('mundo', m.mundo);
        // reenvia ações que ficaram sem resposta (mesmo aid: o servidor não aplica duas vezes)
        for (const [req, p] of this.pend) this.enviar(({ t: 'acao', req, a: p.a }));
        break;
      }
      case 'erro':
        if (this.primeiro) { const p = this.primeiro; this.primeiro = null; this.fechado = true; this.ws.close(); p.reject(new Error(m.msg)); }
        else this.emit('erro', m.msg);
        break;
      case 'snap': this.emit('snap', m.snap, m.proj || []); break;
      case 'ev': this.emit('ev', m.ev); break;
      case 'perfil': this.perfil = m.perfil; this.emit('perfil', m.perfil); break;
      case 'res': {
        const p = this.pend.get(m.req);
        if (m.perfil) this.perfil = m.perfil;
        if (p) { this.pend.delete(m.req); p.resolve({ res: m.res, perfil: this.perfil }); }
        break;
      }
    }
  }
  sendState(s) { if (this.ws?.readyState === 1 && this.slot) this.enviar(({ t: 'estado', s })); }
  action(a) {
    a.aid = a.aid || uid() + uid();
    const req = ++this.req;
    return new Promise((resolve) => {
      this.pend.set(req, { a, resolve });
      if (this.ws?.readyState === 1) this.enviar(({ t: 'acao', req, a }));
      setTimeout(() => { if (this.pend.has(req) && this.ws?.readyState !== 1) { /* continua pendente até reconectar */ } }, 5000);
    });
  }
  setCfg(nome, cor) { if (this.ws?.readyState === 1) this.enviar(({ t: 'perfil_cfg', nome, cor })); }
  close() { this.fechado = true; this.enviar({ t: 'sair' }); this.ws?.close(); }
}

// lista as salas do jogador (as que ele criou e as que já entrou), com código fixo e % de evolução
export function listarSalas({ nome, cor, esquecer } = {}) {
  return new Promise((resolve, reject) => {
    const url = serverUrl(); if (!url) return reject(new Error('Servidor não configurado'));
    const credKey = 'abismo_cred_' + url;
    let c = null; try { c = JSON.parse(localStorage.getItem(credKey) || 'null'); } catch { /* */ }
    const ws = new WebSocket(url);
    const t = setTimeout(() => { ws.close(); reject(new Error('O servidor não respondeu')); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'ola', v: 1, id: c?.id, token: c?.token, nome, cor }));
    ws.onerror = () => { clearTimeout(t); reject(new Error('Não foi possível conectar ao servidor')); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'bemvindo') {
        localStorage.setItem(credKey, JSON.stringify({ id: m.id, token: m.token }));
        if (esquecer) { ws.send(JSON.stringify({ t: 'esquecer_sala', code: esquecer })); return; }
        clearTimeout(t); ws.close(); resolve(m.salas || []);
      } else if (m.t === 'salas') { clearTimeout(t); ws.close(); resolve(m.salas); }
      else if (m.t === 'erro') { clearTimeout(t); ws.close(); reject(new Error(m.msg)); }
    };
  });
}
