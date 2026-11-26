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

// O campo do formulário continua se chamando `arquivo_pdf`, mas aceita PDF ou EPUB:
// o formato vem do conteúdo do arquivo, nunca da extensão informada pelo navegador.
require_once '../includes/epub.php';
if (!isset($_FILES['arquivo_pdf']) || $_FILES['arquivo_pdf']['error'] !== UPLOAD_ERR_OK) {
    redirecionar('index.php?msg=erro_arquivo');
}
if ($_FILES['arquivo_pdf']['size'] > UPLOAD_PDF_TAMANHO_MAX) {
    redirecionar('index.php?msg=erro_arquivo');
}
$tmpArquivo = $_FILES['arquivo_pdf']['tmp_name'];
if (arquivoEhPdfValido($tmpArquivo)) {
    $formato = 'pdf';
} elseif (arquivoEhEpubValido($tmpArquivo)) {
    $formato = 'epub';
} else {
    redirecionar('index.php?msg=erro_arquivo');
}
// EPUB traz título e autor nos metadados: servem quando o formulário vem em branco.
$metaEpub = $formato === 'epub' ? epubMetadados($tmpArquivo) : ['titulo' => '', 'autor' => '', 'assuntos' => '', 'sinopse' => '', 'publicado' => null];

$titulo = trim($_POST['titulo'] ?? '') ?: $metaEpub['titulo'] ?: 'Sem Título';
$autor  = trim($_POST['autor'] ?? '') ?: $metaEpub['autor'] ?: 'Autor Desconhecido';
// Sinopse: a digitada no formulário ou, no EPUB, a descrição que vem no próprio arquivo.
$sinopse = mb_substr(trim((string) ($_POST['sinopse'] ?? '')), 0, 4000);
if ($sinopse === '') {
    $sinopse = (string) ($metaEpub['sinopse'] ?? '');
}
$sinopse = $sinopse === '' ? null : $sinopse;
// Data de publicação: a digitada (opcional) ou, no EPUB, a que vem no próprio arquivo; sem ela o livro fica no fim de Mais recentes/antigos.
$dataPublicacao = normalizarDataPublicacao($_POST['data_publicacao'] ?? '') ?? ($metaEpub['publicado'] ?? null);
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
require_once __DIR__ . '/../includes/infantil.php';
$sugerida = $formato === 'epub' ? categoriaSugeridaEpub($titulo, $metaEpub['assuntos'], $autor) : categoriaSugerida($titulo);
// história para criança (livro ilustrado, fábula, infantojuvenil) vai para Infantojuvenil
if ($sugerida !== 'infantil' && livroEhInfantil($titulo, $autor, $formato === 'epub' ? infantilSinaisDoEpub($_FILES['arquivo_pdf']['tmp_name']) : []) !== null) {
    $sugerida = 'infantil';
}
$categoriaId = categoriaIdPorSlug($pdo, $slugCategoria)
    ?? categoriaIdPorSlug($pdo, $sugerida);

$novoNomeArquivo = time() . '_' . bin2hex(random_bytes(8)) . '.' . $formato;
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

// EPUB: a capa sai do próprio arquivo (já movido para uploads/).
if ($formato === 'epub') {
    $bytes = epubCapaPng($pdfTarget);
    if ($bytes !== null) {
        $capaName = pathinfo($novoNomeArquivo, PATHINFO_FILENAME) . '.png';
        file_put_contents('../capas/' . $capaName, $bytes);
    }
}

// PDF: capa gerada no cliente (PDF.js) e enviada como Base64. Validamos que o conteúdo
// decodificado é de fato uma imagem antes de gravar em disco.
if ($formato === 'pdf' && !empty($_POST['capa_base64'])) {
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
    $sql = "INSERT INTO livros (titulo, autor, sinopse, data_publicacao, nome_arquivo, formato, capa_arquivo, usuario_id, categoria_id, visivel_para, liberar_em, publicacao, hash_arquivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$titulo, $autor, $sinopse, $dataPublicacao, $novoNomeArquivo, $formato, $capaName, $_SESSION['usuario_id'], $categoriaId, $visibilidade['visivel_para'], $visibilidade['liberar_em'], $publicacao, $hashArquivo]);

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
