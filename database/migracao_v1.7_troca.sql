-- Troca 1 por 1 do Assinante (v1.7). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   desbloqueios  livros do acervo que o Assinante escolheu ler, usando as vagas dele.
--                 Vagas = ASSINANTE_LIVROS_INICIAIS + livros dele já aprovados; só valem com ASSINANTE_TROCA=true no .env.

CREATE TABLE IF NOT EXISTS `desbloqueios` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`, `livro_id`),
  KEY `idx_desbloqueios_livro` (`livro_id`),
  CONSTRAINT `fk_desbloqueio_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_desbloqueio_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
