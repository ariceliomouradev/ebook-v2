<?php
/**
 * Categoria sugerida para EPUBs.
 *
 * As regras de `categoriaSugerida()` (includes/categorias.php) olham só o título e foram feitas para
 * livros de negócios/tecnologia: palavras como "vida", "amor" ou "mulher" empurram romances para
 * "Desenvolvimento Pessoal". EPUBs vêm de acervos de literatura, então aqui o roteiro é em camadas,
 * da pista mais confiável para a menos:
 *
 *   1. autor/editora conhecidos (pastores e a Editora Cristã Evangélica, autores infantis, clássicos...)
 *   2. palavras FORTES no título/assuntos (romance, fábulas, bíblia, filosofia, obesidade...)
 *   3. as regras gerais do sistema (`categoriaSugerida`)
 *   4. palavras de apoio em espanhol/inglês
 *   5. 'geral' (ou o `$padrao` pedido por quem importa em lote)
 *
 * Tudo é comparado sem acento e em minúsculas. Para ensinar um autor ou palavra nova, basta
 * acrescentar à lista da categoria certa.
 */
require_once __DIR__ . '/categorias.php';

/** Trechos do nome do autor/editora (normalizados) -> categoria. */
const CATEGORIA_EPUB_POR_AUTOR = [
    'espiritualidade' => [
        'editora crista evangelica', 'malafaia', 'rodovalho', 'luciano subira', 'espiritos', 'adeilson salles', 'joa caitano',
        'paul jehle', 'josue gomes', 'jonathan ferreira', 'gilmar vieira chaves', 'enivaldo santos',
    ],
    'infantil' => [
        'ziraldo', 'monteiro lobato', 'sonia junqueira', 'tino freitas', 'roseana murray', 'weberson santiago', 'leo cunha',
        'nelson cruz', 'otavio junior', 'luciana sandroni', 'mirna pinsky', 'marina colasanti', 'mirella spinelli', 'marta lagarta',
        'josue limeira', 'rogerio andrade barbosa', 'arievaldo viana', 'elza sallut', 'stella maris rezende', 'sophia vettorazzo',
        'mariangela haddad', 'wanda lopes bicudo', 'clovis de barros filho', 'estevao ribeiro', 'andrea viviana taubman',
    ],
    'literatura' => [
        'machado de assis', 'jose de alencar', 'mario de andrade', 'lima barreto', 'eca de queiroz', 'kafka', 'dostoievski',
        'dickens', 'bronte', 'jane austen', 'virginia woolf', 'edgar allan poe', 'alexandre dumas', 'stendhal', 'flaubert',
        'proust', 'james joyce', 'melville', 'jack london', 'cervantes', 'boccaccio', 'fernando pessoa', 'aluisio azevedo',
        'alvares de azevedo', 'orwell', 'exupery', 'henry james', 'montgomery', 'eleanor h', 'hosseini', 'slimani', 'nothomb',
        'marguerite duras', 'agualusa', 'arthur azevedo', 'julia lopes', 'carmem dolores', 'osman lins', 'thomas bernhard',
        'natalia ginzburg', 'javier cercas', 'almodovar', 'howard pyle', 'fenimore cooper', 'trajano vieira', 'camila sosa',
        'stefan zweig', 'tolstoi', 'tchekhov', 'gogol', 'victor hugo', 'balzac', 'zola', 'wilde', 'conan doyle', 'agatha christie',
        'martin millar', 'lynn sholes', 'henry james', 'khemiri', 'taiye selasi', 'eric vuillard', 'manuel vilas',
    ],
    'ciencias' => [
        'platao', 'nietzsche', 'descartes', 'schopenhauer', 'maquiavel', 'rousseau', 'beccaria', 'marx karl', 'spinoza', 'diderot',
        'hannah arendt', 'thomas morus', 'erasmo de roterda', 'umberto eco', 'guinsburg', 'daniel r. n. lopes', 'daniel r n lopes',
        'nicolau sevcenko', 'anatol rosenfeld', 'ruy fausto', 'benito mussolini', 'bartolome clavero', 'anita waingort',
    ],
    'design' => [
        'charles gavin', 'legiao urbana', 'joao bosco', 'jeff speck',
    ],
];

/** Palavras (prefixo ou, se curtas, inteiras) que decidem sozinhas, na ordem das categorias abaixo. */
const CATEGORIA_EPUB_PALAVRAS_FORTES = [
    'infantil' => ['infantil', 'infantojuvenil', 'maluquinho', 'turma do', 'turma da', 'historinha', 'fabula', 'fadas', 'menininha'],
    'literatura' => ['romance', 'novela', 'conto', 'cronica', 'poesia', 'poema', 'poeminha', 'poetic', 'haiku', 'haique', 'cordel',
        'ficcao', 'fantasia', 'thriller', 'misterio', 'aventura', 'peca teatral', 'pecas teatrais', 'teatro', 'tragedia', 'comedia',
        'diario de', 'obra completa', 'obras completas', 'obra reunida', 'grandes obras', 'dom quixote', 'sherlock', 'vampiro', 'assassin',
        'crime', 'detetive', 'serie naipes', 'saga', 'fiction', 'novel', 'cuento', 'novela'],
    'espiritualidade' => ['biblia', 'biblic', 'profeta', 'evangel', 'apocalipse', 'oracao', 'deus', 'cristo', 'cristao', 'crista', 'jesus',
        'igreja', 'umbanda', 'mediunidade', 'espirit', 'genesis', 'isaias', 'jeremias', 'ezequiel', 'efesios', 'romanos', 'salmos',
        'proverbios', 'tabernaculo', 'pregai', 'religi', 'anticristo', 'constelacao familiar', 'bible'],
    'saude' => ['obesidade', 'diabet', 'suicid', 'drogas', 'enfermagem', 'aftas', 'medic', 'cirurgi', 'clinic', 'saude', 'nutri', 'terapia'],
    'educacao' => ['mediacao', 'avaliacao', 'pedagog', 'alfabetiz', 'escola', 'estudante', 'ensino', 'educacao', 'aula'],
    'ciencias' => ['filosof', 'politic', 'direito', 'racismo', 'constitucional', 'justica', 'inquisicao', 'judaismo', 'sociedade', 'sociolog',
        'totalitar', 'fascismo', 'comunis', 'republica', 'historia do', 'interpretacao', 'metodo', 'apologia', 'contrato social', 'cidade'],
    'design' => ['musica', 'cinema', 'quadrinhos', 'fotografia', 'arquitet', 'banda', 'rock'],
    'culinaria' => ['receita', 'culinaria', 'salada', 'almoco', 'cozinha'],
];

/** Palavras de apoio em espanhol/inglês (as regras do sistema são em português). */
const CATEGORIA_EPUB_APOIO = [
    'literatura'      => ['ficcion', 'stories', 'narrativa', 'misterio', 'poesia', 'teatro', 'ensayo literario'],
    'desenvolvimento' => ['autoayuda', 'self help', 'psicologia', 'psicoanalisis', 'habits'],
    'espiritualidade' => ['dios', 'religion', 'espiritual'],
    'negocios'        => ['negocios', 'business', 'liderazgo', 'leadership'],
    'ciencias'        => ['ciencia', 'science', 'fisica', 'historia', 'history', 'filosofia', 'philosophy', 'ensayo'],
    'educacao'        => ['educacion', 'pedagog'],
    'infantil'        => ['infantil', 'juvenil', 'children'],
];

/**
 * Palavras das regras gerais que, num EPUB, quase sempre aparecem em ficção ("A invenção do amor",
 * "A filha de Onélia, uma vida"). Sozinhas elas não bastam para dizer "Desenvolvimento Pessoal" & cia.
 */
const CATEGORIA_EPUB_PALAVRAS_FRACAS = [
    'amor', 'vida', 'mulher', 'homem', 'mae', 'pessoas', 'poder', 'destino', 'desejo', 'escolha', 'jovens', 'mente', 'segredo',
    'segredos', 'sorte', 'mudar', 'mude', 'amizade', 'raiva', 'medo', 'jeito', 'essencial', 'estranhos', 'quietos', 'conforto',
    'casal', 'casais', 'pense', 'vencer', 'conquistar', 'genio', 'liberdade', 'valor', 'capital', 'banco', 'crise', 'lider',
    'trabalho', 'equipe', 'chefe', 'site', 'web', 'digital', 'dados', 'api', 'fe', 'papa', 'santo', 'graca', 'sagrad', 'cura',
    'corpo', 'sono', 'mercado', 'ajuda', 'foco', 'realidade', 'teoria',
];

/** Como `categoriaSugerida()`, ignorando CATEGORIA_EPUB_PALAVRAS_FRACAS. */
function categoriaEpubRegrasGerais(string $texto): string
{
    $norm = normalizarParaCategoria($texto);
    $melhor = 'geral';
    $melhorPontos = 0;
    foreach (CATEGORIAS_PADRAO as $slug => $dados) {
        $pontos = 0;
        foreach ($dados['palavras'] as $p) {
            if (in_array($p, CATEGORIA_EPUB_PALAVRAS_FRACAS, true)) {
                continue;
            }
            if (categoriaEpubTemPalavra($norm, $p)) {
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

/** O texto (já normalizado, com espaço nas pontas) contém a palavra? Curta: inteira. Longa: começo de palavra. */
function categoriaEpubTemPalavra(string $norm, string $palavra): bool
{
    if (str_contains($palavra, ' ')) {
        return str_contains($norm, ' ' . $palavra);
    }
    return strlen($palavra) <= 3 ? str_contains($norm, ' ' . $palavra . ' ') : str_contains($norm, ' ' . $palavra);
}

/**
 * @param string $padrao categoria usada quando nenhuma regra serve ('geral' ou, em importação em lote, 'literatura')
 * @return string slug da categoria
 */
function categoriaSugeridaEpub(string $titulo, string $assuntos = '', string $autor = '', string $padrao = 'geral'): string
{
    $texto = normalizarParaCategoria($titulo . ' ' . $assuntos);
    $quem = normalizarParaCategoria($autor);

    // 1. autor/editora
    foreach (CATEGORIA_EPUB_POR_AUTOR as $slug => $nomes) {
        foreach ($nomes as $n) {
            if (str_contains($quem, ' ' . $n) || str_contains($quem, $n . ' ')) {
                return $slug;
            }
        }
    }
    // 2. palavras fortes
    foreach (CATEGORIA_EPUB_PALAVRAS_FORTES as $slug => $palavras) {
        foreach ($palavras as $p) {
            if (categoriaEpubTemPalavra($texto, $p)) {
                return $slug;
            }
        }
    }
    // 3. regras gerais do sistema (sem as palavras que em romance só querem dizer "vida" ou "amor")
    $slug = categoriaEpubRegrasGerais($texto);
    if ($slug !== 'geral') {
        return $slug;
    }
    // 4. apoio es/en
    $melhor = $padrao;
    $melhorPontos = 0;
    foreach (CATEGORIA_EPUB_APOIO as $cat => $palavras) {
        $pontos = 0;
        foreach ($palavras as $p) {
            if (categoriaEpubTemPalavra($texto, $p)) {
                $pontos++;
            }
        }
        if ($pontos > $melhorPontos) {
            $melhorPontos = $pontos;
            $melhor = $cat;
        }
    }
    return $melhor;
}
