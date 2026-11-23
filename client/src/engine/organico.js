// Formas orgânicas para personagens e animais: "loft" de seções elípticas (superelipse) ao longo de um eixo.
// Cada anel: [y, a, b, cz = 0, cx = 0, n = 2] → seção no plano XZ com raio a (x) e b (z), centrada em (cx, y, cz).
// n > 2 deixa a seção mais "quadrada" (roupas, botas); n = 2 é elipse.
import { Geo } from './geometry.js';

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

export function loft(rings, seg = 16, opts = {}) {
  const g = new Geo();
  const capA = opts.capA ?? true, capB = opts.capB ?? true;
  const bump = opts.bump || null; // (ang, t, y) → deslocamento radial extra (dobras, músculos)
  const N = rings.length;
  for (let i = 0; i < N; i++) {
    const [y, a, b, cz = 0, cx = 0, n = 2] = rings[i];
    const e = 2 / n, t = i / (N - 1);
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const k = bump ? 1 + bump(ang, t, y) : 1;
      g.p.push(cx + spow(c, e) * a * k, y, cz + spow(s, e) * b * k);
      g.n.push(c, 0, s);
      g.u.push(j / seg, t, 0, 0);
    }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    g.i.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const tampa = (ri, baixo) => {
    const [y, , , cz = 0, cx = 0] = rings[ri];
    const ci = g.p.length / 3; g.p.push(cx, y, cz); g.n.push(0, baixo ? -1 : 1, 0); g.u.push(0.5, ri ? 1 : 0, 0, 0);
    const base = ri * (seg + 1);
    for (let j = 0; j < seg; j++) { if (baixo) g.i.push(ci, base + j + 1, base + j); else g.i.push(ci, base + j, base + j + 1); }
  };
  if (capA) tampa(0, true);
  if (capB) tampa(N - 1, false);
  const nv = g.p.length / 3; for (let k = 0; k < nv; k++) g.c.push(1, 1, 1, 1);
  g.recomputeNormals();
  return g;
}

// suaviza uma lista de anéis (interpola com Catmull-Rom) para silhuetas sem "quinas"
export function suavizar(rings, sub = 3) {
  const out = [];
  const P = (i) => rings[Math.max(0, Math.min(rings.length - 1, i))];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const r = [];
      for (let k = 0; k < rings[i].length; k++) {
        const p0 = P(i - 1)[k] ?? 0, p1 = P(i)[k] ?? 0, p2 = P(i + 1)[k] ?? 0, p3 = P(i + 2)[k] ?? 0;
        r.push(k === 5 ? p1 + (p2 - p1) * t : 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
      }
      out.push(r);
    }
  }
  out.push(rings[rings.length - 1].slice());
  return out;
}

// ruído determinístico simples (para textura de cabelo, dobras de pano)
export function ruido(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
