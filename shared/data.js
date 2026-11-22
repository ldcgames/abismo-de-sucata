// ABISMO DE SUCATA — tabelas de jogo (fonte única de verdade para cliente e servidor).
// Preços em S$ (sucata-dólares). Massa em kg, volume em litros, peixes em cm.

export const MOEDA = 'S$';
export const COMPONENTES = {
  metal: 'Metal', cobre: 'Cobre', borracha: 'Borracha', eletronica: 'Eletrônica', vidro: 'Vidro', cristal: 'Cristal',
};

// ---------------- SUCATA ----------------
// zona: profundidade mínima/máxima (m) em que aparece no mundo.
// Raso = sucata ruim (latas, garrafas, pneus); quanto mais fundo, melhores as peças.
export const SUCATA = {
  lata:            { nome: 'Lata amassada', kg: 0.3, L: 1, rar: 'comum', valor: 10, recicla: { metal: 1 }, zona: [0, 150], peso: 10 },
  garrafa:         { nome: 'Garrafa antiga', kg: 0.6, L: 1.5, rar: 'comum', valor: 11, recicla: { vidro: 1 }, zona: [0, 150], peso: 8 },
  pneu:            { nome: 'Pneu velho', kg: 9, L: 40, rar: 'comum', valor: 35, recicla: { borracha: 3 }, zona: [0, 500], peso: 7 },
  cano:            { nome: 'Cano de cobre', kg: 6, L: 12, rar: 'comum', valor: 29, recicla: { metal: 1, cobre: 2 }, zona: [0, 500], peso: 7 },
  corrente:        { nome: 'Corrente enferrujada', kg: 14, L: 10, rar: 'comum', valor: 48, recicla: { metal: 4 }, zona: [25, 700], peso: 6 },
  bateria_velha:   { nome: 'Bateria velha', kg: 12, L: 8, rar: 'comum', valor: 45, recicla: { metal: 1, cobre: 2, eletronica: 1 }, zona: [25, 700], peso: 5 },
  radio:           { nome: 'Rádio valvulado', kg: 3, L: 8, rar: 'incomum', valor: 72, recicla: { eletronica: 2, metal: 1 }, restaura: 'radio_ok', zona: [55, 900], peso: 4 },
  caixa_ferramentas: { nome: 'Caixa de ferramentas', kg: 8, L: 18, rar: 'incomum', valor: 96, recicla: { metal: 3 }, restaura: 'ferramentas_ok', zona: [55, 900], peso: 4 },
  helice:          { nome: 'Hélice de barco', kg: 18, L: 25, rar: 'incomum', valor: 88, recicla: { metal: 4, cobre: 2 }, zona: [75, 1200], peso: 4 },
  motor_popa:      { nome: 'Motor de popa', kg: 35, L: 60, rar: 'incomum', valor: 144, recicla: { metal: 6, cobre: 2, borracha: 1 }, restaura: 'motor_ok', zona: [90, 1500], peso: 3 },
  ancora:          { nome: 'Âncora', kg: 60, L: 40, rar: 'incomum', valor: 176, recicla: { metal: 10 }, zona: [300, 1500], peso: 3 },
  sino_navio:      { nome: 'Sino de navio', kg: 25, L: 20, rar: 'raro', valor: 416, recicla: { metal: 3, cobre: 6 }, restaura: 'sino_polido', zona: [450, 2500], peso: 2 },
  cofre:           { nome: 'Cofre lacrado', kg: 80, L: 50, rar: 'raro', valor: 640, recicla: { metal: 14 }, restaura: 'cofre_aberto', zona: [500, 4300], peso: 2 },
  minerio:         { nome: 'Minério de cobalto', kg: 20, L: 10, rar: 'incomum', valor: 240, recicla: { metal: 2, cristal: 1 }, zona: [500, 4300], peso: 4 },
  sonda:           { nome: 'Sonda antiga', kg: 40, L: 45, rar: 'raro', valor: 1120, recicla: { eletronica: 6, metal: 4 }, restaura: 'sonda_ok', zona: [1400, 4500], peso: 2 },
  cristal:         { nome: 'Cristal abissal', kg: 6, L: 6, rar: 'raro', valor: 1440, recicla: { cristal: 4 }, zona: [1400, 4500], peso: 3 },
  reliquia:        { nome: 'Relíquia do Abismo', kg: 15, L: 15, rar: 'lendário', valor: 5600, recicla: { cristal: 12 }, restaura: 'reliquia_viva', zona: [3950, 5000], peso: 2 },
  // lixo espalhado na margem (catado a pé, vai para o saco de recicláveis)
  garrafa_pet:     { nome: 'Garrafa PET', kg: 0.05, L: 2, rar: 'comum', valor: 10, recicla: { borracha: 1 }, zona: null, peso: 0, terra: true },
  latinha:         { nome: 'Latinha de refrigerante', kg: 0.02, L: 0.5, rar: 'comum', valor: 8, recicla: { metal: 1 }, zona: null, peso: 0, terra: true },
  sacola:          { nome: 'Sacola plástica', kg: 0.01, L: 0.5, rar: 'comum', valor: 5, zona: null, peso: 0, terra: true },
  saco_lixo:       { nome: 'Saco de lixo', kg: 2, L: 20, rar: 'comum', valor: 18, recicla: { borracha: 1 }, zona: null, peso: 0, terra: true },
  vidro_quebrado:  { nome: 'Pote de vidro', kg: 0.3, L: 1, rar: 'comum', valor: 12, recicla: { vidro: 1 }, zona: null, peso: 0, terra: true },
  // itens especiais (só por contrato/evento)
  caixa_preta:     { nome: 'Caixa-preta', kg: 10, L: 12, rar: 'raro', valor: 156, recicla: { eletronica: 3 }, zona: null, peso: 0 },
  ancora_gigante:  { nome: 'Âncora gigante', kg: 320, L: 200, rar: 'raro', valor: 1235, recicla: { metal: 45 }, zona: null, peso: 0, coop: true },
  // itens restaurados (só via bancada de restauro)
  radio_ok:        { nome: 'Rádio restaurado', kg: 3, L: 8, rar: 'incomum', valor: 196, restaurado: true },
  ferramentas_ok:  { nome: 'Jogo de ferramentas', kg: 8, L: 18, rar: 'incomum', valor: 266, restaurado: true },
  motor_ok:        { nome: 'Motor de popa revisado', kg: 35, L: 60, rar: 'raro', valor: 448, restaurado: true },
  sino_polido:     { nome: 'Sino de navio polido', kg: 25, L: 20, rar: 'raro', valor: 910, restaurado: true },
  cofre_aberto:    { nome: 'Cofre aberto (moedas antigas)', kg: 80, L: 50, rar: 'raro', valor: 1610, restaurado: true },
  sonda_ok:        { nome: 'Sonda recuperada', kg: 40, L: 45, rar: 'raro', valor: 2240, restaurado: true },
  reliquia_viva:   { nome: 'Relíquia desperta', kg: 15, L: 15, rar: 'lendário', valor: 12600, restaurado: true },
};
export const RESTAURO = {
  radio_ok: { dinheiro: 20, comps: { eletronica: 1 }, s: 3 },
  ferramentas_ok: { dinheiro: 25, comps: { metal: 1 }, s: 3 },
  motor_ok: { dinheiro: 60, comps: { borracha: 2, cobre: 1 }, s: 5 },
  sino_polido: { dinheiro: 80, comps: { cobre: 2 }, s: 4 },
  cofre_aberto: { dinheiro: 150, comps: { metal: 4 }, s: 6 },
  sonda_ok: { dinheiro: 300, comps: { eletronica: 4, vidro: 2 }, s: 6 },
  reliquia_viva: { dinheiro: 1500, comps: { cristal: 6 }, s: 8 },
};

// ---------------- PEIXES E FAUNA PESCÁVEL ----------------
// cm: [mín, máx]; prof: profundidade de linha [mín, máx] em m; hora: 'dia' | 'noite' | 'qualquer'
export const ESPECIES = {
  tetra:     { nome: 'Tetra-de-vidro', cm: [3, 6], prof: [0, 6], hora: 'dia', chance: 13, valor: 20, cor: [0.55, 0.85, 0.95], forca: 0.3, forma: 'peixe', cardume: true },
  barrigudo: { nome: 'Barrigudinho-do-lago', cm: [3, 8], prof: [0, 8], hora: 'qualquer', chance: 12, valor: 18, cor: [0.95, 0.6, 0.25], forca: 0.3, forma: 'peixe', cardume: true },
  lambari:   { nome: 'Lambari', cm: [7, 14], prof: [0, 12], hora: 'dia', chance: 15, valor: 16, cor: [0.8, 0.82, 0.78], forca: 0.5, forma: 'peixe', cardume: true },
  piranha:   { nome: 'Piranha-vermelha', cm: [12, 30], prof: [0, 15], hora: 'qualquer', chance: 10, valor: 45, cor: [0.62, 0.36, 0.3], forca: 1.0, forma: 'peixe', cardume: true },
  tilapia:   { nome: 'Tilápia', cm: [15, 45], prof: [1, 20], hora: 'dia', chance: 13, valor: 60, cor: [0.55, 0.6, 0.55], forca: 1.2, forma: 'peixe' },
  traira:    { nome: 'Traíra', cm: [20, 60], prof: [1, 22], hora: 'noite', chance: 9, valor: 95, cor: [0.33, 0.36, 0.25], forca: 1.8, forma: 'peixe' },
  pacu:      { nome: 'Pacu', cm: [20, 70], prof: [2, 30], hora: 'dia', chance: 8, valor: 120, cor: [0.42, 0.46, 0.5], forca: 1.9, forma: 'peixe' },
  tucunare:  { nome: 'Tucunaré', cm: [25, 75], prof: [2, 30], hora: 'dia', chance: 9, valor: 170, cor: [0.85, 0.75, 0.25], forca: 2.2, forma: 'peixe' },
  carpa:     { nome: 'Carpa-espelho', cm: [30, 90], prof: [2, 35], hora: 'qualquer', chance: 8, valor: 130, cor: [0.75, 0.55, 0.3], forca: 2.0, forma: 'peixe' },
  tambaqui:  { nome: 'Tambaqui', cm: [40, 110], prof: [4, 45], hora: 'qualquer', chance: 5, valor: 230, cor: [0.28, 0.29, 0.27], forca: 3.0, forma: 'peixe' },
  dourado:   { nome: 'Dourado', cm: [40, 100], prof: [3, 40], hora: 'dia', chance: 5, valor: 280, cor: [0.97, 0.72, 0.18], forca: 3.1, forma: 'peixe' },
  bagre:     { nome: 'Bagre-do-lodo', cm: [30, 110], prof: [4, 60], hora: 'noite', chance: 10, valor: 160, cor: [0.35, 0.33, 0.3], forca: 2.6, forma: 'bagre' },
  pintado:   { nome: 'Pintado (surubim)', cm: [50, 140], prof: [8, 70], hora: 'noite', chance: 4, valor: 360, cor: [0.72, 0.73, 0.76], forca: 3.6, forma: 'bagre' },
  lula:      { nome: 'Lula-de-lago', cm: [25, 60], prof: [6, 80], hora: 'noite', chance: 12, valor: 75, cor: [0.85, 0.45, 0.55], forca: 1.6, forma: 'lula', tinta: true },
  enguia:    { nome: 'Enguia-elétrica', cm: [60, 150], prof: [8, 80], hora: 'noite', chance: 4, valor: 340, cor: [0.25, 0.3, 0.22], forca: 3.2, forma: 'enguia' },
  pirarucu:  { nome: 'Pirarucu', cm: [120, 250], prof: [10, 80], hora: 'dia', chance: 3, valor: 850, cor: [0.4, 0.35, 0.3], forca: 5.5, forma: 'peixe' },
  peixe_lua: { nome: 'Peixe-lua-dourado (lendário)', cm: [80, 180], prof: [30, 110], hora: 'noite', chance: 1, valor: 1600, cor: [1.0, 0.84, 0.32], forca: 5.0, forma: 'peixe' },
  tubarao:   { nome: 'Tubarão-touro-do-lago', cm: [250, 420], prof: [25, 150], hora: 'noite', chance: 2.2, valor: 3000, cor: [0.42, 0.46, 0.5], forca: 9, forma: 'tubarao', pesado: true },
  // o tubarão que ronda os píeres: não se pesca, só cai na bala. Vale sempre S$ 400.
  tubarao_cacado: { nome: 'Tubarão do lago (abatido)', cm: [330, 330], prof: [9999, 9999], hora: 'qualquer', chance: 0, valor: 400, valorFixo: 400, cor: [0.4, 0.45, 0.5], forca: 9, forma: 'tubarao', pesado: true, cacado: true },
};
// massa aproximada (kg) a partir do comprimento
export function massaPeixe(esp, cm) {
  const k = { peixe: 0.000012, bagre: 0.000011, lula: 0.000009, enguia: 0.000003, tubarao: 0.0000095 }[ESPECIES[esp].forma] || 0.000012;
  return Math.max(0.005, k * cm ** 3);
}
export function valorPeixe(esp, cm) {
  const e = ESPECIES[esp];
  if (e.valorFixo) return e.valorFixo;
  const t = (cm - e.cm[0]) / Math.max(1, e.cm[1] - e.cm[0]);
  return Math.round(e.valor * (0.7 + 0.8 * t));
}

// ---------------- SUBMARINO ----------------
// Cada atributo: lista de níveis. nivel 1 = inicial (grátis). custo = { dinheiro, comps }
export const SUB_UP = {
  casco: { nome: 'Casco (pressão)', un: 'm', niveis: [
    { v: 120, custo: null, desc: 'Casco rebitado original' },
    { v: 560, custo: { dinheiro: 900, comps: { metal: 12 } }, desc: 'Chapas soldadas' },
    { v: 1650, custo: { dinheiro: 4500, comps: { metal: 30, cobre: 10 } }, desc: 'Casco duplo de aço' },
    { v: 4400, custo: { dinheiro: 18000, comps: { metal: 60, cristal: 8 } }, desc: 'Esfera de titânio' },
    { v: 9999, custo: { dinheiro: 65000, comps: { cristal: 30, eletronica: 30 } }, desc: 'Liga abissal' },
  ] },
  propulsor: { nome: 'Propulsores', un: 'm/s', niveis: [
    { v: 6, vert: 3.2, custo: null, desc: 'Hélice única' },
    { v: 9, vert: 6, custo: { dinheiro: 600, comps: { cobre: 6 } }, desc: 'Hélice + 2 laterais' },
    { v: 13, vert: 11, custo: { dinheiro: 3000, comps: { cobre: 14, eletronica: 4 } }, desc: 'Propulsão vetorada' },
    { v: 18, vert: 18, custo: { dinheiro: 12000, comps: { cobre: 25, eletronica: 12 } }, desc: 'Turbinas de jato' },
    { v: 24, vert: 28, custo: { dinheiro: 40000, comps: { cristal: 12, eletronica: 20 } }, desc: 'Propulsão abissal' },
  ] },
  bateria: { nome: 'Bateria', un: 'kWh', niveis: [
    { v: 100, custo: null, desc: 'Chumbo-ácido' },
    { v: 180, custo: { dinheiro: 500, comps: { cobre: 4 } }, desc: 'Banco duplo' },
    { v: 320, custo: { dinheiro: 2500, comps: { eletronica: 6 } }, desc: 'Íon-lítio' },
    { v: 600, custo: { dinheiro: 9000, comps: { eletronica: 14 } }, desc: 'Célula de combustível' },
    { v: 1000, custo: { dinheiro: 30000, comps: { cristal: 10 } }, desc: 'Núcleo de cristal' },
  ] },
  farol: { nome: 'Faróis', un: 'm', niveis: [
    { v: 26, custo: null, desc: 'Farol simples' },
    { v: 42, custo: { dinheiro: 400, comps: { vidro: 3 } }, desc: 'Par de faróis' },
    { v: 62, custo: { dinheiro: 2000, comps: { vidro: 6, eletronica: 3 } }, desc: 'LEDs de alta potência' },
    { v: 90, custo: { dinheiro: 8000, comps: { vidro: 10, eletronica: 8 } }, desc: 'Holofotes de mergulho profundo' },
  ] },
  sonar: { nome: 'Sonar', un: 'm', niveis: [
    { v: 45, custo: null, desc: 'Sonar de pesca' },
    { v: 130, custo: { dinheiro: 500, comps: { eletronica: 3 } }, desc: 'Sonar de varredura' },
    { v: 320, custo: { dinheiro: 3000, comps: { eletronica: 8 } }, desc: 'Sonar 3D' },
    { v: 750, custo: { dinheiro: 11000, comps: { eletronica: 16, cristal: 3 } }, desc: 'Sonar abissal' },
  ] },
  braco: { nome: 'Braço / guincho', un: 'kg', niveis: [
    { v: 40, alcance: 4.5, custo: null, desc: 'Garra simples' },
    { v: 90, alcance: 5.5, custo: { dinheiro: 700, comps: { metal: 8 } }, desc: 'Garra hidráulica' },
    { v: 200, alcance: 7, custo: { dinheiro: 3500, comps: { metal: 18, cobre: 6 } }, desc: 'Braço articulado' },
    { v: 600, alcance: 9, custo: { dinheiro: 14000, comps: { metal: 40, eletronica: 10 } }, desc: 'Guincho de carga' },
  ] },
  carga: { nome: 'Compartimento de carga', un: 'kg', niveis: [
    { v: 60, L: 60, n: 5, custo: null, desc: 'Cesto lateral (5 objetos)' },
    { v: 150, L: 120, n: 8, custo: { dinheiro: 350, comps: { metal: 5 } }, desc: 'Cesto duplo (8 objetos)' },
    { v: 350, L: 260, n: 12, custo: { dinheiro: 2000, comps: { metal: 14 } }, desc: 'Porão inferior (12 objetos)' },
    { v: 800, L: 520, n: 18, custo: { dinheiro: 8000, comps: { metal: 30 } }, desc: 'Contêiner acoplado (18 objetos)' },
    { v: 1600, L: 950, n: 25, custo: { dinheiro: 25000, comps: { metal: 55, eletronica: 8 } }, desc: 'Módulo de carga pesado (25 objetos)' },
  ] },
  oxigenio: { nome: 'Reserva de oxigênio', un: 's', niveis: [
    { v: 600, custo: null, desc: '1 cilindro' },
    { v: 1200, custo: { dinheiro: 400, comps: { metal: 3 } }, desc: '2 cilindros' },
    { v: 2400, custo: { dinheiro: 2500, comps: { metal: 8, eletronica: 2 } }, desc: 'Reciclador de CO₂' },
    { v: 6000, custo: { dinheiro: 10000, comps: { eletronica: 10 } }, desc: 'Eletrólise de água' },
  ] },
};
// evolução do submarino mais rápida: preços 40% menores e só dinheiro (sem componentes)
for (const up of Object.values(SUB_UP)) for (const n of up.niveis) if (n.custo) {
  n.custo.dinheiro = Math.round((n.custo.dinheiro * 0.6) / 50) * 50;
  n.custo.comps = {}; // o submarino melhora só com dinheiro
}
export const SUB_ORDEM = ['casco', 'propulsor', 'bateria', 'farol', 'sonar', 'braco', 'carga', 'oxigenio'];

// consumo de energia (kWh/s): o empuxo máximo do nível 1 gasta ~0,22 kWh/s
export const ENERGIA = { motor: 0.22, farol: 0.03, sonarPing: 0.4, ociosa: 0.005, recargaDoca: 2.5, recargaRapida: 8 };

// ---------------- VARA DE PESCA ----------------
// Pode comprar qualquer vara melhor direto (não precisa passar por todas). Só dinheiro.
const D = (dinheiro) => ({ dinheiro, comps: {} });
export const VARA = [
  { nome: 'Vara de bambu', maxCm: 35, linhaKg: 6, alcance: 16, prof: 8, custo: null, cor: [0.75, 0.62, 0.32] },
  { nome: 'Vara telescópica', maxCm: 50, linhaKg: 9, alcance: 20, prof: 14, custo: D(90), cor: [0.3, 0.3, 0.32] },
  { nome: 'Vara de fibra', maxCm: 70, linhaKg: 14, alcance: 24, prof: 22, custo: D(250), cor: [0.85, 0.85, 0.9] },
  { nome: 'Vara de fibra reforçada', maxCm: 100, linhaKg: 22, alcance: 28, prof: 32, custo: D(600), cor: [0.2, 0.45, 0.85] },
  { nome: 'Vara de carbono + molinete', maxCm: 140, linhaKg: 35, alcance: 32, prof: 45, custo: D(1200), cor: [0.12, 0.12, 0.13] },
  { nome: 'Vara de titânio', maxCm: 190, linhaKg: 60, alcance: 36, prof: 62, custo: D(2600), cor: [0.62, 0.64, 0.68] },
  { nome: 'Vara oceânica', maxCm: 260, linhaKg: 110, alcance: 40, prof: 85, custo: D(5000), cor: [0.85, 0.35, 0.12] },
  { nome: 'Vara lendária do abismo', maxCm: 340, linhaKg: 200, alcance: 46, prof: 110, custo: D(11000), cor: [0.9, 0.75, 0.25] },
];
export const PESADO = { nome: 'Equipamento pesado (guincho de pesca + gancho de aço)', maxCm: 450, linhaKg: 600, prof: 150, custo: D(15000), requerVara: 7 };

// ---------------- AQUÁRIOS E TANQUES ----------------
// Aquários são decoração e guarda-peixes: dá para comprar qualquer um maior direto. estilo muda o visual.
export const AQUARIOS = [
  { nome: 'Aquário Nano', vagas: 1, maxCm: 12, custo: null, dims: [0.45, 0.35, 0.3], estilo: 'simples' },
  { nome: 'Aquário Redondo (aquário de peixinho)', vagas: 2, maxCm: 15, custo: D(40), dims: [0.55, 0.55, 0.55], estilo: 'redondo' },
  { nome: 'Aquário de Mesa', vagas: 3, maxCm: 20, custo: D(90), dims: [0.7, 0.45, 0.35], estilo: 'simples' },
  { nome: 'Aquário Pequeno', vagas: 4, maxCm: 25, custo: D(180), dims: [0.9, 0.55, 0.45], estilo: 'simples' },
  { nome: 'Aquário Plantado', vagas: 5, maxCm: 30, custo: D(350), dims: [1.1, 0.6, 0.5], estilo: 'plantado' },
  { nome: 'Aquário de Corais (marinho)', vagas: 6, maxCm: 40, custo: D(650), dims: [1.3, 0.7, 0.6], estilo: 'corais' },
  { nome: 'Aquário Médio', vagas: 8, maxCm: 55, custo: D(1100), dims: [1.6, 0.8, 0.7], estilo: 'plantado' },
  { nome: 'Aquário Grande', vagas: 10, maxCm: 90, custo: D(2500), dims: [2.6, 1.2, 1.1], estilo: 'corais' },
  { nome: 'Aquário Panorâmico', vagas: 14, maxCm: 120, custo: D(5000), dims: [3.4, 1.4, 1.2], estilo: 'corais' },
];
// tanques de peixe (para peixes grandes e tubarões), evoluem um por um
export const TANQUES = [
  { nome: 'Tanque de Lona', vagas: 3, maxCm: 160, custo: D(2000), requerAquario: 4, dims: [4, 2, 3], estilo: 'lona' },
  { nome: 'Tanque de Concreto', vagas: 4, maxCm: 260, custo: D(6000), requerAquario: 4, dims: [6, 3, 4], estilo: 'concreto' },
  { nome: 'Tanque de Concreto Duplo', vagas: 6, maxCm: 330, custo: D(13000), requerAquario: 4, dims: [7.5, 3.3, 4.6], estilo: 'concreto' },
  { nome: 'Tanque Abissal', vagas: 8, maxCm: 450, custo: D(26000), requerAquario: 4, dims: [9, 4, 6], estilo: 'abissal' },
  { nome: 'Tanque Oceânico', vagas: 12, maxCm: 600, custo: D(50000), requerAquario: 4, dims: [11, 4.5, 7], estilo: 'abissal' },
];
export const CAIXA_TERMICA = { vagas: 3 };
// mochila: até 5 peixes (para arremessar ou vender) + até 10 bolsas de tinta
export const MOCHILA = { peixes: 5, bolsas: 10 };

// ---------------- ESTAÇÃO (BASE) ----------------
export const ESTACAO = {
  reciclador: { nome: 'Recicladora', custo: { dinheiro: 200, comps: {} }, desc: 'Transforma sucata em componentes.' },
  restauro:   { nome: 'Bancada de restauro', custo: { dinheiro: 600, comps: {} }, desc: 'Restaura sucata em itens valiosos.' },
  iluminacao: { nome: 'Iluminação da estação', custo: { dinheiro: 150, comps: {} }, desc: 'Postes e luzes no cais.' },
  carregador: { nome: 'Carregador rápido', custo: { dinheiro: 800, comps: {} }, desc: 'Recarrega a bateria 3× mais rápido no cais.' },
  decoracao:  { nome: 'Decoração (bandeiras e plantas)', custo: { dinheiro: 120, comps: {} }, desc: 'Deixa a estação com a sua cara.' },
  // decorações baratinhas (só enfeite, cada uma aparece num canto da estação)
  vasos:      { nome: 'Vasos de flores', custo: { dinheiro: 90, comps: {} }, desc: 'Três vasos com flores coloridas na frente da estação.', deco: true },
  flamingos:  { nome: 'Flamingos de plástico', custo: { dinheiro: 90, comps: {} }, desc: 'Um casal de flamingos cor-de-rosa no pátio.', deco: true },
  boias:      { nome: 'Boias salva-vidas', custo: { dinheiro: 90, comps: {} }, desc: 'Boias vermelhas e brancas penduradas no cais.', deco: true },
  banco:      { nome: 'Banco de praça', custo: { dinheiro: 100, comps: {} }, desc: 'Um banco de madeira virado para o lago.', deco: true },
  luzinhas:   { nome: 'Varal de luzinhas', custo: { dinheiro: 100, comps: {} }, desc: 'Lâmpadas coloridas na frente da oficina (brilham à noite).', deco: true },
  guardasol:  { nome: 'Guarda-sol e cadeira de praia', custo: { dinheiro: 100, comps: {} }, desc: 'Para descansar entre um mergulho e outro.', deco: true },
  churrasqueira: { nome: 'Churrasqueira', custo: { dinheiro: 100, comps: {} }, desc: 'Churrasqueira de tijolo com fumacinha.', deco: true },
  rede:       { nome: 'Rede de descanso', custo: { dinheiro: 100, comps: {} }, desc: 'Uma rede listrada entre dois postes.', deco: true },
};
export const DEPOSITO = [
  { vagas: 12, custo: null },
  { vagas: 30, custo: { dinheiro: 300, comps: {} } },
  { vagas: 80, custo: { dinheiro: 1500, comps: {} } },
];
export const EXTRAS = {
  lancador: { nome: 'Lançador de balões (escotilha)', custo: { dinheiro: 150, comps: {} }, desc: 'Braço externo que arremessa balões de tinta.' },
  luvas:    { nome: 'Luvas hidráulicas', custo: { dinheiro: 2500, comps: {} }, desc: 'Permitem segurar e arremessar um tubarão (brincadeira).' },
};

// ---------------- CONTRATOS ----------------
export const CONTRATOS = [
  { id: 'pecas', nome: 'Peças para o ferro-velho', desc: 'Entregue 3 pneus e 2 canos de cobre.', entrega: { pneu: 3, cano: 2 }, premio: { dinheiro: 180, comps: { borracha: 2 } } },
  { id: 'caixa_preta', nome: 'Caixa-preta da Traineira Esperança', desc: 'A traineira afundou na bacia oeste. Traga a caixa-preta.', entrega: { caixa_preta: 1 }, premio: { dinheiro: 600, comps: { eletronica: 3 } } },
  { id: 'radio', nome: 'Rádio para a rádio comunitária', desc: 'Restaure um rádio valvulado e entregue.', entrega: { radio_ok: 1 }, premio: { dinheiro: 320, comps: { cobre: 3 } } },
  { id: 'sino', nome: 'Sino para o museu', desc: 'Traga um sino de navio dos naufrágios.', entrega: { sino_navio: 1 }, premio: { dinheiro: 700, comps: { metal: 6 } } },
  { id: 'mapa_eco', nome: 'Mapear a Caverna do Eco', desc: 'Leve o submarino até o fundo da Caverna do Eco (330 m).', visitar: 'caverna_eco', premio: { dinheiro: 900, comps: { eletronica: 2 } } },
  { id: 'tucunare', nome: 'Troféu de tucunaré', desc: 'Entregue um tucunaré de pelo menos 55 cm.', peixe: { esp: 'tucunare', cm: 55 }, premio: { dinheiro: 300, comps: {} } },
  { id: 'ancora_coop', nome: 'Âncora gigante (cooperativo)', desc: 'A âncora gigante pesa 320 kg. Dois submarinos com as garras somadas conseguem içá-la juntos.', entrega: { ancora_gigante: 1 }, premio: { dinheiro: 1200, comps: { metal: 10 } }, coop: true },
  { id: 'misterio', nome: 'O que dorme no fundo', desc: 'Alcance a Câmara do Mistério (4.000 m) e traga uma relíquia.', entrega: { reliquia: 1 }, premio: { dinheiro: 15000, comps: { cristal: 10 } } },
];

// ---------------- BRINCADEIRAS ----------------
export const TROLL = {
  peixeStunMs: 3000,
  tubaraoStunMs: 7000,
  imunidadeMs: 2500,
  peixeCooldownMs: 5000,
  tubaraoCooldownMs: 45000,
  peixeAlcance: 32,
  tubaraoAlcance: 16,
  balaoCooldownMs: 20000,
  balaoAlcance: 30,
  balaoProtecaoMs: 40000,   // após limpar, o mesmo sub fica protegido por 40 s
  balaoVelocidade: 16,
  peixeVelocidade: 17,
};

export const CORES_JOGADOR = [
  { nome: 'Laranja', roupa: [0.92, 0.48, 0.16], sub: [0.85, 0.55, 0.18] },
  { nome: 'Azul', roupa: [0.2, 0.45, 0.85], sub: [0.25, 0.5, 0.75] },
  { nome: 'Verde', roupa: [0.25, 0.65, 0.35], sub: [0.35, 0.6, 0.35] },
  { nome: 'Roxo', roupa: [0.6, 0.35, 0.8], sub: [0.55, 0.38, 0.7] },
  { nome: 'Vermelho', roupa: [0.82, 0.18, 0.18], sub: [0.75, 0.22, 0.2] },
  { nome: 'Amarelo', roupa: [0.95, 0.82, 0.2], sub: [0.9, 0.78, 0.25] },
  { nome: 'Rosa', roupa: [0.95, 0.45, 0.7], sub: [0.85, 0.45, 0.65] },
];

export const PERFIL_VERSAO = 1;

// ---------------- LIXO DA MARGEM ----------------
export const LIXO = { tipos: ['garrafa_pet', 'garrafa_pet', 'garrafa_pet', 'latinha', 'latinha', 'saco_lixo', 'saco_lixo', 'sacola', 'vidro_quebrado'], quantidade: 100, saco: 15, respawnMinS: 3, respawnMaxS: 8 };
// sucata do fundo do lago: quando alguém pega, nasce outra em outro lugar em poucos segundos
export const SUCATA_RESPAWN_S = [5, 12];

// ---------------- ARMAS (barraca de armas, ao lado da casinha de tinta) ----------------
// Cada tiro derruba o alvo (como o peixe) e o empurra para longe. Compra em ordem: pistola → … → bazuca.
// stunMs: tempo no chão; empurrao: velocidade horizontal (m/s) e salto (m/s) aplicados no alvo.
export const ARMAS = {
  // estilingue: a munição é o lixo catado na margem (E cata · Q mira e atira). Não machuca o Kraken.
  estilingue:   { nome: 'Estilingue de lixo', preco: 400, requer: null, alcance: 32, cdMs: 1200, stunMs: 1000, empurrao: [0, 0], dispersao: 0, municao: null, ordem: 0, lixo: true, danoKraken: 1 },
  pistola:      { nome: 'Pistola', preco: 900, requer: 'estilingue', alcance: 45, cdMs: 420, stunMs: 2000, empurrao: [3, 2.5], dispersao: 0.012, municao: { n: 12, preco: 20 }, danoKraken: 8, ordem: 1 },
  metralhadora: { nome: 'Submetralhadora', preco: 3500, requer: 'pistola', alcance: 45, cdMs: 110, stunMs: 3000, empurrao: [4.5, 3], dispersao: 0.035, municao: { n: 40, preco: 45 }, danoKraken: 3, ordem: 2, auto: true },
  fuzil:        { nome: 'Fuzil', preco: 9000, requer: 'metralhadora', alcance: 85, cdMs: 170, stunMs: 4000, empurrao: [7, 4], dispersao: 0.016, municao: { n: 30, preco: 80 }, danoKraken: 6, ordem: 3, auto: true },
  sniper:       { nome: 'Sniper', preco: 20000, requer: 'fuzil', alcance: 220, cdMs: 1400, stunMs: 5500, empurrao: [11, 6], dispersao: 0, municao: { n: 5, preco: 90 }, danoKraken: 70, ordem: 4, mira: true },
  bazuca:       { nome: 'Bazuca', preco: 45000, requer: 'sniper', alcance: 110, cdMs: 2600, stunMs: 7000, empurrao: [16, 11], dispersao: 0, municao: { n: 1, preco: 180 }, danoKraken: 300, ordem: 5, foguete: true, raio: 4.5, velocidade: 38 },
};
export const ARMAS_ORDEM = ['pistola', 'metralhadora', 'fuzil', 'sniper', 'bazuca']; // teclas 1–5
export const ARMAS_LOJA = ['estilingue', ...ARMAS_ORDEM]; // ordem de compra na barraca

// ---------------- KRAKEN DO ABISMO ----------------
// Aparece no meio do lago a cada 20 min e fica 1 min rondando perto dos píeres.
// Vida calculada pelo dano das armas: 5 pistolas, 4 submetralhadoras, 3 fuzis, 2 snipers ou 1 bazuca
// conseguem derrubar em 1 minuto atirando bastante. O estilingue tira só 1 (danoKraken vale para o Kraken e o tubarão).
// As pessoas nunca perdem vida: nelas o tiro só derruba e empurra.
// ---------------- TUBARÃO DO LAGO ----------------
// Um só por vez: nasce 20 min depois do anterior morrer e fica rondando a frente dos píeres (barbatana de fora)
// até alguém derrubar. 200 de vida. Morto, boia: quem estiver com a mão livre pega (E) e vende por S$ 400.
// Quem leva o tubarão e é acertado (tiro, peixe, estilingue) deixa ele cair ali mesmo.
export const TUBARAO = { intervaloMs: 20 * 60e3, hp: 200, raio: 2.1, valor: 400, pegarRaio: 3.2 };
export const KRAKEN = { intervaloMs: 20 * 60e3, duracaoMs: 60e3, avisoMs: 60e3, hp: 3000, premio: 1000, raio: 6.2, tamanho: 5 };

// ---------------- CORRIDA DE SUBMARINO ----------------
// 2 jogadores: vencedor ganha S$ 200 e o perdedor paga S$ 200.
// 3 a 5: vencedor ganha S$ 250, divididos entre os que perderam.
export const CORRIDA = { checkpoints: 5, premio2: 200, premioN: 250, conviteMs: 25000, largadaMs: 4000, limiteMs: 240000, raioCheck: 5.5, minDinheiro: 200 };
export function divisaoCorrida(n) {
  if (n < 2) return { premio: 0, perda: [] };
  if (n === 2) return { premio: CORRIDA.premio2, perda: [CORRIDA.premio2] };
  const base = Math.floor(CORRIDA.premioN / (n - 1)), perda = Array(n - 1).fill(base);
  for (let i = 0; i < CORRIDA.premioN - base * (n - 1); i++) perda[i]++;
  return { premio: CORRIDA.premioN, perda };
}
export function textoPremioCorrida(n) {
  if (n < 2) return 'Escolha pelo menos 1 amigo.';
  if (n === 2) return `Quem vencer ganha S$ ${CORRIDA.premio2}. Quem perder paga S$ ${CORRIDA.premio2}.`;
  const d = divisaoCorrida(n);
  return `${n} corredores: quem vencer ganha S$ ${CORRIDA.premioN}, pagos pelos ${n - 1} que perderem (cerca de S$ ${d.perda[d.perda.length - 1]} cada).`;
}
export const MUNICAO_MAX = { estilingue: 0, pistola: 120, metralhadora: 400, fuzil: 300, sniper: 40, bazuca: 12 };

// ---------------- ESTÁTUA (peças espalhadas no fundo do lago) ----------------
// requer: peças que já precisam estar colocadas. mult: quanto soma ao multiplicador de dinheiro.
// 10 peças × 0,6 + cabeça 3,0 = multiplicador máximo 10×.
export const ESTATUA_PECAS = [
  { id: 'tenis_e', nome: 'Tênis esquerdo', kg: 55, requer: [], mult: 0.6 },
  { id: 'tenis_d', nome: 'Tênis direito', kg: 55, requer: [], mult: 0.6 },
  { id: 'perna_e', nome: 'Perna esquerda', kg: 85, requer: ['tenis_e'], mult: 0.6 },
  { id: 'perna_d', nome: 'Perna direita', kg: 85, requer: ['tenis_d'], mult: 0.6 },
  { id: 'tronco_baixo', nome: 'Tronco (parte de baixo)', kg: 140, requer: ['perna_e', 'perna_d'], mult: 0.6 },
  { id: 'tronco_cima', nome: 'Tronco (parte de cima)', kg: 150, requer: ['tronco_baixo'], mult: 0.6 },
  { id: 'braco_e', nome: 'Braço esquerdo', kg: 70, requer: ['tronco_cima'], mult: 0.6 },
  { id: 'braco_d', nome: 'Braço direito', kg: 70, requer: ['tronco_cima'], mult: 0.6 },
  { id: 'mao_e', nome: 'Mão esquerda', kg: 45, requer: ['braco_e'], mult: 0.6 },
  { id: 'mao_d', nome: 'Mão direita', kg: 45, requer: ['braco_d'], mult: 0.6 },
  { id: 'cabeca', nome: 'Cabeça', kg: 180, requer: ['tenis_e', 'tenis_d', 'perna_e', 'perna_d', 'tronco_baixo', 'tronco_cima', 'braco_e', 'braco_d', 'mao_e', 'mao_d'], mult: 3.0 },
];
for (const pc of ESTATUA_PECAS) SUCATA['estatua_' + pc.id] = { nome: 'Peça da estátua: ' + pc.nome, kg: pc.kg, L: Math.round(pc.kg * 0.5), rar: 'lendário', valor: 0, zona: null, peso: 0, estatua: pc.id };

// ---------------- MISSÕES RÁPIDAS ----------------
// Sempre 3 ativas; completam sozinhas e pagam na hora. O prêmio cresce a cada missão concluída.
export const MISSOES = [
  { id: 'pneu', tipo: 'coletar', item: 'pneu', n: [1, 2], base: 90, txt: 'Pegue {n} pneu(s) no fundo do lago' },
  { id: 'lata', tipo: 'coletar', item: 'lata', n: [2, 4], base: 55, txt: 'Pegue {n} latas no fundo do lago' },
  { id: 'garrafa', tipo: 'coletar', item: 'garrafa', n: [1, 3], base: 55, txt: 'Pegue {n} garrafa(s) de vidro no fundo' },
  { id: 'cano', tipo: 'coletar', item: 'cano', n: [1, 2], base: 85, txt: 'Pegue {n} cano(s) de cobre' },
  { id: 'corrente', tipo: 'coletar', item: 'corrente', n: [1, 1], base: 110, txt: 'Pegue uma corrente enferrujada' },
  { id: 'sucata', tipo: 'coletar', item: null, n: [3, 6], base: 100, txt: 'Recolha {n} sucatas com a garra' },
  { id: 'lixo', tipo: 'catar', n: [3, 6], base: 60, txt: 'Cate {n} lixos na margem' },
  { id: 'peixe', tipo: 'pescar', n: [1, 3], base: 80, txt: 'Pesque {n} peixe(s)' },
  { id: 'vender', tipo: 'vender', n: [3, 6], base: 70, txt: 'Venda {n} itens' },
  { id: 'fundo', tipo: 'fundo', n: [30, 90], base: 120, txt: 'Desça com o submarino até {n} m' },
  { id: 'acerto', tipo: 'acertar', n: [1, 2], base: 120, txt: 'Acerte um amigo {n} vez(es) (peixe, tinta ou tiro)', multi: true },
];
