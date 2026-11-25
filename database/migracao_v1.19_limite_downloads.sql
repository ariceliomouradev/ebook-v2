-- Limite diário de livros diferentes abertos por usuário (v1.19): freia a raspagem do acervo por quem tem conta.
-- Uma linha por (usuário, livro, dia); reabrir o mesmo livro no mesmo dia não gasta o limite. Limites por plano em
-- config/app.php (DOWNLOAD_LIMITE_DIA). Rode UMA vez em bancos criados antes desta versão.
CREATE TABLE IF NOT EXISTS `livros_abertos` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `dia` date NOT NULL,
  PRIMARY KEY (`usuario_id`,`livro_id`,`dia`),
  KEY `idx_livros_abertos_dia` (`dia`),
  CONSTRAINT `fk_livros_abertos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
