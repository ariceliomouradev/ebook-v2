<?php
define('CAMINHO_RAIZ', '');
require_once '../config/bootstrap.php';
require_login();
require_once '../includes/repositorios.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    http_response_code(400);
    die('Livro não especificado.');
}

$paginaVoltar = max(1, (int) ($_GET['origem'] ?? 1));
$ordemVoltar = $_GET['ordem'] ?? 'recentes';
$buscaVoltar = $_GET['busca'] ?? '';

$stmt = $pdo->prepare("SELECT id, titulo, nome_arquivo, formato FROM livros WHERE id = ?");
$stmt->execute([$id]);
$livro = $stmt->fetch();

if (!$livro || !usuarioPodeVerLivro($pdo, $id, $_SESSION['usuario_perfil'], (int) $_SESSION['usuario_id'], titularDaSessao())) {
    http_response_code(404);
    die('Livro não encontrado.');
}

$stmtProgresso = $pdo->prepare("SELECT progresso, posicao FROM leituras WHERE usuario_id = ? AND livro_id = ?");
$stmtProgresso->execute([$_SESSION['usuario_id'], $id]);
$leitura = $stmtProgresso->fetch() ?: [];
$progressoAtual = (int) ($leitura['progresso'] ?? 0) ?: 1;
$posicaoAtual = $leitura['posicao'] ?? null; // EPUB: onde a pessoa parou (CFI)

$stmtFav = $pdo->prepare('SELECT 1 FROM favoritos WHERE usuario_id = ? AND livro_id = ?');
$stmtFav->execute([$_SESSION['usuario_id'], $id]);
$ehFavorito = (bool) $stmtFav->fetchColumn();

// EPUB tem leitor próprio (texto que reflui, sem páginas fixas); o resto desta página é o leitor de PDF.
if (($livro['formato'] ?? 'pdf') === 'epub') {
    require __DIR__ . '/leitor_epub.php';
    exit;
}
?>

<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Lendo: <?= e($livro['titulo']) ?></title>

    <!-- Cor da interface do navegador: pinta a barra de endereços do Chrome no
         Android e o topo do Safari no iOS 15+ com o mesmo tom do fundo da página,
         em vez de deixar a faixa clara padrão emendando com o tema escuro.
         color-scheme faz controles de formulário e barras de rolagem nativas
         seguirem o tema escuro; os metas apple-* valem quando o site é salvo na
         tela de início do iPhone. -->
    <meta name="theme-color" content="#07090d">
    <meta name="color-scheme" content="dark">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <meta name="apple-mobile-web-app-title" content="Meus Livros">
    <meta name="application-name" content="Meus Livros">
    <meta name="msapplication-TileColor" content="#07090d">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
    <link rel="icon" href="assets/icons/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">

    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>

    <link rel="stylesheet" href="<?= asset('assets/css/leitor.css') ?>">
</head>
<body>

<!-- Barra de progresso fina no topo: quanto do livro já foi lido -->
<div class="leitor-progresso" aria-hidden="true"><span id="barraProgresso" data-testid="leitor-barra-progresso"></span></div>

<header class="hud-topo" id="hudTopo" data-testid="hud-topo">
    <a data-testid="btn-back-library" href="<?= url('index.php') ?>?pagina=<?= (int) $paginaVoltar ?>&ordem=<?= e($ordemVoltar) ?>&busca=<?= urlencode($buscaVoltar) ?>" class="btn-voltar" title="Voltar à Biblioteca" aria-label="Voltar à biblioteca">
        <i class="fas fa-chevron-left" aria-hidden="true"></i><span class="btn-voltar__texto">Biblioteca</span>
    </a>

    <div class="hud-titulo">
        <h1 class="hud-titulo__nome" data-testid="leitor-titulo"><?= e($livro['titulo']) ?></h1>
        <span class="hud-titulo__info" id="progressoTexto" data-testid="leitor-progresso-texto" aria-live="polite">Abrindo…</span>
    </div>

    <button data-testid="btn-favorito-leitor" class="btn-hud btn-hud--topo btn-hud--favorito<?= $ehFavorito ? ' is-ativo' : '' ?>" id="btnFavoritoLeitor" type="button"
            aria-pressed="<?= $ehFavorito ? 'true' : 'false' ?>" aria-label="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>" title="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>">
        <i class="<?= $ehFavorito ? 'fas' : 'far' ?> fa-heart" aria-hidden="true"></i>
    </button>
    <button data-testid="btn-anotacoes" class="btn-hud btn-hud--topo btn-hud--badge" id="btnAnotacoes" type="button" title="Minhas anotações" aria-label="Minhas anotações" aria-expanded="false">
        <i class="fas fa-list-ul" aria-hidden="true"></i><span class="hud-badge" id="contagemAnotacoes" data-testid="contagem-anotacoes" hidden>0</span>
    </button>
    <button data-testid="btn-marcador" class="btn-hud btn-hud--topo" id="btnMarcador" type="button" title="Marcar e anotar" aria-label="Marcar texto e anotar" aria-pressed="false">
        <i class="fas fa-highlighter" aria-hidden="true"></i>
    </button>

    <button data-testid="btn-fullscreen" class="btn-hud btn-hud--topo" id="btnFullscreen" title="Tela Cheia" aria-label="Tela cheia">
        <i class="fas fa-expand" id="iconFull" aria-hidden="true"></i>
    </button>
</header>

<div id="canvas-container" data-testid="pdf-container" tabindex="-1">
    <!-- uma página atrás da outra (rolagem contínua); o leitor.js cria os espaços e desenha só os que estão perto da tela -->
    <div id="paginas" data-testid="pdf-paginas"></div>
</div>

<div class="leitor-estado" id="leitorCarregando" role="status" data-testid="leitor-carregando">
    <div class="leitor-spinner" aria-hidden="true"></div>
    <p>Abrindo o livro…</p>
</div>

<div class="leitor-estado leitor-estado--erro" id="leitorErro" role="alert" data-testid="leitor-erro" hidden>
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>Não foi possível abrir este livro.</p>
    <a class="btn-voltar" href="<?= url('index.php') ?>"><i class="fas fa-chevron-left" aria-hidden="true"></i><span>Voltar à biblioteca</span></a>
</div>

<!-- Marcador: escolha a ferramenta e a cor; arraste sobre a página para marcar (serve para PDFs de imagem também) -->
<div class="barra-marcador" id="barraMarcador" data-testid="barra-marcador" role="toolbar" aria-label="Ferramentas de anotação" hidden>
    <button type="button" class="ferr" data-ferramenta="rolar" aria-pressed="false" data-testid="ferramenta-rolar" title="Rolar o livro"><i class="fas fa-hand" aria-hidden="true"></i><span>Rolar</span></button>
    <button type="button" class="ferr" data-ferramenta="texto" aria-pressed="false" data-testid="ferramenta-texto" title="Marcar o texto selecionado"><i class="fas fa-i-cursor" aria-hidden="true"></i><span>Texto</span></button>
    <button type="button" class="ferr" data-ferramenta="area" aria-pressed="true" data-testid="ferramenta-area" title="Marcar uma área (arraste) — serve para páginas que são imagem"><i class="fas fa-highlighter" aria-hidden="true"></i><span>Área</span></button>
    <button type="button" class="ferr" data-ferramenta="nota" aria-pressed="false" data-testid="ferramenta-nota" title="Adicionar uma nota (toque)"><i class="fas fa-comment-medical" aria-hidden="true"></i><span>Nota</span></button>
    <span class="barra-marcador__sep" aria-hidden="true"></span>
    <span class="cores" role="group" aria-label="Cor da marcação">
        <button type="button" class="cor-bolinha" data-cor="amarelo" style="--cor: var(--anot-amarelo)" aria-label="Amarelo" aria-pressed="false" title="Amarelo" data-testid="cor-amarelo"></button>
            <button type="button" class="cor-bolinha" data-cor="verde" style="--cor: var(--anot-verde)" aria-label="Verde" aria-pressed="false" title="Verde" data-testid="cor-verde"></button>
            <button type="button" class="cor-bolinha" data-cor="azul" style="--cor: var(--anot-azul)" aria-label="Azul" aria-pressed="false" title="Azul" data-testid="cor-azul"></button>
            <button type="button" class="cor-bolinha" data-cor="rosa" style="--cor: var(--anot-rosa)" aria-label="Rosa" aria-pressed="false" title="Rosa" data-testid="cor-rosa"></button>
            <button type="button" class="cor-bolinha" data-cor="laranja" style="--cor: var(--anot-laranja)" aria-label="Laranja" aria-pressed="false" title="Laranja" data-testid="cor-laranja"></button>
    </span>
    <span class="barra-marcador__sep" aria-hidden="true"></span>
    <button type="button" class="ferr ferr--icone" id="btnSairMarcador" aria-label="Sair do modo de anotação" title="Sair" data-testid="btn-sair-marcador"><i class="fas fa-xmark" aria-hidden="true"></i></button>
</div>

<!-- Aparece ao selecionar texto no modo "Texto" -->
<button type="button" class="bolha-texto" id="bolhaTexto" data-testid="bolha-marcar-texto" hidden><i class="fas fa-highlighter" aria-hidden="true"></i><span>Marcar</span></button>

<div class="aviso-anot" id="avisoAnotacao" role="status" aria-live="polite" hidden></div>

<!-- Janelinha de uma marcação: cor, comentário, salvar/apagar -->
<div class="pop-anot" id="popAnotacao" data-testid="popover-anotacao" role="dialog" aria-labelledby="popTitulo" hidden>
    <div class="pop-anot__topo">
        <strong id="popTitulo">Marcação</strong>
        <button type="button" class="pop-anot__x" id="btnFecharAnotacao" aria-label="Fechar" data-testid="btn-fechar-anotacao"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <div class="cores" role="group" aria-label="Trocar a cor">
        <button type="button" class="cor-bolinha" data-cor="amarelo" style="--cor: var(--anot-amarelo)" aria-label="Amarelo" aria-pressed="false" title="Amarelo" data-testid="pop-cor-amarelo"></button>
            <button type="button" class="cor-bolinha" data-cor="verde" style="--cor: var(--anot-verde)" aria-label="Verde" aria-pressed="false" title="Verde" data-testid="pop-cor-verde"></button>
            <button type="button" class="cor-bolinha" data-cor="azul" style="--cor: var(--anot-azul)" aria-label="Azul" aria-pressed="false" title="Azul" data-testid="pop-cor-azul"></button>
            <button type="button" class="cor-bolinha" data-cor="rosa" style="--cor: var(--anot-rosa)" aria-label="Rosa" aria-pressed="false" title="Rosa" data-testid="pop-cor-rosa"></button>
            <button type="button" class="cor-bolinha" data-cor="laranja" style="--cor: var(--anot-laranja)" aria-label="Laranja" aria-pressed="false" title="Laranja" data-testid="pop-cor-laranja"></button>
    </div>
    <blockquote class="pop-anot__trecho" id="popTrecho" data-testid="pop-trecho" hidden></blockquote>
    <label class="visually-hidden" for="inputComentario">Comentário</label>
    <textarea id="inputComentario" class="pop-anot__texto" rows="4" maxlength="1000" placeholder="Escreva um comentário (opcional)" data-testid="input-comentario"></textarea>
    <div class="pop-anot__acoes">
        <button type="button" class="pop-anot__apagar" id="btnExcluirAnotacao" aria-label="Apagar anotação" title="Apagar" data-testid="btn-excluir-anotacao"><i class="fas fa-trash" aria-hidden="true"></i></button>
        <button type="button" class="pop-anot__salvar" id="btnSalvarAnotacao" data-testid="btn-salvar-anotacao">Salvar</button>
    </div>
</div>

<!-- Painel com todas as anotações do livro -->
<aside class="painel-anot" id="painelAnotacoes" data-testid="painel-anotacoes" aria-label="Minhas anotações" hidden>
    <div class="painel-anot__topo">
        <h2>Minhas anotações</h2>
        <button type="button" class="pop-anot__x" id="btnFecharPainel" aria-label="Fechar painel" data-testid="btn-fechar-painel"><i class="fas fa-xmark" aria-hidden="true"></i></button>
    </div>
    <p class="painel-anot__privado"><i class="fas fa-lock" aria-hidden="true"></i> Só você vê as suas marcações e comentários.</p>
    <div class="painel-anot__filtros" role="group" aria-label="Filtrar por cor">
        <button type="button" class="chip-filtro" data-filtro="" aria-pressed="true">Todas</button>
        <button type="button" class="cor-bolinha cor-bolinha--p" data-filtro="amarelo" style="--cor: var(--anot-amarelo)" aria-label="Só amarelo" aria-pressed="false" title="Amarelo"></button>
            <button type="button" class="cor-bolinha cor-bolinha--p" data-filtro="verde" style="--cor: var(--anot-verde)" aria-label="Só verde" aria-pressed="false" title="Verde"></button>
            <button type="button" class="cor-bolinha cor-bolinha--p" data-filtro="azul" style="--cor: var(--anot-azul)" aria-label="Só azul" aria-pressed="false" title="Azul"></button>
            <button type="button" class="cor-bolinha cor-bolinha--p" data-filtro="rosa" style="--cor: var(--anot-rosa)" aria-label="Só rosa" aria-pressed="false" title="Rosa"></button>
            <button type="button" class="cor-bolinha cor-bolinha--p" data-filtro="laranja" style="--cor: var(--anot-laranja)" aria-label="Só laranja" aria-pressed="false" title="Laranja"></button>
    </div>
    <div class="painel-anot__lista" id="listaAnotacoes" data-testid="lista-anotacoes"></div>
</aside>

<nav class="hud-menu" id="menuPrincipal" data-testid="hud-menu" aria-label="Controles de leitura">
    <div class="hud-group hud-group--extremos">
        <button data-testid="btn-first-page" class="btn-hud" id="btnPrimeiraPagina" title="Primeira Página" aria-label="Primeira página">
            <i class="fas fa-angle-double-left" aria-hidden="true"></i>
        </button>
    </div>

    <div class="hud-group hud-group--paginas">
        <button data-testid="btn-prev-page" class="btn-hud" id="btnPaginaAnterior" title="Página Anterior" aria-label="Página anterior">
            <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>

        <div class="page-input-container">
            <input data-testid="input-page-number" type="number" id="pageInput" class="hud-input" min="1" value="1" inputmode="numeric" aria-label="Número da página">
            <span class="info-text">/ <span data-testid="text-total-pages" id="pageCount">--</span></span>
        </div>

        <button data-testid="btn-next-page" class="btn-hud" id="btnProximaPagina" title="Próxima Página" aria-label="Próxima página">
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
    </div>

    <div class="hud-group hud-group--extremos">
        <button data-testid="btn-last-page" class="btn-hud" id="btnUltimaPagina" title="Última Página" aria-label="Última página">
            <i class="fas fa-angle-double-right" aria-hidden="true"></i>
        </button>
    </div>

    <div class="divider" aria-hidden="true"></div>

    <div class="hud-group hud-group--zoom">
        <button data-testid="btn-zoom-out" class="btn-hud" id="btnZoomOut" title="Diminuir Zoom" aria-label="Diminuir zoom">
            <i class="fas fa-minus" aria-hidden="true"></i>
        </button>

        <span data-testid="text-zoom-level" class="zoom-text" id="zoomLevel" aria-live="polite">140%</span>

        <button data-testid="btn-zoom-in" class="btn-hud" id="btnZoomIn" title="Aumentar Zoom" aria-label="Aumentar zoom">
            <i class="fas fa-plus" aria-hidden="true"></i>
        </button>
    </div>

    <button data-testid="btn-fit-width" class="btn-hud" id="btnAjustarLargura" title="Ajustar à largura" aria-label="Ajustar à largura da tela">
        <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
    </button>
</nav>
<script type="application/json" id="livro-config">
<?= json_encode([
    'id'            => (int) $id,
    'url'           => caminhoRaiz() . 'api/download.php?id=' . $id,
    'progressoUrl'  => caminhoRaiz() . 'api/progresso.php?id=' . $id,
    'anotacoesUrl'  => caminhoRaiz() . 'api/anotacoes.php',
    'favoritosUrl'  => caminhoRaiz() . 'api/favoritos.php',
    'pagInicial'    => $progressoAtual > 0 ? (int) $progressoAtual : 1,
    'csrfToken'     => csrf_token(),
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
</script>

<script src="<?= asset('assets/js/leitor.js') ?>"></script>
<script src="<?= asset('assets/js/anotacoes.js') ?>"></script>

</body>
</html>
