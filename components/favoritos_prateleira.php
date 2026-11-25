<?php
/**
 * Prateleira "Favoritos": uma linha de capas com rolagem horizontal (setas só no computador, aparecem quando há mais
 * livros para o lado). Entrada: $favoritosPrateleira (lista de listarFavoritos) e $raiz ('' no painel, '../' em api/).
 * Também é devolvida por api/favoritos.php para atualizar a prateleira quando um coração é marcado ou desmarcado.
 * Sempre imprime a <section> (vazia = oculta), para o JS ter onde encaixar o conteúdo novo.
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
$favoritosPrateleira = $favoritosPrateleira ?? [];
$raiz = $raiz ?? '';
?>
<section class="prateleira<?= $favoritosPrateleira ? '' : ' is-vazia' ?>" id="prateleiraFavoritos" aria-labelledby="tituloPrateleiraFav" data-testid="prateleira-favoritos"<?= !empty($prateleiraOculta) ? ' hidden' : '' ?>>
    <div class="secao-cabecalho">
        <h2 class="secao-titulo" id="tituloPrateleiraFav">Favoritos</h2>
        <span class="prateleira__contagem" data-testid="total-favoritos"><?= count($favoritosPrateleira) ?></span>
    </div>
    <div class="prateleira__corpo">
        <button type="button" class="prateleira__seta prateleira__seta--esq" data-seta="-1" aria-label="Ver favoritos anteriores" hidden>
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="prateleira__trilho" tabindex="-1">
            <?php foreach ($favoritosPrateleira as $l): ?>
            <a class="prateleira__item" href="<?= $raiz ?>leitor?id=<?= (int) $l['id'] ?>" data-testid="favorito-item"
               aria-label="Abrir <?= e($l['titulo']) ?><?= !empty($l['autor']) ? ', de ' . e($l['autor']) : '' ?>" title="<?= e($l['titulo']) ?>">
                <?php if (!empty($l['capa_arquivo'])): ?>
                    <img src="<?= $raiz ?>capas/<?= e($l['capa_arquivo']) ?>" alt="" loading="lazy" draggable="false">
                <?php else: ?>
                    <span class="prateleira__sem-capa" aria-hidden="true"><?= e($l['titulo']) ?></span>
                <?php endif; ?>
                <?php if (($l['formato'] ?? 'pdf') === 'epub'): ?><span class="selo-formato">EPUB</span><?php endif; ?>
            </a>
            <?php endforeach; ?>
        </div>
        <button type="button" class="prateleira__seta prateleira__seta--dir" data-seta="1" aria-label="Ver mais favoritos" hidden>
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
    </div>
</section>
