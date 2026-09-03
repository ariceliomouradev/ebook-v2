<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_login(true);
require_post(true);

$csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], (string) $csrfHeader)) {
    responderJson(['success' => false, 'error' => 'Token de segurança inválido.'], 400);
}

$livroId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$livroId) {
    responderJson(['success' => false, 'error' => 'Livro inválido.'], 422);
}

$dados = json_decode(file_get_contents('php://input'), true);
$pagina = filter_var($dados['pagina'] ?? null, FILTER_VALIDATE_INT);
$total = filter_var($dados['total'] ?? null, FILTER_VALIDATE_INT);

if (!$pagina || !$total || $pagina < 1 || $total < 1 || $pagina > $total) {
    responderJson(['success' => false, 'error' => 'Dados de progresso inválidos.'], 422);
}

$porcentagem = (int) round(($pagina / $total) * 100);

$stmt = $pdo->prepare(
    "INSERT INTO leituras (usuario_id, livro_id, progresso, total_paginas, porcentagem)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE progresso = VALUES(progresso), total_paginas = VALUES(total_paginas), porcentagem = VALUES(porcentagem)"
);
$stmt->execute([$_SESSION['usuario_id'], $livroId, $pagina, $total, $porcentagem]);

responderJson(['success' => true]);
