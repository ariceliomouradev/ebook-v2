-- Suporte a EPUB (v1.15). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql; bancos antigos também pelo atualizar_banco_v3.sql.
--
--   livros.formato    'pdf' (padrão: todos os livros que já existem) ou 'epub'.
--   leituras.posicao  onde a pessoa parou num EPUB (CFI do epub.js). EPUB não tem páginas fixas,
--                     então `progresso`/`total_paginas` guardam a fração lida em milésimos (1..1000).

ALTER TABLE `livros`
  ADD COLUMN `formato` enum('pdf','epub') NOT NULL DEFAULT 'pdf' AFTER `nome_arquivo`;

ALTER TABLE `leituras`
  ADD COLUMN `posicao` varchar(500) DEFAULT NULL AFTER `porcentagem`;
