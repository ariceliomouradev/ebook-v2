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

```powershell
node scripts/seguranca/t7_correcoes.js
```

Variáveis opcionais: `PT_BASE` (URL do sistema) e `PT_MYSQL` (caminho do `mysql.exe`).
Os specs do Cypress `12` e `13` cobrem anúncio, tema, sessão e foto de perfil.
