-- =====================================================================================
-- Meus Livros: schema completo do banco (versão atual).
--
-- Cria TODAS as tabelas e já cadastra os dados iniciais (categorias e banners padrão).
-- É idempotente: pode ser executado de novo sem apagar nada (CREATE ... IF NOT EXISTS e
-- INSERT só quando a tabela está vazia).
--
-- Como usar
--   Hospedagem (phpMyAdmin): crie o banco no painel, abra-o, aba "Importar" e envie este arquivo.
--   Linha de comando:        mysql -u USUARIO -p NOME_DO_BANCO < database/schema.sql
--   Depois crie o primeiro administrador:  php database/criar_admin.php
--
-- Bancos antigos NÃO precisam reimportar: apliquem apenas as migrações novas
--   database/migracao_v1.2_categorias.sql   e   database/migracao_v1.3_banners.sql
-- =====================================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- Usuários ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `perfil` enum('leitor','contribuidor','admin') DEFAULT 'leitor',
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `reset_token` varchar(64) DEFAULT NULL,
  `reset_expires` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- Categorias do acervo -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `categorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `slug` varchar(40) NOT NULL,
  `nome` varchar(80) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categoria_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- A lista é a mesma de includes/categorias.php (fonte única das regras de classificação).
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

-- ---------- Livros -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `livros` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `titulo` varchar(255) NOT NULL,
  `autor` varchar(255) DEFAULT NULL,
  `nome_arquivo` varchar(255) NOT NULL,
  `capa_arquivo` varchar(255) DEFAULT NULL,
  `progresso` int(11) DEFAULT 0,
  `total_paginas` int(11) DEFAULT 0,
  `porcentagem` int(11) DEFAULT 0,
  `data_upload` datetime DEFAULT current_timestamp(),
  `usuario_id` int(11) DEFAULT NULL,
  `categoria_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_usuario_livro` (`usuario_id`),
  KEY `idx_livros_categoria` (`categoria_id`),
  CONSTRAINT `fk_livro_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_usuario_livro` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- Progresso de leitura (um por usuário e livro) -----------------------------
CREATE TABLE IF NOT EXISTS `leituras` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `progresso` int(11) NOT NULL DEFAULT 1,
  `total_paginas` int(11) NOT NULL DEFAULT 0,
  `porcentagem` int(11) NOT NULL DEFAULT 0,
  `atualizado_em` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`usuario_id`,`livro_id`),
  KEY `fk_leitura_livro` (`livro_id`),
  CONSTRAINT `fk_leitura_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leitura_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- Proteção contra tentativas de login em excesso ----------------------------
CREATE TABLE IF NOT EXISTS `tentativas_login` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `ip` varchar(45) NOT NULL,
  `sucesso` tinyint(1) NOT NULL DEFAULT 0,
  `criado_em` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_criado` (`email`,`criado_em`),
  KEY `idx_ip_criado` (`ip`,`criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------- Banners do carrossel (h = faixa horizontal, v = lateral vertical) ---------
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

-- Peças de divulgação padrão (assets/promo/), mesmas nos dois formatos. Só entram se a tabela
-- estiver vazia: quem já gerenciou os banners não os vê reaparecer ao reimportar este arquivo.
INSERT INTO `banners` (`formato`, `arquivo`, `alt`, `ordem`)
SELECT * FROM (
  SELECT 'h' AS formato, 'assets/promo/biblioteca-h.webp' AS arquivo, 'Sua biblioteca: leia, organize e gerencie seus livros aqui' AS alt, 1 AS ordem UNION ALL
  SELECT 'h', 'assets/promo/app-h.webp',   'Meus Livros: toda a sua biblioteca de PDFs em qualquer tela', 2 UNION ALL
  SELECT 'h', 'assets/promo/retro-h.webp', 'Topete Game Retrô: os clássicos na TV Box, no celular, no Game Stick e no projetor', 3 UNION ALL
  SELECT 'h', 'assets/promo/livro-h.webp', 'Livro Criação de Sites e Sistemas Web: O Manual Definitivo, de Aricelio Moura', 4 UNION ALL
  SELECT 'v', 'assets/promo/biblioteca-v.webp', 'Sua biblioteca: leia, organize e gerencie seus livros aqui', 1 UNION ALL
  SELECT 'v', 'assets/promo/app-v.webp',   'Meus Livros: toda a sua biblioteca de PDFs em qualquer tela', 2 UNION ALL
  SELECT 'v', 'assets/promo/retro-v.webp', 'Topete Game Retrô: os clássicos na TV Box, no celular, no Game Stick e no projetor', 3 UNION ALL
  SELECT 'v', 'assets/promo/livro-v.webp', 'Livro Criação de Sites e Sistemas Web: O Manual Definitivo, de Aricelio Moura', 4
) AS padrao
WHERE NOT EXISTS (SELECT 1 FROM `banners`);

SET FOREIGN_KEY_CHECKS = 1;