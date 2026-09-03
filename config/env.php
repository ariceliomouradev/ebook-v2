<?php
// Carrega variáveis do arquivo .env para o ambiente PHP (sem depender de composer).
function carregarEnv(string $caminho): void
{
    if (!file_exists($caminho)) {
        return;
    }

    foreach (file($caminho, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linha) {
        $linha = trim($linha);
        if ($linha === '' || str_starts_with($linha, '#') || !str_contains($linha, '=')) {
            continue;
        }

        [$chave, $valor] = explode('=', $linha, 2);
        $chave = trim($chave);
        $valor = trim($valor);

        if (!array_key_exists($chave, $_ENV)) {
            $_ENV[$chave] = $valor;
            putenv("$chave=$valor");
        }
    }
}

carregarEnv(__DIR__ . '/../.env');

function env(string $chave, $padrao = null)
{
    return $_ENV[$chave] ?? $padrao;
}
