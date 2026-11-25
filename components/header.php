<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

$perfilUsuario = $_SESSION['usuario_perfil'] ?? 'leitor';
$sitAcesso = isset($pdo) ? situacaoAcesso($pdo, (int) ($_SESSION['usuario_id'] ?? 0)) : situacaoDeLinha([]);
$nomeCompleto = $_SESSION['usuario_nome'] ?? 'Usuário';
$primeiroNome = explode(' ', $nomeCompleto)[0];
$inicial = mb_strtoupper(mb_substr($primeiroNome, 0, 1));
$busca = $busca ?? ($_GET['busca'] ?? '');
$mostrarBusca = $mostrarBusca ?? false;
?>
<header class="app-bar" data-testid="header-container">
    <div class="container app-bar__inner">

        <a class="brand" href="<?= url('index.php') ?>" aria-label="Meus Livros — início">
            <img class="brand__mark" src="<?= caminhoRaiz() ?>assets/icons/icon-192.png" alt="" width="36" height="36">
            <span class="brand__nome" data-testid="header-title">Meus Livros</span>
        </a>

        <?php if ($mostrarBusca): ?>
        <div class="busca" role="search">
            <i class="fas fa-search busca__icone" aria-hidden="true"></i>
            <input type="search" id="campoBusca"
                class="form-control bg-dark text-light"
                placeholder="Buscar por título ou autor"
                aria-label="Buscar no acervo"
                autocomplete="off"
                value="<?= e($busca) ?>"
                data-testid="input-busca-principal">
            <div class="busca__direita">
                <button class="busca__limpar" type="button" id="btnLimparBusca" aria-label="Limpar pesquisa"
                        style="display: <?= $busca !== '' ? 'flex' : 'none' ?>;" data-testid="btn-limpar-busca">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <?php endif; ?>

        <div class="app-acoes">
            <?php if (podeEnviarLivros()): ?>
            <button class="btn btn-neon" data-bs-toggle="modal" data-bs-target="#modalUpload"
                data-testid="btn-novo-livro" aria-label="Adicionar livro">
                <i class="fas fa-plus" aria-hidden="true"></i><span class="btn-rotulo ms-2">Adicionar</span>
            </button>
            <?php endif; ?>

            <div class="dropdown">
                <button type="button" class="btn-tema dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Escolher o tema da tela" title="Tema" data-testid="btn-tema">
                    <i class="fas fa-moon" data-tema-icone aria-hidden="true"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow menu-tema" data-testid="menu-tema">
                    <li><span class="dropdown-item-text small text-secondary">Tema</span></li>
                    <li><button type="button" class="dropdown-item" data-tema-opcao="claro" aria-pressed="false" data-testid="tema-claro"><i class="fas fa-sun me-2" aria-hidden="true"></i>Claro<i class="fas fa-check ms-auto tema-ok" aria-hidden="true"></i></button></li>
                    <li><button type="button" class="dropdown-item" data-tema-opcao="escuro" aria-pressed="false" data-testid="tema-escuro"><i class="fas fa-moon me-2" aria-hidden="true"></i>Escuro<i class="fas fa-check ms-auto tema-ok" aria-hidden="true"></i></button></li>
                    <li><button type="button" class="dropdown-item" data-tema-opcao="papel" aria-pressed="false" data-testid="tema-papel"><i class="fas fa-book-open me-2" aria-hidden="true"></i>Papel<i class="fas fa-check ms-auto tema-ok" aria-hidden="true"></i></button></li>
                </ul>
            </div>

            <div class="dropdown">
                <button class="menu-usuario dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false"
                        aria-label="Menu da conta de <?= e($primeiroNome) ?>" data-testid="btn-user-menu">
                    <span class="avatar" aria-hidden="true"><?= e($inicial) ?></span>
                    <span class="menu-usuario__nome"><?= e($primeiroNome) ?></span>
                    <i class="fas fa-chevron-down" aria-hidden="true"></i>
                </button>
                <ul class="dropdown-menu dropdown-menu-end shadow">
                    <li><span class="dropdown-item-text small text-secondary">Plano <span class="perfil-etiqueta ms-1"><?= e(mb_strtoupper(rotuloPerfil($perfilUsuario))) ?></span></span></li>
                    <?php if ($sitAcesso['limitado']): ?>
                    <li><span class="dropdown-item-text small <?= $sitAcesso['vencido'] ? 'text-warning' : 'text-secondary' ?>" data-testid="menu-acesso"><i class="fas fa-clock me-1" aria-hidden="true"></i><?= e(resumoAcesso($sitAcesso)) ?></span></li>
                    <?php endif; ?>
                    <li><hr class="dropdown-divider"></li>

                    <?php if ($perfilUsuario === 'admin' && !empty($mostrarBusca)): ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalGerenciar" data-testid="btn-abrir-gerenciador"><i class="fas fa-book me-2"></i>Gerenciar livros</button></li>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalGerenciar" data-abrir-banners data-testid="btn-menu-banners"><i class="fas fa-image me-2"></i>Gerenciar banners</button></li>
                    <?php endif; ?>

                    <?php if ($perfilUsuario === 'admin' && !empty($mostrarBusca)):
                        try {
                            $pendentesAprovacao = (int) $pdo->query("SELECT COUNT(*) FROM livros WHERE publicacao = 'pendente'")->fetchColumn();
                        } catch (PDOException $e) {
                            $pendentesAprovacao = 0; // banco ainda sem a migração v1.5
                        } ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalAprovacoes" data-testid="btn-menu-aprovacoes"><i class="fas fa-clipboard-check me-2"></i>Aprovações <span class="badge text-bg-warning ms-1<?= $pendentesAprovacao ? '' : ' d-none' ?>" data-testid="badge-aprovacoes"><?= (int) $pendentesAprovacao ?></span></button></li>
                    <?php endif; ?>

                    <?php if ($perfilUsuario === 'leitor' && trocaAtiva() && !ehDependente() && !empty($mostrarBusca)): ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalAcervo" data-testid="btn-menu-acervo"><i class="fas fa-compass me-2"></i>Explorar acervo</button></li>
                    <?php endif; ?>

                    <?php if (podeEnviarLivros() && $perfilUsuario !== 'admin' && !empty($mostrarBusca)): ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalEnvios" data-testid="btn-menu-envios"><i class="fas fa-cloud-arrow-up me-2"></i>Meus envios</button></li>
                    <?php endif; ?>
                    <?php if ($perfilUsuario === 'contribuidor' && !ehDependente() && !empty($mostrarBusca)): ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalFamilia" data-testid="btn-menu-familia"><i class="fas fa-people-roof me-2"></i>Acessos do Pro</button></li>
                    <?php endif; ?>

                    <?php if ($perfilUsuario === 'admin'): ?>
                    <li><button type="button" class="dropdown-item" data-bs-toggle="modal" data-bs-target="#modalUsuarios" data-testid="btn-menu-usuarios"><i class="fas fa-users me-2"></i>Gerenciar usuários</button></li>
                    <?php endif; ?>

                    <li><a class="dropdown-item" href="#" data-bs-toggle="modal" data-bs-target="#modalTrocarSenha" data-testid="btn-menu-trocar-senha"><i class="fas fa-key me-2"></i>Trocar Senha</a></li>

                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-danger" href="<?= url('logout.php') ?>" data-testid="btn-logout"><i class="fas fa-sign-out-alt me-2"></i>Sair</a></li>
                </ul>
            </div>
        </div>
    </div>
</header>

<?php if ($sitAcesso['limitado'] && ($sitAcesso['vencido'] || $sitAcesso['dias'] <= 7)):
    $precoDoPlano = formatarReais(precoMensal($sitAcesso['perfil']));
    $msgSuporte = 'Olá! Quero ' . ($sitAcesso['vencido'] ? 'ativar' : 'continuar com') . ' o plano ' . rotuloPerfil($sitAcesso['perfil']) . ' do Meus Livros (' . $precoDoPlano . '/mês, pagamento por PIX). Meu nome: ' . ($_SESSION['usuario_nome'] ?? ''); ?>
<div class="aviso-plano<?= $sitAcesso['vencido'] ? ' aviso-plano--vencido' : '' ?>" role="status" data-testid="aviso-plano">
    <span>
        <?php if ($sitAcesso['vencido']): ?>
            <strong><?= $sitAcesso['origem'] === 'teste' ? 'Seu teste terminou.' : 'Seu plano Pro venceu.' ?></strong> Para continuar: <?= e($precoDoPlano) ?>/mês, por PIX.
        <?php else: ?>
            <strong><?= $sitAcesso['origem'] === 'teste' ? 'Seu teste' : 'Seu plano Pro' ?> termina em <?= (int) $sitAcesso['dias'] ?> <?= $sitAcesso['dias'] === 1 ? 'dia' : 'dias' ?>.</strong> Depois: <?= e($precoDoPlano) ?>/mês, por PIX.
        <?php endif; ?>
    </span>
    <a class="btn btn-sm btn-neon" href="<?= e(linkSuporte($msgSuporte)) ?>" target="_blank" rel="noopener" data-testid="aviso-plano-suporte"><i class="fab fa-whatsapp me-1" aria-hidden="true"></i>Falar com o suporte</a>
</div>
<?php endif; ?>

<div class="modal fade" id="modalTrocarSenha" tabindex="-1" data-testid="modal-trocar-senha">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content bg-dark border-secondary">
            <div class="modal-header border-secondary">
                <h6 class="modal-title text-light"><i class="fas fa-key me-2 text-info"></i>Alterar Senha</h6>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" data-testid="btn-fechar-modal-senha" aria-label="Fechar"></button>
            </div>
            <form action="<?= caminhoRaiz() ?>api/mudar_senha.php" method="POST" data-testid="form-trocar-senha">
                <?= csrf_field() ?>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="text-muted small">Senha Atual</label>
                        <div class="input-group">
                            <input type="password" name="senha_atual" class="form-control bg-secondary text-light border-0 border-end-0" required data-testid="input-senha-atual">
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-senha-atual" aria-label="Mostrar ou ocultar a senha">
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
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-nova-senha" aria-label="Mostrar ou ocultar a senha">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                        <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                    </div>
                    <div class="mb-2">
                        <label class="text-muted small">Confirmar Nova Senha</label>
                        <div class="input-group">
                            <input type="password" name="confirma_senha" class="form-control bg-secondary text-light border-0 border-end-0" required data-testid="input-confirma-senha">
                            <button class="btn btn-secondary border-0 text-muted" type="button" data-toggle-password data-testid="btn-toggle-confirma-senha" aria-label="Mostrar ou ocultar a senha">
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
    'bem_vindo'    => 'Conta criada! Os seus ' . TESTE_DIAS . ' dias grátis já começaram. Explore o acervo e boa leitura.',
    'sucesso'      => ($_SESSION['usuario_perfil'] ?? '') === 'admin' ? 'Livro cadastrado com sucesso na biblioteca.' : 'Livro guardado na sua biblioteca. Para publicá-lo, peça a aprovação em Meus envios.',
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
    'erro_sem_permissao' => 'Sua conta não pode enviar livros. Peça ao titular do plano Pro.',
    'erro_limite_envios' => 'Você atingiu o limite de livros enviados. Exclua um envio para adicionar outro.',
    'erro_duplicado'     => 'Este arquivo já existe no acervo.',
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
