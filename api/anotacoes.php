<?php
/**
 * Anotações do leitor (marca-texto por área e notas com comentário). Valem para todos os perfis e
 * são sempre do próprio usuário, no livro que ele consegue abrir. Ações (POST + CSRF, JSON):
 *   listar   livro_id
 *   criar    livro_id, pagina, tipo (area|nota|texto), cor, x, y, w, h, comentario
 *            (texto: rects = JSON [[x,y,w,h],...] e trecho = texto marcado; x,y,w,h viram a caixa que os envolve)
 *   editar   id, cor, comentario
 *   excluir  id
 * Posições são frações de 0 a 1 da página (independem do zoom).
 *
 * PRIVACIDADE: toda consulta filtra por usuario_id da sessão. Ninguém lê, edita ou apaga a anotação de
 * outra pessoa, nem o administrador, nem a Família do titular: cada usuário só enxerga as próprias.
 */
define('CAMINHO_RAIZ', '../');
require_once '../config/bootstrap.php';
require_once '../includes/repositorios.php';

require_login(true);
require_post(true);
csrf_verify(true);

const ANOTACAO_CORES = ['amarelo', 'verde', 'azul', 'rosa', 'laranja'];
const ANOTACOES_MAX_POR_LIVRO = 500;
const ANOTACAO_COMENTARIO_MAX = 1000;

$meuId = (int) $_SESSION['usuario_id'];

function falhaAnotacao(string $erro, int $codigo = 422): never
{
    responderJson(['success' => false, 'error' => $erro], $codigo);
}

function anotacaoParaJson(array $r): array
{
    return [
        'id' => (int) $r['id'], 'livro_id' => (int) $r['livro_id'], 'pagina' => (int) $r['pagina'],
        'tipo' => $r['tipo'], 'cor' => $r['cor'],
        'x' => (float) $r['x'], 'y' => (float) $r['y'], 'w' => (float) $r['w'], 'h' => (float) $r['h'],
        'comentario' => $r['comentario'] ?? '',
        'rects' => $r['tipo'] === 'texto' ? (json_decode((string) $r['rects'], true) ?: []) : [],
        'trecho' => $r['trecho'] ?? '',
    ];
}

function comentarioLimpo(): ?string
{
    $c = trim((string) ($_POST['comentario'] ?? ''));
    return $c === '' ? null : mb_substr($c, 0, ANOTACAO_COMENTARIO_MAX);
}

function corValida(): string
{
    $cor = (string) ($_POST['cor'] ?? '');
    if (!in_array($cor, ANOTACAO_CORES, true)) {
        falhaAnotacao('Cor inválida.');
    }
    return $cor;
}

function fracao(string $campo): float
{
    $v = filter_var($_POST[$campo] ?? null, FILTER_VALIDATE_FLOAT);
    if ($v === false || $v < 0 || $v > 1) {
        falhaAnotacao('Posição inválida.');
    }
    return round($v, 6);
}

$acao = (string) ($_POST['action'] ?? 'listar');

if ($acao === 'listar' || $acao === 'criar') {
    $livroId = filter_var($_POST['livro_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$livroId || !usuarioPodeVerLivro($pdo, $livroId, (string) $_SESSION['usuario_perfil'], $meuId, titularDaSessao())) {
        falhaAnotacao('Livro não encontrado.', 404);
    }
}

if ($acao === 'listar') {
    $stmt = $pdo->prepare('SELECT * FROM anotacoes WHERE usuario_id = ? AND livro_id = ? ORDER BY pagina, y, x LIMIT ' . (ANOTACOES_MAX_POR_LIVRO + 50));
    $stmt->execute([$meuId, $livroId]);
    responderJson(['success' => true, 'anotacoes' => array_map('anotacaoParaJson', $stmt->fetchAll()), 'limite' => ANOTACOES_MAX_POR_LIVRO]);
}

if ($acao === 'criar') {
    $pagina = filter_var($_POST['pagina'] ?? null, FILTER_VALIDATE_INT);
    $tipo = (string) ($_POST['tipo'] ?? '');
    if (!$pagina || $pagina < 1 || $pagina > 100000 || !in_array($tipo, ['area', 'nota', 'texto'], true)) {
        falhaAnotacao('Dados da anotação inválidos.');
    }
    $rectsJson = null;
    $trecho = null;
    if ($tipo === 'texto') {
        $lista = json_decode((string) ($_POST['rects'] ?? ''), true);
        if (!is_array($lista) || !$lista || count($lista) > 200) {
            falhaAnotacao('Trecho inválido.');
        }
        $limpos = [];
        $x0 = $y0 = 1.0;
        $x1 = $y1 = 0.0;
        foreach ($lista as $r) {
            if (!is_array($r) || count($r) !== 4) {
                falhaAnotacao('Trecho inválido.');
            }
            [$rx, $ry, $rw, $rh] = array_map(static fn ($v) => is_numeric($v) ? round((float) $v, 6) : -1.0, array_values($r));
            if ($rx < 0 || $ry < 0 || $rw <= 0 || $rh <= 0 || $rx + $rw > 1.0001 || $ry + $rh > 1.0001) {
                falhaAnotacao('Trecho inválido.');
            }
            $limpos[] = [$rx, $ry, $rw, $rh];
            $x0 = min($x0, $rx); $y0 = min($y0, $ry); $x1 = max($x1, $rx + $rw); $y1 = max($y1, $ry + $rh);
        }
        $x = round($x0, 6); $y = round($y0, 6); $w = round(min(1.0, $x1 - $x0), 6); $h = round(min(1.0, $y1 - $y0), 6);
        $rectsJson = json_encode($limpos);
        $t = trim(preg_replace('/\s+/u', ' ', (string) ($_POST['trecho'] ?? '')));
        $trecho = $t === '' ? null : mb_substr($t, 0, 600);
    } else {
        $x = fracao('x');
        $y = fracao('y');
        $w = 0.0;
        $h = 0.0;
    }
    if ($tipo === 'area') {
        $w = fracao('w');
        $h = fracao('h');
        if ($w < 0.004 || $h < 0.003 || $x + $w > 1.0001 || $y + $h > 1.0001) {
            falhaAnotacao('Área inválida.');
        }
    }
    $cor = corValida();

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM anotacoes WHERE usuario_id = ? AND livro_id = ?');
    $stmt->execute([$meuId, $livroId]);
    if ((int) $stmt->fetchColumn() >= ANOTACOES_MAX_POR_LIVRO) {
        falhaAnotacao('Limite de ' . ANOTACOES_MAX_POR_LIVRO . ' anotações por livro atingido. Apague alguma para continuar.');
    }
    $pdo->prepare('INSERT INTO anotacoes (usuario_id, livro_id, pagina, tipo, cor, x, y, w, h, rects, trecho, comentario) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$meuId, $livroId, $pagina, $tipo, $cor, $x, $y, $w, $h, $rectsJson, $trecho, comentarioLimpo()]);
    $id = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM anotacoes WHERE id = ?');
    $stmt->execute([$id]);
    responderJson(['success' => true, 'anotacao' => anotacaoParaJson($stmt->fetch())]);
}

// editar / excluir: só a anotação do próprio usuário
$id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT);
$stmt = $pdo->prepare('SELECT * FROM anotacoes WHERE id = ? AND usuario_id = ?');
$stmt->execute([$id ?: 0, $meuId]);
$atual = $stmt->fetch();
if (!$atual) {
    falhaAnotacao('Anotação não encontrada.', 404);
}

if ($acao === 'editar') {
    $cor = corValida();
    $pdo->prepare('UPDATE anotacoes SET cor = ?, comentario = ? WHERE id = ?')->execute([$cor, comentarioLimpo(), $id]);
    $stmt = $pdo->prepare('SELECT * FROM anotacoes WHERE id = ?');
    $stmt->execute([$id]);
    responderJson(['success' => true, 'anotacao' => anotacaoParaJson($stmt->fetch())]);
}

if ($acao === 'excluir') {
    $pdo->prepare('DELETE FROM anotacoes WHERE id = ?')->execute([$id]);
    responderJson(['success' => true, 'id' => (int) $id]);
}

falhaAnotacao('Ação desconhecida.', 400);
