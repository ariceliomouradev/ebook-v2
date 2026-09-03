<?php
define('CAMINHO_RAIZ', '');
require_once 'config/bootstrap.php';
require_login();

// Controle de cache
header('Expires: Tue, 01 Jan 2000 00:00:00 GMT');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

require_once 'includes/repositorios.php';

$ordemAtual = $_GET['ordem'] ?? 'recentes';
$busca = $_GET['busca'] ?? '';
$paginaAtual = max(1, (int) ($_GET['pagina'] ?? 1));

$resultado = listarLivrosPaginados($pdo, $ordemAtual, $busca, $paginaAtual, $_SESSION['usuario_id']);
$livros = $resultado['livros'];
$progressos = $resultado['progressos'];
$totalLivros = $resultado['totalLivros'];
$totalPaginas = $resultado['totalPaginas'];
$paginaAtual = $resultado['paginaAtual'];
$ordemAtual = $resultado['ordemAtual'];
$busca = $resultado['busca'];

$tituloPagina = 'Meus Livros';
?>

<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">

<head>
    <?php include 'components/head.php'; ?>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
</head>

<body class="d-flex flex-column">

    <div data-testid="global-loader" id="globalLoader" class="loader-overlay">
        <div class="loader-content text-center">
            <div class="spinner-border text-info mb-3" style="width: 3rem; height: 3rem;" role="status">
                <span class="visually-hidden">Carregando...</span>
            </div>
            <h5 class="text-light animate-pulse">Carregando sua biblioteca...</h5>
            <small class="text-muted">Por favor, aguarde.</small>
        </div>
    </div>

    <div data-testid="error-timeout-screen" id="errorTimeout" class="loader-overlay d-none" style="background: rgba(0,0,0,0.95);">
        <div class="text-center">
            <i class="fas fa-wifi fa-3x text-danger mb-3"></i>
            <h4 class="text-light">Ocorreu uma demora inesperada</h4>
            <p class="text-muted mb-4">O sistema não respondeu dentro do tempo limite.</p>
            <button data-testid="btn-retry-timeout" class="btn btn-outline-light" id="btnRetryTimeout">
                <i class="fas fa-sync-alt me-2"></i>Tentar Novamente
            </button>
        </div>
    </div>

    <div class="container py-4 flex-grow-1">

        <?php include 'components/header.php'; ?>

        <?php include 'components/banner_horizontal.php'; ?>

        <div class="row g-4 main-row">

            <div class="col-12 col-xl-10 d-flex flex-column gap-4">

                <div id="areaLivros">
                    <?php include 'components/book_list.php'; ?>
                </div>

                <div id="areaPaginacao">
                    <?php include 'components/pagination.php'; ?>
                </div>

            </div>

            <?php include 'components/sidebar.php'; ?>

        </div>
    </div>

    <?php include 'components/modal_add.php'; ?>
    <?php include 'components/modal_edit.php'; ?>

    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 1090;">
        <div id="toastErro" class="toast align-items-center text-bg-danger border-0" role="alert" aria-live="assertive" aria-atomic="true" data-testid="toast-erro">
            <div class="d-flex">
                <div class="toast-body" id="toastErroMsg"></div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
            </div>
        </div>
    </div>

    <script type="application/json" id="app-config">
<?= json_encode([
    'csrfToken' => csrf_token(),
    'baseUrl'   => $raiz,
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
    </script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
    <script src="<?= asset('assets/js/app.js') ?>"></script>

</body>
</html>
