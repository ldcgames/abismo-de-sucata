// Liga o modelo do pescador (malha com textura + pesos de pele) ao esqueleto do personagem.
// O esqueleto continua o mesmo (quadril, coluna, peito, pescoço, cabeça, braços e pernas): as animações
// procedurais giram os ossos e a malha deforma junto (skinning na GPU).
import { Node } from '../engine/renderer.js';
import { PESCADOR, PESCADOR_GEO, PESCADOR_TEX, PESCADOR_MASC } from './pescador_dados.js';

let geoCache = null;
const imgs = {};

function decodificar() {
  if (geoCache) return geoCache;
  const bin = atob(PESCADOR_GEO), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const nv = PESCADOR.nv, nt = PESCADOR.nt, buf = u8.buffer;
  let o = 0;
  o += nv * 6;
  const Nq = new Int8Array(buf, o, nv * 3); o += nv * 3;
  const UVq = new Uint16Array(buf.slice(o, o + nv * 4)); o += nv * 4;
  const Jq = new Uint8Array(buf, o, nv * 4); o += nv * 4;
  const Wq = new Uint8Array(buf, o, nv * 4); o += nv * 4;
  const Iq = new Uint32Array(buf.slice(o, o + nt * 12));
  const Pi = new Int16Array(buf.slice(0, nv * 6));
  const p = new Float32Array(nv * 3), n = new Float32Array(nv * 3), u = new Float32Array(nv * 4), c = new Float32Array(nv * 4).fill(1);
  const j = new Float32Array(nv * 4), w = new Float32Array(nv * 4);
  for (let k = 0; k < nv * 3; k++) { p[k] = Pi[k] / 4096; n[k] = Nq[k] / 127; }
  for (let k = 0; k < nv; k++) { u[k * 4] = UVq[k * 2] / 65535; u[k * 4 + 1] = UVq[k * 2 + 1] / 65535; }
  for (let k = 0; k < nv * 4; k++) { j[k] = Jq[k]; w[k] = Wq[k] / 255; }
  geoCache = { p, n, u, c, j, w, i: Iq, bounds: () => ({ center: [0, 0.8, 0], radius: 1.4 }) };
  return geoCache;
}

// carrega uma imagem uma vez só e vira textura (compartilhada por todos os pescadores)
function textura(R, src, aoCarregar) {
  let e = imgs[src];
  if (!e) {
    e = imgs[src] = { tex: null, fila: [] };
    const img = new Image();
    img.onload = () => { e.tex = R.texture(img); for (const f of e.fila.splice(0)) f(e.tex); };
    img.src = src;
  }
  if (e.tex) aoCarregar(e.tex); else e.fila.push(aoCarregar);
}

// troca a aparência do Character pelo pescador
export function vestirPescador(ch, R, corCamisa = null) {
  const J = PESCADOR.juntas;
  const sub = (a, b) => [J[a][0] - (b ? J[b][0] : 0), J[a][1] - (b ? J[b][1] : 0), J[a][2] - (b ? J[b][2] : 0)];
  const set = (no, v) => no.at(v[0], v[1], v[2]);
  set(ch.hips, [0, J.hips[1], 0]);
  set(ch.spine, sub('spine', 'hips')); set(ch.chest, sub('chest', 'spine')); set(ch.neck, sub('neck', 'chest')); set(ch.head, sub('head', 'neck'));
  ch.head.sc(1);
  const lados = [['L', 0], ['R', 1]];
  for (const [l, i] of lados) {
    const A = ch.arms[i], Lg = ch.legs[i];
    set(A.sh, sub('sh' + l, 'chest')); set(A.el, sub('el' + l, 'sh' + l)); set(A.hd, sub('hd' + l, 'el' + l));
    A.grip.at(0, -0.075, 0.03);
    set(Lg.th, sub('th' + l, 'hips')); set(Lg.kn, sub('kn' + l, 'th' + l)); set(Lg.an, sub('an' + l, 'kn' + l));
  }
  // esconde a malha procedural (o esqueleto fica)
  for (const no of [ch.hips, ch.chest, ch.head, ...ch.arms.flatMap((a) => [a.sh, a.el, a.hd]), ...ch.legs.flatMap((l) => [l.th, l.kn, l.an])]) no.mesh = null;
  ch.xEyes.visible = false; ch.xEyes.mesh = null;
  ch.stars.at(0, 0.42, 0);
  ch.cadeira.sc([1.65, 0.55, 1.25]); ch.cadeira.at(0, 0, -0.1);
  // mandíbula: abre e fecha a boca quando a pessoa fala no chat de voz
  ch.jaw = new Node('mandibula'); set(ch.jaw, sub('jaw', 'head')); ch.head.add(ch.jaw);
  // ajustes de animação para o corpo dele (pernas curtas, barrigão e boia)
  ch.kPasso = 0.56; ch.bracoAbre = 0.07; ch.kBraco = 0.5; ch.gordinho = true; ch.sentaY = 0.35; ch.escalaArma = 1.85;
  ch.kQuadril = J.hips[1] / 0.92;
  // malha com pele
  const geo = decodificar();
  const pele = new Node('pescador');
  // dupla face: a malha gerada por IA tem triângulos virados para dentro em alguns pontos (pareciam furos)
  pele.mesh = R.createMesh(geo, { rough: 0.72, metal: 0, doubleSide: true, semFlip: true, tint: corCamisa });
  pele.mesh.center = [0, 0.8, 0]; pele.mesh.radius = 1.4;
  const ossos = [ch.hips, ch.spine, ch.chest, ch.neck, ch.head, ch.arms[0].sh, ch.arms[0].el, ch.arms[0].hd, ch.arms[1].sh, ch.arms[1].el, ch.arms[1].hd, ch.legs[0].th, ch.legs[0].kn, ch.legs[0].an, ch.legs[1].th, ch.legs[1].kn, ch.legs[1].an, ch.jaw];
  const invBind = PESCADOR.ossos.map((k) => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = -J[k][0]; m[13] = -J[k][1]; m[14] = -J[k][2]; return m; });
  pele.skin = { bones: ossos, invBind };
  ch.root.add(pele);
  ch.pele = pele;
  textura(R, PESCADOR_TEX, (t) => { pele.mesh.mat.tex = t; });
  if (corCamisa) textura(R, PESCADOR_MASC, (t) => { pele.mesh.mat.mask = t; });
}
