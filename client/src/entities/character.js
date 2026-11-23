// Personagem estilizado (explorador/mecânico) com esqueleto hierárquico e animação procedural
// guiada por parâmetros de jogo (velocidade, estado), sem "pé patinando": a fase da passada
// avança pela distância percorrida.
import { Geo, sphere, capsule, cylinder, rbox, torus, lathe, tube, box, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { loft, suavizar, ruido } from '../engine/organico.js';
import { damp, clamp } from '../engine/math.js';
import { CORES_JOGADOR } from '../../shared/data.js';

const SKINS = [[0.7, 0.49, 0.37], [0.58, 0.39, 0.27], [0.38, 0.25, 0.16], [0.66, 0.46, 0.33]];
const HAIRS = [[0.2, 0.12, 0.07], [0.08, 0.06, 0.05], [0.55, 0.32, 0.15], [0.85, 0.7, 0.4]];

function mesh(R, g, mat = {}) { return R.createMesh(g, { rough: 0.75, texScale: 1, ...mat }); }
function bone(name, x, y, z) { return new Node(name).at(x, y, z); }

export class Character {
  constructor(R, corIdx = 0, variant = 0) {
    this.R = R;
    const pal = CORES_JOGADOR[corIdx % CORES_JOGADOR.length];
    const jacket = pal.roupa.map((c) => c * 0.88 + 0.04), jacketDk = jacket.map((c) => c * 0.62);
    const skin = SKINS[variant % 4], hair = HAIRS[variant % 4];
    const skinDk = skin.map((c) => c * 0.86), lip = [skin[0] * 0.9, skin[1] * 0.68, skin[2] * 0.66];
    const pants = [0.2, 0.25, 0.33], pantsDk = pants.map((c) => c * 0.78), boots = [0.36, 0.23, 0.13], sola = [0.13, 0.11, 0.09];
    // tecido: leve variação de tom + dobras em volta das juntas (cor no vértice, o relevo fica no loft)
    const pano = (base, dobraY = null) => (x, y, z) => {
      const v = 0.94 + ruido(x * 3, y * 7, z * 3) * 0.08;
      const d = dobraY !== null && Math.abs(y - dobraY) < 0.05 ? 0.88 + 0.12 * Math.abs(Math.sin(y * 140 + x * 30)) : 1;
      return [base[0] * v * d, base[1] * v * d, base[2] * v * d, 0];
    };
    this.root = new Node('personagem');
    const hips = this.hips = bone('quadril', 0, 0.92, 0);
    this.root.add(hips);
    // ---------- pélvis (calça jeans) e cinto de couro
    const pg = new Geo();
    pg.put(loft(suavizar([[-0.14, 0.12, 0.095, 0.0], [-0.08, 0.162, 0.118, 0.0], [0.0, 0.168, 0.12, -0.005], [0.06, 0.158, 0.112, -0.005], [0.1, 0.15, 0.107, -0.005]]), 20), [0, 0, 0], [0, 0, 0], 1, pano(pants));
    pg.put(loft([[0.045, 0.162, 0.115, -0.005], [0.085, 0.157, 0.111, -0.005]], 22, { capA: false, capB: false }), [0, 0, 0], [0, 0, 0], [1.02, 1, 1.03], [0.24, 0.15, 0.09]);
    pg.put(rbox(0.055, 0.04, 0.012, 0.006), [0, 0.065, 0.118], [0, 0, 0], 1, [0.7, 0.62, 0.4]); // fivela
    for (const s of [-1, 1]) pg.put(box(0.012, 0.05, 0.01), [s * 0.1, 0.06, 0.1], [0, s * 0.6, 0], 1, pantsDk); // passadores
    hips.mesh = mesh(this.R, pg, { kind: MAT.TECIDO });
    // ---------- tronco: jaqueta de trabalho aberta no peito, gola dobrada, bolsos com lapela, camiseta por baixo
    const spine = this.spine = bone('coluna', 0, 0.08, 0); hips.add(spine);
    const chest = this.chest = bone('peito', 0, 0.22, 0); spine.add(chest);
    const tg = new Geo();
    const tronco = suavizar([
      [-0.25, 0.15, 0.105, -0.005], [-0.16, 0.152, 0.106, 0.0], [-0.06, 0.16, 0.112, 0.005], [0.04, 0.172, 0.12, 0.008],
      [0.13, 0.18, 0.118, 0.006], [0.19, 0.182, 0.11, 0.0], [0.23, 0.16, 0.096, -0.008], [0.262, 0.11, 0.076, -0.01], [0.285, 0.066, 0.056, -0.005], [0.3, 0.052, 0.05, 0.0],
    ], 3);
    tg.put(loft(tronco, 26, { bump: (a, t) => 0.012 * Math.sin(a * 6 + t * 9) * Math.max(0, 0.6 - t) }), [0, 0, 0], [0, 0, 0], 1, (x, y, z) => {
      // camiseta aparecendo na abertura do peito (V) e costura do zíper
      if (z > 0.07 && Math.abs(x) < (y - 0.19) * 0.45 && y > 0.19) return [0.5, 0.52, 0.5, 0];
      if (z > 0.08 && Math.abs(x - 0.002) < 0.006 && y < 0.13) return [0.18, 0.18, 0.18, 0];
      return pano(jacket)(x, y, z);
    });
    for (const s of [-1, 1]) {
      tg.put(loft([[0.0, 0.045, 0.005], [0.065, 0.044, 0.005]], 12), [s * 0.09, 0.04, 0.125], [0.12, 0, 0], 1, jacket.map((c) => c * 0.9)); // bolso
      tg.put(rbox(0.092, 0.026, 0.008, 0.004), [s * 0.09, 0.107, 0.131], [0.15, 0, 0], 1, jacket.map((c) => c * 0.82)); // lapela do bolso
      tg.put(sphere(0.005, 6, 4), [s * 0.09, 0.098, 0.136], [0, 0, 0], 1, [0.2, 0.2, 0.2]); // botão
      tg.put(loft([[0, 0.045, 0.012], [0.07, 0.03, 0.01]], 10), [s * 0.05, 0.25, 0.04], [0.2, 0, s * 0.9], 1, jacket.map((c) => c * 0.85)); // gola
      tg.put(box(0.03, 0.42, 0.012), [s * 0.115, 0.03, -0.12], [0.05, 0, 0], 1, [0.12, 0.12, 0.12]); // alça da mochila
    }
    // mochila de lona pequena, com tampa e bolso frontal
    tg.put(loft(suavizar([[-0.12, 0.11, 0.05, -0.17], [-0.04, 0.125, 0.06, -0.175], [0.08, 0.12, 0.058, -0.17], [0.15, 0.1, 0.045, -0.16]]), 16), [0, 0, 0], [0, 0, 0], 1, pano([0.3, 0.33, 0.27]));
    tg.put(loft([[-0.08, 0.08, 0.02, -0.225], [0.0, 0.085, 0.022, -0.228]], 12), [0, 0, 0], [0, 0, 0], 1, [0.25, 0.27, 0.22]);
    chest.mesh = mesh(this.R, tg, { rough: 0.85, kind: MAT.TECIDO });
    // ---------- pescoço e cabeça com proporções naturais (cabeça ~1/7,5 da altura)
    const neck = this.neck = bone('pescoco', 0, 0.3, 0); chest.add(neck);
    const head = this.head = bone('cabeca', 0, 0.148, 0.008); head.sc(1.07); neck.add(head);
    const hg = new Geo();
    hg.put(loft([[-0.17, 0.05, 0.048, -0.005], [-0.11, 0.046, 0.046, 0.0], [-0.06, 0.044, 0.044, -0.005]], 14), [0, 0, 0], [0, 0, 0], 1, skinDk); // pescoço
    const cranio = suavizar([
      [-0.108, 0.016, 0.014, 0.066], [-0.102, 0.038, 0.032, 0.06], [-0.086, 0.056, 0.06, 0.038], [-0.06, 0.067, 0.083, 0.018],
      [-0.03, 0.072, 0.093, 0.01], [0.005, 0.077, 0.099, 0.004], [0.045, 0.079, 0.102, 0.0], [0.085, 0.074, 0.098, -0.006],
      [0.112, 0.058, 0.08, -0.01], [0.128, 0.03, 0.045, -0.012], [0.133, 0.004, 0.006, -0.012],
    ], 3);
    const cabeca = loft(cranio, 28);
    // linha do cabelo: alta na testa, desce nas têmporas e na nuca
    const hairline = (x, z) => (z > 0.045 ? 0.072 - Math.abs(x) * 0.25 : z > -0.02 ? 0.03 : -0.06);
    const gau = (dx, dy, sx, sy) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2));
    cabeca.displace((x, y, z) => {
      if (y > hairline(x, z)) return 0.007 + (ruido(x * 9, y * 9, z * 9) - 0.5) * 0.006;
      if (z < 0.03) return 0;
      const f = Math.min(1, (z - 0.03) / 0.04);
      let d = 0;
      d += 0.024 * gau(x, y + 0.012, 0.011, 0.024) * (y < 0.03 ? 1 : 0.4);   // nariz
      d += 0.008 * gau(x, y + 0.034, 0.016, 0.008);                         // ponta/asas
      d += 0.006 * gau(Math.abs(x) - 0.033, y - 0.04, 0.022, 0.008);        // sobrancelha (arco)
      d -= 0.007 * gau(Math.abs(x) - 0.033, y - 0.016, 0.016, 0.011);       // órbita
      d += 0.005 * gau(Math.abs(x) - 0.05, y + 0.012, 0.02, 0.02);          // maçã do rosto
      d += 0.004 * gau(x, y + 0.056, 0.022, 0.009);                         // lábios
      d += 0.005 * gau(x, y + 0.095, 0.022, 0.012);                         // queixo
      return d * f;
    });
    hg.add(cabeca, null, (x, y, z) => {
      if (y > hairline(x, z) - 0.004) return [...hair.map((c) => c * (0.85 + ruido(x * 30, y * 30, z * 30) * 0.3)), 0];
      if (z > 0.07 && Math.abs(x) < 0.024 && y < -0.047 && y > -0.066) return [...lip, 0];                  // boca
      const barba = variant % 2 === 1 && z > 0.0 && y < -0.035 ? 0.9 : 1;                                     // sombra de barba
      const bochecha = z > 0.06 ? 1 + 0.05 * Math.exp(-(((Math.abs(x) - 0.05) / 0.02) ** 2 + ((y + 0.02) / 0.02) ** 2)) * 0 : 1;
      return [skin[0] * barba * bochecha, skin[1] * barba, skin[2] * barba, 0];
    });
    // nariz (dorso + ponta + asas), lábios, orelhas, olhos com pálpebras, sobrancelhas
    hg.put(box(0.03, 0.0015, 0.003), [0, -0.057, 0.106], [0, 0, 0], 1, lip.map((c) => c * 0.5)); // linha da boca
    for (const s of [-1, 1]) {
      hg.put(sphere(0.024, 12, 8), [s * 0.079, 0.005, -0.008], [0, 0, 0], [0.42, 1.25, 0.8], skin); // orelha
      hg.put(sphere(0.012, 8, 6), [s * 0.082, 0.004, -0.004], [0, 0, 0], [0.4, 1.1, 0.7], skinDk);
      hg.put(sphere(0.0135, 12, 10), [s * 0.033, 0.018, 0.083], [0, 0, 0], [1.15, 0.9, 1], [0.95, 0.94, 0.92]); // globo ocular
      hg.put(sphere(0.0072, 10, 8), [s * 0.033, 0.018, 0.0955], [0, 0, 0], [1, 1, 0.4], [0.32, 0.22, 0.12]); // íris
      hg.put(sphere(0.0036, 8, 6), [s * 0.033, 0.018, 0.0985], [0, 0, 0], [1, 1, 0.4], [0.03, 0.03, 0.03]); // pupila
      hg.put(sphere(0.0012, 4, 3), [s * 0.033 + 0.002, 0.0205, 0.0995], [0, 0, 0], 1, [1, 1, 1]); // brilho
      hg.put(sphere(0.0148, 12, 8, ), [s * 0.033, 0.021, 0.084], [-0.35, 0, 0], [1.18, 0.55, 1.02], skin); // pálpebra de cima
      hg.put(loft([[0, 0.0028, 0.002], [0.028, 0.002, 0.0016]], 6), [s * 0.019, 0.035, 0.1], [0, 0, s * (Math.PI / 2 - 0.1)], 1, hair.map((c) => c * 0.9)); // sobrancelha
    }
    // boné na cor do jogador (copa + aba curvada + botão)
    const bone_ = lathe([[0.088, 0.0], [0.089, 0.03], [0.08, 0.065], [0.055, 0.092], [0.02, 0.105], [0, 0.107]], 26);
    hg.put(bone_, [0, 0.055, -0.006], [-0.12, 0, 0], [1.0, 1, 1.12], (x, y, z) => [...(Math.abs(Math.atan2(x, z)) % 0.9 < 0.02 ? jacketDk : jacket), 0]);
    hg.put(loft([[0, 0.075, 0.06, 0.0], [0.006, 0.074, 0.059, 0.0]], 18), [0, 0.06, 0.108], [-0.12, 0, 0], [1, 1, 1], jacketDk);
    hg.put(sphere(0.008, 6, 4), [0, 0.162, 0.005], [0, 0, 0], 1, jacketDk);
    head.mesh = mesh(this.R, hg, { rough: 0.6, kind: MAT.PELE });
    // olhos atordoados (X) — escondidos por padrão
    const xg = new Geo();
    for (const s of [-1, 1]) for (const r of [0.75, -0.75]) xg.put(capsule(0.003, 0.02, 6, 2), [s * 0.033, 0.018, 0.1], [0, 0, r], 1, [0.05, 0.05, 0.05]);
    this.xEyes = new Node('olhosX'); this.xEyes.mesh = mesh(this.R, xg); this.xEyes.visible = false; head.add(this.xEyes);
    // estrelinhas girando
    const sg = new Geo();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; sg.put(sphere(0.025, 6, 4), [Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17], [0, 0, 0], [1, 0.4, 1], [1, 0.9, 0.2]); }
    this.stars = new Node('estrelas'); this.stars.mesh = mesh(this.R, sg, { emissive: [1, 0.85, 0.2], glow: 1.5, castShadow: false }); this.stars.at(0, 0.22, 0); this.stars.visible = false; head.add(this.stars);
    // ---------- braços (manga da jaqueta com dobra no cotovelo, mãos de pele com dedos)
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = bone('ombro', s * 0.185, 0.17, 0); chest.add(sh);
      const ug = new Geo();
      ug.put(loft(suavizar([[0.055, 0.012, 0.014, 0, -s * 0.03], [0.04, 0.045, 0.05, 0, -s * 0.012], [0.0, 0.06, 0.062], [-0.08, 0.058, 0.06], [-0.18, 0.052, 0.054], [-0.27, 0.048, 0.05]]), 16, { bump: (a, t) => (t > 0.85 ? 0.04 * Math.sin(a * 5) : 0) }), [0, 0, 0], [0, 0, 0], 1, pano(jacket, -0.26));
      sh.mesh = mesh(this.R, ug, { rough: 0.85, kind: MAT.TECIDO });
      const el = bone('cotovelo', 0, -0.27, 0); sh.add(el);
      const fg = new Geo();
      fg.put(loft(suavizar([[0.03, 0.05, 0.051], [-0.05, 0.051, 0.052], [-0.14, 0.045, 0.046], [-0.205, 0.043, 0.044], [-0.225, 0.047, 0.048]]), 16), [0, 0, 0], [0, 0, 0], 1, pano(jacket));
      fg.put(loft([[-0.2, 0.049, 0.05], [-0.228, 0.05, 0.051]], 16), [0, 0, 0], [0, 0, 0], 1, jacketDk); // punho
      fg.put(loft([[-0.22, 0.032, 0.036], [-0.25, 0.028, 0.032]], 12), [0, 0, 0], [0, 0, 0], 1, skin); // pulso
      el.mesh = mesh(this.R, fg, { rough: 0.85, kind: MAT.TECIDO });
      const hd = bone('mao', 0, -0.25, 0); el.add(hd);
      const hgg = new Geo();
      // palma (larga no sentido frente/trás, fina no lado), dedos com duas falanges curvadas e polegar
      hgg.put(loft(suavizar([[0.0, 0.017, 0.03], [-0.035, 0.02, 0.041], [-0.075, 0.019, 0.042], [-0.09, 0.016, 0.038]]), 12), [0, 0, 0], [0, 0, 0], 1, skin);
      for (let k = 0; k < 4; k++) {
        const z = 0.028 - k * 0.019, L1 = [0.034, 0.038, 0.036, 0.03][k];
        const p0 = [0, -0.088, z], p1 = [-s * 0.004, -0.088 - L1, z + 0.006], p2 = [-s * 0.008, -0.088 - L1 - 0.026, z + 0.016];
        hgg.add(tube([p0, p1, p2], 0.0085, 6, (t) => 0.0095 - t * 0.0025), null, skin);
        hgg.put(sphere(0.008, 6, 4), p2, [0, 0, 0], 1, skin);
      }
      hgg.add(tube([[-s * 0.006, -0.03, 0.035], [-s * 0.012, -0.06, 0.055], [-s * 0.014, -0.085, 0.06]], 0.011, 6, (t) => 0.012 - t * 0.003), null, skin);
      hgg.put(sphere(0.009, 6, 4), [-s * 0.014, -0.085, 0.06], [0, 0, 0], 1, skin);
      hd.mesh = mesh(this.R, hgg, { rough: 0.6, kind: MAT.PELE });
      const grip = bone('pegada', 0, -0.08, 0.02); hd.add(grip);
      this.arms.push({ sh, el, hd, grip, s });
    }
    this.handR = this.arms[1].grip; this.handL = this.arms[0].grip;
    // ---------- pernas (jeans com dobra no joelho, bota de couro com cadarço)
    this.legs = [];
    for (const s of [-1, 1]) {
      const th = bone('coxa', s * 0.092, -0.04, 0); hips.add(th);
      const tgg = new Geo();
      tgg.put(loft(suavizar([[0.04, 0.084, 0.09, 0.0], [-0.06, 0.086, 0.092, 0.005], [-0.2, 0.075, 0.08, 0.004], [-0.33, 0.064, 0.068, 0.0], [-0.42, 0.06, 0.064, 0.002]]), 16), [0, 0, 0], [0, 0, 0], 1, pano(pants));
      tgg.put(rbox(0.012, 0.11, 0.08, 0.006), [s * 0.08, -0.2, 0.0], [0, 0, s * 0.06], 1, pantsDk); // bolso cargo
      for (let k = 0; k < 3; k++) tgg.put(box(0.004, 0.003, 0.1), [s * 0.083, -0.15 - k * 0.04, 0.0], [0, 0, 0], 1, pantsDk); // costura
      th.mesh = mesh(this.R, tgg, { kind: MAT.TECIDO });
      const kn = bone('joelho', 0, -0.41, 0); th.add(kn);
      const sgg = new Geo();
      sgg.put(loft(suavizar([[0.04, 0.06, 0.065, 0.004], [-0.04, 0.058, 0.064, 0.0], [-0.12, 0.06, 0.066, -0.006], [-0.22, 0.054, 0.058, -0.004], [-0.29, 0.058, 0.06, 0.0]]), 16, { bump: (a, t) => (t < 0.18 ? 0.05 * Math.sin(a * 4) : 0) }), [0, 0, 0], [0, 0, 0], 1, pano(pants, -0.02));
      // cano da bota com bainha da calça por cima e cadarço
      sgg.put(loft([[-0.26, 0.058, 0.064, 0.0, 0, 2.5], [-0.38, 0.06, 0.066, 0.004, 0, 2.5]], 16), [0, 0, 0], [0, 0, 0], 1, boots);
      sgg.put(loft([[-0.25, 0.064, 0.068], [-0.285, 0.066, 0.07]], 16), [0, 0, 0], [0, 0, 0], 1, pantsDk);
      for (let k = 0; k < 4; k++) sgg.put(box(0.05, 0.004, 0.006), [0, -0.3 - k * 0.022, 0.068], [0, 0, (k % 2 ? 0.25 : -0.25)], 1, [0.82, 0.76, 0.62]);
      kn.mesh = mesh(this.R, sgg, { kind: MAT.TECIDO });
      // tornozelo: o pé gira para ficar plano no chão e "rolar" do calcanhar para a ponta
      const an = bone('tornozelo', 0, -0.37, 0); kn.add(an);
      const fgg = new Geo();
      // pé da bota: loft no eixo Z (do calcanhar à biqueira) com seção arredondada, sola grossa com cravos
      const pe = loft(suavizar([[-0.07, 0.012, 0.02], [-0.055, 0.05, 0.05], [0.0, 0.058, 0.055], [0.08, 0.06, 0.046], [0.15, 0.054, 0.032], [0.19, 0.035, 0.022], [0.2, 0.01, 0.008]]), 16);
      fgg.put(pe, [0, -0.03, 0.0], [Math.PI / 2, 0, 0], [1, 1, 1], boots);
      fgg.put(loft(suavizar([[-0.07, 0.05, 0.004], [0.0, 0.062, 0.004], [0.12, 0.062, 0.004], [0.2, 0.04, 0.004]]), 16), [0, -0.058, 0.0], [Math.PI / 2, 0, 0], [1, 1, 3.2], sola);
      for (let k = 0; k < 5; k++) fgg.put(box(0.1, 0.008, 0.01), [0, -0.072, -0.04 + k * 0.045], [0, 0, 0], 1, [0.07, 0.06, 0.05]);
      an.mesh = mesh(this.R, fgg, { kind: MAT.BORRACHA, texScale: 4 });
      this.legs.push({ th, kn, an, s });
    }

    // cadeira de praia dobrável: aparece quando senta (alumínio + lona listrada)
    {
      const cg = new Geo(), AL = [0.75, 0.77, 0.8], LONA = [jacket[0] * 0.9, jacket[1] * 0.9, jacket[2] * 0.9];
      const tubo = (a, b, r = 0.016) => cg.add(tube([a, b], r, 8), null, AL);
      for (const s of [-1, 1]) {
        tubo([s * 0.25, 0.0, 0.22], [s * 0.25, 0.47, -0.16]); // X lateral
        tubo([s * 0.25, 0.0, -0.2], [s * 0.25, 0.47, 0.2]);
        tubo([s * 0.25, 0.47, -0.16], [s * 0.25, 1.02, -0.3]); // encosto
        tubo([s * 0.25, 0.62, 0.22], [s * 0.25, 0.62, -0.2], 0.014); // braço
        tubo([s * 0.25, 0.47, 0.2], [s * 0.25, 0.62, 0.22], 0.014);
        cg.put(rbox(0.07, 0.025, 0.36, 0.01), [s * 0.25, 0.635, 0.01], [0, 0, 0], 1, [0.25, 0.25, 0.27]); // apoio de braço
        cg.put(cylinder(0.022, 0.022, 0.02, 10), [s * 0.25, 0.01, 0.22], [0, 0, 0], 1, [0.15, 0.15, 0.15]); // pezinhos de borracha
        cg.put(cylinder(0.022, 0.022, 0.02, 10), [s * 0.25, 0.01, -0.2], [0, 0, 0], 1, [0.15, 0.15, 0.15]);
      }
      tubo([-0.25, 0.47, 0.2], [0.25, 0.47, 0.2], 0.014); tubo([-0.25, 0.47, -0.16], [0.25, 0.47, -0.16], 0.014);
      tubo([-0.25, 1.02, -0.3], [0.25, 1.02, -0.3], 0.014); tubo([-0.25, 0.04, 0.22], [0.25, 0.04, 0.22], 0.012);
      // assento e encosto de lona (um pouco cedidos), com listras
      const listra = (x) => (Math.floor((x + 0.3) * 12) % 2 ? LONA : [0.95, 0.93, 0.88]);
      for (let k = 0; k < 8; k++) {
        const z0 = 0.18 - k * 0.045;
        cg.put(box(0.5, 0.012, 0.046), [0, 0.455 - Math.sin((k / 7) * Math.PI) * 0.03, z0], [0, 0, 0], 1, (x) => listra(x));
      }
      for (let k = 0; k < 9; k++) { const t = k / 8; cg.put(box(0.5, 0.06, 0.012), [0, 0.5 + t * 0.48, -0.17 - t * 0.12 + Math.sin(t * Math.PI) * 0.025], [-0.25, 0, 0], 1, (x) => listra(x)); }
      this.cadeira = new Node('cadeira'); this.cadeira.mesh = mesh(this.R, cg, { rough: 0.5, metal: 0.3 }); this.cadeira.at(0, 0, -0.05); this.cadeira.visible = false;
      this.root.add(this.cadeira);
    }
    this.phase = 0; this.t = 0;
    this.pose = {}; // ângulos suavizados
    this.state = { speed: 0, grounded: true, mode: 'idle', action: null, actionT: 0 };
  }

  setPose(name, v, rate, dt) { this.pose[name] = damp(this.pose[name] ?? v, v, rate, dt); return this.pose[name]; }

  // st: { speed, grounded, vy, mode: 'terra'|'nadando'|'sub'|'guindaste', anim: 'idle'|'walk'|'run', segura: null|'peixe'|'tubarao'|'vara', acao: {tipo, t} , atordoado }
  update(dt, st) {
    this.t += dt;
    const P = (n, v, r = 12) => this.setPose(n, v, r, dt);
    const sp = st.speed || 0;
    const stride = sp > 3.5 ? 1.55 : 1.05;
    if (st.grounded) this.phase += (sp * dt) / stride * Math.PI;
    const ph = this.phase;
    const run = clamp((sp - 2.5) / 2.5, 0, 1), walk = clamp(sp / 1.6, 0, 1);
    const breathe = Math.sin(this.t * 2.2) * 0.02;
    let spin = 0;
    let hipsYaw = 0;
    let hipsY = 0.92, hipsPitch = 0, hipsRoll = 0, spineP = 0, chestP = 0, chestY = 0, headP = 0, headY = 0;
    let thigh = [0, 0], knee = [0, 0], shP = [0, 0], shR = [0, 0], elb = [0, 0], shY = [0, 0], ank = null;
    let flip = null; // ângulo do mortal (aplicado direto, sem suavizar)
    const mode = st.mode;
    if (mode === 'sub' || mode === 'guindaste') {
      // sentado pilotando
      hipsY = 0.5; thigh = [1.45, 1.45]; knee = [1.5, 1.5]; shP = [-0.7, -0.7]; elb = [-0.8, -0.8]; shR = [0.15, 0.15];
      spineP = -0.05;
    } else if (mode === 'nadando') {
      const s = Math.sin(this.t * 2.6);
      hipsPitch = 1.15; hipsY = 0.3; headP = -0.9; ank = [0.7 + Math.sin(this.t * 6) * 0.2, 0.7 - Math.sin(this.t * 6) * 0.2];
      thigh = [Math.sin(this.t * 6) * 0.35, -Math.sin(this.t * 6) * 0.35]; knee = [0.3, 0.3];
      shP = [-2.2 + s * 0.9, -2.2 + s * 0.9]; shR = [0.5 + s * 0.6, 0.5 + s * 0.6]; elb = [-0.6, -0.6];
    } else {
      // caminhada/corrida
      const amp = 0.5 * walk + 0.35 * run;
      thigh = [Math.sin(ph) * amp, Math.sin(ph + Math.PI) * amp];
      knee = [Math.max(0, -Math.cos(ph)) * (0.9 * walk + 0.6 * run) + 0.05, Math.max(0, -Math.cos(ph + Math.PI)) * (0.9 * walk + 0.6 * run) + 0.05];
      shP = [Math.sin(ph) * amp * 0.9, Math.sin(ph + Math.PI) * amp * 0.9];
      elb = [-0.25 - run * 0.9, -0.25 - run * 0.9];
      shR = [0.08, 0.08];
      hipsY = 0.92 + Math.abs(Math.cos(ph)) * 0.04 * walk - 0.03 * run;
      spineP = 0.05 * walk + 0.2 * run; chestY = Math.sin(ph) * 0.12 * walk;
      hipsRoll = Math.sin(ph) * 0.03 * walk;
      // o quadril gira um pouco com a passada e o peito compensa (contrapeso), cabeça estável
      hipsYaw = Math.sin(ph) * 0.1 * walk; chestY -= hipsYaw * 0.9; headY = -chestY * 0.4;
      // pé plano no chão na fase de apoio, empurra com a ponta ao sair e entra de calcanhar
      ank = [0, 1].map((i) => { const p2 = ph + i * Math.PI; return thigh[i] - knee[i] + (Math.max(0, -Math.sin(p2 - 0.5)) * 0.35 - Math.max(0, Math.sin(p2 + 0.4)) * 0.12) * walk; });
      // parado: respira, transfere o peso de uma perna para a outra e olha em volta
      const idle = 1 - walk;
      if (idle > 0.01) {
        const ws = Math.sin(this.t * 0.55);
        hipsRoll += ws * 0.035 * idle; knee = [knee[0] + Math.max(0, ws) * 0.12 * idle, knee[1] + Math.max(0, -ws) * 0.12 * idle];
        thigh = [thigh[0] + Math.max(0, ws) * 0.06 * idle, thigh[1] + Math.max(0, -ws) * 0.06 * idle];
        ank = [0, 1].map((i) => thigh[i] - knee[i]);
        headY += (Math.sin(this.t * 0.31) * 0.28 + Math.sin(this.t * 0.83) * 0.08) * idle; headP += Math.sin(this.t * 0.47) * 0.06 * idle;
        shR = [0.1 + breathe * 0.6, 0.1 + breathe * 0.6]; elb = [-0.18, -0.18]; shP = [0.04 + breathe, 0.04 + breathe];
      }
      if (!st.grounded) { thigh = [0.7, 0.2]; knee = [1.2, 0.6]; shP = [-2.4, -2.4]; shR = [0.4, 0.4]; elb = [-0.3, -0.3]; ank = [0.35, 0.35]; }
      chestP = breathe;
    }
    // segurando coisas
    if (st.segura === 'peixe') { shP[1] = -0.55; shR[1] = 0.25; elb[1] = -0.55; }
    if (st.segura === 'mira') {
      // mão para trás, pronta para arremessar; o outro braço aponta o alvo
      shP[1] = -3.35; elb[1] = -1.55; shR[1] = 0.25; chestY = -0.45; spineP = -0.05;
      shP[0] = -1.45; elb[0] = -0.15; shR[0] = 0.1;
    }
    if (st.segura === 'arma') {
      // empunhando arma: braço direito estendido na direção da mira, o esquerdo apoia por baixo
      const mp = st.miraPitch || 0;
      shP[1] = -1.5 - mp; elb[1] = -0.08; shR[1] = -0.12;
      shP[0] = -1.3 - mp; elb[0] = -0.55; shR[0] = -0.62; chestY = 0.12;
      if (st.coice) { shP[1] -= st.coice * 0.35; shP[0] -= st.coice * 0.3; spineP -= st.coice * 0.06; }
    }
    if (st.segura === 'tubarao') { shP = [-2.9, -2.9]; shR = [0.35, 0.35]; elb = [-0.4, -0.4]; spineP = -0.12; }
    if (st.segura === 'vara') { shP[1] = -1.0; elb[1] = -0.7; shR[1] = 0.05; shP[0] = -0.75; elb[0] = -1.3; shR[0] = 0.35; shY = [0.6, 0]; }
    // ações temporizadas
    const a = st.acao;
    if (a) {
      const t = a.t;
      if (a.tipo === 'arremesso' || a.tipo === 'arremesso_tubarao') {
        // prepara (0–0.25 s) e solta (0.25–0.5 s)
        const back = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.12);
        const fw = t < 0.25 ? 0 : Math.min(1, (t - 0.25) / 0.12) * Math.max(0, 1 - (t - 0.45) / 0.3);
        if (a.tipo === 'arremesso_tubarao') { shP = [-2.9 + fw * 1.6, -2.9 + fw * 1.6]; spineP = -0.3 * back + 0.5 * fw; }
        else { shP[1] = -2.6 * back - 1.4 * fw; elb[1] = -1.2 * back; chestY = -0.6 * back + 0.5 * fw; spineP = -0.1 * back + 0.3 * fw; }
      } else if (a.tipo === 'lancar') {
        const back = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.1);
        shP[1] = -1.0 - 1.6 * back + (t > 0.35 ? 0.4 : 0); elb[1] = -0.7 - 0.5 * back;
      } else if (a.tipo === 'recolher') {
        shP[0] = -0.75 + Math.sin(this.t * 14) * 0.15; elb[0] = -1.3 + Math.cos(this.t * 14) * 0.2;
        spineP = -0.1; shP[1] = -1.25;
      } else if (a.tipo === 'bancada') {
        shP = [-1.2 + Math.sin(this.t * 9) * 0.25, -1.1 + Math.cos(this.t * 9) * 0.25]; elb = [-0.8, -0.9]; spineP = 0.25; headP = 0.35;
      } else if (a.tipo === 'pegar') {
        const k = Math.sin(Math.min(1, t / 0.6) * Math.PI);
        spineP = 0.9 * k; shP = [-1.1 * k, -1.1 * k]; knee = [1.0 * k, 1.0 * k]; thigh = [0.6 * k, 0.6 * k];
      }
    }
    // gestos e danças (scroll do mouse)
    const sentado = !!(st.emote && st.emote.i === 2 && !st.escorrega && !(st.atordoado > 0));
    this.cadeira.visible = sentado;
    if (st.emote && !(st.atordoado > 0)) {
      const t = st.emote.t, w = Math.sin(t * 6), w2 = Math.sin(t * 3);
      const ocupado = !!(st.segura || a); // pescando/segurando: o sentado mantém os braços da ação
      switch (st.emote.i) {
        case 0: // joinha
          shP[1] = -1.25; elb[1] = -1.5; shR[1] = 0.2; headP = 0.12 * Math.sin(t * 5); spineP = 0.05; break;
        case 1: { // dança: passo lateral no tempo (120 bpm), 8 tempos: aponta para cima, depois gira os braços
          const beat = t * 2, fase = Math.floor(beat) % 8, f = beat % 1, bat = Math.sin(beat * Math.PI);
          const lado = Math.floor(beat) % 2 ? 1 : -1;
          hipsRoll = bat * 0.13; hipsYaw = lado * 0.12; hipsY = 0.88 + Math.abs(bat) * 0.05;
          knee = [0.35 + Math.max(0, bat) * 0.35, 0.35 + Math.max(0, -bat) * 0.35]; thigh = [0.18 + Math.max(0, bat) * 0.15, 0.18 + Math.max(0, -bat) * 0.15];
          ank = [0, 1].map((i) => thigh[i] - knee[i]);
          chestY = -hipsYaw * 1.4; headP = 0.1 * Math.abs(Math.sin(beat * Math.PI * 2)); headY = lado * 0.15;
          if (fase < 4) { // aponta alternando para o alto
            const dir = fase % 2 ? 0 : 1; shP = [-0.9, -0.9]; elb = [-1.3, -1.3]; shR = [0.3, 0.3];
            shP[dir] = -2.9 + Math.sin(f * Math.PI) * 0.2; elb[dir] = -0.1; shR[dir] = 0.15;
          } else { // braços girando na frente do peito (rolinho)
            const r2 = beat * Math.PI * 2;
            shP = [-1.2 + Math.sin(r2) * 0.35, -1.2 - Math.sin(r2) * 0.35]; elb = [-1.6 + Math.cos(r2) * 0.3, -1.6 - Math.cos(r2) * 0.3]; shR = [0.5, 0.5];
          }
          break;
        }
        case 2: // sentado na cadeira de praia (dá para pescar sentado)
          if (st.escorrega) { hipsY = 0.36; thigh = [1.45, 1.45]; knee = [1.7, 1.7]; shP = [-0.5, -0.5]; elb = [-0.9, -0.9]; shR = [0.15, 0.15]; spineP = 0.12; ank = [0.2, 0.2]; break; }
          hipsY = 0.56; hipsYaw = 0; hipsRoll = 0; thigh = [1.42, 1.36]; knee = [1.36, 1.25]; ank = [0.06, 0.12]; spineP = -0.16; chestP = breathe * 0.6;
          if (!ocupado) { shP = [-0.42, -0.42]; elb = [-0.75, -0.75]; shR = [0.32, 0.32]; headY = Math.sin(t * 0.3) * 0.25; headP = 0.05 * w2; }
          break;
        case 3: // aceno
          shP[1] = -2.75; shR[1] = 0.25 + w * 0.35; elb[1] = -0.35 + w * 0.25; headY = 0.15; break;
        case 4: { // dança do robô: poses travadas que trocam no tempo
          const beat = Math.floor(t * 2.5), q = beat % 4;
          chestY = [0.5, 0, -0.5, 0][q]; headY = -chestY * 0.8; shR = [1.45, 1.45]; shP = [-0.15, -0.15];
          elb = [q === 0 || q === 1 ? -1.55 : -0.2, q === 2 || q === 3 ? -1.55 : -0.2]; knee = [0.25 + (q % 2) * 0.15, 0.25 + ((q + 1) % 2) * 0.15]; thigh = [0.12, 0.12];
          ank = [0, 1].map((i) => thigh[i] - knee[i]); hipsY = 0.9; break;
        }
        case 5: { // breakdance: entra agachado (0,6 s) e vira de cabeça para baixo girando (headspin)
          if (t < 0.6) { hipsY = 0.55; knee = [1.6, 1.6]; thigh = [1.3, 1.3]; shP = [-0.9, -0.9]; elb = [-0.4, -0.4]; spineP = 0.5; break; }
          hipsPitch = Math.PI; hipsY = 0.93; spin = (t - 0.6) * 9;
          thigh = [0.5 + Math.sin(t * 9) * 0.25, -0.5 - Math.sin(t * 9) * 0.25]; knee = [0.15, 0.15];
          shP = [-2.9, -2.9]; shR = [0.55, 0.55]; elb = [-0.2, -0.2]; headP = 0.25; ank = [0.5, 0.5]; break;
        }
        case 6: { // mortal para trás: agacha, salta girando encolhido e aterrissa
          const ss = (x) => x * x * (3 - 2 * x);
          if (t < 0.28) { const k = ss(t / 0.28); hipsY = 0.92 - 0.3 * k; thigh = [1.0 * k, 1.0 * k]; knee = [1.8 * k, 1.8 * k]; spineP = 0.45 * k; shP = [0.8 * k, 0.8 * k]; elb = [-0.2, -0.2]; ank = [0, 1].map((i) => thigh[i] - knee[i]); flip = 0; }
          else if (t < 0.95) {
            const u = (t - 0.28) / 0.67, tuck = Math.sin(u * Math.PI);
            hipsY = 0.75 + Math.sin(u * Math.PI) * 1.05; flip = -Math.PI * 2 * ss(u);
            thigh = [0.4 + 1.5 * tuck, 0.4 + 1.5 * tuck]; knee = [0.3 + 1.9 * tuck, 0.3 + 1.9 * tuck]; ank = [0.5, 0.5];
            shP = [-2.6 + 1.4 * tuck, -2.6 + 1.4 * tuck]; elb = [-0.2 - 0.9 * tuck, -0.2 - 0.9 * tuck]; shR = [0.2, 0.2]; headP = 0.3 * tuck; spineP = 0.4 * tuck;
          } else { const k = 1 - ss(Math.min(1, (t - 0.95) / 0.3)); hipsY = 0.92 - 0.28 * k; thigh = [0.9 * k, 0.9 * k]; knee = [1.6 * k, 1.6 * k]; ank = [0, 1].map((i) => thigh[i] - knee[i]); shP = [-1.4 * k, -1.4 * k]; shR = [1.0 * k, 1.0 * k]; spineP = 0.35 * k; flip = 0; }
          break;
        }
      }
    }
    // atordoado: cai mole de costas no chão (sem ficar "dançando" em pé); no ar, braços e pernas soltos
    const stun = st.atordoado > 0;
    this.caido = stun ? (this.caido || 0) + dt : 0;
    if (stun) {
      const noAr = st.grounded === false && mode === 'terra'; ank = null;
      hipsPitch = -1.45; hipsY = 0.2; hipsRoll = 0.08; spineP = 0.05; chestY = 0; headP = -0.25; headY = 0.35;
      shP = [-2.4, -1.9]; shR = [1.05, 0.85]; elb = [-0.35, -0.6];
      thigh = [0.25, -0.05]; knee = [0.55, 0.25];
      if (noAr) { hipsY = 0.75; hipsPitch = -0.9; shP = [-2.8, -2.5]; shR = [1.3, 1.2]; thigh = [0.6, 0.1]; knee = [0.9, 0.4]; }
      if (st.tubarao) { hipsRoll = -0.15; }
    }
    // a queda é rápida (gravidade); levantar é um pouco mais lento
    const rQueda = stun ? 9 : 6;
    this.xEyes.visible = stun; this.stars.visible = stun;
    if (stun) this.stars.rot(0, this.t * 6, 0);
    // aplica com suavização
    const r = 14;
    this.hips.at(0, P('hy', hipsY, stun ? rQueda : flip !== null ? 40 : r), 0);
    // giro do breakdance (direto, sem suavizar para não "desenrolar" o ângulo)
    if (flip !== null && !stun) { this.pose.hp = flip; this.hips.rot(flip, P('hyw', hipsYaw, r), P('hr', hipsRoll, r)); }
    else this.hips.rot(P('hp', hipsPitch, stun ? rQueda : st.emote?.i === 5 ? 10 : 8), spin || P('hyw', hipsYaw, r), P('hr', hipsRoll, r));
    this.spine.rot(P('sp', spineP, r), P('cy', chestY, r) * 0.5, 0);
    this.chest.rot(P('cp', chestP, r), P('cy2', chestY, r) * 0.5, 0);
    this.head.rot(P('hdp', headP, r), P('hdy', headY, r), 0);
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      L.th.rot(-P('th' + i, thigh[i], r), 0, 0);
      L.kn.rot(P('kn' + i, knee[i], r), 0, 0);
      L.an.rot(P('an' + i, ank ? ank[i] : thigh[i] - knee[i], r), 0, 0);
      const A = this.arms[i];
      A.sh.rot(P('shp' + i, shP[i], r), P('shy' + i, shY[i], r), A.s * P('shr' + i, shR[i], r));
      A.el.rot(P('el' + i, elb[i], r), 0, 0);
    }
  }
}

// Vara de pesca (malha) — presa à mão; a ponta é um nó para a linha
export function makeRod(R, nivel = 1, pesado = false) {
  const g = new Geo();
  const len = 1.6 + nivel * 0.25;
  const cols = [[0.7, 0.6, 0.35], [0.25, 0.35, 0.5], [0.12, 0.12, 0.13], [0.6, 0.15, 0.1]];
  const c = cols[(nivel - 1) % 4];
  g.put(cylinder(0.022, 0.006, len, 8), [0, len / 2, 0], [0, 0, 0], 1, c);
  g.put(cylinder(0.03, 0.03, 0.3, 10), [0, 0.15, 0], [0, 0, 0], 1, [0.15, 0.1, 0.08]);
  for (let k = 1; k < 5; k++) g.put(torus(0.012, 0.003, 8, 4), [0.012, k * len / 5, 0], [0, 0, Math.PI / 2], 1, [0.7, 0.7, 0.7]);
  // molinete
  g.put(cylinder(0.05, 0.05, 0.05, 14), [0.06, 0.38, 0], [0, 0, Math.PI / 2], 1, nivel >= 3 ? [0.75, 0.6, 0.2] : [0.5, 0.5, 0.52]);
  g.put(capsule(0.008, 0.06, 6, 2), [0.1, 0.38, 0.03], [0, 0, 0], 1, [0.2, 0.2, 0.2]);
  if (pesado) { g.put(rbox(0.16, 0.12, 0.12, 0.02), [0.1, 0.25, 0], [0, 0, 0], 1, [0.4, 0.42, 0.45]); }
  const n = new Node('vara'); n.mesh = R.createMesh(g, { rough: 0.45, metal: 0.2, kind: nivel === 1 ? MAT.MADEIRA : MAT.METAL, texScale: 4 });
  const tip = new Node('ponta').at(0, len, 0); n.add(tip);
  n.tip = tip;
  return n;
}
