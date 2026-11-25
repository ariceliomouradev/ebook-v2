<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_post();
csrf_verify();

$email = trim($_POST['email_recuperacao'] ?? '');

if (empty($email)) {
    redirecionar('login.php');
}

// Limite por IP e por e-mail (evita encher a caixa de alguém e gastar a cota de envio). A resposta é sempre a mesma.
if (resetBloqueado($pdo, ipCliente(), $email)) {
    redirecionar('login.php?msg=reset_link_sent');
}
registrarPedidoReset($pdo, ipCliente(), $email);

$stmt = $pdo->prepare("SELECT id, nome FROM usuarios WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();

// Por segurança, a resposta ao usuário é sempre a mesma, exista ou não o e-mail —
// do contrário o endpoint permite descobrir quais contas estão cadastradas.
if ($user) {
    $token = bin2hex(random_bytes(32));

    // A expiração é calculada pelo relógio do MySQL — o mesmo que depois valida o token
    // (`reset_expires > NOW()` em redefinir_senha.php e api/salvar_nova_senha.php). Calcular
    // com date()/strtotime() do PHP dava validade errada sempre que o fuso do PHP e o do
    // banco divergiam (ex.: date.timezone=Europe/Berlin contra MySQL em UTC-3 = 6h, não 1h).
    // No banco vai só o hash (sha256) do token: quem lê o banco ou um backup não consegue usá-lo no link.
    $pdo->prepare("UPDATE usuarios SET reset_token = ?, reset_expires = DATE_ADD(NOW(), INTERVAL " . (int) RESET_TOKEN_VALIDADE_HORAS . " HOUR) WHERE id = ?")
        ->execute([hash('sha256', $token), $user['id']]);

    // A base do link vem do APP_URL (.env), nunca do cabeçalho Host da requisição.
    $urlBase = urlBaseDoSistema();
    if ($urlBase === null) {
        error_log('[RESET-SENHA] APP_URL não configurado no .env: link de redefinição NÃO enviado.');
        redirecionar('login.php?msg=reset_link_sent');
    }
    $linkRecuperacao = $urlBase . '/redefinir-senha?token=' . $token;

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
