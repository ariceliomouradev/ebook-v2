-- Bloqueio de acesso pelo administrador (v1.13). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   bloqueado  1 = a conta não entra (e quem está logado é derrubado). Usado para cortar o acesso de quem não pagou.
--              Dependentes de uma Família seguem o titular. Administrador nunca é bloqueado.
-- Em Gerenciar usuários: botões "Renovar" (soma 30 dias e desbloqueia) e "Bloquear / Desbloquear".

ALTER TABLE `usuarios`
  ADD COLUMN `bloqueado` tinyint(1) NOT NULL DEFAULT 0 AFTER `acesso_origem`;
