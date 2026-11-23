// Áudio procedural (WebAudio): motor, ambiente de superfície (vento, pássaros, grilos),
// ambiente submerso abafado, estalos do casco, sonar, respingos, bolhas e efeitos cômicos.
// Sem arquivos externos: tudo sintetizado, então não há asset quebrado nem licença a checar.
export class Audio {
  constructor() { this.ctx = null; this.on = true; this.vol = 0.7; this.volBarulho = 1; }
  // volume geral e dos barulhos de ambiente (vento, água, bichos) — menu de configurações
  setVolumes(som, barulho) {
    this.vol = som; this.volBarulho = barulho;
    if (this.ctx) { this.master.gain.setTargetAtTime(som, this.ctx.currentTime, 0.05); this.amb.gain.setTargetAtTime(barulho, this.ctx.currentTime, 0.05); }
  }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    // filtro "debaixo d'água" no barramento de ambiente
    this.amb = c.createGain(); this.amb.gain.value = this.volBarulho; this.amb.connect(this.master);
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.connect(this.amb);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 + w * 0.08; }
    // vento / água ambiente
    this.wind = this.loopNoise(400, 0.5); this.windG = c.createGain(); this.windG.gain.value = 0; this.wind.out.connect(this.windG); this.windG.connect(this.lp);
    this.under = this.loopNoise(160, 1.2); this.underG = c.createGain(); this.underG.gain.value = 0; this.under.out.connect(this.underG); this.underG.connect(this.amb);
    // motor: serra filtrada + ruído
    this.motorOsc = c.createOscillator(); this.motorOsc.type = 'sawtooth'; this.motorOsc.frequency.value = 40;
    this.motorF = c.createBiquadFilter(); this.motorF.type = 'lowpass'; this.motorF.frequency.value = 300;
    this.motorG = c.createGain(); this.motorG.gain.value = 0;
    this.motorOsc.connect(this.motorF); this.motorF.connect(this.motorG); this.motorG.connect(this.master); this.motorOsc.start();
    this.nextBird = 0; this.nextCreak = 0; this.nextCricket = 0;
  }
  loopNoise(freq, q) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); s.start(); return { src: s, out: f, f };
  }
  blip(freq, dur, type = 'sine', gain = 0.2, slide = 0, dest = null) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // Buzina de carro: duas cornetas elétricas (disco vibrando) tocando juntas, um intervalo de terça.
  // Onda rica (serra + quadrada), saturada como um alto-falante de buzina e com as ressonâncias da corneta.
  // Toca enquanto segurar: buzinaLiga(chave, tipo, vol) / buzinaVol(chave, vol) / buzinaDesliga(chave).
  buzinaLiga(chave, tipo = 'carro', vol = 1) {
    if (!this.ctx || !this.on) return;
    this.buzinas ||= new Map();
    if (this.buzinas.has(chave)) { this.buzinaVol(chave, vol); return; }
    const c = this.ctx, t = c.currentTime;
    const P = {
      moto:        { f: [440, 554], wav: 'square', pico: [1800, 3200], lp: 4200, g: 0.16 },
      carro:       { f: [415, 494], wav: 'sawtooth', pico: [1500, 2900], lp: 5200, g: 0.2 },
      som:         { f: [370, 466, 554], wav: 'sawtooth', pico: [1300, 2600], lp: 5600, g: 0.2 },
      caminhonete: { f: [330, 415], wav: 'sawtooth', pico: [1100, 2400], lp: 4600, g: 0.22 },
      esportivo:   { f: [466, 587], wav: 'sawtooth', pico: [1700, 3300], lp: 6200, g: 0.18 },
    }[tipo];
    const out = c.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol, t + 0.02); out.connect(this.master);
    const fontes = [];
    if (!P) {
      // patinete: campainha "trim-trim" repetida enquanto segura
      const toca = () => { const t0 = c.currentTime; for (const [k, ff] of [[0, 2350], [0.11, 2350]]) for (const [h, gg] of [[1, 0.12], [2.76, 0.05], [5.4, 0.02]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = ff * h; const g = c.createGain(); g.gain.setValueAtTime(0, t0 + k); g.gain.linearRampToValueAtTime(gg, t0 + k + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t0 + k + 0.35); o.connect(g); g.connect(out); o.start(t0 + k); o.stop(t0 + k + 0.4); } };
      toca(); const id = setInterval(toca, 380);
      this.buzinas.set(chave, { out, fontes, id }); return;
    }
    // saturação (a buzina distorce um pouco: é o que dá o "fóóóm" metálico)
    const sat = c.createWaveShaper(); const n = 1024, curva = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curva[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); }
    sat.curve = curva; sat.oversample = '2x';
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 260; hp.Q.value = 0.7;
    const pk1 = c.createBiquadFilter(); pk1.type = 'peaking'; pk1.frequency.value = P.pico[0]; pk1.Q.value = 2.2; pk1.gain.value = 9;
    const pk2 = c.createBiquadFilter(); pk2.type = 'peaking'; pk2.frequency.value = P.pico[1]; pk2.Q.value = 3; pk2.gain.value = 7;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.lp; lp.Q.value = 0.5;
    const nivel = c.createGain(); nivel.gain.value = P.g;
    const mix = c.createGain(); mix.gain.value = 0.55 / P.f.length;
    mix.connect(sat); sat.connect(hp); hp.connect(pk1); pk1.connect(pk2); pk2.connect(lp); lp.connect(nivel); nivel.connect(out);
    for (const f of P.f) {
      for (const [w, d, gg] of [[P.wav, 0, 0.8], ['square', 3, 0.35]]) {
        const o = c.createOscillator(); o.type = w; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.04); o.detune.value = d;
        // tremidinha do diafragma
        const lfo = c.createOscillator(); lfo.frequency.value = 7 + Math.random() * 2; const lg = c.createGain(); lg.gain.value = f * 0.003; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t);
        const g = c.createGain(); g.gain.value = gg; o.connect(g); g.connect(mix); o.start(t); fontes.push(o, lfo);
      }
    }
    this.buzinas.set(chave, { out, fontes });
  }
  buzinaVol(chave, vol) { const b = this.buzinas?.get(chave); if (b && this.ctx) b.out.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05); }
  buzinaDesliga(chave) {
    const b = this.buzinas?.get(chave); if (!b || !this.ctx) return;
    this.buzinas.delete(chave);
    const t = this.ctx.currentTime;
    b.out.gain.cancelScheduledValues(t); b.out.gain.setValueAtTime(b.out.gain.value, t); b.out.gain.linearRampToValueAtTime(0, t + 0.07);
    if (b.id) clearInterval(b.id);
    for (const o of b.fontes) { try { o.stop(t + 0.1); } catch {} }
    setTimeout(() => b.out.disconnect(), 300);
  }
  noise(dur, freq, gain = 0.3, q = 1, dest = null) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  // atualização contínua
  update(dt, s) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const under = s.camDepth > 0.2;
    this.lp.frequency.setTargetAtTime(under ? 600 : 18000, t, 0.1);
    this.windG.gain.setTargetAtTime(under ? 0 : 0.05 + s.vento * 0.08, t, 0.4);
    this.wind.f.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 120, t, 0.5);
    this.underG.gain.setTargetAtTime(under ? 0.12 : 0, t, 0.3);
    const m = s.motor;
    this.motorG.gain.setTargetAtTime(m.on ? 0.04 + Math.abs(m.thr) * 0.08 : 0, t, 0.2);
    this.motorOsc.frequency.setTargetAtTime(32 + Math.abs(m.thr) * 55, t, 0.2);
    this.motorF.frequency.setTargetAtTime(under ? 220 + Math.abs(m.thr) * 300 : 400 + Math.abs(m.thr) * 900, t, 0.2);
    // pássaros de dia / grilos à noite (só na superfície)
    if (!under && s.dia > 0.5 && t > this.nextBird) { this.nextBird = t + 2 + Math.random() * 6; this.bird(); }
    if (!under && s.dia < 0.3 && t > this.nextCricket) { this.nextCricket = t + 0.25 + Math.random() * 0.4; this.blip(4200 + Math.random() * 300, 0.04, 'sine', 0.025, 0, this.amb); }
    // estalos do casco em profundidade ou sob estresse
    if (m.on && s.camDepth > 60 && t > this.nextCreak) {
      this.nextCreak = t + (s.estresse > 30 ? 0.6 : 5) + Math.random() * 6;
      this.creak(0.12 + s.estresse * 0.003);
    }
  }
  bird() { const f = 1800 + Math.random() * 1600; for (let k = 0; k < 3; k++) setTimeout(() => this.blip(f + k * 120, 0.09, 'sine', 0.04, 500, this.amb), k * 120); }
  creak(g = 0.15) { this.noise(0.7, 90 + Math.random() * 60, g, 8); this.blip(70 + Math.random() * 30, 0.6, 'triangle', g * 0.4, -20); }
  sonar() { this.blip(1150, 1.2, 'sine', 0.25); setTimeout(() => this.blip(1150, 0.8, 'sine', 0.06), 600); }
  splash(e = 1) { this.noise(1.2 + e * 0.5, 900, 0.4 * Math.min(1.5, e), 0.7); this.noise(0.5, 2500, 0.15, 1); }
  drip() { this.blip(1400 + Math.random() * 1200, 0.05, 'sine', 0.03, -600); }
  clank(e = 1) { this.blip(180, 0.4, 'square', 0.08 * e, -60); this.noise(0.3, 1200, 0.2 * e, 3); }
  claw() { this.blip(320, 0.12, 'square', 0.05, -120); setTimeout(() => this.blip(260, 0.08, 'square', 0.05), 120); }
  coin() { this.blip(988, 0.08, 'square', 0.06); setTimeout(() => this.blip(1319, 0.25, 'square', 0.06), 80); }
  erro() { this.blip(200, 0.25, 'square', 0.05, -60); }
  bonk() { this.blip(520, 0.25, 'triangle', 0.25, -380); this.noise(0.2, 2000, 0.15, 2); setTimeout(() => this.blip(1200, 0.6, 'sine', 0.06, -900), 120); }
  chomp() { for (let k = 0; k < 3; k++) setTimeout(() => { this.noise(0.12, 500, 0.35, 2); this.blip(140, 0.1, 'square', 0.12, -60); }, k * 160); setTimeout(() => this.blip(800, 0.9, 'sine', 0.1, -700), 520); }
  splat() { this.noise(0.35, 400, 0.4, 1.5); this.blip(160, 0.3, 'sine', 0.2, -100); }
  wash() { this.noise(1.6, 1600, 0.3, 0.5); }
  reel() { this.blip(2400 + Math.random() * 400, 0.02, 'square', 0.02); }
  bite() { this.noise(0.25, 1300, 0.3, 2); this.blip(600, 0.15, 'sine', 0.08, 300); }
  snap() { this.blip(2600, 0.08, 'square', 0.12, -2000); }
  alarm() { this.blip(880, 0.18, 'square', 0.07); setTimeout(() => this.blip(660, 0.18, 'square', 0.07), 200); }
  crane() { this.noise(1.5, 220, 0.06, 4); this.blip(90, 1.5, 'sawtooth', 0.02); }
}
