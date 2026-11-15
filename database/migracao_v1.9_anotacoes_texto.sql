-- Marca-texto no texto selecionado (v1.9). Rode UMA vez em bancos criados antes desta versão.
-- Instalações novas recebem isto pelo schema.sql.
--
--   tipo 'texto'  trecho de texto marcado: `rects` guarda os retângulos (uma linha cada) como frações da
--                 página em JSON [[x,y,w,h],...]; x,y,w,h guardam a caixa que envolve todos; `trecho` é o texto marcado.
--   As anotações continuam sendo de UM usuário em UM livro (ninguém mais as vê).

ALTER TABLE `anotacoes`
  MODIFY COLUMN `tipo` enum('area','nota','texto') NOT NULL DEFAULT 'area',
  ADD COLUMN `rects` text DEFAULT NULL AFTER `h`,
  ADD COLUMN `trecho` varchar(600) DEFAULT NULL AFTER `rects`;
