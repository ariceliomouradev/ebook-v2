# API REST — Meus Livros (v1)

Serviço para outros aplicativos (e estudos) consumirem o acervo: **título, autor, sinopse, capa e o próprio arquivo (PDF/EPUB)** de cada livro, com a **mesma regra de acesso do site** (quem não vê um livro no site não o vê na API).

- Base: `https://meuslivros.ariceliomoura.com.br/api/v1` (local: `http://localhost/meus_livros/api/v1`)
- Formato: JSON UTF-8, nomes de campos em português.
- Autenticação: **Bearer token**. O login é e-mail + senha da conta do site.
- Testar no Postman: importe `postman/Meus Livros API.postman_collection.json` e um ambiente (`postman/Meus Livros - Local|Producao.postman_environment.json`), preencha `email` e `senha` e rode **Entrar (obter token)**; os outros pedidos já usam o token sozinhos. A coleção é gerada por `node scripts/gerar-postman.js`.

## Fluxo em 4 passos

```bash
# 1) entrar
curl -s -X POST "$BASE/auth/token" -H "Content-Type: application/json" \
     -d '{"email":"voce@exemplo.com","senha":"SUA_SENHA","aparelho":"meu-app"}'
# -> {"access_token":"ml_…","expira_em":3600,"refresh_token":"ml_…","usuario":{…}}

# 2) listar livros (token no cabeçalho)
curl -s "$BASE/livros?busca=quixote&por_pagina=5" -H "Authorization: Bearer $ACCESS"

# 3) abrir capa e arquivo: os links do JSON já vêm assinados (valem 1 hora, sem cabeçalho)
curl -s -o capa.png  "<capa_url do livro>"
curl -s -o livro.pdf "<arquivo_url do livro>"

# 4) quando o access_token vencer (401), renovar
curl -s -X POST "$BASE/auth/refresh" -H "Content-Type: application/json" -d '{"refresh_token":"ml_…"}'
```

- **access_token**: vale 1 hora. **refresh_token**: vale 30 dias e é **de uso único** (cada renovação devolve um par novo; o antigo morre). Guarde os dois com segurança no aplicativo (Keychain/Keystore), nunca em URL ou log.
- Até 10 aparelhos/aplicativos logados por conta ao mesmo tempo (o mais antigo sai).
- Tudo é revogado na hora quando: o administrador bloqueia a conta ou muda o plano, a senha é trocada/redefinida, a conta é excluída ou o aplicativo chama `logout`.

## Rotas

| Método e rota | O que faz |
|---|---|
| `GET /status` | saúde do serviço (sem login) |
| `GET /` | lista de rotas (sem login) |
| `POST /auth/token` | `{email, senha, aparelho?}` → tokens. Aceita JSON ou formulário |
| `POST /auth/refresh` | `{refresh_token}` → novo par de tokens |
| `POST /auth/logout` | revoga o token atual (`?todos=1` revoga todos os aparelhos) |
| `GET /me` | usuário, plano, limite diário e quantos livros foram abertos hoje |
| `GET /categorias` | `[{slug, nome, total}]` só com os livros que você pode ver |
| `GET /livros` | lista paginada (filtros abaixo) |
| `GET /livros/{id}` | um livro |
| `GET /livros/{id}/capa` | imagem PNG da capa (404 `sem_capa` se não tiver) |
| `GET /livros/{id}/arquivo` | o PDF/EPUB. Aceita `Range`; `?download=1` envia como anexo |
| `PUT /livros/{id}/favorito` · `DELETE …` | marca/desmarca favorito |
| `GET /livros/{id}/progresso` · `PUT …` | lê/grava `{pagina, total, posicao?}` (o `%` é calculado) |

### Filtros de `GET /livros`

`busca` (título, autor e sinopse) · `autor` · `categoria` (slug) · `formato` (`pdf`|`epub`) · `favoritos=1` · `ordem` (`recentes`|`antigos`|`az`|`za`) · `pagina` · `por_pagina` (até 50, padrão 20).

### O livro

```json
{
  "id": 123,
  "titulo": "Dom Quixote das Crianças",
  "autor": "Monteiro Lobato",
  "sinopse": "…ou null",
  "formato": "epub",
  "categoria": {"slug": "infantil", "nome": "Infantojuvenil"},
  "enviado_em": "2026-11-24T18:03:11-03:00",
  "capa_url": "https://…/api/v1/livros/123/capa?u=6&exp=1795…&sig=…",
  "arquivo_url": "https://…/api/v1/livros/123/arquivo?u=6&exp=1795…&sig=…",
  "arquivo_tipo": "application/epub+zip",
  "arquivo_tamanho": 27394048,
  "progresso": {"porcentagem": 25, "pagina": 5, "total": 20, "posicao": null},
  "favorito": false
}
```

`sinopse` e os demais textos são **texto simples**: escape-os ao exibir em HTML (o site faz isso).

A lista vem em `{"dados": […], "meta": {pagina, por_pagina, total, total_paginas}, "links": {anterior, proxima}}`.

`capa_url` e `arquivo_url` são **links assinados** (HMAC) amarrados ao usuário e ao livro, válidos por 1 hora: servem direto em `<img src>`, num leitor de PDF ou no player, sem cabeçalho. Pedir o JSON do livro de novo gera links novos. Também dá para chamar as mesmas rotas com o Bearer token em vez do link.

## Erros

Sempre `{"erro": {"codigo": "…", "mensagem": "…"}}`:

| HTTP | codigo | quando |
|---|---|---|
| 400 | `json_invalido` | corpo JSON quebrado |
| 401 | `nao_autorizado`, `token_invalido_ou_expirado`, `credenciais_invalidas`, `refresh_invalido` | sem token, token vencido ou senha errada |
| 402 | `assinatura_vencida` | teste/plano vencido (quando a cobrança está ligada) |
| 403 | `conta_bloqueada`, `email_nao_confirmado`, `troca_de_senha_necessaria` | conta sem acesso |
| 404 | `livro_nao_encontrado`, `sem_capa`, `arquivo_ausente`, `rota_nao_encontrada` | também para livro que você não pode ver |
| 405 | `metodo_nao_permitido` | traz o cabeçalho `Allow` |
| 422 | `dados_invalidos`, `parametro_invalido`, `limite_favoritos` | parâmetro fora do permitido |
| 429 | `muitas_tentativas`, `limite_diario` | 5 senhas erradas (aguarde 5 min) ou limite diário de livros |
| 500 | `erro_interno` | falha no servidor |

## Limites e regras

- **Livros diferentes abertos por dia** (rota `/arquivo`): Grátis 40, Pro 100, Administrador sem limite. Reabrir o mesmo livro no mesmo dia não gasta o limite. É o mesmo contador do site.
- **Login**: 5 senhas erradas do mesmo e-mail e IP travam por 5 minutos (e há limites por e-mail e por IP).
- **Visibilidade**: Grátis e Pro veem só o que o administrador liberou para o plano (e os próprios envios); o administrador vê o acervo aprovado.
- A API **não usa cookie nem sessão** e, por isso, não precisa de CSRF; o cookie do site não autentica na API.

## Configuração (`.env`)

```
APP_URL=https://meuslivros.ariceliomoura.com.br/   # base dos links assinados
API_SEGREDO=<32+ caracteres aleatórios>              # assina capa_url/arquivo_url (trocar invalida os links já emitidos)
API_CORS_ORIGINS=https://meuapp.exemplo.com           # só para app web em outro domínio (vírgula separa; * libera tudo). App nativo e Postman não precisam
```

Migração: `database/migracao_v1.21_api_sinopse.sql` (coluna `livros.sinopse` e tabela `api_tokens`). Sinopse dos EPUBs: `php database/preencher_sinopse.php --aplicar`; dos PDFs, o administrador escreve em Gerenciar livros → Editar.

## Para quem for construir o aplicativo

1. Guarde `access_token`, `refresh_token` e a hora de expiração; renove antes de vencer ou ao receber `401 token_invalido_ou_expirado`.
2. Mostre a lista com `GET /livros`, a capa com `capa_url` e abra o livro baixando `arquivo_url` (PDF → PDF.js/PDFKit; EPUB → epub.js/Readium).
3. Salve o ponto de leitura com `PUT /livros/{id}/progresso` (EPUB: mande também `posicao`) e o app e o site passam a mostrar o mesmo progresso.
4. Trate `429 limite_diario` mostrando a mensagem da API.
