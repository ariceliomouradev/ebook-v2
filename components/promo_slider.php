<?php
/**
 * Carrossel de divulgação, sem setas nem indicadores: troca sozinho (assets/js/promo.js).
 * Entrada: $formato = 'h' (faixa, telas < 1200px) ou 'v' (lateral, telas largas); $pdo.
 * Contribuidor não vê banners (regra de perfil), então quem inclui este arquivo já filtrou.
 *
 * Os banners vêm da tabela `banners` (gerenciada pelo admin no menu do perfil). Banner com link
 * vira clicável e abre em nova aba; sem link, é só imagem.
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
require_once __DIR__ . '/../includes/banners.php';

$formato = ($formato ?? 'h') === 'v' ? 'v' : 'h';
$raiz = defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '';
$slides = listarBanners($pdo, $formato);

if (!$slides) {
    return;
}
?>
<div class="promo promo--<?= $formato ?>" data-promo role="region" aria-roledescription="carrossel" aria-label="Destaques" data-testid="promo-<?= $formato ?>">
    <?php foreach ($slides as $i => $s):
        $src = bannerUrl($s, $raiz);
        // Arte enviada pode ter outra proporção: aparece inteira sobre um fundo desfocado, sem cortes.
        $ajustar = bannerEhEnviado($s);
    ?>
        <div class="promo__slide<?= $i === 0 ? ' is-active' : '' ?><?= $ajustar ? ' promo__slide--ajustar' : '' ?>" data-testid="promo-slide"<?= $ajustar ? ' style="--fundo: url(\'' . e($src) . '\')"' : '' ?><?= $i === 0 ? '' : ' aria-hidden="true"' ?>>
            <?php if (!empty($s['link'])): ?>
                <a href="<?= e($s['link']) ?>" target="_blank" rel="noopener noreferrer" tabindex="<?= $i === 0 ? '0' : '-1' ?>" data-testid="promo-link"
                   aria-label="<?= e($s['alt']) ?> (abre em nova aba)">
                    <img data-testid="promo-slide-img" src="<?= e($src) ?>" alt="<?= e($s['alt']) ?>" draggable="false">
                </a>
            <?php else: ?>
                <img data-testid="promo-slide-img" src="<?= e($src) ?>" alt="<?= e($s['alt']) ?>" draggable="false">
            <?php endif; ?>
        </div>
    <?php endforeach; ?>
</div>
