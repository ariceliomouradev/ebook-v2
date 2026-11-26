<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'login');
    exit;
}

// Fragmento HTML da lista do gerenciador. Renderizado por api/gerenciar_lista.php e inserido
// no modal "Gerenciar Biblioteca" via AJAX (uma página de cada vez, ver app.js).
//
// Entradas: $livros (id, titulo, autor), $busca (termo pesquisado, '' se não houver).
$livros = $livros ?? [];
$busca = $busca ?? '';
?>
<?php
// Capas e links são relativos à raiz do site: este fragmento é sempre exibido dentro de index.php (como book_list.php).
$raiz = '';
$rotulosPublicacao = ['pendente' => 'Aguardando aprovação', 'privado' => 'Privado do dono', 'negado' => 'Negado'];
foreach ($livros as $livro):
    $ehEpub = ($livro['formato'] ?? 'pdf') === 'epub';
    $selo = resumoVisibilidade((string) $livro['visivel_para'], $livro['liberar_em']);
?>
<div data-testid="item-gerenciador" class="item-lista item-gerenciador gl-item"
    data-id="<?= (int) $livro['id'] ?>"
    data-titulo="<?= e($livro['titulo']) ?>"
    data-autor="<?= e($livro['autor'] ?? '') ?>"
    data-sinopse="<?= e($livro['sinopse'] ?? '') ?>"
    data-data-publicacao="<?= e((string) ($livro['data_publicacao'] ?? '')) ?>"
    data-categoria="<?= e($livro['categoria'] ?? '') ?>"
    data-vis-contribuidor="<?= in_array('contribuidor', explode(',', (string) $livro['visivel_para']), true) ? '1' : '0' ?>"
    data-vis-leitor="<?= in_array('leitor', explode(',', (string) $livro['visivel_para']), true) ? '1' : '0' ?>"
    data-liberar-em="<?= $livro['liberar_em'] ? e(date('Y-m-d\TH:i', strtotime($livro['liberar_em']))) : '' ?>">

    <a class="gl-capa" data-testid="item-capa" data-analise="gerenciar" href="<?= $raiz ?>leitor?id=<?= (int) $livro['id'] ?>" tabindex="-1" aria-hidden="true">
        <?php if (!empty($livro['capa_arquivo'])): ?>
            <img src="<?= $raiz ?>capas/<?= e($livro['capa_arquivo']) ?>" alt="" loading="lazy">
        <?php else: ?>
            <span class="gl-capa__vazia capa-v<?= ((int) $livro['id'] % 4) + 1 ?>"><i class="fas fa-book"></i></span>
        <?php endif; ?>
        <?php if ($ehEpub): ?><span class="selo-formato">EPUB</span><?php endif; ?>
    </a>

    <div class="gl-info">
        <div data-testid="item-titulo-livro" class="gl-titulo"><?= e($livro['titulo']) ?></div>
        <div data-testid="item-autor-livro" class="gl-autor"><?= e($livro['autor'] ?? '') ?></div>
        <div class="gl-chips">
            <?php if (!empty($livro['categoria_nome'])): ?><span class="gl-chip"><i class="fas fa-tag" aria-hidden="true"></i> <?= e($livro['categoria_nome']) ?></span><?php endif; ?>
            <span class="gl-chip"><?= $ehEpub ? 'EPUB' : 'PDF' ?></span>
            <span class="gl-chip gl-chip--data<?= empty($livro['data_publicacao']) ? ' gl-chip--aviso' : '' ?>" data-testid="item-publicacao"><i class="far fa-calendar" aria-hidden="true"></i> <span class="gl-chip__texto"><?= !empty($livro['data_publicacao']) ? e(date('d/m/Y', strtotime($livro['data_publicacao']))) : 'Sem data de publicação' ?></span></span>
            <?php if (($livro['publicacao'] ?? 'aprovado') !== 'aprovado'): ?><span class="gl-chip gl-chip--aviso"><?= e($rotulosPublicacao[$livro['publicacao']] ?? $livro['publicacao']) ?></span><?php endif; ?>
            <span data-testid="item-visibilidade" class="vis-selo <?= e($selo['classe']) ?>"><i class="fas fa-eye" aria-hidden="true"></i> <span class="vis-selo__texto"><?= e($selo['texto']) ?></span></span>
        </div>
        <?php if (!empty($livro['duplicado_de'])): ?>
        <div class="gl-repetido" data-testid="item-repetido">
            <span class="vis-selo vis-selo--oculto"><i class="fas fa-clone" aria-hidden="true"></i> Repetido de #<?= (int) $livro['duplicado_de'] ?> «<?= e($livro['original_titulo'] ?? '') ?>» · escondido de Pro e Grátis</span>
            <button type="button" class="btn btn-link btn-sm p-0 ms-2 btn-nao-repetido" data-id="<?= (int) $livro['id'] ?>" data-testid="btn-nao-repetido">Não é repetido</button>
        </div>
        <?php endif; ?>
    </div>

    <div class="gl-acoes">
        <a data-testid="btn-abrir-item" class="gl-btn gl-btn--abrir" data-analise="gerenciar" href="<?= $raiz ?>leitor?id=<?= (int) $livro['id'] ?>" aria-label="Abrir <?= e($livro['titulo']) ?> para analisar" title="Abrir para analisar (não conta como leitura); o Voltar traz você de volta aqui">
            <i class="fas fa-book-open" aria-hidden="true"></i> <span>Abrir</span>
        </a>
        <button data-testid="btn-editar-item" type="button" class="gl-btn gl-btn--editar btn-editar-livro" aria-label="Editar <?= e($livro['titulo']) ?>">
            <i class="fas fa-pen" aria-hidden="true"></i> <span>Editar</span>
        </button>
        <button data-testid="btn-excluir-item" type="button" class="gl-btn gl-btn--excluir btn-excluir-livro" aria-label="Excluir <?= e($livro['titulo']) ?>" title="Excluir">
            <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
    </div>
</div>
<?php endforeach; ?>

<?php if (empty($livros) && $busca !== ''): ?>
<div data-testid="msg-busca-gerenciar-vazia" class="text-center py-5">
    <i class="fas fa-search d-block mb-3 fs-1 text-secondary"></i>
    <p class="text-muted">Nenhum resultado para sua pesquisa.</p>
</div>
<?php elseif (empty($livros)): ?>
<div data-testid="msg-gerenciar-vazio" class="text-center py-5">
    <i class="fas fa-folder-open d-block mb-3 fs-1 text-secondary"></i>
    <p class="text-muted">Não há livros para gerenciar.</p>
</div>
<?php endif; ?>
