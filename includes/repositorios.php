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
 * Regra de visibilidade dos livros (v1.4). O administrador vê tudo. Os demais perfis veem:
 *   - os livros que eles mesmos enviaram (e, numa conta de família, os do titular); e
 *   - os livros liberados para o perfil deles (coluna visivel_para), que não sejam repetidos de outro
 *     (duplicado_de) e cuja data de liberação
 *     (liberar_em) já passou ou não existe.
 * Devolve [sql, parametros] para juntar a um WHERE; sql vazio = sem restrição.
 * $alias: prefixo da tabela na consulta (ex.: 'l.').
 */
function condicaoVisibilidade(string $perfil, int $usuarioId, string $alias = '', int $titularId = 0): array
{
    if ($perfil === 'admin') {
        return ['', []];
    }
    // Troca 1 por 1: o Grátis só enxerga do acervo o que escolheu (tabela desbloqueios).
    $soEscolhidos = ($perfil === 'leitor' && trocaAtiva())
        ? " AND {$alias}id IN (SELECT livro_id FROM desbloqueios WHERE usuario_id = :vis_u)"
        : '';
    $sql = "({$alias}usuario_id IN (:vis_u, :vis_t) OR (FIND_IN_SET(:vis_p, {$alias}visivel_para) > 0 AND ({$alias}liberar_em IS NULL OR {$alias}liberar_em <= NOW()) AND {$alias}duplicado_de IS NULL{$soEscolhidos}))";
    return [$sql, [':vis_u' => $usuarioId, ':vis_t' => $titularId, ':vis_p' => $perfil]];
}

/**
 * Lê os campos de visibilidade de um formulário (editar/adicionar livro, só administrador):
 * vis_contribuidor, vis_leitor (caixas marcadas) e liberar_em (datetime-local, vazio = já liberado).
 * Devolve [visivel_para, liberar_em] prontos para gravar, ou ['erro' => mensagem].
 */
function lerVisibilidadeDoFormulario(array $post): array
{
    $perfis = [];
    if (!empty($post['vis_contribuidor'])) {
        $perfis[] = 'contribuidor';
    }
    if (!empty($post['vis_leitor'])) {
        $perfis[] = 'leitor';
    }
    $liberarEm = null;
    $texto = trim((string) ($post['liberar_em'] ?? ''));
    if ($texto !== '') {
        $dt = DateTime::createFromFormat('Y-m-d\TH:i', $texto);
        if (!$dt || $dt->format('Y-m-d\TH:i') !== $texto) {
            return ['erro' => 'Data de liberação inválida.'];
        }
        $liberarEm = $dt->format('Y-m-d H:i:00');
    }
    return ['visivel_para' => implode(',', $perfis), 'liberar_em' => $liberarEm];
}

/**
 * Texto e cor do selo de visibilidade mostrado na lista do gerenciador.
 * @return array{texto:string, classe:string}
 */
function resumoVisibilidade(string $visivelPara, ?string $liberarEm): array
{
    $perfis = array_values(array_filter(explode(',', $visivelPara)));
    $alvo = match (true) {
        count($perfis) === 0 => 'Só administrador',
        count($perfis) === 2 => 'Todos os perfis',
        $perfis[0] === 'contribuidor' => 'Só Pro',
        default => 'Só Grátis',
    };
    $agendado = $liberarEm !== null && strtotime($liberarEm) > time();
    if ($agendado) {
        return ['texto' => 'Libera em ' . date('d/m/Y H:i', strtotime($liberarEm)) . ' · ' . $alvo, 'classe' => 'vis-selo--agendado'];
    }
    return ['texto' => $alvo, 'classe' => count($perfis) === 0 ? 'vis-selo--oculto' : 'vis-selo--publico'];
}

/** Verifica se o usuário pode abrir/baixar o livro (mesma regra de condicaoVisibilidade). */
function usuarioPodeVerLivro(PDO $pdo, int $livroId, string $perfil, int $usuarioId, int $titularId = 0): bool
{
    [$cond, $params] = condicaoVisibilidade($perfil, $usuarioId, '', $titularId);
    $stmt = $pdo->prepare('SELECT 1 FROM livros WHERE id = :id' . ($cond !== '' ? ' AND ' . $cond : ''));
    $stmt->execute([':id' => $livroId] + $params);
    return (bool) $stmt->fetchColumn();
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

    $stmt = $pdo->prepare("SELECT id, titulo, autor, sinopse, visivel_para, liberar_em, duplicado_de, (SELECT o.titulo FROM livros o WHERE o.id = livros.duplicado_de) AS original_titulo, (liberar_em IS NOT NULL AND liberar_em > NOW()) AS agendado, (SELECT slug FROM categorias c WHERE c.id = livros.categoria_id) AS categoria FROM livros $where ORDER BY titulo ASC, id ASC LIMIT :limite OFFSET :offset");
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
function listarLivrosPaginados(PDO $pdo, string $ordemAtual, string $busca, int $paginaAtual, int $usuarioId, string $categoria = '', string $perfil = 'leitor', int $titularId = 0, bool $soFavoritos = false, bool $acumular = false): array
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
    [$condVis, $paramsVis] = condicaoVisibilidade($perfil, $usuarioId, '', $titularId);
    if ($condVis !== '') {
        $condicoes[] = $condVis;
        $parametros += $paramsVis;
    }
    if ($perfil === 'admin') {
        // o acervo do administrador é o que já foi aprovado; pedidos pendentes ficam em Aprovações
        $condicoes[] = "publicacao = 'aprovado'";
    }
    if ($soFavoritos) {
        $condicoes[] = 'id IN (SELECT livro_id FROM favoritos WHERE usuario_id = :fav_u)';
        $parametros[':fav_u'] = $usuarioId;
    }
    $whereSql = $condicoes ? 'WHERE ' . implode(' AND ', $condicoes) : '';

    $stmtTotal = $pdo->prepare("SELECT COUNT(*) FROM livros $whereSql");
    $stmtTotal->execute($parametros);
    $totalLivros = (int) $stmtTotal->fetchColumn();
    $totalPaginas = max(1, (int) ceil($totalLivros / ITENS_POR_PAGINA));

    if ($paginaAtual > $totalPaginas) {
        $paginaAtual = $totalPaginas;
    }
    // "Mostrar mais": com $acumular, a resposta traz da página 1 até a $paginaAtual (quem recarrega ou volta do leitor
    // na página N reencontra tudo o que já tinha visto). Teto de 25 páginas para a página não virar um monstro.
    $porPagina = ITENS_POR_PAGINA;
    if ($acumular) {
        $paginaAtual = min($paginaAtual, 25);
        $limite = $paginaAtual * $porPagina;
        $offset = 0;
    } else {
        $limite = $porPagina;
        $offset = ($paginaAtual - 1) * $porPagina;
    }

    $stmt = $pdo->prepare("SELECT * FROM livros $whereSql ORDER BY $sqlOrdem LIMIT :limite OFFSET :offset");
    foreach ($parametros as $chave => $valor) {
        $stmt->bindValue($chave, $valor, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limite', $limite, PDO::PARAM_INT);
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

    // quais livros desta página o usuário já favoritou
    $favoritos = [];
    if ($livros) {
        $idsPagina = array_column($livros, 'id');
        $marcas = implode(',', array_fill(0, count($idsPagina), '?'));
        $stmtFav = $pdo->prepare("SELECT livro_id FROM favoritos WHERE usuario_id = ? AND livro_id IN ($marcas)");
        $stmtFav->execute([$usuarioId, ...$idsPagina]);
        foreach ($stmtFav->fetchAll(PDO::FETCH_COLUMN) as $fid) {
            $favoritos[(int) $fid] = true;
        }
    }

    return [
        'favoritos'     => $favoritos,
        'soFavoritos'   => $soFavoritos,
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
function listarEmAndamento(PDO $pdo, int $usuarioId, int $limite = 8, string $perfil = 'leitor', int $titularId = 0): array
{
    [$condVis, $paramsVis] = condicaoVisibilidade($perfil, $usuarioId, 'l.', $titularId);
    $stmt = $pdo->prepare(
        'SELECT l.id, l.titulo, l.autor, l.capa_arquivo, le.progresso, le.total_paginas, le.porcentagem
           FROM leituras le
           JOIN livros l ON l.id = le.livro_id
          WHERE le.usuario_id = :u AND le.porcentagem > 0 AND le.porcentagem < 100'
        . ($condVis !== '' ? ' AND ' . $condVis : ($perfil === 'admin' ? " AND l.publicacao = 'aprovado'" : '')) . '
          ORDER BY le.atualizado_em DESC, l.id DESC
          LIMIT :lim'
    );
    foreach ($paramsVis as $chave => $valor) {
        $stmt->bindValue($chave, $valor);
    }
    $stmt->bindValue(':u', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':lim', $limite, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

/** Favoritos do usuário para a prateleira do painel (o último favoritado primeiro), com a mesma visibilidade da grade. */
function listarFavoritos(PDO $pdo, int $usuarioId, string $perfil = 'leitor', int $titularId = 0, int $limite = 60): array
{
    [$condVis, $paramsVis] = condicaoVisibilidade($perfil, $usuarioId, 'l.', $titularId);
    $stmt = $pdo->prepare(
        'SELECT l.id, l.titulo, l.autor, l.capa_arquivo, l.formato
           FROM favoritos f
           JOIN livros l ON l.id = f.livro_id
          WHERE f.usuario_id = :fav_u'
        . ($condVis !== '' ? ' AND ' . $condVis : ($perfil === 'admin' ? " AND l.publicacao = 'aprovado'" : '')) . '
          ORDER BY f.criado_em DESC, l.id DESC
          LIMIT :lim'
    );
    foreach ($paramsVis as $chave => $valor) {
        $stmt->bindValue($chave, $valor);
    }
    $stmt->bindValue(':fav_u', $usuarioId, PDO::PARAM_INT);
    $stmt->bindValue(':lim', $limite, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

/**
 * Quantos livros favoritos o usuário tem entre os que ele ainda pode ver (um favorito que ficou oculto
 * ou repetido não conta). Mesma regra da grade do painel.
 */
function contarFavoritos(PDO $pdo, int $usuarioId, string $perfil, int $titularId = 0): int
{
    [$condVis, $paramsVis] = condicaoVisibilidade($perfil, $usuarioId, 'l.', $titularId);
    $sql = 'SELECT COUNT(*) FROM favoritos f JOIN livros l ON l.id = f.livro_id WHERE f.usuario_id = :fav_u'
        . ($condVis !== '' ? ' AND ' . $condVis : ($perfil === 'admin' ? " AND l.publicacao = 'aprovado'" : ''));
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':fav_u' => $usuarioId] + $paramsVis);
    return (int) $stmt->fetchColumn();
}
