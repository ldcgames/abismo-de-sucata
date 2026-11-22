// Fauna: modelos de peixes por espécie, cardumes com steering (boids simplificado),
// criaturas de profundidade (peixes-lanterna, águas-vivas, peixe-diabo) e tubarões noturnos.
import { Geo, lathe, sphere, cylinder, tube, capsule, torus, icosphere } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
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
  const L = 1;
  let prof;
  if (e.forma === 'enguia') prof = [[0, -0.5], [0.03, -0.45], [0.04, -0.2], [0.045, 0.1], [0.04, 0.38], [0.025, 0.47], [0, 0.5]];
  else if (e.forma === 'tubarao') prof = [[0, -0.5], [0.03, -0.38], [0.07, -0.15], [0.1, 0.05], [0.095, 0.22], [0.07, 0.38], [0.03, 0.47], [0, 0.5]];
  else if (e.forma === 'bagre') prof = [[0, -0.5], [0.03, -0.4], [0.08, -0.15], [0.1, 0.1], [0.1, 0.3], [0.07, 0.44], [0, 0.5]];
  else prof = [[0, -0.5], [0.03, -0.42], [0.09, -0.2], [0.12, 0.05], [0.11, 0.25], [0.07, 0.42], [0, 0.5]];
  const body = lathe(prof, seg);
  // eixo do lathe = Y → gira para Z; achata lateralmente
  const flatX = e.forma === 'bagre' ? 1.1 : e.forma === 'tubarao' ? 0.9 : e.forma === 'enguia' ? 0.8 : 0.55;
  const tall = e.forma === 'peixe' ? 1.35 : 1.0;
  g.put(body, [0, 0, 0], [Math.PI / 2, 0, 0], [flatX, 1, tall], col);
  // cauda
  const tail = new Geo();
  const tH = e.forma === 'tubarao' ? 0.22 : e.forma === 'enguia' ? 0.05 : 0.16;
  tail.p.push(0, 0, -0.42, 0, tH, -0.62, 0, 0.02, -0.55, 0, -tH * (e.forma === 'tubarao' ? 0.6 : 1), -0.62);
  tail.n.push(1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0);
  for (let k = 0; k < 4; k++) tail.c.push(...back, 0);
  tail.i.push(0, 1, 2, 0, 2, 3);
  g.add(tail); g.add(mirrorX(tail));
  // nadadeira dorsal
  const dorsal = new Geo();
  const dH = e.forma === 'tubarao' ? 0.2 : 0.09;
  dorsal.p.push(0, 0.1, 0.12, 0, 0.1 + dH, -0.02, 0, 0.09, -0.18);
  dorsal.n.push(1, 0, 0, 1, 0, 0, 1, 0, 0);
  for (let k = 0; k < 3; k++) dorsal.c.push(...back, 0);
  dorsal.i.push(0, 1, 2);
  g.add(dorsal); g.add(mirrorX(dorsal));
  // peitorais
  for (const s of [-1, 1]) {
    const pf = new Geo();
    const w = e.forma === 'tubarao' ? 0.22 : 0.08;
    pf.p.push(s * 0.05, -0.03, 0.18, s * (0.05 + w), -0.08 - (e.forma === 'tubarao' ? 0.06 : 0), 0.06, s * 0.05, -0.04, 0.04);
    pf.n.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    for (let k = 0; k < 3; k++) pf.c.push(...base, 0);
    pf.i.push(0, 1, 2);
    g.add(pf); g.add(flipTri(pf));
  }
  // olhos
  const eyeR = e.forma === 'tubarao' ? 0.014 : 0.025;
  for (const s of [-1, 1]) {
    g.put(sphere(eyeR, 8, 6), [s * 0.055 * flatX / 0.55 * 0.6, 0.03, 0.36], [0, 0, 0], 1, [0.92, 0.9, 0.8, 0]);
    g.put(sphere(eyeR * 0.6, 8, 6), [s * (0.055 * flatX / 0.55 * 0.6 + eyeR * 0.55), 0.03, 0.365], [0, 0, 0], 1, [0.02, 0.02, 0.02, 0]);
  }
  if (e.forma === 'bagre') for (const s of [-1, 1]) g.add(tube([[s * 0.04, -0.02, 0.48], [s * 0.1, -0.05, 0.52], [s * 0.16, -0.1, 0.5]], 0.006, 4), null, [0.2, 0.2, 0.18, 0]);
  if (e.forma === 'tubarao') {
    // boca e guelras (estilizado, nada gráfico)
    g.put(capsule(0.006, 0.08, 6, 3), [0, -0.05, 0.4], [0, 0, Math.PI / 2], 1, [0.15, 0.12, 0.12, 0]);
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) g.put(capsule(0.004, 0.06, 4, 2), [s * 0.085, 0, 0.26 - k * 0.025], [0, 0, 0], 1, [0.25, 0.27, 0.3, 0]);
  }
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
