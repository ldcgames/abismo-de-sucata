// ABISMO DE SUCATA — cliente do jogo.
import { Renderer, Node } from './engine/renderer.js';
import { m4, v3, clamp, damp, dampAngle, lerp, smoothstep, angDiff } from './engine/math.js';
import { Geo, sphere, tube, cylinder, torus } from './engine/geometry.js';
import { buildTerrain, buildShaft, buildRocks, buildWrecks } from './world/terrain.js';
import { Vegetation } from './world/vegetation.js';
import { Fauna, makeFishGeo } from './world/fauna.js';
import { computeEnv } from './world/env.js';
import { Character, makeRod } from './entities/character.js';
import { buildSubModel, SubController } from './entities/submarine.js';
import { Station, fishNode, fishCutNode, textQuad } from './entities/station.js';
import { itemNode, itemMesh } from './entities/items.js';
import { weaponNode, rocketGeo } from './entities/weapons.js';
import { Statue } from './entities/statue.js';
import { Particles } from './systems/particles.js';
import { Audio } from './systems/audio.js';
import { Input } from './systems/input.js';
import { UI } from './ui/ui.js';
import { Novidades } from './game/novidades.js';
import { SoloNet, OnlineNet, servidorDisponivel, serverUrl, carregarSolo, listarSalas } from './net/net.js';
import { subStats, varaStats, estaNaEstacao, cargaUso, multDinheiro } from '../shared/rules.js';
import { terrainHeight, navSDF, STATIONS, stationById, PLAY_R, SLIDE_R, LAKE_R, depthZone, isNight, hourOfDay, SHAFT_C, CAVES, ESTATUA, chaoEstatua, colidirPedras } from '../shared/world.js';
import { ESPECIES, SUCATA, CORES_JOGADOR, TROLL, ENERGIA, ARMAS, ARMAS_ORDEM, ESTATUA_PECAS, LIXO, MOCHILA, PEIXARIA, massaPeixe } from '../shared/data.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SEM_DESENHO = params.has('semdesenho');

// ====================================================================== MENU
let corSel = +(localStorage.getItem('abismo_cor') || 0);
function setupMenu() {
  $('nome').value = localStorage.getItem('abismo_nome') || carregarSolo()?.nome || '';
  const cores = $('cores');
  CORES_JOGADOR.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = `rgb(${c.roupa.map((v) => Math.round(v * 255)).join(',')})`;
    b.title = c.nome; b.onclick = () => { corSel = i; [...cores.children].forEach((x, k) => x.classList.toggle('sel', k === i)); };
    if (i === corSel) b.classList.add('sel');
    cores.appendChild(b);
  });
  const sala = params.get('sala');
  const nome = () => { const n = $('nome').value.trim() || 'Explorador'; localStorage.setItem('abismo_nome', n); localStorage.setItem('abismo_cor', corSel); return n; };
  // solo: continua o jogo salvo no navegador (salva sozinho)
  if (carregarSolo()) $('btSolo').textContent = '▶ Continuar jogo solo';
  $('btSolo').onclick = () => iniciar(new SoloNet({ nome: nome(), cor: corSel }));
  // salas online
  const abrirSalas = async () => {
    $('salasBox').hidden = false; $('btSalas').hidden = true; $('btSolo').hidden = true;
    const lista = $('salasLista');
    lista.innerHTML = '<p class="nota">Carregando suas salas…</p>';
    try {
      const salas = await listarSalas({ nome: nome(), cor: corSel });
      if (!salas.length) { lista.innerHTML = '<p class="nota">Você ainda não tem salas. Crie uma e mande o código para os amigos, ou digite o código que um amigo te passou.</p>'; return; }
      lista.innerHTML = salas.map((x) => `<div class="salaItem">
        <div><div class="tit">${esc(x.nome)}<code>${x.code}</code></div>
        <div class="info">${x.souDono ? 'Você é o líder' : 'Líder: ' + esc(x.dono)} · ${x.jogadores} jogador(es)${x.online ? ` · <b>${x.online} online agora</b>` : ''} · sua evolução: <b>${x.progresso}%</b></div></div>
        <div class="acoes"><button data-entrar="${x.code}">Entrar</button><button class="fraco" data-copiar="${x.code}" title="Copiar código">📋</button></div>
        <div class="barra"><i style="width:${x.progresso}%"></i></div></div>`).join('');
      lista.querySelectorAll('[data-entrar]').forEach((b) => (b.onclick = () => iniciar(new OnlineNet({ nome: nome(), cor: corSel, code: b.dataset.entrar }))));
      lista.querySelectorAll('[data-copiar]').forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copiar)));
    } catch (e) { lista.innerHTML = `<p class="status ruim">${esc(e.message)}</p>`; }
  };
  $('btSalas').onclick = abrirSalas;
  $('btVoltar').onclick = () => { $('salasBox').hidden = true; $('btSalas').hidden = false; $('btSolo').hidden = false; };
  $('btCriar').onclick = () => iniciar(new OnlineNet({ nome: nome(), cor: corSel, criar: true }));
  $('btEntrar').onclick = () => { const c = $('codigo').value.trim(); if (!c) { $('codigo').focus(); return; } iniciar(new OnlineNet({ nome: nome(), cor: corSel, code: c })); };
  $('codigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btEntrar').click(); });
  const st = $('srvStatus');
  servidorDisponivel().then((ok) => {
    if (ok) {
      st.textContent = 'Servidor online encontrado: salas com até 5 jogadores.'; st.className = 'status ok';
      if (sala) { abrirSalas(); $('codigo').value = sala.toUpperCase(); }
    } else {
      st.textContent = 'Servidor multiplayer não encontrado neste endereço. O modo solo funciona; para jogar com amigos, rode "npm start" ou configure o servidor (README).';
      st.className = 'status ruim';
      $('btSalas').disabled = true;
      if (sala) st.textContent += ' O link de convite precisa do servidor para funcionar.';
    }
  });
}
function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

async function iniciar(net) {
  $('menu').hidden = true; $('carregando').hidden = false;
  try {
    const g = new Game(net);
    window.__jogo = g;
    await g.init();
  } catch (e) {
    console.warn('[menu]', e.message);
    $('carregando').hidden = true; $('menu').hidden = false;
    $('srvStatus').textContent = 'Erro: ' + e.message; $('srvStatus').className = 'status ruim';
  }
}

// ====================================================================== JOGO
const GRAV = 22;
class Game {
  constructor(net) {
    this.net = net;
    this.remotos = {}; // slot -> dados públicos
    this.t = 0; this.fpsAcc = 0; this.fpsN = 0; this.fps = 0;
    this.anims = []; this.molhado = 0; this.proj = new Map(); this.items = new Map();
  }
  setLoading(t) { $('carregandoTxt').textContent = t; }
  async init() {
    const q = params.has('q') ? +params.get('q') : this.autoQualidade();
    this.qual = clamp(q, 0, 2);
    this.setLoading('Iniciando renderizador…');
    await frame();
    const canvas = $('gl');
    this.R = new Renderer(canvas, { msaa: [0, 4, 4][this.qual], shadowSize: [1024, 2048, 2048][this.qual], shadows: this.qual > 0, pixelRatio: Math.min(devicePixelRatio || 1, [1, 1.5, 2][this.qual]), preserve: DEBUG });
    this.scene = new Node('cena');
    this.setLoading('Modelando o lago e a margem…'); await frame();
    this.terreno = buildTerrain(this.R, this.qual); this.scene.add(this.terreno);
    this.setLoading('Escavando a fenda abissal…'); await frame();
    this.shaft = buildShaft(this.R); this.scene.add(this.shaft);
    this.scene.add(buildRocks(this.R)); this.scene.add(buildWrecks(this.R));
    this.setLoading('Plantando a floresta…'); await frame();
    this.veg = new Vegetation(this.R, this.qual); this.scene.add(this.veg.root);
    this.fauna = new Fauna(this.R, this.qual); this.scene.add(this.fauna.root);
    this.setLoading('Construindo as estações…'); await frame();
    this.stations = {};
    for (const s of STATIONS) { const st = new Station(this.R, s.id); this.stations[s.id] = st; this.scene.add(st.root); st.updateVisual(null, 0, ''); }
    this.statue = new Statue(this.R); this.scene.add(this.statue.root);
    // marcador de onde o peixe vai cair (aparece com G)
    { const g = new Geo(); g.put(torus(0.6, 0.07, 28, 6), [0, 0, 0], [0, 0, 0], 1, [1, 0.45, 0.2]); g.put(cylinder(0.12, 0.12, 0.04, 12), [0, 0, 0], [0, 0, 0], 1, [1, 0.8, 0.3]);
      this.miraMarca = new Node('mira_peixe'); this.miraMarca.mesh = this.R.createMesh(g, { emissive: [1, 0.45, 0.15], glow: 1.4, castShadow: false }); this.miraMarca.visible = false; this.scene.add(this.miraMarca);
      const gd = new Geo(); gd.put(sphere(0.07, 8, 6), [0, 0, 0], [0, 0, 0], 1, [1, 0.85, 0.5]); const md = this.R.createMesh(gd, { emissive: [1, 0.8, 0.4], glow: 1.2, castShadow: false });
      this.miraPontos = []; for (let k = 0; k < 16; k++) { const n = new Node('arco'); n.mesh = md; n.visible = false; this.scene.add(n); this.miraPontos.push(n); } }
    this.particles = new Particles();
    this.audio = new Audio();
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.itemsRoot = new Node('itens'); this.scene.add(this.itemsRoot);
    this.fxRoot = new Node('efeitos'); this.scene.add(this.fxRoot);
    this.setLoading(this.net.mode === 'solo' ? 'Carregando seu progresso…' : 'Conectando ao servidor…'); await frame();
    const r = await this.net.connect();
    this.slot = r.slot; this.perfil = r.perfil; this.salaNome = r.nome || null;
    this.stations[this.slot].ativa = true;
    this.tempoBase = r.snap.tempo; this.tempoRecebido = performance.now();
    this.setupWorld(r.mundo);
    this.setupLocal(r.snap.players[this.slot]);
    this.net.on('snap', (s, proj) => this.onSnap(s, proj));
    this.net.on('ev', (ev) => this.onEvents(ev));
    this.net.on('mundo', (m) => this.setupWorld(m));
    this.net.on('perfil', (p) => { this.perfil = p; });
    this.net.on('erro', (m) => this.ui.aviso(m, 'ruim'));
    this.net.on('status', (s, ok) => this.ui.aviso(s, ok ? 'ok' : 'ruim'));
    this.initNovidades();
    this.onSnap(r.snap, []);
    $('carregando').hidden = true; $('hud').hidden = false;
    canvas.addEventListener('click', () => { if (!this.ui.aberto) this.input.lock(); this.audio.start(); });
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.ui.aberto) this.ui.fechar(); }, true);
    addEventListener('resize', () => this.R.resize(innerWidth, innerHeight));
    addEventListener('beforeunload', () => this.net.close());
    this.R.resize(innerWidth, innerHeight);
    this.ui.aviso(this.net.mode === 'solo' ? 'Modo solo — clique na tela para controlar. Vá ao terminal (E) para ver melhorias.' : `Sala ${this.net.code}: Tab mostra o convite`, 'info', 6000);
    this.ui.aviso(`Sua estação: ${stationById(this.slot).nome}. Seu submarino está no berço — chegue perto e aperte E.`, 'info', 7000);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  autoQualidade() {
    try {
      const c = document.createElement('canvas').getContext('webgl2');
      const ext = c?.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      if (/SwiftShader|llvmpipe|Software/i.test(r)) return 0;
      if (/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)) return 0;
      return 1;
    } catch { return 1; }
  }

  // ------------------------------------------------------------ mundo / itens
  setupWorld(m) {
    for (const c of [...this.itemsRoot.children]) this.itemsRoot.remove(c);
    this.items = new Map();
    for (const it of m.items) this.addItem(it);
    this.proj = new Map();
  }
  addItem(it) {
    // peça da estátua que você já pegou não aparece mais para você (os amigos ainda veem a deles)
    if (it.pessoal && this.perfil?.estatua?.achadas?.includes(SUCATA[it.tipo]?.estatua)) return;
    const n = itemNode(this.R, it); this.itemsRoot.add(n); this.items.set(it.id, n);
  }

  // ------------------------------------------------------------ jogador local
  setupLocal(pub) {
    const p = this.perfil;
    this.me = {
      pos: pub.pos.slice(), vel: [0, 0, 0], yaw: pub.rot || 0, modo: 'terra', grounded: true, swim: false,
      camYaw: (pub.rot || 0), camPitch: -0.25, camDist: 4.6, camModo: 'terceira', subCam: 'terceira',
      stunUntil: 0, acao: null, vara: false, segura: null, arma: null, voo: null,
    };
    this.myChar = new Character(this.R, p.cor, this.slotIndex(this.slot));
    this.scene.add(this.myChar.root);
    this.rodNode = null;
    this.sub = new SubController();
    const st = this.stations[this.slot];
    this.cradlePos = st.toWorld(0, 3.72, st.zCradle);
    this.launchPos = st.toWorld(st.xLaunch, -0.45, st.zLaunch);
    this.sub.pos = this.cradlePos.slice(); this.sub.yaw = st.yaw;
    this.sub.bateria = subStats(p).bateria; this.sub.oxigenio = subStats(p).oxigenio;
    this.crane = { estado: 'berco', t: 0 };
    this.subModels = {};
    this.pesca = { estado: 'off' };
    this.bracoAnim = null;
    this.tinta = false; this.tintaLavando = 0;
    this.sonarPing = -99;
    this.cam = { pos: [0, 5, 0], view: m4.create(), proj: m4.create(), near: 0.12, far: 3000, fov: 1.05 };
  }
  slotIndex(s) { return STATIONS.findIndex((x) => x.id === s); }

  // ------------------------------------------------------------ ações (sempre pelo servidor)
  async acao(a) {
    const { res, perfil } = await this.net.action(a);
    if (perfil) this.perfil = perfil;
    if (res.ok) { if (res.msg) this.ui.aviso(res.msg, 'ok'); if (/Vendido|Contrato concluído/.test(res.msg || '')) this.audio.coin(); }
    else if (!res.dup) { this.ui.aviso(res.msg || 'Ação recusada', 'ruim'); this.audio.erro(); if (DEBUG) console.log('[recusada]', a, res.msg); }
    this.ui.render();
    return res;
  }
  async acaoMao(tipo) {
    if (tipo === 'aquario' || tipo === 'tanque') return this.acao({ tipo: 'peixe_aquario' });
    if (tipo === 'caixa') return this.acao({ tipo: 'peixe_caixa' });
    if (tipo === 'mochila') return this.acao({ tipo: 'mochila_guardar' });
    if (tipo === 'vender') return this.acao({ tipo: 'peixe_vender' });
    if (tipo === 'tinta') { this.me.acao = { tipo: 'bancada', t: 0, dur: 1.4 }; return this.acao({ tipo: 'processar_lula' }); }
    if (tipo === 'soltar') return this.soltarPeixe();
    if (tipo === 'arremessar') return this.arremessar();
  }
  // bancada de peixe: animação de cortar (2 s, com o som da faca) e depois o servidor marca como cortado
  cortarPeixe() {
    this.cortando = true;
    this.me.acao = { tipo: 'bancada', t: 0, dur: 2.0 };
    for (let k = 0; k < 6; k++) setTimeout(() => { this.audio.blip(180 + Math.random() * 60, 0.05, 'square', 0.07, -80); this.audio.noise?.(0.05, 2400, 0.05, 1); }, 150 + k * 300);
    setTimeout(async () => { await this.acao({ tipo: 'peixaria_cortar' }); this.cortando = false; }, 1900);
  }
  async soltarPeixe() {
    const f = this.perfil.mao; if (!f) return;
    const r = await this.acao({ tipo: 'peixe_soltar' });
    if (r.ok && !ESPECIES[f.esp]?.cacado) this.peixeVoltaAgua(f, this.me.pos);
  }
  peixeVoltaAgua(f, pos) {
    // anima o peixe voltando à água (ou sumindo suavemente em terra)
    const n = fishNode(this.R, f.esp, f.cm);
    const p0 = [pos[0], pos[1] + 1.1, pos[2]];
    const alvo = this.aguaMaisProxima(pos, 9);
    this.fxRoot.add(n);
    this.anims.push({ dur: alvo ? 0.9 : 0.6, t: 0, upd: (k) => {
      if (alvo) {
        const x = lerp(p0[0], alvo[0], k), z = lerp(p0[2], alvo[2], k), y = lerp(p0[1], -0.2, k) + Math.sin(k * Math.PI) * 1.5;
        n.at(x, y, z).rot(k * 6, 0, 0);
      } else { n.at(p0[0], p0[1] - k * 0.6, p0[2]).sc(f.cm / 100 * (1 - k)); }
    }, fim: () => { this.fxRoot.remove(n); if (alvo) { this.particles.splash(alvo[0], alvo[2], this.t, 0.15); this.audio.splash(0.3); } } });
  }
  pertoDaAgua() {
    // no píer ou com água a até ~4 m
    const me = this.me;
    for (const s of Object.values(this.stations)) { if (!s.ativa) continue; const l = s.toLocal(me.pos); if (Math.abs(l[0]) < 2.4 && l[2] > 18 && l[2] < s.zDockEnd + 1) return true; }
    return !!this.aguaMaisProxima(me.pos, 4);
  }
  aguaMaisProxima(p, raio) {
    let best = null, bd = 1e9;
    for (let a = 0; a < 12; a++) for (let r = 1; r <= raio; r += 1) {
      const x = p[0] + Math.cos((a / 12) * 6.28) * r, z = p[2] + Math.sin((a / 12) * 6.28) * r;
      if (terrainHeight(x, z) < -0.6 && r < bd) { bd = r; best = [x, 0, z]; }
    }
    return best;
  }
  // calcula a direção do arremesso para o peixe cair exatamente onde a mira (centro da tela) aponta,
  // com a mesma física do servidor, e devolve a trajetória para desenhar
  miraPeixe(lixo = false) {
    const tub = !lixo && !!ESPECIES[this.perfil.mao?.esp]?.pesado && !this.perfil.mao?.cortado;
    const v = TROLL.peixeVelocidade * (tub ? 0.75 : 1), alc = (tub ? TROLL.tubaraoAlcance : TROLL.peixeAlcance) + 6;
    const c = this.cam.pos, f = this.camForwardVis();
    // 1) ponto mirado: terreno, água ou um amigo
    let alvo = null;
    for (let t = 1; t < 70 && !alvo; t += 0.5) {
      const x = c[0] + f[0] * t, y = c[1] + f[1] * t, z = c[2] + f[2] * t;
      if (y < Math.max(terrainHeight(x, z), 0)) { alvo = [x, Math.max(terrainHeight(x, z), 0), z]; break; }
      for (const r of Object.values(this.remotos)) { const ip = r.char.root.pos; if ((r.modo === 'terra' || r.modo === 'nadando') && Math.hypot(x - ip[0], z - ip[2]) < 0.5 && y > ip[1] && y < ip[1] + 1.8) { alvo = [x, y, z]; break; } }
    }
    const me = this.me;
    if (!alvo) alvo = [c[0] + f[0] * 70, c[1] + f[1] * 70, c[2] + f[2] * 70];
    let hx = alvo[0] - me.pos[0], hz = alvo[2] - me.pos[2]; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const O = [me.pos[0] + hx * 0.8, me.pos[1] + 1.4, me.pos[2] + hz * 0.8];
    const d = Math.max(0.5, Math.hypot(alvo[0] - O[0], alvo[2] - O[2])), h = alvo[1] - O[1];
    // 2) menor ângulo que acerta o ponto (arco baixo); se for longe demais, o ângulo de alcance máximo
    let ang = null;
    for (let th = -0.6; th <= 1.0; th += 0.005) {
      const vx = v * Math.cos(th), vy = v * Math.sin(th) + 2.0, t = d / vx;
      if (Math.abs(vy * t - 4.905 * t * t - h) < 0.25) { ang = th; break; }
    }
    if (ang === null) ang = 0.62;
    const dir = [hx * Math.cos(ang), Math.sin(ang), hz * Math.cos(ang)];
    // 3) trajetória real até cair (para o marcador)
    const pts = []; let p = O.slice(), vel = [dir[0] * v, dir[1] * v + 2, dir[2] * v], queda = null;
    for (let k = 0; k < 200; k++) {
      vel[1] -= 9.81 * 0.03; p = [p[0] + vel[0] * 0.03, p[1] + vel[1] * 0.03, p[2] + vel[2] * 0.03];
      if (k % 3 === 0) pts.push(p.slice());
      // acerta um amigo no caminho: o marcador fica nele
      let noAmigo = null;
      for (const r of Object.values(this.remotos)) { const ip = r.char.root.pos; if ((r.modo === 'terra' || r.modo === 'nadando') && Math.hypot(p[0] - ip[0], p[2] - ip[2]) < 0.55 && p[1] > ip[1] - 0.1 && p[1] < ip[1] + 1.8) { noAmigo = [ip[0], ip[1] + 0.05, ip[2]]; break; } }
      if (noAmigo) { queda = noAmigo; break; }
      const g = terrainHeight(p[0], p[2]);
      if (p[1] < Math.max(g, 0)) { queda = [p[0], Math.max(g, 0) + 0.05, p[2]]; break; }
      if (Math.hypot(p[0] - me.pos[0], p[2] - me.pos[2]) > alc) { queda = null; break; }
    }
    return { dir, pts, queda };
  }
  desenharMira(ativo) {
    if (!ativo) { this.miraMarca.visible = false; for (const n of this.miraPontos) n.visible = false; return; }
    const m = this.miraPeixe(!this.perfil.mao);
    this.miraMarca.visible = !!m.queda;
    if (m.queda) this.miraMarca.at(m.queda[0], m.queda[1], m.queda[2]).sc(1 + 0.12 * Math.sin(this.t * 6));
    const passo = Math.max(1, Math.floor(m.pts.length / this.miraPontos.length));
    this.miraPontos.forEach((n, i) => { const q = m.pts[i * passo + 1]; n.visible = !!q; if (q) n.at(q[0], q[1], q[2]); });
  }
  async arremessar() {
    const p = this.perfil;
    if (!p.mao) return;
    if (this.me.modo !== 'terra') { this.ui.aviso('Arremesse de terra firme ou do cais', 'ruim'); return; }
    const tub = !!ESPECIES[p.mao.esp].pesado && !p.mao.cortado;
    const dir = this.miraPeixe().dir;
    this.me.yaw = Math.atan2(dir[0], dir[2]);
    this.me.acao = { tipo: tub ? 'arremesso_tubarao' : 'arremesso', t: 0, dur: 0.8 };
    const r = await this.acao({ tipo: 'arremessar_peixe', dir });
    if (!r.ok) this.me.acao = null;
  }

  // ------------------------------------------------------------ rede: snapshots e eventos
  onSnap(s, proj) {
    this.tempoBase = s.tempo; this.tempoRecebido = performance.now();
    if (this.kr) this.snapNovidades(s);
    const agora = performance.now();
    const vistos = new Set();
    for (const [slot, pl] of Object.entries(s.players)) {
      vistos.add(slot);
      if (slot === this.slot) { this.meuPub = pl; continue; }
      let r = this.remotos[slot];
      if (!r) {
        r = this.remotos[slot] = { ...pl, buf: [], char: new Character(this.R, pl.cor, this.slotIndex(slot)), prevSubY: pl.sub.pos[1] };
        this.scene.add(r.char.root);
        if (this.ui) this.ui.aviso(`${pl.nome} está na ${stationById(slot).nome}`, 'info');
      }
      Object.assign(r, pl);
      r.buf.push({ t: agora, pos: pl.pos.slice(), rot: pl.rot, sub: { pos: pl.sub.pos.slice(), rot: pl.sub.rot } });
      if (r.buf.length > 8) r.buf.shift();
    }
    for (const slot of Object.keys(this.remotos)) if (!vistos.has(slot)) {
      const r = this.remotos[slot];
      this.scene.remove(r.char.root);
      if (this.subModels[slot]) { this.scene.remove(this.subModels[slot].m.root); delete this.subModels[slot]; }
      if (r.rod) r.rod = null;
      delete this.remotos[slot];
      this.stations[slot].updateVisual(null, 0, '');
    }
    // projéteis do servidor
    const ids = new Set();
    for (const p of proj) {
      ids.add(p.id);
      let v = this.proj.get(p.id);
      if (!v) v = this.criarProjetil(p);
      v.pos = p.pos.slice(); v.vel = p.vel.slice();
    }
    for (const [id, v] of this.proj) if (!ids.has(id) && v.servidor && agora - v.criado > 400) { this.fxRoot.remove(v.n); this.proj.delete(id); }
  }
  criarProjetil(p) {
    let n;
    if (p.tipo === 'balao') {
      const g = new Geo(); g.put(sphere(0.22, 14, 10), [0, 0, 0], [0, 0, 0], [1, 1.15, 1], [0.15, 0.05, 0.2]);
      g.put(cylinder(0.03, 0.05, 0.08, 8), [0, -0.27, 0], [0, 0, 0], 1, [0.6, 0.2, 0.5]);
      n = new Node('balao'); n.mesh = this.R.createMesh(g, { rough: 0.15 });
    } else if (p.tipo === 'foguete') {
      n = new Node('foguete'); n.mesh = this.R.createMesh(rocketGeo(), { rough: 0.5, metal: 0.4 });
      this.audio.noise(0.9, 300, 0.35, 1); this.audio.blip(120, 0.5, 'sawtooth', 0.08, -60);
    } else if (p.tipo === 'lixo') {
      n = itemNode(this.R, { id: 'voando', tipo: p.lixo || 'latinha', x: 0, y: 0, z: 0, rot: 0 });
    } else n = fishNode(this.R, p.esp || 'tilapia', p.tipo === 'tubarao' ? 300 : 40);
    this.fxRoot.add(n);
    const v = { n, pos: p.pos.slice(), vel: p.vel.slice(), tipo: p.tipo, criado: performance.now(), servidor: true };
    this.proj.set(p.id, v);
    return v;
  }
  onEvents(evs) {
    for (const e of evs) {
      if (this.kr && this.eventoNovidades(e)) continue;
      switch (e.t) {
        case 'item_removido': {
          const n = this.items.get(e.id);
          if (n && e.por === this.slot && this.bracoAnim && this.bracoAnim.id === e.id) { this.items.delete(e.id); break; }
          if (n && SUCATA[n.item.tipo]?.terra) {
            this.items.delete(e.id);
            const quem = e.por === this.slot ? this.me.pos : this.remotos[e.por]?.pos;
            const p0 = n.pos.slice();
            this.anims.push({ dur: 0.45, t: 0, upd: (k) => { if (quem) n.at(lerp(p0[0], quem[0], k), lerp(p0[1], quem[1] + 1.0, k) + Math.sin(k * Math.PI) * 0.3, lerp(p0[2], quem[2], k)); n.sc(1 - k * 0.8); }, fim: () => this.itemsRoot.remove(n) });
            if (e.por === this.slot) this.audio.blip(700, 0.08, 'square', 0.04, 300);
            break;
          }
          if (n) {
            this.items.delete(e.id);
            const slot = e.por;
            const alvoSub = slot === this.slot ? this.sub.pos : this.remotos[slot]?.sub.pos;
            const p0 = n.pos.slice();
            this.anims.push({ dur: 0.7, t: 0, upd: (k) => { if (alvoSub) n.at(lerp(p0[0], alvoSub[0], k), lerp(p0[1], alvoSub[1] - 0.6, k), lerp(p0[2], alvoSub[2], k)); n.sc(1 - k * 0.6); }, fim: () => this.itemsRoot.remove(n) });
            if (slot === this.slot) this.audio.claw();
            if (e.ajudantes?.includes(this.slot)) this.ui.aviso('Você ajudou a içar uma carga pesada!', 'ok');
          }
          break;
        }
        case 'item_novo': if (!this.items.has(e.item.id)) this.addItem(e.item); break;
        case 'projetil': if (!this.proj.has(e.pr.id)) this.criarProjetil({ ...e.pr, esp: e.pr.peixe?.esp }); if (e.pr.tipo === 'balao') this.audio.blip(300, 0.2, 'sine', 0.15, 200); break;
        case 'projetil_fim': {
          const v = this.proj.get(e.id);
          if (v) { this.fxRoot.remove(v.n); this.proj.delete(e.id); }
          if (e.res === 'explosao') { this.explosao(e.pos, e.agua); break; }
          if (e.res === 'acerto' && v?.tipo === 'balao') { this.particles.ink(e.pos, 90); this.audio.splat(); }
          else if (e.res === 'acerto') { this.particles.confetti(e.pos, 40); }
          else if (e.res === 'casco') { this.particles.ink(e.pos, 25); this.audio.clank(0.5); }
          else if (e.agua) { this.particles.splash(e.pos[0], e.pos[2], this.t, 0.25); this.audio.splash(0.3); }
          else if (e.res === 'imune') { this.ui.aviso('Ainda protegido (imunidade após atordoamento)', 'info'); }
          break;
        }
        case 'atordoado': {
          const quem = e.por === this.slot ? 'Você' : (this.remotos[e.por]?.nome || 'Alguém');
          const armaNome = e.arma ? ARMAS[e.arma].nome.toLowerCase() : null;
          if (e.alvo === this.slot) {
            this.me.stunUntil = performance.now() + e.ms;
            this.me.stunTub = !!e.tubarao;
            this.me.emote = null; this.roda = null; this.me.mirando = false; this.me.mirandoLixo = false;
            // vira de frente para quem acertou: cai de costas, para longe dele
            const de = e.empurrao && Math.hypot(e.empurrao[0], e.empurrao[2]) > 0.1 ? [-e.empurrao[0], -e.empurrao[2]] : (() => { const o = e.por === this.slot ? null : this.remotos[e.por]?.char.root.pos; return o ? [o[0] - this.me.pos[0], o[2] - this.me.pos[2]] : null; })();
            if (de) this.me.yaw = Math.atan2(de[0], de[1]);
            if (e.empurrao) {
              // o tiro joga você longe (mais forte quanto mais forte a arma)
              this.me.voo = { v: [e.empurrao[0], e.empurrao[2]], t: 0 };
              this.me.vel[1] = e.empurrao[1]; this.me.grounded = false; this.me.pos[1] += 0.05;
              this.me.escorrega = null; this.me.emote = null; this.roda = null;
              if (this.pesca.estado !== 'off') this.cancelarPesca();
            }
            $('acertado').hidden = false;
            $('acertado').querySelector('.t').textContent = e.arma ? (e.arma === 'bazuca' ? 'BOOOM! VOCÊ VOOU LONGE!' : 'VOCÊ LEVOU UM TIRO!') : e.lixo ? 'LIXO NA CARA!' : e.tubarao ? 'VOCÊ FOI MORDIDO POR UM TUBARÃO!' : 'VOCÊ FOI ACERTADO POR UM PEIXE!';
            $('acertadoSub').textContent = e.arma ? `${quem} acertou você com ${e.arma === 'bazuca' ? 'a bazuca' : 'a ' + armaNome} — ${e.ms / 1000} s no chão` : e.lixo ? `${quem} acertou você com o estilingue (${SUCATA[e.lixo]?.nome || 'lixo'}) — ${e.ms / 1000} s no chão` : `${quem} jogou ${e.tubarao ? 'um tubarão' : 'um peixe'} em você — ${e.ms / 1000} s no chão`;
            clearTimeout(this.acertTimer); this.acertTimer = setTimeout(() => { $('acertado').hidden = true; }, e.ms);
            e.tubarao ? this.audio.chomp() : this.audio.bonk();
            this.shake = 0.6;
          } else {
            const alvo = this.remotos[e.alvo]?.nome || 'alguém';
            this.ui.aviso(`${quem} acertou ${alvo} com ${e.arma ? (e.arma === 'bazuca' ? 'a BAZUCA' : 'a ' + armaNome) : e.lixo ? 'o estilingue de lixo' : e.tubarao ? 'um TUBARÃO' : 'um peixe'}!`, 'info');
            if (e.por === this.slot) { e.tubarao ? this.audio.chomp() : this.audio.bonk(); }
          }
          break;
        }
        case 'tiro': this.efeitoTiro(e); break;
        case 'missao_ok':
          if (e.slot === this.slot) { this.ui.aviso(`🎯 Missão concluída: ${e.txt} — +S$ ${e.premio}`, 'ok', 4000); this.audio.coin(); }
          else if (this.remotos[e.slot]) this.ui.aviso(`${this.remotos[e.slot].nome} concluiu uma missão (+S$ ${e.premio})`, 'info', 2500);
          break;
        case 'estatua': if (e.slot === this.slot && e.completa) this.zerou(); break;
        case 'fim_atordoado': if (e.alvo === this.slot) { this.me.stunUntil = 0; $('acertado').hidden = true; } break;
        case 'corrigir': if (e.slot === this.slot) { this.me.pos = e.pos.slice(); this.me.vel = [0, 0, 0]; } break;
        case 'tinta': {
          if (e.alvo === this.slot) {
            if (e.on) { this.tinta = true; this.tintaT = 0; this.audio.splat(); this.ui.aviso('Seu vidro foi coberto de tinta de lula! Use o sonar e suba (Q) até a superfície.', 'ruim', 6000); }
            else { this.tinta = false; this.tintaLavando = 1; this.audio.wash(); this.ui.aviso('Vidro lavado pela água da superfície', 'ok'); }
          } else {
            const quem = e.por === this.slot ? 'Você' : (this.remotos[e.por]?.nome || 'Alguém');
            if (e.on) this.ui.aviso(`${quem} acertou um balão de tinta no vidro de ${this.remotos[e.alvo]?.nome || 'alguém'}!`, 'info');
          }
          break;
        }
        case 'entrou': if (e.slot !== this.slot) this.ui.aviso(`${e.nome} entrou na sala`, 'ok'); break;
        case 'caiu': if (this.remotos[e.slot]) this.ui.aviso(`${this.remotos[e.slot].nome} perdeu a conexão (vaga reservada por 90 s)`, 'info'); break;
        case 'saiu': break;
        case 'pescou': if (e.slot !== this.slot) this.ui.aviso(`${this.remotos[e.slot]?.nome || 'Alguém'} pescou ${ESPECIES[e.peixe.esp].nome} (${e.peixe.cm} cm)`, 'info'); break;
        case 'descoberta': if (e.slot === this.slot) { this.ui.aviso(`Local descoberto: ${e.nome}!`, 'ok', 5000); this.audio.coin(); } break;
        case 'soltou': if (e.slot !== this.slot) this.peixeVoltaAgua(e.peixe, e.pos); break;
        case 'bancada': {
          const st = this.stations[e.slot];
          const p = e.maquina === 'tinta' ? st.toWorld(-8.3, 3.6, 13) : st.toWorld(-13, 3.0, -2.5);
          if (e.maquina === 'tinta') this.particles.ink(p, 30); else for (let k = 0; k < 20; k++) this.particles.emit({ p, v: [(Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3], life: 0.6, size: 0.05, col: [1, 0.8, 0.3, 1], add: true, g: 9.8 });
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ laço principal
  loop(now) {
    const real = (now - this.last) / 1000;
    const dt = Math.min(0.05, real); this.last = now;
    this.t += dt;
    this.fpsAcc += real; this.fpsN++;
    if (this.fpsAcc > 1) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    // ?semdesenho: modo de teste automatizado (simula sem desenhar; o renderizador por software é lento demais)
    try { this.update(dt, now); if (!SEM_DESENHO || !this.desenhouUmaVez) { this.draw(); this.desenhouUmaVez = true; } } catch (e) { console.error(e); if (!this.erroMostrado) { this.erroMostrado = true; this.ui.aviso('Erro interno: ' + e.message, 'ruim', 8000); } }
    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
  // avança a simulação sem desenhar (usado pelos testes automatizados)
  step(n = 1, dt = 0.05) { for (let i = 0; i < n; i++) { this.t += dt; this.update(dt, performance.now()); this.input.endFrame(); } }
  get worldTime() { return this.tempoBase + (performance.now() - this.tempoRecebido) / 1000 + (this.tempoExtra || 0); }

  update(dt, now) {
    this.dtQuadro = dt;
    const I = this.input, p = this.perfil;
    this.anims ||= [];
    // painéis/atalhos
    if (!this.ui.aberto) {
      if (I.hit('KeyI') && !(this.pertoPeixaria && p.peixaria)) this.ui.abrir('inventario'); // perto da tábua com peixe, I corta/pega
      if (I.hit('KeyJ')) this.ui.abrir('mapa');
      if (I.hit('Tab')) this.ui.abrir('sala');
    } else if (I.hit('KeyI') || I.hit('Tab') || I.hit('KeyJ')) this.ui.fechar();
    const livre = !this.ui.aberto;
    // olhar com o mouse
    const sens = 0.0021 * (this.zoom ? 0.3 : 1);
    if (livre && !this.roda) {
      // limite por quadro: mesmo com queda de FPS a câmera não dá "pulos"
      const dx = clamp(I.mouse.dx + I.touch.look[0], -160, 160), dy = clamp(I.mouse.dy + I.touch.look[1], -160, 160);
      this.me.camYaw -= dx * sens;
      this.me.camPitch = clamp(this.me.camPitch - dy * sens, -1.25, 1.0);
    }
    // câmera visível segue o alvo do mouse com suavização exponencial (sem trancos)
    this.me.vYaw = this.me.vYaw === undefined ? this.me.camYaw : dampAngle(this.me.vYaw, this.me.camYaw, 26, dt);
    this.me.vPitch = this.me.vPitch === undefined ? this.me.camPitch : damp(this.me.vPitch, this.me.camPitch, 26, dt);
    const stunned = performance.now() < this.me.stunUntil;
    if (this.me.modo === 'terra' || this.me.modo === 'nadando') this.updateWalk(dt, livre && !stunned, stunned);
    else if (this.me.modo === 'entrando') this.cameraTerra(dt);
    else this.updateSub(dt, livre && !this.corridaTravada());
    // gesto/dança: termina ao andar ou depois de um tempo (sentado fica até mexer)
    if (this.me.emote) {
      this.me.emote.t += dt;
      const andando = Math.hypot(this.me.vel[0], this.me.vel[2]) > 0.6 || this.me.modo !== 'terra' || this.pesca.estado !== 'off' || this.me.mirando;
      if (andando || (this.me.emote.i !== 2 && this.me.emote.t > [2.2, 6, 0, 2.6, 6, 8][this.me.emote.i])) this.me.emote = null;
    }
    // ação temporizada do personagem
    if (this.me.acao) { this.me.acao.t += dt; if (this.me.acao.t > this.me.acao.dur) this.me.acao = null; }
    this.updateFishing(dt, livre && !stunned);
    // personagem local
    const ch = this.myChar;
    const speedH = Math.hypot(this.me.vel[0], this.me.vel[2]);
    ch.root.visible = !(this.me.modo === 'sub' || this.me.modo === 'guindaste');
    ch.root.at(this.me.pos[0], this.me.pos[1], this.me.pos[2]).rot(0, this.me.yaw, 0);
    if (this.me.modo !== 'terra' || p.mao || this.me.arma) this.me.mirandoLixo = false;
    this.me.segura = p.mao ? (ESPECIES[p.mao.esp].pesado ? 'tubarao' : this.me.mirando ? 'mira' : 'peixe') : this.me.mirandoLixo ? 'mira' : p.lixoMao ? 'peixe' : this.pesca.estado !== 'off' ? 'vara' : this.me.arma && (this.me.modo === 'terra') ? 'arma' : null;
    ch.update(dt, { speed: this.me.modo === 'terra' ? speedH : 0, grounded: this.me.modo === 'entrando' ? false : this.me.grounded, mode: this.me.modo === 'entrando' ? 'terra' : this.me.modo, segura: this.me.segura, acao: this.me.acao || (this.pesca.estado === 'brigando' ? { tipo: 'recolher', t: 0 } : null), atordoado: stunned ? 1 : 0, tubarao: this.me.stunTub, emote: this.me.escorrega ? { i: 2, t: this.me.escorrega.t } : this.me.emote, miraPitch: this.me.vPitch || 0, coice: this.coice || 0 });
    this.coice = damp(this.coice || 0, 0, 14, dt);
    this.updateArmaMao(ch, this.me.modo === 'terra' ? this.me.arma : null);
    this.desenharMira((this.me.mirando && !!this.perfil.mao || this.me.mirandoLixo) && this.me.modo === 'terra');
    this.updateLixoMao(ch, this.me.modo === 'terra' ? p.lixoMao?.tipo || null : null);
    if (!this.me.arma || this.me.modo !== 'terra') { $('hudArma').hidden = true; this.zoom = false; }
    $('miraArma').hidden = !(this.me.arma && this.me.modo === 'terra' && !this.zoom);
    $('luneta').hidden = !this.zoom;
    // estátua mostra o SEU progresso (cada jogador monta a sua)
    const ek = this.perfil.estatua.colocadas.join(',');
    if (this.statueKey !== ek) { this.statueKey = ek; this.statue.atualizar(this.perfil.estatua.colocadas, multDinheiro(this.perfil)); }
    this.updateHeld(ch, p.mao, 'local');
    // remotos
    this.updateRemotes(dt);
    this.updateNovidades(dt, livre);
    // estações (visual por perfil público)
    for (const s of STATIONS) {
      const st = this.stations[s.id];
      // a base só existe quando tem alguém nela (as outras vagas ficam livres, sem construção)
      st.ativa = s.id === this.slot || !!this.remotos[s.id];
      let est = null, cor = 0, nome = '';
      if (s.id === this.slot) { est = { ...p.estacao, aquario: p.aquario, tanque: p.tanque, vitrine: p.vitrine, depositoN: p.deposito.length, peixariaEst: p.peixaria || null }; cor = p.cor; nome = p.nome; }
      else if (this.remotos[s.id]) { const r = this.remotos[s.id]; est = { ...r.estacao, depositoN: r.estacao.cargaN || 0, peixariaEst: r.peixaria || null }; cor = r.cor; nome = r.nome; }
      st.updateVisual(est, cor, nome);
      st.animateFish(dt, this.t);
    }
    // submarinos (modelos + guindastes)
    this.updateSubModels(dt);
    // projéteis previstos localmente entre snapshots
    for (const v of this.proj.values()) {
      if (v.tipo === 'balao') { v.vel[1] += 0.6 * dt; const k = Math.exp(-0.35 * dt); v.vel = v.vel.map((x) => x * k); }
      else if (v.tipo === 'foguete') v.vel[1] -= 1.2 * dt;
      else v.vel[1] -= 9.81 * dt;
      for (let j = 0; j < 3; j++) v.pos[j] += v.vel[j] * dt;
      if (v.tipo === 'foguete') {
        const h = Math.hypot(v.vel[0], v.vel[2]);
        v.n.at(v.pos[0], v.pos[1], v.pos[2]).rot(-Math.atan2(v.vel[1], h), Math.atan2(v.vel[0], v.vel[2]), this.t * 10);
        for (let k = 0; k < 3; k++) this.particles.emit({ p: v.pos.slice(), v: [(Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6], life: 1.6, size: 0.25 + Math.random() * 0.2, col: [0.72, 0.72, 0.72, 0.5], g: -0.4, drag: 1.2, kind: 'fumaca', grow: 0.9 });
        this.particles.emit({ p: v.pos.slice(), v: [-v.vel[0] * 0.05, 0, -v.vel[2] * 0.05], life: 0.12, size: 0.35, col: [1, 0.6, 0.2, 1], g: 0, drag: 0, kind: 'fogo', add: true });
      } else v.n.at(v.pos[0], v.pos[1], v.pos[2]).rot(this.t * 8, Math.atan2(v.vel[0], v.vel[2]), 0);
      if (v.tipo === 'balao' && Math.random() < 0.3) this.particles.bubbles(v.pos, 1, 0.1);
    }
    // animações curtas
    for (let i = this.anims.length - 1; i >= 0; i--) { const a = this.anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur); a.upd(k); if (k >= 1) { a.fim?.(); this.anims.splice(i, 1); } }
    // interação a pé
    this.updatePrompt(livre);
    // fauna, vegetação, partículas
    const avoid = [this.sub.pos, ...Object.values(this.remotos).map((r) => r.sub.pos)];
    this.fauna.update(dt, this.cam.pos, hourOfDay(this.worldTime), avoid);
    this.veg.updateLod(this.cam.pos);
    const env = this.envAtual;
    if (env) this.particles.update(dt, this.t, env);
    // neve marinha ao redor da câmera submersa
    if (this.cam.pos[1] < -3 && Math.random() < 0.9) {
      for (let k = 0; k < 3; k++) this.particles.emit({ p: [this.cam.pos[0] + (Math.random() - 0.5) * 30, this.cam.pos[1] + (Math.random() - 0.5) * 20, this.cam.pos[2] + (Math.random() - 0.5) * 30], v: [0, -0.15, 0], life: 6, size: 0.03 + Math.random() * 0.04, col: [0.75, 0.8, 0.75, 0.5], g: 0, drag: 0, kind: 'neve' });
    }
    // envia estado (15 Hz)
    this.sendAcc = (this.sendAcc || 0) + dt;
    if (this.sendAcc > 1 / 15) {
      this.sendAcc = 0;
      this.net.sendState({
        pos: this.me.pos.map((v) => +v.toFixed(3)), rot: +this.me.yaw.toFixed(3), modo: this.me.modo, anim: this.animNome(), arma: this.me.modo === 'terra' ? this.me.arma : null, mic: !!this.voz?.ligado,
        sub: { pos: this.sub.pos.map((v) => +v.toFixed(3)), rot: +this.sub.yaw.toFixed(3), pitch: +this.sub.pitchVis.toFixed(3), luz: this.sub.luzes, estado: this.crane.estado, braco: this.bracoAnim ? 1 : 0, gancho: this.crane.ganchoY || 0 },
        pescaVis: this.pesca.bobber ? { b: this.pesca.bobber.map((v) => +v.toFixed(2)), e: this.pesca.estado } : null,
      });
    }
    // HUD
    const zona = this.me.modo === 'terra' ? (estaNaEstacao({ slot: this.slot, modo: 'terra', pos: this.me.pos }) ? stationById(this.slot).nome : 'Margem do lago') : depthZone(-this.sub.pos[1]).nome;
    this.ui.hud(p, { hora: hourOfDay(this.worldTime), noite: isNight(hourOfDay(this.worldTime)), zona, rede: this.net.mode === 'solo' ? 'Solo (salvo no navegador)' : (this.net.status || ''), fps: DEBUG || params.has('fps') ? this.fps : 0, ranking: this.rankingHtml() });
    this.ui.maoUi(p, this.naEstacao());
    if (this.camOverride) this.setCam(this.camOverride.pos, this.camOverride.alvo, this.camOverride.fov || 1.0);
    this.audio.update(dt, { camDepth: -this.cam.pos[1], vento: 0.3, dia: env ? env.day : 1, motor: { on: this.me.modo === 'sub' && this.crane.estado === 'livre', thr: this.sub.thrust }, estresse: this.sub.estresse });
  }
  animNome() { if (this.me.escorrega) return 'escorrega'; if (this.me.mirando || this.me.mirandoLixo) return 'mira'; if (this.me.emote) return 'emote' + this.me.emote.i; return this.me.modo === 'nadando' ? 'nado' : Math.hypot(this.me.vel[0], this.me.vel[2]) > 3.5 ? 'corre' : Math.hypot(this.me.vel[0], this.me.vel[2]) > 0.3 ? 'anda' : 'parado'; }
  naEstacao() {
    return estaNaEstacao({ slot: this.slot, modo: this.me.modo, pos: this.me.pos, sub: { pos: this.sub.pos } });
  }
  camForward() {
    // mira usa o alvo do mouse (preciso); a câmera desenhada usa a versão suavizada
    const cy = Math.cos(this.me.camPitch);
    return [Math.sin(this.me.camYaw) * cy, Math.sin(this.me.camPitch), Math.cos(this.me.camYaw) * cy];
  }

  // ------------------------------------------------------------ andar / nadar
  groundAt(x, z) {
    let h = terrainHeight(x, z);
    for (const s of Object.values(this.stations)) {
      if (!s.ativa) continue;
      const l = s.toLocal([x, 0, z]);
      if (Math.abs(l[0]) < 17 && l[2] > -13 && l[2] < 17) h = Math.max(h, 1.55);
      if (Math.abs(l[0]) < 2.1 && l[2] >= 14 && l[2] < s.zDockEnd) h = Math.max(h, 1.28);
    }
    // degraus da praça da estátua
    const he = chaoEstatua(x, z); if (he !== null) h = Math.max(h, he);
    return h;
  }
  collideStations(pos) {
    // bloco de mármore da estátua
    { const R = 2.45 * ESTATUA.escala, dx = pos[0] - ESTATUA.x, dz = pos[2] - ESTATUA.z, d = Math.hypot(dx, dz) || 1; if (d < R) { pos[0] = ESTATUA.x + (dx / d) * R; pos[2] = ESTATUA.z + (dz / d) * R; } }
    for (const s of Object.values(this.stations)) {
      if (!s.ativa) continue;
      const l = s.toLocal(pos);
      if (Math.abs(l[0]) > 30 || Math.abs(l[2]) > 70) continue;
      const est = s.slot === this.slot ? this.perfil.estacao : this.remotos[s.slot]?.estacao;
      for (const b of s.colisores()) {
        if (b.auto === 'rec' && !est?.reciclador) continue;
        if (b.auto === 'tin' && !est?.tinta) continue;
        const r = 0.35;
        const dx = l[0] - b.x, dz = l[2] - b.z;
        const ox = b.w / 2 + r - Math.abs(dx), oz = b.d / 2 + r - Math.abs(dz);
        if (ox > 0 && oz > 0 && pos[1] < 5.5) {
          if (ox < oz) l[0] += Math.sign(dx) * ox; else l[2] += Math.sign(dz) * oz;
          const w = s.toWorld(l[0], pos[1], l[2]); pos[0] = w[0]; pos[2] = w[2];
        }
      }
    }
  }
  updateWalk(dt, ctl, stunned) {
    const I = this.input, me = this.me;
    let mx = ctl ? I.axis('KeyA', 'KeyD') * -1 : 0, mz = ctl ? I.axis('KeyS', 'KeyW') : 0;
    if (ctl && I.touch.active) { mx -= I.touch.move[0]; mz += I.touch.move[1]; }
    const run = ctl && I.down('ShiftLeft');
    const nad = me.modo === 'nadando';
    const vmax = nad ? 1.9 : run ? 6.2 : 3.3;
    const fy = me.camYaw;
    const fwd = [Math.sin(fy), Math.cos(fy)], right = [Math.cos(fy), -Math.sin(fy)];
    let dx = fwd[0] * mz + right[0] * mx, dz = fwd[1] * mz + right[1] * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 1) { dx /= dl; dz /= dl; }
    if (this.pesca.estado === 'brigando' || this.pesca.estado === 'carregando') { dx = 0; dz = 0; }
    const acc = me.grounded || nad ? 14 : 3;
    // encosta íngreme no limite do mapa: quem sobe demais escorrega sentado até lá embaixo
    const rAgora = Math.hypot(me.pos[0], me.pos[2]);
    if (!nad && !me.escorrega && rAgora > SLIDE_R) {
      me.escorrega = { t: 0 }; me.emote = null;
      if (this.pesca.estado !== 'off') this.cancelarPesca();
      this.ui.aviso('A encosta é íngreme demais — você escorregou!', 'info', 2500); this.audio.noise?.(0.6, 500, 0.15, 2);
    }
    if (me.escorrega) {
      const E = me.escorrega; E.t += dt;
      const ox = -me.pos[0] / (rAgora || 1), oz = -me.pos[2] / (rAgora || 1); // ladeira abaixo = para o lago
      const v = Math.min(9, 3 + E.t * 7);
      dx = 0; dz = 0;
      me.vel[0] = ox * v; me.vel[2] = oz * v;
      me.yaw = dampAngle(me.yaw, Math.atan2(ox, oz), 8, dt); // escorrega olhando para baixo, de bunda
      if (Math.random() < 0.6) this.particles.emit({ p: [me.pos[0] - ox * 0.4, me.pos[1] + 0.1, me.pos[2] - oz * 0.4], v: [(Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 1.2], life: 0.9, size: 0.18 + Math.random() * 0.2, col: [0.55, 0.48, 0.36, 0.55], g: 1.2, drag: 1.5, kind: 'poeira' });
      if (rAgora < SLIDE_R - 14 || nad) { me.escorrega = null; me.vel[0] *= 0.3; me.vel[2] *= 0.3; }
    } else {
    me.vel[0] = damp(me.vel[0], dx * vmax, acc * 0.6, dt); me.vel[2] = damp(me.vel[2], dz * vmax, acc * 0.6, dt);
    }
    if (me.voo) {
      // arremessado pelo tiro: voa e desliza até parar (sem controle)
      const V = me.voo; V.t += dt;
      me.vel[0] = V.v[0]; me.vel[2] = V.v[1];
      const k = me.grounded && V.t > 0.1 ? Math.exp(-5 * dt) : Math.exp(-0.2 * dt);
      V.v[0] *= k; V.v[1] *= k;
      if (me.grounded && V.t > 0.1 && Math.random() < 0.5 && Math.hypot(V.v[0], V.v[1]) > 1.5) this.particles.emit({ p: [me.pos[0], me.pos[1] + 0.1, me.pos[2]], v: [(Math.random() - 0.5), 0.6, (Math.random() - 0.5)], life: 0.8, size: 0.2, col: [0.5, 0.45, 0.35, 0.5], g: 1, drag: 1.5, kind: 'poeira' });
      if ((me.grounded && V.t > 0.15 && Math.hypot(V.v[0], V.v[1]) < 0.3) || V.t > 5 || nad) me.voo = null;
    } else if (stunned) { me.vel[0] = 0; me.vel[2] = 0; }
    if (dl > 0.1 && !stunned) me.yaw = dampAngle(me.yaw, Math.atan2(dx, dz), 10, dt);
    else if ((this.pesca.estado !== 'off' && this.pesca.estado !== 'pronto') || me.mirando || me.arma) me.yaw = dampAngle(me.yaw, me.camYaw, 10, dt);
    // movimento horizontal com limite da área jogável e encostas íngremes
    const nx = me.pos[0] + me.vel[0] * dt, nz = me.pos[2] + me.vel[2] * dt;
    const r = Math.hypot(nx, nz);
    const gNew = this.groundAt(nx, nz), gOld = this.groundAt(me.pos[0], me.pos[2]);
    const subida = gNew - gOld;
    const step = Math.hypot(me.vel[0], me.vel[2]) * dt + 1e-4;
    // parede invisível de segurança (acima da encosta de escorregar, caso algo dê errado)
    if (r < PLAY_R && (me.escorrega || me.voo || !(subida / step > 1.4 && gNew > me.pos[1] + 0.45))) { me.pos[0] = nx; me.pos[2] = nz; }
    else { me.vel[0] *= 0.2; me.vel[2] *= 0.2; }
    this.collideStations(me.pos);
    colidirPedras(me.pos); // pedras do lago e da margem
    const g = this.groundAt(me.pos[0], me.pos[2]);
    if (nad) {
      me.pos[1] = damp(me.pos[1], -0.55 + Math.sin(this.t * 2) * 0.05, 5, dt);
      me.grounded = false;
      if (Math.random() < 0.1 && Math.hypot(me.vel[0], me.vel[2]) > 0.5) this.particles.ripple(me.pos[0], me.pos[2], this.t, 0.08);
      // sair da água pela margem ou subir no cais pela escada
      if (g > -0.45) { me.modo = 'terra'; me.vel[1] = 0; me.grounded = true; me.pos[1] = Math.max(g, me.pos[1]); }
      else if (ctl && (I.hit('KeyE') || I.hit('Space'))) {
        for (const s of Object.values(this.stations)) {
          if (!s.ativa) continue;
          const l = s.toLocal(me.pos);
          if (Math.abs(l[0]) < 3.2 && l[2] > 14 && l[2] < s.zDockEnd + 1.5) { const w = s.toWorld(clamp(l[0], -1.6, 1.6), 1.3, Math.min(l[2], s.zDockEnd - 1)); me.pos = w; me.modo = 'terra'; me.vel = [0, 0, 0]; this.particles.drip([w[0], 1.5, w[2]], 0.3, 10); break; }
        }
      }
    } else {
      // gravidade e pulo
      me.vel[1] -= GRAV * dt;
      if (me.grounded && ctl && I.hit('Space') && this.pesca.estado === 'off' && !stunned) { me.vel[1] = 7.2; me.grounded = false; }
      me.pos[1] += me.vel[1] * dt;
      // degraus pequenos são suavizados (sem tranco ao subir no cais/plataforma)
      if (me.pos[1] <= g) { me.pos[1] = g - me.pos[1] < 0.45 && me.grounded ? damp(me.pos[1], g, 25, dt) : g; if (me.pos[1] < g - 0.02) me.pos[1] = Math.max(me.pos[1], g - 0.12); me.vel[1] = 0; me.grounded = true; }
      else if (me.pos[1] > g + 0.3) me.grounded = false;
      else if (me.vel[1] <= 0) { me.pos[1] = damp(me.pos[1], g, 20, dt); me.grounded = true; me.vel[1] = 0; }
      // caiu na água funda
      if (g < -0.35 && me.pos[1] < 0.05) {
        me.modo = 'nadando'; me.vel[1] = 0; me.grounded = false;
        // só respinga se caiu de cima (do cais); entrando andando pela margem é só uma ondinha
        if (me.pos[1] > -0.2 && g < -0.8) { this.particles.splash(me.pos[0], me.pos[2], this.t, 0.4); this.audio.splash(0.5); }
        else this.particles.ripple(me.pos[0], me.pos[2], this.t, 0.3);
        if (this.pesca.estado !== 'off') this.cancelarPesca('Você caiu na água!');
      }
    }
    this.cameraTerra(dt);
  }
  cameraTerra(dt) {
    const me = this.me;
    const yaw = me.vYaw ?? me.camYaw, pitch = me.vPitch ?? me.camPitch;
    const alvoBruto = [me.pos[0], me.pos[1] + (me.modo === 'nadando' ? 0.75 : 1.55), me.pos[2]];
    // mira do arremesso: câmera vai para trás do ombro direito (a mira do centro deixa de ficar no personagem)
    this.ombro = damp(this.ombro || 0, me.mirando || (me.arma && me.modo === 'terra') ? 1 : 0, 9, dt);
    if (this.ombro > 0.001) {
      const rx = -Math.cos(yaw), rz = Math.sin(yaw); // direita da tela
      alvoBruto[0] += rx * 1.05 * this.ombro; alvoBruto[2] += rz * 1.05 * this.ombro; alvoBruto[1] += 0.2 * this.ombro;
    }
    // o alvo segue o personagem: horizontal rápido, vertical suave (degraus, pulo, entrada na água)
    if (!this.camAlvo) this.camAlvo = alvoBruto.slice();
    this.camAlvo[0] = damp(this.camAlvo[0], alvoBruto[0], 30, dt);
    this.camAlvo[2] = damp(this.camAlvo[2], alvoBruto[2], 30, dt);
    this.camAlvo[1] = damp(this.camAlvo[1], alvoBruto[1], 9, dt);
    const alvo = this.camAlvo;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = [-Math.sin(yaw) * cp, -sp, -Math.cos(yaw) * cp];
    // colisão da câmera com o terreno
    let dist = me.camDist * (1 - 0.5 * (this.ombro || 0));
    for (let d = 0.5; d <= dist; d += 0.25) {
      const x = alvo[0] + dir[0] * d, y = alvo[1] + dir[1] * d, z = alvo[2] + dir[2] * d;
      if (y < this.groundAt(x, z) + 0.35) { dist = Math.max(0.7, d - 0.3); break; }
    }
    // aproxima rápido (para não atravessar) e afasta devagar (para não "pular")
    if (this.camDistAtual === undefined) this.camDistAtual = dist;
    this.camDistAtual = damp(this.camDistAtual, dist, dist < this.camDistAtual ? 22 : 4, dt);
    const d = this.camDistAtual;
    const pos = [alvo[0] + dir[0] * d, alvo[1] + dir[1] * d, alvo[2] + dir[2] * d];
    // em terra ou nadando a câmera fica sempre acima da linha d'água (sem piscar entre dentro e fora)
    const minY = Math.max(0.45, this.groundAt(pos[0], pos[2]) + 0.3);
    if (pos[1] < minY) pos[1] = minY;
    this.fovAtual = damp(this.fovAtual || 1.05, this.zoom ? 0.3 : 1.05, 14, dt);
    this.setCam(pos, alvo, this.fovAtual);
  }
  setCam(pos, alvo, fov) {
    const c = this.cam;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - 0.02); const t = this.t * 40; pos = [pos[0] + Math.sin(t) * this.shake * 0.06, pos[1] + Math.sin(t * 1.3 + 1) * this.shake * 0.06, pos[2] + Math.cos(t * 0.9) * this.shake * 0.06]; }
    c.pos = pos; c.fov = fov;
    m4.lookAt(c.view, pos, alvo, [0, 1, 0]);
    const under = pos[1] < 0;
    c.near = 0.12;
    c.far = under ? 900 : 3200;
    m4.perspective(c.proj, fov, this.R.w / this.R.h, c.near, c.far);
  }

  // ------------------------------------------------------------ prompts e interações a pé
  updatePrompt(livre) {
    const me = this.me, I = this.input, p = this.perfil;
    let txt = null;
    if (me.modo === 'terra') {
      const st = this.stations[this.slot];
      const pts = st.pontos(p.estacao);
      let best = null, bd = 1e9;
      for (const q of pts) { const d = Math.hypot(q.pos[0] - me.pos[0], q.pos[2] - me.pos[2]); if (d < q.r && d < bd) { bd = d; best = q; } }
      if (best?.id === 'berco' && this.crane.estado !== 'berco') best = null;
      // estações dos amigos: só olhar (aquário) — ações são sempre na própria estação
      this.pertoPeixaria = best?.id === 'peixaria';
      if (best?.id === 'peixaria') {
        const pe = p.peixaria;
        if (pe?.cortado) { txt = `<kbd>I</kbd>Pegar o peixe cortado <span class="nota">(vende pelo dobro no computador)</span>`; if (livre && I.hit('KeyI')) this.acao({ tipo: 'peixaria_pegar' }); }
        else if (pe) {
          txt = this.cortando ? '🔪 Cortando…' : `<kbd>I</kbd>Cortar ${ESPECIES[pe.peixe.esp].nome}`;
          if (livre && I.hit('KeyI') && !this.cortando) this.cortarPeixe();
        } else if (p.mao && !p.mao.cortado) {
          const kg = massaPeixe(p.mao.esp, p.mao.cm);
          txt = kg > PEIXARIA.minKg ? `<kbd>E</kbd>Colocar ${ESPECIES[p.mao.esp].nome} na tábua <span class="nota">(${kg.toFixed(1)} kg)</span>` : `Peixe pequeno demais para cortar (${kg.toFixed(1)} kg) — precisa ter mais de ${PEIXARIA.minKg} kg`;
          if (livre && I.hit('KeyE') && kg > PEIXARIA.minKg) { this.me.acao = { tipo: 'bancada', t: 0, dur: 0.7 }; this.acao({ tipo: 'peixaria_colocar' }); }
        } else if (p.mao?.cortado) {
          const cheia = p.mochila.length >= MOCHILA.peixes;
          txt = cheia ? `Mochila cheia (${MOCHILA.peixes}/${MOCHILA.peixes}): venda no computador da estação` : `<kbd>E</kbd>Guardar o peixe cortado na mochila <span class="nota">(${p.mochila.length}/${MOCHILA.peixes} · venda tudo depois no computador)</span>`;
          if (livre && I.hit('KeyE') && !cheia) this.acao({ tipo: 'mochila_guardar' });
        } else if (!p.mao && p.mochila.length) {
          txt = `<kbd>Z</kbd>Tirar ${ESPECIES[p.mochila[p.mochila.length - 1].esp].nome} da mochila para cortar <span class="nota">(${p.mochila.length}/${MOCHILA.peixes})</span>`;
        } else txt = `Bancada de peixe: traga um peixe de mais de ${PEIXARIA.minKg} kg <b>na mão</b>`;
      } else if (best) {
        txt = `<kbd>E</kbd>${best.txt}`;
        if (best.id === 'aquario') txt = p.mao ? `<kbd>E</kbd>Colocar ${ESPECIES[p.mao.esp].nome} no ${best.txt}` : `<kbd>E</kbd>${best.txt}: ver peixes e trocar aquário/tanque`;
        if (best.id === 'tinta') txt = p.mao && ESPECIES[p.mao.esp].tinta ? `<kbd>E</kbd>Fabricar bolsas com a lula (+2) · você tem ${p.baloes}/10` : `Fábrica de bolsas: traga uma LULA na mão · bolsas ${p.baloes}/10`;
        if (livre && I.hit('KeyE')) this.interagir(best.id);
      } else if (!p.mao && Math.hypot(me.pos[0] - ESTATUA.x, me.pos[2] - ESTATUA.z) < 11) {
        const n = p.estatua.colocadas.length;
        txt = n >= ESTATUA_PECAS.length ? `🏆 Estátua completa · multiplicador ×${multDinheiro(p)}` : `<kbd>E</kbd>Colocar peças na estátua <span class="nota">(${n}/${ESTATUA_PECAS.length} · ×${multDinheiro(p)})</span>`;
        if (livre && I.hit('KeyE') && n < ESTATUA_PECAS.length) this.acao({ tipo: 'estatua_colocar' });
      } else if (!p.mao && (this.tubPerto = this.carcacaPerto())) {
        txt = `<kbd>E</kbd>Pegar o tubarão abatido <span class="nota">(vende por S$ 400 no computador da sua estação)</span>`;
        if (livre && I.hit('KeyE')) this.acao({ tipo: 'tubarao_pegar', id: this.tubPerto.id });
      } else if (p.lixoMao && !p.mao) {
        const nm = SUCATA[p.lixoMao.tipo]?.nome || 'Lixo';
        txt = me.mirandoLixo ? `🎯 Mire e clique com o <kbd>botão esquerdo</kbd> para atirar ${nm} com o estilingue · <kbd>Q</kbd> cancelar`
          : `<kbd>E</kbd>Guardar ${nm} no saco <span class="nota">(${p.saco.length}/${LIXO.saco})</span> · <kbd>Q</kbd>${p.armas.estilingue ? 'Usar no estilingue' : 'Estilingue (compre na loja de armas)'}`;
        if (livre && I.hit('KeyE')) { me.mirandoLixo = false; this.acao({ tipo: 'lixo_guardar' }); }
      } else if (me.mirandoLixo && !p.mao) {
        txt = `🎯 Estilingue: atirando lixo do saco (${p.saco.length}) · clique para atirar · <kbd>Q</kbd> cancelar`;
      } else if (!p.mao && !me.arma && (this.lixoPerto = this.lixoMaisProximo(2.3))) {
        const t = SUCATA[this.lixoPerto.item.tipo];
        txt = `<kbd>E</kbd>Catar ${t.nome} <span class="nota">(saco ${p.saco.length}/${LIXO.saco})</span>`;
        if (livre && I.hit('KeyE')) this.catar(this.lixoPerto);
      } else if (this.pesca.estado === 'off' && !p.mao && this.pertoDaAgua()) {
        // a dica da vara só aparece no píer ou na beira d'água
        txt = '<kbd>F</kbd>Pegar a vara de pesca';
      } else if (!p.mao && p.mochila.length && this.pesca.estado === 'off') {
        txt = `<kbd>Z</kbd>Tirar ${ESPECIES[p.mochila[p.mochila.length - 1].esp].nome} da mochila <span class="nota">(${p.mochila.length}/${MOCHILA.peixes})</span>`;
      }
      if (!p.mao) this.me.mirando = false;
      if (p.mao && !best && ESPECIES[p.mao.esp]?.cacado) txt = '🦈 Levando o tubarão abatido: vá até o <b>computador da sua estação</b> e venda por S$ 400 · <kbd>X</kbd> largar · cuidado, um tiro faz você derrubar';
      else if (p.mao && !best) txt = this.me.mirando
        ? '🎯 Mire e clique com o <kbd>botão esquerdo</kbd> para jogar · <kbd>G</kbd> cancelar'
        : `<kbd>X</kbd>Soltar · <kbd>G</kbd>Pegar para arremessar · <kbd>Z</kbd>${p.mochila.length >= MOCHILA.peixes ? 'Mochila cheia' : `Guardar na mochila (${p.mochila.length}/${MOCHILA.peixes})`} <span class="nota">(${ESPECIES[p.mao.esp].nome}, ${p.mao.cm} cm)</span>`;
      if (livre && I.hit('KeyF') && !p.mao) { if (this.pesca.estado !== 'off' || this.pertoDaAgua()) this.toggleVara(); else this.ui.aviso('Vá até o píer ou a beira d\'água para pescar', 'info'); }
      if (livre && I.hit('KeyZ')) {
        if (p.mao) { if (p.mochila.length >= MOCHILA.peixes) this.ui.aviso(`Mochila cheia (${MOCHILA.peixes}/${MOCHILA.peixes} peixes)`, 'ruim'); else { this.me.mirando = false; this.acao({ tipo: 'mochila_guardar' }); } }
        else if (p.mochila.length) this.acao({ tipo: 'mochila_tirar' });
        else this.ui.aviso(`Mochila vazia · ${p.baloes}/10 bolsas de tinta`, 'info');
      }
      // danças/gestos: o scroll do mouse abre uma roda no meio da tela (estilo roda de armas)
      // armas: 1–5 equipa (se comprou), H guarda; atira com o botão esquerdo
      for (let i = 0; i < ARMAS_ORDEM.length; i++) {
        if (!livre || !I.hit('Digit' + (i + 1))) continue;
        const k = ARMAS_ORDEM[i];
        if (!p.armas?.[k]) this.ui.aviso(`Você ainda não tem: ${ARMAS[k].nome} (compre na loja de armas)`, 'info');
        else if (p.mao) this.ui.aviso('Solte ou guarde o peixe antes de pegar a arma', 'ruim');
        else { if (this.pesca.estado !== 'off') this.cancelarPesca(); me.arma = me.arma === k ? null : k; me.mirando = false; me.emote = null; this.roda = null; if (me.arma) this.input.lock(); }
      }
      if (livre && I.hit('KeyH') && me.arma) me.arma = null;
      if (me.arma && p.mao) me.arma = null;
      if (me.arma) {
        const A = ARMAS[me.arma], bal = p.municao?.[me.arma] || 0;
        if (!best) txt = null;
        this.updateArma(livre, A, bal);
      }
      if (livre && I.wheel && this.pesca.estado === 'off' && !this.me.mirando && !this.me.mirandoLixo && !this.me.arma && this.me.grounded) {
        if (!this.roda) this.roda = { sel: this.me.emoteIdx ?? 0, t: 0, v: [0, 0] };
        else this.roda.sel = ((this.roda.sel + (I.wheel > 0 ? 1 : -1)) % 6 + 6) % 6;
        this.roda.t = 0; this.roda.v = [0, 0];
      }
      if (this.roda) this.updateRoda(this.dtQuadro || 1 / 60, livre);
      if (livre && I.hit('KeyG') && p.mao && !ESPECIES[p.mao.esp]?.cacado) {
        if (ESPECIES[p.mao.esp].pesado && !p.extras.luvas) this.ui.aviso('Precisa das luvas hidráulicas para arremessar um tubarão', 'ruim');
        else { this.me.mirando = !this.me.mirando; if (this.me.mirando) this.input.lock(); }
      }
      if (livre && this.me.mirando && I.mouse.clicked) { this.me.mirando = false; this.arremessar(); }
      if (livre && I.hit('KeyX')) { this.me.mirando = false; this.soltarPeixe(); }
      // estilingue: Q mira com o lixo da mão (ou do saco), clique atira; mesmo arco do peixe
      if (livre && I.hit('KeyQ') && !p.mao && !me.arma && this.pesca.estado === 'off') {
        if (!p.armas.estilingue) this.ui.aviso(p.lixoMao ? `Compre o Estilingue de lixo na loja de armas (S$ ${ARMAS.estilingue.preco})` : 'O estilingue é vendido na loja de armas', 'info');
        else if (!p.lixoMao && !p.saco.length) this.ui.aviso('Sem lixo para o estilingue: cate um lixo na margem (E)', 'info');
        else { me.mirandoLixo = !me.mirandoLixo; me.emote = null; this.roda = null; if (me.mirandoLixo) this.input.lock(); }
      }
      if (livre && me.mirandoLixo && I.mouse.clicked) { me.mirandoLixo = false; this.atirarLixo(); }
      if (this.pesca.estado !== 'off') txt = this.pesca.prompt || txt;
    } else if (me.modo === 'nadando') {
      const c = !p.mao && this.carcacaPerto();
      if (c) { txt = '<kbd>E</kbd>Pegar o tubarão abatido <span class="nota">(leve até a sua estação e venda por S$ 400)</span>'; if (livre && I.hit('KeyE')) this.acao({ tipo: 'tubarao_pegar', id: c.id }); }
      else if (p.mao && ESPECIES[p.mao.esp]?.cacado) txt = '🦈 Levando o tubarão — nade até a margem e vá até o computador da sua estação · <kbd>X</kbd> largar';
      else txt = 'Nadando — volte à margem ou suba no cais pela escada (<kbd>E</kbd>)';
      if (livre && p.mao && I.hit('KeyX')) this.soltarPeixe();
    } else if (me.modo === 'sub' || me.modo === 'guindaste') {
      txt = this.subPrompt;
    }
    this.ui.prompt(txt);
  }
  interagir(id) {
    const p = this.perfil;
    if (id === 'terminal') this.ui.abrir('terminal');
    else if (id === 'armas') { this.me.acao = { tipo: 'bancada', t: 0, dur: 0.6 }; this.ui.abrir('armas'); }
    else if (id === 'corrida') { this.me.acao = { tipo: 'bancada', t: 0, dur: 0.6 }; this.ui.abrir('corrida'); }
    else if (id === 'deposito' || id === 'reciclador' || id === 'restauro') { this.me.acao = { tipo: 'bancada', t: 0, dur: 0.8 }; this.ui.abrir(id); }
    else if (id === 'aquario' || id === 'tanque') {
      if (p.mao) this.acao({ tipo: 'peixe_aquario' });
      else this.ui.abrir('aquario');
    } else if (id === 'tinta') {
      if (p.mao && ESPECIES[p.mao.esp].tinta) { this.me.acao = { tipo: 'bancada', t: 0, dur: 1.5 }; this.acao({ tipo: 'processar_lula' }); }
      else this.ui.aviso('Leia a placa: pesque uma lula à noite (linha funda) e traga na mão até a mesa', 'info');
    } else if (id === 'berco') {
      if (this.pesca.estado !== 'off') this.toggleVara();
      if (p.mao) { this.ui.aviso('Guarde ou solte o peixe antes de entrar no submarino', 'ruim'); return; }
      // sobe no berço e entra pela escotilha
      const de = this.me.pos.slice(), hatch = [this.sub.pos[0], this.sub.pos[1] + 1.3, this.sub.pos[2]];
      this.me.modo = 'entrando';
      this.anims.push({ dur: 0.8, t: 0, upd: (k) => { this.me.pos = [lerp(de[0], hatch[0], k), lerp(de[1], hatch[1], k) + Math.sin(k * Math.PI) * 0.8, lerp(de[2], hatch[2], k)]; this.me.yaw = Math.atan2(hatch[0] - de[0], hatch[2] - de[2]); }, fim: () => {
        this.me.modo = 'sub'; this.me.subCam = 'terceira';
        this.audio.clank(0.4);
        this.ui.aviso('No submarino. E = descer com o guindaste · Q = sair', 'info');
      } });
    }
  }

  // o cais (tábuas + estacas até o fundo) é sólido para o submarino
  colidirSubCais(sc) {
    const c = Math.cos(sc.yaw), sn = Math.sin(sc.yaw);
    for (const st of Object.values(this.stations)) {
      if (!st.ativa) continue;
      if (Math.hypot(sc.pos[0] - st.st.dockEnd[0], sc.pos[2] - st.st.dockEnd[1]) > 40) continue;
      const o = st.toWorld(0, 0, 0), ex = st.toWorld(1, 0, 0), ez = st.toWorld(0, 0, 1);
      const ax = [ex[0] - o[0], ex[2] - o[2]], az = [ez[0] - o[0], ez[2] - o[2]];
      for (const k of [-2.0, 0, 2.0]) { // proa, meio e popa
        const p = [sc.pos[0] + sn * k, sc.pos[1], sc.pos[2] + c * k];
        if (p[1] > 1.6) continue;
        const l = st.toLocal(p), r = 1.25;
        const X = 2.3 + r, z0 = 14 - r, z1 = st.zDockEnd + r;
        if (Math.abs(l[0]) >= X || l[2] <= z0 || l[2] >= z1) continue;
        const px = X - Math.abs(l[0]), pz = z1 - l[2];
        let n;
        if (px < pz) { const sx = Math.sign(l[0]) || 1; n = [ax[0] * sx, ax[1] * sx]; sc.pos[0] += n[0] * px; sc.pos[2] += n[1] * px; }
        else { n = [az[0], az[1]]; sc.pos[0] += n[0] * pz; sc.pos[2] += n[1] * pz; }
        const vn = sc.vel[0] * n[0] + sc.vel[2] * n[1];
        if (vn < 0) {
          sc.vel[0] -= n[0] * vn * 1.3; sc.vel[2] -= n[1] * vn * 1.3;
          if (-vn > 1.2 && performance.now() - (sc.ultimoImpacto || 0) > 400) { sc.ultimoImpacto = performance.now(); this.audio.clank(Math.min(1.5, -vn / 3)); }
        }
      }
    }
  }

  sairParaMenu() {
    try { this.net.close(); } catch { /* */ }
    const q = new URLSearchParams(location.search); q.delete('auto'); q.delete('sala');
    setTimeout(() => { location.href = location.pathname + (q.toString() ? '?' + q : ''); }, 250);
  }

  // ------------------------------------------------------------ lixo da margem
  lixoMaisProximo(r) {
    let best = null, bd = r;
    for (const n of this.items.values()) {
      if (!SUCATA[n.item.tipo]?.terra) continue;
      const d = Math.hypot(n.pos[0] - this.me.pos[0], n.pos[2] - this.me.pos[2]);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  catar(n) {
    if (this.catando) return;
    if ((this.perfil.mao || this.perfil.lixoMao) && this.perfil.saco.length >= LIXO.saco) { this.ui.aviso(`Saco cheio (${LIXO.saco}/${LIXO.saco}) — venda no computador da estação`, 'ruim'); return; }
    this.catando = true;
    // abaixa, pega e levanta
    this.me.yaw = Math.atan2(n.pos[0] - this.me.pos[0], n.pos[2] - this.me.pos[2]);
    this.me.vel[0] = 0; this.me.vel[2] = 0;
    this.me.acao = { tipo: 'pegar', t: 0, dur: 0.9 };
    setTimeout(() => { this.acao({ tipo: 'catar', item: n.item.id }).finally(() => { this.catando = false; }); }, 380);
  }

  // ------------------------------------------------------------ armas
  updateArma(livre, A, bal) {
    const me = this.me, I = this.input, agora = performance.now();
    const stun = agora < me.stunUntil;
    const zoom = me.arma === 'sniper' && livre && I.mouse.rdown && !stun;
    this.zoom = zoom;
    this.ui.prompt(null);
    $('hudArma').hidden = false;
    const h = `🔫 <b>${A.nome}</b> · ${bal} ${A.foguete ? 'foguete(s)' : 'balas'} · <span class="nota">clique atira${A.mira ? ' · botão direito: luneta' : ''} · 1–5 troca · H guarda</span>`;
    if ($('hudArma')._h !== h) { $('hudArma').innerHTML = h; $('hudArma')._h = h; }
    if (!livre || stun || me.modo !== 'terra') return;
    const quer = A.auto ? I.mouse.down : I.mouse.clicked;
    if (!quer || agora < (this.cdArma || 0)) return;
    if (bal <= 0) { if (I.mouse.clicked) { this.ui.aviso(`Sem ${A.foguete ? 'foguetes' : 'balas'} — compre na loja de armas`, 'ruim'); this.audio.blip(900, 0.05, 'square', 0.04); } return; }
    this.cdArma = agora + A.cdMs;
    // mira: o raio sai do centro da câmera; a bala sai da arma e vai até o ponto mirado
    const c = this.cam.pos, f = this.camForwardVis();
    let alvo = [c[0] + f[0] * A.alcance, c[1] + f[1] * A.alcance, c[2] + f[2] * A.alcance];
    for (let t = 1; t < A.alcance; t += 0.5) {
      const x = c[0] + f[0] * t, y = c[1] + f[1] * t, z = c[2] + f[2] * t;
      if (y < terrainHeight(x, z)) { alvo = [x, y, z]; break; }
      let hit = false;
      for (const r of Object.values(this.remotos)) {
        if (r.modo !== 'terra' && r.modo !== 'nadando') continue;
        const ip = r.char.root.pos;
        if (Math.hypot(x - ip[0], z - ip[2]) < 0.45 && y > ip[1] && y < ip[1] + 1.8) { hit = true; break; }
      }
      if (!hit && this.kr?.root.visible) { const kc = this.kr.centro(); if (Math.hypot(x - kc[0], y - kc[1], z - kc[2]) < 6.2) hit = true; }
      if (!hit && this.tubPos && Math.hypot(x - this.tubPos[0], y - this.tubPos[1], z - this.tubPos[2]) < 2.1) hit = true;
      if (hit) { alvo = [x, y, z]; break; }
    }
    const boca = [me.pos[0], me.pos[1] + 1.45, me.pos[2]];
    let dir = [alvo[0] - boca[0], alvo[1] - boca[1], alvo[2] - boca[2]];
    const L = Math.hypot(...dir) || 1; dir = dir.map((v) => v / L);
    // espalhamento das armas automáticas
    if (A.dispersao) dir = [dir[0] + (Math.random() - 0.5) * A.dispersao * 2, dir[1] + (Math.random() - 0.5) * A.dispersao * 2, dir[2] + (Math.random() - 0.5) * A.dispersao * 2];
    me.yaw = Math.atan2(dir[0], dir[2]);
    this.coice = 1;
    this.me.camPitch = clamp(this.me.camPitch + (me.arma === 'sniper' ? 0.05 : me.arma === 'bazuca' ? 0.09 : 0.012), -1.25, 1.0);
    this.somTiro(me.arma);
    this.clarao();
    this.acao({ tipo: 'atirar', arma: me.arma, dir });
  }
  camForwardVis() {
    const y = this.me.vYaw ?? this.me.camYaw, p = this.me.vPitch ?? this.me.camPitch, cp = Math.cos(p);
    return [Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp];
  }
  somTiro(k) {
    const a = this.audio;
    if (k === 'bazuca') return; // o som do foguete vem com o projétil
    if (k === 'sniper') { a.noise(0.5, 900, 0.5, 0.8); a.blip(90, 0.35, 'sawtooth', 0.12, -40); setTimeout(() => a.blip(1500, 0.08, 'square', 0.03), 450); return; }
    if (k === 'fuzil') { a.noise(0.18, 1400, 0.38, 0.9); a.blip(140, 0.12, 'square', 0.08, -60); return; }
    if (k === 'metralhadora') { a.noise(0.1, 2000, 0.3, 1); a.blip(200, 0.06, 'square', 0.06, -80); return; }
    a.noise(0.14, 1700, 0.35, 1); a.blip(260, 0.1, 'square', 0.08, -120);
  }
  clarao(pos) {
    const ch = this.myChar, n = ch._arma;
    const p = pos || (n?.boca ? n.boca.worldPos() : [this.me.pos[0], this.me.pos[1] + 1.45, this.me.pos[2]]);
    for (let k = 0; k < 7; k++) this.particles.emit({ p: p.slice(), v: [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2], life: 0.07, size: 0.18 + Math.random() * 0.12, col: [1, 0.75, 0.3, 1], g: 0, drag: 2, kind: 'fogo', add: true });
    for (let k = 0; k < 3; k++) this.particles.emit({ p: p.slice(), v: [(Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5], life: 0.9, size: 0.12, col: [0.7, 0.7, 0.7, 0.35], g: -0.3, drag: 1, kind: 'fumaca', grow: 0.4 });
  }
  efeitoTiro(e) {
    // rastro da bala e faíscas onde bateu
    const a = e.de === this.slot && this.myChar._arma?.boca ? this.myChar._arma.boca.worldPos() : e.a, b = e.b;
    if (e.de !== this.slot) { this.clarao(e.a); const d = Math.hypot(e.a[0] - this.me.pos[0], e.a[2] - this.me.pos[2]); if (d < 90) this.somTiro(e.arma); }
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.min(40, Math.ceil(L / 1.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.particles.emit({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], v: [0, 0, 0], life: 0.09 + t * 0.05, size: e.arma === 'sniper' ? 0.07 : 0.045, col: [1, 0.9, 0.6, 0.9], g: 0, drag: 0, kind: 'rastro', add: true });
    }
    const cor = e.acertou ? [1, 0.85, 0.3, 1] : [0.8, 0.7, 0.5, 1];
    for (let k = 0; k < (e.acertou ? 14 : 6); k++) this.particles.emit({ p: b.slice(), v: [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], life: 0.35, size: 0.05, col: cor, g: 9.8, drag: 1, kind: 'faisca', add: true });
    if (!e.acertou && b[1] < 0.2 && terrainHeight(b[0], b[2]) < 0) this.particles.ripple(b[0], b[2], this.t, 0.15);
    if (e.acertou === 'kraken') { this.particles.ink(b, 18); this.kr.flash = 1; return; }
    if (e.acertou === 'tubarao') { this.particles.splash(b[0], b[2], this.t, 0.25); for (let k = 0; k < 8; k++) this.particles.emit({ p: b.slice(), v: [(Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3], life: 0.5, size: 0.07, col: [0.7, 0.12, 0.1, 0.9], g: 9.8, drag: 1, kind: 'faisca' }); return; }
    if (e.acertou) this.particles.confetti(b, 10);
  }
  explosao(pos, agua) {
    const P = this.particles;
    for (let k = 0; k < 60; k++) { const v = [(Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9]; P.emit({ p: pos.slice(), v, life: 0.5 + Math.random() * 0.4, size: 0.5 + Math.random() * 0.6, col: [1, 0.55 + Math.random() * 0.3, 0.15, 1], g: -1, drag: 3, kind: 'fogo', add: true, grow: 1.2 }); }
    for (let k = 0; k < 40; k++) { const v = [(Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4]; P.emit({ p: pos.slice(), v, life: 2.5 + Math.random() * 1.5, size: 0.7 + Math.random() * 0.6, col: [0.3, 0.29, 0.28, 0.6], g: -0.5, drag: 1.2, kind: 'fumaca', grow: 1.0 }); }
    for (let k = 0; k < 30; k++) { const v = [(Math.random() - 0.5) * 14, 3 + Math.random() * 8, (Math.random() - 0.5) * 14]; P.emit({ p: pos.slice(), v, life: 1.4, size: 0.08, col: [0.35, 0.28, 0.2, 1], g: 9.8, drag: 0.4, kind: 'detrito' }); }
    if (agua) P.splash(pos[0], pos[2], this.t, 1.2);
    const d = Math.hypot(pos[0] - this.cam.pos[0], pos[1] - this.cam.pos[1], pos[2] - this.cam.pos[2]);
    this.shake = Math.max(this.shake || 0, Math.max(0, 1.4 - d / 30));
    this.audio.noise(1.6, 160, Math.max(0.15, 0.9 - d / 120), 0.6); this.audio.blip(55, 1.2, 'sine', Math.max(0.1, 0.5 - d / 150), -30);
  }
  // estátua completa: fica dourada e o jogador "zera" o jogo (pode continuar jogando)
  zerou() {
    $('zerou').hidden = false; clearTimeout(this.zerouT); this.zerouT = setTimeout(() => { $('zerou').hidden = true; }, 9000);
    const top = [ESTATUA.x, ESTATUA.y + 9, ESTATUA.z];
    for (let k = 0; k < 6; k++) setTimeout(() => { this.particles.confetti([top[0] + (Math.random() - 0.5) * 6, top[1], top[2] + (Math.random() - 0.5) * 6], 60); this.audio.blip(660 + k * 110, 0.25, 'square', 0.06); }, k * 350);
    setTimeout(() => this.audio.coin(), 2200);
  }
  // modelo da arma na mão (local e amigos)
  updateArmaMao(ch, k) {
    if (ch._armaKey === k) return;
    if (ch._arma) { ch._arma.parent?.remove(ch._arma); ch._arma = null; }
    ch._armaKey = k;
    if (!k) return;
    const n = weaponNode(this.R, k);
    n.rot(Math.PI / 2, 0, 0); // cano na direção do braço estendido
    if (k === 'bazuca') n.at(0, 0.28, 0.2); // a bazuca fica apoiada mais perto do ombro
    ch.handR.add(n); ch._arma = n;
  }

  // ------------------------------------------------------------ roda de emotes
  updateRoda(dt, livre) {
    const R = this.roda, I = this.input, el = $('rodaEmotes');
    const NOMES = [['👍', 'Joinha'], ['💃', 'Dança'], ['🪑', 'Sentar'], ['👋', 'Acenar'], ['🤖', 'Robô'], ['🌀', 'Breakdance']];
    const NF = NOMES.length;
    if (!el.dataset.ok) {
      el.dataset.ok = 1;
      NOMES.forEach(([ic, nm], i) => {
        const a = -Math.PI / 2 + (i / NF) * Math.PI * 2;
        const d = document.createElement('div'); d.className = 'fatia'; d.innerHTML = `${ic}<small>${nm}</small>`;
        d.style.left = 170 + Math.cos(a) * 118 + 'px'; d.style.top = 170 + Math.sin(a) * 118 + 'px'; el.appendChild(d);
      });
      const seta = document.createElement('div'); seta.className = 'seta'; el.appendChild(seta);
    }
    const fechar = () => { this.roda = null; el.hidden = true; };
    if (!livre || this.me.modo !== 'terra' || this.me.mirando || this.pesca.estado !== 'off') return fechar();
    R.t += dt;
    // mover o mouse escolhe a fatia pela direção (como a roda de armas)
    R.v[0] = clamp(R.v[0] + I.mouse.dx, -140, 140); R.v[1] = clamp(R.v[1] + I.mouse.dy, -140, 140);
    if (Math.hypot(I.mouse.dx, I.mouse.dy) > 0.5) R.t = 0;
    if (Math.hypot(R.v[0], R.v[1]) > 45) {
      const ang = Math.atan2(R.v[1], R.v[0]);
      R.sel = ((Math.round((ang + Math.PI / 2) / (Math.PI * 2 / NF)) % NF) + NF) % NF;
    }
    el.hidden = false;
    [...el.querySelectorAll('.fatia')].forEach((d, i) => d.classList.toggle('sel', i === R.sel));
    el.querySelector('.centro b').textContent = NOMES[R.sel][1];
    el.querySelector('.seta').style.transform = `rotate(${(R.sel / NF) * 360 + 180}deg)`;
    const cancelar = I.hit('Escape') || I.mouse.rdown;
    if (cancelar) return fechar();
    if (I.mouse.clicked || R.t > 1.6) {
      I.mouse.clicked = false;
      this.me.emoteIdx = R.sel; this.me.emote = { i: R.sel, t: 0 };
      fechar();
    }
  }

  // ------------------------------------------------------------ pesca
  toggleVara() {
    if (this.me.modo !== 'terra') return;
    if (this.pesca.estado === 'off') {
      this.pesca = { estado: 'pronto', prompt: '<kbd>Clique</kbd>segure para mirar e solte para lançar · <kbd>F</kbd>guardar a vara' };
      this.rodNode = makeRod(this.R, this.perfil.vara, this.perfil.pesado);
      this.myChar.handR.add(this.rodNode);
      this.rodNode.rot(2.6, 0, 0); // ponta para a frente e para cima (antes apontava para trás)
    } else this.cancelarPesca();
  }
  cancelarPesca(msg) {
    if (this.pesca.sid && this.pesca.estado !== 'off') this.net.action({ tipo: 'pesca_puxar', sid: this.pesca.sid, resultado: 'escapou' });
    if (this.rodNode) { this.rodNode.parent?.remove(this.rodNode); this.rodNode = null; }
    if (this.lineNode) { this.fxRoot.remove(this.lineNode); this.lineNode = null; }
    if (this.bobberNode) { this.fxRoot.remove(this.bobberNode); this.bobberNode = null; }
    this.pesca = { estado: 'off' };
    $('pescaUi').hidden = true;
    if (msg) this.ui.aviso(msg, 'info');
  }
  updateFishing(dt, ctl) {
    const P = this.pesca, I = this.input;
    if (P.estado === 'off') return;
    if (this.me.modo !== 'terra') { this.cancelarPesca(); return; }
    const vs = varaStats(this.perfil);
    const tip = this.rodNode ? this.rodNode.tip.worldPos() : [this.me.pos[0], this.me.pos[1] + 2, this.me.pos[2]];
    const clicando = ctl && (I.mouse.down || I.down('Space'));
    const cliqueNovo = ctl && (I.mouse.clicked || I.hit('Space'));
    if (P.estado === 'pronto') {
      if (cliqueNovo) { P.estado = 'carregando'; P.forca = 0; }
    } else if (P.estado === 'carregando') {
      P.forca = Math.min(1, P.forca + dt / 1.1);
      const dist = 4 + P.forca * (vs.alcance - 4);
      P.prompt = `Força do lançamento: ${Math.round(P.forca * 100)}% · ~${dist.toFixed(0)} m`;
      if (!clicando) {
        const fw = this.camForward(); const l = Math.hypot(fw[0], fw[2]) || 1;
        P.alvo = [this.me.pos[0] + (fw[0] / l) * dist, 0, this.me.pos[2] + (fw[2] / l) * dist];
        P.inicio = tip.slice(); P.voo = 0; P.estado = 'voando';
        this.me.acao = { tipo: 'lancar', t: 0, dur: 0.6 };
        this.audio.blip(500, 0.25, 'sine', 0.05, 600);
      }
    } else if (P.estado === 'voando') {
      P.voo += dt / 0.85;
      const k = Math.min(1, P.voo);
      P.bobber = [lerp(P.inicio[0], P.alvo[0], k), lerp(P.inicio[1], 0, k) + Math.sin(k * Math.PI) * 3, lerp(P.inicio[2], P.alvo[2], k)];
      if (k >= 1) {
        if (terrainHeight(P.alvo[0], P.alvo[2]) > -0.4) { this.ui.aviso('A isca caiu fora da água', 'ruim'); P.estado = 'pronto'; P.bobber = null; P.prompt = '<kbd>Clique</kbd>segure e solte para lançar'; }
        else {
          this.particles.splash(P.alvo[0], P.alvo[2], this.t, 0.06); this.audio.drip();
          P.estado = 'aguardando_srv'; P.prompt = 'Esperando o peixe morder…';
          this.net.action({ tipo: 'pesca_lancar', x: P.alvo[0], z: P.alvo[2], linha: vs.prof }).then(({ res }) => {
            if (this.pesca !== P) return;
            if (!res.ok) { this.ui.aviso(res.msg, 'ruim'); P.estado = 'pronto'; P.bobber = null; return; }
            P.sid = res.pesca.sid; P.forcaPeixe = res.pesca.forca; P.kg = res.pesca.kg;
            P.mordida = performance.now() + (isFinite(res.pesca.mordidaEm) && res.pesca.mordidaEm !== null ? res.pesca.mordidaEm : 1e9);
            P.desiste = performance.now() + 30000;
            P.estado = 'esperando';
          });
        }
      }
    } else if (P.estado === 'esperando') {
      P.bobber[1] = Math.sin(this.t * 2.2) * 0.04;
      if (performance.now() > P.mordida) { P.estado = 'mordida'; P.janela = performance.now() + 1700; this.audio.bite(); this.particles.ripple(P.bobber[0], P.bobber[2], this.t, 0.3); }
      else if (performance.now() > P.desiste) { this.net.action({ tipo: 'pesca_puxar', sid: P.sid, resultado: 'escapou' }); P.estado = 'pronto'; P.bobber = null; P.sid = null; this.ui.aviso('Nada mordeu aqui. Tente outro ponto, outro horário ou uma vara melhor.', 'info'); }
      if (cliqueNovo && P.estado === 'esperando') { this.net.action({ tipo: 'pesca_puxar', sid: P.sid, resultado: 'escapou' }); P.estado = 'pronto'; P.bobber = null; P.sid = null; }
      P.prompt = 'Esperando a mordida… (clique para recolher a linha)';
    } else if (P.estado === 'mordida') {
      P.bobber[1] = -0.25 + Math.sin(this.t * 25) * 0.08;
      if (Math.random() < 0.3) this.particles.ripple(P.bobber[0], P.bobber[2], this.t, 0.12);
      P.prompt = '<kbd>CLIQUE!</kbd> O peixe mordeu!';
      if (cliqueNovo) { P.estado = 'brigando'; P.dist = 1; P.tensao = 20; P.inicioBriga = performance.now(); $('pescaUi').hidden = false; this.audio.reel(); }
      else if (performance.now() > P.janela) { this.net.action({ tipo: 'pesca_puxar', sid: P.sid, resultado: 'escapou' }); this.ui.aviso('O peixe soltou a isca. Seja mais rápido!', 'ruim'); P.estado = 'pronto'; P.bobber = null; P.sid = null; }
    } else if (P.estado === 'brigando') {
      // minijogo de tensão: o peixe puxa em arrancadas; recolher sobe a tensão
      const forca = P.forcaPeixe * (0.6 + 0.5 * Math.max(0, Math.sin(this.t * 2.7) + Math.sin(this.t * 6.1) * 0.5));
      const pesoRel = P.kg / Math.max(0.1, vs.linhaKg);
      const reelV = 1 / (1.5 + 0.45 * P.kg);
      if (clicando) {
        P.dist -= reelV * dt * (1 - P.tensao / 160);
        P.tensao += (forca * 18 + 14 + pesoRel * 60) * dt;
        if (Math.random() < 0.3) this.audio.reel();
      } else {
        P.tensao -= 40 * dt;
        P.dist += forca * 0.04 * dt;
      }
      P.tensao = clamp(P.tensao, 0, 120); P.dist = clamp(P.dist, 0, 1.2);
      $('bTensao').style.width = `${Math.min(100, P.tensao)}%`; $('bTensao').style.background = P.tensao > 80 ? 'var(--ruim)' : P.tensao > 55 ? 'var(--amb)' : 'var(--ok)';
      $('bDist').style.width = `${Math.min(100, P.dist * 100)}%`;
      const k = P.dist;
      P.bobber = [lerp(this.me.pos[0], P.alvo[0], k) + Math.sin(this.t * 7) * 0.3 * k, -0.15 + Math.sin(this.t * 13) * 0.06, lerp(this.me.pos[2], P.alvo[2], k) + Math.cos(this.t * 5) * 0.3 * k];
      if (Math.random() < 0.25) this.particles.ripple(P.bobber[0], P.bobber[2], this.t, 0.1);
      P.prompt = 'Segure para recolher, solte quando a tensão subir';
      let resultado = null;
      if (P.tensao >= 100) resultado = 'arrebentou';
      else if (P.dist <= 0 || (k < 0.05 && this.groundAt(P.bobber[0], P.bobber[2]) > -0.3)) resultado = 'ok';
      if (resultado) {
        $('pescaUi').hidden = true;
        if (resultado === 'arrebentou') this.audio.snap();
        P.estado = 'resolvendo';
        const sid = P.sid;
        const enviar = () => this.acao({ tipo: 'pesca_puxar', sid, resultado }).then((res) => {
          if (this.pesca !== P) return;
          P.estado = 'pronto'; P.bobber = null; P.sid = null;
          P.prompt = '<kbd>Clique</kbd>segure e solte para lançar · <kbd>F</kbd>guardar a vara';
          if (res.ok && this.perfil.mao) {
            this.particles.splash(this.me.pos[0], this.me.pos[2], this.t, 0.05);
            this.particles.confetti([this.me.pos[0], this.me.pos[1] + 2, this.me.pos[2]], 16);
            this.audio.coin();
            this.cancelarPesca();
          } else if (res.escapou) this.audio.snap();
        });
        // o servidor exige um tempo mínimo de briga; espera se necessário
        const minimo = (1200 + Math.min(12000, P.kg * 400)) * 0.62;
        const falta = minimo - (performance.now() - P.mordida);
        if (falta > 0) setTimeout(enviar, falta); else enviar();
      }
    }
    // linha e boia
    if (P.bobber) {
      if (!this.bobberNode) {
        const g = new Geo(); g.put(sphere(0.07, 12, 8), [0, 0.03, 0], [0, 0, 0], 1, [0.95, 0.95, 0.95]); g.put(sphere(0.072, 12, 8), [0, 0.07, 0], [0, 0, 0], [1, 0.5, 1], [0.9, 0.15, 0.1]); g.put(cylinder(0.008, 0.008, 0.12, 6), [0, 0.15, 0], [0, 0, 0], 1, [0.9, 0.15, 0.1]);
        this.bobberNode = new Node('boia'); this.bobberNode.mesh = this.R.createMesh(g, { rough: 0.4 }); this.fxRoot.add(this.bobberNode);
      }
      this.bobberNode.at(P.bobber[0], P.bobber[1], P.bobber[2]);
      const sag = P.estado === 'brigando' ? 0.05 + (1 - P.tensao / 100) * 0.4 : P.estado === 'voando' ? 0.2 : 1.0;
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const k = i / 14;
        pts.push([lerp(tip[0], P.bobber[0], k), lerp(tip[1], P.bobber[1] + 0.12, k) - Math.sin(k * Math.PI) * sag * Math.hypot(tip[0] - P.bobber[0], tip[2] - P.bobber[2]) * 0.06, lerp(tip[2], P.bobber[2], k)]);
      }
      const lg = tube(pts, 0.006, 3); lg.c = lg.c.map((v, i) => (i % 4 === 3 ? 0 : 0.9));
      if (!this.lineNode) { this.lineNode = new Node('linha'); this.lineNode.mesh = this.R.createMesh(lg, { rough: 0.3, emissive: [0.4, 0.4, 0.4], glow: 0.6, castShadow: false }, { dynamic: true }); this.fxRoot.add(this.lineNode); }
      else this.R.updateMesh(this.lineNode.mesh, lg);
      this.lineNode.mesh.radius = 1e6;
    } else {
      if (this.lineNode) { this.fxRoot.remove(this.lineNode); this.lineNode = null; }
      if (this.bobberNode) { this.fxRoot.remove(this.bobberNode); this.bobberNode = null; }
    }
  }

  // peixe na mão (local ou remoto)
  updateHeld(ch, mao, quem) {
    const key = mao ? mao.uid + (mao.cortado ? ':c' : '') : null;
    if (ch._heldKey === key) return;
    if (ch._held) { ch._held.parent?.remove(ch._held); ch._held = null; }
    ch._heldKey = key;
    if (!mao) return;
    const tub = ESPECIES[mao.esp].pesado && !mao.cortado;
    // na mão o peixe aparece pelo menos com 16 cm para ser visível (o tamanho real vale para as regras)
    const L = tub ? mao.cm / 100 : Math.max(mao.cm, 16) / 100;
    const n = mao.cortado ? fishCutNode(this.R, mao.esp, Math.min(L * 100, 150)) : fishNode(this.R, mao.esp, L * 100);
    const holder = new Node('segurando');
    holder.add(n);
    if (tub) {
      // tubarão erguido sobre a cabeça com as duas mãos
      n.rot(0, Math.PI / 2, 0);
      holder.at(0, 0.62, -0.05);
      ch.chest.add(holder);
    } else {
      // segurado pela cauda: cabeça para baixo, pendurado na mão
      n.rot(Math.PI / 2, 0, 0).at(0, -L * 0.45, 0.02);
      ch.handR.add(holder);
    }
    ch._held = holder;
    void quem;
  }

  // ------------------------------------------------------------ submarino
  updateSub(dt, ctl) {
    const I = this.input, me = this.me, sc = this.sub, p = this.perfil;
    const st = subStats(p);
    const station = this.stations[this.slot];
    const cr = this.crane;
    let input = { f: 0, t: 0, u: 0 };
    if (ctl && cr.estado === 'livre') {
      input.f = I.axis('KeyS', 'KeyW') + (I.touch.active ? I.touch.move[1] : 0);
      input.t = -I.axis('KeyA', 'KeyD') - (I.touch.active ? I.touch.move[0] : 0);
      // Q sobe, C afunda (Espaço/Ctrl também funcionam)
      input.u = (I.down('KeyQ') || I.down('Space') ? 1 : 0) - (I.down('ControlLeft') || I.down('KeyC') ? 1 : 0);
      input.f = clamp(input.f, -1, 1); input.t = clamp(input.t, -1, 1);
    }
    // V alterna a câmera externa entre perto, médio e longe (sem visão de dentro)
    if (ctl && I.hit('KeyV')) { me.subDist = ((me.subDist ?? 1) + 1) % 3; }
    me.subCam = 'terceira';
    if (ctl && I.hit('KeyL')) { sc.luzes = !sc.luzes; this.audio.blip(900, 0.06, 'square', 0.04); }
    let prompt = '';
    const prevY = sc.pos[1];
    if (cr.estado === 'berco') {
      sc.pos = this.cradlePos.slice(); sc.yaw = station.yaw; sc.vel = [0, 0, 0];
      sc.bateria = Math.min(st.bateria, sc.bateria + (p.estacao.carregador ? ENERGIA.recargaRapida : ENERGIA.recargaDoca) * dt);
      prompt = `<kbd>E</kbd>Descer com o guindaste · <kbd>Q</kbd>Sair do submarino · <kbd>T</kbd>Computador · bateria ${Math.round((sc.bateria / st.bateria) * 100)}%`;
      if (ctl && I.hit('KeyT')) this.ui.abrir('terminal');
      if (ctl && I.hit('KeyE')) { cr.estado = 'descendo'; cr.t = 0; cr.splash = false; this.audio.crane(); }
      if (ctl && I.hit('KeyQ')) {
        me.modo = 'terra';
        me.pos = station.toWorld(2.6, 1.6, station.zCradle);
        me.vel = [0, 0, 0];
        this.ui.esconderSubHud();
        this.ui.prompt(null);
        this.cameraTerra(dt);
        return;
      }
    } else if (cr.estado === 'descendo' || cr.estado === 'subindo') {
      this.animarGuindaste(dt, cr, station);
      prompt = cr.estado === 'descendo' ? 'Guindaste baixando o submarino…' : 'Guindaste içando o submarino…';
    } else {
      // livre na água
      const env = { ondaY: Math.sin(this.t * 1.1 + sc.pos[0] * 0.2) * 0.06 };
      const res = sc.step(dt, input, st, env);
      this.colidirSubCais(sc);
      if (sc.impacto > 1.2 && performance.now() - sc.ultimoImpacto > 400) { sc.ultimoImpacto = performance.now(); this.audio.clank(Math.min(1.5, sc.impacto / 3)); this.shake = Math.min(0.5, sc.impacto * 0.08); }
      if (sc.emergencia && !this.avisoEmerg) { this.avisoEmerg = true; this.ui.aviso(sc.motivoEmergencia === 'oxigenio' ? 'OXIGÊNIO ESGOTADO! Subida de emergência automática.' : 'FALHA NO CASCO! Lastro de emergência liberado — subindo.', 'ruim', 6000); this.audio.alarm(); }
      if (!sc.emergencia) this.avisoEmerg = false;
      const depth = -sc.pos[1];
      if (depth > st.maxProf * 0.9 && Math.floor(this.t * 1.5) !== this.ultAlarme) { this.ultAlarme = Math.floor(this.t * 1.5); if (depth > st.maxProf) this.audio.alarm(); }
      // bolhas da hélice
      if (res.submerso && Math.abs(sc.thrust) > 0.2 && Math.random() < 0.6) {
        const b = [sc.pos[0] - Math.sin(sc.yaw) * 2.5, sc.pos[1], sc.pos[2] - Math.cos(sc.yaw) * 2.5];
        this.particles.bubbles(b, 2, 0.5);
      }
      // esteira na superfície
      if (!res.submerso && Math.abs(res.vf) > 1 && Math.random() < 0.15) this.particles.ripple(sc.pos[0], sc.pos[2], this.t, 0.25);
      // ações
      const near = this.itemMaisProximo(st.alcance + 2.3);
      const dDoca = Math.hypot(sc.pos[0] - this.launchPos[0], sc.pos[2] - this.launchPos[2]);
      const speed = Math.hypot(...sc.vel);
      if (dDoca < 14 && depth < 2.2) {
        prompt = speed < 2.5 ? '<kbd>E</kbd>Prender no gancho e içar para o berço · <kbd>T</kbd>Computador' : 'Reduza a velocidade para o gancho prender';
        if (ctl && I.hit('KeyT')) this.ui.abrir('terminal');
        sc.bateria = Math.min(st.bateria, sc.bateria + ENERGIA.recargaDoca * 0.5 * dt);
        if (ctl && I.hit('KeyE') && speed < 2.5) { cr.estado = 'subindo'; cr.t = 0; cr.inicio = sc.pos.slice(); cr.yaw0 = sc.yaw; this.audio.crane(); }
      } else if (near) {
        const t = SUCATA[near.item.tipo];
        prompt = `<kbd>E</kbd>Recolher ${t.nome} (${t.kg} kg)`;
        if (ctl && I.hit('KeyE') && !this.bracoAnim) this.recolher(near);
      } else if (depth > 2) prompt = '';
      else prompt = '<kbd>C</kbd> afundar · volte ao cais da sua estação para içar';
      if (ctl && I.hit('KeyR')) {
        if (sc.bateria > ENERGIA.sonarPing) { sc.bateria -= ENERGIA.sonarPing; this.sonarPing = this.t; this.audio.sonar(); }
      }
      if (ctl && I.hit('KeyB')) this.lancarBalao();
      if (sc.estresse > 0 && depth > st.maxProf) prompt = `⚠ ABAIXO DO LIMITE DO CASCO (${st.maxProf} m) — estresse ${Math.round(sc.estresse)}%`;
      if (sc.bateria <= 0) prompt = '⚠ BATERIA ESGOTADA — flutuação de emergência levando você à superfície';
      if (this.tinta) prompt = 'Vidro coberto de tinta: use o SONAR e suba (Q) até a superfície';
    }
    // transição na linha d'água → respingo / água escorrendo
    this.efeitosSuperficie(prevY, sc.pos[1], sc.vel ? sc.vel[1] : 0, sc.pos, cr.estado);
    this.subPrompt = prompt;
    // braço mecânico e lançador
    this.animarGarra(dt);
    if (this.lancador) { this.lancador.t += dt; if (!this.lancador.solto && this.lancador.t > 0.42) { this.lancador.solto = true; this.acao({ tipo: 'arremessar_balao', dir: this.lancador.dir }); } if (this.lancador.t > 1.1) this.lancador = null; }
    // HUD do sub
    this.ui.subHud(p, sc, { vel: Math.hypot(...sc.vel), luz: sc.luzes });
    this.drawSonar();
    $('alertaTinta').hidden = true; // o aviso agora fica no meio da tinta (tela)
    this.cameraSub(dt);
  }
  efeitosSuperficie(prevY, y, vy, pos, estado) {
    if (prevY > 0.15 && y <= 0.15) {
      const e = clamp(Math.abs(vy) / 3, 0.6, 2.2);
      this.particles.splash(pos[0], pos[2], this.t, e);
      this.particles.bubbles([pos[0], -1, pos[2]], 40, 2.5);
      this.audio.splash(e);
      this.shake = 0.35;
    }
    if (prevY < -0.2 && y >= -0.2 && estado === 'subindo') { this.particles.sheet(pos, 1.1, 60); this.audio.splash(0.6); }
    if (y > 0.3 && (estado === 'subindo' || estado === 'berco') && this.molhado > 0) {
      this.molhado -= 0.004;
      if (Math.random() < this.molhado) { this.particles.drip(pos, 1.0, 2); if (Math.random() < 0.1) this.audio.drip(); }
      if (y < 4 && Math.random() < 0.5 && estado === 'subindo') this.particles.sheet(pos, 1.0, 3);
    }
    if (y < -0.5) this.molhado = 1;
  }
  animarGuindaste(dt, cr, station) {
    const sc = this.sub;
    const dur = 8.5;
    cr.t += dt / dur;
    const k = Math.min(1, cr.t);
    const L = station.boom, xp = station.xPivot, zp = station.zPivot;
    const a0 = station.angBerco, a1 = station.angAgua;
    const altoY = 6.4;
    const ease = (x) => x * x * (3 - 2 * x);
    const naLanca = (ang, y) => station.toWorld(xp + Math.sin(ang) * L, y, zp + Math.cos(ang) * L);
    let y;
    if (cr.estado === 'descendo') {
      if (k < 0.18) { y = lerp(3.72, altoY, ease(k / 0.18)); sc.pos = naLanca(a0, y); }
      else if (k < 0.55) { const q = ease((k - 0.18) / 0.37); y = altoY + Math.sin(q * Math.PI) * 0.3; sc.pos = naLanca(lerp(a0, a1, q), y); }
      else { const q = (k - 0.55) / 0.45; y = lerp(altoY, -0.45, q * q); sc.pos = naLanca(a1, y); } // o cabo solta e o sub acelera até a água
      cr.ganchoY = y + 1.85;
      sc.pos[0] += Math.sin(this.t * 2.3) * 0.05; // balanço do sub pendurado
      sc.vel = [0, k > 0.55 ? -((k - 0.55) / 0.45) * 2 * (altoY + 0.45) / (dur * 0.45) : 0, 0];
      sc.yaw = station.yaw;
      if (k >= 1) {
        cr.estado = 'livre'; sc.vel = [0, -0.6, 0]; sc.pos = this.launchPos.slice();
        cr.ganchoY = 4.5;
        this.ui.aviso('Submarino na água! W/S/A/D para pilotar, Ctrl ou C para mergulhar.', 'ok');
      }
    } else {
      const ini = cr.inicio;
      const ls = station.toLocal(ini);
      if (k < 0.15) { y = ini[1]; cr.ganchoY = lerp(5.5, y + 1.85, k / 0.15); sc.pos = ini.slice(); }
      else if (k < 0.45) { const q = ease((k - 0.15) / 0.3); y = lerp(ini[1], altoY, q); sc.pos = station.toWorld(lerp(ls[0], station.xLaunch, q), y, lerp(ls[2], station.zLaunch, q)); cr.ganchoY = y + 1.85; }
      else if (k < 0.8) { const q = ease((k - 0.45) / 0.35); y = altoY; sc.pos = naLanca(lerp(a1, a0, q), y); cr.ganchoY = y + 1.85; }
      else { const q = ease((k - 0.8) / 0.2); y = lerp(altoY, 3.72, q); sc.pos = naLanca(a0, y); cr.ganchoY = y + 1.85; }
      sc.yaw = dampAngle(sc.yaw, station.yaw, 2, dt);
      sc.vel = [0, k > 0.15 && k < 0.45 ? 1.5 : 0, 0];
      if (k >= 1) { cr.estado = 'berco'; sc.vel = [0, 0, 0]; sc.pos = this.cradlePos.slice(); this.ui.aviso('Submarino no berço. Q para sair; venda e melhorias no terminal.', 'ok'); }
    }
  }
  itemMaisProximo(r) {
    let best = null, bd = r;
    for (const n of this.items.values()) {
      if (SUCATA[n.item.tipo]?.terra) continue; // lixo da margem se cata a pé
      const d = Math.hypot(n.pos[0] - this.sub.pos[0], n.pos[1] - this.sub.pos[1], n.pos[2] - this.sub.pos[2]);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  recolher(n) {
    // a garra vai até o objeto, fecha, traz para perto do sub e guarda no cesto
    this.bracoAnim = { t: 0, alvo: n.pos.slice(), n, id: n.item.id, enviado: false, pego: false, falhou: false };
    this.audio.claw();
  }
  animarGarra(dt) {
    const b = this.bracoAnim; if (!b) return;
    b.t += dt;
    if (!b.enviado && b.t > 0.55) {
      b.enviado = true;
      this.acao({ tipo: 'coletar', item: b.id }).then((res) => { if (!res.ok) b.falhou = true; else { b.pego = true; this.audio.claw(); } });
    }
    if (b.pego && b.n) {
      // o objeto acompanha a garra; no fim encolhe para dentro do cesto
      const sm = this.subModels[this.slot];
      if (sm) { const cp = sm.m.claw.worldPos(); b.n.at(cp[0], cp[1] - 0.1, cp[2]); }
      if (b.t > 1.35) b.n.sc(Math.max(0.01, 1 - (b.t - 1.35) / 0.25));
    }
    if (b.t > 1.65 || (b.falhou && b.t > 1.0)) { if (b.pego && b.n) { this.itemsRoot.remove(b.n); this.items.delete(b.id); } this.bracoAnim = null; }
  }
  async lancarBalao() {
    const p = this.perfil;
    if (!p.extras.lancador) { this.ui.aviso('Instale o lançador de balões no terminal (aba Submarino)', 'ruim'); return; }
    if (p.baloes <= 0) { this.ui.aviso('Sem balões de tinta — pesque uma lula e use a bancada de tinta', 'ruim'); return; }
    if (this.lancador) return;
    if (this.sub.pos[1] > -2) { this.ui.aviso('O lançador só funciona submerso', 'ruim'); return; }
    const fw = [Math.sin(this.sub.yaw), Math.max(-0.4, Math.min(0.4, this.camForward()[1] * 0.5)), Math.cos(this.sub.yaw)];
    this.lancador = { t: 0, dir: fw, solto: false };
  }
  cameraSub(dt) {
    const me = this.me, sc = this.sub;
    if (false) {
      const c = Math.cos(sc.yaw), s = Math.sin(sc.yaw);
      const pos = [sc.pos[0] + s * 1.0, sc.pos[1] + 0.15, sc.pos[2] + c * 1.0];
      // olhar limitado pela janela
      me.camYaw = sc.yaw + clamp(angDiff(sc.yaw, me.camYaw), -1.0, 1.0);
      me.camPitch = clamp(me.camPitch, -0.7, 0.6);
      const vy = me.vYaw ?? me.camYaw, vp = me.vPitch ?? me.camPitch;
      const f = [Math.sin(vy) * Math.cos(vp), Math.sin(vp), Math.cos(vy) * Math.cos(vp)];
      this.setCam(pos, [pos[0] + f[0], pos[1] + f[1], pos[2] + f[2]], 1.15);
      return;
    }
    const alvoB = [sc.pos[0], sc.pos[1] + 0.9, sc.pos[2]];
    if (!this.camAlvoSub) this.camAlvoSub = alvoB.slice();
    for (let j = 0; j < 3; j++) this.camAlvoSub[j] = damp(this.camAlvoSub[j], alvoB[j], 18, dt);
    const alvo = this.camAlvoSub;
    const yaw = me.vYaw ?? me.camYaw, pitch = me.vPitch ?? me.camPitch;
    const dist = [6.5, 9.5, 15][me.subDist ?? 1];
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = [-Math.sin(yaw) * cp, -sp, -Math.cos(yaw) * cp];
    // a câmera nunca entra na rocha/terreno (senão dá para ver fora do mapa): para antes de qualquer parede
    let d = dist;
    for (let k = 0.5; k <= dist; k += 0.25) {
      const x = alvo[0] + dir[0] * k, y = alvo[1] + dir[1] * k, z = alvo[2] + dir[2] * k;
      if (navSDF(x, y, z) < 1.1 || (y > -3 && y < this.groundAt(x, z) + 0.5)) { d = Math.max(0.6, k - 0.9); break; }
    }
    if (this.camDistSub === undefined) this.camDistSub = d;
    // aproxima na hora (sem atravessar a parede nem por um quadro); afasta devagar
    this.camDistSub = d < this.camDistSub ? d : damp(this.camDistSub, d, 3.5, dt);
    const pos = [alvo[0] + dir[0] * this.camDistSub, alvo[1] + dir[1] * this.camDistSub, alvo[2] + dir[2] * this.camDistSub];
    // última garantia: se ainda estiver dentro de rocha, puxa para perto do submarino
    for (let k = 0; k < 8 && navSDF(pos[0], pos[1], pos[2]) < 0.5; k++) for (let j = 0; j < 3; j++) pos[j] = alvo[j] + (pos[j] - alvo[j]) * 0.7;
    // a câmera escolhe um lado da superfície e só troca com folga (histerese) — sem cintilar na linha d'água
    const lado = this.camLadoAgua ?? (sc.pos[1] < -1.5 ? -1 : 1);
    this.camLadoAgua = sc.pos[1] < -2.2 ? -1 : sc.pos[1] > -0.8 ? 1 : lado;
    if (this.camLadoAgua > 0 && pos[1] < 0.5) pos[1] = 0.5;
    if (this.camLadoAgua < 0 && pos[1] > -0.5) pos[1] = -0.5;
    this.setCam(pos, alvo, 1.05);
  }
  drawSonar() {
    const cv = $('sonar'); cv.hidden = false;
    const c = cv.getContext('2d'), W = cv.width, R = W / 2;
    const st = subStats(this.perfil), sc = this.sub;
    const rng = st.sonar;
    c.clearRect(0, 0, W, W);
    c.save(); c.translate(R, R);
    c.strokeStyle = 'rgba(90,230,150,.25)'; c.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(0, 0, R * k - 2, 0, 6.29); c.stroke(); }
    const pingAge = this.t - this.sonarPing;
    // paredes: distância até a rocha em 48 direções, na profundidade atual
    c.fillStyle = 'rgba(120,255,170,.65)';
    const sampleEvery = 0.25;
    if (!this.sonarWalls || this.t - this.sonarWallsT > sampleEvery) {
      this.sonarWallsT = this.t;
      this.sonarWalls = [];
      for (let a = 0; a < 48; a++) {
        const ang = (a / 48) * Math.PI * 2;
        let d = rng;
        for (let r = 2; r < rng; r += Math.max(1.5, rng / 40)) {
          if (navSDF(sc.pos[0] + Math.sin(ang) * r, sc.pos[1], sc.pos[2] + Math.cos(ang) * r) < 0) { d = r; break; }
        }
        this.sonarWalls.push([ang, d]);
      }
    }
    for (const [ang, d] of this.sonarWalls) {
      if (d >= rng) continue;
      const rel = ang - sc.yaw;
      const x = Math.sin(rel) * (d / rng) * (R - 4), y = -Math.cos(rel) * (d / rng) * (R - 4);
      c.fillRect(-x - 2, y - 2, 4, 4);
    }
    // itens: o ping revela por 10 s; sem ping só os muito próximos
    const rev = pingAge < 10 ? 1 : 0.2;
    for (const n of this.items.values()) {
      if (SUCATA[n.item.tipo]?.terra) continue;
      const dx = n.pos[0] - sc.pos[0], dz = n.pos[2] - sc.pos[2], dy = n.pos[1] - sc.pos[1];
      const d = Math.hypot(dx, dz);
      if (d > rng * rev || Math.abs(dy) > Math.max(40, rng * 0.5)) continue;
      const ang = Math.atan2(dx, dz) - sc.yaw;
      const x = Math.sin(ang) * (d / rng) * (R - 4), y = -Math.cos(ang) * (d / rng) * (R - 4);
      const rar = SUCATA[n.item.tipo].rar;
      c.fillStyle = rar === 'raro' || rar === 'lendário' ? '#ffd35a' : '#ffe9b8';
      c.beginPath(); c.arc(-x, y, 2.6, 0, 6.29); c.fill();
    }
    for (const r of Object.values(this.remotos)) {
      if (r.modo !== 'sub') continue;
      const dx = r.sub.pos[0] - sc.pos[0], dz = r.sub.pos[2] - sc.pos[2]; const d = Math.hypot(dx, dz);
      if (d > rng) continue;
      const ang = Math.atan2(dx, dz) - sc.yaw;
      c.fillStyle = `rgb(${CORES_JOGADOR[r.cor % CORES_JOGADOR.length].roupa.map((v) => Math.round(v * 255)).join(',')})`;
      c.beginPath(); c.arc(-Math.sin(ang) * (d / rng) * (R - 4), -Math.cos(ang) * (d / rng) * (R - 4), 4, 0, 6.29); c.fill();
    }
    if (pingAge < 1.5) { c.strokeStyle = `rgba(120,255,170,${1 - pingAge / 1.5})`; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, (pingAge / 1.5) * R, 0, 6.29); c.stroke(); }
    c.fillStyle = '#7dffb0'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.fill();
    c.restore();
    c.fillStyle = '#9fffc4'; c.font = 'bold 12px system-ui'; c.textAlign = 'center';
    c.fillText(`${Math.round(-sc.pos[1])} m · alcance ${rng} m`, R, W - 14);
    // direção da estação (seta na borda)
    const dx = this.launchPos[0] - sc.pos[0], dz = this.launchPos[2] - sc.pos[2];
    const ang = Math.atan2(dx, dz) - sc.yaw;
    c.fillStyle = '#ffb347'; c.beginPath(); c.arc(R - Math.sin(ang) * (R - 10), R - Math.cos(ang) * (R - 10), 5, 0, 6.29); c.fill();
  }

  desenharMapa(cv) {
    const c = cv.getContext('2d'), W = cv.width, S = W / (PLAY_R * 2 + 40), O = W / 2;
    const P = (x, z) => [O + x * S, O + z * S];
    c.fillStyle = '#1d3a26'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#2c4f2e'; c.beginPath(); c.arc(O, O, PLAY_R * S, 0, 6.29); c.fill();
    c.fillStyle = '#b9a77e'; c.beginPath(); c.arc(O, O, (LAKE_R + 4) * S, 0, 6.29); c.fill();
    const gr = c.createRadialGradient(O, O, 10, O, O, LAKE_R * S);
    gr.addColorStop(0, '#05141c'); gr.addColorStop(0.55, '#0d3240'); gr.addColorStop(1, '#2f6f73');
    c.fillStyle = gr; c.beginPath(); c.arc(O, O, LAKE_R * S, 0, 6.29); c.fill();
    const [fx, fz] = P(SHAFT_C.x, SHAFT_C.z);
    c.fillStyle = '#000'; c.beginPath(); c.arc(fx, fz, 56 * S, 0, 6.29); c.fill();
    c.fillStyle = '#7fb'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.fillText('FENDA ABISSAL', fx, fz + 4);
    c.strokeStyle = '#6a5a3c'; c.setLineDash([6, 5]); c.lineWidth = 3; c.beginPath(); c.arc(O, O, (LAKE_R + 52) * S, 0, 6.29); c.stroke(); c.setLineDash([]);
    for (const cav of CAVES) if (this.perfil.descobertas.includes('lugar:' + cav.id)) { const [x, z] = P(cav.b[0], cav.b[2]); c.fillStyle = '#4fe3c8'; c.fillText(cav.nome + ` (${-cav.b[1]} m)`, x, z); }
    for (const s of STATIONS) {
      const [x, z] = P(s.pad[0], s.pad[1]);
      const dono = s.id === this.slot ? this.perfil : this.remotos[s.id];
      if (!dono) continue; // vaga livre não aparece no mapa
      c.fillStyle = dono ? `rgb(${CORES_JOGADOR[dono.cor % CORES_JOGADOR.length].roupa.map((v) => Math.round(v * 255)).join(',')})` : '#666';
      c.fillRect(x - 12, z - 12, 24, 24);
      c.fillStyle = '#fff'; c.fillText(s.id + (dono ? ' · ' + dono.nome : ''), x, z - 18);
    }
    const dot = (p, cor, r = 6) => { const [x, z] = P(p[0], p[2]); c.fillStyle = cor; c.beginPath(); c.arc(x, z, r, 0, 6.29); c.fill(); };
    for (const r of Object.values(this.remotos)) { dot(r.sub.pos, '#ffd166'); dot(r.pos, `rgb(${CORES_JOGADOR[r.cor % CORES_JOGADOR.length].roupa.map((v) => Math.round(v * 255)).join(',')})`, 4); }
    dot(this.sub.pos, '#ffb347', 7);
    const [mx, mz] = P(this.me.pos[0], this.me.pos[2]);
    c.save(); c.translate(mx, mz); c.rotate(-this.me.yaw + Math.PI); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(-6, 7); c.fill(); c.restore();
  }

  // ------------------------------------------------------------ modelos de submarino (todos) e guindastes
  updateSubModels(dt) {
    const entradas = [[this.slot, { niveis: this.perfil.sub, cor: this.perfil.cor, lancador: this.perfil.extras.lancador, pos: this.sub.pos, yaw: this.sub.yaw, pitch: this.sub.pitchVis, roll: this.sub.rollVis, luz: this.sub.luzes, estado: this.crane.estado, tinta: this.tinta, gancho: this.crane.ganchoY, local: true }]];
    for (const [slot, r] of Object.entries(this.remotos)) {
      const ip = this.interp(r, 'sub');
      entradas.push([slot, { niveis: r.sub.niveis, cor: r.cor, lancador: r.sub.lancador, pos: ip.pos, yaw: ip.rot, pitch: r.sub.pitch || 0, roll: 0, luz: r.sub.luz, estado: r.sub.estado, tinta: r.tinta, gancho: r.sub.gancho, local: false }]);
    }
    const spots = [];
    for (const [slot, e] of entradas) {
      let sm = this.subModels[slot];
      const key = JSON.stringify([e.niveis, e.cor, e.lancador]);
      if (!sm || sm.key !== key) {
        if (sm) this.scene.remove(sm.m.root);
        const m = buildSubModel(this.R, e.niveis, e.cor, { lancador: e.lancador });
        this.scene.add(m.root);
        sm = this.subModels[slot] = { m, key, prevY: e.pos[1], propAng: 0, cargaKey: null };
        if (!e.local && this.ui) {/* outro jogador melhorou o sub */}
      }
      const m = sm.m;
      m.root.at(e.pos[0], e.pos[1], e.pos[2]).rot(e.pitch, e.yaw, e.roll);
      sm.propAng += (e.local ? this.sub.thrust * 14 : (e.estado === 'livre' ? 6 : 0)) * dt;
      m.prop.rot(0, 0, sm.propAng);
      m.ink.visible = !!e.tinta;
      m.lenses.mesh.mat.glow = e.luz ? 3 : 0;
      m.cones.visible = !!e.luz && e.pos[1] < -1.5;
      // no modo cabine, o próprio casco não é desenhado (vemos pela janela)
      m.root.visible = true;
      // braço mecânico
      if (e.local && this.bracoAnim) {
        const b = this.bracoAnim, t = b.t, ease = (x) => x * x * (3 - 2 * x);
        const k = t < 0.5 ? ease(t / 0.5) : t < 0.65 ? 1 : t < 1.3 ? 1 - ease((t - 0.65) / 0.65) : 0;
        const loc = this.toSubLocal(b.alvo);
        const yaw = Math.atan2(loc[0] - 0.55, loc[2] - 1.35), pitch = -Math.atan2(loc[1] + 0.6, Math.hypot(loc[0] - 0.55, loc[2] - 1.35));
        m.armBase.rot(pitch * k + 0.5 * (1 - k), yaw * k, 0); m.fore.rot(-0.2 * k + 0.9 * (1 - k), 0, 0);
        const aberta = t < 0.55 || b.falhou;
        m.jaws.forEach((j, i) => j.rot(0, (i ? -1 : 1) * (aberta ? 0.45 : 0.02), 0));
      } else { m.armBase.rot(0.5, 0, 0); m.fore.rot(0.9, 0, 0); m.jaws.forEach((j, i) => j.rot(0, (i ? -1 : 1) * 0.1, 0)); }
      if (m.launcher) {
        // arremesso: puxa para trás (preparo), estica para a frente soltando a bolsa, volta
        const L = e.local ? this.lancador : null;
        let a1 = 0, a2 = 0;
        if (L) { const t = L.t; if (t < 0.35) { a1 = (t / 0.35) * 1.3; a2 = (t / 0.35) * 1.6; } else if (t < 0.5) { const q = (t - 0.35) / 0.15; a1 = 1.3 - q * 2.8; a2 = 1.6 - q * 2.0; } else { const q = Math.min(1, (t - 0.5) / 0.6); a1 = -1.5 * (1 - q); a2 = -0.4 * (1 - q); } }
        m.launcher.rot(a1, 0, 0); m.launcherFore.rot(a2, 0, 0);
        if (m.bolsa) m.bolsa.visible = e.local ? (this.perfil.baloes > 0 && !(L && L.solto)) : true;
      }
      // luz dos faróis
      if (e.luz && spots.length < 6) {
        const nv = e.niveis.farol || 1;
        const alcance = [26, 42, 62, 90][nv - 1];
        const fw = [Math.sin(e.yaw) * Math.cos(e.pitch), -Math.sin(e.pitch) - 0.08, Math.cos(e.yaw) * Math.cos(e.pitch)];
        const l = Math.hypot(...fw);
        const forca = [6, 9, 12.5, 17][nv - 1];
        spots.push({ pos: [e.pos[0] + fw[0] * 2.2, e.pos[1] + 0.1, e.pos[2] + fw[2] * 2.2], dir: fw.map((v) => v / l), col: [1.0, 0.95, 0.85].map((v) => v * forca), cos: Math.cos([0.36, 0.42, 0.48, 0.56][nv - 1]), range: alcance * 1.4 });
        // luz espalhada na água logo à frente (dá volume ao feixe)
        if (e.pos[1] < -1.5 && (this.luzesExtras ||= []).length < 4) this.luzesExtras.push({ pos: [e.pos[0] + fw[0] * 5, e.pos[1] + fw[1] * 5, e.pos[2] + fw[2] * 5], col: [0.5, 0.5, 0.45].map((v) => v * forca * 0.12), range: 9 + nv * 2 });
        // brilho das lentes
        if (sm.m.root.world) for (const lp of m.lamps) { const w = [0, 0, 0]; m4.xformPoint(m.root.world, lp, w); this.particles.emit({ p: w, v: [0, 0, 0], life: 0.035, size: 0.55 + nv * 0.12, col: [1, 0.95, 0.8, 0.55], g: 0, drag: 0, add: true, fade: 0 }); }
      }
      // guindaste da estação deste sub
      const sta = this.stations[slot];
      if (sta) sta.updateCrane(dt, e.pos, e.estado, e.estado === 'livre' ? (e.gancho || 0) : 0);
      // respingos para subs remotos (o local trata em updateSub)
      if (!e.local) { this.efeitosRemotos(sm, e); }
      sm.prevY = e.pos[1];
      // itens visíveis no cesto
      if (e.local) {
        const ck = this.perfil.carga.map((x) => x.uid).join();
        if (sm.cargaKey !== ck) {
          sm.cargaKey = ck;
          for (const c of [...m.cargo.children]) m.cargo.remove(c);
          this.perfil.carga.slice(-6).forEach((it, i) => { const n = new Node('c'); n.mesh = itemMesh(this.R, it.tipo); const s = SUCATA[it.tipo].kg > 50 ? 0.35 : 0.6; n.at((i % 2 ? 1 : -1) * 1.22, 0.05, -0.2 + Math.floor(i / 2) * 0.3).sc(s); m.cargo.add(n); });
        }
      }
    }
    // estações sem sub (vagas livres): guindaste em repouso
    for (const s of STATIONS) if (!entradas.find(([sl]) => sl === s.id)) this.stations[s.id].updateCrane(dt, null, 'livre', 0);
    this.spots = spots;
  }
  efeitosRemotos(sm, e) {
    if (sm.prevY > 0.15 && e.pos[1] <= 0.15) { this.particles.splash(e.pos[0], e.pos[2], this.t, 1.3); this.audio.splash(0.8); }
    if (sm.prevY < -0.2 && e.pos[1] >= -0.2 && e.estado === 'subindo') this.particles.sheet(e.pos, 1.1, 50);
    if (e.pos[1] > 0.4 && e.estado === 'subindo' && Math.random() < 0.5) this.particles.drip(e.pos, 1, 2);
  }
  toSubLocal(p) {
    const dx = p[0] - this.sub.pos[0], dy = p[1] - this.sub.pos[1], dz = p[2] - this.sub.pos[2];
    const c = Math.cos(this.sub.yaw), s = Math.sin(this.sub.yaw);
    return [dx * c - dz * s, dy, dx * s + dz * c];
  }
  interp(r, which) {
    // interpolação ~110 ms atrás do último snapshot
    const t = performance.now() - 110;
    const b = r.buf;
    if (!b.length) return which === 'sub' ? { pos: r.sub.pos, rot: r.sub.rot } : { pos: r.pos, rot: r.rot };
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].t <= t && b[i + 1].t >= t) { a = b[i]; c = b[i + 1]; break; }
    const k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 1;
    const A = which === 'sub' ? a.sub : a, C = which === 'sub' ? c.sub : c;
    return { pos: v3.lerp(A.pos, C.pos, k), rot: A.rot + angDiff(A.rot, C.rot) * k };
  }
  updateRemotes(dt) {
    for (const [slot, r] of Object.entries(this.remotos)) {
      const ip = this.interp(r, 'p');
      const ch = r.char;
      const prev = r.lastPos || ip.pos;
      const spd = Math.hypot(ip.pos[0] - prev[0], ip.pos[2] - prev[2]) / Math.max(dt, 1e-3);
      r.spd = damp(r.spd || 0, spd, 8, dt);
      r.lastPos = ip.pos;
      ch.root.visible = !(r.modo === 'sub' || r.modo === 'guindaste');
      ch.root.at(ip.pos[0], ip.pos[1], ip.pos[2]).rot(0, ip.rot, 0);
      const segura = r.mao ? (ESPECIES[r.mao.esp]?.pesado ? 'tubarao' : r.anim === 'mira' ? 'mira' : 'peixe') : r.pescaVis ? 'vara' : r.arma && r.modo === 'terra' ? 'arma' : null;
      const em = r.anim === 'escorrega' ? [0, 2] : /^emote(\d)$/.exec(r.anim || '');
      if (em) { if (!r.emote || r.emote.i !== +em[1]) r.emote = { i: +em[1], t: 0 }; r.emote.t += dt; } else r.emote = null;
      ch.update(dt, { speed: r.modo === 'terra' ? r.spd : 0, grounded: true, mode: r.modo, segura, acao: null, atordoado: r.atordoado > 0 ? 1 : 0, tubarao: false, emote: r.emote });
      this.updateHeld(ch, r.mao, slot);
      this.updateLixoMao(ch, r.modo === 'terra' ? r.lixo : null);
      this.updateArmaMao(ch, r.modo === 'terra' ? r.arma : null);
      // nome flutuando
      if (!r.tag || r.tagNome !== r.nome) {
        if (r.tag) ch.root.remove(r.tag);
        r.tag = textQuad(this.R, [r.nome], 1.6, 0.36, { px: 256, transparent: true, billboard: true, color: '#fff' });
        r.tag.at(0, 2.25, 0); ch.root.add(r.tag); r.tagNome = r.nome;
      }
      // vara e linha do amigo
      if (r.pescaVis && !r.rod) { r.rod = makeRod(this.R, r.estacao.vara || 1, r.estacao.pesado); ch.handR.add(r.rod); r.rod.rot(2.6, 0, 0); }
      if (!r.pescaVis && r.rod) { r.rod.parent?.remove(r.rod); r.rod = null; if (r.line) { this.fxRoot.remove(r.line); r.line = null; } }
      if (r.pescaVis && r.rod) {
        const tip = r.rod.tip.worldPos(), b = r.pescaVis.b;
        const lg = tube([tip, [(tip[0] + b[0]) / 2, Math.min(tip[1], b[1]) - 0.4, (tip[2] + b[2]) / 2], b], 0.006, 3); lg.c = lg.c.map((v, i) => (i % 4 === 3 ? 0 : 0.9));
        if (!r.line) { r.line = new Node('linha_r'); r.line.mesh = this.R.createMesh(lg, { emissive: [0.4, 0.4, 0.4], glow: 0.6, castShadow: false }, { dynamic: true }); r.line.mesh.radius = 1e6; this.fxRoot.add(r.line); }
        else this.R.updateMesh(r.line.mesh, lg);
      }
    }
  }

  // ------------------------------------------------------------ desenho
  draw() {
    const env = computeEnv(this.worldTime, this.cam.pos);
    this.envAtual = env;
    // a visão debaixo d'água melhora conforme os faróis do submarino evoluem
    if (env.under && this.me.modo === 'sub') env.wFogDen *= [1, 0.82, 0.68, 0.55][(this.perfil.sub.farol || 1) - 1] ?? 0.55;
    if (params.has('semneblina')) env.wFogDen *= 0.08; // depuração: enxergar a geometria inteira
    env.time = this.t;
    env.ripples = this.particles.ripples;
    env.spots = this.spots || [];
    const pts = [];
    for (const s of Object.values(this.stations)) if (s.ativa && s.lights && env.day < 0.6) for (const l of s.lights) if (pts.length < 8 && Math.hypot(l[0] - this.cam.pos[0], l[2] - this.cam.pos[2]) < 90) pts.push({ pos: l, col: [3.2, 2.5, 1.6], range: 14 });
    // luz interna da cabine (painel) deixa o próprio sub legível no escuro
    if (this.sub.pos[1] < -8) pts.push({ pos: [this.sub.pos[0], this.sub.pos[1] + 1.8, this.sub.pos[2]], col: [0.35, 0.42, 0.48], range: 7 });
    for (const l of this.luzesExtras || []) pts.push(l);
    this.luzesExtras = [];
    for (const l of this.fauna.lights || []) pts.push(l);
    if (-this.cam.pos[1] > 3900) pts.push({ pos: [SHAFT_C.x, -4285, SHAFT_C.z], col: [0.8, 2.2, 2.6], range: 90 });
    for (const c of CAVES) if (Math.abs(this.cam.pos[1] - c.b[1]) < 80) pts.push({ pos: [c.b[0], c.b[1], c.b[2]], col: [0.4, 1.8, 1.6], range: 16 });
    env.points = pts.slice(0, 10);
    const focus = this.me.modo === 'terra' || this.me.modo === 'nadando' ? this.me.pos : this.sub.pos;
    env.shadowOn = this.cam.pos[1] > -2 && focus[1] > -10;
    env.shadowCenter = [focus[0], Math.max(0, focus[1]), focus[2]];
    env.shadowRadius = 45;
    env.water = this.cam.pos[1] > -120;
    // recorte grosso: debaixo d'água a névoa esconde a margem e a floresta
    const sub = this.cam.pos[1] < -4, fundo = this.cam.pos[1] < -140;
    for (const c of this.veg.root.children) c.visible = c.name === 'algas' ? !fundo : !sub;
    for (const c of this.terreno.children) if (c.name !== 'terreno_interno') c.visible = !sub;
    this.terreno.children[0].visible = !fundo || this.cam.pos[1] > -400;
    for (const st of Object.values(this.stations)) st.root.visible = !!st.ativa && !fundo && Math.hypot(st.st.pad[0] - this.cam.pos[0], st.st.pad[1] - this.cam.pos[2]) < (sub ? 140 : 1e9);
    this.itemsRoot.children.forEach((n) => { n.visible = Math.abs(n.pos[1] - this.cam.pos[1]) < 220; });
    // glifos da câmara pulsam
    this.R.render(this.scene, this.cam, env, { particles: this.particles });
    this.drawOverlay();
    if (DEBUG) this.debugInfo = { ...this.R.stats, fps: this.fps };
  }
  // moldura da escotilha + tinta no vidro (só para a vista de cabine do sub atingido)
  drawOverlay() {
    // tinta de lula: cobre a visão do submarino atingido (preta e opaca) até ele emergir;
    // HUD, medidor e sonar ficam por cima para o jogador conseguir voltar
    const cv = $('tinta');
    const ativo = this.tinta && this.me.modo === 'sub';
    const lavando = this.tintaLavando > 0;
    if (!ativo && !lavando) { if (!cv.hidden) cv.hidden = true; return; }
    cv.hidden = false;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    let cobertura = 1;
    if (lavando && !ativo) { this.tintaLavando = Math.max(0, this.tintaLavando - 1 / 150); cobertura = this.tintaLavando; }
    const topo = (1 - cobertura) * H * 1.1;
    // tinta cobre ~85% da tela: base opaca, depois "frestas" irregulares onde a tinta não pegou
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(6,3,10,0.99)';
    c.fillRect(0, topo, W, H);
    this.inkSeed ||= Array.from({ length: 40 }, () => [Math.random(), Math.random(), Math.random()]);
    for (const [a2, b2, s2] of this.inkSeed) {
      const x = a2 * W, y = Math.max(topo, b2 * H), r = 40 + s2 * 90;
      const g = c.createRadialGradient(x - 10, y - 10, 2, x, y, r);
      g.addColorStop(0, 'rgba(120,90,160,0.30)'); g.addColorStop(0.4, 'rgba(30,15,45,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.29); c.fill();
    }
    // frestas: borda de cima rasgada + respingos claros nos cantos (≈15% da tela)
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.92)';
    c.beginPath(); c.moveTo(0, 0);
    const N = 26;
    for (let k = 0; k <= N; k++) {
      const x = (k / N) * W, sd = this.inkSeed[k % this.inkSeed.length];
      const fundo = H * (0.06 + 0.1 * sd[0] * sd[1]) + Math.sin(this.t * 0.7 + k) * 3;
      c.lineTo(x, fundo);
    }
    c.lineTo(W, 0); c.closePath(); c.fill();
    for (let k = 0; k < 6; k++) {
      const sd = this.inkSeed[k], x = (k % 2 ? 0.88 + sd[0] * 0.1 : 0.02 + sd[0] * 0.1) * W, y = (0.35 + sd[1] * 0.55) * H;
      const g = c.createRadialGradient(x, y, 0, x, y, 40 + sd[2] * 50);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 40 + sd[2] * 50, 0, 6.29); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    // escorridos de tinta descendo devagar da borda rasgada
    c.fillStyle = 'rgba(10,4,16,0.95)';
    for (let k = 0; k < 22; k++) {
      const x = ((k * 97) % 100) / 100 * W, base = H * 0.06, L = 30 + ((k * 37) % 70) + ((this.t * (6 + (k % 4) * 3)) % 90);
      c.fillRect(x, Math.max(topo, base - 20), 8 + (k % 3) * 5, L); c.beginPath(); c.arc(x + 4 + (k % 3) * 2.5, Math.max(topo, base - 20) + L, 5 + (k % 3) * 2.5, 0, 6.29); c.fill();
    }
    // brilho úmido sobre o vidro
    const gl = c.createLinearGradient(0, topo, W * 0.6, H);
    gl.addColorStop(0, 'rgba(160,130,200,0.10)'); gl.addColorStop(0.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(90,60,120,0.08)');
    c.fillStyle = gl; c.fillRect(0, topo, W, H);
    if (ativo && cobertura > 0.9) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const pulso = 0.75 + 0.25 * Math.sin(this.t * 3);
      c.font = `800 ${Math.round(Math.min(W, 1400) * 0.03)}px system-ui, Segoe UI, sans-serif`;
      c.fillStyle = `rgba(255,214,150,${pulso})`;
      c.fillText('JOGARAM UMA BOLSA DE TINTA EM VOCÊ!', W / 2, H * 0.44);
      c.font = `600 ${Math.round(Math.min(W, 1400) * 0.018)}px system-ui, Segoe UI, sans-serif`;
      c.fillStyle = 'rgba(235,225,245,0.92)';
      c.fillText('Volte para a superfície para limpar o vidro.', W / 2, H * 0.51);
      c.fillText('Localize-se pelo sonar (R) e pelo medidor de profundidade.', W / 2, H * 0.555);
    }
    if (lavando) { c.strokeStyle = 'rgba(190,220,255,0.5)'; c.lineWidth = 3; for (let k = 0; k < 40; k++) { const x = (k / 40) * W + Math.sin(k * 7 + this.t * 3) * 10; c.beginPath(); c.moveTo(x, topo - 60); c.lineTo(x + 6, topo + 40); c.stroke(); } }
  }
}

Object.assign(Game.prototype, Novidades);

function frame() { return new Promise((r) => requestAnimationFrame(() => r())); }

setupMenu();
// atalho para testes automatizados: ?auto=solo inicia direto
if (params.get('auto') === 'solo') setTimeout(() => $('btSolo').click(), 50);
export { Game };
