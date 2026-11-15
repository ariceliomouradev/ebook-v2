<?php
/**
 * Preenche livros.hash_arquivo (SHA-256) dos livros que ainda não têm, para o sistema barrar
 * duplicados. Rode uma vez depois da migração v1.5 (pode demorar em acervos grandes).
 *
 *   php database/preencher_hash.php           preenche e mostra os grupos de arquivos idênticos
 *   php database/preencher_hash.php --listar  só lista os grupos de arquivos idênticos
 *
 * Não apaga nada: quem decide o que remover é o administrador.
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
require_once __DIR__ . '/../config/bootstrap.php';

$somenteListar = in_array('--listar', $argv, true);
if (!$somenteListar) {
    $upd = $pdo->prepare('UPDATE livros SET hash_arquivo = ? WHERE id = ?');
    $linhas = $pdo->query('SELECT id, nome_arquivo FROM livros WHERE hash_arquivo IS NULL')->fetchAll();
    $feitos = 0;
    foreach ($linhas as $l) {
        $caminho = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
        if (is_file($caminho)) {
            $upd->execute([hash_file('sha256', $caminho), $l['id']]);
            $feitos++;
        }
    }
    echo "Hash calculado para $feitos de " . count($linhas) . " livros.\n";
}

$grupos = $pdo->query(
    'SELECT hash_arquivo, COUNT(*) n, GROUP_CONCAT(id ORDER BY id) ids FROM livros
      WHERE hash_arquivo IS NOT NULL GROUP BY hash_arquivo HAVING n > 1'
)->fetchAll();
echo count($grupos) . " grupo(s) de arquivos idênticos.\n";
foreach ($grupos as $g) {
    echo "  ids {$g['ids']}\n";
}
