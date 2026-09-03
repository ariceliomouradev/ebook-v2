<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin']);
require_post();
csrf_verify();

$id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);

if (!$id) {
    redirecionar('usuarios.php?msg=erro_invalid_data');
}

if ($id === (int) $_SESSION['usuario_id']) {
    redirecionar('usuarios.php?msg=erro_self_delete');
}

try {
    $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);
    redirecionar('usuarios.php?msg=user_deleted');
} catch (PDOException $e) {
    error_log('Falha ao excluir usuário: ' . $e->getMessage());
    redirecionar('usuarios.php?msg=erro_invalid_data');
}
