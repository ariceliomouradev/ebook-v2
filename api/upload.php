<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin', 'contribuidor']);
require_post();
csrf_verify();

$titulo = trim($_POST['titulo'] ?? '') ?: 'Sem Título';
$autor  = trim($_POST['autor'] ?? '') ?: 'Autor Desconhecido';
$titulo = mb_substr($titulo, 0, 255);
$autor  = mb_substr($autor, 0, 255);

if (!isset($_FILES['arquivo_pdf']) || $_FILES['arquivo_pdf']['error'] !== UPLOAD_ERR_OK) {
    redirecionar('index.php?msg=erro_arquivo');
}

if ($_FILES['arquivo_pdf']['size'] > UPLOAD_PDF_TAMANHO_MAX) {
    redirecionar('index.php?msg=erro_arquivo');
}

if (!arquivoEhPdfValido($_FILES['arquivo_pdf']['tmp_name'])) {
    redirecionar('index.php?msg=erro_arquivo');
}

$novoNomeArquivo = time() . '_' . bin2hex(random_bytes(8)) . '.pdf';
$pdfTarget = '../uploads/' . $novoNomeArquivo;

if (!move_uploaded_file($_FILES['arquivo_pdf']['tmp_name'], $pdfTarget)) {
    redirecionar('index.php?msg=erro_arquivo');
}

$capaName = '';

// Capa gerada no cliente (PDF.js) e enviada como Base64. Validamos que o conteúdo
// decodificado é de fato uma imagem antes de gravar em disco.
if (!empty($_POST['capa_base64'])) {
    $data = $_POST['capa_base64'];
    if (strpos($data, ',') !== false) {
        [$tipo, $data] = explode(',', $data, 2);
    }
    $bytes = base64_decode($data, true);

    if ($bytes !== false && conteudoEhImagemValida($bytes, ['image/png'])) {
        $capaName = pathinfo($novoNomeArquivo, PATHINFO_FILENAME) . '.png';
        file_put_contents('../capas/' . $capaName, $bytes);
    }
}

try {
    $sql = "INSERT INTO livros (titulo, autor, nome_arquivo, capa_arquivo, usuario_id) VALUES (?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$titulo, $autor, $novoNomeArquivo, $capaName, $_SESSION['usuario_id']]);

    redirecionar('index.php?msg=sucesso');
} catch (PDOException $e) {
    error_log('Falha ao salvar livro: ' . $e->getMessage());
    if (file_exists($pdfTarget)) {
        unlink($pdfTarget);
    }
    if ($capaName && file_exists('../capas/' . $capaName)) {
        unlink('../capas/' . $capaName);
    }
    redirecionar('index.php?msg=erro_invalid_data');
}
