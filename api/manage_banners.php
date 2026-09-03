<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin'], true);
require_post(true);
csrf_verify(true);

$action = $_POST['action'] ?? '';
$tipo = $_POST['tipo'] ?? '';

if (!in_array($tipo, ['h', 's'], true)) {
    responderJson(['success' => false, 'error' => 'Tipo de banner inválido.'], 422);
}

$bannerDir = __DIR__ . '/../banners/';
$extensoesPermitidas = ['jpg', 'jpeg', 'png'];

function deletarBannerAntigo(string $dir, string $tipo, array $extensoes): void
{
    foreach ($extensoes as $ext) {
        $arquivoAntigo = $dir . "banner_{$tipo}.{$ext}";
        if (file_exists($arquivoAntigo)) {
            unlink($arquivoAntigo);
        }
    }
}

if ($action === 'remove') {
    deletarBannerAntigo($bannerDir, $tipo, $extensoesPermitidas);
    responderJson(['success' => true]);
}

if ($action === 'upload' && isset($_FILES['imagem'])) {
    $file = $_FILES['imagem'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        responderJson(['success' => false, 'error' => 'Erro ao processar imagem.'], 422);
    }

    if ($file['size'] > UPLOAD_IMG_TAMANHO_MAX) {
        responderJson(['success' => false, 'error' => 'Imagem maior que o limite permitido (5MB).'], 422);
    }

    $extensaoOriginal = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($extensaoOriginal, $extensoesPermitidas, true) || !imagemUploadEhValida($file['tmp_name'], $extensoesPermitidas)) {
        responderJson(['success' => false, 'error' => 'Apenas JPG, JPEG e PNG são permitidos.'], 422);
    }

    deletarBannerAntigo($bannerDir, $tipo, $extensoesPermitidas);

    $novoNome = "banner_{$tipo}.{$extensaoOriginal}";
    $destino = $bannerDir . $novoNome;

    if (move_uploaded_file($file['tmp_name'], $destino)) {
        responderJson(['success' => true, 'path' => caminhoRaiz() . "banners/{$novoNome}?v=" . time()]);
    }

    responderJson(['success' => false, 'error' => 'Erro ao salvar o arquivo no disco.'], 500);
}

responderJson(['success' => false, 'error' => 'Ação inválida.'], 400);
