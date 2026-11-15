<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

$totalPaginas = isset($totalPaginas) ? (int) $totalPaginas : 1;
$paginaAtual = isset($paginaAtual) ? (int) $paginaAtual : 1;
$totalLivros = isset($totalLivros) ? (int) $totalLivros : 0;
$ordemAtual = isset($ordemAtual) ? $ordemAtual : 'recentes';
$busca = isset($busca) ? $busca : '';
$categoriaAtual = isset($categoriaAtual) ? $categoriaAtual : '';

$inicio = $totalLivros === 0 ? 0 : (($paginaAtual - 1) * ITENS_POR_PAGINA) + 1;
$fim = min($paginaAtual * ITENS_POR_PAGINA, $totalLivros);
$qs = 'ordem=' . urlencode($ordemAtual)
    . ($busca !== '' ? '&busca=' . urlencode($busca) : '')
    . ($categoriaAtual !== '' ? '&categoria=' . urlencode($categoriaAtual) : '')
    . (!empty($soFavoritos) ? '&favoritos=1' : '');
$linkPagina = fn(int $p): string => '?pagina=' . $p . '&' . $qs;
$numeros = paginasVisiveis($paginaAtual, max(1, $totalPaginas));
$semAnterior = $paginaAtual <= 1;
$semProxima = $paginaAtual >= $totalPaginas || $totalPaginas <= 1;
?>

<nav data-testid="pagination-container" class="pagination-container" aria-label="Paginação da biblioteca">

    <?php /* Texto discreto acima do controle, como nas listas do iOS ("1–10 de 1.402"). */ ?>
    <p data-testid="pagination-status-info" class="pagination-resumo">
        Exibindo <?= $inicio ?>–<b data-testid="pagination-status-current"><?= $fim ?></b>
        de <span data-testid="pagination-status-total"><?= $totalLivros ?></span> livros
    </p>

    <div class="pagination-nav seg" id="paginationNav" data-pagina-atual="<?= $paginaAtual ?>" data-total-paginas="<?= $totalPaginas ?>">
        <a data-testid="btn-page-prev" href="<?= $linkPagina(max(1, $paginaAtual - 1)) ?>"
           class="btn-page seg__seta <?= $semAnterior ? 'disabled' : '' ?>"
           title="Anterior" aria-label="Página anterior"
           <?= $semAnterior ? 'aria-disabled="true" tabindex="-1"' : '' ?>>
            <i class="fas fa-chevron-left"></i>
        </a>

        <?php /* Celular: só "5 de 70". Em telas maiores quem informa a posição são os números. */ ?>
        <div class="page-current-display d-md-none">
            <span data-testid="page-current-num" class="page-num-main"><?= $paginaAtual ?></span>
            <span data-testid="page-total-num" class="page-total-sub">de <?= max(1, $totalPaginas) ?></span>
        </div>

        <?php if ($totalPaginas > 1): ?>
        <div class="page-numbers seg__numeros d-none d-md-flex" data-testid="pagination-numeros">
            <?php foreach ($numeros as $n): ?>
                <?php if ($n === null): ?>
                    <span class="page-ellipsis" aria-hidden="true">&hellip;</span>
                <?php elseif ($n === $paginaAtual): ?>
                    <span data-testid="btn-page-atual" class="btn-page btn-page-num active" aria-current="page" aria-label="Página <?= $n ?>, atual"><?= $n ?></span>
                <?php else: ?>
                    <a data-testid="btn-page-num" href="<?= $linkPagina($n) ?>" class="btn-page btn-page-num" aria-label="Ir para a página <?= $n ?>"><?= $n ?></a>
                <?php endif; ?>
            <?php endforeach; ?>
        </div>
        <?php else: ?>
        <?php /* Uma só página: sem números, mas a posição continua legível em telas maiores. */ ?>
        <div class="page-current-display d-none d-md-block">
            <span class="page-num-main">1</span>
            <span class="page-total-sub">de 1</span>
        </div>
        <?php endif; ?>

        <a data-testid="btn-page-next" href="<?= $linkPagina(min(max(1, $totalPaginas), $paginaAtual + 1)) ?>"
           class="btn-page seg__seta <?= $semProxima ? 'disabled' : '' ?>"
           title="Próxima" aria-label="Próxima página"
           <?= $semProxima ? 'aria-disabled="true" tabindex="-1"' : '' ?>>
            <i class="fas fa-chevron-right"></i>
        </a>
    </div>
</nav>
