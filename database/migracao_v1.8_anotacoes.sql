-- Anotações no leitor (v1.8): marca-texto por área colorido e comentários. Rode UMA vez em bancos
-- criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
--
-- Cada anotação é de UM usuário em UM livro e não altera o PDF. As posições são frações (0 a 1) da
-- largura/altura da página, então valem para qualquer zoom e tamanho de tela:
--   tipo 'area'  retângulo colorido (x, y, w, h)    tipo 'nota'  ponto com comentário (x, y; w = h = 0)

CREATE TABLE IF NOT EXISTS `anotacoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `pagina` int(11) NOT NULL,
  `tipo` enum('area','nota') NOT NULL DEFAULT 'area',
  `cor` enum('amarelo','verde','azul','rosa','laranja') NOT NULL DEFAULT 'amarelo',
  `x` decimal(8,6) NOT NULL,
  `y` decimal(8,6) NOT NULL,
  `w` decimal(8,6) NOT NULL DEFAULT 0,
  `h` decimal(8,6) NOT NULL DEFAULT 0,
  `comentario` text DEFAULT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anotacoes_usuario_livro` (`usuario_id`, `livro_id`, `pagina`),
  CONSTRAINT `fk_anotacao_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anotacao_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
