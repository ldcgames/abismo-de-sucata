// ABISMO DE SUCATA — regras autoritativas.
// Este módulo roda no SERVIDOR (multiplayer) e também no "servidor local" do navegador (modo solo).
// O cliente nunca altera dinheiro, inventário ou estado de outro jogador diretamente: envia ações,
// e estas funções validam (distância, saldo, capacidade, cooldown) e devolvem eventos.

import {
  SUCATA, RESTAURO, ESPECIES, SUB_UP, VARA, PESADO, AQUARIOS, TANQUES, CAIXA_TERMICA, ESTACAO, DEPOSITO,
  EXTRAS, CONTRATOS, TROLL, PERFIL_VERSAO, massaPeixe, valorPeixe, ENERGIA, MOCHILA,
  ARMAS, ARMAS_ORDEM, MUNICAO_MAX, ESTATUA_PECAS, LIXO, MISSOES, SUB_ORDEM, SUCATA_RESPAWN_S, KRAKEN, TUBARAO, RENDA_AQUARIO, PEIXARIA, EQUIP, capPeixes, capSaco, VEICULOS, valorItem, nomeItem, valorPeixeItem,
} from './data.js';
import {
  STATIONS, stationById, terrainHeight, navSDF, SHAFT_C, SHAFT_SEGS, shaftRadius, CAVES, WRECKS,
  makeRng, LAKE_R, SLIDE_R, hourOfDay, isNight, ESTATUA, BARRACA_ARMAS, krakenPos, tubaraoPos, BANCADA_PEIXE, estacaoParaMundo,
} from './world.js';

// ------------------------------------------------------------------ util
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function uid(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 12; i++) s += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 31)];
  return s;
}
const fail = (msg, extra = {}) => ({ ok: false, msg, events: [], ...extra });
const okR = (msg, events = [], extra = {}) => ({ ok: true, msg, events, ...extra });

// ------------------------------------------------------------------ perfil
function newProfileBase(id, nome = 'Explorador') {
  return {
    v: PERFIL_VERSAO,
    id,
    nome: String(nome).slice(0, 18),
    cor: 0,
    dinheiro: 120,
    xp: 0,
    comps: { metal: 0, cobre: 0, borracha: 0, eletronica: 0, vidro: 0, cristal: 0 },
    sub: { casco: 1, propulsor: 1, bateria: 1, farol: 1, sonar: 1, braco: 1, carga: 1, oxigenio: 1 },
    vara: 1,
    pesado: false,
    extras: { lancador: true, luvas: false },   // todo submarino já vem com o lançador de bolsas
    // a casinha de fabricar bolsas (tinta) já vem pronta
    estacao: { reciclador: false, restauro: false, tinta: true, iluminacao: false, carregador: false, decoracao: false, deposito: 0 },
    slotPreferido: 'N',
    carga: [],          // itens dentro do submarino [{uid, tipo}]
    deposito: [],       // itens guardados na estação
    mao: null,          // peixe na mão {uid, esp, cm}
    equip: { saco: 0, bolsa: 0, traje: 0 }, // saco de lixo, bolsa de peixes, traje de mergulho
    veiculos: { tem: ['patinete'], eq: 'patinete' }, // garagem: comprados e o equipado
    lixoMao: null,      // lixo catado na mão {uid, tipo}: E guarda no saco · Q joga com o estilingue
    mochila: [],        // até 5 peixes guardados (para arremessar ou vender depois)
    peixaria: null,     // peixe na tábua da bancada de peixe { peixe, cortado }
    inventVer: 2,
    caixaTermica: [],   // peixes guardados temporariamente
    aquario: { nivel: 0, peixes: [] },
    tanque: { nivel: -1, peixes: [] },
    // v0.9.7: só UM aquário OU tanque fica na estação (o equipado). Os peixes moram nele.
    vitrine: { tipo: 'aquario', nivel: 0, peixes: [] },
    aquariosTem: [0], tanquesTem: [],
    baloes: 1,          // bolsas de tinta (começa com 1; máximo 10 na mochila)
    contratos: { ativos: [], concluidos: [] },
    saco: [],           // lixo catado na margem (garrafas PET, latinhas…)
    armas: {},          // armas compradas { pistola: true, … }
    municao: {},        // balas por arma
    estatua: { achadas: [], colocadas: [] }, // peças da estátua (cada jogador monta a sua)
    missoes: { ativas: [], concluidas: 0 }, // missões rápidas (sempre 3)
    descobertas: [],
    profMax: 0,
    recentes: [],       // ids de ações já aplicadas (anti-duplicação / replay)
    criadoEm: Date.now(),
  };
}
export function newProfile(id, nome) {
  const p = newProfileBase(id, nome);
  completarMissoes(p, Math.random, false);
  return p;
}

// ---------------- missões rápidas ----------------
export function premioMissao(p, base) { return Math.round((base * Math.min(6, 1 + 0.15 * (p.missoes?.concluidas || 0))) / 5) * 5; }
function novaMissao(p, rnd, multi) {
  const usados = new Set(p.missoes.ativas.map((m) => m.id));
  const pool = MISSOES.filter((m) => !usados.has(m.id) && (multi || !m.multi));
  const M = pool[Math.floor(rnd() * pool.length)] || MISSOES[0];
  let n = M.n[0] + Math.floor(rnd() * (M.n[1] - M.n[0] + 1));
  if (M.tipo === 'fundo') {
    // até onde o casco atual aguenta (com folga)
    const lim = subStats(p).maxProf;
    n = Math.max(20, Math.min(Math.round((lim * (0.45 + rnd() * 0.4)) / 10) * 10, 4000));
  }
  return { id: M.id, tipo: M.tipo, item: M.item || null, n, feito: 0, premio: premioMissao(p, M.base * (M.tipo === 'fundo' ? 1 + n / 400 : 1)), txt: M.txt.replace('{n}', n) };
}
export function completarMissoes(p, rnd = Math.random, multi = false) {
  while (p.missoes.ativas.length < 3) p.missoes.ativas.push(novaMissao(p, rnd, multi));
}
// avança as missões ativas; paga e troca as concluídas. Devolve eventos para avisar a sala.
export function avancarMissao(p, slot, tipo, item, qtd, ctx) {
  if (!p.missoes) return [];
  const ev = [];
  for (let i = 0; i < p.missoes.ativas.length; i++) {
    const m = p.missoes.ativas[i];
    if (m.tipo !== tipo) continue;
    if (tipo === 'coletar' && m.item && m.item !== item) continue;
    if (tipo === 'fundo') m.feito = Math.max(m.feito, Math.min(m.n, Math.round(qtd)));
    else m.feito = Math.min(m.n, m.feito + qtd);
    if (m.feito >= m.n) {
      p.dinheiro += m.premio; p.xp += 10; p.missoes.concluidas += 1;
      ev.push({ t: 'missao_ok', slot, txt: m.txt, premio: m.premio });
      p.missoes.ativas.splice(i, 1); i--;
    }
  }
  if (ev.length) completarMissoes(p, ctx?.rnd || Math.random, (ctx?.players?.size || 1) > 1);
  return ev;
}

export function migrateProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const base = newProfile(p.id, p.nome);
  const out = { ...base, ...p };
  out.comps = { ...base.comps, ...(p.comps || {}) };
  out.sub = { ...base.sub, ...(p.sub || {}) };
  out.extras = { ...base.extras, ...(p.extras || {}) };
  out.estacao = { ...base.estacao, ...(p.estacao || {}) };
  out.aquario = p.aquario || base.aquario;
  out.tanque = p.tanque || base.tanque;
  out.contratos = p.contratos || base.contratos;
  out.estacao.tinta = true; out.extras.lancador = true;
  // mochila virou lista (até 5 peixes)
  out.equip = { saco: Math.max(0, Math.min(EQUIP.saco.length - 1, p.equip?.saco | 0)), bolsa: Math.max(0, Math.min(EQUIP.bolsa.length - 1, p.equip?.bolsa | 0)), traje: Math.max(0, Math.min(EQUIP.traje.length - 1, p.equip?.traje | 0)) };
  { const tem = Array.isArray(p.veiculos?.tem) ? p.veiculos.tem.filter((k) => VEICULOS[k]) : [];
    if (!tem.includes('patinete')) tem.unshift('patinete');
    out.veiculos = { tem, eq: tem.includes(p.veiculos?.eq) ? p.veiculos.eq : 'patinete' }; }
  out.mochila = Array.isArray(p.mochila) ? p.mochila : p.mochila ? [p.mochila] : [];
  // v0.8: mais varas, aquários e tanques — converte os níveis antigos para os novos
  if ((p.inventVer || 1) < 2) {
    out.vara = { 1: 1, 2: 3, 3: 5, 4: 7 }[p.vara] || out.vara;
    if (out.aquario) out.aquario = { ...out.aquario, nivel: { 0: 0, 1: 3, 2: 6, 3: 7 }[out.aquario.nivel] ?? out.aquario.nivel };
    if (out.tanque) out.tanque = { ...out.tanque, nivel: { [-1]: -1, 0: 1, 1: 3 }[out.tanque.nivel] ?? out.tanque.nivel };
    out.inventVer = 2;
  }
  // v0.9.7: aquário e tanque viram uma vitrine só (a melhor que a pessoa tem fica equipada)
  if (!p.vitrine || !Array.isArray(p.vitrine.peixes)) {
    const aqN = out.aquario?.nivel ?? 0, tqN = out.tanque?.nivel ?? -1;
    out.aquariosTem = [...new Set([0, aqN])];
    out.tanquesTem = tqN >= 0 ? Array.from({ length: tqN + 1 }, (_, i) => i) : [];
    out.vitrine = tqN >= 0 ? { tipo: 'tanque', nivel: tqN, peixes: [] } : { tipo: 'aquario', nivel: aqN, peixes: [] };
    const sobra = [];
    for (const f of [...(out.tanque?.peixes || []), ...(out.aquario?.peixes || [])]) (cabeNoAquario(out, f) ? sobra : out.vitrine.peixes).push(f);
    for (const f of sobra) (out.mochila.length < capPeixes(out) ? out.mochila : out.caixaTermica).push(f);
    out.aquario = { nivel: aqN, peixes: [] }; out.tanque = { nivel: tqN, peixes: [] };
  }
  out.aquariosTem = Array.isArray(out.aquariosTem) ? out.aquariosTem : [0];
  out.tanquesTem = Array.isArray(out.tanquesTem) ? out.tanquesTem : [];
  out.saco = Array.isArray(p.saco) ? p.saco : [];
  out.peixaria = p.peixaria && p.peixaria.peixe && ESPECIES[p.peixaria.peixe.esp] ? p.peixaria : null;
  out.lixoMao = p.lixoMao && typeof p.lixoMao === 'object' && SUCATA[p.lixoMao.tipo]?.terra ? p.lixoMao : null;
  out.armas = p.armas && typeof p.armas === 'object' ? p.armas : {};
  out.municao = p.municao && typeof p.municao === 'object' ? p.municao : {};
  out.estatua = { achadas: [...(p.estatua?.achadas || [])], colocadas: [...(p.estatua?.colocadas || [])] };
  out.missoes = p.missoes && Array.isArray(p.missoes.ativas) ? p.missoes : { ativas: [], concluidas: 0 };
  completarMissoes(out, Math.random, false);
  out.v = PERFIL_VERSAO;
  return out;
}

// ------------------------------------------------------------------ parâmetros derivados
export function subStats(p) {
  const L = (k) => SUB_UP[k].niveis[p.sub[k] - 1];
  return {
    maxProf: L('casco').v,
    vel: L('propulsor').v,
    velVert: L('propulsor').vert,
    bateria: L('bateria').v,
    farol: L('farol').v,
    sonar: L('sonar').v,
    bracoKg: L('braco').v,
    alcance: L('braco').alcance,
    cargaKg: L('carga').v,
    cargaN: L('carga').n,
    cargaL: L('carga').L,
    oxigenio: L('oxigenio').v,
  };
}
export function varaStats(p) {
  const v = VARA[p.vara - 1];
  if (p.pesado) return { ...v, nome: v.nome + ' + equipamento pesado', maxCm: Math.max(v.maxCm, PESADO.maxCm), linhaKg: Math.max(v.linhaKg, PESADO.linhaKg), prof: Math.max(v.prof, PESADO.prof), pesado: true, freio: Math.max(v.freio || 0, 0.55) };
  return { ...v, pesado: !!v.pesado, freio: v.freio || 0 };
}
export function cargaUso(p) {
  let kg = 0, L = 0;
  for (const it of p.carga) { if (it.coop) continue; const t = SUCATA[it.tipo]; kg += t.kg; L += t.L; }
  return { kg, L };
}
// multiplicador de dinheiro: cada peça colocada na estátua aumenta (máximo 10×)
// quanto o jogador já evoluiu (0–100%): submarino, estátua, armas e missões
export function progresso(p) {
  let sub = 0;
  for (const k of SUB_ORDEM) { const n = SUB_UP[k].niveis.length; sub += ((p.sub?.[k] || 1) - 1) / Math.max(1, n - 1); }
  sub /= SUB_ORDEM.length;
  const est = (p.estatua?.colocadas?.length || 0) / ESTATUA_PECAS.length;
  const armas = Object.keys(p.armas || {}).length / ARMAS_ORDEM.length;
  const mis = Math.min(1, (p.missoes?.concluidas || 0) / 30);
  return Math.round((sub * 0.45 + est * 0.4 + armas * 0.1 + mis * 0.05) * 100);
}
export function multDinheiro(p) {
  let m = 1;
  for (const id of p.estatua?.colocadas || []) m += ESTATUA_PECAS.find((x) => x.id === id)?.mult || 0;
  return Math.round(Math.min(10, m) * 10) / 10;
}
export function estatuaCompleta(p) { return (p.estatua?.colocadas || []).length >= ESTATUA_PECAS.length; }
const comMult = (p, v) => Math.round(v * multDinheiro(p));
export function depositoVagas(p) { return DEPOSITO[p.estacao.deposito].vagas; }

function podePagar(p, custo) {
  if (!custo) return true;
  if ((custo.dinheiro || 0) > p.dinheiro) return false;
  for (const [k, n] of Object.entries(custo.comps || {})) if ((p.comps[k] || 0) < n) return false;
  return true;
}
function pagar(p, custo) {
  p.dinheiro -= custo.dinheiro || 0;
  for (const [k, n] of Object.entries(custo.comps || {})) p.comps[k] -= n;
}
export function faltando(p, custo) {
  const f = [];
  if (!custo) return f;
  if ((custo.dinheiro || 0) > p.dinheiro) f.push(`S$ ${custo.dinheiro - p.dinheiro}`);
  for (const [k, n] of Object.entries(custo.comps || {})) if ((p.comps[k] || 0) < n) f.push(`${n - (p.comps[k] || 0)} ${k}`);
  return f;
}
function receber(p, premio) {
  p.dinheiro += premio.dinheiro || 0;
  for (const [k, n] of Object.entries(premio.comps || {})) p.comps[k] = (p.comps[k] || 0) + n;
}

// ------------------------------------------------------------------ posição / contexto
export function stationOf(player) { return stationById(player.slot); }
export function estaNaEstacao(player) {
  const st = stationOf(player);
  if (!st) return false;
  const pad = [st.pad[0], 0, st.pad[1]];
  const dock = [st.dockEnd[0], 0, st.dockEnd[1]];
  if (player.modo === 'terra' || player.modo === 'nadando') {
    return d2(player.pos, pad) < 50 || d2(player.pos, dock) < 22;
  }
  if (player.modo === 'sub' || player.modo === 'guindaste') {
    const l = [st.launch[0], 0, st.launch[1]];
    return d2(player.sub.pos, l) < 30 && player.sub.pos[1] > -4;
  }
  return false;
}
export function emTerra(player) {
  if (player.modo !== 'terra') return false;
  const h = terrainHeight(player.pos[0], player.pos[2]);
  // em terra firme OU sobre o cais (cais fica acima da água)
  return player.pos[1] > -0.2 && (h > -0.3 || player.pos[1] > 0.6);
}

// ------------------------------------------------------------------ mundo da sala (sucata)
function randomBedSpot(rnd, zona) {
  // devolve [x,y,z] no fundo navegável dentro da faixa de profundidade
  const [pmin, pmax] = zona;
  for (let tent = 0; tent < 40; tent++) {
    const escolha = rnd();
    if (pmin < 100 && escolha < 0.75) {
      // bacia
      const ang = rnd() * Math.PI * 2, r = 18 + rnd() * (LAKE_R - 20);
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const y = terrainHeight(x, z);
      const prof = -y;
      if (prof < Math.max(3, pmin) || prof > pmax) continue;
      if (Math.hypot(x - SHAFT_C.x, z - SHAFT_C.z) < 36) continue;
      if (navSDF(x, y + 0.6, z) < 0.3) continue;
      return [x, y + 0.15, z];
    }
    // patamares da fenda / chão da câmara
    const shelves = [
      { y: -500, upper: SHAFT_SEGS[0], lower: SHAFT_SEGS[1] },
      { y: -1500, upper: SHAFT_SEGS[1], lower: SHAFT_SEGS[2] },
      { y: -4300, upper: SHAFT_SEGS[3], lower: null },
    ].filter((s) => -s.y >= pmin && -s.y <= pmax);
    if (!shelves.length) continue;
    const sh = shelves[Math.floor(rnd() * shelves.length)];
    const ang = rnd() * Math.PI * 2;
    const rOut = shaftRadius(sh.upper, sh.y + 0.5, ang) - 2.5;
    const rIn = sh.lower ? shaftRadius(sh.lower, sh.y - 0.5, ang) + 2.5 : 0;
    if (rOut <= rIn + 1) continue;
    const r = rIn + rnd() * (rOut - rIn);
    const x = SHAFT_C.x + Math.cos(ang) * r, z = SHAFT_C.z + Math.sin(ang) * r;
    const y = sh.y + 0.2;
    if (navSDF(x, y + 0.8, z) < 0.3) continue;
    return [x, y, z];
  }
  return null;
}

export function createWorld(seed = 1) {
  const rnd = makeRng(seed);
  const w = { seed, items: {}, seq: 0, respawn: [], projeteis: [], pseq: 0, kraken: { vivo: false, proximo: 0, hp: 0 }, tubarao: { vivo: false, proximo: 0, hp: 0 }, carcacas: {}, cseq: 0 };
  const tipos = Object.entries(SUCATA).filter(([, t]) => t.zona);
  const sorteia = (prof) => {
    const cand = tipos.filter(([, t]) => prof >= t.zona[0] && prof <= t.zona[1]);
    const tot = cand.reduce((s, [, t]) => s + t.peso, 0);
    let x = rnd() * tot;
    for (const [id, t] of cand) { x -= t.peso; if (x <= 0) return id; }
    return cand[0][0];
  };
  // distribuição por faixa
  // mais peças no fundo (pedido): o lago menor fica cheio de achados
  const faixas = [[3, 40, 110], [40, 100, 110], [100, 500, 90], [500, 1500, 70], [1500, 4000, 60], [4000, 5000, 36]]; // o dobro de peças
  for (const [a, b, n] of faixas) {
    for (let i = 0, tent = 0; i < n && tent < n * 4; tent++) {
      const pos = randomBedSpot(rnd, [a, b]);
      if (!pos) continue;
      const tipo = sorteia(-pos[1]);
      addItem(w, tipo, pos, rnd); i++;
    }
  }
  // itens especiais fixos (contratos)
  const tr = WRECKS.find((k) => k.id === 'traineira');
  addItem(w, 'caixa_preta', [tr.x + Math.cos(tr.rot + 1.57) * 4, terrainHeight(tr.x + Math.cos(tr.rot + 1.57) * 4, tr.z + Math.sin(tr.rot + 1.57) * 4) + 0.2, tr.z + Math.sin(tr.rot + 1.57) * 4], rnd, 'caixa_preta_fixa');
  const ax = -40, az = -40;
  addItem(w, 'ancora_gigante', [ax, terrainHeight(ax, az) + 0.4, az], rnd, 'ancora_gigante_fixa');
  // lixo na margem (catar a pé)
  for (let i = 0; i < LIXO.quantidade; i++) {
    const pos = landTrashSpot(rnd); if (!pos) continue;
    addItem(w, LIXO.tipos[Math.floor(rnd() * LIXO.tipos.length)], pos, rnd);
  }
  // peças da estátua: cada jogador tem a sua cópia (o item não some do mundo para os outros)
  const spots = statueSpots(rnd);
  const pecas = ESTATUA_PECAS.filter((x) => x.id !== 'cabeca').map((x) => x.id);
  for (let i = pecas.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pecas[i], pecas[j]] = [pecas[j], pecas[i]]; }
  pecas.forEach((id, i) => { const it = addItem(w, 'estatua_' + id, spots[i % spots.length], rnd, 'estatua_' + id); it.pessoal = true; });
  // a cabeça fica no final de tudo: em cima do altar da Câmara do Mistério
  const cab = addItem(w, 'estatua_cabeca', [SHAFT_C.x, -4293.6, SHAFT_C.z], rnd, 'estatua_cabeca'); cab.pessoal = true;
  return w;
}
// lugar livre na margem (fora da água, longe das plataformas das estações)
export function landTrashSpot(rnd) {
  for (let t = 0; t < 40; t++) {
    const ang = rnd() * Math.PI * 2, r = LAKE_R + 3 + rnd() * (SLIDE_R - LAKE_R - 12);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = terrainHeight(x, z);
    if (h < 0.35) continue;
    if (STATIONS.some((s) => Math.hypot(x - s.pad[0], z - s.pad[1]) < 27)) continue;
    if (Math.hypot(x - ESTATUA.x, z - ESTATUA.z) < 15) continue;
    return [x, h + 0.04, z];
  }
  return null;
}
// lugares fundos para as peças da estátua (nunca perto da superfície)
function statueSpots(rnd) {
  const out = [];
  for (const c of CAVES) {
    // um pouco antes do fundo da caverna (a baliza luminosa fica no fundo)
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]), t = 1 - 5 / L;
    const x = c.a[0] + (c.b[0] - c.a[0]) * t, z = c.a[2] + (c.b[2] - c.a[2]) * t, yc = c.a[1] + (c.b[1] - c.a[1]) * t;
    let y = yc - c.r + 0.8;
    for (let k = 0; k < 24 && navSDF(x, y + 0.8, z) < 0.4; k++) y += 0.5;
    out.push([x, y, z]);
  }
  const shelf = (yy, upper, lower, n) => {
    for (let k = 0, tent = 0; k < n && tent < 200; tent++) {
      const ang = ((k + rnd() * 0.6) / n) * Math.PI * 2;
      const rOut = shaftRadius(upper, yy + 0.5, ang) - 2.2, rIn = shaftRadius(lower, yy - 0.5, ang) + 2.2;
      if (rOut <= rIn + 0.5) continue;
      const r = (rIn + rOut) / 2;
      const x = SHAFT_C.x + Math.cos(ang) * r, z = SHAFT_C.z + Math.sin(ang) * r;
      if (navSDF(x, yy + 1, z) < 0.3) continue;
      out.push([x, yy + 0.25, z]); k++;
    }
  };
  shelf(-500, SHAFT_SEGS[0], SHAFT_SEGS[1], 4);
  shelf(-1500, SHAFT_SEGS[1], SHAFT_SEGS[2], 3);
  return out;
}
function addItem(w, tipo, pos, rnd, id) {
  const it = { id: id || 'i' + (++w.seq), tipo, x: +pos[0].toFixed(2), y: +pos[1].toFixed(2), z: +pos[2].toFixed(2), rot: +(rnd() * 6.28).toFixed(2) };
  w.items[it.id] = it;
  return it;
}
// reaparecimento lento de sucata comum (o mundo não se esgota)
export function tickWorld(w, now, rnd = Math.random) {
  const ev = [];
  for (let i = w.respawn.length - 1; i >= 0; i--) {
    const r = w.respawn[i];
    if (now < r.em) continue;
    w.respawn.splice(i, 1);
    if (r.terra) {
      const pos = landTrashSpot(rnd); if (!pos) continue;
      const it = addItem(w, LIXO.tipos[Math.floor(rnd() * LIXO.tipos.length)], pos, rnd);
      ev.push({ t: 'item_novo', item: it });
      continue;
    }
    if (r.fixo) {
      const it = addItem(w, r.tipo, r.pos, rnd, r.fixo);
      ev.push({ t: 'item_novo', item: it });
      continue;
    }
    const pos = randomBedSpot(rnd, r.zona);
    if (!pos) continue;
    const cand = Object.entries(SUCATA).filter(([, t]) => t.zona && -pos[1] >= t.zona[0] && -pos[1] <= t.zona[1]);
    const tipo = cand[Math.floor(rnd() * cand.length)][0];
    const it = addItem(w, tipo, pos, rnd);
    ev.push({ t: 'item_novo', item: it });
  }
  return ev;
}

// ------------------------------------------------------------------ pesca (servidor sorteia)
export function sortearPeixe(p, bobber, hora, rnd = Math.random) {
  // bobber: {x, z, linha} — linha = profundidade da isca (limitada pela vara e pelo fundo)
  const vs = varaStats(p);
  const fundo = -terrainHeight(bobber.x, bobber.z);
  const linha = Math.max(0.5, Math.min(bobber.linha ?? vs.prof, vs.prof, fundo - 0.3));
  const noite = isNight(hora);
  const cand = [];
  for (const [id, e] of Object.entries(ESPECIES)) {
    if (linha < e.prof[0] || linha > e.prof[1] + 4) continue;
    if (e.hora === 'dia' && noite) continue;
    if (e.hora === 'noite' && !noite) continue;
    if (e.cacado || e.especial || !e.chance) continue;
    if (e.pesado && !vs.pesado) continue; // tubarão nem chega perto de iscas pequenas
    cand.push([id, e.chance]);
  }
  if (!cand.length) return null;
  const tot = cand.reduce((s, c) => s + c[1], 0);
  let x = rnd() * tot, esp = cand[0][0];
  for (const [id, c] of cand) { x -= c; if (x <= 0) { esp = id; break; } }
  const e = ESPECIES[esp];
  const cm = Math.round((e.cm[0] + (e.cm[1] - e.cm[0]) * Math.pow(rnd(), 1.6)) * 10) / 10;
  return { esp, cm, kg: +massaPeixe(esp, cm).toFixed(2), linha, espera: 2.5 + rnd() * 6 };
}

// ------------------------------------------------------------------ aquário
export function vitrineSpec(v) { return v?.tipo === 'tanque' ? TANQUES[v.nivel] : AQUARIOS[v?.nivel || 0]; }
// cabe no aquário/tanque equipado? (ou num outro, para trocar) — devolve o motivo de não caber, ou null
export function cabeNoAquario(p, peixe, v = p.vitrine, ocupados = v.peixes?.length || 0) {
  const t = vitrineSpec(v);
  if (ESPECIES[peixe.esp].cacado) return 'O tubarão abatido é para vender no computador';
  if (peixe.cortado) return 'Peixe cortado é para vender';
  if (ocupados >= t.vagas) return `${t.nome} lotado [${ocupados}/${t.vagas}]`;
  if (peixe.cm > t.maxCm) return `${ESPECIES[peixe.esp].nome} de ${peixe.cm} cm não cabe: máximo ${t.maxCm} cm no ${t.nome}`;
  if (ESPECIES[peixe.esp].pesado && v.tipo !== 'tanque') return 'Tubarões só num tanque de peixes';
  return null;
}
// troca o aquário/tanque da estação. Os peixes que não couberem no novo vão para a mochila.
function equiparVitrine(p, tipo, nivel) {
  const nova = { tipo, nivel, peixes: [] }, sobra = [];
  for (const f of p.vitrine.peixes) (cabeNoAquario(p, f, nova, nova.peixes.length) ? sobra : nova.peixes).push(f);
  if (sobra.length > capPeixes(p) - p.mochila.length) return `Não cabem ${sobra.length} peixe(s) no ${vitrineSpec(nova).nome} nem na mochila: tire alguns antes`;
  p.mochila.push(...sobra); p.vitrine = nova;
  return sobra.length ? `${sobra.length} peixe(s) que não cabiam foram para a mochila` : '';
}

// ------------------------------------------------------------------ AÇÕES
// ctx = { world, player, players(Map slot->player), now, hora, rnd, solo }
export function applyAction(p, a, ctx) {
  if (!a || typeof a.tipo !== 'string') return fail('Ação inválida');
  if (a.aid) {
    if (p.recentes.includes(a.aid)) return okR('', [], { dup: true });
  }
  const tipoItem = a.tipo === 'coletar' ? ctx.world?.items?.[a.item]?.tipo : null;
  const nSaco = p.saco?.length || 0;
  const r = ACOES[a.tipo] ? ACOES[a.tipo](p, a, ctx) : fail('Ação desconhecida: ' + a.tipo);
  if (r.ok && !r.dup && p.missoes) {
    const slot = ctx.player?.slot;
    let ev = [];
    if (a.tipo === 'coletar' && tipoItem && !SUCATA[tipoItem]?.estatua) ev = avancarMissao(p, slot, 'coletar', tipoItem, 1, ctx);
    else if (a.tipo === 'catar') ev = avancarMissao(p, slot, 'catar', null, 1, ctx);
    else if (a.tipo === 'pesca_puxar') ev = avancarMissao(p, slot, 'pescar', null, 1, ctx);
    else if (a.tipo === 'vender' || a.tipo === 'peixe_vender') ev = avancarMissao(p, slot, 'vender', null, 1, ctx);
    else if (a.tipo === 'vender_saco') ev = avancarMissao(p, slot, 'vender', null, nSaco, ctx);
    else if (a.tipo === 'vender_tudo' || a.tipo === 'peixe_vender_tudo') ev = avancarMissao(p, slot, 'vender', null, r.n || 1, ctx);
    if (ev.length) r.events = [...(r.events || []), ...ev];
  }
  if (r.ok && a.aid) {
    p.recentes.push(a.aid);
    if (p.recentes.length > 300) p.recentes.splice(0, p.recentes.length - 300);
  }
  return r;
}

const precisaEstacao = (ctx) => (estaNaEstacao(ctx.player) ? null : fail('Você precisa estar na sua estação'));
function pertoPeixaria(p, ctx) {
  if (!p.estacao.peixaria) return fail('Compre a Bancada de peixe no computador (aba Estação)');
  const st = stationById(ctx.player.slot); if (!st) return fail('Estação inválida');
  const b = estacaoParaMundo(st, BANCADA_PEIXE.x, BANCADA_PEIXE.z);
  if (ctx.player.modo !== 'terra' || Math.hypot(ctx.player.pos[0] - b[0], ctx.player.pos[2] - b[1]) > 4) return fail('Vá até a bancada de peixe da sua estação');
  return null;
}

const ACOES = {
  // ---------- compras ----------
  comprar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const { cat, chave } = a;
    let custo, aplicar, nome;
    if (cat === 'sub') {
      const up = SUB_UP[chave]; if (!up) return fail('Melhoria inexistente');
      const prox = up.niveis[p.sub[chave]]; if (!prox) return fail('Já está no nível máximo');
      custo = prox.custo; nome = `${up.nome}: ${prox.desc}`;
      aplicar = () => { p.sub[chave] += 1; };
    } else if (cat === 'vara') {
      // pode pular direto para qualquer vara melhor
      const n = Number.isInteger(a.nivel) ? a.nivel : p.vara + 1;
      const v = VARA[n - 1]; if (!v || n <= p.vara) return fail(n <= p.vara ? 'Você já tem uma vara igual ou melhor' : 'Vara inexistente');
      custo = v.custo; nome = v.nome; aplicar = () => { p.vara = n; };
    } else if (cat === 'veiculo') {
      const v = VEICULOS[chave]; if (!v || !v.preco) return fail('Veículo inexistente');
      p.veiculos ||= { tem: ['patinete'], eq: 'patinete' };
      if (p.veiculos.tem.includes(chave)) return fail('Você já tem esse veículo: use Equipar');
      custo = { dinheiro: v.preco, comps: {} }; nome = v.nome;
      aplicar = () => { p.veiculos.tem.push(chave); p.veiculos.eq = chave; return ' — equipado: ele está na sua vaga de estacionamento'; };
    } else if (cat === 'equip') {
      const lista = EQUIP[chave]; if (!lista) return fail('Item inexistente');
      p.equip ||= { saco: 0, bolsa: 0, traje: 0 };
      const n = Number.isInteger(a.nivel) ? a.nivel : (p.equip[chave] | 0) + 1;
      const it = lista[n]; if (!it || !it.custo) return fail('Item inexistente');
      if ((p.equip[chave] | 0) >= n) return fail('Você já tem esse (ou um melhor)');
      custo = it.custo; nome = it.nome; aplicar = () => { p.equip[chave] = n; };
    } else if (cat === 'pesado') {
      if (p.pesado) return fail('Você já tem o equipamento pesado');
      if (p.vara < PESADO.requerVara) return fail(`Requer a ${VARA[PESADO.requerVara - 1].nome}`);
      custo = PESADO.custo; nome = PESADO.nome; aplicar = () => { p.pesado = true; };
    } else if (cat === 'aquario') {
      // qualquer aquário maior, direto (os peixes que já estão nele continuam cabendo)
      const n = Number.isInteger(a.nivel) ? a.nivel : p.aquario.nivel + 1; // qualquer aquário que ainda não tenha
      const aq = AQUARIOS[n]; if (!aq) return fail('Aquário inexistente'); if (p.aquariosTem.includes(n)) return fail('Você já tem esse aquário: use Equipar');
      custo = aq.custo; nome = aq.nome; aplicar = () => { p.aquario.nivel = Math.max(p.aquario.nivel, n); if (!p.aquariosTem.includes(n)) p.aquariosTem.push(n); const m = equiparVitrine(p, 'aquario', n); return m ? ' — ' + (m.startsWith('Não cabem') ? 'continua equipado o anterior (' + m + ')' : m) : ''; };
    } else if (cat === 'tanque') {
      const prox = TANQUES[p.tanque.nivel + 1]; if (!prox) return fail('Tanque no nível máximo');
      if (p.aquario.nivel < prox.requerAquario) return fail(`Requer o ${AQUARIOS[prox.requerAquario].nome} (ou maior)`);
      custo = prox.custo; nome = prox.nome; aplicar = () => { p.tanque.nivel += 1; const n = p.tanque.nivel; if (!p.tanquesTem.includes(n)) p.tanquesTem.push(n); const m = equiparVitrine(p, 'tanque', n); return m ? ' — ' + (m.startsWith('Não cabem') ? 'continua equipado o anterior (' + m + ')' : m) : ''; };
    } else if (cat === 'estacao') {
      if (chave === 'deposito') {
        const prox = DEPOSITO[p.estacao.deposito + 1]; if (!prox) return fail('Depósito no máximo');
        custo = prox.custo; nome = `Depósito (${prox.vagas} vagas)`; aplicar = () => { p.estacao.deposito += 1; };
      } else {
        const it = ESTACAO[chave]; if (!it || it.oculto) return fail('Item inexistente');
        if (p.estacao[chave]) return fail('Já construído');
        custo = it.custo; nome = it.nome; aplicar = () => { p.estacao[chave] = true; };
      }
    } else if (cat === 'extra') {
      const it = EXTRAS[chave]; if (!it) return fail('Item inexistente');
      if (p.extras[chave]) return fail('Você já tem');
      custo = it.custo; nome = it.nome; aplicar = () => { p.extras[chave] = true; };
    } else return fail('Categoria inválida');
    if (!podePagar(p, custo)) return fail('Faltam: ' + faltando(p, custo).join(', '));
    pagar(p, custo); const extra = aplicar() || '';
    return okR(`Comprado: ${nome}${extra}`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },

  // ---------- sucata ----------
  coletar(p, a, ctx) {
    const { world, player } = ctx;
    const it = world.items[a.item];
    if (!it) return fail('Esse item já foi recolhido');
    if (it.pessoal && p.estatua.achadas.includes(SUCATA[it.tipo].estatua)) return fail('Você já pegou esta peça da estátua');
    if (SUCATA[it.tipo].terra) return fail('Esse lixo está na margem: cate a pé');
    if (player.modo !== 'sub') return fail('Use o braço do submarino para recolher sucata');
    const st = subStats(p);
    const pos = [it.x, it.y, it.z];
    const dist = d3(player.sub.pos, pos);
    if (dist > st.alcance + 3.2) return fail('Fora do alcance do braço');
    const t = SUCATA[it.tipo];
    // coop: soma das garras de submarinos próximos
    let kgCap = st.bracoKg, ajudantes = [];
    if (t.kg > kgCap) {
      for (const [slot, o] of ctx.players || []) {
        if (o === player || o.modo !== 'sub' || !o.profile) continue;
        if (d3(o.sub.pos, pos) < 14) { kgCap += subStats(o.profile).bracoKg; ajudantes.push(slot); }
      }
      if (t.kg > kgCap) return fail(`Muito pesado: ${t.kg} kg (sua garra ergue ${st.bracoKg} kg)` + (t.coop ? '. Chame um amigo com outro submarino!' : ''));
    }
    const nObj = p.carga.filter((x) => !x.coop).length;
    if (!t.coop && nObj >= st.cargaN) return fail(`Compartimento cheio (${nObj}/${st.cargaN} objetos). Venda ou guarde na estação, ou melhore a carga no computador.`);
    const uso = cargaUso(p);
    if (uso.kg + t.kg > st.cargaKg + 1e-6 || uso.L + t.L > st.cargaL + 1e-6) {
      if (!t.coop) return fail(`Carga cheia (${uso.kg.toFixed(0)}/${st.cargaKg} kg, ${uso.L.toFixed(0)}/${st.cargaL} L)`);
    }
    if (it.pessoal) {
      // peça da estátua: cada jogador pega a sua (continua no mundo para os amigos)
      p.carga.push({ uid: uid(ctx.rnd), tipo: it.tipo });
      p.estatua.achadas.push(t.estatua); p.xp += 25;
      return okR(`Peça da estátua encontrada: ${t.nome.replace('Peça da estátua: ', '')}! Leve até a estátua.`, [{ t: 'peca_estatua', slot: player.slot, id: it.id }]);
    }
    delete world.items[it.id];
    p.carga.push({ uid: uid(ctx.rnd), tipo: it.tipo });
    if (t.coop) p.carga[p.carga.length - 1].coop = true; // pendurado no cabo: não ocupa porão
    // reaparecimento
    if (it.id.endsWith('_fixa')) world.respawn.push({ em: ctx.now + 8 * 60e3, fixo: it.id, tipo: it.tipo, pos: [it.x, it.y, it.z] });
    else if (t.zona) world.respawn.push({ em: ctx.now + (SUCATA_RESPAWN_S[0] + ctx.rnd() * (SUCATA_RESPAWN_S[1] - SUCATA_RESPAWN_S[0])) * 1000, zona: t.zona });
    p.xp += 2;
    return okR(`Recolhido: ${t.nome} (${t.kg} kg)` + (ajudantes.length ? ' — içado em equipe!' : ''), [{ t: 'item_removido', id: it.id, por: player.slot, ajudantes }]);
  },

  vender(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const lista = a.de === 'deposito' ? p.deposito : a.de === 'saco' ? p.saco : p.carga;
    const i = lista.findIndex((x) => x.uid === a.uid);
    if (i < 0) return fail('Item não encontrado');
    const it = lista[i], t = SUCATA[it.tipo];
    if (t.estatua) return fail('Peças da estátua não se vendem: coloque na estátua');
    lista.splice(i, 1);
    const v = comMult(p, valorItem(it));
    p.dinheiro += v; p.xp += 1;
    return okR(`Vendido: ${nomeItem(it)} por S$ ${v}` + (multDinheiro(p) > 1 ? ` (×${multDinheiro(p)})` : ''));
  },
  reciclar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.estacao.reciclador) return fail('Construa a Recicladora na estação');
    const lista = a.de === 'deposito' ? p.deposito : a.de === 'saco' ? p.saco : p.carga;
    const i = lista.findIndex((x) => x.uid === a.uid);
    if (i < 0) return fail('Item não encontrado');
    const t = SUCATA[lista[i].tipo];
    if (!t.recicla) return fail('Este item não pode ser reciclado');
    lista.splice(i, 1);
    receber(p, { comps: t.recicla });
    return okR(`Reciclado: ${t.nome} → ` + Object.entries(t.recicla).map(([k, n]) => `${n} ${k}`).join(', '));
  },
  // restauro: de graça, qualquer item (lixo, sucata do fundo) direto do submarino, do depósito ou do saco. Vende pelo dobro.
  restaurar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.estacao.restauro) return fail('Compre a Bancada de restauro no computador (aba Estação)');
    const lista = a.de === 'deposito' ? p.deposito : a.de === 'saco' ? p.saco : p.carga;
    const i = lista.findIndex((x) => x.uid === a.uid);
    if (i < 0) return fail('Item não encontrado');
    const it = lista[i], t = SUCATA[it.tipo];
    if (t.estatua) return fail('Peças da estátua vão para a estátua');
    if (it.coop) return fail('A âncora gigante não cabe na bancada');
    if (it.rest || t.restaurado) return fail('Esse item já está restaurado');
    lista[i] = { ...it, rest: true };
    return okR(`Restaurado: ${t.nome} — agora vende por S$ ${comMult(p, valorItem(lista[i]))}`, [{ t: 'bancada', slot: ctx.player.slot, maquina: 'restauro' }]);
  },
  // bancada de peixe: peixe de mais de 2 kg na mão → tábua (E) → cortar (I) → pegar (I). Cortado vende pelo dobro.
  peixaria_colocar(p, a, ctx) {
    const e = pertoPeixaria(p, ctx); if (e) return e;
    if (p.peixaria) return fail('Já tem um peixe na tábua');
    if (!p.mao) return fail('Traga o peixe na mão (tire da mochila com Z)');
    if (p.mao.cortado) return fail('Esse peixe já está cortado: venda no computador');
    const kg = massaPeixe(p.mao.esp, p.mao.cm);
    p.peixaria = { peixe: p.mao, cortado: false }; p.mao = null;
    return okR(`${ESPECIES[p.peixaria.peixe.esp].nome} na tábua — aperte I para cortar`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  peixaria_cortar(p, a, ctx) {
    const e = pertoPeixaria(p, ctx); if (e) return e;
    if (!p.peixaria) return fail('Coloque um peixe na tábua primeiro');
    if (p.peixaria.cortado) return fail('Já está cortado — aperte I para pegar');
    p.peixaria.cortado = true;
    return okR('Peixe cortado! Aperte I para pegar', [{ t: 'visual_estacao', slot: ctx.player.slot }, { t: 'bancada', slot: ctx.player.slot, maquina: 'peixaria' }]);
  },
  peixaria_pegar(p, a, ctx) {
    const e = pertoPeixaria(p, ctx); if (e) return e;
    if (!p.peixaria?.cortado) return fail(p.peixaria ? 'Corte o peixe primeiro (I)' : 'Não tem peixe na tábua');
    if (p.mao) return fail('Suas mãos estão ocupadas');
    p.mao = { ...p.peixaria.peixe, cortado: true }; p.peixaria = null;
    return okR(`Peixe cortado na mão — venda no computador por S$ ${comMult(p, valorPeixeItem(p.mao))}`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  // cortar todos os peixes da mochila de uma vez (o cliente mostra 10 s de animação antes)
  peixaria_cortar_tudo(p, a, ctx) {
    const e = pertoPeixaria(p, ctx); if (e) return e;
    const lista = p.mochila.filter((f) => !f.cortado);
    if (!lista.length) return fail('Nenhum peixe inteiro na mochila');
    p.mochila = p.mochila.map((f) => (f.cortado ? f : { ...f, cortado: true }));
    return okR(`${lista.length} peixe(s) cortado(s) na mochila — agora valem o dobro`, [{ t: 'bancada', slot: ctx.player.slot, maquina: 'peixaria' }]);
  },
  // restaurar tudo de uma vez: submarino, saco e depósito
  restaurar_tudo(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.estacao.restauro) return fail('Compre a Bancada de restauro no computador (aba Estação)');
    let n = 0;
    for (const k of ['carga', 'saco', 'deposito']) p[k] = p[k].map((it) => { const t = SUCATA[it.tipo]; if (it.rest || t.restaurado || t.estatua || it.coop) return it; n++; return { ...it, rest: true }; });
    if (!n) return fail('Nada para restaurar');
    return okR(`${n} item(ns) restaurado(s) — agora valem o dobro`, [{ t: 'bancada', slot: ctx.player.slot, maquina: 'restauro' }]);
  },
  // vender tudo: peixes (mão, mochila), saco de lixo e a carga do submarino (menos peças da estátua)
  vender_tudo(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    let v = 0, n = 0;
    for (const f of [...(p.mao ? [p.mao] : []), ...p.mochila, ...p.caixaTermica]) { v += comMult(p, valorPeixeItem(f)); n++; }
    p.mao = null; p.mochila = []; p.caixaTermica = [];
    for (const it of p.saco) { v += comMult(p, valorItem(it)); n++; }
    p.saco = [];
    const fica = [];
    for (const it of p.carga) { if (SUCATA[it.tipo].estatua) { fica.push(it); continue; } v += comMult(p, valorItem(it)); n++; }
    p.carga = fica;
    if (!n) return fail('Nada para vender');
    p.dinheiro += v; p.xp += n;
    return okR(`Vendido tudo: ${n} item(ns) por S$ ${v}`, [], { n });
  },
  guardar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const ids = a.uid === '*' ? p.carga.map((x) => x.uid) : [a.uid];
    let n = 0;
    for (const id of ids) {
      if (p.deposito.length >= depositoVagas(p)) break;
      const i = p.carga.findIndex((x) => x.uid === id);
      if (i < 0) continue;
      p.deposito.push(p.carga[i]); p.carga.splice(i, 1); n++;
    }
    if (!n) return fail(p.deposito.length >= depositoVagas(p) ? 'Depósito cheio' : 'Nada para guardar');
    return okR(`${n} item(ns) guardado(s) no depósito`);
  },
  retirar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const i = p.deposito.findIndex((x) => x.uid === a.uid);
    if (i < 0) return fail('Item não encontrado');
    const t = SUCATA[p.deposito[i].tipo];
    const uso = cargaUso(p), st = subStats(p);
    if (uso.kg + t.kg > st.cargaKg || uso.L + t.L > st.cargaL) return fail('Não cabe no submarino');
    p.carga.push(p.deposito[i]); p.deposito.splice(i, 1);
    return okR('Item levado para o submarino');
  },

  // ---------- pesca ----------
  pesca_lancar(p, a, ctx) {
    const { player } = ctx;
    if (player.modo !== 'terra') return fail('Pesque a partir do cais ou da margem');
    if (p.mao) return fail('Suas mãos estão ocupadas: guarde ou solte o peixe');
    if (player.stunUntil > ctx.now) return fail('Você está atordoado');
    const vs = varaStats(p);
    const bx = +a.x, bz = +a.z;
    if (!isFinite(bx) || !isFinite(bz)) return fail('Lançamento inválido');
    if (Math.hypot(bx - player.pos[0], bz - player.pos[2]) > vs.alcance + 3) return fail('Longe demais para esta vara');
    if (terrainHeight(bx, bz) > -0.4) return fail('A isca caiu fora da água');
    const s = sortearPeixe(p, { x: bx, z: bz, linha: a.linha }, ctx.hora, ctx.rnd);
    player.pesca = { sid: uid(ctx.rnd), em: ctx.now, x: bx, z: bz, peixe: s, mordida: s ? ctx.now + s.espera * 1000 : Infinity };
    // o cliente só recebe a hora da mordida e a força do peixe — não a espécie
    return okR('', [], { pesca: { sid: player.pesca.sid, mordidaEm: player.pesca.mordida - ctx.now, forca: s ? ESPECIES[s.esp].forca * (s.cm / ESPECIES[s.esp].cm[1]) + 0.2 : 0, kg: s ? s.kg : 0 } });
  },
  pesca_puxar(p, a, ctx) {
    const { player } = ctx;
    const ps = player.pesca;
    if (!ps || ps.sid !== a.sid) return fail('Nenhum peixe fisgado');
    player.pesca = null;
    if (!ps.peixe) return fail('Nada mordeu a isca');
    if (ctx.now < ps.mordida - 300) return fail('Você puxou cedo demais — o peixe fugiu');
    if (ctx.now > ps.mordida + 60000) return fail('O peixe escapou');
    // tempo mínimo de briga plausível (anti-trapaça): 1,2 s + 0,4 s por kg
    const minimo = 1200 + Math.min(12000, ps.peixe.kg * 400);
    if (ctx.now - ps.mordida < minimo * 0.6) return fail('Puxada rápida demais');
    if (a.resultado !== 'ok' && !(a.resultado === 'arrebentou' && varaStats(p).inquebravel)) return fail(a.resultado === 'arrebentou' ? 'A linha arrebentou!' : 'O peixe escapou!');
    const vs = varaStats(p);
    const e = ESPECIES[ps.peixe.esp];
    if (!vs.inquebravel && (ps.peixe.cm > vs.maxCm || ps.peixe.kg > vs.linhaKg)) {
      return fail(`A linha arrebentou! Era um(a) ${e.nome} de ${ps.peixe.cm} cm — grande demais para a ${vs.nome}.`, { escapou: { esp: ps.peixe.esp, cm: ps.peixe.cm } });
    }
    p.mao = { uid: uid(ctx.rnd), esp: ps.peixe.esp, cm: ps.peixe.cm };
    p.xp += 3;
    if (!p.descobertas.includes('peixe:' + ps.peixe.esp)) p.descobertas.push('peixe:' + ps.peixe.esp);
    return okR(`Você pescou: ${e.nome} (${ps.peixe.cm} cm, ${ps.peixe.kg} kg)!`, [{ t: 'pescou', slot: player.slot, peixe: p.mao }]);
  },
  peixe_aquario(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.mao) return fail('Nenhum peixe na mão');
    const motivo = cabeNoAquario(p, p.mao);
    if (motivo) return fail(motivo);
    p.vitrine.peixes.push(p.mao); p.mao = null;
    const t = vitrineSpec(p.vitrine);
    return okR(`Peixe colocado no ${t.nome} [${p.vitrine.peixes.length}/${t.vagas}]`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  veic_equipar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    p.veiculos ||= { tem: ['patinete'], eq: 'patinete' };
    if (!VEICULOS[a.chave] || !p.veiculos.tem.includes(a.chave)) return fail('Você não tem esse veículo');
    if (p.veiculos.eq === a.chave) return fail('Esse já está equipado');
    p.veiculos.eq = a.chave;
    return okR(`${VEICULOS[a.chave].nome} equipado — ele está na sua vaga de estacionamento`);
  },
  aquario_da_bolsa(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const de = a.de === 'caixa' ? p.caixaTermica : p.mochila;
    const i = de.findIndex((f) => f.uid === a.uid);
    if (i < 0) return fail('Peixe não encontrado');
    const motivo = cabeNoAquario(p, de[i]); if (motivo) return fail(motivo);
    const f = de.splice(i, 1)[0]; p.vitrine.peixes.push(f);
    const t = vitrineSpec(p.vitrine);
    return okR(`${ESPECIES[f.esp].nome} colocado no ${t.nome} [${p.vitrine.peixes.length}/${t.vagas}]`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  aquario_retirar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (p.mao) return fail('Suas mãos estão ocupadas');
    const alvo = p.vitrine;
    const i = alvo.peixes.findIndex((f) => f.uid === a.uid);
    if (i < 0) return fail('Peixe não encontrado');
    if (ESPECIES[alvo.peixes[i].esp].pesado && !p.extras.luvas) return fail('Você precisa das luvas hidráulicas para segurar um tubarão');
    p.mao = alvo.peixes[i]; alvo.peixes.splice(i, 1);
    return okR('Peixe na mão', [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  // equipa qualquer aquário ou tanque já comprado: o anterior some da estação (os peixes passam para o novo)
  vitrine_equipar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const tipo = a.tipo2 === 'tanque' ? 'tanque' : 'aquario', nivel = a.nivel | 0;
    const tem = tipo === 'tanque' ? p.tanquesTem : p.aquariosTem;
    if (!tem.includes(nivel)) return fail('Você ainda não comprou esse');
    if (p.vitrine.tipo === tipo && p.vitrine.nivel === nivel) return fail('Já está equipado');
    const m = equiparVitrine(p, tipo, nivel);
    if (m.startsWith('Não cabem')) return fail(m);
    return okR(`Equipado: ${vitrineSpec(p.vitrine).nome}` + (m ? ' — ' + m : ''), [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  peixe_caixa(p, a, ctx) {
    if (!p.mao) return fail('Nenhum peixe na mão');
    if (ESPECIES[p.mao.esp].pesado) return fail('Um tubarão não cabe na caixa térmica');
    if (p.caixaTermica.length >= CAIXA_TERMICA.vagas) return fail(`Caixa térmica cheia [${CAIXA_TERMICA.vagas}/${CAIXA_TERMICA.vagas}]`);
    p.caixaTermica.push(p.mao); p.mao = null;
    return okR(`Guardado na caixa térmica [${p.caixaTermica.length}/${CAIXA_TERMICA.vagas}]`);
  },
  caixa_mao(p, a) {
    if (p.mao) return fail('Suas mãos estão ocupadas');
    const i = p.caixaTermica.findIndex((f) => f.uid === a.uid);
    if (i < 0) return fail('Peixe não encontrado');
    p.mao = p.caixaTermica[i]; p.caixaTermica.splice(i, 1);
    return okR('Peixe na mão');
  },
  peixe_vender(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    let f, de;
    if (a.uid && a.uid !== p.mao?.uid) {
      // vende da mochila (ou da caixa térmica antiga). Do aquário/tanque não: tem que tirar o peixe antes
      if (p.vitrine.peixes.some((x) => x.uid === a.uid)) return fail('Esse peixe está no aquário: tire ele primeiro (Pegar na mão) e depois venda');
      const fontes = [['mochila', p.mochila], ['caixa', p.caixaTermica]];
      for (const [nome, lista] of fontes) { const i = lista.findIndex((x) => x.uid === a.uid); if (i >= 0) { f = lista.splice(i, 1)[0]; de = nome; break; } }
      if (!f) return fail('Peixe não encontrado');
    } else {
      if (!p.mao) return fail('Nenhum peixe na mão');
      f = p.mao; p.mao = null; de = 'mao';
    }
    const v = comMult(p, valorPeixeItem(f));
    p.dinheiro += v;
    return okR(`Vendido: ${ESPECIES[f.esp].nome} por S$ ${v}`, de === 'aquario' || de === 'tanque' ? [{ t: 'visual_estacao', slot: ctx.player.slot }] : [], { de });
  },
  // vende de uma vez o peixe da mão e todos os da mochila (e da caixa térmica antiga)
  peixe_vender_tudo(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const todos = [...(p.mao ? [p.mao] : []), ...p.mochila, ...p.caixaTermica];
    if (!todos.length) return fail('Nenhum peixe na mão ou na mochila');
    let v = 0; for (const f of todos) v += comMult(p, valorPeixeItem(f));
    p.mao = null; p.mochila = []; p.caixaTermica = [];
    p.dinheiro += v;
    return okR(`Vendidos ${todos.length} peixe(s) por S$ ${v}`, [], { n: todos.length });
  },
  // decorações: depois de compradas dá para tirar (desequipar) e colocar de volta, sem pagar de novo
  deco_alternar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const k = a.chave, it = ESTACAO[k];
    if (!it || !(it.deco || k === 'decoracao')) return fail('Isso não é decoração');
    if (!p.estacao[k]) return fail('Compre primeiro');
    const off = { ...(p.estacao.decoOff || {}) };
    if (off[k]) delete off[k]; else off[k] = true;
    p.estacao.decoOff = off;
    return okR(`${it.nome}: ${off[k] ? 'retirada da estação' : 'colocada de volta'}`, [{ t: 'visual_estacao', slot: ctx.player.slot }]);
  },
  tubarao_pegar(p, a, ctx) {
    const { world, player } = ctx;
    const c = world.carcacas?.[a.id];
    if (!c) return fail('Alguém já pegou esse tubarão');
    if (player.modo !== 'terra' && player.modo !== 'nadando') return fail('Chegue perto a pé ou nadando');
    if (Math.hypot(player.pos[0] - c.pos[0], player.pos[2] - c.pos[2]) > TUBARAO.pegarRaio + 0.6) return fail('Chegue mais perto do tubarão');
    if (player.stunUntil > ctx.now) return fail('Você está no chão');
    if (p.mao) return fail('Suas mãos estão ocupadas: guarde ou solte o peixe primeiro');
    delete world.carcacas[c.id];
    p.mao = { uid: uid(ctx.rnd), esp: 'tubarao_cacado', cm: ESPECIES.tubarao_cacado.cm[0] };
    return okR(`Você pegou o tubarão! Leve até o computador da sua estação e venda por S$ ${TUBARAO.valor}`, [{ t: 'carcaca_pega', id: c.id, slot: player.slot }]);
  },
  peixe_soltar(p, a, ctx) {
    if (!p.mao) return fail('Nenhum peixe na mão');
    if (ESPECIES[p.mao.esp].cacado) { p.mao = null; return okR('Você largou o tubarão', [{ t: 'carcaca_nova', carcaca: novaCarcaca(ctx.world, ctx.player.pos), de: ctx.player.slot }]); }
    const f = p.mao; p.mao = null;
    return okR(`${ESPECIES[f.esp].nome} solto`, [{ t: 'soltou', slot: ctx.player.slot, peixe: f, pos: ctx.player.pos }]);
  },
  processar_lula(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.estacao.tinta) return fail('Construa a Bancada de tinta de lula');
    if (!p.mao || !ESPECIES[p.mao.esp].tinta) return fail('Segure uma lula para extrair a tinta');
    if (p.baloes >= MOCHILA.bolsas) return fail(`Mochila cheia (${p.baloes}/${MOCHILA.bolsas} bolsas de tinta)`);
    p.mao = null; const antes = p.baloes; p.baloes = Math.min(MOCHILA.bolsas, p.baloes + 2);
    return okR(`Tinta extraída: +${p.baloes - antes} bolsa(s) de tinta [${p.baloes}/${MOCHILA.bolsas}]`, [{ t: 'bancada', slot: ctx.player.slot, maquina: 'tinta' }]);
  },

  mochila_guardar(p) {
    if (!p.mao) return fail('Nenhum peixe na mão');
    if (p.mochila.length >= capPeixes(p)) return fail(`Mochila cheia (${p.mochila.length}/${capPeixes(p)} peixes)`);
    const f = p.mao; p.mochila.push(f); p.mao = null;
    return okR(`${ESPECIES[f.esp].nome} guardado na mochila [${p.mochila.length}/${capPeixes(p)}]`);
  },
  mochila_tirar(p, a) {
    if (!p.mochila.length) return fail('A mochila está vazia');
    if (p.mao) return fail('Suas mãos estão ocupadas');
    let i = a?.uid ? p.mochila.findIndex((f) => f.uid === a.uid) : p.mochila.length - 1;
    if (i < 0) return fail('Peixe não está na mochila');
    p.mao = p.mochila.splice(i, 1)[0];
    return okR(`${ESPECIES[p.mao.esp].nome} na mão [mochila ${p.mochila.length}/${capPeixes(p)}]`);
  },

  // ---------- brincadeiras ----------
  arremessar_peixe(p, a, ctx) {
    const { player, world, now } = ctx;
    if (!p.mao) return fail('Nenhum peixe na mão');
    if (!emTerra(player)) return fail('Arremesse de terra firme ou do cais');
    if (player.stunUntil > now) return fail('Você está atordoado');
    const tub = !!ESPECIES[p.mao.esp].pesado;
    if (ESPECIES[p.mao.esp].cacado) return fail('O tubarão abatido não dá para arremessar: leve até a estação e venda');
    if (tub && !p.extras.luvas) return fail('Precisa das luvas hidráulicas para arremessar um tubarão');
    const cd = tub ? 'cdTubarao' : 'cdPeixe';
    if ((player[cd] || 0) > now) return fail(`Aguarde ${Math.ceil((player[cd] - now) / 1000)} s`);
    const dir = normDir(a.dir);
    if (!dir) return fail('Direção inválida');
    const peixe = p.mao; p.mao = null;
    player[cd] = now + (tub ? TROLL.tubaraoCooldownMs : TROLL.peixeCooldownMs);
    const v = TROLL.peixeVelocidade * (tub ? 0.75 : 1);
    const pr = {
      id: 'p' + (++world.pseq), tipo: tub ? 'tubarao' : 'peixe', dono: player.slot, peixe,
      pos: [player.pos[0] + dir[0] * 0.8, player.pos[1] + 1.4, player.pos[2] + dir[2] * 0.8],
      vel: [dir[0] * v, dir[1] * v + 2.0, dir[2] * v], nasc: now, ini: [player.pos[0], 0, player.pos[2]], alcance: tub ? TROLL.tubaraoAlcance : TROLL.peixeAlcance,
    };
    world.projeteis.push(pr);
    return okR('', [{ t: 'projetil', pr }]);
  },
  arremessar_balao(p, a, ctx) {
    const { player, world, now } = ctx;
    if (p.baloes <= 0) return fail('Sem balões de tinta');
    if (!p.extras.lancador) return fail('Instale o lançador de balões no submarino');
    if (player.modo !== 'sub') return fail('Use dentro do submarino');
    if (player.sub.pos[1] > -2) return fail('O lançador só funciona submerso');
    if ((player.cdBalao || 0) > now) return fail(`Lançador recarregando: ${Math.ceil((player.cdBalao - now) / 1000)} s`);
    const dir = normDir(a.dir);
    if (!dir) return fail('Direção inválida');
    p.baloes -= 1;
    player.cdBalao = now + TROLL.balaoCooldownMs;
    const v = TROLL.balaoVelocidade;
    const pr = {
      id: 'p' + (++world.pseq), tipo: 'balao', dono: player.slot,
      pos: [player.sub.pos[0] + dir[0] * 2.6, player.sub.pos[1] + 0.9, player.sub.pos[2] + dir[2] * 2.6],
      vel: [dir[0] * v, dir[1] * v, dir[2] * v], nasc: now, ini: player.sub.pos.slice(), alcance: TROLL.balaoAlcance,
    };
    world.projeteis.push(pr);
    return okR('', [{ t: 'projetil', pr }]);
  },

  // ---------- lixo da margem ----------
  catar(p, a, ctx) {
    const { world, player } = ctx;
    const it = world.items[a.item];
    if (!it) return fail('Alguém já catou esse lixo');
    const t = SUCATA[it.tipo];
    if (!t.terra) return fail('Esse item não está na margem');
    if (player.modo !== 'terra') return fail('Cate o lixo a pé');
    if (d2(player.pos, [it.x, 0, it.z]) > 2.8) return fail('Chegue mais perto');
    // com as mãos livres o lixo fica na mão (E guarda · Q estilingue); com peixe/lixo na mão vai direto para o saco
    const naMao = !p.mao && !p.lixoMao;
    if (!naMao && p.saco.length >= capSaco(p)) return fail(`Saco cheio (${p.saco.length}/${capSaco(p)}). Venda no computador da estação.`);
    delete world.items[it.id];
    const obj = { uid: uid(ctx.rnd), tipo: it.tipo };
    if (naMao) p.lixoMao = obj; else p.saco.push(obj);
    p.xp += 1;
    if (!it.jogado) world.respawn.push({ em: ctx.now + (LIXO.respawnMinS + ctx.rnd() * (LIXO.respawnMaxS - LIXO.respawnMinS)) * 1000, terra: true });
    const ev = [{ t: 'item_removido', id: it.id, por: player.slot }];
    if (naMao) return okR(`${t.nome} na mão`, ev);
    return okR(`Catou: ${t.nome} [saco ${p.saco.length}/${capSaco(p)}]`, ev);
  },
  lixo_guardar(p) {
    if (!p.lixoMao) return fail('Nenhum lixo na mão');
    if (p.saco.length >= capSaco(p)) return fail(`Saco cheio (${p.saco.length}/${capSaco(p)}). Venda no computador da estação.`);
    p.saco.push(p.lixoMao); p.lixoMao = null;
    return okR(`Guardado no saco [${p.saco.length}/${capSaco(p)}]`);
  },
  // estilingue de lixo: mesma trajetória em arco do peixe; derruba por 1 s; não machuca o Kraken
  estilingue_atirar(p, a, ctx) {
    const { player, world, now } = ctx;
    if (!p.armas.estilingue) return fail('Compre o Estilingue de lixo na loja de armas (S$ 400)');
    if (!emTerra(player)) return fail('Use o estilingue a pé');
    if (player.stunUntil > now) return fail('Você está no chão');
    if ((player.cdEstilingue || 0) > now + 30) return fail('Recarregando o estilingue');
    const dir = normDir(a.dir); if (!dir) return fail('Direção inválida');
    let lixo = p.lixoMao;
    if (lixo) p.lixoMao = null;
    else if (p.saco.length) lixo = p.saco.pop();
    else return fail('Sem lixo: cate um lixo na margem (E)');
    player.cdEstilingue = now + ARMAS.estilingue.cdMs;
    const v = TROLL.peixeVelocidade;
    const pr = {
      id: 'p' + (++world.pseq), tipo: 'lixo', lixo: lixo.tipo, dono: player.slot,
      pos: [player.pos[0] + dir[0] * 0.8, player.pos[1] + 1.4, player.pos[2] + dir[2] * 0.8],
      vel: [dir[0] * v, dir[1] * v + 2.0, dir[2] * v], nasc: now, ini: [player.pos[0], 0, player.pos[2]], alcance: ARMAS.estilingue.alcance,
    };
    world.projeteis.push(pr);
    return okR('', [{ t: 'projetil', pr }]);
  },
  vender_saco(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    if (!p.saco.length) return fail('O saco está vazio');
    let tot = 0; for (const x of p.saco) tot += valorItem(x);
    const v = comMult(p, tot), n = p.saco.length;
    p.saco = []; p.dinheiro += v;
    return okR(`Vendeu ${n} reciclável(is) por S$ ${v}` + (multDinheiro(p) > 1 ? ` (×${multDinheiro(p)})` : ''));
  },

  // ---------- armas (barraca de armas) ----------
  arma_comprar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const k = a.arma, A = ARMAS[k];
    if (!A) return fail('Arma inexistente');
    if (p.armas[k]) return fail('Você já tem essa arma');
    if (A.requer && !p.armas[A.requer]) return fail(`Primeiro compre: ${ARMAS[A.requer].nome}`);
    if (p.dinheiro < A.preco) return fail(`Faltam S$ ${A.preco - p.dinheiro}`);
    p.dinheiro -= A.preco; p.armas[k] = true;
    if (!A.municao) return okR(`Comprou: ${A.nome}! Cate lixo na margem (E) e aperte Q para mirar e atirar`);
    p.municao[k] = (p.municao[k] || 0) + A.municao.n; // vem com 1 pente
    return okR(`Comprou: ${A.nome} (+${A.municao.n} balas)`);
  },
  municao_comprar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const k = a.arma, A = ARMAS[k];
    if (!A || !p.armas[k]) return fail('Compre a arma primeiro');
    if (!A.municao) return fail('O estilingue usa o lixo catado na margem como munição');
    if ((p.municao[k] || 0) + A.municao.n > MUNICAO_MAX[k]) return fail(`Máximo de ${MUNICAO_MAX[k]} balas para ${A.nome}`);
    if (p.dinheiro < A.municao.preco) return fail(`Faltam S$ ${A.municao.preco - p.dinheiro}`);
    p.dinheiro -= A.municao.preco; p.municao[k] = (p.municao[k] || 0) + A.municao.n;
    return okR(`+${A.municao.n} ${A.foguete ? 'foguete(s)' : 'balas'} para ${A.nome} [${p.municao[k]}]`);
  },
  atirar(p, a, ctx) {
    const { player, world, now, players } = ctx;
    const k = a.arma, A = ARMAS[k];
    if (!A || !p.armas[k]) return fail('Você não tem essa arma');
    if (A.lixo) return fail('O estilingue atira lixo: use Q');
    if (player.modo !== 'terra') return fail('Atire a pé');
    if (player.stunUntil > now) return fail('Você está no chão');
    if ((p.municao[k] || 0) <= 0) return fail(`Sem munição de ${A.nome}: compre na barraca de armas`);
    player.cdArma = player.cdArma || {};
    if ((player.cdArma[k] || 0) > now + 30) return fail('Recarregando');
    const dir = normDir(a.dir); if (!dir) return fail('Direção inválida');
    p.municao[k] -= 1; player.cdArma[k] = now + A.cdMs;
    const boca = [player.pos[0] + dir[0] * 0.9, player.pos[1] + 1.45, player.pos[2] + dir[2] * 0.9];
    if (A.foguete) {
      const v = A.velocidade;
      const pr = { id: 'p' + (++world.pseq), tipo: 'foguete', arma: k, dono: player.slot, pos: boca, vel: [dir[0] * v, dir[1] * v, dir[2] * v], nasc: now, ini: boca.slice(), alcance: A.alcance };
      world.projeteis.push(pr);
      return okR('', [{ t: 'projetil', pr }], { municao: p.municao[k] });
    }
    // tiro instantâneo: acha o primeiro jogador a pé na linha (o terreno bloqueia)
    let melhor = null, tMax = A.alcance;
    for (let s = 1; s < A.alcance; s += 1) {
      const x = boca[0] + dir[0] * s, y = boca[1] + dir[1] * s, z = boca[2] + dir[2] * s;
      if (y < terrainHeight(x, z) - 0.05 && y < 0.3 + Math.max(0, terrainHeight(x, z))) { tMax = s; break; }
    }
    const fim = [boca[0] + dir[0] * tMax, boca[1] + dir[1] * tMax, boca[2] + dir[2] * tMax];
    for (const [slot, o] of players || []) {
      if (slot === player.slot || (o.modo !== 'terra' && o.modo !== 'nadando')) continue;
      const pe = o.pos, ca = [o.pos[0], o.pos[1] + 1.75, o.pos[2]];
      const d = segSegDist(boca, fim, pe, ca);
      if (d.dist < 0.5 && (!melhor || d.s < melhor.s)) melhor = { slot, s: d.s };
    }
    const evs = [];
    let ponto = fim;
    // o Kraken é um alvo enorme: acerta se a linha passar pela "esfera" dele antes de um jogador
    const tk = raioKraken(world.kraken, now, boca, dir, tMax), tt = raioTubarao(world, now, boca, dir, tMax);
    const tb = tk !== null && (tt === null || tk < tt) ? ['kraken', tk] : tt !== null ? ['tubarao', tt] : null;
    if (tb && (!melhor || tb[1] < melhor.s * tMax)) {
      ponto = [boca[0] + dir[0] * tb[1], boca[1] + dir[1] * tb[1], boca[2] + dir[2] * tb[1]];
      if (tb[0] === 'kraken') evs.push(...danoKraken(world.kraken, A.danoKraken || 0, player.slot, now));
      else evs.push(...danoTubarao(world, A.danoKraken || 0, player.slot, now));
      evs.unshift({ t: 'tiro', de: player.slot, arma: k, a: boca, b: ponto, acertou: tb[0] });
      return okR('', evs, { municao: p.municao[k] });
    }
    if (melhor) {
      ponto = [boca[0] + (fim[0] - boca[0]) * melhor.s, boca[1] + (fim[1] - boca[1]) * melhor.s, boca[2] + (fim[2] - boca[2]) * melhor.s];
      evs.push(...acertoArma(players.get(melhor.slot), melhor.slot, player.slot, k, dir, now, 1, world));
    }
    evs.unshift({ t: 'tiro', de: player.slot, arma: k, a: boca, b: ponto, acertou: !!melhor });
    return okR('', evs, { municao: p.municao[k] });
  },

  // ---------- estátua ----------
  estatua_colocar(p, a, ctx) {
    const { player } = ctx;
    if (player.modo !== 'terra' || Math.hypot(player.pos[0] - ESTATUA.x, player.pos[2] - ESTATUA.z) > 12) return fail('Vá até a base da estátua');
    const temPeca = (id) => [...p.carga, ...p.deposito].findIndex((x) => x.tipo === 'estatua_' + id);
    const colocadas = [];
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const pc of ESTATUA_PECAS) {
        if (p.estatua.colocadas.includes(pc.id)) continue;
        if (temPeca(pc.id) < 0) continue;
        if (!pc.requer.every((r) => p.estatua.colocadas.includes(r))) continue;
        for (const lista of [p.carga, p.deposito]) { const i = lista.findIndex((x) => x.tipo === 'estatua_' + pc.id); if (i >= 0) { lista.splice(i, 1); break; } }
        p.estatua.colocadas.push(pc.id); colocadas.push(pc.nome); mudou = true;
      }
    }
    if (!colocadas.length) {
      const guardadas = ESTATUA_PECAS.filter((pc) => !p.estatua.colocadas.includes(pc.id) && temPeca(pc.id) >= 0);
      if (guardadas.length) {
        const pc = guardadas[0]; const falta = pc.requer.filter((r) => !p.estatua.colocadas.includes(r)).map((r) => ESTATUA_PECAS.find((x) => x.id === r).nome);
        return fail(`${pc.nome} ainda não encaixa: falta colocar ${falta.join(', ')}. Guarde no depósito até achar.`);
      }
      return fail('Você não tem peças da estátua (procure no fundo do lago com o submarino)');
    }
    const completa = estatuaCompleta(p);
    p.xp += 40 * colocadas.length;
    return okR(`Colocou: ${colocadas.join(', ')}. Multiplicador de dinheiro: ×${multDinheiro(p)}` + (completa ? ' — ESTÁTUA COMPLETA!' : ''),
      [{ t: 'estatua', slot: player.slot, colocadas: p.estatua.colocadas.slice(), completa }]);
  },

  // ---------- contratos ----------
  contrato_aceitar(p, a) {
    const c = CONTRATOS.find((x) => x.id === a.id);
    if (!c) return fail('Contrato inexistente');
    if (p.contratos.ativos.includes(c.id)) return fail('Já aceito');
    if (p.contratos.concluidos.includes(c.id)) return fail('Já concluído');
    if (p.contratos.ativos.length >= 3) return fail('Máximo de 3 contratos ativos');
    p.contratos.ativos.push(c.id);
    return okR(`Contrato aceito: ${c.nome}`);
  },
  contrato_entregar(p, a, ctx) {
    const e = precisaEstacao(ctx); if (e) return e;
    const c = CONTRATOS.find((x) => x.id === a.id);
    if (!c || !p.contratos.ativos.includes(c.id)) return fail('Contrato não está ativo');
    const st = contratoEstado(p, c);
    if (!st.pronto) return fail('Ainda falta: ' + st.falta);
    // consome itens
    if (c.entrega) {
      for (const [tipo, n] of Object.entries(c.entrega)) {
        let k = n;
        for (const lista of [p.carga, p.deposito]) {
          for (let i = lista.length - 1; i >= 0 && k > 0; i--) if (lista[i].tipo === tipo) { lista.splice(i, 1); k--; }
        }
      }
    }
    if (c.peixe) {
      if (p.mao && p.mao.esp === c.peixe.esp && p.mao.cm >= c.peixe.cm) p.mao = null;
      else {
        const i = p.caixaTermica.findIndex((f) => f.esp === c.peixe.esp && f.cm >= c.peixe.cm);
        p.caixaTermica.splice(i, 1);
      }
    }
    p.contratos.ativos = p.contratos.ativos.filter((x) => x !== c.id);
    p.contratos.concluidos.push(c.id);
    receber(p, c.premio); p.xp += 20;
    return okR(`Contrato concluído: ${c.nome}! +S$ ${c.premio.dinheiro}`);
  },
};

export function contratoEstado(p, c) {
  if (c.entrega) {
    const falta = [];
    for (const [tipo, n] of Object.entries(c.entrega)) {
      const tem = [...p.carga, ...p.deposito].filter((x) => x.tipo === tipo).length;
      if (tem < n) falta.push(`${n - tem}× ${SUCATA[tipo].nome}`);
    }
    return { pronto: !falta.length, falta: falta.join(', ') };
  }
  if (c.visitar) {
    const ok = p.descobertas.includes('lugar:' + c.visitar);
    return { pronto: ok, falta: ok ? '' : 'visitar o local' };
  }
  if (c.peixe) {
    const ok = [p.mao, ...p.caixaTermica].some((f) => f && f.esp === c.peixe.esp && f.cm >= c.peixe.cm);
    return { pronto: ok, falta: ok ? '' : `${ESPECIES[c.peixe.esp].nome} ≥ ${c.peixe.cm} cm na mão ou na caixa térmica` };
  }
  return { pronto: false, falta: '?' };
}

function normDir(d) {
  if (!Array.isArray(d) || d.length !== 3) return null;
  const l = Math.hypot(d[0], d[1], d[2]);
  if (!isFinite(l) || l < 1e-3) return null;
  return [d[0] / l, d[1] / l, d[2] / l];
}

// ------------------------------------------------------------------ projéteis (simulados pelo servidor)
// Devolve eventos de acerto/erro. players: Map slot -> player runtime (com .profile).
export function stepProjectiles(world, players, dt, now) {
  const ev = [];
  for (let i = world.projeteis.length - 1; i >= 0; i--) {
    const pr = world.projeteis[i];
    if (pr.tipo === 'foguete') {
      const prev = pr.pos.slice();
      pr.vel[1] -= 1.2 * dt; // foguete quase reto
      pr.pos[0] += pr.vel[0] * dt; pr.pos[1] += pr.vel[1] * dt; pr.pos[2] += pr.vel[2] * dt;
      let bateu = null;
      for (const [slot, o] of players) {
        if (slot === pr.dono || (o.modo !== 'terra' && o.modo !== 'nadando')) continue;
        if (segSegDist(prev, pr.pos, o.pos, [o.pos[0], o.pos[1] + 1.75, o.pos[2]]).dist < 0.7) { bateu = 'jogador'; break; }
      }
      const kc = centroKraken(world.kraken, now), tc = centroTubarao(world, now);
      if (!bateu && kc && d3(pr.pos, kc) < KRAKEN.raio + 0.8) bateu = 'kraken';
      if (!bateu && tc && d3(pr.pos, tc) < TUBARAO.raio + 0.8) bateu = 'tubarao';
      const h = terrainHeight(pr.pos[0], pr.pos[2]);
      if (!bateu && (pr.pos[1] < Math.max(h, 0) || now - pr.nasc > 5000 || Math.hypot(pr.pos[0] - pr.ini[0], pr.pos[2] - pr.ini[2]) > pr.alcance)) bateu = 'chao';
      if (!bateu) continue;
      world.projeteis.splice(i, 1);
      ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'explosao', agua: h < 0 });
      if (kc && d3(pr.pos, kc) < KRAKEN.raio + (ARMAS[pr.arma] || ARMAS.bazuca).raio) ev.push(...danoKraken(world.kraken, (ARMAS[pr.arma] || ARMAS.bazuca).danoKraken || 0, pr.dono, now));
      if (tc && d3(pr.pos, tc) < TUBARAO.raio + (ARMAS[pr.arma] || ARMAS.bazuca).raio) ev.push(...danoTubarao(world, (ARMAS[pr.arma] || ARMAS.bazuca).danoKraken || 0, pr.dono, now));
      // explosão: derruba e arremessa quem estiver perto (mais forte no centro)
      const A = ARMAS[pr.arma] || ARMAS.bazuca;
      for (const [slot, o] of players) {
        if (o.modo !== 'terra' && o.modo !== 'nadando') continue;
        const c = [o.pos[0], o.pos[1] + 0.9, o.pos[2]];
        const d = d3(c, pr.pos);
        if (d > A.raio) continue;
        if (slot === pr.dono && d > A.raio * 0.6) continue;
        const dir = [o.pos[0] - pr.pos[0] || 0.01, 0, o.pos[2] - pr.pos[2]];
        ev.push(...acertoArma(o, slot, pr.dono, pr.arma || 'bazuca', dir, now, 0.6 + 0.4 * (1 - d / A.raio), world));
      }
      continue;
    }
    const sub = pr.tipo === 'balao';
    // integração: no ar há gravidade; na água (balão) arrasto e leve flutuação
    if (sub) {
      pr.vel[1] += 0.6 * dt;
      const k = Math.exp(-0.35 * dt);
      pr.vel[0] *= k; pr.vel[1] *= k; pr.vel[2] *= k;
    } else {
      pr.vel[1] -= 9.81 * dt;
    }
    const prev = pr.pos.slice();
    pr.pos[0] += pr.vel[0] * dt; pr.pos[1] += pr.vel[1] * dt; pr.pos[2] += pr.vel[2] * dt;
    let fim = null;
    if (pr.tipo === 'lixo') {
      const kc = centroKraken(world.kraken, now), tc = centroTubarao(world, now);
      if (kc && segSphere(prev, pr.pos, kc, KRAKEN.raio)) { world.projeteis.splice(i, 1); ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'kraken' }, ...danoKraken(world.kraken, ARMAS.estilingue.danoKraken, pr.dono, now)); continue; }
      if (tc && segSphere(prev, pr.pos, tc, TUBARAO.raio)) { world.projeteis.splice(i, 1); ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'tubarao' }, ...danoTubarao(world, ARMAS.estilingue.danoKraken, pr.dono, now)); continue; }
    }
    // colisão com jogadores / submarinos (teste por segmento contra esfera/cápsula)
    for (const [slot, o] of players) {
      if (slot === pr.dono) continue;
      if (sub) {
        if (o.modo !== 'sub') continue;
        // vidro frontal: esfera na proa do submarino
        const yaw = o.sub.rot || 0;
        const glass = [o.sub.pos[0] + Math.sin(yaw) * 2.15, o.sub.pos[1] + 0.25, o.sub.pos[2] + Math.cos(yaw) * 2.15];
        if (segSphere(prev, pr.pos, glass, 1.15)) { fim = { t: 'balao_acerto', alvo: slot }; break; }
        // casco (acerta mas não suja o vidro)
        if (segSphere(prev, pr.pos, o.sub.pos, 1.6)) { fim = { t: 'balao_casco', alvo: slot }; break; }
      } else {
        if (!emTerra(o)) continue;
        // cápsula do personagem: de pés a cabeça (~1,7 m)
        const pe = o.pos, ca = [o.pos[0], o.pos[1] + 1.7, o.pos[2]];
        if (segCapsule(prev, pr.pos, pe, ca, 0.55)) { fim = { t: 'peixe_acerto', alvo: slot }; break; }
      }
    }
    if (!fim) {
      const viajou = Math.hypot(pr.pos[0] - pr.ini[0], pr.pos[2] - pr.ini[2]);
      if (sub) {
        if (navSDF(pr.pos[0], pr.pos[1], pr.pos[2]) < 0 || now - pr.nasc > 6000 || viajou > pr.alcance || pr.pos[1] > -0.3) fim = { t: 'erro' };
      } else {
        const h = terrainHeight(pr.pos[0], pr.pos[2]);
        if (pr.pos[1] < Math.max(h, 0) || now - pr.nasc > 5000) fim = { t: 'erro', agua: h < 0 };
        else if (viajou > pr.alcance + 6) fim = { t: 'erro', agua: h < 0 };
      }
    }
    if (!fim) continue;
    world.projeteis.splice(i, 1);
    // lixo do estilingue não some: fica onde caiu (ou no pé de quem foi acertado). Só some na água.
    if (pr.tipo === 'lixo' && pr.lixo && SUCATA[pr.lixo]) {
      let pos = null;
      if (fim.t === 'peixe_acerto') { const o = players.get(fim.alvo); pos = [o.pos[0] + (Math.random() - 0.5) * 0.6, o.pos[1] + 0.04, o.pos[2] + (Math.random() - 0.5) * 0.6]; }
      else if (fim.t === 'erro' && !fim.agua) { const h = terrainHeight(pr.pos[0], pr.pos[2]); if (h > -0.05) pos = [pr.pos[0], Math.max(h, 0) + 0.04, pr.pos[2]]; }
      if (pos) { const it = addItem(world, pr.lixo, pos, Math.random); it.jogado = true; ev.push({ t: 'item_novo', item: it }); }
    }
    if (fim.t === 'peixe_acerto') {
      const alvo = players.get(fim.alvo);
      if ((alvo.imuneUntil || 0) > now) {
        ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'imune', alvo: fim.alvo });
        continue;
      }
      const ms = pr.tipo === 'tubarao' ? TROLL.tubaraoStunMs : pr.tipo === 'lixo' ? ARMAS.estilingue.stunMs : TROLL.peixeStunMs;
      alvo.stunUntil = now + ms;
      alvo.imuneUntil = now + ms + (pr.tipo === 'lixo' ? 800 : TROLL.imunidadeMs);
      ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'acerto' });
      ev.push({ t: 'atordoado', alvo: fim.alvo, por: pr.dono, ms, ate: alvo.stunUntil, tubarao: pr.tipo === 'tubarao', esp: pr.peixe?.esp, lixo: pr.lixo || null });
      ev.push(...largarCarcaca(world, alvo, fim.alvo));
    } else if (fim.t === 'balao_acerto') {
      const alvo = players.get(fim.alvo);
      if (alvo.tinta || (alvo.tintaProt || 0) > now) {
        ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'casco' });
        continue;
      }
      alvo.tinta = true;
      ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: 'acerto' });
      ev.push({ t: 'tinta', alvo: fim.alvo, por: pr.dono, on: true });
    } else {
      ev.push({ t: 'projetil_fim', id: pr.id, pos: pr.pos, res: fim.t === 'balao_casco' ? 'casco' : 'erro', agua: fim.agua });
    }
  }
  return ev;
}
// limpeza da tinta: SOMENTE quando o próprio submarino emerge
export function checkSurface(player, now) {
  if (player.tinta && player.modo !== 'terra' && player.sub && player.sub.pos[1] > -0.9) {
    player.tinta = false;
    player.tintaProt = now + TROLL.balaoProtecaoMs;
    return { t: 'tinta', alvo: player.slot, on: false };
  }
  // se o jogador sair do submarino na doca, o vidro também foi exposto ao ar
  if (player.tinta && player.modo === 'terra') {
    player.tinta = false; player.tintaProt = now + TROLL.balaoProtecaoMs;
    return { t: 'tinta', alvo: player.slot, on: false };
  }
  return null;
}
// registra descoberta de lugares (contratos de mapear)
export function checkDiscovery(p, player) {
  if (player.modo !== 'sub') return null;
  const pos = player.sub.pos;
  for (const c of CAVES) {
    if (p.descobertas.includes('lugar:' + c.id)) continue;
    if (Math.hypot(pos[0] - c.b[0], pos[1] - c.b[1], pos[2] - c.b[2]) < c.r + 6) {
      p.descobertas.push('lugar:' + c.id);
      return { t: 'descoberta', slot: player.slot, nome: c.nome };
    }
  }
  const prof = -pos[1];
  if (prof > p.profMax) p.profMax = Math.round(prof);
  return null;
}

// ------------------------------------------------------------------ Kraken do abismo
export function centroKraken(k, now) {
  if (!k?.vivo) return null;
  const t = (now - k.ini) / 1000;
  const { pos } = krakenPos(t, k.a0);
  return [pos[0], 2.2, pos[2]];
}
// distância ao longo do raio (origem o, direção unitária d) até a esfera do Kraken, ou null
function raioKraken(k, now, o, d, tMax) {
  const c = centroKraken(k, now); if (!c) return null;
  const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2], cc = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - KRAKEN.raio ** 2;
  const disc = b * b - cc; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t <= tMax ? t : null;
}
export function danoKraken(k, dano, slot, now) {
  if (!k?.vivo || dano <= 0) return [];
  k.hp = Math.max(0, k.hp - dano);
  k.dano[slot] = (k.dano[slot] || 0) + dano;
  if (k.hp > 0) return [];
  k.vivo = false; k.proximo = now + KRAKEN.intervaloMs; k.avisado = false;
  return [{ t: 'kraken_morto', por: slot, pos: centroKraken({ ...k, vivo: true }, now), dano: { ...k.dano } }];
}
// nasce a cada 20 min (aviso 1 min antes), fica 1 min e volta para o abismo
export function tickKraken(w, now, rnd = Math.random) {
  const k = w.kraken || (w.kraken = { vivo: false, proximo: 0, hp: 0 });
  const ev = [];
  if (!k.proximo) k.proximo = now + KRAKEN.intervaloMs;
  if (!k.vivo && !k.avisado && now >= k.proximo - KRAKEN.avisoMs) { k.avisado = true; ev.push({ t: 'kraken_aviso', em: Math.max(0, k.proximo - now) }); }
  if (!k.vivo && now >= k.proximo) {
    Object.assign(k, { vivo: true, ini: now, fim: now + KRAKEN.duracaoMs, hp: KRAKEN.hp, hpMax: KRAKEN.hp, a0: rnd() * Math.PI * 2, dano: {} });
    ev.push({ t: 'kraken_surgiu', fim: KRAKEN.duracaoMs });
  } else if (k.vivo && now >= k.fim) {
    k.vivo = false; k.proximo = now + KRAKEN.intervaloMs; k.avisado = false;
    ev.push({ t: 'kraken_fugiu' });
  }
  return ev;
}
export function krakenPublico(k, now) {
  if (!k) return null;
  if (!k.vivo) return { vivo: false, em: Math.max(0, (k.proximo || 0) - now) };
  return { vivo: true, t: (now - k.ini) / 1000, resta: Math.max(0, k.fim - now), hp: k.hp, hpMax: k.hpMax, a0: k.a0 };
}

// filhote do Kraken vivo: vai para a mochila; se estiver cheia, para a mão; senão, para a caixa térmica
export function darFilhoteKraken(p, rnd = Math.random) {
  const f = { uid: uid(rnd), esp: 'kraken_filhote', cm: KRAKEN.filhoteCm };
  if (p.mochila.length < capPeixes(p)) { p.mochila.push(f); return 'mochila'; }
  if (!p.mao) { p.mao = f; return 'mão'; }
  p.caixaTermica.push(f); return 'caixa térmica';
}
export const rendaPorHora = (f) => Math.round(valorPeixeItem(f) * RENDA_AQUARIO.porHora * 10) / 10;
// aquário/tanque rende 10% do valor de cada peixe por hora; paga a cada minuto (devolve o que pagou agora)
export function rendaAquario(p, dtMs) {
  const peixes = p.vitrine?.peixes || [];
  if (!peixes.length) { p.rendaAq = 0; return 0; }
  let v = 0; for (const f of peixes) v += valorPeixeItem(f);
  p.rendaAq = (p.rendaAq || 0) + v * RENDA_AQUARIO.porHora * dtMs / 3600e3;
  p.rendaAqT = (p.rendaAqT || 0) + dtMs;
  if (p.rendaAqT < RENDA_AQUARIO.pagaMs) return 0;
  p.rendaAqT = 0;
  const pago = Math.floor(p.rendaAq);
  if (pago > 0) { p.dinheiro += pago; p.rendaAq -= pago; }
  return pago;
}

// ------------------------------------------------------------------ tubarão do lago
export function centroTubarao(w, now) {
  const tb = w.tubarao; if (!tb?.vivo) return null;
  const { pos } = tubaraoPos((now - tb.ini) / 1000, tb.a0);
  return [pos[0], 0.1, pos[2]];
}
function raioTubarao(w, now, o, d, tMax) {
  const c = centroTubarao(w, now); if (!c) return null;
  const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2], cc = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - TUBARAO.raio ** 2;
  const disc = b * b - cc; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t <= tMax ? t : null;
}
function novaCarcaca(w, pos) {
  const h = terrainHeight(pos[0], pos[2]);
  const c = { id: 'c' + (++w.cseq), pos: [+pos[0].toFixed(2), h < 0 ? 0 : +(h + 0.05).toFixed(2), +pos[2].toFixed(2)], agua: h < 0 };
  w.carcacas[c.id] = c;
  return c;
}
export function danoTubarao(w, dano, slot, now) {
  const tb = w.tubarao; if (!tb?.vivo || dano <= 0) return [];
  const c = centroTubarao(w, now);
  tb.hp = Math.max(0, tb.hp - dano);
  if (tb.hp > 0) return [];
  tb.vivo = false; tb.esperando = true; tb.proximo = 0; // o próximo só começa a contar quando alguém pegar este (tirar da água)
  return [{ t: 'tubarao_morto', por: slot, carcaca: novaCarcaca(w, c) }];
}
// quem leva o tubarão abatido e é acertado deixa ele cair ali mesmo
function largarCarcaca(w, alvo, slot) {
  const p = alvo?.profile;
  if (!w || !p?.mao || !ESPECIES[p.mao.esp]?.cacado) return [];
  p.mao = null;
  return [{ t: 'carcaca_nova', carcaca: novaCarcaca(w, alvo.pos), de: slot, perfis: [slot] }];
}
// um só por vez: depois de abatido, o próximo só começa a contar (5 min) quando a carcaça for pega
export function tickTubarao(w, now, rnd = Math.random) {
  const tb = w.tubarao || (w.tubarao = { vivo: false, proximo: 0, hp: 0 });
  w.carcacas ||= {};
  if (!tb.vivo && tb.esperando) { if (Object.keys(w.carcacas).length) return []; tb.esperando = false; tb.proximo = now + TUBARAO.intervaloMs; }
  if (!tb.proximo || tb.proximo - now > TUBARAO.intervaloMs) tb.proximo = now + TUBARAO.intervaloMs;
  if (!tb.vivo && now >= tb.proximo) {
    Object.assign(tb, { vivo: true, ini: now, a0: rnd() * Math.PI * 2, hp: TUBARAO.hp });
    return [{ t: 'tubarao_surgiu' }];
  }
  return [];
}
export function tubaraoPublico(w, now) {
  const tb = w.tubarao;
  return { vivo: !!tb?.vivo, t: tb?.vivo ? (now - tb.ini) / 1000 : 0, a0: tb?.a0 || 0, carcacas: Object.values(w.carcacas || {}) };
}

// tiro acertou: derruba (stun) e empurra o alvo; respeita a imunidade curta depois de levantar
function acertoArma(alvo, slot, dono, k, dir, now, fator = 1, world = null) {
  const A = ARMAS[k];
  if (!alvo) return [];
  if ((alvo.imuneUntil || 0) > now) return [{ t: 'imune', alvo: slot }];
  alvo.stunUntil = now + A.stunMs;
  alvo.imuneUntil = now + A.stunMs + TROLL.imunidadeMs * 0.6;
  alvo.empurraoAte = now + 3500;
  const h = Math.hypot(dir[0], dir[2]) || 1;
  const emp = [(dir[0] / h) * A.empurrao[0] * fator, A.empurrao[1] * fator, (dir[2] / h) * A.empurrao[0] * fator];
  return [{ t: 'atordoado', alvo: slot, por: dono, ms: A.stunMs, ate: alvo.stunUntil, arma: k, empurrao: emp }, ...(world ? largarCarcaca(world, alvo, slot) : [])];
}
// menor distância entre os segmentos ab e cd (s = posição ao longo de ab)
function segSegDist(a, b, c, d) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]], w = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const A = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], B = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], C = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const D = u[0] * w[0] + u[1] * w[1] + u[2] * w[2], E = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  const den = A * C - B * B;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (B * E - C * D) / den)) : 0;
  let t = C > 1e-9 ? Math.max(0, Math.min(1, (B * s + E) / C)) : 0;
  s = A > 1e-9 ? Math.max(0, Math.min(1, (B * t - D) / A)) : 0;
  const q = [a[0] + u[0] * s - (c[0] + v[0] * t), a[1] + u[1] * s - (c[1] + v[1] * t), a[2] + u[2] * s - (c[2] + v[2] * t)];
  return { dist: Math.hypot(q[0], q[1], q[2]), s };
}
function segSphere(a, b, c, r) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
  const t = Math.max(0, Math.min(1, (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / L));
  const q = [a[0] + ab[0] * t - c[0], a[1] + ab[1] * t - c[1], a[2] + ab[2] * t - c[2]];
  return q[0] ** 2 + q[1] ** 2 + q[2] ** 2 <= r * r;
}
function segCapsule(a, b, p0, p1, r) {
  // aproximação: amostra o segmento do projétil e mede distância ao eixo da cápsula
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    const x = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const ab = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const ap = [x[0] - p0[0], x[1] - p0[1], x[2] - p0[2]];
    const s = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
    const q = [p0[0] + ab[0] * s - x[0], p0[1] + ab[1] * s - x[1], p0[2] + ab[2] * s - x[2]];
    if (q[0] ** 2 + q[1] ** 2 + q[2] ** 2 <= r * r) return true;
  }
  return false;
}

export { hourOfDay, isNight, LAKE_R, STATIONS, ENERGIA };
