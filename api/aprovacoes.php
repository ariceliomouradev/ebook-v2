<?php
/**
 * Fila de aprovação de livros enviados por Família e Assinantes (só administrador).
 * Ações (POST + CSRF, JSON; a resposta traz `html` da fila e `pendentes`):
 *   listar   pagina (a fila vem paginada: APROVACOES_POR_VEZ por página)
 *   aprovar  id, titulo e autor (opcionais: corrigem antes de publicar) e, se vier definir_visibilidade=1,
 *            vis_contribuidor / vis_leitor / liberar_em (para quem e quando liberar; sem isso: Família e Assinantes, já)
 *            publica o livro para Família e Assinantes (ajuste depois em Gerenciar livros)
 *   editar   id, titulo, autor   corrige título e autor (usado na prévia do PDF)
 *   negar    id, motivo (opcional)
 * Um livro cujo arquivo já existe no acervo não pode ser aprovado.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/duplicados.php';
require_once '../includes/repositorios.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

function responderFila(PDO $pdo, string $mensagem = '', array $extra = []): never
{
    $totalPendentes = (int) $pdo->query("SELECT COUNT(*) FROM livros WHERE publicacao = 'pendente'")->fetchColumn();
    $totalPaginas = max(1, (int) ceil($totalPendentes / APROVACOES_POR_VEZ));
    // página pedida pelo navegador; se esvaziou (aprovou o último da página), cai na última válida
    $pagina = min(max(1, (int) ($_POST['pagina'] ?? 1)), $totalPaginas);
    $deslocamento = ($pagina - 1) * APROVACOES_POR_VEZ;
    $pendentes = $pdo->query(
        "SELECT l.id, l.titulo, l.autor, l.hash_arquivo, l.data_upload, u.nome AS enviado_por, u.perfil AS perfil_envio
           FROM livros l LEFT JOIN usuarios u ON u.id = l.usuario_id
          WHERE l.publicacao = 'pendente' ORDER BY l.id ASC LIMIT " . APROVACOES_POR_VEZ . " OFFSET " . $deslocamento
    )->fetchAll();
    foreach ($pendentes as &$p) {
        $p['duplicado'] = buscarDuplicado($pdo, $p['hash_arquivo'], (string) $p['titulo'], (string) ($p['autor'] ?? ''), (int) $p['id']);
    }
    unset($p);
    ob_start();
    include __DIR__ . '/../components/aprovacoes_lista.php';
    $html = ob_get_clean();
    responderJson(['success' => true, 'html' => $html, 'mensagem' => $mensagem, 'pendentes' => $totalPendentes, 'pagina' => $pagina, 'totalPaginas' => $totalPaginas, 'porPagina' => APROVACOES_POR_VEZ] + $extra);
}

$acao = $_POST['action'] ?? 'listar';
if ($acao === 'listar') {
    responderFila($pdo);
}

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$stmt = $pdo->prepare("SELECT * FROM livros WHERE id = ? AND publicacao = 'pendente'");
$stmt->execute([$id ?: 0]);
$livro = $stmt->fetch();
if (!$livro) {
    responderJson(['success' => false, 'error' => 'Esse pedido não está mais pendente.'], 404);
}

if ($acao === 'aprovar') {
    $dup = buscarDuplicado($pdo, $livro['hash_arquivo'], (string) $livro['titulo'], (string) ($livro['autor'] ?? ''), (int) $livro['id']);
    if ($dup['exato']) {
        responderJson(['success' => false, 'error' => 'O mesmo arquivo já está no acervo. Negue o pedido.'], 422);
    }
    $autor = mb_substr(trim((string) ($_POST['autor'] ?? '')), 0, 255);
    if ($autor === '') {
        $autor = (string) ($livro['autor'] ?? 'Autor Desconhecido');
    }
    $titulo = mb_substr(trim((string) ($_POST['titulo'] ?? '')), 0, 255);
    if ($titulo === '') {
        $titulo = (string) $livro['titulo'];
    }
    $visibilidade = ['visivel_para' => 'contribuidor,leitor', 'liberar_em' => null];
    if (!empty($_POST['definir_visibilidade'])) {
        $visibilidade = lerVisibilidadeDoFormulario($_POST);
        if (isset($visibilidade['erro'])) {
            responderJson(['success' => false, 'error' => $visibilidade['erro']], 422);
        }
    }
    $pdo->prepare("UPDATE livros SET publicacao = 'aprovado', motivo_negado = NULL, titulo = ?, autor = ?, visivel_para = ?, liberar_em = ? WHERE id = ?")
        ->execute([$titulo, $autor, $visibilidade['visivel_para'], $visibilidade['liberar_em'], $id]);
    atualizarChavesDoLivro($pdo, (int) $id, $titulo, $autor);
    $original = marcarDuplicadoSePreciso($pdo, (int) $id);
    responderFila($pdo, $original ? 'Livro aprovado, mas parece repetido de outro: ele fica escondido de Família e Assinantes (veja Gerenciar livros).' : 'Livro aprovado e publicado.');
}

if ($acao === 'editar') {
    $titulo = mb_substr(trim((string) ($_POST['titulo'] ?? '')), 0, 255);
    $autor = mb_substr(trim((string) ($_POST['autor'] ?? '')), 0, 255);
    if ($titulo === '' || $autor === '') {
        responderJson(['success' => false, 'error' => 'Preencha o título e o autor.'], 422);
    }
    $pdo->prepare('UPDATE livros SET titulo = ?, autor = ? WHERE id = ?')->execute([$titulo, $autor, $id]);
    responderFila($pdo, 'Alterações salvas.', ['titulo' => $titulo, 'autor' => $autor]);
}

if ($acao === 'negar') {
    $motivo = mb_substr(trim((string) ($_POST['motivo'] ?? '')), 0, 255);
    if ($motivo === '') {
        $dup = buscarDuplicado($pdo, $livro['hash_arquivo'], (string) $livro['titulo'], (string) ($livro['autor'] ?? ''), (int) $livro['id']);
        $motivo = ($dup['exato'] || $dup['provavel']) ? 'Este livro já existe no acervo.' : 'Não aprovado pelo administrador.';
    }
    $pdo->prepare("UPDATE livros SET publicacao = 'negado', motivo_negado = ?, visivel_para = '' WHERE id = ?")->execute([$motivo, $id]);
    responderFila($pdo, 'Pedido negado.');
}

responderJson(['success' => false, 'error' => 'Ação desconhecida.'], 400);
