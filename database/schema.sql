-- Schema do banco `biblioteca_pdf`.
-- Este arquivo documenta e versiona a estrutura usada pela aplicação.

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
  PRIMARY KEY (`id`),
  KEY `fk_usuario_livro` (`usuario_id`),
  CONSTRAINT `fk_usuario_livro` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Progresso de leitura por usuário (antes armazenado só em `livros`, o que fazia dois
-- leitores do mesmo livro sobrescreverem o progresso um do outro).
CREATE TABLE IF NOT EXISTS `leituras` (
  `usuario_id` int(11) NOT NULL,
  `livro_id` int(11) NOT NULL,
  `progresso` int(11) NOT NULL DEFAULT 1,
  `total_paginas` int(11) NOT NULL DEFAULT 0,
  `porcentagem` int(11) NOT NULL DEFAULT 0,
  `atualizado_em` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`usuario_id`, `livro_id`),
  KEY `fk_leitura_livro` (`livro_id`),
  CONSTRAINT `fk_leitura_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leitura_livro` FOREIGN KEY (`livro_id`) REFERENCES `livros` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Histórico de tentativas de login, usado para bloqueio progressivo (rate limiting).
CREATE TABLE IF NOT EXISTS `tentativas_login` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `ip` varchar(45) NOT NULL,
  `sucesso` tinyint(1) NOT NULL DEFAULT 0,
  `criado_em` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_criado` (`email`, `criado_em`),
  KEY `idx_ip_criado` (`ip`, `criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
