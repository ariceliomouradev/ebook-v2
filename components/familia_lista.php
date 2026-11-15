<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
// Fragmento da lista de acessos da família. Entrada: $dependentes (id, nome, email, criado_em).
$dependentes = $dependentes ?? [];
?>
<?php foreach ($dependentes as $d): ?>
<div class="d-flex align-items-center justify-content-between gap-2 py-2 border-bottom border-secondary" data-testid="item-dependente">
    <div style="min-width: 0;">
        <div class="fw-semibold text-light"><?= e($d['nome']) ?></div>
        <div class="text-muted small"><?= e($d['email']) ?></div>
    </div>
    <button type="button" class="btn btn-sm btn-outline-danger btn-icone btn-familia-remover" data-id="<?= (int) $d['id'] ?>" data-nome="<?= e($d['nome']) ?>" data-testid="btn-familia-remover" aria-label="Remover o acesso de <?= e($d['nome']) ?>" title="Remover acesso">
        <i class="fas fa-trash" aria-hidden="true"></i>
    </button>
</div>
<?php endforeach; ?>
<?php if (!$dependentes): ?>
<div class="text-center py-4 text-muted small" data-testid="familia-vazia">Nenhum acesso extra ainda.</div>
<?php endif; ?>
