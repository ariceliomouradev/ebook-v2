<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_post();
csrf_verify();

$email = trim($_POST['email_recuperacao'] ?? '');

if (empty($email)) {
    redirecionar('login.php');
}

$stmt = $pdo->prepare("SELECT id, nome FROM usuarios WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

// Por segurança, a resposta ao usuário é sempre a mesma, exista ou não o e-mail —
// do contrário o endpoint permite descobrir quais contas estão cadastradas.
if ($user) {
    $token = bin2hex(random_bytes(32));
    $expiraEm = date('Y-m-d H:i:s', strtotime('+' . RESET_TOKEN_VALIDADE_HORAS . ' hour'));

    $pdo->prepare("UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?")
        ->execute([$token, $expiraEm, $user['id']]);

    $urlBase = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . "://{$_SERVER['HTTP_HOST']}" . dirname($_SERVER['PHP_SELF'], 2);
    $linkRecuperacao = $urlBase . '/redefinir_senha.php?token=' . $token;

    $assunto = 'Redefinição de Senha - Meus Livros';
    $mensagem = "Olá, {$user['nome']}.\n\n"
        . "Você solicitou a redefinição da sua senha. Clique no link abaixo para criar uma nova (válido por " . RESET_TOKEN_VALIDADE_HORAS . " hora):\n\n"
        . "$linkRecuperacao\n\n"
        . "Se você não solicitou isso, ignore este e-mail.";
    $headers = "From: nao-responda@biblioteca.com\r\n";

    $enviado = @mail($email, $assunto, $mensagem, $headers);

    if (!$enviado) {
        // Ambiente local sem SMTP: registra o link em log (fora do webroot), nunca na tela.
        error_log('[RESET-SENHA][DEV] Link de redefinição para ' . $email . ': ' . $linkRecuperacao);
    }
}

redirecionar('login.php?msg=reset_link_sent');
