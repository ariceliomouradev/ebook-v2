<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
// Só aparece na primeira página, sem busca: é um atalho, não um resultado.
$emAndamento = $emAndamento ?? [];
if (!$emAndamento) {
    return;
}
?>
<section class="continuar" id="faixaContinuar" aria-labelledby="tituloContinuar" data-testid="continuar-lendo">
    <div class="secao-cabecalho">
        <h2 class="secao-titulo" id="tituloContinuar">Continue lendo</h2>
    </div>
    <div class="continuar-trilho">
        <?php foreach ($emAndamento as $l): ?>
        <a class="continuar-card" href="<?= url('leitor') ?>?id=<?= (int) $l['id'] ?>" data-testid="continuar-item"
           aria-label="Continuar <?= e($l['titulo']) ?> de onde parou, <?= (int) $l['porcentagem'] ?>% lido">
            <?php if (!empty($l['capa_arquivo'])): ?>
                <img class="continuar-capa" src="capas/<?= e($l['capa_arquivo']) ?>" alt="" loading="lazy">
            <?php else: ?>
                <div class="continuar-capa" aria-hidden="true"></div>
            <?php endif; ?>
            <div class="continuar-info">
                <span class="continuar-titulo"><?= e($l['titulo']) ?></span>
                <span class="continuar-autor"><?= e($l['autor'] ?? '') ?></span>
                <div class="progress" role="progressbar" aria-label="Progresso" aria-valuenow="<?= (int) $l['porcentagem'] ?>" aria-valuemin="0" aria-valuemax="100">
                    <div class="progress-bar bg-info" style="width: <?= (int) $l['porcentagem'] ?>%"></div>
                </div>
                <span class="continuar-meta">Página <?= (int) $l['progresso'] ?> de <?= (int) $l['total_paginas'] ?> · <?= (int) $l['porcentagem'] ?>%</span>
            </div>
            <span class="continuar-play" aria-hidden="true"><i class="fas fa-play"></i></span>
        </a>
        <?php endforeach; ?>
    </div>
</section>
