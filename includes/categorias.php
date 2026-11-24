<?php
/**
 * Categorias do acervo.
 *
 * A lista abaixo é a fonte única: o script database/categorizar_acervo.php cria as linhas na tabela
 * `categorias` a partir dela e o upload usa categoriaSugerida() quando ninguém escolhe uma. As
 * palavras-chave valem para o TÍTULO (o autor foi deixado de fora de propósito: nomes de pessoas
 * geram falsos positivos). Sem nenhuma palavra reconhecida o livro vai para "geral".
 *
 * Palavras de até 3 letras só casam como palavra inteira ("ia" não pode casar com "familia").
 */

const CATEGORIAS_PADRAO = [
    'tecnologia' => [
        'nome' => 'Tecnologia',
        'palavras' => ['programacao', 'java', 'python', 'javascript', 'typescript', 'html', 'css', 'php', 'sql', 'oracle', 'linux', 'git',
            'github', 'react', 'angular', 'node', 'banco de dados', 'software', 'algoritmo', 'codigo', 'site', 'sistemas web', 'computador',
            'redes de', 'cloud', 'aws', 'docker', 'excel', 'power bi', 'business intelligence', 'inteligencia artificial', 'ia', 'dados',
            'cypress', 'wordpress', 'ux', 'c#', 'visual studio', 'api', 'devops', 'hacker', 'informatica', 'tecnologia', 'digital',
            'full stack', 'fullstack', 'frontend', 'backend', 'desktop', 'web', 'poo', 'spring', 'android', 'ios', 'mobile', 'chatgpt', 'internet', 'facebook', 'google', 'ijumper', 'sprint', 'automacao'],
    ],
    'negocios' => [
        'nome' => 'Negócios',
        'palavras' => ['empreend', 'negocio', 'startup', 'lideranca', 'lider', 'gestao', 'gerente', 'administracao', 'empresa', 'carreira',
            'estrategia', 'chefe', 'equipe', 'planejamento', 'freelancer', 'trabalho', 'trabalhe', 'trabalhar', 'profissional', 'executivo', 'organizacao', 'gestor', 'bilionario', 'bezos', 'wall street', 'principios', 'harvard', 'chefia', 'mercado', 'inovacao', 'valor', 'geracao de valor'],
    ],
    'marketing' => [
        'nome' => 'Marketing e Vendas',
        'palavras' => ['marketing', 'vendas', 'vender', 'copywriting', 'publicidade', 'seo', 'trafego', 'redes sociais', 'instagram',
            'branding', 'persuasao', 'negociacao', 'cliente', 'influenc', 'youtube', 'anuncio', 'lancamento', 'convencer', 'gatilhos', 'conteudo', 'propaganda', 'olivetto', 'vendedor', 'copy'],
    ],
    'financas' => [
        'nome' => 'Finanças',
        'palavras' => ['financ', 'invest', 'dinheiro', 'riqueza', 'rico', 'bolsa de valores', 'acoes', 'renda', 'economia', 'bitcoin',
            'cripto', 'aposentadoria', 'orcamento', 'poupar', 'dividendos', 'fundos', 'milionario', 'lucro', 'pobreza', 'tesouro', 'analise tecnica', 'crise', 'prosperidade', 'capital', 'liberdade', 'servidao', 'pareto', 'poker', 'bilhao', 'banco'],
    ],
    'desenvolvimento' => [
        'nome' => 'Desenvolvimento Pessoal',
        'palavras' => ['felic', 'habito', 'mente', 'mental', 'motivacao', 'autoajuda', 'autoestima', 'sucesso', 'comportament', 'emocion',
            'coaching', 'coach', 'foco', 'disciplina', 'ansiedade', 'medo', 'confianca', 'comunicacao', 'falar em publico', 'oratoria',
            'relacionamento', 'mindset', 'psicologia', 'produtividade', 'proposito', 'vida', 'pessoas', 'segredos', 'inteligencia', 'afirmac', 'poder', 'segredo', 'milagre', 'gratidao', 'cerebro', 'memoria', 'amor', 'procrastin', 'motiva', 'inconsciente', 'personalidade', 'jung', 'raiva', 'estress', 'destino', 'desejo', 'falar bem', 'conforto', 'pense', 'feliz', 'amizade', 'quietos', 'mulher', 'mae', 'casais', 'casal', 'homem', 'sorte', 'mude', 'mudar', 'arquetipo', 'genio', 'escolha', 'emocao', 'timidez', 'vencer', 'conquistar', 'superacao', 'mentiras', 'estranhos', 'ajuda', 'jovens', 'essencial', 'jeito'],
    ],
    'saude' => [
        'nome' => 'Saúde e Bem-estar',
        'palavras' => ['saude', 'dieta', 'emagrec', 'musculo', 'muscular', 'treino', 'nutri', 'yoga', 'meditacao', 'sono', 'corpo',
            'fitness', 'exercicio', 'medicina', 'cura', 'jejum', 'hipertrofia', 'academia', 'diabetic', 'alimentos', 'transtorno', 'borderline', 'depress', 'terapia', 'doenca'],
    ],
    'culinaria' => [
        'nome' => 'Culinária',
        'palavras' => ['receita', 'culinaria', 'cozinha', 'bolo', 'doce', 'pao', 'churrasco', 'gastronomia', 'sobremesa', 'chef'],
    ],
    'educacao' => [
        'nome' => 'Educação e Idiomas',
        'palavras' => ['ingles', 'espanhol', 'idioma', 'gramatica', 'portugues', 'matematica', 'estudo', 'aprender', 'aprenda', 'concurso',
            'enem', 'pedagog', 'aula', 'professor', 'escola', 'ensino', 'redacao', 'vestibular', 'curso'],
    ],
    'design' => [
        'nome' => 'Design e Criatividade',
        'palavras' => ['design', 'criativ', 'figma', 'photoshop', 'ilustra', 'fotografia', 'desenho', 'arte', 'video', 'edicao', 'canva',
            'logotipo', 'cores', 'tipografia'],
    ],
    'espiritualidade' => [
        'nome' => 'Espiritualidade',
        'palavras' => ['biblia', 'deus', 'oracao', 'espirit', 'cristao', 'jesus', 'igreja', 'evangel', 'religi', 'tarot', 'astrologia',
            'fe', 'sagrad', 'alma', 'tozer', 'papa', 'budis', 'buda', 'orixa', 'creem', 'graca', 'diabo', 'cravos', 'milagres', 'santo', 'divin'],
    ],
    'literatura' => [
        'nome' => 'Literatura',
        'palavras' => ['romance', 'conto', 'poesia', 'ficcao', 'fantasia', 'aventura', 'misterio', 'thriller', 'novela', 'sherlock',
            'classico', 'literatura', 'poemas', 'cronicas', 'guerra e paz', 'medeia', 'obras completas', 'analista de bage', 'lendas', 'escritor', 'escrita', 'livro de'],
    ],
    'ciencias' => [
        'nome' => 'Ciências e Humanidades',
        'palavras' => ['astronomia', 'relatividade', 'fisica', 'quimica', 'biologia', 'universo', 'cosmos', 'ciencia', 'caos', 'antropologia',
            'filosofia', 'sociologia', 'historia', 'politica', 'geopolitica', 'sapiens', 'evolucao', 'borboleta', 'calculava', 'realidade',
            'conexoes', 'teoria', 'america latina', 'seneca'],
    ],
    'infantil' => [
        'nome' => 'Infantojuvenil',
        'palavras' => ['infantil', 'infantojuvenil', 'crianca', 'criancas', 'fabula', 'fabulas', 'fadas', 'historinha', 'maluquinho'],
    ],
    'geral' => [
        'nome' => 'Geral',
        'palavras' => [],
    ],
];

/** Minúsculas, sem acento, só letras/números/#/espaço: base para comparar títulos. */
function normalizarParaCategoria(string $texto): string
{
    $texto = mb_strtolower($texto, 'UTF-8');
    $texto = strtr($texto, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n',
    ]);
    $texto = preg_replace('/[^a-z0-9# ]+/', ' ', $texto) ?? '';
    return ' ' . trim(preg_replace('/\s+/', ' ', $texto) ?? '') . ' ';
}

/** Slug da categoria que melhor descreve o título ('geral' quando nada casa). */
function categoriaSugerida(string $titulo): string
{
    $norm = normalizarParaCategoria($titulo);
    $melhor = 'geral';
    $melhorPontos = 0;

    foreach (CATEGORIAS_PADRAO as $slug => $dados) {
        $pontos = 0;
        foreach ($dados['palavras'] as $palavra) {
            if (strlen($palavra) <= 3) {
                // palavra curta: só como palavra inteira
                $achou = str_contains($norm, ' ' . $palavra . ' ');
            } elseif (str_contains($palavra, ' ')) {
                $achou = str_contains($norm, $palavra);
            } else {
                // radical: casa no início de uma palavra ("financ" -> "financeira"), não no meio
                $achou = str_contains($norm, ' ' . $palavra);
            }
            if ($achou) {
                $pontos++;
            }
        }
        if ($pontos > $melhorPontos) {
            $melhorPontos = $pontos;
            $melhor = $slug;
        }
    }
    return $melhor;
}

/** Garante que as categorias padrão existem na tabela (idempotente). */
function garantirCategoriasPadrao(PDO $pdo): void
{
    $stmt = $pdo->prepare('INSERT IGNORE INTO categorias (slug, nome) VALUES (?, ?)');
    foreach (CATEGORIAS_PADRAO as $slug => $dados) {
        $stmt->execute([$slug, $dados['nome']]);
    }
}

/** id da categoria pelo slug, ou null se ela não existir. */
function categoriaIdPorSlug(PDO $pdo, string $slug): ?int
{
    if ($slug === '') {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id FROM categorias WHERE slug = ?');
    $stmt->execute([$slug]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

/** Todas as categorias, com a quantidade de livros de cada uma (só as que têm livro, ordenadas por nome). */
function listarCategoriasComContagem(PDO $pdo, bool $incluirVazias = false, string $perfil = 'admin', int $usuarioId = 0, int $titularId = 0): array
{
    $having = $incluirVazias ? '' : 'HAVING total > 0';
    // A contagem só considera os livros que o perfil pode ver (ver condicaoVisibilidade).
    [$condVis, $paramsVis] = condicaoVisibilidade($perfil, $usuarioId, 'l.', $titularId);
    $sql = "SELECT c.id, c.slug, c.nome, COUNT(l.id) AS total
              FROM categorias c LEFT JOIN livros l ON l.categoria_id = c.id" . ($condVis !== '' ? " AND $condVis" : ($perfil === 'admin' ? " AND l.publicacao = 'aprovado'" : '')) . "
             GROUP BY c.id, c.slug, c.nome $having
             ORDER BY (c.slug = 'geral'), total DESC, c.nome";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($paramsVis);
    return $stmt->fetchAll();
}
