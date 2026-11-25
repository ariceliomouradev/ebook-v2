<?php
/**
 * Envio de e-mail do sistema (texto puro, UTF-8) pela função mail() da hospedagem.
 * Remetente: MAIL_FROM do .env ou nao-responda@<domínio do APP_URL>. Devolve false quando o servidor não aceitou
 * (ambiente local sem SMTP): quem chama decide o que fazer (os fluxos registram o link no log, nunca na tela).
 */
function enviarEmailDoSistema(string $para, string $assunto, string $texto): bool
{
    if (!filter_var($para, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $para . $assunto)) {
        return false; // nada de quebra de linha em destinatário/assunto (injeção de cabeçalho)
    }
    $de = trim((string) env('MAIL_FROM', ''));
    if ($de === '' || !filter_var($de, FILTER_VALIDATE_EMAIL)) {
        $host = (string) (parse_url((string) env('APP_URL', ''), PHP_URL_HOST) ?: 'localhost');
        $de = 'nao-responda@' . preg_replace('/^www\./', '', $host);
    }
    $cabecalhos = "From: Meus Livros <{$de}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    return (bool) @mail($para, '=?UTF-8?B?' . base64_encode($assunto) . '?=', $texto, $cabecalhos);
}
