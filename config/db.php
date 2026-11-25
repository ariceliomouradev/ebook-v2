<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

require_once __DIR__ . '/app.php';

$host   = env('DB_HOST', 'localhost');
$db     = env('DB_NAME', 'biblioteca_pdf');
$user   = env('DB_USER', 'root');
$pass   = env('DB_PASS', '');
$charset = env('DB_CHARSET', 'utf8mb4');

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=$charset", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    // Horário de Brasília na sessão do MySQL (DB_TIMEZONE, padrão -03:00): a data de liberação dos
    // livros (liberar_em) é digitada em horário de Brasília e comparada com NOW() no banco; sem isto
    // a hospedagem (MySQL geralmente em UTC) liberaria o livro com horas de diferença.
    $fuso = (string) env('DB_TIMEZONE', '-03:00');
    if (preg_match('/^[+-]\d{2}:\d{2}$/', $fuso)) { // (antes faltava a barra: "d{2}" casava a letra d e o fuso nunca era aplicado)
        $pdo->exec("SET time_zone = '$fuso'");
    }
} catch (PDOException $e) {
    error_log('Erro de conexão com o banco: ' . $e->getMessage());
    // 503 (indisponível, tente de novo) em vez de 500: o servidor segue de pé, só o banco não atendeu.
    // Páginas mostram um aviso amigável; chamadas AJAX/API recebem JSON.
    http_response_code(503);
    header('Retry-After: 30');
    header('Cache-Control: no-store');
    $ehApi = str_contains((string) ($_SERVER['SCRIPT_NAME'] ?? ''), '/api/')
        || strtolower((string) ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '')) === 'xmlhttprequest'
        || str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
    if ($ehApi) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'O sistema está momentaneamente indisponível. Tente de novo em instantes.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>Já voltamos</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f14;color:#eceff4;font-family:system-ui,sans-serif;text-align:center;padding:24px}'
        . 'main{max-width:420px}h1{font-size:1.5rem;margin:0 0 .6rem}p{color:#a7b0c0;line-height:1.5;margin:0 0 1.2rem}a{display:inline-block;background:#f6b445;color:#1a1204;font-weight:700;padding:.7rem 1.4rem;border-radius:12px;text-decoration:none}</style></head>'
        . '<body><main><h1>Já voltamos</h1><p>O Meus Livros está com uma instabilidade rápida. Seus livros e seu progresso estão seguros. Tente de novo em alguns instantes.</p>'
        . '<a href="">Tentar novamente</a></main></body></html>';
    exit;
}
