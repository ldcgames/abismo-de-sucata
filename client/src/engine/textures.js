// Texturas procedurais (mesma técnica do WildLens): ruído "tileable" multicanal, casca com
// relevo (cor + mapa de normais), atlas de folhas desenhado em canvas e veio de madeira.
// Tudo gerado no navegador: nada de imagem externa.

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }

// ruído de gradiente periódico (repete a cada `per` células)
function tileNoise(S, per, seed) {
  const r = rng(seed), g = new Float32Array(per * per * 2);
  for (let i = 0; i < per * per; i++) { const a = r() * Math.PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x / S) * per, fy = (y / S) * per, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const gd = (i, j, dx, dy) => { const k = (((j % per) + per) % per * per + (((i % per) + per) % per)) * 2; return g[k] * dx + g[k + 1] * dy; };
    const a = gd(ix, iy, tx, ty) + (gd(ix + 1, iy, tx - 1, ty) - gd(ix, iy, tx, ty)) * fade(tx);
    const b = gd(ix, iy + 1, tx, ty - 1) + (gd(ix + 1, iy + 1, tx - 1, ty - 1) - gd(ix, iy + 1, tx, ty - 1)) * fade(tx);
    out[y * S + x] = a + (b - a) * fade(ty);
  }
  return out;
}
function tileFbm(S, per, oct, seed) {
  const out = new Float32Array(S * S);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { const n = tileNoise(S, per << o, seed + o * 17); for (let i = 0; i < S * S; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < S * S; i++) out[i] = Math.max(0, Math.min(1, out[i] / tot * 0.9 + 0.5));
  return out;
}
// Worley (células) periódico: distância ao ponto mais próximo — rachaduras, juntas, pedras
function tileWorley(S, per, seed) {
  const r = rng(seed), pts = new Float32Array(per * per * 2);
  for (let i = 0; i < per * per; i++) { pts[i * 2] = r(); pts[i * 2 + 1] = r(); }
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * per, v = (y / S) * per, iu = Math.floor(u), iv = Math.floor(v);
    let d1 = 9, d2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = iu + di, cj = iv + dj, k = ((((cj % per) + per) % per) * per + (((ci % per) + per) % per)) * 2;
      const px = ci + pts[k], py = cj + pts[k + 1], d = Math.hypot(px - u, py - v);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    out[y * S + x] = Math.min(1, (d2 - d1) * 1.4); // borda entre células (0 = junta)
  }
  return out;
}

function glTex(gl, w, h, data, { mip = true, repeat = true } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (data instanceof HTMLCanvasElement) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const w2 = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w2); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w2);
  const af = gl.getExtension('EXT_texture_filter_anisotropic');
  if (af) gl.texParameterf(gl.TEXTURE_2D, af.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return t;
}

export function buildTextures(gl) {
  const T = {};
  // ---- ruído geral RGBA (256, repete) ----
  {
    const S = 256, n1 = tileFbm(S, 4, 5, 11), n2 = tileFbm(S, 8, 4, 23), n3 = tileFbm(S, 16, 3, 37), w = tileWorley(S, 10, 51);
    const d = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { d[i * 4] = n1[i] * 255; d[i * 4 + 1] = n2[i] * 255; d[i * 4 + 2] = n3[i] * 255; d[i * 4 + 3] = w[i] * 255; }
    T.noise = glTex(gl, S, S, d);
  }
  // ---- casca: fissuras verticais (ruído anisotrópico) → cor + normais ----
  {
    const W = 256, H = 512;
    const aniso = (px, py, seed) => {
      const r = rng(seed), g = new Float32Array(px * py * 2);
      for (let i = 0; i < px * py; i++) { const a = r() * Math.PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
      const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = (x / W) * px, fy = (y / H) * py, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const gd = (i, j, dx, dy) => { const k = ((j % py) * px + (i % px)) * 2; return g[k] * dx + g[k + 1] * dy; };
        const a = gd(ix, iy, tx, ty) + (gd(ix + 1, iy, tx - 1, ty) - gd(ix, iy, tx, ty)) * fade(tx);
        const b = gd(ix, iy + 1, tx, ty - 1) + (gd(ix + 1, iy + 1, tx - 1, ty - 1) - gd(ix, iy + 1, tx, ty - 1)) * fade(tx);
        out[y * W + x] = a + (b - a) * fade(ty);
      }
      return out;
    };
    const a = aniso(14, 3, 91), b = aniso(28, 6, 92), c = aniso(56, 16, 93), dd = aniso(8, 8, 94), e = aniso(110, 40, 95);
    const hgt = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) {
      const ridge = 1 - Math.abs(a[k] * 1.2 + b[k] * 0.6 + dd[k] * 0.4);
      hgt[k] = Math.max(0, Math.min(1, Math.pow(Math.max(0, Math.min(1, ridge)), 2.2) * 0.85 + (c[k] * 0.5 + 0.5) * 0.25 + e[k] * 0.12));
    }
    const col = new Uint8Array(W * H * 4), nrm = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, h = hgt[k];
      const hl = hgt[y * W + ((x + W - 1) % W)], hr = hgt[y * W + ((x + 1) % W)], hd = hgt[((y + H - 1) % H) * W + x], hu = hgt[((y + 1) % H) * W + x];
      let nx = (hl - hr) * 4, ny = (hd - hu) * 4, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nrm[k * 4] = (nx * 0.5 + 0.5) * 255; nrm[k * 4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[k * 4 + 2] = (nz * 0.5 + 0.5) * 255; nrm[k * 4 + 3] = 255;
      const v = 0.18 + 0.82 * Math.pow(h, 0.8);
      col[k * 4] = v * 255; col[k * 4 + 1] = v * 255; col[k * 4 + 2] = v * 255; col[k * 4 + 3] = h * 255;
    }
    T.bark = glTex(gl, W, H, col); T.barkN = glTex(gl, W, H, nrm);
  }
  // ---- veio de madeira (R = veio longo, G = anéis, B = ruído) ----
  {
    const S = 256, n = tileFbm(S, 8, 4, 77), out = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, i = (y * S + x);
      const grain = 0.5 + 0.5 * Math.sin(u * 60 + n[i] * 6 + Math.sin(v * Math.PI * 4) * 1.5);
      const rings = 0.5 + 0.5 * Math.sin(Math.hypot(u - 0.5, v - 0.5) * 120 + n[i] * 8);
      out[i * 4] = grain * 255; out[i * 4 + 1] = rings * 255; out[i * 4 + 2] = n[i] * 255; out[i * 4 + 3] = 255;
    }
    T.wood = glTex(gl, S, S, out);
  }
  T.leaf = glTex(gl, 0, 0, leafAtlas(), { repeat: false });
  return T;
}

// Atlas de folhas 4×3 células (256 px). Alfa recorta o formato real das folhas.
//  0 copa larga · 1 ramo de pinheiro · 2 bétula · 3 capim · 4 samambaia · 5 arbusto · 6 capim com flores · 7 galhos secos · 8 alga
function leafAtlas() {
  const C = 256, cv = document.createElement('canvas'); cv.width = C * 4; cv.height = C * 3;
  const g = cv.getContext('2d'), r = rng(4242);
  const R = (a, b) => a + (b - a) * r();
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const leaf = (x, y, len, wid, ang, col, vein) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, len * 0.35, 0, len); g.quadraticCurveTo(-wid, len * 0.35, 0, 0);
    g.fillStyle = col; g.fill();
    if (vein) { g.strokeStyle = vein; g.lineWidth = Math.max(0.6, wid * 0.08); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len * 0.92); g.stroke(); }
    g.restore();
  };
  const cell = (ci, fn) => { g.save(); g.translate((ci % 4) * C, Math.floor(ci / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); fn(); g.restore(); };
  cell(0, () => {
    g.strokeStyle = '#4a3a26'; g.lineWidth = 2;
    for (let b = 0; b < 11; b++) {
      const a0 = -Math.PI / 2 + R(-1.3, 1.3), x = 128 + R(-20, 20), y = 250, L = R(110, 215);
      const ex = x + Math.cos(a0) * L, ey = y + Math.sin(a0) * L;
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
      for (let k = 0; k < 26; k++) {
        const t = R(0.2, 1), px = x + (ex - x) * t, py = y + (ey - y) * t, l = R(14, 23);
        leaf(px, py, l, l * 0.36, a0 - Math.PI / 2 + R(-1.3, 1.3) + (k & 1 ? 0.9 : -0.9), hsl(R(85, 112), R(38, 58), R(22, 38)), 'rgba(160,190,90,.35)');
      }
    }
  });
  cell(1, () => { // ramo de pinheiro: agulhas finas em volta de um galhinho
    for (let b = 0; b < 7; b++) {
      const x0 = R(40, 216), y0 = 250, L = R(150, 230), a = -Math.PI / 2 + R(-0.45, 0.45);
      const ex = x0 + Math.cos(a) * L, ey = y0 + Math.sin(a) * L;
      g.strokeStyle = '#3b2c1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
      for (let k = 0; k < 110; k++) {
        const t = r(), px = x0 + (ex - x0) * t, py = y0 + (ey - y0) * t, aa = a + (r() < 0.5 ? 1 : -1) * R(0.5, 1.2);
        const ln = R(10, 20) * (1.1 - t * 0.5);
        g.strokeStyle = hsl(R(118, 140), R(28, 42), R(14, 27)); g.lineWidth = R(1.5, 2.6);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(aa) * ln, py + Math.sin(aa) * ln); g.stroke();
      }
    }
  });
  cell(2, () => { // bétula: folhinhas claras e arredondadas
    g.strokeStyle = '#5a4630'; g.lineWidth = 1.5;
    for (let b = 0; b < 9; b++) {
      const x = R(30, 226), y = R(10, 40), L = R(150, 230), a = Math.PI / 2 + R(-0.4, 0.4);
      const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
      g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
      for (let k = 0; k < 18; k++) { const t = R(0.1, 1); leaf(x + (ex - x) * t, y + (ey - y) * t, R(12, 18), R(7, 10), a + R(-1.2, 1.2), hsl(R(70, 95), R(40, 60), R(32, 48)), 'rgba(220,240,160,.3)'); }
    }
  });
  cell(3, () => { // capim
    for (let k = 0; k < 70; k++) {
      const x = R(20, 236), h = R(120, 245), bend = R(-50, 50);
      g.strokeStyle = hsl(R(70, 100), R(35, 55), R(22, 42)); g.lineWidth = R(2, 4.5);
      g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x + bend * 0.3, 256 - h * 0.6, x + bend, 256 - h); g.stroke();
    }
  });
  cell(4, () => { // samambaia (fronde)
    g.strokeStyle = '#2f4a1c'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 255); g.quadraticCurveTo(132, 120, 128, 5); g.stroke();
    for (let k = 0; k < 34; k++) {
      const t = k / 34, y = 250 - t * 240, w = (1 - t) * 105 + 8;
      for (const s of [-1, 1]) leaf(128, y, w, 7 * (1 - t * 0.5), s * (Math.PI / 2 + 0.35), hsl(R(95, 115), R(40, 55), R(24, 34)), null);
    }
  });
  cell(5, () => { // arbusto: folhas densas
    for (let k = 0; k < 230; k++) { const x = R(10, 246), y = R(10, 246); if (Math.hypot(x - 128, y - 140) > 125) continue; leaf(x, y, R(16, 26), R(6, 10), R(0, 6.28), hsl(R(85, 115), R(35, 55), R(18, 34)), 'rgba(150,180,90,.3)'); }
  });
  cell(6, () => { // capim com flores
    for (let k = 0; k < 50; k++) { const x = R(20, 236), h = R(100, 230); g.strokeStyle = hsl(R(75, 100), 45, R(25, 40)); g.lineWidth = R(2, 3.5); g.beginPath(); g.moveTo(x, 256); g.quadraticCurveTo(x + R(-20, 20), 256 - h * 0.6, x + R(-30, 30), 256 - h); g.stroke(); }
    const cores = [[52, 95, 60], [0, 0, 96], [280, 50, 70], [20, 90, 60]];
    for (let k = 0; k < 26; k++) { const [h, s, l] = cores[k % 4]; const cx = R(30, 226), cy = R(30, 140); for (let p = 0; p < 5; p++) leaf(cx, cy, 10, 6, (p / 5) * 6.28, hsl(h, s, l), null); g.fillStyle = '#d9a514'; g.beginPath(); g.arc(cx, cy, 2.5, 0, 6.28); g.fill(); }
  });
  cell(7, () => { // galhos secos
    const br = (x, y, a, L, w, d) => { const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L; g.strokeStyle = '#3e3227'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke(); if (d < 4) { br(ex, ey, a - R(0.3, 0.7), L * 0.7, w * 0.65, d + 1); br(ex, ey, a + R(0.3, 0.7), L * 0.7, w * 0.65, d + 1); } };
    br(128, 255, -Math.PI / 2, 80, 6, 0);
  });
  cell(8, () => { // alga
    for (let k = 0; k < 9; k++) { const x0 = R(30, 226); g.strokeStyle = hsl(R(80, 110), R(40, 60), R(20, 32)); g.lineWidth = R(8, 16); g.beginPath(); g.moveTo(x0, 256); for (let y = 256; y > 0; y -= 20) g.lineTo(x0 + Math.sin(y * 0.05 + k) * 18, y); g.stroke(); }
  });
  return cv;
}
