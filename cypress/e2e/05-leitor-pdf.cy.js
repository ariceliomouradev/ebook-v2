/// <reference types="cypress" />

/**
 * Leitor de PDF: abertura a partir do card, navegação, zoom, tela cheia,
 * persistência do progresso por usuário e retorno à biblioteca preservando o
 * estado (página, ordenação e busca).
 *
 * O PDF de fixture tem 3 páginas, então a navegação tem limites conhecidos.
 */

const { USUARIOS, SUFIXO_EMAIL, PREFIXO_TITULO } = require('../support/dados');

const PREFIXO = () => PREFIXO_TITULO;
const TOTAL_PAGINAS = 3;

describe('Leitor de PDF', () => {
  let livro;

  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
    cy.semearLivro({ titulo: `${PREFIXO()} Leitura ${Date.now().toString().slice(-6)}` }).then(
      (l) => (livro = l)
    );
  });

  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.garantirLivro(livro, { titulo: `${PREFIXO()} Leitura` }).then((l) => (livro = l));
  });

  /** Abre o leitor já autenticado e espera o PDF terminar de carregar. */
  function abrirLeitor(perfil, query = '') {
    cy.entrarComo(perfil);
    cy.visit(`views/leitor.php?id=${livro.id}${query}`);
    cy.tid('text-total-pages', { timeout: 30000 }).should('have.text', String(TOTAL_PAGINAS));
  }

  describe('Abertura', () => {
    it('abre o leitor ao clicar no card da biblioteca', () => {
      cy.entrarComo('leitor');
      cy.visitarBiblioteca();
      cy.tid('input-busca-principal').type(livro.titulo);
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-item').first().click();

      cy.url().should('include', `views/leitor.php?id=${livro.id}`);
      cy.title().should('contain', livro.titulo);
      cy.tid('pdf-canvas').should('be.visible');
      cy.tid('text-total-pages', { timeout: 30000 }).should('have.text', String(TOTAL_PAGINAS));
    });

    it('renderiza a primeira página no canvas com dimensões reais', () => {
      abrirLeitor('leitor');
      cy.tid('pdf-canvas').should(($c) => {
        expect($c[0].width, 'largura do canvas').to.be.greaterThan(100);
        expect($c[0].height, 'altura do canvas').to.be.greaterThan(100);
      });
      cy.tid('input-page-number').should('have.value', '1');
    });

    it('serve o PDF por streaming, aceitando requisições Range', () => {
      cy.entrarComo('leitor');
      cy.request({
        url: `api/download.php?id=${livro.id}`,
        headers: { Range: 'bytes=0-99' },
      }).then((r) => {
        expect(r.status).to.eq(206);
        expect(r.headers['content-range']).to.match(/^bytes 0-99\//);
      });
    });

    it('recusa id inexistente com 404 e id inválido com 400', () => {
      cy.entrarComo('leitor');
      cy.request({ url: 'views/leitor.php?id=99999999', failOnStatusCode: false })
        .its('status')
        .should('eq', 404);
      cy.request({ url: 'views/leitor.php', failOnStatusCode: false }).its('status').should('eq', 400);
    });
  });

  describe('Navegação entre páginas', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/api/progresso.php*').as('progresso');
      abrirLeitor('leitor');
    });

    it('avança e volta uma página pelos botões do HUD', () => {
      cy.tid('btn-next-page').click();
      cy.tid('input-page-number').should('have.value', '2');
      cy.wait('@progresso').its('response.body.success').should('be.true');

      cy.tid('btn-prev-page').click();
      cy.tid('input-page-number').should('have.value', '1');
    });

    it('salta para a última e para a primeira página', () => {
      cy.tid('btn-last-page').click();
      cy.tid('input-page-number').should('have.value', String(TOTAL_PAGINAS));

      cy.tid('btn-first-page').click();
      cy.tid('input-page-number').should('have.value', '1');
    });

    it('não passa dos limites do documento', () => {
      cy.tid('btn-prev-page').click();
      cy.tid('input-page-number').should('have.value', '1');

      cy.tid('btn-last-page').click();
      cy.tid('btn-next-page').click();
      cy.tid('input-page-number').should('have.value', String(TOTAL_PAGINAS));
    });

    it('vai direto para uma página digitada no campo', () => {
      cy.tid('input-page-number').clear().type('3{enter}');
      cy.tid('input-page-number').should('have.value', '3');
      cy.wait('@progresso');
    });

    it('ignora número de página fora do intervalo e restaura o valor atual', () => {
      cy.tid('input-page-number')
        .invoke('val')
        .then((paginaAtual) => {
          cy.tid('input-page-number').clear().type('99{enter}');
          cy.tid('input-page-number').should('have.value', paginaAtual);
        });
    });
  });

  describe('Zoom', () => {
    beforeEach(() => abrirLeitor('leitor'));

    it('aumenta e diminui em passos de 20%', () => {
      cy.tid('text-zoom-level')
        .invoke('text')
        .then((inicial) => {
          const base = parseInt(inicial);
          cy.tid('btn-zoom-in').click();
          cy.tid('text-zoom-level').should('have.text', `${base + 20}%`);
          cy.tid('btn-zoom-out').click();
          cy.tid('text-zoom-level').should('have.text', `${base}%`);
        });
    });

    it('respeita o limite máximo de 300%', () => {
      for (let i = 0; i < 12; i++) cy.tid('btn-zoom-in').click();
      cy.tid('text-zoom-level').should('have.text', '300%');
    });

    it('respeita o limite mínimo de 40%', () => {
      for (let i = 0; i < 12; i++) cy.tid('btn-zoom-out').click();
      cy.tid('text-zoom-level').should('have.text', '40%');
    });

    it('preserva o zoom manual ao redimensionar a janela', () => {
      cy.tid('btn-zoom-in').click();
      cy.tid('text-zoom-level')
        .invoke('text')
        .then((escolhido) => {
          cy.viewport(375, 812);
          cy.tid('text-zoom-level').should('have.text', escolhido);
          cy.viewport(1440, 900);
          cy.tid('text-zoom-level').should('have.text', escolhido);
        });
    });

    it('não salva progresso ao mudar apenas o zoom', () => {
      cy.intercept('POST', '**/api/progresso.php*', cy.spy().as('progressoSpy'));
      cy.tid('btn-zoom-in').click();
      cy.tid('btn-zoom-out').click();
      cy.wait(500);
      cy.get('@progressoSpy').should('not.have.been.called');
    });
  });

  describe('Progresso de leitura', () => {
    it('grava a página lida e a porcentagem no banco', () => {
      cy.sql(
        `DELETE FROM leituras WHERE livro_id = ?
         AND usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@e2e.test')`,
        [livro.id]
      );
      cy.intercept('POST', '**/api/progresso.php*').as('progresso');
      abrirLeitor('leitor');
      cy.tid('input-page-number').should('have.value', '1');

      cy.tid('btn-next-page').click();
      cy.wait('@progresso');

      cy.sql(
        `SELECT l.progresso, l.total_paginas, l.porcentagem FROM leituras l
         JOIN usuarios u ON u.id = l.usuario_id
         WHERE u.email = ? AND l.livro_id = ?`,
        [USUARIOS.leitor.email, livro.id]
      ).then((linhas) => {
        expect(linhas, 'progresso gravado').to.have.length(1);
        expect(Number(linhas[0].progresso)).to.eq(2);
        expect(Number(linhas[0].total_paginas)).to.eq(TOTAL_PAGINAS);
        expect(Number(linhas[0].porcentagem)).to.eq(67);
      });
    });

    it('reabre o livro na última página lida', () => {
      cy.intercept('POST', '**/api/progresso.php*').as('progresso');
      abrirLeitor('leitor');
      cy.tid('btn-last-page').click();
      cy.wait('@progresso');

      abrirLeitor('leitor');
      cy.tid('input-page-number').should('have.value', String(TOTAL_PAGINAS));
    });

    it('mostra a porcentagem lida no card da biblioteca', () => {
      cy.entrarComo('leitor');
      cy.visitarBiblioteca();
      cy.tid('input-busca-principal').type(livro.titulo);
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-progress-text').should('contain.text', '100%');
      cy.tid('book-progress-bar').find('.progress-bar').should('have.class', 'bg-success');
    });

    it('mantém o progresso separado por usuário', () => {
      // O leitor já terminou o livro no teste anterior; o admin abre o mesmo
      // título e precisa começar da página 1.
      abrirLeitor('admin');
      cy.tid('input-page-number').should('have.value', '1');

      cy.sql(
        `SELECT u.perfil, l.progresso FROM leituras l JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.livro_id = ? AND u.email LIKE ?`,
        [livro.id, '%' + SUFIXO_EMAIL]
      ).then((linhas) => {
        const doLeitor = linhas.find((l) => l.perfil === 'leitor');
        expect(Number(doLeitor.progresso), 'progresso do leitor preservado').to.eq(TOTAL_PAGINAS);
      });
    });

    it('recusa progresso sem CSRF e com dados inválidos', () => {
      cy.entrarComo('leitor');
      cy.request({
        method: 'POST',
        url: `api/progresso.php?id=${livro.id}`,
        failOnStatusCode: false,
        body: { pagina: 2, total: 3 },
      })
        .its('status')
        .should('eq', 400);

      cy.request('index.php').then((pagina) => {
        const csrf = JSON.parse(pagina.body.match(/id="app-config">\s*([\s\S]*?)\s*<\/script>/)[1]).csrfToken;
        cy.request({
          method: 'POST',
          url: `api/progresso.php?id=${livro.id}`,
          failOnStatusCode: false,
          headers: { 'X-CSRF-Token': csrf },
          body: { pagina: 99, total: 3 },
        })
          .its('status')
          .should('eq', 422);
      });
    });
  });

  describe('HUD e retorno à biblioteca', () => {
    it('expõe rótulos acessíveis em todos os controles', () => {
      abrirLeitor('leitor');
      [
        'btn-back-library',
        'btn-first-page',
        'btn-prev-page',
        'btn-next-page',
        'btn-last-page',
        'btn-zoom-out',
        'btn-zoom-in',
        'btn-fullscreen',
        'input-page-number',
      ].forEach((id) => {
        cy.tid(id).should('have.attr', 'aria-label').and('not.be.empty');
      });
    });

    it('oferece o botão de tela cheia', () => {
      abrirLeitor('leitor');
      cy.tid('btn-fullscreen').should('be.visible').and('have.attr', 'title', 'Tela Cheia');
    });

    it('volta preservando página, ordenação e busca da biblioteca', () => {
      cy.entrarComo('leitor');
      cy.visit(`views/leitor.php?id=${livro.id}&origem=2&ordem=az&busca=teste`);
      cy.tid('btn-back-library')
        .should('have.attr', 'href')
        .and('include', 'pagina=2')
        .and('include', 'ordem=az')
        .and('include', 'busca=teste');

      cy.tid('btn-back-library').click();
      cy.url().should('include', 'index.php');
      cy.tid('input-busca-principal').should('have.value', 'teste');
      cy.tid('select-ordenacao').should('have.value', 'az');
    });
  });
});
