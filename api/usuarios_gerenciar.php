<?php
/**
 * Gestão de usuários pelo modal do painel (só admin). Ações (POST + CSRF), sempre em JSON:
 *   listar
 *   adicionar        nome, email, senha, perfil
 *   redefinir_senha  usuario_id   (gera uma senha TEMPORÁRIA, devolvida uma única vez em `senha_temporaria`; a pessoa é obrigada a trocá-la no primeiro acesso)
 *   editar           usuario_id, whatsapp, vencimento (AAAA-MM-DD ou vazio = sem vencimento), tipo (teste|pago|cortesia)
 *   excluir          usuario_id
 *   mudar_perfil     usuario_id, perfil   (derruba os acessos abertos da pessoa: o perfil novo vale no próximo login)
 *   renovar          usuario_id           (+30 dias e desbloqueia)
 *   bloquear / desbloquear  usuario_id
 * Toda resposta traz `html` (a tabela já renderizada) e, quando há, `mensagem` para o aviso do modal.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

function responderUsuarios(PDO $pdo, string $mensagem = '', array $extra = []): never
{
    $listaUsuarios = listaDeUsuarios($pdo);
    ob_start();
    include __DIR__ . '/../components/usuarios_gerenciador.php';
    $html = ob_get_clean();
    responderJson(['success' => true, 'html' => $html, 'mensagem' => $mensagem, 'total' => count($listaUsuarios)] + $extra);
}

function falhar(string $mensagem, int $codigo = 422): never
{
    responderJson(['success' => false, 'error' => $mensagem], $codigo);
}

$action = $_POST['action'] ?? '';

if ($action === 'listar') {
    responderUsuarios($pdo);
}

if ($action === 'adicionar') {
    $nome = trim($_POST['nome'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $senha = $_POST['senha'] ?? '';
    $perfil = $_POST['perfil'] ?? 'leitor';
    if (!in_array($perfil, ['leitor', 'contribuidor', 'admin'], true)) {
        $perfil = 'leitor';
    }

    if ($nome === '' || $email === '' || $senha === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        falhar('Dados inválidos ou incompletos. Tente novamente.');
    }
    if (!validarSenhaForte($senha)) {
        falhar('A senha não atende aos requisitos mínimos de segurança.');
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)');
        $stmt->execute([mb_substr($nome, 0, 100), $email, password_hash($senha, PASSWORD_DEFAULT), $perfil]);
        $novoId = (int) $pdo->lastInsertId();
        try {
            $pdo->prepare('UPDATE usuarios SET trocar_senha = 1 WHERE id = ?')->execute([$novoId]); // senha provisória: troca no primeiro acesso
        } catch (PDOException $e2) {
            // banco sem a migração v1.14
        }
        if (!empty($_POST['teste']) && $perfil !== 'admin') {
            $pdo->prepare("UPDATE usuarios SET acesso_ate = DATE_ADD(NOW(), INTERVAL " . (int) TESTE_DIAS . " DAY), acesso_origem = 'teste' WHERE id = ?")->execute([(int) $pdo->lastInsertId()]);
        }
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            falhar('Este e-mail já está em uso por outro usuário.', 409);
        }
        error_log('Falha ao cadastrar usuário: ' . $e->getMessage());
        falhar('Erro interno do banco de dados.', 500);
    }
    responderUsuarios($pdo, 'Usuário cadastrado com sucesso no sistema.');
}

if ($action === 'redefinir_senha') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        falhar('Dados inválidos ou incompletos. Tente novamente.');
    }
    $stmt = $pdo->prepare('SELECT nome FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $nome = $stmt->fetchColumn();
    if ($nome === false) {
        falhar('Usuário não encontrado.', 404);
    }
    $temporaria = gerarSenhaTemporaria();
    try {
        $pdo->prepare('UPDATE usuarios SET senha = ?, trocar_senha = 1, reset_token = NULL, reset_expires = NULL WHERE id = ?')->execute([password_hash($temporaria, PASSWORD_DEFAULT), $id]);
        $pdo->prepare('DELETE FROM sessoes_ativas WHERE usuario_id = ?')->execute([$id]); // quem estava logado precisa entrar de novo com a temporária
    } catch (PDOException $e) {
        error_log('Falha ao redefinir senha: ' . $e->getMessage());
        falhar('Para usar senha temporária, o banco precisa da atualização v1.14 (veja database/migracao_v1.14_senha_temporaria.sql).', 500);
    }
    responderUsuarios($pdo, 'Senha temporária gerada para ' . $nome . '. Ela aparece só desta vez.', ['senha_temporaria' => $temporaria, 'usuario_nome' => $nome]);
}

if ($action === 'editar') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        falhar('Dados inválidos ou incompletos. Tente novamente.');
    }
    $stmt = $pdo->prepare('SELECT perfil, titular_id FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $alvo = $stmt->fetch();
    if (!$alvo) {
        falhar('Usuário não encontrado.', 404);
    }

    $zapTexto = trim((string) ($_POST['whatsapp'] ?? ''));
    $zap = null;
    if ($zapTexto !== '') {
        $zap = normalizarWhatsapp($zapTexto);
        if ($zap === null) {
            falhar('WhatsApp inválido. Use o DDD e o número, por exemplo (85) 98888-7777.');
        }
    }
    $pdo->prepare('UPDATE usuarios SET whatsapp = ? WHERE id = ?')->execute([$zap, $id]);

    // Vencimento e tipo são da conta titular: administrador e dependente não têm.
    if ($alvo['perfil'] !== 'admin' && empty($alvo['titular_id']) && array_key_exists('vencimento', $_POST)) {
        $dataTexto = trim((string) $_POST['vencimento']);
        $tipo = $_POST['tipo'] ?? 'pago';
        if (!in_array($tipo, ['teste', 'pago', 'cortesia'], true)) {
            $tipo = 'pago';
        }
        if ($dataTexto === '') {
            $pdo->prepare("UPDATE usuarios SET acesso_ate = NULL, acesso_origem = 'cortesia' WHERE id = ?")->execute([$id]);
        } else {
            $d = DateTime::createFromFormat('!Y-m-d', $dataTexto);
            if (!$d || $d->format('Y-m-d') !== $dataTexto || (int) $d->format('Y') < 2020 || (int) $d->format('Y') > 2100) {
                falhar('Data de vencimento inválida.');
            }
            $pdo->prepare('UPDATE usuarios SET acesso_ate = ?, acesso_origem = ? WHERE id = ?')->execute([$dataTexto . ' 23:59:59', $tipo, $id]);
        }
    }
    responderUsuarios($pdo, 'Dados do usuário atualizados.');
}

if ($action === 'renovar') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || !renovarAcesso($pdo, $id, TESTE_DIAS)) {
        falhar('Não foi possível renovar este acesso.');
    }
    responderUsuarios($pdo, 'Acesso renovado por mais ' . TESTE_DIAS . ' dias.');
}

if ($action === 'mudar_perfil') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    $perfil = $_POST['perfil'] ?? '';
    if (!$id || !in_array($perfil, ['leitor', 'contribuidor', 'admin'], true)) {
        falhar('Dados inválidos ou incompletos. Tente novamente.');
    }
    if ($id === (int) $_SESSION['usuario_id']) {
        falhar('Você não pode mudar o seu próprio perfil.', 403);
    }
    $stmt = $pdo->prepare('SELECT nome, perfil, titular_id FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $alvo = $stmt->fetch();
    if (!$alvo) {
        falhar('Usuário não encontrado.', 404);
    }
    if (!empty($alvo['titular_id'])) {
        falhar('Esta conta é dependente de um plano Pro: o perfil dela segue o titular.');
    }
    if ($alvo['perfil'] === $perfil) {
        responderUsuarios($pdo);
    }
    if ($perfil !== 'contribuidor') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM usuarios WHERE titular_id = ?');
        $stmt->execute([$id]);
        if ((int) $stmt->fetchColumn() > 0) {
            falhar('Este Pro tem contas dependentes. Remova-as antes de mudar o perfil do titular.');
        }
    }
    try {
        $pdo->prepare('UPDATE usuarios SET perfil = ? WHERE id = ?')->execute([$perfil, $id]);
        if ($perfil === 'admin') { // administrador não tem vencimento nem bloqueio
            $pdo->prepare("UPDATE usuarios SET acesso_ate = NULL, acesso_origem = 'cortesia' WHERE id = ?")->execute([$id]);
            try {
                $pdo->prepare('UPDATE usuarios SET bloqueado = 0 WHERE id = ?')->execute([$id]);
            } catch (PDOException $e) {
                // banco sem a migração v1.13
            }
        }
        $pdo->prepare('DELETE FROM sessoes_ativas WHERE usuario_id = ?')->execute([$id]); // o perfil novo vale no próximo login
    } catch (PDOException $e) {
        error_log('Falha ao mudar perfil: ' . $e->getMessage());
        falhar('Erro interno do banco de dados.', 500);
    }
    responderUsuarios($pdo, $alvo['nome'] . ' agora é ' . rotuloPerfil($perfil) . '. A pessoa precisa entrar de novo para valer o novo perfil.');
}

if ($action === 'bloquear' || $action === 'desbloquear') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id === (int) $_SESSION['usuario_id']) {
        falhar('Operação bloqueada: você não pode bloquear a sua própria conta.', 403);
    }
    try {
        if (!definirBloqueio($pdo, $id, $action === 'bloquear')) {
            falhar('Não foi possível alterar este acesso (administradores não são bloqueados).');
        }
    } catch (PDOException $e) {
        error_log('Falha ao bloquear/desbloquear: ' . $e->getMessage());
        falhar('Para bloquear, o banco precisa da atualização v1.13 (veja database/migracao_v1.13_bloqueio.sql).', 500);
    }
    responderUsuarios($pdo, $action === 'bloquear' ? 'Acesso bloqueado. Quem estava logado foi desconectado.' : 'Acesso liberado de novo.');
}

if ($action === 'excluir') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        falhar('Dados inválidos ou incompletos. Tente novamente.');
    }
    if ($id === (int) $_SESSION['usuario_id']) {
        falhar('Operação bloqueada: você não pode excluir a sua própria conta.', 403);
    }
    try {
        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
    } catch (PDOException $e) {
        error_log('Falha ao excluir usuário: ' . $e->getMessage());
        falhar('Erro interno do banco de dados.', 500);
    }
    responderUsuarios($pdo, 'Usuário excluído. O acervo de livros dele foi mantido.');
}

falhar('Ação inválida.', 400);
