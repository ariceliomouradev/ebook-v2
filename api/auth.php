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

$stmt = $pdo->prepare("SELECT id, nome, senha, perfil FROM usuarios WHERE email = ? LIMIT 1");
$stmt->execute([$email]);
$usuario = $stmt->fetch();

if ($usuario && password_verify($senha, $usuario['senha'])) {
    registrarTentativaLogin($pdo, $email, $ip, true);

    session_regenerate_id(true);

    $_SESSION['usuario_id'] = $usuario['id'];
    $_SESSION['usuario_nome'] = $usuario['nome'];
    $_SESSION['usuario_perfil'] = $usuario['perfil'];
    $_SESSION['ultimo_acesso'] = time();
    unset($_SESSION['csrf_token']); // renova o token junto com o ID de sessão

    redirecionar('index.php');
} else {
    registrarTentativaLogin($pdo, $email, $ip, false);
    redirecionar('login.php?erro=1');
}
