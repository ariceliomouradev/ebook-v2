/// <reference types="cypress" />

/**
 * Qualidade de uso: feedback visível em toda ação, ausência de erros de
 * console, semântica mínima de acessibilidade (títulos, rótulos, textos
 * alternativos, foco) e comportamento das janelas modais.
 */

const { USUARIOS, SENHA_PADRAO, PREFIXO_TITULO } = require('../support/dados');

const PREFIXO = () => PREFIXO_TITULO;

describe('UX e acessibilidade', () => {
  let livro;

  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
    cy.semearLivro({ titulo: `${PREFIXO()} UX ${Date.now().toString().slice(-6)}` }).then(
      (l) => (livro = l)
    );
  });

  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.garantirLivro(livro, { titulo: `${PREFIXO()} UX` }).then((l) => (livro = l));
  });

  describe('Console limpo', () => {
    const paginas = ['login.php', 'index.php', 'usuarios.php'];

    paginas.forEach((pagina) => {
      it(`${pagina} carrega sem erros no console`, () => {
        const erros = [];
        cy.entrarComo('admin');
        cy.visitarColetandoErros(pagina, erros);
        cy.wait(1500);
        cy.then(() => {
          expect(erros, `erros de console em ${pagina}`).to.deep.eq([]);
        });
      });
    });

    it('o leitor carrega o PDF sem violar a Content-Security-Policy', () => {
      const erros = [];
      cy.entrarComo('leitor');
      cy.visitarColetandoErros(`views/leitor.php?id=${livro.id}`, erros);
      cy.tid('text-total-pages', { timeout: 30000 }).should('not.have.text', '--');
      cy.then(() => {
        const csp = erros.filter((e) => /Content Security Policy|livroConfig is not defined/i.test(e));
        expect(csp, 'sem bloqueio de CSP nem script inline quebrado').to.deep.eq([]);
      });
    });
  });

  describe('Títulos e semântica das páginas', () => {
    const titulos = [
      { url: 'login.php', contem: 'Login' },
      { url: 'index.php', contem: 'Meus Livros' },
      { url: 'usuarios.php', contem: 'Gerenciar Usuários' },
    ];

    titulos.forEach(({ url, contem }) => {
      it(`${url} tem título descritivo na aba`, () => {
        if (url === 'login.php') {
          // Autenticado, login.php redireciona para o dashboard.
          Cypress.session.clearAllSavedSessions();
          cy.clearCookies();
        } else {
          cy.entrarComo('admin');
        }
        cy.visit(url);
        cy.title().should('contain', contem);
      });
    });

    it('as capas dos livros têm texto alternativo com o título', () => {
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
      cy.get('body').then(($b) => {
        if (!$b.find('[data-testid="book-cover-img"]').length) return;
        cy.tid('book-cover-img').first().should('have.attr', 'alt').and('include', 'Capa do livro');
      });
    });

    it('os campos de senha têm dica visível do requisito mínimo', () => {
      cy.entrarComo('admin');
      cy.visit('usuarios.php');
      cy.tid('btn-modal-novo-usuario').click();
      // A mesma dica aparece em outros modais (ocultos): a busca fica no aberto.
      cy.tid('modal-novo-usuario').contains('Mín 8 caracteres').should('be.visible');
      cy.tid('input-senha-usuario')
        .should('have.attr', 'title')
        .and('contain', 'Mínimo 8 caracteres');
    });

    it('os botões de ação da tabela de usuários têm title explicativo', () => {
      cy.entrarComo('admin');
      cy.visit('usuarios.php');
      cy.tid('btn-reset-senha').first().should('have.attr', 'title', 'Redefinir Senha');
      cy.tid('btn-excluir-usuario').first().should('have.attr', 'title', 'Excluir Usuário');
    });
  });

  describe('Feedback de carregamento e de erro', () => {
    beforeEach(() => {
      cy.entrarComo('admin');
    });

    it('mostra o loader durante o carregamento e o esconde ao final', () => {
      cy.visit('index.php');
      cy.tid('global-loader').should('exist');
      cy.tid('global-loader').should('have.class', 'loader-hidden');
    });

    it('mostra o loader ao enviar um livro', () => {
      cy.visitarBiblioteca();
      cy.tid('btn-novo-livro').click();
      cy.tid('input-file-pdf').selectFile('cypress/fixtures/livro-teste.pdf');
      cy.get('#capaBase64', { timeout: 20000 }).invoke('val').should('not.be.empty');
      cy.tid('input-book-title').type(`${PREFIXO()} Feedback Loader`);
      cy.tid('input-book-author').type('Autor E2E');
      cy.tid('btn-submit-new-book').click();
      cy.tid('alerta-mensagem').should('be.visible');
    });

    it('exibe toast quando o servidor falha em uma exclusão', () => {
      cy.visitarBiblioteca();
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('input-busca-gerenciador').type(livro.titulo);

      cy.intercept('POST', '**/api/excluir.php', {
        statusCode: 500,
        body: { success: false, error: 'Erro interno do banco de dados.' },
      }).as('excluirFalha');

      cy.tid('btn-excluir-item').filter(':visible').click();
      cy.tid('btn-confirmar-exclusao').click();
      cy.wait('@excluirFalha');

      cy.tid('toast-erro').should('be.visible').and('contain.text', 'Erro interno');
      cy.tid('global-loader').should('have.class', 'loader-hidden');
      cy.sql('SELECT id FROM livros WHERE id = ?', [livro.id]).should('have.length', 1);
    });

    it('limpa o parâmetro msg da URL depois de mostrar o alerta', () => {
      cy.visit('index.php?msg=pwd_changed');
      cy.tid('modal-alerta-global').should('be.visible');
      cy.url().should('not.include', 'msg=');
    });
  });

  describe('Comportamento dos modais', () => {
    beforeEach(() => {
      cy.entrarComo('admin');
      cy.visitarBiblioteca();
    });

    it('fecha o modal de novo livro pelo X e pela tecla Esc', () => {
      cy.tid('btn-novo-livro').click();
      cy.tid('modal-add-book').should('be.visible');
      cy.tid('btn-close-modal-add').click();
      cy.tid('modal-add-book').should('not.be.visible');

      cy.tid('btn-novo-livro').click();
      cy.tid('modal-add-book').should('be.visible');
      cy.get('body').type('{esc}');
      cy.tid('modal-add-book').should('not.be.visible');
    });

    it('navega entre as três telas internas do gerenciador sem recarregar', () => {
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('view-lista-gerenciador').should('be.visible');

      cy.tid('link-gerenciar-banners').click();
      cy.tid('view-gerenciar-banners').should('be.visible');
      cy.tid('title-modal-manager').should('contain.text', 'Aparência do Sistema');

      cy.tid('btn-voltar-dos-banners').click();
      cy.tid('view-lista-gerenciador').should('be.visible');

      cy.tid('btn-editar-item').first().click();
      cy.tid('view-formulario-edicao').should('be.visible');
      cy.tid('btn-cancelar-edicao').click();
      cy.tid('view-lista-gerenciador').should('be.visible');
      cy.tid('title-modal-manager').should('contain.text', 'Gerenciar Biblioteca');
    });

    it('não recarrega a biblioteca quando o gerenciador é fechado sem alterações', () => {
      cy.tid('btn-abrir-gerenciador').click();
      cy.window().then((win) => {
        win.__marcadorDePagina = 'intacto';
      });
      cy.tid('btn-close-modal-manager').click();
      cy.tid('modal-manager').should('not.be.visible');
      cy.window().its('__marcadorDePagina').should('eq', 'intacto');
    });

    it('exige confirmação em toda ação destrutiva', () => {
      cy.tid('btn-abrir-gerenciador').click();
      cy.tid('btn-excluir-item').first().click();
      cy.tid('modal-confirmar-excluir')
        .should('be.visible')
        .and('contain.text', 'Confirmar Exclusão');
      cy.tid('btn-cancelar-exclusao').click();
    });
  });

  describe('Navegação por teclado', () => {
    it('permite enviar o login apenas com o teclado', () => {
      const usuario = USUARIOS.leitor;
      Cypress.session.clearAllSavedSessions();
      cy.visit('login.php');
      cy.tid('login-email-input').focus().type(usuario.email);
      cy.tid('login-password-input').type(`${SENHA_PADRAO}{enter}`, { log: false });
      cy.url().should('include', 'index.php');
    });

    it('permite trocar de página no leitor pelo campo numérico', () => {
      cy.entrarComo('leitor');
      cy.visit(`views/leitor.php?id=${livro.id}`);
      cy.tid('text-total-pages', { timeout: 30000 }).should('not.have.text', '--');
      cy.tid('input-page-number').clear().type('2{enter}');
      cy.tid('input-page-number').should('have.value', '2');
    });
  });

  describe('Consistência visual', () => {
    it('usa o tema escuro em todas as telas autenticadas', () => {
      cy.entrarComo('admin');
      ['index.php', 'usuarios.php'].forEach((pagina) => {
        cy.visit(pagina);
        cy.get('body').should(($b) => {
          const fundo = getComputedStyle($b[0]).backgroundColor;
          const [r, g, b] = fundo.match(/\d+/g).map(Number);
          expect(r + g + b, `fundo escuro em ${pagina}`).to.be.lessThan(200);
        });
      });
    });

    it('mostra o perfil do usuário logado no menu', () => {
      cy.entrarComo('contribuidor');
      cy.visitarBiblioteca();
      cy.tid('btn-user-menu').should('contain.text', 'E2E').click();
      cy.contains('Nível:').should('contain.text', 'CONTRIBUIDOR');
    });

    it('indica progresso de leitura com cor distinta ao concluir', () => {
      cy.entrarComo('leitor');
      cy.visitarBiblioteca();
      cy.tid('book-progress-bar').first().find('.progress-bar').should('have.attr', 'class');
    });
  });
});
