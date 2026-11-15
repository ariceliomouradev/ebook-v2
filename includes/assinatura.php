<?php
/**
 * Teste grátis e mensalidade.
 *
 *   - Quem se cadastra ganha TESTE_DIAS (30) de teste grátis, sem cartão: usuarios.acesso_ate = fim do teste.
 *   - Depois, Assinante paga PRECOS_MENSAIS['leitor'] (R$ 10) por mês e Família PRECOS_MENSAIS['contribuidor'] (R$ 25).
 *   - O pagamento é por PIX e combinado direto com o suporte pelo WhatsApp (SUPORTE_WHATSAPP). Ao receber, o
 *     administrador clica em "+30 dias" em Gerenciar usuários (acesso_origem passa a 'pago').
 *   - acesso_ate NULL = sem vencimento (administrador, contas antigas e cortesias).
 *   - Conta de dependente (família) segue o vencimento do titular.
 *   - Por padrão NADA é bloqueado: só avisa. Com ASSINATURA_EXIGIDA=true no .env, quem venceu vê a tela
 *     /assinatura em vez do sistema.
 */

function assinaturaExigida(): bool
{
    return in_array(strtolower(trim((string) env('ASSINATURA_EXIGIDA', 'false'))), ['1', 'true', 'sim', 'on'], true);
}

function formatarReais(int|float $valor): string
{
    return 'R$ ' . number_format((float) $valor, 0, ',', '.');
}

function precoMensal(string $perfil): int
{
    return (int) (PRECOS_MENSAIS[$perfil] ?? PRECOS_MENSAIS['leitor']);
}

/** WhatsApp do suporte (só dígitos, com 55). Troque pelo .env: SUPORTE_WHATSAPP=5585999999999 */
function suporteWhatsapp(): string
{
    $n = preg_replace('/\D+/', '', (string) env('SUPORTE_WHATSAPP', SUPORTE_WHATSAPP_PADRAO));
    return $n !== '' ? $n : SUPORTE_WHATSAPP_PADRAO;
}

/** Link do WhatsApp do suporte já com a mensagem escrita. */
function linkSuporte(string $mensagem): string
{
    return 'https://wa.me/' . suporteWhatsapp() . '?text=' . rawurlencode($mensagem);
}

/**
 * Situação do acesso a partir de uma linha de usuarios (perfil, acesso_ate, acesso_origem).
 * @return array{limitado: bool, origem: string, ate: ?string, dias: ?int, vencido: bool, perfil: string}
 */
function situacaoDeLinha(array $u): array
{
    $livre = ['limitado' => false, 'origem' => 'cortesia', 'ate' => null, 'dias' => null, 'vencido' => false, 'perfil' => (string) ($u['perfil'] ?? 'leitor')];
    if (($u['perfil'] ?? '') === 'admin' || empty($u['acesso_ate'])) {
        return $livre;
    }
    $segundos = strtotime((string) $u['acesso_ate']) - time();
    return [
        'limitado' => true,
        'origem'   => (string) ($u['acesso_origem'] ?? 'teste'),
        'ate'      => (string) $u['acesso_ate'],
        'dias'     => (int) max(0, ceil($segundos / 86400)),
        'vencido'  => $segundos <= 0,
        'perfil'   => (string) $u['perfil'],
    ];
}

/** Situação do acesso de um usuário (dependente: vale o plano do titular). */
function situacaoAcesso(PDO $pdo, int $usuarioId): array
{
    try {
        $stmt = $pdo->prepare('SELECT perfil, titular_id, acesso_ate, acesso_origem FROM usuarios WHERE id = ?');
        $stmt->execute([$usuarioId]);
        $u = $stmt->fetch();
        if ($u && !empty($u['titular_id'])) {
            $stmt->execute([(int) $u['titular_id']]);
            $u = $stmt->fetch() ?: $u;
        }
        return $u ? situacaoDeLinha($u) : situacaoDeLinha([]);
    } catch (PDOException $e) {
        return situacaoDeLinha([]); // banco sem a migração v1.12: nada é limitado
    }
}

/** Texto curto: "Teste grátis: faltam 12 dias" / "Plano ativo até 15/12/2026". */
function resumoAcesso(array $s): string
{
    if (!$s['limitado']) {
        return '';
    }
    if ($s['vencido']) {
        return $s['origem'] === 'teste' ? 'Teste grátis terminou' : 'Plano vencido';
    }
    if ($s['origem'] === 'teste') {
        return 'Teste grátis: ' . ($s['dias'] === 1 ? 'falta 1 dia' : 'faltam ' . $s['dias'] . ' dias');
    }
    return 'Plano ativo até ' . date('d/m/Y', strtotime($s['ate']));
}

/** Para a lista do administrador (linha da tabela usuarios). */
function resumoAcessoDaLinha(array $u): string
{
    if (($u['perfil'] ?? '') === 'admin') {
        return 'Sem limite';
    }
    if (!empty($u['titular_id'])) {
        return 'Segue o titular';
    }
    $s = situacaoDeLinha($u);
    return $s['limitado'] ? resumoAcesso($s) : 'Sem limite';
}

/** Soma dias ao acesso: a partir de hoje, ou do vencimento se ainda não passou. */
function renovarAcesso(PDO $pdo, int $usuarioId, int $dias = 30): bool
{
    $stmt = $pdo->prepare('SELECT id, perfil, titular_id, acesso_ate FROM usuarios WHERE id = ?');
    $stmt->execute([$usuarioId]);
    $u = $stmt->fetch();
    if ($u && !empty($u['titular_id'])) { // a renovação vale para a família toda: é do titular
        $stmt->execute([(int) $u['titular_id']]);
        $u = $stmt->fetch();
    }
    if (!$u || $u['perfil'] === 'admin') {
        return false;
    }
    $base = (!empty($u['acesso_ate']) && strtotime($u['acesso_ate']) > time()) ? strtotime($u['acesso_ate']) : time();
    $novo = date('Y-m-d H:i:s', strtotime("+$dias days", $base));
    $pdo->prepare("UPDATE usuarios SET acesso_ate = ?, acesso_origem = 'pago' WHERE id = ?")->execute([$novo, (int) $u['id']]);
    return true;
}
