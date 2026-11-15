<?php
/**
 * "Meus envios": os livros que o usuário enviou e o pedido de publicação para o acervo geral.
 * Ações (POST + CSRF, sempre JSON; a resposta traz `html` com a lista já renderizada):
 *   listar
 *   solicitar  id   pede a publicação; se o arquivo já existe no acervo, é negado na hora
 *   excluir    id   apaga um envio que ainda não foi aprovado
 * Só quem envia livros (titular da Família e Assinante); o administrador usa o gerenciador.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/duplicados.php';

require_perfil(['contribuidor', 'leitor'], true);
require_post(true);
csrf_verify(true);

if (!podeEnviarLivros()) {
    responderJson(['success' => false, 'error' => 'Sua conta não envia livros.'], 403);
}

$meuId = (int) $_SESSION['usuario_id'];

function responderEnvios(PDO $pdo, int $meuId, string $mensagem = ''): never
{
    $stmt = $pdo->prepare('SELECT id, titulo, autor, publicacao, motivo_negado, data_upload FROM livros WHERE usuario_id = ? ORDER BY id DESC');
    $stmt->execute([$meuId]);
    $envios = $stmt->fetchAll();
    ob_start();
    include __DIR__ . '/../components/envios_lista.php';
    $html = ob_get_clean();
    $limite = ($_SESSION['usuario_perfil'] ?? '') === 'leitor' ? LIMITE_ENVIOS_ASSINANTE : null;
    responderJson(['success' => true, 'html' => $html, 'mensagem' => $mensagem, 'total' => count($envios), 'limite' => $limite]);
}

$acao = $_POST['action'] ?? 'listar';
$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);

if ($acao === 'listar') {
    responderEnvios($pdo, $meuId);
}

if (!$id) {
    responderJson(['success' => false, 'error' => 'Livro inválido.'], 422);
}
$stmt = $pdo->prepare('SELECT * FROM livros WHERE id = ? AND usuario_id = ?');
$stmt->execute([$id, $meuId]);
$livro = $stmt->fetch();
if (!$livro) {
    responderJson(['success' => false, 'error' => 'Livro não encontrado entre os seus envios.'], 404);
}

if ($acao === 'solicitar') {
    if (!in_array($livro['publicacao'], ['privado', 'negado'], true)) {
        responderJson(['success' => false, 'error' => 'Este livro já foi enviado para análise ou publicado.'], 422);
    }
    $dup = buscarDuplicado($pdo, $livro['hash_arquivo'], (string) $livro['titulo'], (string) ($livro['autor'] ?? ''), (int) $livro['id']);
    if ($dup['exato']) {
        $pdo->prepare("UPDATE livros SET publicacao = 'negado', motivo_negado = ? WHERE id = ?")
            ->execute(['Este livro já existe no acervo.', $id]);
        responderEnvios($pdo, $meuId, 'Este livro já existe no acervo, então não foi enviado para aprovação. Ele continua na sua biblioteca.');
    }
    $pdo->prepare("UPDATE livros SET publicacao = 'pendente', motivo_negado = NULL WHERE id = ?")->execute([$id]);
    responderEnvios($pdo, $meuId, 'Pedido enviado! O administrador vai analisar o livro.');
}

if ($acao === 'excluir') {
    if ($livro['publicacao'] === 'aprovado') {
        responderJson(['success' => false, 'error' => 'Livro publicado só o administrador pode excluir.'], 403);
    }
    $caminhoPdf = __DIR__ . '/../uploads/' . $livro['nome_arquivo'];
    if (is_file($caminhoPdf)) {
        unlink($caminhoPdf);
    }
    if (!empty($livro['capa_arquivo'])) {
        $caminhoCapa = __DIR__ . '/../capas/' . $livro['capa_arquivo'];
        if (is_file($caminhoCapa)) {
            unlink($caminhoCapa);
        }
    }
    $pdo->prepare('DELETE FROM livros WHERE id = ?')->execute([$id]);
    responderEnvios($pdo, $meuId, 'Envio excluído.');
}

responderJson(['success' => false, 'error' => 'Ação desconhecida.'], 400);
