-- Confirmação de e-mail no cadastro (v1.20). Contas existentes ficam como confirmadas (DEFAULT 1); só as criadas pelo
-- cadastro público com CADASTRO_CONFIRMAR_EMAIL=true nascem pendentes. O token do link fica em hash (sha256).
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
ALTER TABLE `usuarios`
  ADD COLUMN `email_confirmado` tinyint(1) NOT NULL DEFAULT 1 AFTER `trocar_senha`,
  ADD COLUMN `confirmacao_token` varchar(64) DEFAULT NULL AFTER `email_confirmado`,
  ADD COLUMN `confirmacao_expira` datetime DEFAULT NULL AFTER `confirmacao_token`;
