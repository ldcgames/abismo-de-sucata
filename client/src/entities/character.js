// Personagem estilizado (explorador/mecânico) com esqueleto hierárquico e animação procedural
// guiada por parâmetros de jogo (velocidade, estado), sem "pé patinando": a fase da passada
// avança pela distância percorrida.
import { Geo, sphere, capsule, cylinder, rbox, torus, lathe, tube, box, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { damp, clamp } from '../engine/math.js';
import { CORES_JOGADOR } from '../../shared/data.js';

const SKINS = [[0.96, 0.78, 0.64], [0.78, 0.56, 0.4], [0.55, 0.37, 0.25], [0.92, 0.72, 0.55]];
const HAIRS = [[0.2, 0.12, 0.07], [0.08, 0.06, 0.05], [0.55, 0.32, 0.15], [0.85, 0.7, 0.4]];

function mesh(R, g, mat = {}) { return R.createMesh(g, { rough: 0.75, texScale: 1, ...mat }); }
function bone(name, x, y, z) { return new Node(name).at(x, y, z); }

export class Character {
  constructor(R, corIdx = 0, variant = 0) {
    this.R = R;
    const pal = CORES_JOGADOR[corIdx % CORES_JOGADOR.length];
    const jacket = pal.roupa, jacketDk = jacket.map((c) => c * 0.65);
    const skin = SKINS[variant % 4], hair = HAIRS[variant % 4];
    const pants = [0.2, 0.24, 0.3], boots = [0.32, 0.2, 0.12], glove = [0.25, 0.22, 0.2];
    this.root = new Node('personagem');
    const hips = this.hips = bone('quadril', 0, 0.92, 0);
    this.root.add(hips);
    // ---------- pélvis e cinto
    const pg = new Geo();
    pg.put(capsule(0.17, 0.1, 16, 6), [0, 0.0, 0], [0, 0, Math.PI / 2], [1, 1, 0.75], pants);
    pg.put(torus(0.175, 0.03, 24, 6), [0, 0.07, 0], [0, 0, 0], [1, 1, 0.78], [0.2, 0.14, 0.1]);
    pg.put(rbox(0.07, 0.055, 0.03, 0.01), [0, 0.07, 0.14], [0, 0, 0], 1, [0.75, 0.65, 0.3]);
    hips.mesh = mesh(this.R, pg, { kind: MAT.TECIDO });
    // ---------- tronco (jaqueta acolchoada)
    const spine = this.spine = bone('coluna', 0, 0.08, 0); hips.add(spine);
    const chest = this.chest = bone('peito', 0, 0.22, 0); spine.add(chest);
    const tg = new Geo();
    const torso = lathe([[0.0, -0.24], [0.17, -0.23], [0.19, -0.12], [0.21, 0.02], [0.22, 0.14], [0.19, 0.23], [0.1, 0.28], [0.0, 0.29]], 22);
    tg.put(torso, [0, 0, 0], [0, 0, 0], [1, 1, 0.74], (x, y, z) => {
      // costuras horizontais do acolchoado + zíper
      const quilt = Math.abs(Math.sin(y * 40)) < 0.12 ? 0.82 : 1;
      if (Math.abs(x) < 0.012 && z > 0) return [0.15, 0.15, 0.15, 0];
      return [jacket[0] * quilt, jacket[1] * quilt, jacket[2] * quilt, 0];
    });
    tg.put(torus(0.11, 0.035, 20, 8), [0, 0.26, 0.0], [0.15, 0, 0], [1, 1, 0.85], jacketDk); // gola
    for (const s of [-1, 1]) {
      tg.put(rbox(0.09, 0.08, 0.03, 0.012), [s * 0.1, -0.08, 0.155], [0.12, 0, 0], 1, jacketDk); // bolsos
      tg.put(rbox(0.06, 0.012, 0.035, 0.005), [s * 0.1, -0.035, 0.162], [0.12, 0, 0], 1, jacketDk);
    }
    // mochila com cilindro de ar
    tg.put(rbox(0.26, 0.32, 0.12, 0.04), [0, 0.02, -0.2], [0, 0, 0], 1, [0.28, 0.3, 0.25]);
    tg.put(capsule(0.055, 0.22, 12, 4), [0.07, 0.04, -0.27], [0, 0, 0], 1, [0.8, 0.8, 0.78]);
    tg.put(capsule(0.055, 0.22, 12, 4), [-0.07, 0.04, -0.27], [0, 0, 0], 1, [0.8, 0.8, 0.78]);
    tg.put(cylinder(0.025, 0.025, 0.04, 8), [0.07, 0.22, -0.27], [0, 0, 0], 1, [0.3, 0.3, 0.3]);
    for (const s of [-1, 1]) tg.put(capsule(0.018, 0.34, 6, 3), [s * 0.11, 0.05, 0.05], [0.15, 0, 0], [1, 1, 3.5], [0.2, 0.2, 0.18]);
    chest.mesh = mesh(this.R, tg, { rough: 0.85, kind: MAT.TECIDO });
    // ---------- cabeça
    const neck = this.neck = bone('pescoco', 0, 0.3, 0); chest.add(neck);
    const head = this.head = bone('cabeca', 0, 0.16, 0.0); neck.add(head);
    const hg = new Geo();
    hg.put(cylinder(0.06, 0.065, 0.1, 12), [0, -0.1, 0], [0, 0, 0], 1, skin);
    hg.put(sphere(0.165, 28, 20), [0, 0.02, 0], [0, 0, 0], [1, 1.03, 0.98], skin);
    hg.put(sphere(0.12, 20, 14), [0, -0.06, 0.04], [0, 0, 0], [1, 0.8, 1], skin); // maxilar/bochechas
    for (const s of [-1, 1]) {
      hg.put(sphere(0.038, 12, 8), [s * 0.16, 0.0, 0.0], [0, 0, 0], [0.6, 1, 0.9], skin.map((c) => c * 0.95)); // orelhas
      hg.put(sphere(0.042, 16, 12), [s * 0.058, 0.03, 0.135], [0, 0, 0], [1, 1.15, 0.55], [0.97, 0.97, 0.95]); // olhos
      hg.put(sphere(0.024, 12, 8), [s * 0.058, 0.028, 0.155], [0, 0, 0], [1, 1.1, 0.5], [0.25, 0.17, 0.1]); // íris
      hg.put(sphere(0.013, 10, 6), [s * 0.058, 0.028, 0.165], [0, 0, 0], [1, 1, 0.5], [0.03, 0.03, 0.03]); // pupila
      hg.put(sphere(0.006, 6, 4), [s * 0.058 + 0.007, 0.038, 0.17], [0, 0, 0], 1, [1, 1, 1]); // brilho
      hg.put(capsule(0.01, 0.04, 8, 3), [s * 0.06, 0.088, 0.142], [0, 0, Math.PI / 2 + s * 0.15], 1, hair); // sobrancelhas
      hg.put(sphere(0.028, 10, 6), [s * 0.085, -0.035, 0.12], [0, 0, 0], [1, 0.7, 0.4], [0.95, 0.6, 0.55]); // bochechas
    }
    hg.put(sphere(0.03, 12, 8), [0, -0.01, 0.165], [0, 0, 0], [0.9, 0.8, 1], skin.map((c) => c * 0.93)); // nariz
    // sorriso (arco de tubo)
    const smile = []; for (let k = 0; k <= 8; k++) { const a = -0.9 + (k / 8) * 1.8; smile.push([Math.sin(a) * 0.045, -0.065 - Math.cos(a) * 0.012 + 0.012, 0.142 + Math.cos(a) * 0.01]); }
    hg.add(tube(smile, 0.006, 5), null, [0.45, 0.15, 0.12]);
    // cabelo + gorro de lã com dobra
    hg.put(sphere(0.17, 24, 14), [0, 0.035, -0.012], [0, 0, 0], [1.01, 0.95, 1.01], hair);
    const beanie = lathe([[0.175, 0.0], [0.178, 0.04], [0.165, 0.1], [0.12, 0.16], [0.05, 0.19], [0, 0.195]], 24);
    hg.put(beanie, [0, 0.06, -0.01], [-0.12, 0, 0], 1, jacket);
    hg.put(torus(0.172, 0.028, 28, 8), [0, 0.07, -0.005], [-0.12, 0, 0], 1, jacketDk);
    hg.put(sphere(0.045, 12, 8), [0, 0.27, -0.04], [0, 0, 0], 1, [0.95, 0.95, 0.9]); // pompom
    head.mesh = mesh(this.R, hg, { rough: 0.6 });
    // olhos atordoados (X) — escondidos por padrão
    const xg = new Geo();
    for (const s of [-1, 1]) for (const r of [0.75, -0.75]) xg.put(capsule(0.008, 0.05, 6, 2), [s * 0.058, 0.03, 0.172], [0, 0, r], 1, [0.05, 0.05, 0.05]);
    this.xEyes = new Node('olhosX'); this.xEyes.mesh = mesh(this.R, xg); this.xEyes.visible = false; head.add(this.xEyes);
    // estrelinhas girando
    const sg = new Geo();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; sg.put(sphere(0.035, 6, 4), [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], [0, 0, 0], [1, 0.4, 1], [1, 0.9, 0.2]); }
    this.stars = new Node('estrelas'); this.stars.mesh = mesh(this.R, sg, { emissive: [1, 0.85, 0.2], glow: 1.5, castShadow: false }); this.stars.at(0, 0.32, 0); this.stars.visible = false; head.add(this.stars);
    // ---------- braços
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = bone('ombro', s * 0.215, 0.17, 0); chest.add(sh);
      const ug = new Geo();
      ug.put(sphere(0.075, 14, 10), [0, 0, 0], [0, 0, 0], 1, jacket);
      ug.put(capsule(0.062, 0.18, 14, 5), [0, -0.13, 0], [0, 0, 0], 1, jacket);
      sh.mesh = mesh(this.R, ug, { rough: 0.85, kind: MAT.TECIDO });
      const el = bone('cotovelo', 0, -0.27, 0); sh.add(el);
      const fg = new Geo();
      fg.put(capsule(0.055, 0.16, 14, 5), [0, -0.11, 0], [0, 0, 0], 1, jacket);
      fg.put(torus(0.05, 0.018, 16, 6), [0, -0.21, 0], [0, 0, 0], 1, jacketDk); // punho
      el.mesh = mesh(this.R, fg, { rough: 0.85, kind: MAT.TECIDO });
      const hd = bone('mao', 0, -0.25, 0); el.add(hd);
      const hgg = new Geo();
      hgg.put(sphere(0.055, 14, 10), [0, -0.04, 0], [0, 0, 0], [0.85, 1, 0.65], glove);
      hgg.put(capsule(0.022, 0.05, 8, 3), [-s * 0.035, -0.035, 0.03], [0.6, 0, s * 0.6], 1, glove); // polegar
      for (let k = 0; k < 4; k++) hgg.put(capsule(0.016, 0.045, 6, 3), [-0.024 + k * 0.016, -0.1, 0.005], [0.2, 0, 0], 1, glove);
      hd.mesh = mesh(this.R, hgg, { rough: 0.9, kind: MAT.BORRACHA, texScale: 6 });
      const grip = bone('pegada', 0, -0.08, 0.02); hd.add(grip);
      this.arms.push({ sh, el, hd, grip, s });
    }
    this.handR = this.arms[1].grip; this.handL = this.arms[0].grip;
    // ---------- pernas
    this.legs = [];
    for (const s of [-1, 1]) {
      const th = bone('coxa', s * 0.095, -0.04, 0); hips.add(th);
      const tgg = new Geo();
      tgg.put(capsule(0.078, 0.26, 14, 5), [0, -0.2, 0], [0, 0, 0], 1, pants);
      tgg.put(rbox(0.07, 0.09, 0.03, 0.01), [s * 0.075, -0.2, 0.01], [0, 0, 0], 1, pants.map((c) => c * 0.8)); // bolso cargo
      th.mesh = mesh(this.R, tgg, { kind: MAT.TECIDO });
      const kn = bone('joelho', 0, -0.41, 0); th.add(kn);
      const sgg = new Geo();
      sgg.put(capsule(0.068, 0.24, 14, 5), [0, -0.17, 0], [0, 0, 0], 1, pants);
      sgg.put(sphere(0.06, 10, 8), [0, 0, 0.035], [0, 0, 0], [1, 1, 0.6], pants.map((c) => c * 0.85)); // joelheira
      // bota
      sgg.put(cylinder(0.075, 0.08, 0.14, 14), [0, -0.33, 0.0], [0, 0, 0], 1, boots);
      sgg.put(rbox(0.13, 0.08, 0.24, 0.035), [0, -0.39, 0.045], [0, 0, 0], 1, boots);
      sgg.put(rbox(0.135, 0.025, 0.25, 0.01), [0, -0.425, 0.045], [0, 0, 0], 1, [0.12, 0.1, 0.08]);
      sgg.put(torus(0.078, 0.012, 16, 4), [0, -0.27, 0], [0, 0, 0], 1, [0.6, 0.55, 0.45]);
      kn.mesh = mesh(this.R, sgg, { kind: MAT.TECIDO });
      this.legs.push({ th, kn, s });
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
    let hipsY = 0.92, hipsPitch = 0, hipsRoll = 0, spineP = 0, chestP = 0, chestY = 0, headP = 0, headY = 0;
    let thigh = [0, 0], knee = [0, 0], shP = [0, 0], shR = [0, 0], elb = [0, 0], shY = [0, 0];
    const mode = st.mode;
    if (mode === 'sub' || mode === 'guindaste') {
      // sentado pilotando
      hipsY = 0.5; thigh = [1.45, 1.45]; knee = [1.5, 1.5]; shP = [-0.7, -0.7]; elb = [-0.8, -0.8]; shR = [0.15, 0.15];
      spineP = -0.05;
    } else if (mode === 'nadando') {
      const s = Math.sin(this.t * 2.6);
      hipsPitch = 1.15; hipsY = 0.3; headP = -0.9;
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
      if (!st.grounded) { thigh = [0.7, 0.2]; knee = [1.2, 0.6]; shP = [-2.4, -2.4]; shR = [0.4, 0.4]; elb = [-0.3, -0.3]; }
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
    if (st.emote && !(st.atordoado > 0)) {
      const t = st.emote.t, w = Math.sin(t * 6), w2 = Math.sin(t * 3);
      switch (st.emote.i) {
        case 0: // joinha
          shP[1] = -1.25; elb[1] = -1.5; shR[1] = 0.2; headP = 0.12 * Math.sin(t * 5); spineP = 0.05; break;
        case 1: // dança: quadril balançando, braços alternando para cima
          hipsRoll = w2 * 0.12; hipsY = 0.9 + Math.abs(w) * 0.04; chestY = w2 * 0.35;
          shP = [-2.6 - w * 0.4, -1.0 + w * 0.6]; elb = [-0.6, -1.2]; shR = [0.35, 0.35]; knee = [0.25 + Math.max(0, w) * 0.3, 0.25 + Math.max(0, -w) * 0.3]; thigh = [0.12, 0.12]; break;
        case 2: // sentado no chão
          hipsY = 0.36; thigh = [1.45, 1.45]; knee = [1.7, 1.7]; shP = [-0.5, -0.5]; elb = [-0.9, -0.9]; shR = [0.15, 0.15]; spineP = 0.12; headP = 0.05 * w2; break;
        case 3: // aceno
          shP[1] = -2.75; shR[1] = 0.25 + w * 0.35; elb[1] = -0.35 + w * 0.25; headY = 0.15; break;
        case 4: // dança do robô
          chestY = Math.round(w2 * 2) / 2 * 0.5; shR = [1.4, 1.4]; elb = [-1.5 * (w > 0 ? 1 : 0.3), -1.5 * (w < 0 ? 1 : 0.3)]; shP = [-0.2, -0.2]; headY = -chestY * 0.6; knee = [0.2, 0.2]; break;
        case 5: { // breakdance: entra agachado (0,6 s) e vira de cabeça para baixo girando (headspin)
          if (t < 0.6) { hipsY = 0.55; knee = [1.6, 1.6]; thigh = [1.3, 1.3]; shP = [-0.9, -0.9]; elb = [-0.4, -0.4]; spineP = 0.5; break; }
          hipsPitch = Math.PI; hipsY = 0.93; spin = (t - 0.6) * 9;
          thigh = [0.5 + Math.sin(t * 9) * 0.25, -0.5 - Math.sin(t * 9) * 0.25]; knee = [0.15, 0.15];
          shP = [-2.9, -2.9]; shR = [0.55, 0.55]; elb = [-0.2, -0.2]; headP = 0.25; break;
        }
      }
    }
    // atordoado: cai mole de costas no chão (sem ficar "dançando" em pé); no ar, braços e pernas soltos
    const stun = st.atordoado > 0;
    this.caido = stun ? (this.caido || 0) + dt : 0;
    if (stun) {
      const noAr = st.grounded === false && mode === 'terra';
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
    this.hips.at(0, P('hy', hipsY, stun ? rQueda : r), 0);
    // giro do breakdance (direto, sem suavizar para não "desenrolar" o ângulo)
    this.hips.rot(P('hp', hipsPitch, stun ? rQueda : st.emote?.i === 5 ? 10 : 8), spin, P('hr', hipsRoll, r));
    this.spine.rot(P('sp', spineP, r), P('cy', chestY, r) * 0.5, 0);
    this.chest.rot(P('cp', chestP, r), P('cy2', chestY, r) * 0.5, 0);
    this.head.rot(P('hdp', headP, r), P('hdy', headY, r), 0);
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      L.th.rot(-P('th' + i, thigh[i], r), 0, 0);
      L.kn.rot(P('kn' + i, knee[i], r), 0, 0);
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
