// T5: upload (PDF/EPUB/foto/banner/capa), arquivos disfarçados, bombas de descompressão, XXE, execução de código
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Client, sql, achados, achado, ok, BASE } = require('./lib');

const RAIZ = path.resolve(__dirname, '..', '..');
const MARCA = '[E2E] PT ';

/* ---- mini escritor de ZIP (com deflate) ---- */
function zip(entradas) {
  const partes = []; const central = []; let offset = 0;
  for (const { nome, dados, loja } of entradas) {
    const buf = Buffer.isBuffer(dados) ? dados : Buffer.from(dados);
    const comp = loja ? buf : zlib.deflateRawSync(buf, { level: 9 });
    const crc = zlib.crc32(buf);
    const nomeB = Buffer.from(nome);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(loja ? 0 : 8, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(buf.length, 22); h.writeUInt16LE(nomeB.length, 26); h.writeUInt16LE(0, 28);
    partes.push(h, nomeB, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(loja ? 0 : 8, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(buf.length, 24); c.writeUInt16LE(nomeB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nomeB);
    offset += 30 + nomeB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cd, fim]);
}
function epub({ titulo = 'Livro PT', autor = 'Autor PT', extra = [], capa = null, opfExtra = '' } = {}) {
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">pt</dc:identifier><dc:title>${titulo}</dc:title><dc:creator>${autor}</dc:creator><dc:language>pt</dc:language>${opfExtra}</metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>${capa ? '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : ''}</manifest><spine><itemref idref="c1"/></spine></package>`;
  const itens = [
    { nome: 'mimetype', dados: 'application/epub+zip', loja: true },
    { nome: 'META-INF/container.xml', dados: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { nome: 'OEBPS/content.opf', dados: opf },
    { nome: 'OEBPS/c1.xhtml', dados: '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>texto</p></body></html>' },
    ...(capa ? [{ nome: 'OEBPS/cover.png', dados: capa }] : []), ...extra,
  ];
  return zip(itens);
}
function pngGrande(w, h) { // PNG sólido gigante, pequeno no disco (bomba de descompressão de imagem)
  const crc = (b) => { const o = Buffer.alloc(4); o.writeUInt32BE(zlib.crc32(b)); return o; };
  const ch = (tipo, dados) => { const l = Buffer.alloc(4); l.writeUInt32BE(dados.length); const t = Buffer.concat([Buffer.from(tipo), dados]); return Buffer.concat([l, t, crc(t)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.alloc(1 + w * 3); const deflate = zlib.createDeflateRaw ? null : null; void deflate;
  const linhas = Buffer.alloc((1 + w * 3) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(linhas, { level: 9 })), ch('IEND', Buffer.alloc(0))]);
}

function multipart(campos, arquivo) {
  const b = '----pt' + Date.now();
  const partes = [];
  for (const [k, v] of Object.entries(campos)) partes.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (arquivo) partes.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${arquivo.campo}"; filename="${arquivo.nome}"\r\nContent-Type: ${arquivo.tipo}\r\n\r\n`), arquivo.dados, Buffer.from('\r\n'));
  partes.push(Buffer.from(`--${b}--\r\n`));
  return { corpo: Buffer.concat(partes), tipo: `multipart/form-data; boundary=${b}` };
}
const arquivosUploads = () => new Set(fs.readdirSync(path.join(RAIZ, 'uploads')));

(async () => {
  const A = new Client('A'), L = new Client('L');
  await A.login('admin@e2e.test'); await L.login('leitor@e2e.test');
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%' OR titulo LIKE '%PT-UP%'`);
  const enviar = async (cli, arquivo, campos = {}) => {
    const m = multipart({ csrf_token: cli.csrf, titulo: MARCA + 'PT-UP', autor: 'PT', categoria: '', ...campos }, arquivo);
    const antes = arquivosUploads();
    const r = await cli.req('api/upload.php', { method: 'POST', headers: { 'content-type': m.tipo }, body: m.corpo, timeout: 120000 });
    const novos = [...arquivosUploads()].filter((f) => !antes.has(f));
    return { r, novos };
  };

  console.log('== T5.1 arquivos que não são livros ==');
  const casos = [
    ['PHP puro com .pdf', { campo: 'arquivo_pdf', nome: 'x.pdf', tipo: 'application/pdf', dados: Buffer.from('<?php echo shell_exec($_GET["c"]); ?>') }],
    ['PHP com .php', { campo: 'arquivo_pdf', nome: 'x.php', tipo: 'application/x-php', dados: Buffer.from('<?php phpinfo(); ?>') }],
    ['HTML/JS com .pdf', { campo: 'arquivo_pdf', nome: 'x.pdf', tipo: 'application/pdf', dados: Buffer.from('<script>alert(1)</script>') }],
    ['SVG com script', { campo: 'arquivo_pdf', nome: 'x.pdf', tipo: 'image/svg+xml', dados: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') }],
    ['ZIP qualquer (não epub)', { campo: 'arquivo_pdf', nome: 'x.epub', tipo: 'application/epub+zip', dados: zip([{ nome: 'a.txt', dados: 'oi' }]) }],
    ['nome com traversal', { campo: 'arquivo_pdf', nome: '../../../x.php', tipo: 'application/pdf', dados: Buffer.from('%PDF-1.4\n%%EOF') }],
  ];
  for (const [nome, arq] of casos) {
    const { r, novos } = await enviar(A, arq);
    const aceito = /msg=sucesso/.test(r.location);
    const rastro = novos.filter((f) => !/\.(pdf|epub)$/.test(f));
    console.log(`  ${nome}: ${r.status} ${r.location} novos=${novos.join(',') || '-'}`);
    if (rastro.length) achado('CRITICA', 'UP-ext-' + nome, `Upload gravou arquivo com extensão inesperada: ${rastro.join(',')}`, nome, 'extensão fixa');
    if (aceito && !/%PDF-/.test(arq.dados.toString().slice(0, 5)) && nome !== 'nome com traversal') achado('ALTA', 'UP-aceito-' + nome, `Upload aceitou "${nome}" como livro`, r.location, 'validar conteúdo');
  }
  // PDF poliglota com PHP: aceito como PDF; o ponto é: pode ser executado?
  const poli = Buffer.from('%PDF-1.4\n<?php echo "EXECUTADO"; ?>\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const up = await enviar(A, { campo: 'arquivo_pdf', nome: 'poli.pdf', tipo: 'application/pdf', dados: poli }, { titulo: MARCA + 'PT-UP poliglota' });
  console.log('  PDF+PHP poliglota ->', up.r.status, up.r.location, up.novos.join(','));
  for (const f of up.novos) {
    const direto = await A.req('uploads/' + f);
    console.log(`  acesso direto uploads/${f} -> ${direto.status}`);
    if (direto.status === 200) achado('ALTA', 'UP-direto', 'Arquivo enviado é servido direto de /uploads/ (sem passar pela checagem de permissão)', `status 200 em /uploads/${f}`, '.htaccess negando acesso à pasta');
    if (/EXECUTADO/.test(direto.text)) achado('CRITICA', 'UP-rce', 'Código PHP dentro do upload foi executado', '', '');
  }

  console.log('== T5.2 EPUB malicioso ==');
  const xss = await enviar(A, { campo: 'arquivo_pdf', nome: 'xss.epub', tipo: 'application/epub+zip', dados: epub({ titulo: '&lt;img src=x onerror=alert(1)&gt; PT-UP xss', autor: '&lt;script&gt;alert(1)&lt;/script&gt;' }) }, { titulo: '', autor: '' });
  console.log('  EPUB com HTML nos metadados ->', xss.r.status, xss.r.location);
  const painel = await A.req('');
  if (/<img src=x onerror=alert\(1\)>|<script>alert\(1\)<\/script>/.test(painel.text)) achado('ALTA', 'XSS-epub-meta', 'Metadados do EPUB (título/autor) chegam sem escape à tela', '', 'e()');
  else ok('metadados com HTML escapados na tela principal');
  // XXE: entidade externa no OPF
  const xxe = epub({ titulo: '&xxe; PT-UP xxe', opfExtra: '' }).toString('latin1').replace('<?xml version="1.0"?><package', '<?xml version="1.0"?><!DOCTYPE p [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><package');
  const xxeBuf = Buffer.from(xxe, 'latin1');
  void xxeBuf; // o ZIP deflatado não permite substituição textual: gera de novo com loja
  const opfXxe = `<?xml version="1.0"?><!DOCTYPE package [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">pt</dc:identifier><dc:title>&xxe;</dc:title><dc:creator>XXE PT-UP</dc:creator><dc:language>pt</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  const xxeZip = zip([
    { nome: 'mimetype', dados: 'application/epub+zip', loja: true },
    { nome: 'META-INF/container.xml', dados: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { nome: 'OEBPS/content.opf', dados: opfXxe }, { nome: 'OEBPS/c1.xhtml', dados: '<html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>' },
  ]);
  const rx = await enviar(A, { campo: 'arquivo_pdf', nome: 'xxe.epub', tipo: 'application/epub+zip', dados: xxeZip }, { titulo: '', autor: '' });
  const tituloGravado = sql("SELECT titulo FROM livros WHERE autor LIKE '%XXE PT-UP%' ORDER BY id DESC LIMIT 1")[0]?.[0] || '';
  console.log('  XXE -> título gravado:', JSON.stringify(tituloGravado.slice(0, 60)));
  if (/\[fonts\]|\[extensions\]|for 16-bit/i.test(tituloGravado)) achado('CRITICA', 'XXE-epub', 'XXE: o conteúdo de arquivo local foi lido pelo parser do OPF', tituloGravado.slice(0, 60), 'LIBXML_NONET sem LIBXML_NOENT (já é o padrão) / libxml_disable_entity_loader');
  else ok('XXE não expandiu arquivo local');
  // bomba de entidades (billion laughs)
  const lol = '<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;"><!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;"><!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;"><!ENTITY g "&f;&f;&f;&f;&f;&f;&f;&f;&f;&f;"><!ENTITY h "&g;&g;&g;&g;&g;&g;&g;&g;&g;&g;">]><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>&h;</dc:title><dc:creator>LOL PT-UP</dc:creator></metadata><manifest/><spine/></package>';
  const lolZip = zip([{ nome: 'mimetype', dados: 'application/epub+zip', loja: true }, { nome: 'META-INF/container.xml', dados: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' }, { nome: 'OEBPS/content.opf', dados: lol }]);
  const t0 = Date.now();
  const rl = await enviar(A, { campo: 'arquivo_pdf', nome: 'lol.epub', tipo: 'application/epub+zip', dados: lolZip }, { titulo: '', autor: '' });
  console.log(`  billion laughs -> ${rl.r.status} em ${Date.now() - t0} ms`);
  if (Date.now() - t0 > 4000 || rl.r.status >= 500) achado('ALTA', 'DOS-xml', 'Bomba de entidades XML no OPF consome CPU/memória', `${Date.now() - t0} ms, status ${rl.r.status}`, 'rejeitar DOCTYPE no OPF');

  console.log('== T5.3 bombas de descompressão no EPUB ==');
  const tCover = Date.now();
  const bomba = epub({ capa: pngGrande(9000, 9000), titulo: 'PT-UP bomba imagem' });
  console.log(`  EPUB com capa 9000x9000 (81 MP): ${(bomba.length / 1024).toFixed(0)} KB`);
  const rb = await enviar(A, { campo: 'arquivo_pdf', nome: 'bomba.epub', tipo: 'application/epub+zip', dados: bomba }, { titulo: '', autor: '' });
  console.log(`  -> ${rb.r.status} ${rb.r.location} em ${Date.now() - tCover} ms`);
  if (rb.r.status >= 500 || /Fatal|memory/i.test(rb.r.text)) achado('ALTA', 'DOS-capa', 'Capa gigante dentro do EPUB derruba a requisição (memória)', rb.r.text.slice(0, 100), 'checar dimensões antes de decodificar (já existe o limite de 24 MP)');
  else ok('capa gigante ignorada sem erro (limite de pixels funciona)');
  // muitos HTMLs enormes e compressíveis: o leitor de sinais lê até 400 KB de cada
  const html = Buffer.alloc(400 * 1024, 0x20);
  const muitos = [];
  for (let i = 0; i < 3000; i++) muitos.push({ nome: `OEBPS/p${i}.xhtml`, dados: html });
  const zb = epub({ extra: muitos, titulo: 'PT-UP zipbomb' });
  console.log(`  EPUB com 3000 XHTML de 400 KB (1,2 GB descompactado): ${(zb.length / 1048576).toFixed(1)} MB no disco`);
  const t1 = Date.now();
  const rz = await enviar(A, { campo: 'arquivo_pdf', nome: 'zipbomb.epub', tipo: 'application/epub+zip', dados: zb }, { titulo: '', autor: '' });
  const ms = Date.now() - t1;
  console.log(`  -> ${rz.r.status} ${rz.r.location} em ${ms} ms`);
  if (ms > 5000) achado('ALTA', 'DOS-zipbomb', `Upload de EPUB com 1,2 GB descompactado (${(zb.length / 1048576).toFixed(1)} MB no disco) prende o servidor por ${(ms / 1000).toFixed(1)} s: infantilSinaisDoEpub() descompacta cada XHTML sem limite total`, `${ms} ms`, 'limitar bytes lidos no total (ex.: 3 MB) e número de entradas lidas');
  else if (ms > 1500) achado('MEDIA', 'DOS-zipbomb', `Upload de EPUB muito compressível leva ${ms} ms de CPU`, '', 'limite total de leitura');

  console.log('== T5.4 foto de perfil e capa base64 ==');
  const png1 = pngGrande(50, 50);
  const foto = async (cli, nome, tipo, dados) => { const m = multipart({ action: 'enviar', csrf_token: cli.csrf }, { campo: 'foto', nome, tipo, dados }); return cli.req('api/foto_perfil.php', { method: 'POST', headers: { 'content-type': m.tipo, 'x-csrf-token': cli.csrf }, body: m.corpo }); };
  for (const [desc, nome, tipo, dados] of [
    ['PHP como .png', 'x.png', 'image/png', Buffer.from('<?php system("id");?>')],
    ['SVG', 'x.png', 'image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ['GIF', 'x.png', 'image/png', Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'latin1')],
    ['PNG 9000x9000 (bomba)', 'b.png', 'image/png', pngGrande(9000, 9000)],
    ['PNG 40x40 válida pequena', 'p.png', 'image/png', pngGrande(40, 40)],
    ['PNG 3 MB', 'g.png', 'image/png', Buffer.concat([pngGrande(100, 100), Buffer.alloc(3 * 1024 * 1024)])],
  ]) {
    const r = await foto(L, nome, tipo, dados);
    let corpo = {}; try { corpo = JSON.parse(r.text); } catch (e) { corpo = { raw: r.text.slice(0, 60) }; }
    console.log(`  foto ${desc}: ${r.status} ${JSON.stringify(corpo).slice(0, 90)}`);
    if (r.status >= 500) achado('MEDIA', 'FOTO-500-' + desc, `Foto "${desc}" causou erro 500`, r.text.slice(0, 80), 'validar antes de decodificar');
    if (['PHP como .png', 'SVG', 'GIF'].includes(desc) && corpo.success) achado('ALTA', 'FOTO-aceita-' + desc, `Foto de perfil aceitou ${desc}`, JSON.stringify(corpo).slice(0, 80), 'só JPEG/PNG');
  }
  const arqsAvatar = fs.readdirSync(path.join(RAIZ, 'avatares')).filter((f) => f.endsWith('.webp'));
  console.log('  arquivos em avatares/ depois dos testes:', arqsAvatar.length, '(esperado: no máximo 1)');
  if (arqsAvatar.length > 1) achado('BAIXA', 'FOTO-lixo', 'Fotos de perfil antigas ficam órfãs em avatares/', String(arqsAvatar.length), 'apagar a anterior ao trocar');
  // remove a foto do leitor e limpa
  await L.form('api/foto_perfil.php', { action: 'remover', csrf_token: L.csrf });
  // capa base64 enorme e falsa
  const capaFalsa = 'data:image/png;base64,' + Buffer.from('<?php echo 1;?>').toString('base64');
  const m2 = multipart({ csrf_token: A.csrf, titulo: MARCA + 'PT-UP capa falsa', autor: 'PT', capa_base64: capaFalsa }, { campo: 'arquivo_pdf', nome: 'a.pdf', tipo: 'application/pdf', dados: Buffer.from('%PDF-1.4\n%%EOF capa-falsa-' + Date.now()) });
  const antesC = new Set(fs.readdirSync(path.join(RAIZ, 'capas')));
  await A.req('api/upload.php', { method: 'POST', headers: { 'content-type': m2.tipo }, body: m2.corpo });
  const novasC = fs.readdirSync(path.join(RAIZ, 'capas')).filter((f) => !antesC.has(f));
  if (novasC.length) achado('ALTA', 'CAPA-base64', 'capa_base64 com conteúdo que não é PNG foi gravada em capas/', novasC.join(','), 'conteudoEhImagemValida'); else ok('capa_base64 inválida descartada');

  console.log('== T5.5 acesso direto às pastas de arquivos ==');
  const algumUpload = fs.readdirSync(path.join(RAIZ, 'uploads')).find((f) => /\.(pdf|epub)$/.test(f));
  const algumaCapa = fs.readdirSync(path.join(RAIZ, 'capas')).find((f) => f.endsWith('.png'));
  const anon = new Client('anon');
  for (const [u, deve] of [[`uploads/${algumUpload}`, 403], [`capas/${algumaCapa}`, 200], ['banners/', 403]]) {
    const r = await anon.req(u);
    console.log(`  /${u.slice(0, 40)} (anônimo) -> ${r.status} (esperado ${deve})`);
    if (u.startsWith('uploads') && r.status === 200) achado('CRITICA', 'EXP-uploads', 'PDFs/EPUBs baixáveis sem login direto em /uploads', u, '.htaccess');
  }
  achado('INFO', 'CAPAS-publicas', 'Capas (capas/*.png) são públicas por design, mas qualquer pessoa que descubra/enumere o nome vê a capa sem login', '', 'nomes são aleatórios; aceitável');
  achados.pop();

  // limpeza
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%' OR titulo LIKE '%PT-UP%' OR autor LIKE '%PT-UP%'`);
  const orfaos = [];
  const registrados = new Set(sql('SELECT nome_arquivo FROM livros').flat());
  for (const f of fs.readdirSync(path.join(RAIZ, 'uploads'))) if (/\.(pdf|epub)$/.test(f) && !registrados.has(f) && fs.statSync(path.join(RAIZ, 'uploads', f)).mtimeMs > Date.now() - 20 * 60 * 1000) orfaos.push(f);
  console.log(`  arquivos de teste órfãos em uploads/ (criados nos últimos 20 min, sem registro): ${orfaos.length}`);
  for (const f of orfaos) fs.unlinkSync(path.join(RAIZ, 'uploads', f));
  const registradosCapa = new Set(sql('SELECT capa_arquivo FROM livros').flat());
  for (const f of fs.readdirSync(path.join(RAIZ, 'capas'))) if (f.endsWith('.png') && !registradosCapa.has(f) && fs.statSync(path.join(RAIZ, 'capas', f)).mtimeMs > Date.now() - 20 * 60 * 1000) fs.unlinkSync(path.join(RAIZ, 'capas', f));
  fs.writeFileSync(path.join(__dirname, 'achados_t5.json'), JSON.stringify(achados, null, 2));
  console.log(`\nT5 concluído: ${achados.length} achado(s)`);
})().catch((e) => { console.error('ERRO NO T5', e); process.exit(1); });
