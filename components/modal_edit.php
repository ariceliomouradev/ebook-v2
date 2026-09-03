<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

$sqlGerenciar = "SELECT id, titulo, autor FROM livros ORDER BY id DESC";
$stmtGerenciar = $pdo->query($sqlGerenciar);
$listaCompleta = $stmtGerenciar->fetchAll();

$totalNoBanco = $pdo->query("SELECT COUNT(*) FROM livros")->fetchColumn();
?>

<div data-testid="modal-manager" class="modal fade" id="modalGerenciar" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content bg-dark border-secondary">

            <div class="modal-header border-secondary">
                <h5 class="modal-title text-info" id="tituloModalGerenciar" data-testid="title-modal-manager">
                    <i class="fas fa-sliders-h me-2"></i>Gerenciar Biblioteca
                </h5>
                <button data-testid="btn-close-modal-manager" type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
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
                                style="display: none;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="lista-gerenciador" id="containerListaGerenciar" data-testid="container-lista-gerenciador">
                        <?php foreach ($listaCompleta as $livro): ?>
                        <div data-testid="item-gerenciador" class="item-lista item-gerenciador d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between py-3 border-bottom border-secondary gap-3"
                            data-id="<?= (int) $livro['id'] ?>"
                            data-titulo="<?= e($livro['titulo']) ?>"
                            data-autor="<?= e($livro['autor'] ?? '') ?>"
                            data-texto="<?= e(mb_strtolower($livro['titulo'] . ' ' . ($livro['autor'] ?? ''))) ?>">

                            <div class="flex-grow-1 w-100" style="min-width: 0;">
                                <div data-testid="item-titulo-livro" class="fw-bold text-light fs-5 lh-sm mb-1" style="word-wrap: break-word;">
                                    <?= e($livro['titulo']) ?>
                                </div>
                                <div data-testid="item-autor-livro" class="text-muted small">
                                    <?= e($livro['autor'] ?? '') ?>
                                </div>
                            </div>

                            <div class="d-flex gap-2 w-100 w-md-auto justify-content-end align-self-end align-self-md-center">
                                <button data-testid="btn-excluir-item" type="button" class="btn btn-sm btn-outline-danger flex-fill flex-md-grow-0 btn-excluir-livro">
                                    <i class="fas fa-trash"></i> Excluir
                                </button>
                                <button data-testid="btn-editar-item" type="button" class="btn btn-sm btn-outline-warning flex-fill flex-md-grow-0 btn-editar-livro">
                                    <i class="fas fa-pen"></i> Editar
                                </button>
                            </div>
                        </div>
                        <?php endforeach; ?>

                        <div data-testid="msg-gerenciar-vazio" class="text-center py-5 <?= count($listaCompleta) > 0 ? 'd-none' : '' ?>" id="msgGerenciarVazio">
                            <i class="fas fa-folder-open d-block mb-3 fs-1 text-secondary"></i>
                            <p class="text-muted">Não há livros para gerenciar.</p>
                        </div>

                        <div data-testid="msg-busca-gerenciar-vazia" class="text-center py-5" id="msgBuscaGerenciarVazia" style="display: none;">
                            <i class="fas fa-search d-block mb-3 fs-1 text-secondary"></i>
                            <p class="text-muted">Nenhum resultado para sua pesquisa.</p>
                        </div>
                    </div>

                    <div class="mt-3 pt-2 border-top border-secondary d-flex justify-content-between align-items-center">
                        <small class="text-info fw-light">
                            <i class="fas fa-database me-1"></i>
                            <span data-testid="contador-registros" id="contadorRegistros" class="fw-bold"><?= (int) $totalNoBanco ?></span> Registros encontrados
                        </small>

                        <a data-testid="link-gerenciar-banners" href="javascript:void(0)" id="linkGerenciarBanners" class="text-muted small text-decoration-none">
                            <i class="fas fa-images me-1"></i>Gerenciar Banners
                        </a>
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
                        <div class="mb-4">
                            <label class="text-muted small">Nome do Autor</label>
                            <input data-testid="input-editar-autor" type="text" name="autor" id="editAutor"
                                class="form-control bg-secondary text-light border-0" required maxlength="255">
                        </div>
                        <div class="d-flex gap-2">
                            <button data-testid="btn-cancelar-edicao" type="button" class="btn btn-secondary flex-fill" id="btnCancelarEdicao">Cancelar</button>
                            <button data-testid="btn-salvar-edicao" type="submit" class="btn btn-warning flex-fill">Salvar Alterações</button>
                        </div>
                    </form>
                </div>

                <div id="viewBanners" class="p-4" style="display: none;" data-testid="view-gerenciar-banners">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h6 class="text-info mb-0"><i class="fas fa-images"></i> Gerenciar Banners</h6>
                        <button data-testid="btn-voltar-dos-banners" type="button" class="btn btn-sm btn-outline-secondary" id="btnVoltarBanners">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                    </div>

                    <div class="row g-4">
                        <div class="col-12 col-md-6">
                            <div class="card bg-dark border-secondary">
                                <div class="card-header border-secondary text-light small">
                                    <i class="fas fa-arrows-alt-h text-muted me-1"></i> Banner Horizontal (Topo)
                                </div>
                                <div class="card-body text-center">
                                    <input data-testid="input-file-banner-h" type="file" id="fileBannerH" class="d-none" accept=".jpg, .jpeg, .png" data-tipo-banner="h">
                                    <button data-testid="btn-subir-banner-h" type="button" class="btn btn-outline-info btn-sm mb-2 w-100 btn-subir-banner" data-target-input="fileBannerH">
                                        <i class="fas fa-upload"></i> Subir Imagem
                                    </button>
                                    <button data-testid="btn-remover-banner-h" type="button" class="btn btn-outline-danger btn-sm w-100 btn-remover-banner" data-tipo-banner="h">
                                        <i class="fas fa-trash"></i> Remover Atual
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="col-12 col-md-6">
                            <div class="card bg-dark border-secondary">
                                <div class="card-header border-secondary text-light small">
                                    <i class="fas fa-arrows-alt-v text-muted me-1"></i> Banner Sidebar (Lateral)
                                </div>
                                <div class="card-body text-center">
                                    <input data-testid="input-file-banner-s" type="file" id="fileBannerS" class="d-none" accept=".jpg, .jpeg, .png" data-tipo-banner="s">
                                    <button data-testid="btn-subir-banner-s" type="button" class="btn btn-outline-info btn-sm mb-2 w-100 btn-subir-banner" data-target-input="fileBannerS">
                                        <i class="fas fa-upload"></i> Subir Imagem
                                    </button>
                                    <button data-testid="btn-remover-banner-s" type="button" class="btn btn-outline-danger btn-sm w-100 btn-remover-banner" data-tipo-banner="s">
                                        <i class="fas fa-trash"></i> Remover Atual
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 text-muted small text-center">
                        * As alterações serão refletidas imediatamente na página ao fechar o modal.
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
                <small class="text-muted">A área voltará a exibir o texto padrão de "Espaço Reservado".</small>
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
