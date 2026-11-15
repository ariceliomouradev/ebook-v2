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
    if (preg_match('/^[+-]d{2}:d{2}$/', $fuso)) {
        $pdo->exec("SET time_zone = '$fuso'");
    }
} catch (PDOException $e) {
    error_log('Erro de conexão com o banco: ' . $e->getMessage());
    http_response_code(500);
    die('Erro interno. Tente novamente mais tarde.');
}
