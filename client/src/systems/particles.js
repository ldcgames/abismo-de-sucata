// Partículas: respingos que sobem e caem com gravidade, gotas escorrendo do casco,
// bolhas que sobem, neve marinha, tinta de lula e confete cômico.
export class Particles {
  constructor(max = 6000) {
    this.max = max; this.list = [];
    this.data = new Float32Array(max * 10); this.count = 0; this.countAlpha = 0;
    this.ripples = [];
  }
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      p: o.p.slice(), v: (o.v || [0, 0, 0]).slice(), life: o.life ?? 1, age: 0, size: o.size ?? 0.1,
      col: o.col || [1, 1, 1, 1], g: o.g ?? 9.8, drag: o.drag ?? 0.2, kind: o.kind || 'gota', add: !!o.add, grow: o.grow ?? 0,
      fade: o.fade ?? 1,
    });
  }
  ripple(x, z, t, strength = 1) {
    this.ripples.push([x, z, t, strength]);
    if (this.ripples.length > 16) this.ripples.shift();
  }
  // respingo de água: coroa de gotas que sobe e cai + anel de onda + espuma
  splash(x, z, t, energy = 1, waterY = 0) {
    const n = Math.floor(60 + energy * 120);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random();
      const up = (3 + Math.random() * 6) * Math.sqrt(energy);
      const out = (1 + Math.random() * 3.5) * Math.sqrt(energy);
      this.emit({ p: [x + Math.cos(a) * r * 1.2, waterY + 0.1, z + Math.sin(a) * r * 1.2], v: [Math.cos(a) * out, up, Math.sin(a) * out], life: 2.2, size: 0.07 + Math.random() * 0.12, col: [0.82, 0.9, 0.95, 0.85], g: 9.8, drag: 0.4, kind: 'gota', waterY });
    }
    for (let i = 0; i < 40 * energy; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.5 * energy;
      this.emit({ p: [x + Math.cos(a) * r, waterY + 0.05, z + Math.sin(a) * r], v: [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], life: 3 + Math.random() * 2, size: 0.35 + Math.random() * 0.4, col: [0.92, 0.95, 0.97, 0.55], g: 0, drag: 1.2, kind: 'espuma', grow: 0.15 });
    }
    this.ripple(x, z, t, 1.2 * energy);
    this.ripple(x + 0.7, z - 0.4, t + 0.25, 0.7 * energy);
  }
  // gotas escorrendo de um corpo içado para fora da água
  drip(p, radius = 1, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({ p: [p[0] + Math.cos(a) * radius * Math.random(), p[1] - Math.random() * 0.4, p[2] + Math.sin(a) * radius * Math.random()], v: [0, -0.5 - Math.random(), 0], life: 2, size: 0.05 + Math.random() * 0.05, col: [0.8, 0.88, 0.95, 0.8], g: 9.8, drag: 0.1, kind: 'gota', waterY: 0 });
    }
  }
  // cortina de água escorrendo (enquanto o sub sai da água)
  sheet(p, radius, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({ p: [p[0] + Math.cos(a) * radius, p[1] - 0.2 + Math.random() * 0.5, p[2] + Math.sin(a) * radius * 1.8], v: [Math.cos(a) * 0.4, -1.5, Math.sin(a) * 0.4], life: 1.5, size: 0.08 + Math.random() * 0.08, col: [0.78, 0.87, 0.95, 0.75], g: 9.8, drag: 0.1, kind: 'gota', waterY: 0 });
    }
  }
  bubbles(p, n = 4, spread = 0.4) {
    for (let i = 0; i < n; i++) this.emit({ p: [p[0] + (Math.random() - 0.5) * spread, p[1] + (Math.random() - 0.5) * spread, p[2] + (Math.random() - 0.5) * spread], v: [(Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3], life: 3, size: 0.04 + Math.random() * 0.06, col: [0.8, 0.92, 1, 0.55], g: -1.2, drag: 1.5, kind: 'bolha' });
  }
  ink(p, n = 80) {
    for (let i = 0; i < n; i++) {
      const v = [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3];
      this.emit({ p: p.slice(), v, life: 3 + Math.random() * 2, size: 0.25 + Math.random() * 0.4, col: [0.04, 0.02, 0.06, 0.8], g: 0, drag: 2, kind: 'tinta', grow: 0.5 });
    }
  }
  confetti(p, n = 30) {
    const cols = [[1, 0.85, 0.2, 1], [0.3, 0.8, 1, 1], [1, 0.4, 0.5, 1], [0.6, 1, 0.4, 1]];
    for (let i = 0; i < n; i++) this.emit({ p: p.slice(), v: [(Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5], life: 1.6, size: 0.08, col: cols[i % 4], g: 9.8, drag: 0.6, kind: 'confete' });
  }
  update(dt, t, env) {
    let na = 0;
    const alive = [];
    for (const q of this.list) {
      q.age += dt;
      if (q.age > q.life) continue;
      q.v[1] -= q.g * dt;
      const k = Math.exp(-q.drag * dt);
      q.v[0] *= k; q.v[1] *= q.kind === 'bolha' ? k : Math.exp(-q.drag * 0.3 * dt); q.v[2] *= k;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      q.size += q.grow * dt;
      if (q.kind === 'gota' && q.waterY !== undefined && q.p[1] < q.waterY && q.v[1] < 0 && q.age > 0.1) {
        // gota voltando à água: pequeno anel (sem exagerar no número de ondas)
        if (Math.random() < 0.02) this.ripple(q.p[0], q.p[2], t, 0.15);
        continue;
      }
      if (q.kind === 'bolha' && q.p[1] > -0.05) continue;
      alive.push(q);
    }
    this.list = alive;
    // ordena: primeiro alfa, depois aditivas
    const d = this.data; let i = 0;
    const write = (q) => {
      const a = q.col[3] * (q.fade ? Math.min(1, (q.life - q.age) / Math.min(0.6, q.life * 0.5)) : 1);
      d[i++] = q.p[0]; d[i++] = q.p[1]; d[i++] = q.p[2];
      d[i++] = q.size; d[i++] = 0; d[i++] = 0;
      const lit = q.kind === 'gota' || q.kind === 'espuma' ? env.lightLvl * 0.85 + 0.15 : 1;
      d[i++] = q.col[0] * lit; d[i++] = q.col[1] * lit; d[i++] = q.col[2] * lit; d[i++] = a;
    };
    for (const q of alive) if (!q.add) { write(q); na++; }
    for (const q of alive) if (q.add) write(q);
    this.count = alive.length; this.countAlpha = na;
    this.ripples = this.ripples.filter((r) => t - r[2] < 7);
  }
}
