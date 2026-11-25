<?php
/**
 * Marca/desmarca um livro como repetido (só administrador). Repetido = escondido de Pro e Grátis;
 * o administrador continua vendo e nada é apagado. Ações (POST + CSRF, JSON):
 *   limpar  id             "não é repetido": volta a aparecer para todos
 *   marcar  id, original   "é repetido do livro `original`"
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$acao = (string) ($_POST['action'] ?? '');
$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    responderJson(['success' => false, 'error' => 'Livro inválido.'], 422);
}

if ($acao === 'limpar') {
    $pdo->prepare('UPDATE livros SET duplicado_de = NULL WHERE id = ?')->execute([$id]);
    responderJson(['success' => true, 'id' => $id]);
}

if ($acao === 'marcar') {
    $original = filter_var($_POST['original'] ?? null, FILTER_VALIDATE_INT);
    $stmt = $pdo->prepare('SELECT id, duplicado_de FROM livros WHERE id = ?');
    $stmt->execute([$original ?: 0]);
    $o = $stmt->fetch();
    if (!$o || (int) $original === $id) {
        responderJson(['success' => false, 'error' => 'Livro original inválido.'], 422);
    }
    // aponta sempre para o original de verdade (sem encadear repetido de repetido)
    $alvo = $o['duplicado_de'] ? (int) $o['duplicado_de'] : (int) $o['id'];
    $pdo->prepare('UPDATE livros SET duplicado_de = ? WHERE id = ?')->execute([$alvo, $id]);
    responderJson(['success' => true, 'id' => $id, 'original' => $alvo]);
}

responderJson(['success' => false, 'error' => 'Ação desconhecida.'], 400);
