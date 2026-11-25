<?php
/**
 * API REST de livros — versão 1 (front controller). Documentação: docs/API.md e postman/.
 *
 *   GET  /api/v1                       informações e lista de rotas
 *   GET  /api/v1/status                saúde do serviço
 *   POST /api/v1/auth/token            e-mail + senha  -> access_token (1 h) + refresh_token (30 dias)
 *   POST /api/v1/auth/refresh          refresh_token   -> novo par de tokens
 *   POST /api/v1/auth/logout           revoga o token atual (?todos=1 revoga todos os aparelhos)
 *   GET  /api/v1/me                    dados do usuário e do limite diário
 *   GET  /api/v1/categorias            categorias com a quantidade de livros visíveis
 *   GET  /api/v1/livros                lista paginada (busca, autor, categoria, formato, favoritos, ordem, pagina, por_pagina)
 *   GET  /api/v1/livros/{id}           um livro (título, autor, sinopse, capa, arquivo, progresso, favorito)
 *   GET  /api/v1/livros/{id}/capa      imagem da capa (PNG)
 *   GET  /api/v1/livros/{id}/arquivo   o PDF/EPUB (Range; ?download=1 força anexo)
 *   PUT|DELETE /api/v1/livros/{id}/favorito
 *   GET|PUT    /api/v1/livros/{id}/progresso
 */
define('API_SEM_SESSAO', true);
define('CAMINHO_RAIZ', '../../');
require_once __DIR__ . '/../../config/bootstrap.php';
require_once __DIR__ . '/../../includes/api.php';

header('X-API-Versao: ' . API_VERSAO);
apiCors();

$metodo = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($metodo === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$uri = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
$pos = strpos($uri, '/api/v1');
if ($pos === false) {
    // Chegou por /api ou por um caminho que não existe dentro de /api (ex.: /api/usuarios): responde em JSON, nunca em HTML.
    if (requisicaoDeNavegador()) {
        paginaErroAmigavel(404);
    }
    if (preg_match('#/api/?$#', $uri)) {
        apiResponder(['nome' => 'Meus Livros API', 'versao_atual' => 'v1']);
    }
    apiErro(404, 'rota_nao_encontrada', 'Rota não encontrada.');
}
$rota = '/' . trim(substr($uri, $pos + 7), '/');

/** Responde 405 com o cabeçalho Allow quando o caminho existe mas o método não. */
function apiMetodoNaoPermitido(array $permitidos): never
{
    header('Allow: ' . implode(', ', $permitidos));
    apiErro(405, 'metodo_nao_permitido', 'Método não permitido para esta rota. Permitidos: ' . implode(', ', $permitidos) . '.');
}

/** Vale só para quem tem o token do cabeçalho; capa/arquivo também aceitam o link assinado do JSON. */
function apiAutenticarComLinkAssinado(PDO $pdo, string $tipo, int $livroId): array
{
    if (apiTokenDoCabecalho() !== '') {
        return apiAutenticar($pdo)['usuario'];
    }
    $u = apiUsuarioPorAssinatura($pdo, $tipo, $livroId);
    if (!$u) {
        apiErro(401, 'nao_autorizado', 'Envie o Bearer token ou use o link assinado (capa_url/arquivo_url) retornado pela API, que vale por 1 hora.');
    }
    return $u;
}

try {
    /* ---------- públicas ---------- */
    if ($rota === '/') {
        if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
        if (requisicaoDeNavegador()) {
            paginaErroAmigavel(404);
        }
        if (apiTokenDoCabecalho() === '') {
            apiResponder(['nome' => 'Meus Livros API', 'versao' => API_VERSAO]); // sem credencial: só o nome (a lista de rotas exige token)
        }
        apiAutenticar($pdo);
        apiResponder([
            'nome'   => 'Meus Livros API',
            'versao' => API_VERSAO,
            'docs'   => 'docs/API.md',
            'rotas'  => [
                'POST /api/v1/auth/token', 'POST /api/v1/auth/refresh', 'POST /api/v1/auth/logout', 'GET /api/v1/me',
                'GET /api/v1/categorias', 'GET /api/v1/livros', 'GET /api/v1/livros/{id}', 'GET /api/v1/livros/{id}/capa',
                'GET /api/v1/livros/{id}/arquivo', 'PUT|DELETE /api/v1/livros/{id}/favorito', 'GET|PUT /api/v1/livros/{id}/progresso',
            ],
        ]);
    }
    if ($rota === '/status') {
        if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
        $pdo->query('SELECT 1');
        if (requisicaoDeNavegador()) {
            paginaErroAmigavel(404); // verificação de saúde é para sistemas de monitoramento, não para a tela de ninguém
        }
        apiResponder(['status' => 'ok']);
    }

    /* ---------- autenticação ---------- */
    if ($rota === '/auth/token') {
        if ($metodo !== 'POST') apiMetodoNaoPermitido(['POST']);
        $c = apiCorpo();
        $email = trim((string) ($c['email'] ?? ''));
        $senha = (string) ($c['senha'] ?? ($c['password'] ?? ''));
        if ($email === '' || $senha === '' || mb_strlen($email) > 100 || strlen($senha) > 200) {
            apiErro(422, 'dados_invalidos', 'Informe "email" e "senha".');
        }
        $ip = ipCliente();
        if (loginBloqueado($pdo, $email, $ip)) {
            header('Retry-After: ' . LOGIN_BLOQUEIO_SEGUNDOS);
            apiErro(429, 'muitas_tentativas', 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.', ['tentar_novamente_em' => LOGIN_BLOQUEIO_SEGUNDOS]);
        }
        $stmt = $pdo->prepare('SELECT id, nome, email, senha, perfil, titular_id FROM usuarios WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $u = $stmt->fetch();
        if (!$u) {
            gastarTempoDeSenha($senha); // o tempo de resposta não revela quais e-mails existem
        }
        if (!$u || !password_verify($senha, $u['senha'])) {
            registrarTentativaLogin($pdo, $email, $ip, false);
            apiErro(401, 'credenciais_invalidas', 'E-mail ou senha inválidos.');
        }
        registrarTentativaLogin($pdo, $email, $ip, true);
        apiConferirConta($pdo, $u);
        apiResponder(apiEmitirTokens($pdo, $u, (string) ($c['aparelho'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? ''))));
    }
    if ($rota === '/auth/refresh') {
        if ($metodo !== 'POST') apiMetodoNaoPermitido(['POST']);
        $c = apiCorpo();
        $rt = (string) ($c['refresh_token'] ?? '');
        if (!preg_match('/^ml_[a-f0-9]{48}$/', $rt)) {
            apiErro(422, 'dados_invalidos', 'Informe o "refresh_token".');
        }
        $stmt = $pdo->prepare('SELECT id, usuario_id, aparelho FROM api_tokens WHERE refresh_hash = ? AND refresh_expira > NOW()');
        $stmt->execute([apiHash($rt)]);
        $linha = $stmt->fetch();
        $u = $linha ? apiCarregarUsuario($pdo, (int) $linha['usuario_id']) : null;
        if (!$linha || !$u) {
            apiErro(401, 'refresh_invalido', 'Refresh token inválido ou expirado: entre de novo em POST /api/v1/auth/token.');
        }
        apiConferirConta($pdo, $u);
        apiResponder(apiEmitirTokens($pdo, $u, (string) ($linha['aparelho'] ?? ''), (int) $linha['id'])); // o refresh antigo deixa de valer
    }
    if ($rota === '/auth/logout') {
        if ($metodo !== 'POST') apiMetodoNaoPermitido(['POST']);
        $auth = apiAutenticar($pdo);
        if (($_GET['todos'] ?? '') === '1') {
            revogarTokensDaApi($pdo, (int) $auth['usuario']['id']);
        } else {
            $pdo->prepare('DELETE FROM api_tokens WHERE id = ?')->execute([$auth['token_id']]);
        }
        apiResponder(['ok' => true]);
    }

    /* ---------- dados do usuário ---------- */
    if ($rota === '/me') {
        if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
        $u = apiAutenticar($pdo)['usuario'];
        $abertos = 0;
        try {
            $n = $pdo->prepare('SELECT COUNT(*) FROM livros_abertos WHERE usuario_id = ? AND dia = CURDATE()');
            $n->execute([(int) $u['id']]);
            $abertos = (int) $n->fetchColumn();
        } catch (PDOException $e) {
            // banco sem a migração v1.19
        }
        $limite = limiteDiarioDeLivros((string) $u['perfil']);
        apiResponder([
            'usuario' => apiUsuarioPublico($u),
            'limite_diario_de_livros' => $limite > 0 ? $limite : null,
            'livros_abertos_hoje' => $abertos,
        ]);
    }

    /* ---------- categorias ---------- */
    if ($rota === '/categorias') {
        if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
        $u = apiAutenticar($pdo)['usuario'];
        $lista = listarCategoriasComContagem($pdo, false, (string) $u['perfil'], (int) $u['id'], (int) ($u['titular_id'] ?? 0));
        apiResponder(['dados' => array_map(static fn (array $c) => ['slug' => $c['slug'], 'nome' => $c['nome'], 'total' => (int) $c['total']], $lista)]);
    }

    /* ---------- livros ---------- */
    if ($rota === '/livros') {
        if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
        $u = apiAutenticar($pdo)['usuario'];
        $filtros = [
            'busca'      => mb_substr(trim((string) ($_GET['busca'] ?? '')), 0, 100),
            'autor'      => mb_substr(trim((string) ($_GET['autor'] ?? '')), 0, 100),
            'categoria'  => preg_replace('/[^a-z0-9-]/', '', (string) ($_GET['categoria'] ?? '')),
            'formato'    => (string) ($_GET['formato'] ?? ''),
            'favoritos'  => ($_GET['favoritos'] ?? '') === '1' || ($_GET['favoritos'] ?? '') === 'true',
            'ordem'      => (string) ($_GET['ordem'] ?? 'recentes'),
            'pagina'     => (int) ($_GET['pagina'] ?? 1),
            'por_pagina' => (int) ($_GET['por_pagina'] ?? API_POR_PAGINA_PADRAO),
        ];
        if ($filtros['formato'] !== '' && !in_array($filtros['formato'], ['pdf', 'epub'], true)) {
            apiErro(422, 'parametro_invalido', 'O parâmetro "formato" aceita pdf ou epub.');
        }
        if (!isset(API_ORDENS[$filtros['ordem']])) {
            apiErro(422, 'parametro_invalido', 'O parâmetro "ordem" aceita: ' . implode(', ', array_keys(API_ORDENS)) . '.');
        }
        [$linhas, $total, $pagina, $porPagina] = apiConsultarLivros($pdo, $u, $filtros);
        $totalPaginas = max(1, (int) ceil($total / $porPagina));
        $base = apiBase() . '/api/v1/livros';
        $consulta = static function (int $p) use ($filtros, $porPagina): string {
            $q = array_filter(['busca' => $filtros['busca'], 'autor' => $filtros['autor'], 'categoria' => $filtros['categoria'], 'formato' => $filtros['formato'], 'favoritos' => $filtros['favoritos'] ? '1' : '', 'ordem' => $filtros['ordem'] !== 'recentes' ? $filtros['ordem'] : '', 'por_pagina' => $porPagina !== API_POR_PAGINA_PADRAO ? $porPagina : '', 'pagina' => $p], static fn ($v) => $v !== '' && $v !== null);
            return '?' . http_build_query($q);
        };
        apiResponder([
            'dados' => array_map(static fn (array $r) => apiLivroParaJson($r, $u), $linhas),
            'meta'  => ['pagina' => $pagina, 'por_pagina' => $porPagina, 'total' => $total, 'total_paginas' => $totalPaginas],
            'links' => [
                'anterior' => $pagina > 1 ? $base . $consulta(min($pagina - 1, $totalPaginas)) : null,
                'proxima'  => $pagina < $totalPaginas ? $base . $consulta($pagina + 1) : null,
            ],
        ]);
    }

    if (preg_match('#^/livros/(\d{1,9})(?:/(capa|arquivo|favorito|progresso))?$#', $rota, $m)) {
        $livroId = (int) $m[1];
        $recurso = $m[2] ?? '';

        if ($recurso === '') {
            if ($metodo !== 'GET') apiMetodoNaoPermitido(['GET']);
            $u = apiAutenticar($pdo)['usuario'];
            [$linhas] = apiConsultarLivros($pdo, $u, ['id' => $livroId]);
            if (!$linhas) {
                apiErro(404, 'livro_nao_encontrado', 'Livro não encontrado.');
            }
            apiResponder(['dados' => apiLivroParaJson($linhas[0], $u)]);
        }

        if ($recurso === 'capa' || $recurso === 'arquivo') {
            if ($metodo !== 'GET' && $metodo !== 'HEAD') apiMetodoNaoPermitido(['GET', 'HEAD']);
            $u = apiAutenticarComLinkAssinado($pdo, $recurso, $livroId);
            $perfil = (string) $u['perfil'];
            if (!usuarioPodeVerLivro($pdo, $livroId, $perfil, (int) $u['id'], (int) ($u['titular_id'] ?? 0))) {
                apiErro(404, 'livro_nao_encontrado', 'Livro não encontrado.');
            }
            $stmt = $pdo->prepare('SELECT titulo, formato, nome_arquivo, capa_arquivo FROM livros WHERE id = ?');
            $stmt->execute([$livroId]);
            $livro = $stmt->fetch();
            if (!$livro) {
                apiErro(404, 'livro_nao_encontrado', 'Livro não encontrado.');
            }
            if ($recurso === 'capa') {
                $arq = $livro['capa_arquivo'] !== '' ? __DIR__ . '/../../capas/' . basename((string) $livro['capa_arquivo']) : '';
                if ($arq === '' || !is_file($arq)) {
                    apiErro(404, 'sem_capa', 'Este livro não tem capa.');
                }
                $etag = md5($livro['capa_arquivo'] . filemtime($arq) . filesize($arq));
                header('ETag: "' . $etag . '"');
                header('Cache-Control: private, max-age=86400');
                header('X-Content-Type-Options: nosniff');
                if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''), '"') === $etag) {
                    http_response_code(304);
                    exit;
                }
                header('Content-Type: image/png');
                header('Content-Length: ' . filesize($arq));
                readfile($arq);
                exit;
            }
            // arquivo: conta no limite diário de livros diferentes (igual ao site)
            if (!registrarAberturaDeLivro($pdo, $perfil, (int) $u['id'], $livroId)) {
                header('Retry-After: 3600');
                apiErro(429, 'limite_diario', 'Você atingiu o limite de ' . limiteDiarioDeLivros($perfil) . ' livros diferentes por dia no plano ' . rotuloPerfil($perfil) . '. Os livros já abertos hoje continuam liberados; o limite zera amanhã.');
            }
            $arq = __DIR__ . '/../../uploads/' . basename((string) $livro['nome_arquivo']);
            if (!is_file($arq)) {
                apiErro(404, 'arquivo_ausente', 'O arquivo deste livro não está no servidor.');
            }
            $ehEpub = ($livro['formato'] ?? 'pdf') === 'epub';
            $anexo = ($_GET['download'] ?? '') === '1';
            apiEnviarArquivo(
                $arq,
                $ehEpub ? 'application/epub+zip' : 'application/pdf',
                ($anexo ? 'attachment' : 'inline') . '; ' . apiNomeDeDownload((string) $livro['titulo'], $ehEpub ? 'epub' : 'pdf'),
                md5($livro['nome_arquivo'] . filesize($arq))
            );
        }

        /* favorito e progresso: exigem o Bearer token (nunca link assinado) */
        $u = apiAutenticar($pdo)['usuario'];
        $perfil = (string) $u['perfil'];
        $uid = (int) $u['id'];
        $titular = (int) ($u['titular_id'] ?? 0);
        if (!usuarioPodeVerLivro($pdo, $livroId, $perfil, $uid, $titular)) {
            apiErro(404, 'livro_nao_encontrado', 'Livro não encontrado.');
        }

        if ($recurso === 'favorito') {
            if ($metodo === 'PUT') {
                $n = $pdo->prepare('SELECT COUNT(*) FROM favoritos WHERE usuario_id = ?');
                $n->execute([$uid]);
                if ((int) $n->fetchColumn() >= 2000) {
                    apiErro(422, 'limite_favoritos', 'Limite de 2000 favoritos atingido.');
                }
                $pdo->prepare('INSERT IGNORE INTO favoritos (usuario_id, livro_id) VALUES (?, ?)')->execute([$uid, $livroId]);
                apiResponder(['favorito' => true]);
            }
            if ($metodo === 'DELETE') {
                $pdo->prepare('DELETE FROM favoritos WHERE usuario_id = ? AND livro_id = ?')->execute([$uid, $livroId]);
                apiResponder(['favorito' => false]);
            }
            apiMetodoNaoPermitido(['PUT', 'DELETE']);
        }

        if ($recurso === 'progresso') {
            if ($metodo === 'GET') {
                $s = $pdo->prepare('SELECT progresso, total_paginas, porcentagem, posicao FROM leituras WHERE usuario_id = ? AND livro_id = ?');
                $s->execute([$uid, $livroId]);
                $r = $s->fetch();
                apiResponder(['dados' => $r ? ['pagina' => (int) $r['progresso'], 'total' => (int) $r['total_paginas'], 'porcentagem' => (int) $r['porcentagem'], 'posicao' => ($r['posicao'] ?? '') !== '' ? $r['posicao'] : null] : null]);
            }
            if ($metodo === 'PUT') {
                $c = apiCorpo();
                $pagina = filter_var($c['pagina'] ?? null, FILTER_VALIDATE_INT);
                $total = filter_var($c['total'] ?? null, FILTER_VALIDATE_INT);
                if (!$pagina || !$total || $pagina < 1 || $total < 1 || $pagina > $total || $total > 10000000) {
                    apiErro(422, 'dados_invalidos', 'Informe "pagina" e "total" (inteiros, 1 <= pagina <= total).');
                }
                $posicao = $c['posicao'] ?? null;
                if (!is_string($posicao) || $posicao === '' || strlen($posicao) > 500 || !preg_match('/^[\x20-\x7E]+$/', $posicao)) {
                    $posicao = null;
                }
                $porcentagem = (int) round(($pagina / $total) * 100);
                $pdo->prepare('INSERT INTO leituras (usuario_id, livro_id, progresso, total_paginas, porcentagem, posicao) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE progresso = VALUES(progresso), total_paginas = VALUES(total_paginas), porcentagem = VALUES(porcentagem), posicao = VALUES(posicao)')
                    ->execute([$uid, $livroId, $pagina, $total, $porcentagem, $posicao]);
                apiResponder(['dados' => ['pagina' => $pagina, 'total' => $total, 'porcentagem' => $porcentagem, 'posicao' => $posicao]]);
            }
            apiMetodoNaoPermitido(['GET', 'PUT']);
        }
    }

    apiErro(404, 'rota_nao_encontrada', 'Rota não encontrada.');
} catch (PDOException $e) {
    error_log('API v1: erro de banco: ' . $e->getMessage());
    apiErro(500, 'erro_interno', 'Erro interno. Tente novamente em instantes.');
} catch (Throwable $e) {
    error_log('API v1: erro inesperado: ' . $e->getMessage());
    apiErro(500, 'erro_interno', 'Erro interno. Tente novamente em instantes.');
}
