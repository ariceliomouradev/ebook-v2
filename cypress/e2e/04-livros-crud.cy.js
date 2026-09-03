/// <reference types="cypress" />

/**
 * Ciclo de vida do livro: upload (contribuidor e admin), edição e exclusão
 * (admin) e gestão de banners (admin).
 *
 * Todos os livros criados aqui recebem o prefixo [E2E] e são removidos no fim,
 * junto com os arquivos físicos. Os banners reais são copiados para
 * cypress/.backup-banners antes dos testes que os sobrescrevem e restaurados
 * byte a byte depois.
 */

const { PREFIXO_TITULO } = require('../support/dados');

const PREFIXO = () => PREFIXO_TITULO;

describe('Livros — upload, edição, exclusão e banners', () => {
  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
  });

  after(() => cy.limparMassaE2E());

  describe('Upload de livro', () => {
    ['contribuidor', 'admin'].forEach((perfil) => {
      it(`${perfil} envia um PDF, a capa é gerada e o livro aparece na biblioteca`, () => {
        const titulo = `${PREFIXO()} Upload ${perfil} ${Date.now().toString().slice(-6)}`;

        cy.entrarComo(perfil);
        cy.visitarBiblioteca();

        cy.tid('btn-novo-livro').click();
        cy.tid('modal-add-book').should('be.visible');
        cy.tid('input-file-pdf').selectFile('cypress/fixtures/livro-teste.pdf');

        // A capa é renderizada no cliente pelo PDF.js e enviada em Base64.
        cy.tid('canvas-cover-preview').should('be.visible');
        cy.get('#capaBase64', { timeout: 20000 })
          .invoke('val')
          .should('match', /^data:image\/png;base64,/);

        cy.tid('input-book-title').type(titulo);
        cy.tid('input-book-author').type('Autor E2E');
        cy.tid('btn-submit-new-book').click();

        cy.tid('modal-alerta-global').should('be.visible');
        cy.tid('alerta-mensagem').should('contain.text', 'Livro cadastrado com sucesso');
        cy.tid('btn-fechar-alerta').click();

        cy.sql('SELECT id, autor, nome_arquivo, capa_arquivo, usuario_id FROM livros WHERE titulo = ?', [
          titulo,
        ]).then((linhas) => {
          expect(linhas, 'livro gravado no banco').to.have.length(1);
          expect(linhas[0].autor).to.eq('Autor E2E');
          expect(linhas[0].nome_arquivo).to.match(/\.pdf$/);
          expect(linhas[0].capa_arquivo, 'capa gerada').to.match(/\.png$/);

          cy.task('arquivos:existe', 'uploads/' + linhas[0].nome_arquivo).should('be.true');
          cy.task('arquivos:existe', 'capas/' + linhas[0].capa_arquivo).should('be.true');
        });

        cy.visitarBiblioteca();
        cy.tid('input-busca-principal').type(titulo.slice(-6));
        cy.tid('book-title').should('contain.text', titulo);
      });
    });

    it('exige título e autor antes de enviar', () => {
      cy.entrarComo('contribuidor');
      cy.visitarBiblioteca();
      cy.tid('btn-novo-livro').click();
      cy.tid('input-file-pdf').selectFile('cypress/fixtures/livro-teste.pdf');
      cy.get('#capaBase64', { timeout: 20000 }).invoke('val').should('not.be.empty');

      cy.tid('btn-submit-new-book').click();
      cy.tid('input-book-title').then(($el) => {
        expect($el[0].checkValidity(), 'título obrigatório').to.be.false;
      });

      cy.tid('input-book-title').type(`${PREFIXO()} Sem Autor`);
      cy.tid('btn-submit-new-book').click();
      cy.tid('input-book-author').then(($el) => {
        expect($el[0].checkValidity(), 'autor obrigatório').to.be.false;
      });

      cy.tid('modal-add-book').should('be.visible');
      cy.sql('SELECT id FROM livros WHERE titulo = ?', [`${PREFIXO()} Sem Autor`]).should('have.length', 0);
    });

    it('rejeita arquivo que não é PDF de verdade', () => {
      cy.entrarComo('contribuidor');
      cy.visitarBiblioteca();
      cy.tid('btn-novo-livro').click();
      cy.tid('input-file-pdf').selectFile('cypress/fixtures/arquivo-invalido.txt', { force: true });
      cy.tid('input-book-title').type(`${PREFIXO()} Nao Deve Existir`);
      cy.tid('input-book-author').type('Autor E2E');
      cy.tid('btn-submit-new-book').click();

      cy.tid('modal-alerta-global').should('be.visible');
      cy.tid('alerta-mensagem').should('contain.text', 'Arquivo inválido');
      cy.sql('SELECT id FROM livros WHERE titulo = ?', [`${PREFIXO()} Nao Deve Existir`]).should(
        'have.length',
        0
      );
    });
  });

  describe('Gerenciador (admin)', () => {
    let livroA;
    let livroB;

    beforeEach(() => {
      cy.semearLivro({ titulo: `${PREFIXO()} Editar ${Date.now().toString().slice(-6)}` }).then(
        (l) => (livroA = l)
      );
      cy.semearLivro({ titulo: `${PREFIXO()} Excluir ${Date.now().toString().slice(-6)}` }).then(
        (l) => (livroB = l)
      );
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('modal-manager').should('be.visible');
    });

    it('lista os livros e o contador de registros', () => {
      cy.sql('SELECT COUNT(*) AS total FROM livros').then((linhas) => {
        cy.tid('contador-registros').should('have.text', String(linhas[0].total));
        cy.tid('item-gerenciador').should('have.length', Number(linhas[0].total));
      });
    });

    it('filtra a lista do gerenciador enquanto digita', () => {
      cy.tid('input-busca-gerenciador').type(livroA.titulo);
      cy.get('[data-testid="item-gerenciador"]:visible').should('have.length', 1);
      cy.tid('item-titulo-livro').filter(':visible').should('contain.text', livroA.titulo);

      cy.tid('btn-limpar-busca-gerenciador').click();
      cy.get('[data-testid="item-gerenciador"]:visible').should('have.length.greaterThan', 1);
    });

    it('mostra estado vazio quando o filtro não encontra nada', () => {
      cy.tid('input-busca-gerenciador').type('xyz-nao-existe-xyz');
      cy.tid('msg-busca-gerenciar-vazia').should('be.visible');
      cy.tid('contador-registros').should('have.text', '0');
    });

    it('edita título e autor, refletindo no gerenciador e no card da grade', () => {
      const novoTitulo = `${PREFIXO()} Editado ${Date.now().toString().slice(-6)}`;

      cy.tid('input-busca-gerenciador').type(livroA.titulo);
      cy.tid('btn-editar-item').filter(':visible').click();

      cy.tid('view-formulario-edicao').should('be.visible');
      cy.tid('input-editar-titulo').should('have.value', livroA.titulo).clear().type(novoTitulo);
      cy.tid('input-editar-autor').clear().type('Autor Revisado');
      cy.tid('btn-salvar-edicao').click();

      cy.tid('view-lista-gerenciador').should('be.visible');
      cy.get(`.item-gerenciador[data-id="${livroA.id}"]`)
        .tidDentro('item-titulo-livro')
        .should('have.text', novoTitulo);

      cy.sql('SELECT titulo, autor FROM livros WHERE id = ?', [livroA.id]).then((linhas) => {
        expect(linhas[0].titulo).to.eq(novoTitulo);
        expect(linhas[0].autor).to.eq('Autor Revisado');
      });

      // Ao fechar o modal com alterações, a biblioteca é ressincronizada.
      cy.tid('btn-close-modal-manager').click();
      cy.aguardarBiblioteca();
      cy.get(`.livro-item[data-id="${livroA.id}"]`).tidDentro('book-title').should('have.text', novoTitulo);
    });

    it('barra a edição com campos vazios no formulário e na API', () => {
      cy.tid('input-busca-gerenciador').type(livroA.titulo);
      cy.tid('btn-editar-item').filter(':visible').click();
      cy.tid('input-editar-titulo').clear();
      cy.tid('input-editar-autor').clear();

      // Primeiro barreira: validação nativa impede o envio.
      cy.tid('btn-salvar-edicao').click();
      cy.tid('input-editar-titulo').then(($el) => {
        expect($el[0].checkValidity(), 'título obrigatório').to.be.false;
      });

      // Segunda barreira: mesmo forçando o envio, o servidor responde 422.
      cy.tid('input-editar-titulo').closest('form').then(($form) => {
        const dados = new FormData($form[0]);
        cy.request({
          method: 'POST',
          url: 'api/editar.php',
          failOnStatusCode: false,
          form: true,
          headers: { 'X-CSRF-Token': dados.get('csrf_token') },
          body: { csrf_token: dados.get('csrf_token'), id: livroA.id, titulo: '', autor: '' },
        }).then((r) => {
          expect(r.status).to.eq(422);
          expect(r.body.error).to.contain('Dados incompletos');
        });
      });

      cy.sql('SELECT titulo FROM livros WHERE id = ?', [livroA.id]).then((linhas) => {
        expect(linhas[0].titulo, 'título preservado').to.eq(livroA.titulo);
      });
    });

    it('pede confirmação antes de excluir e cancela sem apagar nada', () => {
      cy.tid('input-busca-gerenciador').type(livroB.titulo);
      cy.tid('btn-excluir-item').filter(':visible').click();

      cy.tid('modal-confirmar-excluir').should('be.visible');
      cy.tid('nome-livro-excluir').should('have.text', livroB.titulo);
      cy.tid('btn-cancelar-exclusao').click();

      cy.sql('SELECT id FROM livros WHERE id = ?', [livroB.id]).should('have.length', 1);
    });

    it('exclui o livro, removendo registro, card e arquivos do disco', () => {
      cy.tid('input-busca-gerenciador').type(livroB.titulo);
      cy.tid('btn-excluir-item').filter(':visible').click();
      cy.tid('btn-confirmar-exclusao').click();

      cy.get(`.item-gerenciador[data-id="${livroB.id}"]`).should('not.exist');
      cy.sql('SELECT id FROM livros WHERE id = ?', [livroB.id]).should('have.length', 0);
      cy.task('arquivos:existe', 'uploads/' + livroB.nomeArquivo).should('be.false');
      cy.task('arquivos:existe', 'capas/' + livroB.capaArquivo).should('be.false');
    });

    it('mantém o acervo real intacto após as operações', () => {
      cy.sql('SELECT COUNT(*) AS total FROM livros WHERE titulo NOT LIKE ?', [PREFIXO() + '%']).then(
        (linhas) => {
          expect(Number(linhas[0].total), 'livros reais preservados').to.be.greaterThan(0);
        }
      );
    });
  });

  describe('Banners (admin)', () => {
    // Os banners são arquivos únicos e globais: o upload sobrescreve o banner
    // real do sistema. Por isso o estado é salvo antes e restaurado depois.
    before(() => cy.task('banners:backup'));
    after(() => cy.task('banners:restaurar'));

    beforeEach(() => {
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('link-gerenciar-banners').click();
      cy.tid('view-gerenciar-banners').should('be.visible');
    });

    it('envia um novo banner horizontal e o exibe na biblioteca', () => {
      cy.intercept('POST', '**/api/manage_banners.php').as('banner');
      cy.tid('input-file-banner-h').selectFile('cypress/fixtures/banner-teste.png', { force: true });
      cy.wait('@banner').its('response.body.success').should('be.true');

      cy.tid('btn-close-modal-manager').click();
      cy.aguardarBiblioteca();
      cy.tid('banner-horizontal-image').should('have.attr', 'src').and('include', 'banners/banner_h');
    });

    it('remove o banner vertical mediante confirmação', () => {
      cy.intercept('POST', '**/api/manage_banners.php').as('banner');
      cy.tid('btn-remover-banner-s').click();
      cy.tid('modal-confirmar-excluir-banner').should('be.visible');
      cy.tid('btn-confirmar-exclusao-banner').click();
      cy.wait('@banner').its('response.statusCode').should('eq', 200);

      cy.tid('btn-close-modal-manager').click();
      cy.aguardarBiblioteca();
      cy.tid('sidebar-placeholder').should('exist');
    });

    it('rejeita arquivo que não é imagem', () => {
      cy.intercept('POST', '**/api/manage_banners.php').as('banner');
      cy.tid('input-file-banner-h').selectFile('cypress/fixtures/arquivo-invalido.txt', { force: true });
      cy.wait('@banner').then(({ response }) => {
        expect(response.statusCode).to.eq(422);
        expect(response.body.error).to.contain('JPG, JPEG e PNG');
      });
      cy.tid('toast-erro').should('be.visible');
    });
  });
});
