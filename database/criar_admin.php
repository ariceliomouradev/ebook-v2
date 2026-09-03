<?php
/**
 * Gera o SQL de criação do primeiro usuário administrador.
 *
 * O sistema não tem tela de cadastro público: o primeiro acesso precisa ser
 * inserido direto no banco. Este utilitário aplica o hash bcrypt na senha e
 * imprime o INSERT pronto para colar no phpMyAdmin.
 *
 * Uso (na pasta do projeto):
 *
 *   php database/criar_admin.php
 *       Pergunta nome, e-mail, senha e perfil.
 *
 *   php database/criar_admin.php "Seu Nome" "voce@exemplo.com" "SuaSenha@123"
 *       Mesma coisa, sem perguntar. Cuidado: a senha fica no histórico do shell.
 *
 *   php database/criar_admin.php ... --inserir
 *       Além de imprimir, grava direto no banco configurado no .env.
 *
 * A senha nunca é gravada em lugar nenhum: só o hash bcrypt sai daqui.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Este script só roda pela linha de comando.');
}

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../includes/functions.php';

/** Lê um valor do teclado, com valor padrão opcional. */
function perguntar(string $rotulo, string $padrao = ''): string
{
    $sufixo = $padrao !== '' ? " [$padrao]" : '';
    echo $rotulo . $sufixo . ': ';
    $resposta = trim((string) fgets(STDIN));
    return $resposta !== '' ? $resposta : $padrao;
}

/** Escapa aspas simples para interpolação segura no SQL impresso. */
function sqlLiteral(string $valor): string
{
    return "'" . str_replace("'", "''", $valor) . "'";
}

$argumentos = array_values(array_filter(array_slice($argv, 1), fn($a) => $a !== '--inserir'));
$deveInserir = in_array('--inserir', $argv, true);

$nome  = $argumentos[0] ?? perguntar('Nome completo');
$email = $argumentos[1] ?? perguntar('E-mail');
$senha = $argumentos[2] ?? perguntar('Senha');
$perfil = $argumentos[3] ?? perguntar('Perfil (admin, contribuidor, leitor)', 'admin');

$erros = [];
if ($nome === '') {
    $erros[] = 'O nome não pode ficar vazio.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $erros[] = 'E-mail inválido.';
}
if (!in_array($perfil, ['admin', 'contribuidor', 'leitor'], true)) {
    $erros[] = 'Perfil precisa ser admin, contribuidor ou leitor.';
}
// Mesma política aplicada em todas as telas de senha do sistema (RN-06).
if (!validarSenhaForte($senha)) {
    $erros[] = 'Senha fraca: use no mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.';
}

if ($erros) {
    echo "\n";
    foreach ($erros as $erro) {
        echo "  ERRO: $erro\n";
    }
    echo "\nNada foi gerado.\n";
    exit(1);
}

$hash = password_hash($senha, PASSWORD_DEFAULT);

echo "\n";
echo "-- Cole no phpMyAdmin (aba SQL), com o banco da aplicação selecionado:\n\n";
echo "INSERT INTO usuarios (nome, email, senha, perfil)\n";
echo 'VALUES (' . sqlLiteral($nome) . ', ' . sqlLiteral($email) . ", '$hash', " . sqlLiteral($perfil) . ");\n\n";

if (!$deveInserir) {
    echo "Depois de inserir, entre em " . (env('APP_URL', '') ?: 'sua instalação') . "login.php\n";
    exit(0);
}

require_once __DIR__ . '/../config/db.php';

try {
    $stmt = $pdo->prepare('INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)');
    $stmt->execute([$nome, $email, $hash, $perfil]);
    echo "Usuário criado no banco " . env('DB_NAME', '') . " (id " . $pdo->lastInsertId() . ").\n";
} catch (PDOException $e) {
    $duplicado = str_contains($e->getMessage(), 'Duplicate entry');
    echo $duplicado
        ? "Já existe um usuário com esse e-mail. Use o SQL acima trocando INSERT por UPDATE se quiser redefinir a senha dele.\n"
        : 'Falha ao inserir: ' . $e->getMessage() . "\n";
    exit(1);
}
