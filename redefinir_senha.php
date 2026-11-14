<?php
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

$token = $_GET['token'] ?? '';
$tokenValido = false;

if (!empty($token)) {
    $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE reset_token = ? AND reset_expires > NOW()");
    $stmt->execute([$token]);
    $tokenValido = (bool) $stmt->fetch();
}

$msg = $_GET['msg'] ?? '';
$mensagensErro = [
    'erro_pwd_mismatch' => 'As senhas digitadas não coincidem.',
    'erro_pwd_weak'      => 'A senha não atende aos requisitos mínimos de segurança.',
];

$tituloPagina = 'Criar Nova Senha';
?>
<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">
<head>
    <?php include 'components/head.php'; ?>
</head>
<body class="auth-page">

    <div class="auth-layout">
    <aside class="auth-marca" aria-hidden="true">
        <div class="auth-marca__topo"><img src="assets/icons/icon-192.png" alt="" width="42" height="42"> Meus Livros</div>
        <div class="auth-marca__meio">
            <h2>Uma senha nova, <em>seu acervo de volta.</em></h2>
            <p class="auth-marca__lead">Escolha uma senha forte: com maiúscula, minúscula, número e símbolo.</p>
        </div>
        <div></div>
    </aside>
    <div class="auth-painel">
    <div class="login-card" data-testid="redefinir-container">
        <div class="auth-marca-mobile"><img src="assets/icons/icon-192.png" alt="" width="44" height="44"> Meus Livros</div>
        <div class="mb-4">
            <h1 class="h3 text-light mb-1">Criar nova senha</h1>
            <p class="text-secondary mb-0">Defina a senha que você usará no próximo acesso.</p>
        </div>

        <?php if (isset($mensagensErro[$msg])): ?>
            <div class="alert alert-danger py-2 small text-center" data-testid="redefinir-alerta"><?= e($mensagensErro[$msg]) ?></div>
        <?php endif; ?>

        <?php if (!$tokenValido): ?>
            <div class="alert alert-danger py-3 small text-center" data-testid="msg-token-invalido">
                <i class="fas fa-times-circle fs-4 d-block mb-2"></i>
                Link inválido ou expirado.<br>Por favor, solicite a redefinição novamente.
            </div>
            <a href="<?= url('login.php') ?>" class="btn btn-outline-light w-100 mt-3">Voltar ao Login</a>
        <?php else: ?>

            <form action="api/salvar_nova_senha.php" method="POST" data-testid="form-salvar-nova-senha">
                <?= csrf_field() ?>
                <input type="hidden" name="token" value="<?= e($token) ?>">

                <div class="mb-3">
                    <label class="form-label text-muted small">Digite a nova senha</label>
                    <div class="input-group">
                        <input type="password" name="nova_senha" class="form-control bg-dark border-secondary text-light border-end-0"
                               required
                               pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
                               title="Mínimo de 8 caracteres. Use letras maiúsculas, minúsculas, números e símbolos."
                               data-testid="input-redefinir-senha">
                        <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                </div>

                <div class="mb-4">
                    <label class="form-label text-muted small">Confirme a nova senha</label>
                    <div class="input-group">
                        <input type="password" name="confirma_senha" class="form-control bg-dark border-secondary text-light border-end-0" required data-testid="input-redefinir-confirma">
                        <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-info w-100" data-testid="btn-salvar-redefinicao">
                    Salvar e entrar
                </button>
            </form>

        <?php endif; ?>
    </div>
    </div>
    </div>

    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
</body>
</html>
