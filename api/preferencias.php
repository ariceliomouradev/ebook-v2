<?php
/**
 * Preferências do administrador.
 *   anuncios  valor=1|0   liga/desliga a exibição de propagandas para o PRÓPRIO administrador (menu do perfil).
 * Resposta: { success, anuncios_ativos }
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

if (($_POST['action'] ?? '') !== 'anuncios') {
    responderJson(['success' => false, 'error' => 'Pedido inválido.'], 422);
}
$ligado = ($_POST['valor'] ?? '') === '1' ? 1 : 0;
try {
    $pdo->prepare('UPDATE usuarios SET anuncios_ativos = ? WHERE id = ?')->execute([$ligado, (int) $_SESSION['usuario_id']]);
} catch (PDOException $e) { // banco sem a migração v1.23
    error_log('Falha ao salvar a preferência de anúncios: ' . $e->getMessage());
    responderJson(['success' => false, 'error' => 'Não foi possível salvar. Aplique a atualização do banco (v1.23).'], 503);
}
responderJson(['success' => true, 'anuncios_ativos' => (bool) $ligado]);
