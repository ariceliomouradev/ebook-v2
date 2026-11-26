// Dados vindos do servidor: entregues via <script type="application/json"> em vez de um
// <script> inline com JS executável, para não violar a Content-Security-Policy (script-src
// não permite 'unsafe-inline'; um bloco application/json não é considerado script executável).
const livroConfig = JSON.parse(document.getElementById('livro-config').textContent);

// A URL do worker do PDF.js é estática (não depende de dados do servidor), então fica aqui
// no arquivo externo em vez de em um <script> inline no HTML.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

/*
 * LEITOR EM ROLAGEM CONTÍNUA
 *
 * Todas as páginas ficam empilhadas, uma abaixo da outra, e o livro rola como num leitor de PDF.
 * Para aguentar livros de centenas de páginas, cada página começa como um "espaço" do tamanho certo
 * (só um <div> com um <canvas> vazio) e é desenhada apenas quando chega perto da tela; as que ficam
 * longe têm o desenho descartado para liberar memória.
 *
 * pageNum = a página que está na altura de leitura (um pouco acima do meio da tela). É ela que vai
 * para a barra de progresso e para o servidor (salvo alguns instantes depois de a rolagem parar).
 */

const url = livroConfig.url;
let pdfDoc = null,
    totalPaginas = 0,
    pageNum = parseInt(livroConfig.pagInicial) || 1,
    scale = 1.4, // provisório: ajustado à largura assim que a primeira página for lida
    zoomAlteradoManualmente = false;

const container = document.getElementById('canvas-container');
const listaEl = document.getElementById('paginas');

// Escala inicial = a que faz a página caber na largura disponível, limitada a 140%.
const ESCALA_MAXIMA_INICIAL = 1.4;
const ESCALA_MINIMA = 0.4;
const ESCALA_MAXIMA = 3.0;
const MARGEM_LATERAL_PX = 24;
const ESPACO_ENTRE_PAGINAS = 14;   // px entre uma página e a seguinte
const PIXELS_MAX_CANVAS = 16e6;    // teto de pixels por página desenhada (memória em celulares simples)
const ATRASO_SALVAR_MS = 1200;     // quanto tempo a página precisa ficar parada para o progresso ser salvo

let baseUniforme = null; // {w, h} da página 1 em escala 1.0 (pontos do PDF); vale até cada página dizer o dela
let paginas = [];        // por índice: { n, el, canvas, base, cssW, cssH, renderizada, renderizando, tarefa, token }
let tops = [];           // topo de cada página dentro da lista (px)
let alturas = [];        // altura de cada página (px)
const renderizadas = new Set();
let listaTopo = 0;       // distância da lista ao topo do contêiner (espaço reservado para a barra superior)
let posicionado = false; // só depois de levar o leitor à página salva a rolagem passa a mudar/salvar a página

// modoAjuste: 'auto' (cabe na tela, no máximo 140%), 'total' (botão "ajustar à largura": a página ocupa a
// largura inteira da tela, até o zoom máximo) ou 'manual' (a pessoa mexeu no zoom; o leitor não mexe mais).
let modoAjuste = 'auto';

function calcularEscalaResponsiva(total = false) {
    if (!baseUniforme) {
        return ESCALA_MAXIMA_INICIAL; // provisório: só vale até a primeira página ser lida
    }
    const largura = container.clientWidth - MARGEM_LATERAL_PX;
    const ajustada = Math.min(total ? ESCALA_MAXIMA : ESCALA_MAXIMA_INICIAL, Math.max(ESCALA_MINIMA, largura / baseUniforme.w));
    // Duas casas, arredondando PARA BAIXO: arredondar para cima poderia passar da largura.
    return Math.floor(ajustada * 100) / 100;
}

/* ------------------------------ estados da tela ------------------------------ */
const elCarregando = document.getElementById('leitorCarregando');
const elErro = document.getElementById('leitorErro');

let carregandoEscondido = false;
function esconderCarregando() {
    if (!elCarregando || carregandoEscondido) return;
    carregandoEscondido = true;
    elCarregando.classList.add('is-oculto');
    setTimeout(() => elCarregando.remove(), 500);
}

function mostrarErroLeitor() {
    if (elCarregando) elCarregando.remove();
    if (elErro) elErro.hidden = false;
    document.body.classList.remove('inactive');
}

/* ------------------------------- layout das páginas ------------------------------- */
function criarPaginas(total) {
    const frag = document.createDocumentFragment();
    paginas = [];
    for (let i = 0; i < total; i++) {
        const el = document.createElement('div');
        el.className = 'pagina';
        el.dataset.pagina = String(i + 1);
        const canvas = document.createElement('canvas');
        canvas.width = 0; // sem bitmap até a página ser desenhada (o tamanho na tela vem do CSS)
        canvas.height = 0;
        canvas.setAttribute('aria-label', `Página ${i + 1}`);
        el.appendChild(canvas);
        frag.appendChild(el);
        paginas.push({ n: i + 1, el, canvas, base: null, cssW: 0, cssH: 0, renderizada: false, renderizando: false, tarefa: null, pendente: null, token: 0 });
    }
    listaEl.appendChild(frag);
}

/** Dá a cada página o tamanho da escala atual e recalcula onde cada uma começa. */
function aplicarLayout() {
    let y = 0;
    for (let i = 0; i < paginas.length; i++) {
        const p = paginas[i];
        const b = p.base || baseUniforme;
        const w = Math.floor(b.w * scale);
        const h = Math.floor(b.h * scale);
        if (p.cssW !== w || p.cssH !== h) {
            p.el.style.width = w + 'px';
            p.el.style.height = h + 'px';
            p.cssW = w;
            p.cssH = h;
        }
        tops[i] = y;
        alturas[i] = h;
        y += h + ESPACO_ENTRE_PAGINAS;
    }
    listaTopo = listaEl.offsetTop;
}

/** Índice (0-based) da página que contém a posição y (px dentro da lista). */
function paginaEm(y) {
    let lo = 0;
    let hi = tops.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

/**
 * Muda o layout (zoom, tamanho de página) sem o texto "pular": guarda qual ponto do livro está na
 * linha `py` da tela (e a proporção horizontal em `px`) e, depois da mudança, leva esse ponto de volta.
 */
function comAncora(mudar, px = container.clientWidth / 2, py = 0) {
    const y = container.scrollTop - listaTopo + py;
    const i = paginaEm(y);
    const frac = alturas[i] ? (y - tops[i]) / alturas[i] : 0;
    const larguraAntes = container.scrollWidth || 1;
    const fx = (container.scrollLeft + px) / larguraAntes;

    mudar();
    aplicarLayout();

    container.scrollTop = tops[i] + frac * alturas[i] + listaTopo - py;
    container.scrollLeft = Math.max(0, fx * container.scrollWidth - px);
}

/* -------------------------------- desenho das páginas -------------------------------- */
function descartarDesenho(p, i) {
    p.token++; // invalida qualquer desenho em andamento
    if (p.tarefa) {
        // o PDF.js cancela de forma assíncrona: um desenho novo no mesmo canvas precisa esperar o fim do cancelamento
        p.pendente = p.tarefa.promise.then(() => {}, () => {});
        try { p.tarefa.cancel(); } catch (e) { /* já terminou */ }
        p.tarefa = null;
    }
    p.renderizando = false;
    p.renderizada = false;
    renderizadas.delete(i);
    document.dispatchEvent(new CustomEvent('leitor:pagina-descartada', { detail: { i } })); // anotacoes.js limpa a camada de texto
}

function liberarPagina(i) {
    const p = paginas[i];
    descartarDesenho(p, i);
    p.canvas.width = 0; // solta a memória do bitmap
    p.canvas.height = 0;
}

async function renderizarPagina(i) {
    const p = paginas[i];
    if (p.renderizada || p.renderizando) return;
    p.renderizando = true;
    const token = ++p.token;
    const escalaDoDesenho = scale;
    try {
        const page = await pdfDoc.getPage(p.n);
        if (token !== p.token) return;

        // Páginas de tamanho diferente da primeira: corrige o espaço reservado sem deslocar a leitura.
        const b = page.getViewport({ scale: 1 });
        if (!p.base || Math.abs(p.base.w - b.width) > 0.5 || Math.abs(p.base.h - b.height) > 0.5) {
            p.base = { w: b.width, h: b.height };
            if (Math.abs((baseUniforme.w - b.width)) > 0.5 || Math.abs(baseUniforme.h - b.height) > 0.5) {
                comAncora(() => {});
            }
        }

        const viewport = page.getViewport({ scale: escalaDoDesenho });
        // Nitidez em telas de alta densidade, mas limitada a 2x e a um teto de pixels por página.
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        const area = viewport.width * viewport.height;
        if (area * dpr * dpr > PIXELS_MAX_CANVAS) dpr = Math.max(1, Math.sqrt(PIXELS_MAX_CANVAS / area));

        if (p.pendente) {
            await p.pendente;
            p.pendente = null;
            if (token !== p.token) return;
        }
        const canvas = p.canvas;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        p.tarefa = page.render({
            canvasContext: canvas.getContext('2d'),
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        });
        await p.tarefa.promise;
        if (token === p.token) {
            p.renderizada = true;
            renderizadas.add(i);
            esconderCarregando();
            document.dispatchEvent(new CustomEvent('leitor:pagina-desenhada', { detail: { i, page, viewport } })); // anotacoes.js monta a camada de texto
        }
    } catch (err) {
        if (!err || err.name !== 'RenderingCancelledException') console.error('Erro ao desenhar a página', p.n, err);
    } finally {
        if (token === p.token) {
            p.renderizando = false;
            p.tarefa = null;
        }
    }
}

/** Desenha as páginas perto da tela e descarta as que ficaram longe. */
function atualizarJanela() {
    if (!pdfDoc) return;
    const h = container.clientHeight;
    const y0 = container.scrollTop - listaTopo;

    const ini = paginaEm(Math.max(0, y0 - h));
    const fim = paginaEm(y0 + h + h);
    // as da tela primeiro, depois as vizinhas
    const centro = paginaEm(Math.max(0, y0 + h * 0.35));
    const ordem = [];
    for (let i = ini; i <= fim; i++) ordem.push(i);
    ordem.sort((a, b) => Math.abs(a - centro) - Math.abs(b - centro));
    ordem.forEach(renderizarPagina);

    // Descarta o que ficou longe: páginas já desenhadas e também desenhos que ainda estavam em andamento.
    const liberarAntes = paginaEm(Math.max(0, y0 - h * 4));
    const liberarDepois = paginaEm(y0 + h * 5);
    for (let i = 0; i < paginas.length; i++) {
        if (i >= liberarAntes && i <= liberarDepois) {
            i = liberarDepois; // pula a janela que fica
            continue;
        }
        const p = paginas[i];
        if (p.renderizada || p.renderizando || p.canvas.width > 0) liberarPagina(i);
    }
}

/* ---------------------------------- progresso ---------------------------------- */
/** Texto "Página 12 de 340 · 3%" e a linha de progresso no topo. */
function atualizarProgresso() {
    if (!pdfDoc) return;
    const total = totalPaginas;
    const pct = total > 0 ? Math.round((pageNum / total) * 100) : 0;
    const texto = document.getElementById('progressoTexto');
    if (texto) texto.textContent = `Página ${pageNum} de ${total} · ${pct}%`;
    const barra = document.getElementById('barraProgresso');
    if (barra) barra.style.width = pct + '%';
    const anterior = document.getElementById('btnPaginaAnterior');
    const proxima = document.getElementById('btnProximaPagina');
    if (anterior) anterior.setAttribute('aria-disabled', String(pageNum <= 1));
    if (proxima) proxima.setAttribute('aria-disabled', String(pageNum >= total));

    // Não mexe no campo enquanto a pessoa está digitando nele.
    const inputPagina = document.getElementById('pageInput');
    if (inputPagina && document.activeElement !== inputPagina) inputPagina.value = pageNum;

    // O canvas da página atual é o "pdf-canvas" (os testes e o zoom medem esse).
    const anteriorMarcado = listaEl.querySelector('canvas[data-testid="pdf-canvas"]');
    const atual = paginas[pageNum - 1];
    if (anteriorMarcado && atual && anteriorMarcado !== atual.canvas) anteriorMarcado.removeAttribute('data-testid');
    if (atual) atual.canvas.setAttribute('data-testid', 'pdf-canvas');
}

function atualizarTextoZoom() {
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
}

let temporizadorSalvar = null;
let ultimaPaginaSalva = null;

function agendarSalvar() {
    clearTimeout(temporizadorSalvar);
    temporizadorSalvar = setTimeout(() => salvarProgresso(pageNum), ATRASO_SALVAR_MS);
}

// Salva o progresso via AJAX, autenticado por sessão + token CSRF. Só quando a página realmente mudou.
function salvarProgresso(pag) {
    if (!pdfDoc || pag === ultimaPaginaSalva || !livroConfig.progressoUrl) return; // sem URL = modo análise: não grava
    ultimaPaginaSalva = pag;
    fetch(livroConfig.progressoUrl, {
        method: 'POST',
        keepalive: true, // também vale ao fechar/sair da aba
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': livroConfig.csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ pagina: pag, total: totalPaginas }),
    }).catch(function (err) {
        ultimaPaginaSalva = null;
        console.error('Falha ao salvar progresso de leitura:', err);
    });
}

// Ao sair ou esconder a aba, salva já (sem esperar a rolagem "assentar").
function salvarAgora() {
    if (!posicionado) return;
    clearTimeout(temporizadorSalvar);
    salvarProgresso(pageNum);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
window.addEventListener('pagehide', salvarAgora);

/* ------------------------------------ rolagem ------------------------------------ */
// Limitada por tempo (e não por requestAnimationFrame, que o navegador pausa com a aba em segundo plano).
let rolagemAgendada = false;
function aoRolar() {
    if (rolagemAgendada || !pdfDoc) return;
    rolagemAgendada = true;
    setTimeout(function () {
        rolagemAgendada = false;
        atualizarJanela();
        if (!posicionado) return;
        const n = paginaEm(Math.max(0, container.scrollTop - listaTopo + container.clientHeight * 0.35)) + 1;
        if (n !== pageNum) {
            pageNum = n;
            atualizarProgresso();
            agendarSalvar();
        }
    }, 60);
}
container.addEventListener('scroll', aoRolar, { passive: true });

/** Leva a página `num` para o topo da tela (suave nos botões, imediato ao digitar o número). */
function irParaPagina(num, suave) {
    if (!pdfDoc) return;
    if (!(num >= 1 && num <= totalPaginas)) {
        document.getElementById('pageInput').value = pageNum;
        return;
    }
    const alvo = tops[num - 1] + listaTopo - parseFloat(getComputedStyle(container).paddingTop) + 0;
    container.scrollTo({ top: Math.max(0, alvo), behavior: suave && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    pageNum = num;
    atualizarProgresso();
    agendarSalvar();
    atualizarJanela();
}

function irParaPaginaLeitor(num) {
    irParaPagina(num, false);
}

function mudarPagina(dir) {
    if (!pdfDoc) return;
    if (dir === -1 && pageNum <= 1) return;
    if (dir === 1 && pageNum >= totalPaginas) return;
    irParaPagina(pageNum + dir, true);
}

/** Rola cerca de uma tela (toque nas bordas e barra de espaço). */
function rolarUmaTela(dir) {
    container.scrollBy({ top: dir * container.clientHeight * 0.9, behavior: 'smooth' });
}

/* -------------------------------------- zoom -------------------------------------- */
function limitarEscala(v) {
    return Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, v));
}

function aplicarEscala(nova, px, py) {
    nova = limitarEscala(nova);
    if (Math.abs(nova - scale) < 0.005) return;
    comAncora(() => { scale = nova; }, px, py);
    // O desenho antigo continua na tela, esticado, até o novo ficar pronto.
    renderizadas.forEach((i) => descartarDesenho(paginas[i], i));
    paginas.forEach((p) => { if (p.renderizando) descartarDesenho(p, p.n - 1); });
    atualizarTextoZoom();
    atualizarJanela();
}

// Zoom (0.4 a 3.0). Depois que o usuário mexe manualmente, o resize deixa de sobrescrever a escolha dele.
function mudarZoom(delta) {
    zoomAlteradoManualmente = true;
    modoAjuste = 'manual';
    atualizarBotaoLargura();
    aplicarEscala(Math.round((scale + delta) * 10) / 10, container.clientWidth / 2, container.clientHeight / 2);
}

// Botão "ajustar à largura": a página ocupa a largura toda da tela. Tocar de novo volta ao tamanho automático.
function ajustarLargura() {
    zoomAlteradoManualmente = false;
    modoAjuste = modoAjuste === 'total' ? 'auto' : 'total';
    aplicarEscala(calcularEscalaResponsiva(modoAjuste === 'total'), container.clientWidth / 2, 0);
    container.scrollLeft = 0;
    atualizarBotaoLargura();
}

function atualizarBotaoLargura() {
    const b = document.getElementById('btnAjustarLargura');
    if (!b) return;
    b.setAttribute('aria-pressed', String(modoAjuste === 'total'));
    b.title = modoAjuste === 'total' ? 'Voltar ao tamanho automático' : 'Ajustar à largura da tela';
}

/* ------------------------------------ abertura ------------------------------------ */
pdfjsLib.getDocument(url).promise.then(async function (pdfDoc_) {
    pdfDoc = pdfDoc_;
    totalPaginas = pdfDoc.numPages;
    document.getElementById('pageCount').textContent = totalPaginas;
    document.getElementById('pageInput').max = totalPaginas;
    pageNum = Math.min(Math.max(1, pageNum), totalPaginas);

    const primeira = await pdfDoc.getPage(1);
    const v = primeira.getViewport({ scale: 1 });
    baseUniforme = { w: v.width, h: v.height };

    scale = calcularEscalaResponsiva();
    criarPaginas(totalPaginas);
    aplicarLayout();
    atualizarTextoZoom();
    document.dispatchEvent(new CustomEvent('leitor:paginas-prontas')); // anotacoes.js carrega as marcações

    // Leva o leitor à página em que parou (sem a rolagem inicial contar como "mudou de página").
    posicionado = false;
    ultimaPaginaSalva = pageNum;
    container.scrollTop = Math.max(0, tops[pageNum - 1] + listaTopo - parseFloat(getComputedStyle(container).paddingTop));
    atualizarProgresso();
    atualizarJanela();
    setTimeout(() => { posicionado = true; }, 150);

    // Saída de segurança: o PDF.js só conclui o desenho depois de um requestAnimationFrame, que o
    // navegador pausa com a aba em segundo plano. A página já está pronta, então o "Abrindo o
    // livro…" não pode ficar preso por isso.
    setTimeout(esconderCarregando, 2500);

    container.focus({ preventScroll: true }); // setas, Page Up/Down e espaço rolam o livro
    mostrarHud();
}).catch(function (err) {
    console.error('Erro ao carregar o PDF:', err);
    mostrarErroLeitor();
});

document.getElementById('pageInput').addEventListener('change', function () {
    irParaPaginaLeitor(parseInt(this.value));
});

document.getElementById('pageInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        irParaPaginaLeitor(parseInt(this.value));
        this.blur();
    }
});

// Selecionar tudo ao focar: digitar um número novo substitui o atual sem apagar na mão.
document.getElementById('pageInput').addEventListener('focus', function () {
    this.select();
});

/* -------------------------------- tela cheia -------------------------------- */
const elementoRaiz = document.documentElement;
const pedirTelaCheia = elementoRaiz.requestFullscreen || elementoRaiz.webkitRequestFullscreen;
const botaoTelaCheia = document.getElementById('btnFullscreen');

function emTelaCheia() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullScreen() {
    if (!emTelaCheia()) {
        if (pedirTelaCheia) pedirTelaCheia.call(elementoRaiz);
    } else if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }
}

function atualizarIconeTelaCheia() {
    const icone = document.getElementById('iconFull');
    if (icone) icone.className = emTelaCheia() ? 'fas fa-compress' : 'fas fa-expand';
    if (botaoTelaCheia) botaoTelaCheia.title = emTelaCheia() ? 'Sair da Tela Cheia' : 'Tela Cheia';
}
document.addEventListener('fullscreenchange', atualizarIconeTelaCheia);
document.addEventListener('webkitfullscreenchange', atualizarIconeTelaCheia);

// iPhone não oferece tela cheia para páginas web: sem suporte, o botão some em vez de ficar inerte.
if (!pedirTelaCheia && botaoTelaCheia) botaoTelaCheia.hidden = true;

// Botões do HUD
document.getElementById('btnPrimeiraPagina')?.addEventListener('click', () => irParaPaginaLeitor(1));
document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => mudarPagina(-1));
document.getElementById('btnProximaPagina')?.addEventListener('click', () => mudarPagina(1));
document.getElementById('btnUltimaPagina')?.addEventListener('click', () => irParaPaginaLeitor(totalPaginas || pageNum));
document.getElementById('btnZoomOut')?.addEventListener('click', () => mudarZoom(-0.2));
document.getElementById('btnZoomIn')?.addEventListener('click', () => mudarZoom(0.2));
document.getElementById('btnAjustarLargura')?.addEventListener('click', ajustarLargura);
botaoTelaCheia?.addEventListener('click', toggleFullScreen);

/* ------------------- interface que some sozinha (HUD) ------------------- */
// Mouse: reaparece ao mexer. Toque: um toque no centro da página mostra/esconde. Teclado: reaparece
// ao usar uma tecla. Nunca some enquanto o ponteiro está sobre ela ou o campo de página está em uso.
let timeoutMenu;
const hud = [document.getElementById('menuPrincipal'), document.getElementById('hudTopo')];

function hudEmUso() {
    return hud.some((el) => el && (el.matches(':hover') || el.contains(document.activeElement)));
}

function esconderHud() {
    if (hudEmUso()) {
        mostrarHud();
        return;
    }
    document.body.classList.add('inactive');
}

function mostrarHud() {
    document.body.classList.remove('inactive');
    clearTimeout(timeoutMenu);
    timeoutMenu = setTimeout(esconderHud, 3500);
}

document.addEventListener('mousemove', mostrarHud);

/* ------------------------------ teclado ------------------------------ */
// ←/→ viram a página; ↑/↓, Page Up/Down, espaço e Home/End rolam (comportamento nativo do contêiner).
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
    mostrarHud();
    if (digitando) return;

    switch (e.key) {
        case 'ArrowRight':
            mudarPagina(1);
            break;
        case 'ArrowLeft':
            mudarPagina(-1);
            break;
        case '+':
        case '=':
            mudarZoom(0.2);
            break;
        case '-':
            mudarZoom(-0.2);
            break;
        case '0':
            ajustarLargura();
            break;
        case 'f':
        case 'F':
            toggleFullScreen();
            break;
        default:
            return;
    }
    e.preventDefault();
});

// Reajusta ao redimensionar (ou girar o celular), mas só enquanto o usuário não tiver escolhido
// um zoom manualmente. O debounce evita dezenas de recálculos enquanto a janela é arrastada.
let temporizadorResize = null;
window.addEventListener('resize', function () {
    if (!pdfDoc) return;
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(function () {
        if (!zoomAlteradoManualmente) aplicarEscala(calcularEscalaResponsiva(modoAjuste === 'total'), container.clientWidth / 2, 0);
        else atualizarJanela();
    }, 150);
});

/* ----------------------- toque: tocar nas bordas, HUD e pinça ----------------------- */
// - Rolar com o dedo é nativo (contínuo).
// - Toque curto: borda esquerda (25%) volta uma tela, borda direita (25%) avança uma tela, centro mostra/esconde a interface.
// - Pinça (dois dedos): dá zoom; a lista acompanha os dedos e as páginas são redesenhadas nítidas ao soltar.
let toqueInicio = null;
let pinca = null;

function distanciaEntre(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        const rect = container.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const lista = listaEl.getBoundingClientRect();
        pinca = { d0: distanciaEntre(e.touches[0], e.touches[1]), escala0: scale, fator: 1, cx, cy };
        listaEl.style.transformOrigin = `${cx + rect.left - lista.left}px ${cy + rect.top - lista.top}px`;
        toqueInicio = null;
        return;
    }
    const t = e.touches[0];
    toqueInicio = { x: t.clientX, y: t.clientY, t: Date.now() };
}, { passive: true });

container.addEventListener('touchmove', (e) => {
    if (pinca && e.touches.length === 2) {
        const bruto = distanciaEntre(e.touches[0], e.touches[1]) / pinca.d0;
        // limita o fator para a escala final ficar entre o mínimo e o máximo
        pinca.fator = Math.min(ESCALA_MAXIMA / pinca.escala0, Math.max(ESCALA_MINIMA / pinca.escala0, bruto));
        listaEl.style.transform = `scale(${pinca.fator})`;
    }
}, { passive: true });

container.addEventListener('touchend', (e) => {
    if (pinca) {
        if (e.touches.length < 2) {
            const novaEscala = Math.round(pinca.escala0 * pinca.fator * 100) / 100;
            const { cx, cy } = pinca;
            pinca = null;
            listaEl.style.transform = '';
            listaEl.style.transformOrigin = '';
            if (Math.abs(novaEscala - scale) > 0.01) {
                zoomAlteradoManualmente = true;
                modoAjuste = 'manual';
                atualizarBotaoLargura();
                aplicarEscala(novaEscala, cx, cy);
            }
        }
        toqueInicio = null;
        return;
    }
    if (!toqueInicio) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - toqueInicio.x;
    const dy = t.clientY - toqueInicio.y;
    const duracao = Date.now() - toqueInicio.t;
    toqueInicio = null;

    // Com o marcador ligado, o toque é da ferramenta (marcar/nota), não de rolar ou mostrar/esconder a interface
    if (document.body.classList.contains('marcando')) return;

    // Toque curto e parado (arrastar para rolar não entra aqui)
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && duracao < 350) {
        const proporcao = t.clientX / window.innerWidth;
        if (proporcao < 0.25) {
            rolarUmaTela(-1);
        } else if (proporcao > 0.75) {
            rolarUmaTela(1);
        } else if (document.body.classList.contains('inactive')) {
            mostrarHud();
        } else {
            clearTimeout(timeoutMenu);
            document.body.classList.add('inactive');
        }
    }
}, { passive: true });

/* ------------------------------- favorito (coração) ------------------------------- */
(function () {
    const b = document.getElementById('btnFavoritoLeitor');
    if (!b || !livroConfig.favoritosUrl) return;
    b.addEventListener('click', function () {
        const quer = b.getAttribute('aria-pressed') !== 'true';
        const pintar = (ativo) => {
            b.classList.toggle('is-ativo', ativo);
            b.setAttribute('aria-pressed', String(ativo));
            b.querySelector('i').className = (ativo ? 'fas' : 'far') + ' fa-heart';
            const t = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
            b.title = t;
            b.setAttribute('aria-label', t);
        };
        pintar(quer);
        const fd = new FormData();
        fd.append('action', 'alternar');
        fd.append('livro_id', livroConfig.id);
        fd.append('favorito', quer ? '1' : '0');
        fd.append('csrf_token', livroConfig.csrfToken);
        fetch(livroConfig.favoritosUrl, { method: 'POST', headers: { 'X-CSRF-Token': livroConfig.csrfToken }, body: fd })
            .then((r) => r.json())
            .then((d) => { if (!d.success) pintar(!quer); })
            .catch(() => pintar(!quer));
    });
})();
