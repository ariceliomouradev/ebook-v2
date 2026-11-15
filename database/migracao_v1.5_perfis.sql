-- Perfis, envios e aprovação (v1.5). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   usuarios.titular_id   conta de família: aponta para o titular (perfil contribuidor, titular_id NULL).
--   livros.publicacao     privado (só do dono) | pendente (aguarda o administrador) | aprovado | negado.
--                         Os livros que já existem ficam 'aprovado'.
--   livros.hash_arquivo   SHA-256 do PDF, para barrar duplicados (preencha os antigos com
--                         `php database/preencher_hash.php`).
--   sessoes_ativas        controla quantos acessos simultâneos cada conta/família tem.

ALTER TABLE `usuarios`
  ADD COLUMN `titular_id` int(11) DEFAULT NULL AFTER `perfil`,
  ADD KEY `idx_usuarios_titular` (`titular_id`),
  ADD CONSTRAINT `fk_usuario_titular` FOREIGN KEY (`titular_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;

ALTER TABLE `livros`
  ADD COLUMN `publicacao` enum('privado','pendente','aprovado','negado') NOT NULL DEFAULT 'aprovado' AFTER `liberar_em`,
  ADD COLUMN `motivo_negado` varchar(255) DEFAULT NULL AFTER `publicacao`,
  ADD COLUMN `hash_arquivo` char(64) DEFAULT NULL AFTER `motivo_negado`,
  ADD KEY `idx_livros_publicacao` (`publicacao`),
  ADD KEY `idx_livros_hash` (`hash_arquivo`);

CREATE TABLE IF NOT EXISTS `sessoes_ativas` (
  `session_id` varchar(128) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `grupo_id` int(11) NOT NULL,
  `ultimo_acesso` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`session_id`),
  KEY `idx_sessoes_grupo` (`grupo_id`, `ultimo_acesso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
