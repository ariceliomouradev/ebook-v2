/// <reference types="cypress" />

/**
 * Fluxo de autenticação: login dos três perfis, mensagens genéricas de erro,
 * proteção de rota, rate limiting e logout.
 */

const { USUARIOS, SENHA_PADRAO, SUFIXO_EMAIL } = require('../support/dados');

const usuarios = () => USUARIOS;
const SENHA = () => SENHA_PADRAO;

/** Formata "agora" no formato DATETIME do MySQL, com folga de 10s. */
function instanteMysql(folgaSegundos = 10) {
  const d = new Date(Date.now() - folgaSegundos * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

describe('Autenticação', () => {
  let inicioDoTeste;

  beforeEach(() => {
    inicioDoTeste = instanteMysql();
    cy.semearUsuarios();
  });

  afterEach(() => {
    // Tentativas falhas bloqueiam o IP local por 5 minutos e derrubariam os
    // testes seguintes — as registradas por este spec são removidas.
    cy.task('db:limparTentativas', { desde: inicioDoTeste });
  });

  describe('Tela de login', () => {
    beforeEach(() => cy.visit('login.php'));

    it('apresenta identidade, formulário e link de recuperação', () => {
      cy.tid('login-container').should('be.visible');
      cy.tid('login-title').should('have.text', 'Meus Livros');
      cy.tid('login-form').should('have.attr', 'action', 'api/auth.php');
      cy.tid('login-email-input').should('have.attr', 'type', 'email').and('have.attr', 'required');
      cy.tid('login-password-input').should('have.attr', 'type', 'password');
      cy.tid('link-esqueci-senha').should('be.visible');
      cy.title().should('contain', 'Login');
    });

    it('coloca o foco no campo de e-mail ao abrir (autofocus)', () => {
      // O foco efetivo depende da janela do navegador estar ativa (o que não
      // acontece em execução headless), então a asserção é sobre o atributo —
      // e sobre o campo aceitar digitação imediata.
      cy.tid('login-email-input').should('have.attr', 'autofocus');
      cy.tid('login-email-input').focus().should('have.focus');
    });

    it('envia token CSRF no formulário', () => {
      cy.tid('login-form').find('input[name="csrf_token"]').should('have.attr', 'value').and('have.length.gte', 32);
    });

    it('não envia o formulário com campos vazios (validação nativa do navegador)', () => {
      cy.tid('login-submit-btn').click();
      cy.url().should('include', 'login.php');
      cy.tid('login-email-input').then(($el) => {
        expect($el[0].checkValidity(), 'campo e-mail inválido quando vazio').to.be.false;
      });
    });

    it('alterna a visibilidade da senha pelo botão do olho', () => {
      cy.tid('login-password-input').type('SenhaVisivel1!', { log: false });
      cy.get('[data-toggle-password]').click();
      cy.tid('login-password-input').should('have.attr', 'type', 'text');
      cy.get('[data-toggle-password]').find('i').should('have.class', 'fa-eye-slash');
      cy.get('[data-toggle-password]').click();
      cy.tid('login-password-input').should('have.attr', 'type', 'password');
    });
  });

  describe('Login por perfil', () => {
    ['admin', 'contribuidor', 'leitor'].forEach((perfil) => {
      it(`autentica o perfil ${perfil} e mostra o nível correto no menu`, () => {
        const usuario = usuarios()[perfil];
        cy.loginPelaUi(usuario.email, SENHA());

        cy.url().should('include', 'index.php');
        cy.aguardarBiblioteca();
        cy.tid('btn-user-menu').should('contain.text', usuario.nome.split(' ')[0]).click();
        cy.contains('Nível:').should('contain.text', perfil.toUpperCase());
      });
    });
  });

  describe('Credenciais inválidas', () => {
    it('rejeita senha errada com mensagem genérica', () => {
      cy.loginPelaUi(usuarios().leitor.email, 'SenhaErrada1!');
      cy.url().should('include', 'login.php?erro=1');
      cy.tid('login-alerta').should('contain.text', 'E-mail ou senha inválidos');
    });

    it('usa a mesma mensagem para e-mail inexistente (não permite enumerar contas)', () => {
      cy.loginPelaUi('nao-existe' + SUFIXO_EMAIL, 'SenhaErrada1!');
      cy.tid('login-alerta')
        .invoke('text')
        .then((t) => expect(t.trim()).to.eq('E-mail ou senha inválidos.'));
    });

    it('recusa POST em api/auth.php sem token CSRF válido', () => {
      cy.request({
        method: 'POST',
        url: 'api/auth.php',
        form: true,
        failOnStatusCode: false,
        body: { email: usuarios().admin.email, senha: SENHA(), csrf_token: 'token-falso' },
      }).then((resposta) => {
        expect(resposta.status).to.eq(400);
        expect(resposta.body).to.contain('Token de segurança inválido');
      });
    });

    it('recusa GET em api/auth.php (só POST é permitido)', () => {
      cy.request({ url: 'api/auth.php', followRedirect: false }).then((r) => {
        expect(r.status).to.eq(302);
        expect(r.redirectedToUrl).to.contain('index.php');
      });
    });
  });

  describe('Bloqueio por tentativas (rate limiting)', () => {
    it('bloqueia após 5 tentativas falhas e informa o usuário', () => {
      const alvo = usuarios().leitor.email;

      for (let i = 0; i < 5; i++) {
        cy.request({ url: 'login.php' }).then((r) => {
          const csrf = r.body.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
          cy.request({
            method: 'POST',
            url: 'api/auth.php',
            form: true,
            followRedirect: false,
            body: { csrf_token: csrf, email: alvo, senha: 'SenhaErrada' + i },
          });
        });
      }

      cy.loginPelaUi(alvo, SENHA());
      cy.url().should('include', 'erro=bloqueado');
      cy.tid('login-alerta').should('contain.text', 'Muitas tentativas');
    });

    it('libera o acesso quando o histórico de falhas é limpo', () => {
      cy.task('db:limparTentativas', { desde: instanteMysql(600) });
      cy.loginPelaUi(usuarios().leitor.email, SENHA());
      cy.url().should('include', 'index.php');
    });
  });

  describe('Proteção de rota e sessão', () => {
    it('redireciona visitante anônimo do dashboard para o login', () => {
      cy.clearCookies();
      cy.request({ url: 'index.php', followRedirect: false }).then((r) => {
        expect(r.status).to.eq(302);
        expect(r.redirectedToUrl).to.contain('login.php');
      });
    });

    it('redireciona visitante anônimo do leitor e da gestão de usuários', () => {
      cy.clearCookies();
      ['views/leitor.php?id=1', 'usuarios.php'].forEach((rota) => {
        cy.request({ url: rota, followRedirect: false }).then((r) => {
          expect(r.status, rota).to.eq(302);
          expect(r.redirectedToUrl, rota).to.contain('login.php');
        });
      });
    });

    it('manda usuário já autenticado direto para o dashboard ao abrir o login', () => {
      cy.entrarComo('leitor');
      cy.request({ url: 'login.php', followRedirect: false }).then((r) => {
        expect(r.status).to.eq(302);
        expect(r.redirectedToUrl).to.contain('index.php');
      });
    });

    it('encerra a sessão no logout e bloqueia o retorno pelo histórico', () => {
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.tid('btn-user-menu').click();
      cy.tid('btn-logout').click();

      cy.url().should('include', 'login.php');
      cy.request({ url: 'index.php', followRedirect: false })
        .its('status')
        .should('eq', 302);
      Cypress.session.clearAllSavedSessions();
    });

    it('envia cabeçalhos de segurança e anti-cache no dashboard', () => {
      cy.entrarComo('admin');
      cy.request('index.php').then((r) => {
        expect(r.headers['x-frame-options']).to.eq('DENY');
        expect(r.headers['x-content-type-options']).to.eq('nosniff');
        expect(r.headers['content-security-policy']).to.contain("frame-ancestors 'none'");
        expect(r.headers['cache-control']).to.contain('no-store');
      });
    });
  });

  describe('Recuperação de senha (solicitação)', () => {
    it('abre o modal e envia a solicitação com resposta neutra', () => {
      cy.visit('login.php');
      cy.tid('link-esqueci-senha').click();
      cy.tid('modal-esqueci-senha').should('be.visible');
      cy.tid('input-email-recuperacao').type(usuarios().leitor.email);
      cy.tid('btn-enviar-link-reset').click();

      cy.url().should('include', 'msg=reset_link_sent');
      cy.tid('login-alerta').should('contain.text', 'Se o e-mail estiver cadastrado');
    });

    it('responde igual para e-mail inexistente (sem vazar cadastro)', () => {
      cy.visit('login.php');
      cy.tid('link-esqueci-senha').click();
      cy.tid('input-email-recuperacao').type('fantasma' + SUFIXO_EMAIL);
      cy.tid('btn-enviar-link-reset').click();
      cy.tid('login-alerta').should('contain.text', 'Se o e-mail estiver cadastrado');
    });
  });
});
