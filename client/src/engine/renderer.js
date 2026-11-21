// Renderizador WebGL2: cena em grafo, materiais com iluminação física simplificada,
// sombras direcionais, água com refração por profundidade, céu procedural e partículas.
import { m4, quat } from './math.js';
import * as S from './shaders.js';
import { buildTextures } from './textures.js';

export class Node {
  constructor(name = '') {
    this.name = name; this.pos = [0, 0, 0]; this.quat = [0, 0, 0, 1]; this.scale = [1, 1, 1];
    this.children = []; this.parent = null; this.mesh = null; this.visible = true;
    this.world = m4.create(); this.local = m4.create();
  }
  add(...ns) { for (const n of ns) { if (n.parent) n.parent.remove(n); n.parent = this; this.children.push(n); } return this; }
  remove(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parent = null; }
  rot(pitch, yaw, roll = 0) { quat.fromEuler(this.quat, pitch, yaw, roll); return this; }
  at(x, y, z) { this.pos[0] = x; this.pos[1] = y; this.pos[2] = z; return this; }
  sc(s) { if (typeof s === 'number') this.scale = [s, s, s]; else this.scale = s; return this; }
  updateWorld(parent) {
    m4.compose(this.local, this.pos, this.quat, this.scale);
    if (parent) m4.mul(this.world, parent, this.local); else this.world.set(this.local);
    for (const c of this.children) c.updateWorld(this.world);
  }
  traverse(fn) { if (fn(this) === false) return; for (const c of this.children) c.traverse(fn); }
  worldPos(o = [0, 0, 0]) { o[0] = this.world[12]; o[1] = this.world[13]; o[2] = this.world[14]; return o; }
}

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 indisponível neste navegador');
    this.gl = gl;
    this.msaa = Math.min(opts.msaa ?? 4, gl.getParameter(gl.MAX_SAMPLES));
    this.shadowSize = opts.shadowSize ?? 2048;
    this.shadows = opts.shadows ?? true;
    this.pixelRatio = opts.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);
    this.stats = { draws: 0, tris: 0 };
    this.progs = {};
    const P = (name, vs, fs, defs = '') => { this.progs[name] = this.program(vs.replace('#version 300 es', '#version 300 es\n' + defs), fs.replace('#version 300 es', '#version 300 es\n' + defs)); };
    P('std', S.STD_VS, S.STD_FS);
    P('stdI', S.STD_VS, S.STD_FS, '#define INST\n');
    P('depth', S.STD_VS, S.DEPTH_FS);
    P('depthI', S.STD_VS, S.DEPTH_FS, '#define INST\n');
    P('sky', S.SKY_VS, S.SKY_FS);
    P('copy', S.COPY_VS, S.COPY_FS);
    P('water', S.WATER_VS, S.WATER_FS);
    P('part', S.PART_VS, S.PART_FS);
    P('tex', S.TEX_VS, S.TEX_FS);
    this.emptyVao = gl.createVertexArray();
    this.tex = buildTextures(gl);
    this.initShadow();
    this.initWater();
    this.partBuf = gl.createBuffer(); this.partVao = gl.createVertexArray();
    this.vp = m4.create(); this.invVP = m4.create(); this.shadowMat = m4.create();
    this.frustum = new Float32Array(24);
    this.w = 0; this.h = 0;
  }

  // ------------------------------------------------------------ programas
  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error(src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n')); throw new Error('Shader: ' + log); }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    const locs = new Map();
    return { p, loc: (n) => { if (!locs.has(n)) locs.set(n, gl.getUniformLocation(p, n)); return locs.get(n); } };
  }
  // programa especializado por material (sem ramificações no shader); compilado sob demanda
  stdProg(inst, kind) {
    if (kind === undefined || kind === null || kind < 0) return inst ? 'stdI' : 'std';
    const nome = (inst ? 'stdI_k' : 'std_k') + kind;
    if (!this.progs[nome]) {
      const defs = (inst ? '#define INST\n' : '') + `#define KFIX ${kind}\n`;
      this.progs[nome] = this.program(S.STD_VS.replace('#version 300 es', '#version 300 es\n' + defs), S.STD_FS.replace('#version 300 es', '#version 300 es\n' + defs));
    }
    return nome;
  }
  use(name) { const pr = this.progs[name]; if (this.cur !== pr) { this.gl.useProgram(pr.p); this.cur = pr; } return pr; }

  // ------------------------------------------------------------ malhas
  createMesh(geo, mat = {}, opts = {}) {
    const gl = this.gl;
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = (data, loc, size, type = gl.FLOAT) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, opts.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, false, 0, 0);
      return b;
    };
    const mesh = { vao, mat: { ...DEFAULT_MAT, ...mat }, inst: null, instCount: -1, bufs: {}, isMesh: true };
    mesh.bufs.p = buf(new Float32Array(geo.p), 0, 3);
    mesh.bufs.n = buf(new Float32Array(geo.n), 1, 3);
    mesh.bufs.c = buf(new Float32Array(geo.c), 2, 4);
    const uvSrc = geo.u && geo.u.length ? geo.u : geo.uv && geo.uv.length ? geo.uv : null;
    mesh.bufs.uv = buf(uvSrc ? new Float32Array(uvSrc) : new Float32Array((geo.p.length / 3) * 4), 3, 4);
    const big = geo.p.length / 3 > 65535;
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(geo.i) : new Uint16Array(geo.i), opts.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    mesh.ib = ib; mesh.itype = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; mesh.count = geo.i.length;
    const bd = geo.bounds ? geo.bounds() : { center: [0, 0, 0], radius: 1e6 };
    mesh.center = bd.center; mesh.radius = bd.radius;
    if (opts.instances) {
      const n = opts.instances;
      mesh.inst = new Float32Array(n * 16); mesh.instCol = new Float32Array(n * 4).fill(1);
      mesh.instMax = n; mesh.instCount = 0; mesh.instDirty = true;
      mesh.ibuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.inst, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(4 + k); gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, 64, k * 16); gl.vertexAttribDivisor(4 + k, 1); }
      mesh.icbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.icbuf);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.instCol, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(8, 1);
      mesh.instBound = opts.instBound || 1e6; // raio conservador para recorte
    } else {
      // atributos de instância desligados devem ter valores padrão
    }
    gl.bindVertexArray(null);
    return mesh;
  }
  updateMesh(mesh, geo) {
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.p), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs.n); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.n), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs.c); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.c), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs.uv); gl.bufferData(gl.ARRAY_BUFFER, geo.u && geo.u.length ? new Float32Array(geo.u) : new Float32Array((geo.p.length / 3) * 4), gl.DYNAMIC_DRAW);
    const big = geo.p.length / 3 > 65535;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(geo.i) : new Uint16Array(geo.i), gl.DYNAMIC_DRAW);
    mesh.itype = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; mesh.count = geo.i.length;
    gl.bindVertexArray(null);
  }
  setInstance(mesh, i, matrix, col = null) {
    mesh.inst.set(matrix, i * 16);
    if (col) mesh.instCol.set(col, i * 4);
    mesh.instDirty = true;
  }
  meshNode(geo, mat, name = '', opts) { const n = new Node(name); n.mesh = this.createMesh(geo, mat, opts); return n; }

  texture(canvasOrImg, mip = true) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasOrImg);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  updateTexture(t, canvas) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.generateMipmap(gl.TEXTURE_2D); }

  // ------------------------------------------------------------ alvos de renderização
  resize(w, h) {
    w = Math.max(2, Math.floor(w * this.pixelRatio)); h = Math.max(2, Math.floor(h * this.pixelRatio));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl;
    const del = (o, f) => o && gl[f](o);
    del(this.fboMS, 'deleteFramebuffer'); del(this.rbCol, 'deleteRenderbuffer'); del(this.rbDep, 'deleteRenderbuffer');
    del(this.fboRes, 'deleteFramebuffer'); del(this.texCol, 'deleteTexture'); del(this.texDep, 'deleteTexture');
    this.texCol = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texCol);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texDep = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.texDep);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fboRes = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboRes);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texCol, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.texDep, 0);
    this.fboMS = null;
    if (this.msaa > 1) {
      this.rbCol = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbCol);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.msaa, gl.RGBA8, w, h);
      this.rbDep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbDep);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.msaa, gl.DEPTH_COMPONENT24, w, h);
      this.fboMS = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMS);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.rbCol);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.rbDep);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { this.fboMS = null; this.msaa = 0; }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  initShadow() {
    const gl = this.gl, s = this.shadowSize;
    this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, s, s, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  initWater() {
    // malha radial: anéis com espaçamento crescente a partir da câmera
    const rings = 90, segs = 160, p = [], idx = [];
    p.push(0, 0, 0);
    let r = 0.6;
    const radii = [];
    for (let i = 0; i < rings; i++) { radii.push(r); r *= 1.075; r += 0.15; }
    for (const rr of radii) for (let j = 0; j < segs; j++) { const a = (j / segs) * Math.PI * 2; p.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < segs; j++) {
      const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
    const gl = this.gl;
    this.waterVao = gl.createVertexArray(); gl.bindVertexArray(this.waterVao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(p), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    this.waterCount = idx.length;
    gl.bindVertexArray(null);
    this.waterRadius = r;
  }

  // ------------------------------------------------------------ recorte por frustum
  buildFrustum(m) {
    const f = this.frustum;
    const planes = [[3, 0], [3, 0, -1], [3, 1], [3, 1, -1], [3, 2], [3, 2, -1]];
    for (let i = 0; i < 6; i++) {
      const [a, b, neg] = planes[i];
      const s = neg ? -1 : 1;
      let x = m[a] + s * m[b], y = m[a + 4] + s * m[b + 4], z = m[a + 8] + s * m[b + 8], w = m[a + 12] + s * m[b + 12];
      const l = Math.hypot(x, y, z); f[i * 4] = x / l; f[i * 4 + 1] = y / l; f[i * 4 + 2] = z / l; f[i * 4 + 3] = w / l;
    }
  }
  visible(c, r) {
    const f = this.frustum;
    for (let i = 0; i < 6; i++) if (f[i * 4] * c[0] + f[i * 4 + 1] * c[1] + f[i * 4 + 2] * c[2] + f[i * 4 + 3] < -r) return false;
    return true;
  }

  // ------------------------------------------------------------ desenho
  collect(root) {
    const opaque = [], trans = [], tex = [];
    const c = [0, 0, 0];
    const visit = (n) => {
      if (!n.visible) return;
      const me = n.mesh;
      if (me) {
        let ok = true;
        if (me.inst) { if (me.instCount <= 0) ok = false; }
        else {
          m4.xformPoint(n.world, me.center, c);
          const s = Math.max(Math.hypot(n.world[0], n.world[1], n.world[2]), Math.hypot(n.world[4], n.world[5], n.world[6]), Math.hypot(n.world[8], n.world[9], n.world[10]));
          ok = this.visible(c, me.radius * s);
        }
        if (ok) {
          const it = { n, me, d: 0 };
          if (me.mat.shader === 'tex') tex.push(it);
          else if (me.mat.opacity < 1 || me.mat.blend) { it.d = (c[0] - this.cam[0]) ** 2 + (c[1] - this.cam[1]) ** 2 + (c[2] - this.cam[2]) ** 2; trans.push(it); }
          else opaque.push(it);
        }
      }
      for (const ch of n.children) visit(ch);
    };
    visit(root);
    trans.sort((a, b) => b.d - a.d);
    opaque.sort((a, b) => ((a.me.mat.kind ?? -1) + (a.me.inst ? 100 : 0)) - ((b.me.mat.kind ?? -1) + (b.me.inst ? 100 : 0)));
    return { opaque, trans, tex };
  }

  setStdUniforms(pr, env) {
    const gl = this.gl;
    gl.uniformMatrix4fv(pr.loc('uViewProj'), false, this.vp);
    gl.uniform1f(pr.loc('uTime'), env.time);
    gl.uniform3fv(pr.loc('uCamPos'), this.cam);
    gl.uniform3fv(pr.loc('uSunDir'), env.sunDir); gl.uniform3fv(pr.loc('uSunCol'), env.sunCol);
    gl.uniform3fv(pr.loc('uSkyAmb'), env.skyAmb); gl.uniform3fv(pr.loc('uGndAmb'), env.gndAmb);
    gl.uniform1f(pr.loc('uUnder'), env.under ? 1 : 0);
    gl.uniform3fv(pr.loc('uWFogCol'), env.wFogCol); gl.uniform1f(pr.loc('uWFogDen'), env.wFogDen);
    gl.uniform3fv(pr.loc('uFogCol'), env.fogCol); gl.uniform1f(pr.loc('uFogDen'), env.fogDen);
    gl.uniform1f(pr.loc('uExpo'), env.expo);
    const sp = env.spots || [];
    gl.uniform1i(pr.loc('uNSpot'), Math.min(6, sp.length));
    for (let i = 0; i < Math.min(6, sp.length); i++) {
      gl.uniform3fv(pr.loc(`uSpotPos[${i}]`), sp[i].pos); gl.uniform3fv(pr.loc(`uSpotDir[${i}]`), sp[i].dir);
      gl.uniform3fv(pr.loc(`uSpotCol[${i}]`), sp[i].col); gl.uniform2f(pr.loc(`uSpotPar[${i}]`), sp[i].cos, sp[i].range);
    }
    const pt = env.points || [];
    gl.uniform1i(pr.loc('uNPt'), Math.min(10, pt.length));
    for (let i = 0; i < Math.min(10, pt.length); i++) {
      gl.uniform3fv(pr.loc(`uPtPos[${i}]`), pt[i].pos); gl.uniform3fv(pr.loc(`uPtCol[${i}]`), pt[i].col); gl.uniform1f(pr.loc(`uPtRange[${i}]`), pt[i].range);
    }
    gl.uniformMatrix4fv(pr.loc('uShadowMat'), false, this.shadowMat);
    gl.uniform1f(pr.loc('uShadowOn'), this.shadowActive ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(pr.loc('uShadow'), 0);
    this.bindMatTex(pr);
  }
  bindMatTex(pr) {
    const gl = this.gl, T = this.tex;
    [['uNoise', T.noise], ['uBark', T.bark], ['uBarkN', T.barkN], ['uLeaf', T.leaf], ['uWood', T.wood]].forEach(([n, t], i) => {
      gl.activeTexture(gl.TEXTURE3 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(pr.loc(n), 3 + i);
    });
  }

  drawItem(it, depthOnly = false) {
    const gl = this.gl, me = it.me, mt = me.mat;
    const inst = !!me.inst;
    const pr = this.use(depthOnly ? (inst ? 'depthI' : 'depth') : this.stdProg(inst, mt.kind));
    if (pr !== this.lastStd) { this.lastStd = pr; if (depthOnly) { gl.uniformMatrix4fv(pr.loc('uViewProj'), false, this.lightVP); gl.uniform1f(pr.loc('uTime'), this.env.time); this.bindMatTex(pr); } else this.setStdUniforms(pr, this.env); }
    gl.uniformMatrix4fv(pr.loc('uModel'), false, it.n.world);
    gl.uniform1f(pr.loc('uWind'), mt.wind || 0); gl.uniform1f(pr.loc('uSwim'), mt.swim || 0);
    gl.uniform1f(pr.loc('uKind'), mt.kind ?? -1); gl.uniform1f(pr.loc('uRust'), mt.rust ?? 0.5); gl.uniform1f(pr.loc('uTexScale'), mt.texScale ?? 1);
    if (!depthOnly) {
      gl.uniform3fv(pr.loc('uColor'), mt.color); gl.uniform3fv(pr.loc('uEmissive'), mt.emissive);
      gl.uniform1f(pr.loc('uRough'), mt.rough); gl.uniform1f(pr.loc('uMetal'), mt.metal);
      gl.uniform1f(pr.loc('uOpacity'), mt.opacity); gl.uniform1f(pr.loc('uDouble'), mt.doubleSide ? 1 : 0);
      gl.uniform1f(pr.loc('uCaust'), mt.caustics === false ? 0 : 1); gl.uniform1f(pr.loc('uGlow'), mt.glow ?? 1); gl.uniform1f(pr.loc('uVE'), mt.vertexEmissive === 2 ? 2 : mt.vertexEmissive ? 1 : 0);
    }
    if (mt.doubleSide) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(me.vao);
    if (inst) {
      if (me.instDirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, me.ibuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, me.inst, 0, me.instCount * 16);
        gl.bindBuffer(gl.ARRAY_BUFFER, me.icbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, me.instCol, 0, me.instCount * 4);
        me.instDirty = false;
      }
      gl.drawElementsInstanced(gl.TRIANGLES, me.count, me.itype, 0, me.instCount);
      this.stats.tris += me.count / 3 * me.instCount;
    } else {
      gl.vertexAttrib4f(8, 1, 1, 1, 0);
      gl.drawElements(gl.TRIANGLES, me.count, me.itype, 0);
      this.stats.tris += me.count / 3;
    }
    this.stats.draws++;
  }

  render(root, cam, env, extras = {}) {
    const gl = this.gl;
    this.env = env; this.cam = cam.pos;
    this.stats.draws = 0; this.stats.tris = 0;
    root.updateWorld(null);
    m4.mul(this.vp, cam.proj, cam.view);
    m4.invert(this.invVP, this.vp);
    this.buildFrustum(this.vp);

    // ---- sombras
    this.shadowActive = this.shadows && env.shadowOn && env.sunDir[1] > 0.05;
    if (this.shadowActive) {
      const c = env.shadowCenter, L = env.sunDir, R = env.shadowRadius || 60;
      const eye = [c[0] + L[0] * 200, c[1] + L[1] * 200, c[2] + L[2] * 200];
      const view = m4.lookAt(m4.create(), eye, c, Math.abs(L[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]);
      // estabiliza a sombra (encaixe em texel) para evitar tremulação
      const proj = m4.ortho(m4.create(), -R, R, -R, R, 10, 420);
      this.lightVP = m4.mul(m4.create(), proj, view);
      const texel = (2 * R) / this.shadowSize;
      const o = m4.xformPoint(this.lightVP, [0, 0, 0]);
      const sx = (o[0] * R) % texel, sy = (o[1] * R) % texel;
      this.lightVP[12] -= sx / R; this.lightVP[13] -= sy / R;
      this.shadowMat.set(this.lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      this.lastStd = null;
      const casters = [];
      root.traverse((n) => { if (!n.visible) return false; if (n.mesh && n.mesh.mat.castShadow) casters.push({ n, me: n.mesh }); });
      for (const it of casters) this.drawItem(it, true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---- passe principal (MSAA)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMS || this.fboRes);
    gl.viewport(0, 0, this.w, this.h);
    const cc = env.clear || [0, 0, 0];
    gl.clearColor(cc[0], cc[1], cc[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    this.cur = null; this.lastStd = null;
    if (!env.under) {
      const pr = this.use('sky');
      gl.uniformMatrix4fv(pr.loc('uInvVP'), false, this.invVP);
      this.skyUniforms(pr, env);
      gl.depthMask(false); gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    }
    const { opaque, trans, tex } = this.collect(root);
    this.lastStd = null;
    for (const it of opaque) this.drawItem(it);

    // ---- resolve MSAA → texturas (cor + profundidade)
    if (this.fboMS) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fboMS); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fboRes);
      gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.blitFramebuffer(0, 0, this.w, this.h, 0, 0, this.w, this.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    }
    // ---- cópia para a tela (com profundidade)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthFunc(gl.ALWAYS);
    let pr = this.use('copy');
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texCol); gl.uniform1i(pr.loc('uCol'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texDep); gl.uniform1i(pr.loc('uDep'), 2);
    gl.bindVertexArray(this.emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LEQUAL);

    // ---- água
    if (env.water !== false) {
      pr = this.use('water');
      gl.uniformMatrix4fv(pr.loc('uViewProj'), false, this.vp);
      const ox = Math.round(cam.pos[0] / 2) * 2, oz = Math.round(cam.pos[2] / 2) * 2;
      gl.uniform3f(pr.loc('uOrigin'), ox, 0, oz);
      gl.uniform1f(pr.loc('uTime'), env.time); gl.uniform1f(pr.loc('uWaveAmp'), env.waveAmp ?? 1);
      const rp = env.ripples || [];
      gl.uniform1i(pr.loc('uNRip'), Math.min(16, rp.length));
      for (let i = 0; i < Math.min(16, rp.length); i++) gl.uniform4fv(pr.loc(`uRip[${i}]`), rp[i]);
      gl.uniform3fv(pr.loc('uCamPos'), cam.pos); gl.uniform1f(pr.loc('uExpo'), env.expo);
      gl.uniform1f(pr.loc('uUnder'), env.under ? 1 : 0);
      gl.uniform2f(pr.loc('uRes'), this.w, this.h); gl.uniform1f(pr.loc('uNear'), cam.near); gl.uniform1f(pr.loc('uFar'), cam.far);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texCol); gl.uniform1i(pr.loc('uSceneCol'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texDep); gl.uniform1i(pr.loc('uSceneDep'), 2);
      gl.uniform3fv(pr.loc('uWaterShallow'), env.waterShallow); gl.uniform3fv(pr.loc('uWaterDeep'), env.waterDeep);
      gl.uniform3fv(pr.loc('uWFogCol'), env.wFogCol); gl.uniform1f(pr.loc('uWFogDen'), env.wFogDen);
      gl.uniform3fv(pr.loc('uFogCol'), env.fogCol); gl.uniform1f(pr.loc('uFogDen'), env.fogDen);
      gl.uniform1f(pr.loc('uLightLvl'), env.lightLvl);
      this.skyUniforms(pr, env);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.waterVao); gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_INT, 0);
      gl.enable(gl.CULL_FACE);
      this.stats.draws++;
    }

    // ---- transparentes
    gl.enable(gl.BLEND);
    this.lastStd = null; this.cur = null;
    for (const it of trans) {
      const add = it.me.mat.blend === 'add';
      gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(!!it.me.mat.depthWrite);
      this.drawItem(it);
    }
    gl.depthMask(true);
    // ---- texturizados (placas e nomes)
    if (tex.length) {
      pr = this.use('tex');
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(pr.loc('uViewProj'), false, this.vp);
      gl.uniform3fv(pr.loc('uCamRight'), [cam.view[0], cam.view[4], cam.view[8]]);
      gl.uniform3fv(pr.loc('uCamUp'), [cam.view[1], cam.view[5], cam.view[9]]);
      gl.disable(gl.CULL_FACE);
      for (const it of tex) {
        const mt = it.me.mat;
        gl.uniformMatrix4fv(pr.loc('uModel'), false, it.n.world);
        gl.uniform1f(pr.loc('uBill'), mt.billboard ? 1 : 0);
        gl.uniform1f(pr.loc('uOpacity'), mt.opacity); gl.uniform1f(pr.loc('uBright'), mt.bright ?? 1);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mt.tex); gl.uniform1i(pr.loc('uTex'), 1);
        if (mt.noDepth) gl.disable(gl.DEPTH_TEST);
        gl.bindVertexArray(it.me.vao); gl.drawElements(gl.TRIANGLES, it.me.count, it.me.itype, 0);
        if (mt.noDepth) gl.enable(gl.DEPTH_TEST);
        this.stats.draws++;
      }
      gl.enable(gl.CULL_FACE);
    }
    // ---- partículas
    if (extras.particles && extras.particles.count) this.drawParticles(extras.particles, cam);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  skyUniforms(pr, env) {
    const gl = this.gl;
    gl.uniform3fv(pr.loc('uSunDir'), env.sunDir); gl.uniform3fv(pr.loc('uSkyTop'), env.skyTop); gl.uniform3fv(pr.loc('uSkyHor'), env.skyHor);
    gl.uniform3fv(pr.loc('uSunCol'), env.sunCol); gl.uniform1f(pr.loc('uNight'), env.night); gl.uniform1f(pr.loc('uCloud'), env.cloud);
    gl.uniform1f(pr.loc('uTime'), env.time); gl.uniform1f(pr.loc('uExpo'), env.expo);
  }

  drawParticles(ps, cam) {
    const gl = this.gl;
    const pr = this.use('part');
    gl.uniformMatrix4fv(pr.loc('uViewProj'), false, this.vp);
    gl.uniform1f(pr.loc('uScaleY'), this.h / (2 * Math.tan(cam.fov / 2)));
    gl.bindVertexArray(this.partVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, ps.data.subarray(0, ps.count * 10), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    gl.depthMask(false);
    // primeiro as normais (alfa), depois as aditivas
    gl.uniform1f(pr.loc('uSoft'), 1);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, ps.countAlpha);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (ps.count > ps.countAlpha) gl.drawArrays(gl.POINTS, ps.countAlpha, ps.count - ps.countAlpha);
    gl.depthMask(true);
    this.stats.draws += 2;
  }
}

export const DEFAULT_MAT = { shader: 'std', color: [1, 1, 1], emissive: [0, 0, 0], rough: 0.8, metal: 0, opacity: 1, wind: 0, swim: 0, castShadow: true, doubleSide: false };
