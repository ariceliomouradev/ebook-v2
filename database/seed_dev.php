<?php
/**
 * Cria os usuários de desenvolvimento (um por perfil) para testes manuais.
 *
 *   php database/seed_dev.php              cria os que ainda não existem
 *   php database/seed_dev.php --redefinir  gera senha nova para todos
 *
 * Os e-mails usam o domínio fictício `meuslivros.local`. As senhas são aleatórias
 * (passam na política do sistema) e vão para `database/.dev-credenciais.txt`, que
 * está no .gitignore e dentro de uma pasta que o Apache nega — o script nunca as
 * imprime na tela nem as repete no terminal.
 *
 * Por segurança, recusa rodar com APP_ENV=production: este utilitário existe só
 * para máquinas de desenvolvimento.
 *
 * A suíte Cypress não depende destes usuários (ela cria e remove os seus próprios,
 * terminados em @e2e.test).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Este script só roda pela linha de comando.');
}

require_once __DIR__ . '/../config/env.php';

if (strtolower((string) env('APP_ENV', 'local')) === 'production') {
    fwrite(STDERR, "Recusado: APP_ENV=production. Este seed é só para desenvolvimento.\n");
    exit(1);
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../includes/functions.php';

const DOMINIO_DEV = 'meuslivros.local';
$arquivoCredenciais = __DIR__ . '/.dev-credenciais.txt';
$redefinir = in_array('--redefinir', $argv, true);

$perfis = [
    'admin'        => 'Admin Dev',
    'contribuidor' => 'Contribuidor Dev',
    'leitor'       => 'Leitor Dev',
];

/** Senha aleatória de 16 caracteres que sempre atende à política (RN-06). */
function gerarSenha(): string
{
    $grupos = [
        'abcdefghijkmnpqrstuvwxyz',  // sem l/o: evitam confusão ao digitar
        'ABCDEFGHJKLMNPQRSTUVWXYZ',  // sem I/O
        '23456789',                  // sem 0/1
        '!@#$%&*?',
    ];
    $todos = implode('', $grupos);
    do {
        $senha = '';
        foreach ($grupos as $g) {
            $senha .= $g[random_int(0, strlen($g) - 1)];
        }
        while (strlen($senha) < 16) {
            $senha .= $todos[random_int(0, strlen($todos) - 1)];
        }
        $senha = str_shuffle($senha);
    } while (!validarSenhaForte($senha));
    return $senha;
}

$linhasArquivo = [];
$criados = 0;

foreach ($perfis as $perfil => $nome) {
    $email = "$perfil@" . DOMINIO_DEV;

    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
    $stmt->execute([$email]);
    $existente = $stmt->fetchColumn();

    if ($existente && !$redefinir) {
        $linhasArquivo[] = sprintf("%-14s %-32s (já existia: senha mantida, veja o arquivo anterior)", $perfil, $email);
        echo "= $perfil: $email já existe, mantido.\n";
        continue;
    }

    $senha = gerarSenha();
    $hash = password_hash($senha, PASSWORD_DEFAULT);

    if ($existente) {
        $pdo->prepare('UPDATE usuarios SET senha = ?, nome = ?, perfil = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')
            ->execute([$hash, $nome, $perfil, $existente]);
        echo "~ $perfil: senha redefinida ($email)\n";
    } else {
        $pdo->prepare('INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)')
            ->execute([$nome, $email, $hash, $perfil]);
        echo "+ $perfil: criado ($email)\n";
    }
    $criados++;
    $linhasArquivo[] = sprintf("%-14s %-32s %s", $perfil, $email, $senha);
}

// Preserva o conteúdo anterior se nada novo foi gerado (evita apagar senhas válidas).
if ($criados > 0 || !file_exists($arquivoCredenciais)) {
    $conteudo = "LOGINS DE DESENVOLVIMENTO — gerado por database/seed_dev.php em " . date('d/m/Y H:i') . "\n"
        . "Local, fora do git e bloqueado no Apache. Não reutilize estas senhas em produção.\n\n"
        . sprintf("%-14s %-32s %s\n", 'PERFIL', 'E-MAIL', 'SENHA')
        . implode("\n", $linhasArquivo) . "\n";
    file_put_contents($arquivoCredenciais, $conteudo);
    echo "\nCredenciais gravadas em database/.dev-credenciais.txt\n";
} else {
    echo "\nNada novo foi criado; database/.dev-credenciais.txt foi mantido.\n";
}
