// Estátua do Abismo: um boneco igual aos jogadores, parado como um troféu (mãos juntas segurando uma espada).
// Cada peça encontrada no fundo do lago aparece enferrujada; com a cabeça no lugar, tudo fica dourado.
import { Geo, sphere, cylinder, capsule, torus, rbox, box, lathe, tube, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { ESTATUA } from '../../shared/world.js';
import { ESTATUA_PECAS } from '../../shared/data.js';
import { textQuad } from './station.js';

export const ESCALA_ESTATUA = 3.4;
const C = [1, 1, 1]; // a cor vem do material (ferrugem ou ouro); a geometria é monocromática

function membro(g, a, b, r0, r1 = r0) {
  g.add(tube([a, b], r0, 14, (t) => r0 + (r1 - r0) * t), null, C);
  g.put(sphere(r0, 14, 10), a, [0, 0, 0], 1, C);
  g.put(sphere(r1, 14, 10), b, [0, 0, 0], 1, C);
}

// geometria de cada peça no espaço do boneco (pés no chão, ~1,85 m)
const PECA = {
  tenis(s) {
    const g = new Geo(), x = s * 0.095;
    g.put(rbox(0.15, 0.045, 0.29, 0.02), [x, 0.022, 0.045], [0, 0, 0], 1, C); // solado
    g.put(rbox(0.13, 0.09, 0.23, 0.04), [x, 0.085, 0.03], [0, 0, 0], 1, C); // cabedal
    g.put(sphere(0.066, 14, 10), [x, 0.07, 0.15], [0, 0, 0], [1, 0.75, 0.9], C); // biqueira
    g.put(cylinder(0.075, 0.078, 0.06, 16), [x, 0.15, -0.01], [0, 0, 0], 1, C); // cano do tênis
    for (let k = 0; k < 4; k++) g.put(box(0.07, 0.008, 0.012), [x, 0.125 - k * 0.008, 0.07 + k * 0.025], [0.5, 0, 0], 1, C); // cadarço
    g.put(torus(0.078, 0.01, 16, 4), [x, 0.18, -0.01], [0, 0, 0], 1, C);
    return g;
  },
  perna(s) {
    const g = new Geo(), x = s * 0.095;
    membro(g, [x, 0.17, 0.0], [x, 0.47, 0.0], 0.066, 0.07); // canela
    g.put(sphere(0.062, 12, 8), [x, 0.47, 0.035], [0, 0, 0], [1, 1, 0.6], C); // joelheira
    membro(g, [x, 0.47, 0.0], [x, 0.84, 0.0], 0.074, 0.084); // coxa
    g.put(rbox(0.07, 0.09, 0.03, 0.01), [x + s * 0.075, 0.66, 0.01], [0, 0, 0], 1, C); // bolso cargo
    return g;
  },
  tronco_baixo() {
    const g = new Geo();
    g.put(capsule(0.17, 0.1, 18, 6), [0, 0.92, 0], [0, 0, Math.PI / 2], [1, 1, 0.75], C); // pélvis
    g.put(torus(0.178, 0.03, 26, 6), [0, 0.99, 0], [0, 0, 0], [1, 1, 0.78], C); // cinto
    g.put(rbox(0.08, 0.06, 0.03, 0.01), [0, 0.99, 0.145], [0, 0, 0], 1, C); // fivela
    g.put(lathe([[0.0, -0.24], [0.17, -0.23], [0.19, -0.12], [0.205, -0.01], [0.0, -0.01]], 24), [0, 1.22, 0], [0, 0, 0], [1, 1, 0.74], C);
    for (const s of [-1, 1]) g.put(rbox(0.09, 0.08, 0.03, 0.012), [s * 0.1, 1.14, 0.152], [0.12, 0, 0], 1, C); // bolsos
    return g;
  },
  tronco_cima() {
    const g = new Geo();
    g.put(lathe([[0.0, -0.01], [0.205, -0.01], [0.215, 0.02], [0.22, 0.14], [0.19, 0.23], [0.1, 0.28], [0.0, 0.29]], 24), [0, 1.22, 0], [0, 0, 0], [1, 1, 0.74], C);
    for (let k = 0; k < 3; k++) g.put(torus(0.216 - k * 0.005, 0.006, 28, 4), [0, 1.27 + k * 0.08, 0], [0, 0, 0], [1, 1, 0.74], C); // acolchoado
    g.put(torus(0.11, 0.035, 22, 8), [0, 1.48, 0], [0.15, 0, 0], [1, 1, 0.85], C); // gola
    g.put(cylinder(0.062, 0.066, 0.12, 14), [0, 1.56, 0], [0, 0, 0], 1, C); // pescoço
    g.put(rbox(0.26, 0.32, 0.12, 0.04), [0, 1.24, -0.2], [0, 0, 0], 1, C); // mochila
    for (const s of [-1, 1]) g.put(capsule(0.055, 0.22, 12, 4), [s * 0.07, 1.26, -0.27], [0, 0, 0], 1, C); // cilindros de ar
    return g;
  },
  braco(s) {
    // posição de troféu: cotovelo junto ao corpo e antebraço para a frente, mãos se encontram no centro
    const g = new Geo();
    const sh = [s * 0.225, 1.39, 0], el = [s * 0.24, 1.13, 0.05], pu = [s * 0.07, 1.18, 0.27];
    g.put(sphere(0.08, 14, 10), sh, [0, 0, 0], 1, C);
    membro(g, sh, el, 0.064, 0.058);
    membro(g, el, pu, 0.056, 0.05);
    g.add(tube([pu, [pu[0] - s * 0.005, pu[1] + 0.003, pu[2] + 0.02]], 0.058, 14), null, C); // punho da jaqueta
    return g;
  },
  mao(s) {
    const g = new Geo();
    const c = [s * 0.045, 1.19, 0.31];
    g.put(sphere(0.058, 14, 10), c, [0, 0, 0], [0.75, 1, 0.9], C);
    for (let k = 0; k < 4; k++) g.put(capsule(0.016, 0.04, 8, 3), [c[0] - s * 0.03, c[1] + 0.035 - k * 0.022, c[2] + 0.035], [0, 0, Math.PI / 2], 1, C); // dedos fechados
    g.put(capsule(0.02, 0.045, 8, 3), [c[0], c[1] + 0.05, c[2] + 0.01], [0.3, 0, 0], 1, C); // polegar
    if (s > 0) {
      // espada do troféu (como o Oscar), segura pelas duas mãos
      const z = 0.33;
      g.put(cylinder(0.018, 0.018, 0.16, 10), [0, 1.2, z], [0, 0, 0], 1, C); // cabo
      g.put(sphere(0.03, 12, 8), [0, 1.3, z], [0, 0, 0], 1, C); // pomo
      g.put(rbox(0.2, 0.025, 0.03, 0.01), [0, 1.11, z], [0, 0, 0], 1, C); // guarda
      g.put(rbox(0.05, 0.72, 0.012, 0.004), [0, 0.74, z], [0, 0, 0], 1, C); // lâmina
      g.put(cylinder(0.025, 0.0, 0.06, 4), [0, 0.35, z], [Math.PI, 0, 0], [1, 1, 0.25], C); // ponta
    }
    return g;
  },
  cabeca() {
    const g = new Geo(), y = 1.7;
    g.put(sphere(0.165, 30, 22), [0, y + 0.02, 0], [0, 0, 0], [1, 1.03, 0.98], C);
    g.put(sphere(0.12, 22, 14), [0, y - 0.06, 0.04], [0, 0, 0], [1, 0.8, 1], C);
    for (const s of [-1, 1]) {
      g.put(sphere(0.038, 12, 8), [s * 0.16, y, 0], [0, 0, 0], [0.6, 1, 0.9], C); // orelhas
      g.put(sphere(0.04, 14, 10), [s * 0.058, y + 0.03, 0.13], [0, 0, 0], [1, 1.15, 0.5], C); // olhos
      g.put(capsule(0.011, 0.04, 8, 3), [s * 0.06, y + 0.088, 0.142], [0, 0, Math.PI / 2 + s * 0.15], 1, C); // sobrancelhas
    }
    g.put(sphere(0.03, 12, 8), [0, y - 0.01, 0.165], [0, 0, 0], [0.9, 0.8, 1], C); // nariz
    const smile = []; for (let k = 0; k <= 8; k++) { const a = -0.9 + (k / 8) * 1.8; smile.push([Math.sin(a) * 0.045, y - 0.053 - Math.cos(a) * 0.012, 0.142 + Math.cos(a) * 0.01]); }
    g.add(tube(smile, 0.008, 5), null, C);
    g.put(lathe([[0.177, 0.0], [0.18, 0.04], [0.167, 0.1], [0.12, 0.16], [0.05, 0.19], [0, 0.195]], 26), [0, y + 0.06, -0.01], [-0.12, 0, 0], 1, C); // gorro
    g.put(torus(0.174, 0.03, 28, 8), [0, y + 0.07, -0.005], [-0.12, 0, 0], 1, C);
    g.put(sphere(0.048, 12, 8), [0, y + 0.27, -0.04], [0, 0, 0], 1, C); // pompom
    return g;
  },
};
export function pieceGeo(id) {
  switch (id) {
    case 'tenis_e': return PECA.tenis(-1); case 'tenis_d': return PECA.tenis(1);
    case 'perna_e': return PECA.perna(-1); case 'perna_d': return PECA.perna(1);
    case 'braco_e': return PECA.braco(-1); case 'braco_d': return PECA.braco(1);
    case 'mao_e': return PECA.mao(-1); case 'mao_d': return PECA.mao(1);
    default: return PECA[id]();
  }
}
// peça solta (item no fundo do lago): tamanho real da estátua, apoiada no chão
export function pieceItemGeo(id) {
  const g = pieceGeo(id);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.p[i + k]); mx[k] = Math.max(mx[k], g.p[i + k]); }
  const S = ESCALA_ESTATUA * 0.8, o = new Geo();
  o.put(g, [-(mn[0] + mx[0]) / 2 * S, -mn[1] * S, -(mn[2] + mx[2]) / 2 * S], [0, 0, 0], S, null);
  return o.colorize(() => COR_FERRUGEM);
}

export const MAT_FERRUGEM = { rough: 0.85, metal: 0.25, kind: MAT.METAL, rust: 1, texScale: 1.2 };
export const COR_FERRUGEM = [0.47, 0.31, 0.19], COR_OURO = [1.0, 0.77, 0.3];
export const MAT_OURO = { rough: 0.22, metal: 1, kind: MAT.LISO, rust: 0, emissive: [0.16, 0.11, 0.03], glow: 0.3 };

export class Statue {
  constructor(R) {
    this.R = R;
    this.root = new Node('estatua');
    this.root.at(ESTATUA.x, ESTATUA.y, ESTATUA.z).rot(0, Math.atan2(-ESTATUA.x, -ESTATUA.z), 0).sc(ESTATUA.escala); // de frente para o lago
    // praça, degraus e pedestal
    const b = new Geo();
    b.k = MAT.CONCRETO;
    b.put(cylinder(8.5, 8.8, 0.25, 48), [0, 0.12, 0], [0, 0, 0], 1, [0.58, 0.56, 0.52]);
    b.put(cylinder(5.2, 5.4, 0.4, 40), [0, 0.45, 0], [0, 0, 0], 1, [0.66, 0.64, 0.6]);
    b.put(cylinder(4.2, 4.4, 0.4, 40), [0, 0.85, 0], [0, 0, 0], 1, [0.7, 0.68, 0.64]);
    b.k = MAT.ROCHA;
    b.put(rbox(3.4, 2.2, 3.4, 0.12), [0, 2.15, 0], [0, 0, 0], 1, [0.82, 0.8, 0.76]); // bloco de mármore
    b.put(rbox(3.8, 0.3, 3.8, 0.08), [0, 1.2, 0], [0, 0, 0], 1, [0.74, 0.72, 0.68]);
    b.put(rbox(3.7, 0.25, 3.7, 0.08), [0, 3.32, 0], [0, 0, 0], 1, [0.74, 0.72, 0.68]);
    b.k = MAT.METAL;
    for (const y of [1.38, 3.17]) b.put(rbox(3.45, 0.06, 3.45, 0.02), [0, y, 0], [0, 0, 0], 1, [0.85, 0.66, 0.25]); // frisos dourados
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; b.put(cylinder(0.12, 0.14, 1.2, 12), [Math.cos(a) * 6.6, 0.85, Math.sin(a) * 6.6], [0, 0, 0], 1, [0.2, 0.2, 0.22]); b.put(sphere(0.22, 14, 10), [Math.cos(a) * 6.6, 1.55, Math.sin(a) * 6.6], [0, 0, 0], 1, [1, 0.92, 0.7]); }
    const base = new Node('pedestal'); base.mesh = R.createMesh(b, { rough: 0.6, metal: 0.1 }); this.root.add(base);
    // placas
    const pl = textQuad(R, ['ESTÁTUA DO ABISMO', 'O multiplicador de dinheiro aumenta conforme as peças', 'Cada peça +0,6× · Cabeça +3× · Máximo 10×', 'Ordem: tênis → pernas → tronco → braços → mãos → cabeça', 'As peças estão no fundo do lago (precisa de submarino evoluído)'], 3.2, 1.5, { px: 1100, bg: '#2a2418', border: '#d9b44a' });
    pl.at(0, 2.15, 1.72); this.root.add(pl);
    this.placa = null; this.placaTxt = '';
    // boneco (cada peça é um nó; o material troca de ferrugem para ouro)
    this.fig = new Node('boneco_estatua'); this.fig.at(0, 3.45, 0).sc(ESCALA_ESTATUA); this.root.add(this.fig);
    this.pecas = {};
    for (const pc of ESTATUA_PECAS) {
      const g = pieceGeo(pc.id);
      const n = new Node('peca_' + pc.id);
      g.colorize(() => COR_FERRUGEM); const mf = R.createMesh(g, { ...MAT_FERRUGEM });
      g.colorize(() => COR_OURO); const mo = R.createMesh(g, { ...MAT_OURO });
      this.pecas[pc.id] = { n, mf, mo }; n.mesh = mf; n.visible = false; this.fig.add(n);
    }
    this.ouro = false;
  }
  // colocadas: lista de ids já na estátua
  atualizar(colocadas, mult) {
    const completa = colocadas.length >= ESTATUA_PECAS.length;
    for (const [id, P] of Object.entries(this.pecas)) {
      P.n.visible = colocadas.includes(id);
      P.n.mesh = completa ? P.mo : P.mf;
    }
    this.ouro = completa;
    const txt = completa ? `ESTÁTUA COMPLETA · multiplicador ×${mult}` : `Sua estátua: ${colocadas.length}/${ESTATUA_PECAS.length} peças · multiplicador ×${mult}`;
    if (txt !== this.placaTxt) {
      this.placaTxt = txt;
      if (this.placa) this.root.remove(this.placa);
      this.placa = textQuad(this.R, [txt], 3.2, 0.32, { px: 900, bg: completa ? '#5a4310' : '#1d2a26', border: completa ? '#ffd76a' : '#7fd0b0' });
      this.placa.at(0, 1.2, 1.97); this.root.add(this.placa);
    }
  }
}
