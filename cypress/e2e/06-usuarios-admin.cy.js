/// <reference types="cypress" />

/**
 * Gestão de acessos (usuarios.php) — exclusiva do admin.
 *
 * Todos os usuários criados/excluídos aqui usam e-mails @e2e.test; os usuários
 * reais do sistema aparecem apenas em asserções de leitura.
 */

const { USUARIOS, SUFIXO_EMAIL, PREFIXO_TITULO } = require('../support/dados');

const SUFIXO = () => SUFIXO_EMAIL;
const SENHA_VALIDA = 'NovaSenha@2026';

describe('Gestão de usuários (admin)', () => {
  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
  });

  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.entrarComo('admin');
    cy.visit('usuarios');
  });

  describe('Listagem', () => {
    it('mostra a tabela com todos os usuários e seus perfis', () => {
      cy.tid('titulo-pagina-usuarios').should('contain.text', 'Controle de Acessos');
      cy.sql('SELECT COUNT(*) AS total FROM usuarios').then((linhas) => {
        cy.tid('linha-usuario').should('have.length', Number(linhas[0].total));
      });
      cy.tid('badge-perfil').should('exist');
    });

    it('destaca a própria conta e não oferece ações sobre ela', () => {
      const email = USUARIOS.admin.email;
      cy.contains('[data-testid="linha-usuario"]', email).within(() => {
        cy.contains('Você').should('be.visible');
        cy.tid('btn-excluir-usuario').should('not.exist');
        cy.tid('btn-reset-senha').should('not.exist');
      });
    });

    it('oferece ações de reset e exclusão para os demais usuários', () => {
      cy.contains('[data-testid="linha-usuario"]', USUARIOS.leitor.email).within(() => {
        cy.tid('btn-reset-senha').should('be.visible');
        cy.tid('btn-excluir-usuario').should('be.visible');
      });
    });

    it('volta para a biblioteca pelo botão de retorno', () => {
      cy.tid('btn-voltar-index').click();
      cy.url().should('not.include', '.php');
      cy.aguardarBiblioteca();
    });
  });

  describe('Cadastro de usuário', () => {
    it('cria um usuário e permite que ele faça login com a senha provisória', () => {
      const email = `novo${Date.now().toString().slice(-6)}${SUFIXO()}`;

      cy.tid('btn-modal-novo-usuario').click();
      cy.tid('modal-novo-usuario').should('be.visible');
      cy.tid('input-nome-usuario').type('E2E Novo Contribuidor');
      cy.tid('input-email-usuario').type(email);
      cy.tid('input-senha-usuario').type(SENHA_VALIDA, { log: false });
      cy.tid('select-perfil-usuario').select('contribuidor');
      cy.tid('btn-salvar-usuario').click();

      cy.tid('alerta-mensagem').should('contain.text', 'Usuário cadastrado com sucesso');
      cy.tid('btn-fechar-alerta').click();
      cy.contains('[data-testid="linha-usuario"]', email)
        .tidDentro('badge-perfil')
        .should('have.text', 'contribuidor');

      cy.sql('SELECT senha, perfil FROM usuarios WHERE email = ?', [email]).then((linhas) => {
        expect(linhas[0].senha, 'senha gravada com hash').to.match(/^\$2y\$/);
        expect(linhas[0].perfil).to.eq('contribuidor');
      });

      Cypress.session.clearAllSavedSessions();
      cy.loginPelaUi(email, SENHA_VALIDA);
      cy.url().should('not.include', '.php');
      cy.aguardarBiblioteca();
      cy.tid('btn-novo-livro').should('exist');
      cy.tid('btn-abrir-gerenciador').should('not.exist');
    });

    it('bloqueia senha fraca antes mesmo de enviar (validação nativa)', () => {
      cy.tid('btn-modal-novo-usuario').click();
      cy.tid('input-nome-usuario').type('E2E Fraco');
      cy.tid('input-email-usuario').type(`fraco${Date.now().toString().slice(-6)}${SUFIXO()}`);
      cy.tid('input-senha-usuario').type('123456', { log: false });
      cy.tid('btn-salvar-usuario').click();

      cy.tid('input-senha-usuario').then(($el) => {
        expect($el[0].checkValidity(), 'senha fraca reprovada pelo pattern').to.be.false;
      });
      cy.url().should('include', '/usuarios');
    });

    it('bloqueia senha fraca também no servidor', () => {
      const email = `fracosrv${Date.now().toString().slice(-6)}${SUFIXO()}`;
      cy.request('usuarios').then((pagina) => {
        const csrf = pagina.body.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
        cy.request({
          method: 'POST',
          url: 'api/usuario_add.php',
          form: true,
          followRedirect: false,
          body: { csrf_token: csrf, nome: 'E2E Fraco', email, senha: 'fraquinha', perfil: 'leitor' },
        }).then((r) => {
          expect(r.redirectedToUrl).to.contain('msg=erro_pwd_weak');
        });
      });
      cy.sql('SELECT id FROM usuarios WHERE email = ?', [email]).should('have.length', 0);
    });

    it('recusa e-mail já cadastrado', () => {
      cy.tid('btn-modal-novo-usuario').click();
      cy.tid('input-nome-usuario').type('E2E Duplicado');
      cy.tid('input-email-usuario').type(USUARIOS.leitor.email);
      cy.tid('input-senha-usuario').type(SENHA_VALIDA, { log: false });
      cy.tid('btn-salvar-usuario').click();

      cy.tid('alerta-mensagem').should('contain.text', 'já está em uso');
      cy.sql('SELECT COUNT(*) AS total FROM usuarios WHERE email = ?', [
        USUARIOS.leitor.email,
      ]).then((linhas) => expect(Number(linhas[0].total)).to.eq(1));
    });

    it('mostra e esconde a senha provisória pelo botão do olho', () => {
      cy.tid('btn-modal-novo-usuario').click();
      cy.tid('input-senha-usuario').type('Visivel@123', { log: false });
      cy.tid('btn-toggle-senha-provisoria').click();
      cy.tid('input-senha-usuario').should('have.attr', 'type', 'text');
      cy.tid('btn-toggle-senha-provisoria').click();
      cy.tid('input-senha-usuario').should('have.attr', 'type', 'password');
    });
  });

  describe('Redefinição de senha de terceiro', () => {
    it('admin define nova senha e o usuário passa a entrar com ela', () => {
      const alvo = USUARIOS.contribuidor;
      const novaSenha = 'Trocada@2026';

      cy.contains('[data-testid="linha-usuario"]', alvo.email).tidDentro('btn-reset-senha').click();
      cy.tid('modal-reset-senha-usuario').should('be.visible');
      cy.contains(alvo.nome).should('be.visible');
      cy.tid('input-reset-nova-senha').type(novaSenha, { log: false });
      cy.tid('btn-confirmar-reset-senha').click();

      cy.tid('alerta-mensagem').should('contain.text', 'senha do usuário foi redefinida');

      Cypress.session.clearAllSavedSessions();
      cy.loginPelaUi(alvo.email, novaSenha);
      cy.url().should('not.include', '.php');

      // Restaura a senha padrão da massa de teste para os demais specs.
      cy.semearUsuarios();
      Cypress.session.clearAllSavedSessions();
    });

    it('recusa senha fraca na redefinição', () => {
      const alvo = USUARIOS.leitor;
      cy.contains('[data-testid="linha-usuario"]', alvo.email).tidDentro('btn-reset-senha').click();
      cy.tid('input-reset-nova-senha').type('abc', { log: false });
      cy.tid('btn-confirmar-reset-senha').click();
      cy.tid('input-reset-nova-senha').then(($el) => {
        expect($el[0].checkValidity()).to.be.false;
      });
    });
  });

  describe('Exclusão de usuário', () => {
    it('exclui mediante confirmação e mantém os livros dele na biblioteca', () => {
      const email = `descartavel${Date.now().toString().slice(-6)}${SUFIXO()}`;

      cy.task('db:seedUsuarios', {
        usuarios: { descartavel: { nome: 'E2E Descartável', email, perfil: 'contribuidor' } },
      });
      cy.semearLivro({
        titulo: `${PREFIXO_TITULO} Livro do Excluído`,
        emailDono: email,
      }).then((livro) => {
        cy.visit('usuarios');
        cy.contains('[data-testid="linha-usuario"]', email).tidDentro('btn-excluir-usuario').click();

        cy.tid('modal-excluir-usuario').should('be.visible');
        cy.contains('serão mantidos').should('be.visible');
        cy.tid('btn-confirmar-excluir-usuario').click();

        cy.tid('alerta-mensagem').should('contain.text', 'Usuário excluído');
        cy.contains('[data-testid="linha-usuario"]', email).should('not.exist');
        cy.sql('SELECT id FROM usuarios WHERE email = ?', [email]).should('have.length', 0);

        cy.sql('SELECT usuario_id FROM livros WHERE id = ?', [livro.id]).then((linhas) => {
          expect(linhas, 'livro preservado').to.have.length(1);
          expect(linhas[0].usuario_id, 'autoria desvinculada').to.be.null;
        });
      });
    });

    it('cancela a exclusão sem apagar nada', () => {
      const alvo = USUARIOS.leitor;
      cy.contains('[data-testid="linha-usuario"]', alvo.email).tidDentro('btn-excluir-usuario').click();
      cy.tid('modal-excluir-usuario').should('be.visible').contains('button', 'Cancelar').click();
      cy.tid('modal-excluir-usuario').should('not.be.visible');
      cy.sql('SELECT id FROM usuarios WHERE email = ?', [alvo.email]).should('have.length', 1);
    });

    it('impede o admin de excluir a própria conta pelo endpoint', () => {
      const admin = USUARIOS.admin;
      cy.sql('SELECT id FROM usuarios WHERE email = ?', [admin.email]).then((linhas) => {
        const meuId = linhas[0].id;
        cy.request('usuarios').then((pagina) => {
          const csrf = pagina.body.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
          cy.request({
            method: 'POST',
            url: 'api/usuario_excluir.php',
            form: true,
            followRedirect: false,
            body: { csrf_token: csrf, usuario_id: meuId },
          }).then((r) => {
            expect(r.redirectedToUrl).to.contain('msg=erro_self_delete');
          });
        });
        cy.sql('SELECT id FROM usuarios WHERE id = ?', [meuId]).should('have.length', 1);
      });
    });
  });
});
