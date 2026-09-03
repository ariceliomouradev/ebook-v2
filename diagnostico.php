<?php
/**
 * DIAGNÓSTICO TEMPORÁRIO — apague este arquivo assim que terminar.
 * Acesse com: https://seu-dominio/diagnostico.php?t=8f79b8f21329
 */
if (($_GET['t'] ?? '') !== '8f79b8f21329') {
    http_response_code(404);
    exit('Not found');
}

header('Content-Type: text/plain; charset=utf-8');

$raiz = __DIR__;
echo "PHP ", PHP_VERSION, "\n";
echo "Pasta do projeto: $raiz\n\n";

echo "--- ARQUIVO .env ---\n";
$caminhoEnv = $raiz . '/.env';
echo "existe .env?  ", file_exists($caminhoEnv) ? 'SIM' : 'NAO', "\n";
if (file_exists($caminhoEnv)) {
    echo "legivel?      ", is_readable($caminhoEnv) ? 'SIM' : 'NAO', "\n";
    echo "tamanho:      ", filesize($caminhoEnv), " bytes\n";
}
$parecidos = array_values(array_filter(scandir($raiz), fn($f) => stripos($f, 'env') !== false));
echo "arquivos com 'env' no nome: ", $parecidos ? implode(', ', $parecidos) : '(nenhum)', "\n";

echo "\n--- VALORES LIDOS (entre colchetes, para revelar espaco ou aspas) ---\n";
require_once $raiz . '/config/env.php';
foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'DB_CHARSET', 'APP_ENV', 'APP_DEBUG', 'APP_URL'] as $chave) {
    $valor = env($chave);
    if ($valor === null) {
        echo str_pad($chave, 12), "= (nao definido -> o codigo usa o padrao)\n";
        continue;
    }
    $exibir = $chave === 'DB_PASS' ? '*** ' . strlen($valor) . ' caracteres' : $valor;
    echo str_pad($chave, 12), "= [$exibir]\n";
}

echo "\n--- EXTENSOES ---\n";
foreach (['pdo_mysql', 'fileinfo', 'mbstring', 'openssl'] as $ext) {
    echo str_pad($ext, 12), extension_loaded($ext) ? 'ok' : 'FALTANDO', "\n";
}

echo "\n--- CONEXAO COM O BANCO ---\n";
$host = env('DB_HOST', 'localhost');
$nome = env('DB_NAME', 'biblioteca_pdf');
try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$nome;charset=" . env('DB_CHARSET', 'utf8mb4'),
        env('DB_USER', 'root'),
        env('DB_PASS', '')
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "CONECTOU COM SUCESSO\n";

    $tabelas = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "tabelas (", count($tabelas), "): ", $tabelas ? implode(', ', $tabelas) : '(nenhuma - falta importar o schema.sql)', "\n";

    if (in_array('usuarios', $tabelas, true)) {
        $total = $pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
        echo "usuarios cadastrados: $total", $total == 0 ? "  <- falta criar o admin" : '', "\n";
    }
} catch (PDOException $e) {
    echo "FALHOU: ", $e->getMessage(), "\n";
}

echo "\n--- PASTAS DE ESCRITA ---\n";
foreach (['uploads', 'capas', 'banners'] as $pasta) {
    $p = "$raiz/$pasta";
    echo str_pad($pasta, 10), is_dir($p) ? (is_writable($p) ? 'ok (gravavel)' : 'EXISTE MAS NAO E GRAVAVEL') : 'NAO EXISTE', "\n";
}

echo "\n--- FUSO HORARIO ---\n";
echo "PHP:   ", date_default_timezone_get(), ' ', date('Y-m-d H:i:s'), "\n";
if (isset($pdo)) {
    echo "MySQL: ", $pdo->query('SELECT NOW()')->fetchColumn(), "\n";
}

echo "\nAPAGUE ESTE ARQUIVO AGORA.\n";
