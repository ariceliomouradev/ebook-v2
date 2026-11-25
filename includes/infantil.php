<?php
/**
 * Detecção de livros infantis (categoria `infantil`, "Infantojuvenil": histórias para crianças, fábulas,
 * livros ilustrados e quadrinhos infantis). Usada por database/categorizar_infantil.php (acervo já cadastrado)
 * e pelo envio de EPUB (api/upload.php).
 *
 * Sinais, do mais forte ao mais fraco:
 *   1. palavras que dizem "infantil" no título, assunto ou sinopse (infantojuvenil, fábula, garotada, gibi…);
 *   2. título com personagem/tema clássico (porquinhos, chapeuzinho, maluquinho, patinho feio…);
 *   3. EPUB de layout fixo (livro ilustrado, página = imagem) com pouco texto: livro de figuras;
 *   4. autor ou editora conhecidos de literatura infantil;
 *   5. duas ou mais palavras fracas juntas (bichinho, menininha, "era uma vez"…).
 * Tudo é comparado sem acento e em minúsculas, por palavra inteira ou prefixo.
 */
require_once __DIR__ . '/epub.php';

const INFANTIL_PALAVRAS_FORTES = [
    'infantil', 'infantojuvenil', 'infanto juvenil', 'literatura juvenil', 'juvenile', 'children', 'childrens', 'garotada', 'pequenos leitores', 'fabula', 'fabulas', 'historinha',
    'historinhas', 'gibi', 'gibis', 'quadrinhos infantis', 'turma da monica', 'turma do', 'maluquinho', 'cuento infantil',
    'picture book', 'bedtime story', 'historias para dormir', 'almanaque',
];
const INFANTIL_TITULOS = [
    'porquinhos', 'porquinho', 'chapeuzinho', 'patinho feio', 'cinderela', 'branca de neve', 'bela adormecida', 'pinoquio',
    'pequeno principe', 'joao e maria', 'rapunzel', 'gato de botas', 'ali baba', 'peter pan', 'alice no pais', 'mogli',
    'monstropeia', 'dinossauro', 'dinossauros', 'princesa', 'princesas',
    'gatinho', 'cachorrinho', 'coelhinho', 'bichinho', 'bichinhos', 'ursinho', 'elefantinho', 'leaozinho',
    'sapo', 'formiga', 'pomba', 'cigarra', 'tartaruga e a lebre', 'saci', 'curupira', 'cuca', 'boitata', 'sitio do picapau',
    'emilia', 'narizinho', 'tapete voador', 'abelhas', 'brincadeira', 'brincar', 'cantiga', 'cantigas', 'parlenda', 'parlendas',
    'cordel infantil', 'erase una vez', 'ugliest monster',
];
const INFANTIL_FRACAS = [
    'menininha', 'menininho', 'garotinho', 'garotinha', 'bichos', 'animais da', 'era uma vez', 'aventuras de', 'a menina', 'o menino',
    'o gato', 'a gata', 'o cachorro', 'o lobo', 'a raposa', 'o macaco', 'a girafa', 'o urso', 'o rei', 'a rainha', 'o mar de',
    'para criancas', 'para as criancas', 'contos de fadas', 'conto de fadas', 'garoto', 'garota', 'professor', 'aprendendo', 'escolinha', 'amiguinho', 'amiguinhos', 'travessura', 'travessuras', 'colorir', 'abc',
];
const INFANTIL_AUTORES = [
    'ziraldo', 'monteiro lobato', 'sonia junqueira', 'tino freitas', 'roseana murray', 'weberson santiago', 'leo cunha',
    'nelson cruz', 'otavio junior', 'luciana sandroni', 'mirna pinsky', 'marina colasanti', 'mirella spinelli', 'marta lagarta',
    'josue limeira', 'rogerio andrade barbosa', 'arievaldo viana', 'elza sallut', 'stella maris rezende', 'sophia vettorazzo',
    'mariangela haddad', 'wanda lopes bicudo', 'mauricio de sousa', 'ruth rocha', 'ana maria machado', 'eva furnari',
    'pedro bandeira', 'angela lago', 'tatiana belinky', 'cecilia meireles', 'maria clara machado', 'sylvia orthof',
    'turma da monica', 'walt disney', 'dr seuss', 'roald dahl', 'andersen', 'irmaos grimm', 'perrault', 'la fontaine', 'esopo',
];

/** minúsculas, sem acento, só letras/números/espaço */
function infantilNormalizar(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'í' => 'i', 'ì' => 'i', 'î' => 'i',
        'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n']);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    return ' ' . trim((string) $s) . ' ';
}

/** A frase (já normalizada, entre espaços) contém o termo como palavra(s) inteira(s)? "turma do" casa "turma do bairro". */
function infantilTem(string $texto, string $termo): bool
{
    return str_contains($texto, ' ' . $termo . ' ') || str_contains($texto, ' ' . $termo);
}

function infantilAlgum(string $texto, array $termos): ?string
{
    foreach ($termos as $t) {
        if (infantilTem($texto, $t)) {
            return $t;
        }
    }
    return null;
}

/**
 * Sinais lidos de dentro do EPUB: assuntos, sinopse, editora, layout fixo e volume de texto.
 * @return array{assuntos:string, sinopse:string, editora:string, fixo:bool, texto:int}
 */
function infantilSinaisDoEpub(string $caminho): array
{
    $sinais = ['assuntos' => '', 'sinopse' => '', 'editora' => '', 'fixo' => false, 'texto' => 0];
    $z = new ZipArchive();
    if ($z->open($caminho) !== true) {
        return $sinais;
    }
    $container = (string) $z->getFromName('META-INF/container.xml');
    if (!preg_match('~full-path="([^"]+)"~', $container, $m)) {
        $z->close();
        return $sinais;
    }
    $opf = (string) $z->getFromName($m[1]);
    if (preg_match_all('~<dc:subject[^>]*>([^<]*)~i', $opf, $s)) {
        $sinais['assuntos'] = implode(' ', $s[1]);
    }
    if (preg_match('~<dc:description[^>]*>(.*?)</dc:description>~is', $opf, $d)) {
        $sinais['sinopse'] = mb_substr(strip_tags(html_entity_decode($d[1])), 0, 600);
    }
    if (preg_match('~<dc:publisher[^>]*>([^<]*)~i', $opf, $p)) {
        $sinais['editora'] = $p[1];
    }
    $sinais['fixo'] = stripos($opf, 'pre-paginated') !== false;
    $texto = 0;
    for ($i = 0; $i < $z->numFiles; $i++) {
        $nome = (string) $z->getNameIndex($i);
        if (preg_match('~\.(x?html?)$~i', $nome) && !preg_match('~(^|/)(toc|nav)\.x?html?$~i', $nome)) {
            $texto += mb_strlen(trim(strip_tags((string) $z->getFromIndex($i, 400000))));
        }
    }
    $sinais['texto'] = $texto;
    $z->close();
    return $sinais;
}

/**
 * Decide se o livro é infantil. $sinais vem de infantilSinaisDoEpub() (ou vazio, para PDF: só título e autor).
 * @return string|null  o motivo (para mostrar na simulação) ou null se não parece infantil
 */
/** Editoras de livros ilustrados e infantis: só valem juntas com pouco texto ou layout fixo (também publicam adultos). */
const INFANTIL_EDITORAS = ['yellowfante', 'editora le', 'compor', 'globinho', 'moderna infantil', 'ciranda cultural', 'turma da monica'];

/** Livros que casam com os sinais acima mas são para adultos (quadrinhos adultos, fantasia, poesia). */
const INFANTIL_EXCLUIR = ['jodorowsky', 'martin millar', 'mario de andrade', 'papa terrivel', 'boas fadas'];

function livroEhInfantil(string $titulo, string $autor = '', array $sinais = []): ?string
{
    $t = infantilNormalizar($titulo);
    $a = infantilNormalizar($autor . ' ' . ($sinais['editora'] ?? ''));
    if (infantilAlgum(infantilNormalizar($titulo . ' ' . $autor), INFANTIL_EXCLUIR) !== null) {
        return null;
    }
    $ctx = infantilNormalizar($t . ' ' . ($sinais['assuntos'] ?? '') . ' ' . ($sinais['sinopse'] ?? ''));

    if (($x = infantilAlgum($ctx, INFANTIL_PALAVRAS_FORTES)) !== null) {
        return 'palavra: ' . trim($x);
    }
    if (($x = infantilAlgum($t, INFANTIL_TITULOS)) !== null) {
        return 'título: ' . trim($x);
    }
    if (($x = infantilAlgum($a, INFANTIL_AUTORES)) !== null) {
        return 'autor/editora: ' . trim($x);
    }
    $curto = !empty($sinais['fixo']) || (($sinais['texto'] ?? 0) > 0 && $sinais['texto'] < 20000);
    if ($curto && ($x = infantilAlgum(infantilNormalizar(($sinais['editora'] ?? '') . ' ' . $autor), INFANTIL_EDITORAS)) !== null) {
        return 'editora de livros ilustrados + pouco texto: ' . trim($x);
    }
    $fracas = 0;
    foreach (INFANTIL_FRACAS as $f) {
        if (infantilTem($ctx, $f)) {
            $fracas++;
        }
    }
    return $fracas >= 2 ? 'várias palavras de história infantil' : null;
}
