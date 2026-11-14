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
</head>
<body class="auth-page">

<div class="auth-layout">
    <aside class="auth-marca" aria-hidden="true">
        <div class="auth-marca__topo"><img src="assets/icons/icon-192.png" alt="" width="42" height="42"> Meus Livros</div>
        <div class="auth-marca__meio">
            <h2>Toda a sua biblioteca, <em>em um só lugar.</em></h2>
            <p class="auth-marca__lead">Leia seus PDFs em qualquer tela e continue exatamente de onde parou.</p>
            <ul class="auth-beneficios">
                <li><i class="fas fa-bookmark"></i><span>Retome a leitura na página certa<small>O progresso é salvo automaticamente.</small></span></li>
                <li><i class="fas fa-search"></i><span>Encontre qualquer livro em segundos<small>Busca por título ou autor no acervo inteiro.</small></span></li>
                <li><i class="fas fa-mobile-alt"></i><span>Instale como aplicativo<small>Funciona no computador, no Android e no iPhone.</small></span></li>
            </ul>
        </div>
        <div class="estante">
            <span style="height:62%;--c1:#f6b445;--c2:#a86a10"></span><span style="height:84%;--c1:#3b4a7a;--c2:#1c2547"></span><span style="height:48%;--c1:#6b3a5e;--c2:#341b2e"></span>
            <span style="height:72%;--c1:#2f6f6a;--c2:#143633"></span><span style="height:92%;--c1:#f6b445;--c2:#7a4a0a"></span><span style="height:56%;--c1:#4a5568;--c2:#222833"></span>
            <span style="height:78%;--c1:#7a3b3b;--c2:#381a1a"></span><span style="height:66%;--c1:#3b4a7a;--c2:#1c2547"></span><span style="height:88%;--c1:#2f6f6a;--c2:#143633"></span>
            <span style="height:52%;--c1:#f6b445;--c2:#a86a10"></span><span style="height:74%;--c1:#6b3a5e;--c2:#341b2e"></span><span style="height:94%;--c1:#4a5568;--c2:#222833"></span>
            <span style="height:60%;--c1:#7a3b3b;--c2:#381a1a"></span><span style="height:80%;--c1:#f6b445;--c2:#7a4a0a"></span><span style="height:68%;--c1:#3b4a7a;--c2:#1c2547"></span>
            <span style="height:86%;--c1:#2f6f6a;--c2:#143633"></span><span style="height:54%;--c1:#6b3a5e;--c2:#341b2e"></span><span style="height:76%;--c1:#4a5568;--c2:#222833"></span>
        </div>
    </aside>

    <div class="auth-painel">
    <div class="login-card" data-testid="login-container">
        <div class="auth-marca-mobile"><img src="assets/icons/icon-192.png" alt="" width="44" height="44"> Meus Livros</div>
        <div class="mb-4">
            <h1 class="h3 text-light mb-1" data-testid="login-title">Bem-vindo de volta</h1>
            <p class="text-secondary mb-0">Entre para acessar o seu acervo.</p>
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
                <label class="form-label text-muted small" for="loginEmail">E-mail</label>
                <input type="email" id="loginEmail" name="email" class="form-control bg-dark border-secondary text-light" required autofocus autocomplete="username" autocapitalize="off" spellcheck="false" inputmode="email" data-testid="login-email-input">
            </div>
            <div class="mb-4">
                <label class="form-label text-muted small" for="loginSenha">Senha</label>
                <div class="input-group">
                    <input type="password" id="loginSenha" name="senha" class="form-control bg-dark border-secondary text-light border-end-0" required autocomplete="current-password" data-testid="login-password-input">
                    <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <button type="submit" class="btn btn-info w-100" data-testid="login-submit-btn">
                Entrar <i class="fas fa-arrow-right ms-2"></i>
            </button>
        </form>

        <div class="text-center mt-4">
            <a href="#" data-bs-toggle="modal" data-bs-target="#modalEsqueciSenha" class="small" data-testid="link-esqueci-senha">
                Esqueceu sua senha?
            </a>
        </div>
    </div>
    </div>
</div>

    <div class="modal fade" id="modalEsqueciSenha" tabindex="-1" data-testid="modal-esqueci-senha">
        <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content bg-dark border-secondary">
                <div class="modal-header border-secondary">
                    <h6 class="modal-title text-light"><i class="fas fa-envelope me-2 text-info"></i>Recuperar Senha</h6>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
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
