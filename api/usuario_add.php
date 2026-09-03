<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin']);
require_post();
csrf_verify();

$nome = trim($_POST['nome'] ?? '');
$email = trim($_POST['email'] ?? '');
$senha = $_POST['senha'] ?? '';
$perfil = $_POST['perfil'] ?? 'leitor';

if (!in_array($perfil, ['leitor', 'contribuidor', 'admin'], true)) {
    $perfil = 'leitor';
}

if (empty($nome) || empty($email) || empty($senha)) {
    redirecionar('usuarios.php?msg=erro_invalid_data');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    redirecionar('usuarios.php?msg=erro_invalid_data');
}

if (!validarSenhaForte($senha)) {
    redirecionar('usuarios.php?msg=erro_pwd_weak');
}

$senhaHash = password_hash($senha, PASSWORD_DEFAULT);

try {
    $stmt = $pdo->prepare("INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)");
    $stmt->execute([mb_substr($nome, 0, 100), $email, $senhaHash, $perfil]);

    redirecionar('usuarios.php?msg=user_added');
} catch (PDOException $e) {
    if ($e->getCode() == 23000) {
        redirecionar('usuarios.php?msg=erro_user_exists');
    }
    error_log('Falha ao cadastrar usuário: ' . $e->getMessage());
    redirecionar('usuarios.php?msg=erro_invalid_data');
}
