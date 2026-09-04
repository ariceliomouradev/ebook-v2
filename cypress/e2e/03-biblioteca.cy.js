/// <reference types="cypress" />

/**
 * Dashboard: busca server-side, ordenação, paginação via AJAX, estados vazios
 * e feedback de carregamento.
 */

const { PREFIXO_TITULO } = require('../support/dados');

const PREFIXO = () => PREFIXO_TITULO;
const POR_PAGINA = 10;

describe('Biblioteca (busca, ordenação e paginação)', () => {
  const marcador = 'Zaratustra' + Date.now().toString().slice(-5);
  let totalLivros;

  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
    // Livro com título único: garante um resultado determinístico de busca sem
    // depender do acervo real (que não é alterado por esta suíte).
    cy.semearLivro({ titulo: `${PREFIXO()} ${marcador}`, autor: `Autor ${marcador}` });
    cy.sql('SELECT COUNT(*) AS total FROM livros').then((linhas) => {
      totalLivros = Number(linhas[0].total);
    });
  });

  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.entrarComo('leitor');
    cy.intercept('GET', '**/api/buscar.php*').as('buscar');
    cy.visitarBiblioteca();
  });

  describe('Carregamento inicial', () => {
    it('esconde o loader e apresenta os livros da primeira página', () => {
      cy.tid('global-loader').should('have.class', 'loader-hidden');
      cy.tid('error-timeout-screen').should('have.class', 'd-none');
      cy.tid('book-item').should('have.length', Math.min(POR_PAGINA, totalLivros));
    });

    it('mostra o total real do acervo no rodapé de paginação', () => {
      cy.tid('pagination-status-total').should('have.text', String(totalLivros));
      cy.tid('page-total-num').should('contain.text', String(Math.ceil(totalLivros / POR_PAGINA)));
    });

    it('exibe título, autor e progresso em cada card', () => {
      cy.tid('book-item')
        .first()
        .within(() => {
          cy.tid('book-title').should('not.be.empty');
          cy.tid('book-progress-text').should('contain.text', 'Lido');
          cy.tid('book-progress-bar').should('exist');
          cy.tid('book-read-link').should('have.attr', 'href').and('include', 'leitor?id=');
        });
    });

    it('gera links de capa e de leitura relativos à raiz (sem "../")', () => {
      cy.tid('book-read-link').first().should('have.attr', 'href').and('not.include', '../');
      cy.get('body').then(($b) => {
        if ($b.find('[data-testid="book-cover-img"]').length) {
          cy.tid('book-cover-img').first().should('have.attr', 'src').and('match', /^capas\//);
        }
      });
    });
  });

  describe('Busca', () => {
    it('encontra o livro pelo título em todo o acervo', () => {
      cy.tid('input-busca-principal').type(marcador);
      cy.wait('@buscar');
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-title').should('contain.text', marcador);
      cy.url().should('include', 'busca=' + marcador);
    });

    it('encontra o livro pelo autor', () => {
      cy.tid('input-busca-principal').type(`Autor ${marcador}`);
      cy.wait('@buscar');
      cy.tid('book-item').should('have.length', 1);
      cy.tid('book-author').should('contain.text', marcador);
    });

    it('mostra o estado vazio quando nada é encontrado', () => {
      cy.tid('input-busca-principal').type('termo-que-nao-existe-em-lugar-nenhum');
      cy.wait('@buscar');
      cy.tid('book-item').should('have.length', 0);
      cy.tid('msg-pesquisa-vazia').should('be.visible').and('contain.text', 'Nenhum resultado encontrado');
      cy.tid('msg-vazio-banco').should('not.be.visible');
    });

    it('aplica debounce: uma única requisição para uma digitação contínua', () => {
      cy.tid('input-busca-principal').type(marcador, { delay: 30 });
      cy.wait('@buscar');
      cy.wait(700);
      cy.get('@buscar.all').should('have.length', 1);
    });

    it('limpa a busca pelo botão X e restaura o acervo completo', () => {
      cy.tid('input-busca-principal').type(marcador);
      cy.wait('@buscar');
      cy.tid('btn-limpar-busca').should('be.visible').click();
      cy.wait('@buscar');
      cy.tid('input-busca-principal').should('have.value', '');
      cy.tid('book-item').should('have.length', Math.min(POR_PAGINA, totalLivros));
    });

    it('mantém o termo buscado ao recarregar a página pela URL', () => {
      cy.visitarBiblioteca(`?busca=${marcador}`);
      cy.tid('input-busca-principal').should('have.value', marcador);
      cy.tid('book-item').should('have.length', 1);
    });
  });

  describe('Ordenação', () => {
    const ordens = {
      recentes: 'id DESC',
      antigos: 'id ASC',
      az: 'titulo ASC',
      za: 'titulo DESC',
    };

    Object.entries(ordens).forEach(([valor, sqlOrdem]) => {
      it(`ordena por "${valor}" na mesma sequência do banco`, () => {
        // Entramos pela URL para cobrir também a renderização server-side; a
        // troca pelo select (que dispara o AJAX) é verificada logo abaixo.
        cy.visitarBiblioteca(`?ordem=${valor}`);
        cy.tid('select-ordenacao').should('have.value', valor);

        cy.sql(`SELECT titulo FROM livros ORDER BY ${sqlOrdem} LIMIT ${POR_PAGINA}`).then((esperado) => {
          cy.tid('book-title').then(($titulos) => {
            const naTela = [...$titulos].map((el) => el.innerText.trim());
            expect(naTela).to.deep.eq(esperado.map((l) => l.titulo));
          });
        });
      });
    });

    it('recarrega a grade por AJAX ao trocar o select', () => {
      cy.tid('select-ordenacao').select('az');
      cy.wait('@buscar').its('request.url').should('include', 'ordem=az');
      cy.url().should('include', 'ordem=az');

      cy.sql('SELECT titulo FROM livros ORDER BY titulo ASC LIMIT 1').then((esperado) => {
        cy.tid('book-title').first().should('have.text', esperado[0].titulo);
      });
    });

    it('volta para a primeira página ao trocar a ordenação', () => {
      if (totalLivros <= POR_PAGINA) return;
      cy.tid('btn-page-next').click();
      cy.wait('@buscar');
      cy.tid('page-current-num').should('have.text', '2');

      cy.tid('select-ordenacao').select('az');
      cy.wait('@buscar');
      cy.tid('page-current-num').should('have.text', '1');
    });
  });

  describe('Paginação', () => {
    it('desabilita "anterior" na primeira página', () => {
      cy.tid('btn-page-prev').should('have.class', 'disabled');
      cy.tid('page-current-num').should('have.text', '1');
    });

    it('avança e volta mantendo a contagem correta', function () {
      if (totalLivros <= POR_PAGINA) this.skip();

      cy.tid('btn-page-next').click();
      cy.wait('@buscar');
      cy.tid('page-current-num').should('have.text', '2');
      cy.url().should('include', 'pagina=2');

      cy.tid('btn-page-prev').click();
      cy.wait('@buscar');
      cy.tid('page-current-num').should('have.text', '1');
      cy.tid('btn-page-prev').should('have.class', 'disabled');
    });

    it('não repete livros entre páginas', function () {
      if (totalLivros <= POR_PAGINA) this.skip();

      cy.tid('book-item')
        .then(($itens) => [...$itens].map((el) => el.dataset.id))
        .then((idsPagina1) => {
          cy.tid('btn-page-next').click();
          cy.wait('@buscar');
          cy.tid('book-item').then(($itens) => {
            const idsPagina2 = [...$itens].map((el) => el.dataset.id);
            expect(idsPagina2.some((id) => idsPagina1.includes(id)), 'sem sobreposição entre páginas').to.be
              .false;
          });
        });
    });

    it('desabilita "próxima" na última página', function () {
      const ultima = Math.ceil(totalLivros / POR_PAGINA);
      if (ultima <= 1) this.skip();

      cy.visitarBiblioteca(`?pagina=${ultima}`);
      cy.tid('btn-page-next').should('have.class', 'disabled');
      cy.tid('page-current-num').should('have.text', String(ultima));
    });

    it('trata página fora do intervalo voltando para a última válida', () => {
      cy.visitarBiblioteca('?pagina=9999');
      cy.tid('page-current-num').should('have.text', String(Math.ceil(totalLivros / POR_PAGINA)));
    });

    it('preserva ordenação e busca ao paginar', function () {
      if (totalLivros <= POR_PAGINA) this.skip();

      cy.visitarBiblioteca('?ordem=az');
      cy.tid('btn-page-next').click();
      cy.wait('@buscar').its('request.url').should('include', 'ordem=az');
      cy.tid('select-ordenacao').should('have.value', 'az');
    });
  });

  describe('Resiliência da interface', () => {
    it('mostra um toast quando a busca falha no servidor', () => {
      cy.intercept('GET', '**/api/buscar.php*', { statusCode: 500, body: {} }).as('buscarFalha');
      cy.tid('input-busca-principal').type('qualquer');
      cy.wait('@buscarFalha');
      cy.tid('toast-erro').should('be.visible').and('contain.text', 'Não foi possível carregar a biblioteca');
    });

    it('recarrega a biblioteca pelo botão da tela de tempo limite', () => {
      // A tela de timeout aparece após 10s sem resposta; aqui ela é revelada
      // diretamente para validar o que interessa: o botão de recuperação funciona.
      cy.window().then((win) => {
        win.document.getElementById('errorTimeout').classList.remove('d-none');
      });
      cy.tid('error-timeout-screen').should('be.visible');
      cy.tid('btn-retry-timeout').click();
      cy.aguardarBiblioteca();
      cy.tid('error-timeout-screen').should('have.class', 'd-none');
    });
  });
});
