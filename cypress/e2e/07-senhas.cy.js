/// <reference types="cypress" />

/**
 * Política de senha, troca da própria senha e fluxo completo de recuperação
 * (solicitação → token → nova senha → login).
 *
 * Todos os testes operam sobre usuários @e2e.test; ao final, a senha padrão da
 * massa é restaurada e as sessões memorizadas são descartadas.
 */

const { USUARIOS, SENHA_PADRAO } = require('../support/dados');

const SENHA = () => SENHA_PADRAO;

/** Lê o token de reset diretamente do banco (o e-mail vai para o log em ambiente local). */
function tokenDeReset(email) {
  return cy.sql('SELECT reset_token, reset_expires FROM usuarios WHERE email = ?', [email]);
}

function solicitarReset(email) {
  cy.visit('login.php');
  cy.tid('link-esqueci-senha').click();
  cy.tid('input-email-recuperacao').type(email);
  cy.tid('btn-enviar-link-reset').click();
  cy.tid('login-alerta').should('contain.text', 'Se o e-mail estiver cadastrado');
}

describe('Senhas', () => {
  before(() => cy.semearUsuarios());

  afterEach(() => {
    // Devolve a massa ao estado conhecido — vários testes aqui trocam senhas.
    cy.semearUsuarios();
    Cypress.session.clearAllSavedSessions();
  });

  describe('Troca da própria senha', () => {
    const nova = 'MinhaNova@2026';

    beforeEach(() => {
      cy.entrarComo('leitor');
      cy.visitarBiblioteca();
      cy.tid('btn-user-menu').click();
      cy.tid('btn-menu-trocar-senha').click();
      cy.tid('modal-trocar-senha').should('be.visible');
    });

    it('troca a senha e passa a exigir a nova no login', () => {
      const email = USUARIOS.leitor.email;

      cy.tid('input-senha-atual').type(SENHA(), { log: false });
      cy.tid('input-nova-senha').type(nova, { log: false });
      cy.tid('input-confirma-senha').type(nova, { log: false });
      cy.tid('btn-salvar-nova-senha').click();

      cy.tid('alerta-mensagem').should('contain.text', 'Senha alterada');
      cy.tid('btn-fechar-alerta').click();

      Cypress.session.clearAllSavedSessions();
      cy.loginPelaUi(email, SENHA());
      cy.url().should('include', 'erro=1');

      cy.loginPelaUi(email, nova);
      cy.url().should('include', 'index.php');
    });

    it('recusa quando a senha atual está errada', () => {
      cy.tid('input-senha-atual').type('SenhaQueNaoE@1', { log: false });
      cy.tid('input-nova-senha').type(nova, { log: false });
      cy.tid('input-confirma-senha').type(nova, { log: false });
      cy.tid('btn-salvar-nova-senha').click();

      cy.tid('alerta-mensagem').should('contain.text', 'senha atual informada está incorreta');
    });

    it('recusa quando a confirmação não coincide', () => {
      cy.tid('input-senha-atual').type(SENHA(), { log: false });
      cy.tid('input-nova-senha').type(nova, { log: false });
      cy.tid('input-confirma-senha').type('Outra@Senha1', { log: false });
      cy.tid('btn-salvar-nova-senha').click();

      cy.tid('alerta-mensagem').should('contain.text', 'não coincidem');
    });

    it('bloqueia senha fraca pelo pattern do formulário', () => {
      cy.tid('input-senha-atual').type(SENHA(), { log: false });
      cy.tid('input-nova-senha').type('semforca', { log: false });
      cy.tid('input-confirma-senha').type('semforca', { log: false });
      cy.tid('btn-salvar-nova-senha').click();

      cy.tid('input-nova-senha').then(($el) => {
        expect($el[0].checkValidity(), 'senha fraca reprovada').to.be.false;
      });
    });

    it('bloqueia senha fraca também no servidor', () => {
      cy.tid('btn-fechar-modal-senha').click();
      cy.request('index.php').then((pagina) => {
        const csrf = JSON.parse(pagina.body.match(/id="app-config">\s*([\s\S]*?)\s*<\/script>/)[1]).csrfToken;
        cy.request({
          method: 'POST',
          url: 'api/mudar_senha.php',
          form: true,
          followRedirect: false,
          body: {
            csrf_token: csrf,
            senha_atual: SENHA(),
            nova_senha: 'fraquinha',
            confirma_senha: 'fraquinha',
          },
        }).then((r) => expect(r.redirectedToUrl).to.contain('msg=erro_pwd_weak'));
      });
    });

    it('revela e oculta cada campo de senha do modal', () => {
      cy.tid('input-nova-senha').type('Visivel@123', { log: false });
      cy.tid('btn-toggle-nova-senha').click();
      cy.tid('input-nova-senha').should('have.attr', 'type', 'text');
      cy.tid('btn-toggle-nova-senha').click();
      cy.tid('input-nova-senha').should('have.attr', 'type', 'password');
    });
  });

  describe('Recuperação de senha por token', () => {
    const email = () => USUARIOS.contribuidor.email;
    const nova = 'Recuperada@2026';

    it('gera um token de uso único com validade de 1 hora', () => {
      solicitarReset(email());

      tokenDeReset(email()).then((linhas) => {
        expect(linhas[0].reset_token, 'token gerado').to.match(/^[a-f0-9]{64}$/);
      });

      // A validade é medida pelo relógio do MySQL, que é o mesmo usado na
      // verificação do token (`reset_expires > NOW()`), e não pelo relógio do
      // Node — assim a asserção reflete exatamente a janela real de validade.
      cy.sql(
        'SELECT TIMESTAMPDIFF(MINUTE, NOW(), reset_expires) AS minutos FROM usuarios WHERE email = ?',
        [email()]
      ).then((linhas) => {
        const minutos = Number(linhas[0].minutos);
        expect(minutos, 'token válido a partir de agora').to.be.greaterThan(50);
        expect(
          minutos,
          'RN-07: o token deve valer 1 hora. Se este valor for muito maior, o fuso ' +
            'do PHP (date.timezone no php.ini) está adiantado em relação ao relógio ' +
            'do MySQL, que é quem valida reset_expires > NOW()'
        ).to.be.at.most(65);
      });
    });

    it('nunca expõe o link de redefinição na tela', () => {
      solicitarReset(email());
      cy.get('body').should('not.contain.text', 'redefinir_senha.php?token=');
    });

    it('permite criar a nova senha e entrar com ela', () => {
      solicitarReset(email());

      tokenDeReset(email()).then((linhas) => {
        const token = linhas[0].reset_token;
        cy.visit(`redefinir_senha.php?token=${token}`);
        cy.tid('redefinir-container').should('be.visible');
        cy.tid('input-redefinir-senha').type(nova, { log: false });
        cy.tid('input-redefinir-confirma').type(nova, { log: false });
        cy.get('[data-testid="form-salvar-nova-senha"]').submit();

        cy.url().should('include', 'msg=pwd_recovered');
        cy.tid('login-alerta').should('contain.text', 'Senha redefinida');

        cy.loginPelaUi(email(), nova);
        cy.url().should('include', 'index.php');

        // O token é de uso único: some do banco após a troca.
        tokenDeReset(email()).then((depois) => {
          expect(depois[0].reset_token, 'token invalidado').to.be.null;
        });
      });
    });

    it('recusa reutilização do mesmo token', () => {
      solicitarReset(email());

      tokenDeReset(email()).then((linhas) => {
        const token = linhas[0].reset_token;
        cy.visit(`redefinir_senha.php?token=${token}`);
        cy.tid('input-redefinir-senha').type(nova, { log: false });
        cy.tid('input-redefinir-confirma').type(nova, { log: false });
        cy.get('[data-testid="form-salvar-nova-senha"]').submit();
        cy.url().should('include', 'msg=pwd_recovered');

        cy.visit(`redefinir_senha.php?token=${token}`);
        cy.tid('msg-token-invalido').should('be.visible').and('contain.text', 'Link inválido ou expirado');
      });
    });

    it('recusa token inexistente', () => {
      cy.visit('redefinir_senha.php?token=' + 'f'.repeat(64));
      cy.tid('msg-token-invalido').should('be.visible');
      cy.get('[data-testid="form-salvar-nova-senha"]').should('not.exist');
    });

    it('recusa token expirado', () => {
      solicitarReset(email());
      // O filtro fica literal no SQL de propósito: a guarda das tasks só libera
      // escritas que declarem o escopo de teste no próprio comando.
      cy.sql("UPDATE usuarios SET reset_expires = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE email LIKE '%@e2e.test'");
      tokenDeReset(email()).then((linhas) => {
        cy.visit(`redefinir_senha.php?token=${linhas[0].reset_token}`);
        cy.tid('msg-token-invalido').should('be.visible');
      });
    });

    it('avisa quando a confirmação não coincide e mantém o formulário', () => {
      solicitarReset(email());
      tokenDeReset(email()).then((linhas) => {
        cy.visit(`redefinir_senha.php?token=${linhas[0].reset_token}`);
        cy.tid('input-redefinir-senha').type(nova, { log: false });
        cy.tid('input-redefinir-confirma').type('Diferente@2026', { log: false });
        cy.get('[data-testid="form-salvar-nova-senha"]').submit();

        cy.tid('redefinir-alerta').should('contain.text', 'não coincidem');
        cy.tid('input-redefinir-senha').should('be.visible');
      });
    });
  });
});
