/// <reference types="cypress" />

/**
 * Design de produto: faixa "Continue lendo", contagem do acervo, selo de leitura concluída,
 * atalho de teclado da busca e tela de entrada. Só grava com marcadores de teste.
 */

const { USUARIOS, SUFIXO_EMAIL, PREFIXO_TITULO } = require('../support/dados');

const EMAIL_LEITOR = USUARIOS.leitor.email;

function registrarLeitura(livroId, progresso, total, porcentagem) {
  return cy.sql(
    `INSERT INTO leituras (usuario_id, livro_id, progresso, total_paginas, porcentagem)
     SELECT id, ?, ?, ?, ? FROM usuarios WHERE email = '${EMAIL_LEITOR}'
     ON DUPLICATE KEY UPDATE progresso = VALUES(progresso), total_paginas = VALUES(total_paginas), porcentagem = VALUES(porcentagem)`,
    [livroId, progresso, total, porcentagem]
  );
}

function apagarLeituras() {
  return cy.sql(
    `DELETE FROM leituras WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = '${EMAIL_LEITOR}')`
  );
}

describe('Design de produto', () => {
  let emAndamento;
  let concluido;

  before(() => {
    expect(EMAIL_LEITOR.endsWith(SUFIXO_EMAIL)).to.be.true;
    cy.limparMassaE2E();
    cy.semearUsuarios();
    cy.semearLivro({ titulo: `${PREFIXO_TITULO} Em andamento`, autor: 'Autora Faixa' }).then((l) => {
      emAndamento = l;
    });
    cy.semearLivro({ titulo: `${PREFIXO_TITULO} Concluido`, autor: 'Autor Selo' }).then((l) => {
      concluido = l;
    });
  });

  after(() => {
    apagarLeituras();
    cy.limparMassaE2E();
  });

  beforeEach(() => {
    cy.entrarComo('leitor');
    cy.intercept('GET', '**/api/buscar.php*').as('buscar');
  });

  context('Continue lendo', () => {
    it('não aparece quando o usuário não começou nenhum livro', () => {
      apagarLeituras();
      cy.visitarBiblioteca();
      cy.tid('continuar-lendo').should('not.exist');
    });

    it('lista o livro em andamento com progresso e leva ao leitor', () => {
      apagarLeituras();
      registrarLeitura(emAndamento.id, 35, 200, 17);
      cy.visitarBiblioteca();
      cy.tid('continuar-lendo').should('be.visible');
      cy.tid('continuar-item')
        .first()
        .should('contain.text', `${PREFIXO_TITULO} Em andamento`)
        .and('contain.text', '17%')
        .and('have.attr', 'href')
        .and('include', `leitor?id=${emAndamento.id}`);
    });

    it('não lista livro concluído', () => {
      apagarLeituras();
      registrarLeitura(concluido.id, 200, 200, 100);
      cy.visitarBiblioteca();
      cy.tid('continuar-lendo').should('not.exist');
    });

    it('some durante uma busca', () => {
      apagarLeituras();
      registrarLeitura(emAndamento.id, 35, 200, 17);
      cy.visitarBiblioteca();
      cy.tid('continuar-lendo').should('be.visible');
      cy.tid('input-busca-principal').type('Autora Faixa');
      cy.wait('@buscar');
      cy.tid('continuar-lendo').should('not.be.visible');
    });
  });

  context('Cartões do acervo', () => {
    it('mostra o selo "Lido" só no livro concluído', () => {
      apagarLeituras();
      registrarLeitura(concluido.id, 200, 200, 100);
      cy.visitarBiblioteca('?busca=' + encodeURIComponent(PREFIXO_TITULO));
      cy.tid('book-item')
        .contains(`${PREFIXO_TITULO} Concluido`)
        .closest('[data-testid="book-item"]')
        .find('[data-testid="book-selo-concluido"]')
        .should('exist');
      cy.tid('book-item')
        .contains(`${PREFIXO_TITULO} Em andamento`)
        .closest('[data-testid="book-item"]')
        .find('[data-testid="book-selo-concluido"]')
        .should('not.exist');
    });

    it('livro sem leitura aparece como "Não iniciado"', () => {
      apagarLeituras();
      cy.visitarBiblioteca('?busca=' + encodeURIComponent(`${PREFIXO_TITULO} Em andamento`));
      cy.tid('book-progress-text').first().should('contain.text', 'Não iniciado');
    });
  });

  context('Contagem e busca', () => {
    it('a contagem acompanha o resultado da busca', () => {
      cy.visitarBiblioteca();
      cy.tid('total-livros')
        .invoke('text')
        .then((todos) => {
          cy.tid('input-busca-principal').type(`${PREFIXO_TITULO} Concluido`);
          cy.wait('@buscar');
          cy.tid('total-livros').should('have.text', '1');
          cy.tid('btn-limpar-busca').click();
          cy.wait('@buscar');
          cy.tid('total-livros').should('have.text', todos);
        });
    });

    it('a tecla "/" leva o foco para a busca', () => {
      cy.visitarBiblioteca();
      cy.get('body').type('/');
      cy.focused().should('have.attr', 'data-testid', 'input-busca-principal');
      cy.tid('input-busca-principal').should('have.value', '');
    });
  });

  context('Barra superior', () => {
    it('mostra a inicial do usuário no avatar e mantém o menu funcional', () => {
      cy.visitarBiblioteca();
      cy.tid('btn-user-menu').find('.avatar').should('contain.text', USUARIOS.leitor.nome.charAt(0).toUpperCase());
      cy.tid('btn-user-menu').click();
      cy.tid('btn-logout').should('be.visible');
    });
  });

  context('Tela de entrada', () => {
    it('apresenta a marca e o formulário', () => {
      cy.clearAllCookies();
      cy.visit('login');
      cy.tid('login-title').should('have.text', 'Bem-vindo de volta');
      cy.get('.auth-marca').should('be.visible');
      cy.tid('login-form').should('be.visible');
    });

    it('no celular esconde o painel de marca e mostra a marca compacta', () => {
      cy.viewport(375, 812);
      cy.clearAllCookies();
      cy.visit('login');
      cy.get('.auth-marca').should('not.be.visible');
      cy.get('.auth-marca-mobile').should('be.visible');
      cy.semRolagemHorizontal();
    });
  });
});