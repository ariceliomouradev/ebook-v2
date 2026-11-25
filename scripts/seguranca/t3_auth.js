// T3: logout, cadastro, força bruta, enumeração, reset de senha (inclui Host header), troca de senha
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client, sql, achados, achado, ok, SENHA } = require('./lib');

const limpa = () => sql('DELETE FROM tentativas_login');
const media = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);

(async () => {
  limpa();
  sql("UPDATE usuarios SET bloqueado=0, reset_token=NULL, reset_expires=NULL WHERE email LIKE '%@e2e.test'");

  console.log('== T3.1 logout ==');
  const lo = new Client('lo'); await lo.login('leitor@e2e.test');
  const antes = lo.jar.PHPSESSID;
  const r = await lo.req('logout', { follow: true });
  const reuso = new Client('reuso'); reuso.jar.PHPSESSID = antes;
  const home = await reuso.req('');
  if (/btn-user-menu/.test(home.text)) achado('ALTA', 'SESS-logout', 'Cookie de sessão continua válido depois do logout', 'GET / com o PHPSESSID antigo ainda mostra o menu do usuário', 'session_destroy + remover do banco');
  else ok('cookie antigo inválido depois do logout');

  console.log('== T3.2 cadastro: campos extras, XSS no nome ==');
  sql("DELETE FROM usuarios WHERE email LIKE 'pt-cad%@e2e.test'");
  const cad = new Client('cad'); const tk = await cad.tokenDe('cadastro');
  const nomeXss = '<b onmouseover=alert(1)>pt-cad';
  const rc = await cad.form('api/cadastrar.php', { csrf_token: tk, nome: nomeXss, email: 'pt-cad1@e2e.test', whatsapp: '85988887777', senha: 'Aa1!aaaaaa', senha_confirmar: 'Aa1!aaaaaa', site: '', perfil: 'admin', titular_id: 1, acesso_ate: '2099-01-01', bloqueado: 0 });
  const novo = sql("SELECT id, perfil, IFNULL(titular_id,'NULL'), acesso_origem FROM usuarios WHERE email='pt-cad1@e2e.test'")[0];
  console.log('  resultado:', rc.status, rc.location, novo);
  if (novo && novo[1] !== 'leitor') achado('CRITICA', 'MASS-perfil', 'Cadastro público aceita perfil do cliente', novo.join(','), 'ignorar campos extras');
  else ok('perfil forçado para leitor; campos extras ignorados');
  // o nome com HTML aparece escapado no menu do próprio usuário?
  const menu = await cad.req('');
  if (menu.text.includes('<b onmouseover=alert(1)>')) achado('ALTA', 'XSS-nome-menu', 'Nome do usuário sai sem escape na tela principal', '', 'e()');
  else ok('nome com HTML escapado na tela principal');
  // enumeração pelo cadastro
  const cad2 = new Client('cad2'); const tk2 = await cad2.tokenDe('cadastro');
  const rEx = await cad2.form('api/cadastrar.php', { csrf_token: tk2, nome: 'x', email: 'leitor@e2e.test', whatsapp: '85988887777', senha: 'Aa1!aaaaaa', senha_confirmar: 'Aa1!aaaaaa', site: '' });
  if (/email_em_uso/.test(rEx.location)) achado('BAIXA', 'ENUM-cadastro', 'O cadastro revela se um e-mail já tem conta (erro=email_em_uso)', rEx.location, 'resposta genérica + e-mail de confirmação (aceitar o risco é comum em cadastros abertos)');
  // limite de cadastros por IP
  let bloqueou = false;
  for (let i = 0; i < 8 && !bloqueou; i++) {
    const c = new Client('c' + i); const t = await c.tokenDe('cadastro');
    const rr = await c.form('api/cadastrar.php', { csrf_token: t, nome: 'Rate ' + i, email: `pt-cad-r${i}@e2e.test`, whatsapp: '85988887777', senha: 'Aa1!aaaaaa', senha_confirmar: 'Aa1!aaaaaa', site: '' });
    if (/muitos/.test(rr.location)) bloqueou = true;
  }
  if (!bloqueou) achado('MEDIA', 'RATE-cadastro', 'Cadastro público sem limite efetivo por IP', '8 cadastros seguidos sem bloqueio', 'rever cadastroBloqueado'); else ok('limite de cadastros por IP funciona');
  sql("DELETE FROM usuarios WHERE email LIKE 'pt-cad%@e2e.test'"); limpa();

  console.log('== T3.3 força bruta no login ==');
  // controle: 5 falhas seguidas bloqueiam?
  const vit = 'leitor@e2e.test';
  const f = new Client('bf');
  let bloqueado = false, tentativas = 0;
  for (let i = 0; i < 12 && !bloqueado; i++) {
    const t = await f.tokenDe('login');
    const rr = await f.form('api/auth.php', { csrf_token: t, email: vit, senha: 'errada' + i });
    tentativas++;
    if (/bloqueado/.test(rr.location)) bloqueado = true;
  }
  console.log(`  bloqueio após ${tentativas} tentativas: ${bloqueado}`);
  if (!bloqueado) achado('ALTA', 'BF-sem-bloqueio', 'Login sem bloqueio após várias falhas', '', 'rate limit');
  else ok('bloqueio funciona sem interferência');
  // com a conta bloqueada, o dono legítimo entra? (DoS de conta)
  const dono = new Client('dono'); const rl = await dono.login(vit);
  console.log('  o dono consegue entrar durante o bloqueio?', rl.logado ? 'sim' : 'não (conta travada por 5 min: qualquer pessoa pode travar a conta de outra)');
  if (!rl.logado) achado('MEDIA', 'BF-dos-conta', 'Qualquer pessoa trava o login de outra com 5 senhas erradas (bloqueio por e-mail de 5 min)', 'dono legítimo bloqueado durante o ataque', 'bloquear por (e-mail+IP), CAPTCHA/atraso progressivo');
  limpa();

  // bypass: login bem-sucedido numa conta própria limpa as falhas do IP
  const atk = new Client('atk');
  let bloqueadoBypass = false, tentados = 0;
  for (let ciclo = 0; ciclo < 10 && !bloqueadoBypass; ciclo++) {
    for (let i = 0; i < 4; i++) {
      const t = await atk.tokenDe('login');
      const rr = await atk.form('api/auth.php', { csrf_token: t, email: vit, senha: `chute${ciclo}-${i}` });
      tentados++;
      if (/bloqueado/.test(rr.location)) bloqueadoBypass = true;
    }
    const me = new Client('minha'); await me.login('contribuidor@e2e.test'); // login legítimo na conta do atacante zera o contador do IP
  }
  console.log(`  com login próprio entre as rajadas: ${tentados} chutes, bloqueado=${bloqueadoBypass}`);
  if (!bloqueadoBypass) achado('ALTA', 'BF-bypass', 'Força bruta contornável: um login bem-sucedido numa conta própria apaga as falhas de TODOS os e-mails do mesmo IP (DELETE ... WHERE email=? OR ip=?)', `${tentados} chutes contra ${vit} sem nenhum bloqueio`, 'limpar só falhas do próprio e-mail (WHERE email = ?) e contar por e-mail E por IP separadamente');
  limpa();

  console.log('== T3.4 enumeração de usuários pelo login ==');
  const tEx = [], tNo = [];
  for (let i = 0; i < 4; i++) {
    const c = new Client('t'); let t = await c.tokenDe('login');
    const a = await c.form('api/auth.php', { csrf_token: t, email: 'contribuidor@e2e.test', senha: 'errada' + i }); tEx.push(a.ms);
    t = await c.tokenDe('login');
    const b = await c.form('api/auth.php', { csrf_token: t, email: `nao-existe-${i}@e2e.test`, senha: 'errada' + i }); tNo.push(b.ms);
    if (a.location !== b.location) achado('MEDIA', 'ENUM-login-resposta', 'Resposta do login difere para e-mail existente', `${a.location} x ${b.location}`, 'resposta idêntica');
  }
  console.log(`  tempo médio (existe: ${media(tEx)} ms; não existe: ${media(tNo)} ms)`);
  if (media(tEx) - media(tNo) > 25) achado('BAIXA', 'ENUM-login-tempo', 'Tempo de resposta do login revela e-mails existentes (password_verify só roda quando o usuário existe)', `existe ${media(tEx)} ms x não existe ${media(tNo)} ms`, 'executar password_verify contra um hash falso quando o usuário não existe');
  limpa();

  console.log('== T3.5 redefinição de senha ==');
  // Host header injection (curl: o fetch do Node não deixa trocar o Host)
  const jar = path.join(__dirname, 'jar.txt');
  try { fs.unlinkSync(jar); } catch (e) { /* sem jar */ }
  const pagina = execFileSync('curl.exe', ['-s', '-c', jar, '-b', jar, 'http://localhost/meus_livros/login'], { encoding: 'utf8' });
  const csrf = (pagina.match(/name="csrf_token" value="([a-f0-9]{64})"/) || [])[1];
  const logPath = 'C:\\xampp\\apache\\logs\\error.log';
  const tamAntes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  execFileSync('curl.exe', ['-s', '-o', 'NUL', '-c', jar, '-b', jar, '-H', 'Host: atacante.example.com', '-d', `csrf_token=${csrf}&email_recuperacao=contribuidor@e2e.test`, 'http://localhost/meus_livros/api/solicitar_reset.php']);
  await new Promise((r) => setTimeout(r, 800));
  let trecho = '';
  if (fs.existsSync(logPath)) { const fd = fs.openSync(logPath, 'r'); const b = Buffer.alloc(fs.statSync(logPath).size - tamAntes); fs.readSync(fd, b, 0, b.length, tamAntes); trecho = b.toString('utf8'); fs.closeSync(fd); }
  const linha = (trecho.match(/RESET-SENHA\]\[DEV\][^\n]*/) || [''])[0].replace(/token=[a-f0-9]+/, 'token=***');
  console.log('  link gerado com Host forjado:', linha || '(não localizado no log)');
  if (/atacante\.example\.com/.test(linha)) achado('ALTA', 'RESET-host-injection', 'O link de redefinição de senha usa o cabeçalho Host da requisição: um atacante pede o reset de uma vítima com Host forjado e a vítima recebe, por e-mail, um link para o domínio dele já com o token válido (tomada de conta)', linha, 'fixar a URL base em APP_URL (.env) e nunca usar HTTP_HOST');
  // token em texto puro no banco
  const tkReset = sql("SELECT reset_token FROM usuarios WHERE email='contribuidor@e2e.test'")[0][0];
  if (/^[a-f0-9]{64}$/.test(tkReset)) achado('MEDIA', 'RESET-token-claro', 'Token de redefinição guardado em texto puro (quem lê o banco/backup assume a conta enquanto o token vale 1 h)', 'usuarios.reset_token = 64 hex em claro', 'gravar hash (sha256) do token e comparar o hash');
  // sem limite de pedidos? (spam de e-mail)
  let n = 0;
  for (let i = 0; i < 15; i++) {
    const c = new Client('r'); const t = await c.tokenDe('login');
    const rr = await c.form('api/solicitar_reset.php', { csrf_token: t, email_recuperacao: 'contribuidor@e2e.test' });
    if (rr.location.includes('reset_link_sent')) n++;
  }
  if (n >= 15) achado('MEDIA', 'RATE-reset', 'solicitar_reset.php sem limite de pedidos: dá para encher a caixa de e-mail de uma vítima e gastar a cota de envio da hospedagem', `${n}/15 pedidos aceitos`, 'limitar por IP e por e-mail (ex.: 3/hora)');
  // uso do token: reutilização e sessões antigas
  const tokenAtual = sql("SELECT reset_token FROM usuarios WHERE email='contribuidor@e2e.test'")[0][0];
  const sessAntiga = new Client('antiga'); await sessAntiga.login('contribuidor@e2e.test');
  const sv = new Client('sv'); const t2 = await sv.tokenDe('login');
  const novaSenha = 'Nova@Senha123';
  const rr = await sv.form('api/salvar_nova_senha.php', { csrf_token: t2, token: tokenAtual, nova_senha: novaSenha, confirma_senha: novaSenha });
  console.log('  reset com token válido ->', rr.location);
  const reutil = await sv.form('api/salvar_nova_senha.php', { csrf_token: await sv.tokenDe('login'), token: tokenAtual, nova_senha: 'Outra@Senha123', confirma_senha: 'Outra@Senha123' });
  if (!/token_invalido/.test(reutil.location)) achado('ALTA', 'RESET-reuso', 'Token de redefinição pode ser reutilizado', reutil.location, 'apagar token após o uso');
  else ok('token de redefinição não reutilizável');
  const aindaLogado = /btn-user-menu/.test((await sessAntiga.req('')).text);
  if (aindaLogado) achado('MEDIA', 'RESET-sessoes', 'Depois de redefinir a senha, sessões abertas continuam válidas (quem roubou a sessão não é expulso)', 'sessão antiga ainda autenticada após o reset', 'derrubar sessões do usuário (DELETE FROM sessoes_ativas WHERE usuario_id=?) e o arquivo de sessão');
  // restaura a senha de teste
  sql(`UPDATE usuarios SET senha='$2y$10$kEiueqHKJB8NppVKaKhSD.R4D67vJ0lrVFPX8nJkaIfPwxqp0njG.', reset_token=NULL, reset_expires=NULL WHERE email='contribuidor@e2e.test'`);
  // token expirado/forjado
  const exp = await sv.form('api/salvar_nova_senha.php', { csrf_token: await sv.tokenDe('login'), token: 'a'.repeat(64), nova_senha: 'Aa1!aaaaaa', confirma_senha: 'Aa1!aaaaaa' });
  if (!/token_invalido/.test(exp.location)) achado('CRITICA', 'RESET-forjado', 'Token forjado aceito', exp.location, '');
  else ok('token forjado recusado');
  const sqli = await sv.form('api/salvar_nova_senha.php', { csrf_token: await sv.tokenDe('login'), token: "' OR '1'='1", nova_senha: 'Aa1!aaaaaa', confirma_senha: 'Aa1!aaaaaa' });
  if (!/token_invalido/.test(sqli.location)) achado('CRITICA', 'RESET-sqli', 'SQL injection no token de redefinição', sqli.location, 'prepared statements');
  else ok("token \"' OR '1'='1\" recusado");
  const hashSenhas = sql("SELECT COUNT(*) FROM usuarios WHERE senha NOT LIKE '$2y$%'")[0][0];
  console.log('  senhas fora de bcrypt no banco:', hashSenhas);
  if (hashSenhas !== '0') achado('ALTA', 'PWD-hash', 'Há senhas que não estão em bcrypt', hashSenhas, 'rehash');

  console.log('== T3.6 troca de senha e outras sessões ==');
  const s1 = new Client('s1'), s2 = new Client('s2');
  await s1.login('contribuidor@e2e.test'); await s2.login('contribuidor@e2e.test');
  const mu = await s1.form('api/mudar_senha.php', { csrf_token: s1.csrf, senha_atual: SENHA, nova_senha: 'Trocada@1234', confirma_senha: 'Trocada@1234' });
  console.log('  mudar_senha ->', mu.status, mu.location);
  const s2Vivo = /btn-user-menu/.test((await s2.req('')).text);
  if (s2Vivo) achado('MEDIA', 'PWD-sessoes', 'Trocar a senha não derruba as outras sessões abertas da conta', 'sessão paralela continua autenticada', 'invalidar demais sessões do usuário na troca de senha');
  sql(`UPDATE usuarios SET senha='$2y$10$kEiueqHKJB8NppVKaKhSD.R4D67vJ0lrVFPX8nJkaIfPwxqp0njG.' WHERE email='contribuidor@e2e.test'`);
  const semAtual = await s1.form('api/mudar_senha.php', { csrf_token: s1.csrf, senha_atual: 'errada', nova_senha: 'Trocada@1234', confirma_senha: 'Trocada@1234' });
  const trocouSemAtual = sql("SELECT senha FROM usuarios WHERE email='contribuidor@e2e.test'")[0][0].startsWith('$2y$10$kEiueq');
  if (!trocouSemAtual) achado('CRITICA', 'PWD-sem-atual', 'Senha trocada sem informar a senha atual', '', '');
  else ok('troca de senha exige a senha atual');
  limpa();
  sql("UPDATE usuarios SET bloqueado=0 WHERE email LIKE '%@e2e.test'");
  fs.writeFileSync(path.join(__dirname, 'achados_t3.json'), JSON.stringify(achados, null, 2));
  console.log(`\nT3 concluído: ${achados.length} achado(s)`);
})().catch((e) => { console.error('ERRO NO T3', e); process.exit(1); });

