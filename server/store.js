// Persistência em disco (JSON, gravação atômica: arquivo temporário → rename, com cópia .bak da versão anterior).
//   data/contas/<id>.json            conta do jogador (nome, cor, lista de salas, hash do token)
//   data/salas/<CÓDIGO>/sala.json    a sala: código fixo, nome, dono, semente do mundo, membros e a vaga de cada um
//   data/salas/<CÓDIGO>/<id>.json    o progresso daquele jogador NAQUELA sala (cada sala é um "save" separado)
// Em produção, aponte DATA_DIR para um disco persistente (ver README).
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newProfile, migrateProfile } from '../shared/rules.js';

const ID_OK = /^[a-z0-9]{16,40}$/;
const CODE_OK = /^[A-Z2-9]{6}$/;
const ALFA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class Store {
  constructor(dir) {
    this.dir = dir;
    fss.mkdirSync(path.join(dir, 'contas'), { recursive: true });
    fss.mkdirSync(path.join(dir, 'salas'), { recursive: true });
    this.contas = new Map();   // id -> { tokenHash, conta }
    this.salas = new Map();    // code -> meta
    this.perfis = new Map();   // code/id -> profile
    this.chains = new Map();
  }
  static hash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

  // ---------- arquivos ----------
  fConta(id) { if (!ID_OK.test(id)) throw new Error('id inválido'); return path.join(this.dir, 'contas', id + '.json'); }
  fSala(code) { if (!CODE_OK.test(code)) throw new Error('código inválido'); return path.join(this.dir, 'salas', code, 'sala.json'); }
  fPerfil(code, id) { if (!CODE_OK.test(code) || !ID_OK.test(id)) throw new Error('id inválido'); return path.join(this.dir, 'salas', code, id + '.json'); }
  async lerJson(f) {
    for (const x of [f, f + '.bak']) { try { return JSON.parse(await fs.readFile(x, 'utf8')); } catch { /* tenta o backup */ } }
    return null;
  }
  // grava em fila por arquivo para que duas gravações nunca se cruzem
  gravar(f, obterDados) {
    const prev = this.chains.get(f) || Promise.resolve();
    const next = prev.then(async () => {
      const dados = obterDados(); if (!dados) return;
      await fs.mkdir(path.dirname(f), { recursive: true });
      const tmp = f + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(dados));
      try { await fs.copyFile(f, f + '.bak'); } catch { /* primeira gravação */ }
      await fs.rename(tmp, f);
    }).catch((e) => console.error('[store] falha ao salvar', f, e.message));
    this.chains.set(f, next);
    return next;
  }

  // ---------- contas ----------
  async criarConta(nome, cor) {
    const id = crypto.randomBytes(12).toString('hex');
    const token = crypto.randomBytes(24).toString('base64url');
    const conta = { id, nome: nome || 'Explorador', cor: cor || 0, salas: [], criadaEm: Date.now() };
    this.contas.set(id, { tokenHash: Store.hash(token), conta });
    await this.salvarConta(id);
    return { id, token, conta };
  }
  async carregarConta(id, token) {
    let rec = this.contas.get(id);
    if (!rec) {
      try { rec = await this.lerJson(this.fConta(id)); } catch { return null; }
      if (!rec) return null;
      if (!rec.conta) rec.conta = { id, nome: rec.profile?.nome || 'Explorador', cor: rec.profile?.cor || 0, salas: [] }; // formato antigo
      rec.conta.salas ||= [];
      this.contas.set(id, rec);
    }
    if (rec.tokenHash !== Store.hash(token)) return null;
    return rec.conta;
  }
  salvarConta(id) { return this.gravar(this.fConta(id), () => { const r = this.contas.get(id); return r && { tokenHash: r.tokenHash, conta: r.conta }; }); }

  // ---------- salas ----------
  async novoCodigo() {
    for (;;) {
      let c = ''; for (let i = 0; i < 6; i++) c += ALFA[crypto.randomInt(ALFA.length)];
      if (this.salas.has(c)) continue;
      try { await fs.access(this.fSala(c)); continue; } catch { return c; }
    }
  }
  async criarSala(conta) {
    const code = await this.novoCodigo();
    const minhas = conta.salas.filter((c) => this.salas.get(c)?.dono === conta.id).length;
    const meta = { code, nome: `Sala ${minhas + 1}`, dono: conta.id, donoNome: conta.nome, seed: crypto.randomInt(1, 1e6), criadaEm: Date.now(), tempoJogo: 0, membros: {} };
    this.salas.set(code, meta);
    await this.salvarSala(code);
    return meta;
  }
  async carregarSala(code) {
    if (this.salas.has(code)) return this.salas.get(code);
    let meta = null; try { meta = await this.lerJson(this.fSala(code)); } catch { return null; }
    if (meta) this.salas.set(code, meta);
    return meta;
  }
  salvarSala(code) { return this.gravar(this.fSala(code), () => this.salas.get(code)); }

  // ---------- progresso de um jogador numa sala ----------
  async carregarPerfil(code, conta) {
    const k = code + '/' + conta.id;
    if (this.perfis.has(k)) return this.perfis.get(k);
    let p = await this.lerJson(this.fPerfil(code, conta.id));
    p = p ? migrateProfile(p) : newProfile(conta.id, conta.nome);
    this.perfis.set(k, p);
    return p;
  }
  // lê o progresso sem guardar em memória (para a lista de salas)
  async espiarPerfil(code, id) {
    const k = code + '/' + id;
    if (this.perfis.has(k)) return this.perfis.get(k);
    try { const p = await this.lerJson(this.fPerfil(code, id)); return p ? migrateProfile(p) : null; } catch { return null; }
  }
  salvarPerfil(code, id) { return this.gravar(this.fPerfil(code, id), () => this.perfis.get(code + '/' + id)); }
}
