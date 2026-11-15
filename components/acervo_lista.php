<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
// Fragmento do "Explorar acervo". Entradas: $livros (id, titulo, autor, categoria), $vagas (livres, total, usadas).
$livros = $livros ?? [];
$temVaga = ($vagas['livres'] ?? 0) > 0;
?>
<?php foreach ($livros as $l): ?>
<div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 py-3 border-bottom border-secondary" data-testid="item-acervo" data-id="<?= (int) $l['id'] ?>">
    <div style="min-width: 0;">
        <div class="fw-semibold text-light" style="word-wrap: break-word;"><?= e($l['titulo']) ?></div>
        <div class="text-muted small"><?= e($l['autor'] ?? '') ?><?= !empty($l['categoria']) ? ' · ' . e($l['categoria']) : '' ?></div>
    </div>
    <button type="button" class="btn btn-sm <?= $temVaga ? 'btn-neon' : 'btn-outline-secondary' ?> btn-acervo-liberar" data-id="<?= (int) $l['id'] ?>" data-testid="btn-acervo-liberar" <?= $temVaga ? '' : 'disabled' ?>>
        <i class="fas fa-unlock me-1" aria-hidden="true"></i>Liberar
    </button>
</div>
<?php endforeach; ?>
<?php if (!$livros): ?>
<div class="text-center py-5 text-muted" data-testid="acervo-vazio">
    <i class="fas fa-book-open d-block mb-3 fs-1 text-secondary"></i>Nenhum livro disponível<?= ($busca ?? '') !== '' ? ' para esta pesquisa' : ' no momento' ?>.
</div>
<?php endif; ?>
