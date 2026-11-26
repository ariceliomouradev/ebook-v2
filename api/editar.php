<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$titulo = trim($_POST['titulo'] ?? '');
$autor = trim($_POST['autor'] ?? '');

if (!$id || $titulo === '' || $autor === '') {
    responderJson(['success' => false, 'error' => 'Dados incompletos. Preencha todos os campos.'], 422);
}

$titulo = mb_substr($titulo, 0, 255);
$autor = mb_substr($autor, 0, 255);
$sinopse = mb_substr(trim((string) ($_POST['sinopse'] ?? '')), 0, 4000);
$sinopse = $sinopse === '' ? null : $sinopse;

// Data de publicação (opcional). Campo preenchido mas inválido não passa em branco: avisa.
$dataTexto = trim((string) ($_POST['data_publicacao'] ?? ''));
$dataPublicacao = normalizarDataPublicacao($dataTexto);
if ($dataTexto !== '' && $dataPublicacao === null) {
    responderJson(['success' => false, 'error' => 'Data de publicação inválida. Use o formato dia/mês/ano.'], 422);
}

require_once '../includes/repositorios.php';
$visibilidade = lerVisibilidadeDoFormulario($_POST);
if (isset($visibilidade['erro'])) {
    responderJson(['success' => false, 'error' => $visibilidade['erro']], 422);
}

require_once '../includes/categorias.php';
$slugCategoria = preg_replace('/[^a-z0-9-]/', '', (string) ($_POST['categoria'] ?? ''));
$categoriaId = categoriaIdPorSlug($pdo, $slugCategoria); // '' = sem categoria

try {
    $stmt = $pdo->prepare("UPDATE livros SET titulo = ?, autor = ?, sinopse = ?, data_publicacao = ?, categoria_id = ?, visivel_para = ?, liberar_em = ? WHERE id = ?");
    $stmt->execute([$titulo, $autor, $sinopse, $dataPublicacao, $categoriaId, $visibilidade['visivel_para'], $visibilidade['liberar_em'], $id]);
    require_once '../includes/duplicados.php';
    atualizarChavesDoLivro($pdo, (int) $id, $titulo, $autor);

    responderJson([
        'success' => true,
        'id' => $id,
        'titulo' => $titulo,
        'autor' => $autor,
        'sinopse' => $sinopse ?? '',
        'data_publicacao' => $dataPublicacao ?? '',
        'data_publicacao_br' => $dataPublicacao ? date('d/m/Y', strtotime($dataPublicacao)) : '',
        'categoria' => $categoriaId === null ? '' : $slugCategoria,
        'visivel_para' => $visibilidade['visivel_para'],
        'liberar_em' => $visibilidade['liberar_em'],
        'liberar_em_input' => $visibilidade['liberar_em'] ? date('Y-m-d\TH:i', strtotime($visibilidade['liberar_em'])) : '',
        'selo' => resumoVisibilidade($visibilidade['visivel_para'], $visibilidade['liberar_em']),
        'agendado' => $visibilidade['liberar_em'] !== null && strtotime($visibilidade['liberar_em']) > time(),
    ]);
} catch (PDOException $e) {
    error_log('Falha ao editar livro: ' . $e->getMessage());
    responderJson(['success' => false, 'error' => 'Erro interno do banco de dados.'], 500);
}
