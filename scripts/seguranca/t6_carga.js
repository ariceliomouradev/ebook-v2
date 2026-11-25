// T6: carga e resistência (somente localhost). Mede latência/erros em cenários realistas e abusivos.
const fs = require('fs');
const path = require('path');
const { Client, sql, achados, achado, ok } = require('./lib');

const { execSync } = require('child_process');
function portasEmTimeWait() { try { return Number(execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -State TimeWait -ErrorAction SilentlyContinue | Measure-Object).Count"', { encoding: 'utf8' }).trim()) || 0; } catch (e) { return 0; } }
async function esperarPortas() { // o Windows guarda cada conexão fechada por 4 min (TIME_WAIT): sem isso o teste mede o limite do sistema operacional, não o do sistema
  let n = portasEmTimeWait(); const t0 = Date.now();
  while (n > 4000 && Date.now() - t0 < 300000) { await new Promise((r) => setTimeout(r, 10000)); n = portasEmTimeWait(); }
  return n;
}
function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }

async function rodar(nome, concorrencia, segundos, fabrica) {
  const livres = await esperarPortas(); console.log(`  (aguardando portas livres: TIME_WAIT=${livres})`);
  const lat = []; const status = {}; let erros = 0; let bytes = 0;
  const fim = Date.now() + segundos * 1000;
  const t0 = Date.now();
  async function trabalhador(i) {
    const cli = await fabrica(i);
    while (Date.now() < fim) {
      const r = await cli.fn();
      lat.push(r.ms); bytes += r.buf ? r.buf.length : 0;
      status[r.status] = (status[r.status] || 0) + 1;
      if (r.status === 0 || r.status >= 500) erros++;
    }
  }
  await Promise.all(Array.from({ length: concorrencia }, (_, i) => trabalhador(i)));
  const dur = (Date.now() - t0) / 1000;
  const res = { nome, concorrencia, req: lat.length, rps: +(lat.length / dur).toFixed(1), p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: Math.max(...lat), erros, status, mb: +(bytes / 1048576).toFixed(1) };
  console.log(`  ${nome} @${concorrencia}: ${res.req} req, ${res.rps} req/s, p50 ${res.p50} ms, p95 ${res.p95} ms, p99 ${res.p99} ms, máx ${res.max} ms, erros ${erros}, status ${JSON.stringify(status)}`);
  return res;
}

(async () => {
  const ids = sql("SELECT id FROM livros WHERE publicacao='aprovado' AND formato='pdf' ORDER BY id LIMIT 1")[0];
  const livro = ids[0];
  const resultados = [];
  // sessões autenticadas pré-criadas (login é caro: bcrypt)
  const pool = [];
  for (let i = 0; i < 12; i++) { const c = new Client('u' + i); const email = 'admin@e2e.test'; const r = await c.login(email); if (r.logado) pool.push(c); }
  console.log(`  ${pool.length} sessões prontas`);
  const sessao = (i) => pool[i % pool.length];

  console.log('== T6.1 leitura autenticada ==');
  for (const conc of [5, 20, 50]) {
    resultados.push(await rodar('biblioteca (index)', conc, 4, async (i) => { const c = sessao(i); return { fn: () => c.req('') }; }));
  }
  for (const conc of [5, 20, 50]) {
    resultados.push(await rodar('busca AJAX', conc, 4, async (i) => { const c = sessao(i); const termos = ['a', 'livro', 'maluquinho', 'arte', 'xyz', 'poder']; let k = 0; return { fn: () => c.req('api/buscar.php?busca=' + termos[k++ % termos.length] + '&pagina=' + (1 + (k % 5))) }; }));
  }
  resultados.push(await rodar('página estática (css)', 50, 3, async () => { const c = new Client('x'); return { fn: () => c.req('assets/css/style.css') }; }));
  resultados.push(await rodar('download PDF com Range', 20, 4, async (i) => { const c = sessao(i); return { fn: () => c.req('api/download.php?id=' + livro, { headers: { range: 'bytes=0-65535' } }) }; }));
  resultados.push(await rodar('progresso (escrita)', 20, 4, async (i) => { const c = sessao(i); let n = 1; return { fn: () => c.req('api/progresso.php?id=' + livro, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': c.csrf }, body: JSON.stringify({ pagina: (n++ % 50) + 1, total: 100 }) }) }; }));

  console.log('== T6.2 abuso ==');
  resultados.push(await rodar('login válido com bcrypt (CPU)', 6, 6, async (i) => { return { fn: async () => { const c = new Client('l' + i); const t = await c.tokenDe('login'); return c.form('api/auth.php', { csrf_token: t, email: 'admin@e2e.test', senha: 'Senha@E2E1' }); } }; }));
  sql('DELETE FROM tentativas_login');
  const gigante = 'a'.repeat(900000);
  resultados.push(await rodar('busca com texto de 7 KB', 5, 4, async (i) => { const c = sessao(i); return { fn: () => c.req('api/buscar.php?busca=' + gigante.slice(0, 7000)) }; }));
  const pesada = await sessao(0).req('api/buscar.php?pagina=99999999999999999999&busca=%25%25%25%25%25');
  console.log(`  página absurda + curingas: ${pesada.status} em ${pesada.ms} ms`);
  const post1mb = await sessao(0).req('api/progresso.php?id=' + livro, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': sessao(0).csrf }, body: JSON.stringify({ pagina: 1, total: 2, posicao: 'x'.repeat(1_000_000) }) });
  console.log(`  progresso com posicao de 1 MB: ${post1mb.status} ${post1mb.text.slice(0, 50)}`);
  // Slowloris simples: conexões abertas sem terminar o cabeçalho
  const net = require('net');
  const socks = [];
  await new Promise((resolve) => {
    let abertas = 0;
    for (let i = 0; i < 150; i++) {
      const s = net.connect(80, '127.0.0.1', () => { s.write('GET /meus_livros/login HTTP/1.1\r\nHost: localhost\r\nX-a: '); abertas++; if (abertas === 150) resolve(); });
      s.on('error', () => { abertas++; if (abertas === 150) resolve(); });
      socks.push(s);
    }
    setTimeout(resolve, 3000);
  });
  const durante = await new Client('x').req('login', { timeout: 15000 });
  console.log(`  com 150 conexões lentas penduradas, /login responde: status ${durante.status} em ${durante.ms} ms`);
  if (durante.status === 0 || durante.ms > 5000) achado('MEDIA', 'DOS-slowloris', 'Servidor degrada/trava com 150 conexões lentas (Slowloris)', `status ${durante.status}, ${durante.ms} ms`, 'mod_reqtimeout e limite de conexões por IP (na hospedagem: confirmar proteção do provedor/Cloudflare)');
  socks.forEach((s) => s.destroy());

  for (const r of resultados) {
    if (r.erros > 0) achado('ALTA', 'CARGA-erros-' + r.nome, `${r.erros} erros 5xx/conexão em "${r.nome}" a ${r.concorrencia} usuários simultâneos`, JSON.stringify(r.status), 'investigar gargalo');
    if (r.p95 > 3000) achado('MEDIA', 'CARGA-lento-' + r.nome, `p95 de ${r.p95} ms em "${r.nome}" a ${r.concorrencia} simultâneos`, `${r.rps} req/s`, 'índices/cache');
  }
  fs.writeFileSync(path.join(__dirname, 'carga.json'), JSON.stringify(resultados, null, 2));
  fs.writeFileSync(path.join(__dirname, 'achados_t6.json'), JSON.stringify(achados, null, 2));
  console.log(`\nT6 concluído: ${achados.length} achado(s)`);
})().catch((e) => { console.error('ERRO NO T6', e); process.exit(1); });
