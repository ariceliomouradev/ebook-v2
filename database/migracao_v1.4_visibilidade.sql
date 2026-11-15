-- Visibilidade por livro (v1.4). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   visivel_para  quais perfis (além do administrador, que vê tudo) enxergam o livro.
--                 Vazio = só o administrador (e quem enviou o livro).
--   liberar_em    data/hora de liberação: antes dela o livro fica oculto para os perfis acima.
--                 NULL = liberado agora.
-- Os livros que já existem continuam visíveis para todos, como antes.

ALTER TABLE `livros`
  ADD COLUMN `visivel_para` SET('contribuidor','leitor') NOT NULL DEFAULT 'contribuidor,leitor' AFTER `categoria_id`,
  ADD COLUMN `liberar_em` DATETIME DEFAULT NULL AFTER `visivel_para`,
  ADD KEY `idx_livros_liberar_em` (`liberar_em`);
