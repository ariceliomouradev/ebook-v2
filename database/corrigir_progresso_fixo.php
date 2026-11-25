<?php
/**
 * Corrige o progresso de leitura de EPUBs de LAYOUT FIXO (quadrinhos e livros infantis de página-imagem).
 *
 * Bug: o leitor media o progresso por caracteres de texto; como esses livros quase não têm texto, a leitura
 * aparecia como 100% logo nas primeiras páginas. O leitor agora mede por página (N de M). Esta rotina refaz os
 * percentuais já gravados a partir de onde a pessoa parou (a posição CFI guarda o número da página no livro).
 *
 *   php database/corrigir_progresso_fixo.php            simulação
 *   php database/corrigir_progresso_fixo.php --aplicar  grava
 */
if (PHP_SAPI !== 'cli') {
    exit('Execute pela linha de comando.');
}
define('ACESSO_PERMITIDO', true);
define('CAMINHO_RAIZ', __DIR__ . '/../');
require_once __DIR__ . '/../config/bootstrap.php';
require_once __DIR__ . '/../includes/epub.php';

$aplicar = in_array('--aplicar', $argv, true);
$livros = $pdo->query("SELECT id, titulo, nome_arquivo FROM livros WHERE formato = 'epub'")->fetchAll();
$busca = $pdo->prepare("SELECT usuario_id, progresso, porcentagem, posicao FROM leituras WHERE livro_id = ? AND posicao IS NOT NULL AND posicao <> ''");
$up = $pdo->prepare('UPDATE leituras SET progresso = ?, total_paginas = 1000, porcentagem = ? WHERE usuario_id = ? AND livro_id = ?');

$fixos = $linhas = $mudaram = 0;
foreach ($livros as $l) {
    $arq = __DIR__ . '/../uploads/' . $l['nome_arquivo'];
    $z = new ZipArchive();
    if (!is_file($arq) || $z->open($arq) !== true) {
        continue;
    }
    $pacote = epubPacote($z);
    $opfFixo = false;
    if ($pacote) {
        $container = (string) $z->getFromName('META-INF/container.xml');
        if (preg_match('/full-path="([^"]+)"/', $container, $m)) {
            $opfFixo = stripos((string) $z->getFromName(epubNormalizarCaminho(rawurldecode($m[1]))), 'pre-paginated') !== false;
        }
    }
    $z->close();
    if (!$pacote || !$opfFixo) {
        continue;
    }
    $fixos++;
    $total = count($pacote['xml']->xpath("//*[local-name()='spine']/*[local-name()='itemref']") ?: []);
    if ($total < 1) {
        continue;
    }
    $busca->execute([$l['id']]);
    foreach ($busca->fetchAll() as $r) {
        if (!preg_match('~^epubcfi\(/6/(\d+)~', (string) $r['posicao'], $mm)) {
            continue;
        }
        $linhas++;
        $indice = max(0, intdiv((int) $mm[1], 2) - 1);              // /6/N: o item N/2 da lista de páginas (começa em 1)
        $fracao = min(1.0, ($indice + 1) / $total);
        $pct = (int) round($fracao * 100);
        $milesimos = max(1, min(1000, (int) round($fracao * 1000)));
        if ((int) $r['porcentagem'] !== $pct) {
            $mudaram++;
            if ($mudaram <= 8) {
                echo sprintf("  #%d %-45s usuário %d: %d%% -> %d%% (página %d de %d)\n", $l['id'], mb_substr($l['titulo'], 0, 45), $r['usuario_id'], $r['porcentagem'], $pct, $indice + 1, $total);
            }
            if ($aplicar) {
                $up->execute([$milesimos, $pct, (int) $r['usuario_id'], (int) $l['id']]);
            }
        }
    }
}
echo "EPUBs de layout fixo: $fixos; leituras com posição: $linhas; a corrigir: $mudaram\n";
echo $aplicar ? "Gravado.\n" : "Simulação: use --aplicar para gravar.\n";
