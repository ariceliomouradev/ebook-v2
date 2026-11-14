#!/usr/bin/env node
'use strict';
/**
 * Importador em lote de acervo de PDFs para o Meus Livros.
 *
 *   npm run acervo -- --origem "D:\Livros"                  simulação (não altera nada)
 *   npm run acervo -- --origem "D:\Livros" --aplicar        importa de verdade
 *   npm run acervo -- --desfazer                            remove o que este script importou
 *
 * O que ele faz, nesta ordem:
 *   1. Lista os PDFs da pasta e repara nomes corrompidos (ver scripts/acervo/nomes.js).
 *   2. Calcula o SHA-256 de cada arquivo e descarta duplicatas por CONTEÚDO — não pelo nome:
 *      o mesmo livro com nome corrompido e nome correto é detectado como um só.
 *   3. Descarta o que já está no sistema (uploads/ e importações anteriores).
 *   4. Abre cada PDF com o PDF.js: o que não abre, está protegido por senha ou é curto demais
 *      para ser livro vai para a lista de rejeitados, nunca para a biblioteca.
 *   5. Com --aplicar: copia o PDF para uploads/, grava a capa em capas/ e insere em `livros`.
 *
 * Segurança:
 *   - Sem --aplicar nada é copiado nem gravado no banco (só o relatório é escrito).
 *   - A pasta de origem nunca é modificada: os PDFs são COPIADOS.
 *   - Retomável: o estado fica em database/.importacao/manifesto.jsonl; rodar de novo pula
 *     o que já foi importado.
 *   - Recusa rodar com APP_ENV=production.
 *
 * Saídas (database/.importacao/, ignorada pelo git e bloqueada no Apache):
 *   relatorio.csv     uma linha por arquivo da origem, com status, título, autor e motivo
 *   manifesto.jsonl   registro do que foi importado (base do --desfazer e da retomada)
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const mysql = require('mysql2/promise');
const { repararNome, inferirTituloAutor, construirContextoAutores } = require('./acervo/nomes');

const RAIZ = path.join(__dirname, '..');
const DIR_UPLOADS = path.join(RAIZ, 'uploads');
const DIR_CAPAS = path.join(RAIZ, 'capas');
const DIR_ESTADO = path.join(RAIZ, 'database', '.importacao');
const MANIFESTO = path.join(DIR_ESTADO, 'manifesto.jsonl');
const RELATORIO = path.join(DIR_ESTADO, 'relatorio.csv');
const TRAVA = path.join(DIR_ESTADO, 'em-andamento.lock');
const CAMINHO_WORKER = path.join(__dirname, 'acervo', 'pdf-worker.js');

const TAMANHO_MINIMO_BYTES = 10 * 1024; // abaixo disso nem chega a ser um PDF utilizável

// ---------------------------------------------------------------------------------------
// Argumentos e ambiente
// ---------------------------------------------------------------------------------------

function ajuda() {
    console.log(`Uso: npm run acervo -- [opções]

  --origem <pasta>        pasta com os PDFs (obrigatória, exceto com --desfazer)
  --aplicar               grava de verdade (sem isto é só simulação)
  --desfazer              remove do sistema tudo que este script importou
  --limite <n>            processa só os n primeiros (para testar)
  --concorrencia <n>      PDFs processados ao mesmo tempo (padrão 3)
  --min-paginas <n>       rejeita documentos com menos páginas (padrão 5)
  --tempo-max <segundos>  tempo máximo por PDF antes de desistir dele (padrão 120)
  --dono <e-mail>         usuário dono dos livros (padrão: primeiro administrador)
`);
}

function lerArgumentos(argv) {
    const a = {
        origem: null,
        aplicar: false,
        desfazer: false,
        limite: Infinity,
        concorrencia: 3,
        minPaginas: 5,
        tempoMax: 120,
        dono: null,
    };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        const proximo = () => {
            if (i + 1 >= argv.length) throw new Error(`Falta o valor de ${k}`);
            return argv[++i];
        };
        if (k === '--origem') a.origem = proximo();
        else if (k === '--aplicar') a.aplicar = true;
        else if (k === '--desfazer') a.desfazer = true;
        else if (k === '--limite') a.limite = Math.max(1, parseInt(proximo(), 10));
        else if (k === '--concorrencia') a.concorrencia = Math.min(8, Math.max(1, parseInt(proximo(), 10)));
        else if (k === '--min-paginas') a.minPaginas = Math.max(1, parseInt(proximo(), 10));
        else if (k === '--tempo-max') a.tempoMax = Math.max(10, parseInt(proximo(), 10));
        else if (k === '--dono') a.dono = proximo();
        else if (k === '--ajuda' || k === '-h') {
            ajuda();
            process.exit(0);
        } else throw new Error(`Opção desconhecida: ${k} (use --ajuda)`);
    }
    return a;
}

function lerEnv() {
    const arquivo = path.join(RAIZ, '.env');
    const valores = {};
    if (!fs.existsSync(arquivo)) return valores;
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
        const texto = linha.replace(/^\uFEFF/, '').trim();
        if (!texto || texto.startsWith('#') || !texto.includes('=')) continue;
        const [chave, ...resto] = texto.split('=');
        valores[chave.trim()] = resto.join('=').trim();
    }
    return valores;
}

// ---------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

function hashArquivo(caminho) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        fs.createReadStream(caminho, { highWaterMark: 4 * 1024 * 1024 })
            .on('data', (c) => h.update(c))
            .on('error', reject)
            .on('end', () => resolve(h.digest('hex')));
    });
}

/** map assíncrono com limite de concorrência, preservando a ordem do resultado. */
async function mapaParalelo(itens, concorrencia, fn, aoProgredir) {
    const saida = new Array(itens.length);
    let proximo = 0;
    let feitos = 0;
    async function trabalhador() {
        while (true) {
            const i = proximo++;
            if (i >= itens.length) return;
            saida[i] = await fn(itens[i], i);
            feitos++;
            if (aoProgredir) aoProgredir(feitos, itens.length);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concorrencia, itens.length) }, trabalhador));
    return saida;
}

function progresso(rotulo, passo = 100) {
    const inicio = Date.now();
    return (feitos, total) => {
        if (feitos % passo === 0 || feitos === total) {
            const seg = (Date.now() - inicio) / 1000;
            console.log(`  ${rotulo}: ${feitos}/${total}  (${seg.toFixed(0)}s)`);
        }
    };
}

function csvCelula(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function gravarRelatorio(linhas) {
    const cab = ['status', 'arquivo_origem', 'titulo', 'autor', 'origem_autor', 'confianca', 'paginas', 'tamanho_mb', 'motivo', 'livro_id', 'duplicado_de'];
    const corpo = linhas.map((l) => cab.map((c) => csvCelula(l[c])).join(';'));
    // BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certas.
    fs.writeFileSync(RELATORIO, '\uFEFF' + [cab.join(';'), ...corpo].join('\r\n') + '\r\n', 'utf8');
}

// ---------------------------------------------------------------------------------------
// Pool de processos que leem PDFs
// ---------------------------------------------------------------------------------------

class PoolPdf {
    constructor(tamanho, tempoMaxMs) {
        this.tamanho = tamanho;
        this.tempoMaxMs = tempoMaxMs;
        this.livres = [];
        this.fila = [];
        this.todos = new Set();
        this.encerrando = false;
        this.seq = 0;
        for (let i = 0; i < tamanho; i++) this._criar();
    }

    _criar() {
        const filho = fork(CAMINHO_WORKER, [], {
            execArgv: ['--max-old-space-size=3072'], // há PDFs de 200+ MB no acervo
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        });
        const w = { filho, atual: null, usos: 0, morto: false, timer: null };
        filho.on('message', (msg) => {
            if (msg && msg.pronto) {
                this._liberar(w);
            } else if (msg && w.atual && msg.id === w.atual.pedido.id) {
                clearTimeout(w.timer);
                const trabalho = w.atual;
                w.atual = null;
                trabalho.resolve(msg);
                // Recicla o processo de tempos em tempos: o PDF.js acumula memória.
                if (w.usos >= 150) filho.kill();
                else this._liberar(w);
            }
        });
        filho.on('exit', (codigo) => {
            w.morto = true;
            clearTimeout(w.timer);
            this.todos.delete(w);
            this.livres = this.livres.filter((x) => x !== w);
            if (w.atual) {
                const trabalho = w.atual;
                w.atual = null;
                trabalho.resolve({ ok: false, motivo: `processo de leitura encerrou (código ${codigo})` });
            }
            if (!this.encerrando) {
                this._criar();
                this._despachar();
            }
        });
        this.todos.add(w);
        return w;
    }

    _liberar(w) {
        if (w.morto) return;
        this.livres.push(w);
        this._despachar();
    }

    _despachar() {
        while (this.fila.length && this.livres.length) {
            const w = this.livres.pop();
            const trabalho = this.fila.shift();
            w.atual = trabalho;
            w.usos++;
            w.timer = setTimeout(() => {
                // Travou: entrega a falha e mata o processo. O 'exit' abre outro no lugar.
                const t = w.atual;
                w.atual = null;
                if (t) t.resolve({ ok: false, motivo: `tempo esgotado (> ${Math.round(this.tempoMaxMs / 1000)}s)` });
                w.filho.kill('SIGKILL');
            }, this.tempoMaxMs);
            w.filho.send(trabalho.pedido);
        }
    }

    executar(pedido) {
        return new Promise((resolve) => {
            this.fila.push({ pedido: { ...pedido, id: ++this.seq }, resolve });
            this._despachar();
        });
    }

    encerrar() {
        this.encerrando = true;
        for (const w of this.todos) w.filho.kill('SIGKILL');
    }
}

// ---------------------------------------------------------------------------------------
// Manifesto (estado da importação)
// ---------------------------------------------------------------------------------------

function lerManifesto() {
    if (!fs.existsSync(MANIFESTO)) return [];
    return fs
        .readFileSync(MANIFESTO, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l));
}

function reescreverManifesto(entradas) {
    fs.writeFileSync(MANIFESTO, entradas.map((e) => JSON.stringify(e)).join('\n') + (entradas.length ? '\n' : ''));
}

const removerSeExiste = (p) => {
    try {
        fs.unlinkSync(p);
    } catch {
        /* já não existe */
    }
};

// ---------------------------------------------------------------------------------------
// --desfazer
// ---------------------------------------------------------------------------------------

async function desfazer(conn) {
    const entradas = lerManifesto();
    if (entradas.length === 0) {
        console.log('Nada a desfazer: o manifesto está vazio.');
        return;
    }
    console.log(`Desfazendo ${entradas.length} livro(s) importado(s) por este script...`);
    let removidosBanco = 0;
    let arquivos = 0;
    for (const e of entradas) {
        // Confere o nome do arquivo além do id: nunca apaga um livro que não seja o importado.
        const [r] = await conn.execute('DELETE FROM livros WHERE id = ? AND nome_arquivo = ?', [e.livroId, e.nomeArquivo]);
        removidosBanco += r.affectedRows;
        for (const [dir, nome] of [
            [DIR_UPLOADS, e.nomeArquivo],
            [DIR_CAPAS, e.capa],
        ]) {
            if (!nome || /[\\/]/.test(nome) || nome.includes('..')) continue;
            const p = path.join(dir, nome);
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                arquivos++;
            }
        }
    }
    fs.renameSync(MANIFESTO, MANIFESTO.replace('.jsonl', `.desfeito-${Date.now()}.jsonl`));
    console.log(`Pronto: ${removidosBanco} registro(s) removido(s) do banco e ${arquivos} arquivo(s) apagado(s).`);
}

// ---------------------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------------------

async function principal() {
    const args = lerArgumentos(process.argv.slice(2));
    const env = lerEnv();

    if (String(env.APP_ENV || 'local').toLowerCase() === 'production') {
        throw new Error('Recusado: APP_ENV=production. Importe em ambiente local.');
    }
    if (!args.desfazer && !args.origem) {
        ajuda();
        throw new Error('Informe --origem com a pasta dos PDFs.');
    }

    fs.mkdirSync(DIR_ESTADO, { recursive: true });
    fs.mkdirSync(DIR_UPLOADS, { recursive: true });
    fs.mkdirSync(DIR_CAPAS, { recursive: true });

    try {
        fs.writeFileSync(TRAVA, String(process.pid), { flag: 'wx' });
    } catch {
        throw new Error(`Outra importação parece estar em andamento (${TRAVA}). Se não estiver, apague esse arquivo.`);
    }

    let pool = null;
    let conn = null;
    const limpar = () => {
        if (pool) pool.encerrar();
        removerSeExiste(TRAVA);
    };
    process.on('SIGINT', () => {
        console.log('\nInterrompido. O que já foi importado está salvo; rode de novo para continuar.');
        limpar();
        process.exit(130);
    });

    try {
        conn = await mysql.createConnection({
            host: env.DB_HOST || 'localhost',
            user: env.DB_USER || 'root',
            password: env.DB_PASS || '',
            database: env.DB_NAME || 'biblioteca_pdf',
            charset: 'utf8mb4',
        });

        if (args.desfazer) {
            await desfazer(conn);
            return;
        }

        const origem = path.resolve(args.origem);
        if (!fs.existsSync(origem) || !fs.statSync(origem).isDirectory()) {
            throw new Error(`Pasta de origem não encontrada: ${origem}`);
        }

        console.log(`\n${args.aplicar ? 'IMPORTAÇÃO' : 'SIMULAÇÃO (nada será gravado)'} — origem: ${origem}\n`);

        // --- dono dos livros ---------------------------------------------------------
        let donoId = null;
        if (args.aplicar) {
            const [u] = args.dono
                ? await conn.execute('SELECT id FROM usuarios WHERE email = ?', [args.dono])
                : await conn.execute("SELECT id FROM usuarios WHERE perfil = 'admin' ORDER BY id LIMIT 1");
            if (!u.length) throw new Error(args.dono ? `Usuário não encontrado: ${args.dono}` : 'Nenhum administrador no banco. Crie um com database/seed_dev.php ou criar_admin.php.');
            donoId = u[0].id;
        }

        // --- 1. listar --------------------------------------------------------------
        console.log('1/5  Lendo a pasta...');
        const todos = (await fsp.readdir(origem, { withFileTypes: true }))
            .filter((d) => d.isFile() && /\.pdf$/i.test(d.name))
            .map((d) => ({ nome: d.name, caminho: path.join(origem, d.name) }));
        for (const f of todos) {
            f.tamanho = fs.statSync(f.caminho).size;
            f.nomeReparado = repararNome(f.nome);
            f.corrompido = f.nomeReparado !== f.nome.normalize('NFC');
            f.nomeSemExt = f.nomeReparado.replace(/\.pdf$/i, '');
        }
        todos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const reparados = todos.filter((f) => f.corrompido).length;
        console.log(`     ${todos.length} PDFs (${mb(todos.reduce((s, f) => s + f.tamanho, 0))} MB); ${reparados} com nome reparado.`);

        // --- 2. verificações baratas + hash -------------------------------------------
        console.log('2/5  Conferindo arquivos e calculando impressão digital (SHA-256)...');
        const rejeitados = new Map(); // caminho -> motivo
        for (const f of todos) {
            if (f.tamanho < TAMANHO_MINIMO_BYTES) {
                rejeitados.set(f.caminho, `arquivo muito pequeno (${(f.tamanho / 1024).toFixed(0)} KB)`);
                continue;
            }
            const fd = fs.openSync(f.caminho, 'r');
            const buf = Buffer.alloc(1024);
            fs.readSync(fd, buf, 0, 1024, 0);
            fs.closeSync(fd);
            if (!buf.includes('%PDF-')) rejeitados.set(f.caminho, 'não é um PDF (sem assinatura %PDF-)');
        }
        const paraHash = todos.filter((f) => !rejeitados.has(f.caminho));
        // Cache por caminho + tamanho + data de modificação: reexecuções (retomada, ajuste de
        // título) não refazem o SHA-256 de 6 GB. Qualquer mudança no arquivo invalida a entrada.
        const arquivoCache = path.join(DIR_ESTADO, 'cache-hash.json');
        let cacheHash = {};
        try {
            cacheHash = JSON.parse(fs.readFileSync(arquivoCache, 'utf8'));
        } catch {
            /* sem cache ainda, ou ilegível: recalcula */
        }
        let aproveitados = 0;
        const hashDe = async (f) => {
            const st = fs.statSync(f.caminho);
            const c = cacheHash[f.caminho];
            if (c && c.tamanho === st.size && c.mtimeMs === st.mtimeMs) {
                aproveitados++;
                return c.hash;
            }
            const h = await hashArquivo(f.caminho);
            cacheHash[f.caminho] = { tamanho: st.size, mtimeMs: st.mtimeMs, hash: h };
            return h;
        };
        const hashes = await mapaParalelo(paraHash, 4, hashDe, progresso('hash', 200));
        paraHash.forEach((f, i) => (f.hash = hashes[i]));
        fs.writeFileSync(arquivoCache, JSON.stringify(cacheHash));
        if (aproveitados) console.log(`     ${aproveitados} hash(es) reaproveitado(s) do cache.`);

        // --- 3. duplicatas e o que já existe ------------------------------------------
        console.log('3/5  Procurando duplicatas e o que já está no sistema...');
        const grupos = new Map();
        for (const f of paraHash) {
            if (!grupos.has(f.hash)) grupos.set(f.hash, []);
            grupos.get(f.hash).push(f);
        }
        const duplicadoDe = new Map(); // caminho -> nome do arquivo mantido
        const unicos = [];
        for (const grupo of grupos.values()) {
            // Mantém o de nome mais "limpo": sem corrupção e sem sufixo de cópia "(1)".
            const pontos = (f) => (f.corrompido ? 0 : 2) + (/\(\d{1,2}\)\.pdf$/i.test(f.nome) ? 0 : 1);
            grupo.sort((a, b) => pontos(b) - pontos(a) || a.nome.localeCompare(b.nome, 'pt-BR'));
            unicos.push(grupo[0]);
            for (const outro of grupo.slice(1)) duplicadoDe.set(outro.caminho, grupo[0].nome);
        }

        // Vocabulário de autores aprendido do acervo (só arquivos únicos, para uma duplicata não
        // contar duas vezes). Resolve "Dar e Receber - Adam Grant" x "Max Lucado - Bom dia!".
        const contextoAutores = construirContextoAutores(unicos.map((f) => f.nomeSemExt));

        // hashes do que já está em uploads/ (os livros que o sistema já tem)
        const jaNoSistema = new Map(); // hash -> descrição
        const existentes = (await fsp.readdir(DIR_UPLOADS)).filter((n) => /\.pdf$/i.test(n));
        await mapaParalelo(existentes, 4, async (n) => jaNoSistema.set(await hashArquivo(path.join(DIR_UPLOADS, n)), `uploads/${n}`));

        // importações anteriores: só vale se o livro ainda existe no banco
        const manifesto = lerManifesto();
        const importados = new Map();
        const orfaos = [];
        if (manifesto.length) {
            const ids = manifesto.map((e) => e.livroId);
            const [linhas] = await conn.query('SELECT id, nome_arquivo FROM livros WHERE id IN (?)', [ids]);
            const vivos = new Map(linhas.map((l) => [l.id, l.nome_arquivo]));
            for (const e of manifesto) {
                if (vivos.get(e.livroId) === e.nomeArquivo) importados.set(e.hash, e);
                else orfaos.push(e);
            }
        }
        if (orfaos.length && args.aplicar) {
            // O banco foi limpo mas os arquivos ficaram: remove os restos para não duplicar.
            for (const e of orfaos) {
                removerSeExiste(path.join(DIR_UPLOADS, e.nomeArquivo));
                if (e.capa) removerSeExiste(path.join(DIR_CAPAS, e.capa));
            }
            reescreverManifesto([...importados.values()]);
            console.log(`     ${orfaos.length} importação(ões) antiga(s) sem registro no banco: arquivos órfãos removidos.`);
        }

        const jaExiste = new Map(); // caminho -> descrição
        const pendentes = [];
        for (const f of unicos) {
            if (importados.has(f.hash)) jaExiste.set(f.caminho, `já importado (livro ${importados.get(f.hash).livroId})`);
            else if (jaNoSistema.has(f.hash)) jaExiste.set(f.caminho, `já está em ${jaNoSistema.get(f.hash)}`);
            else pendentes.push(f);
        }
        // Inserir do último título para o primeiro faz o "Mais recentes" (id decrescente)
        // abrir a biblioteca em ordem alfabética.
        pendentes.sort((a, b) => b.nomeSemExt.localeCompare(a.nomeSemExt, 'pt-BR'));
        const lote = pendentes.slice(0, args.limite);
        console.log(`     duplicados: ${duplicadoDe.size} | já no sistema: ${jaExiste.size} | novos: ${pendentes.length}${lote.length < pendentes.length ? ` (processando ${lote.length} por --limite)` : ''}`);

        // --- espaço em disco ------------------------------------------------------------
        if (args.aplicar) {
            const precisa = lote.reduce((s, f) => s + f.tamanho, 0) * 1.1 + lote.length * 300 * 1024;
            const st = fs.statfsSync(DIR_UPLOADS);
            const livre = st.bavail * st.bsize;
            if (livre < precisa) throw new Error(`Espaço insuficiente: precisa de ~${mb(precisa)} MB e há ${mb(livre)} MB livres.`);
        }

        // --- 4/5. abrir PDFs, capa e (opcionalmente) gravar -----------------------------
        console.log(`4/5  Abrindo os PDFs e gerando capas (${args.concorrencia} em paralelo)...`);
        pool = new PoolPdf(args.concorrencia, args.tempoMax * 1000);
        const dirTemp = args.aplicar ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'acervo-simulacao-'));
        const resultados = new Map(); // caminho -> { status, ... }
        const novoManifesto = [];
        let importadosAgora = 0;

        const nomeBase = () => `${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(8).toString('hex')}`;
        const renderizar = (f) => {
            f.base = nomeBase();
            const capa = args.aplicar ? path.join(DIR_CAPAS, `${f.base}.png`) : path.join(dirTemp, `${f.base}.png`);
            return pool.executar({ arquivo: f.caminho, destinoCapa: capa, larguraCapa: 420 }).then((r) => ({ r, capa }));
        };

        const janela = args.concorrencia * 3;
        const futuros = new Array(lote.length);
        let proximo = 0;
        let emVoo = 0;
        const agendar = () => {
            while (proximo < lote.length && emVoo < janela) {
                const i = proximo++;
                emVoo++;
                futuros[i] = renderizar(lote[i]).finally(() => emVoo--);
            }
        };

        const inicio = Date.now();
        for (let i = 0; i < lote.length; i++) {
            agendar();
            const f = lote[i];
            const { r, capa } = await futuros[i];
            futuros[i] = null;

            const ta = inferirTituloAutor(f.nomeSemExt, r.ok ? r.autor : null, contextoAutores);
            const base = { titulo: ta.titulo, autor: ta.autor, origem_autor: ta.origemAutor, confianca: ta.confianca };

            if (!r.ok) {
                removerSeExiste(capa);
                resultados.set(f.caminho, { status: 'rejeitado', ...base, motivo: r.motivo });
            } else if (r.paginas < args.minPaginas) {
                removerSeExiste(capa);
                resultados.set(f.caminho, { status: 'rejeitado', ...base, paginas: r.paginas, motivo: `documento curto (${r.paginas} página${r.paginas === 1 ? '' : 's'})` });
            } else if (!args.aplicar) {
                removerSeExiste(capa);
                resultados.set(f.caminho, { status: 'importar', ...base, paginas: r.paginas });
            } else {
                const nomePdf = `${f.base}.pdf`;
                const nomeCapa = `${f.base}.png`;
                try {
                    await fsp.copyFile(f.caminho, path.join(DIR_UPLOADS, nomePdf), fs.constants.COPYFILE_EXCL);
                } catch (erro) {
                    removerSeExiste(capa);
                    resultados.set(f.caminho, { status: 'rejeitado', ...base, paginas: r.paginas, motivo: `falha ao copiar: ${erro.message}` });
                    continue;
                }
                try {
                    const [ins] = await conn.execute(
                        'INSERT INTO livros (titulo, autor, nome_arquivo, capa_arquivo, usuario_id) VALUES (?, ?, ?, ?, ?)',
                        [ta.titulo, ta.autor, nomePdf, nomeCapa, donoId],
                    );
                    const entrada = {
                        hash: f.hash,
                        livroId: ins.insertId,
                        nomeArquivo: nomePdf,
                        capa: nomeCapa,
                        titulo: ta.titulo,
                        autor: ta.autor,
                        origem: f.nome,
                        paginas: r.paginas,
                        importadoEm: new Date().toISOString(),
                    };
                    fs.appendFileSync(MANIFESTO, JSON.stringify(entrada) + '\n');
                    novoManifesto.push(entrada);
                    importadosAgora++;
                    resultados.set(f.caminho, { status: 'importado', ...base, paginas: r.paginas, livro_id: ins.insertId });
                } catch (erro) {
                    removerSeExiste(path.join(DIR_UPLOADS, nomePdf));
                    removerSeExiste(capa);
                    resultados.set(f.caminho, { status: 'rejeitado', ...base, paginas: r.paginas, motivo: `falha ao gravar no banco: ${erro.message}` });
                }
            }

            if ((i + 1) % 50 === 0 || i + 1 === lote.length) {
                const seg = (Date.now() - inicio) / 1000;
                const taxa = (i + 1) / seg;
                const resta = Math.round((lote.length - i - 1) / taxa);
                console.log(`  ${i + 1}/${lote.length}  (${seg.toFixed(0)}s, ~${resta}s restantes)`);
            }
        }
        if (dirTemp) fs.rmSync(dirTemp, { recursive: true, force: true });

        // --- relatório ------------------------------------------------------------------
        console.log('5/5  Gravando relatório...');
        const linhas = todos.map((f) => {
            const base = { arquivo_origem: f.nome, tamanho_mb: mb(f.tamanho), titulo: '', autor: '' };
            if (rejeitados.has(f.caminho)) return { ...base, status: 'rejeitado', motivo: rejeitados.get(f.caminho) };
            if (duplicadoDe.has(f.caminho)) return { ...base, status: 'duplicado', motivo: 'conteúdo idêntico a outro arquivo', duplicado_de: duplicadoDe.get(f.caminho) };
            if (jaExiste.has(f.caminho)) return { ...base, status: 'ja-existe', motivo: jaExiste.get(f.caminho) };
            const r = resultados.get(f.caminho);
            if (r) return { ...base, ...r };
            return { ...base, status: 'pendente', motivo: 'fora do --limite desta execução' };
        });
        gravarRelatorio(linhas);

        // --- resumo ---------------------------------------------------------------------
        const contagem = (s) => linhas.filter((l) => l.status === s).length;
        const motivos = new Map();
        for (const l of linhas.filter((x) => x.status === 'rejeitado')) {
            const chave = String(l.motivo).replace(/\(\d+ (KB|páginas?)\)/, '(…)').replace(/\d+s/, 'Ns');
            motivos.set(chave, (motivos.get(chave) || 0) + 1);
        }
        const alvo = linhas.filter((l) => l.status === 'importado' || l.status === 'importar');
        const porConf = (c) => alvo.filter((l) => l.confianca === c).length;
        console.log('\n================ RESUMO ================');
        console.log(`Arquivos na origem:           ${todos.length}`);
        console.log(`  duplicados (mesmo conteúdo): ${contagem('duplicado')}`);
        console.log(`  já no sistema:               ${contagem('ja-existe')}`);
        console.log(`  rejeitados:                  ${contagem('rejeitado')}`);
        for (const [m, n] of [...motivos.entries()].sort((a, b) => b[1] - a[1])) console.log(`      - ${n}x ${m}`);
        console.log(`  ${args.aplicar ? 'IMPORTADOS' : 'a importar'}:                  ${alvo.length}`);
        console.log(`     autor identificado com confiança alta/média/baixa: ${porConf('alta')} / ${porConf('media')} / ${porConf('baixa')}`);
        if (contagem('pendente')) console.log(`  pendentes (fora do --limite): ${contagem('pendente')}`);
        console.log(`\nRelatório: ${RELATORIO}`);
        if (!args.aplicar) console.log('Simulação concluída. Nada foi gravado. Rode com --aplicar para importar.');
        else console.log(`${importadosAgora} livro(s) importado(s) agora. Para desfazer: npm run acervo -- --desfazer`);
    } finally {
        limpar();
        if (conn) await conn.end().catch(() => {});
    }
}

principal().catch((erro) => {
    console.error(`\nERRO: ${erro.message}`);
    process.exit(1);
});
