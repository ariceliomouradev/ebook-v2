<?php
/**
 * Cadastro público: nome, e-mail, WhatsApp e senha. Cria uma conta Grátis e já entra.
 * Falhas voltam para cadastro?erro=... (a tela explica). Campo "site" é isca para robôs.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/cadastro.php';

require_post();
csrf_verify();

if (!cadastroAberto()) {
    redirecionar('cadastro.php?erro=fechado');
}
if (isset($_SESSION['usuario_id'])) {
    redirecionar('index.php');
}
if (trim((string) ($_POST['site'] ?? '')) !== '') {
    redirecionar('login.php'); // isca preenchida: robô; não diz nada
}

$ip = ipCliente();
if (cadastroBloqueado($pdo, $ip)) {
    redirecionar('cadastro.php?erro=muitos');
}

$nome = mb_substr(trim((string) ($_POST['nome'] ?? '')), 0, 100);
$email = strtolower(trim((string) ($_POST['email'] ?? '')));
$senha = (string) ($_POST['senha'] ?? '');
$whatsapp = normalizarWhatsapp((string) ($_POST['whatsapp'] ?? ''));

if ($nome === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 100) {
    redirecionar('cadastro.php?erro=dados');
}
if ($whatsapp === null) {
    redirecionar('cadastro.php?erro=whatsapp');
}
if (!validarSenhaForte($senha)) {
    redirecionar('cadastro.php?erro=senha');
}
if ($senha !== (string) ($_POST['senha_confirmar'] ?? '')) {
    redirecionar('cadastro.php?erro=confirmar');
}

registrarCadastro($pdo, $ip);

// --- Modo "confirmar e-mail": resposta idêntica para e-mail novo, pendente ou já cadastrado ---
if (cadastroConfirmarEmail()) {
    require_once '../includes/email.php';
    $hashSenha = password_hash($senha, PASSWORD_DEFAULT); // o mesmo custo nos três caminhos (tempo igual)
    $token = bin2hex(random_bytes(32));
    $acao = null;
    try {
        $pdo->exec("DELETE FROM usuarios WHERE email_confirmado = 0 AND criado_em < (NOW() - INTERVAL 3 DAY)"); // contas nunca confirmadas
        $busca = $pdo->prepare('SELECT id, email_confirmado FROM usuarios WHERE email = ?');
        $busca->execute([$email]);
        $existente = $busca->fetch();
        if (!$existente) {
            $pdo->prepare("INSERT INTO usuarios (nome, email, whatsapp, senha, perfil, acesso_ate, acesso_origem, email_confirmado, confirmacao_token, confirmacao_expira) VALUES (?, ?, ?, ?, 'leitor', DATE_ADD(NOW(), INTERVAL " . (int) TESTE_DIAS . " DAY), 'teste', 0, ?, DATE_ADD(NOW(), INTERVAL " . (int) CONFIRMACAO_EMAIL_HORAS . " HOUR))")
                ->execute([$nome, $email, $whatsapp, $hashSenha, hash('sha256', $token)]);
            $acao = 'confirmar';
        } elseif ((string) $existente['email_confirmado'] === '0') {
            // ainda não confirmada: vale o último envio (nome, senha e link novos; o link antigo deixa de valer)
            $pdo->prepare('UPDATE usuarios SET nome = ?, whatsapp = ?, senha = ?, confirmacao_token = ?, confirmacao_expira = DATE_ADD(NOW(), INTERVAL ' . (int) CONFIRMACAO_EMAIL_HORAS . ' HOUR) WHERE id = ?')
                ->execute([$nome, $whatsapp, $hashSenha, hash('sha256', $token), (int) $existente['id']]);
            $acao = 'confirmar';
        } else {
            $acao = 'aviso'; // já tem conta: avisa o dono do e-mail, sem dizer nada na tela
        }
    } catch (PDOException $e) {
        error_log('Falha no cadastro (confirmação de e-mail): ' . $e->getMessage());
        redirecionar('cadastro.php?erro=dados');
    }
    $urlBase = urlBaseDoSistema();
    if ($urlBase === null) {
        error_log('[CADASTRO] APP_URL não configurado no .env: e-mail NÃO enviado.');
    } elseif ($acao === 'confirmar') {
        $link = $urlBase . '/confirmar_email?token=' . $token;
        $enviado = enviarEmailDoSistema($email, 'Confirme seu e-mail - Meus Livros',
            "Olá, {$nome}.\n\nPara ativar a sua conta, confirme o seu e-mail neste link (vale por " . (int) CONFIRMACAO_EMAIL_HORAS . " horas):\n\n{$link}\n\nSe não foi você, ignore esta mensagem.");
        if (!$enviado) {
            error_log('[CADASTRO][DEV] Link de confirmação para ' . $email . ': ' . $link);
        }
    } else {
        enviarEmailDoSistema($email, 'Tentativa de cadastro - Meus Livros',
            "Alguém tentou criar uma conta com este e-mail no Meus Livros, mas ele já tem cadastro.\n\nSe foi você, entre com a sua senha ou use \"Esqueceu sua senha?\" em {$urlBase}/login\n\nSe não foi você, ignore esta mensagem: nada mudou na sua conta.");
    }
    redirecionar('cadastro.php?ok=confirme');
}

try {
    $pdo->prepare("INSERT INTO usuarios (nome, email, whatsapp, senha, perfil, acesso_ate, acesso_origem) VALUES (?, ?, ?, ?, 'leitor', DATE_ADD(NOW(), INTERVAL " . (int) TESTE_DIAS . " DAY), 'teste')")
        ->execute([$nome, $email, $whatsapp, password_hash($senha, PASSWORD_DEFAULT)]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') {
        redirecionar('cadastro.php?erro=email_em_uso');
    }
    error_log('Falha no cadastro: ' . $e->getMessage());
    redirecionar('cadastro.php?erro=dados');
}

abrirSessaoDoUsuario($pdo, ['id' => (int) $pdo->lastInsertId(), 'nome' => $nome, 'perfil' => 'leitor', 'titular_id' => null]);
redirecionar('index.php?msg=bem_vindo');
