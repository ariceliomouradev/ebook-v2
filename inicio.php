<?php
/**
 * Página de apresentação (pitch) do Meus Livros: é a "home" de quem ainda não entrou.
 * O index.php mostra esta página no endereço raiz quando não há sessão; /inicio também abre direto.
 * Quem já está logado vai para o painel.
 *
 * Estrutura de venda: dor -> solução (com a tela do próprio produto) -> planos -> convite.
 * Texto curto de propósito: cada bloco diz uma coisa só.
 */
if (!defined('CAMINHO_RAIZ')) {
    define('CAMINHO_RAIZ', '');
}
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}
require_once __DIR__ . '/config/bootstrap.php';
require_once __DIR__ . '/includes/cadastro.php';

if (isset($_SESSION['usuario_id'])) {
    redirecionar('index.php');
}

// Quantos livros o acervo tem para os leitores (arredondado para baixo, de 50 em 50), só para a vitrine.
$totalAcervo = 0;
try {
    $totalAcervo = (int) $pdo->query(
        "SELECT COUNT(*) FROM livros WHERE publicacao = 'aprovado' AND duplicado_de IS NULL
            AND FIND_IN_SET('leitor', visivel_para) > 0 AND (liberar_em IS NULL OR liberar_em <= NOW())"
    )->fetchColumn();
} catch (PDOException $e) {
    $totalAcervo = 0;
}
$acervoArredondado = $totalAcervo >= 100 ? (int) (floor($totalAcervo / 50) * 50) : 0;

$cadastroAberto = cadastroAberto();
$precoAssinante = formatarReais(precoMensal('leitor'));
$precoFamilia = formatarReais(precoMensal('contribuidor'));
$linkSuporte = linkSuporte('Olá! Quero saber mais sobre o Meus Livros.');
$urlEntrar = url('login.php');
$urlCadastro = url('cadastro.php');
$ano = date('Y');
?>
<!DOCTYPE html>
<html lang="pt-br" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Meus Livros — chega de perder a página do seu livro. 30 dias grátis</title>
    <meta name="description" content="Todos os seus PDFs em uma biblioteca só, no celular, no tablet e no computador. O livro abre exatamente onde você parou. Teste grátis por 30 dias.">
    <meta name="theme-color" content="#0d0f14">
    <meta name="color-scheme" content="dark">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Meus Livros — chega de perder a página do seu livro">
    <meta property="og:description" content="Todos os seus PDFs em um lugar só. O livro abre exatamente onde você parou.">
    <meta property="og:image" content="assets/icons/icon-512.png">
    <meta property="og:locale" content="pt_BR">
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
    <link rel="icon" href="assets/icons/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
    <link rel="preload" href="assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha384-3B6NwesSXE7YJlcLI9RpRqGf2p/EgVH8BgoKTaUrmKNDkHPStTQ3EyoYjCGXaOTS" crossorigin="anonymous">
    <link rel="stylesheet" href="<?= asset('assets/css/landing.css') ?>">
</head>
<body>
<a class="pular" href="#conteudo">Pular para o conteúdo</a>

<header class="topo" id="topo">
    <div class="miolo topo__faixa">
        <a class="marca" href="#inicio" aria-label="Meus Livros, início">
            <img src="assets/icons/icon-192.png" alt="" width="40" height="40">
            <span>Meus Livros</span>
        </a>
        <nav class="menu" id="menu" aria-label="Seções da página">
            <a href="#problema">O problema</a>
            <a href="#solucao">A solução</a>
            <a href="#planos">Planos</a>
        </nav>
        <div class="topo__acoes">
            <a class="link-entrar" href="<?= e($urlEntrar) ?>" data-testid="home-entrar">Entrar</a>
            <?php if ($cadastroAberto): ?>
                <a class="btn btn--ambar" href="<?= e($urlCadastro) ?>" data-testid="home-cadastrar">Criar conta</a>
            <?php endif; ?>
            <button class="hamburguer" id="btnMenu" type="button" aria-label="Abrir o menu" aria-expanded="false" aria-controls="menu">
                <span></span><span></span><span></span>
            </button>
        </div>
    </div>
</header>

<main id="conteudo">

    <!-- ======================= 1. PROMESSA ======================= -->
    <section class="heroi" id="inicio" aria-labelledby="tituloHeroi">
        <div class="miolo heroi__grade">
            <div class="heroi__texto">
                <h1 id="tituloHeroi">Chega de perder a página do seu livro.</h1>
                <p class="heroi__lead">Todos os seus PDFs numa biblioteca só, no celular, no tablet e no computador. O livro abre exatamente onde você parou.</p>
                <div class="heroi__acoes">
                    <?php if ($cadastroAberto): ?>
                        <a class="btn btn--ambar btn--grande" href="<?= e($urlCadastro) ?>" data-testid="home-cta-cadastrar">Começar grátis</a>
                        <a class="btn btn--contorno btn--grande" href="<?= e($urlEntrar) ?>" data-testid="home-cta-entrar">Entrar</a>
                    <?php else: ?>
                        <a class="btn btn--ambar btn--grande" href="<?= e($urlEntrar) ?>" data-testid="home-cta-entrar">Entrar</a>
                    <?php endif; ?>
                </div>
                <p class="heroi__prova"><strong>Comece grátis</strong>, sem cartão. O plano Pro, sem anúncios, custa <?= e($precoFamilia) ?> por mês.<?php if ($acervoArredondado > 0): ?> <span class="heroi__acervo">+<?= number_format($acervoArredondado, 0, ',', '.') ?> livros prontos para ler.</span><?php endif; ?></p>
            </div>

            <!-- o produto de verdade: telas reais do app no tablet e no celular (animação em CSS) -->
            <div class="palco" role="img" aria-label="O Meus Livros no tablet e no celular: a biblioteca, o livro aberto na página em que você parou e os trechos marcados em cores.">
                <span class="palco__aura" aria-hidden="true"></span>

                <div class="aparelho aparelho--tablet" aria-hidden="true">
                    <div class="aparelho__tela">
                        <img class="tela tela--a" src="assets/landing/leitor-tablet.webp" width="980" height="1410" alt="" decoding="async">
                        <img class="tela tela--b" src="assets/landing/painel-tablet.webp" width="980" height="1410" alt="" loading="lazy" decoding="async">
                    </div>
                </div>

                <div class="aparelho aparelho--celular" aria-hidden="true">
                    <div class="aparelho__tela">
                        <img class="tela tela--b" src="assets/landing/leitor-phone.webp" width="720" height="1558" alt="" decoding="async">
                        <img class="tela tela--a" src="assets/landing/painel-phone.webp" width="720" height="1558" alt="" decoding="async">
                    </div>
                </div>

                <span class="selo selo--pagina" aria-hidden="true"><i class="fas fa-bookmark"></i><span><b>Página 31 de 204</b><small>Abre onde você parou</small></span></span>
                <span class="selo selo--marca" aria-hidden="true"><i class="fas fa-highlighter"></i> Marcação salva</span>
                <span class="selo selo--sync" aria-hidden="true"><i class="fas fa-rotate"></i> Celular e tablet em sincronia</span>
            </div>
        </div>
    </section>

    <!-- ======================= 2. A DOR ======================= -->
    <section class="secao" id="problema" aria-labelledby="tituloProblema">
        <div class="miolo">
            <h2 id="tituloProblema" class="titulo-secao">Isso também acontece com você?</h2>
            <ul class="dores">
                <li>
                    <span class="dores__icone"><i class="fas fa-bookmark" aria-hidden="true"></i></span>
                    <p>Você abre o PDF e não lembra em que página parou.</p>
                </li>
                <li>
                    <span class="dores__icone"><i class="fas fa-folder-open" aria-hidden="true"></i></span>
                    <p>Seus livros estão em pastas, e-mails e WhatsApp, e nada se acha.</p>
                </li>
                <li>
                    <span class="dores__icone"><i class="fas fa-highlighter" aria-hidden="true"></i></span>
                    <p>Você marca um trecho num aparelho, e no outro ele sumiu.</p>
                </li>
            </ul>
            <p class="ponte">O Meus Livros resolve os três.</p>
        </div>
    </section>

    <!-- ======================= 3. A SOLUÇÃO ======================= -->
    <section class="secao secao--solucao" id="solucao" aria-labelledby="tituloSolucao">
        <div class="miolo">
            <h2 id="tituloSolucao" class="so-leitor">Como o Meus Livros resolve</h2>

            <article class="beneficio">
                <div class="beneficio__texto">
                    <h3>Abre exatamente onde você parou.</h3>
                    <p>O progresso é salvo sozinho e vale em qualquer aparelho.</p>
                </div>
                <div class="beneficio__tela" aria-hidden="true">
                    <div class="continue continue--solto">
                        <span class="continue__capa c1"></span>
                        <span class="continue__corpo"><b>Guia da Produtividade</b><small>Página 31 de 204 · 15%</small><i class="continue__barra"><i></i></i></span>
                        <span class="continue__play"><i class="fas fa-play"></i></span>
                    </div>
                    <div class="continue continue--solto">
                        <span class="continue__capa c2"></span>
                        <span class="continue__corpo"><b>Finanças sem Medo</b><small>Página 88 de 140 · 63%</small><i class="continue__barra"><i class="b63"></i></i></span>
                        <span class="continue__play"><i class="fas fa-play"></i></span>
                    </div>
                </div>
            </article>

            <article class="beneficio beneficio--inverso">
                <div class="beneficio__texto">
                    <h3>Marque, comente e encontre depois.</h3>
                    <p>5 cores de marcador e comentários que só você vê. Funciona até em PDF escaneado.</p>
                </div>
                <div class="beneficio__tela" aria-hidden="true">
                    <div class="trecho">
                        <i class="ln"></i><i class="ln m1"></i><i class="ln m4"></i><i class="ln c60"></i><i class="ln m2"></i><i class="ln"></i>
                        <div class="balao">
                            <b>Trecho marcado · página 31</b>
                            <span class="balao__cores"><i class="k1"></i><i class="k2"></i><i class="k3"></i><i class="k4"></i><i class="k5"></i></span>
                            <span class="balao__texto">Usar no relatório de março.</span>
                        </div>
                    </div>
                </div>
            </article>

            <article class="beneficio">
                <div class="beneficio__texto">
                    <h3>Tudo em um só lugar.</h3>
                    <p>Busca, categorias e favoritos. E você ainda envia os seus próprios PDFs.</p>
                </div>
                <div class="beneficio__tela" aria-hidden="true">
                    <div class="biblioteca">
                        <span class="busca"><i class="fas fa-magnifying-glass"></i> Buscar por título ou autor</span>
                        <span class="chips"><b>Todos</b><u>Finanças</u><u>Negócios</u><u>Saúde</u></span>
                        <span class="capas">
                            <span class="capa c1"><i class="fas fa-heart"></i></span>
                            <span class="capa c2"></span>
                            <span class="capa c3"></span>
                            <span class="capa c4"><i class="fas fa-heart"></i></span>
                        </span>
                    </div>
                </div>
            </article>
        </div>
    </section>

    <!-- ======================= 4. PLANOS ======================= -->
    <section class="secao" id="planos" aria-labelledby="tituloPlanos">
        <div class="miolo">
            <h2 id="tituloPlanos" class="titulo-secao">Escolha como ler.</h2>
            <div class="planos">
                <article class="plano">
                    <h3>Grátis</h3>
                    <p class="plano__preco"><strong><?= e($precoAssinante) ?></strong><span>/mês</span><small>Com anúncios</small></p>
                    <ul>
                        <li><i class="fas fa-check" aria-hidden="true"></i> 1 acesso por vez</li>
                        <li><i class="fas fa-check" aria-hidden="true"></i> Envie até 10 PDFs</li>
                        <li><i class="fas fa-check" aria-hidden="true"></i> Marcações e favoritos só seus</li>
                    </ul>
                    <?php if ($cadastroAberto): ?>
                        <a class="btn btn--ambar btn--bloco" href="<?= e($urlCadastro) ?>">Começar grátis</a>
                    <?php else: ?>
                        <a class="btn btn--ambar btn--bloco" href="<?= e($urlEntrar) ?>">Entrar</a>
                    <?php endif; ?>
                </article>
                <article class="plano plano--familia">
                    <h3>Pro</h3>
                    <p class="plano__preco"><strong><?= e($precoFamilia) ?></strong><span>/mês</span><small><?= (int) TESTE_DIAS ?> dias grátis para começar</small></p>
                    <ul>
                        <li><i class="fas fa-check" aria-hidden="true"></i> Sem anúncios</li>
                        <li><i class="fas fa-check" aria-hidden="true"></i> Até 3 pessoas ao mesmo tempo</li>
                        <li><i class="fas fa-check" aria-hidden="true"></i> O titular envia os livros</li>
                        <li><i class="fas fa-check" aria-hidden="true"></i> Cada um com as suas marcações</li>
                    </ul>
                    <?php if ($cadastroAberto): ?>
                        <a class="btn btn--contorno btn--bloco" href="<?= e($urlCadastro) ?>">Quero o plano Pro</a>
                    <?php else: ?>
                        <a class="btn btn--contorno btn--bloco" href="<?= e($urlEntrar) ?>">Entrar</a>
                    <?php endif; ?>
                </article>
            </div>
            <p class="planos__nota">Depois do teste, o pagamento é por PIX, combinado direto com o suporte pelo WhatsApp. <a href="<?= e($linkSuporte) ?>" target="_blank" rel="noopener" data-testid="home-suporte">Falar com o suporte</a></p>
        </div>
    </section>

    <!-- ======================= 5. CONVITE ======================= -->
    <section class="fecho" aria-labelledby="tituloFecho">
        <div class="miolo fecho__caixa">
            <img class="fecho__logo" src="assets/icons/icon-192.png" alt="" width="64" height="64">
            <h2 id="tituloFecho">Comece a ler hoje.<small><?= (int) TESTE_DIAS ?> dias grátis, sem cartão.</small></h2>
            <div class="fecho__acoes">
                <?php if ($cadastroAberto): ?>
                    <a class="btn btn--ambar btn--grande" href="<?= e($urlCadastro) ?>">Começar grátis</a>
                <?php endif; ?>
                <a class="btn btn--contorno btn--grande" href="<?= e($urlEntrar) ?>">Entrar</a>
            </div>
        </div>
    </section>
</main>

<footer class="rodape">
    <div class="miolo">
        <div class="rodape__topo">
            <div class="rodape__marca">
                <a class="marca" href="#inicio" aria-label="Meus Livros, voltar ao topo">
                    <img src="assets/icons/icon-192.png" alt="" width="40" height="40"><span>Meus Livros</span>
                </a>
                <p>Sua biblioteca de PDFs, sempre na página certa.</p>
            </div>
            <nav class="rodape__col" aria-label="Navegue">
                <h2>Navegue</h2>
                <a href="#problema">O problema</a>
                <a href="#solucao">A solução</a>
                <a href="#planos">Planos</a>
            </nav>
            <nav class="rodape__col" aria-label="Acesso">
                <h2>Acesso</h2>
                <a href="<?= e($urlEntrar) ?>">Entrar</a>
                <?php if ($cadastroAberto): ?><a href="<?= e($urlCadastro) ?>">Criar conta</a><?php endif; ?>
            </nav>
        </div>
        <div class="rodape__base">
            <p>© <?= (int) $ano ?> Meus Livros. Todos os direitos reservados.</p>
            <p class="rodape__autor">
                Desenvolvido por
                <a href="https://ariceliomoura.com.br" target="_blank" rel="noopener" data-testid="rodape-autor">Aricelio Moura<i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="so-leitor"> (abre em nova aba)</span></a>
            </p>
        </div>
    </div>
</footer>

<script src="<?= asset('assets/js/landing.js') ?>"></script>
</body>
</html>
