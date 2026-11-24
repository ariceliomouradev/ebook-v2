<?php
/**
 * Suporte a EPUB: validação, metadados (título, autor, idioma) e capa.
 *
 * Um EPUB é um ZIP com `META-INF/container.xml` apontando para o pacote OPF, que traz os
 * metadados (`dc:*`) e o manifesto dos arquivos. Nada aqui executa conteúdo do livro: só lê XML
 * e decodifica a imagem da capa.
 */

require_once __DIR__ . '/categorias_epub.php'; // categoriaSugeridaEpub()

const EPUB_MAX_ENTRADAS = 20000;          // proteção contra ZIP malicioso
const EPUB_CAPA_LARGURA_MAX = 600;        // a capa é reduzida a esta largura (px)
const EPUB_CAPA_PIXELS_MAX = 24_000_000;  // não decodifica imagens gigantes (memória)

/** O arquivo é um EPUB de verdade (ZIP + container.xml + mimetype, quando existir)? */
function arquivoEhEpubValido(string $caminho, bool $exigirUpload = true): bool
{
    if ($exigirUpload && !is_uploaded_file($caminho)) {
        return false;
    }
    if (!is_file($caminho) || !class_exists('ZipArchive')) {
        return false;
    }
    $h = @fopen($caminho, 'rb');
    if (!$h) {
        return false;
    }
    $assinatura = fread($h, 4);
    fclose($h);
    if ($assinatura !== "PK\x03\x04") {
        return false;
    }
    $z = new ZipArchive();
    if ($z->open($caminho) !== true) {
        return false;
    }
    $ok = $z->numFiles > 0 && $z->numFiles <= EPUB_MAX_ENTRADAS && $z->locateName('META-INF/container.xml') !== false;
    if ($ok) {
        $mimetype = $z->getFromName('mimetype');
        if ($mimetype !== false && trim($mimetype) !== 'application/epub+zip') {
            $ok = false;
        }
    }
    $z->close();
    return $ok;
}

/** Caminho "a/b/../c" -> "a/c" (sem escapar da raiz do ZIP). */
function epubNormalizarCaminho(string $caminho): string
{
    $saida = [];
    foreach (explode('/', str_replace('\\', '/', $caminho)) as $parte) {
        if ($parte === '' || $parte === '.') {
            continue;
        }
        if ($parte === '..') {
            array_pop($saida);
            continue;
        }
        $saida[] = $parte;
    }
    return implode('/', $saida);
}

/** @return array{xml: SimpleXMLElement, dir: string}|null pacote OPF do EPUB (já aberto em $z). */
function epubPacote(ZipArchive $z): ?array
{
    $container = $z->getFromName('META-INF/container.xml');
    if ($container === false || !preg_match('/full-path="([^"]+)"/', $container, $m)) {
        return null;
    }
    $opfCaminho = epubNormalizarCaminho(rawurldecode($m[1]));
    $opf = $z->getFromName($opfCaminho);
    if ($opf === false) {
        return null;
    }
    $opf = preg_replace('/^\xEF\xBB\xBF/', '', $opf);
    $xml = @simplexml_load_string($opf, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    if (!$xml) {
        return null;
    }
    $dir = str_contains($opfCaminho, '/') ? substr($opfCaminho, 0, strrpos($opfCaminho, '/')) : '';
    return ['xml' => $xml, 'dir' => $dir];
}

/** Texto do primeiro elemento <dc:$nome> (ou de todos, unidos por "; "). */
function epubDc(SimpleXMLElement $xml, string $nome, bool $todos = false): string
{
    $achados = $xml->xpath("//*[local-name()='metadata']/*[local-name()='$nome']") ?: [];
    $textos = [];
    foreach ($achados as $n) {
        $t = trim(preg_replace('/\s+/', ' ', (string) $n) ?? '');
        if ($t !== '') {
            $textos[] = $t;
        }
        if (!$todos && $textos) {
            break;
        }
    }
    return implode('; ', $textos);
}

/** @return array{titulo: string, autor: string, idioma: string, assuntos: string} vazios quando não há. */
function epubMetadados(string $caminho): array
{
    $vazio = ['titulo' => '', 'autor' => '', 'idioma' => '', 'assuntos' => ''];
    $z = new ZipArchive();
    if ($z->open($caminho) !== true) {
        return $vazio;
    }
    $pacote = epubPacote($z);
    $z->close();
    if (!$pacote) {
        return $vazio;
    }
    return [
        'titulo' => mb_substr(epubDc($pacote['xml'], 'title'), 0, 255),
        'autor'  => mb_substr(epubDc($pacote['xml'], 'creator', true), 0, 255),
        'idioma' => strtolower(substr(epubDc($pacote['xml'], 'language'), 0, 12)),
        'assuntos' => mb_substr(epubDc($pacote['xml'], 'subject', true), 0, 500),
    ];
}

/** Caminho (dentro do ZIP) da imagem de capa declarada no pacote, ou null. */
function epubCaminhoDaCapa(SimpleXMLElement $xml, string $dir, ZipArchive $z): ?string
{
    $itens = $xml->xpath("//*[local-name()='manifest']/*[local-name()='item']") ?: [];
    $porId = [];
    $candidatos = [];
    foreach ($itens as $it) {
        $tipo = (string) ($it['media-type'] ?? '');
        if (!str_starts_with($tipo, 'image/')) {
            continue;
        }
        $porId[(string) $it['id']] = (string) $it['href'];
        if (str_contains(' ' . (string) ($it['properties'] ?? '') . ' ', ' cover-image ')) {
            array_unshift($candidatos, (string) $it['href']);
        }
    }
    // EPUB 2: <meta name="cover" content="id-do-item">
    $metas = $xml->xpath("//*[local-name()='metadata']/*[local-name()='meta'][@name='cover']") ?: [];
    foreach ($metas as $m) {
        $id = (string) ($m['content'] ?? '');
        if (isset($porId[$id])) {
            $candidatos[] = $porId[$id];
        }
    }
    // último recurso: imagem do manifesto com "cover"/"capa" no nome
    foreach ($porId as $id => $href) {
        if (preg_match('/cover|capa/i', $id . ' ' . $href)) {
            $candidatos[] = $href;
        }
    }
    foreach ($candidatos as $href) {
        $caminho = epubNormalizarCaminho(($dir !== '' ? $dir . '/' : '') . rawurldecode(strtok($href, '#?') ?: ''));
        if ($caminho !== '' && $z->locateName($caminho) !== false) {
            return $caminho;
        }
    }
    return null;
}

/** Imagem qualquer (JPG/PNG/GIF/WebP) -> PNG reduzido a EPUB_CAPA_LARGURA_MAX de largura. */
function epubImagemParaPng(string $bytes): ?string
{
    $info = @getimagesizefromstring($bytes);
    if ($info === false || $info[0] < 40 || $info[1] < 40 || $info[0] * $info[1] > EPUB_CAPA_PIXELS_MAX) {
        return null;
    }
    if (!in_array($info['mime'], ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], true)) {
        return null;
    }
    $origem = @imagecreatefromstring($bytes);
    if (!$origem) {
        return null;
    }
    $larg = imagesx($origem);
    $alt = imagesy($origem);
    if ($larg > EPUB_CAPA_LARGURA_MAX) {
        $novaAlt = (int) round($alt * EPUB_CAPA_LARGURA_MAX / $larg);
        $destino = imagecreatetruecolor(EPUB_CAPA_LARGURA_MAX, $novaAlt);
        imagecopyresampled($destino, $origem, 0, 0, 0, 0, EPUB_CAPA_LARGURA_MAX, $novaAlt, $larg, $alt);
    } else {
        $destino = imagecreatetruecolor($larg, $alt);
        imagecopy($destino, $origem, 0, 0, 0, 0, $larg, $alt);
    }
    ob_start();
    imagepng($destino, null, 6);
    $png = (string) ob_get_clean();
    return $png !== '' ? $png : null;
}

/** Bytes PNG da capa do EPUB, ou null quando o livro não declara uma capa utilizável. */
function epubCapaPng(string $caminho): ?string
{
    $z = new ZipArchive();
    if ($z->open($caminho) !== true) {
        return null;
    }
    $pacote = epubPacote($z);
    $bytes = null;
    if ($pacote) {
        $caminhoCapa = epubCaminhoDaCapa($pacote['xml'], $pacote['dir'], $z);
        if ($caminhoCapa !== null) {
            $stat = $z->statName($caminhoCapa);
            if ($stat !== false && $stat['size'] > 0 && $stat['size'] <= 15 * 1024 * 1024) {
                $bytes = $z->getFromName($caminhoCapa);
            }
        }
    }
    $z->close();
    return $bytes ? epubImagemParaPng($bytes) : null;
}

/** Formato de um livro pelo nome salvo em `uploads/` ('epub' ou 'pdf'). */
function formatoPorNomeArquivo(string $nomeArquivo): string
{
    return strtolower(pathinfo($nomeArquivo, PATHINFO_EXTENSION)) === 'epub' ? 'epub' : 'pdf';
}
