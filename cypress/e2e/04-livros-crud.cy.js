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

    /**
     * A busca do gerenciador acontece no servidor, com debounce de 350 ms: digita, espera a
     * resposta de api/gerenciar_lista.php e só então confere a tela.
     */
    function buscarNoGerenciador(termo) {
      cy.tid('input-busca-gerenciador').clear().type(termo, { parseSpecialCharSequences: false });
      cy.wait('@lista');
      cy.tid('container-lista-gerenciador').should('have.attr', 'aria-busy', 'false');
    }

    beforeEach(() => {
      cy.semearLivro({ titulo: `${PREFIXO()} Editar ${Date.now().toString().slice(-6)}` }).then(
        (l) => (livroA = l)
      );
      cy.semearLivro({ titulo: `${PREFIXO()} Excluir ${Date.now().toString().slice(-6)}` }).then(
        (l) => (livroB = l)
      );
      cy.entrarComo('admin');
      cy.intercept('GET', '**/api/gerenciar_lista.php*').as('lista');
      cy.visitarBiblioteca();
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('modal-manager').should('be.visible');
      cy.wait('@lista'); // a lista só é buscada quando o modal abre
      cy.tid('gerenciador-carregando').should('not.exist');
    });

    it('não embute a lista de livros no HTML do painel (escala com o acervo)', () => {
      // Antes, o painel do admin trazia TODOS os livros dentro do HTML: megabytes com milhares de títulos.
      cy.request('./').then((r) => {
        expect(r.body).to.not.contain('data-testid="item-gerenciador"');
      });
    });

    it('lista só a primeira página, com contador e paginação do acervo inteiro', () => {
      cy.readFile('config/app.php').then((php) => {
        const porPagina = Number(php.match(/const ITENS_POR_PAGINA_GERENCIADOR = (\d+)/)[1]);
        cy.sql('SELECT COUNT(*) AS total FROM livros').then((linhas) => {
          const total = Number(linhas[0].total);
          cy.tid('contador-registros').should('have.text', String(total));
          cy.tid('item-gerenciador').should('have.length', Math.min(porPagina, total));
          if (total > porPagina) {
            cy.tid('gerenciador-paginacao').should('be.visible');
            cy.tid('gerenciador-pagina-info').should('contain.text', `Página 1 de ${Math.ceil(total / porPagina)}`);
            cy.tid('btn-gerenciador-anterior').should('be.disabled');
            cy.tid('btn-gerenciador-proxima').should('not.be.disabled');
          } else {
            cy.tid('gerenciador-paginacao').should('not.be.visible');
          }
        });
      });
    });

    it('navega entre as páginas do gerenciador sem repetir livros', function () {
      cy.get('#paginacaoGerenciador').then(($barra) => {
        if ($barra.hasClass('d-none')) this.skip(); // acervo pequeno: só há uma página
      });
      cy.get('[data-testid="item-gerenciador"]')
        .then(($itens) => [...$itens].map((el) => el.dataset.id))
        .then((pagina1) => {
          cy.tid('btn-gerenciador-proxima').click();
          cy.wait('@lista');
          cy.tid('gerenciador-pagina-info').should('contain.text', 'Página 2');
          cy.get('[data-testid="item-gerenciador"]').then(($itens) => {
            const pagina2 = [...$itens].map((el) => el.dataset.id);
            expect(pagina2.some((id) => pagina1.includes(id)), 'sem sobreposição entre páginas').to.be.false;
          });
          cy.tid('btn-gerenciador-anterior').click();
          cy.wait('@lista');
          cy.tid('gerenciador-pagina-info').should('contain.text', 'Página 1');
        });
    });

    it('filtra a lista no servidor enquanto digita', () => {
      buscarNoGerenciador(livroA.titulo);
      cy.tid('item-gerenciador').should('have.length', 1);
      cy.tid('item-titulo-livro').should('contain.text', livroA.titulo);
      cy.tid('contador-registros').should('have.text', '1');

      cy.tid('btn-limpar-busca-gerenciador').click();
      cy.wait('@lista');
      cy.tid('item-gerenciador').should('have.length.greaterThan', 1);
    });

    it('mostra estado vazio quando o filtro não encontra nada', () => {
      buscarNoGerenciador('xyz-nao-existe-xyz');
      cy.tid('msg-busca-gerenciar-vazia').should('be.visible');
      cy.tid('contador-registros').should('have.text', '0');
      cy.tid('item-gerenciador').should('not.exist');
    });

    it('trata "%" e "_" como texto, não como curinga do LIKE', () => {
      // Sem escape, pesquisar "%" casaria com TODOS os livros.
      ['%', '_'].forEach((curinga) => {
        const literal = '%' + curinga.replace(/[%_]/g, '\\$&') + '%';
        cy.sql('SELECT COUNT(*) AS total FROM livros WHERE titulo LIKE ? OR autor LIKE ?', [literal, literal]).then(
          (linhas) => {
            buscarNoGerenciador(curinga);
            cy.tid('contador-registros').should('have.text', String(linhas[0].total));
          }
        );
      });
    });

    it('edita título e autor, refletindo no gerenciador e no card da grade', () => {
      const novoTitulo = `${PREFIXO()} Editado ${Date.now().toString().slice(-6)}`;

      buscarNoGerenciador(livroA.titulo);
      cy.tid('btn-editar-item').click();

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
      buscarNoGerenciador(livroA.titulo);
      cy.tid('btn-editar-item').click();
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
      buscarNoGerenciador(livroB.titulo);
      cy.tid('btn-excluir-item').click();

      cy.tid('modal-confirmar-excluir').should('be.visible');
      cy.tid('nome-livro-excluir').should('have.text', livroB.titulo);
      cy.tid('btn-cancelar-exclusao').click();

      cy.sql('SELECT id FROM livros WHERE id = ?', [livroB.id]).should('have.length', 1);
    });

    it('exclui o livro, removendo registro, card e arquivos do disco', () => {
      buscarNoGerenciador(livroB.titulo);
      cy.tid('btn-excluir-item').click();
      cy.tid('btn-confirmar-exclusao').click();
      cy.wait('@lista'); // a lista é recarregada do servidor após a exclusão

      cy.get(`.item-gerenciador[data-id="${livroB.id}"]`).should('not.exist');
      cy.tid('msg-busca-gerenciar-vazia').should('be.visible');
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
