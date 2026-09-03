-- Migração aplicada sobre um banco `biblioteca_pdf` já existente (v1.0.3 -> v1.1).
-- Cria as tabelas novas e migra o progresso de leitura hoje armazenado em `livros`
-- para a tabela `leituras`, atribuindo-o ao usuário administrador (dono original do acervo).

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

-- Migra o progresso existente (id do primeiro admin cadastrado) e zera os campos legados de `livros`.
INSERT INTO leituras (usuario_id, livro_id, progresso, total_paginas, porcentagem)
SELECT (SELECT id FROM usuarios WHERE perfil = 'admin' ORDER BY id ASC LIMIT 1), id, progresso, total_paginas, porcentagem
FROM livros
WHERE progresso > 0
ON DUPLICATE KEY UPDATE progresso = VALUES(progresso), total_paginas = VALUES(total_paginas), porcentagem = VALUES(porcentagem);
