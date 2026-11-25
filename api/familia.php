<?php
/**
 * "Acessos do Pro": o titular do Pro cria contas extras (dependentes) para quem mora com ele.
 * Ações (POST + CSRF, JSON; a resposta traz `html`):
 *   listar
 *   adicionar  nome, email, senha   (até LIMITE_DEPENDENTES)
 *   remover    usuario_id
 * Os dependentes só leem: enxergam o que o titular enviou e o acervo liberado para o Pro.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['contribuidor'], true);
require_post(true);
csrf_verify(true);

if (ehDependente()) {
    responderJson(['success' => false, 'error' => 'Só o titular da família gerencia os acessos.'], 403);
}
$titularId = (int) $_SESSION['usuario_id'];

function responderFamilia(PDO $pdo, int $titularId, string $mensagem = ''): never
{
    $stmt = $pdo->prepare('SELECT id, nome, email, criado_em FROM usuarios WHERE titular_id = ? ORDER BY id');
    $stmt->execute([$titularId]);
    $dependentes = $stmt->fetchAll();
    ob_start();
    include __DIR__ . '/../components/familia_lista.php';
    $html = ob_get_clean();
    responderJson(['success' => true, 'html' => $html, 'mensagem' => $mensagem, 'total' => count($dependentes), 'limite' => LIMITE_DEPENDENTES]);
}

$acao = $_POST['action'] ?? 'listar';
if ($acao === 'listar') {
    responderFamilia($pdo, $titularId);
}

if ($acao === 'adicionar') {
    $nome = mb_substr(trim((string) ($_POST['nome'] ?? '')), 0, 100);
    $email = trim((string) ($_POST['email'] ?? ''));
    $senha = (string) ($_POST['senha'] ?? '');
    if ($nome === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        responderJson(['success' => false, 'error' => 'Informe um nome e um e-mail válido.'], 422);
    }
    if (!validarSenhaForte($senha)) {
        responderJson(['success' => false, 'error' => 'A senha não atende aos requisitos mínimos de segurança.'], 422);
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM usuarios WHERE titular_id = ?');
    $stmt->execute([$titularId]);
    if ((int) $stmt->fetchColumn() >= LIMITE_DEPENDENTES) {
        responderJson(['success' => false, 'error' => 'Sua família já tem o máximo de acessos (' . (LIMITE_DEPENDENTES + 1) . ' contas, contando a sua).'], 422);
    }
    try {
        $pdo->prepare("INSERT INTO usuarios (nome, email, senha, perfil, titular_id) VALUES (?, ?, ?, 'contribuidor', ?)")
            ->execute([$nome, $email, password_hash($senha, PASSWORD_DEFAULT), $titularId]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            responderJson(['success' => false, 'error' => 'Este e-mail já está em uso.'], 422);
        }
        error_log('Falha ao criar dependente: ' . $e->getMessage());
        responderJson(['success' => false, 'error' => 'Erro interno do banco de dados.'], 500);
    }
    responderFamilia($pdo, $titularId, 'Acesso criado. Passe o e-mail e a senha para a pessoa.');
}

if ($acao === 'remover') {
    $id = filter_var($_POST['usuario_id'] ?? null, FILTER_VALIDATE_INT);
    require_once __DIR__ . '/../includes/avatar.php';
    $stmtFoto = $pdo->prepare('SELECT foto FROM usuarios WHERE id = ? AND titular_id = ?');
    try { $stmtFoto->execute([$id ?: 0, $titularId]); apagarArquivoDeFoto($stmtFoto->fetchColumn() ?: null); } catch (PDOException $e) { /* sem a coluna foto */ }
    $stmt = $pdo->prepare('DELETE FROM usuarios WHERE id = ? AND titular_id = ?');
    $stmt->execute([$id ?: 0, $titularId]);
    if (!$stmt->rowCount()) {
        responderJson(['success' => false, 'error' => 'Acesso não encontrado.'], 404);
    }
    $pdo->prepare('DELETE FROM sessoes_ativas WHERE usuario_id = ?')->execute([$id]);
    responderFamilia($pdo, $titularId, 'Acesso removido.');
}

responderJson(['success' => false, 'error' => 'Ação desconhecida.'], 400);
