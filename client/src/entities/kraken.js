// Kraken do abismo: polvo gigante (≈ 5× o submarino) que surge no meio do lago a cada 20 min.
// Só o visual: posição e vida vêm do servidor (shared/world.js krakenPos, KRAKEN em data.js).
import { Node } from '../engine/renderer.js';
import { Geo, sphere, cylinder, MAT } from '../engine/geometry.js';
import { krakenPos } from '../../shared/world.js';

const PELE = [0.55, 0.13, 0.22], PELE_ESC = [0.32, 0.06, 0.13], VENTOSA = [0.93, 0.68, 0.62];
const N_TENT = 8, N_SEG = 7;

export class Kraken {
  constructor(R) {
    this.R = R;
    this.root = new Node('kraken');
    this.corpo = new Node('kraken_corpo');
    this.root.add(this.corpo);
    // manto (cabeça) em forma de gota, com manchas
    const g = new Geo(); g.k = MAT.PELE;
    g.put(sphere(4.6, 28, 20), [0, 4.2, -1.2], [0.35, 0, 0], [1, 1.45, 1.05], (x, y, z) => {
      const n = Math.sin(x * 1.7) * Math.sin(y * 1.3 + 1) * Math.sin(z * 1.9);
      return n > 0.35 ? [...PELE_ESC, 0] : [...PELE, 0];
    });
    g.put(sphere(3.6, 24, 16), [0, 0.6, 0.6], [0, 0, 0], [1.1, 0.75, 1], PELE); // "rosto" na linha d'água
    // olhos grandes amarelos com pupila horizontal
    for (const s of [-1, 1]) {
      g.put(sphere(1.05, 18, 12), [s * 2.35, 1.7, 2.6], [0, 0, 0], 1, [0.98, 0.82, 0.2]);
      g.put(sphere(0.62, 14, 10), [s * 2.5, 1.7, 3.45], [0, 0, 0], [1.25, 0.45, 0.5], [0.04, 0.03, 0.03]);
      g.put(sphere(0.18, 8, 6), [s * 2.2, 2.1, 3.5], [0, 0, 0], 1, [1, 1, 1]);
      g.put(sphere(1.2, 14, 8), [s * 2.35, 2.55, 2.3], [0.2, 0, s * 0.35], [1.1, 0.3, 0.8], PELE_ESC); // sobrancelha brava
    }
    this.corpo.mesh = R.createMesh(g, { rough: 0.35, metal: 0.05 });
    // tentáculos: cadeias de segmentos que ondulam (alguns saem da água e se enrolam)
    this.tent = [];
    for (let i = 0; i < N_TENT; i++) {
      const base = new Node('tent' + i);
      const a = (i / N_TENT) * Math.PI * 2;
      base.at(Math.sin(a) * 2.6, 0.2, Math.cos(a) * 2.6);
      this.corpo.add(base);
      let pai = base; const segs = [];
      for (let k = 0; k < N_SEG; k++) {
        const r0 = 0.95 * (1 - k / N_SEG) + 0.12, r1 = 0.95 * (1 - (k + 1) / N_SEG) + 0.1, L = 1.75;
        const sg = new Geo(); sg.k = MAT.PELE;
        sg.put(cylinder(r1, r0, L, 12), [0, 0, L / 2], [Math.PI / 2, 0, 0], 1, PELE);
        for (let v = 0; v < 2; v++) sg.put(sphere(r0 * 0.32, 8, 6), [0, -r0 * 0.75, L * (0.3 + v * 0.4)], [0, 0, 0], [1, 0.5, 1], VENTOSA);
        const n = new Node('seg'); n.mesh = R.createMesh(sg, { rough: 0.4 });
        if (k > 0) n.at(0, 0, 1.7);
        pai.add(n); segs.push(n); pai = n;
      }
      this.tent.push({ base, segs, a, fase: i * 1.37, alto: i % 3 === 0 });
    }
    this.root.visible = false;
    this.flash = 0;
  }
  // estado público do servidor: { vivo, t, resta, hp, hpMax, a0 }
  update(dt, k, tempoLocal) {
    if (!k?.vivo) {
      // afunda e some
      if (this.root.visible) { this.subida = Math.max(0, (this.subida ?? 1) - dt * 0.5); if (this.subida <= 0) this.root.visible = false; }
      if (this.root.visible) this.posicionar(this.ultimoT || 0, this.a0 || 0);
      return;
    }
    if (!this.root.visible) { this.root.visible = true; this.subida = 0; }
    this.a0 = k.a0;
    this.ultimoT = tempoLocal;
    // sobe do fundo nos primeiros segundos e afunda nos últimos
    const alvo = k.resta < 3000 ? 0.25 : 1;
    this.subida = Math.min(1, Math.max(0, (this.subida ?? 0) + Math.sign(alvo - this.subida) * dt * 0.5));
    this.posicionar(tempoLocal, k.a0);
    this.t = (this.t || 0) + dt;
    for (const T of this.tent) {
      const w = this.t * 2.2 + T.fase;
      T.base.rot(T.alto ? -0.55 : 0.08, T.a, 0);
      T.segs.forEach((n, k2) => {
        const enrola = T.alto ? -0.32 - 0.12 * Math.sin(w * 0.7 + k2) : 0.06 * Math.sin(w + k2 * 0.8);
        n.rot(enrola, 0.22 * Math.sin(w + k2 * 0.9), 0);
      });
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    const s = 1 + this.flash * 0.04;
    this.corpo.sc(s);
  }
  posicionar(t, a0) {
    const { pos, yaw } = krakenPos(t, a0);
    const y = -13 + 13 * (1 - (1 - (this.subida ?? 1)) ** 2) + Math.sin(t * 1.3) * 0.35;
    this.root.at(pos[0], y, pos[2]).rot(0, yaw, 0);
  }
  centro() { return [this.root.pos[0], this.root.pos[1] + 2.2, this.root.pos[2]]; }
}
