-- API REST de livros (v1.21): sinopse de cada livro e tokens de acesso da API.
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
--
-- livros.sinopse: texto livre (até 4000 caracteres). EPUB: vem da descrição do próprio arquivo (dc:description);
-- PDF: o administrador escreve em Gerenciar livros > Editar. `php database/preencher_sinopse.php` preenche os EPUBs já cadastrados.
--
-- api_tokens: uma linha por "sessão de API" (um app logado). Guarda só o HASH (sha256) do token de acesso (1 h) e do
-- token de renovação (30 dias); apagar a linha revoga o acesso na hora.
ALTER TABLE `livros` ADD COLUMN `sinopse` text DEFAULT NULL AFTER `autor`;

CREATE TABLE IF NOT EXISTS `api_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `access_hash` char(64) NOT NULL,
  `refresh_hash` char(64) NOT NULL,
  `access_expira` datetime NOT NULL,
  `refresh_expira` datetime NOT NULL,
  `aparelho` varchar(80) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultimo_uso` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_access` (`access_hash`),
  UNIQUE KEY `uq_api_refresh` (`refresh_hash`),
  KEY `idx_api_usuario` (`usuario_id`),
  CONSTRAINT `fk_api_tokens_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
