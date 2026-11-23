// ABISMO DE SUCATA — Sala (instância temporária do lago).
// Usada pelo servidor WebSocket (multiplayer real) e pelo servidor local do navegador (modo solo).
// A sala NÃO é dona da progressão: cada jogador traz o próprio perfil, que é salvo fora daqui.

import { avancarMissao, applyAction, createWorld, tickWorld, stepProjectiles, checkSurface, checkDiscovery, estaNaEstacao, tickKraken, krakenPublico, tickTubarao, tubaraoPublico, uid, darFilhoteKraken, rendaAquario } from './rules.js';
import { STATIONS, stationById, hourOfDay, terrainHeight, estacaoParaMundo, BARRACA_CORRIDA, LAKE_R, VAGA_CARRO, estacaoYaw, PISTA_R } from './world.js';
import { CORES_JOGADOR, KRAKEN, CORRIDA, divisaoCorrida, DOACAO, ESPECIES, capPeixes, VEICULOS, CORRIDA_CARRO, divisaoCorridaCarro, ARMAS } from './data.js';

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
    this.veiculos = new Map(); // dono (slot) -> veículo equipado {tipo, pos, rot, vel, luz, trancado, ocup[]}
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
    this.resetVeiculo(slot);
    return { ok: true, slot };
  }

  leave(slot, now = Date.now(), definitivo = false) {
    const pl = this.players.get(slot);
    if (!pl) return;
    if (definitivo) { this.tirarDoVeiculo(slot); this.veiculos.delete(slot); this.players.delete(slot); return; }
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
    // estados que o navegador mandou antes de saber que entrou no veículo ainda dizem 'terra': nos primeiros 1,5 s eles não tiram ninguém do carro
    const acabouDeEntrar = pl.veic && now - (pl.veicDesde || 0) < 1500;
    if (['terra', 'sub', 'nadando', 'guindaste'].includes(s.modo) && !acabouDeEntrar) { pl.modo = s.modo; if (pl.veic) this.tirarDoVeiculo(slot); }
    else if (s.modo === 'carro' && pl.veic) pl.modo = 'carro';
    // quem dirige manda a posição do veículo
    if (pl.veic && pl.veic.lugar === 0 && s.veic && vec(s.veic.pos)) {
      const v = this.veiculos.get(pl.veic.dono);
      if (v) { v.pos = s.veic.pos; if (num(s.veic.rot)) v.rot = s.veic.rot; if (vec(s.veic.vel)) v.vel = s.veic.vel; v.luz = !!s.veic.luz; }
    }
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
    if (typeof a?.tipo === 'string' && a.tipo.startsWith('veic_') && a.tipo !== 'veic_equipar') {
      const res = this.veicAcao(slot, pl, a, now);
      return { res, events: res.events || [], dirty: false };
    }
    if (a?.tipo === 'doar' || a?.tipo === 'doar_responder') {
      const res = this.doacaoAcao(slot, pl, a, now);
      return { res, events: res.events || [], dirty: res.ok && a.tipo === 'doar_responder' && !!a.aceitar };
    }
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
    // trocou/comprou veículo: o novo aparece na vaga de estacionamento (o antigo some de onde estava)
    if (res.ok && (a.tipo === 'veic_equipar' || (a.tipo === 'comprar' && a.cat === 'veiculo'))) events.push(...this.resetVeiculo(slot, 'equipou'));
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
    if (this.doacoes) for (const [alvo, d] of this.doacoes) if (d.ate < now) { this.doacoes.delete(alvo); ev.push({ t: 'doacao_resposta', id: d.id, de: d.de, alvo, aceitou: false, expirou: true }); }
    for (const [slot, pl] of this.players) {
      if (!pl.conectado && now - pl.caiuEm > RECONEXAO_MS) {
        ev.push(...this.removerVeiculo(slot));
        this.players.delete(slot);
        ev.push({ t: 'saiu', slot });
      }
      if (pl.stunUntil && pl.stunUntil <= now && !pl._stunAvisado) { pl._stunAvisado = true; ev.push({ t: 'fim_atordoado', alvo: slot }); }
      if (pl.stunUntil > now) pl._stunAvisado = false;
      if (pl.profile && pl.conectado !== false) { const r = rendaAquario(pl.profile, dt * 1000); if (r > 0) ev.push({ t: 'renda_aquario', slot, v: r, perfis: [slot] }); }
    }
    return ev;
  }

  // Kraken derrotado: todo mundo que acertou ele ganha o prêmio (sem multiplicador) e um filhote vivo
  premiarKraken(evs) {
    for (const e of evs) {
      if (e.t !== 'kraken_morto' || e.premio) continue;
      e.premio = KRAKEN.premio; e.perfis = []; e.filhote = {};
      const quem = new Set(Object.keys(e.dano || {}).filter((s) => (e.dano[s] || 0) > 0)); quem.add(String(e.por));
      for (const [slot, pl] of this.players) {
        if (!quem.has(String(slot))) continue;
        pl.profile.dinheiro += KRAKEN.premio; e.filhote[slot] = darFilhoteKraken(pl.profile, this.rnd); e.perfis.push(slot);
      }
    }
  }

  // ------------------------------------------------------------------ veículos (garagem, entrar, sair, trancar, buzina, água, atropelar)
  garagem(dono) {
    const st = stationById(dono); const [x, z] = estacaoParaMundo(st, VAGA_CARRO.x, VAGA_CARRO.z);
    return { pos: [+x.toFixed(2), 1.56, +z.toFixed(2)], rot: VAGA_CARRO.yaw + estacaoYaw(st) };
  }
  tirarDoVeiculo(slot) {
    const pl = this.players.get(slot); if (!pl?.veic) return null;
    const v = this.veiculos.get(pl.veic.dono); if (v && v.ocup[pl.veic.lugar] === slot) v.ocup[pl.veic.lugar] = null;
    const era = pl.veic; pl.veic = null; if (pl.modo === 'carro') pl.modo = 'terra';
    return era;
  }
  // põe o veículo equipado do dono na vaga (todo mundo que estava dentro desce)
  resetVeiculo(dono, motivo = '') {
    const pl = this.players.get(dono); if (!pl) return [];
    const tipo = pl.profile.veiculos?.eq && VEICULOS[pl.profile.veiculos.eq] ? pl.profile.veiculos.eq : 'patinete';
    const velho = this.veiculos.get(dono), ejetados = [];
    if (velho) for (const o of velho.ocup) if (o) { const op = this.players.get(o); if (op?.veic?.dono === dono) { op.veic = null; if (op.modo === 'carro') op.modo = motivo === 'agua' ? 'nadando' : 'terra'; } ejetados.push(o); }
    const g = this.garagem(dono);
    this.veiculos.set(dono, { tipo, pos: g.pos, rot: g.rot, vel: [0, 0, 0], luz: false, trancado: false, ocup: Array(VEICULOS[tipo].lugares).fill(null) });
    return [{ t: 'veic_reset', dono, tipo, pos: g.pos, rot: g.rot, ejetados, motivo }];
  }
  removerVeiculo(dono) {
    const v = this.veiculos.get(dono); if (!v) return [];
    for (const o of v.ocup) if (o && o !== dono) { const op = this.players.get(o); if (op) { op.veic = null; if (op.modo === 'carro') op.modo = 'terra'; } }
    this.veiculos.delete(dono);
    return [{ t: 'veic_removido', dono, ejetados: v.ocup.filter((o) => o && o !== dono) }];
  }
  veiculosPublicos() {
    const out = {};
    for (const [d, v] of this.veiculos) out[d] = { tipo: v.tipo, pos: v.pos, rot: v.rot, vel: v.vel, luz: v.luz, trancado: v.trancado, ocup: v.ocup };
    return out;
  }
  veicAcao(slot, pl, a, now) {
    const fail = (msg) => ({ ok: false, msg, events: [] });
    const ok = (msg, events = []) => ({ ok: true, msg, events });
    if (a.tipo === 'veic_entrar') {
      if (pl.veic) return fail('Você já está num veículo');
      if (pl.modo !== 'terra') return fail('Chegue perto do veículo andando');
      const dono = String(a.dono), v = this.veiculos.get(dono); if (!v) return fail('Veículo não encontrado');
      const spec = VEICULOS[v.tipo];
      if (Math.hypot(pl.pos[0] - v.pos[0], pl.pos[2] - v.pos[2]) > spec.comp / 2 + 2.6) return fail('Chegue mais perto do veículo');
      if (v.trancado && dono !== slot) return fail(`🔒 O veículo de ${this.players.get(dono)?.profile.nome || 'alguém'} está trancado`);
      if (this.corrida?.estado === 'correndo' && this.corrida.modo === 'carro' && this.corrida.participantes.includes(dono) && dono !== slot) return fail('Esse veículo está numa corrida');
      let lugar = v.ocup.findIndex((o) => o === null);
      // o dono sempre pode assumir o volante se ele estiver vazio; os outros entram onde tiver lugar
      if (lugar < 0) return fail(`Lotado (${spec.lugares}/${spec.lugares} lugares)`);
      v.ocup[lugar] = slot; pl.veic = { dono, lugar }; pl.modo = 'carro'; pl.veicDesde = now ?? Date.now();
      return { ...ok(lugar === 0 ? `Você está dirigindo: ${spec.nome}` : `Você entrou de carona (${spec.nome})`, [{ t: 'veic_entrou', dono, slot, lugar }]), lugar };
    }
    if (a.tipo === 'veic_sair') {
      const era = this.tirarDoVeiculo(slot); if (!era) return fail('Você não está num veículo');
      const v = this.veiculos.get(era.dono); if (v && era.lugar === 0) v.vel = [0, 0, 0];
      return ok('', [{ t: 'veic_saiu', dono: era.dono, slot, lugar: era.lugar }]);
    }
    if (a.tipo === 'veic_trancar') {
      if (!pl.veic) return fail('Entre no veículo para trancar');
      const v = this.veiculos.get(pl.veic.dono); if (!v) return fail('Veículo não encontrado');
      if (pl.veic.lugar !== 0 && pl.veic.dono !== slot) return fail('Só quem dirige (ou o dono) tranca o veículo');
      v.trancado = !v.trancado;
      return ok(v.trancado ? '🔒 Veículo trancado: ninguém mais entra' : '🔓 Veículo destrancado', [{ t: 'veic_tranca', dono: pl.veic.dono, trancado: v.trancado, pos: v.pos }]);
    }
    if (a.tipo === 'veic_buzina') {
      if (!pl.veic || pl.veic.lugar !== 0) return fail('');
      const v = this.veiculos.get(pl.veic.dono);
      return ok('', [{ t: 'veic_buzina', dono: pl.veic.dono, por: slot, liga: a.liga !== false, tipo: v?.tipo, pos: v?.pos }]);
    }
    if (a.tipo === 'veic_agua') {
      // caiu no lago: o veículo some e volta para a garagem; quem estava dentro sai nadando
      if (!pl.veic || pl.veic.lugar !== 0) return fail('');
      const dono = pl.veic.dono;
      return ok('Seu veículo afundou! Ele voltou para a vaga da garagem.', this.resetVeiculo(dono, 'agua'));
    }
    if (a.tipo === 'veic_atropelar') {
      if (!pl.veic || pl.veic.lugar !== 0) return fail('');
      const v = this.veiculos.get(pl.veic.dono), alvo = this.players.get(String(a.alvo));
      if (!v || !alvo || alvo.slot === slot || alvo.veic || alvo.modo === 'sub' || alvo.modo === 'guindaste') return fail('');
      const vel = Math.hypot(v.vel[0], v.vel[2]); if (vel < 3) return fail('');
      if (Math.hypot(alvo.pos[0] - v.pos[0], alvo.pos[2] - v.pos[2]) > VEICULOS[v.tipo].comp / 2 + 2.5) return fail('');
      if ((alvo.atropeladoAte || 0) > now) return fail('');
      alvo.atropeladoAte = now + 1500; alvo.empurraoAte = now + 3500;
      let dx = alvo.pos[0] - v.pos[0], dz = alvo.pos[2] - v.pos[2]; const dl = Math.hypot(dx, dz) || 1;
      dx = dx / dl * 0.5 + v.vel[0] / vel * 0.5; dz = dz / dl * 0.5 + v.vel[2] / vel * 0.5; const d2 = Math.hypot(dx, dz) || 1;
      const E = ARMAS.bazuca.empurrao, k = Math.min(1, 0.45 + vel / 20);
      const emp = [+(dx / d2 * E[0] * k).toFixed(2), +(E[1] * k).toFixed(2), +(dz / d2 * E[0] * k).toFixed(2)];
      return ok('', [{ t: 'atropelado', alvo: alvo.slot, por: slot, empurrao: emp }]);
    }
    if (a.tipo === 'veic_empurrao') {
      // batida de carro com carro: o outro é jogado (se alguém dirige, o cliente dele aplica; se está parado, a sala desloca)
      if (!pl.veic || pl.veic.lugar !== 0) return fail('');
      const v = this.veiculos.get(String(a.dono)); const imp = a.imp;
      if (!v || String(a.dono) === pl.veic.dono || !Array.isArray(imp) || imp.length !== 2 || !imp.every((x) => typeof x === 'number' && isFinite(x))) return fail('');
      const meu = this.veiculos.get(pl.veic.dono);
      if (!meu || Math.hypot(meu.pos[0] - v.pos[0], meu.pos[2] - v.pos[2]) > 8) return fail('');
      const m = Math.min(1, 25 / (Math.hypot(imp[0], imp[1]) || 1)); const I = [imp[0] * m, imp[1] * m];
      if (!v.ocup[0]) { v.pos = [v.pos[0] + I[0] * 0.25, v.pos[1], v.pos[2] + I[1] * 0.25]; }
      return ok('', [{ t: 'veic_batida', dono: String(a.dono), imp: I, pos: v.pos, por: slot }]);
    }
    return fail('Ação de veículo inválida');
  }

  // ------------------------------------------------------------------ doar o peixe da mão para um amigo perto
  // X perto de alguém oferece; o amigo aceita (Y) ou recusa (N). O peixe só sai da sua mão quando ele aceita.
  doacaoAcao(slot, pl, a, now) {
    const fail = (msg) => ({ ok: false, msg, events: [] });
    const ok = (msg, events = []) => ({ ok: true, msg, events });
    this.doacoes ||= new Map();
    if (a.tipo === 'doar') {
      const f = pl.profile.mao; if (!f) return fail('Pegue um peixe na mão para doar');
      if (pl.modo === 'sub') return fail('Saia do submarino para doar');
      let alvo = null, dmin = DOACAO.alcance;
      for (const [s2, o] of this.players) {
        if (s2 === slot || !o.conectado || o.modo === 'sub' || !o.pos) continue;
        const d = Math.hypot(o.pos[0] - pl.pos[0], o.pos[1] - pl.pos[1], o.pos[2] - pl.pos[2]);
        if (d < dmin) { dmin = d; alvo = s2; }
      }
      if (alvo === null) return fail('Não tem ninguém perto para doar');
      const pend = this.doacoes.get(alvo);
      if (pend && pend.ate > now) return fail(`${this.players.get(alvo).profile.nome} já tem uma doação esperando resposta`);
      const d = { id: uid(this.rnd), de: slot, alvo, uid: f.uid, ate: now + DOACAO.expiraMs };
      this.doacoes.set(alvo, d);
      return ok(`Oferecendo ${ESPECIES[f.esp].nome} para ${this.players.get(alvo).profile.nome}… esperando ele aceitar`, [{ t: 'doacao_oferta', id: d.id, de: slot, alvo, nome: pl.profile.nome, esp: f.esp, cm: f.cm, cortado: !!f.cortado, ms: DOACAO.expiraMs }]);
    }
    const d = this.doacoes.get(slot);
    if (!d || d.id !== a.id || d.ate < now) return fail('Essa doação já acabou');
    this.doacoes.delete(slot);
    const doador = this.players.get(d.de);
    if (!a.aceitar) return ok('Você recusou o peixe', [{ t: 'doacao_resposta', id: d.id, de: d.de, alvo: slot, nome: pl.profile.nome, aceitou: false }]);
    const gp = doador?.profile;
    if (!gp?.mao || gp.mao.uid !== d.uid) return fail('O peixe não está mais com ele');
    const f = gp.mao, p = pl.profile, cacado = ESPECIES[f.esp].cacado;
    let onde;
    if (!p.mao) { p.mao = f; onde = 'na mão'; }
    else if (!cacado && p.mochila.length < capPeixes(p)) { p.mochila.push(f); onde = 'na mochila'; }
    else return fail(cacado ? 'Esvazie as mãos para receber o tubarão' : 'Suas mãos e a mochila estão cheias');
    gp.mao = null;
    return ok(`Você recebeu ${ESPECIES[f.esp].nome} (${f.cm} cm) ${onde}!`, [{ t: 'doacao_resposta', id: d.id, de: d.de, alvo: slot, nome: p.nome, aceitou: true, esp: f.esp, perfis: [d.de, slot] }]);
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
      if (a.modo === 'carro' && pl.modo !== 'terra') return fail('Desça do veículo e vá até a barraca da corrida');
      const modo = a.modo === 'carro' ? 'carro' : 'sub', minD = modo === 'carro' ? CORRIDA_CARRO.minDinheiro : CORRIDA.minDinheiro;
      if (pl.profile.dinheiro < minD) return fail(`Você precisa ter pelo menos S$ ${minD} para correr`);
      const slots = [...new Set(Array.isArray(a.slots) ? a.slots : [])].filter((s) => s !== slot && this.players.get(s)?.conectado);
      if (!slots.length) return fail('Escolha pelo menos um amigo que esteja na sala');
      this.corrida = { id: uid(this.rnd), dono: slot, modo, estado: 'convite', convidados: slots, aceitos: [], recusados: [], ate: now + CORRIDA.conviteMs };
      return ok('Convite enviado! Esperando os amigos aceitarem…', [{ t: 'corrida_convite', id: this.corrida.id, dono: slot, modo, nome: pl.profile.nome, convidados: slots, ms: CORRIDA.conviteMs }]);
    }
    if (a.tipo === 'corrida_responder') {
      if (!C || C.estado !== 'convite' || C.id !== a.id || !C.convidados.includes(slot)) return fail('Esse convite já acabou');
      if (C.aceitos.includes(slot) || C.recusados.includes(slot)) return fail('Você já respondeu');
      { const minD = C.modo === 'carro' ? CORRIDA_CARRO.minDinheiro : CORRIDA.minDinheiro; if (a.aceitar && pl.profile.dinheiro < minD) return fail(`Você precisa ter pelo menos S$ ${minD} para aceitar`); }
      if (a.aceitar && pl.modo === 'nadando') return fail('Saia da água para aceitar');
      if (a.aceitar && C.modo === 'carro' && (pl.modo === 'sub' || pl.modo === 'guindaste')) return fail('Saia do submarino para aceitar a corrida de carro');
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
      if (C.modo === 'carro') {
        // na ordem, dirigindo o próprio veículo
        if (i !== C.pegos[slot].length) return fail('Passe pelos checkpoints na ordem');
        const v = pl.veic && pl.veic.lugar === 0 ? this.veiculos.get(pl.veic.dono) : null;
        if (!v || Math.hypot(v.pos[0] - cp[0], v.pos[2] - cp[2]) > CORRIDA_CARRO.raioCheck + 3) return fail('Passe pelo checkpoint dirigindo');
      } else if (pl.modo !== 'sub' || Math.hypot(pl.sub.pos[0] - cp[0], pl.sub.pos[2] - cp[2]) > CORRIDA.raioCheck + 2.5 || pl.sub.pos[1] < -6) return fail('Passe por cima do palito com o submarino');
      C.pegos[slot].push(i);
      const ev = [{ t: 'corrida_ponto', id: C.id, slot, i, n: C.pegos[slot].length }];
      if (C.pegos[slot].length >= C.checkpoints.length) ev.push(...this.fimCorrida(slot, now));
      return ok('', ev);
    }
    return fail('Ação de corrida inválida');
  }
  fecharConvite(now) {
    const C = this.corrida;
    const minD = C.modo === 'carro' ? CORRIDA_CARRO.minDinheiro : CORRIDA.minDinheiro;
    const vivos = C.aceitos.filter((s) => this.players.get(s)?.conectado && this.players.get(s).profile.dinheiro >= minD);
    if (!vivos.length || !this.players.get(C.dono)?.conectado) {
      this.corrida = null;
      return [{ t: 'corrida_cancelada', id: C.id, msg: 'Ninguém aceitou a corrida' }];
    }
    const part = [C.dono, ...vivos];
    if (C.modo === 'carro') return this.largadaCarro(C, part, now);
    // largada: todos no submarino, lado a lado, no meio do lago
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
  // corrida de carro: largada atrás da estação de quem chamou, na trilha em volta do lago; checkpoints a cada 1/8 de volta,
  // o último é a própria linha de largada (volta completa). Cada um corre com o veículo equipado.
  largadaCarro(C, part, now) {
    const st = stationById(C.dono), a0 = Math.atan2(st.pad[1], st.pad[0]);
    const N = CORRIDA_CARRO.checkpoints, cps = [];
    for (let i = 1; i <= N; i++) { const a = a0 + (i / N) * Math.PI * 2; cps.push([+(Math.cos(a) * PISTA_R).toFixed(2), +terrainHeight(Math.cos(a) * PISTA_R, Math.sin(a) * PISTA_R).toFixed(2), +(Math.sin(a) * PISTA_R).toFixed(2)]); }
    // tangente no sentido anti-horário (a = a0 + …): direção (-sin, cos)
    const tg = [-Math.sin(a0), Math.cos(a0)], rad = [Math.cos(a0), Math.sin(a0)];
    const yaw = Math.atan2(tg[0], tg[1]), largada = {};
    part.forEach((s, i) => {
      const fila = Math.floor(i / 2), lado = (i % 2 ? 1 : -1) * 2.6;
      const x = rad[0] * (PISTA_R + lado) - tg[0] * (6 + fila * 7), z = rad[1] * (PISTA_R + lado) - tg[1] * (6 + fila * 7);
      largada[s] = [+x.toFixed(2), +(terrainHeight(x, z) + 0.05).toFixed(2), +z.toFixed(2)];
    });
    const ev = [];
    for (const s of part) {
      ev.push(...this.resetVeiculo(s, 'corrida'));
      const v = this.veiculos.get(s), o = this.players.get(s);
      v.pos = largada[s]; v.rot = yaw; v.trancado = false;
      if (o.veic) this.tirarDoVeiculo(s);
      v.ocup[0] = s; o.veic = { dono: s, lugar: 0 }; o.modo = 'carro';
      o.teleLivreAte = now + 8000; o.corrida = C.id;
    }
    Object.assign(C, { estado: 'correndo', participantes: part, checkpoints: cps, largada, yaw, largaEm: now + CORRIDA_CARRO.largadaMs, limite: now + CORRIDA_CARRO.largadaMs + CORRIDA_CARRO.limiteMs, pegos: Object.fromEntries(part.map((s) => [s, []])) });
    ev.push({ t: 'corrida_inicio', id: C.id, modo: 'carro', participantes: part, nomes: Object.fromEntries(part.map((s) => [s, this.players.get(s).profile.nome])), checkpoints: cps, largada, yaw, largaMs: CORRIDA_CARRO.largadaMs, limiteMs: CORRIDA_CARRO.limiteMs });
    return ev;
  }
  fimCorrida(vencedor, now, motivo = '') {
    const C = this.corrida; if (!C) return [];
    this.corrida = null;
    const ganhos = {}, perfis = [];
    const part = C.participantes.filter((s) => this.players.has(s));
    if (vencedor && this.players.has(vencedor)) {
      const perdedores = part.filter((s) => s !== vencedor);
      const div = C.modo === 'carro' ? divisaoCorridaCarro(C.participantes.length) : divisaoCorrida(C.participantes.length);
      let total = 0;
      perdedores.forEach((s, i) => {
        const pr = this.players.get(s).profile;
        const v = Math.min(pr.dinheiro, div.perda[i] ?? div.perda[div.perda.length - 1] ?? 0);
        pr.dinheiro -= v; ganhos[s] = -v; total += v; perfis.push(s);
      });
      this.players.get(vencedor).profile.dinheiro += total; ganhos[vencedor] = total; perfis.push(vencedor);
    }
    for (const s of part) { const o = this.players.get(s); o.teleLivreAte = now + 8000; o.corrida = null; }
    return [{ t: 'corrida_fim', id: C.id, modo: C.modo, vencedor: vencedor || null, nome: vencedor ? this.players.get(vencedor)?.profile.nome : null, ganhos, participantes: C.participantes, perfis, motivo }];
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
    if (now >= C.limite) return this.fimCorrida(null, now, 'Tempo esgotado: ninguém completou a corrida. Ninguém paga nada.');
    return [];
  }
  corridaPublica(now) {
    const C = this.corrida; if (!C) return null;
    if (C.estado === 'convite') return { id: C.id, modo: C.modo, estado: 'convite', dono: C.dono, convidados: C.convidados, aceitos: C.aceitos, recusados: C.recusados, resta: Math.max(0, C.ate - now) };
    return { id: C.id, modo: C.modo, estado: 'correndo', checkpoints: C.checkpoints, participantes: C.participantes, pegos: C.pegos, largaEm: C.largaEm - now, resta: Math.max(0, C.limite - now) };
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
      dinheiro: p.dinheiro, lixo: p.lixoMao?.tipo || null, peixaria: p.peixaria || null, mic: !!pl.mic, corrida: pl.corrida || null, veic: pl.veic || null,
      estacao: { ...p.estacao, aquario: p.aquario, tanque: p.tanque, vitrine: p.vitrine, vara: p.vara, pesado: p.pesado, cargaN: p.carga.length },
    };
  }
  snapshot(now = Date.now()) {
    const players = {};
    for (const [slot, pl] of this.players) players[slot] = this.publicPlayer(pl, now);
    return { code: this.code, tempo: this.worldTime(now), players, kraken: krakenPublico(this.world.kraken, now), tubarao: tubaraoPublico(this.world, now), corrida: this.corridaPublica(now), veiculos: this.veiculosPublicos() };
  }
  worldSnapshot() {
    return { items: Object.values(this.world.items), projeteis: this.world.projeteis };
  }
  naEstacao(slot) { const pl = this.players.get(slot); return pl ? estaNaEstacao(pl) : false; }
}

export { terrainHeight };
