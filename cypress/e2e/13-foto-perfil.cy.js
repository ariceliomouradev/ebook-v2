/// <reference types="cypress" />

/**
 * Foto de perfil: menu do usuário > "Foto do perfil". Aceita JPG/JPEG/PNG até 2 MB; o servidor corta em
 * quadrado, reduz para 256 px e grava um WebP pequeno em avatares/ (no banco fica só o nome do arquivo).
 */

const abrirModal = () => {
  cy.tid('btn-user-menu').click();
  cy.tid('btn-menu-foto').click();
  cy.tid('modal-foto-perfil').should('be.visible');
};

describe('Foto de perfil', () => {
  before(() => {
    cy.limparMassaE2E();
    cy.semearUsuarios();
  });
  after(() => cy.limparMassaE2E());

  beforeEach(() => {
    cy.sql("UPDATE usuarios SET foto = NULL WHERE email LIKE '%@e2e.test'");
    cy.entrarComo('contribuidor');
    cy.visitarBiblioteca();
  });

  it('envia uma PNG, mostra no avatar, grava um WebP pequeno e permite remover', () => {
    abrirModal();
    cy.tid('btn-salvar-foto').should('be.disabled');
    cy.tid('input-foto-arquivo').selectFile('cypress/fixtures/capa-teste.png', { force: true });
    cy.tid('btn-salvar-foto').should('not.be.disabled').click();
    cy.tid('modal-foto-perfil').should('not.be.visible');
    cy.get('[data-avatar] img').should('have.attr', 'src').and('match', /avatares\/a_[0-9a-f]{16}\.webp/);

    cy.get('[data-avatar] img').invoke('attr', 'src').then((src) => {
      cy.request({ url: src, encoding: 'binary' }).then((r) => {
        expect(r.status).to.eq(200);
        expect(r.headers['content-type']).to.contain('image/webp');
        expect(r.body.length, 'bytes da foto salva').to.be.lessThan(80 * 1024);
      });
    });

    cy.reload();
    cy.get('[data-avatar] img').should('exist'); // continua depois de recarregar

    abrirModal();
    cy.tid('btn-remover-foto').should('be.visible').click();
    cy.get('[data-avatar] img').should('not.exist');
    cy.get('[data-avatar]').invoke('text').should('match', /\S/);
  });

  it('recusa no navegador o que não é JPG/PNG e o que passa de 2 MB', () => {
    abrirModal();
    cy.tid('input-foto-arquivo').selectFile('cypress/fixtures/arquivo-invalido.txt', { force: true });
    cy.tid('foto-erro').should('be.visible').and('contain', 'JPG');
    cy.tid('btn-salvar-foto').should('be.disabled');

    cy.tid('input-foto-arquivo').selectFile(
      { contents: Cypress.Buffer.alloc(3 * 1024 * 1024, 1), fileName: 'grande.png', mimeType: 'image/png' },
      { force: true }
    );
    cy.tid('foto-erro').should('be.visible').and('contain', '2 MB');
    cy.tid('btn-salvar-foto').should('be.disabled');
  });

  it('o servidor recusa arquivo falso com extensão .png e foto acima do limite', () => {
    cy.window().then(async (win) => {
      const csrf = JSON.parse(win.document.getElementById('app-config').textContent).csrfToken;
      const enviar = async (blob, nome) => {
        const fd = new win.FormData();
        fd.append('action', 'enviar');
        fd.append('csrf_token', csrf);
        fd.append('foto', blob, nome);
        const r = await win.fetch('api/foto_perfil.php', { method: 'POST', body: fd, headers: { 'X-CSRF-Token': csrf } });
        return { status: r.status, corpo: await r.json() };
      };
      const falso = await enviar(new win.Blob(['isto nao e uma imagem'], { type: 'image/png' }), 'x.png');
      expect(falso.status).to.eq(422);
      expect(falso.corpo.success).to.eq(false);
      const grande = await enviar(new win.Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/png' }), 'g.png');
      expect(grande.status).to.eq(422);
      expect(grande.corpo.success).to.eq(false);
    });
    cy.sql("SELECT foto FROM usuarios WHERE email = 'contribuidor@e2e.test'").then((r) => {
      expect(r[0].foto, 'nada gravado').to.eq(null);
    });
  });
});
