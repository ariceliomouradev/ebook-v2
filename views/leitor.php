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
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Lendo: <?= e($livro['titulo']) ?></title>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">

    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>

    <link rel="stylesheet" href="<?= asset('assets/css/leitor.css') ?>">
</head>
<body>

<div id="canvas-container" data-testid="pdf-container">
    <canvas id="the-canvas" data-testid="pdf-canvas"></canvas>
</div>

<div class="hud-menu" id="menuPrincipal" data-testid="hud-menu">
    <a data-testid="btn-back-library" href="<?= url('index.php') ?>?pagina=<?= (int) $paginaVoltar ?>&ordem=<?= e($ordemVoltar) ?>&busca=<?= urlencode($buscaVoltar) ?>" class="btn-hud" title="Voltar à Biblioteca" aria-label="Voltar à biblioteca">
        <i class="fas fa-arrow-left"></i>
    </a>

    <div class="divider"></div>

    <div class="hud-group">
        <button data-testid="btn-first-page" class="btn-hud" id="btnPrimeiraPagina" title="Primeira Página" aria-label="Primeira página">
            <i class="fas fa-angle-double-left"></i>
        </button>

        <button data-testid="btn-prev-page" class="btn-hud" id="btnPaginaAnterior" title="Página Anterior" aria-label="Página anterior">
            <i class="fas fa-chevron-left"></i>
        </button>

        <div class="page-input-container">
            <input data-testid="input-page-number" type="number" id="pageInput" class="hud-input" min="1" value="1" aria-label="Número da página">
            <span class="info-text">/ <span data-testid="text-total-pages" id="pageCount">--</span></span>
        </div>

        <button data-testid="btn-next-page" class="btn-hud" id="btnProximaPagina" title="Próxima Página" aria-label="Próxima página">
            <i class="fas fa-chevron-right"></i>
        </button>

        <button data-testid="btn-last-page" class="btn-hud" id="btnUltimaPagina" title="Última Página" aria-label="Última página">
            <i class="fas fa-angle-double-right"></i>
        </button>
    </div>

    <div class="divider"></div>

    <div class="hud-group">
        <button data-testid="btn-zoom-out" class="btn-hud" id="btnZoomOut" title="Diminuir Zoom" aria-label="Diminuir zoom">
            <i class="fas fa-search-minus"></i>
        </button>

        <span data-testid="text-zoom-level" class="zoom-text" id="zoomLevel">140%</span>

        <button data-testid="btn-zoom-in" class="btn-hud" id="btnZoomIn" title="Aumentar Zoom" aria-label="Aumentar zoom">
            <i class="fas fa-search-plus"></i>
        </button>
    </div>

    <div class="divider"></div>

    <button data-testid="btn-fullscreen" class="btn-hud" id="btnFullscreen" title="Tela Cheia" aria-label="Tela cheia">
        <i class="fas fa-expand" id="iconFull"></i>
    </button>
</div>

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
