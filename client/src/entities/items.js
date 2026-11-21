// Modelos procedurais de cada tipo de sucata (todos distintos e reconhecíveis).
import { Geo, sphere, cylinder, capsule, torus, rbox, box, lathe, tube, icosphere, noisy, MAT } from '../engine/geometry.js';
import { Node } from '../engine/renderer.js';
import { noise3 } from '../../shared/world.js';
import { pieceItemGeo, MAT_FERRUGEM } from './statue.js';

const RUST = [0.45, 0.24, 0.12], STEEL = [0.45, 0.46, 0.48], COPPER = [0.72, 0.42, 0.22], BRONZE = [0.62, 0.48, 0.24];
const rusty = (base, amt = 0.5) => (x, y, z) => { const n = noise3(x * 9, y * 9, z * 9); const t = n > 0.2 - amt * 0.6 ? 0.7 : 0; return [base[0] + (RUST[0] - base[0]) * t, base[1] + (RUST[1] - base[1]) * t, base[2] + (RUST[2] - base[2]) * t, 0]; };

function anchor(s = 1) {
  const g = new Geo();
  g.put(cylinder(0.07 * s, 0.07 * s, 1.4 * s, 10), [0, 0.7 * s, 0], [0, 0, 0], 1, rusty(STEEL));
  g.put(torus(0.16 * s, 0.035 * s, 14, 6), [0, 1.5 * s, 0], [0, 0, Math.PI / 2], 1, rusty(STEEL));
  g.put(cylinder(0.05 * s, 0.05 * s, 0.7 * s, 8), [0, 1.2 * s, 0], [0, 0, Math.PI / 2], 1, rusty(STEEL));
  const arc = []; for (let k = 0; k <= 10; k++) { const a = Math.PI + (k / 10) * Math.PI; arc.push([Math.cos(a) * 0.55 * s, 0.55 * s + Math.sin(a) * 0.55 * s, 0]); }
  g.add(tube(arc, 0.06 * s, 8), null, rusty(STEEL));
  for (const sx of [-1, 1]) g.put(cylinder(0.0, 0.13 * s, 0.25 * s, 4), [sx * 0.55 * s, 0.62 * s, 0], [0, 0, sx * 0.4], 1, rusty(STEEL));
  return g;
}
const MAKERS = {
  lata: () => { const g = new Geo(); const c = cylinder(0.035, 0.035, 0.12, 12); noisy(c, 0.006, 30, 1); g.put(c, [0, 0.06, 0], [0, 0, 1.3], 1, (x, y, z) => (Math.abs(y) < 0.03 ? [0.75, 0.15, 0.12, 0] : [0.7, 0.7, 0.72, 0])); return g; },
  garrafa: () => { const g = new Geo(); g.put(lathe([[0, 0], [0.04, 0], [0.042, 0.14], [0.02, 0.2], [0.014, 0.26], [0, 0.26]], 12), [0, 0.04, 0], [0, 0, 1.45], 1, [0.18, 0.4, 0.22]); return g; },
  pneu: () => { const g = new Geo(); g.put(torus(0.32, 0.13, 24, 10), [0, 0.13, 0], [0, 0, 0], [1, 1.2, 1], (x, y, z) => { const tr = Math.abs(Math.sin(Math.atan2(z, x) * 30)) > 0.7 ? 0.07 : 0.1; return [tr, tr, tr, 0]; }); return g; },
  cano: () => { const g = new Geo(); g.add(tube([[-0.6, 0.06, 0], [0, 0.06, 0], [0.25, 0.06, 0.05], [0.35, 0.3, 0.08]], 0.05, 10), null, rusty(COPPER, 0.3)); return g; },
  corrente: () => { const g = new Geo(); for (let k = 0; k < 9; k++) g.put(torus(0.08, 0.022, 12, 6), [-0.5 + k * 0.12, 0.03, Math.sin(k) * 0.08], [k % 2 ? Math.PI / 2 : 0, 0, Math.PI / 2], [1, 1, 1.5], rusty(STEEL, 0.8)); return g; },
  bateria_velha: () => { const g = new Geo(); g.put(rbox(0.32, 0.22, 0.18, 0.02), [0, 0.11, 0], [0, 0, 0], 1, [0.12, 0.12, 0.13]); for (const s of [-1, 1]) g.put(cylinder(0.02, 0.02, 0.04, 8), [s * 0.1, 0.24, 0], [0, 0, 0], 1, s > 0 ? [0.8, 0.2, 0.15] : [0.25, 0.25, 0.3]); return g; },
  radio: () => { const g = new Geo(); g.put(rbox(0.4, 0.28, 0.2, 0.04), [0, 0.14, 0], [0, 0, 0], 1, [0.42, 0.26, 0.14]); g.put(cylinder(0.08, 0.08, 0.01, 16), [-0.08, 0.15, 0.1], [Math.PI / 2, 0, 0], 1, [0.8, 0.75, 0.55]); for (const x of [0.08, 0.14]) g.put(cylinder(0.02, 0.02, 0.03, 8), [x, 0.12, 0.11], [Math.PI / 2, 0, 0], 1, [0.2, 0.2, 0.2]); return g; },
  caixa_ferramentas: () => { const g = new Geo(); g.put(rbox(0.5, 0.22, 0.24, 0.03), [0, 0.11, 0], [0, 0, 0], 1, rusty([0.75, 0.15, 0.1], 0.4)); g.add(tube([[-0.15, 0.22, 0], [-0.12, 0.3, 0], [0.12, 0.3, 0], [0.15, 0.22, 0]], 0.015, 6), null, [0.2, 0.2, 0.2, 0]); return g; },
  helice: () => { const g = new Geo(); g.put(cylinder(0.08, 0.08, 0.15, 12), [0, 0.1, 0], [Math.PI / 2, 0, 0], 1, BRONZE); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; g.put(rbox(0.08, 0.38, 0.02, 0.01), [Math.sin(a) * 0.22, 0.1 + Math.cos(a) * 0.22, 0], [0.4, 0, -a], 1, rusty(BRONZE, 0.3)); } return g; },
  motor_popa: () => { const g = new Geo(); g.put(rbox(0.36, 0.4, 0.5, 0.1), [0, 0.6, 0], [0, 0, 0], 1, rusty([0.85, 0.85, 0.82], 0.5)); g.put(rbox(0.12, 0.6, 0.18, 0.04), [0, 0.15, 0], [0, 0, 0], 1, rusty(STEEL)); g.put(cylinder(0.05, 0.05, 0.2, 8), [0, -0.12, 0.08], [Math.PI / 2, 0, 0], 1, STEEL); for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; g.put(rbox(0.04, 0.14, 0.01, 0.005), [Math.sin(a) * 0.07, -0.12 + Math.cos(a) * 0.07, 0.2], [0, 0, -a], 1, BRONZE); } return g; },
  // lixo da margem
  garrafa_pet: () => { const g = new Geo(); g.put(lathe([[0, 0], [0.04, 0], [0.045, 0.03], [0.045, 0.17], [0.03, 0.22], [0.016, 0.25], [0.016, 0.28], [0, 0.28]], 14), [0, 0.045, 0], [0, 0.3, 1.5], 1, [0.7, 0.88, 0.92]); g.put(cylinder(0.018, 0.018, 0.02, 10), [0.15, 0.045, 0], [0, 0, 1.5], 1, [0.15, 0.45, 0.85]); g.put(cylinder(0.047, 0.047, 0.06, 14, false), [0.06, 0.045, 0], [0, 0, 1.5], 1, [0.85, 0.15, 0.12]); return g; },
  latinha: () => { const g = new Geo(); const c = cylinder(0.033, 0.033, 0.11, 14); noisy(c, 0.008, 25, 1); g.put(c, [0, 0.033, 0], [0.2, 0.4, 1.55], [1, 0.75, 1], (x, y, z) => (Math.abs(y - 0.033) < 0.012 ? [0.85, 0.85, 0.88, 0] : [0.1, 0.35, 0.8, 0])); return g; },
  sacola: () => { const g = icosphere(0.12, 2); noisy(g, 0.05, 9, 3); const o = new Geo(); o.put(g, [0, 0.05, 0], [0, 0, 0], [1.3, 0.45, 1], [0.92, 0.92, 0.9]); o.put(torus(0.05, 0.01, 10, 4), [0.12, 0.08, 0], [0, 0, 0.6], 1, [0.92, 0.92, 0.9]); return o; },
  saco_lixo: () => { const g = icosphere(0.3, 2); noisy(g, 0.06, 6, 7); const o = new Geo(); o.put(g, [0, 0.24, 0], [0, 0, 0], [1, 0.85, 0.9], [0.07, 0.07, 0.08]); o.put(lathe([[0.07, 0], [0.04, 0.06], [0.06, 0.12], [0.0, 0.14]], 10), [0, 0.47, 0], [0, 0, 0], 1, [0.07, 0.07, 0.08]); for (const s of [-1, 1]) o.put(capsule(0.025, 0.08, 6, 3), [s * 0.05, 0.6, 0], [0, 0, s * 0.8], 1, [0.07, 0.07, 0.08]); return o; },
  vidro_quebrado: () => { const g = new Geo(); g.put(lathe([[0, 0], [0.06, 0], [0.065, 0.11], [0.05, 0.13], [0.0, 0.13]], 14), [0, 0.065, 0], [0, 0, 1.5], 1, [0.55, 0.7, 0.6]); g.put(cylinder(0.055, 0.055, 0.025, 14), [0.16, 0.065, 0], [0, 0, 1.5], 1, [0.75, 0.7, 0.3]); return g; },
  ancora: () => anchor(1),
  ancora_gigante: () => anchor(2.6),
  sino_navio: () => { const g = new Geo(); g.put(lathe([[0, 0.5], [0.08, 0.5], [0.16, 0.42], [0.2, 0.2], [0.27, 0.02], [0.29, 0], [0.24, 0.02], [0.17, 0.2], [0.13, 0.42], [0, 0.46]], 20), [0, 0, 0], [0, 0, 0.3], 1, rusty(BRONZE, 0.3)); g.put(torus(0.06, 0.02, 10, 6), [0.15, 0.52, 0], [0, 0, 0.3 + Math.PI / 2], 1, BRONZE); return g; },
  cofre: () => { const g = new Geo(); g.put(rbox(0.6, 0.6, 0.55, 0.05), [0, 0.3, 0], [0, 0, 0], 1, rusty([0.18, 0.28, 0.2], 0.4)); g.put(cylinder(0.08, 0.08, 0.03, 16), [0.1, 0.35, 0.28], [Math.PI / 2, 0, 0], 1, [0.75, 0.65, 0.3]); g.put(box(0.03, 0.2, 0.03), [-0.15, 0.3, 0.28], [0, 0, 0], 1, [0.6, 0.6, 0.6]); return g; },
  caixa_preta: () => { const g = new Geo(); g.put(rbox(0.36, 0.22, 0.26, 0.03), [0, 0.11, 0], [0, 0, 0], 1, [0.95, 0.45, 0.05]); for (const s of [-1, 1]) g.put(box(0.38, 0.03, 0.03), [0, 0.11 + s * 0.06, 0.13], [0, 0, 0], 1, [0.9, 0.9, 0.85]); return g; },
  minerio: () => { const g = icosphere(0.22, 2); noisy(g, 0.06, 8, 4); g.colorize((x, y, z) => (noise3(x * 30, y * 30, z * 30) > 0.45 ? [0.2, 0.45, 0.9, 0] : [0.3, 0.28, 0.3, 0])); const o = new Geo(); o.put(g, [0, 0.16, 0], [0, 0, 0], [1.3, 0.8, 1]); return o; },
  sonda: () => { const g = new Geo(); g.put(capsule(0.22, 0.8, 16, 6), [0, 0.22, 0], [0, 0, Math.PI / 2], 1, rusty([0.9, 0.75, 0.15], 0.3)); g.put(cylinder(0.01, 0.01, 0.6, 6), [0.4, 0.5, 0], [0, 0, -0.5], 1, [0.6, 0.6, 0.6]); g.put(sphere(0.07, 10, 8), [-0.62, 0.22, 0], [0, 0, 0], 1, [0.2, 0.5, 0.6]); return g; },
  cristal: () => { const g = new Geo(); for (let k = 0; k < 5; k++) { const a = k * 1.3; g.put(cylinder(0.06, 0.0, 0.45 + (k % 3) * 0.12, 6, false), [Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08], [Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], 1, [0.6, 0.85, 1]); } return g; },
  reliquia: () => { const g = new Geo(); g.put(rbox(0.3, 0.12, 0.3, 0.03), [0, 0.06, 0], [0, 0, 0], 1, [0.4, 0.35, 0.3]); g.put(lathe([[0, 0], [0.12, 0.02], [0.1, 0.3], [0.13, 0.42], [0.0, 0.6]], 12), [0, 0.12, 0], [0, 0, 0], 1, [0.85, 0.7, 0.3]); g.put(sphere(0.05, 10, 8), [0, 0.45, 0.1], [0, 0, 0], 1, [0.3, 1, 0.9]); return g; },
};
const EMIT = { cristal: [0.3, 0.6, 1], reliquia: [0.3, 0.9, 0.8], caixa_preta: [0.25, 0.08, 0], minerio: [0.05, 0.12, 0.3] };

const cache = {};
export function itemMesh(R, tipo) {
  if (cache[tipo]) return cache[tipo];
  if (tipo.startsWith('estatua_')) { cache[tipo] = R.createMesh(pieceItemGeo(tipo.slice(8)), { ...MAT_FERRUGEM, emissive: [0.35, 0.22, 0.05], glow: 0.5 }); return cache[tipo]; }
  const base = MAKERS[tipo] || MAKERS[tipo.replace(/_ok|_polido|_aberto|_viva/, '')] || MAKERS.caixa_ferramentas;
  let g = base();
  // lixo da margem um pouco maior que o real, para dar para ver de longe (sem exagero)
  if (/^(garrafa_pet|latinha|sacola|vidro_quebrado|saco_lixo)$/.test(tipo)) { const o = new Geo(); o.put(g, [0, 0, 0], [0, 0, 0], tipo === 'saco_lixo' ? 1.15 : 1.75, null); g = o; }
  const kind = { saco_lixo: MAT.BORRACHA, garrafa_pet: MAT.LISO, latinha: MAT.METAL, sacola: MAT.TECIDO, vidro_quebrado: MAT.LISO, pneu: MAT.BORRACHA, garrafa: MAT.LISO, radio: MAT.MADEIRA, radio_ok: MAT.MADEIRA, cristal: MAT.LISO, reliquia: MAT.LISO, minerio: MAT.ROCHA, caixa_preta: MAT.PINTADO, corrente: MAT.METAL, ancora: MAT.METAL, ancora_gigante: MAT.METAL, cano: MAT.METAL }[tipo] ?? MAT.PINTADO;
  cache[tipo] = R.createMesh(g, { rough: 0.6, metal: 0.3, emissive: EMIT[tipo] || [0, 0, 0], glow: EMIT[tipo] ? 1.2 : 0, kind, rust: /_ok|polido|aberto|viva|garrafa_pet|latinha|sacola|vidro_quebrado|saco_lixo/.test(tipo) ? 0.0 : 0.9, texScale: kind === MAT.ROCHA ? 6 : 2 });
  return cache[tipo];
}
export function itemNode(R, it) {
  const n = new Node('item_' + it.tipo);
  n.mesh = itemMesh(R, it.tipo);
  n.at(it.x, it.y, it.z).rot(0, it.rot || 0, 0);
  n.item = it;
  return n;
}
