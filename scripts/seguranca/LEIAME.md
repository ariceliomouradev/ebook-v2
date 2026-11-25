# Testes de segurança (somente ambiente LOCAL)

Scripts de ataque simulado usados no relatório de segurança de 25/11/2026. **Rode só contra a sua máquina** (`http://localhost/meus_livros/`), nunca contra a produção: eles criam e apagam dados marcados (`[E2E]`, `@e2e.test`), fazem força bruta e geram carga.

Pré-requisitos: Apache + MySQL do XAMPP no ar, usuários de teste semeados (`npm run test:e2e -- --spec cypress/e2e/07-senhas.cy.js` os cria) e Node 22.

| Script | O que ataca |
|---|---|
| `t1_exposicao.js` | arquivos sensíveis por HTTP (`.env`, `.git`, `schema.sql`…), cabeçalhos, endpoints sem login |
| `t2_authz.js` | CSRF, permissões por plano, IDOR, XSS refletido e armazenado, sessão |
| `t3_auth.js` | logout, cadastro, força bruta, enumeração, redefinição de senha, troca de senha |
| `t4_sqli.js` | SQL injection em todos os parâmetros (21 payloads, segunda ordem) |
| `t5_upload.js` | upload (PHP disfarçado, XXE, zip bomb, imagens gigantes, fotos falsas) |
| `t6_carga.js` | carga e abuso (gasta muita porta do Windows: o script espera o `TIME_WAIT` baixar) |
| `t7_correcoes.js` | reteste das correções de 25/11 (Host do reset, força bruta, token em hash…) |
| `t8_pendentes.js` | limite diário de livros, logout por POST, sessões fora do site, página de erro do banco, confirmação de e-mail |
| `t9_api.js` | API REST v1: login, tokens, lista, capa, arquivo, favoritos, progresso, visibilidade, SQL injection, páginas amigáveis no navegador |
| `t10_postman.js` | confere a coleção do Postman SEM o Postman (replay local de todos os pedidos e testes) |
| `t11_postman_producao.js` | roda a coleção contra um servidor REAL (ex.: produção) com uma **conta de teste**, sem tocar no banco |

```powershell
node scripts/seguranca/t7_correcoes.js
```

Variáveis opcionais: `PT_BASE` (URL do sistema) e `PT_MYSQL` (caminho do `mysql.exe`).
Os specs do Cypress `12`, `13` e `14` cobrem anúncio, tema, sessão, foto de perfil, SRI e logout.

## Testar a API em produção com uma conta de teste (`t11`)

Os scripts `t1`–`t10` são só para a máquina local. O `t11` é o único que pode apontar para a produção, e só faz o que o Postman faria (login, leitura, favorito e progresso):

```powershell
$env:PT_EMAIL = 'conta-de-teste@exemplo.com'   # uma conta criada SÓ para o teste
$env:PT_SENHA = '...'                          # nunca use a senha da sua conta real
node scripts/seguranca/t11_postman_producao.js
Remove-Item Env:PT_EMAIL, Env:PT_SENHA
```

Ele não imprime a senha nem os tokens e revoga o token no final. Depois, apague a conta de teste (Gerenciar usuários). `PT_AMBIENTE` troca o ambiente do Postman usado (padrão: produção).
