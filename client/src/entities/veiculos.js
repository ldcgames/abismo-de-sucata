// Veículos da garagem: patinete, moto, carro, carro de som (picape com caixas), caminhonete (cabine dupla) e superesportivo.
// Modelos por código (frente em +z, chão em y = 0, x positivo = lado do motorista). Cada modelo devolve:
//   node (raiz), rodas [{n, dianteira}] para girar/esterçar, farol (nó que acende), assentos [[x, y, z, pose]].
import { Geo, sphere, cylinder, torus, rbox, box, lathe, tube, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { VEICULOS } from '../../shared/data.js';

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const PRETO = [0.04, 0.04, 0.045], BORRACHA = [0.06, 0.06, 0.065], CROMO = [0.78, 0.8, 0.82], PLASTICO = [0.1, 0.1, 0.11];

// casca por seções ao longo de z: anel = [z, meiaLargura, alturaCima, yCentro, n (quadrado), alturaBaixo]
function loftZ(aneis, seg = 28) {
  const g = new Geo(), N = aneis.length;
  for (let i = 0; i < N; i++) {
    const [z, a, bt, yc, n = 2, bb = bt] = aneis[i], e = 2 / n;
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      g.p.push(spow(c, e) * a, yc + spow(s, e) * (s > 0 ? bt : bb), z); g.n.push(c, s, 0); g.u.push(j / seg, i / (N - 1), 0, 0); g.c.push(1, 1, 1, 1);
    }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; g.i.push(a, a + 1, b, a + 1, b + 1, b); }
  for (const [ri, fim] of [[0, false], [N - 1, true]]) {
    const [z, , , yc] = aneis[ri]; const ci = g.p.length / 3; g.p.push(0, yc, z); g.n.push(0, 0, fim ? 1 : -1); g.u.push(0.5, 0.5, 0, 0); g.c.push(1, 1, 1, 1);
    const base = ri * (seg + 1); for (let j = 0; j < seg; j++) { if (fim) g.i.push(ci, base + j, base + j + 1); else g.i.push(ci, base + j + 1, base + j); }
  }
  g.recomputeNormals();
  return g;
}
// interpola anéis (Catmull-Rom) para a carroceria não ficar facetada
function suave(aneis, sub = 3) {
  const out = [], P = (i) => aneis[Math.max(0, Math.min(aneis.length - 1, i))];
  for (let i = 0; i < aneis.length - 1; i++) for (let s = 0; s < sub; s++) {
    const t = s / sub, t2 = t * t, t3 = t2 * t, r = [];
    for (let k = 0; k < aneis[i].length; k++) {
      const p0 = P(i - 1)[k] ?? 0, p1 = P(i)[k] ?? 0, p2 = P(i + 1)[k] ?? 0, p3 = P(i + 2)[k] ?? 0;
      r.push(k === 4 ? p1 + (p2 - p1) * t : 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    }
    out.push(r);
  }
  out.push(aneis[aneis.length - 1].slice());
  return out;
}

// roda: pneu com banda e flanco, aro de liga com raios, cubo e (opcional) pinça de freio
function rodaGeo(r, w, aro = CROMO, raios = 5, pinca = null) {
  const g = new Geo();
  g.put(cylinder(r, r, w * 0.82, 26), [0, 0, 0], [0, 0, Math.PI / 2], 1, BORRACHA);
  for (const s of [-1, 1]) g.put(torus(r - w * 0.12, w * 0.13, 26, 8), [s * w * 0.38, 0, 0], [0, 0, Math.PI / 2], 1, BORRACHA);
  // sulcos da banda
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; g.put(box(w * 0.7, 0.02, 0.03), [0, Math.cos(a) * (r + 0.002), Math.sin(a) * (r + 0.002)], [a, 0, 0], 1, PRETO); }
  const ra = r * 0.64;
  for (const s of [-1, 1]) {
    g.put(cylinder(ra, ra, 0.03, 22), [s * w * 0.4, 0, 0], [0, 0, Math.PI / 2], 1, aro.map((c) => c * 0.55));
    g.put(torus(ra, 0.025, 22, 6), [s * w * 0.42, 0, 0], [0, 0, Math.PI / 2], 1, aro);
    for (let k = 0; k < raios; k++) { const a = (k / raios) * Math.PI * 2; g.put(rbox(0.03, ra * 0.95, 0.07, 0.01), [s * w * 0.43, Math.cos(a) * ra * 0.5, Math.sin(a) * ra * 0.5], [a, 0, 0], 1, aro); }
    g.put(cylinder(ra * 0.22, ra * 0.22, 0.05, 12), [s * w * 0.44, 0, 0], [0, 0, Math.PI / 2], 1, aro.map((c) => c * 0.8));
  }
  if (pinca) g.put(rbox(0.05, ra * 0.7, ra * 0.45, 0.015), [w * 0.3, ra * 0.35, 0], [0, 0, 0], 1, pinca);
  return g;
}

class Montador {
  constructor(R, nome) { this.R = R; this.node = new Node(nome); this.rodas = []; this.assentos = []; this.farolG = new Geo(); this.lanternaG = new Geo(); this.vidroG = new Geo(); }
  roda(x, y, z, r, w, dianteira, aro, raios, pinca) {
    const n = new Node('roda'); n.mesh = this.R.createMesh(rodaGeo(r, w, aro, raios, pinca), { rough: 0.55, metal: 0.4 });
    const piv = new Node('pivo_roda'); piv.at(x, y, z); piv.add(n); this.node.add(piv);
    this.rodas.push({ n, piv, dianteira, r, lado: Math.sign(x) || 1 });
  }
  fechar(g, opts = {}) {
    const corpo = new Node('carroceria'); corpo.mesh = this.R.createMesh(g, { rough: 0.32, metal: 0.25, ...opts }); this.node.add(corpo);
    if (this.vidroG.vcount) { const v = new Node('vidros'); v.mesh = this.R.createMesh(this.vidroG, { opacity: 0.55, rough: 0.05, metal: 0.2, castShadow: false, doubleSide: true }); this.node.add(v); }
    if (this.lanternaG.vcount) { const l = new Node('lanternas'); l.mesh = this.R.createMesh(this.lanternaG, { emissive: [0.55, 0.04, 0.03], rough: 0.3, castShadow: false }); this.node.add(l); }
    const f = new Node('farol_aceso'); f.mesh = this.R.createMesh(this.farolG, { emissive: [1, 0.95, 0.8], glow: 1.6, castShadow: false }); f.visible = false; this.node.add(f);
    return { node: this.node, rodas: this.rodas, farol: f, assentos: this.assentos };
  }
}

// ---------- carroceria pelo perfil lateral ----------
// perfil: [[z, topo, base, meiaLargura], ...] de trás para a frente. arcos: rodas [[z, r], ...] (pinta a caixa de roda).
function carroceria(g, perfil, cor, arcos, { n = 6, escuroBaixo = 0.0, interior = null } = {}) {
  const aneis = suave(perfil.map(([z, top, bot, a]) => [z, a, (top - bot) / 2, (top + bot) / 2, n]), 6);
  const topo = (z) => { let i = 0; while (i < perfil.length - 2 && perfil[i + 1][0] < z) i++; const A = perfil[i], B = perfil[i + 1], t = clamp01((z - A[0]) / ((B[0] - A[0]) || 1)); return [A[1] + (B[1] - A[1]) * t, A[3] + (B[3] - A[3]) * t]; };
  g.put(loftZ(aneis, 40), [0, 0, 0], [0, 0, 0], 1, (x, y, z) => {
    // por dentro da cabine (visto pelo vidro): forro escuro
    if (interior && z > interior[0] && z < interior[1]) { const [t, a] = topo(z); if (y > t - 0.04 && Math.abs(x) < a * 0.82) return [0.12, 0.11, 0.11]; }
    if (escuroBaixo && y < escuroBaixo) return mix(cor, PRETO, 0.55);
    return cor;
  });
  // caixas de roda: aro preto (meia-lua) dos dois lados, por cima de cada roda
  for (const [zw, r] of arcos) for (const sx of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; pts.push([0, r + Math.sin(a) * (r + 0.07), zw + Math.cos(a) * (r + 0.07)]); }
    const [, a] = topo(zw);
    g.add(tube(pts, 0.05, 6), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx * (a - 0.02), 0, 0, 1], [...PRETO, 1]);
  }
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// cabine: vidro (transparente) + teto opaco + colunas. perfil: [[z, alturaDoTopo, meiaLargura], ...] de trás para a frente; base = linha da cintura
function cabine(M, g, perfil, base, cor, { colunaC = 0.07, colunaB = true } = {}) {
  const an = suave(perfil.map(([z, top, a]) => [z, a, Math.max(0.02, top - base), base, 3, 0.06]), 4);
  M.vidroG.put(loftZ(an, 32), [0, 0, 0], [0, 0, 0], 1, [0.1, 0.13, 0.17]);
  // teto: só onde a cabine está no alto
  const alto = perfil.filter(([, top]) => top > base + (Math.max(...perfil.map((q) => q[1])) - base) * 0.92);
  if (alto.length >= 2) {
    const z0 = alto[0][0], z1 = alto[alto.length - 1][0], topo = Math.max(...alto.map((q) => q[1])), a = Math.min(...alto.map((q) => q[2]));
    g.put(loftZ(suave([[z0 - 0.06, a * 0.9, 0.02, topo - 0.005, 5], [z0 + 0.1, a * 0.97, 0.035, topo + 0.005, 5], [z1 - 0.1, a * 0.97, 0.035, topo + 0.005, 5], [z1 + 0.06, a * 0.9, 0.02, topo - 0.005, 5]], 3), 32), [0, 0, 0], [0, 0, 0], 1, cor);
    // colunas: A (para-brisa), B (meio) e C (traseira), acompanhando o vidro
    const fr = perfil[perfil.length - 1], tr = perfil[0];
    for (const s of [-1, 1]) {
      g.add(tube([[s * fr[2] * 0.93, base + 0.03, fr[0] - 0.02], [s * a * 0.95, topo - 0.02, z1 + 0.02]], 0.04, 6), null, [...cor, 1]);
      g.add(tube([[s * tr[2] * 0.93, base + 0.03, tr[0] + 0.03], [s * a * 0.95, topo - 0.02, z0 - 0.02]], colunaC, 6), null, [...cor, 1]);
      if (colunaB) { const zm = (z0 + z1) / 2 - 0.1; g.add(tube([[s * perfil[1][2] * 1.0, base + 0.02, zm], [s * a * 0.97, topo - 0.02, zm]], 0.035, 6), null, [...PRETO, 1]); }
    }
  }
}
// ---------- detalhes comuns de carro ----------
function placa(g, z, y, s = 1) {
  g.put(rbox(0.52 * s, 0.16 * s, 0.02, 0.01), [0, y, z], [0, 0, 0], 1, [0.95, 0.95, 0.93]);
  g.put(box(0.52 * s, 0.035 * s, 0.022), [0, y + 0.06 * s, z], [0, 0, 0], 1, [0.1, 0.25, 0.65]); // faixa azul (padrão Mercosul)
}
function retrovisor(g, x, y, z, cor) {
  g.put(rbox(0.05, 0.04, 0.12, 0.01), [x * 0.98, y - 0.02, z], [0, 0, 0], 1, PLASTICO);
  g.put(rbox(0.16, 0.11, 0.09, 0.035), [x + Math.sign(x) * 0.1, y + 0.02, z - 0.02], [0, 0, 0], 1, cor);
  g.put(box(0.13, 0.08, 0.01), [x + Math.sign(x) * 0.1, y + 0.02, z - 0.068], [0, 0, 0], 1, [0.6, 0.7, 0.8]);
}
function macaneta(g, x, y, z) { g.put(rbox(0.025, 0.03, 0.14, 0.01), [x, y, z], [0, 0, 0], 1, CROMO); }
function linhaPorta(g, x, z, y0, y1, incl = 0) { g.put(box(0.012, y1 - y0, 0.012), [x, (y0 + y1) / 2, z], [incl, 0, 0], 1, PRETO); }

// ===================================================================== CARRO (sedã compacto, 4 lugares)
function carro(R, cor) {
  const M = new Montador(R, 'carro'), g = new Geo();
  const rr = 0.33, zf = 1.32, zt = -1.32;
  carroceria(g, [
    [-2.12, 0.86, 0.4, 0.78], [-2.06, 0.97, 0.33, 0.87], [-1.85, 1.0, 0.31, 0.9], [-1.0, 1.0, 0.3, 0.91], [0.5, 1.0, 0.3, 0.91],
    [1.0, 0.98, 0.3, 0.91], [1.65, 0.93, 0.31, 0.9], [1.98, 0.86, 0.33, 0.86], [2.1, 0.74, 0.38, 0.8], [2.14, 0.6, 0.44, 0.72],
  ], cor, [[zf, rr], [zt, rr]], { escuroBaixo: 0.36, interior: [-1.5, 1.0] });
  cabine(M, g, [[-1.52, 1.0, 0.82], [-1.25, 1.3, 0.79], [-0.85, 1.45, 0.76], [0.3, 1.46, 0.76], [0.6, 1.36, 0.78], [1.02, 1.0, 0.84]], 0.98, cor);
  for (const s of [-1, 1]) {
    linhaPorta(g, s * 0.915, 0.95, 0.45, 0.98, 0.15); linhaPorta(g, s * 0.915, -0.2, 0.45, 0.98); linhaPorta(g, s * 0.91, -1.2, 0.5, 0.98, -0.1);
    macaneta(g, s * 0.925, 0.86, 0.45); macaneta(g, s * 0.925, 0.86, -0.6);
    retrovisor(g, s * 0.84, 1.07, 0.9, cor);
    // faróis grandes nas quinas da frente (máscara cromada + lente) e lanternas que abraçam a traseira
    g.put(rbox(0.46, 0.17, 0.12, 0.05), [s * 0.56, 0.82, 2.04], [0, -s * 0.18, 0], 1, CROMO.map((c) => c * 0.5));
    g.put(rbox(0.42, 0.14, 0.04, 0.05), [s * 0.56, 0.82, 2.1], [0, -s * 0.18, 0], 1, [0.93, 0.95, 0.97]);
    M.farolG.put(rbox(0.4, 0.12, 0.02, 0.05), [s * 0.56, 0.82, 2.125], [0, -s * 0.18, 0], 1, [1, 1, 1]);
    M.lanternaG.put(rbox(0.44, 0.15, 0.05, 0.04), [s * 0.58, 0.86, -2.09], [0, s * 0.15, 0], 1, [0.85, 0.07, 0.05]);
    M.lanternaG.put(rbox(0.05, 0.15, 0.3, 0.02), [s * 0.88, 0.86, -1.96], [0, 0, 0], 1, [0.85, 0.07, 0.05]);
    g.put(rbox(0.12, 0.05, 0.03, 0.01), [s * 0.62, 0.5, 2.14], [0, 0, 0], 1, [0.95, 0.6, 0.15]); // pisca/neblina
  }
  // grade, para-choques, placas, escapamento, logo genérico
  g.put(rbox(0.66, 0.16, 0.06, 0.05), [0, 0.8, 2.1], [0, 0, 0], 1, PRETO);
  for (let k = 0; k < 3; k++) g.put(box(0.6, 0.012, 0.02), [0, 0.76 + k * 0.04, 2.13], [0, 0, 0], 1, CROMO.map((c) => c * 0.7));
  g.put(sphere(0.045, 10, 8), [0, 0.8, 2.14], [0, 0, 0], [1, 1, 0.4], CROMO);
  g.put(rbox(1.78, 0.17, 0.16, 0.07), [0, 0.46, 2.09], [0, 0, 0], 1, mix(cor, PRETO, 0.35));
  g.put(rbox(0.9, 0.09, 0.06, 0.03), [0, 0.42, 2.16], [0, 0, 0], 1, PRETO);
  g.put(rbox(1.76, 0.2, 0.16, 0.07), [0, 0.5, -2.1], [0, 0, 0], 1, mix(cor, PRETO, 0.35));
  placa(g, 2.18, 0.58); placa(g, -2.17, 0.74);
  g.put(cylinder(0.035, 0.035, 0.2, 8), [-0.55, 0.32, -2.1], [Math.PI / 2, 0, 0], 1, CROMO.map((c) => c * 0.7));
  g.put(cylinder(0.006, 0.006, 0.35, 4), [0, 1.6, -0.85], [-0.3, 0, 0], 1, PRETO);
  for (const [x, z] of [[0.8, zf], [-0.8, zf], [0.8, zt], [-0.8, zt]]) M.roda(x, rr, z, rr, 0.22, z > 0, CROMO, 5);
  M.assentos.push([0.36, 0.26, 0.05, 'banco'], [-0.36, 0.26, 0.05, 'banco'], [0.36, 0.28, -0.85, 'banco'], [-0.36, 0.28, -0.85, 'banco']);
  return M.fechar(g);
}

// ===================================================================== CARRO DE SOM (picape compacta tipo "Saveiro", 2 lugares)
function som(R, cor) {
  const M = new Montador(R, 'carro_som'), g = new Geo();
  const rr = 0.34, zf = 1.45, zt = -1.35;
  carroceria(g, [
    [-2.32, 0.92, 0.42, 0.84], [-2.26, 1.0, 0.34, 0.9], [-1.0, 1.0, 0.32, 0.92], [0.8, 1.0, 0.32, 0.92], [1.2, 0.98, 0.32, 0.92],
    [1.85, 0.93, 0.33, 0.9], [2.2, 0.85, 0.35, 0.86], [2.3, 0.72, 0.4, 0.8], [2.34, 0.6, 0.45, 0.72],
  ], cor, [[zf, rr], [zt, rr]], { escuroBaixo: 0.37, interior: [-0.38, 1.2] });
  cabine(M, g, [[-0.38, 1.46, 0.8], [-0.28, 1.47, 0.79], [0.55, 1.47, 0.78], [0.85, 1.36, 0.8], [1.25, 1.0, 0.85]], 0.98, cor, { colunaC: 0.05, colunaB: false });
  g.put(rbox(1.66, 0.5, 0.07, 0.03), [0, 1.22, -0.4], [0, 0, 0], 1, cor); // parede de trás da cabine
  for (const s of [-1, 1]) {
    linhaPorta(g, s * 0.925, 1.15, 0.45, 0.98, 0.15); linhaPorta(g, s * 0.925, -0.36, 0.45, 0.98);
    macaneta(g, s * 0.935, 0.86, -0.1); retrovisor(g, s * 0.86, 1.07, 1.05, cor);
    g.put(rbox(0.46, 0.17, 0.12, 0.05), [s * 0.56, 0.83, 2.25], [0, -s * 0.18, 0], 1, CROMO.map((c) => c * 0.5));
    g.put(rbox(0.42, 0.14, 0.04, 0.05), [s * 0.56, 0.83, 2.31], [0, -s * 0.18, 0], 1, [0.93, 0.95, 0.97]);
    M.farolG.put(rbox(0.4, 0.12, 0.02, 0.05), [s * 0.56, 0.83, 2.335], [0, -s * 0.18, 0], 1, [1, 1, 1]);
    M.lanternaG.put(rbox(0.12, 0.36, 0.05, 0.03), [s * 0.82, 0.8, -2.32], [0, 0, 0], 1, [0.85, 0.07, 0.05]);
    // laterais da caçamba
    g.put(rbox(0.07, 0.34, 1.9, 0.02), [s * 0.88, 1.15, -1.36], [0, 0, 0], 1, cor);
    g.put(rbox(0.1, 0.03, 1.9, 0.01), [s * 0.88, 1.33, -1.36], [0, 0, 0], 1, PRETO); // protetor da borda
  }
  // assoalho e tampa da caçamba
  g.put(box(1.68, 0.04, 1.9), [0, 1.0, -1.33], [0, 0, 0], 1, PRETO);
  for (let k = 0; k < 6; k++) g.put(box(0.04, 0.02, 1.9), [-0.7 + k * 0.28, 1.03, -1.33], [0, 0, 0], 1, [0.18, 0.18, 0.2]);
  g.put(rbox(1.82, 0.36, 0.07, 0.02), [0, 1.17, -2.28], [0, 0, 0], 1, cor);
  // paredão de som: caixas com alto-falantes virados para trás, cornetas em cima e fita de LED
  const caixa = [0.1, 0.1, 0.11];
  g.put(rbox(1.62, 0.78, 0.55, 0.03), [0, 1.43, -0.75], [0, 0, 0], 1, caixa);
  for (const x of [-0.42, 0.42]) {
    g.put(cylinder(0.3, 0.3, 0.04, 26), [x, 1.43, -1.04], [Math.PI / 2, 0, 0], 1, [0.25, 0.25, 0.27]);
    g.put(lathe([[0.27, 0], [0.18, 0.06], [0.08, 0.1], [0.06, 0.1]], 24), [x, 1.43, -1.04], [-Math.PI / 2, 0, 0], 1, [0.06, 0.06, 0.07]);
    g.put(sphere(0.06, 10, 8), [x, 1.43, -1.13], [0, 0, 0], [1, 1, 0.6], [0.3, 0.3, 0.32]);
    g.put(torus(0.3, 0.02, 26, 6), [x, 1.43, -1.04], [Math.PI / 2, 0, 0], 1, CROMO);
  }
  for (let k = 0; k < 4; k++) {
    const x = -0.6 + k * 0.4;
    g.put(rbox(0.34, 0.22, 0.4, 0.02), [x, 1.95, -0.8], [0, 0, 0], 1, caixa);
    g.put(lathe([[0.04, 0], [0.13, 0.22], [0.15, 0.24]], 14), [x, 1.95, -1.0], [-Math.PI / 2, 0, 0], [1, 0.7, 1], [0.75, 0.75, 0.78]);
  }
  M.lanternaG.put(box(1.6, 0.03, 0.02), [0, 1.83, -1.04], [0, 0, 0], 1, [0.15, 0.5, 1]);
  M.lanternaG.put(box(1.6, 0.03, 0.02), [0, 1.04, -1.04], [0, 0, 0], 1, [0.9, 0.2, 0.9]);
  // grade, para-choques, placas
  g.put(rbox(0.7, 0.16, 0.06, 0.05), [0, 0.8, 2.31], [0, 0, 0], 1, PRETO);
  g.put(rbox(1.8, 0.18, 0.16, 0.07), [0, 0.47, 2.28], [0, 0, 0], 1, mix(cor, PRETO, 0.35));
  g.put(rbox(1.8, 0.18, 0.14, 0.06), [0, 0.47, -2.35], [0, 0, 0], 1, PRETO);
  placa(g, 2.37, 0.58); placa(g, -2.4, 0.62);
  for (const [x, z] of [[0.8, zf], [-0.8, zf], [0.8, zt], [-0.8, zt]]) M.roda(x, rr, z, rr, 0.23, z > 0, [0.2, 0.2, 0.22], 6);
  M.assentos.push([0.36, 0.28, 0.25, 'banco'], [-0.36, 0.28, 0.25, 'banco']);
  return M.fechar(g);
}

// ===================================================================== CAMINHONETE (cabine dupla, 5 lugares)
function caminhonete(R, cor) {
  const M = new Montador(R, 'caminhonete'), g = new Geo();
  const rr = 0.44, zf = 1.75, zt = -1.65;
  carroceria(g, [
    [-2.68, 1.3, 0.6, 0.94], [-2.62, 1.36, 0.52, 0.99], [-1.0, 1.38, 0.5, 1.0], [0.9, 1.38, 0.5, 1.0], [1.5, 1.37, 0.5, 1.0],
    [2.3, 1.33, 0.52, 0.99], [2.6, 1.25, 0.56, 0.96], [2.7, 1.12, 0.62, 0.92],
  ], cor, [[zf, rr], [zt, rr]], { escuroBaixo: 0.66, interior: [-0.75, 1.45] });
  cabine(M, g, [[-0.78, 2.0, 0.88], [-0.66, 2.02, 0.88], [0.75, 2.02, 0.87], [1.05, 1.9, 0.88], [1.5, 1.36, 0.94]], 1.36, cor, { colunaC: 0.06 });
  g.put(rbox(1.84, 0.66, 0.08, 0.03), [0, 1.68, -0.76], [0, 0, 0], 1, cor);
  // rack de teto
  for (const s of [-1, 1]) g.put(rbox(0.05, 0.05, 1.5, 0.02), [s * 0.7, 2.08, 0.05], [0, 0, 0], 1, PRETO);
  for (const z of [-0.5, 0.6]) g.put(rbox(1.46, 0.04, 0.05, 0.02), [0, 2.1, z], [0, 0, 0], 1, PRETO);
  for (const s of [-1, 1]) {
    linhaPorta(g, s * 1.01, 1.3, 0.7, 1.32, 0.08); linhaPorta(g, s * 1.01, 0.2, 0.7, 1.34); linhaPorta(g, s * 1.01, -0.68, 0.7, 1.34);
    macaneta(g, s * 1.02, 1.2, 0.85); macaneta(g, s * 1.02, 1.2, -0.25);
    retrovisor(g, s * 0.98, 1.42, 1.25, PRETO);
    // estribo lateral
    g.put(rbox(0.22, 0.05, 2.0, 0.02), [s * 1.08, 0.52, 0.05], [0, 0, 0], 1, [0.2, 0.2, 0.22]);
    // faróis
    g.put(rbox(0.38, 0.16, 0.08, 0.04), [s * 0.66, 1.06, 2.6], [0, -s * 0.15, 0], 1, [0.08, 0.08, 0.09]);
    g.put(rbox(0.32, 0.12, 0.03, 0.04), [s * 0.66, 1.065, 2.64], [0, -s * 0.15, 0], 1, [0.85, 0.88, 0.9]);
    M.farolG.put(rbox(0.3, 0.1, 0.02, 0.04), [s * 0.66, 1.065, 2.655], [0, -s * 0.15, 0], 1, [1, 1, 1]);
    M.lanternaG.put(rbox(0.12, 0.42, 0.04, 0.03), [s * 0.92, 1.12, -2.66], [0, 0, 0], 1, [0.8, 0.06, 0.05]);
    // caçamba
    g.put(rbox(0.08, 0.42, 1.85, 0.02), [s * 0.96, 1.52, -1.68], [0, 0, 0], 1, cor);
  }
  g.put(box(1.86, 0.05, 1.85), [0, 1.3, -1.68], [0, 0, 0], 1, PRETO);
  g.put(rbox(1.98, 0.44, 0.08, 0.02), [0, 1.52, -2.6], [0, 0, 0], 1, cor);
  // santantônio (roll bar)
  for (const s of [-1, 1]) g.add(tube([[s * 0.92, 1.72, -0.85], [s * 0.9, 2.12, -0.95], [s * 0.6, 2.2, -0.98]], 0.04, 8), null, [...CROMO, 1]);
  g.put(cylinder(0.04, 0.04, 1.2, 8), [0, 2.2, -0.98], [0, 0, Math.PI / 2], 1, CROMO);
  // grade grande, quebra-mato, para-choques, placas
  g.put(rbox(1.2, 0.36, 0.06, 0.05), [0, 0.98, 2.64], [0, 0, 0], 1, [0.12, 0.12, 0.13]);
  for (let k = 0; k < 4; k++) g.put(box(1.1, 0.03, 0.02), [0, 0.86 + k * 0.08, 2.67], [0, 0, 0], 1, CROMO);
  g.put(rbox(2.0, 0.26, 0.2, 0.06), [0, 0.66, 2.62], [0, 0, 0], 1, [0.16, 0.16, 0.18]);
  for (const s of [-1, 1]) g.add(tube([[s * 0.5, 0.55, 2.75], [s * 0.5, 1.05, 2.82], [0, 1.1, 2.84]], 0.035, 8), null, [...[0.2, 0.2, 0.22], 1]);
  g.put(rbox(2.0, 0.22, 0.18, 0.06), [0, 0.66, -2.66], [0, 0, 0], 1, [0.16, 0.16, 0.18]);
  placa(g, 2.73, 0.66); placa(g, -2.76, 0.66);
  g.put(cylinder(0.045, 0.045, 0.25, 8), [-0.6, 0.45, -2.6], [Math.PI / 2, 0, 0], 1, CROMO.map((c) => c * 0.7));
  for (const [x, z] of [[0.94, zf], [-0.94, zf], [0.94, zt], [-0.94, zt]]) M.roda(x, rr, z, rr, 0.32, z > 0, [0.55, 0.55, 0.58], 6);
  M.assentos.push([0.42, 0.5, 0.6, 'banco'], [-0.42, 0.5, 0.6, 'banco'], [0.5, 0.52, -0.3, 'banco'], [0, 0.52, -0.3, 'banco'], [-0.5, 0.52, -0.3, 'banco']);
  return M.fechar(g);
}

// ===================================================================== SUPERESPORTIVO (cunha baixa e larga, 2 lugares, sem marca)
function esportivo(R, cor) {
  const M = new Montador(R, 'esportivo'), g = new Geo();
  const rf = 0.34, rt = 0.37, zf = 1.42, zt = -1.32;
  carroceria(g, [
    [-2.28, 0.88, 0.32, 0.9], [-2.2, 0.95, 0.24, 0.98], [-1.5, 0.96, 0.2, 1.0], [-0.9, 0.93, 0.19, 1.0], [0.2, 0.82, 0.19, 0.99],
    [0.9, 0.76, 0.19, 0.98], [1.6, 0.66, 0.2, 0.96], [2.05, 0.56, 0.22, 0.92], [2.25, 0.44, 0.24, 0.84], [2.3, 0.34, 0.26, 0.74],
  ], cor, [[zf, rf], [zt, rt]], { n: 8, escuroBaixo: 0.24, interior: [-1.25, 0.9] });
  // entradas de ar laterais
  cabine(M, g, [[-1.3, 0.94, 0.74], [-1.0, 1.08, 0.7], [-0.45, 1.13, 0.68], [0.15, 1.1, 0.7], [0.95, 0.8, 0.85]], 0.8, cor, { colunaC: 0.09, colunaB: false });
  // tampa do motor com aletas (atrás da cabine)
  for (let k = 0; k < 5; k++) g.put(box(0.9, 0.02, 0.05), [0, 0.93 - k * 0.012, -1.35 - k * 0.14], [0.1, 0, 0], 1, PRETO);
  for (const s of [-1, 1]) {
    retrovisor(g, s * 0.86, 0.92, 0.45, cor);
    linhaPorta(g, s * 0.99, 0.75, 0.38, 0.8, 0.3); linhaPorta(g, s * 0.99, -0.22, 0.4, 0.84);
    // faróis finos em "Y"
    g.put(rbox(0.42, 0.06, 0.12, 0.03), [s * 0.62, 0.5, 2.02], [0, -s * 0.35, -s * 0.05], 1, [0.06, 0.06, 0.07]);
    M.farolG.put(rbox(0.38, 0.03, 0.04, 0.015), [s * 0.62, 0.51, 2.08], [0, -s * 0.35, -s * 0.05], 1, [1, 1, 1]);
    g.put(rbox(0.38, 0.025, 0.04, 0.012), [s * 0.62, 0.505, 2.07], [0, -s * 0.35, -s * 0.05], 1, [0.85, 0.9, 0.95]);
    M.lanternaG.put(rbox(0.5, 0.04, 0.04, 0.015), [s * 0.55, 0.78, -2.25], [0, s * 0.12, 0], 1, [0.9, 0.06, 0.05]);
    // entradas de ar dianteiras
    g.put(rbox(0.36, 0.14, 0.06, 0.04), [s * 0.58, 0.32, 2.14], [0, 0, 0], 1, PRETO);
  }
  // asa traseira, difusor e 2 escapamentos centrais
  for (const s of [-1, 1]) g.put(rbox(0.05, 0.22, 0.12, 0.02), [s * 0.55, 1.0, -2.05], [0, 0, 0], 1, PRETO);
  g.put(rbox(1.8, 0.04, 0.34, 0.02), [0, 1.12, -2.08], [-0.08, 0, 0], 1, cor);
  for (const s of [-1, 1]) g.put(rbox(0.04, 0.16, 0.36, 0.01), [s * 0.9, 1.1, -2.08], [0, 0, 0], 1, PRETO);
  for (let k = 0; k < 6; k++) g.put(box(0.02, 0.14, 0.3), [-0.5 + k * 0.2, 0.26, -2.1], [0, 0, 0], 1, PRETO);
  for (const s of [-1, 1]) { g.put(cylinder(0.06, 0.06, 0.12, 12), [s * 0.12, 0.34, -2.24], [Math.PI / 2, 0, 0], 1, CROMO); g.put(cylinder(0.045, 0.045, 0.13, 12), [s * 0.12, 0.34, -2.25], [Math.PI / 2, 0, 0], 1, PRETO); }
  placa(g, -2.23, 0.5, 0.9);
  for (const [x, z, r] of [[0.9, zf, rf], [-0.9, zf, rf], [0.92, zt, rt], [-0.92, zt, rt]]) M.roda(x, r, z, r, z > 0 ? 0.26 : 0.32, z > 0, [0.15, 0.15, 0.16], 10, [0.95, 0.75, 0.1]);
  M.assentos.push([0.34, 0.06, -0.3, 'banco'], [-0.34, 0.06, -0.3, 'banco']);
  return M.fechar(g);
}

// ===================================================================== MOTO (2 lugares)
function moto(R, cor) {
  const M = new Montador(R, 'moto'), g = new Geo();
  const r = 0.32, zf = 0.72, zt = -0.68;
  // quadro, garfo e balança
  g.add(tube([[0, 0.55, 0.45], [0, 0.95, 0.5], [0, 0.88, -0.1], [0, 0.55, -0.35]], 0.04, 8), null, [0.15, 0.15, 0.16, 1]);
  for (const s of [-1, 1]) {
    g.add(tube([[s * 0.09, r, zf], [s * 0.09, 0.98, 0.5]], 0.035, 8), null, [...CROMO, 1]);
    g.add(tube([[s * 0.09, r, zt], [s * 0.06, 0.48, -0.15]], 0.035, 6), null, [0.2, 0.2, 0.22, 1]);
  }
  // tanque, banco duplo, carenagem, para-lamas
  g.put(sphere(0.25, 16, 12), [0, 0.98, 0.22], [0.15, 0, 0], [0.75, 0.62, 1.45], cor);
  g.put(rbox(0.3, 0.1, 0.85, 0.05), [0, 0.92, -0.32], [-0.06, 0, 0], 1, [0.08, 0.07, 0.07]);
  g.put(lathe([[0.0, 0], [0.2, 0.05], [0.22, 0.2], [0.17, 0.32], [0, 0.36]], 16), [0, 1.0, 0.62], [Math.PI / 2 - 0.4, 0, 0], [1, 1, 0.9], cor);
  g.put(lathe([[0.18, 0], [0.18, 0.02]], 18, {}), [0, 0.62, zf], [0, 0, Math.PI / 2], [1, 1, 1], PRETO);
  g.add(tube([[0, 0.52, zf + 0.2], [0, 0.66, zf], [0, 0.6, zf - 0.22]], 0.03, 6, () => 0.03), null, [...cor, 1]);
  g.add(tube([[0, 0.62, -0.45], [0, 0.68, zt], [0, 0.6, zt - 0.3]], 0.04, 6), null, [...cor, 1]);
  // motor e escapamento
  g.put(rbox(0.3, 0.3, 0.38, 0.06), [0, 0.48, 0.05], [0, 0, 0], 1, [0.3, 0.3, 0.32]);
  for (let k = 0; k < 4; k++) g.put(box(0.34, 0.015, 0.3), [0, 0.6 + k * 0.035, 0.05], [0, 0, 0], 1, [0.45, 0.45, 0.47]);
  g.add(tube([[-0.12, 0.42, 0.15], [-0.16, 0.3, -0.1], [-0.16, 0.38, -0.65]], 0.04, 8), null, [...CROMO, 1]);
  g.put(cylinder(0.06, 0.05, 0.35, 12), [-0.16, 0.4, -0.7], [Math.PI / 2 - 0.1, 0, 0], 1, CROMO);
  // guidão, manoplas, painel, retrovisores
  g.add(tube([[-0.36, 1.12, 0.52], [-0.15, 1.1, 0.56], [0.15, 1.1, 0.56], [0.36, 1.12, 0.52]], 0.018, 6), null, [0.2, 0.2, 0.22, 1]);
  for (const s of [-1, 1]) { g.put(cylinder(0.025, 0.025, 0.12, 8), [s * 0.4, 1.12, 0.51], [0, 0, Math.PI / 2], 1, PRETO); g.add(tube([[s * 0.25, 1.11, 0.55], [s * 0.3, 1.3, 0.55]], 0.008, 4), null, [...PRETO, 1]); g.put(rbox(0.1, 0.06, 0.02, 0.02), [s * 0.31, 1.32, 0.55], [0, 0, 0], 1, PRETO); }
  g.put(rbox(0.16, 0.08, 0.06, 0.02), [0, 1.17, 0.55], [-0.4, 0, 0], 1, PRETO);
  g.put(cylinder(0.09, 0.08, 0.06, 16), [0, 0.98, 0.83], [Math.PI / 2 - 0.3, 0, 0], 1, CROMO);
  M.farolG.put(cylinder(0.075, 0.075, 0.02, 16), [0, 0.985, 0.86], [Math.PI / 2 - 0.3, 0, 0], 1, [1, 1, 1]);
  M.lanternaG.put(rbox(0.14, 0.05, 0.04, 0.02), [0, 0.82, -0.86], [0, 0, 0], 1, [0.85, 0.06, 0.05]);
  placa(g, -0.9, 0.62, 0.55);
  M.roda(0, r, zf, r, 0.12, true, CROMO, 7); M.roda(0, r, zt, r, 0.16, false, CROMO, 7);
  M.assentos.push([0, 0.6, -0.15, 'moto'], [0, 0.62, -0.55, 'moto']);
  return M.fechar(g);
}

// ===================================================================== PATINETE (1 lugar, em pé)
function patinete(R, cor) {
  const M = new Montador(R, 'patinete'), g = new Geo();
  g.put(rbox(0.17, 0.05, 0.72, 0.02), [0, 0.12, -0.05], [0, 0, 0], 1, cor);
  g.put(box(0.15, 0.006, 0.6), [0, 0.148, -0.05], [0, 0, 0], 1, [0.12, 0.12, 0.13]); // lixa
  g.add(tube([[0, 0.12, 0.32], [0, 0.18, 0.42], [0, 0.98, 0.38]], 0.025, 8), null, [...CROMO, 1]);
  g.put(cylinder(0.018, 0.018, 0.5, 8), [0, 0.98, 0.38], [0, 0, Math.PI / 2], 1, CROMO);
  for (const s of [-1, 1]) g.put(cylinder(0.024, 0.024, 0.1, 8), [s * 0.22, 0.98, 0.38], [0, 0, Math.PI / 2], 1, PRETO);
  g.add(tube([[0, 0.12, -0.38], [0, 0.17, -0.48]], 0.02, 6), null, [...cor, 1]); // freio traseiro
  M.farolG.put(cylinder(0.025, 0.025, 0.01, 10), [0, 0.86, 0.42], [Math.PI / 2, 0, 0], 1, [1, 1, 1]);
  M.roda(0, 0.09, 0.42, 0.09, 0.05, true, [0.6, 0.6, 0.62], 4); M.roda(0, 0.09, -0.45, 0.09, 0.05, false, [0.6, 0.6, 0.62], 4);
  M.assentos.push([0, 0.15, -0.02, 'pe']);
  return M.fechar(g);
}

const FAB = { patinete, moto, carro, som, caminhonete, esportivo };
export function modeloVeiculo(R, tipo, cor) { return (FAB[tipo] || patinete)(R, cor || [0.7, 0.1, 0.1]); }
// círculos de colisão no plano (frente/trás), em coordenadas do veículo
export function circulosVeiculo(tipo) {
  const v = VEICULOS[tipo] || VEICULOS.patinete, r = v.larg / 2 + 0.05, m = Math.max(0, v.comp / 2 - r);
  return m > 0.05 ? [[0, m, r], [0, 0, r], [0, -m, r]] : [[0, 0, r]];
}
