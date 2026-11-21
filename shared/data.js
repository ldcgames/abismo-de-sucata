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
  lata:            { nome: 'Lata amassada', kg: 0.3, L: 1, rar: 'comum', valor: 6, recicla: { metal: 1 }, zona: [0, 150], peso: 10 },
  garrafa:         { nome: 'Garrafa antiga', kg: 0.6, L: 1.5, rar: 'comum', valor: 7, recicla: { vidro: 1 }, zona: [0, 150], peso: 8 },
  pneu:            { nome: 'Pneu velho', kg: 9, L: 40, rar: 'comum', valor: 22, recicla: { borracha: 3 }, zona: [0, 500], peso: 7 },
  cano:            { nome: 'Cano de cobre', kg: 6, L: 12, rar: 'comum', valor: 18, recicla: { metal: 1, cobre: 2 }, zona: [0, 500], peso: 7 },
  corrente:        { nome: 'Corrente enferrujada', kg: 14, L: 10, rar: 'comum', valor: 30, recicla: { metal: 4 }, zona: [25, 700], peso: 6 },
  bateria_velha:   { nome: 'Bateria velha', kg: 12, L: 8, rar: 'comum', valor: 28, recicla: { metal: 1, cobre: 2, eletronica: 1 }, zona: [25, 700], peso: 5 },
  radio:           { nome: 'Rádio valvulado', kg: 3, L: 8, rar: 'incomum', valor: 45, recicla: { eletronica: 2, metal: 1 }, restaura: 'radio_ok', zona: [55, 900], peso: 4 },
  caixa_ferramentas: { nome: 'Caixa de ferramentas', kg: 8, L: 18, rar: 'incomum', valor: 60, recicla: { metal: 3 }, restaura: 'ferramentas_ok', zona: [55, 900], peso: 4 },
  helice:          { nome: 'Hélice de barco', kg: 18, L: 25, rar: 'incomum', valor: 55, recicla: { metal: 4, cobre: 2 }, zona: [75, 1200], peso: 4 },
  motor_popa:      { nome: 'Motor de popa', kg: 35, L: 60, rar: 'incomum', valor: 90, recicla: { metal: 6, cobre: 2, borracha: 1 }, restaura: 'motor_ok', zona: [90, 1500], peso: 3 },
  ancora:          { nome: 'Âncora', kg: 60, L: 40, rar: 'incomum', valor: 110, recicla: { metal: 10 }, zona: [300, 1500], peso: 3 },
  sino_navio:      { nome: 'Sino de navio', kg: 25, L: 20, rar: 'raro', valor: 260, recicla: { metal: 3, cobre: 6 }, restaura: 'sino_polido', zona: [450, 2500], peso: 2 },
  cofre:           { nome: 'Cofre lacrado', kg: 80, L: 50, rar: 'raro', valor: 400, recicla: { metal: 14 }, restaura: 'cofre_aberto', zona: [500, 4300], peso: 2 },
  minerio:         { nome: 'Minério de cobalto', kg: 20, L: 10, rar: 'incomum', valor: 150, recicla: { metal: 2, cristal: 1 }, zona: [500, 4300], peso: 4 },
  sonda:           { nome: 'Sonda antiga', kg: 40, L: 45, rar: 'raro', valor: 700, recicla: { eletronica: 6, metal: 4 }, restaura: 'sonda_ok', zona: [1400, 4500], peso: 2 },
  cristal:         { nome: 'Cristal abissal', kg: 6, L: 6, rar: 'raro', valor: 900, recicla: { cristal: 4 }, zona: [1400, 4500], peso: 3 },
  reliquia:        { nome: 'Relíquia do Abismo', kg: 15, L: 15, rar: 'lendário', valor: 3500, recicla: { cristal: 12 }, restaura: 'reliquia_viva', zona: [3950, 5000], peso: 2 },
  // lixo espalhado na margem (catado a pé, vai para o saco de recicláveis)
  garrafa_pet:     { nome: 'Garrafa PET', kg: 0.05, L: 2, rar: 'comum', valor: 4, recicla: { borracha: 1 }, zona: null, peso: 0, terra: true },
  latinha:         { nome: 'Latinha de refrigerante', kg: 0.02, L: 0.5, rar: 'comum', valor: 3, recicla: { metal: 1 }, zona: null, peso: 0, terra: true },
  sacola:          { nome: 'Sacola plástica', kg: 0.01, L: 0.5, rar: 'comum', valor: 2, zona: null, peso: 0, terra: true },
  saco_lixo:       { nome: 'Saco de lixo', kg: 2, L: 20, rar: 'comum', valor: 7, recicla: { borracha: 1 }, zona: null, peso: 0, terra: true },
  vidro_quebrado:  { nome: 'Pote de vidro', kg: 0.3, L: 1, rar: 'comum', valor: 5, recicla: { vidro: 1 }, zona: null, peso: 0, terra: true },
  // itens especiais (só por contrato/evento)
  caixa_preta:     { nome: 'Caixa-preta', kg: 10, L: 12, rar: 'raro', valor: 120, recicla: { eletronica: 3 }, zona: null, peso: 0 },
  ancora_gigante:  { nome: 'Âncora gigante', kg: 320, L: 200, rar: 'raro', valor: 950, recicla: { metal: 45 }, zona: null, peso: 0, coop: true },
  // itens restaurados (só via bancada de restauro)
  radio_ok:        { nome: 'Rádio restaurado', kg: 3, L: 8, rar: 'incomum', valor: 140, restaurado: true },
  ferramentas_ok:  { nome: 'Jogo de ferramentas', kg: 8, L: 18, rar: 'incomum', valor: 190, restaurado: true },
  motor_ok:        { nome: 'Motor de popa revisado', kg: 35, L: 60, rar: 'raro', valor: 320, restaurado: true },
  sino_polido:     { nome: 'Sino de navio polido', kg: 25, L: 20, rar: 'raro', valor: 650, restaurado: true },
  cofre_aberto:    { nome: 'Cofre aberto (moedas antigas)', kg: 80, L: 50, rar: 'raro', valor: 1150, restaurado: true },
  sonda_ok:        { nome: 'Sonda recuperada', kg: 40, L: 45, rar: 'raro', valor: 1600, restaurado: true },
  reliquia_viva:   { nome: 'Relíquia desperta', kg: 15, L: 15, rar: 'lendário', valor: 9000, restaurado: true },
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
  tetra:     { nome: 'Tetra-de-vidro', cm: [3, 6], prof: [0, 6], hora: 'dia', chance: 14, valor: 12, cor: [0.55, 0.85, 0.95], forca: 0.3, forma: 'peixe', cardume: true },
  barrigudo: { nome: 'Barrigudinho-do-lago', cm: [3, 8], prof: [0, 8], hora: 'qualquer', chance: 14, valor: 10, cor: [0.95, 0.6, 0.25], forca: 0.3, forma: 'peixe', cardume: true },
  lambari:   { nome: 'Lambari', cm: [7, 14], prof: [0, 12], hora: 'dia', chance: 18, valor: 9, cor: [0.8, 0.82, 0.78], forca: 0.5, forma: 'peixe', cardume: true },
  tilapia:   { nome: 'Tilápia', cm: [15, 45], prof: [1, 20], hora: 'dia', chance: 14, valor: 28, cor: [0.55, 0.6, 0.55], forca: 1.2, forma: 'peixe' },
  tucunare:  { nome: 'Tucunaré', cm: [25, 75], prof: [2, 30], hora: 'dia', chance: 9, valor: 65, cor: [0.85, 0.75, 0.25], forca: 2.2, forma: 'peixe' },
  carpa:     { nome: 'Carpa-espelho', cm: [30, 90], prof: [2, 35], hora: 'qualquer', chance: 8, valor: 55, cor: [0.75, 0.55, 0.3], forca: 2.0, forma: 'peixe' },
  bagre:     { nome: 'Bagre-do-lodo', cm: [30, 110], prof: [4, 60], hora: 'noite', chance: 10, valor: 75, cor: [0.35, 0.33, 0.3], forca: 2.6, forma: 'bagre' },
  lula:      { nome: 'Lula-de-lago', cm: [25, 60], prof: [6, 80], hora: 'noite', chance: 12, valor: 40, cor: [0.85, 0.45, 0.55], forca: 1.6, forma: 'lula', tinta: true },
  enguia:    { nome: 'Enguia-elétrica', cm: [60, 150], prof: [8, 80], hora: 'noite', chance: 4, valor: 190, cor: [0.25, 0.3, 0.22], forca: 3.2, forma: 'enguia' },
  pirarucu:  { nome: 'Pirarucu', cm: [120, 250], prof: [10, 80], hora: 'dia', chance: 3, valor: 480, cor: [0.4, 0.35, 0.3], forca: 5.5, forma: 'peixe' },
  tubarao:   { nome: 'Tubarão-touro-do-lago', cm: [250, 420], prof: [25, 150], hora: 'noite', chance: 2.2, valor: 1900, cor: [0.42, 0.46, 0.5], forca: 9, forma: 'tubarao', pesado: true },
};
// massa aproximada (kg) a partir do comprimento
export function massaPeixe(esp, cm) {
  const k = { peixe: 0.000012, bagre: 0.000011, lula: 0.000009, enguia: 0.000003, tubarao: 0.0000095 }[ESPECIES[esp].forma] || 0.000012;
  return Math.max(0.005, k * cm ** 3);
}
export function valorPeixe(esp, cm) {
  const e = ESPECIES[esp];
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
  restauro:   { nome: 'Bancada de restauro', custo: { dinheiro: 600, comps: { metal: 6 } }, desc: 'Restaura sucata em itens valiosos.' },
  iluminacao: { nome: 'Iluminação da estação', custo: { dinheiro: 150, comps: { cobre: 2 } }, desc: 'Postes e luzes no cais.' },
  carregador: { nome: 'Carregador rápido', custo: { dinheiro: 800, comps: { cobre: 6 } }, desc: 'Recarrega a bateria 3× mais rápido no cais.' },
  decoracao:  { nome: 'Decoração (bandeiras e plantas)', custo: { dinheiro: 120, comps: {} }, desc: 'Deixa a estação com a sua cara.' },
};
export const DEPOSITO = [
  { vagas: 12, custo: null },
  { vagas: 30, custo: { dinheiro: 300, comps: { metal: 4 } } },
  { vagas: 80, custo: { dinheiro: 1500, comps: { metal: 12 } } },
];
export const EXTRAS = {
  lancador: { nome: 'Lançador de balões (escotilha)', custo: { dinheiro: 150, comps: { borracha: 2 } }, desc: 'Braço externo que arremessa balões de tinta.' },
  luvas:    { nome: 'Luvas hidráulicas', custo: { dinheiro: 2500, comps: { metal: 10 } }, desc: 'Permitem segurar e arremessar um tubarão (brincadeira).' },
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
export const LIXO = { tipos: ['garrafa_pet', 'garrafa_pet', 'garrafa_pet', 'latinha', 'latinha', 'saco_lixo', 'saco_lixo', 'sacola', 'vidro_quebrado'], quantidade: 90, saco: 15, respawnMin: 2, respawnMax: 4 };

// ---------------- ARMAS (barraca de armas, ao lado da casinha de tinta) ----------------
// Cada tiro derruba o alvo (como o peixe) e o empurra para longe. Compra em ordem: pistola → … → bazuca.
// stunMs: tempo no chão; empurrao: velocidade horizontal (m/s) e salto (m/s) aplicados no alvo.
export const ARMAS = {
  pistola:      { nome: 'Pistola', preco: 900, requer: null, alcance: 45, cdMs: 420, stunMs: 2000, empurrao: [3, 2.5], dispersao: 0.012, municao: { n: 12, preco: 20 }, ordem: 1 },
  metralhadora: { nome: 'Submetralhadora', preco: 3500, requer: 'pistola', alcance: 45, cdMs: 110, stunMs: 3000, empurrao: [4.5, 3], dispersao: 0.035, municao: { n: 40, preco: 45 }, ordem: 2, auto: true },
  fuzil:        { nome: 'Fuzil', preco: 9000, requer: 'metralhadora', alcance: 85, cdMs: 170, stunMs: 4000, empurrao: [7, 4], dispersao: 0.016, municao: { n: 30, preco: 80 }, ordem: 3, auto: true },
  sniper:       { nome: 'Sniper', preco: 20000, requer: 'fuzil', alcance: 220, cdMs: 1400, stunMs: 5500, empurrao: [11, 6], dispersao: 0, municao: { n: 5, preco: 90 }, ordem: 4, mira: true },
  bazuca:       { nome: 'Bazuca', preco: 45000, requer: 'sniper', alcance: 110, cdMs: 2600, stunMs: 7000, empurrao: [16, 11], dispersao: 0, municao: { n: 1, preco: 180 }, ordem: 5, foguete: true, raio: 4.5, velocidade: 38 },
};
export const ARMAS_ORDEM = ['pistola', 'metralhadora', 'fuzil', 'sniper', 'bazuca'];
export const MUNICAO_MAX = { pistola: 120, metralhadora: 400, fuzil: 300, sniper: 40, bazuca: 12 };

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
