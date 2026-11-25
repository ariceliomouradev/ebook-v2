<?php
/**
 * Rodapé da lista: "Mostrar mais" com progresso (substitui a paginação por números).
 * Entrada: $paginaAtual (= páginas já carregadas), $totalLivros, $ordemAtual, $busca, $categoriaAtual, $soFavoritos.
 * O clique é tratado por assets/js/app.js (AJAX); o href é o fallback sem JavaScript.
 */
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

$paginaAtual = isset($paginaAtual) ? max(1, (int) $paginaAtual) : 1;
$totalLivros = isset($totalLivros) ? (int) $totalLivros : 0;
$ordemAtual = isset($ordemAtual) ? $ordemAtual : 'recentes';
$busca = isset($busca) ? $busca : '';
$categoriaAtual = isset($categoriaAtual) ? $categoriaAtual : '';

$vistos = min($paginaAtual * ITENS_POR_PAGINA, $totalLivros);
$restante = max(0, $totalLivros - $vistos);
$proximos = min(ITENS_POR_PAGINA, $restante);
$percentual = $totalLivros > 0 ? (int) floor($vistos * 100 / $totalLivros) : 0;
$qs = 'ordem=' . urlencode($ordemAtual)
    . ($busca !== '' ? '&busca=' . urlencode($busca) : '')
    . ($categoriaAtual !== '' ? '&categoria=' . urlencode($categoriaAtual) : '')
    . (!empty($soFavoritos) ? '&favoritos=1' : '');
$linkMais = '?pagina=' . ($paginaAtual + 1) . '&' . $qs;
$fmt = static fn(int $n): string => number_format($n, 0, ',', '.');
?>

<nav data-testid="pagination-container" class="mais" id="paginationNav" aria-label="Carregar mais livros"
     data-pagina-atual="<?= $paginaAtual ?>" data-total-livros="<?= $totalLivros ?>">

    <?php if ($totalLivros > 0): ?>
    <p data-testid="pagination-status-info" class="mais__resumo" aria-live="polite">
        <?php if ($restante > 0): ?>
            Você viu <b data-testid="pagination-status-current"><?= $fmt($vistos) ?></b> de <span data-testid="pagination-status-total"><?= $fmt($totalLivros) ?></span> <?= $totalLivros === 1 ? 'livro' : 'livros' ?>
        <?php else: ?>
            Você viu todos os <b data-testid="pagination-status-current"><?= $fmt($vistos) ?></b> <?= $vistos === 1 ? 'livro' : 'livros' ?>
        <?php endif; ?>
    </p>

    <div class="mais__barra" role="progressbar" aria-label="Livros vistos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?= $percentual ?>">
        <i style="width: <?= $percentual ?>%"></i>
    </div>
    <?php endif; ?>

    <?php if ($restante > 0): ?>
    <a data-testid="btn-mostrar-mais" id="btnMostrarMais" href="<?= e($linkMais) ?>" class="mais__botao" data-proxima="<?= $paginaAtual + 1 ?>">
        Mostrar mais <?= $fmt($proximos) ?> <?= $proximos === 1 ? 'livro' : 'livros' ?>
    </a>
    <?php elseif ($totalLivros > ITENS_POR_PAGINA): ?>
    <button type="button" class="mais__topo" data-acao="topo" data-testid="btn-topo-fim">
        <i class="fas fa-arrow-up" aria-hidden="true"></i> Voltar ao topo
    </button>
    <?php endif; ?>
</nav>
