<?php
if (!defined('ACESSO_PERMITIDO')) {
    define('ACESSO_PERMITIDO', true);
}

/** Escapa uma string para saída segura em HTML. Uso obrigatório em todo dado vindo do banco/usuário. */
function e(?string $valor): string
{
    return htmlspecialchars($valor ?? '', ENT_QUOTES, 'UTF-8');
}

/** Responde a requisição atual em JSON e encerra a execução. */
function responderJson(array $dados, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Verifica se a requisição atual espera uma resposta JSON (fetch/AJAX). */
function isRequisicaoJson(): bool
{
    $xrw = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return strtolower($xrw) === 'xmlhttprequest' || str_contains($accept, 'application/json');
}

/** Valida a política de senha forte usada em todo o sistema (RN-07). */
function validarSenhaForte(string $senha): bool
{
    return (bool) preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/', $senha);
}

/** Constrói caminho relativo à raiz do projeto a partir do local do script atual. */
function caminhoRaiz(): string
{
    return defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '';
}

/**
 * Traduz um alvo interno na URL amigável correspondente:
 *
 *   index.php              -> ''  (a raiz da aplicação)
 *   login.php?erro=1       -> login?erro=1
 *   redefinir_senha.php    -> redefinir-senha
 *   views/leitor.php?id=7  -> leitor?id=7
 *
 * As páginas continuam sendo arquivos .php no disco — quem traduz a URL limpa de
 * volta para o arquivo é o .htaccess. Concentrar a tradução aqui é o que permite
 * o resto do código continuar se referindo às páginas pelo nome do arquivo.
 *
 * Endpoints de api/ ficam intactos: são alvos de formulário e de fetch, não
 * aparecem na barra de endereços.
 */
function rotaAmigavel(string $destino): string
{
    [$caminho, $consulta] = array_pad(explode('?', $destino, 2), 2, null);
    $consulta = $consulta === null ? '' : '?' . $consulta;

    $rotasEspeciais = [
        'index.php'           => '',
        'redefinir_senha.php' => 'redefinir-senha',
        'views/leitor.php'    => 'leitor',
    ];

    if (array_key_exists($caminho, $rotasEspeciais)) {
        return $rotasEspeciais[$caminho] . $consulta;
    }

    if (str_ends_with($caminho, '.php') && !str_starts_with($caminho, 'api/')) {
        return substr($caminho, 0, -4) . $consulta;
    }

    return $destino;
}

/** URL da raiz da aplicação. Nunca vazia: './' aponta para o próprio diretório. */
function urlBase(): string
{
    return caminhoRaiz() !== '' ? caminhoRaiz() : './';
}

/** Monta a URL pública de uma página a partir do nome do arquivo dela. */
function url(string $destino = ''): string
{
    $rota = rotaAmigavel($destino);
    return $rota === '' ? urlBase() : caminhoRaiz() . $rota;
}

function redirecionar(string $destinoRelativoARaiz): void
{
    header('Location: ' . url($destinoRelativoARaiz));
    exit;
}

/**
 * URL de um asset estático (CSS/JS) com cache-busting automático: o timestamp de última
 * modificação do arquivo vira query string, então o navegador busca uma versão nova sempre
 * que o arquivo muda — sem isso, edições em assets/js/*.js podem ficar presas no cache do
 * navegador e o usuário continua vendo o comportamento antigo mesmo após um deploy/correção.
 */
function asset(string $caminhoRelativoAoProjeto): string
{
    $absoluto = __DIR__ . '/../' . $caminhoRelativoAoProjeto;
    $versao = is_file($absoluto) ? filemtime($absoluto) : time();
    return caminhoRaiz() . $caminhoRelativoAoProjeto . '?v=' . $versao;
}

/** Bloqueia a requisição se não houver sessão válida. */
function require_login(bool $json = false): void
{
    if (!isset($_SESSION['usuario_id'])) {
        if ($json) {
            responderJson(['success' => false, 'error' => 'Sessão expirada. Faça login novamente.'], 401);
        }
        redirecionar('login.php');
    }
}

/** Bloqueia a requisição se o perfil da sessão não estiver na lista permitida. */
function require_perfil(array $perfis, bool $json = false): void
{
    require_login($json);
    if (!in_array($_SESSION['usuario_perfil'] ?? '', $perfis, true)) {
        if ($json) {
            responderJson(['success' => false, 'error' => 'Acesso negado para o seu perfil.'], 403);
        }
        redirecionar('index.php');
    }
}

/** Exige que a requisição atual seja um POST válido, senão bloqueia. */
function require_post(bool $json = false): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        if ($json) {
            responderJson(['success' => false, 'error' => 'Método não permitido.'], 405);
        }
        redirecionar('index.php');
    }
}

/** Gera (ou reaproveita) o token CSRF da sessão atual. */
function csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/** Imprime um campo hidden pronto para uso em formulários. */
function csrf_field(): string
{
    return '<input type="hidden" name="csrf_token" value="' . e(csrf_token()) . '">';
}

/** Valida o token CSRF enviado via POST (campo) ou header (fetch/AJAX). Encerra a execução se inválido. */
function csrf_verify(bool $json = false): void
{
    $enviado = $_POST['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (empty($_SESSION['csrf_token']) || !is_string($enviado) || !hash_equals($_SESSION['csrf_token'], $enviado)) {
        // Usamos 400 em vez do não-padronizado 419: alguns servidores/SAPIs não reconhecem
        // esse código e reescrevem a linha de status como 500, confundindo quem depura.
        if ($json) {
            responderJson(['success' => false, 'error' => 'Sessão de segurança inválida. Atualize a página e tente novamente.'], 400);
        }
        http_response_code(400);
        die('Token de segurança inválido ou expirado. Volte e tente novamente.');
    }
}

/**
 * Verifica se o identificador (e-mail ou IP) já atingiu o limite de tentativas de login.
 * Retorna true se estiver bloqueado.
 */
function loginBloqueado(PDO $pdo, string $email, string $ip): bool
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM tentativas_login
         WHERE (email = ? OR ip = ?) AND sucesso = 0 AND criado_em > (NOW() - INTERVAL " . LOGIN_BLOQUEIO_SEGUNDOS . " SECOND)"
    );
    $stmt->execute([$email, $ip]);
    return (int) $stmt->fetchColumn() >= LOGIN_MAX_TENTATIVAS;
}

function registrarTentativaLogin(PDO $pdo, string $email, string $ip, bool $sucesso): void
{
    $stmt = $pdo->prepare("INSERT INTO tentativas_login (email, ip, sucesso) VALUES (?, ?, ?)");
    $stmt->execute([$email, $ip, $sucesso ? 1 : 0]);

    if ($sucesso) {
        // Limpa o histórico de falhas deste e-mail/IP após um login bem-sucedido.
        $pdo->prepare("DELETE FROM tentativas_login WHERE email = ? OR ip = ?")->execute([$email, $ip]);
    }
}

function ipCliente(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Valida que o conteúdo enviado é de fato um PDF (assinatura + MIME), não apenas a extensão.
 */
function arquivoEhPdfValido(string $caminhoTemporario): bool
{
    if (!is_uploaded_file($caminhoTemporario)) {
        return false;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $caminhoTemporario);
    finfo_close($finfo);

    if ($mime !== 'application/pdf') {
        return false;
    }

    $handle = fopen($caminhoTemporario, 'rb');
    $assinatura = fread($handle, 5);
    fclose($handle);

    return $assinatura === '%PDF-';
}

/**
 * Valida que os bytes recebidos (upload ou base64) são de fato uma imagem JPG/PNG suportada.
 */
function conteudoEhImagemValida(string $conteudo, array $tiposPermitidos = ['image/png', 'image/jpeg']): bool
{
    $info = @getimagesizefromstring($conteudo);
    return $info !== false && in_array($info['mime'], $tiposPermitidos, true);
}

function imagemUploadEhValida(string $caminhoTemporario, array $extensoesPermitidas): bool
{
    if (!is_uploaded_file($caminhoTemporario)) {
        return false;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $caminhoTemporario);
    finfo_close($finfo);

    $mapaMime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png'];
    $mimesPermitidos = array_map(fn($ext) => $mapaMime[$ext] ?? null, $extensoesPermitidas);

    if (!in_array($mime, $mimesPermitidos, true)) {
        return false;
    }

    return @getimagesize($caminhoTemporario) !== false;
}
