// Chat de voz por distância (WebRTC, de navegador para navegador).
// O servidor do jogo só repassa a "sinalização" (oferta, resposta e caminhos de rede) entre jogadores da mesma sala.
// Cada par de jogadores tem uma conexão; quem tem o slot "menor" (ordem alfabética) faz a oferta, o outro responde.
// M liga/desliga o SEU microfone. O volume de cada amigo depende da distância (some a partir de VOZ_ALCANCE).
import { VOZ_ALCANCE } from '../../shared/world.js';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Voz {
  constructor(net, meuSlot) {
    this.net = net; this.slot = meuSlot;
    this.peers = new Map(); // slot -> { pc, audio, tr, pend: [], pronto }
    this.mic = null;        // MediaStreamTrack do microfone (pedido só na 1ª vez que liga)
    this.ligado = false;
    this.disponivel = !!(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia) && net.mode === 'online';
    if (this.disponivel) net.on('voz', (de, d) => this.sinal(de, d).catch((e) => console.warn('[voz]', e.message)));
  }
  souOfertante(outro) { return this.slot < outro; }

  // liga/desliga o microfone; devolve { ok, msg }
  async alternar() {
    if (!this.disponivel) return { ok: false, msg: this.net.mode === 'online' ? 'Este navegador não tem chat de voz' : 'O chat de voz só funciona jogando com amigos (online)' };
    if (this.ligado) {
      this.ligado = false;
      if (this.mic) this.mic.enabled = false;
      return { ok: true, ligado: false };
    }
    if (!this.mic) {
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        this.mic = st.getAudioTracks()[0];
      } catch (e) {
        return { ok: false, msg: 'O navegador não deixou usar o microfone. Libere o microfone no cadeado ao lado do endereço do site.' };
      }
      for (const p of this.peers.values()) if (p.tr) p.tr.sender.replaceTrack(this.mic).catch(() => {});
    }
    this.mic.enabled = true; this.ligado = true;
    this.destravarAudio();
    return { ok: true, ligado: true };
  }
  // navegadores só tocam áudio depois de um clique/tecla: tenta tocar tudo de novo
  destravarAudio() { for (const p of this.peers.values()) p.audio?.play?.().catch(() => {}); }

  // chamado todo quadro: abre/fecha conexões conforme quem está na sala e ajusta o volume pela distância
  atualizar(remotos, minhaPos) {
    if (!this.disponivel) return;
    const agora = performance.now();
    for (const [slot, r] of Object.entries(remotos)) {
      if (!r.conectado) continue;
      let p = this.peers.get(slot);
      if (!p || ((p.pc.connectionState === 'failed' || p.pc.connectionState === 'closed') && agora - p.criado > 8000)) {
        if (p) this.fechar(slot);
        if (this.souOfertante(slot)) this.criar(slot, true).catch((e) => console.warn('[voz]', e.message));
        else if (!p || agora - (p.pedidoEm || 0) > 8000) { this.net.sinalVoz(slot, { pede: true }); if (p) p.pedidoEm = agora; else this.peers.set(slot, { pc: { connectionState: 'new' }, criado: agora, pedidoEm: agora, pend: [], vazio: true }); }
        p = this.peers.get(slot);
      }
      if (!p?.audio || !minhaPos) continue;
      const ip = r.posVoz || r.pos;
      const d = Math.hypot(ip[0] - minhaPos[0], ip[1] - minhaPos[1], ip[2] - minhaPos[2]);
      const perto = VOZ_ALCANCE * 0.45;
      const vol = d <= perto ? 1 : Math.max(0, 1 - (d - perto) / (VOZ_ALCANCE - perto));
      if (Math.abs(p.audio.volume - vol) > 0.01) p.audio.volume = vol;
      p.vol = vol;
    }
    for (const slot of [...this.peers.keys()]) if (!remotos[slot]) this.fechar(slot);
  }
  // quem está falando agora (nível de áudio recebido) e perto o bastante para ouvir
  falando() {
    const out = [];
    for (const [slot, p] of this.peers) {
      if (!p.tr || !(p.vol > 0.02)) continue;
      try {
        const s = p.tr.receiver.getSynchronizationSources?.()[0];
        if (s && s.audioLevel > 0.015 && performance.now() - (s.timestamp || 0) < 1500) out.push(slot);
      } catch { /* */ }
    }
    return out;
  }

  async criar(slot, ofertante) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { pc, pend: [], criado: performance.now(), audio: null, tr: null };
    this.peers.set(slot, p);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.sinalVoz(slot, { ice: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      if (!p.audio) {
        p.audio = new Audio(); p.audio.autoplay = true; p.audio.volume = 0;
        p.audio.style.display = 'none'; document.body.appendChild(p.audio);
      }
      p.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      p.audio.play().catch(() => {});
    };
    if (ofertante) {
      p.tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (this.mic) await p.tr.sender.replaceTrack(this.mic);
      await pc.setLocalDescription(await pc.createOffer());
      this.net.sinalVoz(slot, { sdp: pc.localDescription.toJSON() });
    }
    return p;
  }
  async sinal(de, d) {
    if (!this.disponivel || typeof de !== 'string') return;
    if (d.pede) { if (this.souOfertante(de)) { this.fechar(de); await this.criar(de, true); } return; }
    if (d.sdp?.type === 'offer') {
      this.fechar(de);
      const p = await this.criar(de, false);
      await p.pc.setRemoteDescription(d.sdp);
      p.tr = p.pc.getTransceivers()[0];
      if (p.tr) { p.tr.direction = 'sendrecv'; if (this.mic) await p.tr.sender.replaceTrack(this.mic); }
      await p.pc.setLocalDescription(await p.pc.createAnswer());
      this.net.sinalVoz(de, { sdp: p.pc.localDescription.toJSON() });
      p.pronto = true; for (const c of p.pend.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      return;
    }
    const p = this.peers.get(de); if (!p || p.vazio) return;
    if (d.sdp?.type === 'answer') {
      await p.pc.setRemoteDescription(d.sdp);
      p.pronto = true; for (const c of p.pend.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
    } else if (d.ice) {
      if (p.pronto) await p.pc.addIceCandidate(d.ice).catch(() => {}); else p.pend.push(d.ice);
    }
  }
  fechar(slot) {
    const p = this.peers.get(slot); if (!p) return;
    try { p.pc.close?.(); } catch { /* */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    this.peers.delete(slot);
  }
  encerrar() { for (const s of [...this.peers.keys()]) this.fechar(s); try { this.mic?.stop(); } catch { /* */ } }
}
