<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

// A lista de livros deste modal NÃO é mais renderizada aqui: o app.js pede uma página por vez a
// api/gerenciar_lista.php quando o modal abre. Antes, todos os livros iam dentro do HTML do
// painel a cada carregamento (com milhares de títulos, megabytes).
?>

<div data-testid="modal-manager" class="modal fade" id="modalGerenciar" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content bg-dark border-secondary">

            <div class="modal-header border-secondary">
                <h5 class="modal-title text-info" id="tituloModalGerenciar" data-testid="title-modal-manager">
                    <i class="fas fa-sliders-h me-2"></i>Gerenciar Biblioteca
                </h5>
                <button data-testid="btn-close-modal-manager" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>

            <div class="modal-body p-0">

                <div id="viewLista" class="p-3" data-testid="view-lista-gerenciador">
                    <div class="input-group mb-3">
                        <span class="input-group-text bg-secondary border-0 text-light">
                            <i class="fas fa-search"></i>
                        </span>

                        <input data-testid="input-busca-gerenciador" type="text" id="buscaGerenciador"
                            class="form-control bg-secondary text-light border-0"
                            placeholder="Pesquisar para editar...">

                        <button data-testid="btn-limpar-busca-gerenciador" class="btn btn-secondary text-light border-0"
                                type="button"
                                id="btnLimparGerenciador"
                                style="display: none;" aria-label="Limpar pesquisa">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="lista-gerenciador" id="containerListaGerenciar" data-testid="container-lista-gerenciador" aria-live="polite" aria-busy="true">
                        <div class="text-center py-5 text-muted" data-testid="gerenciador-carregando">
                            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Carregando livros...
                        </div>
                    </div>

                    <div id="paginacaoGerenciador" class="d-flex d-none justify-content-between align-items-center mt-3 gap-2" data-testid="gerenciador-paginacao">
                        <button data-testid="btn-gerenciador-anterior" id="btnGerenciadorAnterior" type="button" class="btn btn-sm btn-outline-secondary" aria-label="Página anterior" disabled>
                            <i class="fas fa-chevron-left"></i> Anterior
                        </button>
                        <small class="text-muted text-center" data-testid="gerenciador-pagina-info" id="infoPaginaGerenciador"></small>
                        <button data-testid="btn-gerenciador-proxima" id="btnGerenciadorProxima" type="button" class="btn btn-sm btn-outline-secondary" aria-label="Próxima página" disabled>
                            Próxima <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>

                    <div class="mt-3 pt-2 border-top border-secondary">
                        <small class="text-info fw-light">
                            <i class="fas fa-database me-1"></i>
                            <span data-testid="contador-registros" id="contadorRegistros" class="fw-bold">&hellip;</span> Registros encontrados
                        </small>
                    </div>

                </div>

                <div id="viewFormulario" class="p-4" style="display: none;" data-testid="view-formulario-edicao">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h6 class="text-warning mb-0"><i class="fas fa-pen"></i> Editando Detalhes</h6>
                        <button data-testid="btn-voltar-da-edicao" type="button" class="btn btn-sm btn-outline-secondary" id="btnVoltarEdicao">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                    </div>
                    <form data-testid="form-editar-livro" id="formEditarLivro">
                        <?= csrf_field() ?>
                        <input type="hidden" name="id" id="editId">
                        <div class="mb-3">
                            <label class="text-muted small">Título do Livro</label>
                            <input data-testid="input-editar-titulo" type="text" name="titulo" id="editTitulo"
                                class="form-control bg-secondary text-light border-0" required maxlength="255">
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small">Nome do Autor</label>
                            <input data-testid="input-editar-autor" type="text" name="autor" id="editAutor"
                                class="form-control bg-secondary text-light border-0" required maxlength="255">
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small" for="editSinopse">Sinopse <span class="text-secondary">(aparece na API e nos aplicativos)</span></label>
                            <textarea data-testid="input-editar-sinopse" name="sinopse" id="editSinopse" rows="4" maxlength="4000"
                                class="form-control bg-secondary text-light border-0" placeholder="Resumo do livro (opcional)"></textarea>
                        </div>
                        <div class="mb-4">
                            <label class="text-muted small" for="editCategoria">Categoria</label>
                            <select data-testid="select-editar-categoria" name="categoria" id="editCategoria" class="form-select bg-secondary text-light border-0">
                                <option value="">Sem categoria</option>
                                <?php foreach (($categoriasTodas ?? []) as $c): ?>
                                    <option value="<?= e($c['slug']) ?>"><?= e($c['nome']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <fieldset class="vis-campo mb-4" data-testid="edit-visibilidade">
                            <legend class="text-muted small mb-2">Quem pode ver este livro</legend>
                            <div class="d-flex flex-wrap gap-3">
                                <div class="form-check"><input class="form-check-input" type="checkbox" id="editVisContribuidor" name="vis_contribuidor" value="1" data-testid="check-vis-contribuidor" checked><label class="form-check-label" for="editVisContribuidor">Pro</label></div>
                                <div class="form-check"><input class="form-check-input" type="checkbox" id="editVisLeitor" name="vis_leitor" value="1" data-testid="check-vis-leitor" checked><label class="form-check-label" for="editVisLeitor">Grátis</label></div>
                                <div class="form-check"><input class="form-check-input" type="checkbox" id="editVisAdmin" checked disabled><label class="form-check-label" for="editVisAdmin">Administrador</label></div>
                            </div>
                            <label class="text-muted small mt-3 mb-1" for="editLiberarEm">Liberar em (opcional)</label>
                            <input type="datetime-local" class="form-control bg-secondary text-light border-0" id="editLiberarEm" name="liberar_em" data-testid="input-liberar-em">
                            <div class="form-text text-muted">Sem data, o livro fica disponível assim que salvar. Com data, só você o vê até lá. Desmarque os dois perfis para deixar o livro apenas com o administrador.</div>
                        </fieldset>
                        <div class="d-flex gap-2">
                            <button data-testid="btn-cancelar-edicao" type="button" class="btn btn-secondary flex-fill" id="btnCancelarEdicao">Cancelar</button>
                            <button data-testid="btn-salvar-edicao" type="submit" class="btn btn-warning flex-fill">Salvar Alterações</button>
                        </div>
                    </form>
                </div>

                <div id="viewBanners" class="p-4" style="display: none;" data-testid="view-gerenciar-banners">
                    <h6 class="text-info mb-1"><i class="fas fa-images me-2"></i>Banners do carrossel</h6>
                    <p class="text-muted small mb-4">Adicione, reordene ou remova os banners que passam sozinhos na página inicial. Mantenha a mesma quantidade nos dois formatos.</p>
                    <div id="bannersGerenciador" data-testid="banners-gerenciador">
                        <?php include __DIR__ . '/banners_gerenciador.php'; ?>
                    </div>
                    <div class="mt-3 text-muted small text-center">
                        * As alterações aparecem na página ao fechar esta janela.
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<div data-testid="modal-confirmar-excluir" class="modal fade" id="modalConfirmarExcluir" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content bg-dark border-danger">
            <div class="modal-header border-bottom-0">
                <h5 class="modal-title text-danger"><i class="fas fa-exclamation-triangle"></i> Atenção</h5>
                <button data-testid="btn-close-confirm-excluir" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"
                    aria-label="Fechar"></button>
            </div>
            <div class="modal-body text-center">
                <p>Tem certeza que deseja excluir permanentemente o livro:</p>
                <h6 data-testid="nome-livro-excluir" id="nomeLivroExcluir" class="text-info fw-bold"></h6>
                <small class="text-muted">O arquivo físico e a capa serão apagados do disco.</small>
            </div>
            <div class="modal-footer border-top-0 d-flex justify-content-center gap-2">
                <button data-testid="btn-cancelar-exclusao" type="button" class="btn btn-sm btn-outline-light" data-bs-dismiss="modal">Cancelar</button>
                <button data-testid="btn-confirmar-exclusao" id="btnConfirmarExcluir" type="button" class="btn btn-sm btn-danger px-3">Confirmar Exclusão</button>
            </div>
        </div>
    </div>
</div>

<div data-testid="modal-confirmar-excluir-banner" class="modal fade" id="modalConfirmarExcluirBanner" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content bg-dark border-danger">
            <div class="modal-header border-bottom-0">
                <h5 class="modal-title text-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>Atenção
                </h5>
                <button data-testid="btn-close-confirm-excluir-banner" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body text-center">
                <p class="mb-2 fw-bold text-light">Tem certeza que deseja remover este banner?</p>
                <small class="text-muted">A imagem enviada será apagada. Esta ação não pode ser desfeita.</small>
            </div>
            <div class="modal-footer border-top-0 d-flex justify-content-center gap-2">
                <button data-testid="btn-cancelar-exclusao-banner" type="button" class="btn btn-sm btn-outline-light px-3" data-bs-dismiss="modal">Cancelar</button>
                <button data-testid="btn-confirmar-exclusao-banner" id="btnConfirmarRemocaoBanner" type="button" class="btn btn-sm btn-danger px-3">
                    <i class="fas fa-trash me-1"></i> Confirmar Remoção
                </button>
            </div>
        </div>
    </div>
</div>
