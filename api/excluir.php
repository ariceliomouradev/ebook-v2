<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    responderJson(['success' => false, 'error' => 'Livro inválido.'], 422);
}

$stmt = $pdo->prepare("SELECT nome_arquivo, capa_arquivo FROM livros WHERE id = ?");
$stmt->execute([$id]);
$livro = $stmt->fetch();

if (!$livro) {
    responderJson(['success' => false, 'error' => 'Livro não encontrado.'], 404);
}

$caminhoPDF = '../uploads/' . $livro['nome_arquivo'];
if (file_exists($caminhoPDF)) {
    unlink($caminhoPDF);
}

if (!empty($livro['capa_arquivo'])) {
    $caminhoCapa = '../capas/' . $livro['capa_arquivo'];
    if (file_exists($caminhoCapa)) {
        unlink($caminhoCapa);
    }
}

$pdo->prepare("DELETE FROM livros WHERE id = ?")->execute([$id]);

responderJson(['success' => true, 'id' => $id]);
