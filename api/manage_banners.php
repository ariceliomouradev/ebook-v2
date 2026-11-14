<?php
/**
 * Gestão dos banners do carrossel (só admin). Ações (POST + CSRF):
 *   listar                          -> html atualizado do gerenciador
 *   adicionar  formato, imagem, alt, link -> envia e cadastra um banner no fim da fila
 *   salvar_link id, link            -> define (ou limpa, se vazio) o link do banner
 *   remover    id                   -> apaga o banner (e o arquivo, se foi enviado)
 *   mover      id, direcao=up|down  -> troca a posição com o vizinho do mesmo formato
 * Toda resposta bem-sucedida devolve `html` (o gerenciador já renderizado) para a tela se atualizar.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/banners.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$action = $_POST['action'] ?? '';

function respostaComLista(PDO $pdo, array $extra = []): never
{
    $bannersH = listarBanners($pdo, 'h');
    $bannersV = listarBanners($pdo, 'v');
    ob_start();
    include __DIR__ . '/../components/banners_gerenciador.php';
    $html = ob_get_clean();
    responderJson(['success' => true, 'html' => $html] + $extra);
}

function carregarBanner(PDO $pdo, $id): array
{
    $stmt = $pdo->prepare('SELECT id, formato, arquivo, alt, link, ordem FROM banners WHERE id = ?');
    $stmt->execute([(int) $id]);
    $b = $stmt->fetch();
    if (!$b) {
        responderJson(['success' => false, 'error' => 'Banner não encontrado.'], 404);
    }
    return $b;
}

if ($action === 'listar') {
    respostaComLista($pdo);
}

if ($action === 'adicionar') {
    $formato = $_POST['formato'] ?? '';
    if (!in_array($formato, BANNER_FORMATOS, true)) {
        responderJson(['success' => false, 'error' => 'Formato de banner inválido.'], 422);
    }
    if (!isset($_FILES['imagem']) || $_FILES['imagem']['error'] !== UPLOAD_ERR_OK) {
        responderJson(['success' => false, 'error' => 'Erro ao receber a imagem.'], 422);
    }
    $file = $_FILES['imagem'];
    if ($file['size'] > UPLOAD_IMG_TAMANHO_MAX) {
        responderJson(['success' => false, 'error' => 'Imagem maior que o limite permitido (5MB).'], 422);
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $permitidas = ['jpg', 'jpeg', 'png', 'webp'];
    if (!in_array($ext, $permitidas, true) || !imagemUploadEhValida($file['tmp_name'], $permitidas)) {
        responderJson(['success' => false, 'error' => 'Apenas JPG, PNG e WebP são permitidos.'], 422);
    }

    $stmtCont = $pdo->prepare('SELECT COUNT(*), COALESCE(MAX(ordem), 0) FROM banners WHERE formato = ?');
    $stmtCont->execute([$formato]);
    [$quantidade, $maiorOrdem] = $stmtCont->fetch(PDO::FETCH_NUM);
    if ((int) $quantidade >= BANNER_LIMITE_POR_FORMATO) {
        responderJson(['success' => false, 'error' => 'Limite de ' . BANNER_LIMITE_POR_FORMATO . ' banners por formato. Remova algum antes de adicionar.'], 422);
    }

    $link = normalizarLinkBanner((string) ($_POST['link'] ?? ''));
    if ($link === null) {
        responderJson(['success' => false, 'error' => 'Link inválido. Use um endereço http:// ou https://.'], 422);
    }

    $caminho = salvarImagemBanner($file['tmp_name'], $formato);
    if ($caminho === null) {
        responderJson(['success' => false, 'error' => 'Não foi possível processar a imagem.'], 422);
    }

    $alt = mb_substr(trim((string) ($_POST['alt'] ?? '')), 0, 200);
    if ($alt === '') {
        $alt = 'Banner de divulgação';
    }
    $stmt = $pdo->prepare('INSERT INTO banners (formato, arquivo, alt, link, ordem) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$formato, $caminho, $alt, $link === '' ? null : $link, (int) $maiorOrdem + 1]);
    respostaComLista($pdo);
}

if ($action === 'salvar_link') {
    $banner = carregarBanner($pdo, $_POST['id'] ?? 0);
    $link = normalizarLinkBanner((string) ($_POST['link'] ?? ''));
    if ($link === null) {
        responderJson(['success' => false, 'error' => 'Link inválido. Use um endereço http:// ou https://.'], 422);
    }
    $pdo->prepare('UPDATE banners SET link = ? WHERE id = ?')->execute([$link === '' ? null : $link, $banner['id']]);
    respostaComLista($pdo);
}

if ($action === 'remover') {
    $banner = carregarBanner($pdo, $_POST['id'] ?? 0);
    $pdo->prepare('DELETE FROM banners WHERE id = ?')->execute([$banner['id']]);
    removerArquivoBanner($banner);
    respostaComLista($pdo);
}

if ($action === 'mover') {
    $banner = carregarBanner($pdo, $_POST['id'] ?? 0);
    $direcao = ($_POST['direcao'] ?? '') === 'up' ? 'up' : 'down';
    $lista = listarBanners($pdo, $banner['formato']);
    $ids = array_map('intval', array_column($lista, 'id'));
    $pos = array_search((int) $banner['id'], $ids, true);
    $alvo = $direcao === 'up' ? $pos - 1 : $pos + 1;
    if ($pos !== false && isset($ids[$alvo])) {
        [$ids[$pos], $ids[$alvo]] = [$ids[$alvo], $ids[$pos]];
        // regrava a ordem 1..n (evita empates e buracos que um swap simples deixaria)
        $upd = $pdo->prepare('UPDATE banners SET ordem = ? WHERE id = ?');
        foreach ($ids as $i => $id) {
            $upd->execute([$i + 1, $id]);
        }
    }
    respostaComLista($pdo);
}

responderJson(['success' => false, 'error' => 'Ação inválida.'], 400);
