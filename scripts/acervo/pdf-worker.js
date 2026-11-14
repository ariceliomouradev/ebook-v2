'use strict';
/**
 * Processo-filho do importador de acervo: abre um PDF, confirma que ele é legível e
 * renderiza a primeira página como capa PNG.
 *
 * Usa o mesmo PDF.js que o sistema carrega no navegador, então a capa fica igual à que o
 * upload normal gera. Roda em um processo separado do orquestrador (importar-acervo.js)
 * porque PDFs corrompidos às vezes travam o parser em laço infinito: o pai mede o tempo e,
 * se estourar, simplesmente encerra este processo e abre outro, sem perder a importação.
 *
 * Também pode ser usado como módulo: `const { processarPdf } = require('./pdf-worker')`.
 */

const fs = require('node:fs');
const path = require('node:path');

const RAIZ_PDFJS = path.dirname(require.resolve('pdfjs-dist/package.json'));
// O PDF.js em Node lê estes diretórios pelo sistema de arquivos e valida a URL exigindo
// barra "/" no fim — a barra invertida do Windows é recusada, então normalizamos.
const diretorio = (nome) => path.join(RAIZ_PDFJS, nome).replace(/\\/g, '/') + '/';
const RECURSOS = {
    standardFontDataUrl: diretorio('standard_fonts'),
    cMapUrl: diretorio('cmaps'),
    iccUrl: diretorio('iccs'),
    wasmUrl: diretorio('wasm'),
};

let pdfjs = null;
async function carregarPdfjs() {
    if (!pdfjs) {
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return pdfjs;
}

/** Traduz as exceções do PDF.js em motivos legíveis para o relatório. */
function descreverErro(erro) {
    const nome = (erro && erro.name) || '';
    const msg = String((erro && erro.message) || erro || '').replace(/\s+/g, ' ').trim();
    if (nome === 'PasswordException') return 'protegido por senha';
    if (nome === 'InvalidPDFException') return 'PDF inválido ou corrompido';
    if (nome === 'MissingPDFException') return 'arquivo ausente';
    if (/no pages|zero pages/i.test(msg)) return 'PDF sem páginas';
    return msg ? `erro ao abrir: ${msg.slice(0, 140)}` : 'erro desconhecido ao abrir';
}

/**
 * @param {{arquivo: string, destinoCapa: string, larguraCapa?: number}} pedido
 * @returns {Promise<{paginas: number, autor: string|null, titulo: string|null, bytesCapa: number}>}
 */
async function processarPdf({ arquivo, destinoCapa, larguraCapa = 420 }) {
    const lib = await carregarPdfjs();
    const buffer = fs.readFileSync(arquivo);
    // Visão sobre o mesmo buffer (sem copiar): arquivos de 200+ MB existem no acervo.
    const dados = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);

    const tarefa = lib.getDocument({
        data: dados,
        ...RECURSOS,
        cMapPacked: true,
        isEvalSupported: false,
        useSystemFonts: false,
        verbosity: 0,
    });

    let doc;
    try {
        doc = await tarefa.promise;
        if (!doc.numPages || doc.numPages < 1) {
            throw Object.assign(new Error('PDF sem páginas'), { name: 'SemPaginas' });
        }

        let autor = null;
        let titulo = null;
        try {
            const meta = await doc.getMetadata();
            autor = (meta && meta.info && meta.info.Author) || null;
            titulo = (meta && meta.info && meta.info.Title) || null;
        } catch {
            // metadados são opcionais: a ausência deles não invalida o livro
        }

        const pagina = await doc.getPage(1);
        const base = pagina.getViewport({ scale: 1 });
        // Limita a escala para páginas minúsculas ou gigantes não gerarem capas absurdas.
        const escala = Math.min(4, Math.max(0.1, larguraCapa / base.width));
        const viewport = pagina.getViewport({ scale: escala });

        const fabrica = doc.canvasFactory;
        const { canvas, context } = fabrica.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pagina.render({ canvasContext: context, canvas, viewport }).promise;

        const png = canvas.toBuffer('image/png');
        fs.mkdirSync(path.dirname(destinoCapa), { recursive: true });
        fs.writeFileSync(destinoCapa, png);
        pagina.cleanup();

        return { paginas: doc.numPages, autor, titulo, bytesCapa: png.length };
    } finally {
        // No PDF.js 6 o destroy() fica na tarefa de carregamento (e libera o documento junto).
        // Falha ao liberar nunca deve esconder o resultado real nem o erro original.
        try {
            await tarefa.destroy();
        } catch {
            // ignorado de propósito
        }
    }
}

// Modo processo-filho: recebe pedidos por IPC e responde um por vez.
if (typeof process.send === 'function') {
    process.on('message', async (pedido) => {
        try {
            const r = await processarPdf(pedido);
            process.send({ id: pedido.id, ok: true, ...r });
        } catch (erro) {
            process.send({ id: pedido.id, ok: false, motivo: descreverErro(erro) });
        }
    });
    process.send({ pronto: true });
}

module.exports = { processarPdf, descreverErro };
