/// <reference types="cypress" />

/**
 * Anúncio quadrado (Administrador e Grátis veem; Pro não), tema claro/escuro/papel e login que dura 4 horas.
 * Nomes dos planos: admin = Administrador, leitor = Grátis, contribuidor = Pro.
 */

describe('Anúncio, tema e sessão', () => {
  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
    globalThis.__comAnuncio = true;
  });
  after(() => {
    globalThis.__comAnuncio = false;
    cy.limparMassaE2E();
  });

  const entrarNaBiblioteca = (perfil) => {
    cy.entrarComo(perfil);
    cy.visit('./');
  };

  describe('anúncio', () => {
    it('Administrador vê o anúncio ao entrar e fecha no X', () => {
      entrarNaBiblioteca('admin');
      cy.tid('anuncio').should('be.visible');
      cy.tid('anuncio-fechar').should('be.visible').click();
      cy.tid('anuncio').should('not.be.visible');
    });

    it('plano Grátis também vê o anúncio', () => {
      entrarNaBiblioteca('leitor');
      cy.tid('anuncio').should('be.visible');
      cy.get('body').type('{esc}');
      cy.tid('anuncio').should('not.be.visible');
    });

    it('plano Pro nunca vê o anúncio', () => {
      entrarNaBiblioteca('contribuidor');
      cy.tid('book-grid').should('exist');
      cy.get('[data-testid="anuncio"]').should('not.exist');
    });

    it('recarregar a biblioteca não reabre o anúncio', () => {
      entrarNaBiblioteca('admin');
      cy.tid('anuncio-fechar').click();
      cy.reload();
      cy.tid('book-grid').should('exist');
      cy.tid('anuncio').should('not.be.visible');
    });

    it('abre ao entrar num livro e de novo ao voltar para a biblioteca', () => {
      cy.semearLivro({ titulo: '[E2E] Anuncio Leitor' }).then((livro) => {
        entrarNaBiblioteca('admin');
        cy.tid('anuncio-fechar').click();
        cy.visit(`leitor?id=${livro.id}`);
        cy.tid('anuncio').should('be.visible');
        cy.tid('anuncio-fechar').click();
        cy.tid('btn-back-library').click();
        cy.tid('anuncio').should('be.visible');
        cy.tid('anuncio-fechar').click();
        cy.tid('anuncio').should('not.be.visible');
      });
    });

    it('a lateral e a faixa de banners não existem mais', () => {
      entrarNaBiblioteca('admin');
      cy.get('[data-testid="sidebar-container"], [data-testid="banner-horizontal-container"]').should('not.exist');
    });
  });

  describe('tema', () => {
    it('troca entre claro, escuro e papel e lembra a escolha', () => {
      entrarNaBiblioteca('contribuidor');
      cy.get('html').should('have.attr', 'data-tema', 'escuro');
      cy.tid('btn-tema').click();
      cy.tid('tema-papel').click();
      cy.get('html').should('have.attr', 'data-tema', 'papel').and('have.attr', 'data-bs-theme', 'light');
      cy.reload();
      cy.get('html').should('have.attr', 'data-tema', 'papel');
      cy.tid('btn-tema').click();
      cy.tid('tema-claro').click();
      cy.get('html').should('have.attr', 'data-tema', 'claro');
      cy.tid('btn-tema').click();
      cy.tid('tema-escuro').click();
      cy.get('html').should('have.attr', 'data-tema', 'escuro').and('have.attr', 'data-bs-theme', 'dark');
    });
  });

  describe('sessão', () => {
    it('o cookie de login dura 4 horas (e não some ao fechar o navegador)', () => {
      entrarNaBiblioteca('contribuidor');
      cy.getCookie('PHPSESSID').should((c) => {
        expect(c, 'cookie de sessão').to.exist;
        const segundos = c.expiry - Math.floor(Date.now() / 1000);
        expect(segundos, 'segundos até expirar').to.be.within(14000, 14500);
      });
    });

    it('a rota de manter o login responde para quem está logado', () => {
      entrarNaBiblioteca('contribuidor');
      cy.window().then((win) => {
        const csrf = JSON.parse(win.document.getElementById('app-config').textContent).csrfToken;
        cy.request({ method: 'POST', url: 'api/ping.php', headers: { 'X-CSRF-Token': csrf } }).its('body.success').should('eq', true);
      });
    });
  });
});
