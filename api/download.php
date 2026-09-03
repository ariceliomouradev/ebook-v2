<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_login();

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) {
    http_response_code(400);
    die('Livro inválido.');
}

$stmt = $pdo->prepare("SELECT nome_arquivo, titulo FROM livros WHERE id = ?");
$stmt->execute([$id]);
$livro = $stmt->fetch();

if (!$livro) {
    http_response_code(404);
    die('Livro não encontrado.');
}

$caminho = __DIR__ . '/../uploads/' . $livro['nome_arquivo'];
if (!is_file($caminho)) {
    http_response_code(404);
    die('Arquivo não encontrado no servidor.');
}

$tamanho = filesize($caminho);

// Nome de arquivo compatível com RFC 6266: ASCII simplificado no `filename` (fallback para
// navegadores antigos) e UTF-8 completo no `filename*` — nada de percent-encoding cru, que
// aparecia literalmente no nome do arquivo salvo pelo usuário.
$nomeBase = $livro['titulo'] . '.pdf';
$nomeAscii = preg_replace('/[^\x20-\x7E]/', '_', $nomeBase);
header('Content-Type: application/pdf');
header(sprintf(
    'Content-Disposition: inline; filename="%s"; filename*=UTF-8\'\'%s',
    str_replace('"', '', $nomeAscii),
    rawurlencode($nomeBase)
));
header('Cache-Control: private, max-age=0, must-revalidate');
header('X-Content-Type-Options: nosniff');

// Suporte a Range requests: permite que o PDF.js carregue páginas sob demanda em vez de baixar
// o arquivo inteiro antes de exibir a primeira página (essencial para livros grandes).
header('Accept-Ranges: bytes');

$inicio = 0;
$fim = $tamanho - 1;
$statusParcial = false;

if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', $_SERVER['HTTP_RANGE'], $m)) {
    $inicioSolicitado = $m[1] === '' ? null : (int) $m[1];
    $fimSolicitado = $m[2] === '' ? null : (int) $m[2];

    if ($inicioSolicitado !== null) {
        $inicio = $inicioSolicitado;
        $fim = $fimSolicitado ?? $tamanho - 1;
    } elseif ($fimSolicitado !== null) {
        $inicio = max(0, $tamanho - $fimSolicitado);
        $fim = $tamanho - 1;
    }

    if ($inicio >= 0 && $fim < $tamanho && $inicio <= $fim) {
        $statusParcial = true;
    } else {
        header('Content-Range: bytes */' . $tamanho);
        http_response_code(416);
        exit;
    }
}

$comprimento = $fim - $inicio + 1;
header('Content-Length: ' . $comprimento);

if ($statusParcial) {
    http_response_code(206);
    header("Content-Range: bytes $inicio-$fim/$tamanho");
}

$handle = fopen($caminho, 'rb');
fseek($handle, $inicio);
$restante = $comprimento;
while ($restante > 0 && !feof($handle)) {
    $pedaco = min(8192, $restante);
    echo fread($handle, $pedaco);
    $restante -= $pedaco;
}
fclose($handle);
exit;
