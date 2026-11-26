-- Data de publicação do livro (v1.22): "Mais recentes" e "Mais antigos" passam a ordenar por ela, não pela data em que o
-- livro entrou na plataforma. Livros sem data ficam no fim das duas ordens.
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
--
-- EPUB: `php database/preencher_data_publicacao.php --aplicar` lê a data do próprio arquivo (dc:date) dos já cadastrados e
-- o envio novo já preenche sozinho. PDF não traz a data de publicação de forma confiável: o administrador informa em
-- Gerenciar livros > Editar (e no formulário de Novo livro).
ALTER TABLE `livros` ADD COLUMN `data_publicacao` date DEFAULT NULL AFTER `sinopse`;
ALTER TABLE `livros` ADD KEY `idx_livros_data_publicacao` (`data_publicacao`);
