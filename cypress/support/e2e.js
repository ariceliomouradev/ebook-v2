import './commands';

/**
 * Antes de qualquer spec, garante que os três usuários de teste existam com a
 * senha padrão. O seed é idempotente (INSERT ... ON DUPLICATE KEY UPDATE) e só
 * toca em e-mails terminados em @e2e.test.
 */
before(() => {
  cy.semearUsuarios();
  // Logins malsucedidos propositais (testes de senha errada) contam para o
  // bloqueio por IP e derrubariam os specs seguintes: o histórico dos usuários
  // de teste é zerado no início de cada arquivo.
  cy.sql("DELETE FROM tentativas_login WHERE email LIKE '%@e2e.test'");
});

/**
 * O anúncio quadrado abre sobre a tela (Administrador e Grátis) e interceptaria os cliques dos demais specs.
 * Fica escondido por padrão; o spec 12 liga com globalThis.__comAnuncio = true.
 */
Cypress.on('window:before:load', (win) => {
  if (globalThis.__comAnuncio) return;
  win.document.addEventListener('DOMContentLoaded', () => {
    const estilo = win.document.createElement('style');
    estilo.textContent = '.anuncio { display: none !important; }';
    win.document.head.appendChild(estilo);
  });
});

/**
 * O PDF.js emite rejeições assíncronas quando o worker do CDN demora ou quando
 * um documento é abortado por navegação — isso não é falha da aplicação, então
 * não derruba o teste. Qualquer outro erro não tratado continua falhando.
 */
Cypress.on('uncaught:exception', (err) => {
  const mensagem = err.message || '';
  const ruidoConhecido = [
    'Worker was destroyed',
    'TransportInitialization',
    'Rendering cancelled',
    'sendWithPromise',
    'AbortException',
  ];
  return !ruidoConhecido.some((trecho) => mensagem.includes(trecho));
});
