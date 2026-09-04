<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';
$primeiroNome = explode(' ', $_SESSION['usuario_nome'] ?? 'Usuário')[0];
$ordemAtual = $ordemAtual ?? ($_GET['ordem'] ?? 'recentes');
$busca = $busca ?? ($_GET['busca'] ?? '');
?>
<div class="row mb-4 align-items-center g-3" data-testid="header-container">

    <div class="col-12 col-md-3 text-center text-md-start">
        <h4 class="text-info mb-0" data-testid="header-title"><i class="fas fa-book-reader"></i> Meus Livros</h4>
    </div>

    <div class="col-12 col-md-4">
        <div class="input-group input-group-sm">
            <span class="input-group-text bg-dark border-secondary text-secondary">
                <i class="fas fa-search"></i>
            </span>
            <input type="text" id="campoBusca"
                class="form-control bg-dark text-light border-secondary border-start-0"
                placeholder="Pesquisar em todo o acervo..."
                value="<?= e($busca) ?>"
                data-testid="input-busca-principal">
            <button class="btn btn-outline-secondary border-secondary border-start-0 text-secondary"
                    type="button" id="btnLimparBusca" style="display: <?= $busca !== '' ? 'block' : 'none' ?>;"
                    data-testid="btn-limpar-busca">
                <i class="fas fa-times"></i>
            </button>
        </div>
    </div>

    <div class="col-12 col-md-5">
        <div class="d-flex gap-2 align-items-center justify-content-center justify-content-md-end">

            <select class="form-select form-select-sm bg-dark text-light border-secondary"
                    style="max-width: 130px;"
                    id="selectOrdenacao"
                    data-testid="select-ordenacao">
                <option value="recentes" <?= $ordemAtual == 'recentes' ? 'selected' : '' ?>>Mais Recentes</option>
                <option value="antigos" <?= $ordemAtual == 'antigos' ? 'selected' : '' ?>>Mais Antigos</option>
                <option value="az" <?= $ordemAtual == 'az' ? 'selected' : '' ?>>A - Z</option>
                <option value="za" <?= $ordemAtual == 'za' ? 'selected' : '' ?>>Z - A</option>
            </select>

            <?php if ($perfilUsuario === 'admin'): ?>
            <button class="btn btn-edit btn-sm flex-fill flex-md-grow-0" data-bs-toggle="modal"
                data-bs-target="#modalGerenciar"
                data-testid="btn-abrir-gerenciador">
                <i class="fas fa-edit"></i> Editar
            </button>
            <?php endif; ?>

            <?php if ($perfilUsuario === 'admin' || $perfilUsuario === 'contribuidor'): ?>
            <button class="btn btn-neon btn-sm flex-fill flex-md-grow-0" data-bs-toggle="modal" data-bs-target="#modalUpload"
                data-testid="btn-novo-livro">
                <i class="fas fa-plus"></i> Novo
            </button>
            <?php endif; ?>

            <div class="dropdown">
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" data-testid="btn-user-menu">
                    <i class="fas fa-user-circle"></i> <?= e($primeiroNome) ?>
                </button>
                <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark shadow">
                    <li><span class="dropdown-item-text text-muted small">Nível: <b class="text-info"><?= e(strtoupper($perfilUsuario)) ?></b></span></li>
                    <li><hr class="dropdown-divider border-secondary"></li>

                    <?php if ($perfilUsuario === 'admin'): ?>
                    <li><a class="dropdown-item" href="<?= url('usuarios.php') ?>" data-testid="btn-menu-usuarios"><i class="fas fa-users me-2"></i>Gerenciar Usuários</a></li>
                    <?php endif; ?>

                    <li><a class="dropdown-item" href="#" data-bs-toggle="modal" data-bs-target="#modalTrocarSenha" data-testid="btn-menu-trocar-senha"><i class="fas fa-key me-2"></i>Trocar Senha</a></li>

                    <li><hr class="dropdown-divider border-secondary"></li>
                    <li><a class="dropdown-item text-danger" href="<?= url('logout.php') ?>" data-testid="btn-logout"><i class="fas fa-sign-out-alt me-2"></i>Sair</a></li>
                </ul>
            </div>

        </div>
    </div>
</div>

<div class="modal fade" id="modalTrocarSenha" tabindex="-1" data-testid="modal-trocar-senha">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h6 class="modal-title text-light"><i class="fas fa-key me-2 text-info"></i>Alterar Senha</h6>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" data-testid="btn-fechar-modal-senha"></button>
            </div>
            <form action="<?= caminhoRaiz() ?>api/mudar_senha.php" method="POST" data-testid="form-trocar-senha">
                <?= csrf_field() ?>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="text-muted small">Senha Atual</label>
                        <div class="input-group">
                            <input type="password" name="senha_atual" class="form-control bg-secondary text-light border-0 border-end-0" required data-testid="input-senha-atual">
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-senha-atual">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="text-muted small">Nova Senha</label>
                        <div class="input-group">
                            <input type="password" name="nova_senha" class="form-control bg-secondary text-light border-0 border-end-0"
                                   required
                                   pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
                                   title="A senha deve ter no mínimo 8 caracteres, contendo pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial."
                                   data-testid="input-nova-senha">
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-nova-senha">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                        <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                    </div>
                    <div class="mb-2">
                        <label class="text-muted small">Confirmar Nova Senha</label>
                        <div class="input-group">
                            <input type="password" name="confirma_senha" class="form-control bg-secondary text-light border-0 border-end-0" required data-testid="input-confirma-senha">
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-confirma-senha">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer border-secondary p-2">
                    <button type="submit" class="btn btn-info btn-sm w-100 fw-bold" data-testid="btn-salvar-nova-senha">
                        Atualizar Senha
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<?php
$alertaMsg = ''; $alertaCor = ''; $alertaIcone = ''; $alertaTitulo = '';
$msg = $_GET['msg'] ?? '';

$mensagensSucesso = [
    'user_added'   => 'Usuário cadastrado com sucesso no sistema.',
    'pwd_reset'    => 'A senha do usuário foi redefinida com sucesso.',
    'user_deleted' => 'Usuário excluído. O acervo de livros dele foi mantido.',
    'pwd_changed'  => 'Senha alterada! Use a nova credencial no próximo acesso.',
    'sucesso'      => 'Livro cadastrado com sucesso na biblioteca.',
    'excluido'     => 'Livro excluído com sucesso.',
];
$mensagensErro = [
    'erro_user_exists'   => 'Este e-mail já está em uso por outro usuário.',
    'erro_pwd_weak'      => 'A senha não atende aos requisitos mínimos de segurança.',
    'erro_pwd_mismatch'  => 'As novas senhas digitadas não coincidem.',
    'erro_pwd_wrong'     => 'A senha atual informada está incorreta.',
    'erro_invalid_data'  => 'Dados inválidos ou incompletos. Tente novamente.',
    'erro_self_delete'   => 'Operação bloqueada: Você não pode excluir a sua própria conta.',
    'erro_arquivo'       => 'Arquivo inválido ou não permitido.',
];

if (isset($mensagensSucesso[$msg])) {
    $alertaCor = 'text-success'; $alertaIcone = 'fa-check-circle'; $alertaTitulo = 'Sucesso!';
    $alertaMsg = $mensagensSucesso[$msg];
} elseif (isset($mensagensErro[$msg])) {
    $alertaCor = 'text-danger'; $alertaIcone = 'fa-exclamation-triangle'; $alertaTitulo = 'Atenção!';
    $alertaMsg = $mensagensErro[$msg];
}
?>

<?php if ($alertaMsg !== ''): ?>
<div class="modal fade" id="modalAlertaGlobal" tabindex="-1" aria-hidden="true" data-testid="modal-alerta-global">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content bg-dark border-secondary shadow-lg">
            <div class="modal-header border-bottom-0 pb-0">
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body text-center pt-0 pb-4">
                <i class="fas <?= $alertaIcone ?> <?= $alertaCor ?> mb-3" style="font-size: 3.5rem;"></i>
                <h5 class="text-light fw-bold" data-testid="alerta-titulo"><?= e($alertaTitulo) ?></h5>
                <p class="text-muted small mb-4" data-testid="alerta-mensagem"><?= e($alertaMsg) ?></p>
                <button type="button" class="btn btn-outline-light btn-sm w-100" data-bs-dismiss="modal" data-testid="btn-fechar-alerta">Entendi</button>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>
