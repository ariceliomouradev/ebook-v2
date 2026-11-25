<?php
/**
 * Anúncio em banner quadrado, aberto sobre a tela (assets/js/anuncio.js), sempre com botão de fechar.
 * Quando abre:
 *   - ao entrar no sistema (primeira vez na aba) e ao voltar de um livro  -> $momento = 'biblioteca'
 *   - ao abrir um livro                                                    -> $momento = 'leitor'
 * Só aparece para quem tem ANUNCIOS_PERFIS (Administrador e Grátis). Pro nunca vê.
 * Entradas: $pdo, $momento. Pode ser incluído de qualquer página (usa caminhos relativos à raiz do site).
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
require_once __DIR__ . '/../includes/banners.php';

if (!perfilVeAnuncios()) {
    return;
}
$momento = ($momento ?? 'biblioteca') === 'leitor' ? 'leitor' : 'biblioteca';
$raizAnuncio = defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '';
try {
    $anuncios = listarBanners($pdo, 'q');
} catch (PDOException $e) { // banco sem a migração v1.16
    return;
}
if (!$anuncios) {
    return;
}
$dadosAnuncio = array_map(static fn (array $b) => [
    'src'  => bannerUrl($b, $raizAnuncio),
    'alt'  => (string) $b['alt'],
    'link' => (string) ($b['link'] ?? ''),
], $anuncios);
?>
<link rel="stylesheet" href="<?= asset('assets/css/anuncio.css') ?>">
<div class="anuncio" id="anuncio" data-testid="anuncio" role="dialog" aria-modal="true" aria-label="Anúncio" hidden>
    <div class="anuncio__caixa">
        <button type="button" class="anuncio__fechar" id="anuncioFechar" data-testid="anuncio-fechar" aria-label="Fechar anúncio" title="Fechar"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        <a class="anuncio__arte" id="anuncioLink" data-testid="anuncio-link" target="_blank" rel="noopener noreferrer" hidden>
            <img id="anuncioImgLink" alt="" draggable="false">
        </a>
        <div class="anuncio__arte" id="anuncioSemLink"><img id="anuncioImg" data-testid="anuncio-img" alt="" draggable="false"></div>
        <span class="anuncio__selo">Anúncio</span>
    </div>
</div>
<script type="application/json" id="anuncio-dados"><?= json_encode(['momento' => $momento, 'banners' => $dadosAnuncio], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES) ?></script>
<script src="<?= asset('assets/js/anuncio.js') ?>"></script>
