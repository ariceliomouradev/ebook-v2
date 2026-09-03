<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

const ORDENS_PERMITIDAS = [
    'az'       => 'titulo ASC',
    'za'       => 'titulo DESC',
    'antigos'  => 'id ASC',
    'recentes' => 'id DESC',
];

function ordenacaoValida(string $ordem): string
{
    return array_key_exists($ordem, ORDENS_PERMITIDAS) ? $ordem : 'recentes';
}

/**
 * Busca livros paginados e ordenados, com busca por título/autor aplicada no servidor
 * (antes a busca era feita só no DOM da página atual, então nunca encontrava livros
 * fora da página exibida).
 */
function listarLivrosPaginados(PDO $pdo, string $ordemAtual, string $busca, int $paginaAtual, int $usuarioId): array
{
    $ordemAtual = ordenacaoValida($ordemAtual);
    $sqlOrdem = ORDENS_PERMITIDAS[$ordemAtual];
    $busca = trim($busca);
    $paginaAtual = max(1, $paginaAtual);

    $whereSql = '';
    $parametros = [];
    if ($busca !== '') {
        $whereSql = 'WHERE titulo LIKE :busca OR autor LIKE :busca';
        $parametros[':busca'] = '%' . $busca . '%';
    }

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
    ];
}
