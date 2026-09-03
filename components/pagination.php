<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

$totalPaginas = isset($totalPaginas) ? (int) $totalPaginas : 1;
$paginaAtual = isset($paginaAtual) ? (int) $paginaAtual : 1;
$totalLivros = isset($totalLivros) ? (int) $totalLivros : 0;
$ordemAtual = isset($ordemAtual) ? $ordemAtual : 'recentes';
$busca = isset($busca) ? $busca : '';

$fim = min($paginaAtual * ITENS_POR_PAGINA, $totalLivros);
$qs = 'ordem=' . urlencode($ordemAtual) . ($busca !== '' ? '&busca=' . urlencode($busca) : '');
?>

<div data-testid="pagination-container" class="pagination-container d-flex justify-content-between align-items-center">

    <div data-testid="pagination-status-info" class="pagination-info-files d-none d-md-block">
        <i class="fas fa-layer-group me-2"></i>
        STATUS: <b data-testid="pagination-status-current"><?= $fim ?></b> <span class="mx-1">/</span> <span data-testid="pagination-status-total"><?= $totalLivros ?></span> LIVROS
    </div>

    <div class="pagination-nav" id="paginationNav" data-pagina-atual="<?= $paginaAtual ?>" data-total-paginas="<?= $totalPaginas ?>">
        <a data-testid="btn-page-prev" href="?pagina=<?= $paginaAtual - 1 ?>&<?= $qs ?>"
           class="btn-page <?= ($paginaAtual <= 1) ? 'disabled' : '' ?>"
           title="Anterior">
            <i class="fas fa-chevron-left"></i>
        </a>

        <div class="page-current-display">
            <span data-testid="page-current-num" class="page-num-main"><?= $paginaAtual ?></span>
            <span data-testid="page-total-num" class="page-total-sub">de <?= max(1, $totalPaginas) ?></span>
        </div>

        <a data-testid="btn-page-next" href="?pagina=<?= $paginaAtual + 1 ?>&<?= $qs ?>"
           class="btn-page <?= ($paginaAtual >= $totalPaginas || $totalPaginas <= 1) ? 'disabled' : '' ?>"
           title="Próxima">
            <i class="fas fa-chevron-right"></i>
        </a>
    </div>

    <div class="d-none d-md-block" style="width: 150px;"></div>
</div>
