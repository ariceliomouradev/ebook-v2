<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';

// REGRA RBAC: Contribuidor não vê banners. Leitor e Admin veem.
if ($perfilUsuario !== 'contribuidor'):
?>
<div data-testid="sidebar-container" class="col-xl-2 sidebar-column">
    <div class="sidebar-sticky">
        <?php $formato = 'v'; include __DIR__ . '/promo_slider.php'; ?>
    </div>
</div>
<?php endif; // Fim da regra RBAC ?>
