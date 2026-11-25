<?php
/**
 * Link de confirmação de e-mail do cadastro (CADASTRO_CONFIRMAR_EMAIL=true). O token do link é guardado em hash
 * (sha256); vale CONFIRMACAO_EMAIL_HORAS horas e uma única vez. Confirmado, a pessoa entra com a senha dela
 * (não há login automático por link).
 */
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

$token = (string) ($_GET['token'] ?? '');
if (preg_match('/^[a-f0-9]{64}$/', $token)) {
    try {
        $stmt = $pdo->prepare('UPDATE usuarios SET email_confirmado = 1, confirmacao_token = NULL, confirmacao_expira = NULL WHERE confirmacao_token = ? AND confirmacao_expira > NOW() AND email_confirmado = 0');
        $stmt->execute([hash('sha256', $token)]);
        if ($stmt->rowCount() === 1) {
            redirecionar('login.php?msg=email_confirmado');
        }
    } catch (PDOException $e) {
        error_log('Falha ao confirmar e-mail: ' . $e->getMessage());
    }
}
redirecionar('login.php?erro=confirmacao_invalida');
