-- Teste grátis e mensalidade (v1.12). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   acesso_ate     até quando a conta pode usar o sistema (fim do teste grátis ou do período pago).
--                  NULL = sem vencimento (administrador, contas que já existiam, cortesias).
--   acesso_origem  teste | pago | cortesia
-- Quem se cadastra entra com 30 dias de teste. O pagamento (PIX) é combinado com o suporte pelo WhatsApp e o
-- administrador renova em Gerenciar usuários ("+30 dias").

ALTER TABLE `usuarios`
  ADD COLUMN `acesso_ate` datetime DEFAULT NULL AFTER `titular_id`,
  ADD COLUMN `acesso_origem` enum('teste','pago','cortesia') NOT NULL DEFAULT 'cortesia' AFTER `acesso_ate`;
