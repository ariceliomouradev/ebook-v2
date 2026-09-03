<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_login(true);

$ordemAtual = $_GET['ordem'] ?? 'recentes';
$busca = $_GET['busca'] ?? '';
$paginaAtual = max(1, (int) ($_GET['pagina'] ?? 1));

$resultado = listarLivrosPaginados($pdo, $ordemAtual, $busca, $paginaAtual, $_SESSION['usuario_id']);
$livros = $resultado['livros'];
$progressos = $resultado['progressos'];
$totalLivros = $resultado['totalLivros'];
$totalPaginas = $resultado['totalPaginas'];
$paginaAtual = $resultado['paginaAtual'];
$ordemAtual = $resultado['ordemAtual'];
$busca = $resultado['busca'];

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
    'totalPaginas'  => $totalPaginas,
    'paginaAtual'   => $paginaAtual,
]);
