// Testes de regras (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../shared/room.js';
import { newProfile, subStats, sortearPeixe, cabeNoAquario, migrateProfile } from '../shared/rules.js';
import { navSDF, terrainHeight, STATIONS, SHAFT_C, CAVES, stationById, LAKE_R } from '../shared/world.js';
import { SUCATA, TROLL, AQUARIOS, VARA, TANQUES, valorPeixeItem } from '../shared/data.js';

const T0 = 1_000_000;
// perfis de teste com nome e cor diferentes (a sala não aceita repetidos)
let kp = 0;
const np = (id, nome) => { const p = newProfile(id, nome || 'J' + id); p.cor = kp++ % 6; return p; };
function mkRoom() { let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); return new Room({ code: 'TESTE1', seed: 3, now: T0, rnd }); }
function noSub(room, slot) {
  const pl = room.players.get(slot); const st = stationById(slot);
  pl.modo = 'sub'; pl.sub.pos = [st.launch[0], -0.5, st.launch[1]];
  return pl;
}

test('geografia: água no lago, terra na margem, fenda navegável até 4.300 m', () => {
  assert.ok(terrainHeight(0, 41) < -30, 'bacia funda');
  for (const s of STATIONS) assert.ok(terrainHeight(s.pad[0], s.pad[1]) > 0.8, 'estação em terra ' + s.id);
  for (const s of STATIONS) assert.ok(terrainHeight(s.launch[0], s.launch[1]) < -2, 'ponto de lançamento com água ' + s.id);
  assert.ok(navSDF(SHAFT_C.x, -2000, SHAFT_C.z) > 12, 'fenda aberta a 2.000 m');
  assert.ok(navSDF(SHAFT_C.x, -4200, SHAFT_C.z) > 20, 'câmara a 4.200 m');
  assert.ok(navSDF(SHAFT_C.x, -4310, SHAFT_C.z) < 0, 'fundo sólido');
  assert.ok(navSDF(SHAFT_C.x + 45, -2000, SHAFT_C.z) < 0, 'parede da fenda é sólida');
  for (const c of CAVES) assert.ok(navSDF(...c.b) > 2, 'caverna navegável ' + c.id);
});

test('sala: 5 jogadores em estações vizinhas, 6º é recusado; reconexão mantém vaga; cor e nome únicos', () => {
  const r = mkRoom();
  const ids = ['a', 'b', 'c', 'd', 'e'].map((x) => r.join(np(x), 'N', T0));
  assert.deepEqual(ids.map((x) => x.slot), ['N', 'L', 'SE', 'SO', 'O'], 'ocupadas em sequência (vizinhas)');
  const sexto = r.join(np('f'), 'N', T0);
  assert.equal(sexto.ok, false); assert.match(sexto.msg, /cheia/);
  r.leave('N', T0 + 10);
  const volta = r.join(r.players.get('N').profile, 'SE', T0 + 20);
  assert.equal(volta.slot, 'N'); assert.equal(volta.reconectou, true);
  // cor repetida / nome repetido
  const r2 = mkRoom(); const a = np('x', 'Ana'); a.cor = 1; r2.join(a, 'N', T0);
  const b = np('y', 'Beto'); b.cor = 1;
  const rb = r2.join(b, 'N', T0); assert.equal(rb.ok, false); assert.equal(rb.codigo, 'cor_repetida'); assert.match(rb.msg, /Alguém já está com essa cor/);
  const c = np('z', 'ana'); c.cor = 2;
  const rc = r2.join(c, 'N', T0); assert.equal(rc.ok, false); assert.equal(rc.codigo, 'nome_repetido');
  // duas pessoas: estações vizinhas (72° de distância)
  const [s0, s1] = [STATIONS[0], STATIONS[1]];
  assert.ok(Math.abs(Math.abs(s1.ang - s0.ang) - (2 * Math.PI) / 5) < 1e-9);
});

test('vender retira exatamente 1 item e soma o valor; replay com mesmo aid não duplica', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = noSub(r, 'N'); const p = pl.profile;
  p.carga.push({ uid: 'x1', tipo: 'pneu' }, { uid: 'x2', tipo: 'pneu' });
  const d0 = p.dinheiro;
  const a = { tipo: 'vender', uid: 'x1', aid: 'acao-1' };
  assert.equal(r.action('N', a, T0).res.ok, true);
  assert.equal(r.action('N', a, T0).res.dup, true);
  assert.equal(p.dinheiro, d0 + SUCATA.pneu.valor);
  assert.equal(p.carga.length, 1);
});

test('coletar: precisa do sub, alcance, capacidade; item some para todos', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0);
  const pl = r.players.get('N');
  const it = Object.values(r.world.items).find((i) => i.tipo === 'lata');
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, false, 'a pé não coleta');
  pl.modo = 'sub'; pl.sub.pos = [it.x + 30, it.y + 2, it.z];
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, false, 'longe');
  pl.sub.pos = [it.x + 2, it.y + 1.5, it.z];
  const ok = r.action('N', { tipo: 'coletar', item: it.id }, T0);
  assert.equal(ok.res.ok, true);
  assert.ok(!r.world.items[it.id]);
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, false, 'não coleta 2x');
});

test('âncora gigante exige dois submarinos (cooperativo)', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const it = r.world.items.ancora_gigante_fixa;
  const a = r.players.get('N'), b = r.players.get('L');
  a.modo = 'sub'; a.sub.pos = [it.x + 2, it.y + 1.5, it.z];
  a.profile.sub.braco = 4; // 600 kg sozinho? não: testamos com nível 3
  a.profile.sub.braco = 3;
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, false);
  b.modo = 'sub'; b.sub.pos = [it.x - 3, it.y + 1.5, it.z]; b.profile.sub.braco = 3;
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, true);
});

test('aquário nano: aceita 1 peixe pequeno, recusa o 2º e qualquer maior que 12 cm', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  p.mao = { uid: 'f1', esp: 'tetra', cm: 5 };
  assert.equal(r.action('N', { tipo: 'peixe_aquario' }, T0).res.ok, true);
  assert.equal(p.vitrine.peixes.length, 1);
  p.mao = { uid: 'f2', esp: 'barrigudo', cm: 4 };
  const r2 = r.action('N', { tipo: 'peixe_aquario' }, T0).res;
  assert.equal(r2.ok, false); assert.match(r2.msg, /\[1\/1\]/);
  p.vitrine.peixes = [];
  p.mao = { uid: 'f3', esp: 'lambari', cm: 13 };
  assert.equal(r.action('N', { tipo: 'peixe_aquario' }, T0).res.ok, false);
  assert.ok(p.mao, 'peixe continua na mão');
});

test('casco melhorado muda a profundidade máxima real', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = noSub(r, 'N'); const p = pl.profile;
  assert.equal(subStats(p).maxProf, 120);
  p.dinheiro = 5000; p.comps.metal = 0; // o submarino melhora só com dinheiro
  const res = r.action('N', { tipo: 'comprar', cat: 'sub', chave: 'casco' }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(subStats(p).maxProf, 560);
  assert.equal(p.dinheiro, 5000 - 1650); assert.equal(p.comps.metal, 0); // só dinheiro (preço triplicado)
});

test('vara melhorada captura o que a inicial não consegue', () => {
  const p = np('a');
  let grande = null, rnd = (() => { let s = 11; return () => ((s = (s * 48271) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 400 && !grande; i++) { const s = sortearPeixe(p, { x: 0, z: 62, linha: 8 }, 12, rnd); if (s && s.cm > 35) grande = s; }
  assert.ok(grande, 'peixes maiores mordem a isca da vara inicial');
  const r = mkRoom(); r.join(p, 'N', T0); const pl = r.players.get('N');
  pl.pesca = { sid: 's1', peixe: grande, mordida: T0 };
  const fr = r.action('N', { tipo: 'pesca_puxar', sid: 's1', resultado: 'ok' }, T0 + 20000).res;
  assert.equal(fr.ok, false); assert.match(fr.msg, /arrebentou/);
  p.vara = 5; // vara de carbono
  pl.pesca = { sid: 's2', peixe: grande, mordida: T0 };
  const ok = r.action('N', { tipo: 'pesca_puxar', sid: 's2', resultado: 'ok' }, T0 + 20000).res;
  assert.equal(ok.ok, true, ok.msg); assert.equal(p.mao.cm, grande.cm);
});

test('lula → bancada → 2 balões → acerto no vidro → tinta até emergir (nunca por tempo)', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  A.profile.estacao.tinta = true; A.profile.extras.lancador = true;
  A.profile.mao = { uid: 'l1', esp: 'lula', cm: 40 };
  assert.equal(r.action('N', { tipo: 'processar_lula' }, T0).res.ok, true);
  assert.equal(A.profile.baloes, 3); assert.equal(A.profile.mao, null); // começa com 1 + 2
  // ambos submersos, A atrás de B mirando no vidro frontal de B (B olha para -z)
  A.modo = 'sub'; B.modo = 'sub';
  B.sub.pos = [20, -40, 40]; B.sub.rot = Math.PI; // proa para -z
  A.sub.pos = [20, -40.6, 25];
  const dir = [0, 0, 1];
  // B olha para A: vidro em z = 100 - 2.15
  const ra = r.action('N', { tipo: 'arremessar_balao', dir }, T0).res;
  assert.equal(ra.ok, true, ra.msg);
  let hit = null;
  for (let k = 0; k < 120 && !hit; k++) { const ev = r.tick(T0 + k * 50, 0.05); hit = ev.find((e) => e.t === 'tinta'); }
  assert.ok(hit && hit.on && hit.alvo === 'L', 'tinta aplicada no sub de B');
  assert.equal(B.tinta, true);
  // passa muito tempo submerso: continua sujo
  r.setState('L', { pos: B.pos, modo: 'sub', sub: { pos: [20, -60, 40], rot: Math.PI } }, T0 + 600000);
  assert.equal(B.tinta, true);
  // cooldown impede spam
  assert.equal(r.action('N', { tipo: 'arremessar_balao', dir }, T0 + 1000).res.ok, false);
  // emergiu: limpa
  const ev = r.setState('L', { pos: B.pos, modo: 'sub', sub: { pos: [20, -0.3, 40], rot: Math.PI } }, T0 + 600100);
  assert.ok(ev.find((e) => e.t === 'tinta' && e.on === false));
  assert.equal(B.tinta, false);
});

test('peixe arremessado: 3 s de atordoamento, some do inventário, sem duplicar; tubarão 7 s', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  const st = stationById('N');
  A.pos = [st.pad[0], 1.5, st.pad[1]]; B.pos = [st.pad[0] + 10, 1.5, st.pad[1]];
  A.profile.mao = { uid: 'p1', esp: 'tilapia', cm: 30 };
  const res = r.action('N', { tipo: 'arremessar_peixe', dir: [1, 0.05, 0], aid: 'thr1' }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(A.profile.mao, null);
  assert.equal(r.action('N', { tipo: 'arremessar_peixe', dir: [1, 0.05, 0], aid: 'thr1' }, T0).res.dup, true);
  let at = null;
  for (let k = 0; k < 80 && !at; k++) { const ev = r.tick(T0 + k * 50, 0.05); at = ev.find((e) => e.t === 'atordoado'); }
  assert.ok(at); assert.equal(at.ms, TROLL.peixeStunMs); assert.equal(at.alvo, 'L');
  assert.equal(r.world.projeteis.length, 0, 'projétil removido');
  // tubarão
  A.profile.extras.luvas = true; A.profile.mao = { uid: 't1', esp: 'tubarao', cm: 300 };
  B.imuneUntil = 0; B.pos = [st.pad[0] + 8, 1.5, st.pad[1]];
  const rt = r.action('N', { tipo: 'arremessar_peixe', dir: [1, 0.1, 0] }, T0 + 60000).res;
  assert.equal(rt.ok, true, rt.msg);
  at = null;
  for (let k = 0; k < 80 && !at; k++) { const ev = r.tick(T0 + 60000 + k * 50, 0.05); at = ev.find((e) => e.t === 'atordoado'); }
  assert.ok(at && at.tubarao); assert.equal(at.ms, 7000);
});

test('alvo na água não é atingido por peixe', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L'); const st = stationById('N');
  A.pos = [st.pad[0], 1.5, st.pad[1]]; B.pos = [st.pad[0] + 8, 0, st.pad[1]]; B.modo = 'nadando';
  A.profile.mao = { uid: 'p1', esp: 'tilapia', cm: 30 };
  r.action('N', { tipo: 'arremessar_peixe', dir: [1, 0.05, 0] }, T0);
  let at = null;
  for (let k = 0; k < 80; k++) { const ev = r.tick(T0 + k * 50, 0.05); at = at || ev.find((e) => e.t === 'atordoado'); }
  assert.ok(!at);
});

test('mochila: até 5 peixes e no máximo 10 bolsas; sub começa com limite de 5 objetos', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  assert.equal(p.baloes, 1); assert.equal(p.extras.lancador, true); assert.equal(p.estacao.tinta, true);
  for (let k = 1; k <= 5; k++) { p.mao = { uid: 'f' + k, esp: 'tilapia', cm: 20 + k }; assert.equal(r.action('N', { tipo: 'mochila_guardar' }, T0).res.ok, true); }
  assert.equal(p.mochila.length, 5);
  p.mao = { uid: 'f6', esp: 'tilapia', cm: 20 };
  const cheia = r.action('N', { tipo: 'mochila_guardar' }, T0).res; assert.equal(cheia.ok, false); assert.match(cheia.msg, /Mochila cheia \(5\/5/);
  p.mao = null; assert.equal(r.action('N', { tipo: 'mochila_tirar', uid: 'f2' }, T0).res.ok, true); assert.equal(p.mao.uid, 'f2'); assert.equal(p.mochila.length, 4);
  // vende direto da mochila; do aquário só depois de tirar
  const st = stationById('N'); pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]];
  const d0 = p.dinheiro;
  assert.equal(r.action('N', { tipo: 'peixe_vender', uid: 'f3' }, T0).res.ok, true); assert.ok(p.dinheiro > d0); assert.equal(p.mochila.length, 3);
  p.vitrine.peixes.push({ uid: 'aq1', esp: 'lambari', cm: 8 });
  assert.match(r.action('N', { tipo: 'peixe_vender', uid: 'aq1' }, T0).res.msg, /aquário/, 'do aquário não vende direto'); assert.equal(p.vitrine.peixes.length, 1);
  p.mao = null; assert.equal(r.action('N', { tipo: 'aquario_retirar', uid: 'aq1' }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'peixe_vender' }, T0).res.ok, true, 'tirou e vendeu'); assert.equal(p.vitrine.peixes.length, 0);
  p.mao = null;
  p.baloes = 9; p.mao = { uid: 'l', esp: 'lula', cm: 30 };
  assert.equal(r.action('N', { tipo: 'processar_lula' }, T0).res.ok, true); assert.equal(p.baloes, 10);
  p.mao = { uid: 'l2', esp: 'lula', cm: 30 };
  assert.equal(r.action('N', { tipo: 'processar_lula' }, T0).res.ok, false);
  // limite de 5 objetos
  pl.modo = 'sub';
  for (let k = 0; k < 5; k++) p.carga.push({ uid: 'c' + k, tipo: 'lata' });
  const it = Object.values(r.world.items).find((i) => i.tipo === 'lata');
  pl.sub.pos = [it.x + 1, it.y + 1, it.z];
  const res = r.action('N', { tipo: 'coletar', item: it.id }, T0).res;
  assert.equal(res.ok, false); assert.match(res.msg, /5\/5 objetos/);
});

test('migração de perfil antigo preenche campos novos', () => {
  const p = migrateProfile({ id: 'x', nome: 'Velho', dinheiro: 50, sub: { casco: 2 } });
  assert.equal(p.sub.casco, 2); assert.equal(p.sub.carga, 1); assert.ok(Array.isArray(p.recentes));
});

// ---------------- v0.5: lixo da margem, armas, estátua ----------------
import { ARMAS, ESTATUA_PECAS } from '../shared/data.js';
import { multDinheiro, landTrashSpot, premioMissao, progresso } from '../shared/rules.js';
import { ESTATUA } from '../shared/world.js';

test('lixo da margem: cata a pé (perto), fica na mão, E guarda no saco e vende com o multiplicador', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  const it = Object.values(r.world.items).find((x) => x.tipo === 'garrafa_pet');
  assert.ok(it, 'há garrafas PET na margem');
  assert.ok(it.y > 0, 'o lixo fica fora da água');
  pl.modo = 'terra'; pl.pos = [it.x + 6, it.y, it.z];
  assert.equal(r.action('N', { tipo: 'catar', item: it.id }, T0).res.ok, false, 'longe demais');
  pl.pos = [it.x + 1, it.y, it.z];
  const res = r.action('N', { tipo: 'catar', item: it.id }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(p.lixoMao?.tipo, 'garrafa_pet', 'com as mãos livres o lixo fica na mão'); assert.ok(!r.world.items[it.id], 'some do mundo para todos');
  assert.equal(r.action('N', { tipo: 'lixo_guardar' }, T0).res.ok, true);
  assert.equal(p.saco.length, 1); assert.equal(p.lixoMao, null);
  // vender na estação
  const st = STATIONS.find((s) => s.id === 'N'); pl.pos = [st.pad[0], 1.6, st.pad[1]];
  const d0 = p.dinheiro;
  assert.equal(r.action('N', { tipo: 'vender_saco' }, T0).res.ok, true);
  assert.equal(p.dinheiro, d0 + SUCATA.garrafa_pet.valor); assert.equal(p.saco.length, 0);
  // respawn programado: outro lixo nasce em poucos segundos em outro lugar
  const rs = r.world.respawn.find((x) => x.terra);
  assert.ok(rs && rs.em - T0 <= 8000 && rs.em - T0 >= 3000, 'reaparece em 3–8 s');
  assert.ok(landTrashSpot(Math.random), 'acha lugar para novo lixo');
});

test('armas: compra em ordem, munição, tiro derruba 2 s (pistola) e empurra; bazuca 7 s e voa longe', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  const st = STATIONS.find((s) => s.id === 'N');
  A.modo = 'terra'; A.pos = [st.pad[0], 1.6, st.pad[1]]; A.profile.dinheiro = 200000;
  assert.equal(r.action('N', { tipo: 'arma_comprar', arma: 'metralhadora' }, T0).res.ok, false, 'precisa da pistola antes');
  assert.match(r.action('N', { tipo: 'arma_comprar', arma: 'pistola' }, T0).res.msg, /Estilingue/, 'a pistola pede o estilingue antes');
  for (const k of ['estilingue', 'pistola', 'metralhadora', 'fuzil', 'sniper', 'bazuca']) assert.equal(r.action('N', { tipo: 'arma_comprar', arma: k }, T0).res.ok, true, k);
  assert.equal(A.profile.dinheiro, 200000 - 400 - 900 - 3500 - 9000 - 20000 - 45000);
  const m0 = A.profile.municao.pistola;
  assert.equal(r.action('N', { tipo: 'municao_comprar', arma: 'pistola' }, T0).res.ok, true);
  assert.equal(A.profile.municao.pistola, m0 + 12);
  // alvo a 10 m à frente, a pé
  B.modo = 'terra'; B.pos = [A.pos[0] + 10, A.pos[1], A.pos[2]];
  const tiro = r.action('N', { tipo: 'atirar', arma: 'pistola', dir: [1, 0, 0] }, T0).res;
  assert.equal(tiro.ok, true, tiro.msg);
  const at = tiro.events.find((e) => e.t === 'atordoado');
  assert.ok(at, 'acertou'); assert.equal(at.ms, 2000); assert.ok(at.empurrao[0] > 0 && at.empurrao[0] < 4, 'pistola empurra pouco');
  assert.equal(A.profile.municao.pistola, m0 + 11);
  // imunidade curta depois do tiro (ninguém fica preso no chão)
  B.stunUntil = 0; B.imuneUntil = 0;
  // bazuca: foguete explode no alvo
  const T1 = T0 + 10000;
  const bz = r.action('N', { tipo: 'atirar', arma: 'bazuca', dir: [1, 0, 0] }, T1).res;
  assert.equal(bz.ok, true, bz.msg);
  let ev = [];
  for (let k = 0; k < 40 && !ev.some((e) => e.t === 'atordoado'); k++) ev.push(...r.tick(T1 + k * 50, 0.05));
  const ex = ev.find((e) => e.t === 'atordoado' && e.alvo === 'L');
  assert.ok(ex, 'explosão atinge o alvo'); assert.equal(ex.ms, 7000);
  assert.ok(Math.hypot(ex.empurrao[0], ex.empurrao[2]) > 9, 'bazuca arremessa longe');
  assert.equal(r.action('N', { tipo: 'atirar', arma: 'bazuca', dir: [1, 0, 0] }, T1 + 100).res.ok, false, 'recarga da bazuca');
});

test('estátua: peças em ordem, guardar a que não encaixa, multiplicador até 10× e estátua completa', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  const pecas = Object.values(r.world.items).filter((x) => x.pessoal);
  assert.equal(pecas.length, 11, '11 peças (2 tênis, 2 pernas, 2 troncos, 2 braços, 2 mãos, cabeça)');
  assert.ok(pecas.every((x) => x.y < -300), 'nenhuma perto da superfície');
  assert.ok(r.world.items.estatua_cabeca.y < -4200, 'a cabeça fica no final');
  pl.modo = 'terra'; pl.pos = [ESTATUA.x + 3, 1.6, ESTATUA.z];
  // perna sem tênis: não encaixa
  p.deposito.push({ uid: 'x1', tipo: 'estatua_perna_e' });
  const r1 = r.action('N', { tipo: 'estatua_colocar' }, T0).res;
  assert.equal(r1.ok, false); assert.match(r1.msg, /Tênis esquerdo/);
  p.carga.push({ uid: 'x2', tipo: 'estatua_tenis_e' });
  const r2 = r.action('N', { tipo: 'estatua_colocar' }, T0).res;
  assert.equal(r2.ok, true, r2.msg); assert.deepEqual(p.estatua.colocadas, ['tenis_e', 'perna_e']);
  assert.equal(multDinheiro(p), 2.2);
  for (const pc of ESTATUA_PECAS) if (!p.estatua.colocadas.includes(pc.id)) p.deposito.push({ uid: 'u' + pc.id, tipo: 'estatua_' + pc.id });
  const r3 = r.action('N', { tipo: 'estatua_colocar' }, T0).res;
  assert.equal(r3.ok, true); assert.equal(p.estatua.colocadas.at(-1), 'cabeca', 'a cabeça é a última');
  assert.ok(r3.events[0].completa); assert.equal(multDinheiro(p), 10);
  // peças não se vendem; o resto vende ×10
  const st = STATIONS.find((s) => s.id === 'N'); pl.pos = [st.pad[0], 1.6, st.pad[1]];
  p.carga.push({ uid: 'lt', tipo: 'lata' }); const d0 = p.dinheiro;
  r.action('N', { tipo: 'vender', uid: 'lt' }, T0); assert.equal(p.dinheiro, d0 + SUCATA.lata.valor * 10);
});

test('peça da estátua é pessoal: um jogador pega e continua no mundo para o amigo', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  const it = Object.values(r.world.items).find((x) => x.tipo === 'estatua_tenis_e');
  for (const P of [A, B]) { P.modo = 'sub'; P.sub.pos = [it.x + 1.2, it.y + 1, it.z]; P.profile.sub.braco = 3; P.profile.sub.carga = 3; P.profile.sub.casco = 3; }
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, true);
  assert.ok(r.world.items[it.id], 'continua no mundo');
  assert.equal(r.action('N', { tipo: 'coletar', item: it.id }, T0).res.ok, false, 'não pega duas vezes');
  assert.equal(r.action('L', { tipo: 'coletar', item: it.id }, T0).res.ok, true, 'o amigo também pega a dele');
  A.sub.pos = [0, -5, 0]; B.sub.pos = [5, -5, 0]; // amigos longe (sem ajuda na garra)
  const fraco = np('c'); r.join(fraco, 'SE', T0); const C = r.players.get('SE'); C.modo = 'sub'; C.sub.pos = [it.x + 1.2, it.y + 1, it.z];
  assert.equal(r.action('SE', { tipo: 'coletar', item: it.id }, T0).res.ok, false, 'garra inicial não ergue a peça');
});

test('missões rápidas: sempre 3, completam sozinhas, pagam na hora e são trocadas', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  assert.equal(p.missoes.ativas.length, 3);
  assert.ok(p.missoes.ativas.every((m) => m.premio > 0 && m.n > 0 && m.txt && !m.txt.includes('{n}')));
  // força uma missão de pegar pneu
  p.missoes.ativas = [{ id: 'pneu', tipo: 'coletar', item: 'pneu', n: 1, feito: 0, premio: 90, txt: 'Pegue 1 pneu(s) no fundo do lago' },
    { id: 'peixe', tipo: 'pescar', n: 2, feito: 0, premio: 80, txt: 'Pesque 2 peixe(s)' }, { id: 'lixo', tipo: 'catar', n: 3, feito: 0, premio: 60, txt: 'Cate 3 lixos na margem' }];
  const it = Object.values(r.world.items).find((x) => x.tipo === 'pneu' && x.y > -100);
  pl.modo = 'sub'; pl.sub.pos = [it.x + 1, it.y + 1, it.z]; p.sub.braco = 3; p.sub.carga = 3;
  const d0 = p.dinheiro;
  const res = r.action('N', { tipo: 'coletar', item: it.id }, T0);
  assert.equal(res.res.ok, true, res.res.msg);
  const ok = res.events.find((e) => e.t === 'missao_ok');
  assert.ok(ok, 'missão concluída');
  assert.equal(p.dinheiro, d0 + 90);
  assert.equal(p.missoes.ativas.length, 3, 'nova missão entra no lugar');
  assert.equal(p.missoes.concluidas, 1);
  // profundidade
  p.missoes.ativas[1] = { id: 'fundo', tipo: 'fundo', n: 40, feito: 0, premio: 130, txt: 'Desça com o submarino até 40 m' };
  const ev = r.setState('N', { pos: pl.pos, modo: 'sub', sub: { pos: [it.x, -45, it.z] } }, T0 + 100);
  assert.ok(ev.some((e) => e.t === 'missao_ok'), 'profundidade conta');
  // o prêmio cresce com as missões concluídas
  assert.ok(premioMissao(p, 100) > 100);
});

test('missão de acertar amigo conta quem acertou', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'); A.profile.missoes.ativas[0] = { id: 'acerto', tipo: 'acertar', n: 1, feito: 0, premio: 120, txt: 'Acerte um amigo 1 vez(es)' };
  const d0 = A.profile.dinheiro;
  const ev = r.creditarAcertos([{ t: 'atordoado', alvo: 'L', por: 'N', ms: 2000 }]);
  assert.ok(ev.some((e) => e.t === 'missao_ok')); assert.equal(A.profile.dinheiro, d0 + 120);
});

test('progresso da sala (0–100%) sobe com o submarino, a estátua e as armas', () => {
  const p = np('p');
  assert.equal(progresso(p), 0);
  for (const k of Object.keys(p.sub)) p.sub[k] = 3;
  const a = progresso(p); assert.ok(a > 10 && a < 50, String(a));
  p.estatua.colocadas = ESTATUA_PECAS.map((x) => x.id);
  p.armas = { pistola: true, metralhadora: true, fuzil: true, sniper: true, bazuca: true };
  assert.ok(progresso(p) > 70);
});

import { colidirPedras, PEDRAS_MARGEM, ROCKS, FUNIL, funilAltura, shaftRadius as raioFenda, SHAFT_SEGS as SEGS } from '../shared/world.js';
test('pedras: a pé não atravessa (lago e margem); o submarino também bate nelas', () => {
  const k = PEDRAS_MARGEM.find((x) => x.r > 1.0);
  const p = colidirPedras([k.x + 0.1, k.y, k.z]);
  assert.ok(Math.hypot(p[0] - k.x, p[2] - k.z) >= k.r * 0.9, 'empurrado para fora da pedra da margem');
  const rk = ROCKS[0];
  assert.ok(navSDF(rk.x + rk.r * 1.1, rk.y, rk.z) < 0, 'a saliência visual da pedra do lago também é sólida');
  const q = colidirPedras([rk.x + 0.2, rk.y - rk.r * 0.5, rk.z]);
  assert.ok(Math.hypot(q[0] - rk.x, q[2] - rk.z) >= rk.r, 'nadando também bate');
});
test('funil: o fundo desce sem degraus até a boca da fenda e encosta na parede (sem fresta)', () => {
  // perfis radiais contínuos (sem saltos verticais bruscos entre pontos a 0,5 m)
  for (let a = 0; a < 6.28; a += 0.5) {
    let prev = null;
    for (let d = FUNIL.rBoca + 0.5; d < 72; d += 0.5) {
      const x = SHAFT_C.x + Math.cos(a) * d, z = SHAFT_C.z + Math.sin(a) * d;
      if (Math.hypot(x, z) > LAKE_R - 2) break;
      const h = terrainHeight(x, z);
      if (prev !== null) assert.ok(Math.abs(h - prev) < 4.5, `degrau em ang ${a.toFixed(1)} d ${d}`);
      prev = h;
    }
  }
  // na boca, o funil está na altura do topo da parede, e a parede é um círculo exato
  assert.equal(SEGS[0].yTop, FUNIL.yBoca);
  for (let a = 0; a < 6.28; a += 0.3) assert.ok(Math.abs(raioFenda(SEGS[0], SEGS[0].yTop, a) - FUNIL.rBoca) < 1e-9);
  assert.ok(Math.abs(funilAltura(FUNIL.rBoca) - FUNIL.yBoca) < 1e-9);
  // navegável no centro da boca e sólido logo abaixo do funil
  assert.ok(navSDF(SHAFT_C.x, FUNIL.yBoca - 5, SHAFT_C.z) > 10);
  assert.ok(navSDF(SHAFT_C.x + 45, terrainHeight(SHAFT_C.x + 45, SHAFT_C.z) - 2, SHAFT_C.z) < 0);
});

test('mais varas, aquários e tanques; dá para pular direto para um aquário/vara melhor; migração dos níveis antigos', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  const st = stationById('N'); pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]];
  assert.ok(AQUARIOS.length >= 8 && VARA.length >= 7 && TANQUES.length >= 4);
  assert.ok(AQUARIOS[1].custo.dinheiro <= 50, 'tem aquário baratinho');
  p.dinheiro = 100000;
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'aquario', nivel: 4 }, T0).res.ok, true); assert.equal(p.aquario.nivel, 4);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'aquario', nivel: 2 }, T0).res.ok, true, 'dá para comprar um menor também'); assert.equal(p.vitrine.nivel, 2);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'aquario', nivel: 2 }, T0).res.ok, false, 'não compra o mesmo duas vezes');
  assert.equal(r.action('N', { tipo: 'vitrine_equipar', tipo2: 'aquario', nivel: 4 }, T0).res.ok, true); assert.equal(p.vitrine.nivel, 4);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'vara', nivel: 6 }, T0).res.ok, true); assert.equal(p.vara, 6);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'tanque' }, T0).res.ok, true); assert.equal(p.tanque.nivel, 0);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'tanque' }, T0).res.ok, true); assert.equal(p.tanque.nivel, 1);
  // perfil antigo (v0.7): vara 2 = fibra, aquário 1 = pequeno, tanque 0 = concreto, mochila com 1 peixe
  const velho = migrateProfile({ ...np('v'), inventVer: undefined, vara: 2, aquario: { nivel: 1, peixes: [] }, tanque: { nivel: 0, peixes: [] }, mochila: { uid: 'm', esp: 'tilapia', cm: 20 } });
  assert.equal(VARA[velho.vara - 1].nome, 'Vara de fibra'); assert.equal(AQUARIOS[velho.aquario.nivel].nome, 'Aquário Pequeno'); assert.equal(TANQUES[velho.tanque.nivel].nome, 'Tanque de Concreto');
  assert.deepEqual(velho.mochila.map((f) => f.uid), ['m']);
});

// ---------------- v0.9: estilingue, Kraken, corrida, economia ----------------
import { KRAKEN, CORRIDA, ESPECIES, divisaoCorrida, LIXO } from '../shared/data.js';
import { estacaoParaMundo, BARRACA_CORRIDA, krakenPos } from '../shared/world.js';

test('economia: o dobro de peças no fundo, 100 lixos na margem, peixes e sucata mais caros', () => {
  const r = mkRoom();
  const itens = Object.values(r.world.items);
  assert.ok(itens.filter((x) => SUCATA[x.tipo].zona).length > 320, 'mais de 320 peças no fundo (antes ~165)');
  assert.ok(itens.filter((x) => SUCATA[x.tipo].terra).length >= 95, '~100 lixos na margem');
  assert.ok(ESPECIES.tucunare.valor >= 150 && Object.keys(ESPECIES).length >= 18, 'tucunaré mais caro e mais espécies');
  assert.ok(SUCATA.pneu.valor > 22 && SUCATA.garrafa_pet.valor > 4);
  // pegar uma peça no fundo: outra nasce em segundos
  r.join(np('a'), 'N', T0); const pl = noSub(r, 'N');
  const alvo = itens.find((x) => SUCATA[x.tipo].zona && SUCATA[x.tipo].kg < 20 && Math.hypot(x.x - pl.sub.pos[0], x.z - pl.sub.pos[2]) < 200);
  pl.sub.pos = [alvo.x, alvo.y + 1, alvo.z];
  assert.equal(r.action('N', { tipo: 'coletar', item: alvo.id }, T0).res.ok, true);
  const rs = r.world.respawn.at(-1); assert.ok(rs.em - T0 <= 12000, 'reaparece em até 12 s');
  const n0 = Object.keys(r.world.items).length;
  const ev = r.tick(T0 + 13000, 0.05);
  assert.ok(ev.some((e) => e.t === 'item_novo') && Object.keys(r.world.items).length === n0 + 1, 'nasceu outra peça');
});

test('estilingue de lixo: 400, Q joga o lixo da mão ou do saco, derruba só 1 s', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L'); const st = STATIONS.find((s) => s.id === 'N');
  A.modo = 'terra'; A.pos = [st.pad[0], 1.6, st.pad[1]];
  A.profile.lixoMao = { uid: 'l1', tipo: 'latinha' };
  assert.match(r.action('N', { tipo: 'estilingue_atirar', dir: [1, 0, 0] }, T0).res.msg, /Estilingue/, 'precisa comprar');
  A.profile.dinheiro = 1000;
  assert.equal(r.action('N', { tipo: 'arma_comprar', arma: 'estilingue' }, T0).res.ok, true);
  assert.equal(A.profile.dinheiro, 600);
  assert.equal(r.action('N', { tipo: 'municao_comprar', arma: 'estilingue' }, T0).res.ok, false, 'não tem bala: usa lixo');
  B.modo = 'terra'; B.pos = [A.pos[0] + 9, A.pos[1], A.pos[2]];
  const tiro = r.action('N', { tipo: 'estilingue_atirar', dir: [1, 0.05, 0] }, T0).res;
  assert.equal(tiro.ok, true, tiro.msg); assert.equal(A.profile.lixoMao, null, 'gastou o lixo da mão');
  let ev = []; for (let k = 1; k < 40 && !ev.some((e) => e.t === 'atordoado'); k++) ev.push(...r.tick(T0 + k * 50, 0.05));
  const at = ev.find((e) => e.t === 'atordoado'); assert.ok(at, 'acertou'); assert.equal(at.ms, 1000); assert.equal(at.lixo, 'latinha');
  // sem lixo na mão, usa o do saco
  A.profile.saco.push({ uid: 's1', tipo: 'sacola' });
  assert.equal(r.action('N', { tipo: 'estilingue_atirar', dir: [1, 0.1, 0] }, T0 + 5000).res.ok, true);
  assert.equal(A.profile.saco.length, 0);
  assert.match(r.action('N', { tipo: 'estilingue_atirar', dir: [1, 0.1, 0] }, T0 + 9000).res.msg, /Sem lixo/);
});

test('Kraken: aviso, surge a cada 20 min por 1 min, vida pelo dano das armas, S$ 1.000 + filhote para quem acertou', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  r.tick(T0, 0.05);
  assert.equal(r.world.kraken.proximo, T0 + KRAKEN.intervaloMs);
  assert.ok(r.tick(T0 + KRAKEN.intervaloMs - 59000, 0.05).some((e) => e.t === 'kraken_aviso'), 'avisa 1 min antes');
  const t1 = T0 + KRAKEN.intervaloMs;
  assert.ok(r.tick(t1, 0.05).some((e) => e.t === 'kraken_surgiu'));
  assert.equal(r.snapshot(t1).kraken.vivo, true);
  // referência de dano: N jogadores com a arma, atirando na cadência máxima, matam bem antes de 1 min
  const dps = (k) => (ARMAS[k].danoKraken * 1000) / ARMAS[k].cdMs;
  for (const [k, n] of [['pistola', 5], ['metralhadora', 4], ['fuzil', 3], ['sniper', 2], ['bazuca', 1]]) {
    const t = KRAKEN.hp / (dps(k) * n);
    assert.ok(t > 20 && t < 45, `${n}× ${k}: ${t.toFixed(0)} s atirando sem parar`);
  }
  assert.equal(ARMAS.estilingue.danoKraken, 1, 'estilingue tira só 1');
  // tiro de pistola de um píer na direção do Kraken
  const A = r.players.get('N'); A.modo = 'terra'; A.profile.armas.pistola = true; A.profile.municao.pistola = 50;
  const tk = t1 + 5000, c = krakenPos(5, r.world.kraken.a0).pos;
  const ang = Math.atan2(c[2], c[0]); A.pos = [c[0] + Math.cos(ang) * 20, 1.6, c[2] + Math.sin(ang) * 20];
  const d = [c[0] - A.pos[0], 2.2 - (A.pos[1] + 1.45), c[2] - A.pos[2]];
  const hp0 = r.world.kraken.hp;
  const res = r.action('N', { tipo: 'atirar', arma: 'pistola', dir: d }, tk).res;
  assert.equal(res.events.find((e) => e.t === 'tiro').acertou, 'kraken'); assert.equal(r.world.kraken.hp, hp0 - ARMAS.pistola.danoKraken);
  // morre: os dois ganham o prêmio
  const din = ['N', 'L'].map((s) => r.players.get(s).profile.dinheiro);
  r.world.kraken.hp = 5;
  const fim = r.action('N', { tipo: 'atirar', arma: 'pistola', dir: d }, tk + 500).res.events.find((e) => e.t === 'kraken_morto');
  assert.ok(fim, 'derrotado'); assert.deepEqual(fim.perfis.sort(), ['N'], 'só quem acertou ganha');
  assert.deepEqual(['N', 'L'].map((s) => r.players.get(s).profile.dinheiro), [din[0] + KRAKEN.premio, din[1]]);
  const filhote = r.players.get('N').profile.mochila.find((f) => f.esp === 'kraken_filhote');
  assert.ok(filhote, 'ganha um filhote vivo'); assert.equal(valorPeixeItem(filhote), 600); assert.equal(valorPeixeItem({ ...filhote, cortado: true }), 1200);
  assert.equal(r.world.kraken.proximo, tk + 500 + KRAKEN.intervaloMs, 'volta em 20 min');
  // se ninguém matar, some depois de 1 min
  const r2 = mkRoom(); r2.join(np('c'), 'N', T0); r2.tick(T0, 0.05); r2.tick(T0 + KRAKEN.intervaloMs, 0.05);
  assert.ok(r2.tick(T0 + KRAKEN.intervaloMs + KRAKEN.duracaoMs, 0.05).some((e) => e.t === 'kraken_fugiu'));
});

test('corrida de submarino: convite, aceitar, 5 palitos, prêmio 200 (2) e 250 dividido (3+)', () => {
  assert.deepEqual(divisaoCorrida(2), { premio: 200, perda: [200] });
  const d5 = divisaoCorrida(5); assert.equal(d5.premio, 250); assert.equal(d5.perda.reduce((a, b) => a + b, 0), 250);
  const d4 = divisaoCorrida(4); assert.equal(d4.perda.reduce((a, b) => a + b, 0), 250);
  const r = mkRoom(); for (const [id, s] of [['a', 'N'], ['b', 'L'], ['c', 'SE']]) r.join(np(id), s, T0);
  const A = r.players.get('N'), B = r.players.get('L'), C = r.players.get('SE');
  for (const o of [A, B, C]) o.profile.dinheiro = 1000;
  assert.match(r.action('N', { tipo: 'corrida_convidar', slots: ['L', 'SE'] }, T0).res.msg, /barraca/, 'precisa estar na barraca');
  const h = estacaoParaMundo(stationById('N'), BARRACA_CORRIDA.x, BARRACA_CORRIDA.z);
  A.modo = 'terra'; A.pos = [h[0], 1.6, h[1]];
  const cv = r.action('N', { tipo: 'corrida_convidar', slots: ['L', 'SE'] }, T0).res;
  assert.equal(cv.ok, true, cv.msg);
  const id = cv.events[0].id;
  assert.equal(r.action('SE', { tipo: 'corrida_responder', id, aceitar: false }, T0 + 100).res.ok, true);
  const ac = r.action('L', { tipo: 'corrida_responder', id, aceitar: true }, T0 + 200).res;
  const ini = ac.events.find((e) => e.t === 'corrida_inicio');
  assert.ok(ini, 'todos responderam: largada'); assert.deepEqual(ini.participantes, ['N', 'L'], 'só quem aceitou corre');
  assert.equal(ini.checkpoints.length, CORRIDA.checkpoints);
  // teletransporte para a largada é aceito pela sala
  r.setState('L', { pos: ini.largada.L, modo: 'sub', sub: { pos: ini.largada.L } }, T0 + 300);
  assert.deepEqual(B.pos, ini.largada.L);
  // antes da largada não vale
  B.modo = 'sub'; B.sub.pos = [ini.checkpoints[0][0], -0.5, ini.checkpoints[0][2]];
  assert.equal(r.action('L', { tipo: 'corrida_checkpoint', id, i: 0 }, T0 + 1000).res.ok, false);
  // longe do palito não vale
  const tl = T0 + 200 + CORRIDA.largadaMs + 10;
  B.sub.pos = [0, -0.5, 0];
  assert.equal(r.action('L', { tipo: 'corrida_checkpoint', id, i: 0 }, tl).res.ok, false);
  let fim = null;
  ini.checkpoints.forEach((cp, i) => {
    B.sub.pos = [cp[0] + 1, -0.5, cp[2]];
    const res = r.action('L', { tipo: 'corrida_checkpoint', id, i }, tl + i * 1000).res;
    assert.equal(res.ok, true, res.msg);
    fim = res.events.find((e) => e.t === 'corrida_fim') || fim;
  });
  assert.ok(fim, 'pegou os 5'); assert.equal(fim.vencedor, 'L');
  assert.deepEqual(fim.ganhos, { N: -200, L: 200 });
  assert.equal(A.profile.dinheiro, 800); assert.equal(B.profile.dinheiro, 1200); assert.equal(C.profile.dinheiro, 1000, 'quem recusou não paga');
  assert.equal(r.corrida, null);
  // 3 corredores: 250 divididos entre os 2 que perderam
  const cv2 = r.action('N', { tipo: 'corrida_convidar', slots: ['L', 'SE'] }, tl + 9000).res; const id2 = cv2.events[0].id;
  r.action('L', { tipo: 'corrida_responder', id: id2, aceitar: true }, tl + 9100);
  const ini2 = r.action('SE', { tipo: 'corrida_responder', id: id2, aceitar: true }, tl + 9200).res.events.find((e) => e.t === 'corrida_inicio');
  assert.deepEqual(ini2.participantes, ['N', 'L', 'SE']);
  const t2 = tl + 9200 + CORRIDA.largadaMs + 10; let fim2;
  A.modo = 'sub';
  ini2.checkpoints.forEach((cp, i) => { A.sub.pos = [cp[0], -0.4, cp[2]]; fim2 = r.action('N', { tipo: 'corrida_checkpoint', id: id2, i }, t2 + i).res.events.find((e) => e.t === 'corrida_fim') || fim2; });
  assert.equal(fim2.vencedor, 'N'); assert.equal(fim2.ganhos.N, 250); assert.equal(fim2.ganhos.L + fim2.ganhos.SE, -250);
  // convite sem resposta expira e é cancelado
  const cv3 = r.action('N', { tipo: 'corrida_convidar', slots: ['L'] }, t2 + 20000).res;
  A.modo = 'terra'; A.pos = [h[0], 1.6, h[1]];
  const cv4 = cv3.ok ? cv3 : r.action('N', { tipo: 'corrida_convidar', slots: ['L'] }, t2 + 20000).res;
  assert.equal(cv4.ok, true, cv4.msg);
  assert.ok(r.tick(t2 + 20000 + CORRIDA.conviteMs + 10, 0.05).some((e) => e.t === 'corrida_cancelada'));
});

test('estação: tudo só com dinheiro (sem metal/componentes) e decorações novas de S$ 90–100', async () => {
  const { ESTACAO, DEPOSITO, EXTRAS } = await import('../shared/data.js');
  for (const it of [...Object.values(ESTACAO), ...DEPOSITO.filter((d) => d.custo), ...Object.values(EXTRAS)]) assert.deepEqual(it.custo.comps, {}, it.nome || 'depósito');
  const decos = Object.entries(ESTACAO).filter(([, v]) => v.deco);
  assert.ok(decos.length >= 8 && decos.every(([, v]) => v.custo.dinheiro >= 90 && v.custo.dinheiro <= 100));
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const st = STATIONS.find((s) => s.id === 'N');
  pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]]; pl.profile.dinheiro = 1000;
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'carregador' }, T0).res.ok, true, 'carregador sem metal');
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'banco' }, T0).res.ok, true);
  assert.equal(pl.profile.dinheiro, 1000 - 800 - 100);
  assert.equal(pl.profile.estacao.banco, true);
});

test('tubarão do lago: um por vez, 200 de vida, boia morto, pegar, derrubar quem leva e vender por S$ 400', async () => {
  const { TUBARAO } = await import('../shared/data.js');
  const { tubaraoPos } = await import('../shared/world.js');
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  r.tick(T0, 0.05);
  assert.equal(r.world.tubarao.vivo, false);
  assert.ok(r.tick(T0 + TUBARAO.intervaloMs, 0.05).some((e) => e.t === 'tubarao_surgiu'), 'aparece depois de 20 min');
  // passados 40 min continua só um
  r.tick(T0 + 2 * TUBARAO.intervaloMs + 10, 0.05);
  assert.equal(r.world.tubarao.vivo, true); assert.equal(r.world.tubarao.hp, TUBARAO.hp);
  assert.equal(r.snapshot(T0 + TUBARAO.intervaloMs + 1000).tubarao.hp, undefined, 'vida não aparece para os jogadores');
  // atira com a pistola até cair
  const tk = T0 + TUBARAO.intervaloMs + 30000; const tb = r.world.tubarao;
  A.modo = 'terra'; A.profile.armas.pistola = true; A.profile.armas.estilingue = true; A.profile.municao.pistola = 100;
  let morto = null, tiros = 0, t = tk;
  while (!morto && tiros < 60) {
    const c = tubaraoPos((t - tb.ini) / 1000, tb.a0).pos;
    A.pos = [c[0] * 0.75, 1.6, c[2] * 0.75];
    const d = [c[0] - A.pos[0], 0.1 - (A.pos[1] + 1.45), c[2] - A.pos[2]];
    const res = r.action('N', { tipo: 'atirar', arma: 'pistola', dir: d }, t).res;
    assert.equal(res.events.find((e) => e.t === 'tiro')?.acertou, 'tubarao', 'tiro acerta o tubarão');
    morto = res.events.find((e) => e.t === 'tubarao_morto'); tiros++; t += 500;
  }
  assert.equal(tiros, Math.ceil(TUBARAO.hp / ARMAS.pistola.danoKraken), '200 de vida ÷ 8 por tiro de pistola');
  assert.equal(r.world.tubarao.esperando, true, 'o próximo espera alguém pegar este');
  assert.ok(!r.tick(t + 3 * TUBARAO.intervaloMs, 0.05).some((e) => e.t === 'tubarao_surgiu'), 'com o tubarão morto boiando, não nasce outro');
  const c = morto.carcaca; assert.equal(c.pos[1], 0, 'boia na água');
  // B nada até lá e pega (mão livre)
  B.modo = 'nadando'; B.pos = [c.pos[0] + 1, -0.5, c.pos[2]];
  B.profile.mao = { uid: 'x', esp: 'lambari', cm: 10 };
  assert.match(r.action('L', { tipo: 'tubarao_pegar', id: c.id }, t).res.msg, /mãos/);
  B.profile.mao = null;
  assert.equal(r.action('L', { tipo: 'tubarao_pegar', id: c.id }, t).res.ok, true);
  assert.equal(B.profile.mao.esp, 'tubarao_cacado');
  assert.equal(r.action('L', { tipo: 'mochila_guardar' }, t).res.ok, false, 'não vai para a mochila');
  // A derruba B com um tiro: o tubarão cai onde B estava e A pega
  B.modo = 'terra'; B.pos = [A.pos[0] + 8, 1.6, A.pos[2]]; B.imuneUntil = 0;
  const tiro = r.action('N', { tipo: 'atirar', arma: 'pistola', dir: [1, 0, 0] }, t + 1000).res;
  const caiu = tiro.events.find((e) => e.t === 'carcaca_nova');
  assert.ok(caiu && caiu.perfis.includes('L'), 'derrubou o tubarão'); assert.equal(B.profile.mao, null);
  assert.equal(r.action('L', { tipo: 'tubarao_pegar', id: caiu.carcaca.id }, t + 1200).res.ok, false, 'no chão não pega');
  A.pos = [caiu.carcaca.pos[0] - 1, 1.6, caiu.carcaca.pos[2]];
  assert.equal(r.action('N', { tipo: 'tubarao_pegar', id: caiu.carcaca.id }, t + 1300).res.ok, true, 'quem derrubou pega');
  // vende na estação por 400
  const st = STATIONS.find((s) => s.id === 'N'); A.pos = [st.pad[0], 1.6, st.pad[1]];
  const d0 = A.profile.dinheiro;
  assert.equal(r.action('N', { tipo: 'peixe_vender' }, t + 2000).res.ok, true);
  assert.equal(A.profile.dinheiro, d0 + TUBARAO.valor);
  // pegou e tirou da água: só agora começam os 5 min do próximo
  const t2 = t + 3000; r.tick(t2, 0.05);
  assert.equal(r.world.tubarao.proximo, t2 + TUBARAO.intervaloMs);
  assert.ok(!r.tick(t2 + TUBARAO.intervaloMs - 1000, 0.05).some((e) => e.t === 'tubarao_surgiu'));
  assert.ok(r.tick(t2 + TUBARAO.intervaloMs, 0.05).some((e) => e.t === 'tubarao_surgiu'), 'nasce 5 min depois');
});

test('vara divina nunca arrebenta; aquário rende 10% do valor dos peixes por hora', async () => {
  const { RENDA_AQUARIO } = await import('../shared/data.js');
  const { varaStats, rendaAquario } = await import('../shared/rules.js');
  const p = newProfile('x', 0); p.vara = VARA.length;
  const vs = varaStats(p); assert.equal(vs.inquebravel, true); assert.equal(vs.pesado, true);
  p.vitrine.peixes = [{ uid: 'k', esp: 'kraken_filhote', cm: 30 }];
  const d0 = p.dinheiro; let pago = 0;
  for (let k = 0; k < 60; k++) pago += rendaAquario(p, 60e3);
  assert.equal(pago, 60, '600 × 10% = 60 por hora'); assert.equal(p.dinheiro, d0 + 60); assert.equal(RENDA_AQUARIO.porHora, 0.1);
});

test('estilingue tira 1 de vida do Kraken/tubarão; decorações saem e voltam sem pagar de novo', () => {
  assert.equal(ARMAS.estilingue.danoKraken, 1);
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const st = STATIONS.find((s) => s.id === 'N');
  pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]]; pl.profile.dinheiro = 500;
  assert.equal(r.action('N', { tipo: 'deco_alternar', chave: 'banco' }, T0).res.ok, false, 'precisa comprar antes');
  r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'banco' }, T0);
  const d = pl.profile.dinheiro;
  assert.equal(r.action('N', { tipo: 'deco_alternar', chave: 'banco' }, T0).res.ok, true);
  assert.equal(pl.profile.estacao.decoOff.banco, true);
  assert.equal(r.action('N', { tipo: 'deco_alternar', chave: 'banco' }, T0).res.ok, true);
  assert.ok(!pl.profile.estacao.decoOff.banco); assert.equal(pl.profile.dinheiro, d, 'não cobra de novo');
  assert.equal(r.action('N', { tipo: 'deco_alternar', chave: 'carregador' }, T0).res.ok, false, 'carregador não é decoração');
});

test('bancada de restauro (S$ 1.000): restaura de graça qualquer item direto do sub/saco e vende pelo dobro; recicladora saiu da loja', async () => {
  const { ESTACAO } = await import('../shared/data.js');
  assert.equal(ESTACAO.restauro.custo.dinheiro, 1000); assert.equal(ESTACAO.peixaria.custo.dinheiro, 2000);
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'), p = pl.profile; const st = STATIONS.find((s) => s.id === 'N');
  pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]]; p.dinheiro = 1500;
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'reciclador' }, T0).res.ok, false, 'recicladora não se compra mais');
  p.carga.push({ uid: 'lt', tipo: 'lata' }, { uid: 'pn', tipo: 'pneu' }); p.saco.push({ uid: 'pet', tipo: 'garrafa_pet' });
  assert.match(r.action('N', { tipo: 'restaurar', uid: 'lt', de: 'carga' }, T0).res.msg, /Bancada de restauro/);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'restauro' }, T0).res.ok, true);
  const d0 = p.dinheiro; p.comps = { metal: 0, cobre: 0, borracha: 0, eletronica: 0, vidro: 0, cristal: 0 };
  for (const [uid, de] of [['lt', 'carga'], ['pn', 'carga'], ['pet', 'saco']]) assert.equal(r.action('N', { tipo: 'restaurar', uid, de }, T0).res.ok, true, uid);
  assert.equal(p.dinheiro, d0, 'restaurar é de graça');
  assert.equal(r.action('N', { tipo: 'restaurar', uid: 'lt', de: 'carga' }, T0).res.ok, false, 'não restaura duas vezes');
  r.action('N', { tipo: 'vender', uid: 'lt', de: 'carga' }, T0);
  assert.equal(p.dinheiro, d0 + SUCATA.lata.valor * 2, 'vende pelo dobro');
  r.action('N', { tipo: 'vender_saco' }, T0);
  assert.equal(p.dinheiro, d0 + SUCATA.lata.valor * 2 + SUCATA.garrafa_pet.valor * 2);
});

test('bancada de peixe (S$ 2.000): só peixe na mão de mais de 2 kg; tábua (E), cortar (I), pegar (I) e vende pelo dobro', async () => {
  const { BANCADA_PEIXE, estacaoParaMundo } = await import('../shared/world.js');
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'), p = pl.profile; const st = STATIONS.find((s) => s.id === 'N');
  pl.modo = 'terra'; p.dinheiro = 3000;
  const b = estacaoParaMundo(st, BANCADA_PEIXE.x, BANCADA_PEIXE.z); pl.pos = [b[0] + 2, 1.6, b[1]];
  assert.match(r.action('N', { tipo: 'peixaria_colocar' }, T0).res.msg, /Bancada de peixe/);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'peixaria' }, T0).res.ok, true);
  assert.equal(p.dinheiro, 1000);
  p.mochila.push({ uid: 'm', esp: 'tucunare', cm: 70 });
  assert.match(r.action('N', { tipo: 'peixaria_colocar' }, T0).res.msg, /na mão/, 'na mochila não vale');
  p.mao = { uid: 'pq', esp: 'lambari', cm: 12 };
  assert.equal(r.action('N', { tipo: 'peixaria_colocar' }, T0).res.ok, true, 'qualquer peixe corta, até lambari');
  r.action('N', { tipo: 'peixaria_cortar' }, T0); r.action('N', { tipo: 'peixaria_pegar' }, T0); assert.equal(p.mao.cortado, true); p.mao = null;
  p.mao = null; r.action('N', { tipo: 'mochila_tirar', uid: 'm' }, T0);
  assert.equal(r.action('N', { tipo: 'peixaria_colocar' }, T0).res.ok, true); assert.equal(p.mao, null);
  assert.equal(r.action('N', { tipo: 'peixaria_pegar' }, T0).res.ok, false, 'precisa cortar antes');
  assert.equal(r.action('N', { tipo: 'peixaria_cortar' }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'peixaria_pegar' }, T0).res.ok, true);
  assert.equal(p.mao.cortado, true);
  assert.equal(r.action('N', { tipo: 'peixe_aquario' }, T0).res.ok, false, 'cortado não vai para o aquário');
  // cortado vai para a mochila; tubarão cortado também cabe
  assert.equal(r.action('N', { tipo: 'mochila_guardar' }, T0).res.ok, true); assert.equal(p.mao, null);
  p.mao = { uid: 'tc', esp: 'tubarao_cacado', cm: 330 };
  assert.equal(r.action('N', { tipo: 'mochila_guardar' }, T0).res.ok, false, 'tubarão inteiro não cabe');
  p.mao.cortado = true;
  assert.equal(r.action('N', { tipo: 'mochila_guardar' }, T0).res.ok, true, 'tubarão cortado cabe');
  pl.pos = [st.pad[0], 1.6, st.pad[1]];
  const { valorPeixe } = await import('../shared/data.js');
  const d0 = p.dinheiro, v = valorPeixe('tucunare', 70) * 2 + 800;
  const res = r.action('N', { tipo: 'peixe_vender_tudo' }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(p.mochila.length, 0);
  assert.equal(p.dinheiro, d0 + v);
});

test('só um aquário OU tanque na estação: comprar equipa, Equipar troca, peixes passam junto', () => {
  const r = mkRoom(); r.join(np('n'), 'N', T0); const pl = noSub(r, 'N'); const p = pl.profile;
  p.dinheiro = 1e6;
  assert.equal(p.vitrine.tipo, 'aquario'); assert.equal(p.vitrine.nivel, 0);
  p.mao = { uid: 'a', esp: 'tetra', cm: 5 }; assert.equal(r.action('N', { tipo: 'peixe_aquario' }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'aquario', nivel: 4 }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'tanque' }, T0).res.ok, true);
  assert.equal(p.vitrine.tipo, 'tanque', 'comprar o tanque equipa ele (o aquário some)'); assert.equal(p.vitrine.peixes.length, 1, 'o peixe veio junto');
  p.mao = { uid: 't', esp: 'tubarao', cm: 150 }; assert.equal(r.action('N', { tipo: 'peixe_aquario' }, T0).res.ok, true, 'tubarão vai no tanque');
  // volta para o aquário: o tubarão não cabe e vai para a mochila? não (tubarão inteiro não cabe na mochila) → só se couber
  const res = r.action('N', { tipo: 'vitrine_equipar', tipo2: 'aquario', nivel: 0 }, T0).res;
  assert.equal(res.ok, true, res.msg); assert.equal(p.vitrine.tipo, 'aquario'); assert.equal(p.vitrine.peixes.length, 1);
  assert.equal(p.mochila.length, 1, 'o que não coube foi para a mochila');
  assert.equal(r.action('N', { tipo: 'vitrine_equipar', tipo2: 'tanque', nivel: 3 }, T0).res.ok, false, 'não tem esse tanque');
  // migração: perfil com aquário e tanque separados vira uma vitrine (o tanque)
  const velho = migrateProfile({ ...np('w'), vitrine: undefined, aquario: { nivel: 3, peixes: [{ uid: 'x', esp: 'tetra', cm: 4 }] }, tanque: { nivel: 1, peixes: [{ uid: 'y', esp: 'pacu', cm: 60 }] } });
  assert.equal(velho.vitrine.tipo, 'tanque'); assert.equal(velho.vitrine.nivel, 1); assert.equal(velho.vitrine.peixes.length, 2);
  assert.deepEqual(velho.tanquesTem, [0, 1]); assert.ok(velho.aquariosTem.includes(3));
});

import { valorPeixe as vpx } from '../shared/data.js';
import { BANCADA_PEIXE as BPX } from '../shared/world.js';
test('cortar todos (mochila), restaurar todos e vender tudo de uma vez', () => {
  const r = mkRoom(); r.join(np('n'), 'N', T0); const pl = r.players.get('N'), p = pl.profile;
  const st = stationById('N'); p.dinheiro = 1e5;
  pl.sub.pos = [st.launch[0], -0.5, st.launch[1]]; pl.modo = 'sub';
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'peixaria' }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'estacao', chave: 'restauro' }, T0).res.ok, true);
  p.carga = [{ uid: 'c1', tipo: 'lata' }, { uid: 'c2', tipo: 'pneu' }]; p.saco = [{ uid: 's1', tipo: 'garrafa_pet' }];
  assert.equal(r.action('N', { tipo: 'restaurar_tudo' }, T0).res.ok, true);
  assert.ok(p.carga.every((x) => x.rest) && p.saco[0].rest);
  p.mochila = [{ uid: 'a', esp: 'lambari', cm: 10 }, { uid: 'b', esp: 'tucunare', cm: 60 }];
  const b = estacaoParaMundo(st, BPX.x, BPX.z); pl.modo = 'terra'; pl.pos = [b[0], 1.6, b[1]];
  assert.equal(r.action('N', { tipo: 'peixaria_cortar_tudo' }, T0).res.ok, true);
  assert.ok(p.mochila.every((f) => f.cortado));
  const esperado = (vpx('lambari', 10) + vpx('tucunare', 60)) * 2 + (SUCATA.lata.valor + SUCATA.pneu.valor + SUCATA.garrafa_pet.valor) * 2;
  pl.pos = [st.pad[0], 1.6, st.pad[1]];
  p.missoes.ativas = []; const d0 = p.dinheiro, res = r.action('N', { tipo: 'vender_tudo' }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(p.dinheiro - d0, esperado);
  assert.equal(p.mochila.length + p.saco.length + p.carga.length, 0);
});

import { createWorld as cwL, stepProjectiles as spL } from '../shared/rules.js';
test('lixo do estilingue fica onde cai (some só na água)', () => {
  const w = cwL(5), st = STATIONS[0];
  const n0 = Object.keys(w.items).length;
  // em terra: cai na plataforma da estação
  w.projeteis.push({ id: 'x1', tipo: 'lixo', lixo: 'garrafa_pet', dono: 'N', pos: [st.pad[0], 3, st.pad[1]], vel: [0, -5, 0], nasc: 0, ini: [st.pad[0], 0, st.pad[1]], alcance: 32 });
  let ev = []; for (let k = 0; k < 40 && w.projeteis.length; k++) ev.push(...spL(w, new Map(), 0.05, k * 50));
  const novo = ev.find((e) => e.t === 'item_novo');
  assert.ok(novo, 'virou lixo no chão'); assert.equal(novo.item.tipo, 'garrafa_pet'); assert.equal(Object.keys(w.items).length, n0 + 1);
  // na água: some
  w.projeteis.push({ id: 'x2', tipo: 'lixo', lixo: 'latinha', dono: 'N', pos: [0, 3, 0], vel: [0, -5, 0], nasc: 0, ini: [0, 0, 0], alcance: 32 });
  ev = []; for (let k = 0; k < 40 && w.projeteis.length; k++) ev.push(...spL(w, new Map(), 0.05, k * 50));
  assert.ok(!ev.some((e) => e.t === 'item_novo'), 'na água some');
});

test('equipamentos: saco 20, bolsas 10/20, trajes 2×/3×; doar peixe para amigo perto; pôr no aquário direto da bolsa', async () => {
  const { EQUIP, capPeixes, capSaco, multNado } = await import('../shared/data.js');
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  const st = STATIONS.find((s) => s.id === 'N'); A.modo = 'terra'; A.pos = [st.pad[0], 1.6, st.pad[1]];
  A.profile.dinheiro = 20000;
  assert.equal(capSaco(A.profile), 15); assert.equal(capPeixes(A.profile), 5); assert.equal(multNado(A.profile), 1);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'equip', chave: 'bolsa', nivel: 2 }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'equip', chave: 'saco', nivel: 1 }, T0).res.ok, true);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'equip', chave: 'traje', nivel: 2 }, T0).res.ok, true);
  assert.equal(A.profile.dinheiro, 20000 - 2500 - 2000 - 6000);
  assert.equal(capPeixes(A.profile), 20); assert.equal(capSaco(A.profile), 20); assert.equal(multNado(A.profile), 3);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'equip', chave: 'bolsa', nivel: 1 }, T0).res.ok, false, 'não compra pior');
  assert.equal(EQUIP.traje[1].custo.dinheiro, 3000); assert.equal(EQUIP.bolsa[1].custo.dinheiro, 1500);
  // doar: longe de todo mundo
  A.profile.mao = { uid: 'p1', esp: 'tilapia', cm: 20 };
  B.modo = 'terra'; B.pos = [A.pos[0] + 30, 1.6, A.pos[2]];
  assert.match(r.action('N', { tipo: 'doar' }, T0).res.msg, /ninguém perto/);
  // perto: oferece, B aceita com Y
  B.pos = [A.pos[0] + 1.5, 1.6, A.pos[2]];
  const of = r.action('N', { tipo: 'doar' }, T0 + 10).res;
  assert.equal(of.ok, true); const ev = of.events.find((e) => e.t === 'doacao_oferta'); assert.equal(ev.alvo, 'L');
  assert.equal(A.profile.mao.uid, 'p1', 'continua com quem doou até aceitar');
  const ac = r.action('L', { tipo: 'doar_responder', id: ev.id, aceitar: true }, T0 + 20).res;
  assert.equal(ac.ok, true); assert.equal(A.profile.mao, null); assert.equal(B.profile.mao.uid, 'p1');
  assert.deepEqual(ac.events[0].perfis.sort(), ['L', 'N']);
  // recusa: fica com quem ofereceu
  B.profile.mao = null; A.profile.mao = { uid: 'p2', esp: 'tilapia', cm: 20 };
  const ev2 = r.action('N', { tipo: 'doar' }, T0 + 30).res.events[0];
  assert.equal(r.action('L', { tipo: 'doar_responder', id: ev2.id, aceitar: false }, T0 + 40).res.ok, true);
  assert.equal(A.profile.mao.uid, 'p2'); assert.equal(B.profile.mao, null);
  // aquário direto da bolsa
  A.profile.mao = null; A.profile.mochila.push({ uid: 'p3', esp: 'lambari', cm: 6 });
  assert.equal(r.action('N', { tipo: 'aquario_da_bolsa', uid: 'p3', de: 'mochila' }, T0 + 50).res.ok, true);
  assert.ok(A.profile.vitrine.peixes.some((f) => f.uid === 'p3'));
});
