// v0.9: Kraken do abismo, corrida de submarino, estilingue de lixo, chat de voz e ranking.
// Métodos misturados na classe Game (main.js) com Object.assign(Game.prototype, Novidades).
import { Node } from '../engine/renderer.js';
import { Geo, cylinder, torus, sphere } from '../engine/geometry.js';
import { Kraken } from '../entities/kraken.js';
import { itemNode } from '../entities/items.js';
import { Voz } from '../systems/voz.js';
import { ARMAS, CORRIDA, KRAKEN, LIXO, SUCATA, TUBARAO, textoPremioCorrida, divisaoCorrida } from '../../shared/data.js';
import { stationById, tubaraoPos } from '../../shared/world.js';
import { fishNode } from '../entities/station.js';
import { lerp } from '../engine/math.js';
import { subStats } from '../../shared/rules.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const Novidades = {
  initNovidades() {
    this.kr = new Kraken(this.R);
    this.scene.add(this.kr.root);
    this.krSnap = null; this.krSnapEm = 0;
    this.tbSnap = null; this.tbSnapEm = 0; this.carcacas = new Map(); // id -> { c, n }
    this.tubNode = fishNode(this.R, 'tubarao', 360); this.tubNode.visible = false; this.scene.add(this.tubNode);
    this.corrida = null;       // corrida em que EU estou: { id, participantes, checkpoints, nos, largaEm, ... }
    this.convite = null;       // convite recebido pendente
    this.corridaSel = new Set(); // amigos escolhidos no painel da barraca
    this.voz = new Voz(this.net, this.slot); this.voz.game = this;
    this.vozMsgAte = 0;
    this.atualizarVozHud();
  },

  // ------------------------------------------------------------ snapshots e eventos
  snapNovidades(s) {
    this.krSnap = s.kraken || null; this.krSnapEm = performance.now();
    this.tbSnap = s.tubarao || null; this.tbSnapEm = performance.now();
    if (s.tubarao) this.sincronizarCarcacas(s.tubarao.carcacas || []);
    this.corridaSnap = s.corrida || null;
  },
  eventoNovidades(e) {
    switch (e.t) {
      case 'kraken_aviso': this.ui.aviso(`🐙 O KRAKEN vai surgir no meio do lago em ${Math.round(e.em / 1000)} s! Prepare as armas.`, 'info', 6000); this.audio.alarm?.(); return true;
      case 'kraken_surgiu':
        this.ui.aviso('🐙 O KRAKEN DO ABISMO SURGIU! Atire nele dos píeres — quem acertar ganha S$ 1.000 + um filhote de Kraken quando ele cair', 'ruim', 7000);
        this.audio.blip(55, 1.4, 'sawtooth', 0.22, -20); this.audio.noise?.(1.6, 220, 0.3, 1); this.shake = 0.5;
        return true;
      case 'kraken_fugiu': this.ui.aviso('🐙 O Kraken voltou para o abismo… ele volta em 20 minutos.', 'info', 5000); return true;
      case 'kraken_morto': {
        const quem = e.por === this.slot ? 'Você' : this.remotos[e.por]?.nome || 'Alguém';
        if (e.pos) { this.explosao(e.pos, true); for (let k = 0; k < 4; k++) this.particles.ink([e.pos[0] + (Math.random() - 0.5) * 8, e.pos[1], e.pos[2] + (Math.random() - 0.5) * 8], 120); }
        const meu = e.filhote?.[this.slot];
        this.ui.aviso(`🐙 KRAKEN DERROTADO! ${quem} deu o último tiro.` + (meu ? ` Você ganhou S$ ${fmt(e.premio || KRAKEN.premio)} + um FILHOTE DE KRAKEN vivo (na ${meu}) — vale S$ 600, dá para pôr no aquário!` : ' Só quem acertou ele ganha o prêmio.'), 'ok', 9000);
        this.audio.coin(); setTimeout(() => this.audio.coin(), 180); setTimeout(() => this.audio.coin(), 360);
        this.krSnap = { vivo: false, em: KRAKEN.intervaloMs }; this.krSnapEm = performance.now();
        return true;
      }
      case 'renda_aquario': if (e.slot === this.slot) this.ui.aviso(`🐠 Seu aquário rendeu S$ ${fmt(e.v)}`, 'ok', 2500); return true;
      case 'tubarao_surgiu': this.ui.aviso('🦈 Um tubarão está rondando a frente dos píeres! Derrube com as armas e venda por S$ 400.', 'info', 6000); return false;
      case 'tubarao_morto': {
        const quem = e.por === this.slot ? 'Você' : this.remotos[e.por]?.nome || 'Alguém';
        this.ui.aviso(`🦈 ${quem} derrubou o tubarão! Ele está boiando — nade até lá e aperte E para pegar (vale S$ ${TUBARAO.valor}). Outro só aparece 5 min depois que alguém pegar este.`, 'ok', 6000);
        if (e.carcaca) { this.particles.splash(e.carcaca.pos[0], e.carcaca.pos[2], this.t, 0.6); this.sincronizarCarcacas([...[...this.carcacas.values()].map((x) => x.c), e.carcaca]); }
        this.tbSnap = { ...(this.tbSnap || {}), vivo: false };
        return false;
      }
      case 'carcaca_nova':
        if (e.de === this.slot) this.ui.aviso('Você deixou o tubarão cair! Pegue de volta (E) antes que alguém leve.', 'ruim', 4000);
        else if (this.remotos[e.de]) this.ui.aviso(`${this.remotos[e.de].nome} deixou o tubarão cair!`, 'info');
        this.sincronizarCarcacas([...[...this.carcacas.values()].map((x) => x.c), e.carcaca]);
        return false;
      case 'carcaca_pega':
        if (this.carcacas.has(e.id)) { this.fxRoot.remove(this.carcacas.get(e.id).n); this.carcacas.delete(e.id); }
        if (e.slot !== this.slot && this.remotos[e.slot]) this.ui.aviso(`🦈 ${this.remotos[e.slot].nome} pegou o tubarão!`, 'info');
        return false;
      case 'corrida_convite': this.onConvite(e); return true;
      case 'corrida_resposta':
        if (this.convite?.id === e.id && e.slot === this.slot) { this.convite = null; $('corridaConvite').hidden = true; }
        if (e.slot !== this.slot && (this.conviteEnviado === e.id || this.convite?.id === e.id)) this.ui.aviso(`${e.nome} ${e.aceitou ? 'aceitou' : 'recusou'} a corrida`, e.aceitou ? 'ok' : 'info');
        return true;
      case 'corrida_cancelada':
        if (this.convite?.id === e.id) { this.convite = null; $('corridaConvite').hidden = true; }
        if (this.conviteEnviado === e.id) { this.ui.aviso(e.msg || 'Corrida cancelada', 'info'); this.conviteEnviado = null; }
        return true;
      case 'corrida_inicio': this.onCorridaInicio(e); return true;
      case 'corrida_ponto':
        if (this.corrida?.id === e.id) {
          this.corrida.pegos[e.slot] = e.n;
          if (e.slot === this.slot) { this.corrida.meus.add(e.i); this.audio.blip(880 + e.n * 120, 0.12, 'square', 0.06, 200); this.ui.aviso(`Palito ${e.n}/${CORRIDA.checkpoints}!`, 'ok', 1200); }
          else this.ui.aviso(`${this.corrida.nomes[e.slot] || 'Alguém'} pegou ${e.n}/${CORRIDA.checkpoints}`, 'info', 1500);
        }
        return true;
      case 'corrida_fim': this.onCorridaFim(e); return true;
    }
    return false;
  },

  // ------------------------------------------------------------ por quadro
  updateNovidades(dt, livre) {
    const I = this.input;
    // Kraken: avança o tempo local entre snapshots
    const k = this.krSnap, dk = (performance.now() - this.krSnapEm) / 1000;
    const kl = k?.vivo ? { ...k, t: k.t + dk, resta: k.resta - dk * 1000 } : null;
    this.kr.update(dt, kl, kl ? kl.t : 0);
    const kh = $('krakenHud');
    if (kl && kl.resta > 0) {
      kh.hidden = false;
      const h = `<div class="tit">🐙 KRAKEN DO ABISMO <span>some em ${mmss(kl.resta)}</span></div><div class="barra"><i style="width:${(100 * kl.hp / kl.hpMax).toFixed(1)}%"></i></div><small>${fmt(kl.hp)} / ${fmt(kl.hpMax)} · quem acertar ganha S$ ${fmt(KRAKEN.premio)} + filhote</small>`;
      if (kh._h !== h) { kh.innerHTML = h; kh._h = h; }
    } else if (k && !k.vivo && k.em - dk * 1000 < KRAKEN.avisoMs && k.em - dk * 1000 > 0) {
      kh.hidden = false;
      const h = `<div class="tit">🐙 O Kraken surge em <span>${mmss(k.em - dk * 1000)}</span></div>`;
      if (kh._h !== h) { kh.innerHTML = h; kh._h = h; }
    } else kh.hidden = true;
    // tubarão rondando os píeres (só a barbatana e um pouco das costas de fora)
    const tb = this.tbSnap;
    if (tb?.vivo) {
      const t = tb.t + (performance.now() - this.tbSnapEm) / 1000;
      const { pos, yaw } = tubaraoPos(t, tb.a0);
      this.tubNode.visible = true;
      this.tubNode.at(pos[0], pos[1] + Math.sin(this.t * 1.7) * 0.06, pos[2]).rot(0.03 * Math.sin(this.t * 2.3), yaw + 0.08 * Math.sin(this.t * 3.1), 0);
      this.tubPos = [pos[0], 0.1, pos[2]];
      if (Math.random() < 0.2) this.particles.ripple(pos[0], pos[2], this.t, 0.12);
    } else { this.tubNode.visible = false; this.tubPos = null; }
    for (const { c, n } of this.carcacas.values()) {
      if (c.agua) n.at(c.pos[0], c.pos[1] + 0.15 + Math.sin(this.t * 1.3 + c.pos[0]) * 0.06, c.pos[2]);
    }
    // voz: M liga/desliga
    if (livre && I.hit('KeyM')) this.alternarVoz();
    const minha = this.me.modo === 'sub' || this.me.modo === 'guindaste' ? this.sub.pos : this.me.pos;
    for (const r of Object.values(this.remotos)) r.posVoz = r.modo === 'sub' || r.modo === 'guindaste' ? r.sub.pos : r.char.root.pos;
    this.voz.atualizar(this.remotos, minha);
    if (performance.now() > this.vozMsgAte) $('vozAviso').hidden = true;
    const fal = this.voz.falando().map((s) => this.remotos[s]?.nome).filter(Boolean);
    const fh = fal.length ? '🔊 ' + fal.map(esc).join(', ') : '';
    if ($('vozFalando')._h !== fh) { $('vozFalando').innerHTML = fh; $('vozFalando')._h = fh; $('vozFalando').hidden = !fh; }
    // corrida
    this.updateCorrida(dt, livre);
    // convite: Y aceita, N recusa
    if (this.convite) {
      const resta = this.convite.ate - performance.now();
      if (resta <= 0) { this.convite = null; $('corridaConvite').hidden = true; }
      else {
        $('conviteTempo').textContent = `${Math.ceil(resta / 1000)} s`;
        if (I.hit('KeyY')) this.responderConvite(true);
        else if (I.hit('KeyN')) this.responderConvite(false);
      }
    }
  },

  // ------------------------------------------------------------ tubarão abatido (boiando ou no chão)
  sincronizarCarcacas(lista) {
    const ids = new Set(lista.map((c) => c.id));
    for (const [id, x] of this.carcacas) if (!ids.has(id)) { this.fxRoot.remove(x.n); this.carcacas.delete(id); }
    for (const c of lista) {
      if (this.carcacas.has(c.id)) continue;
      const n = fishNode(this.R, 'tubarao_cacado', 330);
      // de barriga para cima, boiando (ou deitado de lado no chão)
      n.at(c.pos[0], c.pos[1] + (c.agua ? 0.15 : 0.45), c.pos[2]).rot(0, (c.pos[0] * 7) % 6.28, c.agua ? Math.PI : Math.PI / 2);
      this.fxRoot.add(n); this.carcacas.set(c.id, { c, n });
    }
  },
  carcacaPerto(r = TUBARAO.pegarRaio) {
    let best = null, bd = r;
    for (const { c } of this.carcacas.values()) { const d = Math.hypot(c.pos[0] - this.me.pos[0], c.pos[2] - this.me.pos[2]); if (d < bd) { bd = d; best = c; } }
    return best;
  },

  // ------------------------------------------------------------ ranking (top 3 da sala por dinheiro)
  rankingHtml() {
    const lista = [{ nome: this.perfil.nome, din: this.perfil.dinheiro, eu: true }];
    for (const r of Object.values(this.remotos)) if (typeof r.dinheiro === 'number') lista.push({ nome: r.nome, din: r.dinheiro });
    lista.sort((a, b) => b.din - a.din);
    const md = ['🥇', '🥈', '🥉'];
    return lista.slice(0, 3).map((x, i) => `<div class="rank${x.eu ? ' eu' : ''}">${md[i]} ${esc(x.nome)} · S$ ${fmt(x.din)}</div>`).join('');
  },

  // ------------------------------------------------------------ chat de voz
  async alternarVoz() {
    const r = await this.voz.alternar();
    if (!r.ok) { this.ui.aviso(r.msg, 'ruim', 5000); return; }
    this.vozAvisoTopo(r.ligado ? '🎤 Chat de voz ativado' : '🔇 Chat de voz desativado', r.ligado);
    this.audio.blip(r.ligado ? 880 : 440, 0.08, 'sine', 0.05, r.ligado ? 300 : -200);
    this.atualizarVozHud();
  },
  vozAvisoTopo(txt, on) {
    const el = $('vozAviso'); el.textContent = txt; el.className = on ? 'on' : 'off'; el.hidden = false;
    this.vozMsgAte = performance.now() + 2000;
  },
  atualizarVozHud() {
    const on = this.voz?.ligado;
    $('vozHud').innerHTML = `${on ? '🎤' : '🔇'} Chat de voz <kbd>M</kbd> <b class="${on ? 'on' : 'off'}">${on ? 'ligado' : 'desligado'}</b>`;
  },

  // ------------------------------------------------------------ estilingue de lixo
  async atirarLixo() {
    const p = this.perfil;
    if (!p.lixoMao && !p.saco.length) return;
    const dir = this.miraPeixe(true).dir;
    this.me.yaw = Math.atan2(dir[0], dir[2]);
    this.me.acao = { tipo: 'arremesso', t: 0, dur: 0.6 };
    this.audio.blip(220, 0.12, 'triangle', 0.08, 500); // "tóim" do elástico
    await this.acao({ tipo: 'estilingue_atirar', dir });
  },
  // lixo na mão (o seu e o dos amigos)
  updateLixoMao(ch, tipo) {
    if (ch._lixoKey === tipo) return;
    if (ch._lixo) { ch._lixo.parent?.remove(ch._lixo); ch._lixo = null; }
    ch._lixoKey = tipo;
    if (!tipo) return;
    const n = itemNode(this.R, { id: 'mao', tipo, x: 0, y: -0.08, z: 0.04, rot: 0 });
    n.sc(0.8); ch.handR.add(n); ch._lixo = n;
  },

  // ------------------------------------------------------------ corrida de submarino
  onConvite(e) {
    if (e.dono === this.slot) { this.conviteEnviado = e.id; return; }
    if (!e.convidados.includes(this.slot)) { this.ui.aviso(`${e.nome} chamou ${e.convidados.length} amigo(s) para uma corrida de submarino`, 'info'); return; }
    const n = e.convidados.length + 1;
    this.convite = { id: e.id, ate: performance.now() + e.ms };
    $('conviteTexto').innerHTML = `<b>${esc(e.nome)}</b> chamou você para uma <b>corrida de submarino</b>!<br><span class="premio">${esc(textoPremioCorrida(n))}</span><br><small>Se nem todos aceitarem, o prêmio muda conforme quantos correrem (2 corredores: ganha/perde S$ ${CORRIDA.premio2}).</small>`;
    $('corridaConvite').hidden = false;
    this.audio.blip(660, 0.1, 'square', 0.06, 300); setTimeout(() => this.audio.blip(990, 0.12, 'square', 0.06), 140);
  },
  async responderConvite(aceitar) {
    const c = this.convite; if (!c) return;
    this.convite = null; $('corridaConvite').hidden = true;
    await this.acao({ tipo: 'corrida_responder', id: c.id, aceitar });
  },
  async chamarCorrida() {
    const slots = [...this.corridaSel].filter((s) => this.remotos[s]);
    const r = await this.acao({ tipo: 'corrida_convidar', slots });
    if (r.ok) { this.ui.fechar(); this.corridaSel.clear(); }
  },
  onCorridaInicio(e) {
    if (!e.participantes.includes(this.slot)) { this.ui.aviso(`Corrida começando: ${e.participantes.map((s) => e.nomes[s]).join(' × ')}`, 'info', 4000); return; }
    // guarda onde eu estava para voltar no fim
    const cr = this.crane, sc = this.sub;
    this.antesCorrida = { modo: this.me.modo, pos: this.me.pos.slice(), yaw: this.me.yaw, crane: cr.estado, subPos: sc.pos.slice(), subYaw: sc.yaw };
    if (this.pesca.estado !== 'off') this.cancelarPesca?.();
    this.me.arma = null; this.me.mirando = false; this.me.mirandoLixo = false; this.me.emote = null; this.roda = null; this.ui.fechar();
    // teletransporta para dentro do submarino, lado a lado na largada
    const L = e.largada[this.slot];
    cr.estado = 'livre'; this.me.modo = 'sub'; this.me.subCam = 'terceira';
    sc.pos = L.slice(); sc.vel = [0, 0, 0]; sc.yaw = e.yaw; sc.bateria = Math.max(sc.bateria, this.statsSub().bateria);
    this.me.pos = L.slice();
    this.corrida = { id: e.id, participantes: e.participantes, nomes: e.nomes, checkpoints: e.checkpoints, meus: new Set(), pegos: {}, largaEm: performance.now() + e.largaMs, fimEm: performance.now() + e.largaMs + e.limiteMs, enviando: new Set() };
    this.criarPalitos(e.checkpoints);
    this.ui.aviso(`🏁 Corrida! Pegue os ${CORRIDA.checkpoints} palitos brilhantes sobre a água — ${esc(textoPremioCorrida(e.participantes.length))}`, 'ok', 6000);
  },
  criarPalitos(cps) {
    this.removerPalitos();
    this.palitos = cps.map((c, i) => {
      const g = new Geo();
      g.put(cylinder(0.22, 0.22, 4.2, 12), [0, 2.1, 0], [0, 0, 0], 1, [0.35, 1, 0.55]);
      g.put(sphere(0.55, 14, 10), [0, 4.5, 0], [0, 0, 0], 1, [1, 0.95, 0.4]);
      g.put(torus(1.6, 0.12, 28, 6), [0, 0.15, 0], [0, 0, 0], 1, [0.35, 1, 0.55]);
      const n = new Node('palito' + i); n.mesh = this.R.createMesh(g, { emissive: [0.4, 1.6, 0.7], glow: 1, castShadow: false });
      n.at(c[0], 0, c[2]); this.fxRoot.add(n); return n;
    });
  },
  removerPalitos() { for (const n of this.palitos || []) this.fxRoot.remove(n); this.palitos = null; },
  updateCorrida(dt, livre) {
    const C = this.corrida, hud = $('corridaHud'), cont = $('corridaContagem');
    if (!C) { hud.hidden = true; cont.hidden = true; return; }
    const agora = performance.now();
    // contagem 3, 2, 1, VAI!
    const falta = C.largaEm - agora;
    if (falta > -900) {
      cont.hidden = false;
      const txt = falta > 0 ? String(Math.ceil(falta / 1000)) : 'VAI!';
      if (cont.textContent !== txt) { cont.textContent = txt; this.audio.blip(falta > 0 ? 520 : 1040, 0.15, 'square', 0.07); }
    } else cont.hidden = true;
    // palitos: giram e somem quando você pega
    (this.palitos || []).forEach((n, i) => {
      n.visible = !C.meus.has(i);
      n.rot(0, this.t * 1.5, 0); n.pos[1] = Math.sin(this.t * 2 + i) * 0.15;
      if (!n.visible || falta > 0 || this.me.modo !== 'sub' || C.enviando.has(i)) return;
      const c = C.checkpoints[i];
      if (Math.hypot(this.sub.pos[0] - c[0], this.sub.pos[2] - c[2]) < CORRIDA.raioCheck && this.sub.pos[1] > -4.5) {
        C.enviando.add(i);
        this.acao({ tipo: 'corrida_checkpoint', id: C.id, i }).finally(() => C.enviando.delete(i));
      }
    });
    // placar da corrida
    hud.hidden = false;
    const linhas = C.participantes.map((s) => `<div class="${s === this.slot ? 'eu' : ''}">${esc(C.nomes[s])}: <b>${s === this.slot ? C.meus.size : C.pegos[s] || 0}/${CORRIDA.checkpoints}</b></div>`).join('');
    const h = `<div class="tit">🏁 CORRIDA DE SUBMARINO <span>${falta > 0 ? 'largada…' : mmss(C.fimEm - agora)}</span></div>${linhas}<small>${esc(textoPremioCorrida(C.participantes.length))}</small>`;
    if (hud._h !== h) { hud.innerHTML = h; hud._h = h; }
  },
  // controles travados durante a contagem da largada
  corridaTravada() { return !!this.corrida && performance.now() < this.corrida.largaEm; },
  onCorridaFim(e) {
    const eu = this.corrida?.id === e.id;
    if (!eu) { if (e.vencedor) this.ui.aviso(`🏁 ${e.nome} venceu a corrida de submarino!`, 'info', 4000); return; }
    this.corrida = null; this.removerPalitos();
    const g = e.ganhos?.[this.slot];
    let titulo, sub;
    if (!e.vencedor) { titulo = 'CORRIDA ENCERRADA'; sub = e.motivo || 'Ninguém ganhou.'; }
    else if (e.vencedor === this.slot) { titulo = '🏆 VOCÊ VENCEU!'; sub = `Você ganhou S$ ${fmt(g || 0)}`; this.audio.coin(); setTimeout(() => this.audio.coin(), 200); }
    else { titulo = `${esc(e.nome)} venceu`; sub = `Você perdeu S$ ${fmt(-(g || 0))}`; this.audio.blip(300, 0.4, 'sawtooth', 0.08, -150); }
    const el = $('corridaResultado'); el.innerHTML = `<div class="t">${titulo}</div><div class="s">${sub}</div>`; el.hidden = false;
    clearTimeout(this.resTimer); this.resTimer = setTimeout(() => { el.hidden = true; }, 4500);
    // volta todo mundo para onde estava
    const A = this.antesCorrida; this.antesCorrida = null;
    if (!A) return;
    const cr = this.crane, sc = this.sub;
    if (A.modo === 'sub' && A.crane === 'livre') {
      cr.estado = 'livre'; this.me.modo = 'sub'; sc.pos = A.subPos; sc.yaw = A.subYaw; sc.vel = [0, 0, 0];
    } else {
      // estava a pé (ou no berço/guindaste): volta a pé para o mesmo lugar e o sub volta para o berço
      cr.estado = 'berco'; sc.pos = this.cradlePos.slice(); sc.yaw = this.stations[this.slot].yaw; sc.vel = [0, 0, 0];
      this.me.modo = A.modo === 'nadando' ? 'nadando' : 'terra';
      this.me.pos = A.modo === 'terra' || A.modo === 'nadando' ? A.pos : this.stations[this.slot].toWorld(2.6, 1.6, this.stations[this.slot].zCradle);
      this.me.vel = [0, 0, 0]; this.me.yaw = A.yaw;
      this.ui.esconderSubHud?.();
    }
  },
  statsSub() { return subStats(this.perfil); },

  // painel da barraca da corrida
  painelCorridaHtml() {
    const lista = Object.entries(this.remotos).filter(([, r]) => r.conectado);
    const n = 1 + [...this.corridaSel].filter((s) => this.remotos[s]).length;
    let h = `<p class="nota">Escolha quem vai correr com você e clique em <b>Chamar para corrida</b>. Cada um recebe um convite e aceita com <kbd>Y</kbd> (ou recusa com <kbd>N</kbd>). Quem aceitar vai para dentro do submarino, lado a lado no lago. Ganha quem passar primeiro pelos <b>${CORRIDA.checkpoints} palitos brilhantes</b> sobre a água (eles só aparecem para quem está correndo). No fim, todos voltam para onde estavam.</p>`;
    h += `<div class="premioCorrida"><b>Prêmio:</b> ${esc(textoPremioCorrida(Math.max(2, n)))}<br><small>2 corredores: quem vence ganha S$ ${CORRIDA.premio2} e quem perde paga S$ ${CORRIDA.premio2}. De 3 a 5: quem vence ganha S$ ${CORRIDA.premioN}, divididos entre os que perderam (5 corredores: S$ ${divisaoCorrida(5).perda[0]} de cada um). Precisa ter pelo menos S$ ${CORRIDA.minDinheiro} para correr.</small></div>`;
    if (!lista.length) return h + '<p class="nota">Não tem mais ninguém na sala agora. Chame os amigos com o código da sala (Tab).</p>';
    h += '<div class="lista">';
    for (const [s, r] of lista) {
      const sel = this.corridaSel.has(s);
      h += `<div class="item"><div>🚤 ${esc(r.nome)} <span class="nota">${esc(stationById(s).nome)} · S$ ${fmt(r.dinheiro || 0)}</span></div><div class="acoes"><button class="${sel ? 'cinza' : 'verde'}" data-escolher="${s}">${sel ? 'Escolhido ✓' : 'Escolher'}</button></div></div>`;
    }
    h += '</div>';
    h += `<div class="convite"><button class="grande" data-chamar ${n < 2 ? 'disabled' : ''}>🏁 Chamar para corrida (${n - 1} amigo${n - 1 === 1 ? '' : 's'})</button></div>`;
    return h;
  },
};
