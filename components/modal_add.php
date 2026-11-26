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
                <button data-testid="btn-close-modal-add" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>

            <form action="<?= caminhoRaiz() ?>api/upload.php" method="POST" enctype="multipart/form-data" id="formNovoLivro" data-testid="form-novo-livro">
                <?= csrf_field() ?>
                <input type="hidden" name="MAX_FILE_SIZE" value="<?= UPLOAD_PDF_TAMANHO_MAX ?>">
                <div class="modal-body">

                    <label class="text-muted small mb-1" for="inputFile">Selecione o arquivo (PDF ou EPUB)</label>
                    <input data-testid="input-file-pdf" type="file" class="form-control bg-secondary text-light mb-1 border-0" name="arquivo_pdf"
                        id="inputFile" required accept="application/pdf,application/epub+zip,.pdf,.epub">
                    <div class="form-text text-muted mb-3" id="dicaEpub" data-testid="dica-epub" hidden>EPUB: o título, o autor e a capa são lidos do próprio arquivo. Preencha só se quiser trocar.</div>

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

                    <label class="text-muted small mt-3 mb-1" for="novaSinopse">Sinopse <span class="text-secondary">(opcional; no EPUB vem do arquivo)</span></label>
                    <textarea data-testid="input-book-sinopse" id="novaSinopse" name="sinopse" rows="3" maxlength="4000" class="form-control bg-secondary text-light border-0" placeholder="Resumo do livro"></textarea>

                    <label class="text-muted small mt-3 mb-1" for="novaDataPublicacao">Data de publicação <span class="text-secondary">(opcional; no EPUB vem do arquivo)</span></label>
                    <input data-testid="input-book-publicacao" type="date" id="novaDataPublicacao" name="data_publicacao" class="form-control bg-secondary text-light border-0" max="<?= (int) date('Y') + 1 ?>-12-31">

                    <label class="text-muted small mt-3 mb-1" for="novaCategoria">Categoria</label>
                    <select data-testid="select-categoria-livro" id="novaCategoria" name="categoria" class="form-select bg-secondary text-light border-0">
                        <option value="">Detectar automaticamente</option>
                        <?php foreach (($categoriasTodas ?? []) as $c): ?>
                            <option value="<?= e($c['slug']) ?>"><?= e($c['nome']) ?></option>
                        <?php endforeach; ?>
                    </select>

                    <?php if (($_SESSION['usuario_perfil'] ?? '') === 'admin'): ?>
                    <div class="mt-3">
                    <fieldset class="vis-campo mb-4" data-testid="novo-visibilidade">
                        <legend class="text-muted small mb-2">Quem pode ver este livro</legend>
                        <div class="d-flex flex-wrap gap-3">
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="novoVisContribuidor" name="vis_contribuidor" value="1" data-testid="check-vis-contribuidor" checked><label class="form-check-label" for="novoVisContribuidor">Pro</label></div>
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="novoVisLeitor" name="vis_leitor" value="1" data-testid="check-vis-leitor" checked><label class="form-check-label" for="novoVisLeitor">Grátis</label></div>
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="novoVisAdmin" checked disabled><label class="form-check-label" for="novoVisAdmin">Administrador</label></div>
                        </div>
                        <label class="text-muted small mt-3 mb-1" for="novoLiberarEm">Liberar em (opcional)</label>
                        <input type="datetime-local" class="form-control bg-secondary text-light border-0" id="novoLiberarEm" name="liberar_em" data-testid="input-liberar-em">
                        <div class="form-text text-muted">Sem data, o livro fica disponível assim que salvar. Com data, só você o vê até lá. Desmarque os dois perfis para deixar o livro apenas com o administrador.</div>
                    </fieldset>
                    </div>
                    <?php endif; ?>

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
