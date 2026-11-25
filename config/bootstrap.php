<?php
// Ponto único de inicialização: sessão segura, headers de segurança, conexão e helpers.
// Toda página/endpoint deve incluir este arquivo em vez de repetir session_start()/include db.php.

if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

require_once __DIR__ . '/app.php';

// Horário de Brasília no PHP, igual ao da sessão do MySQL (config/db.php): a liberação agendada de
// livros compara a data digitada com o relógio, então os dois lados precisam do mesmo fuso.
date_default_timezone_set('America/Fortaleza');

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
    // blob: também em estilos e mídia: o epub.js troca os <link rel=stylesheet> do livro por blob:, e sem isso
    // os livros com CSS próprio (quase todos os ilustrados) abrem sem formatação, com textos e botões soltos.
    "style-src 'self' 'unsafe-inline' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " .
    "media-src 'self' blob:; " .
    // blob: nas fontes e nos quadros: o leitor de EPUB (epub.js) renderiza cada capítulo num iframe e
    // entrega as fontes/imagens do livro como blob: (sem script: allowScriptedContent=false).
    "font-src 'self' https://cdnjs.cloudflare.com data: blob:; " .
    "frame-src 'self' blob:; " .
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
require_once __DIR__ . '/../includes/perfis.php';
require_once __DIR__ . '/../includes/cadastro.php';
require_once __DIR__ . '/../includes/assinatura.php';

// Limite de acessos simultâneos: se outro login derrubou esta sessão, volta para o login.
if (isset($_SESSION['usuario_id']) && !acessoAindaValido($pdo)) {
    $bloqueada = contaBloqueada($pdo, (int) $_SESSION['usuario_id']); // derrubada por bloqueio do administrador, não por outro login
    $_SESSION = [];
    session_destroy();
    if (isRequisicaoJson()) {
        responderJson(['success' => false, 'error' => $bloqueada ? 'Seu acesso está bloqueado. Fale com o suporte.' : 'Sua conta foi aberta em outro aparelho.'], 401);
    }
    header('Location: ' . url($bloqueada ? 'login.php?erro=conta_bloqueada' : 'login.php?erro=acesso'));
    exit;
}

// Senha temporária (criada ou redefinida pelo administrador): até definir a senha nova, só a tela de definir senha e o logout.
if (isset($_SESSION['usuario_id']) && !empty($_SESSION['trocar_senha'])) {
    $paginaAtual = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if (!in_array($paginaAtual, ['definir_senha.php', 'logout.php'], true)) {
        if (isRequisicaoJson() || str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/api/')) {
            responderJson(['success' => false, 'error' => 'Defina a sua nova senha para continuar.'], 403);
        }
        header('Location: ' . url('definir_senha.php'));
        exit;
    }
}

// Com ASSINATURA_EXIGIDA=true, quem terminou o teste (ou o período pago) só enxerga a tela /assinatura.
if (isset($_SESSION['usuario_id']) && assinaturaExigida() && ($_SESSION['usuario_perfil'] ?? '') !== 'admin') {
    $paginaAtual = basename($_SERVER['SCRIPT_NAME'] ?? '');
    if (!in_array($paginaAtual, ['assinatura.php', 'logout.php'], true) && situacaoAcesso($pdo, (int) $_SESSION['usuario_id'])['vencido']) {
        if (isRequisicaoJson() || str_contains($_SERVER['SCRIPT_NAME'] ?? '', '/api/')) {
            responderJson(['success' => false, 'error' => 'O seu período de teste terminou. Fale com o suporte para continuar.'], 402);
        }
        header('Location: ' . url('assinatura.php'));
        exit;
    }
}
