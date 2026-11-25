<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_login();
require_post();
csrf_verify();

$usuario_id = $_SESSION['usuario_id'];
$senhaAtual = $_POST['senha_atual'] ?? '';
$novaSenha = $_POST['nova_senha'] ?? '';
$confirmaSenha = $_POST['confirma_senha'] ?? '';

if ($novaSenha !== $confirmaSenha) {
    redirecionar('index.php?msg=erro_pwd_mismatch');
}

if (!validarSenhaForte($novaSenha)) {
    redirecionar('index.php?msg=erro_pwd_weak');
}

$stmt = $pdo->prepare("SELECT senha FROM usuarios WHERE id = ?");
$stmt->execute([$usuario_id]);
$user = $stmt->fetch();

if ($user && password_verify($senhaAtual, $user['senha'])) {
    $hashNovo = password_hash($novaSenha, PASSWORD_DEFAULT);
    $pdo->prepare("UPDATE usuarios SET senha = ? WHERE id = ?")->execute([$hashNovo, $usuario_id]);

    // Renova o ID de sessão após troca de senha (evita reaproveitamento em caso de sessão comprometida).
    renovarIdDaSessao($pdo);
    // as outras sessões abertas desta conta (outro aparelho, sessão roubada) deixam de valer
    encerrarOutrosAcessos($pdo, (int) $usuario_id, session_id());

    redirecionar('index.php?msg=pwd_changed');
} else {
    redirecionar('index.php?msg=erro_pwd_wrong');
}
