<?php
/**
 * Tela de quem terminou o teste grátis (ou o período pago). Só aparece de verdade quando
 * ASSINATURA_EXIGIDA=true; com a regra desligada, quem abre este endereço volta ao painel.
 * O pagamento é por PIX, combinado direto com o suporte pelo WhatsApp.
 */
define('CAMINHO_RAIZ', '');
define('ACESSO_PERMITIDO', true);
require_once 'config/bootstrap.php';

require_login();
$situacao = situacaoAcesso($pdo, (int) $_SESSION['usuario_id']);
if (!$situacao['vencido']) {
    redirecionar('index.php');
}
$perfil = $situacao['perfil'];
$preco = formatarReais(precoMensal($perfil));
$eTeste = $situacao['origem'] === 'teste';
$mensagem = 'Olá! Quero ' . ($eTeste ? 'ativar' : 'renovar') . ' o plano ' . rotuloPerfil($perfil) . ' do Meus Livros (' . $preco . '/mês, pagamento por PIX). Meu nome: ' . ($_SESSION['usuario_nome'] ?? '');
$tituloPagina = 'Continue lendo - Meus Livros';
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
    <div class="login-card" data-testid="assinatura-container">
        <div class="auth-marca-mobile"><img src="assets/icons/icon-192.png" alt="" width="44" height="44"> Meus Livros</div>
        <div class="mb-4">
            <h1 class="h3 text-light mb-2" data-testid="assinatura-titulo"><?= $eTeste ? 'Seu teste grátis terminou.' : 'Seu plano venceu.' ?></h1>
            <p class="text-secondary mb-0">Para continuar lendo, ative o plano <strong class="text-light"><?= e(rotuloPerfil($perfil)) ?></strong>: <strong class="text-info"><?= e($preco) ?> por mês</strong>.</p>
        </div>

        <ol class="small text-secondary ps-3 mb-4" data-testid="assinatura-passos">
            <li class="mb-1">Fale com o suporte pelo WhatsApp.</li>
            <li class="mb-1">Pague por PIX, combinando direto com o suporte.</li>
            <li>Seu acesso volta a ser liberado, com tudo como você deixou.</li>
        </ol>

        <a class="btn btn-info w-100 py-2" href="<?= e(linkSuporte($mensagem)) ?>" target="_blank" rel="noopener" data-testid="assinatura-whatsapp">
            <i class="fab fa-whatsapp me-2" aria-hidden="true"></i>Falar com o suporte
        </a>
        <p class="text-center text-secondary small mt-3 mb-0">Planos: Grátis (com anúncios) <?= e(formatarReais(precoMensal('leitor'))) ?>/mês, Pro (sem anúncios) <?= e(formatarReais(precoMensal('contribuidor'))) ?>/mês.</p>
        <p class="text-center mt-4 mb-0 small"><a href="<?= url('logout.php') ?>" class="text-secondary" data-testid="assinatura-sair">Sair</a></p>
    </div>
    </div>
</div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
