<?php
/**
 * Cadastro público (nome, e-mail, WhatsApp e senha). Quem se cadastra vira Grátis.
 * CADASTRO_ABERTO=false no .env fecha o cadastro (só o administrador cria contas).
 */

const CADASTRO_MAX_POR_HORA = 5;       // cadastros por IP em 1 hora
const CADASTRO_MARCA = '__cadastro__'; // marca na tabela tentativas_login (não mistura com as falhas de login)

/**
 * Confirmação de e-mail no cadastro (CADASTRO_CONFIRMAR_EMAIL=true no .env; desligada por padrão).
 * Ligada: a conta nasce SEM acesso, o link vai para o e-mail e só depois dele a pessoa entra; a resposta do cadastro
 * é sempre a mesma exista ou não o e-mail (não revela quem já tem conta) e ninguém cria conta com o e-mail dos outros.
 * Só ligue depois de testar o envio de e-mail da hospedagem: sem e-mail chegando, ninguém consegue se cadastrar.
 */
function cadastroConfirmarEmail(): bool
{
    return in_array(strtolower(trim((string) env('CADASTRO_CONFIRMAR_EMAIL', 'false'))), ['1', 'true', 'sim', 'on'], true);
}

/** A conta ainda espera a confirmação do e-mail? Banco sem a migração v1.20: nunca. */
function emailPendenteDeConfirmacao(PDO $pdo, int $usuarioId): bool
{
    try {
        $stmt = $pdo->prepare('SELECT email_confirmado FROM usuarios WHERE id = ?');
        $stmt->execute([$usuarioId]);
        return (string) $stmt->fetchColumn() === '0';
    } catch (PDOException $e) {
        return false;
    }
}

function cadastroAberto(): bool
{
    return !in_array(strtolower(trim((string) env('CADASTRO_ABERTO', 'true'))), ['0', 'false', 'nao', 'não', 'off'], true);
}

/**
 * Normaliza um WhatsApp brasileiro para só dígitos com DDI: "(85) 98602-0364" -> "5585986020364".
 * Aceita DDD + 8 dígitos (fixo) ou DDD + 9 dígitos começando em 9 (celular), com ou sem o 55.
 * Devolve null quando não parece um número válido.
 */
function normalizarWhatsapp(string $texto): ?string
{
    $d = preg_replace('/\D+/', '', $texto);
    if (strlen($d) >= 12 && str_starts_with($d, '55')) {
        $d = substr($d, 2);
    }
    if (!preg_match('/^([1-9][1-9])(9?\d{8})$/', $d, $m)) {
        return null; // DDD de 2 dígitos (11–99) + 8 ou 9 dígitos
    }
    if (strlen($m[2]) === 9 && $m[2][0] !== '9') {
        return null;
    }
    return '55' . $d;
}

/** "5585986020364" -> "(85) 98602-0364" (para exibir). */
function formatarWhatsapp(?string $numero): string
{
    $d = preg_replace('/\D+/', '', (string) $numero);
    if (str_starts_with($d, '55') && strlen($d) >= 12) {
        $d = substr($d, 2);
    }
    if (strlen($d) === 11) {
        return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 5), substr($d, 7));
    }
    if (strlen($d) === 10) {
        return sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 4), substr($d, 6));
    }
    return (string) $numero;
}

function cadastroIpMarca(string $ip): string
{
    return 'c:' . substr(sha1($ip), 0, 16); // cabe em varchar(45) e não colide com IPs reais
}

function cadastroBloqueado(PDO $pdo, string $ip): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM tentativas_login WHERE email = ? AND ip = ? AND criado_em > (NOW() - INTERVAL 1 HOUR)');
    $stmt->execute([CADASTRO_MARCA, cadastroIpMarca($ip)]);
    return (int) $stmt->fetchColumn() >= CADASTRO_MAX_POR_HORA;
}

function registrarCadastro(PDO $pdo, string $ip): void
{
    // sucesso = 0 de propósito: registrarTentativaLogin(…, true) apagaria o histórico do e-mail/IP
    $pdo->prepare('INSERT INTO tentativas_login (email, ip, sucesso) VALUES (?, ?, 0)')->execute([CADASTRO_MARCA, cadastroIpMarca($ip)]);
}
