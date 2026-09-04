/// <reference types="cypress" />

/**
 * Responsividade em celular, tablet e desktop.
 *
 * Pontos de corte do Bootstrap usados pela aplicação:
 *   grid de livros  row-cols-2 (xs) → md-3 (≥768) → lg-4 (≥992) → xl-5 (≥1200)
 *   banner horizontal  d-xl-none  (some a partir de 1200)
 *   sidebar            col-xl-2   (aparece a partir de 1200)
 *   escala do leitor   0.8 (<576) / 1.1 (<992) / 1.4 (≥992)
 */

const { PREFIXO_TITULO } = require('../support/dados');

const PREFIXO = () => PREFIXO_TITULO;

const VIEWPORTS = [
  { nome: 'celular', largura: 375, altura: 812, colunas: 2, sidebar: false },
  { nome: 'tablet retrato', largura: 768, altura: 1024, colunas: 3, sidebar: false },
  { nome: 'tablet paisagem', largura: 1024, altura: 768, colunas: 4, sidebar: false },
  { nome: 'desktop', largura: 1440, altura: 900, colunas: 5, sidebar: true },
];

/** Conta quantos cards compartilham a mesma linha (mesmo offsetTop do primeiro). */
function contarColunasDaPrimeiraLinha() {
  return cy.tid('book-item').then(($itens) => {
    const topoInicial = $itens[0].getBoundingClientRect().top;
    return [...$itens].filter((el) => Math.abs(el.getBoundingClientRect().top - topoInicial) < 5).length;
  });
}

describe('Responsividade', () => {
  let livro;

  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
    cy.semearLivro({ titulo: `${PREFIXO()} Responsivo ${Date.now().toString().slice(-6)}` }).then(
      (l) => (livro = l)
    );
  });

  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.garantirLivro(livro, { titulo: `${PREFIXO()} Responsivo` }).then((l) => (livro = l));
  });

  VIEWPORTS.forEach(({ nome, largura, altura, colunas, sidebar }) => {
    describe(`${nome} (${largura}x${altura})`, () => {
      beforeEach(() => {
        cy.viewport(largura, altura);
        cy.entrarComo('admin');
        cy.visitarBiblioteca();
      });

      it('não gera rolagem horizontal', () => {
        cy.semRolagemHorizontal();
      });

      it(`organiza a grade em ${colunas} colunas`, function () {
        cy.tid('book-item').then(($itens) => {
          if ($itens.length < colunas) this.skip();
        });
        contarColunasDaPrimeiraLinha().should('eq', colunas);
      });

      it(`${sidebar ? 'mostra a sidebar e esconde' : 'esconde a sidebar e mostra'} o banner horizontal`, () => {
        if (sidebar) {
          cy.tid('sidebar-container').should('be.visible');
          cy.tid('banner-horizontal-container').should('not.be.visible');
        } else {
          cy.tid('banner-horizontal-container').should('be.visible');
          cy.tid('sidebar-container').should('not.be.visible');
        }
      });

      it('mantém busca, ordenação e ações do cabeçalho acessíveis', () => {
        cy.tid('input-busca-principal').should('be.visible').dentroDoViewport();
        cy.tid('select-ordenacao').should('be.visible').dentroDoViewport();
        cy.tid('btn-novo-livro').should('be.visible').dentroDoViewport();
        cy.tid('btn-user-menu').should('be.visible').dentroDoViewport();
      });

      it('mantém os cards inteiros dentro da tela', () => {
        cy.tid('book-item').first().dentroDoViewport();
        cy.tid('book-title').first().should('be.visible');
      });

      it('exibe a paginação utilizável', () => {
        cy.tid('pagination-container').should('be.visible').dentroDoViewport();
        cy.tid('page-current-num').should('be.visible');
        // O status textual é detalhe secundário: escondido em telas pequenas.
        cy.tid('pagination-status-info').should(largura > 768 ? 'be.visible' : 'not.be.visible');
      });

      it('abre o modal de novo livro cabendo na tela', () => {
        cy.tid('btn-novo-livro').click();
        cy.tid('modal-add-book').should('be.visible');
        cy.tid('input-book-title').should('be.visible').dentroDoViewport();
        cy.tid('btn-submit-new-book').should('be.visible').dentroDoViewport();
        cy.semRolagemHorizontal();
        cy.tid('btn-close-modal-add').click();
      });

      it('abre o gerenciador com a lista legível', () => {
        cy.tid('btn-abrir-gerenciador').click();
        cy.tid('modal-manager').should('be.visible');
        cy.tid('input-busca-gerenciador').should('be.visible').dentroDoViewport();
        cy.get('[data-testid="item-gerenciador"]').first().dentroDoViewport();
        cy.get('[data-testid="btn-editar-item"]').first().alvoDeToqueConfortavel(30);
        cy.semRolagemHorizontal();
      });

      it('apresenta a gestão de usuários sem estourar a largura', () => {
        cy.visit('usuarios');
        cy.tid('tabela-usuarios').should('be.visible');
        cy.tid('linha-usuario').first().should('be.visible');
        cy.semRolagemHorizontal();
      });

      it('mantém a tela de login centralizada e utilizável', () => {
        cy.visit('logout');
        cy.visit('login');
        cy.tid('login-container').should('be.visible').dentroDoViewport();
        cy.tid('login-submit-btn').alvoDeToqueConfortavel(38);
        cy.semRolagemHorizontal();
        Cypress.session.clearAllSavedSessions();
      });
    });
  });

  describe('Leitor de PDF em cada tamanho de tela', () => {
    const escalas = [
      { largura: 375, altura: 812, zoom: '80%' },
      { largura: 768, altura: 1024, zoom: '110%' },
      { largura: 1440, altura: 900, zoom: '140%' },
    ];

    escalas.forEach(({ largura, altura, zoom }) => {
      it(`usa escala inicial de ${zoom} em ${largura}px`, () => {
        cy.viewport(largura, altura);
        cy.entrarComo('leitor');
        cy.visit(`leitor?id=${livro.id}`);
        cy.tid('text-total-pages', { timeout: 30000 }).should('not.have.text', '--');
        cy.tid('text-zoom-level').should('have.text', zoom);
      });
    });

    it('mantém o HUD acessível e o canvas dentro da tela no celular', () => {
      cy.viewport(375, 812);
      cy.entrarComo('leitor');
      cy.visit(`leitor?id=${livro.id}`);
      cy.tid('text-total-pages', { timeout: 30000 }).should('not.have.text', '--');

      cy.tid('hud-menu').should('be.visible').dentroDoViewport();
      cy.tid('btn-next-page').should('be.visible').alvoDeToqueConfortavel(28);
      cy.tid('input-page-number').should('be.visible');
      // Espera a renderização real antes de medir (o canvas nasce com 300px).
      cy.tid('pdf-canvas').should(($c) => expect($c[0].width).to.be.greaterThan(300));
      cy.tid('pdf-canvas').should(($c) => {
        expect(
          $c[0].getBoundingClientRect().width,
          'a página renderizada precisa caber na largura do celular — #canvas-container ' +
            'tem overflow-x: hidden, então o que passar de 375px fica inacessível'
        ).to.be.at.most(375);
      });
    });

    it('avança a página com gesto de swipe para cima no celular', () => {
      cy.viewport(375, 812);
      cy.entrarComo('leitor');
      cy.visit(`leitor?id=${livro.id}&origem=1`);
      cy.tid('text-total-pages', { timeout: 30000 }).should('not.have.text', '--');
      cy.tid('btn-first-page').click();
      cy.tid('input-page-number').should('have.value', '1');

      // O swipe é tratado por touchstart/touchend nativos, com a lista `touches`
      // lida diretamente — por isso os eventos são despachados na mão.
      cy.window().then((win) => {
        const container = win.document.getElementById('canvas-container');
        container.scrollTop = container.scrollHeight; // só vira a página com o scroll no fim

        const inicio = new win.Event('touchstart', { bubbles: true });
        inicio.touches = [{ clientY: 700 }];
        container.dispatchEvent(inicio);

        const fim = new win.Event('touchend', { bubbles: true });
        fim.changedTouches = [{ clientY: 400 }];
        container.dispatchEvent(fim);
      });

      cy.tid('input-page-number').should('have.value', '2');
    });
  });

  describe('Meta viewport e tema', () => {
    [
      { rotulo: '/login', url: 'login' },
      { rotulo: '/ (biblioteca)', url: './' },
      { rotulo: '/usuarios', url: 'usuarios' },
    ].forEach(({ rotulo, url }) => {
      it(`${rotulo} declara viewport responsivo e tema escuro`, () => {
        cy.entrarComo('admin');
        cy.visit(url);
        cy.get('head meta[name="viewport"]')
          .should('have.attr', 'content')
          .and('include', 'width=device-width');
        cy.get('html').should('have.attr', 'data-bs-theme', 'dark');
        cy.get('html').should('have.attr', 'lang', 'pt-br');
      });
    });
  });
});
