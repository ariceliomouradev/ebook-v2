#!/usr/bin/env node
'use strict';
/**
 * Gera as peças de divulgação do carrossel do painel em assets/promo/.
 *
 *   npm run promos
 *
 * Cada peça sai em dois formatos: horizontal (faixa no topo, telas < 1200px) e vertical (lateral,
 * telas largas). O desenho fica em código para o texto e as cores poderem ser ajustados em um lugar
 * só e as imagens regeneradas. Os textos conferem com os projetos reais do autor; troque os
 * rótulos em PECAS abaixo se mudar a oferta.
 *
 * Entradas: capas da biblioteca (../capas) e a capa do livro em assets/promo/fonte/livro-capa.png.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'assets', 'promo');
const FONTE = path.join(RAIZ, 'assets', 'fonts', 'inter-latin-wght-normal.woff2');

if (fs.existsSync(FONTE)) GlobalFonts.registerFromPath(FONTE, 'InterV');
const SANS = GlobalFonts.has('InterV') ? 'InterV' : 'Segoe UI, Arial';
const MONO = 'Courier New, Consolas, monospace';

const FORMATOS = {
    h: { w: 1600, h: 560 },
    v: { w: 600, h: 1600 },
};

/* ------------------------------ utilitários ------------------------------- */
function caminhoRedondo(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function quebrar(g, texto, larguraMax) {
    const palavras = texto.split(' ');
    const linhas = [];
    let atual = '';
    for (const p of palavras) {
        const teste = atual ? atual + ' ' + p : p;
        if (g.measureText(teste).width > larguraMax && atual) {
            linhas.push(atual);
            atual = p;
        } else {
            atual = teste;
        }
    }
    if (atual) linhas.push(atual);
    return linhas;
}

/** Escreve texto com quebra automática; devolve o y logo abaixo da última linha. */
function texto(g, str, x, y, { tamanho, peso = 700, cor = '#fff', fonte = SANS, largura, altura = 1.12, alinhar = 'left', sombra = null }) {
    g.font = `${peso} ${tamanho}px ${fonte}`;
    g.fillStyle = cor;
    g.textAlign = alinhar;
    g.textBaseline = 'top';
    if (sombra) {
        g.shadowColor = sombra.cor;
        g.shadowBlur = sombra.blur;
    }
    const linhas = largura ? quebrar(g, str, largura) : [str];
    linhas.forEach((l, i) => g.fillText(l, x, y + i * tamanho * altura));
    g.shadowBlur = 0;
    g.shadowColor = 'transparent';
    return y + linhas.length * tamanho * altura;
}

function pilula(g, str, x, y, { tamanho, fundo, cor, borda = null, padX = 0.9, alinhar = 'left' }) {
    g.font = `700 ${tamanho}px ${SANS}`;
    const lar = g.measureText(str).width + tamanho * padX * 2;
    const alt = tamanho * 2.2;
    const x0 = alinhar === 'center' ? x - lar / 2 : x;
    caminhoRedondo(g, x0, y, lar, alt, alt / 2);
    g.fillStyle = fundo;
    g.fill();
    if (borda) {
        g.strokeStyle = borda;
        g.lineWidth = 2;
        g.stroke();
    }
    g.fillStyle = cor;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(str, x0 + tamanho * padX, y + alt / 2 + 1);
    return { largura: lar, altura: alt };
}

function brilho(g, cx, cy, raio, rgba) {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, raio);
    grad.addColorStop(0, rgba);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(cx - raio, cy - raio, raio * 2, raio * 2);
}

function capaComSombra(g, img, x, y, w, h, giro = 0, raio = 14) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate((giro * Math.PI) / 180);
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    caminhoRedondo(g, -w / 2, -h / 2, w, h, raio);
    g.fillStyle = '#111';
    g.fill();
    g.shadowColor = 'transparent';
    g.save();
    caminhoRedondo(g, -w / 2, -h / 2, w, h, raio);
    g.clip();
    // cover: preenche o retângulo mantendo a proporção, ancorado no topo (como nos cards)
    const k = Math.max(w / img.width, h / img.height);
    g.drawImage(img, -w / 2, -h / 2, img.width * k, img.height * k);
    g.restore();
    caminhoRedondo(g, -w / 2, -h / 2, w, h, raio);
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
}

/* ----------------------------- sprites retrô ------------------------------ */
// Invasor genérico de 11x8 (forma clássica de arcade, sem personagem de terceiros).
const INVASOR = [
    '00100000100',
    '00010001000',
    '00111111100',
    '01101110110',
    '11111111111',
    '10111111101',
    '10100000101',
    '00011011000',
];
const NAVE = ['0000100000', '0001110000', '0011111000', '1111111110', '1111111110'];

function pixels(g, mapa, x, y, tam, cor, brilhoCor) {
    g.save();
    if (brilhoCor) {
        g.shadowColor = brilhoCor;
        g.shadowBlur = tam * 2.2;
    }
    g.fillStyle = cor;
    mapa.forEach((linha, j) => {
        [...linha].forEach((c, i) => {
            if (c === '1') g.fillRect(x + i * tam, y + j * tam, tam - 1, tam - 1);
        });
    });
    g.restore();
}

function controle(g, cx, cy, escala) {
    g.save();
    g.translate(cx, cy);
    g.scale(escala, escala);
    g.shadowColor = 'rgba(255,60,200,0.6)';
    g.shadowBlur = 40;
    caminhoRedondo(g, -190, -95, 380, 190, 70);
    const gr = g.createLinearGradient(0, -95, 0, 95);
    gr.addColorStop(0, '#3a2a63');
    gr.addColorStop(1, '#1d1438');
    g.fillStyle = gr;
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 3;
    g.stroke();
    // direcional
    g.fillStyle = '#0d0a1f';
    g.fillRect(-135, -14, 90, 28);
    g.fillRect(-104, -45, 28, 90);
    // botões
    [[85, 12, '#ff4fa3'], [128, -16, '#ffd23f'], [128, 40, '#3fd0ff'], [171, 12, '#7cff6b']].forEach(([x, y, c]) => {
        g.beginPath();
        g.arc(x - 20, y, 17, 0, Math.PI * 2);
        g.fillStyle = c;
        g.fill();
    });
    // start / select
    g.fillStyle = 'rgba(255,255,255,0.35)';
    caminhoRedondo(g, -34, 30, 30, 10, 5);
    g.fill();
    caminhoRedondo(g, 6, 30, 30, 10, 5);
    g.fill();
    g.restore();
}

function grade(g, w, h, horizonte) {
    g.save();
    g.strokeStyle = 'rgba(255,79,200,0.45)';
    g.lineWidth = 2;
    const fuga = w / 2;
    for (let i = -14; i <= 14; i++) {
        g.beginPath();
        g.moveTo(fuga + i * 26, horizonte);
        g.lineTo(fuga + i * (w / 7), h);
        g.stroke();
    }
    for (let j = 0; j < 9; j++) {
        const t = Math.pow(j / 9, 2.1);
        const y = horizonte + t * (h - horizonte);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
    }
    g.restore();
}

function scanlines(g, w, h) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
}

/* ------------------------------- as peças --------------------------------- */
async function pecaApp(fmt, recursos) {
    const { w, h } = FORMATOS[fmt];
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    const fundo = g.createLinearGradient(0, 0, w, h);
    fundo.addColorStop(0, '#171d2c');
    fundo.addColorStop(1, '#090b10');
    g.fillStyle = fundo;
    g.fillRect(0, 0, w, h);
    brilho(g, fmt === 'h' ? w * 0.78 : w * 0.5, fmt === 'h' ? h * 0.5 : h * 0.55, fmt === 'h' ? 520 : 520, 'rgba(246,180,69,0.30)');
    brilho(g, fmt === 'h' ? w * 0.1 : w * 0.1, fmt === 'h' ? h * 0.1 : h * 0.05, 420, 'rgba(110,130,255,0.18)');

    const capas = recursos.capas;
    if (fmt === 'h') {
        const base = 70;
        const cw = 215, ch = 322;
        [[0, 60, -8], [1, 18, -2.5], [2, 40, 3], [3, 8, 9]].forEach(([i, dy, giro], n) =>
            capaComSombra(g, capas[i % capas.length], 900 + n * 150, base + dy, cw, ch, giro, 14));
        g.drawImage(recursos.icone, 90, 80, 84, 84);
        texto(g, 'NOVO APLICATIVO', 196, 100, { tamanho: 26, peso: 800, cor: '#f6b445' });
        texto(g, 'Meus Livros', 90, 190, { tamanho: 118, peso: 800, largura: 800 });
        texto(g, 'Toda a sua biblioteca de PDFs em qualquer tela.', 90, 328, { tamanho: 40, peso: 500, cor: '#a7b0c0', largura: 760, altura: 1.25 });
        pilula(g, 'Continue de onde parou', 90, 440, { tamanho: 28, fundo: '#f6b445', cor: '#1a1204' });
    } else {
        g.drawImage(recursos.icone, w / 2 - 70, 140, 140, 140);
        texto(g, 'NOVO APLICATIVO', w / 2, 310, { tamanho: 34, peso: 800, cor: '#f6b445', alinhar: 'center' });
        texto(g, 'Meus Livros', w / 2, 370, { tamanho: 124, peso: 800, alinhar: 'center', largura: 540 });
        const y0 = 640;
        [[0, 30, -7], [1, 0, -2], [2, 22, 4]].forEach(([i, dy, giro], n) =>
            capaComSombra(g, capas[i], 64 + n * 168, y0 + dy + n * 6, 180, 270, giro, 14));
        texto(g, 'Toda a sua biblioteca de PDFs em qualquer tela.', w / 2, 1060, { tamanho: 48, peso: 500, cor: '#a7b0c0', largura: 500, altura: 1.25, alinhar: 'center' });
        pilula(g, 'Continue de onde parou', w / 2, 1330, { tamanho: 34, fundo: '#f6b445', cor: '#1a1204', alinhar: 'center' });
    }
    return c;
}

async function pecaRetro(fmt) {
    const { w, h } = FORMATOS[fmt];
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    const fundo = g.createLinearGradient(0, 0, 0, h);
    fundo.addColorStop(0, '#0a0620');
    fundo.addColorStop(0.55, '#2a0f55');
    fundo.addColorStop(1, '#10051f');
    g.fillStyle = fundo;
    g.fillRect(0, 0, w, h);

    // estrelas determinísticas
    let sem = 7;
    const rnd = () => ((sem = (sem * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = '#fff';
    for (let i = 0; i < 90; i++) g.fillRect(rnd() * w, rnd() * h * 0.62, rnd() > 0.8 ? 3 : 2, rnd() > 0.8 ? 3 : 2);

    const horizonte = fmt === 'h' ? h * 0.66 : h * 0.72;
    brilho(g, w / 2, horizonte, fmt === 'h' ? 620 : 420, 'rgba(255,79,200,0.35)');
    grade(g, w, h, horizonte);

    if (fmt === 'h') {
        pixels(g, INVASOR, 1000, 70, 11, '#7cff6b', 'rgba(124,255,107,0.8)');
        pixels(g, INVASOR, 1180, 130, 9, '#3fd0ff', 'rgba(63,208,255,0.8)');
        pixels(g, INVASOR, 1350, 60, 10, '#ff4fa3', 'rgba(255,79,163,0.8)');
        pixels(g, NAVE, 1170, 440, 10, '#ffd23f', 'rgba(255,210,63,0.8)');
        controle(g, 1230, 300, 1.05);
        texto(g, 'PRESS START', 90, 78, { tamanho: 28, peso: 700, cor: '#ffd23f', fonte: MONO });
        texto(g, 'Topete Game Retrô', 90, 130, { tamanho: 108, peso: 800, largura: 900, sombra: { cor: 'rgba(255,79,200,0.85)', blur: 28 }, altura: 1.04 });
        texto(g, 'Os clássicos de sempre na TV Box, no celular, no Game Stick e no projetor.', 90, 360, { tamanho: 36, peso: 500, cor: '#dcd2ff', largura: 820, altura: 1.25 });
        pilula(g, 'Instalação passo a passo', 90, 462, { tamanho: 26, fundo: '#ff4fa3', cor: '#1a0710' });
    } else {
        pixels(g, INVASOR, 80, 150, 12, '#7cff6b', 'rgba(124,255,107,0.8)');
        pixels(g, INVASOR, 420, 210, 10, '#ff4fa3', 'rgba(255,79,163,0.8)');
        pixels(g, INVASOR, 250, 330, 9, '#3fd0ff', 'rgba(63,208,255,0.8)');
        texto(g, 'PRESS START', w / 2, 90, { tamanho: 34, peso: 700, cor: '#ffd23f', fonte: MONO, alinhar: 'center' });
        texto(g, 'Topete Game Retrô', w / 2, 470, { tamanho: 108, peso: 800, largura: 520, alinhar: 'center', sombra: { cor: 'rgba(255,79,200,0.85)', blur: 28 }, altura: 1.04 });
        controle(g, w / 2, 1010, 1.25);
        texto(g, 'Os clássicos na TV Box, no celular, no Game Stick e no projetor.', w / 2, 1190, { tamanho: 44, peso: 500, cor: '#dcd2ff', largura: 500, altura: 1.25, alinhar: 'center' });
        pilula(g, 'Instalação passo a passo', w / 2, 1450, { tamanho: 32, fundo: '#ff4fa3', cor: '#1a0710', alinhar: 'center' });
    }
    scanlines(g, w, h);
    return c;
}

async function pecaLivro(fmt, recursos) {
    const { w, h } = FORMATOS[fmt];
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    const fundo = g.createLinearGradient(0, 0, w, h);
    fundo.addColorStop(0, '#7a2a82');
    fundo.addColorStop(1, '#2a0d36');
    g.fillStyle = fundo;
    g.fillRect(0, 0, w, h);
    brilho(g, fmt === 'h' ? w * 0.8 : w * 0.5, fmt === 'h' ? h * 0.45 : h * 0.4, 520, 'rgba(255,90,230,0.35)');
    // pontilhado do designer da capa
    g.fillStyle = 'rgba(255,255,255,0.10)';
    for (let x = 0; x < w; x += 34) for (let y = 0; y < h; y += 34) g.fillRect(x, y, 3, 3);

    const capa = recursos.capaLivro;
    if (fmt === 'h') {
        capaComSombra(g, capa, 1030, 36, 330, 495, 6, 16);
        texto(g, 'NOVO LIVRO · EBOOK', 90, 70, { tamanho: 26, peso: 800, cor: '#ffd23f' });
        texto(g, 'Criação de Sites e Sistemas Web', 90, 118, { tamanho: 82, peso: 800, largura: 860, altura: 1.06 });
        texto(g, 'O Manual Definitivo', 90, 330, { tamanho: 44, peso: 500, cor: '#f0d6ff', fonte: SANS });
        texto(g, 'por Aricelio Moura', 90, 392, { tamanho: 32, peso: 700, cor: '#ffd23f' });
        pilula(g, 'Conheça o livro', 90, 454, { tamanho: 28, fundo: '#ffffff', cor: '#3a1245' });
    } else {
        capaComSombra(g, capa, 90, 130, 420, 630, 4, 18);
        texto(g, 'NOVO LIVRO · EBOOK', w / 2, 835, { tamanho: 34, peso: 800, cor: '#ffd23f', alinhar: 'center' });
        texto(g, 'Criação de Sites e Sistemas Web', w / 2, 895, { tamanho: 78, peso: 800, largura: 520, alinhar: 'center', altura: 1.06 });
        texto(g, 'O Manual Definitivo', w / 2, 1190, { tamanho: 46, peso: 500, cor: '#f0d6ff', alinhar: 'center' });
        texto(g, 'por Aricelio Moura', w / 2, 1262, { tamanho: 38, peso: 700, cor: '#ffd23f', alinhar: 'center' });
        pilula(g, 'Conheça o livro', w / 2, 1380, { tamanho: 34, fundo: '#ffffff', cor: '#3a1245', alinhar: 'center' });
    }
    return c;
}

/** Peça "biblioteca": a arte da biblioteca inteira (sem cortar o título), sobre um fundo desfocado da própria arte. */
async function pecaBiblioteca(fmt, recursos) {
    const { w, h } = FORMATOS[fmt];
    const arte = recursos.arteBiblioteca[fmt];
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    // fundo: a arte esticada até cobrir tudo, desfocada
    const kc = Math.max(w / arte.width, h / arte.height);
    g.filter = 'blur(28px)';
    g.drawImage(arte, (w - arte.width * kc) / 2, (h - arte.height * kc) / 2, arte.width * kc, arte.height * kc);
    g.filter = 'none';
    g.fillStyle = 'rgba(6,10,20,0.35)';
    g.fillRect(0, 0, w, h);
    // frente: a arte inteira, centralizada, sem cortes
    const kf = Math.min(w / arte.width, h / arte.height);
    const aw = arte.width * kf;
    const ah = arte.height * kf;
    g.drawImage(arte, (w - aw) / 2, (h - ah) / 2, aw, ah);
    return c;
}

/* --------------------------------- main ----------------------------------- */
async function main() {
    fs.mkdirSync(SAIDA, { recursive: true });
    const dirCapas = path.join(RAIZ, 'capas');
    const nomesCapas = [
        '1794678266_5ac6090468226502.png',
        '1794678266_e0cab8d9a05e25e2.png',
        '1794678266_dbac615ce3847b8c.png',
        '1794678266_268d8c45f8346c4a.png',
    ];
    const capas = [];
    for (const n of nomesCapas) {
        const p = path.join(dirCapas, n);
        if (fs.existsSync(p)) capas.push(await loadImage(p));
    }
    if (!capas.length) {
        // Sem capas locais (instalação nova): usa blocos de cor para o desenho não quebrar.
        for (const cor of ['#3b4a7a', '#6b3a5e', '#2f6f6a', '#7a3b3b']) {
            const k = createCanvas(300, 450);
            const kg = k.getContext('2d');
            kg.fillStyle = cor;
            kg.fillRect(0, 0, 300, 450);
            capas.push(k);
        }
    }
    const icone = await loadImage(path.join(RAIZ, 'assets', 'icons', 'icon-512.png'));
    const capaLivro = await loadImage(path.join(SAIDA, 'fonte', 'livro-capa.png'));
    const arteBiblioteca = {
        h: await loadImage(path.join(SAIDA, 'fonte', 'biblioteca-arte-h.jpg')),
        v: await loadImage(path.join(SAIDA, 'fonte', 'biblioteca-arte-v.jpg')),
    };
    const recursos = { capas, icone, capaLivro, arteBiblioteca };

    const pecas = [
        ['biblioteca', pecaBiblioteca],
        ['app', pecaApp],
        ['retro', pecaRetro],
        ['livro', pecaLivro],
    ];
    for (const [nome, fn] of pecas) {
        for (const fmt of ['h', 'v']) {
            const canvas = await fn(fmt, recursos);
            const arquivo = path.join(SAIDA, `${nome}-${fmt}.webp`);
            fs.writeFileSync(arquivo, canvas.toBuffer('image/webp', 90));
            console.log('gerado', path.relative(RAIZ, arquivo), Math.round(fs.statSync(arquivo).size / 1024) + ' KB');
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
