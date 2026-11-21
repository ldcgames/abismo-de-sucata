// ABISMO DE SUCATA — Sala (instância temporária do lago).
// Usada pelo servidor WebSocket (multiplayer real) e pelo servidor local do navegador (modo solo).
// A sala NÃO é dona da progressão: cada jogador traz o próprio perfil, que é salvo fora daqui.

import { avancarMissao, applyAction, createWorld, tickWorld, stepProjectiles, checkSurface, checkDiscovery, estaNaEstacao } from './rules.js';
import { STATIONS, stationById, hourOfDay, terrainHeight } from './world.js';
import { CORES_JOGADOR } from './data.js';

export const MAX_JOGADORES = 5;
export const RECONEXAO_MS = 90_000; // vaga reservada por 90 s após queda

export class Room {
  constructor({ code, seed = 1, now = Date.now(), rnd = Math.random, horaInicial = 0 }) {
    this.code = code;
    this.world = createWorld(seed);
    this.players = new Map(); // slot -> runtime
    this.t0 = now;
    this.timeOffset = horaInicial; // segundos de jogo já decorridos
    this.rnd = rnd;
    this.host = null;
  }
  worldTime(now) { return (now - this.t0) / 1000 + this.timeOffset; }
  hora(now) { return hourOfDay(this.worldTime(now)); }

  coresUsadas() { return [...this.players.values()].map((o) => o.profile.cor); }
  slotsLivres() { return STATIONS.map((s) => s.id).filter((id) => !this.players.has(id)); }

  join(profile, pref, now = Date.now()) {
    // reconexão do mesmo perfil: retoma a vaga
    for (const [slot, pl] of this.players) {
      if (pl.profile.id === profile.id) {
        pl.conectado = true; pl.caiuEm = 0; pl.profile = profile;
        return { ok: true, slot, reconectou: true };
      }
    }
    if (this.players.size >= MAX_JOGADORES) return { ok: false, msg: `Sala cheia (${MAX_JOGADORES}/${MAX_JOGADORES})`, codigo: 'sala_cheia' };
    // cores e nomes não se repetem na mesma sala
    for (const o of this.players.values()) {
      if (o.profile.cor === profile.cor) return { ok: false, msg: `Alguém já está com essa cor (${CORES_JOGADOR[profile.cor]?.nome || ''}). Escolha outra.`, codigo: 'cor_repetida', usadas: this.coresUsadas() };
      if (o.profile.nome.trim().toLowerCase() === profile.nome.trim().toLowerCase()) return { ok: false, msg: `Já tem um jogador chamado "${profile.nome}" nesta sala. Escolha outro nome.`, codigo: 'nome_repetido' };
    }
    const livres = this.slotsLivres();
    const slot = livres.includes(pref) ? pref : livres[0];
    const st = stationById(slot);
    const pl = {
      slot, profile, conectado: true, caiuEm: 0,
      pos: [st.pad[0] - st.dir[0] * 6, 1.6, st.pad[1] - st.dir[1] * 6], rot: st.ang + Math.PI / 2,
      modo: 'terra', anim: 'idle',
      sub: { pos: [st.cradle[0], 3.2, st.cradle[1]], rot: Math.atan2(-st.dir[0], -st.dir[1]), luz: false, estado: 'berco', braco: 0 },
      tinta: false, tintaProt: 0, stunUntil: 0, imuneUntil: 0, cdPeixe: 0, cdTubarao: 0, cdBalao: 0, pesca: null,
      ultimoEstado: now,
    };
    this.players.set(slot, pl);
    if (!this.host) this.host = profile.id;
    return { ok: true, slot };
  }

  leave(slot, now = Date.now(), definitivo = false) {
    const pl = this.players.get(slot);
    if (!pl) return;
    if (definitivo) { this.players.delete(slot); return; }
    pl.conectado = false; pl.caiuEm = now;
  }

  // estado de movimento enviado pelo cliente (posição é do cliente; regras de jogo são da sala)
  setState(slot, s, now = Date.now()) {
    const pl = this.players.get(slot);
    if (!pl || !s) return [];
    const ev = [];
    const num = (v) => typeof v === 'number' && isFinite(v);
    const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(num);
    const atordoado = pl.stunUntil > now;
    if (vec(s.pos)) {
      const salto = Math.hypot(s.pos[0] - pl.pos[0], s.pos[2] - pl.pos[2]);
      const dt = Math.max(0.05, (now - pl.ultimoEstado) / 1000);
      const trocaModo = s.modo !== pl.modo;
      const empurrado = (pl.empurraoAte || 0) > now; // tiro/explosão joga o alvo longe: aí ele pode se mover
      if (atordoado && !empurrado && pl.modo === 'terra' && salto > 0.35) {
        ev.push({ t: 'corrigir', slot, pos: pl.pos }); // alvo atordoado não pode andar
      } else if (salto / dt < 40 || salto < 3 || (trocaModo && (salto < 30 || Math.hypot(s.pos[0] - pl.sub.pos[0], s.pos[2] - pl.sub.pos[2]) < 30))) {
        pl.pos = s.pos;
      }
    }
    if (num(s.rot)) pl.rot = s.rot;
    if (['terra', 'sub', 'nadando', 'guindaste'].includes(s.modo)) pl.modo = s.modo;
    if (typeof s.anim === 'string') pl.anim = s.anim.slice(0, 16);
    pl.arma = typeof s.arma === 'string' ? s.arma.slice(0, 14) : null;
    if (s.sub && vec(s.sub.pos)) {
      pl.sub.pos = s.sub.pos;
      if (num(s.sub.rot)) pl.sub.rot = s.sub.rot;
      if (num(s.sub.pitch)) pl.sub.pitch = s.sub.pitch;
      pl.sub.luz = !!s.sub.luz;
      if (typeof s.sub.estado === 'string') pl.sub.estado = s.sub.estado.slice(0, 12);
      if (num(s.sub.braco)) pl.sub.braco = s.sub.braco;
      if (num(s.sub.gancho)) pl.sub.gancho = s.sub.gancho;
    }
    if (s.pescaVis) pl.pescaVis = s.pescaVis; else pl.pescaVis = null;
    pl.ultimoEstado = now;
    const sf = checkSurface(pl, now); if (sf) ev.push(sf);
    const ds = checkDiscovery(pl.profile, pl); if (ds) ev.push(ds);
    // missão de profundidade
    if (pl.modo === 'sub' && pl.sub.pos[1] < -5) {
      const prof = -pl.sub.pos[1];
      if (pl.profile.missoes?.ativas.some((m) => m.tipo === 'fundo' && prof > m.feito + 1)) ev.push(...avancarMissao(pl.profile, slot, 'fundo', null, prof, { players: this.players, rnd: this.rnd }));
    }
    return ev;
  }

  action(slot, a, now = Date.now()) {
    const pl = this.players.get(slot);
    if (!pl) return { res: { ok: false, msg: 'Jogador fora da sala' }, events: [] };
    const ctx = { world: this.world, player: pl, players: this.players, now, hora: this.hora(now), rnd: this.rnd };
    const res = applyAction(pl.profile, a, ctx);
    const events = res.events || [];
    const extra = this.creditarAcertos(events);
    if (extra.length) events.push(...extra);
    return { res, events, dirty: res.ok && !res.dup };
  }

  tick(now, dt) {
    const ev = [];
    ev.push(...stepProjectiles(this.world, this.players, dt, now));
    ev.push(...this.creditarAcertos(ev));
    ev.push(...tickWorld(this.world, now, this.rnd));
    for (const [slot, pl] of this.players) {
      if (!pl.conectado && now - pl.caiuEm > RECONEXAO_MS) {
        this.players.delete(slot);
        ev.push({ t: 'saiu', slot });
      }
      if (pl.stunUntil && pl.stunUntil <= now && !pl._stunAvisado) { pl._stunAvisado = true; ev.push({ t: 'fim_atordoado', alvo: slot }); }
      if (pl.stunUntil > now) pl._stunAvisado = false;
    }
    return ev;
  }

  // missão "acerte um amigo": conta acertos de peixe, tinta e tiro (quem acertou ganha)
  creditarAcertos(evs) {
    const out = [];
    for (const e of evs) {
      if (!((e.t === 'atordoado' || (e.t === 'tinta' && e.on)) && e.por && e.por !== e.alvo)) continue;
      const pl = this.players.get(e.por);
      if (!pl) continue;
      out.push(...avancarMissao(pl.profile, e.por, 'acertar', null, 1, { players: this.players, rnd: this.rnd }));
      pl._sujo = true;
    }
    return out;
  }

  // visão pública de um jogador (o que os outros precisam desenhar)
  publicPlayer(pl, now = Date.now()) {
    const p = pl.profile;
    return {
      slot: pl.slot, nome: p.nome, cor: p.cor, conectado: pl.conectado,
      pos: pl.pos, rot: pl.rot, modo: pl.modo, anim: pl.anim,
      sub: { ...pl.sub, niveis: p.sub, lancador: p.extras.lancador },
      tinta: pl.tinta, atordoado: Math.max(0, pl.stunUntil - now), imune: Math.max(0, pl.imuneUntil - now),
      mao: p.mao, mochila: p.mochila || [], pescaVis: pl.pescaVis || null, arma: pl.arma || null,
      estacao: { ...p.estacao, aquario: p.aquario, tanque: p.tanque, vara: p.vara, pesado: p.pesado, cargaN: p.carga.length },
    };
  }
  snapshot(now = Date.now()) {
    const players = {};
    for (const [slot, pl] of this.players) players[slot] = this.publicPlayer(pl, now);
    return { code: this.code, tempo: this.worldTime(now), players };
  }
  worldSnapshot() {
    return { items: Object.values(this.world.items), projeteis: this.world.projeteis };
  }
  naEstacao(slot) { const pl = this.players.get(slot); return pl ? estaNaEstacao(pl) : false; }
}

export { terrainHeight };
