#!/usr/bin/env node
'use strict';
/**
 * Gera os ícones do aplicativo (PWA, favicon, tela de início do iOS) em assets/icons/.
 *
 *   npm run icones
 *
 * O desenho é o mesmo "leitor com livro aberto" do logotipo da tela de login, em âmbar sobre
 * fundo escuro. Fica em código (e não em PNGs soltos) para o visual poder ser ajustado em um
 * lugar só e regenerado.
 *
 * Gera também icon.svg, usado como favicon nos navegadores modernos.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, Path2D } = require('@napi-rs/canvas');

const SAIDA = path.join(__dirname, '..', 'assets', 'icons');
const AMBAR = '#f6b445';
const AMBAR_ESCURO = '#d98f21';

// Geometria do desenho, em um quadro de 512x512 centrado em (0,0).
const CABECA = { x: 0, y: -150, r: 46 };
const PAGINA_ESQUERDA = 'M 0 -70 C -50 -100 -130 -105 -190 -80 L -190 130 C -130 105 -50 110 0 150 Z';
const PAGINA_DIREITA = 'M 0 -70 C 50 -100 130 -105 190 -80 L 190 130 C 130 105 50 110 0 150 Z';

/**
 * @param {number} tamanho lado do ícone em pixels
 * @param {{ maskable?: boolean }} opcoes maskable: o sistema operacional recorta o ícone na forma
 *   que quiser (círculo, "squircle"), então o fundo vai até a borda e o desenho encolhe para
 *   caber na zona segura (centro de 60%).
 */
function desenhar(tamanho, { maskable = false } = {}) {
    const canvas = createCanvas(tamanho, tamanho);
    const g = canvas.getContext('2d');
    const k = tamanho / 512;

    // Fundo
    const raio = maskable ? 0 : 112 * k;
    g.beginPath();
    g.roundRect(0, 0, tamanho, tamanho, raio);
    const fundo = g.createLinearGradient(0, 0, tamanho, tamanho);
    fundo.addColorStop(0, '#1a2030');
    fundo.addColorStop(1, '#090b10');
    g.fillStyle = fundo;
    g.fill();

    // Brilho suave atrás do desenho
    const brilho = g.createRadialGradient(256 * k, 240 * k, 0, 256 * k, 240 * k, 280 * k);
    brilho.addColorStop(0, 'rgba(246, 180, 69, 0.22)');
    brilho.addColorStop(1, 'rgba(246, 180, 69, 0)');
    g.fillStyle = brilho;
    g.fillRect(0, 0, tamanho, tamanho);

    // Desenho
    const escala = (maskable ? 0.62 : 0.8) * k;
    g.save();
    g.translate(256 * k, 262 * k);
    g.scale(escala, escala);

    g.fillStyle = AMBAR;
    g.beginPath();
    g.arc(CABECA.x, CABECA.y, CABECA.r, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = AMBAR;
    g.fill(new Path2D(PAGINA_ESQUERDA));
    g.fillStyle = AMBAR_ESCURO;
    g.fill(new Path2D(PAGINA_DIREITA));
    g.restore();

    return canvas.toBuffer('image/png');
}

function svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2030"/><stop offset="1" stop-color="#090b10"/></linearGradient>
    <radialGradient id="b" cx="0.5" cy="0.47" r="0.55"><stop offset="0" stop-color="#f6b445" stop-opacity="0.22"/><stop offset="1" stop-color="#f6b445" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#f)"/>
  <rect width="512" height="512" rx="112" fill="url(#b)"/>
  <g transform="translate(256 262) scale(0.8)">
    <circle cx="${CABECA.x}" cy="${CABECA.y}" r="${CABECA.r}" fill="${AMBAR}"/>
    <path d="${PAGINA_ESQUERDA}" fill="${AMBAR}"/>
    <path d="${PAGINA_DIREITA}" fill="${AMBAR_ESCURO}"/>
  </g>
</svg>
`;
}

fs.mkdirSync(SAIDA, { recursive: true });
const arquivos = {
    'icon-192.png': desenhar(192),
    'icon-512.png': desenhar(512),
    'icon-maskable-512.png': desenhar(512, { maskable: true }),
    'apple-touch-icon.png': desenhar(180, { maskable: true }), // iOS aplica o próprio arredondamento
    'favicon-32.png': desenhar(32),
};
for (const [nome, conteudo] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(SAIDA, nome), conteudo);
}
fs.writeFileSync(path.join(SAIDA, 'icon.svg'), svg());
console.log(`Ícones gerados em ${SAIDA}:`);
for (const nome of [...Object.keys(arquivos), 'icon.svg']) {
    console.log(`  ${nome.padEnd(24)} ${(fs.statSync(path.join(SAIDA, nome)).size / 1024).toFixed(1)} KB`);
}
