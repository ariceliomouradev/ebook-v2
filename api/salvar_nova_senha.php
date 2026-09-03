<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_post();
csrf_verify();

$token = $_POST['token'] ?? '';
$novaSenha = $_POST['nova_senha'] ?? '';
$confirmaSenha = $_POST['confirma_senha'] ?? '';

if ($token === '') {
    redirecionar('login.php');
}

if ($novaSenha !== $confirmaSenha) {
    redirecionar('redefinir_senha.php?token=' . urlencode($token) . '&msg=erro_pwd_mismatch');
}

if (!validarSenhaForte($novaSenha)) {
    redirecionar('redefinir_senha.php?token=' . urlencode($token) . '&msg=erro_pwd_weak');
}

$stmt = $pdo->prepare("SELECT id FROM usuarios WHERE reset_token = ? AND reset_expires > NOW()");
$stmt->execute([$token]);
$user = $stmt->fetch();

if ($user) {
    $hashNovo = password_hash($novaSenha, PASSWORD_DEFAULT);
    $pdo->prepare("UPDATE usuarios SET senha = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?")
        ->execute([$hashNovo, $user['id']]);

    redirecionar('login.php?msg=pwd_recovered');
}

redirecionar('login.php?erro=token_invalido');
