// T11: roda a coleção do Postman contra um servidor REAL (ex.: produção) com uma conta de TESTE, sem tocar no banco.
// Uso (PowerShell):  $env:PT_EMAIL='...'; $env:PT_SENHA='...'; node scripts/seguranca/t11_postman_producao.js
// Variáveis: PT_EMAIL, PT_SENHA (obrigatórias), PT_AMBIENTE = arquivo do ambiente em postman/ (padrão: Producao).
// Nunca imprime a senha nem os tokens. Use só uma conta criada para o teste e apague-a depois.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..', '..');
const colecao = JSON.parse(fs.readFileSync(path.join(raiz, 'postman', 'Meus Livros API.postman_collection.json'), 'utf8'));
const ambiente = JSON.parse(fs.readFileSync(path.join(raiz, 'postman', process.env.PT_AMBIENTE || 'Meus Livros - Producao.postman_environment.json'), 'utf8'));
if (!process.env.PT_EMAIL || !process.env.PT_SENHA) { console.error('Defina PT_EMAIL e PT_SENHA.'); process.exit(2); }

const falhas = [];
let passou = 0;
const ver = (c, m, d = '') => { if (c) { passou++; console.log(`  ok  ${m}`); } else { falhas.push(m + ' ' + d); console.log(`  FALHOU: ${m} ${d}`); } };

const vars = Object.fromEntries(ambiente.values.map((v) => [v.key, v.value]));
vars.email = process.env.PT_EMAIL; vars.senha = process.env.PT_SENHA;
for (const v of colecao.variable) vars[v.key] = v.value;
const subst = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));

function rodarTestes(item, resposta, corpoJson) {
  const resultados = [];
  const expect = (v) => {
    const o = { to: {
      eql: (x) => { if (JSON.stringify(v) !== JSON.stringify(x)) throw new Error(`esperado ${JSON.stringify(x)}, veio ${JSON.stringify(v)}`); },
      match: (re) => { if (!re.test(String(v))) throw new Error('padrão não casou'); },
      include: (x) => { if (!(Array.isArray(v) ? v.includes(x) : String(v).includes(x))) throw new Error('não inclui'); },
      be: { a: (t) => { const tipo = Array.isArray(v) ? 'array' : typeof v; if (tipo !== t) throw new Error(`tipo ${tipo} != ${t}`); }, an: (t) => { const tipo = Array.isArray(v) ? 'array' : typeof v; if (tipo !== t) throw new Error(`tipo ${tipo} != ${t}`); } },
      have: { keys: (...ks) => { if (Object.keys(v).sort().join() !== ks.sort().join()) throw new Error('chaves diferentes'); } },
    } };
    o.to.include.keys = (...ks) => { for (const k of ks) if (!(k in v)) throw new Error(`falta a chave ${k}`); };
    return o;
  };
  const pm = {
    test: (nome, fn) => { try { fn(); resultados.push([nome, true]); } catch (e) { resultados.push([nome, false, e.message]); } },
    expect,
    response: { code: resposta.status, json: () => corpoJson, headers: { get: (n) => resposta.headers.get(n) }, to: { have: { status: (s) => { if (resposta.status !== s) throw new Error(`status ${resposta.status} != ${s}`); } } } },
    collectionVariables: { set: (k, v) => { vars[k] = v; }, get: (k) => vars[k] },
  };
  const exec = (item.event || []).filter((e) => e.listen === 'test').flatMap((e) => e.script.exec).join('\n');
  vm.runInNewContext(exec, { pm }, { timeout: 2000 });
  return resultados;
}
const achatar = (itens) => itens.flatMap((i) => (i.item ? achatar(i.item) : [i]));

(async () => {
  console.log(`Servidor: ${vars.base_url}`);
  const ordem = [...achatar(colecao.item)].sort((a, b) => (/Sair|Renovar/.test(a.name) ? 1 : 0) - (/Sair|Renovar/.test(b.name) ? 1 : 0));
  for (const it of ordem) {
    const r = it.request;
    const q = (r.url.query || []).filter((x) => !x.disabled && x.value !== undefined).map((x) => `${encodeURIComponent(x.key)}=${encodeURIComponent(subst(x.value))}`).join('&');
    const alvo = subst(r.url.raw.split('?')[0]) + (q ? '?' + q : '');
    const h = {};
    for (const x of r.header || []) if (!x.disabled) h[x.key] = subst(x.value);
    if (!(r.auth && r.auth.type === 'noauth') && vars.access_token) h.Authorization = 'Bearer ' + vars.access_token;
    const corpo = r.body && r.body.mode === 'raw' ? subst(r.body.raw) : undefined;
    const res = await fetch(alvo, { method: r.method, headers: h, body: corpo, redirect: 'manual' });
    const buf = Buffer.from(await res.arrayBuffer());
    let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch (e) { /* binário */ }
    let testes;
    try { testes = rodarTestes(it, res, j); } catch (e) { testes = [[`script de "${it.name}"`, false, e.message]]; }
    for (const [nome, ok2, msg] of testes) ver(ok2, `${it.name}: ${nome}`, msg || `(status ${res.status})`);
    if (it.name === 'Listar livros' && j) console.log(`      (${j.meta?.total} livros visíveis para a conta; primeiro livro: id ${vars.livro_id || '-'})`);
  }
  // o token novo (do refresh) ainda está ativo: revoga para não deixar rastro
  if (vars.access_token) await fetch(vars.base_url + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + vars.access_token } });
  console.log(falhas.length ? `\nT11: ${falhas.length} FALHA(S)\n- ${falhas.join('\n- ')}` : `\nT11: coleção inteira validada em ${vars.base_url} (${passou} verificações)`);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error('ERRO NO T11', e.message); process.exit(1); });
