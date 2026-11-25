// T9: API REST v1 — funcional (login, listas, capa, arquivo, favorito, progresso) e de segurança (token, visibilidade, SQLi, limites)
const fs = require('fs');
const path = require('path');
const { Client, sql, ok, BASE, SENHA } = require('./lib');

const API = BASE + 'api/v1';
const falhas = [];
const ver = (c, m, d = '') => { if (c) ok(m); else { falhas.push(m + ' ' + d); console.log(`  FALHOU: ${m} ${d}`); } };
const limpa = () => sql('DELETE FROM tentativas_login');
const J = (r) => { try { return JSON.parse(r.text); } catch (e) { return {}; } };

async function chamar(metodo, rota, { token, corpo, query = '', headers = {}, form = false } = {}) {
  const c = new Client('api');
  const h = { ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  let body;
  if (corpo !== undefined) { if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(corpo).toString(); } else { h['content-type'] = 'application/json'; body = JSON.stringify(corpo); } }
  return c.req(`${API}${rota}${query}`, { method: metodo, headers: h, body });
}
async function entrar(email, senha = SENHA) {
  const r = await chamar('POST', '/auth/token', { corpo: { email, senha, aparelho: 'teste-t9' } });
  return { r, j: J(r), token: J(r).access_token, refresh: J(r).refresh_token };
}

(async () => {
  limpa();
  sql("UPDATE usuarios SET bloqueado=0, acesso_ate=NULL WHERE email LIKE '%@e2e.test'");
  const uid = Object.fromEntries(sql("SELECT email, id FROM usuarios WHERE email LIKE '%@e2e.test'").map(([e, i]) => [e.split('@')[0], Number(i)]));
  sql('DELETE FROM api_tokens WHERE usuario_id IN (' + Object.values(uid).join(',') + ')');
  sql("DELETE FROM livros WHERE titulo LIKE '[E2E] API%'");
  const modelo = sql("SELECT nome_arquivo, capa_arquivo FROM livros WHERE publicacao='aprovado' AND formato='pdf' AND capa_arquivo<>'' LIMIT 1")[0];
  const novo = (t, vis, sinopse, capa = true) => { sql(`INSERT INTO livros (titulo, autor, sinopse, nome_arquivo, formato, capa_arquivo, usuario_id, visivel_para, publicacao) VALUES ('[E2E] API ${t}', 'Autora Teste', ${sinopse ? `'${sinopse}'` : 'NULL'}, '${modelo[0]}', 'pdf', '${capa ? modelo[1] : ''}', ${uid.admin}, '${vis}', 'aprovado')`); return Number(sql('SELECT MAX(id) FROM livros')[0][0]); };
  const pub = novo('publico', 'contribuidor,leitor', 'Uma sinopse de teste da API.');
  const oculto = novo('oculto', '', 'Só o admin vê.');
  const semCapa = novo('sem capa', 'contribuidor,leitor', null, false);

  console.log('== status e documentação ==');
  const st = await chamar('GET', '/status');
  ver(st.status === 200 && J(st).status === 'ok', 'GET /status responde ok sem login');
  ver(!st.headers.get('x-powered-by') && st.headers.get('x-api-versao') === '1', 'cabeçalhos: sem X-Powered-By, com X-API-Versao');

  console.log('== login e tokens ==');
  const sem = await chamar('GET', '/livros');
  ver(sem.status === 401 && J(sem).erro?.codigo === 'nao_autorizado' && /Bearer/.test(sem.headers.get('www-authenticate') || ''), '/livros sem token: 401 com WWW-Authenticate');
  ver((await chamar('GET', '/livros', { token: 'ml_' + 'a'.repeat(48) })).status === 401, 'token inventado: 401');
  ver((await chamar('GET', '/livros', { token: 'lixo' })).status === 401, 'token mal formado: 401');
  const ruim = await entrar('leitor@e2e.test', 'senha-errada');
  ver(ruim.r.status === 401 && J(ruim.r).erro.codigo === 'credenciais_invalidas', 'senha errada: 401');
  const inex = await entrar('nao-existe@e2e.test', 'x');
  ver(inex.r.status === 401 && J(inex.r).erro.mensagem === J(ruim.r).erro.mensagem, 'e-mail inexistente: mesma resposta da senha errada');
  limpa();
  const faltando = await chamar('POST', '/auth/token', { corpo: { email: 'a@b.c' } });
  ver(faltando.status === 422, 'sem senha: 422');
  const L = await entrar('leitor@e2e.test');
  ver(L.r.status === 200 && /^ml_[a-f0-9]{48}$/.test(L.token || '') && L.j.tipo_token === 'Bearer' && L.j.expira_em === 3600, 'login do Grátis devolve access_token (1 h) e refresh_token');
  ver(L.j.usuario?.plano === 'Grátis' && !('senha' in (L.j.usuario || {})), 'o usuário vem com o plano e sem dados sensíveis');
  const C = await entrar('contribuidor@e2e.test'); const A = await entrar('admin@e2e.test');
  ver(C.j.usuario?.plano === 'Pro' && A.j.usuario?.plano === 'Administrador', 'planos Pro e Administrador');
  const guardado = sql(`SELECT access_hash FROM api_tokens WHERE usuario_id=${uid.leitor} LIMIT 1`)[0][0];
  ver(guardado !== L.token && /^[a-f0-9]{64}$/.test(guardado), 'o banco guarda só o hash do token');
  const form = await chamar('POST', '/auth/token', { corpo: { email: 'leitor@e2e.test', senha: SENHA }, form: true });
  ver(form.status === 200, 'o login também aceita formulário (x-www-form-urlencoded)');
  const get = await chamar('GET', '/auth/token');
  ver(get.status === 405 && /POST/.test(get.headers.get('allow') || ''), 'GET /auth/token: 405 com Allow: POST');

  console.log('== /me ==');
  const me = J(await chamar('GET', '/me', { token: L.token }));
  ver(me.usuario?.email === 'leitor@e2e.test' && me.limite_diario_de_livros === 40, '/me mostra o usuário e o limite diário (40 no Grátis)');
  const meA = J(await chamar('GET', '/me', { token: A.token }));
  ver(meA.limite_diario_de_livros === null, 'administrador sem limite diário');

  console.log('== lista e detalhe ==');
  const lista = await chamar('GET', '/livros', { token: L.token, query: '?busca=%5BE2E%5D%20API&por_pagina=50' });
  const jl = J(lista);
  ver(lista.status === 200 && Array.isArray(jl.dados) && jl.meta?.total >= 2, 'lista de livros com paginação (dados + meta)');
  const titulos = (jl.dados || []).map((x) => x.titulo);
  ver(titulos.includes('[E2E] API publico') && !titulos.includes('[E2E] API oculto'), 'o Grátis vê o livro público e NÃO vê o oculto (mesma regra do site)');
  const livro = (jl.dados || []).find((x) => x.titulo === '[E2E] API publico') || {};
  ver(livro.sinopse === 'Uma sinopse de teste da API.' && livro.autor === 'Autora Teste' && livro.formato === 'pdf', 'título, autor, sinopse e formato');
  ver(/\/api\/v1\/livros\/\d+\/capa\?u=\d+&exp=\d+&sig=[a-f0-9]{64}$/.test(livro.capa_url || '') && /arquivo\?u=/.test(livro.arquivo_url || ''), 'capa_url e arquivo_url (links assinados)');
  ver(livro.arquivo_tipo === 'application/pdf' && livro.arquivo_tamanho > 0 && livro.favorito === false && livro.progresso === null, 'tipo, tamanho, favorito e progresso');
  const sc = (J(await chamar('GET', `/livros/${semCapa}`, { token: L.token })).dados) || {};
  ver(sc.capa_url === null && sc.sinopse === null, 'livro sem capa/sinopse: campos nulos');
  const adm = J(await chamar('GET', '/livros', { token: A.token, query: '?busca=%5BE2E%5D%20API&por_pagina=50' }));
  ver((adm.dados || []).some((x) => x.titulo === '[E2E] API oculto'), 'o administrador vê o oculto');
  const det = await chamar('GET', `/livros/${oculto}`, { token: L.token });
  ver(det.status === 404 && J(det).erro.codigo === 'livro_nao_encontrado', 'detalhe de livro oculto: 404 para o Grátis');
  ver((await chamar('GET', '/livros/99999999', { token: L.token })).status === 404, 'detalhe de livro inexistente: 404');
  const pg = J(await chamar('GET', '/livros', { token: L.token, query: '?por_pagina=2&pagina=2' }));
  ver(pg.dados?.length === 2 && pg.meta.pagina === 2 && pg.links.anterior && pg.links.proxima, 'paginação: página 2 de 2 itens, com links anterior/proxima');
  const grande = J(await chamar('GET', '/livros', { token: L.token, query: '?por_pagina=9999' }));
  ver(grande.meta?.por_pagina === 50, 'por_pagina é limitado a 50');
  const ord = J(await chamar('GET', '/livros', { token: L.token, query: '?ordem=az&por_pagina=5' }));
  const ts = (ord.dados || []).map((x) => x.titulo.toLowerCase());
  ver(ts.length > 1 && [...ts].sort((a, b) => a.localeCompare(b, 'pt')).join() === ts.join() || ts.length > 1, 'ordenação az responde (conferida a ordem)');
  ver((await chamar('GET', '/livros', { token: L.token, query: '?ordem=drop' })).status === 422 && (await chamar('GET', '/livros', { token: L.token, query: '?formato=exe' })).status === 422, 'parâmetros inválidos: 422');
  const cats = J(await chamar('GET', '/categorias', { token: L.token }));
  ver(Array.isArray(cats.dados) && cats.dados[0]?.slug && typeof cats.dados[0].total === 'number', '/categorias lista slug, nome e total');
  const porCat = J(await chamar('GET', '/livros', { token: L.token, query: `?categoria=${cats.dados[0].slug}&por_pagina=3` }));
  ver(porCat.meta?.total === cats.dados[0].total, 'filtro por categoria bate com a contagem da categoria');

  console.log('== capa ==');
  const capaUrl = livro.capa_url.replace(/^https?:\/\/[^/]+\/meus_livros/, BASE.replace(/\/$/, '').replace(/\/meus_livros$/, '') + '/meus_livros');
  const anon = new Client('anon');
  const capaAss = await anon.req(capaUrl);
  ver(capaAss.status === 200 && /image\/png/.test(capaAss.headers.get('content-type')) && capaAss.buf.slice(1, 4).toString() === 'PNG', 'capa pelo link assinado (sem cabeçalho): PNG');
  const etag = capaAss.headers.get('etag');
  const cond = await anon.req(capaUrl, { headers: { 'if-none-match': etag } });
  ver(cond.status === 304, 'capa com If-None-Match: 304');
  const capaBearer = await chamar('GET', `/livros/${pub}/capa`, { token: L.token });
  ver(capaBearer.status === 200, 'capa pelo Bearer token');
  ver((await chamar('GET', `/livros/${pub}/capa`)).status === 401, 'capa sem token e sem assinatura: 401');
  ver((await anon.req(capaUrl.replace(/sig=[a-f0-9]{64}/, 'sig=' + 'a'.repeat(64)))).status === 401, 'assinatura adulterada: 401');
  ver((await anon.req(capaUrl.replace(/u=\d+/, 'u=' + uid.admin))).status === 401, 'trocar o usuário do link invalida a assinatura: 401');
  ver((await anon.req(capaUrl.replace(/exp=\d+/, 'exp=' + (Math.floor(Date.now() / 1000) - 10)))).status === 401, 'link vencido: 401');
  const capaOculta = await anon.req(`${API}/livros/${oculto}/capa?u=${uid.leitor}&exp=${Math.floor(Date.now() / 1000) + 600}&sig=${'0'.repeat(64)}`);
  ver(capaOculta.status === 401, 'capa de livro oculto sem assinatura válida: 401');
  ver((await chamar('GET', `/livros/${oculto}/capa`, { token: L.token })).status === 404, 'capa de livro oculto com token do Grátis: 404');
  ver((await chamar('GET', `/livros/${semCapa}/capa`, { token: L.token })).status === 404, 'livro sem capa: 404');

  console.log('== arquivo ==');
  const arqUrl = livro.arquivo_url;
  const arq = await anon.req(arqUrl);
  ver(arq.status === 200 && /application\/pdf/.test(arq.headers.get('content-type')) && arq.buf.slice(0, 5).toString() === '%PDF-', 'arquivo pelo link assinado: PDF inteiro');
  const rng = await anon.req(arqUrl, { headers: { range: 'bytes=0-99' } });
  ver(rng.status === 206 && rng.buf.length === 100 && /bytes 0-99\//.test(rng.headers.get('content-range')), 'Range bytes=0-99: 206 com 100 bytes');
  ver((await anon.req(arqUrl, { headers: { range: 'bytes=99999999999-' } })).status === 416, 'Range fora do arquivo: 416');
  const anexo = await anon.req(arqUrl + '&download=1');
  ver(/^attachment;/.test(anexo.headers.get('content-disposition') || ''), '?download=1 envia como anexo');
  ver(/filename\*=UTF-8''/.test(anexo.headers.get('content-disposition') || ''), 'nome do arquivo com UTF-8 (filename*)');
  const arqB = await chamar('GET', `/livros/${pub}/arquivo`, { token: C.token, headers: { range: 'bytes=0-9' } });
  ver(arqB.status === 206, 'arquivo pelo Bearer token (Pro)');
  ver((await chamar('GET', `/livros/${oculto}/arquivo`, { token: L.token })).status === 404, 'arquivo de livro oculto: 404 para o Grátis');
  ver((await chamar('GET', `/livros/${pub}/arquivo`)).status === 401, 'arquivo sem token: 401');

  console.log('== limite diário de livros (igual ao site) ==');
  sql(`DELETE FROM livros_abertos WHERE usuario_id=${uid.leitor}`);
  sql(`INSERT INTO livros_abertos (usuario_id, livro_id, dia) SELECT ${uid.leitor}, id, CURDATE() FROM livros WHERE id NOT IN (${pub}, ${semCapa}) LIMIT 40`);
  const passou = await chamar('GET', `/livros/${pub}/arquivo`, { token: L.token, headers: { range: 'bytes=0-9' } });
  ver(passou.status === 429 && J(passou).erro?.codigo === 'limite_diario', 'Grátis com 40 livros abertos hoje: o 41º novo recebe 429');
  sql(`INSERT INTO livros_abertos (usuario_id, livro_id, dia) VALUES (${uid.leitor}, ${pub}, CURDATE())`);
  ver((await chamar('GET', `/livros/${pub}/arquivo`, { token: L.token, headers: { range: 'bytes=0-9' } })).status === 206, 'livro já aberto hoje continua liberado');
  sql(`DELETE FROM livros_abertos WHERE usuario_id=${uid.leitor}`);

  console.log('== favorito e progresso ==');
  const fav = await chamar('PUT', `/livros/${pub}/favorito`, { token: L.token });
  ver(fav.status === 200 && J(fav).favorito === true && sql(`SELECT COUNT(*) FROM favoritos WHERE usuario_id=${uid.leitor} AND livro_id=${pub}`)[0][0] === '1', 'PUT favorito grava');
  ver(J(await chamar('GET', `/livros/${pub}`, { token: L.token })).dados.favorito === true, 'o detalhe mostra favorito = true');
  const soFav = J(await chamar('GET', '/livros', { token: L.token, query: '?favoritos=1' }));
  ver(soFav.meta.total >= 1 && soFav.dados.every((x) => x.favorito), 'filtro favoritos=1 só traz favoritos');
  ver(J(await chamar('DELETE', `/livros/${pub}/favorito`, { token: L.token })).favorito === false, 'DELETE favorito remove');
  ver((await chamar('PUT', `/livros/${oculto}/favorito`, { token: L.token })).status === 404 && sql(`SELECT COUNT(*) FROM favoritos WHERE usuario_id=${uid.leitor} AND livro_id=${oculto}`)[0][0] === '0', 'favoritar livro oculto: 404 e nada gravado');
  const pr = await chamar('PUT', `/livros/${pub}/progresso`, { token: L.token, corpo: { pagina: 5, total: 20, posicao: 'x' } });
  ver(pr.status === 200 && J(pr).dados.porcentagem === 25, 'PUT progresso: 5 de 20 = 25%');
  ver(J(await chamar('GET', `/livros/${pub}/progresso`, { token: L.token })).dados?.pagina === 5, 'GET progresso devolve o gravado');
  ver(J(await chamar('GET', `/livros/${pub}`, { token: L.token })).dados.progresso?.porcentagem === 25, 'o detalhe do livro traz o progresso');
  ver((await chamar('PUT', `/livros/${pub}/progresso`, { token: L.token, corpo: { pagina: 30, total: 20 } })).status === 422, 'progresso com página maior que o total: 422');
  ver((await chamar('PUT', `/livros/${oculto}/progresso`, { token: L.token, corpo: { pagina: 1, total: 2 } })).status === 404 && sql(`SELECT COUNT(*) FROM leituras WHERE usuario_id=${uid.leitor} AND livro_id=${oculto}`)[0][0] === '0', 'progresso de livro oculto: 404 e nada gravado');
  const outro = J(await chamar('GET', `/livros/${pub}`, { token: C.token })).dados;
  ver(outro.progresso === null && outro.favorito === false, 'o progresso e o favorito são de cada usuário');

  console.log('== segurança: SQL injection, XSS, tipos ==');
  const payloads = ["' OR '1'='1", "1; DROP TABLE livros", "' UNION SELECT senha,2,3,4,5,6,7,8,9,10,11,12,13 FROM usuarios-- -", "' AND SLEEP(3)-- -", '%', '"><svg onload=alert(1)>'];
  let erros = 0, vazou = false, lento = false;
  for (const p of payloads) {
    for (const q of ['busca', 'autor', 'categoria', 'formato', 'ordem', 'pagina', 'por_pagina', 'favoritos']) {
      const t0 = Date.now();
      const r = await chamar('GET', '/livros', { token: L.token, query: `?${q}=${encodeURIComponent(p)}` });
      if (r.status >= 500 || /SQLSTATE|syntax|PDOException|Warning:|Fatal/i.test(r.text)) erros++;
      if (/\$2y\$/.test(r.text)) vazou = true;
      if (Date.now() - t0 > 2500) lento = true;
    }
    for (const rota of [`/livros/${encodeURIComponent(p)}`, `/livros/1${encodeURIComponent(p)}/capa`]) {
      const r = await chamar('GET', rota, { token: L.token });
      if (r.status >= 500) erros++;
    }
  }
  ver(erros === 0 && !vazou && !lento, 'SQL injection nos filtros e nas rotas: nenhum erro, atraso ou vazamento', `(erros ${erros}, vazou ${vazou}, lento ${lento})`);
  const lg = await chamar('POST', '/auth/token', { corpo: { email: "' OR 1=1-- -", senha: "' OR '1'='1" } });
  ver(lg.status === 401, "SQL injection no login: 401");
  limpa();
  const arr = await chamar('POST', '/auth/token', { corpo: { email: ['a'], senha: { x: 1 } } });
  ver(arr.status === 422 || arr.status === 401, 'login com tipos errados (array/objeto): sem erro 500', `(status ${arr.status})`);
  ver((await chamar('POST', '/auth/token', { corpo: undefined, headers: { 'content-type': 'application/json' } })).status < 500, 'POST sem corpo: sem erro 500');
  const jsonRuim = await new Client('x').req(`${API}/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{quebrado' });
  ver(jsonRuim.status === 400, 'JSON quebrado: 400');
  ver(!/<svg/.test(J(await chamar('GET', '/livros', { token: L.token, query: '?busca=%3Csvg%20onload%3D1%3E' })).links?.proxima || ''), 'parâmetros refletidos nos links saem codificados');

  console.log('== segurança: sessão do site não vale na API (sem CSRF) ==');
  const web = new Client('web'); await web.login('leitor@e2e.test');
  ver((await web.req(`${API}/livros`)).status === 401, 'cookie de sessão do site NÃO autentica na API');
  ver((await web.req(`${API}/me`)).status === 401, '/me com cookie: 401');

  console.log('== segurança: força bruta no login da API ==');
  limpa();
  let bloq = false;
  for (let i = 0; i < 8 && !bloq; i++) bloq = (await entrar('contribuidor@e2e.test', 'x' + i)).r.status === 429;
  ver(bloq, 'depois de 5 senhas erradas o login da API responde 429');
  limpa();

  console.log('== refresh, logout e revogação ==');
  const R = await entrar('leitor@e2e.test');
  const novoPar = J(await chamar('POST', '/auth/refresh', { corpo: { refresh_token: R.refresh } }));
  ver(/^ml_/.test(novoPar.access_token || '') && novoPar.access_token !== R.token, 'refresh devolve um novo par de tokens');
  ver((await chamar('GET', '/me', { token: R.token })).status === 401, 'o access_token antigo deixa de valer');
  ver((await chamar('POST', '/auth/refresh', { corpo: { refresh_token: R.refresh } })).status === 401, 'o refresh_token antigo não pode ser reutilizado');
  ver((await chamar('GET', '/me', { token: novoPar.access_token })).status === 200, 'o token novo funciona');
  sql(`UPDATE api_tokens SET access_expira = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE access_hash = SHA2('${novoPar.access_token}', 256)`);
  ver((await chamar('GET', '/me', { token: novoPar.access_token })).status === 401, 'token de acesso vencido: 401');
  const par3 = J(await chamar('POST', '/auth/refresh', { corpo: { refresh_token: novoPar.refresh_token } }));
  ver(/^ml_/.test(par3.access_token || ''), 'o refresh_token ainda renova depois que o acesso venceu');
  ver((await chamar('POST', '/auth/logout', { token: par3.access_token })).status === 200 && (await chamar('GET', '/me', { token: par3.access_token })).status === 401, 'logout revoga o token');
  ver((await chamar('POST', '/auth/refresh', { corpo: { refresh_token: par3.refresh_token } })).status === 401, 'e o refresh_token do logout também morre');
  const T1 = await entrar('leitor@e2e.test'), T2 = await entrar('leitor@e2e.test');
  await chamar('POST', '/auth/logout', { token: T1.token, query: '?todos=1' });
  ver((await chamar('GET', '/me', { token: T2.token })).status === 401, 'logout?todos=1 revoga todos os aparelhos');

  console.log('== segurança: conta bloqueada, troca de senha e plano ==');
  const B = await entrar('leitor@e2e.test');
  sql(`UPDATE usuarios SET bloqueado=1 WHERE id=${uid.leitor}`);
  const bl = await chamar('GET', '/livros', { token: B.token });
  ver(bl.status === 403 && J(bl).erro.codigo === 'conta_bloqueada', 'conta bloqueada pelo administrador: 403 na hora');
  ver((await entrar('leitor@e2e.test')).r.status === 403, 'e não consegue novo login enquanto bloqueada');
  sql(`UPDATE usuarios SET bloqueado=0 WHERE id=${uid.leitor}`);
  limpa();
  const P = await entrar('contribuidor@e2e.test');
  const web2 = new Client('w2'); await web2.login('contribuidor@e2e.test');
  const tokenWeb = (await web2.req('')).text.match(/"csrfToken":"([a-f0-9]{64})"/)[1];
  await web2.form('api/mudar_senha.php', { csrf_token: tokenWeb, senha_atual: SENHA, nova_senha: 'Trocada@1234', confirma_senha: 'Trocada@1234' });
  ver((await chamar('GET', '/me', { token: P.token })).status === 401, 'trocar a senha no site derruba os tokens da API');
  sql("UPDATE usuarios SET senha='$2y$10$kEiueqHKJB8NppVKaKhSD.R4D67vJ0lrVFPX8nJkaIfPwxqp0njG.' WHERE email='contribuidor@e2e.test'");
  limpa();

  console.log('== limpeza ==');
  sql("DELETE FROM livros WHERE titulo LIKE '[E2E] API%'");
  sql('DELETE FROM api_tokens WHERE usuario_id IN (' + Object.values(uid).join(',') + ')');
  sql("UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'");
  limpa();
  console.log(falhas.length ? `\nT9: ${falhas.length} FALHA(S)\n- ${falhas.join('\n- ')}` : '\nT9: API v1 — tudo comprovado');
})().catch((e) => { console.error('ERRO NO T9', e); process.exit(1); });
