<?php
/**
 * Tabela de usuários do modal "Gerenciar usuários" (só admin).
 * Renderizada na abertura do painel e devolvida por api/usuarios_gerenciar.php após cada ação.
 * Entrada: $listaUsuarios (id, nome, email, whatsapp, perfil, titular_id, acesso_ate, acesso_origem, bloqueado, criado_em).
 *
 * Sem rolagem horizontal: 4 colunas (Usuário, Perfil, Vencimento, Ações). E-mail e WhatsApp ficam
 * empilhados sob o nome; em telas estreitas cada linha vira um cartão (ver .tabela-usuarios-cartao em style.css).
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
require_once __DIR__ . '/../includes/avatar.php'; // urlDaFoto()
$listaUsuarios = $listaUsuarios ?? [];
$raizFotos = function_exists('caminhoRaiz') ? caminhoRaiz() : '';
$meuId = (int) ($_SESSION['usuario_id'] ?? 0);
?>
<div class="tabela-usuarios-cartao" data-total="<?= count($listaUsuarios) ?>">
    <table class="table table-hover mb-0" data-testid="tabela-usuarios">
        <thead>
            <tr>
                <th scope="col">Usuário</th>
                <th scope="col">Perfil</th>
                <th scope="col">Vencimento</th>
                <th scope="col" class="text-end">Ações</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($listaUsuarios as $user):
                $ehEu = (int) $user['id'] === $meuId;
                $ehAdmin = $user['perfil'] === 'admin';
                $ehDependente = !empty($user['titular_id']);
                $bloqueado = !empty($user['bloqueado']);
                $venc = vencimentoDaLinha($user);
                $podeCobrar = !$ehAdmin && !$ehDependente; // vencimento e bloqueio são do titular da conta
                $fotoUrl = urlDaFoto($user['foto'] ?? null, $raizFotos);
                $badgeColor = match ($user['perfil']) {
                    'admin' => 'bg-danger',
                    'contribuidor' => 'bg-primary',
                    'leitor' => 'bg-success',
                    default => 'bg-secondary',
                };
            ?>
            <tr data-testid="linha-usuario" data-id="<?= (int) $user['id'] ?>"<?= $bloqueado ? ' class="linha-bloqueada"' : '' ?>>
                <td data-label="Usuário">
                    <div class="usuario-celula">
                        <span class="avatar" aria-hidden="true"><?php if ($fotoUrl !== ''): ?><img src="<?= e($fotoUrl) ?>" alt="" width="44" height="44" loading="lazy"><?php else: ?><?= e(mb_strtoupper(mb_substr($user['nome'], 0, 1))) ?><?php endif; ?></span>
                        <span class="usuario-celula__texto">
                            <span class="usuario-celula__nome"><?= e($user['nome']) ?><?php if ($ehEu): ?> <span class="perfil-etiqueta">Você</span><?php endif; ?></span>
                            <span class="usuario-celula__email" title="<?= e($user['email']) ?>"><?= e($user['email']) ?></span>
                            <span class="usuario-celula__zap" data-testid="usuario-whatsapp">
                                <?php if (!empty($user['whatsapp'])): ?>
                                    <a href="https://wa.me/<?= e(preg_replace('/\D+/', '', $user['whatsapp'])) ?>" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp me-1" aria-hidden="true"></i><?= e(formatarWhatsapp($user['whatsapp'])) ?></a>
                                <?php endif; ?>
                            </span>
                        </span>
                    </div>
                </td>
                <td data-label="Perfil">
                    <?php if ($ehEu || $ehDependente): ?>
                        <span class="badge <?= $badgeColor ?> text-uppercase" data-testid="badge-perfil"><?= e(rotuloPerfil($user['perfil'])) ?></span>
                        <?php if ($ehDependente): ?><small class="d-block text-secondary mt-1">Dependente</small><?php endif; ?>
                    <?php else: ?>
                        <select class="form-select form-select-sm select-perfil-usuario" data-id="<?= (int) $user['id'] ?>" data-atual="<?= e($user['perfil']) ?>"
                                data-nome="<?= e($user['nome']) ?>" data-testid="select-perfil-linha" aria-label="Perfil de <?= e($user['nome']) ?>">
                            <?php foreach (['leitor', 'contribuidor', 'admin'] as $p): ?>
                                <option value="<?= $p ?>"<?= $user['perfil'] === $p ? ' selected' : '' ?>><?= e(rotuloPerfil($p)) ?></option>
                            <?php endforeach; ?>
                        </select>
                    <?php endif; ?>
                </td>
                <td data-label="Vencimento" data-testid="usuario-acesso">
                    <div class="vencimento">
                        <?php if ($bloqueado && !$ehAdmin): ?>
                            <span class="chip-venc chip-venc--ruim" data-testid="chip-bloqueado"><i class="fas fa-lock" aria-hidden="true"></i> Bloqueado</span>
                        <?php endif; ?>
                        <?php if ($venc['data'] !== '—'): ?>
                            <strong class="vencimento__data"><?= e($venc['data']) ?></strong>
                        <?php endif; ?>
                        <span class="chip-venc chip-venc--<?= e($venc['classe']) ?>"><?= e($venc['texto']) ?></span>
                    </div>
                </td>
                <td data-label="Ações" class="text-end">
                    <div class="acoes-usuario">
                        <?php if ($podeCobrar && !$ehEu): ?>
                            <button type="button" class="btn btn-sm btn-outline-success btn-renovar-usuario" data-id="<?= (int) $user['id'] ?>"
                                    data-testid="btn-renovar-usuario" title="Pagamento recebido: soma <?= (int) TESTE_DIAS ?> dias e libera o acesso"
                                    aria-label="Renovar o acesso de <?= e($user['nome']) ?> por mais <?= (int) TESTE_DIAS ?> dias">
                                <i class="fas fa-rotate-right me-1" aria-hidden="true"></i>Renovar
                            </button>
                            <button type="button" class="btn btn-sm <?= $bloqueado ? 'btn-outline-info' : 'btn-outline-danger' ?> btn-bloquear-usuario" data-id="<?= (int) $user['id'] ?>"
                                    data-acao="<?= $bloqueado ? 'desbloquear' : 'bloquear' ?>" data-testid="btn-bloquear-usuario"
                                    title="<?= $bloqueado ? 'Liberar o acesso de novo' : 'Cortar o acesso e desconectar quem está logado' ?>"
                                    aria-label="<?= $bloqueado ? 'Desbloquear' : 'Bloquear' ?> o acesso de <?= e($user['nome']) ?>">
                                <i class="fas <?= $bloqueado ? 'fa-lock-open' : 'fa-ban' ?> me-1" aria-hidden="true"></i><?= $bloqueado ? 'Desbloquear' : 'Bloquear' ?>
                            </button>
                        <?php endif; ?>
                        <button type="button" class="btn btn-sm btn-outline-light btn-icone btn-abrir-editar-usuario" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>"
                                data-whatsapp="<?= e(!empty($user['whatsapp']) ? formatarWhatsapp($user['whatsapp']) : '') ?>"
                                data-vencimento="<?= e(!empty($user['acesso_ate']) ? substr((string) $user['acesso_ate'], 0, 10) : '') ?>"
                                data-tipo="<?= e((string) ($user['acesso_origem'] ?? 'pago')) ?>" data-venc-editavel="<?= $podeCobrar ? '1' : '0' ?>"
                                data-testid="btn-editar-usuario" title="Editar WhatsApp e vencimento" aria-label="Editar os dados de <?= e($user['nome']) ?>">
                            <i class="fas fa-pen" aria-hidden="true"></i><span class="acao-rotulo">Editar</span>
                        </button>
                        <?php if (!$ehEu): ?>
                            <button type="button" class="btn btn-sm btn-outline-warning btn-icone btn-abrir-reset-senha" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>" data-whatsapp="<?= e(preg_replace('/\D+/', '', (string) ($user['whatsapp'] ?? ''))) ?>"
                                    data-testid="btn-reset-senha" title="Gerar senha temporária" aria-label="Gerar senha temporária para <?= e($user['nome']) ?>">
                                <i class="fas fa-key" aria-hidden="true"></i><span class="acao-rotulo">Senha</span>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger btn-icone btn-abrir-excluir-usuario" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>"
                                    data-testid="btn-excluir-usuario" title="Excluir" aria-label="Excluir o usuário <?= e($user['nome']) ?>">
                                <i class="fas fa-trash" aria-hidden="true"></i><span class="acao-rotulo">Excluir</span>
                            </button>
                        <?php endif; ?>
                    </div>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>
