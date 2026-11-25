<?php
/**
 * Preenche a sinopse dos EPUBs já cadastrados com a descrição que vem dentro do próprio arquivo (dc:description).
 * Só toca em livros com sinopse vazia; nunca sobrescreve texto escrito pelo administrador.
 *
 *   php database/preencher_sinopse.php            simulação (conta e mostra exemplos)
 *   php database/preencher_sinopse.php --aplicar  grava
 *
 * PDF não tem descrição confiável: a sinopse dele é escrita em Gerenciar livros > Editar.
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
define('CAMINHO_RAIZ', __DIR__ . '/../');
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/epub.php';

$aplicar = in_array('--aplicar', $argv, true);
$stmt = $pdo->query("SELECT id, titulo, nome_arquivo FROM livros WHERE formato = 'epub' AND (sinopse IS NULL OR sinopse = '') ORDER BY id");
$up = $pdo->prepare('UPDATE livros SET sinopse = ? WHERE id = ? AND (sinopse IS NULL OR sinopse = \'\')');
$vistos = $achados = 0;
$exemplos = [];
foreach ($stmt as $l) {
    $vistos++;
    $arq = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
    if (!is_file($arq)) {
        continue;
    }
    $sinopse = epubMetadados($arq)['sinopse'] ?? '';
    if ($sinopse === '') {
        continue;
    }
    $achados++;
    if (count($exemplos) < 5) {
        $exemplos[] = '#' . $l['id'] . ' ' . mb_substr($l['titulo'], 0, 40) . ' → ' . mb_substr(str_replace("\n", ' ', $sinopse), 0, 80) . '…';
    }
    if ($aplicar) {
        $up->execute([$sinopse, (int) $l['id']]);
    }
}
echo "EPUBs sem sinopse: $vistos; com descrição no arquivo: $achados\n";
foreach ($exemplos as $e) {
    echo "  $e\n";
}
echo $aplicar ? "Gravado.\n" : "Simulação: use --aplicar para gravar.\n";
