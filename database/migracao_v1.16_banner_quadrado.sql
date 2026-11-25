-- Banner quadrado (v1.16): o anúncio passa a abrir sobre a tela (entrada, abrir e sair de um livro), no lugar da
-- faixa horizontal e da lateral. Novo formato 'q'. Rode UMA vez em bancos criados antes desta versão.
-- Os banners 'h' e 'v' continuam no banco (histórico), mas deixam de ser exibidos e gerenciados.
-- A fila quadrada começa com as peças verticais (v) já cadastradas, com os mesmos links e a mesma ordem;
-- a arte vertical aparece inteira sobre um fundo desfocado. Troque pelas artes quadradas em "Gerenciar banners".

ALTER TABLE `banners` MODIFY `formato` enum('h','v','q') NOT NULL;

INSERT INTO `banners` (`formato`, `arquivo`, `alt`, `link`, `ordem`)
SELECT 'q', `arquivo`, `alt`, `link`, `ordem` FROM `banners` WHERE `formato` = 'v'
AND NOT EXISTS (SELECT 1 FROM (SELECT 1 FROM `banners` WHERE `formato` = 'q') AS ja);
