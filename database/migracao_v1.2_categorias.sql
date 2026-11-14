-- Categorias do acervo (v1.2).
-- Rode UMA vez em bancos criados antes desta versão; depois preencha as categorias com:
--   php database/categorizar_acervo.php --aplicar
-- (instalações novas já recebem isto pelo schema.sql)

CREATE TABLE IF NOT EXISTS `categorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(40) NOT NULL,
  `nome` varchar(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categoria_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `livros`
  ADD COLUMN `categoria_id` int(11) DEFAULT NULL,
  ADD KEY `idx_livros_categoria` (`categoria_id`),
  ADD CONSTRAINT `fk_livro_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL;
