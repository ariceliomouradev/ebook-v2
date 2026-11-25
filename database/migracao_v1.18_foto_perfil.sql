-- Foto de perfil (v1.18): guarda só o NOME do arquivo (avatares/a_xxx.webp, 256 px, ~10-30 KB), nunca a imagem no banco.
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
ALTER TABLE `usuarios` ADD COLUMN `foto` varchar(60) DEFAULT NULL AFTER `whatsapp`;
