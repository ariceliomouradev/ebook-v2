<?php
/**
 * Leitor de EPUB. Não é aberto direto: views/leitor.php o inclui quando o livro tem formato 'epub'
 * (já com a sessão, o livro e a permissão de leitura conferidos).
 */
if (!isset($livro, $id, $ehFavorito)) {
    http_response_code(404);
    exit;
}
$posicaoAtual = $posicaoAtual ?? null;
?>
<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Lendo: <?= e($livro['titulo']) ?></title>

    <meta name="theme-color" content="#0d0f14">
    <meta name="color-scheme" content="dark">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <meta name="apple-mobile-web-app-title" content="Meus Livros">
    <meta name="application-name" content="Meus Livros">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
    <link rel="icon" href="assets/icons/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha384-3B6NwesSXE7YJlcLI9RpRqGf2p/EgVH8BgoKTaUrmKNDkHPStTQ3EyoYjCGXaOTS" crossorigin="anonymous">

    <!-- epub.js 0.3 não está no cdnjs (só a 0.2, API antiga): vem do jsDelivr, já liberado na CSP -->
    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js" integrity="sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js" integrity="sha384-ZqmkDa/1AGF4SKdSmXgEG+3G+Gsb6yNqUSq2Mqp0jDf1GWk+UY5eNbEd7hgwiywI" crossorigin="anonymous"></script>

    <link rel="stylesheet" href="<?= asset('assets/css/leitor.css') ?>">
    <link rel="stylesheet" href="<?= asset('assets/css/leitor-epub.css') ?>">
</head>
<body data-tema="escuro" class="leitor-epub">

<div class="leitor-progresso" aria-hidden="true"><span id="barraProgresso" data-testid="leitor-barra-progresso"></span></div>

<header class="hud-topo" id="hudTopo" data-testid="hud-topo">
    <a data-testid="btn-back-library" href="<?= e($urlVoltar) ?>" class="btn-voltar" title="Voltar: <?= e($rotuloVoltar) ?>" aria-label="Voltar: <?= e($rotuloVoltar) ?>">
        <i class="fas fa-chevron-left" aria-hidden="true"></i><span class="btn-voltar__texto"><?= e($rotuloVoltar) ?></span>
    </a>

    <div class="hud-titulo">
        <h1 class="hud-titulo__nome" data-testid="leitor-titulo"><?= e($livro['titulo']) ?></h1>
        <span class="hud-titulo__info" id="progressoTexto" data-testid="leitor-progresso-texto" aria-live="polite">Abrindo…</span>
        <?php if ($analise !== ''): ?><span class="hud-analise" data-testid="leitor-modo-analise"><i class="fas fa-magnifying-glass" aria-hidden="true"></i> Modo análise: não conta como leitura</span><?php endif; ?>
    </div>

    <button data-testid="btn-favorito-leitor" class="btn-hud btn-hud--topo btn-hud--favorito<?= $ehFavorito ? ' is-ativo' : '' ?>" id="btnFavoritoLeitor" type="button"
            aria-pressed="<?= $ehFavorito ? 'true' : 'false' ?>" aria-label="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>" title="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>">
        <i class="<?= $ehFavorito ? 'fas' : 'far' ?> fa-heart" aria-hidden="true"></i>
    </button>
    <button data-testid="btn-sumario" class="btn-hud btn-hud--topo" id="btnSumario" type="button" title="Sumário" aria-label="Sumário do livro" aria-expanded="false" aria-controls="painelSumario">
        <i class="fas fa-list-ul" aria-hidden="true"></i>
    </button>
    <button data-testid="btn-fullscreen" class="btn-hud btn-hud--topo" id="btnFullscreen" type="button" title="Tela Cheia" aria-label="Tela cheia">
        <i class="fas fa-expand" id="iconFull" aria-hidden="true"></i>
    </button>
</header>

<!-- Palco: cobre a tela; o texto (iframe do epub.js) fica centralizado em #epubViewer -->
<main id="epubPalco" class="epub-palco" data-testid="epub-palco">
    <div id="epubViewer" class="epub-viewer" data-testid="epub-viewer" tabindex="-1" aria-label="Texto do livro"></div>
</main>

<div class="leitor-estado" id="leitorCarregando" role="status" data-testid="leitor-carregando">
    <div class="leitor-spinner" aria-hidden="true"></div>
    <p>Abrindo o livro…</p>
</div>

<div class="leitor-estado leitor-estado--erro" id="leitorErro" role="alert" data-testid="leitor-erro" hidden>
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>Não foi possível abrir este livro.</p>
    <a class="btn-voltar" href="<?= url('index.php') ?>"><i class="fas fa-chevron-left" aria-hidden="true"></i><span>Voltar à biblioteca</span></a>
</div>

<aside class="painel-sumario" id="painelSumario" data-testid="painel-sumario" aria-label="Sumário" hidden>
    <div class="painel-sumario__topo">
        <h2>Sumário</h2>
        <button type="button" class="pop-anot__x" id="btnFecharSumario" aria-label="Fechar sumário" data-testid="btn-fechar-sumario"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <ul class="painel-sumario__lista" id="listaSumario" data-testid="lista-sumario"></ul>
</aside>

<nav class="hud-menu" id="menuPrincipal" data-testid="hud-menu" aria-label="Controles de leitura">
    <div class="hud-group">
        <button data-testid="btn-epub-prev" class="btn-hud" id="btnEpubAnterior" type="button" title="Voltar" aria-label="Voltar uma tela">
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="epub-percentual" id="epubPercentual" data-testid="text-epub-progresso" aria-live="off">…</span>
        <button data-testid="btn-epub-next" class="btn-hud" id="btnEpubProximo" type="button" title="Avançar" aria-label="Avançar uma tela">
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
    </div>

    <div class="divider" aria-hidden="true"></div>

    <div class="hud-group hud-group--zoom">
        <button data-testid="btn-fonte-menos" class="btn-hud epub-fonte" id="btnFonteMenos" type="button" title="Diminuir a letra" aria-label="Diminuir a letra">A<small>−</small></button>
        <button data-testid="btn-fonte-mais" class="btn-hud epub-fonte" id="btnFonteMais" type="button" title="Aumentar a letra" aria-label="Aumentar a letra">A<small>+</small></button>
    </div>

    <button data-testid="btn-tema" class="btn-hud" id="btnTema" type="button" title="Trocar o tema" aria-label="Trocar o tema da leitura">
        <i class="fas fa-circle-half-stroke" aria-hidden="true"></i>
    </button>
</nav>

<script type="application/json" id="livro-config">
<?= json_encode([
    'id'            => (int) $id,
    'url'           => caminhoRaiz() . 'api/download.php?id=' . $id,
    'progressoUrl'  => $analise === '' ? caminhoRaiz() . 'api/progresso.php?id=' . $id : '', // vazio = não grava progresso
    'analise'       => $analise !== '',
    'favoritosUrl'  => caminhoRaiz() . 'api/favoritos.php',
    'posicao'       => $posicaoAtual,
    'csrfToken'     => csrf_token(),
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
</script>

<script src="<?= asset('assets/js/sessao.js') ?>"></script>
<?php if ($analise === '') { $momento = 'leitor'; include __DIR__ . '/../components/anuncio_modal.php'; } /* análise: sem anúncio */ ?>
<script src="<?= asset('assets/js/leitor-epub.js') ?>"></script>

</body>
</html>
