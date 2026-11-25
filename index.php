<?php
define('CAMINHO_RAIZ', '');
require_once 'config/bootstrap.php';

// Quem ainda não entrou vê a página de apresentação (inicio.php) no endereço raiz.
if (!isset($_SESSION['usuario_id'])) {
    require __DIR__ . '/inicio.php';
    exit;
}
require_login();

// Controle de cache
header('Expires: Tue, 01 Jan 2000 00:00:00 GMT');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

require_once 'includes/repositorios.php';
require_once 'includes/categorias.php';

$ordemAtual = $_GET['ordem'] ?? 'recentes';
$busca = $_GET['busca'] ?? '';
$categoriaAtual = preg_replace('/[^a-z0-9-]/', '', (string) ($_GET['categoria'] ?? ''));
$paginaAtual = max(1, (int) ($_GET['pagina'] ?? 1));
$soFavoritos = ($_GET['favoritos'] ?? '') === '1';

$resultado = listarLivrosPaginados($pdo, $ordemAtual, $busca, $paginaAtual, $_SESSION['usuario_id'], $categoriaAtual, $_SESSION['usuario_perfil'], titularDaSessao(), $soFavoritos);
$favoritos = $resultado['favoritos'];
$totalFavoritos = contarFavoritos($pdo, (int) $_SESSION['usuario_id'], $_SESSION['usuario_perfil'], titularDaSessao());
$livros = $resultado['livros'];
$progressos = $resultado['progressos'];
$totalLivros = $resultado['totalLivros'];
$totalPaginas = $resultado['totalPaginas'];
$paginaAtual = $resultado['paginaAtual'];
$ordemAtual = $resultado['ordemAtual'];
$busca = $resultado['busca'];
$categorias = listarCategoriasComContagem($pdo, false, $_SESSION['usuario_perfil'], (int) $_SESSION['usuario_id'], titularDaSessao());

$tituloPagina = 'Meus Livros';
?>

<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">

<head>
    <?php include 'components/head.php'; ?>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js" integrity="sha384-uLiAv4VcjM5H2Jsqzl8EajEaxPugj1CIzQaCjQ8c5//vC+elhxO5pZfXGxoLQi1W" crossorigin="anonymous"></script>
</head>

<body class="d-flex flex-column">

    <a href="#conteudo" class="skip-link" data-testid="skip-link">Ir para o conteúdo</a>

    <div data-testid="global-loader" id="globalLoader" class="loader-overlay">
        <div class="loader-content text-center">
            <img src="assets/icons/icon-192.png" alt="" width="64" height="64" class="mb-3 animate-pulse" style="border-radius: 18px;">
            <div class="visually-hidden" role="status">Carregando...</div>
            <h5 class="text-light animate-pulse">Carregando sua biblioteca...</h5>
            <small class="text-secondary">Por favor, aguarde.</small>
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

    <?php $mostrarBusca = true; include 'components/header.php'; ?>

    <main id="conteudo" class="container app-main flex-grow-1">

        <div class="row g-4 main-row">

            <div class="col-12 d-flex flex-column gap-3" style="min-width: 0;">

                <?php if ($paginaAtual === 1 && $busca === '' && $categoriaAtual === '') {
                    $emAndamento = listarEmAndamento($pdo, (int) $_SESSION['usuario_id'], 8, $_SESSION['usuario_perfil'], titularDaSessao());
                    include 'components/continuar_lendo.php';
                }
                // Prateleira de favoritos: só na vitrine (1ª página, sem busca nem categoria); o JS a esconde ao filtrar.
                $favoritosPrateleira = listarFavoritos($pdo, (int) $_SESSION['usuario_id'], $_SESSION['usuario_perfil'], titularDaSessao());
                $raiz = '';
                $prateleiraOculta = !($paginaAtual === 1 && $busca === '' && $categoriaAtual === '' && !$soFavoritos);
                include 'components/favoritos_prateleira.php'; ?>

                <div class="toolbar">
                    <div class="toolbar__titulo">
                        <h1 id="tituloAcervo"><?= $soFavoritos ? 'Favoritos' : (($busca !== '' || $categoriaAtual !== '') ? 'Resultados' : 'Acervo') ?></h1>
                        <span class="toolbar__contagem" aria-live="polite"><b id="totalLivros" data-testid="total-livros"><?= (int) $totalLivros ?></b> <span id="rotuloTotal"><?= $totalLivros === 1 ? 'livro' : 'livros' ?></span></span>
                    </div>
                    <?php if (($_SESSION['usuario_perfil'] ?? '') === 'leitor' && trocaAtiva() && !ehDependente()):
                        $vagasIndex = vagasDoAssinante($pdo, (int) $_SESSION['usuario_id']); ?>
                    <button type="button" class="btn btn-outline-warning btn-sm" data-bs-toggle="modal" data-bs-target="#modalAcervo" data-testid="btn-explorar-acervo">
                        <i class="fas fa-compass me-1" aria-hidden="true"></i>Explorar acervo <span class="badge text-bg-warning ms-1" data-testid="badge-vagas"><?= (int) $vagasIndex['livres'] ?></span>
                    </button>
                    <?php endif; ?>
                    <label class="toolbar__ordem">
                        <i class="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
                        <span class="visually-hidden">Ordenar por</span>
                        <select class="toolbar__select" id="selectOrdenacao" data-testid="select-ordenacao">
                            <option value="recentes" <?= $ordemAtual == 'recentes' ? 'selected' : '' ?>>Mais recentes</option>
                            <option value="antigos" <?= $ordemAtual == 'antigos' ? 'selected' : '' ?>>Mais antigos</option>
                            <option value="az" <?= $ordemAtual == 'az' ? 'selected' : '' ?>>A – Z</option>
                            <option value="za" <?= $ordemAtual == 'za' ? 'selected' : '' ?>>Z – A</option>
                        </select>
                    </label>
                </div>

                <?php include 'components/categorias_chips.php'; ?>

                <div id="areaLivros">
                    <?php include 'components/book_list.php'; ?>
                </div>

                <div id="areaPaginacao">
                    <?php include 'components/pagination.php'; ?>
                </div>

            </div>

        </div>
    </main>

    <?php
    // Os modais só existem no HTML de quem pode usá-los: leitor não recebe nenhum dos dois.
    // (A permissão real continua sendo checada em cada endpoint; isto só evita enviar marcação
    // inútil e reduz a superfície exposta.)
    $perfilDaSessao = $_SESSION['usuario_perfil'] ?? 'leitor';
    $categoriasTodas = listarCategoriasComContagem($pdo, true);
    if ($perfilDaSessao === 'admin') {
        $listaUsuarios = listaDeUsuarios($pdo);
        require_once 'includes/banners.php';
        $bannersQ = listarBanners($pdo, 'q');
    }
    if (podeEnviarLivros()) {
        include 'components/modal_add.php';
    }
    include 'components/modal_perfis.php';
    if ($perfilDaSessao === 'admin') {
        include 'components/modal_edit.php';
        include 'components/modal_usuarios.php';
    }
    ?>

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
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" integrity="sha384-geWF76RCwLtnZ8qwWowPQNguL3RmwHVBC9FhGdlKrxdiJJigb/j/68SIy3Te4Bkz" crossorigin="anonymous"></script>
    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
    <script src="<?= asset('assets/js/app.js') ?>"></script>
    <script src="<?= asset('assets/js/foto-perfil.js') ?>"></script>
    <script src="<?= asset('assets/js/sessao.js') ?>"></script>
    <?php $momento = 'biblioteca'; include 'components/anuncio_modal.php'; ?>

</body>
</html>
