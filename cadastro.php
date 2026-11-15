<?php
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';
require_once 'includes/cadastro.php';

if (isset($_SESSION['usuario_id'])) {
    redirecionar('index.php');
}

$tituloPagina = 'Criar conta - Biblioteca';
$regexSenha = '(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,}';
$dicaSenha = 'Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.';
$mensagensErro = [
    'dados'        => 'Confira o nome e o e-mail informados.',
    'whatsapp'     => 'Informe um WhatsApp válido, com DDD. Ex.: (85) 99999-9999.',
    'senha'        => 'A senha não atende aos requisitos mínimos de segurança.',
    'confirmar'    => 'As senhas digitadas não coincidem.',
    'email_em_uso' => 'Este e-mail já tem cadastro. Entre com a sua senha ou use "Esqueceu sua senha?".',
    'muitos'       => 'Muitos cadastros por aqui em pouco tempo. Tente novamente mais tarde.',
    'fechado'      => 'O cadastro está fechado no momento. Peça o seu acesso ao administrador.',
];
$erro = $_GET['erro'] ?? '';
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
    <div class="login-card" data-testid="cadastro-container">
        <div class="auth-marca-mobile"><img src="assets/icons/icon-192.png" alt="" width="44" height="44"> Meus Livros</div>
        <div class="mb-4">
            <h1 class="h3 text-light mb-1" data-testid="cadastro-title">Crie a sua conta</h1>
            <p class="text-secondary mb-0">Leva um minuto. <strong class="text-info"><?= (int) TESTE_DIAS ?> dias grátis</strong>, sem cartão.</p>
        </div>

        <?php if (isset($mensagensErro[$erro])): ?>
            <div class="alert alert-danger py-2 small text-center" role="alert" data-testid="cadastro-alerta"><i class="fas fa-exclamation-circle me-1"></i> <?= e($mensagensErro[$erro]) ?></div>
        <?php endif; ?>

        <?php if (!cadastroAberto()): ?>
            <div class="alert alert-warning small text-center" data-testid="cadastro-fechado">O cadastro está fechado no momento. Peça o seu acesso ao administrador.</div>
        <?php else: ?>
        <form action="api/cadastrar.php" method="POST" data-testid="cadastro-form" novalidate>
            <?= csrf_field() ?>
            <div class="d-none" aria-hidden="true"><label>Não preencha <input type="text" name="site" tabindex="-1" autocomplete="off"></label></div>
            <div class="mb-3">
                <label class="form-label text-muted small" for="cadNome">Nome</label>
                <input type="text" id="cadNome" name="nome" class="form-control bg-dark border-secondary text-light" required maxlength="100" autocomplete="name" autofocus data-testid="cadastro-nome-input">
            </div>
            <div class="mb-3">
                <label class="form-label text-muted small" for="cadEmail">E-mail</label>
                <input type="email" id="cadEmail" name="email" class="form-control bg-dark border-secondary text-light" required maxlength="100" autocomplete="email" autocapitalize="off" spellcheck="false" inputmode="email" data-testid="cadastro-email-input">
            </div>
            <div class="mb-3">
                <label class="form-label text-muted small" for="cadWhatsapp">WhatsApp</label>
                <input type="tel" id="cadWhatsapp" name="whatsapp" class="form-control bg-dark border-secondary text-light" required maxlength="20" placeholder="(85) 99999-9999" autocomplete="tel-national" inputmode="tel" data-mascara-whatsapp data-testid="cadastro-whatsapp-input">
            </div>
            <div class="mb-3">
                <label class="form-label text-muted small" for="cadSenha">Senha</label>
                <div class="input-group">
                    <input type="password" id="cadSenha" name="senha" class="form-control bg-dark border-secondary text-light border-end-0" required pattern="<?= $regexSenha ?>" title="<?= e($dicaSenha) ?>" autocomplete="new-password" data-testid="cadastro-senha-input">
                    <button class="btn btn-outline-secondary border-secondary border-start-0 text-muted" type="button" data-toggle-password aria-label="Mostrar ou ocultar a senha">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                <small class="text-muted"><?= e($dicaSenha) ?></small>
            </div>
            <div class="mb-4">
                <label class="form-label text-muted small" for="cadSenhaConfirmar">Confirmar senha</label>
                <input type="password" id="cadSenhaConfirmar" name="senha_confirmar" class="form-control bg-dark border-secondary text-light" required autocomplete="new-password" data-testid="cadastro-senha-confirmar-input">
            </div>
            <button type="submit" class="btn btn-info w-100" data-testid="cadastro-submit-btn">
                Criar conta <i class="fas fa-arrow-right ms-2"></i>
            </button>
        </form>
        <?php endif; ?>

        <div class="text-center mt-4 small">
            <a href="<?= url('inicio.php') ?>" class="text-secondary d-block mb-2" data-testid="link-voltar-inicio"><i class="fas fa-arrow-left me-1" aria-hidden="true"></i>Voltar ao início</a>
            Já tem conta? <a href="<?= url('login.php') ?>" data-testid="link-ir-login">Entrar</a>
        </div>
    </div>
    </div>
</div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="<?= asset('assets/js/auth-ui.js') ?>"></script>
</body>
</html>
