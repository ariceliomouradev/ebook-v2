<?php
/**
 * Tabela de usuários do modal "Gerenciar usuários" (só admin).
 * Renderizada na abertura do painel e devolvida por api/usuarios_gerenciar.php após cada ação.
 * Entrada: $listaUsuarios (id, nome, email, perfil, criado_em).
 */
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '../') . 'index.php');
    exit;
}
$listaUsuarios = $listaUsuarios ?? [];
$meuId = (int) ($_SESSION['usuario_id'] ?? 0);
?>
<div class="tabela-usuarios-cartao" data-total="<?= count($listaUsuarios) ?>">
    <div class="table-responsive">
        <table class="table table-hover mb-0" data-testid="tabela-usuarios">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th class="d-none d-lg-table-cell">Criado em</th>
                    <th class="text-end">Ações</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($listaUsuarios as $user):
                    $badgeColor = match ($user['perfil']) {
                        'admin' => 'bg-danger',
                        'contribuidor' => 'bg-primary',
                        'leitor' => 'bg-success',
                        default => 'bg-secondary',
                    };
                ?>
                <tr data-testid="linha-usuario" data-id="<?= (int) $user['id'] ?>">
                    <td class="align-middle fw-semibold">
                        <div class="usuario-celula">
                            <span class="avatar" aria-hidden="true"><?= e(mb_strtoupper(mb_substr($user['nome'], 0, 1))) ?></span>
                            <span><?= e($user['nome']) ?></span>
                        </div>
                    </td>
                    <td class="align-middle"><?= e($user['email']) ?></td>
                    <td class="align-middle"><span class="badge <?= $badgeColor ?> text-uppercase" data-testid="badge-perfil"><?= e($user['perfil']) ?></span></td>
                    <td class="align-middle text-secondary small d-none d-lg-table-cell"><?= e(date('d/m/Y H:i', strtotime($user['criado_em']))) ?></td>
                    <td class="align-middle text-end text-nowrap">
                        <?php if ((int) $user['id'] !== $meuId): ?>
                            <button type="button" class="btn btn-sm btn-outline-warning btn-icone btn-abrir-reset-senha" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>"
                                    data-testid="btn-reset-senha" title="Redefinir senha" aria-label="Redefinir a senha de <?= e($user['nome']) ?>">
                                <i class="fas fa-key" aria-hidden="true"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger btn-icone ms-1 btn-abrir-excluir-usuario" data-id="<?= (int) $user['id'] ?>" data-nome="<?= e($user['nome']) ?>"
                                    data-testid="btn-excluir-usuario" title="Excluir" aria-label="Excluir o usuário <?= e($user['nome']) ?>">
                                <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                        <?php else: ?>
                            <span class="perfil-etiqueta">Você</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
