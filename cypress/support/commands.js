/// <reference types="cypress" />

/**
 * Comandos compartilhados pela suíte de regressão E2E.
 *
 * Regra de ouro desta suíte: nenhum teste altera ou apaga dado real. Todo
 * usuário criado termina em `@e2e.test` e todo livro criado começa com `[E2E]`;
 * as tasks do cypress.config.js recusam escritas fora desse escopo.
 */

const { USUARIOS, SENHA_PADRAO, PREFIXO_TITULO } = require('./dados');

const usuarios = () => USUARIOS;
const SENHA = () => SENHA_PADRAO;

// ---------------------------------------------------------------------------
// Seletores e utilidades
// ---------------------------------------------------------------------------

/** Atalho para os 157 atributos data-testid já presentes na aplicação. */
Cypress.Commands.add('tid', (testid, opcoes = {}) =>
  cy.get(`[data-testid="${testid}"]`, opcoes)
);

Cypress.Commands.add('tidDentro', { prevSubject: 'element' }, (sujeito, testid) =>
  cy.wrap(sujeito).find(`[data-testid="${testid}"]`)
);

/** Consulta o banco da aplicação (SELECT livre; escritas passam por guarda de escopo). */
Cypress.Commands.add('sql', (sql, params = []) => cy.task('db:query', { sql, params }));

// ---------------------------------------------------------------------------
// Massa de dados
// ---------------------------------------------------------------------------

/** Garante que os três usuários de teste existam com a senha padrão. */
Cypress.Commands.add('semearUsuarios', () =>
  cy.task('db:seedUsuarios', { usuarios: usuarios() })
);

/** Cria um livro descartável (arquivo + registro) e devolve os dados dele. */
Cypress.Commands.add('semearLivro', (opcoes = {}) => {
  const sufixo = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  return cy.task('db:seedLivro', {
    titulo: opcoes.titulo || `${PREFIXO_TITULO} Livro ${sufixo}`,
    autor: opcoes.autor || `Autor E2E ${sufixo}`,
    emailDono: opcoes.emailDono || usuarios().admin.email,
    comCapa: opcoes.comCapa !== false,
  });
});

/**
 * Devolve o livro informado se ele ainda existir no banco; caso contrário cria
 * outro. Specs que guardam um livro em variável entre testes usam isto para não
 * dependerem de um id que outro teste (ou uma nova tentativa após falha) tenha
 * removido.
 */
Cypress.Commands.add('garantirLivro', (livroAtual, opcoes = {}) => {
  if (!livroAtual) return cy.semearLivro(opcoes);

  return cy
    .sql('SELECT id FROM livros WHERE id = ?', [livroAtual.id])
    .then((linhas) => (linhas.length ? livroAtual : cy.semearLivro(opcoes)));
});

/** Apaga toda a massa criada pela suíte (e somente ela). */
Cypress.Commands.add('limparMassaE2E', () => cy.task('db:limpar'));

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

/** Lê o token CSRF de um formulário já renderizado na página atual. */
Cypress.Commands.add('tokenCsrfDaPagina', (url = 'login.php') =>
  cy.request(url).then((resposta) => {
    const casamento = resposta.body.match(/name="csrf_token" value="([a-f0-9]+)"/);
    expect(casamento, `token CSRF presente em ${url}`).to.not.be.null;
    return casamento[1];
  })
);

/**
 * Login rápido por requisição (sem passar pela UI), memorizado por perfil com
 * cy.session — os testes de UX do login usam `loginPelaUi`, este aqui é só o
 * atalho para chegar autenticado nos demais fluxos.
 */
Cypress.Commands.add('entrarComo', (perfil) => {
  const usuario = usuarios()[perfil];
  expect(usuario, `perfil conhecido: ${perfil}`).to.exist;

  cy.session(
    ['usuario-e2e', perfil],
    () => {
      cy.tokenCsrfDaPagina('login.php').then((csrf) => {
        cy.request({
          method: 'POST',
          url: 'api/auth.php',
          form: true,
          body: { csrf_token: csrf, email: usuario.email, senha: SENHA() },
        });
      });
      cy.request('index.php').its('status').should('eq', 200);
    },
    {
      validate() {
        cy.request({ url: 'index.php', followRedirect: false })
          .its('status')
          .should('eq', 200);
      },
      cacheAcrossSpecs: true,
    }
  );
});

/**
 * Login pela interface, exatamente como o usuário faz. Começa sempre de uma
 * sessão limpa — do contrário login.php redirige para o dashboard e o
 * formulário nem chega a ser exibido.
 */
Cypress.Commands.add('loginPelaUi', (email, senha) => {
  Cypress.session.clearAllSavedSessions();
  cy.clearCookies();
  cy.visit('login.php');
  cy.tid('login-email-input').clear().type(email);
  cy.tid('login-password-input').clear().type(senha, { log: false });
  cy.tid('login-submit-btn').click();
});

/** Espera o loader global sumir antes de interagir com o dashboard. */
Cypress.Commands.add('aguardarBiblioteca', () => {
  cy.tid('global-loader').should('have.class', 'loader-hidden');
  cy.tid('book-grid').should('exist');
});

/** Visita o dashboard já autenticado e com o loader resolvido. */
Cypress.Commands.add('visitarBiblioteca', (query = '') => {
  cy.visit('index.php' + query);
  cy.aguardarBiblioteca();
});

// ---------------------------------------------------------------------------
// UX / responsividade
// ---------------------------------------------------------------------------

/** Falha se a página produzir rolagem horizontal no viewport atual. */
Cypress.Commands.add('semRolagemHorizontal', (tolerancia = 2) => {
  cy.window().then((win) => {
    const doc = win.document.documentElement;
    expect(
      doc.scrollWidth,
      `sem rolagem horizontal em ${win.innerWidth}px (scrollWidth vs clientWidth)`
    ).to.be.at.most(doc.clientWidth + tolerancia);
  });
});

/** Verifica que o elemento tem área de toque confortável (>= 32px de altura). */
Cypress.Commands.add('alvoDeToqueConfortavel', { prevSubject: 'element' }, (sujeito, minimo = 32) => {
  const altura = sujeito[0].getBoundingClientRect().height;
  expect(altura, 'altura do alvo de toque').to.be.at.least(minimo);
  return cy.wrap(sujeito);
});

/** Verifica que o elemento está inteiramente dentro do viewport horizontalmente. */
Cypress.Commands.add('dentroDoViewport', { prevSubject: 'element' }, (sujeito) => {
  cy.window().then((win) => {
    const caixa = sujeito[0].getBoundingClientRect();
    expect(caixa.left, 'borda esquerda dentro do viewport').to.be.at.least(-1);
    expect(caixa.right, 'borda direita dentro do viewport').to.be.at.most(win.innerWidth + 1);
  });
  return cy.wrap(sujeito);
});

/** Coleta erros de console durante a visita da página. */
Cypress.Commands.add('visitarColetandoErros', (url, coletor) => {
  cy.visit(url, {
    onBeforeLoad(win) {
      cy.stub(win.console, 'error').callsFake((...args) => {
        coletor.push(args.map(String).join(' '));
      });
    },
  });
});
