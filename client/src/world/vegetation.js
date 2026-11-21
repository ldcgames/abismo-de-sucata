// Vegetação procedural instanciada: pinheiros, árvores de copa larga, bétulas, árvores secas,
// arbustos, capim, taboas na margem e algas no fundo raso. Dois níveis de detalhe por espécie.
import { Geo, lathe, icosphere, tube, cylinder, sphere, noisy, plane, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { m4, quat } from '../engine/math.js';
import { terrainHeight, terrainNormal, LAKE_R, STATIONS, makeRng, noise3, PLAY_R, ESTATUA } from '../../shared/world.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function anyPerp(d) { return norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0])); }
function rotAxis(v, k, a) { const c = Math.cos(a), s = Math.sin(a), kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], kx = cross(k, v); return [v[0] * c + kx[0] * s + k[0] * kd * (1 - c), v[1] * c + kx[1] * s + k[1] * kd * (1 - c), v[2] * c + kx[2] * s + k[2] * kd * (1 - c)]; }
function R(seed) { const r = makeRng(seed); r.range = (a, b) => a + (b - a) * r(); r.int = (a, b) => a + Math.floor(r() * (b - a + 1)); return r; }

// Construtor de vegetação no padrão do WildLens: tubos com casca texturizada + cartões de folha recortados.
class Veg {
  constructor(bark = [0.36, 0.3, 0.24], leaf = [1, 1, 1]) { this.g = new Geo(); this.bark = bark; this.leaf = leaf; }
  tube(pts, radii, segs, sway) {
    const t = tube(pts, radii[0], segs, (k) => { const f = k * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)); return radii[i] + (radii[i + 1] - radii[i]) * (f - i); });
    const H = this.H || 10;
    this.g.add(t, null, (x, y, z) => { const n = noise3(x * 0.7, y * 0.5, z * 0.7) * 0.12; return [this.bark[0] * (1 + n), this.bark[1] * (1 + n), this.bark[2] * (1 + n), sway ? sway([x, y, z]) : Math.pow(Math.max(0, y) / (H * 1.4), 1.6)]; });
    const n0 = this.g.vcount - t.vcount;
    for (let v = n0; v < this.g.vcount; v++) this.g.u[v * 4 + 2] = MAT.CASCA;
  }
  // cartão de folha: centro p, vetores meia-largura (right) e meia-altura (up)
  card(p, right, up, nrm, cell, sway, ao, tint = this.leaf) {
    const g = this.g, b = g.vcount;
    const cx = cell % 4, cy = Math.floor(cell / 4);
    const corners = [[-1, -1, 0.01, 0.99], [1, -1, 0.99, 0.99], [1, 1, 0.99, 0.01], [-1, 1, 0.01, 0.01]];
    for (const [a, c, u, v] of corners) {
      g.p.push(p[0] + right[0] * a + up[0] * c, p[1] + right[1] * a + up[1] * c, p[2] + right[2] * a + up[2] * c);
      g.n.push(nrm[0], nrm[1], nrm[2]);
      g.c.push(tint[0] * ao, tint[1] * ao, tint[2] * ao, sway + (c > 0 ? 0.25 : 0));
      g.u.push((cx + u) / 4, (cy + v) / 3, MAT.FOLHA, 0);
    }
    g.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  leafCluster(c, Rr, count, cell, r, crownC, crownR, sA, sB, treeH, opts = {}) {
    const ax = [r.range(0.65, 1.35), r.range(0.55, 1.0), r.range(0.65, 1.35)];
    for (let k = 0; k < count; k++) {
      const u = r() * Math.PI * 2, v = Math.acos(r.range(-0.6, 1)), rr = Rr * Math.pow(r(), 0.45);
      const yy = Math.cos(v) * rr * (opts.flat || 0.75) * ax[1];
      const p = add(c, [Math.sin(v) * Math.cos(u) * rr * ax[0], yy, Math.sin(v) * Math.sin(u) * rr * ax[2]]);
      const out = norm(sub(p, crownC));
      const nrm = norm(add(out, [0, 0.6, 0]));
      const s = r.range(sA, sB);
      let right = rotAxis(anyPerp(out), out, r() * Math.PI * 2);
      const up = norm(cross(out, right));
      const dist = len(sub(p, crownC)) / crownR;
      const ao = clamp(0.35 + dist * 0.75 + (p[1] - crownC[1]) / crownR * 0.25, 0.25, 1);
      const sway = Math.pow(Math.max(0, p[1]) / treeH, 1.3) * 1.3;
      this.card(p, scl(right, s), scl(up, s), nrm, cell, sway, ao);
    }
  }
}
function branchPath(start, dir, L, n, r, bendUp, wiggle) {
  const pts = [start]; let d = norm(dir), p = start;
  for (let k = 1; k <= n; k++) { d = norm(add(d, [r.range(-wiggle, wiggle), bendUp, r.range(-wiggle, wiggle)])); p = add(p, scl(d, L / n)); pts.push(p); }
  return pts;
}

// árvore de copa larga (como o jequitibá do WildLens, em escala de mata de lago)
function broadleaf(lod, seed, o = {}) {
  const r = R(seed), m = new Veg(o.bark || [0.33, 0.27, 0.21], o.leaf || [1, 1, 1]);
  const H = o.H || r.range(7, 10), R0 = o.R || r.range(0.26, 0.36), segs = lod ? 9 : 5, cell = o.cell ?? 0;
  m.H = H;
  const trunkN = 7, trunkH = H * r.range(0.5, 0.6);
  const tp = branchPath([0, -0.3, 0], [r.range(-0.08, 0.08), 1, r.range(-0.08, 0.08)], trunkH, trunkN, r, 0.02, 0.07);
  m.tube(tp, tp.map((p, k) => { const t = k / trunkN; return R0 * (1 - t * 0.35) * (1 + Math.pow(1 - t, 6) * (o.buttress ?? 0.6)); }), segs);
  if (lod) for (let k = 0; k < 4; k++) { // raízes
    const a = (k / 4) * Math.PI * 2 + r.range(-0.3, 0.3), d = [Math.cos(a), 0, Math.sin(a)];
    const p0 = add([0, R0 * 1.1, 0], scl(d, R0 * 0.5));
    m.tube([p0, add(p0, add(scl(d, R0 * 1.3), [0, -R0 * 0.9, 0])), add(p0, add(scl(d, R0 * 2.5), [0, -R0 * 1.6, 0]))], [R0 * 0.4, R0 * 0.22, R0 * 0.07], 5);
  }
  const top = tp[tp.length - 1];
  const crownC = add(top, [0, H * 0.2, 0]), crownR = H * 0.42 * (o.crownW || 1);
  const limbs = o.limbs || r.int(3, 5), LM = lod ? 1 : 0.38;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + r.range(-0.4, 0.4);
    const d = norm([Math.cos(a), r.range(0.7, 1.3), Math.sin(a)]);
    const L = H * r.range(0.35, 0.5) * (o.crownW || 1);
    const bp = branchPath(tp[trunkN - r.int(0, 2)], d, L, 5, r, 0.05, 0.18);
    m.tube(bp, bp.map((p, k) => R0 * 0.6 * (1 - (k / 5) * 0.7)), lod ? 6 : 4);
    for (let sb = 0; sb < (lod ? 3 : 1); sb++) {
      const sp = bp[r.int(2, 5)], sd = norm(add(d, [r.range(-0.9, 0.9), r.range(-0.1, 0.5), r.range(-0.9, 0.9)]));
      const sbp = branchPath(sp, sd, L * r.range(0.4, 0.6), 3, r, 0.06, 0.25);
      if (lod) m.tube(sbp, sbp.map((p, k) => R0 * 0.22 * (1 - (k / 3) * 0.8)), 4);
      m.leafCluster(sbp[3], H * 0.14 * (o.crownW || 1), Math.round(18 * LM), cell, r, crownC, crownR, (lod ? 0.7 : 1.15) * (o.leafScale || 1), (lod ? 1.1 : 1.7) * (o.leafScale || 1), H * 1.4);
    }
    m.leafCluster(bp[5], H * 0.17 * (o.crownW || 1), Math.round(24 * LM), cell, r, crownC, crownR, (lod ? 0.75 : 1.2) * (o.leafScale || 1), (lod ? 1.15 : 1.8) * (o.leafScale || 1), H * 1.4);
  }
  m.leafCluster(crownC, crownR * 0.5, Math.round(16 * LM), cell, r, crownC, crownR, 1.0, 1.5, H * 1.4);
  return m.g;
}
// pinheiro (conífera de montanha): verticilos de galhos caídos com ramos de agulhas
function pine(lod, seed) {
  const r = R(seed), m = new Veg([0.3, 0.22, 0.16], [0.95, 1, 0.95]);
  const H = r.range(12, 17), R0 = r.range(0.25, 0.34); m.H = H;
  const tp = branchPath([0, -0.3, 0], [0, 1, 0], H, 9, r, 0.0, 0.02);
  m.tube(tp, tp.map((p, k) => R0 * (1 - (k / 9) * 0.9) * (1 + Math.pow(1 - k / 9, 8) * 0.5)), lod ? 8 : 5);
  const whorls = lod ? 11 : 6;
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls, y = H * (0.22 + t * 0.74), L = (1 - t) * H * 0.3 + 0.5, nb = lod ? r.int(5, 7) : 4;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * Math.PI * 2 + w * 0.9 + r.range(-0.25, 0.25);
      const d = norm([Math.cos(a), -0.15 - t * 0.1 + r.range(-0.05, 0.1), Math.sin(a)]);
      const pts = [[0, y, 0]]; let p = [0, y, 0], dd = d;
      for (let k = 1; k <= 3; k++) { dd = norm(add(dd, [0, k > 1 ? 0.12 : -0.05, 0])); p = add(p, scl(dd, L / 3)); pts.push(p); }
      if (lod) m.tube(pts, [0.07 * (1 - t * 0.5), 0.045, 0.025, 0.01], 4);
      const side = norm(cross(dd, [0, 1, 0]));
      const nc = lod ? 4 : 2;
      for (let c = 0; c < nc; c++) {
        const q = add(pts[1 + Math.min(2, Math.floor((c / nc) * 3))], [0, r.range(-0.1, 0.15), 0]);
        const s = (L * 0.5 + 0.35) * (lod ? 0.9 : 1.25);
        const along = scl(norm(add(dd, [0, -0.25, 0])), s * 0.75);
        const sweep = scl(norm(add(side, [0, 0.35, 0])), s * 0.6);
        const ao = clamp(0.5 + t * 0.5 + (len(sub(q, [0, q[1], 0])) / (L + 0.1)) * 0.25, 0.4, 1);
        m.card(q, sweep, along, norm(add(cross(side, along), [0, 1, 0])), 1, Math.pow(y / H, 1.4) * 1.1, ao);
        m.card(q, scl(norm(cross(dd, side)), s * 0.55), along, [0, 1, 0], 1, Math.pow(y / H, 1.4) * 1.1, ao * 0.9);
      }
    }
  }
  // ponta
  for (let k = 0; k < 3; k++) { const a = k * 2.1; m.card([0, H * 0.98, 0], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [0, 0.9, 0], [0, 1, 0], 1, 1.2, 1); }
  return m.g;
}
function birch(lod, seed) {
  // tronco claro com manchas escuras (a textura de casca dá as fissuras)
  return broadleaf(lod, seed, { cell: 2, H: R(seed).range(9, 11.5), R: 0.17, bark: [0.82, 0.8, 0.74], crownW: 0.72, limbs: 4, leafScale: 0.85, buttress: 0.2 });
}
function deadTree(lod, seed) {
  const r = R(seed), m = new Veg([0.36, 0.32, 0.28]); const H = r.range(6, 9), R0 = r.range(0.24, 0.34); m.H = H;
  const rec = (p, d, L, rad, depth) => {
    const pts = branchPath(p, d, L, 4, r, 0.03, depth ? 0.35 : 0.12);
    m.tube(pts, pts.map((q, k) => rad * (1 - (k / 4) * 0.6)), depth ? 4 : lod ? 7 : 5);
    if (depth >= (lod ? 2 : 1)) { for (let t = 0; t < 2; t++) m.card(pts[4], scl(anyPerp(d), 0.9), [0, 0.9, 0], [0, 1, 0], 7, 0.5, 0.8, [0.9, 0.85, 0.8]); return; }
    for (let k = 0; k < (depth === 0 ? 4 : 2); k++) {
      const nd = norm(add(d, [r.range(-1, 1), r.range(-0.2, 0.6), r.range(-1, 1)]));
      rec(pts[depth === 0 ? r.int(2, 4) : 4], nd, L * r.range(0.5, 0.7), rad * 0.55, depth + 1);
    }
  };
  rec([0, -0.3, 0], [0, 1, 0], H * 0.6, R0, 0);
  return m.g;
}
function bush(lod, seed) {
  const r = R(seed + 77), m = new Veg(); const Rr = r.range(0.7, 1.1); m.H = 1.5;
  m.leafCluster([0, Rr * 0.55, 0], Rr, lod ? 16 : 9, 5, r, [0, 0, 0], Rr * 1.2, 0.5, 0.8, 3, { flat: 0.6 });
  return m.g;
}
function grassTuft() {
  const m = new Veg(); const r = R(31);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; m.card([0, 0.32, 0], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0, 0.34, 0], [0, 1, 0], k === 2 ? 6 : 3, 0.9, 0.9 + r() * 0.1); }
  return m.g;
}
function fern() {
  const m = new Veg(); const r = R(19);
  for (let f = 0; f < 6; f++) {
    const a = (f / 6) * Math.PI * 2 + r.range(-0.2, 0.2), d = norm([Math.cos(a), 0.9, Math.sin(a)]);
    const side = norm(cross(d, [0, 1, 0])), up = norm(cross(side, d));
    const L = r.range(0.45, 0.65);
    m.card(add([0, 0.05, 0], scl(d, L)), scl(side, L * 0.42), scl(d, L), up, 4, 0.6, 0.85);
  }
  return m.g;
}
function reed() {
  const g = new Geo();
  for (let i = 0; i < 4; i++) {
    const a = i * 1.3, h = 1.4 + (i % 3) * 0.35;
    g.add(tube([[0, 0, 0], [Math.cos(a) * 0.06, h * 0.5, Math.sin(a) * 0.06], [Math.cos(a) * 0.15, h, Math.sin(a) * 0.15]], 0.025, 3), m4.compose(m4.create(), [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], [0, 0, 0, 1], [1, 1, 1]), (x, y) => [0.3, 0.42, 0.18, Math.min(1, y / h)]);
    if (i % 2 === 0) g.put(cylinder(0.05, 0.05, 0.28, 6), [Math.cos(a) * 0.28, h * 0.82, Math.sin(a) * 0.28], [0, 0, 0], 1, [0.35, 0.22, 0.12, 0.9]);
  }
  const m = new Veg(); m.g = g;
  for (let k = 0; k < 2; k++) { const a = k * 1.57 + 0.3; m.card([0, 0.45, 0], [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [0, 0.45, 0], [0, 1, 0], 3, 0.6, 0.85, [0.9, 1, 0.8]); }
  return m.g;
}
function kelp() {
  const m = new Veg(); 
  for (let k = 0; k < 3; k++) { const a = k * 1.05; m.card([0, 1.2, 0], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [0, 1.2, 0], [0, 1, 0], 8, 1.0, 0.9, [0.85, 1, 0.8]); }
  return m.g;
}

export class Vegetation {
  constructor(R, quality) {
    this.R = R; this.root = new Node('vegetacao');
    this.q = quality;
    const types = [
      { id: 'pinheiro', f: pine, w: 0.45 }, { id: 'copa', f: broadleaf, w: 0.3 }, { id: 'betula', f: birch, w: 0.17 }, { id: 'seca', f: deadTree, w: 0.08 },
    ];
    // posições
    const rnd = makeRng(2024);
    const trees = [];
    const nForest = [900, 1700, 2600][quality];
    const okSpot = (x, z, minStation = 36) => {
      for (const s of STATIONS) {
        if (Math.hypot(x - s.pad[0], z - s.pad[1]) < minStation) return false;
        if (Math.hypot(x - s.dockRoot[0], z - s.dockRoot[1]) < 14) return false;
      }
      if (Math.hypot(x - ESTATUA.x, z - ESTATUA.z) < (minStation > 10 ? 24 : 13)) return false; // praça da estátua
      const r = Math.hypot(x, z);
      if (Math.abs(r - (LAKE_R + 52)) < 4.5) return false; // trilha
      return true;
    };
    for (let i = 0; i < nForest; i++) {
      const a = rnd() * Math.PI * 2;
      const r = LAKE_R + 72 + Math.pow(rnd(), 0.8) * 400;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!okSpot(x, z)) continue;
      const h = terrainHeight(x, z);
      const nrm = terrainNormal(x, z);
      if (nrm[1] < 0.6 || h > 300) continue;
      trees.push({ x, y: h - 0.2, z, t: pickType(types, rnd), s: 0.75 + rnd() * 0.55, rot: rnd() * 6.28, tint: 0.85 + rnd() * 0.3 });
    }
    // árvores esparsas na margem jogável
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = LAKE_R + 12 + rnd() * 60;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!okSpot(x, z, 40)) continue;
      trees.push({ x, y: terrainHeight(x, z) - 0.2, z, t: pickType(types, rnd), s: 0.7 + rnd() * 0.4, rot: rnd() * 6.28, tint: 0.9 + rnd() * 0.2 });
    }
    this.trees = trees;
    // malhas: 3 variações por tipo × 2 LODs
    this.kinds = [];
    for (const [ti, t] of types.entries()) {
      for (let v = 0; v < 3; v++) {
        const seed = ti * 10 + v * 3 + 1;
        const list = trees.filter((tr, k) => tr.t === ti && k % 3 === v);
        const near = R.createMesh(t.f(1, seed), { rough: 0.85, wind: 0.12, castShadow: true, doubleSide: true }, { instances: Math.max(1, list.length) });
        const far = R.createMesh(t.f(0, seed), { rough: 0.9, wind: 0.08, castShadow: false, doubleSide: true }, { instances: Math.max(1, list.length) });
        const nn = new Node(t.id + v + '_perto'); nn.mesh = near; const fn = new Node(t.id + v + '_longe'); fn.mesh = far;
        this.root.add(nn, fn);
        this.kinds.push({ list, near, far });
      }
    }
    // arbustos, capim, taboas, algas
    this.root.add(this.scatter('arbustos', bush(1, 3), [250, 420, 600][quality], LAKE_R + 5, LAKE_R + 140, 0.0, { wind: 0.08, doubleSide: true }, (x, z) => okSpot(x, z, 30)));
    this.root.add(this.scatter('samambaias', fern(), [150, 300, 450][quality], LAKE_R + 30, LAKE_R + 120, 0, { wind: 0.12, doubleSide: true, castShadow: false }, (x, z) => okSpot(x, z, 30)));
    this.root.add(this.scatter('capim', grassTuft(), [2500, 5000, 8000][quality], LAKE_R + 2, LAKE_R + 95, 0, { wind: 0.25, castShadow: false, doubleSide: true }, (x, z) => okSpot(x, z, 22) && terrainHeight(x, z) > 0.4, 0.8, 1.5));
    this.root.add(this.scatter('taboas', reed(), [250, 450, 700][quality], LAKE_R - 5, LAKE_R + 2, 0, { wind: 0.18, castShadow: false, doubleSide: true }, (x, z) => { const h = terrainHeight(x, z); return h > -0.9 && h < 0.4 && okSpot(x, z, 30); }));
    this.root.add(this.scatter('algas', kelp(), [200, 380, 600][quality], LAKE_R * 0.5, LAKE_R - 8, 0, { wind: 0.5, castShadow: false, doubleSide: true }, (x, z) => { const h = terrainHeight(x, z); return h < -2 && h > -26; }));
    this.updateLod([0, 0, 0], true);
  }
  scatter(name, geo, n, r0, r1, yoff, mat, ok, s0 = 0.7, s1 = 1.3) {
    const rnd = makeRng(name.length * 977);
    const me = this.R.createMesh(geo, { rough: 0.9, ...mat }, { instances: n });
    const mt = m4.create(), q = [0, 0, 0, 1];
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const a = rnd() * Math.PI * 2, r = r0 + rnd() * (r1 - r0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z)) continue;
      const s = s0 + rnd() * (s1 - s0);
      quat.fromEuler(q, 0, rnd() * 6.28, 0);
      m4.compose(mt, [x, terrainHeight(x, z) + yoff - 0.05, z], q, [s, s * (0.8 + rnd() * 0.4), s]);
      const tn = 0.85 + rnd() * 0.3;
      this.R.setInstance(me, k++, mt, [tn, tn * (0.95 + rnd() * 0.1), tn * 0.9, rnd()]);
    }
    me.instCount = k;
    const nd = new Node(name); nd.mesh = me; return nd;
  }
  // redistribui instâncias entre o LOD próximo e o distante conforme a câmera
  updateLod(cam, force = false) {
    if (!force && this.lastCam && Math.hypot(cam[0] - this.lastCam[0], cam[2] - this.lastCam[2]) < 12) return;
    this.lastCam = cam.slice();
    const near2 = 150 * 150;
    const mt = m4.create(), q = [0, 0, 0, 1];
    for (const k of this.kinds) {
      let a = 0, b = 0;
      for (const t of k.list) {
        quat.fromEuler(q, 0, t.rot, 0);
        m4.compose(mt, [t.x, t.y, t.z], q, [t.s, t.s, t.s]);
        const d2 = (t.x - cam[0]) ** 2 + (t.z - cam[2]) ** 2;
        const col = [t.tint, t.tint, t.tint, (t.x * 0.013) % 1];
        if (d2 < near2) this.R.setInstance(k.near, a++, mt, col); else this.R.setInstance(k.far, b++, mt, col);
      }
      k.near.instCount = a; k.far.instCount = b;
    }
  }
}
function pickType(types, rnd) { let x = rnd(); for (let i = 0; i < types.length; i++) { x -= types[i].w; if (x <= 0) return i; } return 0; }
export { PLAY_R };
