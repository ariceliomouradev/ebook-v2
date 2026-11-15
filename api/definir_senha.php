<?php
/**
 * Define a senha definitiva de quem entrou com senha temporária (POST + CSRF, formulário comum).
 * Só funciona enquanto $_SESSION['trocar_senha'] existir; a nova senha tem de ser forte e diferente da atual.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_login();
require_post();
csrf_verify();

if (empty($_SESSION['trocar_senha'])) {
    redirecionar('index.php');
}

$usuarioId = (int) $_SESSION['usuario_id'];
$nova = $_POST['nova_senha'] ?? '';
$confirma = $_POST['confirma_senha'] ?? '';

if ($nova !== $confirma) {
    redirecionar('definir_senha.php?msg=erro_pwd_mismatch');
}
if (!validarSenhaForte($nova)) {
    redirecionar('definir_senha.php?msg=erro_pwd_weak');
}

$stmt = $pdo->prepare('SELECT senha FROM usuarios WHERE id = ?');
$stmt->execute([$usuarioId]);
$atual = $stmt->fetchColumn();
if ($atual === false) {
    redirecionar('logout.php');
}
if (password_verify($nova, (string) $atual)) {
    redirecionar('definir_senha.php?msg=erro_pwd_igual');
}

$pdo->prepare('UPDATE usuarios SET senha = ?, trocar_senha = 0 WHERE id = ?')->execute([password_hash($nova, PASSWORD_DEFAULT), $usuarioId]);
unset($_SESSION['trocar_senha']);
renovarIdDaSessao($pdo);

redirecionar('index.php?msg=pwd_changed');
