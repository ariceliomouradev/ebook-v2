/// <reference types="cypress" />

/**
 * Endurecimento de segurança: bibliotecas dos CDNs só carregam se baterem com o hash (SRI) e o logout só vale por
 * POST com token (botão do menu). Os ataques em si ficam em scripts/seguranca/.
 */

describe('Integridade dos CDNs e logout', () => {
  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
  });
  after(() => cy.limparMassaE2E());

  it('login: Bootstrap e Font Awesome carregam com integrity', () => {
    cy.visit('login');
    cy.get('script[src*="bootstrap.bundle"]').should('have.attr', 'integrity').and('match', /^sha384-/);
    cy.window().its('bootstrap').should('exist'); // o script só roda se o hash bater
    cy.get('link[href*="font-awesome"]').should('have.attr', 'integrity');
    cy.get('link[href*="bootstrap.min.css"]').should('have.attr', 'integrity');
    // a folha de estilo foi aplicada (hash conferido): o ícone usa a fonte do Font Awesome
    cy.get('.fas, .fa, .far').first().then(($i) => {
      expect(getComputedStyle($i[0]).fontFamily).to.match(/Font Awesome/i);
    });
  });

  it('biblioteca: PDF.js carrega com integrity', () => {
    cy.entrarComo('contribuidor');
    cy.visitarBiblioteca();
    cy.get('script[src*="pdf.min.js"]').should('have.attr', 'integrity');
    cy.window().its('pdfjsLib').should('exist');
  });

  it('leitor de EPUB: JSZip e epub.js carregam com integrity', () => {
    cy.entrarComo('contribuidor');
    cy.semearLivro({ titulo: '[E2E] SRI EPUB', formato: 'epub' }).then((livro) => {
      cy.visit(`leitor?id=${livro.id}`);
      cy.get('script[src*="jszip"]').should('have.attr', 'integrity');
      cy.get('script[src*="epub.min.js"]').should('have.attr', 'integrity');
      cy.window().its('JSZip').should('exist');
      cy.window().its('ePub').should('exist');
    });
  });

  it('logout: o menu usa POST com token e encerra a sessão; GET não encerra', () => {
    cy.entrarComo('leitor');
    cy.visitarBiblioteca();
    cy.visit('logout'); // um link qualquer não pode deslogar
    cy.url().should('not.include', 'login');
    cy.visitarBiblioteca();
    cy.tid('btn-user-menu').click();
    cy.tid('btn-logout').should('have.prop', 'tagName', 'BUTTON').closest('form').should('have.attr', 'method', 'POST');
    cy.tid('btn-logout').click();
    cy.url().should('include', 'login');
    cy.visit('./');
    cy.get('[data-testid="book-grid"]').should('not.exist'); // quem não está logado vê a página de apresentação, não a biblioteca
    cy.contains('a', 'Entrar').should('exist');
  });
});
