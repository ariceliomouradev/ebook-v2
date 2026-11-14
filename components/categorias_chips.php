<?php
/**
 * Filtro por categoria (chips). Entrada: $categorias (slug, nome, total), $categoriaAtual (slug ou '').
 * A navegação é feita por assets/js/app.js (AJAX); o href é o fallback sem JavaScript.
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
$categorias = $categorias ?? [];
$categoriaAtual = $categoriaAtual ?? '';
if (!$categorias) {
    return;
}
$totalGeral = array_sum(array_map(fn($c) => (int) $c['total'], $categorias));
$href = fn(string $slug): string => '?ordem=' . urlencode($ordemAtual ?? 'recentes') . ($slug !== '' ? '&categoria=' . urlencode($slug) : '');
?>
<nav class="chips" aria-label="Categorias" data-testid="categorias" id="chipsCategorias">
    <div class="chips__trilho" data-arrastar>
        <a href="<?= $href('') ?>" class="chip<?= $categoriaAtual === '' ? ' is-ativo' : '' ?>" data-categoria="" data-testid="chip-categoria"
           <?= $categoriaAtual === '' ? 'aria-current="true"' : '' ?>>Todos <span class="chip__n"><?= number_format($totalGeral, 0, ',', '.') ?></span></a>
        <?php foreach ($categorias as $c): ?>
            <a href="<?= $href($c['slug']) ?>" class="chip<?= $categoriaAtual === $c['slug'] ? ' is-ativo' : '' ?>"
               data-categoria="<?= e($c['slug']) ?>" data-testid="chip-categoria"
               <?= $categoriaAtual === $c['slug'] ? 'aria-current="true"' : '' ?>><?= e($c['nome']) ?> <span class="chip__n"><?= number_format((int) $c['total'], 0, ',', '.') ?></span></a>
        <?php endforeach; ?>
    </div>
</nav>
