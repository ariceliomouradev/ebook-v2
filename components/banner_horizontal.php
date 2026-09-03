<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';
$raiz = defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '';

// REGRA RBAC: Contribuidor não vê banners. Leitor e Admin veem.
if ($perfilUsuario !== 'contribuidor'):

    $bannerHorizontal = null;
    $extensoes = ['jpg', 'jpeg', 'png'];
    foreach ($extensoes as $ext) {
        if (file_exists(__DIR__ . "/../banners/banner_h.$ext")) {
            $bannerHorizontal = $raiz . "banners/banner_h.$ext?v=" . filemtime(__DIR__ . "/../banners/banner_h.$ext");
            break;
        }
    }
?>
<div data-testid="banner-horizontal-container" class="banner-horizontal d-xl-none mb-4">
    <div class="banner-h-card" <?= $bannerHorizontal ? 'style="padding: 0; overflow: hidden; border: none;"' : '' ?>>

        <?php if ($bannerHorizontal): ?>
            <img data-testid="banner-horizontal-image" src="<?= e($bannerHorizontal) ?>" alt="Banner horizontal" style="width: 100%; height: 100%; object-fit: cover;">
        <?php else: ?>
            <div data-testid="banner-horizontal-placeholder" class="d-flex align-items-center justify-content-center gap-3 w-100 h-100 p-3">
                <i class="fas fa-image fs-2" style="opacity: 0.3;"></i>
                <div class="text-start">
                    <p class="mb-0 fw-bold">Área para Imagem/Banner</p>
                    <small style="opacity: 0.5;">(Espaço Reservado - Horizontal)</small>
                </div>
            </div>
        <?php endif; ?>

    </div>
</div>
<?php endif; // Fim da regra RBAC ?>
