<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

// Toda ordenação termina em `id`: com LIMIT/OFFSET, empates (títulos iguais ou equivalentes na
// collation, como "Ação" e "acao") deixariam a ordem dos empatados livre entre uma página e outra,
// e um livro poderia aparecer em duas páginas ou em nenhuma.
const ORDENS_PERMITIDAS = [
    'az'       => 'titulo ASC, id ASC',
    'za'       => 'titulo DESC, id DESC',
    'antigos'  => 'id ASC',
    'recentes' => 'id DESC',
];

function ordenacaoValida(string $ordem): string
{
    return array_key_exists($ordem, ORDENS_PERMITIDAS) ? $ordem : 'recentes';
}

/**
 * Escapa os curingas do LIKE (% e _) e a própria barra, para a busca tratar o termo como texto
 * literal. Sem isto, pesquisar "100%" ou "mapa_mental" casaria com muito mais do que o digitado.
 */
function escaparLike(string $termo): string
{
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $termo);
}

/**
 * Uma página da lista do gerenciador (modal "Gerenciar Biblioteca", só admin), em ordem
 * alfabética e com busca por título/autor no servidor.
 *
 * Existe porque o modal antes recebia TODOS os livros dentro do HTML do painel: com um acervo
 * de milhares de títulos isso eram megabytes por carregamento de página.
 */
function listarLivrosParaGerenciar(PDO $pdo, string $busca, int $pagina): array
{
    $busca = trim($busca);
    $where = '';
    $parametros = [];
    if ($busca !== '') {
        $where = 'WHERE titulo LIKE :busca OR autor LIKE :busca';
        $parametros[':busca'] = '%' . escaparLike($busca) . '%';
    }

    $stmtTotal = $pdo->prepare("SELECT COUNT(*) FROM livros $where");
    $stmtTotal->execute($parametros);
    $total = (int) $stmtTotal->fetchColumn();
    $totalPaginas = max(1, (int) ceil($total / ITENS_POR_PAGINA_GERENCIADOR));
    $pagina = min(max(1, $pagina), $totalPaginas); // página fora do intervalo cai na última válida

    $stmt = $pdo->prepare("SELECT id, titulo, autor, (SELECT slug FROM categorias c WHERE c.id = livros.categoria_id) AS categoria FROM livros $where ORDER BY titulo ASC, id ASC LIMIT :limite OFFSET :offset");
    foreach ($parametros as $chave => $valor) {
        $stmt->bindValue($chave, $valor, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limite', ITENS_POR_PAGINA_GERENCIADOR, PDO::PARAM_INT);
    $stmt->bindValue(':offset', ($pagina - 1) * ITENS_POR_PAGINA_GERENCIADOR, PDO::PARAM_INT);
    $stmt->execute();

    return [
        'livros'       => $stmt->fetchAll(),
        'total'        => $total,
        'totalPaginas' => $totalPaginas,
        'pagina'       => $pagina,
        'busca'        => $busca,
    ];
}

/**
 * Busca livros paginados e ordenados, com busca por título/autor aplicada no servidor
 * (antes a busca era feita só no DOM da página atual, então nunca encontrava livros
 * fora da página exibida).
 */
function listarLivrosPaginados(PDO $pdo, string $ordemAtual, string $busca, int $paginaAtual, int $usuarioId, string $categoria = ''): array
{
    $ordemAtual = ordenacaoValida($ordemAtual);
    $sqlOrdem = ORDENS_PERMITIDAS[$ordemAtual];
    $busca = trim($busca);
    $paginaAtual = max(1, $paginaAtual);

    $condicoes = [];
    $parametros = [];
    if ($busca !== '') {
        $condicoes[] = '(titulo LIKE :busca OR autor LIKE :busca)';
        $parametros[':busca'] = '%' . escaparLike($busca) . '%';
    }
    $categoria = trim($categoria);
    if ($categoria !== '') {
        $condicoes[] = 'categoria_id = (SELECT id FROM categorias WHERE slug = :categoria)';
        $parametros[':categoria'] = $categoria;
    }
    $whereSql = $condicoes ? 'WHERE ' . implode(' AND ', $condicoes) : '';

    $stmtTotal = $pdo->prepare("SELECT COUNT(*) FROM livros $whereSql");
    $stmtTotal->execute($parametros);
    $totalLivros = (int) $stmtTotal->fetchColumn();
    $totalPaginas = max(1, (int) ceil($totalLivros / ITENS_POR_PAGINA));

    if ($paginaAtual > $totalPaginas) {
        $paginaAtual = $totalPaginas;
    }
    $offset = ($paginaAtual - 1) * ITENS_POR_PAGINA;

    $stmt = $pdo->prepare("SELECT * FROM livros $whereSql ORDER BY $sqlOrdem LIMIT :limite OFFSET :offset");
    foreach ($parametros as $chave => $valor) {
        $stmt->bindValue($chave, $valor, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limite', ITENS_POR_PAGINA, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $livros = $stmt->fetchAll();

    $progressos = [];
    if ($livros) {
        $ids = array_column($livros, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmtProgresso = $pdo->prepare("SELECT livro_id, progresso, total_paginas, porcentagem FROM leituras WHERE usuario_id = ? AND livro_id IN ($placeholders)");
        $stmtProgresso->execute([$usuarioId, ...$ids]);
        foreach ($stmtProgresso->fetchAll() as $linha) {
            $progressos[$linha['livro_id']] = $linha;
        }
    }

    return [
        'livros'        => $livros,
        'progressos'    => $progressos,
        'totalLivros'   => $totalLivros,
        'totalPaginas'  => $totalPaginas,
        'paginaAtual'   => $paginaAtual,
        'ordemAtual'    => $ordemAtual,
        'busca'         => $busca,
        'categoria'     => $categoria,
    ];
}

/**
 * Livros que o usuário começou e ainda não terminou, do mais recente para o mais antigo.
 * Alimenta a faixa "Continue lendo" do painel.
 */
function listarEmAndamento(PDO $pdo, int $usuarioId, int $limite = 8): array
{
    $stmt = $pdo->prepare(
        'SELECT l.id, l.titulo, l.autor, l.capa_arquivo, le.progresso, le.total_paginas, le.porcentagem
           FROM leituras le
           JOIN livros l ON l.id = le.livro_id
          WHERE le.usuario_id = :u AND le.porcentagem > 0 AND le.porcentagem < 100
          ORDER BY le.atualizado_em DESC, l.id DESC
          LIMIT :lim'
    );
    $stmt->bindValue(':u', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':lim', $limite, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}
