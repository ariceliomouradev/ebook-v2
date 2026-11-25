// T2: CSRF, RBAC, IDOR, XSS refletido/armazenado, sessão, escalonamento de privilégio
const fs = require('fs');
const path = require('path');
const { Client, sql, achados, achado, ok } = require('./lib');

const MARCA = '[E2E] PT ';
const XSS = '"><svg onload=alert(1)>';
const XSS2 = "'-alert(1)-'";

function bruto(html, payload) { return html.includes(payload); }

(async () => {
  const ids = Object.fromEntries(sql("SELECT email, id FROM usuarios WHERE email LIKE '%@e2e.test'").map(([e, i]) => [e.split('@')[0], Number(i)]));
  const base = sql("SELECT id, nome_arquivo FROM livros WHERE publicacao='aprovado' AND formato='pdf' LIMIT 1")[0];
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%'`);
  const novoLivro = (titulo, vis, dono) => {
    sql(`INSERT INTO livros (titulo, autor, nome_arquivo, formato, usuario_id, visivel_para, publicacao) VALUES ('${MARCA}${titulo}', 'Autor PT', '${base[1]}', 'pdf', ${dono}, '${vis}', 'aprovado')`);
    return Number(sql('SELECT MAX(id) FROM livros')[0][0]);
  };
  const oculto = novoLivro('oculto admin', '', ids.admin);
  const publico = novoLivro('publico', 'contribuidor,leitor', ids.admin);
  const doContrib = novoLivro('do contribuidor', '', ids.contribuidor);

  const A = new Client('admin'), C = new Client('contribuidor'), L = new Client('leitor');
  for (const [cli, nome] of [[A, 'admin'], [C, 'contribuidor'], [L, 'leitor']]) {
    const r = await cli.login(`${nome}@e2e.test`);
    if (!r.logado) throw new Error('login falhou ' + nome + JSON.stringify(r));
  }
  ok('3 sessões abertas (admin, contribuidor, leitor)');

  /* ---------- 2.1 CSRF ---------- */
  console.log('== T2.1 CSRF: POST autenticado SEM token (nada pode mudar) ==');
  const semToken = [
    ['editar', 'api/editar.php', { id: publico, titulo: MARCA + 'ALTERADO', autor: 'x' }, () => sql(`SELECT titulo FROM livros WHERE id=${publico}`)[0][0] !== MARCA + 'publico'],
    ['excluir', 'api/excluir.php', { id: doContrib }, () => sql(`SELECT COUNT(*) FROM livros WHERE id=${doContrib}`)[0][0] === '0'],
    ['bloquear', 'api/usuarios_gerenciar.php', { action: 'bloquear', usuario_id: ids.leitor }, () => sql(`SELECT bloqueado FROM usuarios WHERE id=${ids.leitor}`)[0][0] === '1'],
    ['favoritar', 'api/favoritos.php', { action: 'alternar', livro_id: publico, favorito: 1 }, () => sql(`SELECT COUNT(*) FROM favoritos WHERE usuario_id=${ids.admin} AND livro_id=${publico}`)[0][0] !== '0'],
    ['mudar_senha', 'api/mudar_senha.php', { senha_atual: 'x', nova_senha: 'Nova@12345', confirma_senha: 'Nova@12345' }, () => false],
    ['foto_remover', 'api/foto_perfil.php', { action: 'remover' }, () => false],
    ['anotacao', 'api/anotacoes.php', { action: 'criar', livro_id: publico, pagina: 1, tipo: 'nota', x: 0.1, y: 0.1, cor: 'amarelo' }, () => sql(`SELECT COUNT(*) FROM anotacoes WHERE usuario_id=${ids.admin} AND livro_id=${publico}`)[0][0] !== '0'],
    ['banners', 'api/manage_banners.php', { action: 'remover', id: 999999 }, () => false],
    ['aprovacoes', 'api/aprovacoes.php', { action: 'negar', id: oculto }, () => sql(`SELECT publicacao FROM livros WHERE id=${oculto}`)[0][0] !== 'aprovado'],
    ['duplicado', 'api/duplicado.php', { action: 'marcar', id: publico, original_id: oculto }, () => sql(`SELECT duplicado_de FROM livros WHERE id=${publico}`)[0][0] !== 'NULL'],
  ];
  for (const [nome, url, corpo, mudou] of semToken) {
    const r = await A.form(url, corpo);
    const efeito = mudou();
    const aceito = /"success":\s*true/.test(r.text);
    if (efeito || aceito) achado('ALTA', 'CSRF-' + nome, `${url} aceitou POST sem token CSRF`, `status ${r.status}; efeito no banco: ${efeito}; corpo: ${r.text.slice(0, 100)}`, 'csrf_verify() no início do endpoint');
    else ok(`${nome}: status ${r.status} sem efeito`);
  }
  // cabeçalho X-CSRF forjado/errado
  const rErrado = await A.form('api/editar.php', { id: publico, titulo: MARCA + 'ALTERADO2', autor: 'x' }, { 'x-csrf-token': 'a'.repeat(64) });
  if (sql(`SELECT titulo FROM livros WHERE id=${publico}`)[0][0] !== MARCA + 'publico') achado('ALTA', 'CSRF-header', 'Token errado aceito', rErrado.text.slice(0, 100), 'hash_equals');
  // token de OUTRA sessão (usuário leitor) usado na sessão do admin
  const rCruz = await A.form('api/editar.php', { id: publico, titulo: MARCA + 'ALTERADO3', autor: 'x', csrf_token: L.csrf });
  if (sql(`SELECT titulo FROM livros WHERE id=${publico}`)[0][0] !== MARCA + 'publico') achado('ALTA', 'CSRF-cruzado', 'Token de outra sessão aceito', rCruz.text.slice(0, 100), 'token por sessão');
  else ok('token de outra sessão recusado');
  // GET com efeito colateral?
  for (const u of ['api/excluir.php?id=' + doContrib, 'api/editar.php?id=' + publico + '&titulo=x', 'logout.php']) {
    const r = await A.req(u);
    if (u.startsWith('logout')) { console.log(`  logout.php via GET -> ${r.status} (CSRF de logout: baixo)`); await A.login('admin@e2e.test'); continue; }
    if (sql(`SELECT COUNT(*) FROM livros WHERE id=${doContrib}`)[0][0] === '0') achado('ALTA', 'GET-efeito', 'GET apagou livro', u, 'exigir POST');
  }
  A.csrf = (await A.req('')).text.match(/"csrfToken":"([a-f0-9]{64})"/)?.[1];

  /* ---------- 2.2 RBAC ---------- */
  console.log('== T2.2 RBAC vertical: perfis baixos em endpoints de admin (com token válido) ==');
  const adminOnly = [
    ['api/editar.php', { id: publico, titulo: MARCA + 'HACK', autor: 'x' }],
    ['api/excluir.php', { id: doContrib }],
    ['api/usuarios_gerenciar.php', { action: 'listar' }],
    ['api/usuarios_gerenciar.php', { action: 'mudar_perfil', usuario_id: ids.leitor, perfil: 'admin' }],
    ['api/usuarios_gerenciar.php', { action: 'adicionar', nome: 'x', email: 'rbac@e2e.test', senha: 'Aa1!aaaaaa', perfil: 'admin' }],
    ['api/usuarios_gerenciar.php', { action: 'excluir', usuario_id: ids.admin }],
    ['api/manage_banners.php', { action: 'listar' }],
    ['api/aprovacoes.php', { action: 'listar' }],
    ['api/duplicado.php', { action: 'limpar', id: publico }],
  ];
  for (const [cli, nome] of [[L, 'leitor'], [C, 'contribuidor']]) {
    for (const [url, corpo] of adminOnly) {
      const r = await cli.form(url, { ...corpo, csrf_token: cli.csrf });
      if (r.status === 200 && /"success":\s*true/.test(r.text)) achado('CRITICA', `RBAC-${nome}-${url}-${corpo.action || ''}`, `${nome} executou ação de administrador em ${url}`, r.text.slice(0, 120), 'require_perfil([\'admin\'])');
      else if (![401, 403, 302].includes(r.status) && !(r.status === 200)) console.log(`  (${nome} ${url} -> ${r.status})`);
    }
    const g = await cli.req('api/gerenciar_lista.php?busca=');
    if (g.status === 200 && /livros|html/.test(g.text) && !/negado|Sess/.test(g.text)) achado('ALTA', `RBAC-${nome}-gerenciar_lista`, `${nome} leu a lista de gerenciamento (admin)`, g.text.slice(0, 100), 'require_perfil admin');
  }
  const efeitoRBAC = sql(`SELECT perfil FROM usuarios WHERE id=${ids.leitor}`)[0][0];
  if (efeitoRBAC !== 'leitor') achado('CRITICA', 'RBAC-perfil', 'Perfil do leitor foi alterado por não-admin', efeitoRBAC, 'verificar RBAC');
  else ok('perfil do leitor intacto; usuário admin intacto: ' + sql(`SELECT COUNT(*) FROM usuarios WHERE id=${ids.admin}`)[0][0]);
  // horizontais
  const hz = [[C, 'contribuidor', 'api/acervo.php', { action: 'listar' }], [L, 'leitor', 'api/familia.php', { action: 'listar' }]];
  for (const [cli, nome, url, corpo] of hz) {
    const r = await cli.form(url, { ...corpo, csrf_token: cli.csrf });
    if (r.status === 200 && /"success":\s*true/.test(r.text)) achado('MEDIA', `RBAC-h-${nome}-${url}`, `${nome} acessou recurso de outro plano (${url})`, r.text.slice(0, 100), 'require_perfil');
    else ok(`${nome} -> ${url}: ${r.status}`);
  }

  /* ---------- 2.3 IDOR ---------- */
  console.log('== T2.3 IDOR / visibilidade de livros ==');
  const casos = [
    [L, 'leitor', oculto, 404, 'livro oculto (só admin)'], [C, 'contribuidor', oculto, 404, 'livro oculto (só admin)'],
    [L, 'leitor', doContrib, 404, 'livro privado de outro usuário'], [C, 'contribuidor', doContrib, 200, 'próprio livro'],
    [A, 'admin', oculto, 200, 'admin vê tudo'], [L, 'leitor', publico, 200, 'livro público'],
  ];
  for (const [cli, nome, id, esperado, desc] of casos) {
    const d = await cli.req(`api/download.php?id=${id}`);
    const lv = await cli.req(`leitor?id=${id}`);
    const lvOk = esperado === 200 ? lv.status === 200 : (lv.status === 404);
    if (d.status !== esperado || !lvOk) achado('ALTA', `IDOR-${nome}-${id}`, `${nome} -> ${desc}: download ${d.status}, leitor ${lv.status} (esperado ${esperado})`, `${desc}`, 'usuarioPodeVerLivro');
    else ok(`${nome} x ${desc}: download ${d.status}, leitor ${lv.status}`);
  }
  // progresso/favorito/anotação em livro oculto
  const prog = await L.req(`api/progresso.php?id=${oculto}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': L.csrf }, body: JSON.stringify({ pagina: 3, total: 10 }) });
  const gravou = sql(`SELECT COUNT(*) FROM leituras WHERE usuario_id=${ids.leitor} AND livro_id=${oculto}`)[0][0];
  console.log(`  progresso em livro oculto -> ${prog.status}, linhas gravadas: ${gravou}`);
  if (gravou !== '0') achado('BAIXA', 'IDOR-progresso', 'api/progresso.php grava progresso de livro que o usuário não pode ver (revela existência do id e polui a tabela)', `status ${prog.status}; leituras gravadas ${gravou}`, 'chamar usuarioPodeVerLivro() antes do INSERT');
  const fav = await L.form('api/favoritos.php', { action: 'alternar', livro_id: oculto, favorito: 1, csrf_token: L.csrf });
  const favN = sql(`SELECT COUNT(*) FROM favoritos WHERE usuario_id=${ids.leitor} AND livro_id=${oculto}`)[0][0];
  console.log(`  favoritar livro oculto -> ${fav.status} ${fav.text.slice(0, 60)}; gravou: ${favN}`);
  if (favN !== '0') achado('BAIXA', 'IDOR-favorito', 'favoritos.php permite favoritar livro oculto', fav.text.slice(0, 80), 'checar visibilidade');
  const an = await L.form('api/anotacoes.php', { action: 'criar', livro_id: oculto, pagina: 1, tipo: 'nota', x: 0.2, y: 0.2, cor: 'amarelo', csrf_token: L.csrf });
  if (/"success":\s*true/.test(an.text)) achado('MEDIA', 'IDOR-anotacao', 'Anotação criada em livro oculto', an.text.slice(0, 80), 'checar visibilidade');
  else ok('anotação em livro oculto recusada (' + an.status + ')');
  // anotação de um usuário manipulada por outro
  const cria = await L.form('api/anotacoes.php', { action: 'criar', livro_id: publico, pagina: 1, tipo: 'nota', x: 0.3, y: 0.3, cor: 'verde', comentario: 'privada do leitor', csrf_token: L.csrf });
  const idAn = JSON.parse(cria.text).anotacao?.id;
  for (const [cli, nome] of [[C, 'contribuidor'], [A, 'admin']]) {
    const e = await cli.form('api/anotacoes.php', { action: 'editar', id: idAn, cor: 'rosa', comentario: 'HACK', csrf_token: cli.csrf });
    const x = await cli.form('api/anotacoes.php', { action: 'excluir', id: idAn, csrf_token: cli.csrf });
    const l = await cli.form('api/anotacoes.php', { action: 'listar', livro_id: publico, csrf_token: cli.csrf });
    const vazou = l.text.includes('privada do leitor');
    const sobrou = sql(`SELECT comentario FROM anotacoes WHERE id=${idAn}`)[0]?.[0];
    if (/"success":\s*true/.test(e.text) || /"success":\s*true/.test(x.text) || vazou || sobrou !== 'privada do leitor') achado('ALTA', `IDOR-anotacao-${nome}`, `${nome} leu/alterou/apagou anotação do leitor`, `${e.text.slice(0, 60)}`, 'filtrar por usuario_id');
    else ok(`anotação do leitor intacta frente a ${nome}`);
  }
  // busca: livros ocultos não podem aparecer
  for (const [cli, nome, deve] of [[L, 'leitor', false], [C, 'contribuidor', false], [A, 'admin', true]]) {
    const r = await cli.req('api/buscar.php?busca=' + encodeURIComponent(MARCA + 'oculto'));
    const aparece = r.text.includes(MARCA + 'oculto admin') || r.text.includes('[E2E] PT oculto admin'.toLowerCase());
    if (aparece && !deve) achado('ALTA', `IDOR-busca-${nome}`, `Busca de ${nome} mostra livro oculto`, r.text.slice(0, 80), 'condicaoVisibilidade');
    else ok(`busca ${nome}: oculto ${aparece ? 'aparece' : 'não aparece'} (esperado ${deve})`);
  }
  // dependente/família: C remove usuário de outro titular
  const rf = await C.form('api/familia.php', { action: 'remover', usuario_id: ids.leitor, csrf_token: C.csrf });
  if (sql(`SELECT COUNT(*) FROM usuarios WHERE id=${ids.leitor}`)[0][0] === '0') achado('CRITICA', 'IDOR-familia', 'Contribuidor apagou usuário que não é dependente dele', rf.text.slice(0, 80), 'AND titular_id');
  else ok('familia remover: usuário alheio intacto');
  // meus_envios: solicitar publicação de livro alheio
  const me = await C.form('api/meus_envios.php', { action: 'solicitar', id: oculto, csrf_token: C.csrf });
  const pub = sql(`SELECT publicacao FROM livros WHERE id=${oculto}`)[0][0];
  console.log(`  solicitar publicação de livro alheio -> ${me.status}, publicacao agora: ${pub}`);
  const me2 = await L.form('api/meus_envios.php', { action: 'excluir', id: doContrib, csrf_token: L.csrf });
  if (sql(`SELECT COUNT(*) FROM livros WHERE id=${doContrib}`)[0][0] === '0') achado('ALTA', 'IDOR-meus_envios', 'Leitor excluiu livro de outro usuário via meus_envios', me2.text.slice(0, 80), 'AND usuario_id');
  else ok('meus_envios excluir: livro alheio intacto');

  /* ---------- 2.4 XSS refletido ---------- */
  console.log('== T2.4 XSS refletido (payloads em cada parâmetro) ==');
  const params = ['busca', 'ordem', 'pagina', 'categoria', 'favoritos', 'msg', 'abrir', 'origem', 'erro', 'token', 'redirect', 'next'];
  const paginas = ['', 'leitor?id=' + publico, 'login', 'cadastro', 'redefinir-senha', 'assinatura', 'inicio', 'api/buscar.php'];
  for (const [cli, nome] of [[A, 'admin'], [new Client('anon'), 'anon']]) {
    for (const pg of paginas) {
      for (const p of params) {
        for (const payload of [XSS, XSS2, '</script><script>alert(1)</script>']) {
          const sep = pg.includes('?') ? '&' : '?';
          const r = await cli.req(`${pg}${sep}${p}=${encodeURIComponent(payload)}`, { follow: false });
          if (r.status === 200 && bruto(r.text, payload)) {
            // refletido sem escape: só é XSS se em contexto de HTML; XSS2 em atributo/JS precisa de checagem manual
            achado(payload === XSS2 ? 'MEDIA' : 'ALTA', `XSS-${pg || 'index'}-${p}`, `Parâmetro "${p}" refletido sem escape em /${pg}`, `payload ${payload} aparece cru`, 'e() na saída');
          }
        }
      }
    }
  }
  ok('varredura de XSS refletido concluída');

  /* ---------- 2.5 XSS armazenado ---------- */
  console.log('== T2.5 XSS armazenado: título/autor/nome ==');
  const tituloXSS = MARCA + '<img src=x onerror=alert(1)>';
  const edit = await A.form('api/editar.php', { id: publico, titulo: tituloXSS, autor: '<script>alert(2)</script>', categoria: 'geral', vis_contribuidor: '1', vis_leitor: '1', csrf_token: A.csrf });
  console.log('  editar com HTML no título ->', edit.status, edit.text.slice(0, 80));
  const vistas = ['', 'api/buscar.php?busca=' + encodeURIComponent('PT '), 'api/gerenciar_lista.php?busca=' + encodeURIComponent('PT '), 'leitor?id=' + publico];
  for (const [cli, nome] of [[A, 'admin'], [L, 'leitor']]) {
    for (const v of vistas) {
      const r = await cli.req(v);
      if (/<img src=x onerror=alert\(1\)>/.test(r.text) || /<script>alert\(2\)<\/script>/.test(r.text)) achado('ALTA', `XSS-armaz-${nome}-${v.split('?')[0] || 'index'}`, `Título/autor armazenado sai sem escape em /${v}`, 'HTML do título renderizado', 'e()');
    }
  }
  const nomeXSS = `<b onmouseover=alert(1)>pt${Date.now() % 1000}`;
  const cad = new Client('cad');
  const tk = await cad.tokenDe('cadastro');
  const rc = await cad.form('api/cadastrar.php', { csrf_token: tk, nome: nomeXSS, email: `xss${Date.now() % 100000}@e2e.test`, whatsapp: '85988887777', senha: 'Aa1!aaaaaa', site: '', perfil: 'admin', titular_id: 1, acesso_ate: '2099-01-01' });
  console.log('  cadastro com HTML no nome ->', rc.status, rc.location);
  const novo = sql("SELECT id, perfil, titular_id, acesso_ate, nome FROM usuarios WHERE email LIKE 'xss%@e2e.test' ORDER BY id DESC LIMIT 1")[0];
  if (novo) {
    console.log('  usuário criado por cadastro:', novo.slice(0, 4).join(' | '));
    if (novo[1] !== 'leitor') achado('CRITICA', 'MASS-perfil', 'Cadastro público aceitou perfil enviado pelo cliente', `perfil=${novo[1]}`, 'ignorar campos extras');
    if (novo[2] !== 'NULL') achado('ALTA', 'MASS-titular', 'Cadastro público aceitou titular_id', `titular_id=${novo[2]}`, 'ignorar campos extras');
    const lista = await A.form('api/usuarios_gerenciar.php', { action: 'listar', csrf_token: A.csrf });
    if (/<b onmouseover=alert\(1\)>/.test(lista.text)) achado('ALTA', 'XSS-armaz-nome', 'Nome de usuário sai sem escape na lista de usuários', 'tag <b> crua', 'e()');
    else ok('nome com HTML escapado na lista de usuários');
  }

  /* ---------- 2.6 sessão ---------- */
  console.log('== T2.6 sessão ==');
  const fx = new Client('fixacao');
  fx.jar.PHPSESSID = 'f1x4t10n' + 'a'.repeat(24);
  await fx.login('contribuidor@e2e.test');
  if (fx.jar.PHPSESSID === 'f1x4t10n' + 'a'.repeat(24)) achado('ALTA', 'SESS-fixacao', 'ID de sessão não muda após o login (session fixation)', 'mesmo PHPSESSID antes/depois', 'session_regenerate_id(true)');
  else ok('session_regenerate_id no login: ID mudou');
  const velho = new Client('velho'); velho.jar.PHPSESSID = 'f1x4t10n' + 'a'.repeat(24);
  const rv = await velho.req('');
  if (/"csrfToken"/.test(rv.text) && /btn-user-menu/.test(rv.text)) achado('ALTA', 'SESS-fixacao2', 'ID de sessão antigo autenticado após login', '', 'regenerar ID');
  // logout invalida?
  const lo = new Client('logout'); await lo.login('leitor@e2e.test');
  const cookieAntes = lo.jar.PHPSESSID;
  await lo.req('logout.php');
  const reuso = new Client('reuso'); reuso.jar.PHPSESSID = cookieAntes;
  const rr = await reuso.req('');
  if (/btn-user-menu/.test(rr.text)) achado('ALTA', 'SESS-logout', 'Cookie continua válido depois do logout', '', 'session_destroy()');
  else ok('cookie inválido depois do logout');
  // limite de acessos simultâneos (leitor = 1)
  const l1 = new Client('l1'), l2 = new Client('l2');
  await l1.login('leitor@e2e.test'); await l2.login('leitor@e2e.test');
  const r1 = await l1.req('');
  console.log('  leitor: 2º login derrubou o 1º?', !/btn-user-menu/.test(r1.text) ? 'sim (limite 1 respeitado)' : 'NÃO');
  // cookie flags depois do login
  const fl = new Client('flags'); const csrf = await fl.tokenDe('login');
  await fl.form('api/auth.php', { csrf_token: csrf, email: 'contribuidor@e2e.test', senha: 'Senha@E2E1' });
  const sc = (fl.ultimosSetCookie || []).join(' | ');
  console.log('  Set-Cookie após login:', sc.replace(/PHPSESSID=[^;]+/, 'PHPSESSID=***'));
  if (!/httponly/i.test(sc)) achado('ALTA', 'COK-httponly2', 'Cookie sem HttpOnly', sc, 'httponly');
  if (!/samesite/i.test(sc)) achado('MEDIA', 'COK-samesite2', 'Cookie sem SameSite', sc, 'SameSite');
  if (!/secure/i.test(sc)) console.log('  (cookie sem Secure: esperado em http local; em produção HTTPS o código já ativa Secure)');

  // limpeza
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%' OR titulo LIKE '[E2E] PT%'`);
  sql("DELETE FROM usuarios WHERE email LIKE 'xss%@e2e.test' OR email LIKE 'rbac%@e2e.test'");
  sql(`UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'`);
  fs.writeFileSync(path.join(__dirname, 'achados_t2.json'), JSON.stringify(achados, null, 2));
  console.log(`\nT2 concluído: ${achados.length} achado(s)`);
})().catch((e) => { console.error('ERRO NO T2', e); process.exit(1); });
