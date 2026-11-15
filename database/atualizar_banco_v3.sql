-- =====================================================================================
-- ATUALIZAR O BANCO PARA A VERSÃO 3
--
-- Leva qualquer banco do Meus Livros (a partir da versão 1) ao esquema atual: categorias, banners,
-- visibilidade por livro, perfis (Família/Assinante), aprovação, anotações, favoritos, repetidos,
-- cadastro com WhatsApp e teste grátis. Pode ser rodado mais de uma vez: só cria o que falta.
-- Não apaga nem altera nenhum dado: livros e usuários que já existem continuam como estão.
--
-- Como usar: no phpMyAdmin, selecione o banco, aba "Importar" (ou "SQL") e envie/cole este arquivo.
-- Faça um backup antes (aba "Exportar").
-- =====================================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------- tabelas novas ----------
CREATE TABLE IF NOT EXISTS `categorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(40) NOT NULL,
  `nome` varchar(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categoria_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `categorias` (`slug`, `nome`) VALUES
  ('tecnologia', 'Tecnologia'),
  ('negocios', 'Negócios'),
  ('marketing', 'Marketing e Vendas'),
  ('financas', 'Finanças'),
  ('desenvolvimento', 'Desenvolvimento Pessoal'),
  ('saude', 'Saúde e Bem-estar'),
  ('culinaria', 'Culinária'),
  ('educacao', 'Educação e Idiomas'),
  ('design', 'Design e Criatividade'),
  ('espiritualidade', 'Espiritualidade'),
  ('literatura', 'Literatura'),
  ('ciencias', 'Ciências e Humanidades'),
  ('geral', 'Geral');

CREATE TABLE IF NOT EXISTS `banners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `formato` enum('h','v') NOT NULL,
  `arquivo` varchar(255) NOT NULL,
  `alt` varchar(200) NOT NULL DEFAULT '',
  `link` varchar(500) DEFAULT NULL,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_banners_formato_ordem` (`formato`,`ordem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sessoes_ativas` (
  `session_id` varchar(128) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `grupo_id` int(11) NOT NULL,
  `ultimo_acesso` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`session_id`),
  KEY `idx_sessoes_grupo` (`grupo_id`, `ultimo_acesso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- colunas novas (só se ainda não existirem) ----------
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `categoria_id` int(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'categoria_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `visivel_para` set(''contribuidor'',''leitor'') NOT NULL DEFAULT ''contribuidor,leitor''', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'visivel_para');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `liberar_em` datetime DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'liberar_em');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `publicacao` enum(''privado'',''pendente'',''aprovado'',''negado'') NOT NULL DEFAULT ''aprovado''', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'publicacao');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `motivo_negado` varchar(255) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'motivo_negado');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `hash_arquivo` char(64) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'hash_arquivo');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `titulo_chave` varchar(255) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'titulo_chave');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `autor_chave` varchar(255) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'autor_chave');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `capa_hash` char(16) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'capa_hash');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD COLUMN `duplicado_de` int(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND COLUMN_NAME = 'duplicado_de');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD COLUMN `titular_id` int(11) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'titular_id');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD COLUMN `whatsapp` varchar(20) DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'whatsapp');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD COLUMN `acesso_ate` datetime DEFAULT NULL', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'acesso_ate');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD COLUMN `acesso_origem` enum(''teste'',''pago'',''cortesia'') NOT NULL DEFAULT ''cortesia''', 'DO 0') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'acesso_origem');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- índices ----------
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_categoria` (`categoria_id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_categoria');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_liberar_em` (`liberar_em`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_liberar_em');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_publicacao` (`publicacao`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_publicacao');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_hash` (`hash_arquivo`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_hash');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_titulo_chave` (`titulo_chave`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_titulo_chave');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD KEY `idx_livros_duplicado_de` (`duplicado_de`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND INDEX_NAME = 'idx_livros_duplicado_de');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD KEY `idx_usuarios_titular` (`titular_id`)', 'DO 0') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND INDEX_NAME = 'idx_usuarios_titular');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- chaves estrangeiras ----------
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `livros` ADD CONSTRAINT `fk_livro_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL', 'DO 0') FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'livros' AND CONSTRAINT_NAME = 'fk_livro_categoria' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;
SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `usuarios` ADD CONSTRAINT `fk_usuario_titular` FOREIGN KEY (`titular_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE', 'DO 0') FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND CONSTRAINT_NAME = 'fk_usuario_titular' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------- demais tabelas novas (dependem das colunas acima) ----------
CREATE TABLE IF NOT EXISTS `desbloqueios` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`, `livro_id`),
  KEY `idx_desbloqueios_livro` (`livro_id`),
  CONSTRAINT `fk_desbloqueio_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_desbloqueio_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `favoritos` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`usuario_id`, `livro_id`),
  KEY `idx_favoritos_livro` (`livro_id`),
  CONSTRAINT `fk_favorito_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_favorito_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `anotacoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `pagina` int(11) NOT NULL,
  `tipo` enum('area','nota','texto') NOT NULL DEFAULT 'area',
  `cor` enum('amarelo','verde','azul','rosa','laranja') NOT NULL DEFAULT 'amarelo',
  `x` decimal(8,6) NOT NULL,
  `y` decimal(8,6) NOT NULL,
  `w` decimal(8,6) NOT NULL DEFAULT 0,
  `h` decimal(8,6) NOT NULL DEFAULT 0,
  `rects` text DEFAULT NULL,
  `trecho` varchar(600) DEFAULT NULL,
  `comentario` text DEFAULT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `atualizado_em` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_anotacoes_usuario_livro` (`usuario_id`, `livro_id`, `pagina`),
  CONSTRAINT `fk_anotacao_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_anotacao_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- banners padrão (só se a tabela estiver vazia) ----------
INSERT INTO `banners` (`formato`, `arquivo`, `alt`, `ordem`)
SELECT * FROM (
  SELECT 'h' AS formato, 'assets/promo/biblioteca-h.webp' AS arquivo, 'Sua biblioteca: leia, organize e gerencie seus livros aqui' AS alt, 1 AS ordem UNION ALL
  SELECT 'h', 'assets/promo/app-h.webp',   'Meus Livros: toda a sua biblioteca de PDFs em qualquer tela', 2 UNION ALL
  SELECT 'h', 'assets/promo/retro-h.webp', 'Topete Game Retrô: os clássicos na TV Box, no celular, no Game Stick e no projetor', 3 UNION ALL
  SELECT 'h', 'assets/promo/livro-h.webp', 'Livro Criação de Sites e Sistemas Web: O Manual Definitivo, de Aricelio Moura', 4 UNION ALL
  SELECT 'h', 'assets/promo/malu-h.webp', 'MALU Online Store: sua loja online no ar, com pedido pelo WhatsApp', 5 UNION ALL
  SELECT 'v', 'assets/promo/biblioteca-v.webp', 'Sua biblioteca: leia, organize e gerencie seus livros aqui', 1 UNION ALL
  SELECT 'v', 'assets/promo/app-v.webp',   'Meus Livros: toda a sua biblioteca de PDFs em qualquer tela', 2 UNION ALL
  SELECT 'v', 'assets/promo/retro-v.webp', 'Topete Game Retrô: os clássicos na TV Box, no celular, no Game Stick e no projetor', 3 UNION ALL
  SELECT 'v', 'assets/promo/livro-v.webp', 'Livro Criação de Sites e Sistemas Web: O Manual Definitivo, de Aricelio Moura', 4 UNION ALL
  SELECT 'v', 'assets/promo/malu-v.webp', 'MALU Online Store: sua loja online no ar, com pedido pelo WhatsApp', 5
) AS padrao
WHERE NOT EXISTS (SELECT 1 FROM `banners`);

SET FOREIGN_KEY_CHECKS = 1;
