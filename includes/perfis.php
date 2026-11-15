<?php
/**
 * Perfis do sistema e acessos simultâneos.
 *
 * Os nomes INTERNOS continuam leitor / contribuidor / admin (banco, sessão, testes); o que o usuário
 * vê são os nomes comerciais abaixo. Para renomear um perfil, mude só aqui.
 *
 *   admin         Administrador  gestor do sistema: vê tudo, aprova envios, define a visibilidade.
 *   contribuidor  Família        titular + até LIMITE_DEPENDENTES contas extras (titular_id). Só o titular
 *                                envia livros; a família enxerga o que o titular enviou, sem aprovação.
 *   leitor        Assinante      1 acesso simultâneo; pode enviar PDFs (até LIMITE_ENVIOS_ASSINANTE).
 */

const ROTULOS_PERFIL = [
    'admin'        => 'Administrador',
    'contribuidor' => 'Família',
    'leitor'       => 'Assinante',
];

function rotuloPerfil(string $perfil): string
{
    return ROTULOS_PERFIL[$perfil] ?? ucfirst($perfil);
}

/**
 * Troca 1 por 1 do Assinante (ASSINANTE_TROCA=true no .env). Ligada, o Assinante deixa de ver o acervo
 * inteiro: lê os livros que enviou e os que escolheu em "Explorar acervo", usando as vagas dele.
 * Desligada (padrão), o Assinante vê tudo o que foi liberado para o perfil dele.
 */
function trocaAtiva(): bool
{
    return in_array(strtolower(trim((string) env('ASSINANTE_TROCA', 'false'))), ['1', 'true', 'sim', 'on'], true);
}

/**
 * Vagas do Assinante: ASSINANTE_LIVROS_INICIAIS (padrão 3) + 1 por livro enviado por ele e aprovado.
 * @return array{total:int, usadas:int, livres:int, aprovados:int}
 */
function vagasDoAssinante(PDO $pdo, int $usuarioId): array
{
    $aprovados = $pdo->prepare("SELECT COUNT(*) FROM livros WHERE usuario_id = ? AND publicacao = 'aprovado'");
    $aprovados->execute([$usuarioId]);
    $usadas = $pdo->prepare('SELECT COUNT(*) FROM desbloqueios WHERE usuario_id = ?');
    $usadas->execute([$usuarioId]);
    $inicial = max(0, (int) env('ASSINANTE_LIVROS_INICIAIS', 3));
    $a = (int) $aprovados->fetchColumn();
    $u = (int) $usadas->fetchColumn();
    $total = $inicial + $a;
    return ['total' => $total, 'usadas' => $u, 'livres' => max(0, $total - $u), 'aprovados' => $a];
}

/** Dependente = conta de família criada pelo titular: só lê, não envia livros. */
function ehDependente(): bool
{
    return !empty($_SESSION['titular_id']);
}

/** Pode enviar PDFs? Admin, titular de Família e assinante. Dependente não. */
function podeEnviarLivros(): bool
{
    return in_array($_SESSION['usuario_perfil'] ?? '', ['admin', 'contribuidor', 'leitor'], true) && !ehDependente();
}

/** Perfis que "enviam para aprovação" (publicam só depois do administrador). */
function envioPassaPorAprovacao(): bool
{
    return ($_SESSION['usuario_perfil'] ?? '') !== 'admin';
}

/** Id do titular da família (para a regra de visibilidade): 0 quando a conta não é dependente. */
function titularDaSessao(): int
{
    return (int) ($_SESSION['titular_id'] ?? 0);
}

/**
 * Abre a sessão de um usuário já autenticado (senha ou Google): renova o id da sessão, grava os dados
 * e registra o acesso (limite de acessos simultâneos). $usuario: id, nome, perfil, titular_id.
 */
function abrirSessaoDoUsuario(PDO $pdo, array $usuario): void
{
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = $usuario['id'];
    $_SESSION['usuario_nome'] = $usuario['nome'];
    $_SESSION['usuario_perfil'] = $usuario['perfil'];
    $_SESSION['ultimo_acesso'] = time();
    unset($_SESSION['csrf_token']); // renova o token junto com o ID de sessão
    $titular = (int) ($usuario['titular_id'] ?? 0);
    $_SESSION['titular_id'] = $titular ?: null;
    registrarAcesso($pdo, (int) $usuario['id'], $titular ?: (int) $usuario['id'], (string) $usuario['perfil']);
}

/* ------------------------------- acessos simultâneos ------------------------------- */

/**
 * Registra o acesso desta sessão e, se passou do limite do grupo (conta ou família), derruba os
 * mais antigos. Chamado no login. Sem a migração v1.5 não faz nada (não derruba o sistema).
 */
function registrarAcesso(PDO $pdo, int $usuarioId, int $grupoId, string $perfil): void
{
    try {
        $pdo->exec('DELETE FROM sessoes_ativas WHERE ultimo_acesso < NOW() - INTERVAL ' . (int) SESSAO_INATIVIDADE_MAX_SEGUNDOS . ' SECOND');
        $pdo->prepare('REPLACE INTO sessoes_ativas (session_id, usuario_id, grupo_id, ultimo_acesso) VALUES (?, ?, ?, NOW())')
            ->execute([session_id(), $usuarioId, $grupoId]);

        $limite = LIMITE_ACESSOS[$perfil] ?? 1;
        if ($limite > 0) {
            // Mantém os $limite acessos mais recentes do grupo; o resto é derrubado.
            // o acesso que está entrando sempre fica (sem isso, dois logins no mesmo segundo empatam e o novo podia cair)
            $stmt = $pdo->prepare('SELECT session_id FROM sessoes_ativas WHERE grupo_id = ? ORDER BY (session_id = ?) DESC, ultimo_acesso DESC, session_id DESC LIMIT 100 OFFSET ' . (int) $limite);
            $stmt->execute([$grupoId, session_id()]);
            $sobras = $stmt->fetchAll(PDO::FETCH_COLUMN);
            if ($sobras) {
                $marcas = implode(',', array_fill(0, count($sobras), '?'));
                $pdo->prepare("DELETE FROM sessoes_ativas WHERE session_id IN ($marcas)")->execute($sobras);
            }
        }
        $_SESSION['acesso_registrado'] = true;
        $_SESSION['acesso_tocado_em'] = time();
    } catch (PDOException $e) {
        error_log('Acessos simultâneos indisponíveis: ' . $e->getMessage());
    }
}

/**
 * Chamada a cada requisição de usuário logado. Devolve false quando este acesso foi derrubado por
 * outro login (limite de acessos). Sessões abertas antes da migração se registram sozinhas.
 */
function acessoAindaValido(PDO $pdo): bool
{
    try {
        if (empty($_SESSION['acesso_registrado'])) {
            if (contaBloqueada($pdo, (int) $_SESSION['usuario_id'])) { // sessão antiga não escapa do bloqueio
                return false;
            }
            $grupo = (int) ($_SESSION['titular_id'] ?? 0) ?: (int) $_SESSION['usuario_id'];
            registrarAcesso($pdo, (int) $_SESSION['usuario_id'], $grupo, (string) ($_SESSION['usuario_perfil'] ?? 'leitor'));
            return true;
        }
        $stmt = $pdo->prepare('SELECT 1 FROM sessoes_ativas WHERE session_id = ?');
        $stmt->execute([session_id()]);
        if (!$stmt->fetchColumn()) {
            return false;
        }
        if (time() - (int) ($_SESSION['acesso_tocado_em'] ?? 0) > 60) {
            $pdo->prepare('UPDATE sessoes_ativas SET ultimo_acesso = NOW() WHERE session_id = ?')->execute([session_id()]);
            $_SESSION['acesso_tocado_em'] = time();
        }
    } catch (PDOException $e) {
        error_log('Acessos simultâneos indisponíveis: ' . $e->getMessage());
    }
    return true;
}

function encerrarAcesso(PDO $pdo): void
{
    try {
        $pdo->prepare('DELETE FROM sessoes_ativas WHERE session_id = ?')->execute([session_id()]);
    } catch (PDOException $e) {
        // sem a tabela, nada a limpar
    }
}
