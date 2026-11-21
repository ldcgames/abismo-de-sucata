// Armas da barraca de armas (modelos procedurais). Todas apontam o cano para +z, com o cabo na origem.
import { Geo, cylinder, capsule, torus, rbox, box, lathe, tube, sphere, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';

const PRETO = [0.09, 0.09, 0.1], GRAFITE = [0.18, 0.19, 0.21], ACO = [0.5, 0.52, 0.55], MADEIRA = [0.45, 0.26, 0.12];
const VERDE = [0.27, 0.33, 0.2], AREIA = [0.62, 0.53, 0.36], LENTE = [0.15, 0.35, 0.55];
const Z = [Math.PI / 2, 0, 0]; // cilindro deitado ao longo de z

function gatilho(g, z = 0.03, y = -0.02) {
  g.k = MAT.METAL;
  g.put(torus(0.028, 0.006, 14, 5), [0, y - 0.015, z], [0, 0, Math.PI / 2], [1, 1, 1.25], PRETO);
  g.put(box(0.008, 0.03, 0.01), [0, y - 0.01, z + 0.005], [0.3, 0, 0], 1, ACO);
}
function cabo(g, z = 0, cor = PRETO, ang = 0.28) {
  g.k = MAT.BORRACHA;
  g.put(rbox(0.032, 0.11, 0.045, 0.01), [0, -0.06, z], [ang, 0, 0], 1, cor);
  for (let k = 0; k < 4; k++) g.put(box(0.034, 0.004, 0.04), [0, -0.03 - k * 0.022, z - 0.006 * k], [ang, 0, 0], 1, cor.map((c) => c * 0.7));
}

const FAZ = {
  pistola() {
    const g = new Geo();
    g.k = MAT.METAL;
    g.put(rbox(0.032, 0.034, 0.2, 0.006), [0, 0.035, 0.07], [0, 0, 0], 1, GRAFITE); // ferrolho
    for (let k = 0; k < 6; k++) g.put(box(0.034, 0.022, 0.004), [0, 0.04, -0.015 + k * 0.009], [0, 0, 0], 1, PRETO); // serrilhado
    g.put(rbox(0.028, 0.026, 0.17, 0.005), [0, 0.006, 0.06], [0, 0, 0], 1, PRETO); // armação
    g.put(cylinder(0.008, 0.008, 0.03, 10), [0, 0.035, 0.175], Z, 1, PRETO); // boca do cano
    g.put(box(0.006, 0.01, 0.008), [0, 0.056, 0.16], [0, 0, 0], 1, PRETO); // massa de mira
    g.put(box(0.022, 0.01, 0.008), [0, 0.056, -0.02], [0, 0, 0], 1, PRETO); // alça de mira
    cabo(g, -0.01, PRETO, 0.22);
    gatilho(g, 0.035, 0.0);
    return g;
  },
  metralhadora() {
    const g = new Geo();
    g.k = MAT.METAL;
    g.put(rbox(0.05, 0.07, 0.3, 0.01), [0, 0.03, 0.08], [0, 0, 0], 1, GRAFITE); // corpo
    g.put(rbox(0.052, 0.02, 0.2, 0.004), [0, 0.072, 0.1], [0, 0, 0], 1, PRETO); // trilho
    for (let k = 0; k < 7; k++) g.put(box(0.054, 0.006, 0.012), [0, 0.085, 0.02 + k * 0.025], [0, 0, 0], 1, PRETO);
    g.put(cylinder(0.014, 0.014, 0.12, 12), [0, 0.035, 0.28], Z, 1, PRETO); // cano
    g.put(cylinder(0.022, 0.02, 0.06, 12), [0, 0.035, 0.33], Z, 1, GRAFITE); // supressor curto
    for (let k = 0; k < 5; k++) g.put(torus(0.022, 0.003, 12, 4), [0, 0.035, 0.31 + k * 0.01], [Math.PI / 2, 0, 0], 1, PRETO);
    g.put(rbox(0.03, 0.18, 0.045, 0.006), [0, -0.1, 0.0], [0.1, 0, 0], 1, PRETO); // carregador no cabo
    gatilho(g, 0.06, 0.0);
    cabo(g, 0.0, PRETO, 0.1);
    // coronha dobrável de arame
    g.add(tube([[0, 0.05, -0.07], [0, 0.05, -0.24], [0, -0.03, -0.26], [0, -0.04, -0.12]], 0.007, 6), null, ACO);
    g.put(rbox(0.012, 0.09, 0.03, 0.004), [0, 0.01, -0.26], [0, 0, 0], 1, PRETO);
    return g;
  },
  fuzil() {
    const g = new Geo();
    g.k = MAT.METAL;
    g.put(rbox(0.05, 0.07, 0.32, 0.008), [0, 0.03, 0.06], [0, 0, 0], 1, GRAFITE); // caixa da culatra
    g.put(rbox(0.048, 0.028, 0.3, 0.006), [0, 0.075, 0.06], [0, 0, 0], 1, PRETO); // tampa
    g.put(cylinder(0.011, 0.011, 0.45, 12), [0, 0.04, 0.44], Z, 1, PRETO); // cano longo
    g.put(cylinder(0.008, 0.008, 0.3, 8), [0, 0.07, 0.38], Z, 1, PRETO); // tubo de gases
    g.put(rbox(0.03, 0.04, 0.045, 0.005), [0, 0.06, 0.6], [0, 0, 0], 1, PRETO); // massa
    g.put(cylinder(0.016, 0.013, 0.07, 10), [0, 0.04, 0.68], Z, 1, PRETO); // quebra-chamas
    g.k = MAT.MADEIRA;
    g.put(rbox(0.056, 0.06, 0.2, 0.015), [0, 0.035, 0.31], [0, 0, 0], 1, MADEIRA); // guarda-mão de madeira
    // carregador curvo
    g.k = MAT.METAL;
    const mag = []; for (let k = 0; k <= 8; k++) { const t = k / 8; mag.push([0, -0.01 - t * 0.2, 0.1 + Math.sin(t * 1.1) * 0.08]); }
    g.add(tube(mag, 0.022, 8), null, [0.32, 0.2, 0.12]);
    gatilho(g, 0.0, 0.0);
    cabo(g, -0.04, PRETO, 0.35);
    g.k = MAT.MADEIRA;
    g.put(rbox(0.045, 0.1, 0.3, 0.02), [0, -0.005, -0.25], [-0.12, 0, 0], 1, MADEIRA); // coronha
    g.put(rbox(0.047, 0.11, 0.02, 0.006), [0, -0.025, -0.4], [-0.12, 0, 0], 1, PRETO);
    return g;
  },
  sniper() {
    const g = new Geo();
    g.k = MAT.METAL;
    g.put(rbox(0.05, 0.06, 0.34, 0.008), [0, 0.03, 0.05], [0, 0, 0], 1, VERDE); // corpo
    g.put(cylinder(0.013, 0.011, 0.7, 14), [0, 0.04, 0.56], Z, 1, PRETO); // cano bem longo
    g.put(rbox(0.04, 0.03, 0.06, 0.008), [0, 0.04, 0.93], [0, 0, 0], 1, PRETO); // freio de boca
    for (let k = 0; k < 3; k++) g.put(box(0.042, 0.03, 0.006), [0, 0.04, 0.91 + k * 0.02], [0, 0, 0], 1, GRAFITE);
    // luneta
    g.put(cylinder(0.025, 0.025, 0.28, 16), [0, 0.12, 0.06], Z, 1, PRETO);
    g.put(cylinder(0.034, 0.026, 0.06, 16), [0, 0.12, 0.22], Z, 1, PRETO);
    g.put(cylinder(0.03, 0.025, 0.05, 16), [0, 0.12, -0.1], Z, 1, PRETO);
    g.put(cylinder(0.031, 0.031, 0.004, 16), [0, 0.12, 0.252], Z, 1, LENTE);
    g.put(cylinder(0.014, 0.014, 0.03, 10), [0, 0.15, 0.06], [0, 0, 0], 1, PRETO); // torre
    g.put(cylinder(0.014, 0.014, 0.03, 10), [0.03, 0.12, 0.06], [0, 0, Math.PI / 2], 1, PRETO);
    for (const z of [-0.02, 0.14]) g.put(rbox(0.02, 0.05, 0.02, 0.004), [0, 0.085, z], [0, 0, 0], 1, GRAFITE);
    // ferrolho
    g.put(cylinder(0.008, 0.008, 0.06, 8), [0.04, 0.05, -0.04], [0, 0, Math.PI / 2], 1, ACO);
    g.put(sphere(0.012, 10, 8), [0.07, 0.05, -0.04], [0, 0, 0], 1, ACO);
    gatilho(g, -0.02, 0.0);
    cabo(g, -0.06, VERDE, 0.4);
    g.put(rbox(0.05, 0.12, 0.32, 0.02), [0, 0.0, -0.3], [-0.06, 0, 0], 1, VERDE); // coronha
    g.put(rbox(0.04, 0.035, 0.1, 0.01), [0, 0.07, -0.25], [0, 0, 0], 1, VERDE); // apoio de rosto
    // bipé recolhido
    for (const s of [-1, 1]) g.put(cylinder(0.006, 0.006, 0.22, 6), [s * 0.02, 0.0, 0.42], [Math.PI / 2 + 0.08, 0, s * 0.05], 1, PRETO);
    return g;
  },
  bazuca() {
    const g = new Geo();
    g.k = MAT.PINTADO;
    g.put(cylinder(0.075, 0.075, 1.15, 20), [0, 0.1, 0.18], Z, 1, VERDE); // tubo
    g.put(lathe([[0.075, 0], [0.11, 0.18], [0.115, 0.2], [0.07, 0.2]], 20), [0, 0.1, -0.4], [-Math.PI / 2, 0, 0], 1, VERDE); // boca traseira em funil
    for (const z of [-0.2, 0.3, 0.62]) g.put(torus(0.078, 0.01, 20, 5), [0, 0.1, z], [Math.PI / 2, 0, 0], 1, AREIA);
    // ogiva do foguete aparecendo na frente
    g.put(lathe([[0.06, 0], [0.06, 0.06], [0.03, 0.17], [0.0, 0.2]], 16), [0, 0.1, 0.75], [Math.PI / 2, 0, 0], 1, [0.55, 0.5, 0.3]);
    g.k = MAT.METAL;
    g.put(rbox(0.03, 0.12, 0.05, 0.01), [0, -0.03, 0.0], [0.2, 0, 0], 1, PRETO); // empunhadura
    g.put(rbox(0.03, 0.11, 0.05, 0.01), [0, -0.025, 0.32], [0.1, 0, 0], 1, PRETO); // empunhadura da frente
    gatilho(g, 0.05, 0.03);
    g.put(rbox(0.07, 0.07, 0.03, 0.01), [-0.1, 0.16, 0.05], [0, 0, 0], 1, PRETO); // mira lateral
    g.put(rbox(0.012, 0.05, 0.012, 0.003), [-0.1, 0.2, 0.05], [0, 0, 0], 1, AREIA);
    g.put(rbox(0.05, 0.03, 0.2, 0.01), [0, 0.0, -0.18], [0, 0, 0], 1, AREIA); // apoio de ombro
    return g;
  },
};

const cache = {};
export function weaponMesh(R, k) {
  if (!cache[k]) cache[k] = R.createMesh(FAZ[k](), { rough: 0.38, metal: 0.55, kind: MAT.METAL, texScale: 6, rust: 0 });
  return cache[k];
}
export function weaponNode(R, k) {
  const n = new Node('arma_' + k); n.mesh = weaponMesh(R, k);
  // ponto da boca do cano (para o clarão e o rastro da bala)
  const boca = { pistola: 0.19, metralhadora: 0.37, fuzil: 0.72, sniper: 0.96, bazuca: 0.8 }[k] || 0.3;
  const yb = k === 'bazuca' ? 0.1 : 0.04;
  n.boca = new Node('boca').at(0, yb, boca); n.add(n.boca);
  return n;
}
// foguete da bazuca em voo
export function rocketGeo() {
  const g = new Geo();
  g.k = MAT.PINTADO;
  g.put(cylinder(0.045, 0.045, 0.45, 12), [0, 0, 0], Z, 1, [0.35, 0.38, 0.25]);
  g.put(lathe([[0.06, 0], [0.06, 0.06], [0.03, 0.17], [0.0, 0.2]], 16), [0, 0, 0.22], [Math.PI / 2, 0, 0], 1, [0.55, 0.5, 0.3]);
  for (let k = 0; k < 4; k++) g.put(box(0.005, 0.08, 0.1), [0, 0, -0.2], [0, 0, (k * Math.PI) / 2], [1, 1, 1], [0.3, 0.3, 0.3]);
  return g;
}
