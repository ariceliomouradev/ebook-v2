<?php
/**
 * Modal "Gerenciar usuários" (só admin). Quatro telas dentro do mesmo modal, como nos outros:
 * lista, novo usuário, redefinir senha e excluir. Fechar o modal é o jeito de "voltar":
 * a página inicial nunca é recarregada. Entrada: $listaUsuarios.
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
$regexSenha = '(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}';
$dicaSenha = 'Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.';
?>
<div class="modal fade" id="modalUsuarios" tabindex="-1" aria-labelledby="tituloModalUsuarios" data-testid="modal-usuarios">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content bg-dark border-secondary">

            <div class="modal-header border-secondary">
                <h5 class="modal-title" id="tituloModalUsuarios" data-testid="titulo-pagina-usuarios"><i class="fas fa-users-cog me-2 text-info"></i>Gerenciar usuários</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar" data-testid="btn-fechar-modal-usuarios"></button>
            </div>

            <div class="modal-body">
                <div id="usuariosAviso" class="alert d-none py-2 small" role="status" aria-live="polite" data-testid="usuarios-aviso"></div>

                <!-- Tela 1: lista -->
                <div id="viewUsuariosLista" data-testid="view-usuarios-lista">
                    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                        <span class="text-secondary small"><b id="usuariosTotal" class="text-light"><?= count($listaUsuarios) ?></b> <span id="usuariosRotulo"><?= count($listaUsuarios) === 1 ? 'pessoa' : 'pessoas' ?></span> com acesso</span>
                        <button type="button" class="btn btn-neon btn-sm" id="btnNovoUsuario" data-testid="btn-modal-novo-usuario">
                            <i class="fas fa-user-plus me-2"></i>Adicionar usuário
                        </button>
                    </div>
                    <div id="usuariosTabela" data-testid="usuarios-tabela-area">
                        <?php include __DIR__ . '/usuarios_gerenciador.php'; ?>
                    </div>
                </div>

                <!-- Tela 2: novo usuário -->
                <form id="formNovoUsuario" class="d-none" data-testid="form-novo-usuario" autocomplete="off" novalidate>
                    <h6 class="mb-3">Novo usuário</h6>
                    <div class="row g-3">
                        <div class="col-12 col-md-6">
                            <label class="text-muted small" for="novoUsuarioNome">Nome completo</label>
                            <input type="text" id="novoUsuarioNome" name="nome" class="form-control bg-secondary text-light border-0" required maxlength="100" data-testid="input-nome-usuario">
                        </div>
                        <div class="col-12 col-md-6">
                            <label class="text-muted small" for="novoUsuarioEmail">E-mail</label>
                            <input type="email" id="novoUsuarioEmail" name="email" class="form-control bg-secondary text-light border-0" required maxlength="100" data-testid="input-email-usuario">
                        </div>
                        <div class="col-12 col-md-6">
                            <label class="text-muted small" for="novoUsuarioSenha">Senha provisória</label>
                            <div class="input-group">
                                <input type="password" id="novoUsuarioSenha" name="senha" class="form-control bg-secondary text-light border-0 border-end-0" required
                                       pattern="<?= $regexSenha ?>" title="<?= e($dicaSenha) ?>" data-testid="input-senha-usuario" autocomplete="new-password">
                                <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-senha-provisoria" aria-label="Mostrar ou ocultar a senha">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                            <small class="text-muted"><?= e($dicaSenha) ?></small>
                        </div>
                        <div class="col-12 col-md-6">
                            <label class="text-muted small" for="novoUsuarioPerfil">Nível de acesso</label>
                            <select name="perfil" id="novoUsuarioPerfil" class="form-select bg-secondary text-light border-0" required data-testid="select-perfil-usuario">
                                <option value="leitor">Assinante (1 acesso, envia PDFs para aprovação)</option>
                                <option value="contribuidor">Família (até 3 acessos, titular envia PDFs)</option>
                                <option value="admin">Administrador (acesso total)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-check mt-3">
                        <input class="form-check-input" type="checkbox" name="teste" value="1" id="novoUsuarioTeste" checked data-testid="check-teste-gratis">
                        <label class="form-check-label" for="novoUsuarioTeste">Começa com <?= (int) TESTE_DIAS ?> dias de teste grátis <span class="text-secondary">(depois <?= e(formatarReais(PRECOS_MENSAIS['leitor'])) ?>/mês Assinante, <?= e(formatarReais(PRECOS_MENSAIS['contribuidor'])) ?>/mês Família). Desmarque para um acesso sem vencimento.</span></label>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="button" class="btn btn-secondary flex-fill btn-cancelar-usuarios" data-testid="btn-cancelar-novo-usuario">Cancelar</button>
                        <button type="submit" class="btn btn-neon flex-fill" data-testid="btn-salvar-usuario"><i class="fas fa-save me-2"></i>Cadastrar no sistema</button>
                    </div>
                </form>

                <!-- Tela 3: redefinir senha -->
                <form id="formResetSenha" class="d-none" data-testid="form-reset-senha" autocomplete="off" novalidate>
                    <input type="hidden" name="usuario_id" id="resetUsuarioId">
                    <h6 class="mb-1">Redefinir senha</h6>
                    <p class="text-muted small mb-3">Nova senha para: <strong class="text-light" id="resetUsuarioNome"></strong></p>
                    <label class="text-muted small" for="resetNovaSenha">Nova senha</label>
                    <div class="input-group">
                        <input type="password" id="resetNovaSenha" name="nova_senha" class="form-control bg-secondary text-light border-0 border-end-0" required
                               pattern="<?= $regexSenha ?>" title="<?= e($dicaSenha) ?>" data-testid="input-reset-nova-senha" autocomplete="new-password">
                        <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-reset-senha" aria-label="Mostrar ou ocultar a senha">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    <small class="text-muted"><?= e($dicaSenha) ?></small>
                    <div class="d-flex gap-2 mt-4">
                        <button type="button" class="btn btn-secondary flex-fill btn-cancelar-usuarios">Cancelar</button>
                        <button type="submit" class="btn btn-warning flex-fill fw-bold" data-testid="btn-confirmar-reset-senha">Salvar nova senha</button>
                    </div>
                </form>

                <!-- Tela 4: excluir -->
                <form id="formExcluirUsuario" class="d-none text-center" data-testid="form-excluir-usuario" novalidate>
                    <input type="hidden" name="usuario_id" id="excluirUsuarioId">
                    <i class="fas fa-exclamation-triangle text-danger fs-1 mb-3"></i>
                    <p class="mb-1">Tem certeza que deseja remover o acesso de:</p>
                    <h5 id="excluirUsuarioNome" class="text-info fw-bold"></h5>
                    <small class="text-muted d-block mt-2">Os livros cadastrados por esta pessoa <strong>serão mantidos</strong> na biblioteca.</small>
                    <div class="d-flex justify-content-center gap-2 mt-4">
                        <button type="button" class="btn btn-outline-light btn-cancelar-usuarios">Cancelar</button>
                        <button type="submit" class="btn btn-danger px-4" data-testid="btn-confirmar-excluir-usuario">Confirmar exclusão</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
