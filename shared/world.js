// ABISMO DE SUCATA — geografia compartilhada (cliente + servidor).
// Unidades: metros. Superfície da água em y = 0. Centro do lago em (0, 0).
// Tudo aqui é determinístico: o servidor usa as mesmas funções para validar
// posições, gerar sucata no fundo e checar colisões.

export const WATER_Y = 0;
export const LAKE_R = 75;           // raio da linha d'água (lago ~150 m de diâmetro: amigos ficam perto)
export const SLIDE_R = LAKE_R + 76;  // a partir daqui a encosta é íngreme: o personagem escorrega sentado de volta
export const PLAY_R = LAKE_R + 100; // parede invisível de segurança (mais acima da encosta)
export const SHAFT_C = { x: 4, z: -3 }; // centro da fenda
// distâncias radiais das partes de cada estação
export const PAD_R = LAKE_R + 36, DOCK_END_R = LAKE_R - 19, DOCK_ROOT_R = LAKE_R + 9, CRADLE_R = LAKE_R + 18, LAUNCH_R = LAKE_R - 13;

// ---------- ruído determinístico ----------
function hash3(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 1440662683) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
const fade = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1; // [-1, 1]
}
export function fbm2(x, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, 0.37 * i, z * f); a *= 0.5; f *= 2.03; }
  return s;
}
export function ridge2(x, z, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(noise3(x * f, 11.1 + i, z * f))); a *= 0.5; f *= 2.1; }
  return s;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---------- estações ----------
// Cada estação fica na margem; o cais aponta para o centro do lago.
// 5 vagas espaçadas igualmente (72°). Ocupadas em sequência: com 2 jogadores, as estações ficam vizinhas.
export const STATIONS = [
  { id: 'N', nome: 'Estação Norte' },
  { id: 'L', nome: 'Estação Leste' },
  { id: 'SE', nome: 'Estação Sudeste' },
  { id: 'SO', nome: 'Estação Sudoeste' },
  { id: 'O', nome: 'Estação Oeste' },
].map((s, i) => ({ ...s, ang: -Math.PI / 2 + (i * 2 * Math.PI) / 5 })).map((s) => {
  const dx = Math.cos(s.ang), dz = Math.sin(s.ang);
  return {
    ...s,
    dir: [dx, dz],                       // aponta do centro para fora
    pad: [dx * PAD_R, dz * PAD_R],             // centro da plataforma em terra
    dockEnd: [dx * DOCK_END_R, dz * DOCK_END_R], // ponta do cais (sobre a água)
    dockRoot: [dx * DOCK_ROOT_R, dz * DOCK_ROOT_R],
    cradle: [dx * CRADLE_R, dz * CRADLE_R],    // berço do submarino em terra (sob o guindaste)
    launch: [dx * LAUNCH_R, dz * LAUNCH_R],    // ponto onde o guincho baixa o sub na água
    padY: 1.6,
  };
});
export function stationById(id) { return STATIONS.find((s) => s.id === id); }
// coordenadas locais da estação (+z aponta para o lago) → mundo (mesma conta do cliente)
export function estacaoParaMundo(st, x, z) {
  const yaw = Math.atan2(-st.dir[0], -st.dir[1]), c = Math.cos(yaw), s = Math.sin(yaw);
  return [st.pad[0] + x * c + z * s, st.pad[1] - x * s + z * c];
}
// estátua (base grande) entre a estação de quem criou a sala (Norte) e a Leste
export const ESTATUA_RAIO_BASE = 8.8; // raio da praça da estátua (× escala)
export const ESTATUA = { x: Math.cos(-0.3 * Math.PI) * (LAKE_R + 42), z: Math.sin(-0.3 * Math.PI) * (LAKE_R + 42), y: 1.45, escala: 1.3 };
// altura do chão da praça da estátua (degraus com rampinha, para ninguém tropeçar); null fora da praça
export function chaoEstatua(x, z) {
  const S = ESTATUA.escala, d = Math.hypot(x - ESTATUA.x, z - ESTATUA.z) / S;
  if (d > 8.8) return null;
  const deg = (r, h0, h1) => (d < r - 0.35 ? h1 : d > r + 0.35 ? h0 : h0 + (h1 - h0) * ((r + 0.35 - d) / 0.7));
  let h = deg(8.6, 0, 0.25);
  if (d < 5.65) h = deg(5.3, 0.25, 0.65);
  if (d < 4.65) h = deg(4.3, 0.65, 1.05);
  return ESTATUA.y + h * S;
}
// barraca de armas: posição local na estação (ao lado da casinha de tinta)
export const BARRACA_ARMAS = { x: 13.6, z: -2.4 };
// barraca da corrida de submarino, ao lado da loja de armas (coordenadas locais da estação)
export const BARRACA_CORRIDA = { x: 13.6, z: -7.3 };
// bancada de peixe (onde ficava a recicladora) e bancada de restauro, em coordenadas locais da estação
export const BANCADA_PEIXE = { x: -14, z: 10 };

// ---------- terreno ----------
function stationFlatten(x, z) {
  // devolve [peso, altura] para achatar a área de cada estação e do caminho de margem
  let w = 0;
  for (const s of STATIONS) {
    // plataforma retangular aproximada em coordenadas locais da estação
    const lx = x - s.pad[0], lz = z - s.pad[1];
    const along = lx * s.dir[0] + lz * s.dir[1];
    const side = -lx * s.dir[1] + lz * s.dir[0];
    const d = Math.max(Math.abs(side) - 26, Math.abs(along) - 26, 0);
    const wi = 1 - smooth(0, 12, d);
    if (wi > w) w = wi;
  }
  // praça da estátua
  const de = Math.hypot(x - ESTATUA.x, z - ESTATUA.z);
  const we = 1 - smooth(12, 20, de);
  if (we > w) w = we;
  return w;
}

// funil: o fundo do lago desce em cone, sem paredes, até a boca da fenda (raio 33 m a 110 m de profundidade)
export const FUNIL = { rBoca: 33, rFora: 76, yBoca: -110, yFora: 0.5 };
export function funilAltura(dS) {
  if (dS >= FUNIL.rBoca) { const u = Math.min(1, (dS - FUNIL.rBoca) / (FUNIL.rFora - FUNIL.rBoca)); return FUNIL.yBoca + (FUNIL.yFora - FUNIL.yBoca) * (1 - Math.pow(1 - u, 1.5)); }
  return FUNIL.yBoca - (FUNIL.rBoca - dS) * 8; // continua caindo por dentro da boca (sem fresta com a parede da fenda)
}
function smin(a, b, k) { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const n = fbm2(x * 0.012, z * 0.012, 4);
  let h;
  if (r < LAKE_R) {
    const t = clamp((LAKE_R - r) / (LAKE_R * 0.62), 0, 1);
    const prof = 0.35 * t + 0.65 * t * t * (3 - 2 * t);
    h = -100 * prof + n * (2.2 + 6 * t) + 0.3;
    // bancos de areia/rochas no raso
    h += ridge2(x * 0.03, z * 0.03, 3) * 2.0 * (1 - t) * t * 4;
    const dS = Math.hypot(x - SHAFT_C.x, z - SHAFT_C.z);
    if (dS < FUNIL.rFora) {
      // perto da margem o funil some aos poucos (a beira do lago continua rasa e suave)
      const hf = smin(h, funilAltura(dS), 6), m = smooth(LAKE_R - 16, LAKE_R - 3, r);
      h = hf * (1 - m) + h * m;
    }
  } else {
    const shore = (r - LAKE_R);
    h = 0.5 + shore * 0.035 + n * 0.9;
    // morros, barrancos e montanhas além da área jogável
    const rid = ridge2(x * 0.006, z * 0.006, 5);
    h += smooth(LAKE_R + 68, LAKE_R + 130, r) * (16 + 14 * rid);
    // barranco íngreme: quem sobe até aqui escorrega de volta (ver SLIDE_R)
    h += smooth(LAKE_R + 72, LAKE_R + 98, r) * 20;
    h += smooth(LAKE_R + 110, LAKE_R + 240, r) * (80 + 70 * rid + 25 * n);
    h += smooth(LAKE_R + 220, LAKE_R + 460, r) * (120 + 140 * rid);
  }
  // achatamento das estações (e um pouco do caminho)
  const fw = stationFlatten(x, z);
  if (fw > 0) h = h * (1 - fw) + 1.45 * fw;
  // caminho de margem (anel) levemente nivelado
  if (r > LAKE_R + 3 && r < LAKE_R + 72) {
    const pathW = 1 - smooth(0, 5, Math.abs(r - (LAKE_R + 52)));
    h = h * (1 - pathW * 0.6) + (0.9 + (r - LAKE_R) * 0.02) * pathW * 0.6;
  }
  return h;
}

export function terrainNormal(x, z) {
  const e = 0.75;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

// ---------- fenda abissal (segmentos cilíndricos empilhados) ----------
// Cada segmento: yTop, yBot, raio no topo e no fundo, amplitude de rugosidade.
export const SHAFT_SEGS = [
  { id: 'naufragios', yTop: -110, yBot: -500, r0: 33, r1: 31, amp: 2.6 },
  { id: 'escuridao', yTop: -500, yBot: -1500, r0: 24, r1: 23, amp: 2.2 },
  { id: 'fenda', yTop: -1500, yBot: -4000, r0: 17, r1: 15, amp: 1.8 },
  { id: 'misterio', yTop: -3990, yBot: -4300, r0: 60, r1: 60, amp: 3 },
];
export const ABYSS_BOTTOM = -4300;

export function shaftRadius(seg, y, ang) {
  const t = clamp((seg.yTop - y) / (seg.yTop - seg.yBot), 0, 1);
  let R = seg.r0 + (seg.r1 - seg.r0) * t;
  const cx = Math.cos(ang) * 4, cz = Math.sin(ang) * 4;
  // na boca (encontro com o funil) a parede é um círculo exato; a irregularidade aparece mais para baixo
  const amp = seg.amp * (seg.id === 'naufragios' ? clamp((seg.yTop - y) / 40, 0, 1) : 1);
  R += noise3(cx, y * 0.035, cz) * amp + noise3(cx * 2.7, y * 0.11, cz * 2.7) * amp * 0.35;
  if (seg.id === 'misterio') {
    // cúpula: o teto da câmara fecha suavemente
    const k = clamp((y - (seg.yTop - 120)) / 120, 0, 1);
    R = R * (1 - 0.55 * k * k);
  }
  return R;
}

function segSDF(seg, x, y, z) {
  const dx = x - SHAFT_C.x, dz = z - SHAFT_C.z;
  const rr = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const R = shaftRadius(seg, clamp(y, seg.yBot, seg.yTop), ang);
  return Math.min(R - rr, seg.yTop - y, y - seg.yBot);
}

// ---------- cavernas laterais (túneis em cápsula) ----------
function capsuleCave(id, nome, ang, y, len, rad, rise = 0) {
  const seg = SHAFT_SEGS.find((s) => y <= s.yTop && y >= s.yBot);
  const R0 = (seg ? (seg.r0 + seg.r1) / 2 : 80) - 10;
  const c = Math.cos(ang), s = Math.sin(ang);
  const a = [SHAFT_C.x + c * R0, y, SHAFT_C.z + s * R0];
  const b = [SHAFT_C.x + c * (R0 + len), y + rise, SHAFT_C.z + s * (R0 + len)];
  return { id, nome, a, b, r: rad };
}
export const CAVES = [
  capsuleCave('caverna_eco', 'Caverna do Eco', 0.6, -330, 70, 9, -12),
  capsuleCave('tunel_ferrugem', 'Túnel da Ferrugem', 2.6, -1120, 85, 8, 18),
  capsuleCave('galeria_cristal', 'Galeria de Cristal', -1.9, -2650, 95, 9, -20),
];
// > 0 dentro de alguma caverna (com folga): usado para abrir a boca das cavernas na parede da fenda
export function insideCave(x, y, z, folga = 0) {
  for (const c of CAVES) if (capSDF(c, x, y, z) > -folga) return true;
  return false;
}
function capSDF(c, x, y, z) {
  const ab = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
  const ap = [x - c.a[0], y - c.a[1], z - c.a[2]];
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1);
  const q = [c.a[0] + ab[0] * t - x, c.a[1] + ab[1] * t - y, c.a[2] + ab[2] * t - z];
  return c.r - Math.hypot(q[0], q[1], q[2]);
}

// ---------- obstáculos sólidos (rochas, cascos de navio) ----------
// Gerados de forma determinística; o cliente desenha os mesmos.
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
export function makeRng(seed) { return rng(seed); }

export const ROCKS = (() => {
  const r = rng(1337); const out = [];
  for (let i = 0; i < 50; i++) {
    const ang = r() * Math.PI * 2; const rad = 34 + r() * (LAKE_R - 38);
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    // evita a frente dos cais
    let nearDock = false;
    for (const s of STATIONS) if (Math.hypot(x - s.launch[0], z - s.launch[1]) < 22 || Math.hypot(x - s.dockEnd[0], z - s.dockEnd[1]) < 14) nearDock = true;
    if (nearDock || Math.hypot(x - SHAFT_C.x, z - SHAFT_C.z) < 38) continue;
    const size = 1.5 + r() * r() * 7;
    const y = terrainHeight(x, z) + size * 0.35;
    out.push({ x, y, z, r: size, seed: (r() * 1e9) | 0 });
  }
  return out;
})();

// pedras da margem (metade na água, metade em terra) — mesmas no servidor e no navegador, com colisão
export const PEDRAS_MARGEM = (() => {
  const rnd = rng(4242); const out = [];
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = LAKE_R - 6 + rnd() * 16;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let skip = false;
    for (const s of STATIONS) if (Math.hypot(x - s.dockRoot[0], z - s.dockRoot[1]) < 24) skip = true;
    const s = 0.25 + rnd() * rnd() * 1.6;
    const rx = rnd(), ry = rnd() * 6, t0 = 0.95 + rnd() * 0.1, t1 = 0.95 + rnd() * 0.1;
    if (skip) continue;
    out.push({ x, y: terrainHeight(x, z) + s * 0.2, z, r: s, rx, ry, tint: [t0, t1] });
  }
  return out;
})();

// colisão a pé/nadando com as pedras (lago e margem): empurra para fora; pedrinhas pequenas dá para pisar
export function colidirPedras(pos, raioCorpo = 0.35) {
  for (const lista of [ROCHAS_COLISAO()]) for (const k of lista) {
    const dx = pos[0] - k.x, dz = pos[2] - k.z;
    const R = k.rh + raioCorpo;
    if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
    if (pos[1] > k.topo - 0.25 || pos[1] < k.y - k.rv - 1.8) continue; // por cima ou por baixo
    const d = Math.hypot(dx, dz) || 0.001;
    if (d < R) { pos[0] = k.x + (dx / d) * R; pos[2] = k.z + (dz / d) * R; }
  }
  return pos;
}
let _rochasCol = null;
function ROCHAS_COLISAO() {
  if (_rochasCol) return _rochasCol;
  _rochasCol = [];
  for (const k of ROCKS) _rochasCol.push({ x: k.x, z: k.z, y: k.y, rh: k.r * 1.0, rv: k.r * 0.85, topo: k.y + k.r * 0.85 });
  for (const k of PEDRAS_MARGEM) if (k.r > 0.45) _rochasCol.push({ x: k.x, z: k.z, y: k.y, rh: k.r * 0.9, rv: k.r * 0.7, topo: k.y + k.r * 0.7 });
  return _rochasCol;
}

export const WRECKS = [
  // barcos afundados na bacia e nos patamares da fenda
  { id: 'traineira', nome: 'Traineira Esperança', x: -38, z: 30, rot: 0.7, len: 16, w: 4.2, kind: 'barco' },
  { id: 'balsa', nome: 'Balsa do Vô Tião', x: 38, z: 40, rot: -0.4, len: 12, w: 5, kind: 'balsa' },
  { id: 'rebocador', nome: 'Rebocador Bravo', x: SHAFT_C.x + 25, z: SHAFT_C.z + 12, y: -500, rot: 2.0, len: 20, w: 5.5, kind: 'barco' },
  { id: 'batiscafo', nome: 'Batiscafo Netuno-3', x: SHAFT_C.x - 22, z: SHAFT_C.z + 26, y: -4300, rot: 0.2, len: 9, w: 3, kind: 'batiscafo' },
].map((w) => ({ ...w, y: w.y ?? terrainHeight(w.x, w.z) + 0.5 }));

function wreckSDF(w, x, y, z) {
  // casco aproximado por uma cápsula achatada (devolve positivo FORA do sólido)
  const c = Math.cos(w.rot), s = Math.sin(w.rot);
  const half = w.len / 2 - w.w / 2;
  const a = [w.x - c * half, w.y + w.w * 0.35, w.z - s * half];
  const b = [w.x + c * half, w.y + w.w * 0.35, w.z + s * half];
  return -capSDF({ a, b, r: w.w * 0.55 }, x, y, z);
}

// ---------- SDF do volume navegável ----------
// > 0 : ponto está em água livre (ou ar acima do lago), em metros até a parede mais próxima.
// < 0 : dentro de rocha/terreno.
export function navSDF(x, y, z) {
  // bacia: distância ao fundo. No funil (encosta íngreme) corrige pela inclinação para o submarino não entrar na parede
  const th = terrainHeight(x, z);
  let d = (y - th) * 0.8;
  const dS0 = Math.hypot(x - SHAFT_C.x, z - SHAFT_C.z);
  if (dS0 < FUNIL.rFora + 4 && dS0 > 1 && Math.hypot(x, z) < LAKE_R) {
    const ux = (x - SHAFT_C.x) / dS0, uz = (z - SHAFT_C.z) / dS0;
    const s = (terrainHeight(x + ux * 0.7, z + uz * 0.7) - terrainHeight(x - ux * 0.7, z - uz * 0.7)) / 1.4;
    d = (y - th) / Math.sqrt(1 + s * s) * 0.95;
  }
  if (y < -100) {
    const dx = x - SHAFT_C.x, dz = z - SHAFT_C.z;
    if (Math.hypot(dx, dz) < 70) {
      for (const seg of SHAFT_SEGS) {
        if (y > seg.yTop + 20 || y < seg.yBot - 20) continue;
        d = Math.max(d, segSDF(seg, x, y, z));
      }
    }
    for (const c of CAVES) if (Math.abs(y - c.a[1]) < 60) d = Math.max(d, capSDF(c, x, y, z));
  }
  if (y > -130) {
    // pedras do lago: elipsoide do tamanho do modelo (com as saliências)
    for (const k of ROCKS) {
      if (Math.abs(x - k.x) > k.r * 1.4 + 6 || Math.abs(z - k.z) > k.r * 1.4 + 6) continue;
      const rh = k.r * 1.3, rv = k.r * 1.08;
      const q = Math.hypot((x - k.x) / rh, (y - k.y) / rv, (z - k.z) / rh);
      d = Math.min(d, (q - 1) * rv);
    }
    if (y > -12) for (const k of PEDRAS_MARGEM) {
      if (k.r < 0.6 || Math.abs(x - k.x) > k.r + 5 || Math.abs(z - k.z) > k.r + 5) continue;
      const q = Math.hypot((x - k.x) / (k.r * 1.25), (y - k.y) / (k.r * 0.9), (z - k.z) / (k.r * 1.25));
      d = Math.min(d, (q - 1) * k.r * 0.9);
    }
  }
  for (const w of WRECKS) {
    if (Math.abs(x - w.x) > w.len + 4 || Math.abs(z - w.z) > w.len + 4 || Math.abs(y - w.y) > w.len) continue;
    d = Math.min(d, wreckSDF(w, x, y, z));
  }
  return d;
}

export function navGrad(x, y, z) {
  const e = 0.4;
  const gx = navSDF(x + e, y, z) - navSDF(x - e, y, z);
  const gy = navSDF(x, y + e, z) - navSDF(x, y - e, z);
  const gz = navSDF(x, y, z + e) - navSDF(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// zona de profundidade (etapas ficcionais)
export const DEPTH_ZONES = [
  { id: 'raso', nome: 'Águas Rasas', min: 0, max: 100 },
  { id: 'naufragios', nome: 'Cemitério de Naufrágios', min: 100, max: 500 },
  { id: 'escuridao', nome: 'Escuridão', min: 500, max: 1500 },
  { id: 'fenda', nome: 'Fenda Abissal', min: 1500, max: 4000 },
  { id: 'misterio', nome: 'Câmara do Mistério', min: 4000, max: 99999 },
];
export function depthZone(depth) {
  return DEPTH_ZONES.find((z) => depth >= z.min && depth < z.max) || DEPTH_ZONES[0];
}

// ponto do fundo navegável onde a sucata pode repousar
export function shelfSpots() {
  // patamares da fenda (onde o segmento estreita) — o sólido de baixo forma um "chão" anelar
  return [
    { y: -500, rIn: 25, rOut: 30 },
    { y: -1500, rIn: 18, rOut: 22 },
    { y: -4300, rIn: 0, rOut: 55 },
  ];
}

// relógio do dia: 1 dia de jogo = 24 min reais
export const DAY_LENGTH_S = 24 * 60;
export function hourOfDay(worldTimeS) { return ((worldTimeS / DAY_LENGTH_S) * 24 + 7) % 24; }
export function isNight(h) { return h < 5.5 || h >= 19; }

// alcance do chat de voz: 3 vezes a base inteira da estátua (≈ 69 m). Longe das outras estações.
export const VOZ_ALCANCE = 3 * 2 * ESTATUA_RAIO_BASE * ESTATUA.escala;

// caminho do Kraken (determinístico: servidor e clientes calculam igual a partir do tempo desde que surgiu)
// dá voltas no meio do lago e passa perto da ponta dos píeres (raio 56)
export function krakenPos(t, a0 = 0) {
  const ang = a0 + t * 0.16;
  const r = 34 + 13 * Math.sin(t * 0.47 + a0 * 2);
  const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
  // direção para onde está nadando
  const ang2 = a0 + (t + 0.2) * 0.16, r2 = 34 + 13 * Math.sin((t + 0.2) * 0.47 + a0 * 2);
  const yaw = Math.atan2(Math.cos(ang2) * r2 - x, Math.sin(ang2) * r2 - z);
  // sobe do fundo nos 3 primeiros segundos e afunda nos 3 últimos
  return { pos: [x, 0, z], yaw };
}

// caminho do tubarão: ronda a frente dos píeres (raio 44–56), indo e voltando em volta do lago, sem padrão fixo
export function tubaraoPos(t, a0 = 0) {
  const ang = a0 + t * 0.03 + 0.22 * Math.sin(t * 0.07 + a0) + 0.05 * Math.sin(t * 0.23);
  const r = 48 + 4.5 * Math.sin(t * 0.11 + a0 * 3) + 1 * Math.sin(t * 0.5);
  const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
  const t2 = t + 0.25;
  const ang2 = a0 + t2 * 0.03 + 0.22 * Math.sin(t2 * 0.07 + a0) + 0.05 * Math.sin(t2 * 0.23);
  const r2 = 48 + 4.5 * Math.sin(t2 * 0.11 + a0 * 3) + 1 * Math.sin(t2 * 0.5);
  return { pos: [x, -0.35, z], yaw: Math.atan2(Math.cos(ang2) * r2 - x, Math.sin(ang2) * r2 - z) };
}
