<?php
/**
 * Preenche a data de publicação dos EPUBs já cadastrados com a data que vem dentro do próprio arquivo (dc:date).
 * Só toca em livros sem data; nunca sobrescreve uma data escrita pelo administrador.
 *
 *   php database/preencher_data_publicacao.php            simulação (conta, distribuição por década e exemplos)
 *   php database/preencher_data_publicacao.php --aplicar  grava
 *
 * PDF não traz a data de publicação de forma confiável (o PDF só guarda quando o ARQUIVO foi criado): a data dele é
 * informada em Gerenciar livros > Editar. Livros sem data ficam no fim de "Mais recentes" e "Mais antigos".
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
define('CAMINHO_RAIZ', __DIR__ . '/../');
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/epub.php';

$aplicar = in_array('--aplicar', $argv, true);
$stmt = $pdo->query("SELECT id, titulo, nome_arquivo FROM livros WHERE formato = 'epub' AND data_publicacao IS NULL ORDER BY id");
$up = $pdo->prepare('UPDATE livros SET data_publicacao = ? WHERE id = ? AND data_publicacao IS NULL');
$vistos = $achados = 0;
$decadas = [];
$exemplos = [];
foreach ($stmt as $l) {
    $vistos++;
    $arq = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
    if (!is_file($arq)) {
        continue;
    }
    $data = epubMetadados($arq)['publicado'] ?? null;
    if ($data === null) {
        continue;
    }
    $achados++;
    $decada = substr($data, 0, 3) . '0s';
    $decadas[$decada] = ($decadas[$decada] ?? 0) + 1;
    if (count($exemplos) < 6) {
        $exemplos[] = '#' . $l['id'] . ' ' . mb_substr($l['titulo'], 0, 40) . ' → ' . $data;
    }
    if ($aplicar) {
        $up->execute([$data, (int) $l['id']]);
    }
}
ksort($decadas);
echo "EPUBs sem data: $vistos; com data no arquivo: $achados\n";
foreach ($decadas as $d => $n) {
    echo "  $d: $n\n";
}
foreach ($exemplos as $e) {
    echo "  $e\n";
}
echo $aplicar ? "Gravado.\n" : "Simulação: rode com --aplicar para gravar.\n";
