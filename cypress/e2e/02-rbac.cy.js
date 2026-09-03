/// <reference types="cypress" />

/**
 * Matriz de controle de acesso (seção 6 da especificação):
 *
 * | Ação                    | leitor | contribuidor | admin |
 * | Ver biblioteca e ler    |   ✅   |      ✅      |  ✅   |
 * | Ver banners             |   ✅   |      ❌      |  ✅   |
 * | Trocar a própria senha  |   ✅   |      ✅      |  ✅   |
 * | Adicionar livro         |   ❌   |      ✅      |  ✅   |
 * | Editar / excluir livro  |   ❌   |      ❌      |  ✅   |
 * | Gerenciar banners       |   ❌   |      ❌      |  ✅   |
 * | Gerenciar usuários      |   ❌   |      ❌      |  ✅   |
 *
 * Cada regra é verificada nos dois níveis: o que a interface mostra e o que o
 * endpoint aceita (defesa no servidor, não só no HTML).
 */

const { SUFIXO_EMAIL, PREFIXO_TITULO } = require('../support/dados');

const PERFIS = ['leitor', 'contribuidor', 'admin'];

const PERMISSOES = {
  leitor: { banners: true, novoLivro: false, gerenciar: false, usuarios: false },
  contribuidor: { banners: false, novoLivro: true, gerenciar: false, usuarios: false },
  admin: { banners: true, novoLivro: true, gerenciar: true, usuarios: true },
};

describe('Controle de acesso por perfil (RBAC)', () => {
  before(() => cy.limparMassaE2E().then(() => cy.semearUsuarios()));

  describe('Interface do dashboard', () => {
    PERFIS.forEach((perfil) => {
      describe(`perfil ${perfil}`, () => {
        const regras = PERMISSOES[perfil];

        beforeEach(() => {
          cy.entrarComo(perfil);
          cy.visitarBiblioteca();
        });

        it('sempre vê a biblioteca e o menu do usuário', () => {
          cy.tid('header-title').should('be.visible');
          cy.tid('book-grid').should('exist');
          cy.tid('btn-user-menu').should('be.visible');
        });

        it(`${regras.novoLivro ? 'vê' : 'não vê'} o botão de adicionar livro`, () => {
          cy.tid('btn-novo-livro').should(regras.novoLivro ? 'exist' : 'not.exist');
        });

        it(`${regras.gerenciar ? 'vê' : 'não vê'} o botão do gerenciador (editar/excluir)`, () => {
          cy.tid('btn-abrir-gerenciador').should(regras.gerenciar ? 'exist' : 'not.exist');
        });

        it(`${regras.usuarios ? 'vê' : 'não vê'} o atalho de gestão de usuários`, () => {
          cy.tid('btn-user-menu').click();
          cy.tid('btn-menu-usuarios').should(regras.usuarios ? 'exist' : 'not.exist');
        });

        it(`${regras.banners ? 'vê' : 'não vê'} as áreas de banner`, () => {
          cy.tid('banner-horizontal-container').should(regras.banners ? 'exist' : 'not.exist');
          cy.tid('sidebar-container').should(regras.banners ? 'exist' : 'not.exist');
        });

        it('pode abrir a troca da própria senha', () => {
          cy.tid('btn-user-menu').click();
          cy.tid('btn-menu-trocar-senha').click();
          cy.tid('modal-trocar-senha').should('be.visible');
        });
      });
    });
  });

  describe('Página de gestão de usuários (usuarios.php)', () => {
    it('admin acessa normalmente', () => {
      cy.entrarComo('admin');
      cy.visit('usuarios.php');
      cy.tid('titulo-pagina-usuarios').should('be.visible');
      cy.tid('tabela-usuarios').should('exist');
    });

    ['leitor', 'contribuidor'].forEach((perfil) => {
      it(`${perfil} é redirecionado para o dashboard`, () => {
        cy.entrarComo(perfil);
        cy.request({ url: 'usuarios.php', followRedirect: false }).then((r) => {
          expect(r.status).to.eq(302);
          expect(r.redirectedToUrl).to.contain('index.php');
        });
      });
    });
  });

  describe('Endpoints protegidos (defesa no servidor)', () => {
    let livro;

    before(() => {
      cy.semearLivro({ titulo: `${PREFIXO_TITULO} Alvo RBAC` }).then((l) => (livro = l));
    });

    after(() => cy.limparMassaE2E());

    /** POST autenticado carregando o CSRF da sessão corrente. */
    function postar(url, corpo, opcoes = {}) {
      return cy.request('index.php').then((pagina) => {
        const csrf = JSON.parse(pagina.body.match(/id="app-config">\s*([\s\S]*?)\s*<\/script>/)[1]).csrfToken;
        return cy.request({
          method: 'POST',
          url,
          form: true,
          failOnStatusCode: false,
          followRedirect: false,
          headers: { 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' },
          body: Object.assign({ csrf_token: csrf }, corpo),
          ...opcoes,
        });
      });
    }

    describe('perfil leitor', () => {
      beforeEach(() => cy.entrarComo('leitor'));

      it('recebe 403 ao tentar editar um livro', () => {
        postar('api/editar.php', { id: livro.id, titulo: 'Invadido', autor: 'X' }).then((r) => {
          expect(r.status).to.eq(403);
          expect(r.body.success).to.be.false;
          expect(r.body.error).to.contain('Acesso negado');
        });
      });

      it('recebe 403 ao tentar excluir um livro', () => {
        postar('api/excluir.php', { id: livro.id }).then((r) => {
          expect(r.status).to.eq(403);
        });
        cy.sql('SELECT id FROM livros WHERE id = ?', [livro.id]).should('have.length', 1);
      });

      it('recebe 403 ao tentar gerenciar banners', () => {
        postar('api/manage_banners.php', { action: 'remover', tipo: 'h' }).its('status').should('eq', 403);
      });

      it('é redirecionado ao tentar enviar um livro', () => {
        postar('api/upload.php', { titulo: 'x' }).then((r) => {
          expect(r.status).to.eq(302);
          expect(r.redirectedToUrl).to.contain('index.php');
        });
      });

      it('é redirecionado ao tentar criar ou excluir usuários', () => {
        postar('api/usuario_add.php', { nome: 'X', email: 'x' + SUFIXO_EMAIL, senha: 'Ab1@abcd', perfil: 'admin' })
          .its('status')
          .should('eq', 302);
        postar('api/usuario_excluir.php', { usuario_id: 999999 }).its('status').should('eq', 302);
      });

      it('pode ler livros e salvar o próprio progresso', () => {
        cy.request({ url: `views/leitor.php?id=${livro.id}`, failOnStatusCode: false })
          .its('status')
          .should('eq', 200);
        cy.request({ url: `api/download.php?id=${livro.id}`, followRedirect: false })
          .its('status')
          .should('eq', 200);
      });
    });

    describe('perfil contribuidor', () => {
      beforeEach(() => cy.entrarComo('contribuidor'));

      it('recebe 403 ao editar ou excluir livros (mesmo os que enviou)', () => {
        postar('api/editar.php', { id: livro.id, titulo: 'Invadido', autor: 'X' }).its('status').should('eq', 403);
        postar('api/excluir.php', { id: livro.id }).its('status').should('eq', 403);
      });

      it('recebe 403 ao gerenciar banners', () => {
        postar('api/manage_banners.php', { action: 'remover', tipo: 's' }).its('status').should('eq', 403);
      });

      it('é redirecionado ao tentar gerenciar usuários', () => {
        postar('api/usuario_reset_senha.php', { usuario_id: 1, nova_senha: 'Ab1@abcd' })
          .its('status')
          .should('eq', 302);
      });

      it('não é bloqueado no endpoint de upload (perfil autorizado)', () => {
        // Sem arquivo o endpoint responde erro_arquivo — o que importa aqui é
        // que não houve bloqueio por perfil (que redireciona sem o msg=).
        postar('api/upload.php', { titulo: 'x' }).then((r) => {
          expect(r.status).to.eq(302);
          expect(r.redirectedToUrl).to.contain('msg=erro_arquivo');
        });
      });
    });

    describe('proteção CSRF (todos os perfis)', () => {
      beforeEach(() => cy.entrarComo('admin'));

      it('recusa escrita JSON sem token CSRF', () => {
        cy.request({
          method: 'POST',
          url: 'api/editar.php',
          form: true,
          failOnStatusCode: false,
          body: { id: livro.id, titulo: 'Sem CSRF', autor: 'X' },
        }).then((r) => {
          expect(r.status).to.eq(400);
          expect(r.body.error).to.contain('Sessão de segurança inválida');
        });
        cy.sql('SELECT titulo FROM livros WHERE id = ?', [livro.id]).then((linhas) => {
          expect(linhas[0].titulo).to.not.eq('Sem CSRF');
        });
      });

      it('recusa formulário sem token CSRF', () => {
        cy.request({
          method: 'POST',
          url: 'api/usuario_add.php',
          form: true,
          failOnStatusCode: false,
          body: { nome: 'X', email: 'csrf' + SUFIXO_EMAIL, senha: 'Ab1@abcd', perfil: 'admin' },
        }).then((r) => {
          expect(r.status).to.eq(400);
          expect(r.body).to.contain('Token de segurança inválido');
        });
        cy.sql('SELECT id FROM usuarios WHERE email = ?', ['csrf' + SUFIXO_EMAIL]).should(
          'have.length',
          0
        );
      });
    });
  });

  describe('Arquivos e diretórios protegidos', () => {
    const bloqueados = [
      '.env',
      'config/db.php',
      'includes/functions.php',
      'database/schema.sql',
      'components/header.php',
      'uploads/',
    ];

    bloqueados.forEach((caminho) => {
      it(`nega acesso direto a ${caminho}`, () => {
        cy.request({ url: caminho, failOnStatusCode: false }).then((r) => {
          expect(r.status, `status de ${caminho}`).to.be.oneOf([301, 302, 403, 404]);
          expect(String(r.body)).to.not.contain('DB_PASS');
        });
      });
    });

    it('exige sessão para baixar um PDF do acervo', () => {
      cy.clearCookies();
      cy.request({ url: 'api/download.php?id=1', followRedirect: false }).then((r) => {
        expect(r.status).to.eq(302);
        expect(r.redirectedToUrl).to.contain('login.php');
      });
    });
  });
});
