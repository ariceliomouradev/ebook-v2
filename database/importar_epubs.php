<?php
/**
 * Importa EPUBs de uma pasta para o acervo (só COPIA: a pasta de origem nunca é alterada).
 *
 *   php database/importar_epubs.php --origem="C:\caminho\pasta"                       simulação (não grava nada)
 *   php database/importar_epubs.php --origem="..." --idioma=pt,es --limite=50         filtra idioma e quantidade
 *   php database/importar_epubs.php --origem="..." --aplicar                           grava no banco e copia os arquivos
 *   php database/importar_epubs.php --desfazer                                         remove exatamente o que o último --aplicar importou
 *
 * Regras (as mesmas do envio pelo painel, feito pelo administrador):
 *   - arquivo idêntico a um livro que já existe (SHA-256) é pulado;
 *   - título/autor/idioma vêm dos metadados do EPUB; a capa é extraída do próprio arquivo;
 *   - sem autor identificado, o livro entra como "Autor Desconhecido" e fica pendente (só o administrador vê);
 *   - repetido de um livro já publicado (mesmo título e autor, mesma capa...) entra marcado como duplicado:
 *     fica escondido de Pro e Grátis, nada é apagado;
 *   - o dono dos livros é o primeiro administrador;
 *   - --idioma padrão: pt (códigos de 2 letras dos metadados: pt, es, en...);
 *   - categoria: includes/categorias_epub.php (autor/editora, palavras fortes, regras do sistema). O que nada
 *     reconhece vai para "Geral"; --padrao=literatura manda esses para Literatura (bom para acervo de ficção).
 *
 * O estado do último --aplicar fica em database/.importacao_epub/ultimo.json (ignorado pelo git).
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
define('CAMINHO_RAIZ', __DIR__ . '/../');
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/epub.php';
require_once __DIR__ . '/../includes/duplicados.php';

$opcoes = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z]+)(?:=(.*))?$/', $a, $m)) {
        $opcoes[$m[1]] = $m[2] ?? true;
    }
}
$estadoDir = __DIR__ . '/.importacao_epub';
$estadoArq = $estadoDir . '/ultimo.json';

/* ------------------------------- desfazer ------------------------------- */
if (isset($opcoes['desfazer'])) {
    if (!is_file($estadoArq)) {
        exit("Nada para desfazer (não há importação registrada).\n");
    }
    $estado = json_decode((string) file_get_contents($estadoArq), true) ?: [];
    $removidos = 0;
    foreach ($estado['livros'] ?? [] as $l) {
        $pdo->prepare('DELETE FROM livros WHERE id = ? AND nome_arquivo = ?')->execute([$l['id'], $l['arquivo']]);
        @unlink(__DIR__ . '/../uploads/' . $l['arquivo']);
        if (!empty($l['capa'])) {
            @unlink(__DIR__ . '/../capas/' . $l['capa']);
        }
        $removidos++;
    }
    @unlink($estadoArq);
    exit("Desfeito: $removidos livros removidos (banco, uploads/ e capas/).\n");
}

/* ------------------------------- importar ------------------------------- */
$origem = isset($opcoes['origem']) && is_string($opcoes['origem']) ? rtrim($opcoes['origem'], "\\/") : '';
if ($origem === '' || !is_dir($origem)) {
    exit("Informe a pasta com --origem=\"C:\\caminho\".\n");
}
$aplicar = isset($opcoes['aplicar']);
$idiomas = array_filter(array_map('trim', explode(',', is_string($opcoes['idioma'] ?? null) ? strtolower($opcoes['idioma']) : 'pt')));
$limite = isset($opcoes['limite']) ? max(1, (int) $opcoes['limite']) : PHP_INT_MAX;
// categoria dos livros que nenhuma regra reconhece ('geral' por padrão; --padrao=literatura para acervos de ficção)
$padraoCategoria = is_string($opcoes['padrao'] ?? null) ? preg_replace('/[^a-z-]/', '', strtolower($opcoes['padrao'])) : 'geral';
if (!isset(CATEGORIAS_PADRAO[$padraoCategoria])) {
    exit("Categoria desconhecida em --padrao: $padraoCategoria\n");
}
$porCategoria = [];

$donoId = (int) $pdo->query("SELECT id FROM usuarios WHERE perfil = 'admin' ORDER BY id LIMIT 1")->fetchColumn();
if ($aplicar && $donoId <= 0) {
    exit("Não há administrador para ser dono dos livros.\n");
}
garantirCategoriasPadrao($pdo);

$arquivos = glob($origem . DIRECTORY_SEPARATOR . '*.epub') ?: [];
sort($arquivos, SORT_NATURAL | SORT_FLAG_CASE);

$cont = ['lidos' => 0, 'importados' => 0, 'fora_do_idioma' => 0, 'ja_existe' => 0, 'invalidos' => 0, 'repetidos_marcados' => 0, 'sem_autor' => 0, 'sem_capa' => 0];
$importados = [];
$vistos = []; // hash já tratado nesta rodada (cópias idênticas na própria pasta)

foreach ($arquivos as $arq) {
    if ($cont['importados'] >= $limite) {
        break;
    }
    $cont['lidos']++;
    if (!arquivoEhEpubValido($arq, false)) {
        $cont['invalidos']++;
        echo "  inválido: " . basename($arq) . "\n";
        continue;
    }
    $meta = epubMetadados($arq);
    $idioma = substr($meta['idioma'], 0, 2);
    if ($idiomas && !in_array($idioma, $idiomas, true)) {
        $cont['fora_do_idioma']++;
        continue;
    }
    $hash = hash_file('sha256', $arq);
    if (isset($vistos[$hash]) || hashJaExiste($pdo, $hash)) {
        $cont['ja_existe']++;
        continue;
    }
    $vistos[$hash] = true;

    $titulo = $meta['titulo'] !== '' ? $meta['titulo'] : preg_replace('/\s*\(\d+\)$/', '', pathinfo($arq, PATHINFO_FILENAME));
    $autor = $meta['autor'] !== '' ? $meta['autor'] : 'Autor Desconhecido';
    $pendente = $autor === 'Autor Desconhecido';
    $cont['sem_autor'] += $pendente ? 1 : 0;
    $slug = categoriaSugeridaEpub($titulo, $meta['assuntos'], $autor, $padraoCategoria);
    $porCategoria[$slug] = ($porCategoria[$slug] ?? 0) + 1;

    if (!$aplicar) {
        $cont['importados']++;
        echo sprintf("  [%s] %-9s %s — %s\n", $idioma ?: '??', $slug, mb_substr($titulo, 0, 60), mb_substr($autor, 0, 30));
        continue;
    }

    $nome = time() . '_' . bin2hex(random_bytes(8)) . '.epub';
    if (!copy($arq, __DIR__ . '/../uploads/' . $nome)) {
        echo "  falha ao copiar: " . basename($arq) . "\n";
        continue;
    }
    $capaNome = '';
    $capaHash = null;
    $png = epubCapaPng($arq);
    if ($png !== null) {
        $capaNome = pathinfo($nome, PATHINFO_FILENAME) . '.png';
        file_put_contents(__DIR__ . '/../capas/' . $capaNome, $png);
        $capaHash = hashCapaDeBytes($png);
    } else {
        $cont['sem_capa']++;
    }

    try {
        $pdo->prepare(
            "INSERT INTO livros (titulo, autor, sinopse, nome_arquivo, formato, capa_arquivo, usuario_id, categoria_id, visivel_para, publicacao, hash_arquivo)
             VALUES (?, ?, ?, ?, 'epub', ?, ?, ?, ?, ?, ?)"
        )->execute([
            mb_substr($titulo, 0, 255), mb_substr($autor, 0, 255), ($meta['sinopse'] ?? '') !== '' ? $meta['sinopse'] : null, $nome, $capaNome, $donoId, categoriaIdPorSlug($pdo, $slug),
            $pendente ? '' : 'contribuidor,leitor', $pendente ? 'pendente' : 'aprovado', $hash,
        ]);
    } catch (PDOException $e) {
        @unlink(__DIR__ . '/../uploads/' . $nome);
        if ($capaNome !== '') {
            @unlink(__DIR__ . '/../capas/' . $capaNome);
        }
        echo "  falha ao gravar: " . basename($arq) . " (" . $e->getMessage() . ")\n";
        continue;
    }
    $id = (int) $pdo->lastInsertId();
    atualizarChavesDoLivro($pdo, $id, $titulo, $autor, $capaHash);
    if (!$pendente && marcarDuplicadoSePreciso($pdo, $id) !== null) {
        $cont['repetidos_marcados']++;
    }
    $importados[] = ['id' => $id, 'arquivo' => $nome, 'capa' => $capaNome, 'origem' => basename($arq)];
    $cont['importados']++;
}

if ($aplicar && $importados) {
    if (!is_dir($estadoDir)) {
        mkdir($estadoDir, 0775, true);
    }
    // acumula com importações anteriores ainda não desfeitas
    $anterior = is_file($estadoArq) ? (json_decode((string) file_get_contents($estadoArq), true)['livros'] ?? []) : [];
    file_put_contents($estadoArq, json_encode(['data' => date('c'), 'livros' => array_merge($anterior, $importados)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

echo "\n" . ($aplicar ? "IMPORTADO" : "SIMULAÇÃO (nada foi gravado; use --aplicar)") . "\n";
foreach ($cont as $k => $v) {
    echo sprintf("  %-20s %d\n", str_replace('_', ' ', $k), $v);
}
arsort($porCategoria);
echo "\nPor categoria:\n";
foreach ($porCategoria as $slug => $n) {
    echo sprintf("  %-18s %d\n", CATEGORIAS_PADRAO[$slug]['nome'], $n);
}
