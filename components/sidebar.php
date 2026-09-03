<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';
$raiz = defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '';

// REGRA RBAC: Contribuidor não vê banners. Leitor e Admin veem.
if ($perfilUsuario !== 'contribuidor'):

    $bannerSidebar = null;
    $extensoes = ['jpg', 'jpeg', 'png'];
    foreach ($extensoes as $ext) {
        if (file_exists(__DIR__ . "/../banners/banner_s.$ext")) {
            $bannerSidebar = $raiz . "banners/banner_s.$ext?v=" . filemtime(__DIR__ . "/../banners/banner_s.$ext");
            break;
        }
    }
?>
<div data-testid="sidebar-container" class="col-xl-2 sidebar-column">
    <div class="sidebar-card" <?= $bannerSidebar ? 'style="padding: 0; overflow: hidden; border: none;"' : '' ?>>

        <?php if ($bannerSidebar): ?>
            <img data-testid="sidebar-image" src="<?= e($bannerSidebar) ?>" alt="Banner lateral" style="width: 100%; height: 100%; object-fit: cover;">
        <?php else: ?>
            <div data-testid="sidebar-placeholder" class="w-100 h-100 d-flex flex-column align-items-center justify-content-center p-4 text-center">
                <i class="fas fa-image mb-3 fs-1" style="opacity: 0.3;"></i>
                <p class="mb-0 fw-bold">Área para<br>Imagem/Banner</p>
                <small style="opacity: 0.5;">(Espaço Reservado)</small>
            </div>
        <?php endif; ?>

    </div>
</div>
<?php endif; // Fim da regra RBAC ?>
