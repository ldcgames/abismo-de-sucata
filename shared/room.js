// ABISMO DE SUCATA — Sala (instância temporária do lago).
// Usada pelo servidor WebSocket (multiplayer real) e pelo servidor local do navegador (modo solo).
// A sala NÃO é dona da progressão: cada jogador traz o próprio perfil, que é salvo fora daqui.

import { avancarMissao, applyAction, createWorld, tickWorld, stepProjectiles, checkSurface, checkDiscovery, estaNaEstacao, tickKraken, krakenPublico, tickTubarao, tubaraoPublico, uid } from './rules.js';
import { STATIONS, stationById, hourOfDay, terrainHeight, estacaoParaMundo, BARRACA_CORRIDA, LAKE_R } from './world.js';
import { CORES_JOGADOR, KRAKEN, CORRIDA, divisaoCorrida } from './data.js';

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
      if ((pl.teleLivreAte || 0) > now) {
        pl.pos = s.pos; // teletransporte da corrida (ida e volta)
      } else if (atordoado && !empurrado && pl.modo === 'terra' && salto > 0.35) {
        ev.push({ t: 'corrigir', slot, pos: pl.pos }); // alvo atordoado não pode andar
      } else if (salto / dt < 40 || salto < 3 || (trocaModo && (salto < 30 || Math.hypot(s.pos[0] - pl.sub.pos[0], s.pos[2] - pl.sub.pos[2]) < 30))) {
        pl.pos = s.pos;
      }
    }
    if (num(s.rot)) pl.rot = s.rot;
    if (['terra', 'sub', 'nadando', 'guindaste'].includes(s.modo)) pl.modo = s.modo;
    if (typeof s.anim === 'string') pl.anim = s.anim.slice(0, 16);
    pl.arma = typeof s.arma === 'string' ? s.arma.slice(0, 14) : null;
    pl.mic = !!s.mic;
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
    if (typeof a?.tipo === 'string' && a.tipo.startsWith('corrida_')) {
      const res = this.corridaAcao(slot, pl, a, now);
      return { res, events: res.events || [], dirty: false };
    }
    const ctx = { world: this.world, player: pl, players: this.players, now, hora: this.hora(now), rnd: this.rnd };
    const res = applyAction(pl.profile, a, ctx);
    const events = res.events || [];
    const extra = this.creditarAcertos(events);
    if (extra.length) events.push(...extra);
    this.premiarKraken(events);
    return { res, events, dirty: res.ok && !res.dup };
  }

  tick(now, dt) {
    const ev = [];
    ev.push(...stepProjectiles(this.world, this.players, dt, now));
    ev.push(...this.creditarAcertos(ev));
    this.premiarKraken(ev);
    ev.push(...tickWorld(this.world, now, this.rnd));
    ev.push(...tickKraken(this.world, now, this.rnd));
    ev.push(...tickTubarao(this.world, now, this.rnd));
    ev.push(...this.tickCorrida(now));
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

  // Kraken derrotado: todo mundo que está na sala ganha o prêmio (sem multiplicador)
  premiarKraken(evs) {
    for (const e of evs) {
      if (e.t !== 'kraken_morto' || e.premio) continue;
      e.premio = KRAKEN.premio; e.perfis = [];
      for (const [slot, pl] of this.players) { pl.profile.dinheiro += KRAKEN.premio; e.perfis.push(slot); }
    }
  }

  // ------------------------------------------------------------------ corrida de submarino
  // convite → aceitar/recusar → todos no submarino lado a lado → 5 palitos sobre a água → quem pegar todos vence
  corridaAcao(slot, pl, a, now) {
    const fail = (msg) => ({ ok: false, msg, events: [] });
    const ok = (msg, events = []) => ({ ok: true, msg, events });
    const C = this.corrida;
    if (a.tipo === 'corrida_convidar') {
      if (C) return fail(C.estado === 'convite' ? 'Já tem um convite de corrida rolando nesta sala' : 'Já tem uma corrida acontecendo — espere acabar');
      const st = stationById(slot), h = estacaoParaMundo(st, BARRACA_CORRIDA.x, BARRACA_CORRIDA.z);
      if (pl.modo !== 'terra' || Math.hypot(pl.pos[0] - h[0], pl.pos[2] - h[1]) > 7) return fail('Vá até a barraca da corrida na sua estação');
      if (pl.profile.dinheiro < CORRIDA.minDinheiro) return fail(`Você precisa ter pelo menos S$ ${CORRIDA.minDinheiro} para correr`);
      const slots = [...new Set(Array.isArray(a.slots) ? a.slots : [])].filter((s) => s !== slot && this.players.get(s)?.conectado);
      if (!slots.length) return fail('Escolha pelo menos um amigo que esteja na sala');
      this.corrida = { id: uid(this.rnd), dono: slot, estado: 'convite', convidados: slots, aceitos: [], recusados: [], ate: now + CORRIDA.conviteMs };
      return ok('Convite enviado! Esperando os amigos aceitarem…', [{ t: 'corrida_convite', id: this.corrida.id, dono: slot, nome: pl.profile.nome, convidados: slots, ms: CORRIDA.conviteMs }]);
    }
    if (a.tipo === 'corrida_responder') {
      if (!C || C.estado !== 'convite' || C.id !== a.id || !C.convidados.includes(slot)) return fail('Esse convite já acabou');
      if (C.aceitos.includes(slot) || C.recusados.includes(slot)) return fail('Você já respondeu');
      if (a.aceitar && pl.profile.dinheiro < CORRIDA.minDinheiro) return fail(`Você precisa ter pelo menos S$ ${CORRIDA.minDinheiro} para aceitar`);
      if (a.aceitar && pl.modo === 'nadando') return fail('Saia da água para aceitar');
      (a.aceitar ? C.aceitos : C.recusados).push(slot);
      const ev = [{ t: 'corrida_resposta', id: C.id, slot, nome: pl.profile.nome, aceitou: !!a.aceitar }];
      if (C.aceitos.length + C.recusados.length >= C.convidados.length) ev.push(...this.fecharConvite(now));
      return ok(a.aceitar ? 'Você aceitou a corrida!' : 'Você recusou a corrida', ev);
    }
    if (a.tipo === 'corrida_cancelar') {
      if (!C || C.dono !== slot || C.estado !== 'convite') return fail('Nada para cancelar');
      this.corrida = null;
      return ok('Convite cancelado', [{ t: 'corrida_cancelada', id: C.id, msg: 'O convite de corrida foi cancelado' }]);
    }
    if (a.tipo === 'corrida_checkpoint') {
      if (!C || C.estado !== 'correndo' || C.id !== a.id || !C.participantes.includes(slot)) return fail('');
      if (now < C.largaEm) return fail('Ainda não largou!');
      const i = a.i | 0, cp = C.checkpoints[i];
      if (!cp || C.pegos[slot].includes(i)) return fail('');
      if (pl.modo !== 'sub' || Math.hypot(pl.sub.pos[0] - cp[0], pl.sub.pos[2] - cp[2]) > CORRIDA.raioCheck + 2.5 || pl.sub.pos[1] < -6) return fail('Passe por cima do palito com o submarino');
      C.pegos[slot].push(i);
      const ev = [{ t: 'corrida_ponto', id: C.id, slot, i, n: C.pegos[slot].length }];
      if (C.pegos[slot].length >= C.checkpoints.length) ev.push(...this.fimCorrida(slot, now));
      return ok('', ev);
    }
    return fail('Ação de corrida inválida');
  }
  fecharConvite(now) {
    const C = this.corrida;
    const vivos = C.aceitos.filter((s) => this.players.get(s)?.conectado && this.players.get(s).profile.dinheiro >= CORRIDA.minDinheiro);
    if (!vivos.length || !this.players.get(C.dono)?.conectado) {
      this.corrida = null;
      return [{ t: 'corrida_cancelada', id: C.id, msg: 'Ninguém aceitou a corrida' }];
    }
    // largada: todos no submarino, lado a lado, no meio do lago
    const part = [C.dono, ...vivos];
    const ang0 = this.rnd() * Math.PI * 2;
    const cps = [];
    for (let i = 0; i < CORRIDA.checkpoints; i++) {
      // espalhados pelo lago, longe dos píeres (raio < 48) e da largada
      const ang = ang0 + (i + 0.3 + this.rnd() * 0.4) * (Math.PI * 2 / CORRIDA.checkpoints);
      const r = 22 + this.rnd() * 24;
      cps.push([+(Math.cos(ang) * r).toFixed(2), 0, +(Math.sin(ang) * r).toFixed(2)]);
    }
    const yaw = ang0 + Math.PI / 2, lado = [Math.cos(ang0), Math.sin(ang0)];
    const largada = {};
    part.forEach((s, i) => { const o = (i - (part.length - 1) / 2) * 6; largada[s] = [lado[0] * o, -0.6, lado[1] * o]; });
    Object.assign(C, { estado: 'correndo', participantes: part, checkpoints: cps, largada, yaw, largaEm: now + CORRIDA.largadaMs, limite: now + CORRIDA.largadaMs + CORRIDA.limiteMs, pegos: Object.fromEntries(part.map((s) => [s, []])) });
    for (const s of part) { const o = this.players.get(s); o.teleLivreAte = now + 8000; o.corrida = C.id; }
    return [{ t: 'corrida_inicio', id: C.id, participantes: part, nomes: Object.fromEntries(part.map((s) => [s, this.players.get(s).profile.nome])), checkpoints: cps, largada, yaw, largaMs: CORRIDA.largadaMs, limiteMs: CORRIDA.limiteMs }];
  }
  fimCorrida(vencedor, now, motivo = '') {
    const C = this.corrida; if (!C) return [];
    this.corrida = null;
    const ganhos = {}, perfis = [];
    const part = C.participantes.filter((s) => this.players.has(s));
    if (vencedor && this.players.has(vencedor)) {
      const perdedores = part.filter((s) => s !== vencedor);
      const div = divisaoCorrida(C.participantes.length);
      let total = 0;
      perdedores.forEach((s, i) => {
        const pr = this.players.get(s).profile;
        const v = Math.min(pr.dinheiro, div.perda[i] ?? div.perda[div.perda.length - 1] ?? 0);
        pr.dinheiro -= v; ganhos[s] = -v; total += v; perfis.push(s);
      });
      this.players.get(vencedor).profile.dinheiro += total; ganhos[vencedor] = total; perfis.push(vencedor);
    }
    for (const s of part) { const o = this.players.get(s); o.teleLivreAte = now + 8000; o.corrida = null; }
    return [{ t: 'corrida_fim', id: C.id, vencedor: vencedor || null, nome: vencedor ? this.players.get(vencedor)?.profile.nome : null, ganhos, participantes: C.participantes, perfis, motivo }];
  }
  tickCorrida(now) {
    const C = this.corrida; if (!C) return [];
    if (C.estado === 'convite') {
      if (now >= C.ate || !this.players.get(C.dono)?.conectado) return this.fecharConvite(now);
      return [];
    }
    // quem saiu da sala sai da corrida; se sobrar 1, a corrida acaba sem prêmio
    const ativos = C.participantes.filter((s) => this.players.get(s)?.conectado);
    if (ativos.length < 2) return this.fimCorrida(null, now, 'Os outros corredores saíram — corrida cancelada, ninguém paga nada.');
    if (now >= C.limite) return this.fimCorrida(null, now, 'Tempo esgotado: ninguém pegou todos os palitos. Ninguém paga nada.');
    return [];
  }
  corridaPublica(now) {
    const C = this.corrida; if (!C) return null;
    if (C.estado === 'convite') return { id: C.id, estado: 'convite', dono: C.dono, convidados: C.convidados, aceitos: C.aceitos, recusados: C.recusados, resta: Math.max(0, C.ate - now) };
    return { id: C.id, estado: 'correndo', participantes: C.participantes, pegos: C.pegos, largaEm: C.largaEm - now, resta: Math.max(0, C.limite - now) };
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
      dinheiro: p.dinheiro, lixo: p.lixoMao?.tipo || null, mic: !!pl.mic, corrida: pl.corrida || null,
      estacao: { ...p.estacao, aquario: p.aquario, tanque: p.tanque, vara: p.vara, pesado: p.pesado, cargaN: p.carga.length },
    };
  }
  snapshot(now = Date.now()) {
    const players = {};
    for (const [slot, pl] of this.players) players[slot] = this.publicPlayer(pl, now);
    return { code: this.code, tempo: this.worldTime(now), players, kraken: krakenPublico(this.world.kraken, now), tubarao: tubaraoPublico(this.world, now), corrida: this.corridaPublica(now) };
  }
  worldSnapshot() {
    return { items: Object.values(this.world.items), projeteis: this.world.projeteis };
  }
  naEstacao(slot) { const pl = this.players.get(slot); return pl ? estaNaEstacao(pl) : false; }
}

export { terrainHeight };
