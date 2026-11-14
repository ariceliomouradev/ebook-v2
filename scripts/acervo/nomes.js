'use strict';
/**
 * Reparo de nomes de arquivo corrompidos e inferência de título/autor.
 *
 * ORIGEM DO PROBLEMA
 * Parte do acervo veio de um ZIP extraído com a página de código errada. O UTF-8 foi lido
 * como CP850 (o "ã", bytes C3 A3, virou "├ú") e depois gravado em ANSI, que trocou os
 * caracteres de moldura por equivalentes ASCII: "├" virou "+", "│" virou "¦". O resultado
 * são nomes como "Educa+º+úo" (Educação) ou "Neg+¦cio" (Negócio).
 *
 * A reversão é determinística para quase tudo: "+" seguido de um caractere da tabela CP850
 * reconstitui o par de bytes UTF-8. Duas coisas são ambíguas e tratadas à parte:
 *   - "+¦" pode ser ó, ô ou ú (Negócio, Antônio, público): resolvido por dicionário;
 *   - "C++" é título legítimo: "++" só vira "ü" entre letras (Grün, Bündchen).
 */

// Bytes 0x80..0xBF do CP850, na ordem. Gerada pelo .NET (Encoding 850) para não depender
// de memória: é exatamente a faixa que ocupa o 2º byte de qualquer letra latina em UTF-8.
const CP850_ALTO =
    'ÇüéâäàåçêëèïîìÄÅ' +
    'ÉæÆôöòûùÿÖÜø£Ø×ƒ' +
    'áíóúñÑªº¿®¬½¼¡«»' +
    '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐';

const BYTE_DO_CHAR = new Map([...CP850_ALTO].map((c, i) => [c, 0x80 + i]));
// Molduras: não podem aparecer no nome (o ANSI as trocou por "+" ou "¦"), então ficam de fora.
const MOLDURAS = new Set('░▒▓│┤╣║╗╝┐');

// Palavras cujo "+¦" NÃO é "ó" (o padrão, de longe o mais comum). Minúsculas, já corrigidas.
const COM_U_AGUDO = new Set([
    'público', 'públicos', 'pública', 'públicas', 'república', 'repúblicas', 'múltiplas',
    'múltiplos', 'múltipla', 'múltiplo', 'indústria', 'indústrias', 'saúde', 'conteúdo',
    'conteúdos', 'araújo', 'lúcidos', 'lúcido', 'lúcio', 'júnior', 'número', 'números',
    'música', 'músicas', 'único', 'única', 'únicos', 'únicas', 'último', 'última', 'últimos',
    'últimas', 'útil', 'úteis', 'súbito', 'túnel', 'mútuo', 'mútua', 'júri', 'júlio',
    'júlia', 'lúcia', 'cúpula', 'rúbrica', 'plúmbeo', 'fúria', 'crúcial',
]);
const COM_O_CIRCUNFLEXO = new Set([
    'antônio', 'antônia', 'rômulo', 'anônimo', 'anônimos', 'anônima', 'babilônia', 'atômica',
    'atômico', 'anatômica', 'anatômico', 'econômica', 'econômico', 'econômicas', 'econômicos',
    'macroeconômica', 'microeconômica', 'autônomo', 'autônoma', 'autônomos', 'sinônimo',
    'sinônimos', 'tônico', 'fenômeno', 'fenômenos', 'cômico', 'cômica', 'harmônico',
    'irônico', 'telefônico', 'estômago', 'pôr', 'côr',
]);

/** Gera as combinações possíveis ao trocar cada "+¦" por ó, ô ou ú (limite: 3 ocorrências). */
function* combinacoes(palavra) {
    const partes = palavra.split('+¦');
    const k = partes.length - 1;
    if (k === 0) {
        yield palavra;
        return;
    }
    if (k > 3) {
        yield partes.join('ó');
        return;
    }
    const letras = ['ó', 'ô', 'ú'];
    const total = letras.length ** k;
    for (let n = 0; n < total; n++) {
        let out = partes[0];
        let resto = n;
        for (let i = 1; i <= k; i++) {
            out += letras[resto % letras.length] + partes[i];
            resto = Math.floor(resto / letras.length);
        }
        yield out;
    }
}

function resolverPalavraAmbigua(palavra) {
    let reserva = null;
    for (const candidata of combinacoes(palavra)) {
        const chave = candidata.toLowerCase();
        if (COM_U_AGUDO.has(chave) || COM_O_CIRCUNFLEXO.has(chave)) return candidata;
        if (reserva === null && !/[ôú]/.test(candidata)) reserva = candidata; // só "ó"
    }
    return reserva !== null ? reserva : palavra.split('+¦').join('ó');
}

// Segunda variante de corrupção: nomes em NFD (letra + acento combinante, comum em arquivos
// vindos do macOS). A letra base sobrevive; o acento vira "¦" + um caractere da tabela CP850.
// Observado no acervo: ¦º = cedilha, ¦â = til, ¦Ç = crase, ¦é = circunflexo, ¦ê = trema e
// "¦" sozinho = agudo ("pro¦xima" = próxima, "transformac¦ºa¦âo" = transformação).
const ACENTO_COMBINANTE = { 'º': '̧', 'â': '̃', 'Ç': '̀', 'é': '̂', 'ê': '̈', '': '́' };

/** Desfaz a corrupção de codificação. Nomes que já estão corretos passam intactos. */
function repararNome(nome) {
    let s = String(nome);
    if (!s.includes('+') && !s.includes('¦') && !s.includes('ÔÇ')) return s.normalize('NFC');

    // Travessões e aspas tipográficas: UTF-8 de 3 bytes (E2 80 xx) -> "ÔÇ" + caractere.
    s = s.replace(/ÔÇ(.)/gu, (m, c) => {
        const b = BYTE_DO_CHAR.get(c);
        if (b === undefined || MOLDURAS.has(c)) return m;
        const t = Buffer.from([0xe2, 0x80, b]).toString('utf8');
        if (t.includes('�')) return m;
        return t === '​' ? '' : t; // espaço de largura zero: remove
    });

    // "++" entre letras = ü (Grün, Bündchen); "C++" fica de fora. Depois "+X" = letra acentuada.
    s = s.replace(/(?<![Cc+])\+\+(?=[+\p{L}])|\+([^\s+¦])/gu, (m, c) => {
        if (c === undefined) return 'ü';
        const b = BYTE_DO_CHAR.get(c);
        if (b === undefined || MOLDURAS.has(c)) return m;
        const t = Buffer.from([0xc3, b]).toString('utf8');
        return t.length === 1 && !t.includes('�') ? t : m;
    });

    // "+¦" restante: ó/ô/ú, decidido palavra a palavra.
    if (s.includes('+¦')) {
        s = s.replace(/[\p{L}]*(?:\+¦[\p{L}]*)+/gu, resolverPalavraAmbigua);
    }

    // "¦" que sobrou grudado numa letra = acento combinante (variante NFD, ver acima).
    s = s.replace(/(\p{L})¦([ºâÇéê])?/gu, (m, letra, marca) => (letra + ACENTO_COMBINANTE[marca || '']).normalize('NFC'));

    return s.normalize('NFC');
}

// ---------------------------------------------------------------------------------------
// Título e autor
// ---------------------------------------------------------------------------------------

const PARTICULAS_NOME = new Set([
    'da', 'de', 'do', 'das', 'dos', 'e', 'di', 'del', 'della', 'van', 'von', 'der', 'den',
    'la', 'le', 'bin', 'al', 'el', 'du', 'des', 'y', 'mc', 'st',
]);
const PARTICULAS_TITULO = new Set([
    'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na',
    'nos', 'nas', 'para', 'por', 'com', 'sem', 'ao', 'aos', 'à', 'às', 'ou', 'que', 'se',
    'pelo', 'pela', 'sobre', 'entre', 'the', 'of', 'and', 'in', 'to', 'for', 'a', 'on',
]);
// Palavras que denunciam título (não nome de pessoa) quando aparecem no trecho final.
const PALAVRAS_DE_TITULO = /\b(como|para|guia|manual|segredos?|poder|vida|livro|curso|m[eé]todo|ci[eê]ncia|arte|regras?|princ[ií]pios?|h[aá]bitos?|dicas?|passos?|lições?|li[cç][oõ]es|ebook|pdf|vol|volume|edi[cç][aã]o|completo|completa|negócios|neg[oó]cios|sucesso|riqueza|dinheiro|marketing|vendas|lideran[cç]a|investimentos?)\b/i;

const LIXO_METADADO_AUTOR =
    /^(unknown|desconhecido|an[oô]nimo|admin|administrador|administrator|user|usu[aá]rio|owner|microsoft|word|adobe|scribd|ebook|autor|livro|pc|windows|office|pdf|www|http|calibre|abbyy|acrobat|convert|download|digitalizad|scanner|biblioteca|livros|tradutor|editora)/i;

/** Texto curto que parece o nome de uma pessoa (ex.: "John C. Maxwell", "Içami Tiba"). */
function pareceNome(texto) {
    const t = String(texto || '').trim();
    if (!t || t.length > 60 || /\d/.test(t)) return false;
    if (PALAVRAS_DE_TITULO.test(t)) return false;
    const palavras = t.split(/\s+/);
    // Nome de pessoa: até 3 palavras "de verdade" (partículas como "da" e "dos" não contam).
    // Frases capitalizadas maiores ("Muito Além da Velocidade da Luz") são título, não nome.
    const significativas = palavras.filter((p) => !PARTICULAS_NOME.has(p.toLowerCase()));
    if (palavras.length > 5 || significativas.length > 3) return false;
    if (palavras.length === 1 && t.length < 3) return false;
    // "A Fórmula", "O Poder", "Um Guia": começar por artigo é título, não nome ("A." é inicial).
    if (/^(a|o|as|os|um|uma)$/i.test(palavras[0])) return false;
    return palavras.every(
        (p) =>
            /^\p{Lu}[\p{L}'’.\-]*$/u.test(p) ||
            /^\p{Lu}\.?$/u.test(p) ||
            PARTICULAS_NOME.has(p.toLowerCase()),
    );
}

/**
 * Vários autores: "Flávio Lemos, Celso Cardoso", "Jim Rohn e Brian Tracy". Cada parte precisa
 * ter nome E sobrenome: partes de uma palavra só ("Dar e Receber", "Comunicar, Vender e
 * Negociar") são títulos comuns demais para serem tomados por autores.
 */
function pareceListaDeAutores(texto) {
    const partes = String(texto || '')
        .trim()
        .split(/\s*,\s*|\s+e\s+|\s*&\s*/)
        .filter(Boolean);
    return partes.length >= 2 && partes.every((p) => pareceNome(p) && p.trim().split(/\s+/).length >= 2);
}

/** "Mezrich, Ben", "Rackham, Neil": sobrenome, vírgula, nome (formato de catálogo de biblioteca). */
function pareceNomeInvertido(texto) {
    const m = String(texto || '').trim().match(/^([^,\s]+),\s*([^,]+)$/);
    return (
        !!m &&
        /^\p{Lu}/u.test(m[1]) &&
        pareceNome(m[1]) &&
        pareceNome(m[2]) &&
        m[2].trim().split(/\s+/).length <= 3
    );
}
/** "Rackham, Neil" -> "Neil Rackham"; "CHET HOLMES" -> "Chet Holmes". */
function normalizarAutor(texto) {
    let s = String(texto).replace(/\s+/g, ' ').trim();
    // Só inverte "Sobrenome, Nome" quando não há conectores: "Aaron, Denise e Arthur" são 3 autores.
    const invertido = /\s+e\s+|&/.test(s) ? null : s.match(/^([^,]+),\s*([^,]+)$/);
    // O primeiro termo é UMA palavra (o sobrenome): "Flávio Lemos, Celso Cardoso" são dois autores.
    if (invertido && invertido[1].trim().split(' ').length === 1 && invertido[2].trim().split(' ').length <= 3) {
        s = `${invertido[2]} ${invertido[1]}`;
    }
    return proporcaoMaiusculas(s) > 0.85 ? capitalizar(s) : s;
}

function autorMetadadoValido(autor) {
    if (!autor) return false;
    const s = String(autor).trim();
    if (s.length < 3 || s.length > 70) return false;
    // Metadado de uma palavra só costuma ser título de livro ("Antifrágil") ou apelido; quem tem
    // nome único (Osho, Platão) é identificado pelo nome do arquivo, não por aqui.
    if (!/\s/.test(s) && !/\./.test(s)) return false;
    // Começar por artigo/preposição denuncia título ("A Realização Espontânea do Desejo").
    if (/^(a|o|as|os|um|uma|de|da|do|das|dos|em|no|na)\s/i.test(s)) return false;
    if (LIXO_METADADO_AUTOR.test(s)) return false;
    if (/\b(pc|laptop|notebook|computer|desktop|user)\b/i.test(s)) return false;
    if (/\.(com|net|org|br|doc|docx|pdf)\b|@|\d{3,}/i.test(s)) return false;
    return /^\p{L}[\p{L}\s.'’\-,&]*$/u.test(s);
}

/** "kahneman daniel" -> "Kahneman Daniel", preservando artigos e preposições em minúsculas. */
function capitalizar(texto) {
    return texto
        .toLowerCase()
        .split(/\s+/)
        .map((p, i) => (i > 0 && PARTICULAS_TITULO.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(' ');
}

function proporcaoMaiusculas(texto) {
    const letras = texto.replace(/[^\p{L}]/gu, '');
    if (letras.length === 0) return 0;
    return letras.replace(/[^\p{Lu}]/gu, '').length / letras.length;
}

/** Tira ruído do nome do arquivo (sem extensão) sem decidir nada sobre título/autor. */
function limparBase(nomeSemExtensao) {
    let s = repararNome(nomeSemExtensao);
    // "José+Rodrigues+dos+Santos": "+" usado como espaço (codificação de URL). Exige 2 ou mais
    // ocorrências entre letras para não mexer em títulos legítimos como "Excel+Word".
    if ((s.match(/(?<=\p{L})\+(?=\p{L})/gu) || []).length >= 2) {
        s = s.replace(/(?<=\p{L})\+(?=\p{L})/gu, ' ');
    }
    s = s
        .replace(/\s*\((?:z-?lib\.org|1lib\.\w+|libgen\.\w+)\)/gi, '')
        .replace(/\s*\[(?:[^\]]*(?:epub|pdf|livro|ebook|download)[^\]]*)\]/gi, '')
        .replace(/\s*\(\d{1,2}\)\s*$/, '') // "Nome (1)" = cópia
        .replace(/(\.(?:pdf|epub|mobi|azw3?|docx?|txt|rtf))+\s*$/i, '') // "Livro.epub.pdf"
        .replace(/[\u200b\u00a0]+/g, ' ');

    // Nome sem espaços: "Quem-Pensa-Enriquece-Napoleon-Hill" ou "livro_do_autor"
    if (!/\s/.test(s) && /[-_]/.test(s)) {
        s = s.replace(/[-_]+/g, ' ');
        return capitalizar(s.trim());
    }
    s = s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > 6 && proporcaoMaiusculas(s) > 0.85) s = capitalizar(s);
    return s;
}

const limparSegmento = (s) => s.replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '').replace(/\s+/g, ' ');

/**
 * Separador: travessão com espaço dos dois lados e também as variantes mal formatadas
 * "Título- Autor" e "Título -Autor". "Mapa-Mental" e "Pós-Graduação" (sem espaço) ficam inteiros.
 */
const separarSegmentos = (base) =>
    base
        .split(/\s+[-–—]\s+|(?<=\p{L})[-–—]\s+|\s+[-–—](?=\p{L})/u)
        .map(limparSegmento)
        .filter(Boolean);

const semAcentoMinusculo = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const REGEX_BY = /^(.*\S)\s+(?:by|By|BY)\s+(\p{Lu}[^()]*)$/u;

/**
 * Aprende com o PRÓPRIO acervo quais textos são autores. Um nome que aparece como primeiro ou
 * último trecho em 2+ arquivos diferentes é quase certamente autor ("Bert Hellinger" em 5
 * arquivos); títulos quase nunca se repetem. Isso resolve a ambiguidade em que os dois lados
 * parecem nome: "Dar e Receber - Adam Grant" contra "Max Lucado - Bom dia!".
 *
 * Passe só arquivos únicos (sem duplicatas): a mesma cópia contada duas vezes inflaria a contagem.
 *
 * @param {string[]} nomesSemExtensao
 * @returns {Map<string, number>} nome normalizado -> quantos arquivos o citam como autor possível
 */
function construirContextoAutores(nomesSemExtensao) {
    const contagem = new Map();
    for (const nome of nomesSemExtensao) {
        const base = limparBase(nome);
        const candidatos = [];
        const segmentos = separarSegmentos(base);
        if (segmentos.length >= 2) candidatos.push(segmentos[0], segmentos[segmentos.length - 1]);
        const porBy = base.match(REGEX_BY);
        if (porBy) candidatos.push(porBy[2]);

        const vistos = new Set();
        for (const c of candidatos) {
            if (!pareceNome(c) && !pareceListaDeAutores(c) && !pareceNomeInvertido(c)) continue;
            const chave = semAcentoMinusculo(normalizarAutor(c));
            if (vistos.has(chave)) continue;
            vistos.add(chave);
            contagem.set(chave, (contagem.get(chave) || 0) + 1);
        }
    }
    return contagem;
}

/**
 * Decide título e autor a partir do nome do arquivo, com o autor dos metadados como reserva.
 * O nome do arquivo tem prioridade: metadados de PDF trazem muito lixo ("Administrador",
 * nome de computador, nome do site de onde o arquivo veio).
 *
 * Princípio: sem evidência, NÃO inventa autor. Um autor errado é pior que "Autor Desconhecido"
 * (o nome inteiro do arquivo fica como título e nada se perde).
 *
 * @param {string} nomeSemExtensao
 * @param {string|null} autorMetadado autor gravado dentro do PDF, se houver
 * @param {Map<string, number>|null} contexto resultado de construirContextoAutores()
 * @returns {{titulo: string, autor: string, origemAutor: string, confianca: 'alta'|'media'|'baixa'}}
 */
function inferirTituloAutor(nomeSemExtensao, autorMetadado = null, contexto = null) {
    const base = limparBase(nomeSemExtensao);
    const segmentos = separarSegmentos(base);
    const metaOk = autorMetadadoValido(autorMetadado) ? String(autorMetadado).trim() : null;

    const resultado = (titulo, autor, origemAutor, confianca) => ({
        titulo: titulo.slice(0, 255),
        autor: (autor === 'Autor Desconhecido' ? autor : normalizarAutor(autor)).slice(0, 255),
        origemAutor,
        confianca,
    });
    const igual = (a, b) => semAcentoMinusculo(a) === semAcentoMinusculo(b);
    const vezesNoAcervo = (s) => (contexto ? contexto.get(semAcentoMinusculo(normalizarAutor(s))) || 0 : 0);
    const palavrasDe = (s) => s.trim().split(/\s+/).length;
    // Evidência forte de autor: nome com 2+ palavras visto em 3+ arquivos. Só 2 arquivos não
    // basta (duas edições do mesmo livro repetem o título: "Despertar", "Mapas Mentais"), e uma
    // palavra só ("Flow", "Copywriting") é título comum demais.
    const autorFirmado = (s) => palavrasDe(s) >= 2 && vezesNoAcervo(s) >= 3;
    // Nome de uma palavra só ("Business") só vale se o acervo o viu como autor 2+ vezes (Osho).
    const nomeAceito = (s) =>
        (pareceNome(s) && (palavrasDe(s) >= 2 || vezesNoAcervo(s) >= 2)) ||
        pareceListaDeAutores(s) ||
        pareceNomeInvertido(s);
    const confirmadoPorMeta = (autor) => metaOk && igual(normalizarAutor(metaOk), normalizarAutor(autor));
    const origem = (autor) => (confirmadoPorMeta(autor) ? 'arquivo+metadado' : 'arquivo');

    // "Administração de Marketing by Philip Kotler": o autor vem depois de " by ".
    const porBy = base.match(REGEX_BY);
    if (porBy && pareceNome(normalizarAutor(porBy[2]))) {
        return resultado(limparSegmento(porBy[1]), porBy[2], origem(porBy[2]), 'alta');
    }

    if (segmentos.length >= 2) {
        const primeiro = segmentos[0];
        const ultimo = segmentos[segmentos.length - 1];
        const meio = segmentos.slice(0, -1).join(' - ');
        const resto = segmentos.slice(1).join(' - ');
        const ultimoNome = nomeAceito(ultimo);
        const primeiroNome = nomeAceito(primeiro);

        if (segmentos.length === 2 && primeiroNome && ultimoNome) {
            // Os dois lados parecem nome. Decide por evidência, na ordem: o acervo conhece só um
            // deles como autor; o metadado do PDF bate com um deles; senão o padrão do acervo
            // ("Título - Autor") com confiança média.
            if (autorFirmado(primeiro) && !autorFirmado(ultimo)) return resultado(ultimo, primeiro, 'arquivo', 'alta');
            if (autorFirmado(ultimo) && !autorFirmado(primeiro)) return resultado(primeiro, ultimo, 'arquivo', 'alta');
            if (confirmadoPorMeta(primeiro)) return resultado(ultimo, primeiro, 'arquivo+metadado', 'alta');
            if (confirmadoPorMeta(ultimo)) return resultado(primeiro, ultimo, 'arquivo+metadado', 'alta');
            return resultado(primeiro, ultimo, 'arquivo', 'media');
        }

        if (ultimoNome) {
            // "Título - Autor", com ou sem subtítulo no meio (o padrão dominante do acervo).
            return resultado(meio, ultimo, origem(ultimo), 'alta');
        }

        if (primeiroNome && (autorFirmado(primeiro) || confirmadoPorMeta(primeiro))) {
            // "Autor - Título": só com evidência (autor repetido no acervo ou confirmado pelo PDF).
            return resultado(resto, primeiro, origem(primeiro), 'alta');
        }
        // Nenhum lado é autor com segurança: cai para o nome inteiro como título (abaixo).
    }

    if (metaOk) return resultado(base, metaOk, 'metadado', 'media');
    return resultado(base, 'Autor Desconhecido', 'nenhuma', 'baixa');
}

module.exports = {
    repararNome,
    limparBase,
    inferirTituloAutor,
    construirContextoAutores,
    pareceNome,
    pareceListaDeAutores,
    pareceNomeInvertido,
    autorMetadadoValido,
    capitalizar,
};