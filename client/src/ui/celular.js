// Modo celular: controles de toque e tela limpa. Só liga em aparelhos de toque (ou com ?celular no link);
// no computador nada disto roda e o jogo fica exatamente igual. ?computador força a versão de computador.
//   - metade esquerda da tela: joystick que aparece onde o dedo encosta (empurrar até o fim = correr)
//   - metade direita: arrastar gira a câmera
//   - botões redondos fixos de cada situação (pular, atirar, pescar...) e, acima deles, um botão para cada
//     tecla que o jogo mostra na tela (<kbd>E</kbd>Pegar…): assim toda ação nova já vira botão sozinha.
import { ARMAS, ARMAS_ORDEM } from '../../shared/data.js';

const q = new URLSearchParams(location.search);
export const CELULAR = q.has('computador') ? false
  : q.has('celular') ? true
  : (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
if (CELULAR) document.documentElement.classList.add('celular');

// texto da etiqueta → código da tecla (ou ação do mouse)
function codigoDe(t) {
  t = t.trim().toLowerCase();
  if (/^[a-z]$/.test(t)) return 'Key' + t.toUpperCase();
  if (/^[0-9]$/.test(t)) return 'Digit' + t;
  if (t === 'espaço' || t === 'espaco') return 'Space';
  if (t === 'tab') return 'Tab';
  if (t === 'esc') return 'Escape';
  if (t === 'shift') return 'ShiftLeft';
  if (/clique|botão esquerdo/.test(t)) return 'MouseL';
  if (/botão direito/.test(t)) return 'MouseR';
  return null;
}
const SEM_BOTAO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']); // o joystick já faz
const ICONE = { KeyE: '✋', Space: '⏺', MouseL: '👆', KeyT: '💻', KeyQ: '⬆', KeyC: '⬇', KeyL: '💡', KeyB: '📯', KeyV: '🎥', KeyR: '📡', KeyZ: '🎒', KeyX: '🎁', KeyG: '🤾', KeyF: '🎣', KeyI: '🔪', KeyY: '✔', KeyN: '✖', KeyH: '✋' };

// rótulo de um <kbd>: o texto até a próxima tecla (sem as notas entre parênteses); se não houver, o texto de antes
function rotulos(el) {
  const out = [];
  const kbds = [...el.querySelectorAll('kbd')];
  for (let i = 0; i < kbds.length; i++) {
    const k = kbds[i], code = codigoDe(k.textContent);
    if (!code || SEM_BOTAO.has(code)) continue;
    let txt = '', n = k.nextSibling;
    while (n && !(n.nodeName === 'KBD') && !(n.querySelector && n.querySelector('kbd'))) {
      if (!(n.classList && n.classList.contains('nota'))) txt += n.textContent;
      n = n.nextSibling;
    }
    // dentro de um <span> (legenda do submarino), o rótulo é o resto do span
    if (!txt.trim() && k.parentElement !== el) txt = [...k.parentElement.childNodes].filter((x) => x !== k).map((x) => x.textContent).join('');
    txt = txt.split('·')[0].replace(/\([^)]*\)?/g, '').replace(/^[\s:,—–-]+|[\s:,—–.(-]+$/g, '').trim();
    if (txt.length < 2) {
      let prev = '', p = k.previousSibling;
      while (p && p.nodeName !== 'KBD') { prev = p.textContent + prev; p = p.previousSibling; }
      txt = prev.split('·').pop().replace(/[()]/g, '').trim();
    }
    if (txt.length > 22) txt = txt.slice(0, 21).trim() + '…';
    out.push({ code, txt: txt ? txt[0].toUpperCase() + txt.slice(1) : '' });
  }
  return out;
}

export function iniciarCelular(g) {
  if (!CELULAR || g.cel) return;
  const I = g.input, canvas = document.getElementById('gl');
  I.semLock = true; I.touch.active = true;
  document.body.classList.add('jogando');
  const hud = document.getElementById('hud');
  const raiz = document.createElement('div'); raiz.id = 'cel';
  raiz.innerHTML = `<div id="celStick"><div id="celStickK"></div></div>
    <div id="celBarra">
      <button data-cel="Escape" title="Menu">☰</button><button data-cel="KeyI" title="Inventário">🎒</button><button data-cel="KeyJ" title="Mapa">🗺️</button>
      <button data-cel="Tab" title="Sala e amigos">👥</button><button data-cel="KeyM" id="celVoz" title="Chat de voz">🎤</button><button id="celTela" title="Tela cheia">⛶</button>
    </div>
    <div id="celCtx"></div><div id="celAcoes"></div><div id="celArmas" hidden></div>`;
  hud.appendChild(raiz);
  const gire = document.createElement('div'); gire.id = 'celGire'; gire.innerHTML = '<div>📱↻</div><b>Gire o celular</b><span>O jogo é jogado com o celular deitado</span>';
  document.body.appendChild(gire);
  const cel = g.cel = { segurando: new Map(), sig: '', armasAberto: false };

  // ---------------------------------------------------------------- apertar / soltar
  const apertar = (k) => {
    g.audio.start?.();
    if (k === 'MouseL') { I.mouse.down = true; I.mouse.clicked = true; }
    else if (k === 'MouseR') I.mouse.rdown = true;
    else if (k === 'Roda') I.wheel = 1;
    else if (k === 'Escape') { dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' })); }
    else { if (!I.keys.has(k)) I.pressed.add(k); I.keys.add(k); }
  };
  const soltar = (k) => {
    if (k === 'MouseL') I.mouse.down = false;
    else if (k === 'MouseR') I.mouse.rdown = false;
    else I.keys.delete(k);
  };
  // um botão que segura a tecla enquanto o dedo estiver em cima
  const ligarBotao = (b, quando) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch { /* */ }
      b.classList.add('ap'); const k = quando(); if (!k) return;
      cel.segurando.set(e.pointerId, k); apertar(k);
    });
    const fim = (e) => { b.classList.remove('ap'); const k = cel.segurando.get(e.pointerId); if (k) { cel.segurando.delete(e.pointerId); soltar(k); } };
    b.addEventListener('pointerup', fim); b.addEventListener('pointercancel', fim); b.addEventListener('lostpointercapture', fim);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  raiz.querySelectorAll('#celBarra [data-cel]').forEach((b) => ligarBotao(b, () => b.dataset.cel));
  const btTela = raiz.querySelector('#celTela');
  btTela.onclick = () => telaCheia(!document.fullscreenElement);

  // ---------------------------------------------------------------- joystick e câmera
  const base = raiz.querySelector('#celStick'), knob = raiz.querySelector('#celStickK');
  const RAIO = 56;
  let stick = null, olhar = null;
  const naUi = (e) => e.target !== canvas;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (naUi(e)) return;
    e.preventDefault(); g.audio.start?.();
    if (e.clientX < innerWidth * 0.42 && !stick) {
      const cx = clampN(e.clientX, RAIO + 8, innerWidth - RAIO - 8), cy = clampN(e.clientY, RAIO + 8, innerHeight - RAIO - 8);
      stick = { id: e.pointerId, c: [cx, cy] };
      base.style.left = cx - RAIO + 'px'; base.style.top = cy - RAIO + 'px'; base.classList.add('ativo');
      moverStick(e.clientX, e.clientY);
    } else if (!olhar) olhar = { id: e.pointerId, ult: [e.clientX, e.clientY] };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
  }, { passive: false });
  const moverStick = (x, y) => {
    let dx = (x - stick.c[0]) / RAIO, dy = (y - stick.c[1]) / RAIO;
    const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
    I.touch.move = [dx, -dy];
    knob.style.transform = `translate(${dx * RAIO}px, ${dy * RAIO}px)`;
    // empurrar até o fim corre (a pé)
    const correr = Math.hypot(dx, dy) > 0.93 && g.me?.modo === 'terra';
    if (correr) I.keys.add('ShiftLeft'); else if (!cel.segurando.size || ![...cel.segurando.values()].includes('ShiftLeft')) I.keys.delete('ShiftLeft');
    base.classList.toggle('correndo', correr);
  };
  canvas.addEventListener('pointermove', (e) => {
    if (stick && e.pointerId === stick.id) moverStick(e.clientX, e.clientY);
    else if (olhar && e.pointerId === olhar.id) {
      const k = 2.6; // arrastar meia tela ≈ meia volta
      I.touch.look[0] += (e.clientX - olhar.ult[0]) * k; I.touch.look[1] += (e.clientY - olhar.ult[1]) * k;
      olhar.ult = [e.clientX, e.clientY];
    }
  });
  const fimCanvas = (e) => {
    if (stick && e.pointerId === stick.id) { stick = null; I.touch.move = [0, 0]; knob.style.transform = ''; base.classList.remove('ativo', 'correndo'); I.keys.delete('ShiftLeft'); }
    if (olhar && e.pointerId === olhar.id) olhar = null;
  };
  canvas.addEventListener('pointerup', fimCanvas); canvas.addEventListener('pointercancel', fimCanvas);

  // ---------------------------------------------------------------- roda de danças: tocar na fatia
  const roda = document.getElementById('rodaEmotes');
  roda.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!g.roda) return;
    const r = roda.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 50) { I.press('Escape'); return; } // tocar no meio cancela
    const NF = roda.querySelectorAll('.fatia').length || 6;
    const ang = Math.atan2(dy, dx);
    g.roda.sel = ((Math.round((ang + Math.PI / 2) / (Math.PI * 2 / NF)) % NF) + NF) % NF;
    const L = Math.hypot(dx, dy); g.roda.v = [dx / L * 100, dy / L * 100];
    I.mouse.clicked = true;
  });

  // ---------------------------------------------------------------- detalhes do dinheiro/missões
  const topo = document.getElementById('topoEsq');
  topo.addEventListener('pointerdown', (e) => { e.stopPropagation(); hud.classList.toggle('detalhes'); });

  // ---------------------------------------------------------------- escolher arma
  const caixaArmas = raiz.querySelector('#celArmas');
  caixaArmas.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); e.stopPropagation(); if (!b) return;
    e.preventDefault(); I.press(b.dataset.k); cel.armasAberto = false; caixaArmas.hidden = true;
  });

  const ctxEl = raiz.querySelector('#celCtx'), acoesEl = raiz.querySelector('#celAcoes');
  cel.atualizar = () => atualizar(g, ctxEl, acoesEl, caixaArmas, ligarBotao, soltar);
  addEventListener('fullscreenchange', () => btTela.classList.toggle('on', !!document.fullscreenElement));
}

function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function telaCheia(ligar = true) {
  if (!CELULAR) return;
  try {
    if (ligar && !document.fullscreenElement) {
      const p = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      p?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
    } else if (!ligar && document.fullscreenElement) document.exitFullscreen?.();
  } catch { /* o navegador não deixa (iPhone): segue normal */ }
}

// ------------------------------------------------------------------ a cada quadro (barato: só mexe no DOM quando muda)
function atualizar(g, ctxEl, acoesEl, caixaArmas, ligarBotao, soltar) {
  const cel = g.cel, me = g.me, p = g.perfil; if (!me || !p) return;
  const agora = performance.now(); if (agora - (cel.ult || 0) < 90) return; cel.ult = agora;
  const modo = me.modo, pescando = g.pesca && g.pesca.estado !== 'off';
  // ---- botões fixos (redondos)
  const fixos = [];
  if (modo === 'terra' && !g.ui.aberto) {
    if (me.arma) {
      const A = ARMAS[me.arma];
      fixos.push({ k: 'MouseL', ic: A.foguete ? '🚀' : '💥', t: 'Atirar', grande: true });
      if (A.mira) fixos.push({ k: 'MouseR', ic: '🔭', t: 'Luneta' });
      fixos.push({ k: 'KeyH', ic: '✋', t: 'Guardar' }, { k: 'Armas', ic: '🔫', t: 'Armas' });
    } else if (me.mirando || me.mirandoLixo) {
      fixos.push({ k: 'MouseL', ic: '🎯', t: 'Jogar', grande: true });
    } else {
      fixos.push(pescando ? { k: 'Space', ic: '🎣', t: 'Puxar', grande: true } : { k: 'Space', ic: '⤒', t: 'Pular', grande: true });
      if (!p.mao && (pescando || g.pertoDaAgua?.())) fixos.push({ k: 'KeyF', ic: '🎣', t: pescando ? 'Guardar vara' : 'Pescar' });
      if (!pescando && !p.mao) {
        if (ARMAS_ORDEM.some((k) => p.armas?.[k])) fixos.push({ k: 'Armas', ic: '🔫', t: 'Armas' });
        if (p.armas?.estilingue && (p.lixoMao || p.saco?.length)) fixos.push({ k: 'KeyQ', ic: '🪃', t: 'Estilingue' });
        if (p.mochila?.length) fixos.push({ k: 'KeyZ', ic: '🐟', t: 'Tirar peixe' });
        if (me.grounded) fixos.push({ k: 'Roda', ic: '💃', t: 'Dançar' });
      }
    }
  } else if (modo === 'nadando' && !g.ui.aberto) fixos.push({ k: 'Space', ic: '⤒', t: 'Pular', grande: true });
  // ---- botões das teclas que aparecem na tela
  const ja = new Set(fixos.map((f) => f.k));
  const ctx = [];
  const prompt = document.getElementById('prompt');
  const fontes = [prompt, document.getElementById('legendaSub'), document.getElementById('corridaConvite')];
  for (const el of fontes) {
    if (!el || el.hidden) continue;
    const rs = rotulos(el);
    if (el === prompt) prompt.classList.toggle('temKbd', rs.length > 0);
    for (const r of rs) { if (ja.has(r.code)) continue; ja.add(r.code); ctx.push({ k: r.code, ic: ICONE[r.code] || '', t: r.txt || r.code.replace(/^(Key|Digit)/, '') }); }
  }
  if (prompt.hidden) prompt.classList.remove('temKbd');
  // ---- desenha só se mudou
  const sig = JSON.stringify([fixos, ctx]);
  if (sig !== cel.sig) {
    cel.sig = sig;
    // solta o que estava segurado num botão que vai sumir
    for (const [id, k] of cel.segurando) if (!fixos.concat(ctx).some((b) => b.k === k)) { cel.segurando.delete(id); soltar(k); }
    desenhar(acoesEl, fixos, 'redondo', g, ligarBotao, caixaArmas);
    desenhar(ctxEl, ctx, 'pilula', g, ligarBotao, caixaArmas);
    // as pílulas ficam logo acima dos botões redondos, qualquer que seja a altura deles
    ctxEl.style.bottom = (fixos.length ? acoesEl.offsetHeight + 24 : 14) + 'px';
    ctxEl.style.maxHeight = `calc(100vh - ${(fixos.length ? acoesEl.offsetHeight + 24 : 14) + 130}px)`; // muitas teclas: vira duas colunas
  }
  if (cel.armasAberto && !fixos.some((f) => f.k === 'Armas')) { cel.armasAberto = false; caixaArmas.hidden = true; }
  const voz = document.querySelector('#vozHud .on');
  document.getElementById('celVoz').classList.toggle('on', !!voz);
}

function desenhar(el, lista, cls, g, ligarBotao, caixaArmas) {
  el.innerHTML = '';
  for (const b of lista) {
    const bt = document.createElement('button');
    bt.className = cls + (b.grande ? ' grande' : ''); bt.dataset.k = b.k;
    bt.innerHTML = cls === 'redondo' ? `<span>${b.ic}</span><small>${b.t}</small>` : `${b.ic ? `<span>${b.ic}</span>` : ''}${b.t}`;
    ligarBotao(bt, () => {
      if (b.k !== 'Armas') return b.k;
      abrirArmas(g, caixaArmas); return null;
    });
    el.appendChild(bt);
  }
}

function abrirArmas(g, caixa) {
  const cel = g.cel, p = g.perfil;
  cel.armasAberto = !cel.armasAberto; caixa.hidden = !cel.armasAberto;
  if (!cel.armasAberto) return;
  caixa.innerHTML = ARMAS_ORDEM.map((k, i) => p.armas?.[k]
    ? `<button data-k="Digit${i + 1}" class="${g.me.arma === k ? 'sel' : ''}"><b>${ARMAS[k].nome}</b><small>${p.municao?.[k] ?? 0} ${ARMAS[k].foguete ? 'foguete(s)' : 'balas'}</small></button>` : '').join('')
    + (g.me.arma ? '<button data-k="KeyH"><b>✋ Guardar</b><small>mãos livres</small></button>' : '');
}
