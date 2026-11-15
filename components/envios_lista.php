<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
// Fragmento da lista "Meus envios". Entrada: $envios (id, titulo, autor, publicacao, motivo_negado, data_upload).
$envios = $envios ?? [];
$rotulos = [
    'privado'  => ['Só na sua biblioteca', 'vis-selo--oculto', 'fa-lock'],
    'pendente' => ['Em análise', 'vis-selo--agendado', 'fa-hourglass-half'],
    'aprovado' => ['Publicado no acervo', 'vis-selo--publico', 'fa-check'],
    'negado'   => ['Não publicado', 'vis-selo--oculto', 'fa-ban'],
];
?>
<?php foreach ($envios as $envio):
    [$texto, $classe, $icone] = $rotulos[$envio['publicacao']] ?? $rotulos['privado'];
    $podePedir = in_array($envio['publicacao'], ['privado', 'negado'], true);
?>
<div class="item-envio d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 py-3 border-bottom border-secondary" data-testid="item-envio" data-id="<?= (int) $envio['id'] ?>">
    <div class="flex-grow-1" style="min-width: 0;">
        <div class="fw-semibold text-light" style="word-wrap: break-word;"><?= e($envio['titulo']) ?></div>
        <div class="text-muted small"><?= e($envio['autor'] ?? '') ?></div>
        <span class="vis-selo <?= e($classe) ?> mt-1" data-testid="envio-status"><i class="fas <?= e($icone) ?>" aria-hidden="true"></i> <?= e($texto) ?></span>
        <?php if ($envio['publicacao'] === 'negado' && !empty($envio['motivo_negado'])): ?>
            <div class="small text-secondary mt-1"><?= e($envio['motivo_negado']) ?></div>
        <?php endif; ?>
    </div>
    <div class="d-flex gap-2 justify-content-end">
        <?php if ($envio['publicacao'] !== 'aprovado'): ?>
        <button type="button" class="btn btn-sm btn-outline-danger btn-icone btn-envio-excluir" data-id="<?= (int) $envio['id'] ?>" data-testid="btn-envio-excluir" aria-label="Excluir <?= e($envio['titulo']) ?>" title="Excluir">
            <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
        <?php endif; ?>
        <?php if ($podePedir): ?>
        <button type="button" class="btn btn-sm btn-outline-warning btn-envio-solicitar" data-id="<?= (int) $envio['id'] ?>" data-testid="btn-envio-solicitar">
            <i class="fas fa-share-nodes me-1" aria-hidden="true"></i>Pedir publicação
        </button>
        <?php endif; ?>
    </div>
</div>
<?php endforeach; ?>
<?php if (!$envios): ?>
<div class="text-center py-5 text-muted" data-testid="envios-vazio">
    <i class="fas fa-folder-open d-block mb-3 fs-1 text-secondary"></i>
    Você ainda não enviou nenhum livro. Use o botão <strong>Adicionar</strong>.
</div>
<?php endif; ?>
