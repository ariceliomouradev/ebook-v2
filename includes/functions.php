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

/**
 * Janela de números da paginação: sempre a primeira, a última e as vizinhas da atual, com
 * `null` onde há um salto (reticências). Ex.: página 5 de 70 -> [1, null, 4, 5, 6, null, 70].
 * Até 7 páginas mostra todas. Quem chama decide como desenhar o `null`.
 *
 * @return array<int|null>
 */
function paginasVisiveis(int $atual, int $total): array
{
    if ($total <= 7) {
        return $total >= 1 ? range(1, $total) : [];
    }

    $mostrar = [1, $total, $atual - 1, $atual, $atual + 1];
    if ($atual <= 3) {
        $mostrar = array_merge($mostrar, [2, 3, 4]);              // início: evita "1 … 3 4" truncado
    }
    if ($atual >= $total - 2) {
        $mostrar = array_merge($mostrar, [$total - 3, $total - 2, $total - 1]);
    }
    $mostrar = array_values(array_unique(array_filter($mostrar, fn($p) => $p >= 1 && $p <= $total)));
    sort($mostrar);

    $saida = [];
    $anterior = 0;
    foreach ($mostrar as $p) {
        if ($p - $anterior === 2) {
            $saida[] = $anterior + 1;   // um salto de uma só página: mostra a página, não "…"
        } elseif ($p - $anterior > 2) {
            $saida[] = null;
        }
        $saida[] = $p;
        $anterior = $p;
    }
    return $saida;
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
    // Três contadores independentes (só falhas reais; as marcas "__cadastro__"/"__reset__" não entram):
    //  1) o par e-mail + IP: quem erra a senha da própria conta trava só a si mesmo, e um terceiro, de outro IP,
    //     não consegue trancar o dono da conta (antes qualquer pessoa travava o login de qualquer e-mail);
    //  2) o e-mail vindo de qualquer IP: freia ataque distribuído (limite bem mais alto);
    //  3) o IP contra qualquer e-mail: freia quem testa uma senha em muitos usuários.
    $janela = "criado_em > (NOW() - INTERVAL " . LOGIN_BLOQUEIO_SEGUNDOS . " SECOND)";
    $stmt = $pdo->prepare(
        "SELECT SUM(email = ? AND ip = ?) AS par, SUM(email = ?) AS por_email, SUM(ip = ?) AS por_ip
         FROM tentativas_login WHERE sucesso = 0 AND email NOT LIKE '\\_\\_%' AND $janela"
    );
    $stmt->execute([$email, $ip, $email, $ip]);
    $c = $stmt->fetch() ?: [];
    return (int) ($c['par'] ?? 0) >= LOGIN_MAX_TENTATIVAS
        || (int) ($c['por_email'] ?? 0) >= LOGIN_MAX_POR_EMAIL
        || (int) ($c['por_ip'] ?? 0) >= LOGIN_MAX_POR_IP;
}

function registrarTentativaLogin(PDO $pdo, string $email, string $ip, bool $sucesso): void
{
    $stmt = $pdo->prepare("INSERT INTO tentativas_login (email, ip, sucesso) VALUES (?, ?, ?)");
    $stmt->execute([$email, $ip, $sucesso ? 1 : 0]);

    if ($sucesso) {
        // Limpa só as falhas DESTE e-mail vindas DESTE IP. Apagar também as do IP (ou as do e-mail) deixava
        // quem tem uma conta própria zerar o contador a cada login e testar senhas sem limite.
        $pdo->prepare("DELETE FROM tentativas_login WHERE email = ? AND ip = ?")->execute([$email, $ip]);
    }
}

/**
 * URL base pública do sistema (ex.: https://meuslivros.ariceliomoura.com.br), usada em links enviados por e-mail.
 * Vem do APP_URL do .env e NUNCA do cabeçalho Host da requisição: o Host é escolhido por quem faz o pedido
 * (envenenamento do link de redefinição de senha). Sem APP_URL só vale em localhost; senão devolve null.
 */
function urlBaseDoSistema(): ?string
{
    $url = trim((string) env('APP_URL', ''));
    if ($url !== '' && preg_match('#^https?://[A-Za-z0-9.-]+(:\d+)?(/[A-Za-z0-9._~/-]*)?$#', $url)) {
        return rtrim($url, '/');
    }
    $host = strtolower(preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
    if ($host === 'localhost' || $host === '127.0.0.1') {
        $https = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';
        return ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['PHP_SELF'], 2), '/\\');
    }
    return null;
}

/** Marca de pedido de redefinição na tabela tentativas_login (sucesso = 0; não mistura com falhas de login). */
function resetMarcaIp(string $ip): string { return '__reset__:' . substr(sha1($ip), 0, 16); }
function resetMarcaEmail(string $email): string { return '__resetem__:' . substr(sha1(strtolower($email)), 0, 16); }

function resetBloqueado(PDO $pdo, string $ip, string $email): bool
{
    $stmt = $pdo->prepare("SELECT SUM(email = ?) AS por_ip, SUM(email = ?) AS por_email FROM tentativas_login WHERE sucesso = 0 AND criado_em > (NOW() - INTERVAL 1 HOUR) AND (email = ? OR email = ?)");
    $stmt->execute([resetMarcaIp($ip), resetMarcaEmail($email), resetMarcaIp($ip), resetMarcaEmail($email)]);
    $c = $stmt->fetch() ?: [];
    return (int) ($c['por_ip'] ?? 0) >= RESET_MAX_POR_IP_HORA || (int) ($c['por_email'] ?? 0) >= RESET_MAX_POR_EMAIL_HORA;
}

function registrarPedidoReset(PDO $pdo, string $ip, string $email): void
{
    $ins = $pdo->prepare('INSERT INTO tentativas_login (email, ip, sucesso) VALUES (?, ?, 0)');
    $ins->execute([resetMarcaIp($ip), $ip]);
    $ins->execute([resetMarcaEmail($email), $ip]);
}

/** Gasta o tempo de um password_verify de verdade (bcrypt custo 10) quando o e-mail não existe: o tempo não revela quem tem conta. */
function gastarTempoDeSenha(string $senha): void
{
    password_verify($senha, '$2y$10$15cHAc6.oNxp0SHRvadsXuR2rSUfr7KhUrp2t5QFEwbzTEDWEzgma');
}

/** Derruba os acessos abertos de um usuário (depois de redefinir/trocar a senha). $manter = sessão que continua. */
function encerrarOutrosAcessos(PDO $pdo, int $usuarioId, ?string $manter = null): void
{
    revogarTokensDaApi($pdo, $usuarioId); // trocar/redefinir a senha também derruba os aplicativos que usam a API
    try {
        if ($manter !== null) {
            $pdo->prepare('DELETE FROM sessoes_ativas WHERE usuario_id = ? AND session_id <> ?')->execute([$usuarioId, $manter]);
        } else {
            $pdo->prepare('DELETE FROM sessoes_ativas WHERE usuario_id = ?')->execute([$usuarioId]);
        }
    } catch (PDOException $e) {
        // banco sem a migração v1.5
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

    // Sem finfo_close(): desde o PHP 8.1 o finfo é um objeto liberado automaticamente
    // e a função está obsoleta no 8.5 (o aviso "Deprecated" corrompia as respostas JSON
    // com APP_DEBUG=true).
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $caminhoTemporario);

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

    $mapaMime =['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
    $mimesPermitidos = array_map(fn($ext) => $mapaMime[$ext] ?? null, $extensoesPermitidas);

    if (!in_array($mime, $mimesPermitidos, true)) {
        return false;
    }

    return @getimagesize($caminhoTemporario) !== false;
}
