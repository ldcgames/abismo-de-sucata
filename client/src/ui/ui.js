// Interface em pt-BR: HUD, avisos e painéis (loja, depósito, aquário, contratos, sala, inventário).
// Todo botão envia uma AÇÃO para o servidor (ou servidor local); nada muda saldo/inventário só na tela.
import {
  SUB_UP, SUB_ORDEM, VARA, PESADO, AQUARIOS, TANQUES, ESTACAO, DEPOSITO, EXTRAS, CONTRATOS, SUCATA, RESTAURO, ESPECIES,
  COMPONENTES, CORES_JOGADOR, valorPeixe, CAIXA_TERMICA, MOCHILA, ARMAS, ARMAS_ORDEM, ARMAS_LOJA, MUNICAO_MAX, ESTATUA_PECAS, LIXO,
} from '../../shared/data.js';
import { subStats, varaStats, cargaUso, faltando, contratoEstado, cabeNoAquario, depositoVagas, multDinheiro } from '../../shared/rules.js';
import { STATIONS } from '../../shared/world.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const custoTxt = (c) => (!c ? 'grátis' : [c.dinheiro ? `S$ ${fmt(c.dinheiro)}` : null, ...Object.entries(c.comps || {}).map(([k, n]) => `${n} ${COMPONENTES[k].toLowerCase()}`)].filter(Boolean).join(' + '));

export class UI {
  constructor(game) {
    this.g = game; this.aberto = null; this.aba = null;
    $('painelFechar').onclick = () => this.fechar();
    this.avisos = $('avisos');
  }
  aviso(txt, tipo = 'info', ms = 3200) {
    if (!txt) return;
    const d = document.createElement('div'); d.className = 'aviso ' + tipo; d.textContent = txt;
    this.avisos.appendChild(d);
    while (this.avisos.children.length > 4) this.avisos.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }
  prompt(html) { const p = $('prompt'); if (!html) { p.hidden = true; return; } p.hidden = false; if (p._h !== html) { p.innerHTML = html; p._h = html; } }

  // ------------------------------------------------------------ HUD contínuo
  hud(p, info) {
    const comps = Object.entries(p.comps).map(([k, n]) => `<span>${COMPONENTES[k]}: <b>${n}</b></span>`).join('');
    const moc = `<div>🎒 Mochila: <b>${p.mochila.length}/${MOCHILA.peixes}</b> peixe(s)${p.mochila.length ? ' (' + p.mochila.map((f) => esc(ESPECIES[f.esp].nome)).join(', ') + ')' : ''} · bolsas de tinta <b>${p.baloes}/${MOCHILA.bolsas}</b></div>`;
    const mult = multDinheiro(p);
    const extra = `<div>🗑️ Saco: <b>${p.saco.length}/${LIXO.saco}</b> · 🗿 Estátua <b>${p.estatua.colocadas.length}/${ESTATUA_PECAS.length}</b> · multiplicador <b class="${mult > 1 ? 'mult' : ''}">×${mult}</b></div>`;
    const mis = (p.missoes?.ativas || []).map((m) => `<div class="missao">🎯 ${esc(m.txt)} <b>${m.tipo === 'fundo' ? `${m.feito}/${m.n} m` : `${m.feito}/${m.n}`}</b> <span class="premio">S$ ${fmt(m.premio)}</span></div>`).join('');
    const html = `<div class="din">S$ ${fmt(p.dinheiro)}</div><div class="comps">${comps}</div>${moc}${extra}<div class="missoes">${mis}</div>`;
    if ($('topoEsq')._h !== html) { $('topoEsq').innerHTML = html; $('topoEsq')._h = html; }
    const h = Math.floor(info.hora), m = Math.floor((info.hora % 1) * 60);
    const dir = `<div>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${info.noite ? '🌙' : '☀️'}</div><div>${esc(info.zona)}</div>${info.ranking ? `<div class="ranking">${info.ranking}</div>` : ''}<div class="nota">${esc(info.rede)}</div>${info.fps ? `<div class="nota">${info.fps} FPS</div>` : ''}`;
    if ($('topoDir')._h !== dir) { $('topoDir').innerHTML = dir; $('topoDir')._h = dir; }
    // contratos ativos
    const ativos = p.contratos.ativos.map((id) => CONTRATOS.find((c) => c.id === id)).filter(Boolean);
    const ct = $('contrato');
    if (ativos.length) {
      const html2 = '<b>Contratos</b>' + ativos.map((c) => { const e = contratoEstado(p, c); return `<div>${e.pronto ? '✅' : '•'} ${esc(c.nome)}${e.pronto ? ' — entregue no terminal' : ''}</div>`; }).join('');
      ct.hidden = false; if (ct._h !== html2) { ct.innerHTML = html2; ct._h = html2; }
    } else ct.hidden = true;
  }
  subHud(p, sc, extra) {
    const st = subStats(p);
    const prof = Math.max(0, -sc.pos[1]);
    $('subHud').hidden = false;
    $('hProf').textContent = `${fmt(prof)} m`;
    $('hLim').textContent = `limite do casco: ${fmt(st.maxProf)} m`;
    const escala = Math.max(st.maxProf * 1.25, prof * 1.05);
    $('bProf').style.width = `${Math.min(100, (prof / escala) * 100)}%`;
    $('bProf').style.background = prof > st.maxProf ? 'var(--ruim)' : prof > st.maxProf * 0.9 ? 'var(--amb)' : 'var(--azul)';
    $('mLim').style.left = `${(st.maxProf / escala) * 100}%`;
    $('hBat').textContent = `${fmt((sc.bateria / st.bateria) * 100)}%`;
    $('bBat').style.width = `${(sc.bateria / st.bateria) * 100}%`; $('bBat').style.background = sc.bateria / st.bateria < 0.2 ? 'var(--ruim)' : 'var(--ok)';
    $('hOx').textContent = `${fmt(sc.oxigenio)} s`;
    $('bOx').style.width = `${(sc.oxigenio / st.oxigenio) * 100}%`; $('bOx').style.background = sc.oxigenio < 60 ? 'var(--ruim)' : 'var(--azul)';
    $('hEst').textContent = sc.estresse > 1 ? `estresse ${fmt(sc.estresse)}%` : 'íntegro';
    $('bEst').style.width = `${100 - sc.estresse}%`; $('bEst').style.background = sc.estresse > 60 ? 'var(--ruim)' : sc.estresse > 25 ? 'var(--amb)' : 'var(--ok)';
    const u = cargaUso(p);
    $('hCarga').textContent = `${p.carga.filter((x) => !x.coop).length}/${st.cargaN} objetos · ${fmt(u.kg)} kg`;
    // medidor de profundidade: verde seguro, amarelo atenção, vermelho além do casco
    const med = $('medidor'); med.hidden = false; $('legendaSub').hidden = false;
    const esc2 = Math.max(st.maxProf * 1.35, prof * 1.08, 30);
    const H = 260, y = (v) => Math.min(H, (v / esc2) * H);
    const z = med.querySelectorAll('.zona');
    z[0].style.top = '0px'; z[0].style.height = y(st.maxProf * 0.9) + 'px';
    z[1].style.top = y(st.maxProf * 0.9) + 'px'; z[1].style.height = (y(st.maxProf) - y(st.maxProf * 0.9)) + 'px';
    z[2].style.top = y(st.maxProf) + 'px'; z[2].style.height = (H - y(st.maxProf)) + 'px';
    med.querySelector('.lim').style.top = y(st.maxProf) + 'px';
    med.querySelector('.ponteiro').style.top = y(prof) + 'px';
    med.querySelector('.ponteiro span').textContent = `${fmt(prof)} m`;
    const est = med.querySelector('.estado');
    if (prof > st.maxProf) { est.textContent = `PERIGO! limite ${fmt(st.maxProf)} m`; est.style.color = 'var(--ruim)'; }
    else if (prof > st.maxProf * 0.9) { est.textContent = `ATENÇÃO: perto do limite (${fmt(st.maxProf)} m)`; est.style.color = 'var(--amb)'; }
    else { est.textContent = `SEGURO até ${fmt(st.maxProf)} m`; est.style.color = 'var(--ok)'; }
    $('hVel').textContent = `${extra.vel.toFixed(1)} m/s${extra.luz ? ' · 💡' : ''}`;
  }
  esconderSubHud() { $('subHud').hidden = true; $('sonar').hidden = true; $('medidor').hidden = true; $('legendaSub').hidden = true; }

  maoUi(p, naEstacao) {
    // o painel com vários botões foi substituído pelo aviso "X Soltar · G Pegar para arremessar"
    $('maoUi').hidden = true; return;
    // eslint-disable-next-line no-unreachable
    const el = $('maoUi');
    if (!p.mao) { el.hidden = true; el._k = null; return; }
    const f = p.mao, e = ESPECIES[f.esp];
    const tub = !!e.pesado;
    const motivo = cabeNoAquario(p, f, 'aquario');
    const motivoT = p.tanque.nivel >= 0 ? cabeNoAquario(p, f, 'tanque') : 'sem tanque';
    const k = JSON.stringify([f.uid, naEstacao, motivo, motivoT, p.estacao.tinta]);
    if (el._k === k) return;
    el._k = k; el.hidden = false;
    el.innerHTML = `<div>🐟 <b>${esc(e.nome)}</b> — ${f.cm} cm · vale S$ ${valorPeixe(f.esp, f.cm)}</div>
      <div class="bt">
        <button data-a="aquario" ${!naEstacao || motivo ? 'disabled' : ''} title="${esc(motivo || (naEstacao ? '' : 'Vá até sua estação'))}">Aquário</button>
        ${p.tanque.nivel >= 0 ? `<button data-a="tanque" ${!naEstacao || motivoT ? 'disabled' : ''} title="${esc(motivoT || '')}">Tanque</button>` : ''}
        <button data-a="caixa" ${tub ? 'disabled' : ''}>Caixa térmica (${p.caixaTermica.length}/${CAIXA_TERMICA.vagas})</button>
        <button data-a="vender" ${!naEstacao ? 'disabled' : ''}>Vender</button>
        ${e.tinta ? `<button data-a="tinta" ${!naEstacao || !p.estacao.tinta ? 'disabled' : ''} title="${p.estacao.tinta ? '' : 'Construa a bancada de tinta'}">Extrair tinta</button>` : ''}
        <button data-a="arremessar">Arremessar (G)</button>
        <button data-a="soltar">Soltar (X)</button>
      </div>${motivo && !tub ? `<div class="nota">Aquário: ${esc(motivo)}</div>` : ''}`;
    el.querySelectorAll('button').forEach((b) => (b.onclick = () => this.g.acaoMao(b.dataset.a)));
  }

  // ------------------------------------------------------------ painéis
  abrir(tipo, aba) {
    this.aberto = tipo; this.aba = aba || null;
    $('painel').hidden = false;
    this.g.input.unlock();
    this.render();
  }
  fechar() { this.aberto = null; $('painel').hidden = true; this.g.onPainelFechado?.(); }
  render() {
    if (!this.aberto) return;
    const p = this.g.perfil;
    const corpo = $('painelCorpo'), abas = $('abas');
    const setAbas = (lista) => {
      if (!this.aba || !lista.find((a) => a[0] === this.aba)) this.aba = lista[0][0];
      abas.innerHTML = lista.map(([id, nome]) => `<button data-aba="${id}" class="${id === this.aba ? 'sel' : ''}">${nome}</button>`).join('');
      abas.querySelectorAll('button').forEach((b) => (b.onclick = () => { this.aba = b.dataset.aba; this.render(); }));
    };
    let html = '';
    if (this.aberto === 'terminal') {
      $('painelTitulo').textContent = 'Computador da estação';
      setAbas([['sub', 'Submarino'], ['vara', 'Pesca'], ['estacao', 'Estação'], ['aquario', 'Aquário e tanque'], ['vender', 'Vender'], ['contratos', 'Contratos']]);
      html = this['aba_' + this.aba](p);
    } else if (this.aberto === 'deposito' || this.aberto === 'reciclador' || this.aberto === 'restauro') {
      $('painelTitulo').textContent = { deposito: 'Depósito e carga', reciclador: 'Recicladora', restauro: 'Bancada de restauro' }[this.aberto];
      abas.innerHTML = '';
      html = this.listaSucata(p, this.aberto);
    } else if (this.aberto === 'aquario' || this.aberto === 'tanque') {
      $('painelTitulo').textContent = this.aberto === 'aquario' ? 'Seu aquário' : 'Seu tanque de concreto';
      abas.innerHTML = '';
      html = this.painelAquario(p, this.aberto);
    } else if (this.aberto === 'inventario') {
      $('painelTitulo').textContent = 'Inventário';
      abas.innerHTML = '';
      html = this.inventario(p);
    } else if (this.aberto === 'mapa') {
      $('painelTitulo').textContent = 'Mapa do lago';
      abas.innerHTML = '';
      html = '<canvas id="mapaCv" width="620" height="620" style="width:min(620px,80vw);display:block;margin:auto;border-radius:12px;background:#0b1a1f"></canvas><p class="nota">Estações, seu personagem (▲), submarinos (●), a boca da fenda e as cavernas que você já descobriu.</p>';
    } else if (this.aberto === 'armas') {
      $('painelTitulo').textContent = 'Loja de armas';
      abas.innerHTML = '';
      html = this.lojaArmas(p);
    } else if (this.aberto === 'corrida') {
      $('painelTitulo').textContent = '🏁 Corrida de submarino';
      abas.innerHTML = '';
      html = this.g.painelCorridaHtml();
    } else if (this.aberto === 'sala') {
      $('painelTitulo').textContent = 'Sala e convite';
      abas.innerHTML = '';
      html = this.sala();
    }
    corpo.innerHTML = html;
    if (this.aberto === 'mapa') this.g.desenharMapa($('mapaCv'));
    corpo.querySelectorAll('[data-acao]').forEach((b) => (b.onclick = async () => {
      const a = JSON.parse(b.dataset.acao);
      b.disabled = true;
      await this.g.acao(a);
      this.render();
    }));
    corpo.querySelectorAll('[data-sair]').forEach((b) => (b.onclick = () => this.g.sairParaMenu()));
    corpo.querySelectorAll('[data-escolher]').forEach((b) => (b.onclick = () => { const s = b.dataset.escolher, sel = this.g.corridaSel; if (sel.has(s)) sel.delete(s); else sel.add(s); this.render(); }));
    corpo.querySelectorAll('[data-chamar]').forEach((b) => (b.onclick = async () => { b.disabled = true; await this.g.chamarCorrida(); if (this.aberto) this.render(); }));
    corpo.querySelectorAll('[data-copiar]').forEach((b) => (b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copiar).then(() => this.aviso('Copiado!', 'ok')).catch(() => this.aviso('Copie manualmente o texto acima', 'info')); }));
  }
  btn(label, a, disabled = false, title = '') { return `<button data-acao='${esc(JSON.stringify(a))}' ${disabled ? 'disabled' : ''} title="${esc(title)}">${label}</button>`; }

  aba_sub(p) {
    const st = subStats(p);
    let h = `<p class="nota">Cada melhoria muda parâmetros reais da física e a aparência do submarino. Compre na estação (a pé ou com o sub atracado).</p><div class="grade">`;
    for (const k of SUB_ORDEM) {
      const up = SUB_UP[k], n = p.sub[k], atual = up.niveis[n - 1], prox = up.niveis[n];
      const extra = k === 'propulsor' ? ` (subida ${atual.vert} m/s)` : k === 'braco' ? ` (alcance ${atual.alcance} m)` : k === 'carga' ? ` · <b>${atual.n} objetos</b>` : '';
      h += `<div class="card"><h3>${up.nome}</h3><div class="nv">Nível ${n}/${up.niveis.length} — ${atual.desc}</div>
        <div class="val">Atual: <b>${fmt(atual.v)} ${up.un}</b>${extra}</div>`;
      if (prox) {
        const falta = faltando(p, prox.custo);
        h += `<div class="val">Próximo: <b>${fmt(prox.v)} ${up.un}</b> — ${prox.desc}</div><div class="custo">${custoTxt(prox.custo)}</div>
          ${falta.length ? `<div class="falta">Falta: ${falta.join(', ')}</div>` : ''}${this.btn('Melhorar', { tipo: 'comprar', cat: 'sub', chave: k }, falta.length > 0)}`;
      } else h += `<div class="val">Nível máximo</div>`;
      h += '</div>';
    }
    const ex = EXTRAS.lancador, falta = faltando(p, ex.custo);
    h += `<div class="card"><h3>${ex.nome}</h3><div class="nv">${ex.desc}</div><div class="custo">${custoTxt(ex.custo)}</div>${p.extras.lancador ? '<div class="val"><b>Instalado</b></div>' : this.btn('Instalar', { tipo: 'comprar', cat: 'extra', chave: 'lancador' }, falta.length > 0, falta.join(', '))}</div>`;
    return h + `</div><p class="nota">Profundidade máxima segura atual: <b>${fmt(st.maxProf)} m</b>. Abaixo disso o casco sofre estresse; a 100% o lastro de emergência leva você para cima.</p>`;
  }
  aba_vara(p) {
    const vs = varaStats(p);
    let h = `<p class="nota">Sua vara: <b>${esc(vs.nome)}</b> — peixes até <b>${vs.maxCm} cm</b>, linha ${vs.linhaKg} kg, alcance ${vs.alcance} m, isca até ${vs.prof} m de fundo.</p><div class="grade">`;
    VARA.forEach((v, i) => {
      const n = i + 1;
      const tem = p.vara >= n, atual = p.vara === n;
      const falta = faltando(p, v.custo);
      h += `<div class="card"><h3>${v.nome}</h3><div class="val">até ${v.maxCm} cm · linha ${v.linhaKg} kg · alcance ${v.alcance} m · fundo ${v.prof} m</div><div class="custo">${custoTxt(v.custo)}</div>
        ${atual ? '<div class="val"><b>Em uso</b></div>' : tem ? '<div class="nota">Você já tem uma melhor</div>' : this.btn('Comprar', { tipo: 'comprar', cat: 'vara', nivel: n }, falta.length > 0, falta.join(', '))}</div>`;
    });
    const fp = faltando(p, PESADO.custo);
    h += `<div class="card"><h3>${PESADO.nome}</h3><div class="val">Permite fisgar animais gigantes (até ${PESADO.maxCm} cm), como tubarões, à noite e em águas fundas.</div><div class="custo">${custoTxt(PESADO.custo)}</div>
      ${p.pesado ? '<div class="val"><b>Instalado</b></div>' : this.btn('Comprar', { tipo: 'comprar', cat: 'pesado' }, fp.length > 0 || p.vara < PESADO.requerVara, p.vara < PESADO.requerVara ? `Requer a ${VARA[PESADO.requerVara - 1].nome}` : fp.join(', '))}</div>`;
    const lv = EXTRAS.luvas, fl = faltando(p, lv.custo);
    h += `<div class="card"><h3>${lv.nome}</h3><div class="nv">${lv.desc}</div><div class="custo">${custoTxt(lv.custo)}</div>${p.extras.luvas ? '<div class="val"><b>Você tem</b></div>' : this.btn('Comprar', { tipo: 'comprar', cat: 'extra', chave: 'luvas' }, fl.length > 0, fl.join(', '))}</div>`;
    return h + '</div>';
  }
  aba_estacao(p) {
    let h = '<div class="grade">';
    for (const [k, it] of Object.entries(ESTACAO)) {
      const falta = faltando(p, it.custo);
      h += `<div class="card"><h3>${it.nome}</h3><div class="nv">${it.desc}</div><div class="custo">${custoTxt(it.custo)}</div>${p.estacao[k] ? '<div class="val"><b>Construído</b></div>' : this.btn('Construir', { tipo: 'comprar', cat: 'estacao', chave: k }, falta.length > 0, falta.join(', '))}</div>`;
    }
    const prox = DEPOSITO[p.estacao.deposito + 1];
    h += `<div class="card"><h3>Depósito</h3><div class="val">Vagas: <b>${depositoVagas(p)}</b></div>${prox ? `<div class="custo">Ampliar para ${prox.vagas}: ${custoTxt(prox.custo)}</div>${this.btn('Ampliar', { tipo: 'comprar', cat: 'estacao', chave: 'deposito' }, faltando(p, prox.custo).length > 0)}` : '<div class="val">Máximo</div>'}</div>`;
    return h + '</div>';
  }
  aba_aquario(p) {
    const a = AQUARIOS[p.aquario.nivel];
    let h = `<p class="nota">Aquários são decoração e guardam seus peixes: dá para pegar de volta (para arremessar no amigo) ou vender. Pode comprar qualquer um maior direto. Atual: <b>${esc(a.nome)}</b> [${p.aquario.peixes.length}/${a.vagas}] · peixes até ${a.maxCm} cm.</p>`;
    h += this.listaPeixes(p, 'aquario');
    h += '<h3>Aquários</h3><div class="grade">';
    AQUARIOS.forEach((aq, i) => {
      if (i === 0) return;
      const f = faltando(p, aq.custo), atual = p.aquario.nivel === i, tem = p.aquario.nivel > i;
      h += `<div class="card"><h3>${esc(aq.nome)}</h3><div class="val">${aq.vagas} vagas · até <b>${aq.maxCm} cm</b></div><div class="custo">${custoTxt(aq.custo)}</div>
        ${atual ? '<div class="val"><b>Na sua estação</b></div>' : tem ? '<div class="nota">Você já tem um maior</div>' : this.btn('Comprar', { tipo: 'comprar', cat: 'aquario', nivel: i }, f.length > 0, f.join(', '))}</div>`;
    });
    h += '</div>';
    const t = TANQUES[p.tanque.nivel];
    h += `<h3>Tanque de peixes ${t ? `— atual: ${esc(t.nome)} [${p.tanque.peixes.length}/${t.vagas}]` : ''}</h3>`;
    if (t) h += this.listaPeixes(p, 'tanque');
    h += '<div class="grade">';
    TANQUES.forEach((tq, i) => {
      const f = faltando(p, tq.custo), atual = p.tanque.nivel === i, tem = p.tanque.nivel > i, prox = p.tanque.nivel === i - 1;
      const req = p.aquario.nivel < tq.requerAquario;
      h += `<div class="card"><h3>${esc(tq.nome)}</h3><div class="val">${tq.vagas} vagas · animais até <b>${tq.maxCm} cm</b> (inclui tubarões)</div><div class="custo">${custoTxt(tq.custo)}</div>
        ${atual ? '<div class="val"><b>Na sua estação</b></div>' : tem ? '<div class="nota">Você já evoluiu</div>' : !prox ? '<div class="nota">Evolua o tanque anterior primeiro</div>' : (req ? `<div class="falta">Requer o ${esc(AQUARIOS[tq.requerAquario].nome)} (ou maior)</div>` : '') + this.btn(p.tanque.nivel < 0 ? 'Construir' : 'Evoluir', { tipo: 'comprar', cat: 'tanque' }, f.length > 0 || req, f.join(', '))}</div>`;
    });
    return h + '</div>';
  }
  // peixes guardados num lugar, com Pegar (para a mão) e Vender
  listaPeixes(p, onde) {
    const lista = onde === 'aquario' ? p.aquario.peixes : onde === 'tanque' ? p.tanque.peixes : onde === 'mochila' ? p.mochila : p.caixaTermica;
    if (!lista.length) return '';
    const pegar = (f) => onde === 'mochila' ? { tipo: 'mochila_tirar', uid: f.uid } : onde === 'caixa' ? { tipo: 'caixa_mao', uid: f.uid } : { tipo: 'aquario_retirar', uid: f.uid, de: onde };
    const m = multDinheiro(p);
    let h = '<div class="lista">';
    for (const f of lista) h += `<div class="item"><div>🐟 ${esc(ESPECIES[f.esp].nome)} — ${f.cm} cm</div><div class="acoes">${this.btn('Pegar na mão', pegar(f), !!p.mao, p.mao ? 'Suas mãos estão ocupadas' : '')}${this.btn(`Vender S$ ${fmt(Math.round(valorPeixe(f.esp, f.cm) * m))}`, { tipo: 'peixe_vender', uid: f.uid })}</div></div>`;
    return h + '</div>';
  }
  sacoVenda(p) {
    if (!p.saco.length) return '<p class="nota">🗑️ Saco de recicláveis vazio — cate garrafas PET e latinhas na margem (E).</p>';
    let tot = 0; const cont = {};
    for (const x of p.saco) { tot += SUCATA[x.tipo].valor; cont[x.tipo] = (cont[x.tipo] || 0) + 1; }
    const m = multDinheiro(p);
    return `<h3>Saco de recicláveis (${p.saco.length}/${LIXO.saco})</h3><div class="convite">${Object.entries(cont).map(([t, n]) => `${n}× ${esc(SUCATA[t].nome)}`).join(' · ')} ${this.btn(`Vender tudo — S$ ${fmt(Math.round(tot * m))}${m > 1 ? ` (×${m})` : ''}`, { tipo: 'vender_saco' })}</div>`;
  }
  aba_vender(p) {
    // tudo o que dá para vender num lugar só: peixes (mão, mochila, aquário, tanque), lixo catado e a carga do submarino
    const peixes = this.peixesVenda(p);
    let h = this.sacoVenda(p) + (peixes || '<p class="nota">🐟 Nenhum peixe para vender (pesque, guarde na mochila com Z ou no aquário).</p>');
    if (!p.carga.length) return h + '<h3>Carga do submarino</h3><p class="nota">Vazia. Use a garra (E) para recolher sucata no fundo do lago.</p>';
    h += `<h3>Carga do submarino</h3><div class="convite">${this.btn('Guardar tudo no depósito', { tipo: 'guardar', uid: '*' })}</div><div class="lista">`;
    for (const it of p.carga) h += this.linhaItem(it, 'carga', p);
    return h + '</div>';
  }
  peixesVenda(p) {
    let h = '';
    const m = multDinheiro(p);
    if (p.mao) {
      const e = ESPECIES[p.mao.esp];
      h += `<h3>Peixe na mão</h3><div class="lista"><div class="item"><div>🐟 ${esc(e.nome)} — ${p.mao.cm} cm</div><div class="acoes">${this.btn(`Vender S$ ${fmt(Math.round(valorPeixe(p.mao.esp, p.mao.cm) * m))}`, { tipo: 'peixe_vender' })}${e.pesado ? '' : this.btn(`Guardar na mochila (${p.mochila.length}/${MOCHILA.peixes})`, { tipo: 'mochila_guardar' }, p.mochila.length >= MOCHILA.peixes, 'Mochila cheia')}${e.pesado ? '' : this.btn(`Caixa térmica (${p.caixaTermica.length}/${CAIXA_TERMICA.vagas})`, { tipo: 'peixe_caixa' }, p.caixaTermica.length >= CAIXA_TERMICA.vagas)}${e.tinta && p.estacao.tinta ? this.btn('Extrair tinta (+2 bolsas)', { tipo: 'processar_lula' }) : ''}</div></div></div>`;
    }
    for (const [onde, tit] of [['mochila', `Mochila (${p.mochila.length}/${MOCHILA.peixes})`], ['caixa', 'Caixa térmica'], ['aquario', 'No aquário'], ['tanque', 'No tanque']]) {
      const l = this.listaPeixes(p, onde);
      if (l) h += `<h3>${tit}</h3>` + l;
    }
    return h;
  }
  linhaItem(it, de, p, modo = 'tudo') {
    const t = SUCATA[it.tipo];
    const rest = t.restaura ? RESTAURO[t.restaura] : null;
    const bts = [];
    if (t.estatua) {
      const pc = ESTATUA_PECAS.find((x) => x.id === t.estatua);
      const falta = pc.requer.filter((r) => !p.estatua.colocadas.includes(r));
      const nota = falta.length ? `guarde até colocar: ${falta.map((r) => ESTATUA_PECAS.find((x) => x.id === r).nome).join(', ')}` : 'pronta para a estátua (vá até a base e aperte E)';
      if (de === 'carga' && modo === 'tudo') bts.push(this.btn('Guardar no depósito', { tipo: 'guardar', uid: it.uid }));
      return `<div class="item"><div><b class="rar-lendário">🗿 ${esc(t.nome)}</b> <span class="nota">${t.kg} kg · ${nota}</span></div><div class="acoes">${bts.join('')}</div></div>`;
    }
    const vm = Math.round(t.valor * multDinheiro(p));
    if (modo === 'tudo' || modo === 'deposito') bts.push(this.btn(`Vender S$ ${vm}`, { tipo: 'vender', uid: it.uid, de }));
    if (t.recicla && (modo === 'tudo' || modo === 'reciclador' || modo === 'deposito')) bts.push(this.btn('Reciclar → ' + Object.entries(t.recicla).map(([k, n]) => `${n} ${k}`).join(', '), { tipo: 'reciclar', uid: it.uid, de }, !p.estacao.reciclador, 'Construa a Recicladora'));
    if (rest && (modo === 'tudo' || modo === 'restauro' || modo === 'deposito')) bts.push(this.btn(`Restaurar (${custoTxt(rest)}) → S$ ${SUCATA[t.restaura].valor}`, { tipo: 'restaurar', uid: it.uid, de }, !p.estacao.restauro || faltando(p, rest).length > 0, !p.estacao.restauro ? 'Construa a bancada de restauro' : faltando(p, rest).join(', ')));
    if (de === 'carga' && modo === 'tudo') bts.push(this.btn('Guardar', { tipo: 'guardar', uid: it.uid }));
    if (de === 'deposito' && modo === 'deposito') bts.push(this.btn('Levar ao sub', { tipo: 'retirar', uid: it.uid }));
    return `<div class="item"><div><b class="rar-${t.rar}">${esc(t.nome)}</b> <span class="nota">${t.kg} kg · ${t.L} L · ${t.rar}</span></div><div class="acoes">${bts.join('')}</div></div>`;
  }
  listaSucata(p, modo) {
    const filtro = (it) => (modo === 'reciclador' ? !!SUCATA[it.tipo].recicla : modo === 'restauro' ? !!SUCATA[it.tipo].restaura : true);
    let h = '';
    if (modo === 'reciclador' && !p.estacao.reciclador) return '<p class="nota">Construa a Recicladora no terminal (aba Estação).</p>';
    if (modo === 'restauro' && !p.estacao.restauro) return '<p class="nota">Construa a Bancada de restauro no terminal (aba Estação).</p>';
    h += `<h3>No submarino (${p.carga.length})</h3><div class="lista">${p.carga.filter(filtro).map((it) => this.linhaItem(it, 'carga', p, modo === 'deposito' ? 'tudo' : modo)).join('') || '<p class="nota">Vazio</p>'}</div>`;
    h += `<h3>No depósito (${p.deposito.length}/${depositoVagas(p)})</h3><div class="lista">${p.deposito.filter(filtro).map((it) => this.linhaItem(it, 'deposito', p, modo === 'deposito' ? 'deposito' : modo)).join('') || '<p class="nota">Vazio</p>'}</div>`;
    return h;
  }
  painelAquario(p, qual) {
    const alvo = qual === 'tanque' ? p.tanque : p.aquario;
    const t = qual === 'tanque' ? TANQUES[p.tanque.nivel] : AQUARIOS[p.aquario.nivel];
    if (!t) return '<p class="nota">Você ainda não tem um tanque. Construa no terminal.</p>';
    let h = `<p>${t.nome}: <b>[${alvo.peixes.length}/${t.vagas}]</b> · tamanho máximo ${t.maxCm} cm</p>`;
    if (p.mao) {
      const m = cabeNoAquario(p, p.mao, qual);
      h += `<div class="convite">Na mão: ${esc(ESPECIES[p.mao.esp].nome)} (${p.mao.cm} cm) ${this.btn('Colocar aqui', { tipo: 'peixe_aquario', destino: qual }, !!m, m || '')} ${m ? `<span class="falta">${esc(m)}</span>` : ''}</div>`;
    }
    h += '<div class="lista">' + (alvo.peixes.map((f) => `<div class="item"><div>🐟 ${esc(ESPECIES[f.esp].nome)} — ${f.cm} cm</div><div class="acoes">${this.btn('Retirar', { tipo: 'aquario_retirar', de: qual, uid: f.uid }, !!p.mao)}</div></div>`).join('') || '<p class="nota">Vazio. Pesque um peixe que caiba e coloque aqui.</p>') + '</div>';
    return h;
  }
  lojaArmas(p) {
    let h = `<p class="nota">Compre em ordem: primeiro o estilingue, depois a pistola e assim por diante. Cada acerto derruba o amigo no chão; as armas de fogo ainda jogam ele para longe (só vale contra quem está a pé). Armas: teclas <kbd>1</kbd>–<kbd>5</kbd>, <kbd>H</kbd> guarda, botão esquerdo atira, a sniper mira com o botão direito. O Kraken só leva dano das armas de fogo.</p><div class="grade">`;
    ARMAS_LOJA.forEach((k) => {
      const A = ARMAS[k], tem = !!p.armas[k], bloqueada = A.requer && !p.armas[A.requer];
      const bal = p.municao[k] || 0;
      const tecla = A.lixo ? 'Q' : String(ARMAS_ORDEM.indexOf(k) + 1);
      if (A.lixo) {
        h += `<div class="card"><h3>${esc(A.nome)} <span class="nota">(tecla Q)</span></h3>
          <div class="nv">Munição: o <b>lixo</b> que você cata na margem. Cate com <kbd>E</kbd>, aperte <kbd>Q</kbd> para mirar (mesmo arco do peixe) e clique para atirar. Sem lixo na mão, usa o do saco. Derruba o amigo por <b>${A.stunMs / 1000} s</b> · alcance ${A.alcance} m · não machuca o Kraken.</div>
          ${tem ? `<div class="val"><b>Você tem</b> · lixo no saco: ${p.saco.length}${p.lixoMao ? ' + 1 na mão' : ''}</div>` : `<div class="custo">S$ ${fmt(A.preco)}</div>${this.btn('Comprar estilingue', { tipo: 'arma_comprar', arma: k }, p.dinheiro < A.preco, p.dinheiro < A.preco ? `Faltam S$ ${fmt(A.preco - p.dinheiro)}` : '')}`}</div>`;
        return;
      }
      h += `<div class="card"><h3>${tecla}. ${esc(A.nome)}</h3>
        <div class="nv">No chão: <b>${A.stunMs / 1000} s</b> por tiro · empurrão ${A.empurrao[0] < 5 ? 'pequeno' : A.empurrao[0] < 9 ? 'médio' : A.empurrao[0] < 14 ? 'forte' : 'voa longe'} · alcance ${A.alcance} m${A.auto ? ' · automática' : ''}${A.foguete ? ' · explode' : ''}</div>
        ${tem ? `<div class="val">Você tem · <b>${bal}/${MUNICAO_MAX[k]}</b> ${A.foguete ? 'foguetes' : 'balas'}</div>${this.btn(`Comprar ${A.municao.n} ${A.foguete ? 'foguete' : 'balas'} — S$ ${fmt(A.municao.preco)}`, { tipo: 'municao_comprar', arma: k }, p.dinheiro < A.municao.preco || bal + A.municao.n > MUNICAO_MAX[k])}`
          : `<div class="custo">S$ ${fmt(A.preco)} (vem com ${A.municao.n} ${A.foguete ? 'foguete' : 'balas'})</div>${bloqueada ? `<div class="falta">Primeiro compre: ${esc(ARMAS[A.requer].nome)}</div>` : this.btn('Comprar arma', { tipo: 'arma_comprar', arma: k }, p.dinheiro < A.preco, p.dinheiro < A.preco ? `Faltam S$ ${fmt(A.preco - p.dinheiro)}` : '')}`}</div>`;
    });
    return h + '</div>';
  }
  aba_contratos(p) {
    let h = '<div class="grade">';
    for (const c of CONTRATOS) {
      const ativo = p.contratos.ativos.includes(c.id), feito = p.contratos.concluidos.includes(c.id);
      const e = ativo ? contratoEstado(p, c) : null;
      h += `<div class="card"><h3>${esc(c.nome)}</h3><div class="nv">${esc(c.desc)}</div><div class="custo">Prêmio: ${custoTxt(c.premio)}</div>
        ${feito ? '<div class="val"><b>Concluído</b></div>' : ativo ? (e.pronto ? this.btn('Entregar', { tipo: 'contrato_entregar', id: c.id }) : `<div class="falta">Falta: ${esc(e.falta)}</div>`) : this.btn('Aceitar', { tipo: 'contrato_aceitar', id: c.id })}</div>`;
    }
    return h + '</div>';
  }
  inventario(p) {
    const st = subStats(p), u = cargaUso(p), vs = varaStats(p);
    let h = `<div class="grade"><div class="card"><h3>Submarino</h3><div class="val">Carga: ${fmt(u.kg)}/${st.cargaKg} kg · ${fmt(u.L)}/${st.cargaL} L</div>${p.carga.map((it) => `<div class="rar-${SUCATA[it.tipo].rar}">• ${esc(SUCATA[it.tipo].nome)}</div>`).join('') || '<div class="nota">vazio</div>'}</div>
      <div class="card"><h3>Peixes</h3><div>Na mão: ${p.mao ? `${esc(ESPECIES[p.mao.esp].nome)} (${p.mao.cm} cm)` : '—'}</div><div>Caixa térmica [${p.caixaTermica.length}/${CAIXA_TERMICA.vagas}]: ${p.caixaTermica.map((f) => `${esc(ESPECIES[f.esp].nome)} ${f.cm} cm`).join(', ') || '—'}</div>
      <div>Aquário [${p.aquario.peixes.length}/${AQUARIOS[p.aquario.nivel].vagas}] · Tanque ${p.tanque.nivel >= 0 ? `[${p.tanque.peixes.length}/${TANQUES[p.tanque.nivel].vagas}]` : '—'}</div><div>Balões de tinta: ${p.baloes}</div></div>
      <div class="card"><h3>Equipamento</h3><div>${esc(vs.nome)} (até ${vs.maxCm} cm)</div><div>Casco ${fmt(st.maxProf)} m · Bateria ${st.bateria} kWh</div><div>Faróis ${st.farol} m · Sonar ${st.sonar} m</div><div>Garra ${st.bracoKg} kg · O₂ ${st.oxigenio} s</div></div>
      <div class="card"><h3>Descobertas</h3><div>Profundidade máxima: ${fmt(p.profMax)} m</div><div>Espécies: ${p.descobertas.filter((d) => d.startsWith('peixe:')).length}/${Object.keys(ESPECIES).length}</div><div>Lugares: ${p.descobertas.filter((d) => d.startsWith('lugar:')).length}</div><div>Depósito: ${p.deposito.length}/${depositoVagas(p)}</div></div></div>`;
    return h;
  }
  sala() {
    const g = this.g, net = g.net;
    let h = '';
    if (net.mode === 'solo') {
      h += `<p><b>Jogo solo.</b> Seu progresso é salvo sozinho <b>neste navegador</b> (a cada ação e a cada 10 s). Para jogar com amigos, saia para o menu e abra <b>Jogar com amigos</b>.</p>`;
    } else {
      const link = `${location.origin}${location.pathname}?sala=${net.code}${new URLSearchParams(location.search).get('servidor') ? '&servidor=' + encodeURIComponent(new URLSearchParams(location.search).get('servidor')) : ''}`;
      h += `<p><b>${esc(net.salaNome || 'Sala')}</b> · ${esc(net.status)}</p><div class="convite">Código: <code>${net.code}</code><button data-copiar="${net.code}">Copiar código</button></div>
        <div class="convite"><input readonly value="${esc(link)}"><button data-copiar="${esc(link)}">Copiar link de convite</button></div>
        <p class="nota">O código desta sala <b>nunca muda</b>. Tudo é salvo sozinho no servidor: quando quiserem parar, é só sair; para continuar, o líder entra e os amigos digitam o mesmo código. Até 5 jogadores; cada um fica sempre com a mesma estação.</p>`;
    }
    h += `<p><button data-sair="1">⏏ Sair do jogo (já está salvo)</button></p>`;
    h += '<h3>Jogadores</h3>';
    for (const s of STATIONS) {
      const pl = g.remotos[s.id] || (s.id === g.slot ? { nome: g.perfil.nome, cor: g.perfil.cor, conectado: true } : null);
      const cor = pl ? CORES_JOGADOR[pl.cor % CORES_JOGADOR.length].roupa.map((c) => Math.round(c * 255)).join(',') : '60,60,60';
      h += `<div class="jog"><div class="slotTag" style="background:rgb(${cor})">${s.id}</div><div>${pl ? esc(pl.nome) + (s.id === g.slot ? ' (você)' : '') : '<span class="nota">vaga livre (a base aparece quando alguém entrar)</span>'}<div class="nota">${s.nome}</div></div><div class="nota">${pl ? (pl.conectado ? '● conectado' : '○ reconectando…') : ''}</div></div>`;
    }
    return h;
  }
}
