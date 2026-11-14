# Meus Livros — guia para agentes

Biblioteca pessoal de PDFs: PHP 8.2+ procedural (sem framework), MySQL/MariaDB, Bootstrap 5 + JS vanilla (sem build).
O `README.md` cobre instalação e hospedagem; aqui fica só o que não é óbvio lendo o código.

## Mapa
- Páginas na raiz: `index.php` (painel), `login`, `logout`, `usuarios`, `redefinir_senha`; o leitor é `views/leitor.php` (rota `/leitor`).
- `api/*.php` endpoints (POST + CSRF; JSON quando chamados por `fetch`) · `components/` parciais · `includes/functions.php` helpers (`e()`, `url()`, CSRF, RBAC, `paginasVisiveis`) · `includes/repositorios.php` consultas · `config/bootstrap.php` inicialização única (sessão, CSP, banco).
- `assets/js/` app.js (painel), leitor.js, usuarios.js, auth-ui.js · `assets/css/style.css` (tokens `--ml-*`) e leitor.css.
- `scripts/` ferramentas Node (`importar-acervo.js`, `gerar-icones.js`) · `database/` schema, migração, `criar_admin.php`, `seed_dev.php` · `cypress/` E2E.

## Convenções que quebram se ignoradas
- **URLs amigáveis**: páginas sem `.php` (reescrita no `.htaccess`). Em PHP use `url('login.php')` → `/login`. `api/` mantém `.php`. O endereço antigo responde 301.
- `components/book_list.php` e `pagination.php` também são renderizados por `api/buscar.php`: **não** use `CAMINHO_RAIZ`/`url()` neles (`$raiz = ''`).
- **CSP** (`config/bootstrap.php`): nada de JS inline; dados do PHP vão em `<script type="application/json">`; CDN novo precisa entrar na CSP.
- Toda escrita chama `csrf_verify()`; perfil por `require_perfil([...], $json)`. Perfis: `leitor` < `contribuidor` < `admin`.
- Saída sempre com `e()`. Busca com `LIKE` sempre com `escaparLike()`.
- Listagens paginadas ordenam com **desempate por id** (`ORDENS_PERMITIDAS`): `LIMIT/OFFSET` sem desempate repete ou perde linhas.
- A lista do gerenciador vem por AJAX (`api/gerenciar_lista.php`), nunca embutida no HTML do painel (escala com o acervo).
- PHP 8.5: não use `finfo_close()`. Com `APP_DEBUG=true` um `Deprecated` é impresso dentro de respostas JSON e as corrompe.
- Expiração de token (reset de senha) é calculada no MySQL (`NOW()`), não no PHP: os fusos podem divergir.
- `data-testid` em todo elemento interativo ou verificável: **não remova nem renomeie** (o Cypress depende deles).
- Toda tela nova: foco visível, nome acessível em botões só de ícone (`aria-label`), contraste ≥ 4,5:1 (use os tokens, não cores soltas).

## Design (v2, nov/2026)
- Tema escuro com acento âmbar `#f6b445`; fonte Inter auto-hospedada (`assets/fonts/`, licença OFL). Tokens `--ml-*` no topo de `style.css`.
- O `info` do Bootstrap foi **redefinido** como o âmbar: `.btn-info`, `.text-info`, `.bg-info`, spinner e `.progress-bar.bg-info` seguem a marca sem mexer nos templates. Texto sobre âmbar usa `--ml-accent-ink`.
- Barra superior (`components/header.php`) é sticky e fica **fora** do `<main>`; a busca só existe quando a página define `$mostrarBusca = true` (só o painel).
- Painel: faixa "Continue lendo" (`listarEmAndamento`, só página 1 sem busca), contagem `#totalLivros` atualizada pelo JS, atalho `/` foca a busca.
- Carrossel de divulgação: banners na tabela `banners` (migração `database/migracao_v1.3_banners.sql`; vários por formato `h`/`v`, cada um com `link` opcional que abre em nova aba). O admin gerencia em menu do perfil > Gerenciar banners (`api/manage_banners.php`: adicionar, remover, mover, salvar_link; a resposta traz o `html` de `components/banners_gerenciador.php`). Render em `components/promo_slider.php` + `assets/js/promo.js`. Peças padrão em `assets/promo/` (`npm run promos`); uploads viram WebP em `banners/`. Links só http/https (`normalizarLinkBanner`). Mantenha a mesma quantidade em `h` e `v`. Contribuidor não vê banners.
- Categorias: tabela `categorias` + `livros.categoria_id` (migração `database/migracao_v1.2_categorias.sql`). Regras por palavras do título em `includes/categorias.php`; `php database/categorizar_acervo.php --aplicar` classifica livros sem categoria (rode depois de `npm run acervo`). Filtro `?categoria=slug` (chips em `components/categorias_chips.php`).
- Gerenciar usuários também é modal (`components/modal_usuarios.php` + `api/usuarios_gerenciar.php`, JS na seção 9 do `app.js`): lista/novo/redefinir/excluir são telas do mesmo modal, tudo por AJAX; `/usuarios` só redireciona para `?abrir=usuarios`.
- Gerenciar livros/banners ficam no menu do perfil (admin); `show.bs.modal` usa `relatedTarget` para abrir direto em banners.
- Leitor (`views/leitor.php`, `assets/css/leitor.css`, `assets/js/leitor.js`): barra superior (voltar "Biblioteca" + título + progresso + tela cheia), linha de progresso, doca de controles na base; ambas somem sozinhas (`body.inactive`). Celular: doca só com anterior/página/próxima/ajustar largura, pinça para zoom, toque nas bordas vira página, toque no centro mostra/esconde. Atalhos: ←/→, +/-, 0 (ajustar), F. Canvas usa devicePixelRatio (máx. 2): o tamanho em CSS é o que os testes medem. `requestAnimationFrame` pausado em aba oculta deixa a tarefa do PDF.js pendente, por isso há saída de segurança no "Abrindo o livro…".
- Telas de entrada usam `.auth-layout` (painel de marca + formulário). `data-testid` preservados; `login-title` agora é "Bem-vindo de volta".
- Cores do tema ficam em `head.php`, `views/leitor.php` e `manifest.webmanifest` (`#0d0f14`; leitor `#07090d`); os specs 08/09 conferem esses valores. Ícones: `npm run icones`.

## Dados e acervo
- `uploads/`, `capas/`, `banners/` e `.env` estão no `.gitignore`.
- Importação em lote: `npm run acervo -- --origem "<pasta>"` (simulação) · `--aplicar` grava · `--desfazer` reverte exatamente o que importou. Estado e relatório revisável em `database/.importacao/`.
- Nomes corrompidos (CP850) são reparados em `scripts/acervo/nomes.js`. Sem evidência, o autor fica "Autor Desconhecido": autor errado é pior que ausente.
- Desenvolvimento: `php database/seed_dev.php` cria usuários locais; as senhas ficam em `database/.dev-credenciais.txt` (nunca imprimir nem commitar).

## Testes
- `npm run test:unit` (Node, segundos) · `npm run test:e2e` (Cypress, ~8 min; exige Apache e MySQL no ar) · specs 01–09 em `cypress/e2e/`.
- A suíte só escreve em dados marcados: usuários `*@e2e.test`, livros `[E2E]*`; as tasks recusam qualquer outra escrita. **Nunca** rodar contra produção.
- `APP_URL` do `.env` vira o `baseUrl` do Cypress.

## Antes de entregar
`php -l` nos `.php` alterados · `npm run test:unit` · specs afetados do Cypress · conferir que não há PDFs nem `.env` no `git status`.
