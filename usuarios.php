<?php
define('CAMINHO_RAIZ', '');
require_once 'config/bootstrap.php';
require_perfil(['admin']);

$stmt = $pdo->query("SELECT id, nome, email, perfil, criado_em FROM usuarios ORDER BY id DESC");
$listaUsuarios = $stmt->fetchAll();

$tituloPagina = 'Gerenciar Usuários';
?>
<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">
<head>
    <?php include 'components/head.php'; ?>
</head>
<body class="d-flex flex-column">

    <div class="container py-4 flex-grow-1">
        <?php include 'components/header.php'; ?>

        <div class="row mb-4 align-items-center">
            <div class="col-12 col-md-5">
                <h5 class="text-info mb-0" data-testid="titulo-pagina-usuarios"><i class="fas fa-users-cog me-2"></i>Controle de Acessos</h5>
            </div>
            <div class="col-12 col-md-7 text-md-end mt-3 mt-md-0 d-flex gap-2 justify-content-md-end">
                <a href="<?= url('index.php') ?>" class="btn btn-outline-secondary btn-sm" data-testid="btn-voltar-index">
                    <i class="fas fa-arrow-left me-1"></i> Voltar à Biblioteca
                </a>
                <button class="btn btn-neon btn-sm" data-bs-toggle="modal" data-bs-target="#modalNovoUsuario" data-testid="btn-modal-novo-usuario">
                    <i class="fas fa-user-plus me-1"></i> Adicionar Usuário
                </button>
            </div>
        </div>

        <div class="card bg-dark border-secondary">
            <div class="card-body p-0 table-responsive">
                <table class="table table-dark table-hover mb-0" data-testid="tabela-usuarios">
                    <thead class="text-muted small">
                        <tr>
                            <th>Nome</th>
                            <th>E-mail</th>
                            <th>Perfil</th>
                            <th>Data de Criação</th>
                            <th class="text-end">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($listaUsuarios as $user): ?>
                        <tr data-testid="linha-usuario" data-id="<?= (int) $user['id'] ?>">
                            <td class="align-middle fw-bold"><?= e($user['nome']) ?></td>
                            <td class="align-middle"><?= e($user['email']) ?></td>
                            <td class="align-middle">
                                <?php
                                    $badgeColor = 'bg-secondary';
                                    if ($user['perfil'] === 'admin') $badgeColor = 'bg-danger';
                                    if ($user['perfil'] === 'contribuidor') $badgeColor = 'bg-primary';
                                    if ($user['perfil'] === 'leitor') $badgeColor = 'bg-success';
                                ?>
                                <span class="badge <?= $badgeColor ?> text-uppercase" data-testid="badge-perfil"><?= e($user['perfil']) ?></span>
                            </td>
                            <td class="align-middle text-muted small"><?= e(date('d/m/Y H:i', strtotime($user['criado_em']))) ?></td>
                            <td class="align-middle text-end">
                                <?php if ((int) $user['id'] !== (int) $_SESSION['usuario_id']): ?>
                                    <button class="btn btn-sm btn-outline-warning btn-abrir-reset-senha" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>" data-testid="btn-reset-senha" title="Redefinir Senha">
                                        <i class="fas fa-key"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger ms-1 btn-abrir-excluir-usuario" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>" data-testid="btn-excluir-usuario" title="Excluir Usuário">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                <?php else: ?>
                                    <span class="badge bg-dark text-muted border border-secondary">Você</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modalNovoUsuario" tabindex="-1" data-testid="modal-novo-usuario">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h5 class="modal-title text-info"><i class="fas fa-user-plus me-2"></i>Novo Usuário</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" data-testid="btn-fechar-modal-usuario"></button>
                </div>
                <form action="api/usuario_add.php" method="POST" data-testid="form-novo-usuario">
                    <?= csrf_field() ?>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="text-muted small">Nome Completo</label>
                            <input type="text" name="nome" class="form-control bg-secondary text-light border-0" required maxlength="100" data-testid="input-nome-usuario">
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small">E-mail</label>
                            <input type="email" name="email" class="form-control bg-secondary text-light border-0" required maxlength="100" data-testid="input-email-usuario">
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small">Senha Provisória</label>
                            <div class="input-group">
                                <input type="password" name="senha" class="form-control bg-secondary text-light border-0 border-end-0"
                                       required
                                       pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
                                       title="Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo."
                                       data-testid="input-senha-usuario">
                                <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-senha-provisoria">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                            <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small">Nível de Acesso</label>
                            <select name="perfil" class="form-select bg-secondary text-light border-0" required data-testid="select-perfil-usuario">
                                <option value="leitor">Leitor (Apenas visualiza)</option>
                                <option value="contribuidor">Contribuidor (Pode adicionar PDFs)</option>
                                <option value="admin">Administrador (Acesso Total)</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="submit" class="btn btn-neon w-100 py-2" data-testid="btn-salvar-usuario">
                            <i class="fas fa-save me-2"></i>Cadastrar no Sistema
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modalResetSenhaUsuario" tabindex="-1" data-testid="modal-reset-senha-usuario">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h6 class="modal-title text-warning"><i class="fas fa-key me-2"></i>Redefinir Senha</h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" data-testid="btn-fechar-modal-reset"></button>
                </div>
                <form action="api/usuario_reset_senha.php" method="POST" data-testid="form-reset-senha">
                    <?= csrf_field() ?>
                    <input type="hidden" name="usuario_id" id="resetUsuarioId">
                    <div class="modal-body">
                        <p class="text-muted small mb-3">Definindo nova senha para: <br><strong class="text-light" id="resetUsuarioNome"></strong></p>
                        <div class="mb-2">
                            <label class="text-muted small">Nova Senha</label>
                            <div class="input-group">
                                <input type="password" name="nova_senha" class="form-control bg-secondary text-light border-0 border-end-0"
                                       required
                                       pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
                                       title="A senha deve ter no mínimo 8 caracteres, contendo pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial."
                                       data-testid="input-reset-nova-senha">
                                <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-reset-senha">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                            <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary p-2">
                        <button type="submit" class="btn btn-warning btn-sm w-100 fw-bold" data-testid="btn-confirmar-reset-senha">
                            Salvar Nova Senha
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modalExcluirUsuario" tabindex="-1" aria-hidden="true" data-testid="modal-excluir-usuario">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content bg-dark border-danger">
                <div class="modal-header border-bottom-0">
                    <h5 class="modal-title text-danger"><i class="fas fa-exclamation-triangle"></i> Atenção</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
                </div>
                <form action="api/usuario_excluir.php" method="POST" data-testid="form-excluir-usuario">
                    <?= csrf_field() ?>
                    <input type="hidden" name="usuario_id" id="excluirUsuarioId">
                    <div class="modal-body text-center">
                        <p>Tem certeza que deseja remover o acesso de:</p>
                        <h6 id="excluirUsuarioNome" class="text-info fw-bold"></h6>
                        <small class="text-muted d-block mt-3">Os livros cadastrados por esta pessoa <strong>serão mantidos</strong> na biblioteca.</small>
                    </div>
                    <div class="modal-footer border-top-0 d-flex justify-content-center gap-2">
                        <button type="button" class="btn btn-sm btn-outline-light" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-sm btn-danger px-3" data-testid="btn-confirmar-excluir-usuario">Confirmar Exclusão</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
    <script src="<?= asset('assets/js/usuarios.js') ?>"></script>
</body>
</html>
