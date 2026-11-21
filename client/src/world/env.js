// Ciclo de dia/noite, céu e parâmetros da água conforme a profundidade da câmera.
import { hourOfDay } from '../../shared/world.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function computeEnv(worldTime, camPos, opts = {}) {
  const hour = hourOfDay(worldTime);
  // sol: nasce às 6h, se põe às 18h
  const ang = ((hour - 6) / 12) * Math.PI;
  const elev = Math.sin(ang);
  const sunDir = norm([Math.cos(ang) * 0.75, elev, 0.42]);
  const day = ss(-0.12, 0.25, elev);
  const dusk = ss(0.35, 0.02, Math.abs(elev)) * ss(-0.25, 0.0, elev);
  const night = 1 - day;
  const moonDir = norm([-sunDir[0], Math.max(0.35, -sunDir[1]), -sunDir[2]]);
  const L = elev > -0.05 ? sunDir : moonDir;

  let skyTop = mix([0.012, 0.018, 0.045], [0.22, 0.42, 0.78], day);
  let skyHor = mix([0.03, 0.045, 0.08], [0.66, 0.77, 0.88], day);
  skyHor = mix(skyHor, [1.0, 0.56, 0.32], dusk * 0.85);
  skyTop = mix(skyTop, [0.24, 0.27, 0.5], dusk * 0.5);
  let sunCol = elev > -0.05 ? mix([2.4, 1.15, 0.5], [3.1, 2.9, 2.65], ss(0.0, 0.35, elev)) : [0.22, 0.27, 0.42];
  sunCol = sunCol.map((c) => c * (elev > -0.05 ? ss(-0.05, 0.08, elev) : 1));
  const skyAmb = mix([0.035, 0.045, 0.08], [0.42, 0.5, 0.62], day);
  const gndAmb = mix([0.02, 0.02, 0.025], [0.22, 0.2, 0.14], day);
  const fogCol = mix(skyHor, [0.62, 0.7, 0.78], day * 0.4);
  const tempestade = opts.tempestade || 0;

  // água
  const depth = Math.max(0, -camPos[1]);
  const lightLvl = (0.06 + 0.94 * day) * (1 - tempestade * 0.4);
  const shallow = [0.1, 0.34, 0.33], deep = [0.015, 0.07, 0.09];
  const wDepthT = 1 - Math.exp(-Math.max(0, depth - 5) / 70);
  const luzSol = 0.05 + 0.95 * Math.exp(-Math.max(0, depth - 8) / 55); // claro no raso, escurece só mais fundo
  let wFogCol = mix(shallow, deep, wDepthT).map((c) => c * lightLvl * luzSol);
  wFogCol = mix(wFogCol, [0.002, 0.005, 0.009], ss(60, 260, depth));
  if (depth > 3900) wFogCol = mix(wFogCol, [0.012, 0.006, 0.02], ss(3900, 4100, depth));
  const wFogDen = 0.026 + tempestade * 0.03 + ss(10, 80, depth) * 0.014 - ss(200, 800, depth) * 0.015;
  const under = camPos[1] < (opts.waterY ?? 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const expo = (under ? lerp(1.15, 1.9, ss(15, 200, depth)) : lerp(1.85, 1.0, day)) * (opts.exposure || 1);

  return {
    hour, day, dusk, sunDir: L, sunCol, skyTop, skyHor, skyAmb, gndAmb,
    fogCol: fogCol.map((c) => c * (1 - tempestade * 0.3)), fogDen: 0.0011 + tempestade * 0.004,
    under, wFogCol, wFogDen: Math.max(0.018, wFogDen), lightLvl,
    waterShallow: [0.06, 0.15, 0.12], waterDeep: [0.012, 0.045, 0.05],
    night: sat(night), cloud: 0.35 + tempestade * 0.6, waveAmp: 1 + tempestade * 3,
    expo, clear: under ? wFogCol.map((c) => Math.pow(c, 1 / 2.2)) : [0, 0, 0],
    depth,
  };
}
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
