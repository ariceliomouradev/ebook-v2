-- Banners quadrados de venda (v1.17): troca as peças verticais copiadas pela v1.16 por artes quadradas (1080 x 1080)
-- com texto e design pensados para converter: Meus Livros Pro (2 ângulos), Topete Game Retrô, livro e MALU.
-- Só mexe nas peças padrão ainda intactas (assets/promo/*-v.webp); banners enviados pelo administrador ficam como estão.
-- Os dois primeiros levam ao WhatsApp do suporte (troque o número no link em "Gerenciar banners" se o seu for outro).
-- Rode UMA vez; é seguro repetir (não duplica).

DELETE FROM `banners` WHERE `formato` = 'q' AND `arquivo` LIKE 'assets/promo/%-v.webp';

INSERT INTO `banners` (`formato`, `arquivo`, `alt`, `link`, `ordem`)
SELECT 'q', n.arquivo, n.alt, n.link, n.ordem FROM (
  SELECT 'assets/promo/q-pro-leia.webp' AS arquivo, 'Meus Livros Pro: leia sem anúncios, com mais de 1.500 livros em qualquer tela, por R$ 25 por mês' AS alt, 'https://wa.me/5585986920243?text=Ol%C3%A1%21%20Quero%20assinar%20o%20plano%20Pro%20do%20Meus%20Livros.' AS link, 1 AS ordem UNION ALL
  SELECT 'assets/promo/q-retro.webp', 'Topete Game Retrô: os clássicos na TV Box, no celular, no Game Stick e no projetor', NULL, 2 UNION ALL
  SELECT 'assets/promo/q-pro-familia.webp', 'Meus Livros Pro: 3 pessoas, 1 plano, sem anúncios, por R$ 25 por mês', 'https://wa.me/5585986920243?text=Ol%C3%A1%21%20Quero%20o%20plano%20Pro%20para%20a%20minha%20fam%C3%ADlia.', 3 UNION ALL
  SELECT 'assets/promo/q-livro.webp', 'Livro Criação de Sites e Sistemas Web: O Manual Definitivo, de Aricelio Moura', NULL, 4 UNION ALL
  SELECT 'assets/promo/q-malu.webp', 'MALU Online Store: sua loja online no ar, com pedido pelo WhatsApp, a partir de R$ 39,90 por mês', NULL, 5
) AS n
WHERE NOT EXISTS (SELECT 1 FROM `banners` b WHERE b.`formato` = 'q' AND b.`arquivo` = n.arquivo);
