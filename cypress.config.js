const { defineConfig } = require('cypress');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// ---------------------------------------------------------------------------
// A configuração do banco é lida do próprio .env do projeto, para os testes
// usarem a mesma base que a aplicação — sem duplicar credenciais.
// ---------------------------------------------------------------------------
function lerEnv() {
  const arquivo = path.join(__dirname, '.env');
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

const env = lerEnv();

const CONEXAO = {
  host: env.DB_HOST || 'localhost',
  user: env.DB_USER || 'root',
  password: env.DB_PASS || '',
  database: env.DB_NAME || 'biblioteca_pdf',
  charset: 'utf8mb4',
};

// Marcadores e massa de dados vêm de um módulo único, compartilhado com os
// specs (cypress/support/dados.js) — assim o escopo de teste do navegador e o
// da guarda de escrita aqui no Node nunca divergem.
const {
  SUFIXO_EMAIL,
  PREFIXO_TITULO,
  HASH_SENHA_PADRAO,
  USUARIOS,
} = require('./cypress/support/dados');

// Os três usuários fixos da suíte sobrevivem à limpeza entre specs: recriá-los
// geraria ids novos, e as sessões memorizadas por cy.session (compartilhadas
// entre specs) passariam a apontar para usuários inexistentes.
const EMAILS_FIXOS = Object.values(USUARIOS).map((u) => u.email);

const RAIZ = __dirname;
const DIR_UPLOADS = path.join(RAIZ, 'uploads');
const DIR_CAPAS = path.join(RAIZ, 'capas');
const DIR_BANNERS = path.join(RAIZ, 'banners');
const DIR_BACKUP = path.join(RAIZ, 'cypress', '.backup-banners');

async function comConexao(fn) {
  const conn = await mysql.createConnection(CONEXAO);
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

/** Guarda de segurança: recusa qualquer escrita que não esteja restrita aos dados de teste. */
function garantirEscopoDeTeste(sql) {
  const s = sql.toLowerCase();
  if (/^\s*(drop|truncate|alter)/.test(s)) {
    throw new Error('Comando destrutivo bloqueado pela suite de testes: ' + sql);
  }
  if (!/^\s*(insert|update|delete)/.test(s)) return;

  const temEscopo =
    s.includes(SUFIXO_EMAIL) ||
    s.includes(PREFIXO_TITULO.toLowerCase()) ||
    s.includes('tentativas_login');

  if (!temEscopo) {
    throw new Error(
      'Escrita sem escopo de teste bloqueada. Restrinja a "' +
        PREFIXO_TITULO +
        '" ou "' +
        SUFIXO_EMAIL +
        '": ' +
        sql
    );
  }
}

module.exports = defineConfig({
  e2e: {
    // Caminho da instalação: vem do APP_URL do .env (ou de CYPRESS_BASE_URL),
    // para a suíte rodar em qualquer máquina sem editar este arquivo.
    baseUrl: env.APP_URL || 'http://localhost/meus_livros/',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    fixturesFolder: 'cypress/fixtures',
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    requestTimeout: 15000,
    responseTimeout: 60000,
    video: false,
    screenshotOnRunFailure: true,
    retries: { runMode: 1, openMode: 0 },
    experimentalMemoryManagement: true,

    setupNodeEvents(on) {
      on('task', {
        /** SELECT livre; escritas passam pela guarda de escopo. */
        async 'db:query'({ sql, params = [] }) {
          garantirEscopoDeTeste(sql);
          return comConexao(async (conn) => {
            const [linhas] = await conn.execute(sql, params);
            return linhas;
          });
        },

        /**
         * Cria (ou atualiza) os três usuários de teste com a senha padrão.
         * Recusa qualquer e-mail fora do sufixo de teste.
         */
        async 'db:seedUsuarios'({ usuarios, hashSenha = HASH_SENHA_PADRAO }) {
          return comConexao(async (conn) => {
            const ids = {};
            for (const [chave, u] of Object.entries(usuarios)) {
              if (!u.email.endsWith(SUFIXO_EMAIL)) {
                throw new Error('E-mail fora do escopo de teste: ' + u.email);
              }
              await conn.execute(
                `INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE nome = VALUES(nome), senha = VALUES(senha),
                 perfil = VALUES(perfil), reset_token = NULL, reset_expires = NULL`,
                [u.nome, u.email, hashSenha, u.perfil]
              );
              const [linhas] = await conn.execute('SELECT id FROM usuarios WHERE email = ?', [u.email]);
              ids[chave] = linhas[0].id;
            }
            return ids;
          });
        },

        /**
         * Cria um livro descartável: copia o PDF de fixture para uploads/ com um
         * nome próprio (prefixo e2e_) e insere a linha correspondente. Nunca
         * sobrescreve arquivo existente do acervo real.
         */
        async 'db:seedLivro'({ titulo, autor, emailDono = null, comCapa = true }) {
          if (!titulo.startsWith(PREFIXO_TITULO)) {
            throw new Error('Título de teste precisa começar com "' + PREFIXO_TITULO + '": ' + titulo);
          }
          const base = 'e2e_' + Date.now() + '_' + Math.random().toString(16).slice(2, 10);
          const nomePdf = base + '.pdf';
          const nomeCapa = comCapa ? base + '.png' : '';

          fs.copyFileSync(
            path.join(RAIZ, 'cypress', 'fixtures', 'livro-teste.pdf'),
            path.join(DIR_UPLOADS, nomePdf)
          );
          if (comCapa) {
            fs.copyFileSync(
              path.join(RAIZ, 'cypress', 'fixtures', 'capa-teste.png'),
              path.join(DIR_CAPAS, nomeCapa)
            );
          }

          return comConexao(async (conn) => {
            let donoId = null;
            if (emailDono) {
              const [u] = await conn.execute('SELECT id FROM usuarios WHERE email = ?', [emailDono]);
              donoId = u.length ? u[0].id : null;
            }
            const [res] = await conn.execute(
              'INSERT INTO livros (titulo, autor, nome_arquivo, capa_arquivo, usuario_id) VALUES (?, ?, ?, ?, ?)',
              [titulo, autor, nomePdf, nomeCapa, donoId]
            );
            return { id: res.insertId, titulo, autor, nomeArquivo: nomePdf, capaArquivo: nomeCapa };
          });
        },

        /**
         * Remove TUDO que a suíte criou — e somente isso: usuários @e2e.test,
         * livros "[E2E] ..." e os arquivos físicos gerados por ela (prefixo e2e_).
         */
        async 'db:limpar'() {
          return comConexao(async (conn) => {
            const [livros] = await conn.execute(
              'SELECT id, nome_arquivo, capa_arquivo FROM livros WHERE titulo LIKE ?',
              [PREFIXO_TITULO + '%']
            );
            // Os nomes vêm da própria linha do livro de teste — inclusive os
            // gerados pelo endpoint de upload real, que não usam o prefixo e2e_.
            // Só é apagado o que estiver dentro de uploads/ e capas/.
            for (const livro of livros) {
              for (const [dir, nome] of [
                [DIR_UPLOADS, livro.nome_arquivo],
                [DIR_CAPAS, livro.capa_arquivo],
              ]) {
                if (!nome || /[\\/]/.test(nome) || nome.includes('..')) continue;
                const caminho = path.join(dir, nome);
                if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
              }
            }
            const [delLivros] = await conn.execute('DELETE FROM livros WHERE titulo LIKE ?', [
              PREFIXO_TITULO + '%',
            ]);
            const marcadores = EMAILS_FIXOS.map(() => '?').join(', ');
            const [delUsuarios] = await conn.execute(
              `DELETE FROM usuarios WHERE email LIKE ? AND email NOT IN (${marcadores})`,
              ['%' + SUFIXO_EMAIL, ...EMAILS_FIXOS]
            );
            await conn.execute('DELETE FROM tentativas_login WHERE email LIKE ?', ['%' + SUFIXO_EMAIL]);
            return { livros: delLivros.affectedRows, usuarios: delUsuarios.affectedRows };
          });
        },

        /** Remove também os três usuários fixos — usar só ao encerrar tudo. */
        async 'db:limparUsuariosFixos'() {
          return comConexao(async (conn) => {
            const marcadores = EMAILS_FIXOS.map(() => '?').join(', ');
            const [res] = await conn.execute(
              `DELETE FROM usuarios WHERE email IN (${marcadores})`,
              EMAILS_FIXOS
            );
            return res.affectedRows;
          });
        },

        /**
         * Apaga as tentativas de login registradas a partir de um instante — usado
         * pelo teste de rate limit, que bloqueia o IP local por 5 minutos se ficar.
         */
        async 'db:limparTentativas'({ desde }) {
          return comConexao(async (conn) => {
            const [res] = await conn.execute('DELETE FROM tentativas_login WHERE criado_em >= ?', [desde]);
            return res.affectedRows;
          });
        },

        /** Backup dos banners reais antes de qualquer teste que os sobrescreva. */
        'banners:backup'() {
          fs.rmSync(DIR_BACKUP, { recursive: true, force: true });
          fs.mkdirSync(DIR_BACKUP, { recursive: true });
          for (const arquivo of fs.readdirSync(DIR_BANNERS)) {
            if (arquivo === '.htaccess') continue;
            fs.copyFileSync(path.join(DIR_BANNERS, arquivo), path.join(DIR_BACKUP, arquivo));
          }
          return fs.readdirSync(DIR_BACKUP);
        },

        /** Restaura exatamente o estado dos banners capturado no backup. */
        'banners:restaurar'() {
          if (!fs.existsSync(DIR_BACKUP)) return [];
          for (const arquivo of fs.readdirSync(DIR_BANNERS)) {
            if (arquivo === '.htaccess') continue;
            fs.unlinkSync(path.join(DIR_BANNERS, arquivo));
          }
          for (const arquivo of fs.readdirSync(DIR_BACKUP)) {
            fs.copyFileSync(path.join(DIR_BACKUP, arquivo), path.join(DIR_BANNERS, arquivo));
          }
          const restaurados = fs.readdirSync(DIR_BANNERS);
          fs.rmSync(DIR_BACKUP, { recursive: true, force: true });
          return restaurados;
        },

        'arquivos:existe'(caminhoRelativo) {
          return fs.existsSync(path.join(RAIZ, caminhoRelativo));
        },

        log(mensagem) {
          console.log(mensagem);
          return null;
        },
      });
    },
  },
});
