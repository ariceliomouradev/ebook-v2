<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
// Fragmento da fila de aprovação (mesmo desenho da lista do Gerenciar livros: capa, campos editáveis, chips e ações).
// Entrada: $pendentes (id, titulo, autor, formato, capa_arquivo, enviado_por, perfil_envio, data_upload, duplicado[exato|provavel]).
// Exibido dentro de index.php (como book_list.php): capas e links são relativos à raiz do site.
$pendentes = $pendentes ?? [];
$totalPendentes = $totalPendentes ?? count($pendentes);
$raiz = '';
?>
<?php foreach ($pendentes as $p):
    $dup = $p['duplicado'];
    $ehEpub = ($p['formato'] ?? 'pdf') === 'epub';
?>
<div class="item-aprovacao gl-item gl-item--aprov" data-testid="item-aprovacao" data-id="<?= (int) $p['id'] ?>">
    <?php if ($ehEpub): ?>
    <a class="gl-capa" data-analise="aprovacoes" href="<?= $raiz ?>leitor?id=<?= (int) $p['id'] ?>" tabindex="-1" aria-hidden="true">
    <?php else: ?>
    <button type="button" class="gl-capa btn-aprov-ver" data-id="<?= (int) $p['id'] ?>" data-titulo="<?= e($p['titulo']) ?>" tabindex="-1" aria-hidden="true">
    <?php endif; ?>
        <?php if (!empty($p['capa_arquivo'])): ?>
            <img src="<?= $raiz ?>capas/<?= e($p['capa_arquivo']) ?>" alt="" loading="lazy">
        <?php else: ?>
            <span class="gl-capa__vazia capa-v<?= ((int) $p['id'] % 4) + 1 ?>"><i class="fas fa-book"></i></span>
        <?php endif; ?>
        <?php if ($ehEpub): ?><span class="selo-formato">EPUB</span><?php endif; ?>
    <?php if ($ehEpub): ?></a><?php else: ?></button><?php endif; ?>

    <div class="gl-info">
        <input type="text" class="gl-input gl-input--titulo aprov-titulo" value="<?= e($p['titulo']) ?>" maxlength="255" aria-label="Título do livro enviado" data-testid="input-aprov-titulo">
        <input type="text" class="gl-input aprov-autor" value="<?= e($p['autor'] ?? '') ?>" maxlength="255" placeholder="Autor" aria-label="Autor de <?= e($p['titulo']) ?>" data-testid="input-aprov-autor">
        <div class="gl-chips">
            <span class="gl-chip"><i class="fas fa-user" aria-hidden="true"></i> <?= e($p['enviado_por'] ?? 'usuário removido') ?> (<?= e(rotuloPerfil((string) $p['perfil_envio'])) ?>)</span>
            <span class="gl-chip"><i class="far fa-calendar" aria-hidden="true"></i> <?= e(date('d/m/Y H:i', strtotime($p['data_upload']))) ?></span>
            <span class="gl-chip"><?= $ehEpub ? 'EPUB' : 'PDF' ?></span>
            <?php if ($dup['exato']): ?>
                <span class="vis-selo vis-selo--oculto" data-testid="aprovacao-duplicado"><i class="fas fa-clone" aria-hidden="true"></i> Mesmo arquivo de “<?= e($dup['exato']['titulo']) ?>”</span>
            <?php elseif ($dup['provavel']): ?>
                <span class="vis-selo vis-selo--agendado" data-testid="aprovacao-duplicado"><i class="fas fa-clone" aria-hidden="true"></i> Parece repetido: já existe “<?= e($dup['provavel']['titulo']) ?>”</span>
            <?php else: ?>
                <span class="vis-selo vis-selo--publico"><i class="fas fa-circle-check" aria-hidden="true"></i> Livro novo</span>
            <?php endif; ?>
        </div>
    </div>

    <div class="gl-acoes">
        <?php if ($ehEpub): ?>
            <a class="gl-btn" data-analise="aprovacoes" href="<?= $raiz ?>leitor?id=<?= (int) $p['id'] ?>" data-testid="btn-aprov-ver-epub" aria-label="Abrir <?= e($p['titulo']) ?> para analisar" title="Abrir para analisar (não conta como leitura); o Voltar traz você de volta às Aprovações">
                <i class="fas fa-book-open" aria-hidden="true"></i> <span>Abrir</span>
            </a>
        <?php else: ?>
            <button type="button" class="gl-btn btn-aprov-ver" data-id="<?= (int) $p['id'] ?>" data-titulo="<?= e($p['titulo']) ?>" data-testid="btn-aprov-ver" aria-label="Abrir <?= e($p['titulo']) ?> para analisar" title="Abrir para analisar, editar e escolher quem vê">
                <i class="fas fa-book-open" aria-hidden="true"></i> <span>Abrir</span>
            </button>
        <?php endif; ?>
        <button type="button" class="gl-btn gl-btn--negar btn-aprov-negar" data-id="<?= (int) $p['id'] ?>" data-testid="btn-aprov-negar"><i class="fas fa-xmark" aria-hidden="true"></i> <span>Negar</span></button>
        <?php if (!$dup['exato']): ?>
        <button type="button" class="gl-btn gl-btn--primario btn-aprov-aprovar" data-id="<?= (int) $p['id'] ?>" data-testid="btn-aprov-aprovar"><i class="fas fa-check" aria-hidden="true"></i> <span>Aprovar</span></button>
        <?php endif; ?>
    </div>
</div>
<?php endforeach; ?>
<?php if (!$pendentes): ?>
<div class="text-center py-5 text-muted" data-testid="aprovacoes-vazio">
    <i class="fas fa-inbox d-block mb-3 fs-1 text-secondary"></i>Nenhum pedido aguardando análise.
</div>
<?php endif; ?>
