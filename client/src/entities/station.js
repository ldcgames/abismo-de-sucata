// Estação do jogador na margem: plataforma, cais, guindaste com gancho, berço do submarino,
// oficina, terminal, recicladora, bancadas, aquário/tanque com peixes vivos, depósito e decoração.
import { Geo, sphere, cylinder, capsule, torus, rbox, box, lathe, tube, plane, icosphere, noisy, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { m4, quat, damp, clamp, lerp } from '../engine/math.js';
import { stationById, terrainHeight, noise3, PAD_R, CRADLE_R, LAUNCH_R, DOCK_END_R } from '../../shared/world.js';
import { AQUARIOS, TANQUES, CORES_JOGADOR, ESPECIES } from '../../shared/data.js';
import { makeFishGeo } from '../world/fauna.js';
import { weaponMesh } from './weapons.js';
import { BARRACA_ARMAS, BARRACA_CORRIDA, BANCADA_PEIXE } from '../../shared/world.js';
import { ARMAS_ORDEM } from '../../shared/data.js';

const CONC0 = [0.42, 0.41, 0.38];
const WOOD = [0.45, 0.32, 0.2], WOOD_DK = [0.3, 0.21, 0.13], CONC = [0.42, 0.41, 0.38], METAL = [0.42, 0.43, 0.45], YEL = [0.9, 0.7, 0.15];

export function textQuad(R, lines, w = 4, h = 1.4, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = opts.px || 512; cv.height = Math.round(cv.width * (h / w));
  const c = cv.getContext('2d');
  if (!opts.transparent) {
    c.fillStyle = opts.bg || '#2b2f26'; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = opts.border || '#d9b44a'; c.lineWidth = cv.width * 0.02; c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, cv.width - c.lineWidth, cv.height - c.lineWidth);
  }
  c.fillStyle = opts.color || '#f3ead2'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const lh = cv.height / (lines.length + 0.4);
  lines.forEach((t, i) => {
    let size = i === 0 ? lh * 0.62 : lh * 0.45;
    c.font = `${i === 0 ? '800' : '600'} ${size}px system-ui, Segoe UI, sans-serif`;
    const maxW = cv.width * 0.9, tw = c.measureText(t).width;
    if (tw > maxW) { size *= maxW / tw; c.font = `${i === 0 ? '800' : '600'} ${size}px system-ui, Segoe UI, sans-serif`; }
    if (opts.transparent) { c.lineWidth = size * 0.18; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(t, cv.width / 2, lh * (i + 0.7)); }
    c.fillText(t, cv.width / 2, lh * (i + 0.7));
  });
  const g = new Geo();
  g.p = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0];
  g.n = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]; g.c = new Array(16).fill(1);
  g.uv = [0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  g.i = [0, 1, 2, 0, 2, 3];
  const n = new Node('texto');
  n.mesh = R.createMesh(g, { shader: 'tex', tex: R.texture(cv), opacity: 1, billboard: !!opts.billboard, bright: opts.bright ?? 1, noDepth: !!opts.noDepth });
  n.canvas = cv;
  return n;
}

// casca de uma casinha aberta para o pátio (paredes de madeira, telhado de zinco inteiro)
// aquário OU tanque equipado: entre a oficina e a placa com o nome. A frente fica sempre em z = -9.6
// (de frente para o pátio) e o lado direito nunca passa de x = 7.6 (o poste da placa, que fica perto da
// barraca da corrida). Os grandes crescem para trás, por cima da grama.
export const VITRINE_FRENTE = -9.6, PLACA_X = 10;
export function vitrineLayout(v) {
  const t = v?.tipo === 'tanque' ? TANQUES[v.nivel] : AQUARIOS[v?.nivel || 0];
  const [w, , d] = t.dims, borda = v?.tipo === 'tanque' ? 0.5 : 0.15;
  return { x: Math.min(1.3, PLACA_X - 2.4 - borda - w / 2), z: VITRINE_FRENTE - borda - d / 2, w, d, t, borda };
}
function casinha(g, hx, hz, cor) {
  // piso
  g.k = MAT.CONCRETO; g.put(rbox(4.6, 0.2, 4.0, 0.04), [hx, 1.62, hz], [0, 0, 0], 1, [0.45, 0.44, 0.42]);
  // paredes fechadas até o telhado (fundo e laterais), pintadas, com ripas de madeira por fora e por dentro
  const esc = cor.map((c) => c * 0.72);
  g.k = MAT.PINTADO;
  g.put(box(0.2, 3.0, 4.04), [hx + 2.2, 3.12, hz], [0, 0, 0], 1, cor);
  for (const s of [-1, 1]) g.put(box(4.6, 3.0, 0.2), [hx, 3.12, hz + s * 1.92], [0, 0, 0], 1, cor);
  g.k = MAT.MADEIRA;
  for (let k = -4; k <= 4; k++) for (const d of [-1, 1]) g.put(box(0.06, 3.0, 0.12), [hx + 2.2 + d * 0.12, 3.12, hz + k * 0.45], [0, 0, 0], 1, esc);
  for (const s of [-1, 1]) for (let k = -4; k <= 4; k++) for (const d of [-1, 1]) g.put(box(0.12, 3.0, 0.06), [hx + k * 0.5, 3.12, hz + s * 1.92 + d * 0.12], [0, 0, 0], 1, esc);
  // esteios e viga da frente (lado aberto para o pátio)
  for (const s of [-1, 1]) g.put(box(0.24, 3.0, 0.24), [hx - 2.2, 3.12, hz + s * 1.92], [0, 0, 0], 1, WOOD_DK);
  g.put(box(0.24, 0.4, 4.08), [hx - 2.2, 4.42, hz], [0, 0, 0], 1, WOOD_DK);
  g.put(box(0.18, 0.18, 4.1), [hx + 0.6, 4.53, hz], [0, 0, 0], 1, WOOD_DK);
  g.put(box(0.18, 0.18, 4.1), [hx - 1.0, 4.53, hz], [0, 0, 0], 1, WOOD_DK);
  // telhado reto, inteiro, apoiado em cima das paredes (sem frestas)
  g.k = MAT.METAL;
  g.put(box(5.1, 0.08, 4.6), [hx - 0.1, 4.66, hz], [0, 0, 0], 1, [0.5, 0.52, 0.54]);
  for (let k = 0; k < 19; k++) g.put(cylinder(0.055, 0.055, 5.1, 6, false), [hx - 0.1, 4.72, hz - 2.25 + k * 0.25], [0, 0, Math.PI / 2], 1, [0.56, 0.58, 0.6]);
  g.put(box(0.08, 0.22, 4.7), [hx - 2.66, 4.62, hz], [0, 0, 0], 1, [0.45, 0.47, 0.5]);
  g.put(box(0.08, 0.22, 4.7), [hx + 2.46, 4.62, hz], [0, 0, 0], 1, [0.45, 0.47, 0.5]);
}

const fishGeoCache = {};
function fishMesh(R, esp) {
  if (!fishGeoCache[esp]) fishGeoCache[esp] = R.createMesh(makeFishGeo(esp, 1), { rough: 0.35, swim: ESPECIES[esp]?.pesado ? 0.5 : 1, castShadow: false, kind: MAT.ESCAMA });
  return fishGeoCache[esp];
}
export function fishNode(R, esp, cm) {
  const n = new Node('peixe_' + esp); n.mesh = fishMesh(R, esp); n.sc(cm / 100); return n;
}

// peixe cortado (cabeça, rabo e três filés), ao longo do eixo z como o peixe inteiro, centrado na origem
export function fishCutNode(R, esp, cm) {
  const fg = new Geo(), L = cm / 100, cor = ESPECIES[esp].cor;
  fg.put(sphere(0.12 * L + 0.05, 10, 8), [0, 0, -L * 0.42], [0, 0, 0], [1, 0.8, 1.2], cor);
  fg.put(box(0.06, 0.2 * L + 0.06, 0.18 * L + 0.05), [0, 0, L * 0.45], [0, 0, 0], 1, cor);
  for (let k = 0; k < 3; k++) fg.put(rbox(0.18 * L + 0.12, 0.05, 0.16 * L + 0.08, 0.02), [(k - 1) * 0.04, -0.04, -L * 0.18 + k * (0.2 * L + 0.05)], [0, 0, 0], 1, [0.97, 0.58, 0.5]);
  const n = new Node('peixe_cortado_' + esp); n.mesh = R.createMesh(fg, { rough: 0.5 }); return n;
}

export class Station {
  constructor(R, slot) {
    this.R = R; this.slot = slot;
    const st = this.st = stationById(slot);
    this.root = new Node('estacao_' + slot);
    this.yaw = Math.atan2(-st.dir[0], -st.dir[1]);
    this.root.at(st.pad[0], 0, st.pad[1]).rot(0, this.yaw, 0);
    // distâncias locais (+z aponta para o lago)
    // o sub desce AO LADO do cais (x = 6), nunca sobre as tábuas
    this.zCradle = PAD_R - CRADLE_R; this.zLaunch = PAD_R - LAUNCH_R; this.xLaunch = 6; this.zDockEnd = PAD_R - DOCK_END_R + 2;
    this.xPivot = 4.0;
    // pivô equidistante do berço e do ponto de lançamento
    this.zPivot = ((this.xLaunch - this.xPivot) ** 2 + this.zLaunch ** 2 - this.xPivot ** 2 - this.zCradle ** 2) / (2 * (this.zLaunch - this.zCradle));
    this.boom = Math.hypot(this.xPivot, this.zPivot - this.zCradle);
    this.angBerco = Math.atan2(0 - this.xPivot, this.zCradle - this.zPivot); if (this.angBerco < 0) this.angBerco += Math.PI * 2;
    this.angAgua = Math.atan2(this.xLaunch - this.xPivot, this.zLaunch - this.zPivot);
    this.buildStatic();
    this.dyn = new Node('dinamico'); this.root.add(this.dyn);
    this.crane = this.buildCrane();
    this.aqFish = []; this.tankFish = [];
    this.estado = null; this.boomAng = 0; this.hookY = 6;
    this.interacoes = [];
  }
  // coordenadas locais → mundo
  toWorld(x, y, z) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return [this.st.pad[0] + x * c + z * s, y, this.st.pad[1] - x * s + z * c]; }
  toLocal(p) { const dx = p[0] - this.st.pad[0], dz = p[2] - this.st.pad[1]; const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return [dx * c - dz * s, p[1], dx * s + dz * c]; }

  buildStatic() {
    const R = this.R, g = new Geo();
    // plataforma de concreto com juntas
    g.k = MAT.CONCRETO;
    const pad = rbox(34, 0.5, 30, 0.12, 10);
    g.put(pad, [0, 1.3, 2], [0, 0, 0], 1, (x, y, z) => {
      const n = noise3(x * 0.35, 0.5, z * 0.35), n2 = noise3(x * 1.7, 2.1, z * 1.7);
      let c = [CONC[0] * (0.9 + n * 0.12 + n2 * 0.05), CONC[1] * (0.9 + n * 0.12 + n2 * 0.05), CONC[2] * (0.88 + n * 0.1)];
      if (n > 0.35) c = c.map((v, i) => v * [0.75, 0.73, 0.7][i]); // manchas de óleo/umidade
      if (noise3(x * 0.15, 7, z * 0.15) > 0.45) c = [c[0] * 0.95, c[1] * 1.0, c[2] * 0.85]; // musgo nas bordas
      return [...c, 0];
    });
    // meio-fio e marcações amarelas no caminho do berço
    for (const s of [-1, 1]) g.put(rbox(0.25, 0.08, 10, 0.02), [s * 3.2, 1.56, 13], [0, 0, 0], 1, YEL);
    g.put(rbox(34.4, 0.25, 0.4, 0.05), [0, 1.2, -13.1], [0, 0, 0], 1, [0.36, 0.35, 0.33]);
    // cais de madeira até a água
    g.k = MAT.MADEIRA;
    const z0 = 14, z1 = this.zDockEnd;
    for (let z = z0; z < z1; z += 0.55) g.put(box(4.2, 0.12, 0.48), [0, 1.22, z], [0, ((z * 13) % 1 - 0.5) * 0.02, 0], 1, ((z * 7) | 0) % 3 ? WOOD : WOOD_DK);
    for (let z = z0 + 2; z < z1; z += 3.2) for (const s of [-1, 1]) {
      const wz = this.toWorld(s * 2.0, 0, z);
      const bed = terrainHeight(wz[0], wz[2]);
      const h = 1.3 - bed + 0.3;
      g.put(cylinder(0.16, 0.18, h, 8), [s * 2.0, 1.3 - h / 2, z], [0, 0, 0], 1, WOOD_DK);
    }
    for (const s of [-1, 1]) g.put(box(0.1, 0.1, z1 - z0 - 6), [s * 2.05, 1.95, (z0 + z1) / 2 + 3], [0, 0, 0], 1, WOOD);
    for (let z = z0 + 6; z < z1; z += 3.2) for (const s of [-1, 1]) g.put(box(0.1, 0.75, 0.1), [s * 2.05, 1.6, z], [0, 0, 0], 1, WOOD);
    // pneus de proteção no fim do cais
    g.k = MAT.BORRACHA;
    for (const s of [-1, 1]) g.put(torus(0.32, 0.12, 16, 8), [s * 2.25, 0.85, z1 - 1], [0, 0, Math.PI / 2], 1, [0.1, 0.1, 0.1]);
    // berço do submarino (trilhos + calços)
    g.k = MAT.METAL;
    for (const s of [-1, 1]) {
      g.put(rbox(0.35, 0.9, 5, 0.06), [s * 0.95, 1.95, this.zCradle], [0, 0, 0], 1, [0.35, 0.36, 0.38]);
      for (const z of [-1.6, 1.6]) g.put(rbox(0.6, 0.35, 0.6, 0.08), [s * 0.7, 2.45, this.zCradle + z], [0, 0, s * 0.4], 1, [0.15, 0.15, 0.15]);
    }
    // base do guindaste
    g.k = MAT.CONCRETO;
    g.put(cylinder(1.2, 1.4, 2.2, 20), [this.xPivot, 0.8, this.zPivot], [0, 0, 0], 1, CONC);
    // oficina (galpão aberto) com telhado de chapa ondulada
    g.k = MAT.PINTADO;
    const sx = -11, sz = -5;
    g.put(rbox(11, 4, 0.3, 0.04), [sx, 3.5, sz - 4], [0, 0, 0], 1, [0.6, 0.55, 0.48]);
    for (const s of [-1, 1]) g.put(rbox(0.3, 4, 8, 0.04), [sx + s * 5.4, 3.5, sz], [0, 0, 0], 1, [0.6, 0.55, 0.48]);
    g.k = MAT.METAL;
    for (let k = 0; k < 24; k++) g.put(cylinder(0.11, 0.11, 8.8, 8, false), [sx - 5.8 + k * 0.5, 5.75 + Math.sin(k * Math.PI) * 0, sz], [Math.PI / 2, 0, 0.18], [1, 1, 1], [0.5, 0.52, 0.55]);
    g.k = MAT.MADEIRA;
    for (const s of [-1, 1]) g.put(box(0.2, 4.2, 0.2), [sx + s * 5.3, 3.5, sz + 4], [0, 0, 0], 1, WOOD_DK);
    // painel de ferramentas na parede
    g.put(box(4, 1.6, 0.05), [sx, 3.6, sz - 3.82], [0, 0, 0], 1, [0.35, 0.28, 0.2]);
    g.k = MAT.METAL;
    for (let k = 0; k < 7; k++) g.put(capsule(0.03, 0.4 + (k % 3) * 0.15, 6, 2), [sx - 1.6 + k * 0.5, 3.6, sz - 3.75], [0, 0, (k % 2) * 0.3], 1, k % 2 ? [0.6, 0.15, 0.1] : [0.7, 0.7, 0.72]);
    // bancada principal
    g.k = MAT.MADEIRA;
    g.put(rbox(3.2, 0.12, 1.1, 0.03), [sx, 2.55, sz - 3.0], [0, 0, 0], 1, WOOD);
    g.k = MAT.METAL;
    for (const x of [-1.4, 1.4]) for (const z of [-0.4, 0.4]) g.put(box(0.1, 0.95, 0.1), [sx + x, 2.05, sz - 3.0 + z], [0, 0, 0], 1, METAL);
    g.put(rbox(0.25, 0.2, 0.15, 0.02), [sx - 1, 2.72, sz - 3.0], [0, 0, 0], 1, [0.2, 0.3, 0.6]); // morsa
    // prateleiras do depósito
    for (let k = 0; k < 3; k++) g.put(rbox(3, 0.08, 0.9, 0.02), [sx + 3.6, 2.2 + k * 1.0, sz + 1.5], [0, Math.PI / 2, 0], 1, METAL);
    for (const z of [-1.4, 1.4]) g.put(box(0.08, 3, 0.08), [sx + 3.6, 3.0, sz + 1.5 + z], [0, 0, 0], 1, METAL);
    // terminal (quiosque de compra e venda)
    g.k = MAT.PINTADO;
    g.put(rbox(1.2, 1.6, 0.6, 0.08), [-4, 2.35, 9], [0, 0.4, 0], 1, [0.25, 0.3, 0.35]);
    g.put(rbox(1.0, 0.7, 0.1, 0.04), [-4, 3.4, 9.15], [-0.25, 0.4, 0], 1, [0.15, 0.16, 0.18]);
    // caixa d'água/postes
    g.k = MAT.MADEIRA;
    g.put(cylinder(0.12, 0.12, 6, 8), [-15.5, 4.5, -11.5], [0, 0, 0], 1, WOOD_DK);
    // carregador do cais
    g.k = MAT.PINTADO;
    g.put(rbox(0.8, 1.3, 0.5, 0.06), [3.2, 2.2, this.zCradle - 1], [0, 0, 0], 1, [0.95, 0.75, 0.15]);
    // bandeira de cor do jogador (mastro)
    g.k = MAT.METAL;
    g.put(cylinder(0.06, 0.05, 7, 8), [12, 5, 14], [0, 0, 0], 1, METAL);
    // casinha da fábrica de bolsas de tinta (aberta para o pátio)
    casinha(g, 13.6, 2.5, [0.48, 0.34, 0.22]);
    {
      const hx = 13.6, hz = 2.5;
      // mesa de trabalho encostada na parede do fundo
      g.k = MAT.MADEIRA; g.put(rbox(0.9, 0.1, 2.6, 0.02), [hx + 1.55, 2.6, hz], [0, 0, 0], 1, [0.55, 0.4, 0.26]);
      g.k = MAT.METAL; for (const z of [-1.1, 1.1]) for (const x of [-0.35, 0.35]) g.put(box(0.07, 0.95, 0.07), [hx + 1.55 + x, 2.1, hz + z], [0, 0, 0], 1, METAL);
      // tanque de tinta, funil, bolsas prontas
      g.k = MAT.PINTADO; g.put(cylinder(0.32, 0.32, 0.7, 16), [hx + 1.6, 2.0, hz - 1.6], [0, 0, 0], 1, [0.3, 0.12, 0.38]);
      g.put(lathe([[0.04, 0], [0.2, 0.25], [0.21, 0.27]], 12), [hx + 1.6, 2.38, hz - 1.6], [0, 0, 0], 1, [0.5, 0.5, 0.52]);
      g.k = MAT.LISO; for (let k = 0; k < 5; k++) g.put(sphere(0.09, 10, 8), [hx + 1.45 + (k % 2) * 0.16, 2.73, hz + 0.2 + k * 0.17], [0, 0, 0], [1, 1.15, 1], [0.15, 0.05, 0.2]);
    }
    // barraca de armas (mesmo tamanho da casinha de tinta), com computador, balcão e caixas de munição
    {
      const hx = BARRACA_ARMAS.x, hz = BARRACA_ARMAS.z;
      casinha(g, hx, hz, [0.36, 0.38, 0.32]);
      g.k = MAT.METAL;
      g.put(rbox(0.9, 0.1, 2.0, 0.02), [hx + 1.55, 2.6, hz + 0.6], [0, 0, 0], 1, [0.32, 0.33, 0.35]); // balcão
      for (const z of [-0.3, 1.5]) for (const x of [-0.35, 0.35]) g.put(box(0.07, 0.95, 0.07), [hx + 1.55 + x, 2.1, hz + z], [0, 0, 0], 1, METAL);
      g.put(rbox(0.5, 0.55, 0.42, 0.04), [hx + 1.5, 1.98, hz - 1.35], [0, 0, 0], 1, [0.24, 0.27, 0.3]); // gabinete do computador
      g.put(rbox(0.12, 0.35, 0.12, 0.02), [hx + 1.65, 2.82, hz - 1.35], [0, 0, 0], 1, [0.2, 0.2, 0.22]); // suporte do monitor
      g.put(rbox(0.08, 0.5, 0.75, 0.03), [hx + 1.7, 3.2, hz - 1.35], [0, 0, 0], 1, [0.12, 0.12, 0.13]); // monitor
      g.put(rbox(0.3, 0.03, 0.6, 0.01), [hx + 1.25, 2.68, hz - 1.35], [0, 0, 0.0], 1, [0.18, 0.18, 0.2]); // teclado
      g.put(rbox(0.8, 0.08, 0.9, 0.02), [hx + 1.45, 2.6, hz - 1.35], [0, 0, 0], 1, [0.4, 0.3, 0.2]); // mesinha
      g.k = MAT.PINTADO;
      for (let k = 0; k < 3; k++) g.put(rbox(0.55, 0.35, 0.4, 0.03), [hx + 0.4 + k * 0.05, 1.9 + k * 0.36, hz + 1.45], [0, k * 0.15, 0], 1, [0.3, 0.36, 0.2]); // caixas de munição
      g.put(rbox(0.12, 0.04, 0.3, 0.01), [hx + 0.4, 2.62, hz + 1.45], [0, 0.3, 0], 1, [0.85, 0.7, 0.2]);
      g.k = MAT.MADEIRA;
      g.put(box(0.06, 1.3, 2.8), [hx + 1.99, 3.85, hz + 0.35], [0, 0, 0], 1, [0.3, 0.2, 0.12]); // painel de exposição na parede
      for (let i = 0; i < 5; i++) g.put(box(0.12, 0.025, 2.6), [hx + 1.9, 4.18 - i * 0.24, hz + 0.35], [0, 0, 0], 1, [0.25, 0.16, 0.1]); // prateleiras
    }
    // barraca da corrida de submarino (ao lado da loja de armas): troféus na parede e uma bola brilhante no meio
    {
      const hx = BARRACA_CORRIDA.x, hz = BARRACA_CORRIDA.z;
      casinha(g, hx, hz, [0.22, 0.34, 0.44]);
      g.k = MAT.MADEIRA;
      g.put(box(0.12, 0.05, 3.2), [hx + 1.92, 3.05, hz], [0, 0, 0], 1, [0.3, 0.2, 0.12]); // prateleira dos troféus
      g.put(box(0.12, 0.05, 3.2), [hx + 1.92, 3.95, hz], [0, 0, 0], 1, [0.3, 0.2, 0.12]);
      g.k = MAT.METAL;
      const ouro = [0.95, 0.76, 0.22], prata = [0.8, 0.82, 0.86], bronze = [0.72, 0.45, 0.25];
      [[3.08, -1.1, ouro, 1.25], [3.08, -0.35, prata, 1], [3.08, 0.4, bronze, 0.9], [3.08, 1.1, ouro, 0.8], [3.98, -0.8, ouro, 0.9], [3.98, 0.1, prata, 1.1], [3.98, 0.95, bronze, 0.85]].forEach(([y, z, c, k]) => {
        g.put(cylinder(0.07 * k, 0.1 * k, 0.08 * k, 10), [hx + 1.88, y + 0.04 * k, hz + z], [0, 0, 0], 1, [0.2, 0.15, 0.1]); // base
        g.put(cylinder(0.025 * k, 0.025 * k, 0.12 * k, 8), [hx + 1.88, y + 0.14 * k, hz + z], [0, 0, 0], 1, c);
        g.put(cylinder(0.12 * k, 0.05 * k, 0.2 * k, 14), [hx + 1.88, y + 0.3 * k, hz + z], [0, 0, 0], 1, c); // taça
        for (const s2 of [-1, 1]) g.put(torus(0.05 * k, 0.012 * k, 10, 5), [hx + 1.88, y + 0.32 * k, hz + z + s2 * 0.13 * k], [Math.PI / 2, 0, 0], 1, c); // alças
      });
      // bandeira quadriculada na parede do fundo
      for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) g.put(box(0.03, 0.2, 0.2), [hx + 2.05, 4.35 + j * 0.2 - 0.2, hz - 0.7 + i * 0.2], [0, 0, 0], 1, (i + j) % 2 ? [0.95, 0.95, 0.95] : [0.08, 0.08, 0.08]);
      g.put(cylinder(0.32, 0.4, 0.9, 16), [hx + 0.2, 2.0, hz], [0, 0, 0], 1, [0.18, 0.2, 0.24]); // pedestal da bola
    }
    const sn = new Node('estrutura'); sn.mesh = R.createMesh(g, { rough: 0.85, metal: 0.05, rust: 0.45 });
    this.root.add(sn);
    // tela do terminal (emissiva)
    const tg = new Geo(); tg.put(box(0.85, 0.55, 0.02), [-4, 3.42, 9.22], [-0.25, 0.4, 0], 1, [0.2, 0.8, 0.9]);
    const tn = new Node('tela_terminal'); tn.mesh = R.createMesh(tg, { emissive: [0.25, 0.75, 0.9], glow: 1.4, castShadow: false }); this.root.add(tn);
    // placa da estação
    this.sign = null;
    // placa na parede da casinha ensinando a fabricar
    const ens = textQuad(R, ['FÁBRICA DE BOLSAS DE TINTA', '1. Pesque uma LULA (à noite, com a linha funda)', '2. Venha com a lula NA MÃO até esta mesa', '3. Aperte E: 1 lula vira 2 bolsas de tinta', '4. A mochila guarda até 10 bolsas', '5. No submarino, submerso, aperte B para lançar', 'Serve para acertar o submarino de um amigo na água', 'e tampar toda a visão dele até ele voltar à superfície!'], 2.9, 1.7, { px: 1100, bg: '#2a1f30', border: '#c58cff' });
    ens.at(13.6 + 1.98, 3.62, 2.5).rot(0, -Math.PI / 2, 0); this.root.add(ens);
    {
      const hx = BARRACA_ARMAS.x, hz = BARRACA_ARMAS.z;
      // armas expostas na parede (todas as que a loja vende)
      // uma prateleira por arma, da mais fraca (em cima) à bazuca (embaixo)
      ARMAS_ORDEM.forEach((k, i) => {
        const n = new Node('expo_' + k); n.mesh = weaponMesh(R, k);
        const sc = k === 'bazuca' ? 0.85 : k === 'sniper' ? 1.05 : k === 'fuzil' ? 1.25 : 1.7;
        const zc = { pistola: 0.35, metralhadora: 0.3, fuzil: 0.25, sniper: 0.1, bazuca: 0.2 }[k];
        n.at(hx + 1.9, 4.28 - i * 0.24, hz + zc).rot(0, Math.PI, 0).sc(sc);
        this.root.add(n);
      });
      const tela = new Geo(); tela.put(box(0.02, 0.42, 0.66), [hx + 1.65, 3.2, hz - 1.35], [0, 0, 0], 1, [0.95, 0.35, 0.2]);
      const tn2 = new Node('tela_armas'); tn2.mesh = R.createMesh(tela, { emissive: [0.9, 0.35, 0.15], glow: 1.3, castShadow: false }); this.root.add(tn2);
      const pl = textQuad(R, ['LOJA DE ARMAS', 'Compre no computador (E)', 'Estilingue → Pistola → Submetralhadora → Fuzil → Sniper → Bazuca', 'As balas também são vendidas aqui'], 2.2, 0.75, { px: 900, bg: '#2a1a16', border: '#ff8a4a' });
      pl.at(hx + 0.2, 3.25, hz - 1.72).rot(0, 0, 0); this.root.add(pl);
      const ent2 = textQuad(R, ['ARMAS'], 2.4, 0.42, { px: 512, bg: '#3a1c16', border: '#ff8a4a' });
      ent2.at(hx - 2.36, 4.42, hz).rot(0, -Math.PI / 2, 0); this.root.add(ent2);
    }
    {
      const hx = BARRACA_CORRIDA.x, hz = BARRACA_CORRIDA.z;
      const bg = new Geo(); bg.put(sphere(0.38, 22, 16), [hx + 0.2, 2.82, hz], [0, 0, 0], 1, [0.35, 1, 0.6]);
      const bola = new Node('bola_corrida'); bola.mesh = R.createMesh(bg, { emissive: [0.3, 1.3, 0.6], glow: 1.4, castShadow: false }); this.root.add(bola);
      this.bolaCorrida = bola;
      const pl = textQuad(R, ['CORRIDA DE SUBMARINO', 'Toque na bola (E) e chame os amigos', '2 corredores: vence ganha S$ 200 · perde paga S$ 200', '3 a 5: vence ganha S$ 250 (dividido entre quem perde)'], 2.3, 0.8, { px: 900, bg: '#12302a', border: '#5fe39a' });
      pl.at(hx + 0.1, 3.3, hz - 1.72).rot(0, 0, 0); this.root.add(pl);
      const ent3 = textQuad(R, ['CORRIDA'], 2.4, 0.42, { px: 512, bg: '#123a2c', border: '#5fe39a' });
      ent3.at(hx - 2.36, 4.42, hz).rot(0, -Math.PI / 2, 0); this.root.add(ent3);
    }
    const ent = textQuad(R, ['BOLSAS DE TINTA'], 2.4, 0.42, { px: 512, bg: '#3a2a1c' });
    ent.at(13.6 - 2.36, 4.42, 2.5).rot(0, -Math.PI / 2, 0); this.root.add(ent);
  }

  setSign(nome) {
    if (this.signNome === nome) return;
    this.signNome = nome;
    if (this.sign) this.root.remove(this.sign);
    // placa com as duas faces legíveis
    this.sign = new Node('placa');
    const fr = textQuad(this.R, [this.st.nome, nome || 'vaga livre'], 4.2, 1.5); fr.at(0, 0, -0.04).rot(0, Math.PI, 0);
    const bk = textQuad(this.R, [this.st.nome, nome || 'vaga livre'], 4.2, 1.5); bk.at(0, 0, 0.04);
    this.sign.add(fr, bk); this.sign.at(PLACA_X, 3.4, -12.5);
    this.root.add(this.sign);
    // poste da placa
    if (!this.signPost) {
      const g = new Geo(); for (const s of [-1, 1]) g.put(box(0.12, 3.4, 0.12), [PLACA_X + s * 2.0, 2.4, -12.45], [0, 0, 0], 1, WOOD_DK);
      this.signPost = new Node('poste'); this.signPost.mesh = this.R.createMesh(g, { rough: 0.9, kind: MAT.MADEIRA }); this.root.add(this.signPost);
    }
  }

  buildCrane() {
    const R = this.R;
    const pivot = new Node('guindaste').at(this.xPivot, 1.9, this.zPivot);
    this.root.add(pivot);
    const g = new Geo();
    g.put(cylinder(0.45, 0.55, 7.5, 14), [0, 3.75, 0], [0, 0, 0], 1, YEL);
    g.put(rbox(1.4, 1.2, 1.6, 0.1), [0, 7.4, -0.4], [0, 0, 0], 1, YEL);
    g.put(rbox(0.9, 0.7, 0.05, 0.03), [0, 7.5, 0.42], [0, 0, 0], 1, [0.2, 0.3, 0.35]);
    const col = new Node('coluna'); col.mesh = R.createMesh(g, { rough: 0.55, metal: 0.4, kind: MAT.PINTADO, rust: 0.35 }); pivot.add(col);
    const arm = new Node('lanca').at(0, 7.8, 0); pivot.add(arm);
    const ag = new Geo();
    // treliça da lança
    const L = this.boom;
    for (const s of [-1, 1]) for (const y of [-0.25, 0.25]) ag.put(cylinder(0.06, 0.06, L, 8), [s * 0.25, y, L / 2], [Math.PI / 2, 0, 0], 1, YEL);
    for (let k = 0; k < L; k += 0.9) for (const s of [-1, 1]) ag.put(cylinder(0.03, 0.03, 0.62, 6), [s * 0.25, 0, k], [0.0, 0, 0], 1, YEL);
    ag.put(cylinder(0.25, 0.25, 0.6, 12), [0, 0, L], [0, 0, Math.PI / 2], 1, METAL); // polia
    ag.put(rbox(0.9, 0.9, 1.4, 0.1), [0, 0.1, -1.0], [0, 0, 0], 1, CONC); // contrapeso
    arm.mesh = R.createMesh(ag, { rough: 0.55, metal: 0.4, kind: MAT.PINTADO, rust: 0.35 });
    const hook = new Node('gancho');
    const hg = new Geo();
    hg.put(rbox(0.4, 0.4, 0.3, 0.05), [0, 0, 0], [0, 0, 0], 1, METAL);
    hg.put(torus(0.18, 0.05, 14, 8), [0, -0.38, 0], [0, 0, Math.PI / 2], 1, [0.3, 0.3, 0.3]);
    hook.mesh = R.createMesh(hg, { rough: 0.4, metal: 0.8, kind: MAT.METAL });
    this.root.add(hook);
    const cable = new Node('cabo');
    this.root.add(cable);
    return { pivot, arm, hook, cable, L };
  }

  // atualiza a lança, o gancho e o cabo a partir da pose do submarino (local ou remoto)
  updateCrane(dt, subPos, subEstado, gancho = 0) {
    const sl = subPos ? this.toLocal(subPos) : null;
    let alvoAng = 0, hookLocal;
    const tip = (ang) => [this.xPivot + Math.sin(ang) * this.crane.L, 1.9 + 7.8, this.zPivot + Math.cos(ang) * this.crane.L];
    if (sl && ['berco', 'descendo', 'subindo', 'preso'].includes(subEstado)) {
      alvoAng = Math.atan2(sl[0] - this.xPivot, sl[2] - this.zPivot);
      this.boomAng = alvoAng;
      const t = tip(this.boomAng);
      hookLocal = [t[0], sl[1] + 1.85, t[2]];
    } else {
      // aguardando: gancho estacionado sobre a água, pronto para pescar o sub de volta
      alvoAng = gancho > 0 ? this.angAgua : this.angAgua;
      this.boomAng = damp(this.boomAng, alvoAng, 1.5, dt);
      const t = tip(this.boomAng);
      this.hookY = damp(this.hookY, gancho > 0 ? gancho : 5.5, 2, dt);
      hookLocal = [t[0], this.hookY, t[2]];
    }
    this.crane.arm.rot(0, this.boomAng, 0);
    this.crane.hook.at(hookLocal[0], hookLocal[1], hookLocal[2]).rot(0, this.boomAng, 0);
    // cabo: tubo fino da polia até o gancho
    const t = tip(this.boomAng);
    const geo = tube([[t[0], t[1], t[2]], [hookLocal[0], hookLocal[1] + 0.2, hookLocal[2]]], 0.035, 6);
    geo.c = geo.c.map((v, i) => (i % 4 === 3 ? 0 : 0.12));
    if (!this.crane.cable.mesh) this.crane.cable.mesh = this.R.createMesh(geo, { rough: 0.6, metal: 0.6 }, { dynamic: true });
    else this.R.updateMesh(this.crane.cable.mesh, geo);
    this.crane.cable.mesh.radius = 1e6;
    return this.toWorld(hookLocal[0], hookLocal[1], hookLocal[2]);
  }

  // reconstrói peças dependentes de compras (só quando algo muda)
  updateVisual(est, cor, nome) {
    // decorações desequipadas não aparecem (continuam compradas)
    if (est?.decoOff) { est = { ...est }; for (const k of Object.keys(est.decoOff)) if (est.decoOff[k]) est[k] = false; }
    const key = JSON.stringify({ e: est, cor, nome: nome || '' }, (k, v) => (k === 'peixes' ? v.map((f) => f.uid + f.esp + f.cm) : v));
    this.setSign(nome);
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const c of [...this.dyn.children]) this.dyn.remove(c);
    this.aqFish = []; this.tankFish = []; this.lights = [];
    const R = this.R;
    const g = new Geo();
    const pal = CORES_JOGADOR[cor % CORES_JOGADOR.length];
    // bandeira
    g.put(box(2.2, 1.3, 0.04), [13.15, 7.6, 14], [0, 0, 0], 1, pal.roupa);
    // bancada de peixe (onde ficava a recicladora): mesa de inox, tábua de corte, faca e balde de gelo
    if (est?.peixaria) {
      const bx = BANCADA_PEIXE.x, bz = BANCADA_PEIXE.z;
      g.put(rbox(1.1, 0.08, 2.6, 0.02), [bx, 2.45, bz], [0, 0, 0], 1, [0.78, 0.8, 0.82]); // tampo de inox
      for (const sx of [-0.45, 0.45]) for (const sz of [-1.15, 1.15]) g.put(cylinder(0.05, 0.05, 0.9, 8), [bx + sx, 1.98, bz + sz], [0, 0, 0], 1, METAL);
      g.put(rbox(1.0, 0.05, 2.4, 0.02), [bx, 1.75, bz], [0, 0, 0], 1, [0.6, 0.62, 0.65]); // prateleira
      g.put(rbox(0.75, 0.06, 1.7, 0.03), [bx + 0.05, 2.52, bz], [0, 0, 0], 1, [0.85, 0.68, 0.45]); // tábua
      g.put(box(0.03, 0.02, 0.3), [bx - 0.35, 2.56, bz + 1.05], [0, 0.3, 0], 1, [0.85, 0.87, 0.9]); // lâmina
      g.put(box(0.05, 0.04, 0.14), [bx - 0.4, 2.56, bz + 1.27], [0, 0.3, 0], 1, [0.12, 0.1, 0.08]); // cabo
      g.put(cylinder(0.28, 0.22, 0.45, 14), [bx - 0.1, 1.83, bz - 1.75], [0, 0, 0], 1, [0.25, 0.45, 0.75]); // balde
      g.put(sphere(0.25, 10, 6), [bx - 0.1, 2.02, bz - 1.75], [0, 0, 0], [1, 0.35, 1], [0.9, 0.95, 1]); // gelo
      g.put(rbox(0.06, 0.9, 1.6, 0.02), [bx - 0.6, 3.0, bz], [0, 0, 0], 1, [0.78, 0.8, 0.82]); // espelho de inox atrás
    }
    if (est?.restauro) {
      g.put(rbox(2.2, 0.1, 1.0, 0.03), [-13, 2.45, -2.5], [0, Math.PI / 2, 0], 1, [0.5, 0.38, 0.25]);
      for (const z of [-0.9, 0.9]) g.put(box(0.1, 0.9, 0.9), [-13, 1.95, -2.5 + z], [0, 0, 0], 1, METAL);
      g.put(cylinder(0.04, 0.04, 0.8, 6), [-13.3, 2.9, -3.2], [0, 0, 0.4], 1, METAL);
      g.put(lathe([[0, 0], [0.18, 0.02], [0.12, 0.15]], 10), [-13.45, 3.3, -3.2], [Math.PI, 0, 0], 1, [0.8, 0.75, 0.2]);
    }
    if (est?.carregador) g.put(rbox(0.5, 0.3, 0.3, 0.05), [3.2, 3.0, this.zCradle - 1], [0, 0, 0], 1, [0.2, 0.9, 0.4]);
    if (est?.decoracao) {
      for (let k = 0; k < 4; k++) {
        g.put(cylinder(0.35, 0.28, 0.5, 10), [-16 + k * 1.2, 1.8, 15], [0, 0, 0], 1, [0.6, 0.35, 0.2]);
        const b = icosphere(0.45, 1); noisy(b, 0.1, 3, k);
        g.put(b, [-16 + k * 1.2, 2.3, 15], [0, 0, 0], 1, [0.25 + k * 0.05, 0.5, 0.2]);
      }
      // bandeirinhas
      for (let k = 0; k < 10; k++) g.put(box(0.3, 0.35, 0.02), [-5 + k * 1.1, 6.2 - Math.sin((k / 9) * Math.PI) * 0.6, -4], [0, 0, 0], 1, CORES_JOGADOR[k % CORES_JOGADOR.length].roupa);
    }
    // ---- decorações baratinhas ----
    if (est?.vasos) for (let k = 0; k < 3; k++) {
      const x = 5.6 + k * 1.3, cores = [[0.95, 0.3, 0.45], [1, 0.82, 0.2], [0.65, 0.4, 0.95]];
      g.put(cylinder(0.32, 0.24, 0.55, 12), [x, 1.83, 15.6], [0, 0, 0], 1, [0.72, 0.42, 0.28]);
      g.put(cylinder(0.3, 0.3, 0.05, 12), [x, 2.1, 15.6], [0, 0, 0], 1, [0.3, 0.2, 0.12]);
      for (let f = 0; f < 5; f++) {
        const a2 = f * 1.26, fx = x + Math.cos(a2) * 0.14, fz = 15.6 + Math.sin(a2) * 0.14;
        g.put(cylinder(0.015, 0.015, 0.45, 5), [fx, 2.35, fz], [0, 0, 0], 1, [0.25, 0.55, 0.22]);
        g.put(sphere(0.1, 8, 6), [fx, 2.6, fz], [0, 0, 0], [1, 0.6, 1], cores[(k + f) % 3]);
        g.put(sphere(0.04, 6, 4), [fx, 2.64, fz], [0, 0, 0], 1, [1, 0.9, 0.3]);
      }
    }
    if (est?.flamingos) for (const [x, z, r] of [[9.4, 11.4, 0.4], [10.3, 12.1, -0.5]]) {
      const pk = [0.98, 0.45, 0.62];
      for (const s2 of [-1, 1]) g.put(cylinder(0.02, 0.02, 0.85, 5), [x + s2 * 0.06, 1.98, z], [0, 0, 0], 1, [0.2, 0.2, 0.2]);
      g.put(sphere(0.28, 12, 8), [x, 2.55, z], [0, r, 0], [0.8, 0.75, 1.25], pk);
      g.add(tube([[0, 0, 0.25], [0, 0.35, 0.32], [0, 0.6, 0.2], [0, 0.7, 0.3]], 0.05, 6), m4.compose(m4.create(), [x, 2.55, z], quat.fromEuler(quat.create(), 0, r, 0), [1, 1, 1]), [...pk, 1]);
      g.put(sphere(0.11, 10, 8), [x + Math.sin(r) * 0.3, 3.27, z + Math.cos(r) * 0.3], [0, 0, 0], 1, pk);
      g.put(cylinder(0.03, 0.05, 0.16, 6), [x + Math.sin(r) * 0.42, 3.22, z + Math.cos(r) * 0.42], [Math.PI / 2 + 0.4, r, 0], 1, [0.15, 0.12, 0.12]);
    }
    if (est?.boias) for (const z of [24, 36]) for (const s2 of [-1, 1]) {
      for (let k = 0; k < 8; k++) g.put(torus(0.32, 0.1, 6, 8), [s2 * 2.2, 1.55, z], [0, 0, Math.PI / 2], 1, [0.95, 0.95, 0.95]);
      for (let k = 0; k < 4; k++) { const a3 = (k / 4) * Math.PI * 2 + 0.4; g.put(box(0.04, 0.24, 0.24), [s2 * 2.2, 1.55 + Math.sin(a3) * 0.32, z + Math.cos(a3) * 0.32], [a3, 0, 0], 1, [0.9, 0.15, 0.12]); }
    }
    if (est?.banco) {
      const bx = -8, bz = 13;
      for (let k = 0; k < 3; k++) g.put(rbox(2.0, 0.06, 0.16, 0.02), [bx, 2.15, bz - 0.2 + k * 0.2], [0, 0, 0], 1, [0.62, 0.42, 0.24]); // assento
      for (let k = 0; k < 2; k++) g.put(rbox(2.0, 0.14, 0.05, 0.02), [bx, 2.45 + k * 0.22, bz - 0.36], [0.12, 0, 0], 1, [0.62, 0.42, 0.24]); // encosto
      for (const s2 of [-0.85, 0.85]) { g.put(box(0.07, 0.6, 0.55), [bx + s2, 1.85, bz], [0, 0, 0], 1, [0.15, 0.15, 0.16]); g.put(box(0.07, 0.55, 0.06), [bx + s2, 2.45, bz - 0.38], [0.12, 0, 0], 1, [0.15, 0.15, 0.16]); }
    }
    if (est?.guardasol) {
      const ux = -13.5, uz = 4.5;
      g.put(cylinder(0.04, 0.04, 2.6, 6), [ux, 2.85, uz], [0, 0, 0.08], 1, [0.85, 0.85, 0.85]);
      for (let k = 0; k < 8; k++) g.put(lathe([[0, 0.45], [1.25, 0]], 3), [ux + 0.1, 4.05, uz], [0, (k / 8) * Math.PI * 2, 0], 1, k % 2 ? [0.95, 0.95, 0.92] : [0.2, 0.55, 0.85]);
      // cadeira de praia listrada
      g.put(box(0.6, 0.04, 0.9), [ux + 1.1, 1.95, uz + 0.4], [0.3, 0, 0], 1, [0.95, 0.55, 0.2]);
      g.put(box(0.6, 0.04, 0.6), [ux + 1.1, 2.15, uz - 0.15], [-0.9, 0, 0], 1, [0.95, 0.55, 0.2]);
      for (const s2 of [-0.28, 0.28]) g.put(box(0.04, 0.5, 0.04), [ux + 1.1 + s2, 1.8, uz + 0.1], [0.5, 0, 0], 1, [0.4, 0.3, 0.2]);
    }
    if (est?.churrasqueira) {
      const cx = -10, cz = 2.6;
      g.put(rbox(1.2, 1.0, 0.75, 0.03), [cx, 2.05, cz], [0, 0, 0], 1, [0.62, 0.3, 0.2]); // tijolos
      for (let k = 0; k < 4; k++) g.put(box(1.22, 0.03, 0.77), [cx, 1.7 + k * 0.25, cz], [0, 0, 0], 1, [0.8, 0.75, 0.7]); // rejunte
      g.put(box(1.0, 0.04, 0.6), [cx, 2.58, cz], [0, 0, 0], 1, [0.15, 0.15, 0.15]); // grelha
      g.put(rbox(0.5, 0.7, 0.45, 0.03), [cx + 0.3, 3.0, cz - 0.1], [0, 0, 0], 1, [0.55, 0.27, 0.18]); // chaminé
      for (let k = 0; k < 3; k++) g.put(capsule(0.05, 0.25, 6, 2), [cx - 0.3 + k * 0.18, 2.64, cz + 0.05], [0, 0, Math.PI / 2], 1, [0.55, 0.22, 0.15]); // linguiças
    }
    if (est?.rede) {
      for (const x of [4.5, 8.3]) g.put(cylinder(0.1, 0.12, 2.6, 8), [x, 2.85, -5], [0, 0, 0], 1, WOOD_DK);
      const listras = [[0.95, 0.35, 0.3], [0.98, 0.85, 0.3], [0.3, 0.65, 0.9]];
      for (let k = 0; k < 9; k++) {
        const t = k / 8, x = 4.7 + t * 3.4, y = 3.3 - Math.sin(t * Math.PI) * 0.75;
        g.put(box(0.44, 0.04, 0.9), [x, y, -5], [0, 0, Math.atan(-0.69 * Math.cos(t * Math.PI))], 1, listras[k % 3]);
      }
    }
    // depósito: caixas proporcionais ao número de itens guardados
    const nCx = Math.min(12, Math.ceil((est?.depositoN || 0) / 2));
    for (let k = 0; k < nCx; k++) g.put(rbox(0.7, 0.55, 0.7, 0.04), [-7.7, 1.85 + (k % 3) * 0.95, -3.5 + Math.floor(k / 3) * 0.95], [0, k * 0.2, 0], 1, k % 2 ? [0.6, 0.45, 0.25] : [0.5, 0.38, 0.2]);
    // postes de luz
    if (est?.iluminacao) {
      for (const [x, z] of [[-2.6, 20], [2.6, 32], [-2.6, 44], [10, -2], [-16, 4]]) {
        g.put(cylinder(0.08, 0.1, 4, 8), [x, 3.3, z], [0, 0, 0], 1, [0.15, 0.15, 0.15]);
        g.put(rbox(0.5, 0.15, 0.3, 0.04), [x, 5.3, z], [0, 0, 0], 1, [0.15, 0.15, 0.15]);
        this.lights.push(this.toWorld(x, 5.0, z));
      }
    }
    if (g.vcount) { const n = new Node('extras'); n.mesh = R.createMesh(g, { rough: 0.8, kind: MAT.PINTADO, rust: 0.3 }); this.dyn.add(n); }
    if (this.lights.length) {
      const lg = new Geo(); for (const p of this.lights) { const l = this.toLocal(p); lg.put(sphere(0.18, 10, 6), [l[0], 5.15, l[2]], [0, 0, 0], 1, [1, 0.9, 0.6]); }
      const ln = new Node('lampadas'); ln.mesh = R.createMesh(lg, { emissive: [1, 0.85, 0.5], glow: 2, castShadow: false }); this.dyn.add(ln);
      this.lampNode = ln;
    }
    if (est?.peixaria && est.peixariaEst?.peixe) {
      const f = est.peixariaEst.peixe, bx = BANCADA_PEIXE.x + 0.05, bz = BANCADA_PEIXE.z;
      const cm = Math.min(f.cm, 150);
      if (!est.peixariaEst.cortado) {
        const n = fishNode(R, f.esp, cm); n.at(bx, 2.62, bz).rot(0, 0, Math.PI / 2); this.dyn.add(n);
      } else {
        // cortado: cabeça, rabo e três filés rosados
        const fn = fishCutNode(R, f.esp, cm); fn.at(bx, 2.62, bz); this.dyn.add(fn);
      }
    }
    if (est?.luzinhas) {
      const lg = new Geo(), cores = [[1, 0.3, 0.3], [1, 0.85, 0.3], [0.3, 1, 0.45], [0.35, 0.6, 1], [1, 0.45, 0.9]];
      const fio = new Geo();
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, x = -16.3 + t * 10.6, y = 5.3 - Math.sin(t * Math.PI) * 0.55;
        lg.put(sphere(0.09, 8, 6), [x, y - 0.12, -0.9], [0, 0, 0], [1, 1.3, 1], cores[k % cores.length]);
        if (k < 16) { const x2 = -16.3 + ((k + 1) / 16) * 10.6, y2 = 5.3 - Math.sin(((k + 1) / 16) * Math.PI) * 0.55; fio.put(cylinder(0.012, 0.012, Math.hypot(x2 - x, y2 - y), 4), [(x + x2) / 2, (y + y2) / 2, -0.9], [0, 0, Math.atan2(x2 - x, y - y2) + Math.PI / 2], 1, [0.1, 0.1, 0.1]); }
      }
      const fn = new Node('fio_luzinhas'); fn.mesh = R.createMesh(fio, { rough: 0.8 }); this.dyn.add(fn);
      const ln2 = new Node('luzinhas'); ln2.mesh = R.createMesh(lg, { emissive: [0.35, 0.3, 0.28], glow: 0.9, castShadow: false }); this.dyn.add(ln2);
    }
    // aquário
    this.estVis = est;
    const vit = est?.vitrine || { tipo: 'aquario', nivel: 0, peixes: [] };
    if (vit.tipo === 'tanque') this.buildTank(vit); else this.buildAquarium(vit);
  }

  buildAquarium(aq) {
    const R = this.R;
    const t = AQUARIOS[aq.nivel];
    const [w, h, d] = t.dims;
    const est = t.estilo || 'simples';
    const { x, z } = vitrineLayout({ tipo: 'aquario', nivel: aq.nivel }), standH = est === 'redondo' ? 0.85 : 1.0;
    const baseY = 1.55 + standH;
    const g = new Geo();
    const verdes = [[0.2, 0.6, 0.25], [0.3, 0.72, 0.2], [0.12, 0.45, 0.2], [0.5, 0.75, 0.25]];
    const coral = [[0.95, 0.45, 0.4], [0.98, 0.7, 0.3], [0.75, 0.4, 0.85], [0.95, 0.55, 0.7], [0.4, 0.8, 0.85]];
    if (est === 'redondo') {
      // aquário de peixinho: aquário-bola sobre uma mesinha redonda
      const r = w / 2;
      g.put(cylinder(0.32, 0.32, 0.05, 20), [x, baseY - 0.03, z], [0, 0, 0], 1, [0.36, 0.25, 0.17]);
      g.put(cylinder(0.05, 0.06, standH - 0.05, 10), [x, 1.55 + (standH - 0.05) / 2, z], [0, 0, 0], 1, [0.3, 0.22, 0.16]);
      g.put(cylinder(0.22, 0.25, 0.04, 16), [x, 1.57, z], [0, 0, 0], 1, [0.3, 0.22, 0.16]);
      g.put(cylinder(r * 0.55, r * 0.5, 0.05, 16), [x, baseY + 0.03, z], [0, 0, 0], 1, [0.85, 0.6, 0.45]); // pedrinhas coloridas
      g.add(tube([[0, 0, 0], [0.02, 0.12, 0], [-0.01, 0.22, 0.01]], 0.012, 4), m4.compose(m4.create(), [x + 0.06, baseY + 0.05, z], [0, 0, 0, 1], [1, 1, 1]), [0.25, 0.65, 0.3, 1]);
      g.put(icosphere(0.04, 1), [x - 0.07, baseY + 0.07, z + 0.03], [0, 1, 0], 1, [0.45, 0.42, 0.4]);
      const base = new Node('aquario_base'); base.mesh = R.createMesh(g, { rough: 0.7 }); this.dyn.add(base);
      const wg = new Geo(); wg.put(sphere(r * 0.94, 20, 14), [x, baseY + r * 0.83, z], [0, 0, 0], [1, 0.82, 1], [0.35, 0.65, 0.78]);
      const wn = new Node('aquario_agua'); wn.mesh = R.createMesh(wg, { opacity: 0.22, rough: 0.1, castShadow: false }); this.dyn.add(wn);
      const gg = new Geo(); gg.put(sphere(r, 22, 16), [x, baseY + r, z], [0, 0, 0], 1, [0.85, 0.95, 1]);
      gg.put(torus(r * 0.55, 0.015, 20, 6), [x, baseY + r * 1.83, z], [0, 0, 0], 1, [0.85, 0.95, 1]);
      const gn = new Node('aquario_vidro'); gn.mesh = R.createMesh(gg, { opacity: 0.14, rough: 0.02, castShadow: false, doubleSide: true }); this.dyn.add(gn);
      const lab = textQuad(R, [`${t.nome.split(' (')[0]} [${aq.peixes.length}/${t.vagas}]`, `até ${t.maxCm} cm`], 1.3, 0.37, { px: 384 });
      lab.at(x, 1.55 + standH * 0.6, z + 0.36); this.dyn.add(lab);
      this.aqBox = { x, y: baseY + r * 0.45, z, w: r * 0.9, h: r * 0.7, d: r * 0.9 };
    } else {
      const madeira = est === 'corais' ? [0.15, 0.17, 0.2] : [0.3, 0.22, 0.16];
      g.put(rbox(w + 0.2, standH, d + 0.15, 0.04), [x, 1.55 + standH / 2, z], [0, 0, 0], 1, madeira);
      g.put(rbox(w + 0.06, 0.05, d + 0.06, 0.01), [x, baseY + 0.02, z], [0, 0, 0], 1, [0.1, 0.1, 0.1]);
      g.put(rbox(w + 0.06, 0.06, d + 0.06, 0.01), [x, baseY + h + 0.03, z], [0, 0, 0], 1, [0.1, 0.1, 0.1]);
      // fundo: areia clara (corais), substrato escuro (plantado) ou cascalho
      const areia = est === 'corais' ? [0.93, 0.88, 0.75] : est === 'plantado' ? [0.28, 0.22, 0.17] : [0.82, 0.74, 0.55];
      g.put(rbox(w - 0.02, est === 'plantado' ? 0.1 : 0.06, d - 0.02, 0.01), [x, baseY + 0.07, z], [0, 0, 0], 1, areia);
      const nPl = est === 'plantado' ? 8 + aq.nivel * 2 : est === 'corais' ? 2 : 2 + aq.nivel;
      for (let k = 0; k < nPl; k++) {
        const px = x - w / 2 + 0.1 + ((k * 0.37) % 1) * (w - 0.2), pz = z - d / 2 + 0.08 + ((k * 0.61) % 1) * (d * (est === 'plantado' ? 0.75 : 0.4));
        const alt = h * (est === 'plantado' ? 0.45 + ((k * 0.29) % 1) * 0.4 : 0.6);
        g.add(tube([[0, 0, 0], [0.03, alt * 0.5, 0.01], [-0.02, alt, 0]], 0.012 + w * 0.006, 4), m4.compose(m4.create(), [px, baseY + 0.08, pz], [0, 0, 0, 1], [1, 1, 1]), [...verdes[k % 4], 1]);
        if (est === 'plantado' && k % 3 === 0) g.put(sphere(0.05 + w * 0.03, 8, 6), [px + 0.04, baseY + 0.12, pz + 0.03], [0, 0, 0], [1.4, 0.5, 1], verdes[(k + 1) % 4]); // tapete de musgo
        if (est !== 'corais') g.put(icosphere(0.04 + w * 0.04, 1), [px + 0.08, baseY + 0.1, pz + 0.05], [0, k, 0], 1, [0.45, 0.42, 0.4]);
      }
      if (est === 'plantado') // tronco de madeira
        g.add(tube([[0, 0, 0], [w * 0.2, h * 0.25, 0.02], [w * 0.35, h * 0.4, -0.03]], 0.02 + w * 0.012, 6), m4.compose(m4.create(), [x - w * 0.2, baseY + 0.1, z], [0, 0, 0, 1], [1, 1, 1]), [0.4, 0.28, 0.17, 1]);
      if (est === 'corais') {
        // rochas vivas e corais coloridos
        for (let k = 0; k < 4 + aq.nivel; k++) {
          const px = x - w / 2 + 0.15 + ((k * 0.41) % 1) * (w - 0.3), pz = z - d / 2 + 0.1 + ((k * 0.57) % 1) * (d * 0.55);
          const rr = icosphere(0.06 + w * 0.05, 1); noisy(rr, 0.02, 4, k);
          g.put(rr, [px, baseY + 0.1, pz], [0, k, 0], [1.2, 0.8, 1], [0.6, 0.55, 0.5]);
          const c = coral[k % coral.length];
          if (k % 2 === 0) for (let b = 0; b < 4; b++) g.add(tube([[0, 0, 0], [Math.cos(b * 1.6) * 0.04, 0.08 + w * 0.05, Math.sin(b * 1.6) * 0.04], [Math.cos(b * 1.6) * 0.07, 0.12 + w * 0.08, Math.sin(b * 1.6) * 0.07]], 0.01 + w * 0.005, 4), m4.compose(m4.create(), [px, baseY + 0.12 + w * 0.03, pz], [0, 0, 0, 1], [1, 1, 1]), [...c, 1]);
          else g.put(sphere(0.04 + w * 0.025, 10, 8), [px + 0.05, baseY + 0.15 + w * 0.04, pz], [0, 0, 0], [1, 0.7, 1], c);
        }
      }
      // luminária
      if (aq.nivel >= 2) g.put(rbox(w * 0.8, 0.04, 0.12, 0.01), [x, baseY + h + 0.08, z], [0, 0, 0], 1, est === 'corais' ? [0.7, 0.8, 1] : [0.95, 0.95, 0.9]);
      const base = new Node('aquario_base'); base.mesh = R.createMesh(g, { rough: 0.7 }); this.dyn.add(base);
      // água (volume) e vidro
      const corAgua = est === 'corais' ? [0.3, 0.6, 0.9] : est === 'plantado' ? [0.4, 0.68, 0.6] : [0.35, 0.65, 0.75];
      const wg = new Geo(); wg.put(box(w - 0.02, h * 0.92, d - 0.02), [x, baseY + h * 0.46 + 0.02, z], [0, 0, 0], 1, corAgua);
      const wn = new Node('aquario_agua'); wn.mesh = R.createMesh(wg, { opacity: 0.22, rough: 0.1, castShadow: false, emissive: aq.nivel >= 2 ? (est === 'corais' ? [0.04, 0.1, 0.22] : [0.05, 0.12, 0.1]) : [0, 0, 0] }); this.dyn.add(wn);
      const gg = new Geo(); gg.put(box(w, h, d), [x, baseY + h / 2, z], [0, 0, 0], 1, [0.85, 0.95, 1]);
      const gn = new Node('aquario_vidro'); gn.mesh = R.createMesh(gg, { opacity: 0.12, rough: 0.02, castShadow: false, doubleSide: true }); this.dyn.add(gn);
      // etiqueta de capacidade
      const lab = textQuad(R, [`${t.nome} [${aq.peixes.length}/${t.vagas}]`, `até ${t.maxCm} cm`], Math.min(1.8, Math.max(1.1, w)), 0.45, { px: 384 });
      lab.at(x, 1.55 + standH * 0.55, z + d / 2 + 0.09); this.dyn.add(lab);
      this.aqBox = { x, y: baseY + 0.12, z, w: w - 0.1, h: h * 0.8 - 0.15, d: d - 0.1 };
    }
    for (const f of aq.peixes) {
      const n = fishNode(R, f.esp, f.cm);
      this.dyn.add(n);
      this.aqFish.push({ n, f, p: [this.aqBox.x, this.aqBox.y + this.aqBox.h / 2, z], v: [Math.random() - 0.5, 0, Math.random() - 0.5], box: this.aqBox, cm: f.cm });
    }
    this.aquarioPos = this.toWorld(x, baseY, z);
  }

  buildTank(tq) {
    const R = this.R;
    const t = TANQUES[tq.nivel];
    const [w, h, d] = t.dims;
    const { x, z } = vitrineLayout({ tipo: 'tanque', nivel: tq.nivel });
    const g = new Geo();
    const est = t.estilo || 'concreto';
    if (est === 'lona') return this.buildTankLona(tq, t, x, z);
    const wall = est === 'abissal' ? 0.45 : 0.35;
    const CONC = est === 'abissal' ? [0.2, 0.22, 0.26] : CONC0;
    // sapata de concreto (quando o tanque passa da plataforma e entra na grama)
    g.put(box(w + wall * 2 + 0.2, 3.2, d + wall * 2 + 0.2), [x, -0.15, z], [0, 0, 0], 1, CONC);
    // paredes de concreto e moldura de aço da janela frontal
    g.put(rbox(w + wall * 2, 0.4, d + wall * 2, 0.05), [x, 1.6, z], [0, 0, 0], 1, CONC);
    g.put(rbox(w + wall * 2, h, wall, 0.05), [x, 1.8 + h / 2, z - d / 2 - wall / 2], [0, 0, 0], 1, CONC);
    for (const s of [-1, 1]) g.put(rbox(wall, h, d + wall * 2, 0.05), [x + s * (w / 2 + wall / 2), 1.8 + h / 2, z], [0, 0, 0], 1, CONC);
    g.put(rbox(w + wall * 2, 0.35, wall, 0.05), [x, 1.8 + h - 0.17, z + d / 2 + wall / 2], [0, 0, 0], 1, CONC);
    g.put(rbox(w + wall * 2, 0.5, wall, 0.05), [x, 1.8 + 0.25, z + d / 2 + wall / 2], [0, 0, 0], 1, CONC);
    for (let k = 0; k <= 3; k++) g.put(box(0.12, h - 0.8, 0.12), [x - w / 2 + (k * w) / 3, 1.8 + h / 2, z + d / 2 + 0.05], [0, 0, 0], 1, METAL);
    g.put(rbox(w, 0.2, d, 0.02), [x, 1.9, z], [0, 0, 0], 1, [0.6, 0.55, 0.42]);
    for (let k = 0; k < 6; k++) { const r = icosphere(0.3 + (k % 3) * 0.2, 1); noisy(r, 0.08, 3, k); g.put(r, [x - w / 2 + 0.6 + k * (w - 1.2) / 5, 2.1, z - d / 2 + 0.6 + (k % 2) * 0.8], [0, k, 0], 1, [0.4, 0.38, 0.36]); }
    if (est === 'abissal') {
      // faixas de luz azul no topo e na base da janela + corais grandes
      const lg = new Geo();
      lg.put(box(w + wall * 2 + 0.02, 0.08, 0.06), [x, 1.8 + h - 0.36, z + d / 2 + wall + 0.01], [0, 0, 0], 1, [0.3, 0.8, 1]);
      lg.put(box(w + wall * 2 + 0.02, 0.08, 0.06), [x, 1.8 + 0.52, z + d / 2 + wall + 0.01], [0, 0, 0], 1, [0.3, 0.8, 1]);
      const ln = new Node('tanque_luz'); ln.mesh = R.createMesh(lg, { rough: 0.3, emissive: [0.3, 0.8, 1], castShadow: false }); this.dyn.add(ln);
      for (let k = 0; k < 5; k++) for (let b = 0; b < 5; b++) g.add(tube([[0, 0, 0], [Math.cos(b * 1.3) * 0.25, 0.5, Math.sin(b * 1.3) * 0.25], [Math.cos(b * 1.3) * 0.45, 0.9 + (b % 2) * 0.3, Math.sin(b * 1.3) * 0.45]], 0.06, 5), m4.compose(m4.create(), [x - w / 2 + 1 + k * (w - 2) / 4, 2.1, z - d / 2 + 0.9], [0, 0, 0, 1], [1, 1, 1]), [[0.95, 0.45, 0.4], [0.75, 0.4, 0.85], [0.98, 0.7, 0.3], [0.4, 0.8, 0.85], [0.95, 0.55, 0.7]][(k + b) % 5].concat(1));
    }
    const tn = new Node('tanque'); tn.mesh = R.createMesh(g, { rough: 0.9, kind: MAT.CONCRETO }); this.dyn.add(tn);
    const wg = new Geo(); wg.put(box(w - 0.05, h - 0.5, d - 0.05), [x, 1.8 + (h - 0.5) / 2 + 0.1, z], [0, 0, 0], 1, est === 'abissal' ? [0.1, 0.3, 0.6] : [0.2, 0.45, 0.55]);
    const wn = new Node('tanque_agua'); wn.mesh = R.createMesh(wg, { opacity: 0.3, rough: 0.1, castShadow: false, emissive: est === 'abissal' ? [0.02, 0.08, 0.2] : [0, 0, 0] }); this.dyn.add(wn);
    const lab = textQuad(R, [`${t.nome} [${tq.peixes.length}/${t.vagas}]`, `até ${t.maxCm} cm`], 2.6, 0.7, { px: 384 });
    lab.at(x, 1.8 + 0.25, z + d / 2 + wall + 0.02); this.dyn.add(lab);
    const bx = { x, y: 2.3, z, w: w - 0.8, h: h - 1.4, d: d - 0.8 };
    for (const f of tq.peixes) {
      const n = fishNode(R, f.esp, f.cm); this.dyn.add(n);
      this.tankFish.push({ n, f, p: [x, 1.8 + h / 2, z], v: [1, 0, 0.3], box: bx, cm: f.cm });
    }
    this.tanquePos = this.toWorld(x, 2, z + d / 2);
  }

  // tanque de lona: piscina azul com estrutura de canos de aço, aberta em cima (o peixe aparece pela borda)
  buildTankLona(tq, t, x, z) {
    const R = this.R;
    const [w, h, d] = t.dims;
    const g = new Geo();
    const LONA = [0.16, 0.42, 0.78];
    g.put(box(w + 0.4, 3.2, d + 0.4), [x, 0.0, z], [0, 0, 0], 1, CONC0); // sapata
    g.put(rbox(w + 0.3, 0.12, d + 0.3, 0.03), [x, 1.62, z], [0, 0, 0], 1, [0.45, 0.42, 0.38]); // estrado
    for (const [ax, az, lw, ld] of [[0, -d / 2, w, 0.06], [0, d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d]]) g.put(box(lw, h, ld), [x + ax, 1.68 + h / 2, z + az], [0, 0, 0], 1, LONA);
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) g.put(cylinder(0.05, 0.05, h + 0.1, 8), [x + sx * w / 2, 1.68 + h / 2, z + sz * (d / 2 + 0.06)], [0, 0, 0], 1, METAL);
    for (const sz of [-1, 1]) g.put(cylinder(0.04, 0.04, w, 8), [x, 1.68 + h, z + sz * (d / 2 + 0.06)], [0, 0, Math.PI / 2], 1, METAL);
    for (const sx of [-1, 1]) g.put(cylinder(0.04, 0.04, d + 0.12, 8), [x + sx * (w / 2 + 0.04), 1.68 + h, z], [Math.PI / 2, 0, 0], 1, METAL);
    // escadinha
    for (let k = 0; k < 4; k++) g.put(box(0.5, 0.05, 0.25), [x + w / 2 - 0.6, 1.8 + k * (h / 4), z + d / 2 + 0.35 - k * 0.0], [0, 0, 0], 1, METAL);
    for (const s of [-1, 1]) g.put(box(0.05, h + 0.2, 0.05), [x + w / 2 - 0.6 + s * 0.27, 1.68 + h / 2 + 0.1, z + d / 2 + 0.35], [0, 0, 0], 1, METAL);
    const tn = new Node('tanque'); tn.mesh = R.createMesh(g, { rough: 0.6 }); this.dyn.add(tn);
    const wg = new Geo(); wg.put(box(w - 0.1, h - 0.25, d - 0.1), [x, 1.7 + (h - 0.25) / 2, z], [0, 0, 0], 1, [0.25, 0.5, 0.6]);
    const wn = new Node('tanque_agua'); wn.mesh = R.createMesh(wg, { opacity: 0.45, rough: 0.1, castShadow: false }); this.dyn.add(wn);
    const lab = textQuad(R, [`${t.nome} [${tq.peixes.length}/${t.vagas}]`, `até ${t.maxCm} cm`], 2.2, 0.6, { px: 384 });
    lab.at(x - 0.6, 1.68 + h * 0.5, z + d / 2 + 0.05); this.dyn.add(lab);
    const bx = { x, y: 1.9, z, w: w - 0.6, h: h - 0.6, d: d - 0.6 };
    for (const f of tq.peixes) {
      const n = fishNode(R, f.esp, f.cm); this.dyn.add(n);
      this.tankFish.push({ n, f, p: [x, 1.7 + h / 2, z], v: [1, 0, 0.3], box: bx, cm: f.cm });
    }
    this.tanquePos = this.toWorld(x, 2, z + d / 2);
  }

  animateFish(dt, t) {
    if (this.bolaCorrida) this.bolaCorrida.pos[1] = Math.sin(t * 2.2) * 0.07;
    for (const a of [...this.aqFish, ...this.tankFish]) {
      const b = a.box;
      const sp = 0.06 + (a.cm / 100) * 0.35;
      // passeio suave dentro dos limites do aquário (com folga do comprimento do peixe)
      const m = Math.min(b.w, b.d) * 0.5;
      const half = Math.min(a.cm / 200, m * 0.9);
      const tx = b.x + Math.sin(t * 0.3 + a.cm) * (b.w / 2 - half), tz = b.z + Math.cos(t * 0.23 + a.cm * 1.7) * (b.d / 2 - half * 0.4);
      const ty = b.y + b.h * (0.35 + 0.25 * Math.sin(t * 0.4 + a.cm * 0.5));
      a.v[0] = damp(a.v[0], (tx - a.p[0]), 0.8, dt); a.v[1] = damp(a.v[1], (ty - a.p[1]), 0.8, dt); a.v[2] = damp(a.v[2], (tz - a.p[2]), 0.8, dt);
      const L = Math.hypot(...a.v) || 1;
      for (let j = 0; j < 3; j++) a.p[j] += (a.v[j] / L) * sp * dt * Math.min(1, L * 3);
      a.p[0] = clamp(a.p[0], b.x - b.w / 2 + half, b.x + b.w / 2 - half);
      a.p[2] = clamp(a.p[2], b.z - b.d / 2 + half * 0.4, b.z + b.d / 2 - half * 0.4);
      a.p[1] = clamp(a.p[1], b.y, b.y + b.h);
      a.n.at(a.p[0], a.p[1], a.p[2]).rot(0, Math.atan2(a.v[0], a.v[2]), 0);
    }
  }

  // pontos de interação (coordenadas de mundo)
  pontos(est) {
    const P = (nome, x, y, z, r = 2.6, extra = {}) => ({ id: nome, pos: this.toWorld(x, y, z), r, ...extra });
    const list = [
      P('terminal', -4, 1.6, 9.6, 2.8, { txt: 'Terminal: comprar, vender e contratos' }),
      P('deposito', -7.5, 1.6, -2.5, 2.8, { txt: 'Depósito' }),
      P('berco', 2.4, 1.6, this.zCradle, 3.4, { txt: 'Entrar no submarino' }),
    ];
    if (est?.peixaria) list.push(P('peixaria', BANCADA_PEIXE.x + 1.7, 1.6, BANCADA_PEIXE.z, 2.4, { txt: 'Bancada de peixe' }));
    if (est?.restauro) list.push(P('restauro', -12, 1.6, -2.5, 2.6, { txt: 'Bancada de restauro' }));
    list.push(P('tinta', 13.4, 1.6, 2.5, 2.2, { txt: 'Fábrica de bolsas de tinta (leia a placa)' }));
    list.push(P('armas', BARRACA_ARMAS.x + 0.9, 1.6, BARRACA_ARMAS.z - 1.2, 2.0, { txt: 'Computador da loja de armas: comprar armas e balas' }));
    list.push(P('corrida', BARRACA_CORRIDA.x - 0.6, 1.6, BARRACA_CORRIDA.z, 2.0, { txt: 'Corrida de submarino: chamar amigos' }));
    { const L = vitrineLayout(est?.vitrine || this.estVis?.vitrine); list.push(P('aquario', Math.max(L.x, L.x - L.w / 2 + 1.2), 1.6, VITRINE_FRENTE + 0.9, 2.4, { txt: L.t.nome })); }
    return list;
  }
  // colisores (caixas no plano local) para o personagem
  colisores() {
    const est = this.estVis;
    const vl = vitrineLayout(est?.vitrine);
    return [
      { x: -11, z: -9.1, w: 11, d: 0.4 }, { x: -16.4, z: -5, w: 0.4, d: 8 }, { x: -5.6, z: -5, w: 0.4, d: 8 },
      { x: -11, z: -8, w: 3.4, d: 1.2 }, { x: -7.4, z: -3.5, w: 1, d: 3.2 },
      { x: -4, z: 9, w: 1.3, d: 0.8 }, { x: vl.x, z: vl.z, w: vl.w + vl.borda * 2 + 0.2, d: vl.d + vl.borda * 2 + 0.2 },
      { x: 0, z: this.zCradle, w: 2.4, d: 5.4 }, { x: this.xPivot, z: this.zPivot, w: 2.6, d: 2.6 },
      { x: 3.2, z: this.zCradle - 1, w: 0.9, d: 0.6 },
      { x: -14, z: 10, w: 2.6, d: 2.4, auto: 'rec' },
      { x: 15.75, z: 2.5, w: 0.3, d: 4.0 }, { x: 13.6, z: 0.58, w: 4.4, d: 0.3 }, { x: 13.6, z: 4.42, w: 4.4, d: 0.3 }, { x: 15.15, z: 2.5, w: 0.9, d: 2.6 },
      { x: BARRACA_ARMAS.x + 2.15, z: BARRACA_ARMAS.z, w: 0.3, d: 4.0 }, { x: BARRACA_ARMAS.x, z: BARRACA_ARMAS.z - 1.92, w: 4.4, d: 0.3 }, { x: BARRACA_ARMAS.x, z: BARRACA_ARMAS.z + 1.92, w: 4.4, d: 0.3 },
      { x: BARRACA_ARMAS.x + 1.55, z: BARRACA_ARMAS.z + 0.6, w: 0.9, d: 2.0 }, { x: BARRACA_ARMAS.x + 1.5, z: BARRACA_ARMAS.z - 1.35, w: 0.9, d: 0.9 }, { x: BARRACA_ARMAS.x + 0.45, z: BARRACA_ARMAS.z + 1.45, w: 0.7, d: 0.5 },
      { x: 12, z: 14, w: 0.3, d: 0.3 }, { x: PLACA_X, z: -12.5, w: 4.4, d: 0.3 },
      { x: BARRACA_CORRIDA.x + 2.15, z: BARRACA_CORRIDA.z, w: 0.3, d: 4.0 }, { x: BARRACA_CORRIDA.x, z: BARRACA_CORRIDA.z - 1.92, w: 4.4, d: 0.3 }, { x: BARRACA_CORRIDA.x, z: BARRACA_CORRIDA.z + 1.92, w: 4.4, d: 0.3 },
      { x: BARRACA_CORRIDA.x + 0.2, z: BARRACA_CORRIDA.z, w: 0.85, d: 0.85 },
      ...(est?.banco ? [{ x: -8, z: 13, w: 2.0, d: 0.7 }] : []),
      ...(est?.restauro ? [{ x: -13, z: -2.5, w: 1.1, d: 2.3 }] : []),
      ...(est?.peixaria ? [{ x: BANCADA_PEIXE.x, z: BANCADA_PEIXE.z, w: 1.2, d: 2.7 }, { x: BANCADA_PEIXE.x - 0.1, z: BANCADA_PEIXE.z - 1.75, w: 0.6, d: 0.6 }] : []),
      ...(est?.guardasol ? [{ x: -13.5, z: 4.5, w: 0.3, d: 0.3 }, { x: -12.4, z: 4.6, w: 0.7, d: 1.0 }] : []),
      ...(est?.churrasqueira ? [{ x: -10, z: 2.6, w: 1.25, d: 0.8 }] : []),
      ...(est?.rede ? [{ x: 4.5, z: -5, w: 0.3, d: 0.3 }, { x: 8.3, z: -5, w: 0.3, d: 0.3 }] : []),
      ...(est?.vasos ? [{ x: 6.9, z: 15.6, w: 3.3, d: 0.7 }] : []),
    ];
  }
}
