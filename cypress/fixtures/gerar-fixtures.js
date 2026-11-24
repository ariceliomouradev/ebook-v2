/**
 * Gera os arquivos binários usados como fixture pelos testes E2E:
 *
 *   livro-teste.pdf   PDF válido de 3 páginas (assinatura %PDF- e MIME application/pdf,
 *                     exigidos por arquivoEhPdfValido() em includes/functions.php)
 *   capa-teste.png    PNG válido 200x300 (aceito por getimagesize()/conteudoEhImagemValida)
 *   arquivo-invalido.txt  arquivo texto usado para testar a rejeição de upload
 *
 * Rode com:  npm run fixtures
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = __dirname;

// ---------------------------------------------------------------------------
// PDF de 3 páginas, montado à mão (com tabela xref correta) para não precisar
// de nenhuma dependência de geração de PDF no projeto.
// ---------------------------------------------------------------------------
function gerarPdf() {
  const paginas = ['Pagina 1 - Livro de teste E2E', 'Pagina 2 - Livro de teste E2E', 'Pagina 3 - Livro de teste E2E'];

  const objetos = [];
  const idPages = 2;
  const idFonte = 3;
  const idPrimeiraPagina = 4;

  objetos[1] = `<< /Type /Catalog /Pages ${idPages} 0 R >>`;

  const idsPaginas = paginas.map((_, i) => idPrimeiraPagina + i * 2);
  objetos[idPages] = `<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objetos[idFonte] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  paginas.forEach((texto, i) => {
    const idPagina = idPrimeiraPagina + i * 2;
    const idConteudo = idPagina + 1;
    const fluxo = `BT /F1 24 Tf 60 700 Td (${texto}) Tj ET`;

    objetos[idPagina] =
      `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${idFonte} 0 R >> >> /Contents ${idConteudo} 0 R >>`;
    objetos[idConteudo] = `<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let id = 1; id < objetos.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }

  const inicioXref = pdf.length;
  const total = objetos.length;
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  fs.writeFileSync(path.join(DIR, 'livro-teste.pdf'), pdf, 'latin1');
  return paginas.length;
}

// ---------------------------------------------------------------------------
// PNG 200x300 sólido, montado à mão (IHDR + IDAT + IEND com CRC correto).
// ---------------------------------------------------------------------------
function crc32(buf) {
  let c;
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = tabela[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function gerarPng(nomeArquivo, largura, altura, cor) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const linhas = [];
  for (let y = 0; y < altura; y++) {
    const linha = Buffer.alloc(1 + largura * 3);
    linha[0] = 0; // filtro "None"
    for (let x = 0; x < largura; x++) {
      linha[1 + x * 3] = cor[0];
      linha[2 + x * 3] = cor[1];
      linha[3 + x * 3] = cor[2];
    }
    linhas.push(linha);
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(path.join(DIR, nomeArquivo), png);
}

// ---------------------------------------------------------------------------
// EPUB mínimo e válido (EPUB 3 com NCX de reserva): 3 capítulos + capa. O ZIP é montado à mão, sem
// compressão (STORED), porque o `mimetype` precisa ser a primeira entrada e sem compressão.
// O título começa com "[E2E]" para a limpeza da suíte reconhecer o livro criado pelo upload.
// ---------------------------------------------------------------------------
function gerarEpub(nomeArquivo, capaPng) {
  const titulo = '[E2E] EPUB de teste';
  const capitulos = [1, 2, 3].map((n) => ({
    id: `cap${n}`,
    arquivo: `cap${n}.xhtml`,
    titulo: `Capitulo ${n}`,
    texto: `Texto do capitulo ${n} do livro de teste E2E. `.repeat(60),
  }));
  const xhtml = (t, corpo) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt"><head><meta charset="utf-8"/><title>${t}</title></head><body>${corpo}</body></html>`;

  const entradas = [
    ['mimetype', 'application/epub+zip'],
    [
      'META-INF/container.xml',
      '<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ],
    [
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:identifier id="id">urn:uuid:e2e-epub-teste</dc:identifier><dc:title>${titulo}</dc:title><dc:creator>Autor E2E</dc:creator><dc:language>pt</dc:language><dc:subject>ficcao</dc:subject><meta name="cover" content="capa"/></metadata><manifest><item id="capa" href="capa.png" media-type="image/png" properties="cover-image"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>${capitulos
        .map((c) => `<item id="${c.id}" href="${c.arquivo}" media-type="application/xhtml+xml"/>`)
        .join('')}</manifest><spine toc="ncx">${capitulos.map((c) => `<itemref idref="${c.id}"/>`).join('')}</spine></package>`,
    ],
    [
      'OEBPS/nav.xhtml',
      xhtml('Sumario', `<nav epub:type="toc"><ol>${capitulos.map((c) => `<li><a href="${c.arquivo}">${c.titulo}</a></li>`).join('')}</ol></nav>`),
    ],
    [
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:e2e-epub-teste"/></head><docTitle><text>${titulo}</text></docTitle><navMap>${capitulos
        .map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${c.titulo}</text></navLabel><content src="${c.arquivo}"/></navPoint>`)
        .join('')}</navMap></ncx>`,
    ],
    ...capitulos.map((c) => [`OEBPS/${c.arquivo}`, xhtml(c.titulo, `<h1>${c.titulo}</h1><p>${c.texto}</p>`)]),
    ['OEBPS/capa.png', capaPng],
  ];

  const partes = [];
  const central = [];
  let deslocamento = 0;
  for (const [nome, conteudo] of entradas) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8');
    const crc = zlib.crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(0, 8); // STORED
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    partes.push(local, nomeBuf, dados);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(dados.length, 20);
    cd.writeUInt32LE(dados.length, 24);
    cd.writeUInt16LE(nomeBuf.length, 28);
    cd.writeUInt32LE(deslocamento, 42);
    central.push(cd, nomeBuf);
    deslocamento += local.length + nomeBuf.length + dados.length;
  }
  const dirCentral = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(dirCentral.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fs.writeFileSync(path.join(DIR, nomeArquivo), Buffer.concat([...partes, dirCentral, fim]));
  return capitulos.length;
}

const paginas = gerarPdf();
gerarPng('capa-teste.png', 200, 300, [13, 110, 253]);
gerarPng('banner-teste.png', 600, 200, [25, 135, 84]);
fs.writeFileSync(path.join(DIR, 'arquivo-invalido.txt'), 'Este arquivo nao e um PDF e deve ser rejeitado no upload.\n');
const capitulosEpub = gerarEpub('livro-teste.epub', fs.readFileSync(path.join(DIR, 'capa-teste.png')));

console.log(`Fixtures geradas: livro-teste.pdf (${paginas} paginas), livro-teste.epub (${capitulosEpub} capitulos), capa-teste.png, banner-teste.png, arquivo-invalido.txt`);
