<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$titulo = trim($_POST['titulo'] ?? '');
$autor = trim($_POST['autor'] ?? '');

if (!$id || $titulo === '' || $autor === '') {
    responderJson(['success' => false, 'error' => 'Dados incompletos. Preencha todos os campos.'], 422);
}

$titulo = mb_substr($titulo, 0, 255);
$autor = mb_substr($autor, 0, 255);

try {
    $stmt = $pdo->prepare("UPDATE livros SET titulo = ?, autor = ? WHERE id = ?");
    $stmt->execute([$titulo, $autor, $id]);

    responderJson([
        'success' => true,
        'id' => $id,
        'titulo' => $titulo,
        'autor' => $autor,
    ]);
} catch (PDOException $e) {
    error_log('Falha ao editar livro: ' . $e->getMessage());
    responderJson(['success' => false, 'error' => 'Erro interno do banco de dados.'], 500);
}
