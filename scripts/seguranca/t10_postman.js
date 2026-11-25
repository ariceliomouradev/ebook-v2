// T10: confere a coleção do Postman SEM o Postman: sintaxe dos scripts de teste e replay de todos os pedidos
// contra o ambiente local (variáveis, ordem, cabeçalhos e corpos exatamente como estão na coleção).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sql, ok, SENHA } = require('./lib');

const raiz = path.resolve(__dirname, '..', '..');
const colecao = JSON.parse(fs.readFileSync(path.join(raiz, 'postman', 'Meus Livros API.postman_collection.json'), 'utf8'));
const ambiente = JSON.parse(fs.readFileSync(path.join(raiz, 'postman', 'Meus Livros - Local.postman_environment.json'), 'utf8'));
const falhas = [];
const ver = (c, m, d = '') => { if (c) ok(m); else { falhas.push(m + ' ' + d); console.log(`  FALHOU: ${m} ${d}`); } };

const vars = Object.fromEntries(ambiente.values.map((v) => [v.key, v.value]));
vars.email = 'leitor@e2e.test'; vars.senha = SENHA;
for (const v of colecao.variable) vars[v.key] = v.value;
const subst = (s) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : `{{${k}}}`));

// mini "pm" para rodar os scripts da coleção
function rodarTestes(item, resposta, corpoJson) {
  const resultados = [];
  const expect = (v) => {
    const o = {
      to: {
        eql: (x) => { if (JSON.stringify(v) !== JSON.stringify(x)) throw new Error(`esperado ${JSON.stringify(x)}, veio ${JSON.stringify(v)}`); },
        match: (re) => { if (!re.test(String(v))) throw new Error(`${v} não casa ${re}`); },
        include: (x) => { if (!(Array.isArray(v) ? v.includes(x) : String(v).includes(x))) throw new Error(`${v} não inclui ${x}`); },
        be: { a: (t) => { const tipo = Array.isArray(v) ? 'array' : typeof v; if (tipo !== t) throw new Error(`tipo ${tipo} != ${t}`); }, an: (t) => { const tipo = Array.isArray(v) ? 'array' : typeof v; if (tipo !== t) throw new Error(`tipo ${tipo} != ${t}`); } },
        have: { keys: (...ks) => { const k = Object.keys(v).sort().join(); if (k !== ks.sort().join()) throw new Error(`chaves ${k}`); } },
      },
    };
    o.to.include.keys = (...ks) => { for (const k of ks) if (!(k in v)) throw new Error(`falta a chave ${k}`); };
    o.to.include = Object.assign(o.to.include, {});
    return o;
  };
  const pm = {
    test: (nome, fn) => { try { fn(); resultados.push([nome, true]); } catch (e) { resultados.push([nome, false, e.message]); } },
    expect,
    response: {
      code: resposta.status,
      json: () => corpoJson,
      headers: { get: (n) => resposta.headers.get(n) },
      to: { have: { status: (s) => { if (resposta.status !== s) throw new Error(`status ${resposta.status} != ${s}`); } } },
    },
    collectionVariables: { set: (k, v) => { vars[k] = v; }, get: (k) => vars[k] },
  };
  const exec = (item.event || []).filter((e) => e.listen === 'test').flatMap((e) => e.script.exec).join('\n');
  vm.runInNewContext(exec, { pm }, { timeout: 2000 });
  return resultados;
}

function achatar(itens) { return itens.flatMap((i) => (i.item ? achatar(i.item) : [i])); }

(async () => {
  sql("UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'");
  sql('DELETE FROM tentativas_login');
  sql("DELETE FROM api_tokens WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@e2e.test')");

  const todos = achatar(colecao.item);
  // sintaxe de todos os scripts
  for (const it of todos) {
    const src = (it.event || []).flatMap((e) => e.script.exec).join('\n');
    try { new vm.Script(src || ''); } catch (e) { ver(false, `sintaxe do script de "${it.name}"`, e.message); }
  }
  ver(true, `${todos.length} pedidos na coleção; scripts de teste com sintaxe válida`);

  // ordem de execução como no Runner, mas "Sair" e "Renovar" por último para não matar o token antes
  const ordem = [...todos].sort((a, b) => (/Sair|Renovar/.test(a.name) ? 1 : 0) - (/Sair|Renovar/.test(b.name) ? 1 : 0));
  for (const it of ordem) {
    const r = it.request;
    const q = (r.url.query || []).filter((x) => !x.disabled && x.value !== undefined).map((x) => `${encodeURIComponent(x.key)}=${encodeURIComponent(subst(x.value))}`).join('&');
    const alvo = subst(r.url.raw.split('?')[0]) + (q ? '?' + q : '');
    const h = {};
    for (const x of r.header || []) if (!x.disabled) h[x.key] = subst(x.value);
    const semAuth = r.auth && r.auth.type === 'noauth';
    if (!semAuth && vars.access_token) h.Authorization = 'Bearer ' + vars.access_token;
    const corpo = r.body && r.body.mode === 'raw' ? subst(r.body.raw) : undefined;
    const res = await fetch(alvo, { method: r.method, headers: h, body: corpo, redirect: 'manual' });
    const buf = Buffer.from(await res.arrayBuffer());
    let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch (e) { /* binário */ }
    let testes;
    try { testes = rodarTestes(it, res, j); } catch (e) { testes = [[`script de "${it.name}"`, false, e.message]]; }
    for (const [nome, passou, msg] of testes) ver(passou, `${it.name}: ${nome}`, msg || `(status ${res.status})`);
    if (!testes.length) ver(res.status < 400, `${it.name}: respondeu ${res.status}`);
  }
  sql("DELETE FROM api_tokens WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@e2e.test')");
  sql('DELETE FROM tentativas_login');
  console.log(falhas.length ? `\nT10: ${falhas.length} FALHA(S)\n- ${falhas.join('\n- ')}` : '\nT10: coleção do Postman validada (todos os pedidos e testes)');
})().catch((e) => { console.error('ERRO NO T10', e); process.exit(1); });
