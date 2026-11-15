<?php
/**
 * Modais dos perfis comerciais (carregam por AJAX ao abrir, como os outros):
 *   #modalAprovacoes  administrador  fila de livros enviados por Família/Assinantes (e sem autor).
 *   #modalEnvios      Família (titular) e Assinante  seus envios e o pedido de publicação.
 *   #modalFamilia     Família (titular)  acessos extras para quem mora junto.
 */
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
$perfilModais = $_SESSION['usuario_perfil'] ?? 'leitor';
$regexSenhaFamilia = '(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}';
$dicaSenhaFamilia = 'Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.';
?>

<?php if ($perfilModais === 'admin'): ?>
<div class="modal fade" id="modalAprovacoes" tabindex="-1" aria-labelledby="tituloModalAprovacoes" data-testid="modal-aprovacoes">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h5 class="modal-title" id="tituloModalAprovacoes"><i class="fas fa-clipboard-check me-2 text-info"></i>Aprovações</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-modal-aprovacoes"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small">Livros enviados por Família e Assinantes, e livros sem autor identificado (ficam só com você até serem aprovados). Corrija o autor se precisar e aprove, ou negue.</p>
                <div id="perfisAviso-aprovacoes" class="alert d-none py-2 small" role="status" aria-live="polite"></div>
                <div id="listaAprovacoes" data-testid="lista-aprovacoes" aria-live="polite"></div>
            </div>
            <div class="modal-footer border-secondary justify-content-between" id="aprovPaginacao" data-testid="aprovacoes-paginacao">
                <button type="button" class="btn btn-sm btn-outline-light" id="aprovAnterior" aria-label="Página anterior" data-testid="btn-aprov-anterior" disabled><i class="fas fa-chevron-left me-1" aria-hidden="true"></i>Anterior</button>
                <span class="small text-secondary text-center" id="aprovInfo" data-testid="aprovacoes-info" aria-live="polite"></span>
                <button type="button" class="btn btn-sm btn-outline-light" id="aprovProxima" aria-label="Próxima página" data-testid="btn-aprov-proxima" disabled>Próxima<i class="fas fa-chevron-right ms-1" aria-hidden="true"></i></button>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php if ($perfilModais === 'admin'): ?>
<!-- Prévia do PDF na fila de aprovação: desenhada com PDF.js dentro da página (nada de nova aba nem download). -->
<div class="modal fade" id="modalPreviaPdf" tabindex="-1" aria-labelledby="tituloPreviaPdf" data-testid="modal-previa-pdf">
    <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h5 class="modal-title text-truncate" id="tituloPreviaPdf" data-testid="titulo-previa-pdf">Prévia</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-previa-x"></button>
            </div>
            <div class="modal-body p-0">
                <div id="previaPdfArea" class="previa-pdf" data-testid="previa-pdf-area">
                    <div id="previaPdfEstado" class="text-center text-muted py-5">Carregando...</div>
                    <canvas id="previaPdfCanvas" class="d-none"></canvas>
                </div>
            </div>
            <div class="modal-footer border-secondary flex-column align-items-stretch gap-2">
                <div class="d-flex align-items-center justify-content-between gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <button type="button" class="btn btn-sm btn-outline-light" id="previaAnterior" aria-label="Página anterior" data-testid="btn-previa-anterior"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
                        <span class="small text-secondary" id="previaPagina" data-testid="previa-pagina">–</span>
                        <button type="button" class="btn btn-sm btn-outline-light" id="previaProxima" aria-label="Próxima página" data-testid="btn-previa-proxima"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
                    </div>
                    <span class="small" id="previaAviso" role="status" aria-live="polite" data-testid="previa-aviso"></span>
                </div>
                <form id="formPrevia" class="row g-2 align-items-end m-0" novalidate data-testid="form-previa">
                    <div class="col-12 col-md-4">
                        <label class="text-muted small" for="previaTitulo">Título</label>
                        <input type="text" id="previaTitulo" class="form-control bg-secondary text-light border-0" maxlength="255" required data-testid="input-previa-titulo">
                    </div>
                    <div class="col-12 col-md-3">
                        <label class="text-muted small" for="previaAutor">Autor</label>
                        <input type="text" id="previaAutor" class="form-control bg-secondary text-light border-0" maxlength="255" required data-testid="input-previa-autor">
                    </div>
                    <div class="col-12 col-md-5 d-flex gap-2">
                        <button type="submit" class="btn btn-outline-warning flex-fill" id="previaSalvar" data-testid="btn-previa-salvar"><i class="fas fa-save me-2" aria-hidden="true"></i>Salvar</button>
                        <button type="button" class="btn btn-neon flex-fill" id="previaAprovar" data-testid="btn-previa-aprovar"><i class="fas fa-check me-2" aria-hidden="true"></i>Aprovar</button>
                    </div>
                    <fieldset class="col-12 vis-campo mt-2" data-testid="previa-visibilidade">
                        <legend class="text-muted small mb-1">Liberar para</legend>
                        <div class="d-flex flex-wrap align-items-center gap-3">
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="previaVisContribuidor" data-testid="check-previa-familia" checked><label class="form-check-label" for="previaVisContribuidor">Família</label></div>
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="previaVisLeitor" data-testid="check-previa-assinante" checked><label class="form-check-label" for="previaVisLeitor">Assinantes</label></div>
                            <div class="form-check"><input class="form-check-input" type="checkbox" id="previaVisAdmin" checked disabled><label class="form-check-label" for="previaVisAdmin">Administrador</label></div>
                            <div class="d-flex align-items-center gap-2 ms-md-auto">
                                <label class="text-muted small mb-0" for="previaLiberarEm">Liberar em (opcional)</label>
                                <input type="datetime-local" id="previaLiberarEm" class="form-control form-control-sm bg-secondary text-light border-0" style="width: auto;" data-testid="input-previa-liberar-em">
                            </div>
                        </div>
                    </fieldset>
                </form>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php if ($perfilModais === 'leitor' && trocaAtiva() && !ehDependente()): ?>
<div class="modal fade" id="modalAcervo" tabindex="-1" aria-labelledby="tituloModalAcervo" data-testid="modal-acervo">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h5 class="modal-title" id="tituloModalAcervo"><i class="fas fa-compass me-2 text-info"></i>Explorar acervo</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-modal-acervo"></button>
            </div>
            <div class="modal-body">
                <p class="small mb-1"><strong id="acervoVagas" data-testid="acervo-vagas"></strong></p>
                <p class="text-muted small">Escolha os livros que quer ler. Cada livro seu aprovado pelo administrador libera mais uma vaga: use <strong>Meus envios</strong> para pedir a publicação.</p>
                <input type="search" id="acervoBusca" class="form-control bg-secondary text-light border-0 mb-2" placeholder="Pesquisar por título ou autor" autocomplete="off" data-testid="input-acervo-busca">
                <div id="perfisAviso-acervo" class="alert d-none py-2 small" role="status" aria-live="polite"></div>
                <div id="listaAcervo" data-testid="lista-acervo" aria-live="polite"></div>
            </div>
            <div class="modal-footer border-secondary justify-content-between">
                <button type="button" class="btn btn-sm btn-outline-light" id="acervoAnterior" aria-label="Página anterior" data-testid="btn-acervo-anterior" disabled><i class="fas fa-chevron-left me-1" aria-hidden="true"></i>Anterior</button>
                <span class="small text-secondary text-center" id="acervoInfo" data-testid="acervo-info" aria-live="polite"></span>
                <button type="button" class="btn btn-sm btn-outline-light" id="acervoProxima" aria-label="Próxima página" data-testid="btn-acervo-proxima" disabled>Próxima<i class="fas fa-chevron-right ms-1" aria-hidden="true"></i></button>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php if (in_array($perfilModais, ['contribuidor', 'leitor'], true) && podeEnviarLivros()): ?>
<div class="modal fade" id="modalEnvios" tabindex="-1" aria-labelledby="tituloModalEnvios" data-testid="modal-envios">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h5 class="modal-title" id="tituloModalEnvios"><i class="fas fa-cloud-arrow-up me-2 text-info"></i>Meus envios</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-modal-envios"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small mb-1">Seus livros ficam só na sua biblioteca<?= $perfilModais === 'contribuidor' ? ' (e na da sua família)' : '' ?>. Para publicar no acervo geral, peça a publicação: o administrador aprova se o livro for novo.</p>
                <p class="small text-info mb-3" id="enviosContagem" data-testid="envios-contagem"></p>
                <div id="perfisAviso-envios" class="alert d-none py-2 small" role="status" aria-live="polite"></div>
                <div id="listaEnvios" data-testid="lista-envios" aria-live="polite"></div>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<?php if ($perfilModais === 'contribuidor' && !ehDependente()): ?>
<div class="modal fade" id="modalFamilia" tabindex="-1" aria-labelledby="tituloModalFamilia" data-testid="modal-familia">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h5 class="modal-title" id="tituloModalFamilia"><i class="fas fa-people-roof me-2 text-info"></i>Minha família</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-modal-familia"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small">Crie até <?= (int) LIMITE_DEPENDENTES ?> acessos para quem mora com você (<?= (int) LIMITE_ACESSOS['contribuidor'] ?> pessoas podem ler ao mesmo tempo). Eles veem os livros que você enviou, sem precisar de aprovação, mas só você envia livros.</p>
                <div id="perfisAviso-familia" class="alert d-none py-2 small" role="status" aria-live="polite"></div>
                <div id="listaFamilia" data-testid="lista-familia" aria-live="polite"></div>
                <form id="formFamilia" class="mt-3" autocomplete="off" novalidate data-testid="form-familia">
                    <h6 class="mb-2">Novo acesso</h6>
                    <input type="text" name="nome" class="form-control bg-secondary text-light border-0 mb-2" placeholder="Nome" maxlength="100" required data-testid="input-familia-nome">
                    <input type="email" name="email" class="form-control bg-secondary text-light border-0 mb-2" placeholder="E-mail" maxlength="100" required data-testid="input-familia-email" autocomplete="off">
                    <input type="password" name="senha" class="form-control bg-secondary text-light border-0" placeholder="Senha provisória" required
                           pattern="<?= $regexSenhaFamilia ?>" title="<?= e($dicaSenhaFamilia) ?>" data-testid="input-familia-senha" autocomplete="new-password">
                    <small class="text-muted"><?= e($dicaSenhaFamilia) ?></small>
                    <button type="submit" class="btn btn-neon w-100 mt-3" data-testid="btn-familia-adicionar"><i class="fas fa-user-plus me-2"></i>Criar acesso</button>
                </form>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>
