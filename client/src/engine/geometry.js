// Construtor de geometria procedural (posição, normal, cor RGBA por vértice).
// Todas as peças são acumuladas num único buffer para reduzir chamadas de desenho.
import { m4, quat } from './math.js';
import { noise3 } from '../../shared/world.js';

// Cada vértice tem: posição, normal, cor RGBA (A = peso do vento) e u = [u, v, material, 0].
// "material" escolhe a textura procedural no shader (ver MAT abaixo).
export const MAT = { LISO: 0, TERRENO: 1, ROCHA: 2, METAL: 3, PINTADO: 4, CASCO: 5, MADEIRA: 6, CONCRETO: 7, CASCA: 8, FOLHA: 9, TECIDO: 10, PELE: 11, ESCAMA: 12, BORRACHA: 13, AREIA: 14 };
export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.u = []; this.k = null; }
  get vcount() { return this.p.length / 3; }

  // acrescenta outra Geo transformada por matriz m, com cor (ou função de cor)
  add(g, m = null, color = null) {
    const base = this.vcount;
    const nm = m ? normalMat(m) : null;
    for (let k = 0; k < g.p.length; k += 3) {
      let x = g.p[k], y = g.p[k + 1], z = g.p[k + 2];
      let nx = g.n[k], ny = g.n[k + 1], nz = g.n[k + 2];
      if (m) {
        const X = m[0] * x + m[4] * y + m[8] * z + m[12];
        const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
        const Z = m[2] * x + m[6] * y + m[10] * z + m[14];
        x = X; y = Y; z = Z;
        const NX = nm[0] * nx + nm[3] * ny + nm[6] * nz;
        const NY = nm[1] * nx + nm[4] * ny + nm[7] * nz;
        const NZ = nm[2] * nx + nm[5] * ny + nm[8] * nz;
        const l = Math.hypot(NX, NY, NZ) || 1; nx = NX / l; ny = NY / l; nz = NZ / l;
      }
      this.p.push(x, y, z); this.n.push(nx, ny, nz);
      const vi = k / 3;
      const hasU = g.u && g.u.length >= (vi + 1) * 4;
      this.u.push(hasU ? g.u[vi * 4] : 0, hasU ? g.u[vi * 4 + 1] : 0, this.k !== null ? this.k : hasU ? g.u[vi * 4 + 2] : 0, 0);
      if (typeof color === 'function') { const c = color(x, y, z, nx, ny, nz, g.c[vi * 4 + 3]); this.c.push(c[0], c[1], c[2], c[3] ?? 1); }
      else if (color) this.c.push(color[0], color[1], color[2], color[3] ?? g.c[vi * 4 + 3] ?? 1);
      else this.c.push(g.c[vi * 4], g.c[vi * 4 + 1], g.c[vi * 4 + 2], g.c[vi * 4 + 3]);
    }
    for (const idx of g.i) this.i.push(idx + base);
    return this;
  }
  // atalho: posição, rotação euler (pitch,yaw,roll), escala
  put(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], color = null, mat = null) {
    const q = quat.fromEuler([0, 0, 0, 1], rot[0], rot[1], rot[2]);
    const s = typeof scl === 'number' ? [scl, scl, scl] : scl;
    const k0 = this.k; if (mat !== null) this.k = mat;
    this.add(g, m4.compose(m4.create(), pos, q, s), color);
    this.k = k0;
    return this;
  }
  mat(k) { this.k = k; return this; }
  setMat(k) { for (let v = 0; v < this.vcount; v++) { while (this.u.length < (v + 1) * 4) this.u.push(0, 0, 0, 0); this.u[v * 4 + 2] = k; } return this; }
  colorize(fn) {
    for (let k = 0; k < this.vcount; k++) {
      const c = fn(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2], this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2], [this.c[k * 4], this.c[k * 4 + 1], this.c[k * 4 + 2], this.c[k * 4 + 3]]);
      this.c[k * 4] = c[0]; this.c[k * 4 + 1] = c[1]; this.c[k * 4 + 2] = c[2]; if (c[3] !== undefined) this.c[k * 4 + 3] = c[3];
    }
    return this;
  }
  displace(fn) {
    for (let k = 0; k < this.vcount; k++) {
      const d = fn(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2], this.n[k * 3], this.n[k * 3 + 1], this.n[k * 3 + 2]);
      this.p[k * 3] += this.n[k * 3] * d; this.p[k * 3 + 1] += this.n[k * 3 + 1] * d; this.p[k * 3 + 2] += this.n[k * 3 + 2] * d;
    }
    return this.recomputeNormals();
  }
  recomputeNormals() {
    const n = new Float32Array(this.p.length);
    for (let t = 0; t < this.i.length; t += 3) {
      const a = this.i[t] * 3, b = this.i[t + 1] * 3, c = this.i[t + 2] * 3;
      const ux = this.p[b] - this.p[a], uy = this.p[b + 1] - this.p[a + 1], uz = this.p[b + 2] - this.p[a + 2];
      const vx = this.p[c] - this.p[a], vy = this.p[c + 1] - this.p[a + 1], vz = this.p[c + 2] - this.p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
    }
    // soldar normais de vértices coincidentes (costuras de esfera/lathe)
    const map = new Map();
    for (let k = 0; k < n.length; k += 3) {
      const key = `${Math.round(this.p[k] * 1e4)},${Math.round(this.p[k + 1] * 1e4)},${Math.round(this.p[k + 2] * 1e4)}`;
      const e = map.get(key);
      if (e) { e.push(k); } else map.set(key, [k]);
    }
    for (const list of map.values()) {
      if (list.length < 2) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const k of list) { sx += n[k]; sy += n[k + 1]; sz += n[k + 2]; }
      for (const k of list) { n[k] = sx; n[k + 1] = sy; n[k + 2] = sz; }
    }
    for (let k = 0; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
      this.n[k] = n[k] / l; this.n[k + 1] = n[k + 1] / l; this.n[k + 2] = n[k + 2] / l;
    }
    return this;
  }
  flip() { for (let t = 0; t < this.i.length; t += 3) { const a = this.i[t + 1]; this.i[t + 1] = this.i[t + 2]; this.i[t + 2] = a; } for (let k = 0; k < this.n.length; k++) this.n[k] = -this.n[k]; return this; }
  bounds() {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < this.p.length; k += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], this.p[k + j]); mx[j] = Math.max(mx[j], this.p[k + j]); }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    let r = 0; for (let k = 0; k < this.p.length; k += 3) r = Math.max(r, Math.hypot(this.p[k] - c[0], this.p[k + 1] - c[1], this.p[k + 2] - c[2]));
    return { min: mn, max: mx, center: c, radius: r };
  }
}

function normalMat(m) {
  // inversa-transposta da 3x3 superior
  const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
  let det = a00 * b01 + a01 * b11 + a02 * b21; det = det ? 1 / det : 0;
  return transpose3([
    b01 * det, (-a22 * a01 + a02 * a21) * det, (a12 * a01 - a02 * a11) * det,
    b11 * det, (a22 * a00 - a02 * a20) * det, (-a12 * a00 + a02 * a10) * det,
    b21 * det, (-a21 * a00 + a01 * a20) * det, (a11 * a00 - a01 * a10) * det,
  ]);
}
function transpose3(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; }

// ---------------------------------------------------------------- primitivas
const WHITE = [1, 1, 1, 1];
function fill(g, col = WHITE) { const n = g.p.length / 3; for (let k = 0; k < n; k++) g.c.push(col[0], col[1], col[2], col[3] ?? 1); if (g.u.length < n * 4) for (let k = g.u.length / 4; k < n; k++) g.u.push(0, 0, 0, 0); return g; }

// superfície de revolução: perfil [[r, y], ...] em torno de Y
export function lathe(profile, seg = 24, opts = {}) {
  const g = new Geo();
  const a0 = opts.a0 ?? 0, a1 = opts.a1 ?? Math.PI * 2;
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    for (let j = 0; j <= seg; j++) {
      const a = a0 + (a1 - a0) * (j / seg);
      g.p.push(Math.cos(a) * r, y, Math.sin(a) * r);
      g.n.push(0, 1, 0);
      g.u.push(j / seg, i / Math.max(1, profile.length - 1), 0, 0);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      g.i.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  fill(g); g.recomputeNormals();
  return g;
}
export function sphere(r = 1, seg = 16, ring = 12) {
  const prof = [];
  for (let i = 0; i <= ring; i++) { const t = -Math.PI / 2 + Math.PI * (i / ring); prof.push([Math.cos(t) * r + (i === 0 || i === ring ? 0 : 0), Math.sin(t) * r]); }
  prof[0][0] = 0; prof[ring][0] = 0;
  return lathe(prof, seg);
}
export function capsule(r = 0.5, h = 1, seg = 14, ring = 6) {
  // h = comprimento da parte cilíndrica, eixo Y, centrada na origem
  const prof = [];
  for (let i = 0; i <= ring; i++) { const t = -Math.PI / 2 + (Math.PI / 2) * (i / ring); prof.push([Math.cos(t) * r, Math.sin(t) * r - h / 2]); }
  for (let i = 0; i <= ring; i++) { const t = (Math.PI / 2) * (i / ring); prof.push([Math.cos(t) * r, Math.sin(t) * r + h / 2]); }
  prof[0][0] = 0; prof[prof.length - 1][0] = 0;
  return lathe(prof, seg);
}
// cilindro/cone (r0 em baixo, r1 em cima), com tampas
export function cylinder(r0 = 0.5, r1 = 0.5, h = 1, seg = 16, caps = true) {
  const prof = [];
  if (caps) prof.push([0, -h / 2], [r0 * 0.97, -h / 2]);
  prof.push([r0, -h / 2], [r1, h / 2]);
  if (caps) prof.push([r1 * 0.97, h / 2], [0, h / 2]);
  const g = lathe(prof, seg);
  if (caps) {
    // normais duras nas tampas
    for (let k = 0; k < g.vcount; k++) {
      const y = g.p[k * 3 + 1], r = Math.hypot(g.p[k * 3], g.p[k * 3 + 2]);
      const row = Math.floor(k / (seg + 1));
      if (row <= 1) { g.n[k * 3] = 0; g.n[k * 3 + 1] = -1; g.n[k * 3 + 2] = 0; }
      if (row >= 4) { g.n[k * 3] = 0; g.n[k * 3 + 1] = 1; g.n[k * 3 + 2] = 0; }
      void y; void r;
    }
  }
  return g;
}
export function torus(R = 1, r = 0.2, seg = 24, sides = 10) {
  const g = new Geo();
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= sides; j++) {
      const v = (j / sides) * Math.PI * 2;
      const cx = Math.cos(u), cz = Math.sin(u);
      g.p.push((R + r * Math.cos(v)) * cx, r * Math.sin(v), (R + r * Math.cos(v)) * cz);
      g.n.push(Math.cos(v) * cx, Math.sin(v), Math.cos(v) * cz);
      g.u.push(i / seg * 4, j / sides, 0, 0);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    g.i.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return fill(g);
}
// caixa com cantos arredondados (superelipsoide aproximada)
export function rbox(w = 1, h = 1, d = 1, round = 0.08, seg = 3) {
  const g = new Geo();
  const n = seg * 2 + 2;
  // cubo subdividido e "inflado" nos cantos
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  const hx = w / 2, hy = h / 2, hz = d / 2, half = [hx, hy, hz];
  for (const [a, b, c, s] of faces) {
    const base = g.vcount;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const u = (i / n) * 2 - 1, v = (j / n) * 2 - 1;
      const p = [0, 0, 0]; p[a] = u * half[a]; p[b] = v * half[b]; p[c] = s * half[c];
      // ponto interno do "núcleo" e projeção arredondada
      const core = p.map((x, k) => Math.max(-half[k] + round, Math.min(half[k] - round, x)));
      let dx = p[0] - core[0], dy = p[1] - core[1], dz = p[2] - core[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L; dy /= L; dz /= L;
      g.p.push(core[0] + dx * round, core[1] + dy * round, core[2] + dz * round);
      g.n.push(dx, dy, dz);
      g.u.push((u * 0.5 + 0.5) * half[a] * 2, (v * 0.5 + 0.5) * half[b] * 2, 0, 0);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = base + i * (n + 1) + j;
      if (s > 0) g.i.push(q, q + n + 1, q + 1, q + 1, q + n + 1, q + n + 2);
      else g.i.push(q, q + 1, q + n + 1, q + 1, q + n + 2, q + n + 1);
    }
  }
  // distribuição: concentra vértices perto das bordas
  for (let k = 0; k < g.vcount; k++) void k;
  return fill(g);
}
export function box(w = 1, h = 1, d = 1) {
  const g = new Geo();
  const F = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of F) {
    const b = g.vcount;
    const dimU = Math.abs(u[0]) * w + Math.abs(u[1]) * h + Math.abs(u[2]) * d, dimV = Math.abs(v[0]) * w + Math.abs(v[1]) * h + Math.abs(v[2]) * d;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.p.push((n[0] + u[0] * su + v[0] * sv) * w / 2, (n[1] + u[1] * su + v[1] * sv) * h / 2, (n[2] + u[2] * su + v[2] * sv) * d / 2);
      g.n.push(n[0], n[1], n[2]);
      g.u.push((su * 0.5 + 0.5) * dimU, (sv * 0.5 + 0.5) * dimV, 0, 0);
    }
    g.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return fill(g);
}
export function plane(w = 1, d = 1, nx = 1, nz = 1) {
  const g = new Geo();
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) { g.p.push((j / nx - 0.5) * w, 0, (i / nz - 0.5) * d); g.n.push(0, 1, 0); g.u.push(j / nx * w, i / nz * d, 0, 0); }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const a = i * (nx + 1) + j; g.i.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
  return fill(g);
}
// icosfera (base de rochas e copas)
export function icosphere(r = 1, sub = 2) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((x) => x / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map(); const nf = [];
    const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache.has(k)) return cache.get(k); const p = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]; const l = Math.hypot(...p); v.push(p.map((x) => x / l)); cache.set(k, v.length - 1); return v.length - 1; };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  const g = new Geo();
  for (const p of v) { g.p.push(p[0] * r, p[1] * r, p[2] * r); g.n.push(p[0], p[1], p[2]); g.u.push(Math.atan2(p[2], p[0]) / 6.283 + 0.5, p[1] * 0.5 + 0.5, 0, 0); }
  for (const [a, b, c] of f) g.i.push(a, b, c);
  return fill(g);
}
// tubo ao longo de pontos (cabos, linha de pesca, galhos)
export function tube(pts, radius = 0.05, sides = 6, radFn = null) {
  const g = new Geo();
  let prevN = null, comp = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) comp += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
    let n = prevN || (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    // n perpendicular a t
    const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    n = [n[0] - t[0] * d, n[1] - t[1] * d, n[2] - t[2] * d]; const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
    prevN = n;
    const bn = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    const r = radFn ? radFn(i / (pts.length - 1)) : radius;
    for (let j = 0; j <= sides; j++) {
      const ang = (j / sides) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const nx = n[0] * c + bn[0] * s, ny = n[1] * c + bn[1] * s, nz = n[2] * c + bn[2] * s;
      g.p.push(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r); g.n.push(nx, ny, nz);
      g.u.push(j / sides, comp / Math.max(0.05, radius * 6.283), 0, 0);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    g.i.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return fill(g);
}

export function noisy(g, amp, freq, seed = 0) {
  return g.displace((x, y, z) => noise3(x * freq + seed, y * freq, z * freq - seed) * amp + noise3(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3) * amp * 0.4);
}
export { noise3 };
