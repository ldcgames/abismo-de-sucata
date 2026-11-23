// Menu do ESC: Continuar · Configurações (gráfico, brilho, som, barulhos, voz dos outros) · Ocultar código da sala (modo streamer).
// As escolhas ficam salvas neste navegador.
const CHAVE = 'abismo_config';
export const GRAFICOS = [
  ['ultra', 'Ultra', 'Resolução acima da tela, sombras 4K e mais distantes'],
  ['alto', 'Alto', 'O visual padrão do jogo'],
  ['medio', 'Médio', 'Um pouco mais leve'],
  ['baixo', 'Baixo', 'Para computador fraco'],
  ['minimo', 'Mínimo', 'O mais leve possível, sem sombras'],
];
// pr = escala de pixels, msaa = suavização de bordas, sombra = tamanho do mapa de sombra (0 = sem), raio = alcance da sombra, qual = detalhe do cenário (vale ao abrir o jogo)
const PRESETS = {
  ultra: { pr: () => Math.min(Math.max((devicePixelRatio || 1) * 1.25, 1.5), 2.25), msaa: 4, sombra: 4096, raio: 70, qual: 2 },
  alto: { pr: () => Math.min(devicePixelRatio || 1, 2), msaa: 4, sombra: 2048, raio: 45, qual: 2 },
  medio: { pr: () => Math.min(devicePixelRatio || 1, 1.25), msaa: 2, sombra: 2048, raio: 40, qual: 1 },
  baixo: { pr: () => 0.85, msaa: 0, sombra: 1024, raio: 32, qual: 0 },
  minimo: { pr: () => 0.6, msaa: 0, sombra: 0, raio: 0, qual: 0 },
};
export function lerConfig() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch { /* sem armazenamento */ }
  return { grafico: null, brilho: 1, som: 0.7, barulho: 1, vozes: 1, streamer: false, ...c };
}
export function salvarConfig(c) { try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { /* sem armazenamento */ } }
export function presetGrafico(nome) { return PRESETS[nome] || PRESETS.alto; }
// esconde o código da sala no endereço do navegador (modo streamer)
export function limparUrlSala() {
  try { const u = new URL(location.href); if (u.searchParams.has('sala')) { u.searchParams.delete('sala'); history.replaceState(null, '', u.toString()); } } catch { /* */ }
}

export class Pausa {
  constructor(game) {
    this.g = game; this.cfg = lerConfig(); this.tela = null;
    const el = this.el = document.createElement('div');
    el.id = 'pausa'; el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) this.fechar(); });
  }
  get aberto() { return !this.el.hidden; }
  abrir(tela = 'menu') { this.tela = tela; this.el.hidden = false; this.g.input.unlock(); this.render(); }
  fechar() { this.el.hidden = true; this.tela = null; }
  salvar() { salvarConfig(this.cfg); }
  aplicar() { this.g.aplicarConfig(this.cfg); this.salvar(); }
  render() {
    const c = this.cfg, el = this.el;
    if (this.tela === 'menu') {
      el.innerHTML = `<div class="pausa-box"><h2>Pausa</h2>
        <button class="grande" data-a="continuar">▶ Continuar</button>
        <button class="grande" data-a="config">⚙ Configurações</button>
        <label class="streamer"><input type="checkbox" data-a="streamer" ${c.streamer ? 'checked' : ''}> Ocultar código da sala <small>(modo streamer)</small></label>
        <p class="nota">ESC volta para o jogo</p></div>`;
    } else {
      const slider = (k, nome, max = 1.5) => `<div class="cfg-linha"><span>${nome}</span><input type="range" min="0" max="${max}" step="0.05" value="${c[k]}" data-k="${k}"><b data-v="${k}">${Math.round(c[k] * 100)}%</b></div>`;
      el.innerHTML = `<div class="pausa-box larga"><h2>Configurações</h2>
        <h3>Gráfico</h3>
        <div class="graficos">${GRAFICOS.map(([id, nm, d]) => `<button data-g="${id}" class="${c.grafico === id ? 'sel' : ''}" title="${d}">${nm}<small>${d}</small></button>`).join('')}</div>
        <p class="nota">A resolução, as bordas e as sombras mudam na hora. O detalhe do cenário (árvores, terreno) muda na próxima vez que abrir o jogo.</p>
        <h3>Imagem e som</h3>
        ${slider('brilho', '☀ Brilho', 1.6)}
        ${slider('som', '🔊 Som (volume geral)', 1)}
        ${slider('barulho', '🌊 Barulhos (vento, água, bichos)', 1.5)}
        ${slider('vozes', '🎙 Voz das outras pessoas', 1)}
        <label class="streamer"><input type="checkbox" data-a="streamer" ${c.streamer ? 'checked' : ''}> Ocultar código da sala <small>(modo streamer)</small></label>
        <div class="linha-bts"><button data-a="voltar">← Voltar</button><button data-a="continuar">▶ Continuar</button></div></div>`;
    }
    el.querySelectorAll('[data-a="continuar"]').forEach((b) => (b.onclick = () => this.fechar()));
    el.querySelectorAll('[data-a="config"]').forEach((b) => (b.onclick = () => { this.tela = 'config'; this.render(); }));
    el.querySelectorAll('[data-a="voltar"]').forEach((b) => (b.onclick = () => { this.tela = 'menu'; this.render(); }));
    el.querySelectorAll('[data-a="streamer"]').forEach((b) => (b.onchange = () => { c.streamer = b.checked; this.aplicar(); }));
    el.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { c.grafico = b.dataset.g; this.aplicar(); this.render(); }));
    el.querySelectorAll('input[type=range]').forEach((r) => (r.oninput = () => {
      c[r.dataset.k] = +r.value; el.querySelector(`[data-v="${r.dataset.k}"]`).textContent = Math.round(+r.value * 100) + '%'; this.aplicar();
    }));
  }
}
