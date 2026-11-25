<?php
/**
 * Foto de perfil. O arquivo enviado (JPG ou PNG) NUNCA vai para o disco como veio: é lido, girado conforme o
 * EXIF, cortado em quadrado, reduzido a FOTO_PERFIL_LADO px e regravado como WebP (≈10–30 KB) em avatares/.
 * No banco fica só o nome do arquivo (usuarios.foto). Limites contra abuso (disco e memória):
 *   - até FOTO_PERFIL_MAX_BYTES no envio (config/app.php);
 *   - só JPEG/PNG reconhecidos pelo conteúdo (nunca pela extensão);
 *   - até FOTO_PERFIL_MAX_PIXELS (a decodificação de uma imagem enorme estoura a memória do PHP).
 */

const FOTO_PERFIL_PASTA = __DIR__ . '/../avatares/';

/** Garante a pasta (com .htaccess que bloqueia PHP) e devolve se dá para gravar nela. */
function pastaDeFotosPronta(): bool
{
    if (!is_dir(FOTO_PERFIL_PASTA)) {
        @mkdir(FOTO_PERFIL_PASTA, 0775, true);
    }
    if (is_dir(FOTO_PERFIL_PASTA) && !is_file(FOTO_PERFIL_PASTA . '.htaccess') && is_file(__DIR__ . '/../capas/.htaccess')) {
        @copy(__DIR__ . '/../capas/.htaccess', FOTO_PERFIL_PASTA . '.htaccess');
    }
    return is_dir(FOTO_PERFIL_PASTA) && is_writable(FOTO_PERFIL_PASTA);
}

/**
 * Processa o arquivo enviado e grava o WebP final.
 * @return array{ok:bool, arquivo?:string, erro?:string}
 */
function salvarFotoPerfil(string $tmp, int $tamanhoEnviado): array
{
    if ($tamanhoEnviado <= 0 || $tamanhoEnviado > FOTO_PERFIL_MAX_BYTES) {
        return ['ok' => false, 'erro' => 'A foto deve ter no máximo ' . (int) (FOTO_PERFIL_MAX_BYTES / 1048576) . ' MB.'];
    }
    $info = @getimagesize($tmp);
    if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
        return ['ok' => false, 'erro' => 'Envie uma imagem JPG, JPEG ou PNG.'];
    }
    [$w, $h] = $info;
    if ($w < 32 || $h < 32 || $w * $h > FOTO_PERFIL_MAX_PIXELS) {
        return ['ok' => false, 'erro' => 'Imagem muito pequena ou muito grande (use até ' . (int) (FOTO_PERFIL_MAX_PIXELS / 1000000) . ' megapixels).'];
    }
    $origem = $info[2] === IMAGETYPE_JPEG ? @imagecreatefromjpeg($tmp) : @imagecreatefrompng($tmp);
    if (!$origem) {
        return ['ok' => false, 'erro' => 'Não foi possível ler a imagem.'];
    }

    // fotos de celular vêm "deitadas" com a orientação no EXIF
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($tmp);
        $giro = match ((int) ($exif['Orientation'] ?? 1)) { 3 => 180, 6 => -90, 8 => 90, default => 0 };
        if ($giro !== 0 && ($girada = imagerotate($origem, $giro, 0))) {
            $origem = $girada;
            $w = imagesx($origem);
            $h = imagesy($origem);
        }
    }

    // corta o quadrado central e reduz
    $lado = min($w, $h);
    $destino = imagecreatetruecolor(FOTO_PERFIL_LADO, FOTO_PERFIL_LADO);
    imagealphablending($destino, false);
    imagesavealpha($destino, true);
    imagefill($destino, 0, 0, imagecolorallocatealpha($destino, 0, 0, 0, 127));
    imagecopyresampled($destino, $origem, 0, 0, (int) (($w - $lado) / 2), (int) (($h - $lado) / 2), FOTO_PERFIL_LADO, FOTO_PERFIL_LADO, $lado, $lado);

    if (!pastaDeFotosPronta()) {
        return ['ok' => false, 'erro' => 'Não foi possível gravar a foto no servidor.'];
    }
    $nome = 'a_' . bin2hex(random_bytes(8)) . '.webp';
    if (!imagewebp($destino, FOTO_PERFIL_PASTA . $nome, 82)) {
        return ['ok' => false, 'erro' => 'Não foi possível gravar a foto no servidor.'];
    }
    return ['ok' => true, 'arquivo' => $nome];
}

/** Só aceita nomes gerados por salvarFotoPerfil (evita caminhos como ../). */
function nomeDeFotoValido(?string $nome): bool
{
    return is_string($nome) && preg_match('/^a_[0-9a-f]{16}\.webp$/', $nome) === 1;
}

function apagarArquivoDeFoto(?string $nome): void
{
    if (nomeDeFotoValido($nome) && is_file(FOTO_PERFIL_PASTA . $nome)) {
        @unlink(FOTO_PERFIL_PASTA . $nome);
    }
}

/** URL pública da foto (com versão para o navegador não guardar a antiga). Vazio = sem foto. */
function urlDaFoto(?string $nome, string $raiz = ''): string
{
    if (!nomeDeFotoValido($nome) || !is_file(FOTO_PERFIL_PASTA . $nome)) {
        return '';
    }
    return $raiz . 'avatares/' . $nome . '?v=' . filemtime(FOTO_PERFIL_PASTA . $nome);
}

/** Apaga as fotos de um usuário e dos dependentes dele (usado antes de excluir a conta). Banco sem a v1.18: ignora. */
function apagarFotosDoUsuario(PDO $pdo, int $usuarioId): void
{
    try {
        $stmt = $pdo->prepare('SELECT foto FROM usuarios WHERE (id = ? OR titular_id = ?) AND foto IS NOT NULL');
        $stmt->execute([$usuarioId, $usuarioId]);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $foto) {
            apagarArquivoDeFoto($foto);
        }
    } catch (PDOException $e) {
        // sem a coluna: nada a apagar
    }
}
