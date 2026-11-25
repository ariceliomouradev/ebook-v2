/**
 * Gera a coleção e os ambientes do Postman da API REST de livros (pasta postman/).
 *   node scripts/gerar-postman.js
 * Importe no Postman: Import > postman/Meus Livros API.postman_collection.json e um dos ambientes.
 * Os ambientes NÃO levam senha: preencha "email" e "senha" no Postman (ficam só na sua máquina).
 */
const fs = require('fs');
const path = require('path');

const pasta = path.join(__dirname, '..', 'postman');
fs.mkdirSync(pasta, { recursive: true });

const url = (rota, query = []) => ({
  raw: '{{base_url}}' + rota + (query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''),
  host: ['{{base_url}}'],
  path: rota.split('/').filter(Boolean),
  query: query.map((q) => ({ key: q.key, value: q.value, disabled: !!q.disabled, description: q.description })),
});
const evento = (linhas) => [{ listen: 'test', script: { type: 'text/javascript', exec: linhas } }];
const json = (obj) => ({ mode: 'raw', raw: JSON.stringify(obj, null, 2), options: { raw: { language: 'json' } } });

const salvaTokens = [
  'pm.test("200 e tokens recebidos", function () {',
  '  pm.response.to.have.status(200);',
  '  const j = pm.response.json();',
  '  pm.expect(j.access_token).to.match(/^ml_[a-f0-9]{48}$/);',
  '  pm.collectionVariables.set("access_token", j.access_token);',
  '  pm.collectionVariables.set("refresh_token", j.refresh_token);',
  '});',
];

const itens = [
  {
    name: '1. Autenticação',
    item: [
      {
        name: 'Entrar (obter token)',
        event: evento(salvaTokens),
        request: {
          auth: { type: 'noauth' },
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: json({ email: '{{email}}', senha: '{{senha}}', aparelho: 'Postman' }),
          url: url('/auth/token'),
          description: 'Troca e-mail e senha por um access_token (vale 1 hora) e um refresh_token (30 dias). Os dois ficam nas variáveis da coleção e os demais pedidos já os usam.',
        },
      },
      {
        name: 'Renovar token',
        event: evento(salvaTokens),
        request: {
          auth: { type: 'noauth' },
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: json({ refresh_token: '{{refresh_token}}' }),
          url: url('/auth/refresh'),
          description: 'Use quando o access_token vencer (401 token_invalido_ou_expirado). Devolve um par novo; o refresh_token antigo deixa de valer.',
        },
      },
      {
        name: 'Sair (revogar token)',
        event: evento(['pm.test("200", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().ok).to.eql(true); });']),
        request: { method: 'POST', header: [], url: url('/auth/logout', [{ key: 'todos', value: '1', disabled: true, description: 'Marque para sair de todos os aparelhos' }]) },
      },
      {
        name: 'Quem sou eu',
        event: evento(['pm.test("200 e usuário", function () { pm.response.to.have.status(200); const j = pm.response.json(); pm.expect(j.usuario.email).to.be.a("string"); });']),
        request: { method: 'GET', header: [], url: url('/me'), description: 'Dados da conta, plano e quantos livros diferentes já foram abertos hoje (limite diário).' },
      },
    ],
  },
  {
    name: '2. Livros',
    item: [
      {
        name: 'Listar livros',
        event: evento([
          'pm.test("200 e lista paginada", function () {',
          '  pm.response.to.have.status(200);',
          '  const j = pm.response.json();',
          '  pm.expect(j.dados).to.be.an("array");',
          '  pm.expect(j.meta).to.have.keys("pagina", "por_pagina", "total", "total_paginas");',
          '  if (j.dados.length) {',
          '    const l = j.dados[0];',
          '    pm.expect(l).to.include.keys("id", "titulo", "autor", "sinopse", "formato", "capa_url", "arquivo_url");',
          '    pm.collectionVariables.set("livro_id", l.id);',
          '  }',
          '});',
        ]),
        request: {
          method: 'GET',
          header: [],
          url: url('/livros', [
            { key: 'pagina', value: '1' },
            { key: 'por_pagina', value: '10', description: 'até 50' },
            { key: 'busca', value: '', disabled: true, description: 'procura em título, autor e sinopse' },
            { key: 'autor', value: '', disabled: true },
            { key: 'categoria', value: '', disabled: true, description: 'slug da categoria (veja /categorias)' },
            { key: 'formato', value: 'epub', disabled: true, description: 'pdf ou epub' },
            { key: 'ordem', value: 'recentes', disabled: true, description: 'recentes, antigos, az ou za' },
            { key: 'favoritos', value: '1', disabled: true, description: 'só os favoritos' },
          ]),
          description: 'Lista só os livros que o seu plano pode ver (a mesma regra do site). Cada livro traz título, autor, sinopse, categoria, links assinados da capa e do arquivo, progresso e favorito. O primeiro id fica salvo em {{livro_id}}.',
        },
      },
      {
        name: 'Buscar por texto',
        event: evento(['pm.test("200", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().dados).to.be.an("array"); });']),
        request: { method: 'GET', header: [], url: url('/livros', [{ key: 'busca', value: 'dom quixote' }, { key: 'por_pagina', value: '5' }]) },
      },
      {
        name: 'Meus favoritos',
        event: evento(['pm.test("200", function () { pm.response.to.have.status(200); });']),
        request: { method: 'GET', header: [], url: url('/livros', [{ key: 'favoritos', value: '1' }]) },
      },
      {
        name: 'Detalhe do livro',
        event: evento(['pm.test("200 e livro", function () { pm.response.to.have.status(200); const l = pm.response.json().dados; pm.expect(l.id).to.eql(Number(pm.collectionVariables.get("livro_id"))); });']),
        request: { method: 'GET', header: [], url: url('/livros/{{livro_id}}'), description: 'Rode "Listar livros" antes (ele preenche {{livro_id}}) ou troque o id à mão.' },
      },
      {
        name: 'Capa (imagem PNG)',
        event: evento(['pm.test("imagem", function () { if (pm.response.code === 404) { pm.expect(pm.response.json().erro.codigo).to.eql("sem_capa"); } else { pm.response.to.have.status(200); pm.expect(pm.response.headers.get("Content-Type")).to.include("image/png"); } });']),
        request: { method: 'GET', header: [], url: url('/livros/{{livro_id}}/capa'), description: 'Também funciona sem cabeçalho, pelo link assinado (capa_url) que vem no JSON do livro: serve direto em <img src>.' },
      },
      {
        name: 'Arquivo (PDF/EPUB, visualizar)',
        event: evento(['pm.test("200/206 e arquivo", function () { pm.expect([200, 206]).to.include(pm.response.code); pm.expect(pm.response.headers.get("Content-Type")).to.match(/pdf|epub/); });']),
        request: {
          method: 'GET',
          header: [{ key: 'Range', value: 'bytes=0-1023', disabled: true, description: 'Desmarque o "disabled" para pedir só um trecho (206)' }],
          url: url('/livros/{{livro_id}}/arquivo'),
          description: 'Envia o PDF ou EPUB inteiro (aceita Range para baixar por partes). Conta no limite diário de livros diferentes do seu plano.',
        },
      },
      {
        name: 'Arquivo (baixar como anexo)',
        event: evento(['pm.test("anexo", function () { pm.expect([200, 206]).to.include(pm.response.code); pm.expect(pm.response.headers.get("Content-Disposition")).to.include("attachment"); });']),
        request: { method: 'GET', header: [], url: url('/livros/{{livro_id}}/arquivo', [{ key: 'download', value: '1' }]) },
      },
    ],
  },
  {
    name: '3. Favoritos e progresso',
    item: [
      {
        name: 'Favoritar',
        event: evento(['pm.test("favorito = true", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().favorito).to.eql(true); });']),
        request: { method: 'PUT', header: [], url: url('/livros/{{livro_id}}/favorito') },
      },
      {
        name: 'Desfavoritar',
        event: evento(['pm.test("favorito = false", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().favorito).to.eql(false); });']),
        request: { method: 'DELETE', header: [], url: url('/livros/{{livro_id}}/favorito') },
      },
      {
        name: 'Ler progresso',
        event: evento(['pm.test("200", function () { pm.response.to.have.status(200); });']),
        request: { method: 'GET', header: [], url: url('/livros/{{livro_id}}/progresso') },
      },
      {
        name: 'Gravar progresso',
        event: evento(['pm.test("200 e porcentagem", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().dados.porcentagem).to.eql(25); });']),
        request: {
          method: 'PUT',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: json({ pagina: 5, total: 20 }),
          url: url('/livros/{{livro_id}}/progresso'),
          description: 'pagina e total são inteiros (1 <= pagina <= total). "posicao" (texto, opcional) guarda o ponto exato de leitura de EPUBs (CFI).',
        },
      },
    ],
  },
  {
    name: '4. Categorias e status',
    item: [
      {
        name: 'Categorias',
        event: evento(['pm.test("200 e categorias", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().dados[0]).to.include.keys("slug", "nome", "total"); });']),
        request: { method: 'GET', header: [], url: url('/categorias') },
      },
      {
        name: 'Status do serviço',
        event: evento(['pm.test("ok", function () { pm.response.to.have.status(200); pm.expect(pm.response.json().status).to.eql("ok"); });']),
        request: { auth: { type: 'noauth' }, method: 'GET', header: [], url: url('/status') },
      },
    ],
  },
];

const colecao = {
  info: {
    name: 'Meus Livros API',
    description: 'API REST de livros (v1). Fluxo: 1) preencha email e senha no ambiente; 2) rode "Entrar (obter token)"; 3) use os demais pedidos (o Bearer token é aplicado sozinho). Documentação: docs/API.md.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }] },
  variable: [
    { key: 'access_token', value: '' },
    { key: 'refresh_token', value: '' },
    { key: 'livro_id', value: '' },
  ],
  item: itens,
};

const ambiente = (nome, base) => ({
  name: nome,
  values: [
    { key: 'base_url', value: base, enabled: true },
    { key: 'email', value: '', enabled: true, type: 'default' },
    { key: 'senha', value: '', enabled: true, type: 'secret' },
  ],
  _postman_variable_scope: 'environment',
});

fs.writeFileSync(path.join(pasta, 'Meus Livros API.postman_collection.json'), JSON.stringify(colecao, null, 2));
fs.writeFileSync(path.join(pasta, 'Meus Livros - Local.postman_environment.json'), JSON.stringify(ambiente('Meus Livros - Local', 'http://localhost/meus_livros/api/v1'), null, 2));
fs.writeFileSync(path.join(pasta, 'Meus Livros - Producao.postman_environment.json'), JSON.stringify(ambiente('Meus Livros - Produção', 'https://meuslivros.ariceliomoura.com.br/api/v1'), null, 2));
console.log('Postman: coleção e 2 ambientes gravados em postman/');
