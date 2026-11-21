// Submarino: modelo procedural (muda de aparência a cada melhoria) e controlador físico.
import { Geo, lathe, sphere, cylinder, capsule, torus, rbox, box, tube, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { clamp, damp } from '../engine/math.js';
import { navSDF, navGrad, WATER_Y } from '../../shared/world.js';
import { CORES_JOGADOR, ENERGIA, SUB_UP } from '../../shared/data.js';
import { noise3 } from '../engine/geometry.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ MODELO
export function buildSubModel(R, niveis, corIdx = 0, extras = {}) {
  const pal = CORES_JOGADOR[corIdx % CORES_JOGADOR.length];
  const casco = niveis.casco, prop = niveis.propulsor, luz = niveis.farol, carga = niveis.carga, braco = niveis.braco, sonar = niveis.sonar, oxi = niveis.oxigenio;
  // pintura: o casco 1 é velho e enferrujado; níveis maiores ganham pintura nova e reforços
  const paint = casco >= 4 ? mix(pal.sub, [0.75, 0.77, 0.8], 0.55) : pal.sub;
  const rustAmt = [0.25, 0.12, 0.05, 0.0, 0.0][casco - 1];
  const hullCol = (x, y, z, nx, ny, nz) => {
    const n = noise3(x * 2.2, y * 2.2, z * 2.2), n2 = noise3(x * 7, y * 7, z * 7);
    let c = paint.slice();
    if (y < -0.25) c = mix(c, [0.25, 0.25, 0.27], 0.6); // faixa inferior escura
    if (n > 0.55 - rustAmt) c = mix(c, [0.45, 0.22, 0.1], clamp((n - (0.55 - rustAmt)) * 3, 0, 0.85));
    if (Math.abs(Math.sin(z * 3.3)) < 0.04) c = c.map((v) => v * 0.7); // costuras das chapas
    const v = 0.92 + n2 * 0.08;
    return [c[0] * v, c[1] * v, c[2] * v, 0];
  };
  const root = new Node('submarino');
  const body = new Node('corpo'); root.add(body);
  const g = new Geo();
  // casco principal (perfil ao longo de Y, depois girado para Z)
  g.k = MAT.CASCO;
  const L = 4.4, Rr = 0.92;
  const prof = [[0, -2.3], [0.25, -2.25], [0.55, -2.05], [0.78, -1.6], [0.9, -1.0], [Rr, -0.2], [Rr, 0.6], [0.9, 1.15], [0.82, 1.45], [0.7, 1.62]];
  g.put(lathe(prof, 28), [0, 0, 0], [Math.PI / 2, 0, 0], 1, hullCol);
  // anel de reforço / rebites
  g.k = MAT.METAL;
  const ringN = casco >= 3 ? 5 : casco >= 2 ? 3 : 2;
  for (let k = 0; k < ringN; k++) g.put(torus(0.93 - (k === 0 ? 0.08 : 0), casco >= 3 ? 0.045 : 0.03, 32, 6), [0, 0, -1.4 + k * (2.5 / Math.max(1, ringN - 1))], [Math.PI / 2, 0, 0], 1, casco >= 3 ? [0.3, 0.32, 0.35] : paint.map((c) => c * 0.75));
  if (casco === 1) for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; g.put(sphere(0.022, 6, 4), [Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0.6], [0, 0, 0], 1, [0.35, 0.3, 0.25]); }
  if (casco >= 4) { g.put(capsule(0.08, 3.4, 10, 4), [0, -0.92, -0.2], [Math.PI / 2, 0, 0], 1, [0.2, 0.2, 0.22]); }
  // torre com escotilha (onde o jogador entra)
  g.k = MAT.CASCO;
  g.put(cylinder(0.42, 0.36, 0.55, 20), [0, 0.98, -0.2], [0, 0, 0], 1, hullCol);
  g.k = MAT.METAL;
  g.put(cylinder(0.4, 0.4, 0.07, 20), [0, 1.28, -0.2], [0, 0, 0], 1, [0.3, 0.3, 0.32]);
  g.put(torus(0.14, 0.025, 12, 6), [0, 1.36, -0.2], [0, 0, 0], 1, [0.6, 0.55, 0.3]); // volante da escotilha
  g.put(cylinder(0.02, 0.02, 0.28, 6), [0, 1.36, -0.2], [0, 0, Math.PI / 2], 1, [0.6, 0.55, 0.3]);
  // olhal para o gancho do guindaste
  g.put(torus(0.12, 0.03, 12, 6), [0, 1.45, 0.25], [0, Math.PI / 2, 0], 1, [0.5, 0.5, 0.5]);
  g.put(rbox(0.1, 0.12, 0.2, 0.02), [0, 1.3, 0.25], [0, 0, 0], 1, [0.4, 0.4, 0.42]);
  // aro do visor frontal
  g.put(torus(0.72, 0.07, 32, 10), [0, 0.1, 1.55], [Math.PI / 2, 0, 0], 1, [0.28, 0.28, 0.3]);
  // lemes e estabilizadores
  g.k = MAT.CASCO;
  for (const [rz, sx] of [[0, 1], [Math.PI, 1], [Math.PI / 2, 1], [-Math.PI / 2, 1]]) {
    g.put(rbox(0.06, 0.65, 0.55, 0.02), [0, 0.62, -1.95], [0, 0, rz], 1, paint.map((c) => c * 0.8));
    void sx;
  }
  // esquis de apoio (para pousar no berço e no fundo)
  g.k = MAT.METAL;
  for (const s of [-1, 1]) {
    g.put(capsule(0.05, 3.0, 8, 3), [s * 0.55, -1.05, 0], [Math.PI / 2, 0, 0], 1, [0.22, 0.22, 0.24]);
    for (const z of [-0.9, 0.9]) g.put(cylinder(0.035, 0.035, 0.4, 6), [s * 0.45, -0.85, z], [0, 0, s * 0.35], 1, [0.22, 0.22, 0.24]);
  }
  // tanques de lastro laterais
  g.k = MAT.CASCO;
  for (const s of [-1, 1]) g.put(capsule(0.22, 1.6, 14, 5), [s * 0.95, -0.45, -0.1], [Math.PI / 2, 0, 0], 1, hullCol);
  // cilindros de oxigênio (um por nível)
  g.k = MAT.PINTADO;
  for (let k = 0; k < Math.min(4, oxi); k++) g.put(capsule(0.1, 0.5, 10, 4), [(k % 2 ? 1 : -1) * 0.35, 0.82, -1.15 - Math.floor(k / 2) * 0.32], [Math.PI / 2, 0, 0], 1, [0.85, 0.85, 0.82]);
  // propulsores laterais (nível ≥ 2), jatos (≥ 4)
  g.k = MAT.METAL;
  if (prop >= 2) for (const s of [-1, 1]) {
    g.put(cylinder(0.2, 0.22, 0.55, 16), [s * 1.25, 0.05, -1.2], [Math.PI / 2, 0, 0], 1, [0.3, 0.3, 0.33]);
    g.put(torus(0.22, 0.03, 16, 6), [s * 1.25, 0.05, -1.48], [Math.PI / 2, 0, 0], 1, prop >= 4 ? [0.7, 0.5, 0.2] : [0.25, 0.25, 0.27]);
    g.put(rbox(0.5, 0.06, 0.25, 0.02), [s * 1.0, 0.05, -1.2], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
  }
  if (prop >= 3) for (const s of [-1, 1]) g.put(cylinder(0.12, 0.12, 0.3, 12), [s * 0.6, -0.75, 0.9], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
  // faróis: 1, 2, 4, 6 lâmpadas
  const A = [0, 0.98, 1.0], B1 = [-0.62, -0.35, 1.45], B2 = [0.62, -0.35, 1.45], C1 = [-0.85, 0.35, 1.05], C2 = [0.85, 0.35, 1.05], D = [0, -0.8, 1.45];
  const lampSet = [[A], [B1, B2], [B1, B2, C1, C2], [A, B1, B2, C1, C2, D]][luz - 1];
  const lamps = [];
  for (const pp of lampSet) {
    g.put(cylinder(0.13, 0.11, 0.2, 14), pp, [Math.PI / 2, 0, 0], 1, [0.2, 0.2, 0.22]);
    lamps.push([pp[0], pp[1], pp[2] + 0.11]);
  }
  // cesto/porão de carga
  g.k = MAT.PINTADO;
  if (carga <= 2) {
    const w = carga === 1 ? 0.6 : 0.95;
    for (const s of [-1, 1]) {
      g.put(rbox(0.04, 0.35, w, 0.01), [s * 1.25, -0.55, 0.45], [0, 0, 0], 1, [0.35, 0.33, 0.3]);
      for (let k = 0; k < 4; k++) g.put(cylinder(0.012, 0.012, 0.32, 4), [s * 1.25 + s * 0.12, -0.55, 0.45 - w / 2 + k * w / 3], [0, 0, 0], 1, [0.35, 0.33, 0.3]);
      g.put(rbox(0.3, 0.03, w, 0.01), [s * 1.12, -0.72, 0.45], [0, 0, 0], 1, [0.35, 0.33, 0.3]);
    }
  } else {
    const h = carga === 3 ? 0.45 : carga === 4 ? 0.7 : 0.95;
    g.put(rbox(1.5, h, 2.0, 0.08), [0, -0.95 - h / 2 + 0.2, -0.1], [0, 0, 0], 1, carga >= 4 ? [0.55, 0.3, 0.15] : [0.32, 0.34, 0.36]);
    for (let k = 0; k < 4; k++) g.put(box(1.52, 0.04, 0.05), [0, -0.95 + 0.2 - h * 0.5 + (k - 1.5) * h * 0.22, 0.91], [0, 0, 0], 1, [0.2, 0.2, 0.2]);
  }
  // domo de sonar (nível ≥ 2)
  g.k = MAT.BORRACHA;
  if (sonar >= 2) { g.put(sphere(0.18 + sonar * 0.03, 14, 10), [0, -0.95, 1.1], [0, 0, 0], [1, 0.6, 1], [0.15, 0.15, 0.18]); }
  // lançador de balões ao lado da escotilha
  g.k = MAT.PINTADO;
  if (extras.lancador) {
    g.put(rbox(0.16, 0.12, 0.22, 0.03), [0.45, 1.18, -0.05], [0, 0, 0], 1, [0.6, 0.2, 0.5]);
  }
  // interior visível pelo vidro: assento e painel
  g.k = MAT.TECIDO;
  g.put(rbox(0.5, 0.08, 0.45, 0.03), [0, -0.35, 0.3], [0, 0, 0], 1, [0.35, 0.18, 0.1]);
  g.put(rbox(0.5, 0.5, 0.08, 0.03), [0, -0.05, 0.05], [0.15, 0, 0], 1, [0.35, 0.18, 0.1]);
  g.put(rbox(1.1, 0.3, 0.25, 0.04), [0, -0.38, 1.15], [-0.5, 0, 0], 1, [0.18, 0.19, 0.2]);
  // dupla face: visto pelo vidro, o interior aparece como parede (antes o casco ficava transparente por dentro)
  body.mesh = R.createMesh(g, { rough: casco >= 4 ? 0.35 : 0.6, metal: casco >= 4 ? 0.6 : 0.35, doubleSide: true, rust: [1.0, 0.55, 0.25, 0.08, 0.0][casco - 1] });
  // telas do painel (emissivas)
  const sg = new Geo();
  sg.put(rbox(0.28, 0.16, 0.02, 0.01), [-0.25, -0.27, 1.21], [-0.5, 0, 0], 1, [0.2, 0.9, 0.6]);
  sg.put(rbox(0.28, 0.16, 0.02, 0.01), [0.25, -0.27, 1.21], [-0.5, 0, 0], 1, [0.9, 0.6, 0.2]);
  const screens = new Node('telas'); screens.mesh = R.createMesh(sg, { emissive: [0.6, 0.8, 0.6], glow: 1.2, castShadow: false }); body.add(screens);
  // lentes dos faróis (brilham quando ligados)
  const lg = new Geo();
  for (const p of lamps) lg.put(cylinder(0.1, 0.1, 0.03, 14), p, [Math.PI / 2, 0, 0], 1, [1, 0.97, 0.85]);
  const lenses = new Node('lentes'); lenses.mesh = R.createMesh(lg, { emissive: [1, 0.95, 0.8], glow: 0, rough: 0.1, castShadow: false }); body.add(lenses);
  // cones de luz "volumétricos" aproximados (aditivos, somem com a distância)
  const alcance = [26, 42, 62, 90][luz - 1] * 0.55;
  const cg = new Geo();
  const conePerfil = []; for (let k = 0; k <= 8; k++) { const t = k / 8; conePerfil.push([0.12 + t * alcance * 0.42, t * alcance]); }
  const cone = lathe(conePerfil, 20);
  // três camadas concêntricas somadas = borda suave
  for (const p of lamps) for (const [esc, ganho] of [[0.35, 0.5], [0.65, 0.3], [1, 0.16]]) cg.put(cone, p, [Math.PI / 2, 0, 0], [esc, 1, esc], (x, y, z) => { const t = Math.max(0, Math.min(1, (z - p[2]) / alcance)); const f = Math.pow(1 - t, 2.2) * ganho; return [f, f * 0.97, f * 0.88, 0]; });
  const cones = new Node('cones'); cones.mesh = R.createMesh(cg, { color: [0, 0, 0], emissive: [0.5, 0.5, 0.46], vertexEmissive: 2, glow: (0.45 + luz * 0.15) / lamps.length ** 0.5, opacity: 1, blend: 'add', doubleSide: true, castShadow: false, rough: 1 });
  cones.visible = false; body.add(cones);
  // vidro frontal (domo) — material próprio para receber a tinta
  const dome = sphere(0.72, 28, 18);
  const dg = new Geo(); dg.put(dome, [0, 0.1, 1.55], [0, 0, 0], [1, 1, 0.78], [0.75, 0.88, 0.95]);
  const glass = new Node('vidro'); glass.mesh = R.createMesh(dg, { rough: 0.05, metal: 0.1, opacity: 0.28, castShadow: false, depthWrite: false }); body.add(glass);
  // tinta no vidro (malha separada, opaca, ligeiramente maior)
  const ig = new Geo();
  const inkDome = sphere(0.735, 28, 18);
  ig.put(inkDome, [0, 0.1, 1.55], [0, 0, 0], [1, 1, 0.79], (x, y, z) => { const n = noise3(x * 6, y * 6, z * 6); return [0.03 + n * 0.02, 0.02, 0.05 + n * 0.03, 0]; });
  const ink = new Node('tinta'); ink.mesh = R.createMesh(ig, { rough: 0.15, metal: 0, castShadow: false }); ink.visible = false; body.add(ink);
  // hélice traseira (gira)
  const pg = new Geo();
  const blades = prop >= 3 ? 5 : prop >= 2 ? 4 : 3;
  for (let k = 0; k < blades; k++) pg.put(rbox(0.07, 0.5, 0.12, 0.02), [0, 0.25, 0], [0.4, 0, 0], 1, prop >= 4 ? [0.75, 0.6, 0.25] : [0.45, 0.42, 0.35]);
  const pgAll = new Geo();
  for (let k = 0; k < blades; k++) { const a = (k / blades) * Math.PI * 2; pgAll.put(rbox(0.07, 0.5, 0.12, 0.02), [Math.sin(a) * 0.25, Math.cos(a) * 0.25, 0], [0.35, 0, -a], 1, prop >= 4 ? [0.75, 0.6, 0.25] : [0.45, 0.42, 0.35]); }
  pgAll.put(sphere(0.12, 12, 8), [0, 0, 0], [0, 0, 0], [1, 1, 1.4], [0.3, 0.3, 0.3]);
  const propN = new Node('helice').at(0, 0, -2.38); propN.mesh = R.createMesh(pgAll, { rough: 0.4, metal: 0.6, kind: MAT.METAL, texScale: 3 }); body.add(propN);
  const shroud = new Geo(); shroud.put(torus(0.62, 0.06, 32, 8), [0, 0, -2.38], [Math.PI / 2, 0, 0], 1, [0.3, 0.3, 0.32]);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) shroud.put(box(0.03, 0.45, 0.06), [Math.sin(a) * 0.38, Math.cos(a) * 0.38, -2.38], [0, 0, -a], 1, [0.3, 0.3, 0.32]);
  const shN = new Node('duto'); shN.mesh = R.createMesh(shroud, { rough: 0.5, metal: 0.5, kind: MAT.PINTADO, rust: [1.0, 0.55, 0.25, 0.08, 0.0][casco - 1] }); body.add(shN);
  // braço mecânico (base → braço → antebraço → garra)
  const armBase = new Node('braco_base').at(0.55, -0.6, 1.35); body.add(armBase);
  const bigArm = braco >= 3;
  const ag = new Geo(); ag.put(sphere(0.13, 12, 8), [0, 0, 0], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
  ag.put(capsule(bigArm ? 0.07 : 0.05, 0.55, 10, 4), [0, 0, 0.35], [Math.PI / 2, 0, 0], 1, braco >= 2 ? [0.8, 0.6, 0.15] : [0.5, 0.48, 0.4]);
  armBase.mesh = R.createMesh(ag, { rough: 0.5, metal: 0.5, kind: MAT.PINTADO, texScale: 3 });
  const fore = new Node('antebraco').at(0, 0, 0.7); armBase.add(fore);
  const fg = new Geo(); fg.put(sphere(0.08, 10, 8), [0, 0, 0], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
  fg.put(capsule(bigArm ? 0.06 : 0.045, 0.5, 10, 4), [0, 0, 0.3], [Math.PI / 2, 0, 0], 1, braco >= 2 ? [0.8, 0.6, 0.15] : [0.5, 0.48, 0.4]);
  fore.mesh = R.createMesh(fg, { rough: 0.5, metal: 0.5, kind: MAT.PINTADO, texScale: 3 });
  const claw = new Node('garra').at(0, 0, 0.62); fore.add(claw);
  const jaws = [];
  for (const s of [-1, 1]) {
    const jw = new Node('mandibula'); const jg = new Geo();
    jg.put(rbox(0.04, 0.05, 0.22, 0.01), [s * 0.06, 0, 0.1], [0, 0, 0], 1, [0.35, 0.35, 0.38]);
    jg.put(rbox(0.04, 0.05, 0.1, 0.01), [s * 0.03, 0, 0.22], [0, s * 0.7, 0], 1, [0.35, 0.35, 0.38]);
    jw.mesh = R.createMesh(jg, { rough: 0.4, metal: 0.7, kind: MAT.METAL, texScale: 4 }); claw.add(jw); jaws.push(jw);
  }
  // braço do lançador de balões (só se instalado)
  let launcher = null, launcherFore = null, bolsa = null;
  if (extras.lancador) {
    launcher = new Node('lancador').at(0.48, 1.24, -0.1);
    const lg2 = new Geo(); lg2.put(sphere(0.09, 12, 8), [0, 0, 0], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
    lg2.put(capsule(0.045, 0.42, 10, 4), [0, 0.25, 0], [0, 0, 0], 1, [0.62, 0.22, 0.52]);
    launcher.mesh = R.createMesh(lg2, { rough: 0.5, kind: MAT.PINTADO, rust: 0.2, texScale: 3 }); body.add(launcher);
    launcherFore = new Node('lancador_ante').at(0, 0.5, 0); launcher.add(launcherFore);
    const lf = new Geo(); lf.put(sphere(0.06, 10, 8), [0, 0, 0], [0, 0, 0], 1, [0.3, 0.3, 0.33]);
    lf.put(capsule(0.038, 0.32, 10, 4), [0, 0.2, 0], [0, 0, 0], 1, [0.62, 0.22, 0.52]);
    // mão em concha com 3 dedos
    lf.put(sphere(0.08, 12, 8), [0, 0.42, 0], [0, 0, 0], [1.1, 0.6, 1.1], [0.75, 0.72, 0.68]);
    for (let k = 0; k < 3; k++) { const a = k * 2.09; lf.put(capsule(0.016, 0.07, 6, 2), [Math.cos(a) * 0.07, 0.47, Math.sin(a) * 0.07], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], 1, [0.75, 0.72, 0.68]); }
    launcherFore.mesh = R.createMesh(lf, { rough: 0.5, kind: MAT.METAL, texScale: 3 });
    bolsa = new Node('bolsa_tinta').at(0, 0.53, 0);
    const bg = new Geo(); bg.put(sphere(0.085, 12, 10), [0, 0, 0], [0, 0, 0], [1, 1.15, 1], [0.14, 0.05, 0.2]); bg.put(cylinder(0.02, 0.03, 0.05, 8), [0, 0.1, 0], [0, 0, 0], 1, [0.6, 0.2, 0.5]);
    bolsa.mesh = R.createMesh(bg, { rough: 0.15 }); launcherFore.add(bolsa);
  }
  // carga visível (preenchida pelo jogo)
  const cargoN = new Node('carga_visivel').at(0, -0.6, 0.45); body.add(cargoN);
  return { root, body, prop: propN, glass, ink, lenses, cones, lamps, launcherFore, bolsa, armBase, fore, claw, jaws, launcher, cargo: cargoN, screens };
}

// ------------------------------------------------------------------ FÍSICA
export const SUB_FISICA = {
  raioCasco: 0.95,        // m
  pontosColisao: [[0, 0, 1.6, 0.85], [0, 0, 0, 0.95], [0, 0, -1.7, 0.8], [0, 0.9, -0.2, 0.45], [0, -0.95, 0, 0.35], [1.0, -0.4, 0, 0.35], [-1.0, -0.4, 0, 0.35]],
  arrastoLinear: 0.25,    // 1/s
  restituicao: 0.15,
  yawAcc: 1.6, yawMax: 0.9, // rad/s², rad/s
  flutuacaoSuperficie: 4.5,
  alturaFlutuacao: -0.45,   // centro do casco quando boiando
};

export class SubController {
  constructor() {
    this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.yaw = 0; this.yawRate = 0;
    this.pitchVis = 0; this.rollVis = 0;
    this.bateria = 100; this.oxigenio = 600; this.estresse = 0;
    this.luzes = false; this.emergencia = false; this.motorLigado = true;
    this.thrust = 0; this.impacto = 0; this.ultimoImpacto = 0;
    this.acc = 0;
  }
  // stats: subStats(perfil); input: {f, t, u, boost}
  step(dt, input, stats, env) {
    const depth = -this.pos[1];
    const submerso = this.pos[1] < -1.2;
    // ---- energia e oxigênio
    const thr = Math.abs(input.f) + Math.abs(input.u) * 0.6 + Math.abs(input.t) * 0.2;
    const consumo = (ENERGIA.motor * thr * (stats.vel / 6) ** 0.6 + (this.luzes ? ENERGIA.farol * (1 + stats.farol / 40) : 0) + ENERGIA.ociosa) * dt;
    this.bateria = Math.max(0, this.bateria - consumo);
    if (submerso) this.oxigenio = Math.max(0, this.oxigenio - dt);
    else this.oxigenio = Math.min(stats.oxigenio, this.oxigenio + dt * 40);
    const semEnergia = this.bateria <= 0;
    // ---- pressão
    const lim = stats.maxProf;
    let fatorDesempenho = 1;
    if (depth > lim) {
      const exc = (depth - lim) / Math.max(30, lim * 0.15);
      this.estresse = Math.min(100, this.estresse + (6 + exc * 30) * dt);
      fatorDesempenho = Math.max(0.25, 1 - exc * 0.6);
    } else this.estresse = Math.max(0, this.estresse - 2 * dt);
    if (!this.emergencia && (this.estresse >= 100 || this.oxigenio <= 0)) {
      this.emergencia = true; this.motivoEmergencia = this.oxigenio <= 0 ? 'oxigenio' : 'pressao';
    }
    if (this.emergencia && (depth < Math.min(lim * 0.75, 30) || depth < 2)) { this.emergencia = false; this.estresse = Math.min(this.estresse, 55); }
    // ---- forças
    const fwd = [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
    const vmax = stats.vel * fatorDesempenho, vvert = stats.velVert * fatorDesempenho;
    let f = semEnergia ? 0 : input.f, u = semEnergia ? 0 : input.u, t = semEnergia ? 0 : input.t;
    if (this.emergencia) { u = 1; f *= 0.3; }
    this.thrust = damp(this.thrust, f, 3, dt);
    const ah = 1.4 + vmax * 0.22; // aceleração de propulsão
    const vf = this.vel[0] * fwd[0] + this.vel[2] * fwd[2];
    const k2 = ah / (vmax * vmax);
    let aF = this.thrust * ah - k2 * vf * Math.abs(vf);
    const lat = [this.vel[0] - fwd[0] * vf, 0, this.vel[2] - fwd[2] * vf];
    const ax = fwd[0] * aF - lat[0] * 1.6 - this.vel[0] * SUB_FISICA.arrastoLinear;
    const az = fwd[2] * aF - lat[2] * 1.6 - this.vel[2] * SUB_FISICA.arrastoLinear;
    // vertical: lastro controlado (neutro) + flutuação na superfície + emergência
    const avMax = 2.0 + vvert * 0.4;
    let ay = u * avMax - (avMax / (vvert * vvert)) * this.vel[1] * Math.abs(this.vel[1]) - this.vel[1] * 0.4;
    if (this.emergencia) ay += 2.5;
    if (semEnergia) ay += 0.6 - this.vel[1] * 0.5; // sem energia: flutuação positiva leva à superfície
    // perto da superfície a água empurra para a linha de flutuação
    const alvo = SUB_FISICA.alturaFlutuacao + (env.ondaY || 0);
    if (this.pos[1] > alvo - 0.6) {
      const im = clamp((this.pos[1] - (alvo - 0.6)) / 1.2, 0, 1);
      // mergulhando (u < 0) o lastro vence a flutuação; sem comando, o sub boia na linha d'água
      if (u > -0.05 || this.pos[1] > alvo + 0.3) ay += -(this.pos[1] - alvo) * SUB_FISICA.flutuacaoSuperficie * im - this.vel[1] * 1.6 * im;
    }
    if (this.pos[1] > 0.6) ay -= 9.8; // fora d'água: gravidade
    this.vel[0] += ax * dt; this.vel[1] += ay * dt; this.vel[2] += az * dt;
    // guinada
    this.yawRate += (t * SUB_FISICA.yawAcc * (0.6 + 0.4 * stats.vel / 10) - this.yawRate * 1.8) * dt;
    this.yawRate = clamp(this.yawRate, -SUB_FISICA.yawMax, SUB_FISICA.yawMax);
    this.yaw += this.yawRate * dt;
    // integra
    for (let j = 0; j < 3; j++) this.pos[j] += this.vel[j] * dt;
    // ---- colisão com o mundo (SDF)
    this.impacto = 0;
    for (let it = 0; it < 2; it++) {
      for (const [lx, ly, lz, r] of SUB_FISICA.pontosColisao) {
        const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
        const wx = this.pos[0] + lx * c + lz * s, wy = this.pos[1] + ly, wz = this.pos[2] - lx * s + lz * c;
        const d = navSDF(wx, wy, wz) - r;
        if (d < 0) {
          const n = navGrad(wx, wy, wz);
          for (let j = 0; j < 3; j++) this.pos[j] -= n[j] * d;
          const vn = this.vel[0] * n[0] + this.vel[1] * n[1] + this.vel[2] * n[2];
          if (vn < 0) {
            for (let j = 0; j < 3; j++) this.vel[j] -= n[j] * vn * (1 + SUB_FISICA.restituicao);
            // atrito de contato
            for (let j = 0; j < 3; j++) this.vel[j] *= 0.985;
            this.impacto = Math.max(this.impacto, -vn);
          }
        }
      }
    }
    // inclinação visual (sem afetar a simulação)
    this.pitchVis = damp(this.pitchVis, clamp(-this.vel[1] * 0.06, -0.35, 0.35), 3, dt);
    this.rollVis = damp(this.rollVis, clamp(-this.yawRate * 0.35 * clamp(Math.abs(vf) / 4, 0, 1), -0.3, 0.3), 3, dt);
    return { depth, submerso, vf };
  }
}
export { SUB_UP };
