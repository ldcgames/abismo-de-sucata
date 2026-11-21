// Testes de regras (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../shared/room.js';
import { newProfile, subStats, sortearPeixe, cabeNoAquario, migrateProfile } from '../shared/rules.js';
import { navSDF, terrainHeight, STATIONS, SHAFT_C, CAVES, stationById, LAKE_R } from '../shared/world.js';
import { SUCATA, TROLL, AQUARIOS, VARA, TANQUES } from '../shared/data.js';

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
  assert.equal(p.aquario.peixes.length, 1);
  p.mao = { uid: 'f2', esp: 'barrigudo', cm: 4 };
  const r2 = r.action('N', { tipo: 'peixe_aquario' }, T0).res;
  assert.equal(r2.ok, false); assert.match(r2.msg, /\[1\/1\]/);
  p.aquario.peixes = [];
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
  assert.equal(p.dinheiro, 5000 - 550); assert.equal(p.comps.metal, 0); // só dinheiro, preços reduzidos
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
  // vender peixe direto da mochila e do aquário no computador da estação
  const st = stationById('N'); pl.modo = 'terra'; pl.pos = [st.pad[0], 1.6, st.pad[1]];
  const d0 = p.dinheiro;
  assert.equal(r.action('N', { tipo: 'peixe_vender', uid: 'f3' }, T0).res.ok, true); assert.ok(p.dinheiro > d0); assert.equal(p.mochila.length, 3);
  p.aquario.peixes.push({ uid: 'aq1', esp: 'lambari', cm: 8 });
  assert.equal(r.action('N', { tipo: 'peixe_vender', uid: 'aq1' }, T0).res.ok, true); assert.equal(p.aquario.peixes.length, 0);
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

test('lixo da margem: cata a pé (perto), vai para o saco e vende com o multiplicador', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); const pl = r.players.get('N'); const p = pl.profile;
  const it = Object.values(r.world.items).find((x) => x.tipo === 'garrafa_pet');
  assert.ok(it, 'há garrafas PET na margem');
  assert.ok(it.y > 0, 'o lixo fica fora da água');
  pl.modo = 'terra'; pl.pos = [it.x + 6, it.y, it.z];
  assert.equal(r.action('N', { tipo: 'catar', item: it.id }, T0).res.ok, false, 'longe demais');
  pl.pos = [it.x + 1, it.y, it.z];
  const res = r.action('N', { tipo: 'catar', item: it.id }, T0).res;
  assert.equal(res.ok, true, res.msg);
  assert.equal(p.saco.length, 1); assert.ok(!r.world.items[it.id], 'some do mundo para todos');
  // vender na estação
  const st = STATIONS.find((s) => s.id === 'N'); pl.pos = [st.pad[0], 1.6, st.pad[1]];
  const d0 = p.dinheiro;
  assert.equal(r.action('N', { tipo: 'vender_saco' }, T0).res.ok, true);
  assert.equal(p.dinheiro, d0 + 4); assert.equal(p.saco.length, 0);
  // respawn programado
  assert.ok(r.world.respawn.some((x) => x.terra));
  assert.ok(landTrashSpot(Math.random), 'acha lugar para novo lixo');
});

test('armas: compra em ordem, munição, tiro derruba 2 s (pistola) e empurra; bazuca 7 s e voa longe', () => {
  const r = mkRoom(); r.join(np('a'), 'N', T0); r.join(np('b'), 'L', T0);
  const A = r.players.get('N'), B = r.players.get('L');
  const st = STATIONS.find((s) => s.id === 'N');
  A.modo = 'terra'; A.pos = [st.pad[0], 1.6, st.pad[1]]; A.profile.dinheiro = 200000;
  assert.equal(r.action('N', { tipo: 'arma_comprar', arma: 'metralhadora' }, T0).res.ok, false, 'precisa da pistola antes');
  for (const k of ['pistola', 'metralhadora', 'fuzil', 'sniper', 'bazuca']) assert.equal(r.action('N', { tipo: 'arma_comprar', arma: k }, T0).res.ok, true, k);
  assert.equal(A.profile.dinheiro, 200000 - 900 - 3500 - 9000 - 20000 - 45000);
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
  r.action('N', { tipo: 'vender', uid: 'lt' }, T0); assert.equal(p.dinheiro, d0 + 60);
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
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'aquario', nivel: 2 }, T0).res.ok, false, 'não volta para um menor');
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'vara', nivel: 6 }, T0).res.ok, true); assert.equal(p.vara, 6);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'tanque' }, T0).res.ok, true); assert.equal(p.tanque.nivel, 0);
  assert.equal(r.action('N', { tipo: 'comprar', cat: 'tanque' }, T0).res.ok, true); assert.equal(p.tanque.nivel, 1);
  // perfil antigo (v0.7): vara 2 = fibra, aquário 1 = pequeno, tanque 0 = concreto, mochila com 1 peixe
  const velho = migrateProfile({ ...np('v'), inventVer: undefined, vara: 2, aquario: { nivel: 1, peixes: [] }, tanque: { nivel: 0, peixes: [] }, mochila: { uid: 'm', esp: 'tilapia', cm: 20 } });
  assert.equal(VARA[velho.vara - 1].nome, 'Vara de fibra'); assert.equal(AQUARIOS[velho.aquario.nivel].nome, 'Aquário Pequeno'); assert.equal(TANQUES[velho.tanque.nivel].nome, 'Tanque de Concreto');
  assert.deepEqual(velho.mochila.map((f) => f.uid), ['m']);
});
