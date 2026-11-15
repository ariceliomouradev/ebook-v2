<?php
/**
 * "Explorar acervo" do Assinante (troca 1 por 1; só com ASSINANTE_TROCA=true).
 * Ações (POST + CSRF, JSON; a resposta traz `html`, `vagas` e a paginação):
 *   listar   busca, pagina   livros publicados para Assinantes que ele ainda não tem
 *   liberar  id              usa uma vaga para ler o livro (as vagas crescem a cada envio aprovado)
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_perfil(['leitor'], true);
require_post(true);
csrf_verify(true);

if (!trocaAtiva() || ehDependente()) {
    responderJson(['success' => false, 'error' => 'O acervo por troca não está ativo para a sua conta.'], 403);
}
$meuId = (int) $_SESSION['usuario_id'];

/** Livros que o assinante pode escolher: publicados para o perfil, já liberados na data, que não são dele nem já escolhidos. */
const ACERVO_ELEGIVEIS = "l.publicacao = 'aprovado'
    AND FIND_IN_SET('leitor', l.visivel_para) > 0
    AND (l.liberar_em IS NULL OR l.liberar_em <= NOW())
    AND l.duplicado_de IS NULL
    AND (l.usuario_id IS NULL OR l.usuario_id <> :eu)
    AND l.id NOT IN (SELECT livro_id FROM desbloqueios WHERE usuario_id = :eu)";

function responderAcervo(PDO $pdo, int $meuId, string $mensagem = ''): never
{
    $busca = trim((string) ($_POST['busca'] ?? ''));
    $where = ACERVO_ELEGIVEIS;
    $params = [':eu' => $meuId];
    if ($busca !== '') {
        $where .= ' AND (l.titulo LIKE :busca OR l.autor LIKE :busca)';
        $params[':busca'] = '%' . escaparLike($busca) . '%';
    }
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM livros l WHERE $where");
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();
    $totalPaginas = max(1, (int) ceil($total / ACERVO_POR_PAGINA));
    $pagina = min(max(1, (int) ($_POST['pagina'] ?? 1)), $totalPaginas);

    $stmt = $pdo->prepare(
        "SELECT l.id, l.titulo, l.autor, c.nome AS categoria
           FROM livros l LEFT JOIN categorias c ON c.id = l.categoria_id
          WHERE $where ORDER BY l.titulo ASC, l.id ASC LIMIT " . ACERVO_POR_PAGINA . ' OFFSET ' . (($pagina - 1) * ACERVO_POR_PAGINA)
    );
    $stmt->execute($params);
    $livros = $stmt->fetchAll();
    $vagas = vagasDoAssinante($pdo, $meuId);

    ob_start();
    include __DIR__ . '/../components/acervo_lista.php';
    $html = ob_get_clean();
    responderJson([
        'success' => true, 'html' => $html, 'mensagem' => $mensagem, 'vagas' => $vagas,
        'total' => $total, 'pagina' => $pagina, 'totalPaginas' => $totalPaginas,
    ]);
}

$acao = $_POST['action'] ?? 'listar';
if ($acao === 'listar') {
    responderAcervo($pdo, $meuId);
}

if ($acao === 'liberar') {
    $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id) {
        responderJson(['success' => false, 'error' => 'Livro inválido.'], 422);
    }
    $vagas = vagasDoAssinante($pdo, $meuId);
    if ($vagas['livres'] < 1) {
        responderJson(['success' => false, 'error' => 'Você não tem vagas livres. Envie um livro novo: cada envio aprovado libera mais uma vaga.'], 422);
    }
    $stmt = $pdo->prepare('SELECT 1 FROM livros l WHERE l.id = :id AND ' . ACERVO_ELEGIVEIS);
    $stmt->execute([':id' => $id, ':eu' => $meuId]);
    if (!$stmt->fetchColumn()) {
        responderJson(['success' => false, 'error' => 'Esse livro não está disponível para troca.'], 404);
    }
    $pdo->prepare('INSERT IGNORE INTO desbloqueios (usuario_id, livro_id) VALUES (?, ?)')->execute([$meuId, $id]);
    responderAcervo($pdo, $meuId, 'Livro liberado! Ele já está na sua biblioteca.');
}

responderJson(['success' => false, 'error' => 'Ação desconhecida.'], 400);
