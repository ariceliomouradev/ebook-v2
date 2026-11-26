<?php
/**
 * API REST de livros (v1) — funções de apoio do front controller api/v1/index.php.
 *
 * Autenticação: Bearer token (Authorization: Bearer <access_token>), nunca cookie de sessão (a API não usa sessão
 * nem CSRF: o token só é enviado de propósito pelo aplicativo). Os tokens ficam em `api_tokens` só como hash
 * (sha256); apagar a linha revoga na hora. As regras de acesso aos livros são as MESMAS do sistema web
 * (condicaoVisibilidade): quem não vê um livro no site não o vê na API.
 */
require_once __DIR__ . '/repositorios.php';
require_once __DIR__ . '/categorias.php';
require_once __DIR__ . '/limites.php';

const API_VERSAO = '1';
const API_ACCESS_SEGUNDOS = 3600;              // validade do token de acesso (1 h)
const API_REFRESH_SEGUNDOS = 30 * 86400;       // validade do token de renovação (30 dias)
const API_MAX_SESSOES_POR_USUARIO = 10;        // aplicativos/aparelhos logados ao mesmo tempo (os mais antigos saem)
const API_URL_ASSINADA_SEGUNDOS = 3600;        // validade dos links de capa/arquivo que vão dentro do JSON
const API_POR_PAGINA_PADRAO = 20;
const API_POR_PAGINA_MAX = 50;

/* ------------------------------- respostas ------------------------------- */

function apiResponder(array $dados, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

/** Erro padronizado: {"erro":{"codigo":"…","mensagem":"…"}} */
function apiErro(int $status, string $codigo, string $mensagem, array $extra = []): never
{
    if ($status === 401) {
        header('WWW-Authenticate: Bearer realm="meus-livros-api"');
    }
    if (requisicaoDeNavegador()) {
        paginaErroAmigavel($status); // pessoa no navegador: página amigável, nunca JSON técnico
    }
    apiResponder(['erro' => ['codigo' => $codigo, 'mensagem' => $mensagem] + $extra], $status);
}

/** Corpo da requisição como array: JSON (Content-Type application/json) ou formulário. */
function apiCorpo(): array
{
    $tipo = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($tipo, 'application/json')) {
        $bruto = file_get_contents('php://input', false, null, 0, 65536);
        $dados = json_decode((string) $bruto, true);
        if (!is_array($dados)) {
            apiErro(400, 'json_invalido', 'O corpo da requisição não é um JSON válido.');
        }
        return $dados;
    }
    return $_POST;
}

/** URL pública base (APP_URL do .env; sem ele, a base relativa à raiz do site). */
function apiBase(): string
{
    return urlBaseDoSistema() ?? '';
}

/* ------------------------------- CORS ------------------------------- */

/** CORS só para as origens listadas em API_CORS_ORIGINS (.env, separadas por vírgula); app nativo e Postman não precisam. */
function apiCors(): void
{
    $origem = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origem === '') {
        return;
    }
    $permitidas = array_filter(array_map('trim', explode(',', (string) env('API_CORS_ORIGINS', ''))));
    if (in_array('*', $permitidas, true) || in_array($origem, $permitidas, true)) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $permitidas, true) ? '*' : $origem));
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, Range');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, ETag');
        header('Access-Control-Max-Age: 600');
    }
}

/* ------------------------------- tokens ------------------------------- */

function apiGerarToken(): string
{
    return 'ml_' . bin2hex(random_bytes(24));
}

function apiHash(string $token): string
{
    return hash('sha256', $token);
}

/** Cria (ou renova, quando $linhaId vem) a sessão de API e devolve o corpo da resposta de /auth/token. */
function apiEmitirTokens(PDO $pdo, array $usuario, string $aparelho, ?int $linhaId = null): array
{
    $access = apiGerarToken();
    $refresh = apiGerarToken();
    if ($linhaId !== null) {
        $pdo->prepare('UPDATE api_tokens SET access_hash = ?, refresh_hash = ?, access_expira = DATE_ADD(NOW(), INTERVAL ' . API_ACCESS_SEGUNDOS . ' SECOND), refresh_expira = DATE_ADD(NOW(), INTERVAL ' . API_REFRESH_SEGUNDOS . ' SECOND), ultimo_uso = NOW() WHERE id = ?')
            ->execute([apiHash($access), apiHash($refresh), $linhaId]);
    } else {
        // mantém no máximo API_MAX_SESSOES_POR_USUARIO aparelhos (o mais antigo sai)
        $sobra = $pdo->prepare('SELECT id FROM api_tokens WHERE usuario_id = ? ORDER BY criado_em DESC, id DESC LIMIT 100 OFFSET ' . (API_MAX_SESSOES_POR_USUARIO - 1));
        $sobra->execute([(int) $usuario['id']]);
        foreach ($sobra->fetchAll(PDO::FETCH_COLUMN) as $velho) {
            $pdo->prepare('DELETE FROM api_tokens WHERE id = ?')->execute([(int) $velho]);
        }
        $pdo->prepare('INSERT INTO api_tokens (usuario_id, access_hash, refresh_hash, access_expira, refresh_expira, aparelho, ip, ultimo_uso) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . API_ACCESS_SEGUNDOS . ' SECOND), DATE_ADD(NOW(), INTERVAL ' . API_REFRESH_SEGUNDOS . ' SECOND), ?, ?, NOW())')
            ->execute([(int) $usuario['id'], apiHash($access), apiHash($refresh), mb_substr($aparelho, 0, 80) ?: null, ipCliente()]);
    }
    return [
        'tipo_token'           => 'Bearer',
        'access_token'         => $access,
        'expira_em'            => API_ACCESS_SEGUNDOS,
        'refresh_token'        => $refresh,
        'refresh_expira_em'    => API_REFRESH_SEGUNDOS,
        'usuario'              => apiUsuarioPublico($usuario),
    ];
}

function apiUsuarioPublico(array $u): array
{
    return [
        'id'    => (int) $u['id'],
        'nome'  => (string) $u['nome'],
        'email' => (string) $u['email'],
        'plano' => rotuloPerfil((string) $u['perfil']),
        'perfil' => (string) $u['perfil'], // interno: leitor (Grátis), contribuidor (Pro), admin
    ];
}

function apiCarregarUsuario(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT id, nome, email, perfil, titular_id FROM usuarios WHERE id = ?');
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    return $u ?: null;
}

/**
 * Confere a conta (bloqueio, e-mail, senha provisória, assinatura vencida) e responde o erro correspondente.
 * Usada no login, na renovação e em toda chamada autenticada: o bloqueio do administrador vale na hora.
 */
function apiConferirConta(PDO $pdo, array $u): void
{
    if (contaBloqueada($pdo, (int) $u['id'])) {
        revogarTokensDaApi($pdo, (int) $u['id']);
        apiErro(403, 'conta_bloqueada', 'Seu acesso está bloqueado. Fale com o suporte.');
    }
    if (emailPendenteDeConfirmacao($pdo, (int) $u['id'])) {
        apiErro(403, 'email_nao_confirmado', 'Confirme o seu e-mail para usar a conta.');
    }
    if (precisaTrocarSenha($pdo, (int) $u['id'])) {
        apiErro(403, 'troca_de_senha_necessaria', 'Defina a sua nova senha no site antes de usar a API.');
    }
    if (assinaturaExigida() && ($u['perfil'] ?? '') !== 'admin' && situacaoAcesso($pdo, (int) $u['id'])['vencido']) {
        apiErro(402, 'assinatura_vencida', 'O seu período de teste ou plano terminou. Fale com o suporte para continuar.');
    }
}

function apiTokenDoCabecalho(): string
{
    $h = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($h === '' && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strtolower($k) === 'authorization') {
                $h = (string) $v;
            }
        }
    }
    return preg_match('/^Bearer\s+(ml_[a-f0-9]{48})$/i', trim($h), $m) ? $m[1] : '';
}

/**
 * Autentica pelo Bearer token. Devolve ['usuario' => linha, 'token_id' => id]. Sem token válido: 401.
 */
function apiAutenticar(PDO $pdo): array
{
    $token = apiTokenDoCabecalho();
    if ($token === '') {
        apiErro(401, 'nao_autorizado', 'Envie o cabeçalho Authorization: Bearer <access_token>. Para obter o token: POST /api/v1/auth/token.');
    }
    $stmt = $pdo->prepare('SELECT id, usuario_id, ultimo_uso FROM api_tokens WHERE access_hash = ? AND access_expira > NOW()');
    $stmt->execute([apiHash($token)]);
    $linha = $stmt->fetch();
    if (!$linha) {
        apiErro(401, 'token_invalido_ou_expirado', 'Token inválido ou expirado. Renove em POST /api/v1/auth/refresh ou entre de novo.');
    }
    $u = apiCarregarUsuario($pdo, (int) $linha['usuario_id']);
    if (!$u) {
        apiErro(401, 'token_invalido_ou_expirado', 'Token inválido ou expirado.');
    }
    apiConferirConta($pdo, $u);
    if ($linha['ultimo_uso'] === null || strtotime((string) $linha['ultimo_uso']) < time() - 60) {
        $pdo->prepare('UPDATE api_tokens SET ultimo_uso = NOW() WHERE id = ?')->execute([(int) $linha['id']]);
    }
    return ['usuario' => $u, 'token_id' => (int) $linha['id']];
}

/* ------------------------------- links assinados (capa e arquivo) ------------------------------- */

/** Segredo das assinaturas: API_SEGREDO do .env (recomendado, 32+ caracteres) ou um derivado da configuração. */
function apiSegredo(): string
{
    $s = (string) env('API_SEGREDO', '');
    return strlen($s) >= 32 ? $s : hash('sha256', 'ml-api|' . env('DB_PASS', '') . '|' . env('DB_NAME', '') . '|' . env('APP_URL', ''));
}

function apiAssinatura(string $tipo, int $livroId, int $usuarioId, int $expira): string
{
    return hash_hmac('sha256', "$tipo|$livroId|$usuarioId|$expira", apiSegredo());
}

/** Link direto (sem cabeçalho) para a capa/arquivo, amarrado a este usuário e livro, válido por 1 h. */
function apiUrlAssinada(string $tipo, int $livroId, int $usuarioId): string
{
    $exp = time() + API_URL_ASSINADA_SEGUNDOS;
    return apiBase() . "/api/v1/livros/$livroId/$tipo?u=$usuarioId&exp=$exp&sig=" . apiAssinatura($tipo, $livroId, $usuarioId, $exp);
}

/** Usuário dono de um link assinado válido (e ainda com conta em dia), ou null. */
function apiUsuarioPorAssinatura(PDO $pdo, string $tipo, int $livroId): ?array
{
    $uid = (int) ($_GET['u'] ?? 0);
    $exp = (int) ($_GET['exp'] ?? 0);
    $sig = (string) ($_GET['sig'] ?? '');
    if ($uid <= 0 || $exp < time() || !preg_match('/^[a-f0-9]{64}$/', $sig) || !hash_equals(apiAssinatura($tipo, $livroId, $uid, $exp), $sig)) {
        return null;
    }
    $u = apiCarregarUsuario($pdo, $uid);
    if ($u) {
        apiConferirConta($pdo, $u);
    }
    return $u;
}

/* ------------------------------- livros ------------------------------- */

const API_ORDENS = [
    'recentes' => '(l.data_publicacao IS NULL) ASC, l.data_publicacao DESC, l.id DESC',
    'antigos'  => '(l.data_publicacao IS NULL) ASC, l.data_publicacao ASC, l.id ASC',
    'az'       => 'l.titulo ASC, l.id ASC',
    'za'       => 'l.titulo DESC, l.id DESC',
];

function apiLivroParaJson(array $r, array $u): array
{
    $id = (int) $r['id'];
    $arquivo = __DIR__ . '/../uploads/' . $r['nome_arquivo'];
    $ehEpub = ($r['formato'] ?? 'pdf') === 'epub';
    $progresso = null;
    if ($r['le_porcentagem'] !== null) {
        $progresso = [
            'porcentagem' => (int) $r['le_porcentagem'],
            'pagina'      => (int) $r['le_progresso'],
            'total'       => (int) $r['le_total'],
            'posicao'     => $r['le_posicao'] !== null && $r['le_posicao'] !== '' ? (string) $r['le_posicao'] : null,
        ];
    }
    return [
        'id'              => $id,
        'titulo'          => (string) $r['titulo'],
        'autor'           => (string) ($r['autor'] ?? ''),
        'sinopse'         => ($r['sinopse'] ?? '') !== '' ? (string) $r['sinopse'] : null,
        'data_publicacao' => !empty($r['data_publicacao']) ? (string) $r['data_publicacao'] : null,
        'formato'         => $ehEpub ? 'epub' : 'pdf',
        'categoria'       => $r['cat_slug'] ? ['slug' => (string) $r['cat_slug'], 'nome' => (string) $r['cat_nome']] : null,
        'enviado_em'      => $r['data_upload'] ? date('c', strtotime((string) $r['data_upload'])) : null,
        'capa_url'        => !empty($r['capa_arquivo']) ? apiUrlAssinada('capa', $id, (int) $u['id']) : null,
        'arquivo_url'     => apiUrlAssinada('arquivo', $id, (int) $u['id']),
        'arquivo_tipo'    => $ehEpub ? 'application/epub+zip' : 'application/pdf',
        'arquivo_tamanho' => is_file($arquivo) ? filesize($arquivo) : null,
        'progresso'       => $progresso,
        'favorito'        => (bool) $r['fav'],
    ];
}

/**
 * Consulta de livros da API (mesma visibilidade do site). $filtros: busca, autor, categoria, formato, favoritos,
 * ordem, pagina, por_pagina, id. Devolve [linhas, total].
 */
function apiConsultarLivros(PDO $pdo, array $u, array $filtros): array
{
    $perfil = (string) $u['perfil'];
    $uid = (int) $u['id'];
    $cond = [];
    $par = [];
    if (!empty($filtros['id'])) {
        $cond[] = 'l.id = :id';
        $par[':id'] = (int) $filtros['id'];
    }
    if (($filtros['busca'] ?? '') !== '') {
        $cond[] = '(l.titulo LIKE :busca OR l.autor LIKE :busca OR l.sinopse LIKE :busca)';
        $par[':busca'] = '%' . escaparLike((string) $filtros['busca']) . '%';
    }
    if (($filtros['autor'] ?? '') !== '') {
        $cond[] = 'l.autor LIKE :autor';
        $par[':autor'] = '%' . escaparLike((string) $filtros['autor']) . '%';
    }
    if (($filtros['categoria'] ?? '') !== '') {
        $cond[] = 'l.categoria_id = (SELECT id FROM categorias WHERE slug = :cat)';
        $par[':cat'] = (string) $filtros['categoria'];
    }
    if (in_array($filtros['formato'] ?? '', ['pdf', 'epub'], true)) {
        $cond[] = 'l.formato = :fmt';
        $par[':fmt'] = $filtros['formato'];
    }
    if (!empty($filtros['favoritos'])) {
        $cond[] = 'l.id IN (SELECT livro_id FROM favoritos WHERE usuario_id = :fav_u)';
        $par[':fav_u'] = $uid;
    }
    [$vis, $parVis] = condicaoVisibilidade($perfil, $uid, 'l.', (int) ($u['titular_id'] ?? 0));
    if ($vis !== '') {
        $cond[] = $vis;
        $par += $parVis;
    }
    if ($perfil === 'admin') {
        $cond[] = "l.publicacao = 'aprovado'"; // o acervo do administrador é o aprovado (pendentes ficam em Aprovações)
    }
    $onde = $cond ? 'WHERE ' . implode(' AND ', $cond) : '';

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM livros l $onde");
    $stmt->execute($par);
    $total = (int) $stmt->fetchColumn();

    $porPagina = max(1, min(API_POR_PAGINA_MAX, (int) ($filtros['por_pagina'] ?? API_POR_PAGINA_PADRAO)));
    $pagina = max(1, (int) ($filtros['pagina'] ?? 1));
    $ordem = API_ORDENS[$filtros['ordem'] ?? 'recentes'] ?? API_ORDENS['recentes'];

    $sql = "SELECT l.id, l.titulo, l.autor, l.sinopse, l.data_publicacao, l.formato, l.nome_arquivo, l.capa_arquivo, l.data_upload,
                   c.slug AS cat_slug, c.nome AS cat_nome,
                   le.porcentagem AS le_porcentagem, le.progresso AS le_progresso, le.total_paginas AS le_total, le.posicao AS le_posicao,
                   EXISTS (SELECT 1 FROM favoritos f WHERE f.usuario_id = :u_fav AND f.livro_id = l.id) AS fav
              FROM livros l
              LEFT JOIN categorias c ON c.id = l.categoria_id
              LEFT JOIN leituras le ON le.livro_id = l.id AND le.usuario_id = :u_le
              $onde ORDER BY $ordem LIMIT :lim OFFSET :off";
    $stmt = $pdo->prepare($sql);
    foreach ($par + [':u_fav' => $uid, ':u_le' => $uid] as $k => $v) {
        $stmt->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
    }
    $stmt->bindValue(':lim', $porPagina, PDO::PARAM_INT);
    $stmt->bindValue(':off', ($pagina - 1) * $porPagina, PDO::PARAM_INT);
    $stmt->execute();
    return [$stmt->fetchAll(), $total, $pagina, $porPagina];
}

/* ------------------------------- arquivos ------------------------------- */

/** Nome de arquivo seguro para Content-Disposition (ASCII simplificado + UTF-8 completo). */
function apiNomeDeDownload(string $titulo, string $extensao): string
{
    $base = $titulo . '.' . $extensao;
    $ascii = str_replace(['"', '\\', '/'], '', preg_replace('/[^\x20-\x7E]/', '_', $base));
    return sprintf('filename="%s"; filename*=UTF-8\'\'%s', $ascii, rawurlencode($base));
}

/** Envia um arquivo com suporte a Range (retomar download, leitor sob demanda). */
function apiEnviarArquivo(string $caminho, string $mime, string $disposicao, ?string $etag = null): never
{
    $tamanho = filesize($caminho);
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disposicao);
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('Accept-Ranges: bytes');
    if ($etag !== null) {
        header('ETag: "' . $etag . '"');
    }
    $inicio = 0;
    $fim = $tamanho - 1;
    $parcial = false;
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', (string) $_SERVER['HTTP_RANGE'], $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] !== '') {
            $inicio = (int) $m[1];
            $fim = $m[2] === '' ? $tamanho - 1 : min((int) $m[2], $tamanho - 1);
        } else {
            $inicio = max(0, $tamanho - (int) $m[2]);
        }
        if ($inicio > $fim || $inicio >= $tamanho) {
            header('Content-Range: bytes */' . $tamanho);
            http_response_code(416);
            exit;
        }
        $parcial = true;
    }
    $comprimento = $fim - $inicio + 1;
    header('Content-Length: ' . $comprimento);
    if ($parcial) {
        http_response_code(206);
        header("Content-Range: bytes $inicio-$fim/$tamanho");
    }
    $h = fopen($caminho, 'rb');
    fseek($h, $inicio);
    $resta = $comprimento;
    while ($resta > 0 && !feof($h)) {
        $parte = fread($h, min(8192, $resta));
        if ($parte === false || $parte === '') {
            break;
        }
        echo $parte;
        $resta -= strlen($parte);
    }
    fclose($h);
    exit;
}
