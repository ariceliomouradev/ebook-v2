<?php
/**
 * Favoritos (coração) de todos os perfis. Sempre do próprio usuário, só de livros que ele pode ver.
 *   alternar  livro_id [favorito=1|0]   marca/desmarca (sem "favorito", inverte o estado atual)
 * Resposta: { success, favorito, total }
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_login(true);
require_post(true);
csrf_verify(true);

const FAVORITOS_MAX = 2000;
$meuId = (int) $_SESSION['usuario_id'];
$perfil = (string) $_SESSION['usuario_perfil'];

$livroId = filter_var($_POST['livro_id'] ?? null, FILTER_VALIDATE_INT);
if (!$livroId || ($_POST['action'] ?? 'alternar') !== 'alternar') {
    responderJson(['success' => false, 'error' => 'Pedido inválido.'], 422);
}

$stmt = $pdo->prepare('SELECT 1 FROM favoritos WHERE usuario_id = ? AND livro_id = ?');
$stmt->execute([$meuId, $livroId]);
$jaFavorito = (bool) $stmt->fetchColumn();
$quer = isset($_POST['favorito']) ? ($_POST['favorito'] === '1') : !$jaFavorito;

if ($quer && !$jaFavorito) {
    if (!usuarioPodeVerLivro($pdo, $livroId, $perfil, $meuId, titularDaSessao())) {
        responderJson(['success' => false, 'error' => 'Livro não encontrado.'], 404);
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM favoritos WHERE usuario_id = ?');
    $stmt->execute([$meuId]);
    if ((int) $stmt->fetchColumn() >= FAVORITOS_MAX) {
        responderJson(['success' => false, 'error' => 'Limite de ' . FAVORITOS_MAX . ' favoritos atingido.'], 422);
    }
    $pdo->prepare('INSERT IGNORE INTO favoritos (usuario_id, livro_id) VALUES (?, ?)')->execute([$meuId, $livroId]);
} elseif (!$quer && $jaFavorito) {
    $pdo->prepare('DELETE FROM favoritos WHERE usuario_id = ? AND livro_id = ?')->execute([$meuId, $livroId]);
}

// A prateleira "Favoritos" do painel é refeita com a lista nova (mesmo componente do index.php).
$favoritosPrateleira = listarFavoritos($pdo, $meuId, $perfil, titularDaSessao());
$raiz = '../';
ob_start();
include '../components/favoritos_prateleira.php';
$prateleiraHtml = (string) ob_get_clean();

responderJson(['success' => true, 'favorito' => $quer, 'total' => contarFavoritos($pdo, $meuId, $perfil, titularDaSessao()), 'prateleiraHtml' => $prateleiraHtml]);
