-- Banners gerenciáveis (v1.3): vários por formato (h = faixa horizontal, v = lateral vertical).
-- Rode UMA vez em bancos criados antes desta versão. Instalações novas recebem isto pelo schema.sql.
-- Cada banner pode ter um link (abre em nova aba ao clicar). Já cadastra as 4 peças de divulgação padrão (assets/promo/) nos dois formatos, na mesma ordem.

CREATE TABLE IF NOT EXISTS `banners` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `formato` enum('h','v') NOT NULL,
  `arquivo` varchar(255) NOT NULL,
  `alt` varchar(200) NOT NULL DEFAULT '',
  `link` varchar(500) DEFAULT NULL,
  `ordem` int(11) NOT NULL DEFAULT 0,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_banners_formato_ordem` (`formato`, `ordem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
