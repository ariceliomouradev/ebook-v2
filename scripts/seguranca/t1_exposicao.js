// T1: arquivos expostos, cabeçalhos, acesso anônimo aos endpoints, CSRF, listagem de diretórios
const fs = require('fs');
const path = require('path');
const { Client, BASE, achados, achado, ok } = require('./lib');

(async () => {
  const raiz = path.resolve(__dirname, '..', '..');
  const anon = new Client('anon');

  console.log('== T1.1 arquivos sensíveis acessíveis por HTTP ==');
  const alvos = [
    '.env', '.env.example', '.git/config', '.git/HEAD', '.gitignore', 'database/schema.sql', 'database/.dev-credenciais.txt',
    'database/atualizar_banco_v3.sql', 'database/migracao_v1.5_perfis.sql', 'database/seed_dev.php', 'database/importar_epubs.php',
    'config/app.php', 'config/db.php', 'config/bootstrap.php', 'config/env.php', 'includes/functions.php', 'includes/perfis.php',
    'components/header.php', 'views/leitor.php', 'package.json', 'package-lock.json', 'cypress.config.js', 'README.md', 'CLAUDE.md',
    'cypress/support/dados.js', 'node_modules/', 'scripts/importar-acervo.js', 'sessoes/', 'uploads/', 'capas/', 'banners/', 'avatares/',
    'database/.importacao_epub/ultimo.json', 'ESPECIFICACAO_TECNICA.md', 'composer.json', 'phpinfo.php', 'diagnostico.php', '.htaccess',
    'manifest.webmanifest', 'api/', 'assets/', 'includes/', 'config/', 'database/', 'error_log', 'php_errorlog', 'logs/', 'backup.sql', 'dump.sql',
  ];
  for (const a of alvos) {
    const r = await anon.req(a);
    const corpo = r.text.slice(0, 120).replace(/\s+/g, ' ');
    const listagem = /Index of|<title>Index/i.test(r.text);
    if (r.status === 200 && (listagem || !/^(manifest\.webmanifest|api\/|assets\/)$/.test(a))) {
      const publicoOk = ['manifest.webmanifest'].includes(a);
      if (!publicoOk) achado(a.match(/\.env$|credenciais|\.git|config\/(app|db|env)|dump|backup|ultimo\.json/) ? 'CRITICA' : (listagem ? 'MEDIA' : 'BAIXA'), 'EXP-' + a, `GET /${a} responde 200${listagem ? ' (listagem de diretório)' : ''}`, `status 200; início: ${corpo}`, 'Bloquear no .htaccess (Require all denied) ou mover para fora do webroot');
    } else {
      ok(`/${a} -> ${r.status}`);
    }
  }

  console.log('== T1.2 cabeçalhos de segurança ==');
  for (const p of ['login', 'inicio', 'api/auth.php']) {
    const r = await anon.req(p);
    const h = (n) => r.headers.get(n);
    const faltam = [];
    if (!h('content-security-policy')) faltam.push('Content-Security-Policy');
    if (!h('x-frame-options')) faltam.push('X-Frame-Options');
    if (!h('x-content-type-options')) faltam.push('X-Content-Type-Options');
    if (!h('referrer-policy')) faltam.push('Referrer-Policy');
    if (!h('strict-transport-security')) faltam.push('Strict-Transport-Security (esperado só em HTTPS)');
    if (!h('permissions-policy')) faltam.push('Permissions-Policy');
    console.log(`  /${p}: faltam ${faltam.join(', ') || 'nenhum'}; Server=${h('server')}; X-Powered-By=${h('x-powered-by')}`);
    if (h('x-powered-by')) achado('BAIXA', 'HDR-xpb-' + p, 'X-Powered-By revela a versão do PHP', `X-Powered-By: ${h('x-powered-by')}`, 'expose_php=Off no php.ini');
    if (/\d/.test(h('server') || '')) achado('BAIXA', 'HDR-server-' + p, 'Cabeçalho Server revela versões', `Server: ${h('server')}`, 'ServerTokens Prod');
  }
  const loginResp = await anon.req('login');
  const sc = (anon.ultimosSetCookie || []).join(' | ');
  console.log('  Set-Cookie (login):', sc);
  if (sc && !/httponly/i.test(sc)) achado('ALTA', 'COK-httponly', 'Cookie de sessão sem HttpOnly', sc, 'session.cookie_httponly');
  if (sc && !/samesite/i.test(sc)) achado('MEDIA', 'COK-samesite', 'Cookie de sessão sem SameSite', sc, 'SameSite=Lax/Strict');

  console.log('== T1.3 endpoints sem login ==');
  const apis = fs.readdirSync(path.join(raiz, 'api')).filter((f) => f.endsWith('.php'));
  const publicos = ['auth.php', 'cadastrar.php', 'solicitar_reset.php', 'salvar_nova_senha.php'];
  for (const f of apis) {
    for (const metodo of ['GET', 'POST']) {
      const r = await anon.req('api/' + f + '?id=1', { method: metodo, headers: metodo === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}, body: metodo === 'POST' ? 'action=listar' : undefined });
      const dado = r.status === 200 && !/"success":false/.test(r.text);
      if (dado && !publicos.includes(f)) achado('ALTA', 'ANON-' + f + '-' + metodo, `api/${f} (${metodo}) respondeu 200 sem login`, r.text.slice(0, 150), 'require_login/require_perfil no início do arquivo');
    }
  }
  ok(`${apis.length} endpoints testados sem sessão`);
  for (const p of ['', 'leitor?id=1', 'usuarios', 'assinatura', 'definir_senha']) {
    const r = await anon.req(p);
    console.log(`  /${p} anônimo -> ${r.status} ${r.location}`);
  }

  console.log('== T1.4 métodos HTTP ==');
  for (const m of ['TRACE', 'OPTIONS', 'PUT', 'DELETE']) {
    const r = await anon.req('login', { method: m });
    console.log(`  ${m} /login -> ${r.status} Allow=${r.headers.get('allow') || ''}`);
    if (m === 'TRACE' && r.status === 200) achado('BAIXA', 'HTTP-trace', 'TRACE habilitado', 'TRACE responde 200', 'TraceEnable off');
  }
  fs.writeFileSync(path.join(__dirname, 'achados_t1.json'), JSON.stringify(achados, null, 2));
})();
