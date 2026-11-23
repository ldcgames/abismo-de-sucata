// Fauna: modelos de peixes por espécie, cardumes com steering (boids simplificado),
// criaturas de profundidade (peixes-lanterna, águas-vivas, peixe-diabo) e tubarões noturnos.
import { Geo, lathe, sphere, cylinder, tube, capsule, torus, icosphere } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { loft, suavizar } from '../engine/organico.js';
import { m4, quat } from '../engine/math.js';
import { ESPECIES } from '../../shared/data.js';
import { navSDF, navGrad, terrainHeight, LAKE_R, SHAFT_C, makeRng, isNight } from '../../shared/world.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Modelo de comprimento 1 (de z=-0.5 a z=+0.5), frente em +z.
export function makeFishGeo(esp, detail = 1) {
  const e = ESPECIES[esp] || { cor: [0.6, 0.6, 0.6], forma: 'peixe' };
  const base = e.cor;
  const back = base.map((c) => c * 0.45), belly = mix(base, [0.95, 0.93, 0.88], 0.6);
  const g = new Geo();
  const seg = detail ? 14 : 8;
  const col = (x, y, z) => {
    let c = mix(belly, back, Math.max(0, Math.min(1, y * 5 + 0.5)));
    if (esp === 'tucunare' && Math.sin(z * 22) > 0.6 && y > -0.03) c = mix(c, [0.08, 0.08, 0.05], 0.75);
    if (esp === 'tilapia' && Math.sin(z * 30) > 0.7) c = mix(c, back, 0.4);
    if (esp === 'tetra' && Math.abs(y) < 0.02) c = [0.2, 0.6, 1.0];
    if (esp === 'barrigudo' && z < -0.2) c = [1, 0.45, 0.15];
    return [...c, 0];
  };
  if (e.forma === 'kraken') {
    // Filhote de Kraken (monstro, não lula): cabeça curta e larga cheia de placas e espinhos, olhos enormes amarelos,
    // 8 braços grossos abertos em coroa que se enrolam para fora, 2 tentáculos de caça com clava de ganchos.
    const esc = base.map((c) => c * 0.45), claro = mix(base, [1, 0.78, 0.62], 0.5);
    const manto = lathe([[0, -0.46], [0.07, -0.43], [0.14, -0.35], [0.185, -0.23], [0.195, -0.11], [0.18, -0.01], [0.14, 0.05], [0.09, 0.08], [0, 0.09]], seg + 6);
    g.put(manto, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 0.88, 1], (x, y, z) => {
      const placa = Math.abs(Math.sin(z * 34)) < 0.18 || Math.abs(Math.sin(Math.atan2(y, x) * 6)) < 0.12; // sulcos das placas
      const mancha = Math.sin(x * 61) * Math.sin(z * 47) * Math.sin(y * 53) > 0.35;
      let c = mix(claro, base, Math.max(0, Math.min(1, (y + 0.06) * 5)));
      if (placa) c = mix(c, esc, 0.6); if (mancha) c = mix(c, [0.95, 0.65, 0.2], 0.35);
      return [...c, 0];
    });
    // espinhos: crista no dorso + duas fileiras laterais
    for (let k = 0; k < 8; k++) {
      const z = -0.4 + k * 0.055, t = (k + 1) / 9, r = 0.19 * Math.sin(Math.PI * t) * 0.88 + 0.02;
      const h = 0.07 * Math.sin(Math.PI * t) + 0.02;
      g.put(lathe([[0.022, 0], [0.012, h * 0.6], [0, h]], 7), [0, r, z], [-0.45, 0, 0], 1, [...esc, 0]);
      for (const s2 of [-1, 1]) if (k % 2 === 0) g.put(lathe([[0.014, 0], [0.007, 0.03], [0, 0.045]], 6), [s2 * r * 0.95, r * 0.25, z], [0, 0, -s2 * 1.2], 1, [...esc, 0]);
    }
    // olhos enormes com pálpebra grossa e pupila em fenda
    for (const s2 of [-1, 1]) {
      g.put(sphere(0.068, 14, 12), [s2 * 0.15, 0.04, 0.0], [0, 0, 0], 1, [1.0, 0.82, 0.1, 0]);
      g.put(sphere(0.03, 10, 8), [s2 * 0.208, 0.04, 0.012], [0, 0, 0], [0.35, 1.5, 1], [0.02, 0.01, 0.01, 0]);
      g.put(sphere(0.078, 12, 10), [s2 * 0.142, 0.085, -0.005], [0, 0, s2 * 0.25], [1.05, 0.42, 1.1], [...esc, 0]);
    }
    // bico
    g.put(lathe([[0.03, 0], [0.018, 0.04], [0, 0.065]], 8), [0, -0.05, 0.08], [Math.PI / 2 + 0.3, 0, 0], 1, [0.12, 0.08, 0.05, 0]);
    // 8 braços grossos em coroa, enrolando para fora na ponta
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const ca = Math.cos(a), sa = Math.sin(a), pts = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const sai = 0.09 + Math.sin(t * Math.PI * 0.62) * 0.22;              // abre em leque
        const curl = t > 0.55 ? (t - 0.55) * 9 : 0;                           // enrola na ponta
        const rr = sai + Math.sin(curl) * 0.05, zz = 0.06 + t * 0.34 - (1 - Math.cos(curl)) * 0.06;
        pts.push([ca * rr, sa * rr * 0.8 - 0.02, zz]);
      }
      g.add(tube(pts, 0.05, 8, (t) => 0.05 * (1 - t * 0.82) + 0.004), null, [...base, 0]);
      for (let k = 1; k < 12; k++) {       // ventosas na face de dentro
        const q = pts[k], w = 0.016 * (1 - k / 14) + 0.004;
        g.put(sphere(w, 6, 4), [q[0] * 0.9, q[1] * 0.9, q[2] + 0.005], [0, 0, 0], [1, 1, 0.55], [...claro, 0]);
      }
    }
    // 2 tentáculos de caça mais longos, com clava cheia de ganchos
    for (const s2 of [-1, 1]) {
      const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([s2 * (0.03 + t * 0.06 + Math.sin(t * 6) * 0.025), -0.05 - t * 0.04, 0.07 + t * 0.4]); }
      g.add(tube(pts, 0.022, 7, (t) => 0.024 * (1 - t * 0.5)), null, [...base, 0]);
      const fim = pts[12];
      g.put(sphere(0.042, 12, 8), fim, [0, 0, 0], [0.85, 0.6, 1.5], [...esc, 0]);
      for (let k = 0; k < 5; k++) g.put(lathe([[0.008, 0], [0.004, 0.02], [0, 0.032]], 5), [fim[0] - s2 * 0.025, fim[1] + 0.012, fim[2] - 0.05 + k * 0.025], [0, 0, s2 * 1.1], 1, [0.95, 0.9, 0.82, 0]);
    }
    return g;
  }
  if (e.forma === 'lula') {
    // manto + barbatanas + tentáculos
    const mantle = lathe([[0, -0.05], [0.07, 0.0], [0.09, 0.15], [0.07, 0.35], [0.0, 0.48]], seg);
    g.put(mantle, [0, 0, 0], [-Math.PI / 2, 0, 0], 1, (x, y, z) => [...mix(base, [0.95, 0.75, 0.8], 0.3 + 0.2 * Math.sin(z * 40)), 0]);
    for (const s of [-1, 1]) g.put(sphere(0.09, 8, 6), [s * 0.08, 0, -0.38], [0, 0, 0], [0.9, 0.12, 0.7], [...base, 0]);
    for (const s of [-1, 1]) g.put(sphere(0.022, 8, 6), [s * 0.06, 0.03, 0.07], [0, 0, 0], 1, [0.05, 0.05, 0.05, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pts = []; for (let k = 0; k <= 5; k++) pts.push([Math.cos(a) * 0.035 * (1 + k * 0.2), Math.sin(a) * 0.035 * (1 + k * 0.2), 0.05 + k * 0.08]);
      g.add(tube(pts, 0.012, 4, (t) => 0.014 * (1 - t * 0.7)), null, [...mix(base, [1, 0.8, 0.85], 0.4), 0]);
    }
    // a lula "nada" de ré: o tentáculo é a parte que ondula
    g.colorize((x, y, z, nx, ny, nz, c) => c);
    for (let k = 0; k < g.p.length; k += 3) g.p[k + 2] = -g.p[k + 2];
    g.flip(); g.recomputeNormals();
    return g;
  }
  // ---- corpo: seções elípticas ao longo do comprimento (loft), dorso arqueado e barriga mais reta ----
  const F = e.forma;
  const largura = F === 'bagre' ? 1.25 : F === 'tubarao' ? 1.0 : F === 'enguia' ? 0.9 : ({ tilapia: 0.62, pacu: 0.5, tambaqui: 0.55, piranha: 0.6, peixe_lua: 0.38, tetra: 0.55 }[esp] || 0.7);
  const altura = F === 'bagre' ? 0.8 : F === 'tubarao' ? 0.95 : F === 'enguia' ? 0.55 : ({ pacu: 1.35, tambaqui: 1.25, piranha: 1.3, peixe_lua: 1.6, tilapia: 1.15, tucunare: 1.05, pirarucu: 0.75, traira: 0.8, dourado: 0.95 }[esp] || 1.0);
  let an;
  if (F === 'tubarao') an = [[-0.5, 0.004, 0.012, 0.0], [-0.42, 0.016, 0.028, 0.0], [-0.25, 0.05, 0.07, 0.0], [-0.05, 0.085, 0.1, 0.0], [0.12, 0.095, 0.105, 0.0], [0.28, 0.08, 0.085, 0.004], [0.4, 0.055, 0.055, 0.01], [0.47, 0.03, 0.03, 0.016], [0.5, 0.006, 0.008, 0.02]];
  else if (F === 'enguia') an = [[-0.5, 0.003, 0.01, 0], [-0.4, 0.016, 0.03, 0], [-0.1, 0.032, 0.045, 0], [0.2, 0.036, 0.045, 0], [0.42, 0.03, 0.036, 0.004], [0.5, 0.008, 0.01, 0.006]];
  else if (F === 'bagre') an = [[-0.5, 0.004, 0.014, 0], [-0.42, 0.016, 0.03, 0], [-0.25, 0.045, 0.06, 0.004], [-0.02, 0.08, 0.08, 0.006], [0.2, 0.1, 0.08, 0.01], [0.38, 0.1, 0.065, 0.016], [0.47, 0.075, 0.04, 0.022], [0.5, 0.02, 0.012, 0.024]];
  else an = [[-0.5, 0.004, 0.018, 0], [-0.44, 0.012, 0.034, 0], [-0.3, 0.03, 0.07, -0.006], [-0.12, 0.05, 0.112, -0.012], [0.05, 0.058, 0.128, -0.008], [0.22, 0.052, 0.108, 0.004], [0.36, 0.038, 0.074, 0.01], [0.45, 0.022, 0.042, 0.014], [0.5, 0.005, 0.01, 0.018]];
  an = an.map(([y, a, b, c]) => [y, a * largura * 1.0, b * altura, -c * altura]);
  const aneis = suavizar(an, detail ? 3 : 2);
  // alturas do dorso/barriga ao longo do corpo (para assentar as nadadeiras)
  const perfil = (z) => { let i = 0; while (i < aneis.length - 2 && aneis[i + 1][0] < z) i++; const A = aneis[i], B = aneis[i + 1], t = Math.max(0, Math.min(1, (z - A[0]) / ((B[0] - A[0]) || 1))); const b = A[2] + (B[2] - A[2]) * t, c = -(A[3] + (B[3] - A[3]) * t); return { topo: c + b, base: c - b, meio: c }; };
  const escamas = (x, y, z) => {
    let c = col(x, y, z).slice(0, 3);
    if (F !== 'tubarao' && F !== 'enguia' && F !== 'bagre') { const sc = Math.sin(z * 140 + y * 140) * Math.sin(z * 140 - y * 140); if (sc > 0.55) c = c.map((v) => v * 0.9); }
    const m = perfil(z).meio;
    if (Math.abs(y - (m + 0.15 * (perfil(z).topo - m))) < 0.004 && z < 0.28 && z > -0.4) c = c.map((v) => v * 0.75); // linha lateral
    if (F !== 'tubarao' && Math.abs(z - (0.3 - Math.abs(y - m) * 0.4)) < 0.006) c = c.map((v) => v * 0.7);     // opérculo (tampa da guelra)
    return [...c, 0];
  };
  g.put(loft(aneis, seg + 4), [0, 0, 0], [Math.PI / 2, 0, 0], 1, (x, y, z) => escamas(x, y, z));
  // ---- nadadeiras: membranas finas (dos dois lados) com raios mais escuros ----
  const finCor = mix(back, base, 0.35), raio = back.map((v) => v * 0.7);
  const nad = (pts, raios = true) => {
    // pts: contorno [x,y,z] a partir da base; triangula em leque a partir do primeiro ponto
    const fg = new Geo();
    for (const p of pts) { fg.p.push(...p); fg.n.push(1, 0, 0); fg.c.push(...finCor, 0); }
    for (let k = 1; k < pts.length - 1; k++) fg.i.push(0, k, k + 1);
    fg.recomputeNormals();
    g.add(fg); g.add(flipTri(fg));
    if (raios && detail) for (let k = 1; k < pts.length - 1; k += 1) g.add(tube([pts[0], pts[k]], 0.0025, 3), null, [...raio, 0]);
  };
  if (F === 'tubarao') {
    nad([[0, 0.0, -0.46], [0, 0.07, -0.56], [0, 0.2, -0.7], [0, 0.15, -0.66], [0, 0.03, -0.56], [0, -0.04, -0.6], [0, -0.1, -0.62], [0, -0.03, -0.5]], false); // cauda heterocerca
    const pt = perfil(0.05).topo; nad([[0, pt - 0.01, 0.16], [0, pt + 0.06, 0.08], [0, pt + 0.19, -0.02], [0, pt + 0.16, -0.06], [0, pt + 0.02, -0.1]], false); // dorsal alta
    for (const s2 of [-1, 1]) { const p = perfil(0.18); const f = new Geo(); const P = [[s2 * 0.06, p.base + 0.03, 0.22], [s2 * 0.3, p.base - 0.06, 0.04], [s2 * 0.27, p.base - 0.06, -0.02], [s2 * 0.06, p.base + 0.02, 0.06]]; for (const q of P) { f.p.push(...q); f.n.push(0, 1, 0); f.c.push(...base, 0); } f.i.push(0, 1, 2, 0, 2, 3); f.recomputeNormals(); g.add(f); g.add(flipTri(f)); }
    for (let k = 0; k < 5; k++) for (const s2 of [-1, 1]) g.put(capsule(0.003, 0.05, 4, 2), [s2 * 0.075, -0.005, 0.27 - k * 0.022], [0, 0, 0], 1, [0.22, 0.24, 0.27, 0]); // fendas branquiais
    g.put(capsule(0.006, 0.07, 6, 3), [0, perfil(0.42).base + 0.012, 0.42], [0, 0, Math.PI / 2], 1, [0.15, 0.12, 0.12, 0]); // boca
  } else if (F === 'enguia') {
    const pts = [[0, perfil(-0.4).topo, -0.42]]; for (let z = -0.42; z <= 0.2; z += 0.08) pts.push([0, perfil(z).topo + 0.025, z]); pts.push([0, perfil(0.22).topo, 0.22]);
    nad(pts, false); nad(pts.map(([x, y, z]) => [x, -y + 2 * perfil(z).meio, z]), false);
  } else {
    const pc = perfil(-0.45);
    nad([[0, pc.meio, -0.44], [0, pc.meio + 0.05, -0.5], [0, pc.meio + 0.13 * altura, -0.62], [0, pc.meio + 0.15 * altura, -0.66], [0, pc.meio + 0.05, -0.6], [0, pc.meio, -0.57], [0, pc.meio - 0.05, -0.6], [0, pc.meio - 0.15 * altura, -0.66], [0, pc.meio - 0.13 * altura, -0.62], [0, pc.meio - 0.05, -0.5]]); // caudal bifurcada
    const dz0 = F === 'bagre' ? 0.15 : 0.2, dz1 = F === 'bagre' ? 0.0 : -0.3;
    const dpts = [[0, perfil((dz0 + dz1) / 2).topo - 0.01, (dz0 + dz1) / 2], [0, perfil(dz0).topo - 0.005, dz0]];
    for (let k = 0; k <= 6; k++) { const z = dz0 + (dz1 - dz0) * (k / 6); dpts.push([0, perfil(z).topo + (0.07 + 0.03 * Math.sin(k)) * altura * (F === 'bagre' ? 1.3 : 1) * (1 - k / 9), z]); }
    dpts.push([0, perfil(dz1).topo - 0.005, dz1]);
    nad(dpts); // dorsal com raios
    if (F === 'bagre') { const z = -0.28; nad([[0, perfil(z).topo - 0.005, z + 0.04], [0, perfil(z).topo + 0.03, z], [0, perfil(z).topo - 0.005, z - 0.07]], false); } // adiposa
    const az = -0.32; nad([[0, perfil(az).base + 0.005, az + 0.06], [0, perfil(az).base + 0.005, az + 0.1], [0, perfil(az).base - 0.06 * altura, az + 0.02], [0, perfil(az).base - 0.05 * altura, az - 0.05], [0, perfil(az).base + 0.005, az - 0.06]]); // anal
    for (const s2 of [-1, 1]) {
      const p = perfil(0.22), wx = 0.6 * an[4][1];
      const f = new Geo(); const P = [[s2 * wx, p.meio - 0.02, 0.24], [s2 * (wx + 0.03), p.meio - 0.05, 0.12], [s2 * (wx + 0.05), p.meio - 0.07, 0.08], [s2 * wx, p.meio - 0.03, 0.17]];
      for (const q of P) { f.p.push(...q); f.n.push(0, 1, 0); f.c.push(...finCor, 0); } f.i.push(0, 1, 2, 0, 2, 3); f.recomputeNormals(); g.add(f); g.add(flipTri(f)); // peitoral
      const pv = perfil(0.0); const f2 = new Geo(); const P2 = [[s2 * 0.012, pv.base + 0.01, 0.04], [s2 * 0.03, pv.base - 0.05 * altura, -0.04], [s2 * 0.012, pv.base + 0.005, -0.03]];
      for (const q of P2) { f2.p.push(...q); f2.n.push(1, 0, 0); f2.c.push(...finCor, 0); } f2.i.push(0, 1, 2); f2.recomputeNormals(); g.add(f2); g.add(flipTri(f2)); // pélvica
    }
    const pb = perfil(0.48); g.put(capsule(0.0035, 0.03 * largura + 0.01, 6, 2), [0, pb.meio - 0.006, 0.495], [0, 0, Math.PI / 2], 1, [0.1, 0.07, 0.07, 0]); // boca
  }
  // olhos: globo, íris dourada e pupila, encaixados na cabeça
  const eyeR = F === 'tubarao' ? 0.012 : F === 'bagre' ? 0.014 : 0.022;
  const ez = F === 'bagre' ? 0.4 : 0.38, pe = perfil(ez), ex = (() => { const i = aneis.findIndex((r) => r[0] >= ez); return (aneis[i]?.[1] || 0.03) * 0.92; })();
  for (const s2 of [-1, 1]) {
    g.put(sphere(eyeR, 10, 8), [s2 * ex, pe.meio + (pe.topo - pe.meio) * 0.35, ez], [0, 0, 0], [0.6, 1, 1], [0.9, 0.85, 0.6, 0]);
    g.put(sphere(eyeR * 0.6, 8, 6), [s2 * (ex + eyeR * 0.45), pe.meio + (pe.topo - pe.meio) * 0.35, ez], [0, 0, 0], [0.5, 1, 1], [0.02, 0.02, 0.02, 0]);
  }
  if (F === 'bagre') for (const s2 of [-1, 1]) for (const k of [0, 1]) g.add(tube([[s2 * 0.05, -0.02 - k * 0.02, 0.49], [s2 * (0.12 + k * 0.05), -0.05 - k * 0.03, 0.53], [s2 * (0.19 + k * 0.06), -0.1 - k * 0.04, 0.49]], 0.004, 4), null, [0.2, 0.2, 0.18, 0]); // barbilhões
  return g;
}
function mirrorX(g) { const o = new Geo(); o.p = g.p.map((v, i) => (i % 3 === 0 ? -v : v)); o.n = g.n.map((v, i) => (i % 3 === 0 ? -v : v)); o.c = g.c.slice(); o.i = []; for (let t = 0; t < g.i.length; t += 3) o.i.push(g.i[t], g.i[t + 2], g.i[t + 1]); return o; }
function flipTri(g) { const o = new Geo(); o.p = g.p.slice(); o.n = g.n.map((v) => -v); o.c = g.c.slice(); o.i = []; for (let t = 0; t < g.i.length; t += 3) o.i.push(g.i[t], g.i[t + 2], g.i[t + 1]); return o; }

function lanternGeo() {
  const g = makeFishGeo('lambari', 0);
  g.colorize((x, y, z) => [0.08, 0.08, 0.1, 0]);
  for (let k = 0; k < 4; k++) g.put(sphere(0.03, 6, 4), [0.06, -0.04, 0.3 - k * 0.18], [0, 0, 0], 1, [0.4, 0.9, 1, 0]);
  return g;
}
function jellyGeo() {
  const g = new Geo();
  g.put(lathe([[0, 0], [0.45, 0.02], [0.5, 0.15], [0.38, 0.38], [0.18, 0.5], [0, 0.53]], 18), [0, 0, 0], [0, 0, 0], 1, [0.7, 0.55, 1, 0.6]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 6.28;
    const pts = []; for (let k = 0; k <= 6; k++) pts.push([Math.cos(a) * 0.35 + Math.sin(k + i) * 0.04, -k * 0.25, Math.sin(a) * 0.35]);
    g.add(tube(pts, 0.012, 3), null, (x, y) => [0.8, 0.6, 1, Math.min(1, -y)]);
  }
  return g;
}
function anglerGeo() {
  const g = makeFishGeo('bagre', 1);
  g.colorize(() => [0.12, 0.1, 0.1, 0]);
  // mandíbula grande e isca luminosa
  g.put(sphere(0.14, 12, 8), [0, -0.02, 0.32], [0, 0, 0], [1, 0.7, 1], [0.1, 0.08, 0.08, 0]);
  for (let k = 0; k < 7; k++) g.put(cylinder(0.008, 0.0, 0.05, 4, false), [-0.09 + k * 0.03, -0.0, 0.44], [Math.PI, 0, 0], 1, [0.9, 0.9, 0.85, 0]);
  g.add(tube([[0, 0.12, 0.2], [0, 0.3, 0.35], [0, 0.25, 0.55]], 0.006, 4), null, [0.15, 0.12, 0.1, 0]);
  g.put(sphere(0.04, 8, 6), [0, 0.25, 0.57], [0, 0, 0], 1, [0.6, 1, 0.8, 0]);
  return g;
}

// ---------------------------------------------------------------- cardumes
class School {
  constructor(esp, n, center, rnd, size) {
    this.esp = esp; this.center = center.slice(); this.goal = center.slice(); this.rnd = rnd;
    this.size = size;
    this.fish = [];
    for (let i = 0; i < n; i++) {
      this.fish.push({ p: [center[0] + (rnd() - 0.5) * 6, center[1] + (rnd() - 0.5) * 2, center[2] + (rnd() - 0.5) * 6], v: [rnd() - 0.5, 0, rnd() - 0.5], ph: rnd(), s: size * (0.8 + rnd() * 0.4) });
    }
    this.speed = 1.2 + rnd() * 0.8;
  }
}

export class Fauna {
  constructor(R, quality) {
    this.R = R; this.root = new Node('fauna'); this.rnd = makeRng(555);
    this.meshes = {};
    this.schools = [];
    const max = [60, 110, 160][quality];
    this.maxPer = max;
    for (const esp of Object.keys(ESPECIES)) {
      const me = R.createMesh(makeFishGeo(esp, 1), { rough: 0.35, swim: esp === 'tubarao' ? 0.5 : esp === 'enguia' ? 0.7 : 1, castShadow: false, caustics: true, kind: 12 }, { instances: max });
      const n = new Node('peixes_' + esp); n.mesh = me; this.root.add(n);
      this.meshes[esp] = me;
    }
    this.meshes.lanterna = R.createMesh(lanternGeo(), { rough: 0.3, swim: 1, emissive: [0.35, 0.8, 1], glow: 0.0, castShadow: false }, { instances: 120 });
    this.meshes.agua_viva = R.createMesh(jellyGeo(), { rough: 0.2, emissive: [0.5, 0.35, 1], glow: 0.9, opacity: 0.55, blend: 'add', castShadow: false, doubleSide: true }, { instances: 40 });
    this.meshes.diabo = R.createMesh(anglerGeo(), { rough: 0.5, swim: 0.6, emissive: [0.4, 1, 0.7], glow: 0, castShadow: false }, { instances: 8 });
    for (const k of ['lanterna', 'agua_viva', 'diabo']) { const n = new Node(k); n.mesh = this.meshes[k]; this.root.add(n); }
    this.deep = [];
    this.t = 0;
    this.lastSpawnCheck = -99;
  }

  // escolhe cardumes coerentes com a profundidade/hora perto da câmera
  respawn(cam, hour) {
    const night = isNight(hour);
    const depth = -cam[1];
    const rnd = this.rnd;
    // remove cardumes muito longe
    this.schools = this.schools.filter((s) => Math.hypot(s.center[0] - cam[0], s.center[1] - cam[1], s.center[2] - cam[2]) < 170);
    const want = depth > 120 ? 2 : 7;
    let tries = 0;
    while (this.schools.length < want && tries++ < 25) {
      const a = rnd() * Math.PI * 2, d = 10 + rnd() * 45;
      let x = cam[0] + Math.cos(a) * d, z = cam[2] + Math.sin(a) * d;
      if (Math.hypot(x, z) > LAKE_R - 8) { x *= 0.8; z *= 0.8; }
      const bed = terrainHeight(x, z);
      let y = depth < 100 ? Math.max(bed + 2, Math.min(-1.5, cam[1] + (rnd() - 0.5) * 20)) : cam[1] + (rnd() - 0.5) * 40;
      if (navSDF(x, y, z) < 3) continue;
      const prof = -y;
      const cands = Object.entries(ESPECIES).filter(([id, e]) => {
        if (prof < e.prof[0] - 2 || prof > e.prof[1] + 25) return false;
        if (e.hora === 'dia' && night) return false;
        if (e.hora === 'noite' && !night) return false;
        return true;
      });
      if (!cands.length) continue;
      const [esp, e] = cands[Math.floor(rnd() * cands.length)];
      const size = ((e.cm[0] + e.cm[1]) / 2) / 100;
      const n = e.cardume ? 12 + Math.floor(rnd() * 18) : e.pesado ? 1 : 1 + Math.floor(rnd() * 3);
      this.schools.push(new School(esp, n, [x, y, z], rnd, size));
    }
    // fauna profunda
    this.deep = this.deep.filter((d) => Math.hypot(d.p[0] - cam[0], d.p[1] - cam[1], d.p[2] - cam[2]) < 120);
    if (depth > 300) {
      while (this.deep.length < 26) {
        const k = rnd();
        const kind = k < 0.55 ? 'lanterna' : k < 0.9 ? 'agua_viva' : depth > 1400 ? 'diabo' : 'lanterna';
        const p = [cam[0] + (rnd() - 0.5) * 90, cam[1] + (rnd() - 0.5) * 70, cam[2] + (rnd() - 0.5) * 90];
        if (navSDF(p[0], p[1], p[2]) < 2.5) { if (rnd() < 0.1) break; continue; }
        this.deep.push({ kind, p, v: [rnd() - 0.5, (rnd() - 0.5) * 0.2, rnd() - 0.5], ph: rnd(), s: kind === 'agua_viva' ? 0.6 + rnd() * 1.2 : kind === 'diabo' ? 0.6 + rnd() * 0.5 : 0.12 + rnd() * 0.1 });
      }
    }
  }

  update(dt, cam, hour, avoid) {
    this.t += dt;
    if (this.t - this.lastSpawnCheck > 1.5) { this.lastSpawnCheck = this.t; this.respawn(cam, hour); }
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    const mt = m4.create(), q = [0, 0, 0, 1];
    for (const s of this.schools) {
      // o "alvo" do cardume passeia por água livre
      if (Math.hypot(s.goal[0] - s.center[0], s.goal[1] - s.center[1], s.goal[2] - s.center[2]) < 3 || this.rnd() < 0.002) {
        for (let k = 0; k < 6; k++) {
          const g = [s.center[0] + (this.rnd() - 0.5) * 40, s.center[1] + (this.rnd() - 0.5) * 8, s.center[2] + (this.rnd() - 0.5) * 40];
          g[1] = Math.min(g[1], -1.2);
          if (navSDF(g[0], g[1], g[2]) > 3) { s.goal = g; break; }
        }
      }
      const to = [s.goal[0] - s.center[0], s.goal[1] - s.center[1], s.goal[2] - s.center[2]];
      const tl = Math.hypot(...to) || 1;
      for (let j = 0; j < 3; j++) s.center[j] += (to[j] / tl) * s.speed * dt;
      const me = this.meshes[s.esp];
      for (const f of s.fish) {
        // coesão + alinhamento ao alvo + separação simples + fuga dos submarinos
        const acc = [(s.center[0] - f.p[0]) * 0.5 + (to[0] / tl) * 1.5, (s.center[1] - f.p[1]) * 0.6, (s.center[2] - f.p[2]) * 0.5 + (to[2] / tl) * 1.5];
        for (const a of avoid) {
          const d = [f.p[0] - a[0], f.p[1] - a[1], f.p[2] - a[2]]; const dl = Math.hypot(...d);
          if (dl < 7) { for (let j = 0; j < 3; j++) acc[j] += (d[j] / dl) * (7 - dl) * 4; }
        }
        // paredes / fundo / superfície
        const sd = navSDF(f.p[0], f.p[1], f.p[2]);
        if (sd < 1.5) { const gr = navGrad(f.p[0], f.p[1], f.p[2]); for (let j = 0; j < 3; j++) acc[j] += gr[j] * (1.5 - sd) * 6; }
        if (f.p[1] > -0.6) acc[1] -= 4;
        for (let j = 0; j < 3; j++) f.v[j] += acc[j] * dt;
        const sp = Math.hypot(...f.v), maxs = s.speed * 1.8;
        if (sp > maxs) for (let j = 0; j < 3; j++) f.v[j] *= maxs / sp;
        for (let j = 0; j < 3; j++) f.p[j] += f.v[j] * dt;
        if (counts[s.esp] >= this.maxPer) continue;
        const yaw = Math.atan2(f.v[0], f.v[2]), pitch = -Math.atan2(f.v[1], Math.hypot(f.v[0], f.v[2])) * 0.6;
        quat.fromEuler(q, pitch, yaw, 0);
        m4.compose(mt, f.p, q, [f.s, f.s, f.s]);
        this.R.setInstance(me, counts[s.esp]++, mt, [1, 1, 1, f.ph]);
      }
    }
    for (const d of this.deep) {
      d.ph += dt * 0.3;
      if (d.kind === 'agua_viva') { d.p[1] += Math.sin(this.t * 1.5 + d.ph * 6) * dt * 0.4; }
      else {
        d.v[0] += Math.sin(this.t * 0.3 + d.ph * 10) * dt * 0.3; d.v[2] += Math.cos(this.t * 0.27 + d.ph * 7) * dt * 0.3;
        const sp = Math.hypot(...d.v) || 1; for (let j = 0; j < 3; j++) d.v[j] = (d.v[j] / sp) * (d.kind === 'diabo' ? 0.5 : 1.3);
        for (let j = 0; j < 3; j++) d.p[j] += d.v[j] * dt;
        if (navSDF(d.p[0], d.p[1], d.p[2]) < 1.5) { d.v = d.v.map((x) => -x); }
      }
      const me = this.meshes[d.kind];
      if (counts[d.kind] >= me.instMax) continue;
      const yaw = Math.atan2(d.v[0], d.v[2]);
      quat.fromEuler(q, 0, d.kind === 'agua_viva' ? d.ph : yaw, 0);
      const pulse = d.kind === 'agua_viva' ? 1 + Math.sin(this.t * 3 + d.ph * 6) * 0.08 : 1;
      m4.compose(mt, d.p, q, [d.s * pulse, d.s / pulse, d.s * pulse]);
      this.R.setInstance(me, counts[d.kind]++, mt, [1, 1, 1, d.ph % 1]);
    }
    for (const k in this.meshes) this.meshes[k].instCount = counts[k];
    // luzes pontuais da fauna bioluminescente mais próxima (iscas do peixe-diabo)
    this.lights = this.deep.filter((d) => d.kind === 'diabo').slice(0, 2).map((d) => ({ pos: [d.p[0] + d.v[0] * 0.5, d.p[1] + 0.2, d.p[2] + d.v[2] * 0.5], col: [0.3, 0.9, 0.6], range: 9 }));
  }
}
