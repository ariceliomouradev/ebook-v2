<?php
/**
 * Conteúdo do gerenciador de banners (modal "Gerenciar banners", só admin).
 * Renderizado na abertura do painel e devolvido por api/manage_banners.php após cada ação.
 * Entrada: $bannersQ (banners quadrados, já ordenados).
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

// Este fragmento é sempre EXIBIDO no painel (raiz do site), mesmo quando quem o gera é
// api/manage_banners.php (onde CAMINHO_RAIZ é '../'). Usar CAMINHO_RAIZ aqui quebrava todas as
// imagens depois de remover/adicionar/mover um banner. Por isso o caminho é relativo à raiz.
$raizBanners = '';

$formatos = [
    'q' => [
        'titulo' => 'Banner quadrado (anúncio)',
        'dica'   => 'Abre sobre a tela ao entrar no sistema, ao abrir um livro e ao sair dele, sempre com botão de fechar. Hoje aparece para o Administrador e para o plano Grátis. Tamanho ideal: 1080 × 1080 px.',
        'icone'  => 'fa-square',
        'lista'  => $bannersQ ?? [],
    ],
];
?>

<div class="row g-4 justify-content-center">
<?php foreach ($formatos as $fmt => $dados): $lista = $dados['lista']; $total = count($lista); ?>
    <div class="col-12 col-xl-8">
        <section class="bm-secao" aria-labelledby="bmTitulo-<?= $fmt ?>" data-testid="banners-secao-<?= $fmt ?>">
            <header class="bm-secao__topo">
                <h6 id="bmTitulo-<?= $fmt ?>" class="mb-0"><i class="fas <?= $dados['icone'] ?> text-info me-2"></i><?= $dados['titulo'] ?></h6>
                <span class="bm-secao__qtd" data-testid="banners-contagem-<?= $fmt ?>"><?= $total ?> <?= $total === 1 ? 'banner' : 'banners' ?></span>
            </header>
            <p class="bm-secao__dica"><?= $dados['dica'] ?></p>

            <?php if ($total === 0): ?>
                <p class="bm-vazio" data-testid="banners-vazio-<?= $fmt ?>">Nenhum banner neste formato. Adicione o primeiro abaixo.</p>
            <?php endif; ?>

            <ol class="bm-lista bm-lista--h">
                <?php foreach ($lista as $i => $b): ?>
                    <li class="bm-item" data-testid="banner-item" data-id="<?= (int) $b['id'] ?>" data-formato="<?= $fmt ?>">
                        <div class="bm-item__miniatura">
                            <img src="<?= e(bannerUrl($b, $raizBanners)) ?>" alt="<?= e($b['alt']) ?>" loading="lazy" draggable="false">
                            <span class="bm-item__pos"><?= $i + 1 ?></span>
                        </div>
                        <form class="bm-item__link form-salvar-link-banner" data-id="<?= (int) $b['id'] ?>" data-testid="form-link-banner">
                            <label class="visually-hidden" for="bmLink-<?= (int) $b['id'] ?>">Link do banner <?= $i + 1 ?></label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-secondary border-0 text-light" aria-hidden="true"><i class="fas fa-link"></i></span>
                                <input type="text" inputmode="url" autocapitalize="off" spellcheck="false" id="bmLink-<?= (int) $b['id'] ?>" class="form-control bg-secondary text-light border-0" maxlength="500"
                                       placeholder="https://… (abre em nova aba)" value="<?= e($b['link'] ?? '') ?>" data-testid="input-link-banner">
                                <button type="submit" class="btn btn-outline-info" data-testid="btn-salvar-link-banner" aria-label="Salvar link do banner <?= $i + 1 ?>"><i class="fas fa-check"></i></button>
                            </div>
                        </form>
                        <div class="bm-item__acoes">
                            <button type="button" class="btn btn-sm btn-outline-secondary btn-mover-banner" data-id="<?= (int) $b['id'] ?>" data-direcao="up"
                                    aria-label="Mover banner <?= $i + 1 ?> para antes" data-testid="btn-mover-banner-cima" <?= $i === 0 ? 'disabled' : '' ?>>
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary btn-mover-banner" data-id="<?= (int) $b['id'] ?>" data-direcao="down"
                                    aria-label="Mover banner <?= $i + 1 ?> para depois" data-testid="btn-mover-banner-baixo" <?= $i === $total - 1 ? 'disabled' : '' ?>>
                                <i class="fas fa-arrow-right"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger btn-remover-banner ms-auto" data-id="<?= (int) $b['id'] ?>"
                                    aria-label="Remover banner <?= $i + 1 ?>: <?= e($b['alt']) ?>" title="Remover" data-testid="btn-remover-banner">
                                <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </li>
                <?php endforeach; ?>
            </ol>

            <div class="bm-novo">
                <label class="visually-hidden" for="bmAlt-<?= $fmt ?>">Descrição do novo banner (para leitores de tela)</label>
                <input type="text" id="bmAlt-<?= $fmt ?>" class="form-control form-control-sm bg-secondary text-light border-0 mb-2" maxlength="200"
                       placeholder="Descrição do banner (opcional)" data-testid="input-alt-banner-<?= $fmt ?>">
                <label class="visually-hidden" for="bmLinkNovo-<?= $fmt ?>">Link do novo banner</label>
                <input type="text" inputmode="url" autocapitalize="off" spellcheck="false" id="bmLinkNovo-<?= $fmt ?>" class="form-control form-control-sm bg-secondary text-light border-0 mb-2" maxlength="500"
                       placeholder="Link do anúncio: https://… (opcional)" data-testid="input-link-novo-banner-<?= $fmt ?>">
                <input data-testid="input-file-banner-<?= $fmt ?>" type="file" id="bmArquivo-<?= $fmt ?>" class="d-none" accept=".jpg,.jpeg,.png,.webp" data-formato-banner="<?= $fmt ?>">
                <button data-testid="btn-subir-banner-<?= $fmt ?>" type="button" class="btn btn-info btn-sm w-100 btn-subir-banner" data-target-input="bmArquivo-<?= $fmt ?>">
                    <i class="fas fa-plus me-2"></i>Adicionar banner
                </button>
            </div>
        </section>
    </div>
<?php endforeach; ?>
</div>
