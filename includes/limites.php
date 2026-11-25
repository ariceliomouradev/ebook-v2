<?php
/**
 * Limite diário de livros diferentes abertos por usuário (contra raspagem do acervo).
 *
 * Quem lê não abre dezenas de livros novos por dia; quem varre `api/download.php?id=1,2,3…` abre centenas.
 * Cada abertura (página do leitor ou download) grava (usuário, livro, dia) em `livros_abertos`; reabrir o MESMO
 * livro no mesmo dia não gasta o limite (a leitura em si faz vários downloads de trechos do arquivo).
 * Limites por plano em config/app.php (DOWNLOAD_LIMITE_DIA); 0 = sem limite (administrador).
 * Banco sem a migração v1.19: não limita (não derruba o sistema).
 */

/** @return int limite de livros diferentes por dia para o perfil (0 = ilimitado) */
function limiteDiarioDeLivros(string $perfil): int
{
    return (int) (DOWNLOAD_LIMITE_DIA[$perfil] ?? DOWNLOAD_LIMITE_DIA['leitor']);
}

/**
 * Registra a abertura do livro hoje. Devolve false quando o usuário já abriu o limite de livros DIFERENTES do dia
 * (e este é um livro novo para ele). Livro já aberto hoje passa sempre.
 */
function registrarAberturaDeLivro(PDO $pdo, string $perfil, int $usuarioId, int $livroId): bool
{
    $limite = limiteDiarioDeLivros($perfil);
    if ($limite <= 0) {
        return true;
    }
    try {
        $ja = $pdo->prepare('SELECT 1 FROM livros_abertos WHERE usuario_id = ? AND livro_id = ? AND dia = CURDATE()');
        $ja->execute([$usuarioId, $livroId]);
        if ($ja->fetchColumn()) {
            return true;
        }
        $n = $pdo->prepare('SELECT COUNT(*) FROM livros_abertos WHERE usuario_id = ? AND dia = CURDATE()');
        $n->execute([$usuarioId]);
        if ((int) $n->fetchColumn() >= $limite) {
            return false;
        }
        $pdo->prepare('INSERT IGNORE INTO livros_abertos (usuario_id, livro_id, dia) VALUES (?, ?, CURDATE())')->execute([$usuarioId, $livroId]);
        if (random_int(1, 200) === 1) { // faxina esporádica: só interessa o dia de hoje
            $pdo->exec('DELETE FROM livros_abertos WHERE dia < CURDATE() - INTERVAL 7 DAY');
        }
    } catch (PDOException $e) {
        error_log('Limite diário de livros indisponível: ' . $e->getMessage());
    }
    return true;
}

/** Página simples (429) mostrada no lugar do leitor quando o limite do dia foi atingido. */
function paginaLimiteDeLivros(string $perfil, string $voltar): never
{
    http_response_code(429);
    header('Retry-After: 3600');
    $limite = limiteDiarioDeLivros($perfil);
    $plano = rotuloPerfil($perfil);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Limite do dia</title>'
        . '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f14;color:#eceff4;font-family:system-ui,sans-serif;text-align:center;padding:24px}'
        . 'main{max-width:440px}h1{font-size:1.4rem;margin:0 0 .6rem}p{color:#a7b0c0;line-height:1.55;margin:0 0 1.2rem}a{display:inline-block;background:#f6b445;color:#1a1204;font-weight:700;padding:.7rem 1.4rem;border-radius:12px;text-decoration:none}</style></head>'
        . '<body><main data-testid="limite-livros"><h1>Você chegou ao limite de hoje</h1><p>O plano ' . e($plano) . ' permite abrir até <strong>' . (int) $limite . ' livros diferentes por dia</strong>. '
        . 'Os livros que você já abriu hoje continuam liberados, e o limite zera amanhã. Precisa de mais? Fale com o suporte.</p>'
        . '<a href="' . e($voltar) . '">Voltar à biblioteca</a></main></body></html>';
    exit;
}
