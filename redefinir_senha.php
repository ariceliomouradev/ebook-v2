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
    <style>
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background-color: #121212; }
        .login-card { background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    </style>
</head>
<body>

    <div class="login-card" data-testid="redefinir-container">
        <div class="text-center mb-4">
            <i class="fas fa-key fa-3x text-warning mb-3"></i>
            <h4 class="text-light fw-bold">Nova Senha</h4>
        </div>

        <?php if (isset($mensagensErro[$msg])): ?>
            <div class="alert alert-danger py-2 small text-center" data-testid="redefinir-alerta"><?= e($mensagensErro[$msg]) ?></div>
        <?php endif; ?>

        <?php if (!$tokenValido): ?>
            <div class="alert alert-danger py-3 small text-center" data-testid="msg-token-invalido">
                <i class="fas fa-times-circle fs-4 d-block mb-2"></i>
                Link inválido ou expirado.<br>Por favor, solicite a redefinição novamente.
            </div>
            <a href="login.php" class="btn btn-outline-light w-100 mt-3">Voltar ao Login</a>
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
                        <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password>
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                    <small class="text-muted" style="font-size: 0.65rem;">Mín 8 caracteres. Use maiúscula, minúscula, número e símbolo.</small>
                </div>

                <div class="mb-4">
                    <label class="form-label text-muted small">Confirme a nova senha</label>
                    <div class="input-group">
                        <input type="password" name="confirma_senha" class="form-control bg-dark border-secondary text-light border-end-0" required data-testid="input-redefinir-confirma">
                        <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password>
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-warning w-100 fw-bold" data-testid="btn-salvar-redefinicao">
                    Salvar e Entrar
                </button>
            </form>

        <?php endif; ?>
    </div>

    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
</body>
</html>
