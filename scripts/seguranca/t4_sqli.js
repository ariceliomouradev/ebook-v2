// T4: SQL injection (erro, boolean, UNION, tempo, empilhada) em TODOS os parâmetros conhecidos + divulgação de erros
const fs = require('fs');
const path = require('path');
const { Client, sql, achados, achado, ok } = require('./lib');

const ERRO_SQL = /SQLSTATE|SQL syntax|mysqli?_|PDOException|You have an error in your SQL|Unknown column|Fatal error|Warning:|Notice:|Deprecated:|Stack trace|on line \d+|Uncaught/i;
const MARCA = '[E2E] PT ';

const PAYLOADS = [
  ["'", 'aspa simples'], ['"', 'aspa dupla'], ['\\', 'barra'], ["' OR '1'='1", 'OR sempre verdadeiro'], ['1 OR 1=1', 'OR numérico'],
  ["') OR ('1'='1", 'fecha parêntese'], ["' UNION SELECT NULL,NULL,NULL,NULL-- -", 'UNION'], ["1 UNION SELECT senha FROM usuarios-- -", 'UNION senha'],
  ["' AND SLEEP(3)-- -", 'tempo string'], ['1 AND SLEEP(3)', 'tempo numérico'], ["'; SELECT SLEEP(3)-- -", 'empilhada'], ["' OR SLEEP(3)#", 'tempo OR'],
  ["1' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT VERSION())))-- -", 'erro extractvalue'], ['%', 'curinga %'], ['_', 'curinga _'], ["0x27", 'hex'], ['-1', 'negativo'], ['9999999999999999999', 'inteiro gigante'],
  ['\u0000', 'byte nulo'], ["admin'-- -", 'comentário'], ['a'.repeat(5000), 'texto longo'],
];

async function main() {
  const ids = Object.fromEntries(sql("SELECT email, id FROM usuarios WHERE email LIKE '%@e2e.test'").map(([e, i]) => [e.split('@')[0], Number(i)]));
  const base = sql("SELECT nome_arquivo FROM livros WHERE publicacao='aprovado' AND formato='pdf' LIMIT 1")[0][0];
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%'`);
  sql(`INSERT INTO livros (titulo, autor, nome_arquivo, formato, usuario_id, visivel_para, publicacao) VALUES ('${MARCA}fuzz', 'Autor', '${base}', 'pdf', ${ids.admin}, 'contribuidor,leitor', 'aprovado')`);
  const bk = Number(sql('SELECT MAX(id) FROM livros')[0][0]);
  const A = new Client('A'), C = new Client('C'), L = new Client('L'), N = new Client('N');
  await A.login('admin@e2e.test'); await C.login('contribuidor@e2e.test'); await L.login('leitor@e2e.test');
  const ghost = 99999999; // id inexistente: ações destrutivas não têm alvo real
  const limpa = () => sql('DELETE FROM tentativas_login');

  const T = [
    // GET
    { n: 'index', cli: A, m: 'GET', u: '', b: { busca: 'a', ordem: 'recentes', categoria: 'geral', pagina: '1', favoritos: '0', msg: 'x', abrir: 'usuarios' } },
    { n: 'buscar', cli: A, m: 'GET', u: 'api/buscar.php', b: { busca: 'a', ordem: 'recentes', categoria: 'geral', pagina: '1', favoritos: '0' } },
    { n: 'buscar(leitor)', cli: L, m: 'GET', u: 'api/buscar.php', b: { busca: 'a', ordem: 'az', categoria: '', pagina: '1', favoritos: '1' } },
    { n: 'gerenciar_lista', cli: A, m: 'GET', u: 'api/gerenciar_lista.php', b: { busca: 'a', pagina: '1' } },
    { n: 'download', cli: A, m: 'GET', u: 'api/download.php', b: { id: bk } },
    { n: 'leitor', cli: A, m: 'GET', u: 'leitor', b: { id: bk, origem: '1', ordem: 'recentes', busca: 'a' } },
    { n: 'redefinir-senha', cli: N, m: 'GET', u: 'redefinir-senha', b: { token: 'abc', msg: 'x' } },
    { n: 'login', cli: N, m: 'GET', u: 'login', b: { erro: '1', msg: 'x' } },
    { n: 'cadastro', cli: N, m: 'GET', u: 'cadastro', b: { erro: 'x' } },
    // POST (formulário)
    { n: 'editar', cli: A, m: 'POST', u: 'api/editar.php', b: { id: bk, titulo: MARCA + 'fuzz', autor: 'Autor', categoria: 'geral', vis_contribuidor: '1', vis_leitor: '1', liberar_em: '' } },
    { n: 'excluir(fantasma)', cli: A, m: 'POST', u: 'api/excluir.php', b: { id: ghost } },
    { n: 'favoritos', cli: A, m: 'POST', u: 'api/favoritos.php', b: { action: 'alternar', livro_id: bk, favorito: '1' } },
    { n: 'anotacoes.listar', cli: A, m: 'POST', u: 'api/anotacoes.php', b: { action: 'listar', livro_id: bk } },
    { n: 'anotacoes.criar', cli: A, m: 'POST', u: 'api/anotacoes.php', b: { action: 'criar', livro_id: bk, pagina: '1', tipo: 'nota', x: '0.1', y: '0.1', cor: 'amarelo', comentario: 'oi' } },
    { n: 'anotacoes.editar', cli: A, m: 'POST', u: 'api/anotacoes.php', b: { action: 'editar', id: ghost, cor: 'verde', comentario: 'oi' } },
    { n: 'aprovacoes.listar', cli: A, m: 'POST', u: 'api/aprovacoes.php', b: { action: 'listar' } },
    { n: 'aprovacoes.editar', cli: A, m: 'POST', u: 'api/aprovacoes.php', b: { action: 'editar', id: ghost, titulo: 't', autor: 'a' } },
    { n: 'aprovacoes.negar', cli: A, m: 'POST', u: 'api/aprovacoes.php', b: { action: 'negar', id: ghost, motivo: 'm' } },
    { n: 'aprovacoes.aprovar', cli: A, m: 'POST', u: 'api/aprovacoes.php', b: { action: 'aprovar', id: ghost, titulo: 't', autor: 'a', vis_contribuidor: '1', vis_leitor: '1', liberar_em: '' } },
    { n: 'usuarios.listar', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'listar' } },
    { n: 'usuarios.adicionar', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'adicionar', nome: 'PT fuzz', email: 'pt-fuzz@e2e.test', senha: 'Aa1!aaaaaa', perfil: 'leitor', teste: '1' } },
    { n: 'usuarios.editar', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'editar', usuario_id: ghost, whatsapp: '85988887777', vencimento: '', tipo: 'pago' } },
    { n: 'usuarios.mudar_perfil', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'mudar_perfil', usuario_id: ghost, perfil: 'leitor' } },
    { n: 'usuarios.bloquear', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'bloquear', usuario_id: ghost } },
    { n: 'usuarios.renovar', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'renovar', usuario_id: ghost } },
    { n: 'usuarios.redefinir', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'redefinir_senha', usuario_id: ghost } },
    { n: 'usuarios.excluir', cli: A, m: 'POST', u: 'api/usuarios_gerenciar.php', b: { action: 'excluir', usuario_id: ghost } },
    { n: 'banners.link', cli: A, m: 'POST', u: 'api/manage_banners.php', b: { action: 'salvar_link', id: ghost, link: 'https://exemplo.com' } },
    { n: 'banners.mover', cli: A, m: 'POST', u: 'api/manage_banners.php', b: { action: 'mover', id: ghost, direcao: 'up' } },
    { n: 'banners.remover', cli: A, m: 'POST', u: 'api/manage_banners.php', b: { action: 'remover', id: ghost } },
    { n: 'duplicado', cli: A, m: 'POST', u: 'api/duplicado.php', b: { action: 'limpar', id: ghost } },
    { n: 'meus_envios', cli: C, m: 'POST', u: 'api/meus_envios.php', b: { action: 'solicitar', id: ghost } },
    { n: 'familia.adicionar', cli: C, m: 'POST', u: 'api/familia.php', b: { action: 'adicionar', nome: 'Dep PT', email: 'pt-dep@e2e.test', senha: 'Aa1!aaaaaa' } },
    { n: 'familia.remover', cli: C, m: 'POST', u: 'api/familia.php', b: { action: 'remover', usuario_id: ghost } },
    { n: 'acervo.listar', cli: L, m: 'POST', u: 'api/acervo.php', b: { action: 'listar', busca: 'a', pagina: '1' } },
    { n: 'acervo.liberar', cli: L, m: 'POST', u: 'api/acervo.php', b: { action: 'liberar', id: ghost } },
    { n: 'mudar_senha', cli: L, m: 'POST', u: 'api/mudar_senha.php', b: { senha_atual: 'x', nova_senha: 'Aa1!aaaaaa', confirma_senha: 'Aa1!aaaaaa' } },
    { n: 'foto_perfil', cli: L, m: 'POST', u: 'api/foto_perfil.php', b: { action: 'remover' } },
    // públicos (limitados por IP: limpa o contador a cada chamada)
    { n: 'auth', cli: N, m: 'POST', u: 'api/auth.php', b: { email: 'leitor@e2e.test', senha: 'errada' }, publico: true, csrfDe: 'login', pre: limpa },
    { n: 'solicitar_reset', cli: N, m: 'POST', u: 'api/solicitar_reset.php', b: { email_recuperacao: 'nao@existe.test' }, publico: true, csrfDe: 'login', pre: limpa },
    { n: 'salvar_nova_senha', cli: N, m: 'POST', u: 'api/salvar_nova_senha.php', b: { token: 'a'.repeat(64), nova_senha: 'Aa1!aaaaaa', confirma_senha: 'Aa1!aaaaaa' }, publico: true, csrfDe: 'login' },
    { n: 'cadastrar', cli: N, m: 'POST', u: 'api/cadastrar.php', b: { nome: 'PT', email: 'pt-sqli@e2e.test', whatsapp: '85988887777', senha: 'Aa1!aaaaaa', senha_confirmar: 'Aa1!aaaaaa', site: '' }, publico: true, csrfDe: 'cadastro', pre: limpa },
    // JSON
    { n: 'progresso', cli: A, m: 'JSON', u: `api/progresso.php?id=${bk}`, b: { pagina: 3, total: 10, posicao: 'epubcfi(/6/2)' } },
  ];

  const total = { requisicoes: 0 };
  const resumo = [];
  for (const t of T) {
    const params = Object.keys(t.b);
    // baseline
    const enviar = async (corpo, extraQuery = '') => {
      if (t.pre) t.pre();
      let csrf = t.cli.csrf;
      if (t.csrfDe) csrf = await t.cli.tokenDe(t.csrfDe);
      total.requisicoes++;
      if (t.m === 'GET') {
        const q = new URLSearchParams(corpo).toString();
        return t.cli.req(`${t.u}${t.u.includes('?') ? '&' : '?'}${q}`);
      }
      if (t.m === 'JSON') return t.cli.req(t.u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(corpo) });
      const p = new URLSearchParams({ ...corpo, csrf_token: csrf });
      return t.cli.req(t.u, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    };
    const b0 = await enviar(t.b);
    let achou = 0;
    for (const p of params) {
      // pares booleanos
      for (const [pl, desc] of PAYLOADS) {
        const corpo = { ...t.b, [p]: pl };
        const r = await enviar(corpo);
        const hit = [];
        if (r.status >= 500) hit.push(`status ${r.status}`);
        if (ERRO_SQL.test(r.text) && !ERRO_SQL.test(b0.text)) hit.push('mensagem de erro/aviso PHP-SQL na resposta: ' + (r.text.match(ERRO_SQL) || [''])[0]);
        if (/SLEEP/.test(pl) && r.ms > Math.max(b0.ms, 300) + 2500) hit.push(`atraso de ${r.ms} ms (SLEEP executado)`);
        if (/UNION SELECT senha/.test(pl) && /\$2y\$/.test(r.text)) hit.push('hash de senha vazou');
        if (hit.length) { achou++; achado(/SLEEP|UNION|hash/.test(hit.join()) ? 'CRITICA' : 'MEDIA', `SQLI-${t.n}-${p}`, `${t.n} (${t.m} ${t.u}) param "${p}" payload ${desc}: ${hit.join('; ')}`, `payload: ${pl.slice(0, 80)}`, 'prepared statement / validação de tipo'); }
      }
      // boolean-based em listagens: verdadeiro x falso
      if (['buscar', 'buscar(leitor)', 'gerenciar_lista', 'index', 'acervo.listar'].includes(t.n) && ['busca', 'categoria', 'pagina', 'ordem'].includes(p)) {
        const v = await enviar({ ...t.b, [p]: "x' OR '1'='1" });
        const f = await enviar({ ...t.b, [p]: "x' AND '1'='2" });
        const n1 = v.text.length, n2 = f.text.length;
        if (v.text !== f.text && Math.abs(n1 - n2) > 400 && p === 'busca') {
          // busca é LIKE parametrizado: respostas devem ser equivalentes ("sem resultado" nos dois)
          achado('ALTA', `SQLI-bool-${t.n}-${p}`, `Respostas diferentes para condição verdadeira/falsa em ${t.n}.${p}`, `${n1} x ${n2} bytes`, 'parametrizar');
        }
      }
    }
    resumo.push(`${t.n}: ${params.length} parâmetro(s) x ${PAYLOADS.length} payloads, falhas: ${achou}`);
  }
  console.log(resumo.join('\n'));
  console.log(`\n${total.requisicoes} requisições de injeção enviadas`);

  // Segunda ordem: grava payload em campos de texto e usa depois em consultas/listagens
  console.log('== segunda ordem ==');
  const sec = ["x'); DROP TABLE favoritos;-- -", "' OR 1=1 -- -", "x' UNION SELECT senha,2,3 FROM usuarios -- -"];
  for (const s of sec) {
    await A.form('api/editar.php', { id: bk, titulo: MARCA + s, autor: s, categoria: 'geral', vis_contribuidor: '1', vis_leitor: '1', csrf_token: A.csrf });
    for (const u of ['', 'api/buscar.php?busca=fuzz', 'api/gerenciar_lista.php?busca=fuzz', 'api/usuarios_gerenciar.php', 'api/aprovacoes.php']) {
      const r = u.startsWith('api/usuarios') || u.startsWith('api/aprov') ? await A.form(u, { action: 'listar', csrf_token: A.csrf }) : await A.req(u);
      if (r.status >= 500 || (ERRO_SQL.test(r.text) && !/Warning: Undefined/.test(r.text))) achado('ALTA', 'SQLI-2a-ordem', `Payload gravado causou erro em /${u}`, r.text.slice(0, 120), 'revisar consultas que concatenam');
    }
  }
  const tabelas = sql('SHOW TABLES').flat();
  if (!tabelas.includes('favoritos')) achado('CRITICA', 'SQLI-DROP', 'Tabela favoritos foi apagada por injeção!', '', '');
  else ok(`segunda ordem: ${tabelas.length} tabelas intactas`);

  // limpeza
  sql(`DELETE FROM livros WHERE titulo LIKE '${MARCA}%'`);
  sql("DELETE FROM usuarios WHERE email LIKE 'pt-%@e2e.test'");
  limpa();
  fs.writeFileSync(path.join(__dirname, 'achados_t4.json'), JSON.stringify(achados, null, 2));
  console.log(`\nT4 concluído: ${achados.length} achado(s)`);
}
main().catch((e) => { console.error('ERRO NO T4', e); process.exit(1); });
