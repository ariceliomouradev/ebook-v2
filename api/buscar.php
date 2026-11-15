<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_login(true);

$ordemAtual = $_GET['ordem'] ?? 'recentes';
$busca = $_GET['busca'] ?? '';
$categoria = preg_replace('/[^a-z0-9-]/', '', (string) ($_GET['categoria'] ?? ''));
$paginaAtual = max(1, (int) ($_GET['pagina'] ?? 1));
$soFavoritos = ($_GET['favoritos'] ?? '') === '1';

$resultado = listarLivrosPaginados($pdo, $ordemAtual, $busca, $paginaAtual, $_SESSION['usuario_id'], $categoria, $_SESSION['usuario_perfil'], titularDaSessao(), $soFavoritos);
$favoritos = $resultado['favoritos'];
$livros = $resultado['livros'];
$progressos = $resultado['progressos'];
$totalLivros = $resultado['totalLivros'];
$totalPaginas = $resultado['totalPaginas'];
$paginaAtual = $resultado['paginaAtual'];
$ordemAtual = $resultado['ordemAtual'];
$busca = $resultado['busca'];
$categoriaAtual = $resultado['categoria'];

ob_start();
include '../components/book_list.php';
$gradeHtml = ob_get_clean();

ob_start();
include '../components/pagination.php';
$paginacaoHtml = ob_get_clean();

responderJson([
    'success'       => true,
    'gradeHtml'     => $gradeHtml,
    'paginacaoHtml' => $paginacaoHtml,
    'totalLivros'   => $totalLivros,
    'totalFavoritos' => contarFavoritos($pdo, (int) $_SESSION['usuario_id'], $_SESSION['usuario_perfil'], titularDaSessao()),
    'totalPaginas'  => $totalPaginas,
    'paginaAtual'   => $paginaAtual,
]);
