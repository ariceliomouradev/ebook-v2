/// <reference types="cypress" />

/**
 * EPUB: envio (título, autor e capa lidos do próprio arquivo), etiqueta no card, download e o leitor
 * próprio (texto que reflui, sumário, letra, tema, progresso em % e retomada do ponto exato).
 *
 * O fixture `livro-teste.epub` (npm run fixtures) tem 3 capítulos e declara o título "[E2E] EPUB de teste",
 * então a limpeza da suíte também recolhe o livro criado pelo upload.
 */

const { USUARIOS, PREFIXO_TITULO } = require('../support/dados');

const TITULO_NO_ARQUIVO = `${PREFIXO_TITULO} EPUB de teste`;

/**
 * Espera o texto aparecer no capítulo que está na tela (o conteúdo vive num iframe do epub.js, que troca
 * de iframe a cada capítulo: por isso a consulta inteira é repetida até o texto casar).
 */
const verTexto = (esperado) =>
  cy.get('[data-testid="epub-viewer"] iframe', { timeout: 30000 }).should(($iframe) => {
    const doc = $iframe[0].contentDocument;
    expect(doc && doc.body ? doc.body.textContent : '', `texto na tela`).to.contain(esperado);
  });

describe('EPUB — envio e leitura', () => {
  let livro;

  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
  });

  after(() => cy.limparMassaE2E());

  // Um livro novo por teste: o progresso de leitura persiste (é o que se quer provar), então reutilizar
  // o livro faria o teste seguinte abrir no capítulo onde o anterior parou.
  beforeEach(() => {
    cy.semearLivro({ titulo: `${PREFIXO_TITULO} EPUB Leitura ${Date.now().toString().slice(-6)}`, formato: 'epub' }).then(
      (l) => (livro = l)
    );
  });

  function abrirLeitor(perfil = 'leitor') {
    cy.entrarComo(perfil);
    cy.visit(`leitor?id=${livro.id}`);
    cy.tid('epub-viewer').should('exist');
    verTexto('Capitulo 1');
  }

  /** O progresso é gravado ~1,2 s depois de parar e só depois de o livro ser medido: espera ele aparecer no banco. */
  function esperarProgressoGravado(minimo = 40, tentativas = 30) {
    return cy
      .sql(
        `SELECT l.posicao, l.porcentagem, l.total_paginas FROM leituras l
           JOIN usuarios u ON u.id = l.usuario_id WHERE l.livro_id = ? AND u.email = ?`,
        [livro.id, USUARIOS.leitor.email]
      )
      .then((linhas) => {
        // a primeira gravação (início do livro, ~0%) acontece cedo: só vale a que passou de `minimo` %
        if (linhas.length && linhas[0].posicao && linhas[0].porcentagem > minimo) return linhas[0];
        expect(tentativas, `progresso acima de ${minimo}% gravado a tempo`).to.be.greaterThan(0);
        cy.wait(500);
        return esperarProgressoGravado(minimo, tentativas - 1);
      });
  }

  describe('Envio', () => {
    it('admin envia um EPUB sem digitar nada: título, autor e capa vêm do arquivo', () => {
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.tid('btn-novo-livro').click();
      cy.tid('modal-add-book').should('be.visible');
      cy.tid('input-file-pdf').selectFile('cypress/fixtures/livro-teste.epub');

      cy.tid('dica-epub').should('be.visible');
      cy.tid('input-book-title').then(($el) => expect($el[0].required, 'título deixa de ser obrigatório').to.be.false);
      cy.tid('btn-submit-new-book').click();

      cy.tid('modal-alerta-global').should('be.visible');
      cy.tid('alerta-mensagem').should('contain.text', 'Livro cadastrado com sucesso');
      cy.tid('btn-fechar-alerta').click();

      cy.sql(
        'SELECT id, autor, formato, nome_arquivo, capa_arquivo, publicacao FROM livros WHERE titulo = ? ORDER BY id DESC LIMIT 1',
        [TITULO_NO_ARQUIVO]
      ).then((linhas) => {
        expect(linhas, 'livro gravado').to.have.length(1);
        expect(linhas[0].formato).to.eq('epub');
        expect(linhas[0].autor).to.eq('Autor E2E');
        expect(linhas[0].nome_arquivo).to.match(/\.epub$/);
        expect(linhas[0].capa_arquivo, 'capa extraída do EPUB').to.match(/\.png$/);
        expect(linhas[0].publicacao).to.eq('aprovado');
        cy.task('arquivos:existe', 'uploads/' + linhas[0].nome_arquivo).should('be.true');
        cy.task('arquivos:existe', 'capas/' + linhas[0].capa_arquivo).should('be.true');
      });
    });

    it('mostra a etiqueta EPUB e a capa no card da biblioteca', () => {
      cy.entrarComo('leitor');
      cy.visitarBiblioteca();
      cy.tid('input-busca-principal').type(livro.titulo);
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-item').first().within(() => {
        cy.tid('book-selo-epub').should('be.visible').and('have.text', 'EPUB');
        cy.tid('book-cover-img').should('be.visible');
      });
    });

    it('rejeita um arquivo .epub que não é um EPUB de verdade', () => {
      const titulo = `${PREFIXO_TITULO} EPUB Falso`;
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.tid('btn-novo-livro').click();
      cy.tid('input-file-pdf').selectFile(
        { contents: Cypress.Buffer.from('isto nao e um zip'), fileName: 'falso.epub', mimeType: 'application/epub+zip' },
        { force: true }
      );
      cy.tid('input-book-title').type(titulo);
      cy.tid('input-book-author').type('Autor E2E');
      cy.tid('btn-submit-new-book').click();

      cy.tid('modal-alerta-global').should('be.visible');
      cy.tid('alerta-mensagem').should('contain.text', 'Arquivo inválido');
      cy.sql('SELECT id FROM livros WHERE titulo = ?', [titulo]).should('have.length', 0);
    });
  });

  describe('Download', () => {
    it('serve o arquivo como application/epub+zip e respeita a visibilidade', () => {
      cy.entrarComo('leitor');
      cy.request({ url: `api/download.php?id=${livro.id}`, encoding: 'binary' }).then((r) => {
        expect(r.status).to.eq(200);
        expect(r.headers['content-type']).to.contain('application/epub+zip');
        expect(r.headers['content-disposition']).to.contain('.epub');
        expect(r.body.slice(0, 2), 'assinatura ZIP').to.eq('PK');
      });
    });
  });

  describe('Leitor', () => {
    it('abre o EPUB e mostra o texto, sem erro e sem a barra de página do PDF', () => {
      abrirLeitor();
      cy.tid('leitor-titulo').should('contain.text', livro.titulo);
      cy.tid('leitor-erro').should('not.be.visible');
      cy.tid('leitor-carregando').should('not.be.visible');
      cy.get('[data-testid="input-page-number"]').should('not.exist'); // só o leitor de PDF tem
      cy.tid('btn-anotacoes').should('not.exist'); // anotações são só do PDF
    });

    it('calcula o progresso em % e ele cresce ao avançar', () => {
      abrirLeitor();
      cy.tid('text-epub-progresso', { timeout: 30000 }).should('not.contain.text', '…');
      cy.tid('text-epub-progresso').invoke('text').then((antes) => {
        const pctAntes = parseInt(antes, 10);
        for (let i = 0; i < 4; i++) cy.tid('btn-epub-next').click();
        cy.tid('text-epub-progresso').should(($el) => {
          expect(parseInt($el.text(), 10), 'percentual depois de avançar').to.be.greaterThan(pctAntes);
        });
      });
    });

    it('abre o sumário com os capítulos e leva ao capítulo escolhido', () => {
      abrirLeitor();
      cy.tid('btn-sumario').click();
      cy.tid('painel-sumario').should('be.visible');
      cy.tid('lista-sumario').find('button').should('have.length', 3);
      cy.tid('lista-sumario').find('button').eq(2).click();
      cy.tid('painel-sumario').should('not.be.visible');
      verTexto('Capitulo 3');
    });

    it('troca o tamanho da letra e o tema, e lembra a escolha', () => {
      abrirLeitor();
      cy.tid('btn-fonte-mais').click();
      cy.window().then((win) => expect(win.localStorage.getItem('ml-epub-fonte')).to.eq('110'));
      cy.tid('btn-fonte-menos').click();
      cy.tid('btn-fonte-menos').click();
      cy.window().then((win) => expect(win.localStorage.getItem('ml-epub-fonte')).to.eq('90'));

      cy.get('body').should('have.attr', 'data-tema', 'escuro');
      cy.tid('btn-tema').click();
      cy.get('body').should('have.attr', 'data-tema', 'sepia');
      cy.tid('btn-tema').click();
      cy.get('body').should('have.attr', 'data-tema', 'claro');
    });

    it('salva onde parou e volta ao mesmo ponto ao reabrir', () => {
      abrirLeitor();
      cy.tid('text-epub-progresso', { timeout: 30000 }).should('not.contain.text', '…');
      cy.tid('btn-sumario').click();
      cy.tid('lista-sumario').find('button').eq(2).click();
      verTexto('Capitulo 3');

      esperarProgressoGravado().then((p) => {
        expect(p.posicao, 'CFI guardado').to.match(/^epubcfi\(/);
        expect(p.total_paginas).to.eq(1000);
        expect(p.porcentagem, 'capítulo 3 de 3').to.be.greaterThan(40);
      });

      cy.visit(`leitor?id=${livro.id}`);
      verTexto('Capitulo 3');
    });

    it('o progresso do EPUB aparece no card da biblioteca', () => {
      abrirLeitor();
      cy.tid('text-epub-progresso', { timeout: 30000 }).should('not.contain.text', '…');
      cy.tid('btn-sumario').click();
      cy.tid('lista-sumario').find('button').eq(2).click();
      verTexto('Capitulo 3');
      esperarProgressoGravado();

      cy.visitarBiblioteca();
      cy.tid('input-busca-principal').type(livro.titulo);
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-progress-bar').should('have.attr', 'aria-valuenow').and('not.eq', '0');
    });
  });
});
