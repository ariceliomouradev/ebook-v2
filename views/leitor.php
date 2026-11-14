<?php
define('CAMINHO_RAIZ', '');
require_once '../config/bootstrap.php';
require_login();

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    http_response_code(400);
    die('Livro não especificado.');
}

$paginaVoltar = max(1, (int) ($_GET['origem'] ?? 1));
$ordemVoltar = $_GET['ordem'] ?? 'recentes';
$buscaVoltar = $_GET['busca'] ?? '';

$stmt = $pdo->prepare("SELECT id, titulo, nome_arquivo FROM livros WHERE id = ?");
$stmt->execute([$id]);
$livro = $stmt->fetch();

if (!$livro) {
    http_response_code(404);
    die('Livro não encontrado.');
}

$stmtProgresso = $pdo->prepare("SELECT progresso FROM leituras WHERE usuario_id = ? AND livro_id = ?");
$stmtProgresso->execute([$_SESSION['usuario_id'], $id]);
$progressoAtual = (int) ($stmtProgresso->fetchColumn() ?: 1);
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

    <button data-testid="btn-fullscreen" class="btn-hud btn-hud--topo" id="btnFullscreen" title="Tela Cheia" aria-label="Tela cheia">
        <i class="fas fa-expand" id="iconFull" aria-hidden="true"></i>
    </button>
</header>

<div id="canvas-container" data-testid="pdf-container">
    <canvas id="the-canvas" data-testid="pdf-canvas"></canvas>
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
    'pagInicial'    => $progressoAtual > 0 ? (int) $progressoAtual : 1,
    'csrfToken'     => csrf_token(),
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
</script>

<script src="<?= asset('assets/js/leitor.js') ?>"></script>

</body>
</html>
