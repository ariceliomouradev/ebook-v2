// T8: reteste dos pendentes de segurança (limite diário, logout POST, sessões fora do site, banco fora, e-mail confirmado)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client, sql, ok, limitesDiarios } = require('./lib');
const LIM = limitesDiarios();

const RAIZ = path.resolve(__dirname, '..', '..');
const ENV = path.join(RAIZ, '.env');
const LOG = 'C:\\xampp\\apache\\logs\\error.log';
const falhas = [];
const ver = (c, m, d = '') => { if (c) ok(m); else { falhas.push(m + ' ' + d); console.log(`  FALHOU: ${m} ${d}`); } };
const limpa = () => sql('DELETE FROM tentativas_login');
const tam = () => fs.statSync(LOG).size;
const lerLog = (pos) => { const fd = fs.openSync(LOG, 'r'); const b = Buffer.alloc(fs.statSync(LOG).size - pos); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd); return b.toString('utf8'); };
const csrfDe = (html) => (html.match(/name="csrf_token" value="([a-f0-9]{64})"/) || html.match(/"csrfToken":"([a-f0-9]{64})"/) || [])[1];

(async () => {
  limpa();
  sql("UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'");
  const uid = Object.fromEntries(sql("SELECT email, id FROM usuarios WHERE email LIKE '%@e2e.test'").map(([e, i]) => [e.split('@')[0], Number(i)]));

  console.log('== limite diário de livros diferentes ==');
  const base = sql("SELECT nome_arquivo FROM livros WHERE publicacao='aprovado' AND formato='pdf' LIMIT 1")[0][0];
  sql("DELETE FROM livros WHERE titulo LIKE '[E2E] PT8%'");
  const criarLivro = (n) => { sql(`INSERT INTO livros (titulo, autor, nome_arquivo, formato, usuario_id, visivel_para, publicacao) VALUES ('[E2E] PT8 ${n}', 'a', '${base}', 'pdf', ${uid.admin}, 'contribuidor,leitor', 'aprovado')`); return Number(sql('SELECT MAX(id) FROM livros')[0][0]); };
  const lote = Array.from({ length: LIM.leitor + 2 }, (_, i) => criarLivro(i));
  sql(`DELETE FROM livros_abertos WHERE usuario_id IN (${uid.leitor}, ${uid.contribuidor})`);
  const L = new Client('L'); await L.login('leitor@e2e.test');
  let aceitos = 0, negado = null;
  for (const id of lote) {
    const r = await L.req(`api/download.php?id=${id}`, { headers: { range: 'bytes=0-9' } });
    if (r.status === 200 || r.status === 206) aceitos++; else if (r.status === 429) { negado = id; break; }
  }
  ver(aceitos === LIM.leitor && negado === lote[LIM.leitor], `Grátis abre ${LIM.leitor} livros diferentes e o seguinte recebe 429`, `(aceitos ${aceitos}, negado ${negado})`);
  const reab = await L.req(`api/download.php?id=${lote[0]}`, { headers: { range: 'bytes=0-9' } });
  ver(reab.status === 206 || reab.status === 200, 'reabrir um livro já aberto hoje continua liberado', `(status ${reab.status})`);
  const pag = await L.req(`leitor?id=${lote[LIM.leitor + 1]}`);
  ver(pag.status === 429 && /limite-livros/.test(pag.text), 'a página do leitor mostra o aviso amigável (429) para livro novo');
  const pagVelho = await L.req(`leitor?id=${lote[1]}`);
  ver(pagVelho.status === 200, 'a página de um livro já aberto hoje carrega normalmente');
  const A = new Client('A'); await A.login('admin@e2e.test');
  const ra = await A.req(`api/download.php?id=${lote[LIM.leitor + 1]}`, { headers: { range: 'bytes=0-9' } });
  ver(ra.status === 206 || ra.status === 200, 'administrador não tem limite');
  sql(`DELETE FROM livros_abertos WHERE usuario_id IN (${uid.leitor}, ${uid.contribuidor})`);
  const C = new Client('C'); await C.login('contribuidor@e2e.test');
  sql(`INSERT INTO livros_abertos (usuario_id, livro_id, dia) SELECT ${uid.contribuidor}, id, CURDATE() FROM livros LIMIT ${LIM.contribuidor}`);
  const livroNovo = Number(sql(`SELECT id FROM livros WHERE id NOT IN (SELECT livro_id FROM livros_abertos WHERE usuario_id=${uid.contribuidor}) AND publicacao='aprovado' AND visivel_para LIKE '%contribuidor%' AND duplicado_de IS NULL LIMIT 1`)[0][0]);
  const rc = await C.req(`api/download.php?id=${livroNovo}`, { headers: { range: 'bytes=0-9' } });
  ver(rc.status === 429, `Pro tem limite de ${LIM.contribuidor} por dia`, `(status ${rc.status})`);
  sql(`DELETE FROM livros_abertos WHERE usuario_id IN (${uid.leitor}, ${uid.contribuidor})`);
  sql("DELETE FROM livros WHERE titulo LIKE '[E2E] PT8%'");

  console.log('== logout só por POST com token ==');
  const s = new Client('s'); await s.login('leitor@e2e.test');
  await s.req('logout');                                   // GET: não pode deslogar
  ver(/btn-user-menu/.test((await s.req('')).text), 'GET /logout não encerra a sessão');
  await s.form('logout', { csrf_token: 'a'.repeat(64) });   // POST com token falso
  ver(/btn-user-menu/.test((await s.req('')).text), 'POST /logout com token errado não encerra a sessão');
  const tok = csrfDe((await s.req('')).text);
  const rl = await s.form('logout', { csrf_token: tok });
  ver(/login/.test(rl.location), 'POST /logout com o token da sessão encerra', rl.location);
  ver(!/btn-user-menu/.test((await s.req('')).text), 'depois do logout a sessão não vale mais');
  const menu = await (async () => { const c = new Client('m'); await c.login('leitor@e2e.test'); return (await c.req('')).text; })();
  ver(/<form method="POST" action="[^"]*logout"[^>]*>[\s\S]*?data-testid="btn-logout"/.test(menu), 'o botão Sair do menu é um formulário POST com token');

  console.log('== sessões fora da pasta pública ==');
  const fora = path.resolve(RAIZ, '..', 'sessoes_' + path.basename(RAIZ).replace(/[^A-Za-z0-9_-]/g, ''));
  const antes = fs.existsSync(fora) ? fs.readdirSync(fora).length : -1;
  const n = new Client('n'); await n.login('leitor@e2e.test');
  const depois = fs.existsSync(fora) ? fs.readdirSync(fora).length : -1;
  ver(antes >= 0 && depois > antes - 1 && fs.existsSync(path.join(fora, 'sess_' + n.jar.PHPSESSID)), 'o arquivo da sessão está em ' + path.basename(fora) + ' (fora do site)');
  ver(!fs.existsSync(path.join(RAIZ, 'sessoes', 'sess_' + n.jar.PHPSESSID)), 'e não na pasta sessoes/ dentro do site');
  ver((await n.req('../sessoes_meus_livros/')).status !== 200, 'a pasta externa não é servida por HTTP');

  console.log('== banco fora do ar: página amigável ==');
  const php = (script) => execFileSync('C:\\xampp\\php\\php.exe', ['-r', script], { encoding: 'utf8', cwd: RAIZ });
  const saidaHtml = php("$_ENV['DB_NAME']='nao_existe_xyz'; $_SERVER['SCRIPT_NAME']='/index.php'; define('ACESSO_PERMITIDO',true); require 'config/db.php';");
  ver(/Já voltamos/.test(saidaHtml) && !/SQLSTATE|nao_existe/.test(saidaHtml), 'página HTML amigável, sem detalhe técnico');
  const saidaJson = php("$_ENV['DB_NAME']='nao_existe_xyz'; $_SERVER['SCRIPT_NAME']='/api/buscar.php'; define('ACESSO_PERMITIDO',true); require 'config/db.php';");
  ver(/"success":false/.test(saidaJson) && !/SQLSTATE/.test(saidaJson), 'a API recebe JSON amigável');

  console.log('== SRI: bibliotecas dos CDNs carregam com integrity ==');
  const lg = await new Client('x').req('login');
  ver(/integrity="sha384-[^"]+" crossorigin="anonymous"/.test(lg.text), 'tags com integrity na tela de login');

  console.log('== confirmação de e-mail no cadastro ==');
  const envOriginal = fs.readFileSync(ENV);
  try {
    fs.writeFileSync(ENV, Buffer.concat([envOriginal, Buffer.from('\nCADASTRO_CONFIRMAR_EMAIL=true\n')]));
    sql("DELETE FROM usuarios WHERE email LIKE 'pt8-%@e2e.test'"); limpa();
    const cadastrar = async (email, nome = 'Pessoa PT8', senha = 'Aa1!aaaaaa') => {
      const c = new Client('c'); const t = csrfDe((await c.req('cadastro')).text);
      const pos = tam();
      const r = await c.form('api/cadastrar.php', { csrf_token: t, nome, email, whatsapp: '85988887777', senha, senha_confirmar: senha, site: '' });
      await new Promise((x) => setTimeout(x, 400));
      return { r, c, log: lerLog(pos) };
    };
    const novo = await cadastrar('pt8-novo@e2e.test');
    const linha = novo.log.match(/\[CADASTRO\]\[DEV\][^\n]*confirmar_email\?token=([a-f0-9]{64})/);
    ver(/cadastro\?ok=confirme/.test(novo.r.location), 'cadastro novo: redireciona para "veja seu e-mail"', novo.r.location);
    const linhaBD = sql("SELECT email_confirmado, confirmacao_token FROM usuarios WHERE email='pt8-novo@e2e.test'")[0];
    ver(linhaBD && linhaBD[0] === '0' && linhaBD[1] !== 'NULL', 'a conta nasce pendente, com token');
    const token1 = linha && linha[1];
    ver(token1 && crypto.createHash('sha256').update(token1).digest('hex') === linhaBD[1], 'o banco guarda só o sha256 do token do link');
    const tentativa = await new Client('t').login('pt8-novo@e2e.test', 'Aa1!aaaaaa');
    ver(!tentativa.logado && /confirmar_email/.test(tentativa.location), 'com a senha certa mas sem confirmar, o login é recusado', tentativa.location);
    // quem cadastra de novo antes de confirmar: vale o último envio e o link antigo morre
    const reenvio = await cadastrar('pt8-novo@e2e.test', 'Pessoa Nova', 'Bb2@bbbbbb');
    const token2 = (reenvio.log.match(/confirmar_email\?token=([a-f0-9]{64})/) || [])[1];
    ver(token2 && token2 !== token1 && /ok=confirme/.test(reenvio.r.location), 'novo cadastro do e-mail pendente gera outro link');
    const velho = await new Client('v').req(`confirmar_email?token=${token1}`);
    ver(/confirmacao_invalida/.test(velho.location), 'o link antigo deixa de valer');
    // resposta idêntica para e-mail já confirmado
    const existente = await cadastrar('leitor@e2e.test');
    ver(existente.r.location === novo.r.location, 'e-mail que já tem conta recebe a MESMA resposta (não revela cadastro)', `${existente.r.location} x ${novo.r.location}`);
    ver(sql("SELECT COUNT(*) FROM usuarios WHERE email='leitor@e2e.test'")[0][0] === '1', 'e a conta existente não foi alterada');
    // confirma
    const conf = await new Client('f').req(`confirmar_email?token=${token2}`);
    ver(/msg=email_confirmado/.test(conf.location), 'o link novo confirma o e-mail', conf.location);
    const reuso = await new Client('r').req(`confirmar_email?token=${token2}`);
    ver(/confirmacao_invalida/.test(reuso.location), 'o link é de uso único');
    const entra = await new Client('e').login('pt8-novo@e2e.test', 'Bb2@bbbbbb');
    ver(entra.logado, 'depois de confirmar, entra com a senha do último cadastro');
    ver(!(await new Client('e2').login('pt8-novo@e2e.test', 'Aa1!aaaaaa')).logado, 'a senha do envio antigo não entra');
    const lixo = (await new Client('l').req(`confirmar_email?token=${'z'.repeat(64)}`)).location + (await new Client('l2').req('confirmar_email')).location;
    ver(!/email_confirmado/.test(lixo), 'token inválido ou ausente não confirma nada');
    sql("UPDATE usuarios SET email_confirmado=0, confirmacao_token=SHA2('abc',256), confirmacao_expira=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE email='pt8-novo@e2e.test'");
    ver(/confirmacao_invalida/.test((await new Client('x3').req('confirmar_email?token=' + Buffer.from('abc').toString('hex').padEnd(64, '0'))).location), 'link expirado não confirma');
  } finally {
    fs.writeFileSync(ENV, envOriginal); // restaura o .env exatamente como estava
    sql("DELETE FROM usuarios WHERE email LIKE 'pt8-%@e2e.test'"); limpa();
  }
  ver(!/CADASTRO_CONFIRMAR_EMAIL/.test(fs.readFileSync(ENV, 'utf8')), '.env restaurado');

  sql("UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'"); limpa();
  console.log(falhas.length ? `\nT8: ${falhas.length} FALHA(S)\n- ${falhas.join('\n- ')}` : '\nT8: todos os pendentes comprovados');
})().catch((e) => { console.error('ERRO NO T8', e); try { /* garante o .env */ } catch (x) { /* nada */ } process.exit(1); });
