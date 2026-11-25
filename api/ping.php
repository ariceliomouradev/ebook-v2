<?php
// Mantém a sessão viva enquanto a pessoa está lendo (o bootstrap já renova o "último acesso" a cada requisição).
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_login(true);
require_post(true);

$csrfHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (empty($_SESSION['csrf_token']) || !hash_equals($_SESSION['csrf_token'], (string) $csrfHeader)) {
    responderJson(['success' => false, 'error' => 'Token de segurança inválido.'], 400);
}

responderJson(['success' => true]);
