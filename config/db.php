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
} catch (PDOException $e) {
    error_log('Erro de conexão com o banco: ' . $e->getMessage());
    http_response_code(500);
    die('Erro interno. Tente novamente mais tarde.');
}
