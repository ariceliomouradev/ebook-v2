-- Favoritos (v1.11): cada usuário marca livros com um coração e vê só os dele. Rode UMA vez em bancos
-- criados antes desta versão. Instalações novas recebem isto pelo schema.sql.

CREATE TABLE IF NOT EXISTS `favoritos` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`, `livro_id`),
  KEY `idx_favoritos_livro` (`livro_id`),
  CONSTRAINT `fk_favorito_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_favorito_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
