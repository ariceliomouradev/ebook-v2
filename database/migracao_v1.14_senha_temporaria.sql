-- Senha temporária (v1.14). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   trocar_senha  1 = a pessoa entrou (ou vai entrar) com uma senha temporária e é obrigada a definir uma nova
--                 antes de usar o sistema. É ligado quando o administrador cria a conta ou redefine a senha.

ALTER TABLE `usuarios`
  ADD COLUMN `trocar_senha` tinyint(1) NOT NULL DEFAULT 0 AFTER `bloqueado`;
