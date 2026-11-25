<?php
/**
 * Foto de perfil do próprio usuário (qualquer plano, inclusive dependente).
 *   action=enviar  foto (arquivo JPG/JPEG/PNG) -> grava a nova e apaga a anterior
 *   action=remover                              -> volta para a inicial do nome
 * Resposta: {success, url, mensagem} (url vazia = sem foto).
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/avatar.php';

require_login(true);
require_post(true);
csrf_verify(true);

$usuarioId = (int) $_SESSION['usuario_id'];
$acao = $_POST['action'] ?? '';

try {
    $stmt = $pdo->prepare('SELECT foto FROM usuarios WHERE id = ?');
    $stmt->execute([$usuarioId]);
    $fotoAtual = $stmt->fetchColumn() ?: null;
} catch (PDOException $e) {
    responderJson(['success' => false, 'error' => 'Foto de perfil indisponível: falta atualizar o banco (migração v1.18).'], 503);
}

if ($acao === 'remover') {
    $pdo->prepare('UPDATE usuarios SET foto = NULL WHERE id = ?')->execute([$usuarioId]);
    apagarArquivoDeFoto($fotoAtual);
    responderJson(['success' => true, 'url' => '', 'mensagem' => 'Foto removida.']);
}

if ($acao !== 'enviar') {
    responderJson(['success' => false, 'error' => 'Ação inválida.'], 400);
}
$erroUpload = $_FILES['foto']['error'] ?? UPLOAD_ERR_NO_FILE;
if ($erroUpload !== UPLOAD_ERR_OK) {
    $grande = in_array($erroUpload, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
    responderJson(['success' => false, 'error' => $grande ? 'A foto é grande demais (máximo ' . (int) (FOTO_PERFIL_MAX_BYTES / 1048576) . ' MB).' : 'Escolha uma foto para enviar.'], 422);
}

$r = salvarFotoPerfil($_FILES['foto']['tmp_name'], (int) $_FILES['foto']['size']);
if (!$r['ok']) {
    responderJson(['success' => false, 'error' => $r['erro']], 422);
}

$pdo->prepare('UPDATE usuarios SET foto = ? WHERE id = ?')->execute([$r['arquivo'], $usuarioId]);
apagarArquivoDeFoto($fotoAtual);
responderJson(['success' => true, 'url' => urlDaFoto($r['arquivo'], ''), 'mensagem' => 'Foto atualizada.']);
