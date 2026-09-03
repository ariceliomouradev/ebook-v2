<?php
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

if (isset($_SESSION['usuario_id'])) {
    redirecionar('index.php');
}

$tituloPagina = 'Login - Biblioteca';
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

    <div class="login-card" data-testid="login-container">
        <div class="text-center mb-4">
            <i class="fas fa-book-reader fa-3x text-info mb-3"></i>
            <h3 class="text-light fw-bold" data-testid="login-title">Meus Livros</h3>
            <p class="text-muted small">Faça login para acessar o acervo</p>
        </div>

        <?php
        if (isset($_GET['erro'])) {
            if ($_GET['erro'] === 'bloqueado') {
                echo '<div class="alert alert-warning py-2 small text-center" data-testid="login-alerta"><i class="fas fa-lock me-1"></i> Muitas tentativas. Aguarde alguns minutos e tente novamente.</div>';
            } elseif ($_GET['erro'] === 'token_invalido') {
                echo '<div class="alert alert-danger py-2 small text-center" data-testid="login-alerta"><i class="fas fa-exclamation-circle me-1"></i> Link de redefinição inválido ou expirado.</div>';
            } else {
                echo '<div class="alert alert-danger py-2 small text-center" data-testid="login-alerta"><i class="fas fa-exclamation-circle me-1"></i> E-mail ou senha inválidos.</div>';
            }
        }
        if (isset($_GET['msg']) && $_GET['msg'] === 'reset_link_sent') {
            echo '<div class="alert alert-success py-2 small text-center" data-testid="login-alerta"><i class="fas fa-check-circle me-1"></i> Se o e-mail estiver cadastrado, as instruções foram enviadas.</div>';
        }
        if (isset($_GET['msg']) && $_GET['msg'] === 'pwd_recovered') {
            echo '<div class="alert alert-info py-2 small text-center" data-testid="login-alerta"><i class="fas fa-check-circle me-1"></i> Senha redefinida! Faça login.</div>';
        }
        ?>

        <form action="api/auth.php" method="POST" data-testid="login-form">
            <?= csrf_field() ?>
            <div class="mb-3">
                <label class="form-label text-muted small">E-mail</label>
                <input type="email" name="email" class="form-control bg-dark border-secondary text-light" required autofocus data-testid="login-email-input">
            </div>
            <div class="mb-4">
                <label class="form-label text-muted small">Senha</label>
                <div class="input-group">
                    <input type="password" name="senha" class="form-control bg-dark border-secondary text-light border-end-0" required data-testid="login-password-input">
                    <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password>
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <button type="submit" class="btn btn-info w-100 fw-bold text-dark" data-testid="login-submit-btn">
                <i class="fas fa-sign-in-alt me-2"></i> Entrar
            </button>
        </form>

        <div class="text-center mt-4">
            <a href="#" data-bs-toggle="modal" data-bs-target="#modalEsqueciSenha" class="text-info small text-decoration-none" data-testid="link-esqueci-senha">
                Esqueceu sua senha?
            </a>
        </div>
    </div>

    <div class="modal fade" id="modalEsqueciSenha" tabindex="-1" data-testid="modal-esqueci-senha">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h6 class="modal-title text-light"><i class="fas fa-envelope me-2 text-info"></i>Recuperar Senha</h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <form action="api/solicitar_reset.php" method="POST" data-testid="form-esqueci-senha">
                    <?= csrf_field() ?>
                    <div class="modal-body">
                        <p class="text-muted small mb-3">Digite o e-mail cadastrado. Enviaremos um link seguro para redefinição.</p>
                        <div class="mb-2">
                            <input type="email" name="email_recuperacao" class="form-control bg-secondary text-light border-0" placeholder="Seu e-mail..." required data-testid="input-email-recuperacao">
                        </div>
                    </div>
                    <div class="modal-footer border-secondary p-2">
                        <button type="submit" class="btn btn-info btn-sm w-100 fw-bold" data-testid="btn-enviar-link-reset">
                            Enviar Link de Redefinição
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
</body>
</html>
