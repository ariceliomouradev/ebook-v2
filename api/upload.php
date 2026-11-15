<?php
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';

require_perfil(['admin', 'contribuidor', 'leitor']);
require_post();
csrf_verify();

require_once '../includes/duplicados.php';
if (!podeEnviarLivros()) {
    // conta de família (dependente) só lê o que o titular enviou
    redirecionar('index.php?msg=erro_sem_permissao');
}
if (($_SESSION['usuario_perfil'] ?? '') === 'leitor') {
    $stmtQtd = $pdo->prepare('SELECT COUNT(*) FROM livros WHERE usuario_id = ?');
    $stmtQtd->execute([$_SESSION['usuario_id']]);
    if ((int) $stmtQtd->fetchColumn() >= LIMITE_ENVIOS_ASSINANTE) {
        redirecionar('index.php?msg=erro_limite_envios');
    }
}

$titulo = trim($_POST['titulo'] ?? '') ?: 'Sem Título';
$autor  = trim($_POST['autor'] ?? '') ?: 'Autor Desconhecido';
$titulo = mb_substr($titulo, 0, 255);
$autor  = mb_substr($autor, 0, 255);

// Visibilidade: o administrador escolhe no formulário; livros de outros perfis nascem privados
// (só quem enviou vê) até o administrador liberar.
require_once '../includes/repositorios.php';
if (($_SESSION['usuario_perfil'] ?? '') === 'admin') {
    $visibilidade = lerVisibilidadeDoFormulario($_POST);
    if (isset($visibilidade['erro'])) {
        redirecionar('index.php?msg=erro_invalid_data');
    }
    $publicacao = 'aprovado';
    if (trim($autor) === 'Autor Desconhecido') {
        // sem autor identificado: vai para a fila de aprovação e fica só com o administrador
        $publicacao = 'pendente';
        $visibilidade['visivel_para'] = '';
    }
} else {
    $visibilidade = ['visivel_para' => '', 'liberar_em' => null];
    $publicacao = 'privado';
}

// Categoria: a escolhida no formulário ou, sem escolha, a sugerida pelas palavras do título.
require_once '../includes/categorias.php';
garantirCategoriasPadrao($pdo);
$slugCategoria = preg_replace('/[^a-z0-9-]/', '', (string) ($_POST['categoria'] ?? ''));
$categoriaId = categoriaIdPorSlug($pdo, $slugCategoria) ?? categoriaIdPorSlug($pdo, categoriaSugerida($titulo));

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

$hashArquivo = hash_file('sha256', $_FILES['arquivo_pdf']['tmp_name']);
if (($_SESSION['usuario_perfil'] ?? '') === 'admin' && hashJaExiste($pdo, $hashArquivo)) {
    // o administrador não cria duplicado no acervo
    redirecionar('index.php?msg=erro_duplicado');
}

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
    $sql = "INSERT INTO livros (titulo, autor, nome_arquivo, capa_arquivo, usuario_id, categoria_id, visivel_para, liberar_em, publicacao, hash_arquivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$titulo, $autor, $novoNomeArquivo, $capaName, $_SESSION['usuario_id'], $categoriaId, $visibilidade['visivel_para'], $visibilidade['liberar_em'], $publicacao, $hashArquivo]);

    $novoId = (int) $pdo->lastInsertId();
    $capaHash = ($capaName !== '' && isset($bytes) && $bytes !== false) ? hashCapaDeBytes($bytes) : null;
    atualizarChavesDoLivro($pdo, $novoId, $titulo, $autor, $capaHash);
    if ($publicacao === 'aprovado') {
        marcarDuplicadoSePreciso($pdo, $novoId);
    }

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
