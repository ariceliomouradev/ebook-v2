<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin']);
require_post();
csrf_verify();

$id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
$novaSenha = $_POST['nova_senha'] ?? '';

if (!$id || empty($novaSenha)) {
    redirecionar('usuarios.php?msg=erro_invalid_data');
}

if (!validarSenhaForte($novaSenha)) {
    redirecionar('usuarios.php?msg=erro_pwd_weak');
}

try {
    $hashNovo = password_hash($novaSenha, PASSWORD_DEFAULT);
    $pdo->prepare("UPDATE usuarios SET senha = ? WHERE id = ?")->execute([$hashNovo, $id]);

    redirecionar('usuarios.php?msg=pwd_reset');
} catch (PDOException $e) {
    error_log('Falha ao redefinir senha: ' . $e->getMessage());
    redirecionar('usuarios.php?msg=erro_invalid_data');
}
