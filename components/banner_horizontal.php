<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';

// REGRA RBAC: Contribuidor não vê banners. Leitor e Admin veem.
if ($perfilUsuario !== 'contribuidor'):
?>
<div data-testid="banner-horizontal-container" class="banner-horizontal d-xl-none mb-4">
    <?php $formato = 'h'; include __DIR__ . '/promo_slider.php'; ?>
</div>
<?php endif; // Fim da regra RBAC ?>
