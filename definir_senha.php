<?php
/**
 * Definir a senha definitiva. É a única tela liberada para quem entrou com uma senha temporária
 * (criada ou redefinida pelo administrador). O bootstrap manda para cá enquanto $_SESSION['trocar_senha'] existir.
 */
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

require_login();
if (empty($_SESSION['trocar_senha'])) {
    redirecionar('index.php');
}

$msg = $_GET['msg'] ?? '';
$mensagensErro = [
    'erro_pwd_mismatch' => 'As senhas digitadas não coincidem.',
    'erro_pwd_weak'     => 'A senha não atende aos requisitos mínimos de segurança.',
    'erro_pwd_igual'    => 'Escolha uma senha diferente da temporária.',
];
$tituloPagina = 'Definir nova senha';
$nome = trim((string) ($_SESSION['usuario_nome'] ?? ''));
$primeiroNome = $nome !== '' ? explode(' ', $nome)[0] : '';
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
            <h2>Agora a senha é <em>só sua.</em></h2>
            <p class="auth-marca__lead">Você entrou com uma senha temporária. Escolha uma definitiva para continuar: com maiúscula, minúscula, número e símbolo.</p>
        </div>
        <div></div>
    </aside>
    <div class="auth-painel">
    <div class="login-card" data-testid="definir-senha-container">
        <div class="auth-marca-mobile"><img src="assets/icons/icon-192.png" alt="" width="44" height="44"> Meus Livros</div>
        <div class="mb-4">
            <h1 class="h3 text-light mb-1" data-testid="definir-senha-titulo">Defina a sua senha<?= $primeiroNome !== '' ? ', ' . e($primeiroNome) : '' ?></h1>
            <p class="text-secondary mb-0">A senha temporária só vale para este primeiro acesso.</p>
        </div>

        <?php if (isset($mensagensErro[$msg])): ?>
            <div class="alert alert-danger py-2 small text-center" data-testid="definir-senha-alerta" role="alert"><?= e($mensagensErro[$msg]) ?></div>
        <?php endif; ?>

        <form action="api/definir_senha.php" method="POST" data-testid="form-definir-senha">
            <?= csrf_field() ?>

            <div class="mb-3">
                <label class="form-label text-muted small" for="definirNova">Nova senha</label>
                <div class="input-group">
                    <input type="password" id="definirNova" name="nova_senha" class="form-control bg-dark border-secondary text-light border-end-0"
                           required autocomplete="new-password"
                           pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}"
                           title="Mínimo de 8 caracteres. Use letras maiúsculas, minúsculas, números e símbolos."
                           data-testid="input-definir-nova">
                    <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                <small class="text-muted">Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</small>
            </div>

            <div class="mb-4">
                <label class="form-label text-muted small" for="definirConfirma">Confirme a nova senha</label>
                <div class="input-group">
                    <input type="password" id="definirConfirma" name="confirma_senha" class="form-control bg-dark border-secondary text-light border-end-0"
                           required autocomplete="new-password" data-testid="input-definir-confirma">
                    <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>

            <button type="submit" class="btn btn-info w-100" data-testid="btn-salvar-definir-senha">Salvar e entrar</button>
            <?php /* mesmo formulário (já leva o csrf_token): o botão envia para o logout em vez de salvar a senha */ ?>
            <button type="submit" class="btn btn-link text-secondary w-100 mt-2" formaction="<?= url('logout.php') ?>" formmethod="post" formnovalidate data-testid="definir-senha-sair">Sair</button>
        </form>
    </div>
    </div>
    </div>

    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
</body>
</html>
