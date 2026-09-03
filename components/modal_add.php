<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
?>

<div data-testid="modal-add-book" class="modal fade" id="modalUpload" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark border border-secondary shadow-lg">

            <div class="modal-header border-secondary">
                <h5 class="modal-title text-info">
                    <i class="fas fa-file-upload me-2"></i>Novo Livro
                </h5>
                <button data-testid="btn-close-modal-add" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>

            <form action="<?= caminhoRaiz() ?>api/upload.php" method="POST" enctype="multipart/form-data" id="formNovoLivro" data-testid="form-novo-livro">
                <?= csrf_field() ?>
                <input type="hidden" name="MAX_FILE_SIZE" value="<?= UPLOAD_PDF_TAMANHO_MAX ?>">
                <div class="modal-body">

                    <label class="text-muted small mb-1">Selecione o arquivo PDF</label>
                    <input data-testid="input-file-pdf" type="file" class="form-control bg-secondary text-light mb-3 border-0" name="arquivo_pdf"
                        id="inputFile" required accept="application/pdf">

                    <div data-testid="canvas-cover-preview" class="text-center mb-3 p-2" id="previewArea" style="display:none; background: rgba(0,0,0,0.2); border-radius: 8px;">
                        <small class="d-block text-muted mb-2">Prévia da Capa Gerada:</small>
                        <canvas id="canvasPreview"
                            style="max-width: 150px; height: auto; border: 1px solid #444; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);"></canvas>
                        <input type="hidden" name="capa_base64" id="capaBase64">
                    </div>

                    <label class="text-muted small mb-1">Informações do Livro</label>
                    <input data-testid="input-book-title" type="text" class="form-control bg-secondary text-light mb-3 border-0" name="titulo"
                        placeholder="Título do Livro" required maxlength="255">

                    <input data-testid="input-book-author" type="text" class="form-control bg-secondary text-light border-0" name="autor"
                        placeholder="Nome do Autor" required maxlength="255">

                </div>

                <div class="modal-footer border-secondary">
                    <button data-testid="btn-submit-new-book" type="submit" class="btn btn-neon w-100 py-2">
                        <i class="fas fa-save me-2"></i>Salvar na Biblioteca
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
