<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_post();
csrf_verify();

$email = trim($_POST['email'] ?? '');
$senha = $_POST['senha'] ?? '';
$ip = ipCliente();

if (empty($email) || empty($senha)) {
    redirecionar('login.php?erro=1');
}

if (loginBloqueado($pdo, $email, $ip)) {
    redirecionar('login.php?erro=bloqueado');
}

$stmt = $pdo->prepare("SELECT id, nome, senha, perfil, titular_id FROM usuarios WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$usuario = $stmt->fetch();

if ($usuario && password_verify($senha, $usuario['senha'])) {
    registrarTentativaLogin($pdo, $email, $ip, true);

    if (contaBloqueada($pdo, (int) $usuario['id'])) {
        redirecionar('login.php?erro=conta_bloqueada');
    }

    abrirSessaoDoUsuario($pdo, $usuario);

    redirecionar('index.php');
} else {
    registrarTentativaLogin($pdo, $email, $ip, false);
    redirecionar('login.php?erro=1');
}
