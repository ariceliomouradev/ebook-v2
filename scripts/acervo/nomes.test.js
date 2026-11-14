'use strict';
// Rode com: npm run test:unit   (usa o test runner nativo do Node, sem dependências)
const test = require('node:test');
const assert = require('node:assert/strict');
const { repararNome, inferirTituloAutor, construirContextoAutores, pareceNome, autorMetadadoValido } = require('./nomes');

test.describe('repararNome', () => {
    const casos = [
        // [corrompido, esperado] — todos extraídos de arquivos reais do acervo
        ['Educa+º+úo Financeira', 'Educação Financeira'],
        ['Intelig+¬ncia Emocional', 'Inteligência Emocional'],
        ['Li+º+Áes Para o S+®culo 21', 'Lições Para o Século 21'],
        ['+ëtica +® o Melhor Neg+¦cio', 'Ética é o Melhor Negócio'],
        ['Programa+º+úo Neurolingu+¡stica', 'Programação Neurolinguística'],
        ['Disciplina - I+ºami Tiba', 'Disciplina - Içami Tiba'],
        ['A revolu+º+úo 8020', 'A revolução 8020'],
        ['100 Dicas para falar em p+¦blico', '100 Dicas para falar em público'],
        ['Mem+¦ria e Hist+¦ria', 'Memória e História'],
        ['Ant+¦nio', 'Antônio'],
        ['Babil+¦nia', 'Babilônia'],
        ['Conte+¦do', 'Conteúdo'],
        ['Anselm Gr++n', 'Anselm Grün'],
        ['Gisele B++ndchen', 'Gisele Bündchen'],
        ['Neuroling+++¡stica', 'Neurolingüística'],
        ['A Sabedoria ÔÇô Anselm', 'A Sabedoria – Anselm'],
        ['Disney+ÔÇÖs Frozen', 'Disney+’s Frozen'],
        ['+Ültimo Dia', 'Último Dia'],
        ['Tr+ómite', 'Trâmite'],
    ];
    for (const [entrada, esperado] of casos) {
        test(`"${entrada}" -> "${esperado}"`, () => assert.equal(repararNome(entrada), esperado));
    }

    test('variante NFD (acento combinante corrompido)', () => {
        assert.equal(repararNome('transformac¦ºa¦âo'), 'transformação');
        assert.equal(repararNome('organizac¦ºo¦âes'), 'organizações');
        assert.equal(repararNome('rumo a¦Ç economia'), 'rumo à economia');
        assert.equal(repararNome('a pro¦xima geração'), 'a próxima geração');
    });

    test('nomes já corretos passam intactos', () => {
        assert.equal(repararNome('Análise Técnica Explicada'), 'Análise Técnica Explicada');
        assert.equal(repararNome('Jesus - O Maior Psicólogo'), 'Jesus - O Maior Psicólogo');
    });

    test('"C++" é título legítimo e não vira "ü"', () => {
        assert.equal(repararNome('Programando em C++'), 'Programando em C++');
        assert.equal(repararNome('C++ Primer'), 'C++ Primer');
    });

    test('"+" solto, sem caractere da tabela depois, é preservado', () => {
        assert.equal(repararNome('Plano A+ Premium'), 'Plano A+ Premium');
    });
});

test.describe('inferirTituloAutor', () => {
    test('formato "Título - Autor"', () => {
        const r = inferirTituloAutor('Marketing Pessoal - Sady Bordin');
        assert.equal(r.titulo, 'Marketing Pessoal');
        assert.equal(r.autor, 'Sady Bordin');
        assert.equal(r.confianca, 'alta');
    });

    test('subtítulo no meio: só o último trecho é autor', () => {
        const r = inferirTituloAutor('Homo Deus - Uma Breve História do Amanhã - Yuval Noah Harari');
        assert.equal(r.titulo, 'Homo Deus - Uma Breve História do Amanhã');
        assert.equal(r.autor, 'Yuval Noah Harari');
    });

    test('iniciais no nome do autor', () => {
        const r = inferirTituloAutor('A Ciencia de Ficar Rico - Wallace D. Wattles');
        assert.equal(r.autor, 'Wallace D. Wattles');
    });

    test('autor primeiro só com evidência: o acervo repete o nome', () => {
        const ctx = construirContextoAutores([
            'Bert Hellinger - Constelações Familiares',
            'Bert Hellinger - As Ordens da Ajuda',
            'Bert Hellinger - Quando Você Faz o Bem',
            'Sady Bordin - Marketing Pessoal',
        ]);
        const r = inferirTituloAutor('Bert Hellinger - Quando Você Faz o Bem', null, ctx);
        assert.equal(r.autor, 'Bert Hellinger');
        assert.equal(r.titulo, 'Quando Você Faz o Bem');
    });

    test('autor primeiro também vale quando o metadado do PDF confirma', () => {
        const r = inferirTituloAutor('Matthew Quick - O Lado Bom da Vida', 'Matthew Quick');
        assert.equal(r.autor, 'Matthew Quick');
        assert.equal(r.titulo, 'O Lado Bom da Vida');
    });

    test('sem evidência NÃO inventa autor: o nome inteiro vira título', () => {
        const r = inferirTituloAutor('Academia Disney - o Programa de Treinamento de Uma Das Mais Poderosas Marcas');
        assert.equal(r.autor, 'Autor Desconhecido');
        assert.equal(r.titulo, 'Academia Disney - o Programa de Treinamento de Uma Das Mais Poderosas Marcas');
    });

    test('começar por artigo é título, não autor', () => {
        const r = inferirTituloAutor('A Fórmula - Conversas com gestores de ações brasileiros');
        assert.equal(r.autor, 'Autor Desconhecido');
    });

    test('frase capitalizada longa não é nome de pessoa', () => {
        const r = inferirTituloAutor('Muito Alem da Velocidade da Luz - consciencia, fisica quantica e a busca pela quinta dimensao');
        assert.equal(r.autor, 'Autor Desconhecido');
        assert.ok(r.titulo.startsWith('Muito Alem da Velocidade da Luz'));
    });

    test('os dois lados parecem nome: o acervo decide quem é o autor', () => {
        // "Max Lucado - Bom Dia Amigo": sem contexto o padrão "Título - Autor" erraria.
        const nomes = ['Max Lucado - Bom Dia Amigo', 'Max Lucado - Ele Escolheu os Cravos', 'Max Lucado - Derrubando Golias'];
        const ctx = construirContextoAutores(nomes);
        const comContexto = inferirTituloAutor('Max Lucado - Bom Dia Amigo', null, ctx);
        assert.equal(comContexto.autor, 'Max Lucado');
        assert.equal(comContexto.titulo, 'Bom Dia Amigo');
        const semContexto = inferirTituloAutor('Max Lucado - Bom Dia Amigo');
        assert.equal(semContexto.autor, 'Bom Dia Amigo'); // o limite do heurístico puro, e por isso o contexto existe
        assert.equal(semContexto.confianca, 'media');
        // sem contexto, vale o padrão "Título - Autor"
        assert.equal(inferirTituloAutor('Davi e Golias - Malcolm Gladwell').autor, 'Malcolm Gladwell');
    });

    test('título repetido em 2 edições NÃO vira autor', () => {
        const ctx = construirContextoAutores(['Despertar - Sam Harris', 'Despertar - Um guia para a espiritualidade sem religiao']);
        assert.equal(inferirTituloAutor('Despertar - Sam Harris', null, ctx).autor, 'Sam Harris');
        const ctx2 = construirContextoAutores(['Mapas Mentais - Tony Buzan', 'Mapas Mentais - Entendeu Direito']);
        assert.equal(inferirTituloAutor('Mapas Mentais - Tony Buzan', null, ctx2).autor, 'Tony Buzan');
    });

    test('palavra única não vira autor sem evidência', () => {
        const r = inferirTituloAutor('Copywriting - Business');
        assert.equal(r.autor, 'Autor Desconhecido');
        assert.equal(r.titulo, 'Copywriting - Business');
    });

    test('"Sobrenome, Nome" no fim do arquivo', () => {
        const r = inferirTituloAutor('Bilionários Por Acaso - A Criação do Facebook - Mezrich, Ben');
        assert.equal(r.autor, 'Ben Mezrich');
        assert.equal(r.titulo, 'Bilionários Por Acaso - A Criação do Facebook');
    });
    test('lista de autores com nome e sobrenome', () => {
        const r = inferirTituloAutor('Análise Técnica Clássica - Flávio Lemos, Celso Cardoso');
        assert.equal(r.autor, 'Flávio Lemos, Celso Cardoso');
        assert.equal(r.titulo, 'Análise Técnica Clássica');
    });


    test('título com vírgula não é confundido com lista de autores', () => {
        const r = inferirTituloAutor('Pai Rico, Pai Pobre - Robert Kiyosaki');
        assert.equal(r.titulo, 'Pai Rico, Pai Pobre');
        assert.equal(r.autor, 'Robert Kiyosaki');
    });

    test('nome slug sem espaços vira título legível', () => {
        const r = inferirTituloAutor('Quem-Pensa-Enriquece-Napoleon-Hill');
        assert.equal(r.titulo, 'Quem Pensa Enriquece Napoleon Hill');
        assert.equal(r.autor, 'Autor Desconhecido');
    });

    test('sem autor identificável: título é o nome inteiro', () => {
        const r = inferirTituloAutor('Sonho Grande');
        assert.equal(r.titulo, 'Sonho Grande');
        assert.equal(r.autor, 'Autor Desconhecido');
        assert.equal(r.confianca, 'baixa');
    });

    test('metadado do PDF só entra quando o nome não revela o autor', () => {
        assert.equal(inferirTituloAutor('Sonho Grande', 'Cris Arcangeli').autor, 'Cris Arcangeli');
        assert.equal(inferirTituloAutor('Marketing Pessoal - Sady Bordin', 'Outra Pessoa').autor, 'Sady Bordin');
    });

    test('metadado lixo é descartado', () => {
        for (const lixo of ['Administrador', 'Morear PC', 'Microsoft Word', 'www.livrosgratis.com.br', 'Unknown']) {
            assert.equal(inferirTituloAutor('Sonho Grande', lixo).autor, 'Autor Desconhecido', lixo);
        }
    });

    test('remove sufixo de cópia e marcas de site', () => {
        assert.equal(inferirTituloAutor('Sonho Grande (1)').titulo, 'Sonho Grande');
        assert.equal(inferirTituloAutor('Sonho Grande (z-lib.org)').titulo, 'Sonho Grande');
    });

    test('"+" usado como espaço entre palavras', () => {
        const r = inferirTituloAutor('A Fórmula de Deus- José+Rodrigues+dos+Santos');
        assert.equal(r.titulo, 'A Fórmula de Deus');
        assert.equal(r.autor, 'José Rodrigues dos Santos');
    });

    test('"+" legítimo em título é preservado', () => {
        assert.equal(inferirTituloAutor('Excel+Word Avançado').titulo, 'Excel+Word Avançado');
        assert.equal(inferirTituloAutor('PNL + Persuasão').titulo, 'PNL + Persuasão');
    });

    test('separadores mal formatados: "Título- Autor" e "Título -Autor"', () => {
        assert.equal(inferirTituloAutor('Quem Mexeu no Meu Queijo- Spencer Johnson').autor, 'Spencer Johnson');
        assert.equal(inferirTituloAutor('Inteligencia Comportamental  -Dr Jo Furlan').titulo, 'Inteligencia Comportamental');
    });

    test('hífen sem espaço faz parte do título', () => {
        assert.equal(inferirTituloAutor('Mapa-Mental do Sucesso').titulo, 'Mapa-Mental do Sucesso');
        assert.equal(inferirTituloAutor('Pós-Graduação em Marketing').titulo, 'Pós-Graduação em Marketing');
    });

    test('padrão "Título by Autor"', () => {
        const r = inferirTituloAutor('Administração de Marketing by Philip Kotler');
        assert.equal(r.titulo, 'Administração de Marketing');
        assert.equal(r.autor, 'Philip Kotler');
        const r2 = inferirTituloAutor('A última introdução para PNL - Como construir uma vida by Richard Bandler');
        assert.equal(r2.titulo, 'A última introdução para PNL - Como construir uma vida');
        assert.equal(r2.autor, 'Richard Bandler');
    });

    test('extensão duplicada no nome é removida', () => {
        const r = inferirTituloAutor('Coisas que se Beneficiam com o Caos by Nassim Nicholas Taleb.epub');
        assert.equal(r.autor, 'Nassim Nicholas Taleb');
        assert.equal(r.titulo, 'Coisas que se Beneficiam com o Caos');
    });

    test('autor em maiúsculas e "Sobrenome, Nome" são normalizados', () => {
        assert.equal(inferirTituloAutor('A Máquina de Vendas by CHET HOLMES').autor, 'Chet Holmes');
        assert.equal(inferirTituloAutor('Sonho Grande', 'Rackham, Neil').autor, 'Neil Rackham');
    });

    test('metadado que é título de livro ou palavra única é descartado', () => {
        assert.equal(inferirTituloAutor('Sonho Grande', 'A Realização Espontânea do Desejo').autor, 'Autor Desconhecido');
        assert.equal(inferirTituloAutor('Sonho Grande', 'Antifrágil').autor, 'Autor Desconhecido');
    });

    test('nome todo em maiúsculas é normalizado', () => {
        assert.equal(inferirTituloAutor('A ARTE DA GUERRA').titulo, 'A Arte da Guerra');
    });

    test('respeita o limite de 255 caracteres da coluna', () => {
        const r = inferirTituloAutor('X'.repeat(400));
        assert.ok(r.titulo.length <= 255);
    });

    test('nome com mojibake já sai reparado no título', () => {
        const r = inferirTituloAutor('Educa+º+úo Financeira - Gustavo Cerbasi');
        assert.equal(r.titulo, 'Educação Financeira');
        assert.equal(r.autor, 'Gustavo Cerbasi');
    });
});

test.describe('pareceNome / autorMetadadoValido', () => {
    test('aceita nomes de pessoa', () => {
        for (const n of ['John C. Maxwell', 'Içami Tiba', 'Yuval Noah Harari', 'Luc Ferry', 'Osho', 'Augusto Cury']) {
            assert.ok(pareceNome(n), n);
        }
    });
    test('recusa o que parece título', () => {
        for (const n of ['Como Ficar Rico', 'Guia Prático de Investimentos', 'Os 7 Hábitos', 'o poder do hábito']) {
            assert.equal(pareceNome(n), false, n);
        }
    });
    test('metadado: aceita nome, recusa nome de máquina e site', () => {
        assert.ok(autorMetadadoValido('Yuval Noah Harari'));
        assert.equal(autorMetadadoValido('Administrador'), false);
        assert.equal(autorMetadadoValido('Morear PC'), false);
        assert.equal(autorMetadadoValido('livros.com.br'), false);
    });
});
