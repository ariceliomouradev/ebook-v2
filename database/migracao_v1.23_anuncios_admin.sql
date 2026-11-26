-- Interruptor de propagandas do Administrador (v1.23): o administrador vê os anúncios para conferir como ficam;
-- esta coluna deixa ele ligar e desligar isso no menu do perfil. Só vale para o perfil Administrador (Grátis sempre vê,
-- Pro nunca vê). 1 = mostra (padrão), 0 = esconde.
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
ALTER TABLE `usuarios` ADD COLUMN `anuncios_ativos` tinyint(1) NOT NULL DEFAULT 1 AFTER `bloqueado`;
