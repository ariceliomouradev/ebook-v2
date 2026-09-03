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

const paginas = gerarPdf();
gerarPng('capa-teste.png', 200, 300, [13, 110, 253]);
gerarPng('banner-teste.png', 600, 200, [25, 135, 84]);
fs.writeFileSync(path.join(DIR, 'arquivo-invalido.txt'), 'Este arquivo nao e um PDF e deve ser rejeitado no upload.\n');

console.log(`Fixtures geradas: livro-teste.pdf (${paginas} paginas), capa-teste.png, banner-teste.png, arquivo-invalido.txt`);
