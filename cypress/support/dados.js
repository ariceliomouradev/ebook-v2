/**
 * Fonte única da massa de testes — usada tanto pelos specs (no navegador)
 * quanto pelo cypress.config.js (no Node), para que os marcadores de escopo
 * nunca fiquem fora de sincronia entre os dois lados.
 *
 * Regra de escopo: todo usuário criado pela suíte termina em SUFIXO_EMAIL e
 * todo livro começa com PREFIXO_TITULO. As tasks de banco recusam escritas que
 * não declarem um desses marcadores, então nenhum dado real é alterado.
 */
const SUFIXO_EMAIL = '@e2e.test';
const PREFIXO_TITULO = '[E2E]';

const SENHA_PADRAO = 'Senha@E2E1';

// Hash bcrypt de SENHA_PADRAO. Fixo por ser apenas um verificador: o
// password_verify() do PHP valida contra ele e o seed não precisa de nenhuma
// dependência de bcrypt no Node. Para trocar a senha padrão, regere com:
//   php -r "echo password_hash('NovaSenha', PASSWORD_DEFAULT);"
const HASH_SENHA_PADRAO = '$2y$10$kEiueqHKJB8NppVKaKhSD.R4D67vJ0lrVFPX8nJkaIfPwxqp0njG.';

const USUARIOS = {
  admin: { nome: 'E2E Admin', email: 'admin' + SUFIXO_EMAIL, perfil: 'admin' },
  contribuidor: { nome: 'E2E Contribuidor', email: 'contribuidor' + SUFIXO_EMAIL, perfil: 'contribuidor' },
  leitor: { nome: 'E2E Leitor', email: 'leitor' + SUFIXO_EMAIL, perfil: 'leitor' },
};

module.exports = {
  SUFIXO_EMAIL,
  PREFIXO_TITULO,
  SENHA_PADRAO,
  HASH_SENHA_PADRAO,
  USUARIOS,
};
