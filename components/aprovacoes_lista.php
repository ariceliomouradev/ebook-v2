<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
// Fragmento da fila de aprovação. Entrada: $pendentes (id, titulo, autor, enviado_por, perfil_envio, data_upload, duplicado[exato|provavel]).
$pendentes = $pendentes ?? [];
$totalPendentes = $totalPendentes ?? count($pendentes);
?>
<?php foreach ($pendentes as $p): $dup = $p['duplicado']; ?>
<div class="item-aprovacao d-flex flex-column gap-2 py-3 border-bottom border-secondary" data-testid="item-aprovacao" data-id="<?= (int) $p['id'] ?>">
    <div class="d-flex flex-column flex-md-row justify-content-between gap-2">
        <div style="min-width: 0;">
            <div class="fw-semibold text-light" style="word-wrap: break-word;"><?= e($p['titulo']) ?></div>
            <div class="mt-1"><input type="text" class="form-control form-control-sm bg-secondary text-light border-0 aprov-autor" value="<?= e($p['autor'] ?? '') ?>" maxlength="255" aria-label="Autor de <?= e($p['titulo']) ?>" data-testid="input-aprov-autor"></div>
            <div class="text-secondary small mt-1">
                Enviado por <strong><?= e($p['enviado_por'] ?? 'usuário removido') ?></strong>
                (<?= e(rotuloPerfil((string) $p['perfil_envio'])) ?>) em <?= e(date('d/m/Y H:i', strtotime($p['data_upload']))) ?>
                · <button type="button" class="btn btn-link btn-sm p-0 align-baseline btn-aprov-ver" data-id="<?= (int) $p['id'] ?>" data-titulo="<?= e($p['titulo']) ?>" data-testid="btn-aprov-ver"><i class="fas fa-eye me-1" aria-hidden="true"></i>ver PDF</button>
            </div>
            <?php if ($dup['exato']): ?>
                <span class="vis-selo vis-selo--oculto mt-2" data-testid="aprovacao-duplicado"><i class="fas fa-clone" aria-hidden="true"></i> Mesmo arquivo de “<?= e($dup['exato']['titulo']) ?>”</span>
            <?php elseif ($dup['provavel']): ?>
                <span class="vis-selo vis-selo--agendado mt-2" data-testid="aprovacao-duplicado"><i class="fas fa-clone" aria-hidden="true"></i> Parece repetido: já existe “<?= e($dup['provavel']['titulo']) ?>”</span>
            <?php else: ?>
                <span class="vis-selo vis-selo--publico mt-2"><i class="fas fa-circle-check" aria-hidden="true"></i> Livro novo</span>
            <?php endif; ?>
        </div>
        <div class="d-flex gap-2 align-self-md-center justify-content-end">
            <button type="button" class="btn btn-sm btn-outline-danger btn-aprov-negar" data-id="<?= (int) $p['id'] ?>" data-testid="btn-aprov-negar"><i class="fas fa-xmark me-1" aria-hidden="true"></i>Negar</button>
            <?php if (!$dup['exato']): ?>
            <button type="button" class="btn btn-sm btn-neon btn-aprov-aprovar" data-id="<?= (int) $p['id'] ?>" data-testid="btn-aprov-aprovar"><i class="fas fa-check me-1" aria-hidden="true"></i>Aprovar</button>
            <?php endif; ?>
        </div>
    </div>
</div>
<?php endforeach; ?>
<?php if (!$pendentes): ?>
<div class="text-center py-5 text-muted" data-testid="aprovacoes-vazio">
    <i class="fas fa-inbox d-block mb-3 fs-1 text-secondary"></i>Nenhum pedido aguardando análise.
</div>
<?php endif; ?>
