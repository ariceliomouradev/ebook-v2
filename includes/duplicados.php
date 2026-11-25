<?php
/**
 * Detecção de livros repetidos.
 *
 * Três sinais, do mais certo ao mais provável:
 *   1. hash do arquivo igual (SHA-256)              -> é o mesmo arquivo
 *   2. mesmo título + mesmo autor (normalizados)    -> é o mesmo livro (outra cópia/digitalização)
 *   3. capa visualmente igual + título parecido     -> é o mesmo livro
 *
 * Quem decide o que fazer é o administrador: o sistema só marca `livros.duplicado_de` (esconde o repetido
 * de Pro e Grátis) e sinaliza na fila de aprovação. Nada é apagado automaticamente.
 */

const CAPA_DISTANCIA_IGUAL = 5;   // bits diferentes (de 64) para duas capas valerem como "a mesma"
const TITULO_SEMELHANCA_CAPA = 0.5; // quão parecidos os títulos precisam ser, junto com a capa igual
const TITULO_SEMELHANCA_AUTOR = 0.75; // idem, quando só o autor coincide

/* ------------------------------ normalização ------------------------------ */
function textoSemAcento(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    if (class_exists('Transliterator')) {
        $t = Transliterator::create('Any-Latin; Latin-ASCII');
        if ($t) {
            $s = $t->transliterate($s);
        }
    } else {
        $s = (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    }
    return $s;
}

/** Palavras que não distinguem um livro de outro. */
const PALAVRAS_VAZIAS = ['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas',
    'para', 'por', 'com', 'ao', 'que', 'pdf', 'ebook', 'livro', 'completo', 'copia', 'the', 'of', 'and', 'to', 'in'];

/** @return string[] palavras significativas do título/autor (sem acento, sem pontuação, sem artigos). */
function palavrasChave(string $texto): array
{
    $s = preg_replace('/[^a-z0-9]+/', ' ', textoSemAcento($texto));
    $palavras = array_values(array_filter(explode(' ', trim((string) $s)), static fn ($p) => $p !== '' && !in_array($p, PALAVRAS_VAZIAS, true)));
    return $palavras;
}

function chaveTitulo(string $titulo): string
{
    return mb_substr(implode(' ', palavrasChave($titulo)), 0, 255);
}

/** Autor normalizado; '' quando não há autor de verdade ("Autor Desconhecido"). */
function chaveAutor(?string $autor): string
{
    $a = trim((string) $autor);
    if ($a === '' || stripos(textoSemAcento($a), 'autor desconhecido') !== false) {
        return '';
    }
    $palavras = palavrasChave($a);
    sort($palavras); // "Paulo Vieira" = "Vieira, Paulo"
    return mb_substr(implode(' ', $palavras), 0, 255);
}

/** 0 a 1: quanto os conjuntos de palavras de dois títulos se parecem (Jaccard). */
function semelhancaTitulos(string $chaveA, string $chaveB): float
{
    $a = array_unique(explode(' ', $chaveA));
    $b = array_unique(explode(' ', $chaveB));
    if (!$a || !$b || $chaveA === '' || $chaveB === '') {
        return 0.0;
    }
    $inter = count(array_intersect($a, $b));
    $uniao = count(array_unique(array_merge($a, $b)));
    return $uniao ? $inter / $uniao : 0.0;
}

/** Um título está dentro do outro? (todas as palavras do mais curto aparecem no mais longo; mínimo 2 palavras) */
function tituloContido(string $chaveA, string $chaveB): bool
{
    $a = array_unique(explode(' ', $chaveA));
    $b = array_unique(explode(' ', $chaveB));
    if ($chaveA === '' || $chaveB === '') {
        return false;
    }
    [$curto, $longo] = count($a) <= count($b) ? [$a, $b] : [$b, $a];
    return count($curto) >= 2 && count(array_diff($curto, $longo)) === 0;
}

/* ------------------------------ capa (dHash) ------------------------------ */
/** dHash de 64 bits (16 hex) de uma imagem: compara o brilho de pixels vizinhos numa miniatura 9x8. */
function hashCapaDeImagem(GdImage $img): string
{
    $mini = imagecreatetruecolor(9, 8);
    imagecopyresampled($mini, $img, 0, 0, 0, 0, 9, 8, imagesx($img), imagesy($img));
    $bits = '';
    for ($y = 0; $y < 8; $y++) {
        for ($x = 0; $x < 8; $x++) {
            $a = imagecolorat($mini, $x, $y);
            $b = imagecolorat($mini, $x + 1, $y);
            $la = (($a >> 16) & 255) * 0.299 + (($a >> 8) & 255) * 0.587 + ($a & 255) * 0.114;
            $lb = (($b >> 16) & 255) * 0.299 + (($b >> 8) & 255) * 0.587 + ($b & 255) * 0.114;
            $bits .= $la > $lb ? '1' : '0';
        }
    }
    return sprintf('%08x%08x', bindec(substr($bits, 0, 32)), bindec(substr($bits, 32, 32)));
}

function hashCapaDeArquivo(string $caminho): ?string
{
    if (!is_file($caminho)) {
        return null;
    }
    $bytes = @file_get_contents($caminho);
    $img = $bytes === false ? false : @imagecreatefromstring($bytes);
    return $img ? hashCapaDeImagem($img) : null;
}

function hashCapaDeBytes(string $bytes): ?string
{
    $img = @imagecreatefromstring($bytes);
    return $img ? hashCapaDeImagem($img) : null;
}

/** Bits diferentes entre dois dHash (0 a 64); 64 se algum for inválido. */
function distanciaCapa(?string $a, ?string $b): int
{
    if (!$a || !$b || strlen($a) !== 16 || strlen($b) !== 16) {
        return 64;
    }
    $d = 0;
    foreach ([[0, 8], [8, 8]] as [$ini, $len]) {
        $x = hexdec(substr($a, $ini, $len)) ^ hexdec(substr($b, $ini, $len));
        while ($x) {
            $d += $x & 1;
            $x >>= 1;
        }
    }
    return $d;
}

/* --------------------------------- consultas --------------------------------- */
/**
 * Procura, entre os livros publicados e visíveis (sem duplicado_de), um que seja o mesmo livro.
 * @return array{exato: ?array, provavel: ?array}  provavel traz também 'motivo'
 */
function buscarDuplicado(PDO $pdo, ?string $hash, string $titulo, string $autor, int $ignorarId = 0, ?string $capaHash = null): array
{
    $exato = null;
    if ($hash) {
        $stmt = $pdo->prepare("SELECT id, titulo, autor FROM livros WHERE hash_arquivo = ? AND publicacao = 'aprovado' AND id <> ? LIMIT 1");
        $stmt->execute([$hash, $ignorarId]);
        $exato = $stmt->fetch() ?: null;
    }

    $tChave = chaveTitulo($titulo);
    $aChave = chaveAutor($autor);
    $provavel = null;
    if ($tChave !== '') {
        // candidatos: mesmo título normalizado OU mesma capa (comparamos a capa no PHP, são poucos)
        $stmt = $pdo->prepare(
            "SELECT id, titulo, autor, titulo_chave, autor_chave, capa_hash FROM livros
              WHERE publicacao = 'aprovado' AND id <> ? AND duplicado_de IS NULL
                AND (titulo_chave = ? OR (autor_chave <> '' AND autor_chave = ?) OR (capa_hash IS NOT NULL AND ? IS NOT NULL))"
        );
        $stmt->execute([$ignorarId, $tChave, $aChave, $capaHash]);
        foreach ($stmt->fetchAll() as $c) {
            $sim = semelhancaTitulos($tChave, (string) $c['titulo_chave']);
            $mesmoAutor = $aChave !== '' && $aChave === $c['autor_chave'];
            $autorLivre = $aChave === '' || $c['autor_chave'] === '';
            $capaIgual = distanciaCapa($capaHash, $c['capa_hash']) <= CAPA_DISTANCIA_IGUAL;
            $motivo = null;
            if ($tChave === $c['titulo_chave'] && ($mesmoAutor || $autorLivre)) {
                $motivo = 'mesmo título e autor';
            } elseif ($capaIgual && $sim >= TITULO_SEMELHANCA_CAPA) {
                $motivo = 'mesma capa e título parecido';
            } elseif ($mesmoAutor && distanciaCapa($capaHash, $c['capa_hash']) <= 3 && (tituloContido($tChave, (string) $c['titulo_chave']) || $sim >= 0.4)) {
                $motivo = 'mesmo autor, mesma capa e título que contém o outro';
            } elseif ($mesmoAutor && $sim >= TITULO_SEMELHANCA_AUTOR) {
                $motivo = 'mesmo autor e título parecido';
            }
            if ($motivo) {
                $provavel = ['id' => $c['id'], 'titulo' => $c['titulo'], 'autor' => $c['autor'], 'motivo' => $motivo];
                break;
            }
        }
    }
    return ['exato' => $exato, 'provavel' => $provavel];
}

/** Há algum livro (de qualquer status) com este arquivo? Usado para o administrador não duplicar o acervo. */
function hashJaExiste(PDO $pdo, string $hash): ?array
{
    $stmt = $pdo->prepare('SELECT id, titulo, autor FROM livros WHERE hash_arquivo = ? LIMIT 1');
    $stmt->execute([$hash]);
    return $stmt->fetch() ?: null;
}

/** Grava as chaves de título/autor (e capa, se houver) de um livro recém-criado ou editado. */
function atualizarChavesDoLivro(PDO $pdo, int $id, string $titulo, ?string $autor, ?string $capaHash = null): void
{
    if ($capaHash !== null) {
        $pdo->prepare('UPDATE livros SET titulo_chave = ?, autor_chave = ?, capa_hash = ? WHERE id = ?')
            ->execute([chaveTitulo($titulo), chaveAutor($autor), $capaHash, $id]);
    } else {
        $pdo->prepare('UPDATE livros SET titulo_chave = ?, autor_chave = ? WHERE id = ?')
            ->execute([chaveTitulo($titulo), chaveAutor($autor), $id]);
    }
}

/**
 * Depois de publicar um livro: se ele repete outro já publicado, esconde-o de Pro e Grátis
 * (duplicado_de) em vez de apagar. Devolve o id do original, ou null.
 */
function marcarDuplicadoSePreciso(PDO $pdo, int $id): ?int
{
    $stmt = $pdo->prepare('SELECT titulo, autor, hash_arquivo, capa_hash FROM livros WHERE id = ?');
    $stmt->execute([$id]);
    $l = $stmt->fetch();
    if (!$l) {
        return null;
    }
    $dup = buscarDuplicado($pdo, $l['hash_arquivo'], (string) $l['titulo'], (string) ($l['autor'] ?? ''), $id, $l['capa_hash']);
    $original = $dup['exato'] ?? $dup['provavel'];
    if (!$original) {
        return null;
    }
    $pdo->prepare('UPDATE livros SET duplicado_de = ? WHERE id = ?')->execute([(int) $original['id'], $id]);
    return (int) $original['id'];
}
