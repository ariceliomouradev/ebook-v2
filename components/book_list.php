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
$favoritos = $favoritos ?? [];
$soFavoritos = $soFavoritos ?? false;
?>
<div data-testid="book-grid" class="row row-cols-2 row-cols-md-3 row-cols-lg-4 row-cols-xl-5 flex-grow-1 align-content-start" id="gradeLivros">
    <?php foreach ($livros as $livro):
        $progressoInfo = $progressos[$livro['id']] ?? null;
        $progresso = (int) ($progressoInfo['porcentagem'] ?? 0);
        $concluido = $progresso >= 100;
        $corBarra = $concluido ? 'bg-success' : 'bg-info';
        $variacao = 'capa-v' . (($livro['id'] % 4) + 1);
    ?>
        <div data-testid="book-item" class="col livro-item"
             data-id="<?= (int) $livro['id'] ?>"
             data-titulo="<?= e(mb_strtolower($livro['titulo'])) ?>"
             data-autor="<?= e(mb_strtolower($livro['autor'] ?? '')) ?>">

            <div class="card card-livro">
                <?php $ehFavorito = isset($favoritos[(int) $livro['id']]); ?>
                <button type="button" class="btn-favorito<?= $ehFavorito ? ' is-ativo' : '' ?>" data-id="<?= (int) $livro['id'] ?>" data-testid="btn-favorito" aria-pressed="<?= $ehFavorito ? 'true' : 'false' ?>" aria-label="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>: <?= e($livro['titulo']) ?>" title="<?= $ehFavorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos' ?>">
                    <i class="<?= $ehFavorito ? 'fas' : 'far' ?> fa-heart" aria-hidden="true"></i>
                </button>
                <div class="img-container">
                    <?php if (!empty($livro['capa_arquivo'])): ?>
                        <img data-testid="book-cover-img" src="<?= $raiz ?>capas/<?= e($livro['capa_arquivo']) ?>" class="capa-img" loading="lazy" alt="Capa do livro <?= e($livro['titulo']) ?>">
                    <?php else: ?>
                        <div data-testid="book-cover-digital" class="capa-digital <?= $variacao ?>">
                            <div class="titulo-digital"><?= e($livro['titulo']) ?></div>
                        </div>
                    <?php endif; ?>

                    <?php if (($livro['formato'] ?? 'pdf') === 'epub'): ?>
                        <span class="selo-formato" data-testid="book-selo-epub" title="Livro em EPUB">EPUB</span>
                    <?php endif; ?>

                    <?php if ($concluido): ?>
                        <span class="selo-concluido" data-testid="book-selo-concluido"><i class="fas fa-check"></i> Lido</span>
                    <?php endif; ?>
                    <?php /* Em repouso o cartão é só a capa. O painel abaixo (botão, título, autor e progresso) aparece sobre
                             a capa ao passar o mouse, ao focar com o teclado ou, no toque, no 1º toque (.is-aberto, app.js);
                             o 2º toque no cartão abre o livro. */ ?>
                    <div class="card-overlay">
                        <span class="card-cta" aria-hidden="true"><span><i class="fas fa-book-open"></i> <?= ($progresso > 0 && !$concluido) ? 'Continuar' : 'Ler agora' ?></span></span>
                        <?php if (($_SESSION['usuario_perfil'] ?? '') === 'admin'): /* só o administrador exclui; a confirmação é um modal (app.js) e api/excluir.php confere o perfil de novo */ ?>
                        <button type="button" class="btn-excluir-card" data-testid="btn-excluir-card" data-id="<?= (int) $livro['id'] ?>" data-titulo="<?= e($livro['titulo']) ?>" aria-label="Excluir o livro <?= e($livro['titulo']) ?>">
                            <i class="fas fa-trash-can" aria-hidden="true"></i> Excluir
                        </button>
                        <?php endif; ?>
                        <div class="card-info">
                            <h6 data-testid="book-title" class="card-title" title="<?= e($livro['titulo']) ?>"><?= e($livro['titulo']) ?></h6>
                            <span data-testid="book-author" class="autor-text text-truncate"><?= e($livro['autor'] ?? '') ?></span>
                            <div data-testid="book-progress-text" class="progress-info"><span><?= $progresso > 0 ? 'Lido' : 'Não iniciado' ?></span><span><?= $progresso > 0 ? $progresso . '%' : '' ?></span></div>
                            <div data-testid="book-progress-bar" class="progress" role="progressbar" aria-label="Progresso de leitura de <?= e($livro['titulo']) ?>" aria-valuenow="<?= $progresso ?>" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar <?= $corBarra ?>" style="width: <?= $progresso ?>%"></div></div>
                        </div>
                    </div>
                </div>
                <a data-testid="book-read-link" href="<?= $raiz ?>leitor?id=<?= (int) $livro['id'] ?>&origem=<?= (int) $paginaAtual ?>&ordem=<?= e($ordemAtual) ?>&busca=<?= urlencode($busca) ?>" class="stretched-link" aria-label="Ler <?= e($livro['titulo']) ?><?= !empty($livro['autor']) ? ', de ' . e($livro['autor']) : '' ?>"></a>
            </div>
        </div>
    <?php endforeach; ?>
</div>

<div data-testid="msg-vazio-banco" class="feedback-centro" id="msgVazioBanco"
     style="display: <?= (empty($livros) && $busca === '' && !$soFavoritos) ? 'flex' : 'none' ?>;">
    <div class="feedback-centro__icone"><i class="fas fa-book-open"></i></div>
    <h4>Sua biblioteca está vazia</h4>
    <p>Adicione o primeiro livro (PDF ou EPUB) com o botão "Novo livro" e comece a ler.</p>
</div>

<div data-testid="msg-sem-favoritos" class="feedback-centro" id="msgSemFavoritos" style="display: <?= (empty($livros) && $soFavoritos && $busca === '') ? 'flex' : 'none' ?>;">
    <div class="feedback-centro__icone"><i class="far fa-heart"></i></div>
    <h4>Você ainda não tem favoritos</h4>
    <p>Toque no coração de um livro para guardá-lo aqui.</p>
</div>

<div data-testid="msg-pesquisa-vazia" class="feedback-centro" id="msgPesquisaVazia" style="display: <?= (empty($livros) && $busca !== '') ? 'flex' : 'none' ?>;">
    <div class="feedback-centro__icone"><i class="fas fa-search"></i></div>
    <h4>Nenhum resultado encontrado</h4>
    <p>Nada para "<?= e($busca) ?>". Confira a grafia ou busque só pelo sobrenome do autor.</p>
</div>
