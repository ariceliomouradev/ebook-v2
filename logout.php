<?php
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

// Só POST com token CSRF encerra a sessão. Um GET (link, <img> em outro site, pré-carregamento) volta para o início
// sem deslogar ninguém. Token vencido/ausente (sessão já expirada): vai para o login.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    redirecionar(isset($_SESSION['usuario_id']) ? 'index.php' : 'login.php');
}
$tokenEnviado = $_POST['csrf_token'] ?? '';
if (empty($_SESSION['csrf_token']) || !is_string($tokenEnviado) || !hash_equals($_SESSION['csrf_token'], $tokenEnviado)) {
    redirecionar(isset($_SESSION['usuario_id']) ? 'index.php' : 'login.php');
}

encerrarAcesso($pdo);
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
}

session_destroy();

redirecionar('login.php');
