<?php
/**
 * Banners de divulgação (tabela `banners`).
 *   q = quadrado: abre sobre a tela (components/anuncio_modal.php), sempre com botão de fechar.
 *   h / v (faixa e lateral) ficam no banco por histórico, mas não são mais exibidos nem gerenciados.
 * As peças padrão ficam em assets/promo/; as enviadas pelo admin, em banners/.
 *
 * Quem vê os anúncios: ANUNCIOS_PERFIS (config/app.php) = Administrador (para ver como fica) e Grátis.
 */

const BANNER_FORMATOS = ['q'];
const BANNER_LIMITE_POR_FORMATO = 12; // evita uma fila interminável (e páginas pesadas)

/** O perfil da sessão vê anúncios? (Administrador e Grátis; o plano Pro não.) */
function perfilVeAnuncios(?string $perfil = null): bool
{
    return in_array($perfil ?? ($_SESSION['usuario_perfil'] ?? ''), ANUNCIOS_PERFIS, true);
}

function listarBanners(PDO $pdo, string $formato): array
{
    $stmt = $pdo->prepare('SELECT id, formato, arquivo, alt, link, ordem FROM banners WHERE formato = ? ORDER BY ordem ASC, id ASC');
    $stmt->execute([$formato]);
    return $stmt->fetchAll();
}

/**
 * Valida o link de um banner. Aceita só http/https (nunca "javascript:" nem "data:", que viram
 * XSS ao clicar). Sem esquema ("meusite.com/oferta"), assume https. Devolve:
 *   ''    -> link vazio (sem link)
 *   string-> URL normalizada
 *   null  -> inválido
 */
function normalizarLinkBanner(string $link): ?string
{
    $link = trim($link);
    if ($link === '') {
        return '';
    }
    if (!preg_match('#^[a-z][a-z0-9+.-]*:#i', $link)) {
        $link = 'https://' . $link;
    }
    if (strlen($link) > 500 || !filter_var($link, FILTER_VALIDATE_URL)) {
        return null;
    }
    $esquema = strtolower((string) parse_url($link, PHP_URL_SCHEME));
    return in_array($esquema, ['http', 'https'], true) ? $link : null;
}

/** URL pública do arquivo do banner, com versão (muda quando o arquivo muda). */
function bannerUrl(array $banner, string $raiz): string
{
    $caminho = $banner['arquivo'];
    $disco = __DIR__ . '/../' . $caminho;
    $versao = file_exists($disco) ? '?v=' . filemtime($disco) : '';
    return $raiz . $caminho . $versao;
}

/** Banner enviado pelo admin (pasta banners/) ou peça padrão (assets/promo/)? */
function bannerEhEnviado(array $banner): bool
{
    return str_starts_with($banner['arquivo'], 'banners/');
}

/**
 * Processa uma imagem enviada e a grava em banners/ como WebP (leve, mesmo que o original tenha
 * vários MB). O lado maior é limitado a 1800px. Devolve o caminho relativo ('banners/b_xxx.webp')
 * ou null se a imagem não puder ser lida.
 */
function salvarImagemBanner(string $tmp, string $formato): ?string
{
    $info = @getimagesize($tmp);
    if ($info === false) {
        return null;
    }
    $origem = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($tmp),
        IMAGETYPE_PNG  => @imagecreatefrompng($tmp),
        IMAGETYPE_WEBP => @imagecreatefromwebp($tmp),
        default        => false,
    };
    if (!$origem) {
        return null;
    }

    $w = imagesx($origem);
    $h = imagesy($origem);
    $maior = max($w, $h);
    $limite = 1800;
    if ($maior > $limite) {
        $k = $limite / $maior;
        $novo = imagescale($origem, (int) round($w * $k), (int) round($h * $k));
        if ($novo) {
            $origem = $novo;
        }
    }

    $nome = 'banners/b_' . $formato . '_' . bin2hex(random_bytes(6)) . '.webp';
    $ok = imagewebp($origem, __DIR__ . '/../' . $nome, 85);
    return $ok ? $nome : null;
}

function removerArquivoBanner(array $banner): void
{
    // Só apaga o que foi enviado: as peças padrão (assets/promo/) fazem parte do sistema.
    if (bannerEhEnviado($banner)) {
        $arquivo = __DIR__ . '/../' . $banner['arquivo'];
        if (is_file($arquivo)) {
            @unlink($arquivo);
        }
    }
}
