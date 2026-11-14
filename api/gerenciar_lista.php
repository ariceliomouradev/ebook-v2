<?php
// Lista paginada do gerenciador (modal "Gerenciar Biblioteca"). Só administradores.
//
//   GET api/gerenciar_lista.php?busca=termo&pagina=2
//   -> { success, html, total, pagina, totalPaginas, inicio, fim }
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_perfil(['admin'], true);

$resultado = listarLivrosParaGerenciar($pdo, (string) ($_GET['busca'] ?? ''), (int) ($_GET['pagina'] ?? 1));
$livros = $resultado['livros'];
$busca = $resultado['busca'];

ob_start();
include '../components/lista_gerenciador.php';
$html = ob_get_clean();

$pagina = $resultado['pagina'];
$total = $resultado['total'];

responderJson([
    'success'      => true,
    'html'         => $html,
    'total'        => $total,
    'pagina'       => $pagina,
    'totalPaginas' => $resultado['totalPaginas'],
    // Faixa exibida ("21–40 de 1.388"): 0–0 quando não há resultados.
    'inicio'       => $total === 0 ? 0 : ($pagina - 1) * ITENS_POR_PAGINA_GERENCIADOR + 1,
    'fim'          => $total === 0 ? 0 : min($pagina * ITENS_POR_PAGINA_GERENCIADOR, $total),
]);
