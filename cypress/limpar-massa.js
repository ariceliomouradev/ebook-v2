/**
 * Remove toda a massa de teste do banco, inclusive os três usuários fixos que a
 * suíte mantém entre specs. Use quando quiser deixar o banco sem nenhum vestígio
 * dos testes:
 *
 *   npm run test:limpar
 *
 * Escopo idêntico ao das tasks do cypress.config.js: usuários `@e2e.test`,
 * livros `[E2E] ...` e os arquivos apontados por essas linhas.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { SUFIXO_EMAIL, PREFIXO_TITULO } = require('./support/dados');

const RAIZ = path.join(__dirname, '..');

function lerEnv() {
  const arquivo = path.join(RAIZ, '.env');
  const valores = {};
  if (!fs.existsSync(arquivo)) return valores;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#') || !texto.includes('=')) continue;
    const [chave, ...resto] = texto.split('=');
    valores[chave.trim()] = resto.join('=').trim();
  }
  return valores;
}

(async () => {
  const env = lerEnv();
  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    user: env.DB_USER || 'root',
    password: env.DB_PASS || '',
    database: env.DB_NAME || 'biblioteca_pdf',
    charset: 'utf8mb4',
  });

  try {
    const [livros] = await conn.execute(
      'SELECT nome_arquivo, capa_arquivo FROM livros WHERE titulo LIKE ?',
      [PREFIXO_TITULO + '%']
    );

    let arquivos = 0;
    for (const livro of livros) {
      for (const [dir, nome] of [
        ['uploads', livro.nome_arquivo],
        ['capas', livro.capa_arquivo],
      ]) {
        if (!nome || /[\\/]/.test(nome) || nome.includes('..')) continue;
        const caminho = path.join(RAIZ, dir, nome);
        if (fs.existsSync(caminho)) {
          fs.unlinkSync(caminho);
          arquivos++;
        }
      }
    }

    const [delLivros] = await conn.execute('DELETE FROM livros WHERE titulo LIKE ?', [
      PREFIXO_TITULO + '%',
    ]);
    const [delUsuarios] = await conn.execute('DELETE FROM usuarios WHERE email LIKE ?', [
      '%' + SUFIXO_EMAIL,
    ]);
    await conn.execute('DELETE FROM tentativas_login WHERE email LIKE ?', ['%' + SUFIXO_EMAIL]);

    console.log(
      `Massa E2E removida: ${delLivros.affectedRows} livro(s), ${delUsuarios.affectedRows} usuário(s), ${arquivos} arquivo(s).`
    );
  } finally {
    await conn.end();
  }
})();
