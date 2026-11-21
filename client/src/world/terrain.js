// Terreno, margem, montanhas, fenda abissal, cavernas, rochas e naufrágios.
import { Geo, lathe, icosphere, tube, cylinder, rbox, box, sphere, capsule, torus, noisy, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { m4, quat } from '../engine/math.js';
import {
  terrainHeight, LAKE_R, SHAFT_C, SHAFT_SEGS, shaftRadius, CAVES, insideCave, FUNIL, PEDRAS_MARGEM, ROCKS, WRECKS, STATIONS, fbm2, noise3, makeRng,
} from '../../shared/world.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function terrainColor(x, y, z, ny) {
  const r = Math.hypot(x, z);
  const n = fbm2(x * 0.05, z * 0.05, 3), n2 = fbm2(x * 0.3, z * 0.3, 2);
  const slope = 1 - ny;
  let c;
  if (y < -0.4) {
    // fundo do lago: lodo, areia escura, algas no raso
    const silt = [0.32, 0.29, 0.22], algae = [0.22, 0.3, 0.16], deep = [0.2, 0.2, 0.19];
    c = mix(silt, algae, ss(-14, -3, y) * (0.5 + n));
    c = mix(c, deep, ss(-30, -80, y));
    c = mix(c, [0.36, 0.34, 0.3], slope * 1.5);
  } else if (y < 1.0 && r < LAKE_R + 14) {
    // faixa de areia/cascalho úmido
    c = mix([0.42, 0.38, 0.3], [0.56, 0.5, 0.4], ss(-0.4, 1.0, y));
    c = mix(c, [0.36, 0.33, 0.28], n2 * 0.6);
  } else {
    const grass1 = [0.27, 0.42, 0.16], grass2 = [0.4, 0.46, 0.2], forest = [0.2, 0.26, 0.12], rock = [0.42, 0.41, 0.39], rock2 = [0.32, 0.3, 0.29];
    c = mix(grass1, grass2, sat(n * 1.4 + 0.3));
    c = mix(c, forest, ss(LAKE_R + 65, LAKE_R + 120, r));
    // trilha de terra batida em anel
    const path = 1 - ss(1.6, 3.2, Math.abs(r - (LAKE_R + 52)));
    c = mix(c, [0.44, 0.36, 0.26], path * 0.85);
    c = mix(c, mix(rock, rock2, n2), ss(0.28, 0.5, slope));
    c = mix(c, [0.5, 0.5, 0.52], ss(240, 420, y) * 0.6);
  }
  const v = 0.9 + n2 * 0.2;
  return [c[0] * v, c[1] * v, c[2] * v, 0];
}

function grid(x0, z0, size, step, opts = {}) {
  const g = new Geo();
  const N = Math.round(size / step);
  const idx = new Int32Array((N + 1) * (N + 1)).fill(-1);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = x0 + j * step, z = z0 + i * step;
    let y = terrainHeight(x, z) + (opts.drop || 0);
    idx[i * (N + 1) + j] = g.vcount;
    g.p.push(x, y, z); g.n.push(0, 1, 0); g.c.push(1, 1, 1, 1);
  }
  const vert = (i, j) => idx[i * (N + 1) + j];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const a = vert(i, j), b = vert(i, j + 1), c = vert(i + 1, j), d = vert(i + 1, j + 1);
    if (opts.skip && opts.skip(g.p[a * 3], g.p[a * 3 + 2], g.p[d * 3], g.p[d * 3 + 2])) continue;
    g.i.push(a, c, b, b, c, d);
  }
  // normais analíticas a partir das alturas da grade
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const k = vert(i, j);
    const hL = g.p[vert(i, Math.max(0, j - 1)) * 3 + 1], hR = g.p[vert(i, Math.min(N, j + 1)) * 3 + 1];
    const hD = g.p[vert(Math.max(0, i - 1), j) * 3 + 1], hU = g.p[vert(Math.min(N, i + 1), j) * 3 + 1];
    let nx = hL - hR, ny = 2 * step, nz = hD - hU; const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    g.n[k * 3] = nx; g.n[k * 3 + 1] = ny; g.n[k * 3 + 2] = nz;
    const c = terrainColor(g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2], ny);
    g.c[k * 4] = c[0]; g.c[k * 4 + 1] = c[1]; g.c[k * 4 + 2] = c[2]; g.c[k * 4 + 3] = 0;
  }
  return g;
}


export function buildTerrain(R, quality) {
  const root = new Node('terreno');
  const step = quality >= 2 ? 2.5 : quality >= 1 ? 3.5 : 5;
  const holeSkip = (x0, z0, x1, z1) => {
    // tira só os quadrados que estão INTEIROS dentro da boca da fenda: o funil sempre encosta na parede (sem fresta)
    const lim = FUNIL.rBoca - 0.4;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (Math.hypot(x - SHAFT_C.x, z - SHAFT_C.z) >= lim) return false;
    return true;
  };
  const inner = grid(-420, -420, 840, step, { skip: holeSkip });
  root.add(Object.assign(new Node('terreno_interno'), { mesh: R.createMesh(inner, { rough: 0.95, castShadow: false, kind: MAT.TERRENO }) }));
  const outer = grid(-1000, -1000, 2000, 10, { drop: -0.4, skip: (x0, z0, x1, z1) => Math.max(Math.abs(x0), Math.abs(x1)) < 395 && Math.max(Math.abs(z0), Math.abs(z1)) < 395 });
  root.add(Object.assign(new Node('terreno_externo'), { mesh: R.createMesh(outer, { rough: 1, castShadow: false, kind: MAT.TERRENO }) }));
  root.add(buildFarMountains(R));
  return root;
}

function buildFarMountains(R) {
  // anel distante de montanhas (silhueta do horizonte)
  const g = new Geo();
  const seg = 220, rings = [[760, 0], [900, 1], [1250, 0.75], [1800, 0.2]];
  for (let ri = 0; ri < rings.length; ri++) {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const ridge = (0.55 + 0.45 * Math.abs(noise3(nx * 3.1, 0.5, nz * 3.1))) * (0.6 + 0.4 * noise3(nx * 9, 2.2, nz * 9) ** 2);
      const h = ri === 0 ? 260 : 120 + 520 * ridge * rings[ri][1];
      const r = rings[ri][0];
      g.p.push(nx * r, h, nz * r); g.n.push(-nx, 0.6, -nz);
      const t = ri / (rings.length - 1);
      const c = mix([0.2, 0.26, 0.2], [0.42, 0.47, 0.52], t);
      g.c.push(c[0], c[1], c[2], 0);
    }
  }
  for (let ri = 0; ri < rings.length - 1; ri++) for (let j = 0; j < seg; j++) {
    const a = ri * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
    g.i.push(a, b, c, b, d, c);
  }
  g.recomputeNormals();
  const n = new Node('montanhas');
  n.mesh = R.createMesh(g, { rough: 1, castShadow: false, doubleSide: true, kind: MAT.ROCHA, texScale: 0.05 });
  return n;
}

// ------------------------------------------------------------------ fenda abissal
export function buildShaft(R) {
  const root = new Node('fenda');
  const segs = 72;
  const rockCol = (y, n) => {
    const d = -y;
    const base = d < 600 ? [0.3, 0.29, 0.26] : d < 1600 ? [0.23, 0.22, 0.24] : d < 4000 ? [0.17, 0.18, 0.21] : [0.2, 0.17, 0.22];
    const v = 0.75 + n * 0.5;
    return [base[0] * v, base[1] * v, base[2] * v, 0];
  };
  for (const seg of SHAFT_SEGS) {
    // dividido em blocos verticais para permitir recorte por frustum
    const chunk = 160;
    // a parede da fenda começa exatamente onde o funil termina (o funil encosta nela, sem fresta)
    for (let yTop = seg.yTop + (seg.id === 'naufragios' ? 1 : 0); yTop > seg.yBot; yTop -= chunk) {
      const yBot = Math.max(seg.yBot, yTop - chunk);
      const g = new Geo();
      const rows = Math.max(2, Math.ceil((yTop - yBot) / 8));
      for (let i = 0; i <= rows; i++) {
        const y = yTop - (yTop - yBot) * (i / rows);
        for (let j = 0; j <= segs; j++) {
          const a = (j / segs) * Math.PI * 2;
          const r = shaftRadius(seg, Math.min(y, seg.yTop), a);
          g.p.push(SHAFT_C.x + Math.cos(a) * r, y, SHAFT_C.z + Math.sin(a) * r);
          g.n.push(-Math.cos(a), 0, -Math.sin(a));
          g.c.push(...rockCol(y, noise3(Math.cos(a) * 4, y * 0.05, Math.sin(a) * 4)));
        }
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
        // abre a boca das cavernas na parede (antes a parede tampava a entrada)
        const cx = (g.p[a * 3] + g.p[d * 3]) / 2, cy = (g.p[a * 3 + 1] + g.p[d * 3 + 1]) / 2, cz = (g.p[a * 3 + 2] + g.p[d * 3 + 2]) / 2;
        if (insideCave(cx, cy, cz, -0.8)) continue;
        g.i.push(a, c, b, b, c, d);
      }
      g.recomputeNormals();
      // garante normais para dentro
      const nd = new Node('fenda_' + seg.id); nd.mesh = R.createMesh(fixInward(g), { rough: 0.95, castShadow: false, caustics: false, kind: MAT.ROCHA, texScale: 0.5 });
      root.add(nd);
    }
  }
  // patamares (anéis horizontais onde a fenda estreita) e chão da câmara
  const shelf = (y, upper, lower, col) => {
    const g = new Geo();
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const rO = shaftRadius(upper, y + 0.5, a) + 1.5, rI = lower ? shaftRadius(lower, y - 0.5, a) - 1.5 : 0;
      for (const [r, yy] of [[rI, y], [rI + (rO - rI) * 0.5, y + noise3(Math.cos(a) * 5, y, Math.sin(a) * 5) * 1.2], [rO, y]]) {
        g.p.push(SHAFT_C.x + Math.cos(a) * r, yy, SHAFT_C.z + Math.sin(a) * r); g.n.push(0, 1, 0); g.c.push(...col, 0);
      }
    }
    for (let j = 0; j < segs; j++) for (let k = 0; k < 2; k++) {
      const a = j * 3 + k, b = a + 1, c = a + 3, d = c + 1;
      g.i.push(a, b, c, b, d, c);
    }
    g.recomputeNormals();
    for (let k = 0; k < g.n.length; k += 3) if (g.n[k + 1] < 0) { g.flip(); break; }
    const nd = new Node('patamar'); nd.mesh = R.createMesh(g, { rough: 1, castShadow: false, caustics: false, kind: MAT.ROCHA, texScale: 0.5 });
    return nd;
  };
  root.add(shelf(-500, SHAFT_SEGS[0], SHAFT_SEGS[1], [0.28, 0.26, 0.22]));
  root.add(shelf(-1500, SHAFT_SEGS[1], SHAFT_SEGS[2], [0.22, 0.21, 0.22]));
  root.add(shelf(-4300, SHAFT_SEGS[3], null, [0.24, 0.2, 0.24]));
  // teto da câmara do mistério (anel entre a fenda e a cúpula)
  {
    const g = new Geo();
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const rI = shaftRadius(SHAFT_SEGS[2], -3990, a) - 1, rO = shaftRadius(SHAFT_SEGS[3], -3990, a) + 1;
      g.p.push(SHAFT_C.x + Math.cos(a) * rI, -3990, SHAFT_C.z + Math.sin(a) * rI, SHAFT_C.x + Math.cos(a) * rO, -3990, SHAFT_C.z + Math.sin(a) * rO);
      g.n.push(0, -1, 0, 0, -1, 0); g.c.push(0.18, 0.15, 0.2, 0, 0.18, 0.15, 0.2, 0);
    }
    for (let j = 0; j < segs; j++) { const a = j * 2; g.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const nd = new Node('teto_camara'); nd.mesh = R.createMesh(g, { rough: 1, castShadow: false, doubleSide: true });
    root.add(nd);
  }
  root.add(buildCaves(R));
  root.add(buildCrystalsAndRuins(R));
  return root;
}
function fixInward(g) {
  // vira a malha se as normais apontarem para fora do eixo da fenda
  let s = 0;
  for (let k = 0; k < g.n.length; k += 30) { const dx = g.p[k] - SHAFT_C.x, dz = g.p[k + 2] - SHAFT_C.z; s += dx * g.n[k] + dz * g.n[k + 2]; }
  if (s > 0) g.flip();
  return g;
}

function buildCaves(R) {
  const root = new Node('cavernas');
  for (const c of CAVES) {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([c.a[0] + (c.b[0] - c.a[0]) * t, c.a[1] + (c.b[1] - c.a[1]) * t, c.a[2] + (c.b[2] - c.a[2]) * t]);
    }
    // tubo (com folga para dentro da parede da fenda) + tampa esférica no fundo
    const g = tube(pts, c.r + 0.6, 22, (t) => (c.r + 0.6) * (t < 0.18 ? 1.4 : t < 0.3 ? 1.4 - (t - 0.18) * 3.3 : 1));
    noisy(g, 1.1, 0.18, c.r);
    g.flip();
    const end = sphere(c.r + 0.6, 22, 14); noisy(end, 1.0, 0.2, 3); end.flip();
    g.put(end, c.b);
    g.colorize((x, y, z, nx, ny) => { const v = 0.6 + noise3(x * 0.3, y * 0.3, z * 0.3) * 0.25; return [0.25 * v, 0.22 * v, 0.2 * v, 0]; });
    const nd = new Node(c.id); nd.mesh = R.createMesh(g, { rough: 1, castShadow: false, kind: MAT.ROCHA, texScale: 0.6 });
    root.add(nd);
    // marcador luminoso no fundo (objetivo do contrato de mapeamento)
    const bea = new Geo(); bea.put(cylinder(0.25, 0.35, 1.6, 10), [0, 0.8, 0], [0, 0, 0], 1, [0.3, 0.3, 0.32]);
    bea.put(sphere(0.32, 12, 8), [0, 1.8, 0], [0, 0, 0], 1, [0.4, 1, 0.9]);
    const bn = new Node('baliza_' + c.id); bn.mesh = R.createMesh(bea, { emissive: [0.2, 0.9, 0.8], glow: 2.5, rough: 0.4 });
    bn.at(c.b[0], c.b[1] - c.r + 0.6, c.b[2]);
    root.add(bn);
  }
  return root;
}

function buildCrystalsAndRuins(R) {
  const root = new Node('abismo_detalhes');
  const rnd = makeRng(99);
  // cristais bioluminescentes na fenda profunda (instanciados)
  const cg = new Geo();
  cg.put(cylinder(0.0, 0.35, 1.6, 6, false), [0, 0.8, 0], [0, 0, 0], 1, [0.55, 0.7, 1, 0]);
  cg.put(cylinder(0.35, 0.3, 0.4, 6, false), [0, -0.0, 0], [0, 0, 0], 1, [0.4, 0.5, 0.9, 0]);
  const n = 260;
  const cm = R.createMesh(cg, { emissive: [0.25, 0.55, 1], glow: 1.6, rough: 0.2, metal: 0.2, castShadow: false }, { instances: n });
  const mt = m4.create(), q = [0, 0, 0, 1];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const y = -1500 - rnd() * 2800;
    const seg = SHAFT_SEGS.find((s) => y <= s.yTop && y >= s.yBot) || SHAFT_SEGS[2];
    const a = rnd() * Math.PI * 2;
    const r = shaftRadius(seg, y, a) - 0.4;
    const x = SHAFT_C.x + Math.cos(a) * r, z = SHAFT_C.z + Math.sin(a) * r;
    // aponta para dentro da fenda
    quat.fromEuler(q, (rnd() - 0.5) * 0.6, -a, Math.PI / 2 + (rnd() - 0.5) * 0.8);
    const s = 0.6 + rnd() * 2.2;
    m4.compose(mt, [x, y, z], q, [s, s * (0.8 + rnd()), s]);
    const hue = rnd();
    R.setInstance(cm, k++, mt, hue < 0.6 ? [0.6, 0.8, 1, 0] : hue < 0.85 ? [0.8, 0.5, 1, 0] : [0.4, 1, 0.8, 0]);
  }
  cm.instCount = k;
  const cn = new Node('cristais'); cn.mesh = cm; root.add(cn);

  // ruínas da câmara do mistério
  const rg = new Geo();
  const stone = [0.36, 0.34, 0.4];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 50;
    const x = SHAFT_C.x + Math.cos(a) * r, z = SHAFT_C.z + Math.sin(a) * r;
    const h = i % 3 === 0 ? 10 : 24 + (i % 2) * 8;
    const col = cylinder(2.2, 1.9, h, 14);
    rg.put(col, [x, -4300 + h / 2, z], [0, 0, i % 3 === 0 ? 0.2 : 0], 1, stone);
    rg.put(rbox(5.5, 1.2, 5.5, 0.3), [x, -4300 + 0.6, z], [0, a, 0], 1, stone);
    if (i % 3 !== 0) rg.put(rbox(5, 1.4, 5, 0.3), [x, -4300 + h + 0.7, z], [0, a, 0], 1, stone);
  }
  // cabeça colossal tombada
  const head = noisy(sphere(9, 28, 20), 0.5, 0.2, 7);
  rg.put(head, [SHAFT_C.x - 30, -4294, SHAFT_C.z - 25], [0.3, 0.9, 0.5], [1, 1.25, 1], [0.34, 0.33, 0.37]);
  rg.put(rbox(3, 1.5, 6, 0.5), [SHAFT_C.x - 22.5, -4292, SHAFT_C.z - 25], [0, 0.9, 0.5], 1, [0.3, 0.29, 0.33]);
  // altar central
  rg.put(cylinder(14, 16, 3, 32), [SHAFT_C.x, -4298.5, SHAFT_C.z], [0, 0, 0], 1, [0.3, 0.28, 0.34]);
  rg.put(cylinder(8, 10, 3, 32), [SHAFT_C.x, -4295.5, SHAFT_C.z], [0, 0, 0], 1, [0.32, 0.3, 0.36]);
  const rn = new Node('ruinas'); rn.mesh = R.createMesh(rg, { rough: 0.9, castShadow: false, emissive: [0.16, 0.2, 0.3], vertexEmissive: true, glow: 1, kind: MAT.ROCHA, texScale: 0.5 });
  root.add(rn);
  // anéis de glifos luminosos sobre o altar
  const gg = new Geo();
  gg.put(torus(6, 0.18, 64, 6), [SHAFT_C.x, -4290, SHAFT_C.z], [0, 0, 0], 1, [0.4, 0.9, 1]);
  gg.put(torus(4.2, 0.12, 48, 6), [SHAFT_C.x, -4287, SHAFT_C.z], [0.3, 0, 0], 1, [0.8, 0.6, 1]);
  const gn = new Node('glifos'); gn.mesh = R.createMesh(gg, { emissive: [0.4, 0.9, 1], glow: 3, castShadow: false }); root.add(gn);
  root.userGlyph = gn;
  return root;
}

// ------------------------------------------------------------------ rochas do lago
export function buildRocks(R) {
  const variants = [];
  for (let v = 0; v < 5; v++) {
    const g = icosphere(1, 3);
    noisy(g, 0.28, 0.9, v * 7.3);
    g.displace((x, y, z) => (y < -0.3 ? (y + 0.3) * 0.4 : 0) + noise3(x * 3 + v, y * 3, z * 3) * 0.05);
    g.colorize((x, y, z, nx, ny) => {
      const n = noise3(x * 2 + v, y * 2, z * 2);
      let c = mix([0.38, 0.37, 0.34], [0.3, 0.3, 0.28], n * 0.5 + 0.5);
      if (ny > 0.5) c = mix(c, [0.25, 0.32, 0.18], ss(0.5, 0.9, ny) * 0.6); // musgo/algas no topo
      return [...c, 0];
    });
    variants.push(g);
  }
  const root = new Node('rochas');
  const meshes = variants.map((g) => R.createMesh(g, { rough: 0.9, kind: MAT.ROCHA, texScale: 3.0 }, { instances: 40 }));
  const mt = m4.create(), q = [0, 0, 0, 1];
  ROCKS.forEach((k, i) => {
    const me = meshes[i % meshes.length];
    quat.fromEuler(q, (k.seed % 7) * 0.2, (k.seed % 13) * 0.5, 0);
    m4.compose(mt, [k.x, k.y, k.z], q, [k.r * 1.05, k.r * 0.85, k.r * 1.05]);
    R.setInstance(me, me.instCount++, mt, [1, 1, 1, 0]);
  });
  for (const me of meshes) { const n = new Node('rochas_v'); n.mesh = me; root.add(n); }
  // pedras na margem (com colisão: ver PEDRAS_MARGEM em shared/world.js)
  const pedra = icosphere(1, 2); noisy(pedra, 0.25, 0.9, 3.3); pedra.colorize((x, y, z, nx, ny) => [...mix([0.4, 0.39, 0.36], [0.3, 0.33, 0.22], Math.max(0, ny) * 0.5), 0]);
  const shoreMesh = R.createMesh(pedra, { rough: 0.85, kind: MAT.ROCHA, texScale: 3.5 }, { instances: PEDRAS_MARGEM.length });
  for (const k of PEDRAS_MARGEM) {
    quat.fromEuler(q, k.rx, k.ry, 0);
    m4.compose(mt, [k.x, k.y, k.z], q, [k.r, k.r * 0.7, k.r]);
    R.setInstance(shoreMesh, shoreMesh.instCount++, mt, [k.tint[0], k.tint[1], 0.95, 0]);
  }
  const sn = new Node('pedras_margem'); sn.mesh = shoreMesh; root.add(sn);
  return root;
}

// ------------------------------------------------------------------ naufrágios
export function buildWrecks(R) {
  const root = new Node('naufragios');
  for (const w of WRECKS) {
    const g = new Geo();
    const rust = (x, y, z) => { const n = noise3(x * 0.8, y * 0.8, z * 0.8); return n > 0.1 ? [0.42, 0.24, 0.12, 0] : n > -0.3 ? [0.3, 0.32, 0.28, 0] : [0.24, 0.3, 0.2, 0]; };
    if (w.kind === 'batiscafo') {
      g.put(sphere(1.5, 24, 16), [0, 1.5, 0], [0, 0, 0], 1, [0.5, 0.5, 0.52]);
      g.put(capsule(1.4, w.len - 3, 20, 8), [0, 3.1, 0], [0, 0, Math.PI / 2], [1, 1, 0.8], [0.62, 0.55, 0.3]);
      for (const s of [-1, 1]) g.put(sphere(0.32, 12, 8), [s * 0.7, 1.6, 1.25], [0, 0, 0], 1, [0.12, 0.2, 0.25]);
    } else {
      const L = w.len, W = w.w;
      // casco: lathe de seções transversais ao longo de X
      const hull = new Geo();
      const nS = 22, nA = 12;
      for (let i = 0; i <= nS; i++) {
        const t = i / nS, x = (t - 0.5) * L;
        const bow = Math.pow(Math.max(0, (t - 0.65) / 0.35), 1.6), stern = Math.pow(Math.max(0, (0.12 - t) / 0.12), 2);
        const half = (W / 2) * (1 - bow * 0.95) * (1 - stern * 0.25);
        const depth = (w.kind === 'balsa' ? 0.9 : W * 0.55) * (1 - bow * 0.4);
        for (let j = 0; j <= nA; j++) {
          const a = (j / nA) * Math.PI;
          const y = -Math.sin(a) * depth + bow * 0.8;
          const z = Math.cos(a) * half;
          hull.p.push(x, y + depth, z); hull.n.push(0, 0, 1); hull.c.push(1, 1, 1, 0);
        }
      }
      for (let i = 0; i < nS; i++) for (let j = 0; j < nA; j++) { const a = i * (nA + 1) + j, b = a + nA + 1; hull.i.push(a, a + 1, b, a + 1, b + 1, b); }
      hull.recomputeNormals();
      g.add(hull, null, rust);
      // convés com rombos
      g.put(box(L * 0.82, 0.12, W * 0.9), [-L * 0.05, (w.kind === 'balsa' ? 0.9 : W * 0.55) - 0.05, 0], [0, 0, 0.02], 1, [0.3, 0.24, 0.18]);
      if (w.kind === 'barco') {
        g.put(rbox(L * 0.22, 2.1, W * 0.6, 0.12), [-L * 0.2, W * 0.55 + 1.05, 0], [0, 0, 0.06], 1, [0.5, 0.48, 0.42]);
        for (let k = 0; k < 3; k++) g.put(box(0.06, 0.55, 0.7), [-L * 0.2 + L * 0.111, W * 0.55 + 1.4, -0.6 + k * 0.6], [0, 0, 0], 1, [0.05, 0.08, 0.1]);
        g.put(cylinder(0.12, 0.08, 7, 8), [L * 0.12, W * 0.55 + 3.2, 0], [0, 0, 0.5], 1, [0.35, 0.22, 0.12]);
        g.put(cylinder(0.25, 0.25, 1.2, 10), [-L * 0.32, W * 0.55 + 2.6, 0], [0, 0, 0.06], 1, [0.2, 0.18, 0.16]);
      } else {
        for (let k = 0; k < 6; k++) g.put(cylinder(0.05, 0.05, 1, 6), [-L / 2 + 0.6 + k * (L - 1.2) / 5, 1.4, W / 2 - 0.1], [0, 0, 0], 1, [0.35, 0.2, 0.1]);
        g.put(cylinder(0.04, 0.04, L - 1, 6), [0, 1.9, W / 2 - 0.1], [0, 0, Math.PI / 2], 1, [0.35, 0.2, 0.1]);
      }
      g.colorize((x, y, z, nx, ny, nz, c) => (ny > 0.7 ? mix(c, [0.24, 0.32, 0.16], 0.5) : c).concat(0).slice(0, 4));
    }
    const nd = new Node(w.id); nd.mesh = R.createMesh(g, { rough: 0.85, metal: 0.2, kind: MAT.PINTADO, rust: 1.0 });
    nd.at(w.x, w.y, w.z);
    // tombado de lado, apoiado no fundo
    nd.rot(0, -w.rot, w.kind === 'batiscafo' ? 0.1 : 0.32);
    root.add(nd);
  }
  return root;
}
