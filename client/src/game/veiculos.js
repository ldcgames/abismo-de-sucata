// Veículos: patinete (todo mundo começa com ele), moto, carro, carro de som, caminhonete e superesportivo.
// E entra (no seu ou no de um amigo, se tiver lugar e não estiver trancado) · E sai · T tranca · B buzina · L farol.
// Quem dirige simula o veículo no próprio navegador e manda a posição; a sala guarda lugares, tranca e garagem.
// Métodos misturados na classe Game (main.js) com Object.assign(Game.prototype, Veiculos).
import { VEICULOS, VEIC_ORDEM, CORES_JOGADOR, CORRIDA_CARRO, textoPremioCorridaCarro } from '../../shared/data.js';
import { SLIDE_R, LAKE_R, ESTATUA, colidirPedras } from '../../shared/world.js';
import { damp, dampAngle, clamp, angDiff } from '../engine/math.js';
import { modeloVeiculo, circulosVeiculo } from '../entities/veiculos.js';
import { Node } from '../engine/renderer.js';
import { Geo, cylinder, torus, sphere, box } from '../engine/geometry.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const corDe = (slot, g) => { const c = slot === g.slot ? g.perfil.cor : g.remotos[slot]?.cor; return (CORES_JOGADOR[c ?? 0] || CORES_JOGADOR[0]).sub; };

// transforma um ponto do veículo (x, y, z locais) para o mundo
function aoMundo(P, l) {
  const c = Math.cos(P.rot), s = Math.sin(P.rot);
  return [P.pos[0] + l[0] * c + l[2] * s, P.pos[1] + l[1], P.pos[2] - l[0] * s + l[2] * c];
}

export const Veiculos = {
  initVeiculos() {
    this.veic = {};        // dono -> { tipo, m, buf, pose, giro, esterco, info }
    this.carro = null;     // física do veículo que EU estou dirigindo
    this.veicSnap = {};
    this.atropelei = {};   // cooldown por alvo
    // árvores perto da margem jogável viram obstáculos (grade de 12 m para achar rápido)
    this.arvGrid = new Map();
    for (const t of this.veg?.trees || []) {
      if (Math.hypot(t.x, t.z) > SLIDE_R + 6) continue;
      const k = `${Math.floor(t.x / 12)},${Math.floor(t.z / 12)}`;
      if (!this.arvGrid.has(k)) this.arvGrid.set(k, []);
      this.arvGrid.get(k).push({ x: t.x, z: t.z, r: 0.42 * t.s });
    }
  },
  // ---------------------------------------------------------------- rede
  snapVeiculos(s) {
    const agora = performance.now(), vistos = new Set();
    for (const [dono, v] of Object.entries(s.veiculos || {})) {
      vistos.add(dono);
      let e = this.veic[dono];
      if (!e || e.tipo !== v.tipo) { if (e) this.scene.remove(e.m.node); e = this.veic[dono] = { tipo: v.tipo, m: modeloVeiculo(this.R, v.tipo, corDe(dono, this)), buf: [], pose: { pos: v.pos.slice(), rot: v.rot }, giro: 0, esterco: 0 }; this.scene.add(e.m.node); }
      e.info = v;
      e.buf.push({ t: agora, pos: v.pos.slice(), rot: v.rot }); if (e.buf.length > 8) e.buf.shift();
    }
    for (const d of Object.keys(this.veic)) if (!vistos.has(d)) { this.scene.remove(this.veic[d].m.node); delete this.veic[d]; }
    const eu = s.players?.[this.slot];
    // a sala tirou você do veículo (ex.: o dono trocou de carro)
    if (eu && !eu.veic && this.me.modo === 'carro' && !this.saindoVeic) this.sairDoVeiculo(true);
  },
  interpVeic(e) {
    const t = performance.now() - 110, b = e.buf;
    if (!b.length) return e.pose;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].t <= t && b[i + 1].t >= t) { a = b[i]; c = b[i + 1]; break; }
    const k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 1;
    return { pos: [a.pos[0] + (c.pos[0] - a.pos[0]) * k, a.pos[1] + (c.pos[1] - a.pos[1]) * k, a.pos[2] + (c.pos[2] - a.pos[2]) * k], rot: a.rot + angDiff(a.rot, c.rot) * k };
  },
  eventoVeiculos(e) {
    switch (e.t) {
      case 'veic_tranca': this.bipBip(e.pos, e.trancado); if (e.dono === this.slot || this.me.veicInfo?.dono === e.dono) this.ui.aviso(e.trancado ? '🔒 Trancado' : '🔓 Destrancado', 'info', 1500); return true;
      case 'veic_buzina': this.buzinar(e.tipo, e.pos); return true;
      case 'veic_reset':
        if (e.ejetados?.includes(this.slot) && this.me.modo === 'carro' && e.motivo !== 'corrida') this.sairDoVeiculo(true, e.motivo === 'agua');
        if (this.carro?.dono === e.dono && e.motivo !== 'corrida' && e.ejetados?.includes(this.slot)) this.carro = null;
        if (this.veic[e.dono]) { this.veic[e.dono].buf = []; this.veic[e.dono].pose = { pos: e.pos.slice(), rot: e.rot }; }
        return true;
      case 'veic_removido': if (e.ejetados?.includes(this.slot) && this.me.modo === 'carro') this.sairDoVeiculo(true); return true;
      case 'atropelado':
        if (e.alvo === this.slot) {
          this.me.voo = { v: [e.empurrao[0], e.empurrao[2]], t: 0 };
          this.me.vel[1] = e.empurrao[1]; this.me.grounded = false; this.me.pos[1] += 0.05; this.me.emote = null;
          if (this.pesca.estado !== 'off') this.cancelarPesca?.('Você foi atropelado!');
          this.ui.aviso(`🚗 ${this.remotos[e.por]?.nome || 'Alguém'} te atropelou!`, 'ruim', 2500); this.shake = 0.5;
        }
        this.audio.blip(140, 0.25, 'sawtooth', 0.12, -60); this.audio.noise?.(0.25, 900, 0.18, 1);
        return true;
      case 'veic_batida':
        if (this.carro?.dono === e.dono) { this.carro.vx += e.imp[0] * 0.6; this.carro.vz += e.imp[1] * 0.6; this.shake = 0.35; }
        this.audio.noise?.(0.3, 600, 0.2, 1);
        return true;
    }
    return false;
  },
  // ---------------------------------------------------------------- sons
  bipBip(pos, trancou) {
    if (pos && this.me.pos && Math.hypot(pos[0] - this.me.pos[0], pos[2] - this.me.pos[2]) > 60) return;
    this.audio.blip(trancou ? 1760 : 1480, 0.08, 'square', 0.07); setTimeout(() => this.audio.blip(trancou ? 1760 : 1480, 0.08, 'square', 0.07), 160);
  },
  buzinar(tipo, pos) {
    if (pos && this.me.pos && Math.hypot(pos[0] - this.me.pos[0], pos[2] - this.me.pos[2]) > 120) return;
    const f = { patinete: [1900], moto: [520, 640], carro: [415, 520], som: [330, 415, 494], caminhonete: [262, 330], esportivo: [494, 622] }[tipo] || [440];
    if (tipo === 'patinete') { this.audio.blip(f[0], 0.06, 'triangle', 0.08); setTimeout(() => this.audio.blip(f[0], 0.06, 'triangle', 0.08), 120); return; }
    for (const hz of f) this.audio.blip(hz, 0.45, 'square', 0.06);
  },
  // ---------------------------------------------------------------- entrar / sair
  veicPerto() {
    let best = null, bd = 1e9;
    for (const [dono, e] of Object.entries(this.veic)) {
      const P = e.pose, spec = VEICULOS[e.tipo];
      const d = Math.hypot(P.pos[0] - this.me.pos[0], P.pos[2] - this.me.pos[2]);
      if (d < spec.comp / 2 + 2.2 && d < bd && Math.abs(P.pos[1] - this.me.pos[1]) < 2.5) { bd = d; best = { dono, e }; }
    }
    return best;
  },
  async entrarNoVeiculo(dono) {
    const r = await this.acao({ tipo: 'veic_entrar', dono });
    if (!r.ok) return;
    const e = this.veic[dono]; if (!e) return;
    const lugar = Number.isInteger(r.lugar) ? r.lugar : 1;
    if (this.pesca.estado !== 'off') this.cancelarPesca?.();
    this.me.arma = null; this.me.mirando = false; this.me.mirandoLixo = false; this.me.emote = null; this.roda = null;
    this.me.modo = 'carro'; this.me.vel = [0, 0, 0];
    if (e.info?.ocup) e.info.ocup[lugar] = this.slot; // até o próximo snapshot chegar
    this.me.veicInfo = { dono, lugar };
    this.camOffVeic = 0;
    this.audio.blip(220, 0.08, 'square', 0.05);
  },
  async sairDoVeiculo(forcado = false, naAgua = false) {
    const info = this.me.veicInfo, e = info && this.veic[info.dono];
    this.saindoVeic = true;
    if (!forcado) await this.acao({ tipo: 'veic_sair' });
    this.saindoVeic = false;
    // desce pela lateral do motorista (ou cai nadando)
    const P = this.carro?.dono === info?.dono && this.carro ? this.carro : e?.pose;
    if (P) {
      const spec = VEICULOS[e?.tipo || 'patinete'];
      const lado = aoMundo(P, [spec.larg / 2 + 0.7, 0, 0]);
      this.me.pos = [lado[0], Math.max(this.groundAt(lado[0], lado[2]), naAgua ? -0.55 : -10), lado[2]];
      this.me.yaw = P.rot;
    }
    if (this.carro && this.carro.dono === info?.dono) this.carro = null;
    this.me.veicInfo = null; this.me.vel = [0, 0, 0];
    this.me.modo = naAgua || this.groundAt(this.me.pos[0], this.me.pos[2]) < -0.35 ? 'nadando' : 'terra';
    if (naAgua) { this.me.pos[1] = -0.55; this.particles.splash(this.me.pos[0], this.me.pos[2], this.t, 0.6); this.audio.splash(0.7); }
  },
  // ---------------------------------------------------------------- colisões
  colidirArvores(pos, raio) {
    const gx = Math.floor(pos[0] / 12), gz = Math.floor(pos[2] / 12);
    let bateu = false;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of this.arvGrid.get(`${gx + i},${gz + j}`) || []) {
      const dx = pos[0] - t.x, dz = pos[2] - t.z, R = t.r + raio, d = Math.hypot(dx, dz);
      if (d < R && d > 1e-4) { pos[0] = t.x + (dx / d) * R; pos[2] = t.z + (dz / d) * R; bateu = true; }
    }
    return bateu;
  },
  // pessoas a pé não atravessam veículos (chamado no andar)
  colidirComVeiculos(pos) {
    if (this.me.modo === 'carro') return;
    for (const e of Object.values(this.veic)) {
      for (const [cx, cz, r] of circulosVeiculo(e.tipo)) {
        const c = aoMundo(e.pose, [cx, 0, cz]); const R = r + 0.3;
        if (Math.abs(pos[1] - e.pose.pos[1]) > VEICULOS[e.tipo].alt + 0.3) continue;
        const dx = pos[0] - c[0], dz = pos[2] - c[2], d = Math.hypot(dx, dz);
        if (d < R && d > 1e-4) { pos[0] = c[0] + (dx / d) * R; pos[2] = c[2] + (dz / d) * R; }
      }
    }
  },
  // ---------------------------------------------------------------- direção (eu sou o motorista)
  dirigir(dt, livre) {
    const C = this.carro, spec = VEICULOS[C.tipo], I = this.input;
    const travado = this.corridaTravada?.() || false;
    const acel = livre && !travado ? I.axis('KeyS', 'KeyW') : 0;
    const vir = livre ? I.axis('KeyD', 'KeyA') : 0;
    const freioMao = livre && I.down('Space');
    // velocidade no sentido do veículo
    const fw = [Math.sin(C.rot), Math.cos(C.rot)];
    let v = C.vx * fw[0] + C.vz * fw[1];
    const lat = [C.vx - fw[0] * v, C.vz - fw[1] * v];
    if (acel > 0) v += spec.acel * dt * (v < 0 ? 2.2 : 1);
    else if (acel < 0) v -= spec.acel * dt * (v > 0 ? 2.2 : 0.6);
    else v = damp(v, 0, 0.9, dt);
    if (freioMao) v = damp(v, 0, 3.5, dt);
    v = clamp(v, -spec.vmax * 0.35, spec.vmax);
    // esterço: gira mais devagar em alta velocidade
    C.esterco = damp(C.esterco || 0, vir, 8, dt);
    const fator = Math.min(1, Math.abs(v) / 3) * (1 - 0.45 * Math.min(1, Math.abs(v) / spec.vmax));
    C.rot += C.esterco * spec.giro * fator * Math.sign(v || 1) * dt;
    const fw2 = [Math.sin(C.rot), Math.cos(C.rot)];
    // aderência lateral (derrapa um pouco com freio de mão)
    const k = Math.exp(-(freioMao ? 2 : 9) * dt);
    C.vx = fw2[0] * v + lat[0] * k; C.vz = fw2[1] * v + lat[1] * k;
    // move e colide
    const antes = C.pos.slice();
    const nx = C.pos[0] + C.vx * dt, nz = C.pos[2] + C.vz * dt;
    const gOld = this.groundAt(C.pos[0], C.pos[2]), gNew = this.groundAt(nx, nz);
    const r = Math.hypot(nx, nz);
    const subida = gNew - gOld, passo = Math.hypot(C.vx, C.vz) * dt + 1e-4;
    let bloqueado = r > SLIDE_R - 4 || (subida / passo > 0.9 && gNew > C.pos[1] + 0.4); // morro e degrau alto: não sobe
    if (!bloqueado) { C.pos[0] = nx; C.pos[2] = nz; }
    else { C.vx *= -0.25; C.vz *= -0.25; if (Math.abs(v) > 6) { this.shake = 0.25; this.audio.noise?.(0.2, 500, 0.15, 1); } }
    // círculos do veículo contra estações, pedras, árvores, estátua, guindastes/subs (colisores das estações)
    let bateu = false;
    for (const [cx, cz, rr] of circulosVeiculo(C.tipo)) {
      const c = aoMundo(C, [cx, 0, cz]), c0 = c.slice();
      this.collideStations(c, rr);
      colidirPedras(c, rr);
      if (this.colidirArvores(c, rr)) bateu = true;
      const dx = c[0] - c0[0], dz = c[2] - c0[2];
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) { C.pos[0] += dx; C.pos[2] += dz; bateu = true; }
    }
    // outros veículos: empurra e é empurrado (dá para tirar o outro da pista)
    for (const [dono, e] of Object.entries(this.veic)) {
      if (dono === C.dono) continue;
      const d = Math.hypot(e.pose.pos[0] - C.pos[0], e.pose.pos[2] - C.pos[2]); if (d > 8) continue;
      for (const [ax, az, ar] of circulosVeiculo(C.tipo)) for (const [bx, bz, br] of circulosVeiculo(e.tipo)) {
        const a = aoMundo(C, [ax, 0, az]), b = aoMundo(e.pose, [bx, 0, bz]);
        const dx = a[0] - b[0], dz = a[2] - b[2], dd = Math.hypot(dx, dz), R = ar + br;
        if (dd < R && dd > 1e-4) {
          const nxx = dx / dd, nzz = dz / dd, pen = R - dd;
          C.pos[0] += nxx * pen; C.pos[2] += nzz * pen;
          const vn = C.vx * nxx + C.vz * nzz;
          if (vn < 0) {
            C.vx -= vn * 1.4 * nxx; C.vz -= vn * 1.4 * nzz; bateu = true;
            if (!this.batidaCd || performance.now() > this.batidaCd) { this.batidaCd = performance.now() + 300; this.acao({ tipo: 'veic_empurrao', dono, imp: [-nxx * Math.abs(vn) * 0.9, -nzz * Math.abs(vn) * 0.9] }); this.audio.noise?.(0.25, 700, 0.2, 1); }
          }
        }
      }
    }
    if (bateu) { const vel = Math.hypot(C.vx, C.vz); if (vel > 7 && !this.bateuSom) { this.bateuSom = true; this.shake = 0.3; this.audio.noise?.(0.3, 400, 0.2, 1); setTimeout(() => (this.bateuSom = false), 400); } C.vx *= 0.7; C.vz *= 0.7; }
    // atropelar quem está a pé (voa como na bazuca, sem ficar caído)
    const vel = Math.hypot(C.vx, C.vz);
    for (const [slot, rm] of Object.entries(this.remotos)) {
      if (rm.veic || !(rm.modo === 'terra' || rm.modo === 'nadando') || !rm.char) continue;
      const pp = rm.char.root.pos;
      for (const [cx, cz, rr] of circulosVeiculo(C.tipo)) {
        const c = aoMundo(C, [cx, 0, cz]); const dx = pp[0] - c[0], dz = pp[2] - c[2], d = Math.hypot(dx, dz);
        if (d < rr + 0.45 && Math.abs(pp[1] - C.pos[1]) < 2) {
          if (vel > 3) { if (!this.atropelei[slot] || performance.now() > this.atropelei[slot]) { this.atropelei[slot] = performance.now() + 1500; this.acao({ tipo: 'veic_atropelar', alvo: slot }); } }
          else if (d > 1e-4) { C.pos[0] -= (dx / d) * (rr + 0.45 - d); C.pos[2] -= (dz / d) * (rr + 0.45 - d); C.vx *= 0.5; C.vz *= 0.5; }
        }
      }
    }
    // chão: altura e inclinação (frente/trás e lados)
    const g = this.groundAt(C.pos[0], C.pos[2]);
    const f = aoMundo(C, [0, 0, spec.comp * 0.4]), t = aoMundo(C, [0, 0, -spec.comp * 0.4]);
    const le = aoMundo(C, [spec.larg * 0.45, 0, 0]), ld = aoMundo(C, [-spec.larg * 0.45, 0, 0]);
    const gf = this.groundAt(f[0], f[2]), gt = this.groundAt(t[0], t[2]), gl = this.groundAt(le[0], le[2]), gd = this.groundAt(ld[0], ld[2]);
    C.pitch = damp(C.pitch || 0, Math.atan2(gt - gf, spec.comp * 0.8), 10, dt);
    C.roll = damp(C.roll || 0, Math.atan2(gl - gd, spec.larg * 0.9), 10, dt);
    C.pos[1] = damp(C.pos[1], Math.max(g, (gf + gt) / 2), 14, dt);
    // na água: fora de corrida o veículo afunda e volta para a garagem; na corrida volta para onde caiu
    if (g < -0.35 && C.pos[1] < 0.1) {
      if (this.corrida && this.corrida.modo === 'carro' && this.corrida.participantes.includes(this.slot)) {
        const S = C.seguro || antes; C.pos = S.pos.slice(); C.rot = S.rot; C.vx = 0; C.vz = 0;
        this.particles.splash(nx, nz, this.t, 0.5); this.audio.splash(0.6); this.ui.aviso('Caiu na água! Voltou para a pista.', 'info', 1800);
      } else if (!this.afundando) {
        this.afundando = true; this.particles.splash(C.pos[0], C.pos[2], this.t, 0.9); this.audio.splash(0.9);
        this.acao({ tipo: 'veic_agua' }).finally(() => { this.afundando = false; });
        this.sairDoVeiculo(true, true);
        return;
      }
    } else if (g > 0.3) {
      // ponto seguro para voltar na corrida (a cada meio segundo, em terra firme)
      if (!C.seguroT || performance.now() > C.seguroT) { C.seguroT = performance.now() + 500; C.seguro = { pos: C.pos.slice(), rot: C.rot }; }
    }
    // rodas e som do motor
    C.v = v;
    C.velVec = [C.vx, 0, C.vz];
    // botões
    if (livre && I.hit('KeyL')) { C.luz = !C.luz; this.audio.blip(900, 0.04, 'square', 0.04); }
    if (livre && I.hit('KeyB')) this.acao({ tipo: 'veic_buzina' });
  },
  // ---------------------------------------------------------------- quadro a quadro
  updateVeiculos(dt, livre) {
    const I = this.input;
    // meu estado no veículo
    if (this.me.modo === 'carro') {
      const info = this.me.veicInfo, e = info && this.veic[info.dono];
      if (!e) { this.sairDoVeiculo(true); }
      else {
        const souMotorista = info.lugar === 0;
        if (souMotorista && (!this.carro || this.carro.dono !== info.dono)) this.carro = { dono: info.dono, tipo: e.tipo, pos: e.pose.pos.slice(), rot: e.pose.rot, vx: 0, vz: 0, luz: !!e.info?.luz, esterco: 0 };
        if (!souMotorista && this.carro?.dono === info.dono) this.carro = null;
        if (this.carro) this.dirigir(dt, livre);
        if (this.me.modo === 'carro') {
          const L = e.info?.ocup?.indexOf(this.slot) ?? -1;
          if (L >= 0) info.lugar = L;
          if (livre && I.hit('KeyE')) this.sairDoVeiculo();
          else if (livre && I.hit('KeyT')) this.acao({ tipo: 'veic_trancar' });
          this.me.arma = null;
        }
      }
    }
    // poses e modelos
    const noite = (this.envAtual?.day ?? 1) < 0.5;
    const luzes = [];
    for (const [dono, e] of Object.entries(this.veic)) {
      const P = this.carro?.dono === dono ? { pos: this.carro.pos, rot: this.carro.rot, pitch: this.carro.pitch || 0, roll: this.carro.roll || 0 } : (() => { const q = this.interpVeic(e); return { ...q, pitch: damp(e.pose.pitch || 0, 0, 4, dt), roll: 0 }; })();
      const antes = e.pose.pos;
      const dv = Math.hypot(P.pos[0] - antes[0], P.pos[2] - antes[2]) / Math.max(dt, 1e-3);
      const fw = [Math.sin(P.rot), Math.cos(P.rot)], sinal = Math.sign((P.pos[0] - antes[0]) * fw[0] + (P.pos[2] - antes[2]) * fw[1]) || 1;
      e.vel = damp(e.vel || 0, dv * sinal, 10, dt);
      e.pose = P;
      e.m.node.at(P.pos[0], P.pos[1], P.pos[2]).rot(P.pitch || 0, P.rot, P.roll || 0);
      const est = this.carro?.dono === dono ? this.carro.esterco : clamp(angDiff(e.rotAnt ?? P.rot, P.rot) / Math.max(dt, 1e-3) * 0.6, -1, 1);
      e.rotAnt = P.rot;
      for (const w of e.m.rodas) { w.giro = (w.giro || 0) + (e.vel * dt) / w.r; w.n.rot(w.giro, 0, 0); w.piv.rot(0, w.dianteira ? est * 0.45 : 0, 0); }
      const luzOn = this.carro?.dono === dono ? this.carro.luz : !!e.info?.luz;
      e.m.farol.visible = luzOn;
      // faróis acendem só um pouquinho (luz fraca, só faz diferença à noite)
      if (luzOn && noite && Math.hypot(P.pos[0] - this.cam.pos[0], P.pos[2] - this.cam.pos[2]) < 70) luzes.push({ pos: aoMundo(P, [0, 0.9, VEICULOS[e.tipo].comp / 2 + 1.6]), col: [0.9, 0.85, 0.7], range: 6 });
    }
    luzes.sort((a, b) => Math.hypot(a.pos[0] - this.cam.pos[0], a.pos[2] - this.cam.pos[2]) - Math.hypot(b.pos[0] - this.cam.pos[0], b.pos[2] - this.cam.pos[2]));
    this.luzesExtras = [...(this.luzesExtras || []), ...luzes.slice(0, 2)];
    // personagem no banco (o meu)
    if (this.me.modo === 'carro' && this.me.veicInfo) {
      const e = this.veic[this.me.veicInfo.dono];
      if (e) {
        const a = e.m.assentos[Math.min(this.me.veicInfo.lugar, e.m.assentos.length - 1)];
        const w = aoMundo(e.pose, a);
        this.me.pos = w; this.me.yaw = e.pose.rot; this.me.vel = [0, 0, 0]; this.me.grounded = true;
        this.cameraVeiculo(dt, e);
      }
    }
  },
  // posição do personagem de um amigo dentro de um veículo
  poseNoVeiculo(veic) {
    const e = this.veic[veic.dono]; if (!e) return null;
    const a = e.m.assentos[Math.min(veic.lugar, e.m.assentos.length - 1)];
    return { pos: aoMundo(e.pose, a), rot: e.pose.rot, pose: a[3], volante: veic.lugar === 0, virar: e.carroEsterco || 0 };
  },
  cameraVeiculo(dt, e) {
    const spec = VEICULOS[e.tipo], me = this.me;
    // o mouse gira a câmera em volta; dirigindo, ela volta devagar para trás do veículo
    const correndo = Math.abs(e.vel || 0) > 2;
    if (this.camYawVeic === undefined) this.camYawVeic = e.pose.rot;
    const alvoYaw = correndo ? e.pose.rot + (me.camYaw - (this.camYawRef ?? me.camYaw)) : null;
    if (correndo) { this.camYawVeic = dampAngle(this.camYawVeic, e.pose.rot, 2.5, dt); me.camYaw = this.camYawVeic; }
    else this.camYawVeic = me.camYaw;
    this.camYawRef = me.camYaw;
    void alvoYaw;
    const yaw = me.camYaw, pitch = clamp(me.camPitch, -0.6, 0.6) - 0.18;
    const alvo = [e.pose.pos[0], e.pose.pos[1] + spec.alt + 0.4, e.pose.pos[2]];
    const dist = spec.comp * 1.15 + 3.2;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const pos = [alvo[0] - Math.sin(yaw) * cp * dist, alvo[1] - sp * dist, alvo[2] - Math.cos(yaw) * cp * dist];
    const minY = Math.max(0.6, this.groundAt(pos[0], pos[2]) + 0.4); if (pos[1] < minY) pos[1] = minY;
    if (!this.camVeicPos) this.camVeicPos = pos.slice();
    for (let k = 0; k < 3; k++) this.camVeicPos[k] = damp(this.camVeicPos[k], pos[k], 12, dt);
    this.fovAtual = damp(this.fovAtual || 1.05, 1.05 + Math.min(0.2, Math.abs(e.vel || 0) / 120), 4, dt);
    this.setCam(this.camVeicPos, alvo, this.fovAtual);
  },
  // estado que vai para a sala (quem dirige manda o veículo)
  estadoVeiculo() {
    const C = this.carro; if (!C) return null;
    return { pos: C.pos.map((v) => +v.toFixed(3)), rot: +C.rot.toFixed(3), vel: [+C.vx.toFixed(2), 0, +C.vz.toFixed(2)], luz: !!C.luz };
  },
  // texto da barra de baixo
  promptVeiculo() {
    const info = this.me.veicInfo, e = info && this.veic[info.dono]; if (!e) return null;
    const spec = VEICULOS[e.tipo];
    if (info.lugar === 0 || e.info?.ocup?.[0] === this.slot) {
      return `<kbd>W</kbd><kbd>S</kbd>acelerar/ré · <kbd>A</kbd><kbd>D</kbd>virar · <kbd>Espaço</kbd>freio de mão · <kbd>E</kbd>sair · <kbd>T</kbd>${e.info?.trancado ? 'destrancar' : 'trancar'} · <kbd>B</kbd>buzina · <kbd>L</kbd>farol${spec.voz ? ' · 🔊 sua voz alcança 4× mais longe (M liga o microfone)' : ''}`;
    }
    return `De carona no ${esc(spec.nome)} · <kbd>E</kbd>sair`;
  },
  promptVeiculoPerto(livre) {
    if (this.me.modo !== 'terra') return null;
    const p = this.veicPerto(); if (!p) return null;
    if (this.me.veicInfo) return null;
    const spec = VEICULOS[p.e.tipo], meu = p.dono === this.slot;
    const ocup = p.e.info?.ocup || [], livres = ocup.filter((o) => !o).length;
    const tranc = p.e.info?.trancado && !meu;
    const dono = meu ? 'seu' : `de ${esc(this.remotos[p.dono]?.nome || 'alguém')}`;
    const txt = tranc ? `🔒 ${esc(spec.nome)} ${dono} está trancado` : livres ? `<kbd>E</kbd>${ocup[0] ? 'Pegar carona no' : 'Dirigir o'} ${esc(spec.nome)} ${dono} <span class="nota">(${livres}/${spec.lugares} lugares livres)</span>` : `${esc(spec.nome)} ${dono} está lotado`;
    if (livre && !tranc && livres && this.input.hit('KeyE')) { this.input.pressed.delete('KeyE'); this.entrarNoVeiculo(p.dono); }
    return txt;
  },
  // ---------------------------------------------------------------- loja de carros (painel)
  painelCarrosHtml() {
    const p = this.perfil, vs = p.veiculos || { tem: ['patinete'], eq: 'patinete' };
    let h = `<p class="nota">Um veículo equipado por vez: ele aparece na sua <b>vaga de estacionamento</b> (ao lado da bancada de peixe). Se equipar outro, o novo aparece na vaga (o antigo some de onde estiver).<br>
      <kbd>E</kbd> entra (no seu ou de carona no de um amigo) · <kbd>E</kbd> sai · <kbd>T</kbd> tranca · <kbd>B</kbd> buzina · <kbd>L</kbd> farol. Dentro do veículo não dá para atirar nem pescar.<br>
      Atropelar alguém joga a pessoa longe (como a bazuca). Caiu no lago: o veículo afunda e volta para a vaga; você volta nadando.</p><div class="grade">`;
    for (const k of VEIC_ORDEM) {
      const v = VEICULOS[k], tem = vs.tem.includes(k), eq = vs.eq === k;
      const vel = Math.round(v.vmax * 3.6);
      const btn = eq ? '<div class="val"><b>✔ Equipado</b></div>' : tem ? `<button data-acao='${JSON.stringify({ tipo: 'veic_equipar', chave: k })}'>Equipar</button>` : `<button data-acao='${JSON.stringify({ tipo: 'comprar', cat: 'veiculo', chave: k })}' ${p.dinheiro < v.preco ? `disabled title="Faltam S$ ${fmt(v.preco - p.dinheiro)}"` : ''}>Comprar</button>`;
      h += `<div class="card"><h3>${esc(v.nome)}</h3><div class="val">👥 cabe${v.lugares > 1 ? 'm' : ''} <b>${v.lugares} pessoa${v.lugares > 1 ? 's' : ''}</b> · até ${vel} km/h</div><div class="nv">${esc(v.funcao)}</div><div class="custo">${v.preco ? 'S$ ' + fmt(v.preco) : 'Grátis (já é seu)'}</div>${btn}</div>`;
    }
    return h + '</div>';
  },
};
