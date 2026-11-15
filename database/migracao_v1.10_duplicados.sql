-- Livros repetidos (v1.10). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
-- O hash do arquivo só pega cópias IDÊNTICAS. Estes campos pegam o mesmo livro em arquivos diferentes
-- (outra digitalização, título com/sem acento, etc.):
--   titulo_chave / autor_chave  título e autor sem acento, pontuação, artigos e maiúsculas
--   capa_hash                   "impressão digital" visual da capa (dHash de 64 bits, 16 hex)
--   duplicado_de                id do livro "original": quem não é administrador NÃO vê o duplicado
--                               (o administrador vê e decide; nada é apagado).

ALTER TABLE `livros`
  ADD COLUMN `titulo_chave` varchar(255) DEFAULT NULL AFTER `hash_arquivo`,
  ADD COLUMN `autor_chave` varchar(255) DEFAULT NULL AFTER `titulo_chave`,
  ADD COLUMN `capa_hash` char(16) DEFAULT NULL AFTER `autor_chave`,
  ADD COLUMN `duplicado_de` int(11) DEFAULT NULL AFTER `capa_hash`,
  ADD KEY `idx_livros_titulo_chave` (`titulo_chave`),
  ADD KEY `idx_livros_duplicado_de` (`duplicado_de`);
