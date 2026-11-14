<?php
/**
 * Classifica por categoria os livros que ainda não têm uma, usando as regras de
 * includes/categorias.php (palavras do título).
 *
 *   php database/categorizar_acervo.php            simulação: mostra a distribuição
 *   php database/categorizar_acervo.php --aplicar  grava no banco
 *   php database/categorizar_acervo.php --aplicar --refazer   reclassifica TODOS (sobrescreve edições manuais)
 *
 * Por padrão só toca livros sem categoria: o que você escolheu à mão fica como está.
 * Rode de novo depois de importar um lote novo (npm run acervo).
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/categorias.php';

$aplicar = in_array('--aplicar', $argv, true);
$refazer = in_array('--refazer', $argv, true);

garantirCategoriasPadrao($pdo);
$ids = [];
foreach ($pdo->query('SELECT id, slug FROM categorias')->fetchAll() as $c) {
    $ids[$c['slug']] = (int) $c['id'];
}

$filtro = $refazer ? '' : 'WHERE categoria_id IS NULL';
$livros = $pdo->query("SELECT id, titulo FROM livros $filtro")->fetchAll();

$contagem = [];
$upd = $pdo->prepare('UPDATE livros SET categoria_id = ? WHERE id = ?');
$pdo->beginTransaction();
foreach ($livros as $l) {
    $slug = categoriaSugerida($l['titulo']);
    $contagem[$slug] = ($contagem[$slug] ?? 0) + 1;
    if ($aplicar) {
        $upd->execute([$ids[$slug], $l['id']]);
    }
}
$pdo->commit();

arsort($contagem);
echo ($aplicar ? 'GRAVADO' : 'SIMULAÇÃO') . ': ' . count($livros) . " livro(s) analisado(s)\n";
foreach ($contagem as $slug => $n) {
    printf("  %-18s %5d\n", CATEGORIAS_PADRAO[$slug]['nome'], $n);
}
if (!$aplicar) {
    echo "\nNada foi alterado. Use --aplicar para gravar.\n";
}
