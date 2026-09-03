<?php
// Ponto único de inicialização: sessão segura, headers de segurança, conexão e helpers.
// Toda página/endpoint deve incluir este arquivo em vez de repetir session_start()/include db.php.

if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

require_once __DIR__ . '/app.php';

$appDebug = filter_var(env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN);
ini_set('display_errors', $appDebug ? '1' : '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// Timeout de inatividade: derruba a sessão após SESSAO_INATIVIDADE_MAX_SEGUNDOS sem requisições.
if (isset($_SESSION['usuario_id'])) {
    if (isset($_SESSION['ultimo_acesso']) && (time() - $_SESSION['ultimo_acesso']) > SESSAO_INATIVIDADE_MAX_SEGUNDOS) {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        session_start();
    }
    $_SESSION['ultimo_acesso'] = time();
}

// Headers de segurança (aplicados a toda página e endpoint).
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header(
    "Content-Security-Policy: default-src 'self'; " .
    "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " .
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " .
    "font-src 'self' https://cdnjs.cloudflare.com data:; " .
    "img-src 'self' data: blob:; " .
    // PDF.js carrega o worker de um CDN de origem diferente da página: internamente ele faz
    // fetch() do script e o reempacota como Blob antes de instanciar o Worker — essa busca é
    // regida por connect-src (não por worker-src), então o CDN precisa estar aqui também.
    "connect-src 'self' https://cdnjs.cloudflare.com; " .
    "worker-src 'self' blob: https://cdnjs.cloudflare.com; " .
    "frame-ancestors 'none'; " .
    "base-uri 'self'"
);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/../includes/functions.php';
