// Biblioteca de apoio dos testes de segurança (somente contra o ambiente LOCAL).
const { execFileSync } = require('child_process');
const BASE = process.env.PT_BASE || 'http://localhost/meus_livros/';
const SENHA = 'Senha@E2E1'; // senha de teste dos usuários @e2e.test (já está no repositório, em cypress/support/dados.js)
const MYSQL = 'C:\\xampp\\mysql\\bin\\mysql.exe';

class Client {
  constructor(nome = 'anon') { this.nome = nome; this.jar = {}; this.csrf = null; }
  cookieHeader() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  guardar(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    this.ultimosSetCookie = sc;
    for (const c of sc) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const k = par.slice(0, i), v = par.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970|max-age=0/i.test(c) || v === 'deleted') delete this.jar[k]; else this.jar[k] = v;
    }
  }
  async req(path, { method = 'GET', headers = {}, body, follow = false, timeout = 30000 } = {}) {
    const url = path.startsWith('http') ? path : BASE + path.replace(/^\//, '');
    const h = { ...headers };
    const ck = this.cookieHeader();
    if (ck) h.cookie = ck;
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method, headers: h, body, redirect: follow ? 'follow' : 'manual', signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      return { status: 0, erro: String(e), ms: Date.now() - t0, text: '', headers: new Headers() };
    }
    this.guardar(res);
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, text: buf.toString('utf8'), buf, ms: Date.now() - t0, location: res.headers.get('location') || '' };
  }
  form(path, campos, extraHeaders = {}) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(campos)) p.append(k, v);
    return this.req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...extraHeaders }, body: p.toString() });
  }
  async tokenDe(pagina = 'login') {
    const r = await this.req(pagina);
    const m = r.text.match(/name="csrf_token" value="([a-f0-9]{64})"/) || r.text.match(/"csrfToken":"([a-f0-9]{64})"/);
    return m ? m[1] : null;
  }
  async login(email, senha = SENHA) {
    const csrf = await this.tokenDe('login');
    const r = await this.form('api/auth.php', { csrf_token: csrf, email, senha });
    const home = await this.req('');
    const m = home.text.match(/"csrfToken":"([a-f0-9]{64})"/);
    this.csrf = m ? m[1] : null;
    return { loginStatus: r.status, location: r.location, logado: !!m };
  }
}

function sql(consulta) {
  const out = execFileSync(MYSQL, ['-u', 'root', 'biblioteca_pdf', '-N', '-B', '-e', consulta], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
}

const achados = [];
function achado(sev, id, titulo, evidencia, correcao) {
  achados.push({ sev, id, titulo, evidencia, correcao });
  console.log(`  [${sev}] ${id}: ${titulo}`);
}
const ok = (msg) => console.log(`  ok  ${msg}`);

module.exports = { Client, BASE, SENHA, sql, achados, achado, ok };
