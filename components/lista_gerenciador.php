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
<?php foreach ($livros as $livro): ?>
<div data-testid="item-gerenciador" class="item-lista item-gerenciador d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between py-3 border-bottom border-secondary gap-3"
    data-id="<?= (int) $livro['id'] ?>"
    data-titulo="<?= e($livro['titulo']) ?>"
    data-autor="<?= e($livro['autor'] ?? '') ?>"
    data-sinopse="<?= e($livro['sinopse'] ?? '') ?>"
    data-categoria="<?= e($livro['categoria'] ?? '') ?>"
    data-vis-contribuidor="<?= in_array('contribuidor', explode(',', (string) $livro['visivel_para']), true) ? '1' : '0' ?>"
    data-vis-leitor="<?= in_array('leitor', explode(',', (string) $livro['visivel_para']), true) ? '1' : '0' ?>"
    data-liberar-em="<?= $livro['liberar_em'] ? e(date('Y-m-d\TH:i', strtotime($livro['liberar_em']))) : '' ?>">

    <div class="flex-grow-1 w-100" style="min-width: 0;">
        <div data-testid="item-titulo-livro" class="fw-bold text-light fs-5 lh-sm mb-1" style="word-wrap: break-word;">
            <?= e($livro['titulo']) ?>
        </div>
        <div data-testid="item-autor-livro" class="text-muted small">
            <?= e($livro['autor'] ?? '') ?>
        </div>
        <?php if (!empty($livro['duplicado_de'])): ?>
        <div class="mt-1" data-testid="item-repetido">
            <span class="vis-selo vis-selo--oculto"><i class="fas fa-clone" aria-hidden="true"></i> Repetido de #<?= (int) $livro['duplicado_de'] ?> «<?= e($livro['original_titulo'] ?? '') ?>» · escondido de Pro e Grátis</span>
            <button type="button" class="btn btn-link btn-sm p-0 ms-2 btn-nao-repetido" data-id="<?= (int) $livro['id'] ?>" data-testid="btn-nao-repetido">Não é repetido</button>
        </div>
        <?php endif; ?>
        <?php $selo = resumoVisibilidade((string) $livro['visivel_para'], $livro['liberar_em']); ?>
        <span data-testid="item-visibilidade" class="vis-selo <?= e($selo['classe']) ?> mt-1"><i class="fas fa-eye" aria-hidden="true"></i> <span class="vis-selo__texto"><?= e($selo['texto']) ?></span></span>
    </div>

    <div class="d-flex gap-2 w-100 w-md-auto justify-content-end align-self-end align-self-md-center">
        <button data-testid="btn-excluir-item" type="button" class="btn btn-sm btn-outline-danger btn-icone btn-excluir-livro" aria-label="Excluir <?= e($livro['titulo']) ?>" title="Excluir">
            <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
        <button data-testid="btn-editar-item" type="button" class="btn btn-sm btn-outline-warning flex-fill flex-md-grow-0 btn-editar-livro" aria-label="Editar <?= e($livro['titulo']) ?>">
            <i class="fas fa-pen"></i> Editar
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
