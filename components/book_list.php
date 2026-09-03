<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}

// Este componente é sempre exibido dentro de index.php (na raiz do projeto) — mesmo quando
// renderizado por api/buscar.php para montar a resposta da busca/paginação via AJAX. Por isso
// os caminhos abaixo NÃO usam CAMINHO_RAIZ: essa constante reflete a localização do script que
// está executando (api/ = '../'), não da página onde o HTML será exibido (sempre a raiz). Usar
// CAMINHO_RAIZ aqui fazia o '../' de api/buscar.php vazar para dentro das capas e do link do
// leitor sempre que uma página além da primeira era carregada via AJAX.
$raiz = '';
$livros = $livros ?? [];
$progressos = $progressos ?? [];
$paginaAtual = $paginaAtual ?? 1;
$ordemAtual = $ordemAtual ?? 'recentes';
$busca = $busca ?? '';
?>
<div data-testid="book-grid" class="row row-cols-2 row-cols-md-3 row-cols-lg-4 row-cols-xl-5 g-3 flex-grow-1 align-content-start" id="gradeLivros">
    <?php foreach ($livros as $livro):
        $progressoInfo = $progressos[$livro['id']] ?? null;
        $progresso = $progressoInfo['porcentagem'] ?? 0;
        $corBarra = $progresso >= 100 ? 'bg-success' : 'bg-info';
        $variacao = 'capa-v' . (($livro['id'] % 4) + 1);
    ?>
        <div data-testid="book-item" class="col livro-item"
             data-id="<?= (int) $livro['id'] ?>"
             data-titulo="<?= e(mb_strtolower($livro['titulo'])) ?>"
             data-autor="<?= e(mb_strtolower($livro['autor'] ?? '')) ?>">

            <div class="card card-livro">
                <div class="img-container">
                    <?php if (!empty($livro['capa_arquivo'])): ?>
                        <img data-testid="book-cover-img" src="<?= $raiz ?>capas/<?= e($livro['capa_arquivo']) ?>" class="capa-img" alt="Capa do livro <?= e($livro['titulo']) ?>">
                        <div class="img-overlay"></div>
                    <?php else: ?>
                        <div data-testid="book-cover-digital" class="capa-digital <?= $variacao ?>">
                            <div class="titulo-digital"><?= e($livro['titulo']) ?></div>
                        </div>
                    <?php endif; ?>
                </div>
                <div class="card-body d-flex flex-column">
                    <h6 data-testid="book-title" class="card-title" title="<?= e($livro['titulo']) ?>"><?= e($livro['titulo']) ?></h6>
                    <span data-testid="book-author" class="autor-text text-truncate"><?= e($livro['autor'] ?? '') ?></span>
                    <div class="mt-auto">
                        <div data-testid="book-progress-text" class="progress-info"><span>Lido</span><span><?= (int) $progresso ?>%</span></div>
                        <div data-testid="book-progress-bar" class="progress"><div class="progress-bar <?= $corBarra ?>" style="width: <?= (int) $progresso ?>%"></div></div>

                        <a data-testid="book-read-link" href="<?= $raiz ?>views/leitor.php?id=<?= (int) $livro['id'] ?>&origem=<?= (int) $paginaAtual ?>&ordem=<?= e($ordemAtual) ?>&busca=<?= urlencode($busca) ?>" class="stretched-link"></a>
                    </div>
                </div>
            </div>
        </div>
    <?php endforeach; ?>
</div>

<div data-testid="msg-vazio-banco" class="feedback-centro" id="msgVazioBanco"
     style="display: <?= (empty($livros) && $busca === '') ? 'flex' : 'none' ?>;">
    <i class="fas fa-box-open fa-4x"></i>
    <h4>Nenhum livro cadastrado.</h4>
    <p>Clique em "Novo" para começar.</p>
</div>

<div data-testid="msg-pesquisa-vazia" class="feedback-centro" id="msgPesquisaVazia" style="display: <?= (empty($livros) && $busca !== '') ? 'flex' : 'none' ?>;">
    <i class="fas fa-search fa-4x"></i>
    <h4>Nenhum resultado encontrado.</h4>
    <p>Tente termos diferentes ou limpe a busca.</p>
</div>
