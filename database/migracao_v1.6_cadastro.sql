-- Cadastro público com WhatsApp (v1.6). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--   usuarios.whatsapp  número só com dígitos e DDI (ex.: 5585986020364); vazio nas contas antigas.

ALTER TABLE `usuarios`
  ADD COLUMN `whatsapp` varchar(20) DEFAULT NULL AFTER `email`;
