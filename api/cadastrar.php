<?php
/**
 * Cadastro público: nome, e-mail, WhatsApp e senha. Cria uma conta de Assinante e já entra.
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
