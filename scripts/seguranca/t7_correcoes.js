// T7: reteste das correções (A1, A2, M1–M4, B1, B3, M8, M9)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client, sql, ok, SENHA } = require('./lib');

const V4 = 'http://127.0.0.1/meus_livros/';   // um "IP"
const V6 = 'http://[::1]/meus_livros/';        // outro "IP" (o Apache atende nos dois)
const falhas = [];
const ver = (cond, msg, detalhe = '') => { if (cond) ok(msg); else { falhas.push(msg + ' ' + detalhe); console.log(`  FALHOU: ${msg} ${detalhe}`); } };
const limpa = () => sql('DELETE FROM tentativas_login');
const logApache = 'C:\\xampp\\apache\\logs\\error.log';
const tamLog = () => (fs.existsSync(logApache) ? fs.statSync(logApache).size : 0);
function lerLogDesde(pos) { const fd = fs.openSync(logApache, 'r'); const b = Buffer.alloc(fs.statSync(logApache).size - pos); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd); return b.toString('utf8'); }
async function loginEm(base, email, senha = SENHA) {
  const c = new Client('x');
  const pag = await c.req(base + 'login');
  const csrf = (pag.text.match(/name="csrf_token" value="([a-f0-9]{64})"/) || [])[1];
  const r = await c.form(base + 'api/auth.php', { csrf_token: csrf, email, senha });
  const home = await c.req(base + '');
  return { c, r, logado: /btn-user-menu/.test(home.text), bloqueado: /bloqueado/.test(r.location) };
}

(async () => {
  limpa();
  sql("UPDATE usuarios SET bloqueado=0, reset_token=NULL, reset_expires=NULL WHERE email LIKE '%@e2e.test'");
  const SENHA_HASH = "$2y$10$kEiueqHKJB8NppVKaKhSD.R4D67vJ0lrVFPX8nJkaIfPwxqp0njG.";

  console.log('== A2: força bruta com login próprio entre as rajadas ==');
  let bloqueou = false, chutes = 0;
  for (let ciclo = 0; ciclo < 8 && !bloqueou; ciclo++) {
    for (let i = 0; i < 4 && !bloqueou; i++) {
      const r = await loginEm(V4, 'leitor@e2e.test', `chute${ciclo}-${i}`); chutes++;
      if (r.bloqueado) bloqueou = true;
    }
    if (!bloqueou) await loginEm(V4, 'contribuidor@e2e.test'); // login legítimo na conta do atacante
  }
  ver(bloqueou, `o atacante foi bloqueado depois de ${chutes} chutes (antes: 40 sem bloqueio)`);
  ver(chutes <= 21, 'o bloqueio veio em até 20 chutes', `(chutes=${chutes})`);
  limpa();

  console.log('== M1: terceiro não consegue trancar o dono da conta ==');
  let b6 = false;
  for (let i = 0; i < 8 && !b6; i++) b6 = (await loginEm(V4, 'leitor@e2e.test', 'errada' + i)).bloqueado;
  const dono = await loginEm(V6, 'leitor@e2e.test'); // outro IP
  ver(b6, 'o atacante (IP A) ficou bloqueado');
  ver(dono.logado, 'o dono da conta (IP B) entra normalmente enquanto o atacante está bloqueado');
  const mesmoIp = await loginEm(V4, 'leitor@e2e.test');
  ver(!mesmoIp.logado, 'do IP do atacante nem a senha certa entra durante o bloqueio (esperado)');
  limpa();
  // controle: o dono errando a própria senha 5 vezes ainda trava a si mesmo
  let ctl = false;
  for (let i = 0; i < 7 && !ctl; i++) ctl = (await loginEm(V6, 'contribuidor@e2e.test', 'x' + i)).bloqueado;
  ver(ctl, 'controle: 5 erros seguidos do mesmo e-mail/IP continuam bloqueando');
  limpa();

  console.log('== A1: link de redefinição com Host forjado ==');
  const jar = path.join(__dirname, 'jar7.txt'); try { fs.unlinkSync(jar); } catch (e) { /* sem jar */ }
  const pagina = execFileSync('curl.exe', ['-s', '-c', jar, '-b', jar, 'http://localhost/meus_livros/login'], { encoding: 'utf8' });
  const csrf = (pagina.match(/name="csrf_token" value="([a-f0-9]{64})"/) || [])[1];
  const sid = fs.readFileSync(jar, 'utf8').split('\n').filter((l) => /PHPSESSID/.test(l)).map((l) => l.trim().split(/\s+/).pop())[0];
  const pos = tamLog();
  execFileSync('curl.exe', ['-s', '-o', 'NUL', '-H', 'Host: atacante.example.com', '-H', `Cookie: PHPSESSID=${sid}`, '-d', `csrf_token=${csrf}&email_recuperacao=contribuidor@e2e.test`, 'http://localhost/meus_livros/api/solicitar_reset.php']);
  await new Promise((r) => setTimeout(r, 700));
  const trecho = lerLogDesde(pos);
  const linha = (trecho.match(/RESET-SENHA\][^\n]*/) || [''])[0];
  console.log('  linha do log:', linha.replace(/token=[a-f0-9]+/, 'token=***').slice(0, 160));
  ver(linha.includes('http://localhost/meus_livros/redefinir-senha?token='), 'o link usa o APP_URL do .env');
  ver(!/atacante\.example\.com/.test(linha), 'o Host forjado não aparece no link');
  const tokenLink = (linha.match(/token=([a-f0-9]{64})/) || [])[1];

  console.log('== M2: token guardado como hash ==');
  const noBanco = sql("SELECT reset_token FROM usuarios WHERE email='contribuidor@e2e.test'")[0][0];
  ver(tokenLink && noBanco === crypto.createHash('sha256').update(tokenLink).digest('hex') && noBanco !== tokenLink, 'no banco está o sha256 do token, não o token');

  console.log('== M3: reset derruba sessões antigas e o token não reaproveita ==');
  const antiga = await loginEm(V4, 'contribuidor@e2e.test');
  ver(antiga.logado, 'sessão antiga aberta antes do reset');
  const sv = new Client('sv'); const t2 = await sv.tokenDe('login');
  const rr = await sv.form('api/salvar_nova_senha.php', { csrf_token: t2, token: tokenLink, nova_senha: 'Nova@Senha123', confirma_senha: 'Nova@Senha123' });
  ver(/pwd_recovered/.test(rr.location), 'redefinição com o token do e-mail funciona', rr.location);
  const home = await antiga.c.req('');
  ver(!/btn-user-menu/.test(home.text), 'a sessão antiga deixou de valer depois do reset');
  const reuso = await sv.form('api/salvar_nova_senha.php', { csrf_token: await sv.tokenDe('login'), token: tokenLink, nova_senha: 'Outra@Senha123', confirma_senha: 'Outra@Senha123' });
  ver(/token_invalido/.test(reuso.location), 'o token não pode ser usado de novo');
  const forj = await sv.form('api/salvar_nova_senha.php', { csrf_token: await sv.tokenDe('login'), token: noBanco, nova_senha: 'Outra@Senha123', confirma_senha: 'Outra@Senha123' });
  ver(/token_invalido/.test(forj.location), 'o hash lido do banco NÃO serve como token no link');
  sql(`UPDATE usuarios SET senha='${SENHA_HASH}', reset_token=NULL, reset_expires=NULL WHERE email='contribuidor@e2e.test'`);
  limpa();

  console.log('== M4: limite de pedidos de redefinição ==');
  const gerados = [];
  for (let i = 0; i < 6; i++) {
    const c = new Client('r'); const t = await c.tokenDe('login');
    const rLim = await c.form('api/solicitar_reset.php', { csrf_token: t, email_recuperacao: 'leitor@e2e.test' });
    gerados.push(rLim.location);
    sql("UPDATE usuarios SET reset_token=reset_token WHERE id=0");
  }
  const tokensVistos = sql("SELECT COUNT(*) FROM tentativas_login WHERE email LIKE '\\\\_\\\\_resetem\\\\_\\\\_:%'")[0][0];
  ver(gerados.every((l) => /reset_link_sent/.test(l)), 'a resposta ao usuário é sempre a mesma (não revela o limite)');
  ver(Number(tokensVistos) === 3, 'só 3 pedidos por e-mail por hora são processados', `(registrados: ${tokensVistos})`);
  limpa();

  console.log('== M3b: trocar a senha derruba as outras sessões ==');
  const s1 = await loginEm(V4, 'contribuidor@e2e.test'); const s2 = await loginEm(V4, 'contribuidor@e2e.test');
  const csrf1 = (await s1.c.req('')).text.match(/"csrfToken":"([a-f0-9]{64})"/)[1];
  const mu = await s1.c.form('api/mudar_senha.php', { csrf_token: csrf1, senha_atual: SENHA, nova_senha: 'Trocada@1234', confirma_senha: 'Trocada@1234' });
  ver(/pwd_changed/.test(mu.location), 'troca de senha concluída', mu.location);
  ver(/btn-user-menu/.test((await s1.c.req('')).text), 'a sessão que trocou a senha continua logada');
  ver(!/btn-user-menu/.test((await s2.c.req('')).text), 'a outra sessão da conta foi derrubada');
  sql(`UPDATE usuarios SET senha='${SENHA_HASH}' WHERE email='contribuidor@e2e.test'`);
  limpa();

  console.log('== B1: tempo do login não revela e-mails ==');
  const tEx = [], tNo = [];
  for (let i = 0; i < 6; i++) {
    limpa(); let c = new Client('t'); let t = await c.tokenDe('login');
    tEx.push((await c.form('api/auth.php', { csrf_token: t, email: 'contribuidor@e2e.test', senha: 'errada' + i })).ms);
    limpa(); t = await c.tokenDe('login');
    tNo.push((await c.form('api/auth.php', { csrf_token: t, email: `nao-existe-${i}@e2e.test`, senha: 'errada' + i })).ms);
  }
  const med = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  console.log(`  existe ${med(tEx)} ms | não existe ${med(tNo)} ms (antes: 105–120 x 22–40 ms)`);
  ver(Math.abs(med(tEx) - med(tNo)) < 40, 'diferença de tempo menor que 40 ms');
  limpa();

  console.log('== B3: progresso de livro oculto ==');
  const base = sql("SELECT nome_arquivo FROM livros WHERE publicacao='aprovado' AND formato='pdf' LIMIT 1")[0][0];
  const admId = sql("SELECT id FROM usuarios WHERE email='admin@e2e.test'")[0][0];
  const lId = sql("SELECT id FROM usuarios WHERE email='leitor@e2e.test'")[0][0];
  sql(`INSERT INTO livros (titulo, autor, nome_arquivo, formato, usuario_id, visivel_para, publicacao) VALUES ('[E2E] PT oculto7', 'a', '${base}', 'pdf', ${admId}, '', 'aprovado')`);
  const oculto = sql('SELECT MAX(id) FROM livros')[0][0];
  const L = new Client('L'); await L.login('leitor@e2e.test');
  const pr = await L.req(`api/progresso.php?id=${oculto}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': L.csrf }, body: JSON.stringify({ pagina: 2, total: 9 }) });
  ver(pr.status === 404 && sql(`SELECT COUNT(*) FROM leituras WHERE usuario_id=${lId} AND livro_id=${oculto}`)[0][0] === '0', 'progresso de livro oculto: 404 e nada gravado', `(status ${pr.status})`);
  const pub = sql("SELECT id FROM livros WHERE publicacao='aprovado' AND visivel_para LIKE '%leitor%' AND duplicado_de IS NULL LIMIT 1")[0][0];
  const pr2 = await L.req(`api/progresso.php?id=${pub}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': L.csrf }, body: JSON.stringify({ pagina: 2, total: 9 }) });
  ver(pr2.status === 200, 'progresso de livro visível continua funcionando', `(status ${pr2.status})`);
  sql("DELETE FROM livros WHERE titulo='[E2E] PT oculto7'");

  console.log('== M8/M9: cabeçalhos e .git ==');
  const a = new Client('a');
  const lg = await a.req('login');
  ver(!lg.headers.get('x-powered-by'), 'X-Powered-By removido');
  ver(!!lg.headers.get('permissions-policy'), 'Permissions-Policy presente');
  const g = await a.req('.git/config');
  ver(g.status === 404, '.git/config responde 404', `(status ${g.status})`);
  const g2 = await a.req('.git/HEAD');
  ver(g2.status === 404, '.git/HEAD responde 404', `(status ${g2.status})`);

  sql("UPDATE usuarios SET bloqueado=0, reset_token=NULL, reset_expires=NULL WHERE email LIKE '%@e2e.test'");
  limpa();
  console.log(falhas.length ? `\nT7: ${falhas.length} FALHA(S)\n- ${falhas.join('\n- ')}` : '\nT7: todas as correções comprovadas');
})().catch((e) => { console.error('ERRO NO T7', e); process.exit(1); });
