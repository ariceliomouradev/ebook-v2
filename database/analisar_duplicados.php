<?php
/**
 * Acha livros repetidos no acervo (mesmo livro em arquivos diferentes) e, se você mandar, ESCONDE os
 * repetidos de Pro e Grátis. Não apaga nada.
 *
 *   php database/analisar_duplicados.php              só analisa e grava o relatório
 *   php database/analisar_duplicados.php --aplicar    marca os repetidos (livros.duplicado_de) nos grupos "certos"
 *   php database/analisar_duplicados.php --desfazer   volta tudo (ninguém fica marcado como repetido)
 *   php database/analisar_duplicados.php --refazer    recalcula título/autor/capa de todos (padrão: só dos que faltam)
 *
 * Relatório: database/.duplicados/relatorio.md. Grupos "certos" = mesmo título e autor, ou mesma capa com
 * título parecido. "Revisar" = indícios mais fracos: nunca são marcados sozinhos.
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/duplicados.php';

$aplicar = in_array('--aplicar', $argv, true);
$desfazer = in_array('--desfazer', $argv, true);
$refazer = in_array('--refazer', $argv, true);

if ($desfazer) {
    $n = $pdo->exec('UPDATE livros SET duplicado_de = NULL WHERE duplicado_de IS NOT NULL');
    exit("Desfeito: $n livro(s) deixaram de ser marcados como repetidos.\n");
}

/* ---- 1. chaves de título/autor/capa de todos os livros ---- */
$where = $refazer ? '' : 'WHERE titulo_chave IS NULL OR capa_hash IS NULL';
$linhas = $pdo->query("SELECT id, titulo, autor, capa_arquivo FROM livros $where")->fetchAll();
$upd = $pdo->prepare('UPDATE livros SET titulo_chave = ?, autor_chave = ?, capa_hash = COALESCE(?, capa_hash) WHERE id = ?');
foreach ($linhas as $l) {
    $capa = !empty($l['capa_arquivo']) ? hashCapaDeArquivo(__DIR__ . '/../capas/' . $l['capa_arquivo']) : null;
    $upd->execute([chaveTitulo((string) $l['titulo']), chaveAutor($l['autor']), $capa, $l['id']]);
}
echo 'Chaves calculadas para ' . count($linhas) . " livro(s).\n";

/* ---- 2. compara todos contra todos (acervo publicado) ---- */
$livros = $pdo->query(
    "SELECT l.id, l.titulo, l.autor, l.nome_arquivo, l.titulo_chave, l.autor_chave, l.capa_hash, l.hash_arquivo, l.data_upload,
            (SELECT COUNT(*) FROM leituras le WHERE le.livro_id = l.id) AS leituras,
            (SELECT COUNT(*) FROM anotacoes an WHERE an.livro_id = l.id) AS anotacoes
       FROM livros l WHERE l.publicacao = 'aprovado' ORDER BY l.id"
)->fetchAll();
$n = count($livros);
foreach ($livros as &$l) {
    $caminho = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
    $l['tamanho'] = is_file($caminho) ? filesize($caminho) : 0;
}
unset($l);

$certas = [];  // [i, j, motivo]
$revisar = []; // [i, j, motivo]
for ($i = 0; $i < $n; $i++) {
    for ($j = $i + 1; $j < $n; $j++) {
        $a = $livros[$i];
        $b = $livros[$j];
        $motivo = null;
        $forte = false;
        $tA = (string) $a['titulo_chave'];
        $tB = (string) $b['titulo_chave'];
        $aA = (string) $a['autor_chave'];
        $aB = (string) $b['autor_chave'];
        $mesmoAutor = $aA !== '' && $aA === $aB;
        $autorLivre = $aA === '' || $aB === '';
        $dist = distanciaCapa($a['capa_hash'], $b['capa_hash']);
        $sim = ($tA !== '' && $tB !== '') ? semelhancaTitulos($tA, $tB) : 0.0;

        if ($a['hash_arquivo'] && $a['hash_arquivo'] === $b['hash_arquivo']) {
            $motivo = 'arquivo idêntico';
            $forte = true;
        } elseif ($tA !== '' && $tA === $tB && ($mesmoAutor || $autorLivre)) {
            $motivo = 'mesmo título' . ($mesmoAutor ? ' e autor' : ' (autor desconhecido em um deles)');
            $forte = true;
        } elseif ($dist <= CAPA_DISTANCIA_IGUAL && $sim >= TITULO_SEMELHANCA_CAPA) {
            $motivo = "mesma capa (dif. $dist) e título parecido (" . round($sim * 100) . '%)';
            $forte = true;
        } elseif ($mesmoAutor && $dist <= 3 && (tituloContido($tA, $tB) || $sim >= 0.4)) {
            $motivo = "mesmo autor, capa quase igual (dif. $dist) e um título contém o outro (" . round($sim * 100) . '%)';
            $forte = true;
        } elseif ($mesmoAutor && $sim >= TITULO_SEMELHANCA_AUTOR) {
            $motivo = 'mesmo autor e título parecido (' . round($sim * 100) . '%)';
        } elseif ($dist <= 3 && $sim >= 0.3) {
            $motivo = "capa quase igual (dif. $dist) e título meio parecido (" . round($sim * 100) . '%)';
        }
        if ($motivo) {
            if ($forte) {
                $certas[] = [$i, $j, $motivo];
            } else {
                $revisar[] = [$i, $j, $motivo];
            }
        }
    }
}

/* ---- 3. agrupa (união de pares) ---- */
function agrupar(int $n, array $arestas): array
{
    $pai = range(0, $n - 1);
    $achar = function (int $x) use (&$pai, &$achar): int {
        while ($pai[$x] !== $x) {
            $pai[$x] = $pai[$pai[$x]];
            $x = $pai[$x];
        }
        return $x;
    };
    foreach ($arestas as [$i, $j]) {
        $pai[$achar($i)] = $achar($j);
    }
    $grupos = [];
    for ($i = 0; $i < $n; $i++) {
        $grupos[$achar($i)][] = $i;
    }
    return array_values(array_filter($grupos, static fn ($g) => count($g) > 1));
}

/** Escolhe o original: quem já tem leitura/anotação de alguém, depois o maior arquivo, depois o mais antigo. */
function escolherOriginal(array $livros, array $indices): int
{
    usort($indices, static function ($x, $y) use ($livros) {
        $a = $livros[$x];
        $b = $livros[$y];
        return [(int) ($b['anotacoes'] > 0), (int) ($b['leituras'] > 0), $b['tamanho'], -$b['id']]
           <=> [(int) ($a['anotacoes'] > 0), (int) ($a['leituras'] > 0), $a['tamanho'], -$a['id']];
    });
    return $indices[0];
}

$gruposCertos = agrupar($n, $certas);
$emCertos = array_merge(...($gruposCertos ?: [[]]));
$gruposRevisar = agrupar($n, array_filter($revisar, static fn ($p) => !in_array($p[0], $emCertos, true) || !in_array($p[1], $emCertos, true)));

/* ---- 4. relatório ---- */
$fmt = static fn ($b) => $b >= 1048576 ? round($b / 1048576, 1) . ' MB' : round($b / 1024) . ' KB';
$linhaLivro = static function (array $l, bool $original) use ($fmt): string {
    return sprintf("  - #%d %s «%s» — %s — %s%s%s\n", $l['id'], $original ? '**(manter)**' : '(repetido)', $l['titulo'],
        trim((string) $l['autor']) ?: 'sem autor', $fmt($l['tamanho']),
        $l['leituras'] ? ", lido por {$l['leituras']}" : '', $l['anotacoes'] ? ", {$l['anotacoes']} anotações" : '');
};
$md = "# Relatório de livros repetidos\n\nGerado em " . date('d/m/Y H:i') . ". Acervo publicado: $n livros.\n\n";
$md .= '## Grupos certos (' . count($gruposCertos) . ")\n\nSerão marcados como repetidos (escondidos de Pro e Grátis) com `--aplicar`.\n\n";
$aMarcar = [];
foreach ($gruposCertos as $k => $g) {
    $orig = escolherOriginal($livros, $g);
    $md .= '### Grupo ' . ($k + 1) . "\n";
    foreach ($g as $i) {
        $md .= $linhaLivro($livros[$i], $i === $orig);
        if ($i !== $orig) {
            $aMarcar[$livros[$i]['id']] = $livros[$orig]['id'];
        }
    }
    $motivos = array_unique(array_map(static fn ($p) => $p[2], array_filter($certas, static fn ($p) => in_array($p[0], $g, true))));
    $md .= '  - motivo: ' . implode('; ', $motivos) . "\n\n";
}
$md .= '## Para você revisar (' . count($gruposRevisar) . ")\n\nIndícios mais fracos: nada é marcado sozinho.\n\n";
foreach ($gruposRevisar as $k => $g) {
    $md .= '### Revisar ' . ($k + 1) . "\n";
    foreach ($g as $i) {
        $md .= $linhaLivro($livros[$i], false);
    }
    $motivos = array_unique(array_map(static fn ($p) => $p[2], array_filter($revisar, static fn ($p) => in_array($p[0], $g, true))));
    $md .= '  - motivo: ' . implode('; ', array_slice($motivos, 0, 3)) . "\n\n";
}
$dir = __DIR__ . '/.duplicados';
if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
}
file_put_contents($dir . '/relatorio.md', $md);
file_put_contents($dir . '/marcar.json', json_encode($aMarcar, JSON_PRETTY_PRINT));

echo count($gruposCertos) . ' grupo(s) certos, ' . count($aMarcar) . ' livro(s) repetido(s) a esconder; '
    . count($gruposRevisar) . " grupo(s) para revisar.\nRelatório: database/.duplicados/relatorio.md\n";

if ($aplicar) {
    $pdo->exec('UPDATE livros SET duplicado_de = NULL');
    $up = $pdo->prepare('UPDATE livros SET duplicado_de = ? WHERE id = ?');
    foreach ($aMarcar as $dup => $orig) {
        $up->execute([$orig, $dup]);
    }
    echo 'Aplicado: ' . count($aMarcar) . " livro(s) marcados como repetidos (escondidos de Pro e Grátis).\n";
} else {
    echo "Nada foi alterado. Rode com --aplicar para esconder os repetidos dos grupos certos.\n";
}
