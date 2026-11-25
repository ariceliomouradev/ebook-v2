<?php
/**
 * Põe na categoria "Infantojuvenil" os livros com histórias para criança (livros ilustrados, fábulas,
 * quadrinhos infantis, literatura infantojuvenil). A decisão está em includes/infantil.php.
 *
 *   php database/categorizar_infantil.php                simulação: lista o que mudaria, sem gravar
 *   php database/categorizar_infantil.php --aplicar      grava e guarda o que mudou (para desfazer)
 *   php database/categorizar_infantil.php --desfazer     devolve cada livro à categoria que tinha
 *
 * Só mexe em livros que NÃO estão em Infantojuvenil. EPUB: lê assunto, sinopse, editora, layout e volume de
 * texto do próprio arquivo (uploads/). PDF: usa título e autor. O estado fica em
 * database/.importacao_epub/infantil_anterior.json (ignorado pelo git).
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
define('CAMINHO_RAIZ', __DIR__ . '/../');
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/infantil.php';
require_once __DIR__ . '/../includes/categorias.php';

$opcoes = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z]+)(?:=(.*))?$/', $a, $m)) {
        $opcoes[$m[1]] = $m[2] ?? true;
    }
}
$estadoDir = __DIR__ . '/.importacao_epub';
$estadoArq = $estadoDir . '/infantil_anterior.json';

$idInfantil = $pdo->query("SELECT id FROM categorias WHERE slug = 'infantil'")->fetchColumn();
if (!$idInfantil) {
    exit("A categoria 'infantil' não existe neste banco (rode database/categorizar_acervo.php --aplicar antes).\n");
}

if (isset($opcoes['desfazer'])) {
    if (!is_file($estadoArq)) {
        exit("Nada para desfazer.\n");
    }
    $anterior = json_decode((string) file_get_contents($estadoArq), true) ?: [];
    $up = $pdo->prepare('UPDATE livros SET categoria_id = ? WHERE id = ? AND categoria_id = ?');
    $n = 0;
    foreach ($anterior as $id => $catAntes) {
        $up->execute([$catAntes ?: null, (int) $id, $idInfantil]);
        $n += $up->rowCount();
    }
    @unlink($estadoArq);
    exit("Desfeito: $n livros voltaram à categoria anterior.\n");
}

$aplicar = isset($opcoes['aplicar']);
$stmt = $pdo->prepare('SELECT l.id, l.titulo, l.autor, l.nome_arquivo, l.formato, l.categoria_id, c.nome AS cat FROM livros l LEFT JOIN categorias c ON c.id = l.categoria_id WHERE l.categoria_id IS NULL OR l.categoria_id <> ? ORDER BY l.id');
$stmt->execute([$idInfantil]);

$achados = [];
$total = 0;
foreach ($stmt as $l) {
    $total++;
    $sinais = [];
    if (($l['formato'] ?? 'pdf') === 'epub') {
        $arquivo = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
        if (is_file($arquivo)) {
            $sinais = infantilSinaisDoEpub($arquivo);
        }
    }
    $motivo = livroEhInfantil((string) $l['titulo'], (string) ($l['autor'] ?? ''), $sinais);
    if ($motivo !== null) {
        $achados[] = $l + ['motivo' => $motivo];
    }
}

printf("%d livros avaliados; %d seriam movidos para Infantojuvenil.\n\n", $total, count($achados));
foreach ($achados as $l) {
    printf("#%-5d %-4s %-55s | %-22s | de %-18s | %s\n", $l['id'], $l['formato'], mb_substr((string) $l['titulo'], 0, 55), mb_substr((string) ($l['autor'] ?? ''), 0, 22), mb_substr((string) ($l['cat'] ?? 'sem categoria'), 0, 18), $l['motivo']);
}

if (!$aplicar) {
    exit("\nSimulação: nada foi gravado. Use --aplicar para gravar.\n");
}
if (!is_dir($estadoDir)) {
    mkdir($estadoDir, 0775, true);
}
$guardado = is_file($estadoArq) ? (json_decode((string) file_get_contents($estadoArq), true) ?: []) : [];
$up = $pdo->prepare('UPDATE livros SET categoria_id = ? WHERE id = ?');
foreach ($achados as $l) {
    $guardado[$l['id']] = $l['categoria_id'];
    $up->execute([$idInfantil, $l['id']]);
}
file_put_contents($estadoArq, json_encode($guardado));
echo "\nGravado: " . count($achados) . " livros em Infantojuvenil. Para voltar: php database/categorizar_infantil.php --desfazer\n";
