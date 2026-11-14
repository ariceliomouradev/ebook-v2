// Dados vindos do servidor: entregues via <script type="application/json"> em vez de um
// <script> inline com JS executável, para não violar a Content-Security-Policy (script-src
// não permite 'unsafe-inline'; um bloco application/json não é considerado script executável).
const livroConfig = JSON.parse(document.getElementById('livro-config').textContent);

// A URL do worker do PDF.js é estática (não depende de dados do servidor), então fica aqui
// no arquivo externo em vez de em um <script> inline no HTML.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Variáveis Globais
const url = livroConfig.url;
let pdfDoc = null,
    pageNum = parseInt(livroConfig.pagInicial) || 1,
    scale = 1.4, // provisório: renderPage ajusta à largura da página assim que ela for lida
    zoomAlteradoManualmente = false,
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d');

const container = document.getElementById('canvas-container');

// Escala inicial = a que faz a página inteira caber na largura disponível, limitada a 140%.
//
// Antes eram degraus fixos (0.8 / 1.1 / 1.4 por faixa de largura de tela). Em celular isso
// renderizava uma A4 com ~476px num viewport de 375px, e como #canvas-container tem
// overflow-x: hidden, cerca de 27% da página ficava inacessível, sem rolagem nem gesto.
// Agora a escala sai da largura real do container e da largura real da página, então cabe
// em qualquer tela e em qualquer formato de página (A4, livro de bolso, paisagem...).
const ESCALA_MAXIMA_INICIAL = 1.4;
const ESCALA_MINIMA = 0.4;
const ESCALA_MAXIMA = 3.0;
const MARGEM_LATERAL_PX = 24;
let larguraPaginaBase = null; // largura da página atual em escala 1.0 (pontos do PDF)

function calcularEscalaResponsiva() {
    if (!larguraPaginaBase) {
        return ESCALA_MAXIMA_INICIAL; // provisório: só vale até a primeira página ser lida
    }
    const largura = (container ? container.clientWidth : window.innerWidth) - MARGEM_LATERAL_PX;
    const ajustada = Math.min(ESCALA_MAXIMA_INICIAL, Math.max(ESCALA_MINIMA, largura / larguraPaginaBase));
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

pdfjsLib.getDocument(url).promise.then(function (pdfDoc_) {
    pdfDoc = pdfDoc_;
    document.getElementById('pageCount').textContent = pdfDoc.numPages;
    document.getElementById('pageInput').max = pdfDoc.numPages;
    renderPage(pageNum);
    mostrarHud();
}).catch(function (err) {
    console.error('Erro ao carregar o PDF:', err);
    mostrarErroLeitor();
});

/** Texto "Página 12 de 340 · 3%" e a linha de progresso no topo. */
function atualizarProgresso() {
    if (!pdfDoc) return;
    const total = pdfDoc.numPages;
    const pct = total > 0 ? Math.round((pageNum / total) * 100) : 0;
    const texto = document.getElementById('progressoTexto');
    if (texto) texto.textContent = `Página ${pageNum} de ${total} · ${pct}%`;
    const barra = document.getElementById('barraProgresso');
    if (barra) barra.style.width = pct + '%';
    const anterior = document.getElementById('btnPaginaAnterior');
    const proxima = document.getElementById('btnProximaPagina');
    if (anterior) anterior.setAttribute('aria-disabled', String(pageNum <= 1));
    if (proxima) proxima.setAttribute('aria-disabled', String(pageNum >= total));
}

// Renderiza a página no canvas. Não salva progresso sozinha — quem navega decide se deve salvar.
let tarefaDeRender = null;

function renderPage(num) {
    const inputPagina = document.getElementById('pageInput');
    if (inputPagina) {
        inputPagina.value = num;
    }
    atualizarProgresso();

    pdfDoc.getPage(num).then(function (page) {
        // Enquanto o usuário não mexeu no zoom, cada página se ajusta sozinha à largura
        // disponível (páginas de formatos diferentes no mesmo PDF também cabem na tela).
        if (!zoomAlteradoManualmente) {
            larguraPaginaBase = page.getViewport({ scale: 1 }).width;
            scale = calcularEscalaResponsiva();
        }
        document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';

        const viewport = page.getViewport({ scale: scale });

        // Nitidez em telas de alta densidade (retina/celulares): o canvas tem mais pixels do que
        // o tamanho em CSS. Limitado a 2x para não estourar a memória em aparelhos simples.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        canvas.style.transform = '';

        // Duas renderizações simultâneas no mesmo canvas lançam erro no PDF.js: cancela a anterior
        // (acontece ao redimensionar a janela ou navegar rápido entre páginas).
        if (tarefaDeRender) tarefaDeRender.cancel();
        tarefaDeRender = page.render({
            canvasContext: ctx,
            viewport: viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        });
        tarefaDeRender.promise.then(esconderCarregando, function () {
            /* RenderingCancelledException é esperada quando uma renderização nova assume */
        });
        // Saída de segurança: o PDF.js só conclui a tarefa depois de um requestAnimationFrame, que o
        // navegador pausa com a aba/janela em segundo plano. A página já está desenhada, então o
        // "Abrindo o livro…" não pode ficar preso por isso.
        setTimeout(esconderCarregando, 2500);
    });
}

function irParaPagina(num, salvar) {
    if (!pdfDoc) return;

    if (num >= 1 && num <= pdfDoc.numPages) {
        pageNum = num;
        renderPage(pageNum);
        container.scrollTop = 0;
        if (salvar) salvarProgresso(pageNum);
    } else {
        document.getElementById('pageInput').value = pageNum;
    }
}

function irParaPaginaLeitor(num) {
    irParaPagina(num, true);
}

function mudarPagina(dir) {
    if (!pdfDoc) return;
    if (dir === -1 && pageNum <= 1) return;
    if (dir === 1 && pageNum >= pdfDoc.numPages) return;

    irParaPagina(pageNum + dir, true);
}

// Zoom (0.4 a 3.0). Depois que o usuário mexe manualmente, o resize deixa de sobrescrever a escolha dele.
function mudarZoom(delta) {
    let novoScale = scale + delta;
    if (novoScale < ESCALA_MINIMA) novoScale = ESCALA_MINIMA;
    if (novoScale > ESCALA_MAXIMA) novoScale = ESCALA_MAXIMA;
    scale = Math.round(novoScale * 10) / 10;
    zoomAlteradoManualmente = true;
    renderPage(pageNum);
}

// Volta ao ajuste automático: a página inteira cabe na largura da tela.
function ajustarLargura() {
    zoomAlteradoManualmente = false;
    container.scrollLeft = 0;
    renderPage(pageNum);
}

// Salva o progresso via AJAX, autenticado por sessão + token CSRF. Chamado só em troca real de página.
function salvarProgresso(pag) {
    if (!pdfDoc) return;
    fetch(livroConfig.progressoUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': livroConfig.csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ pagina: pag, total: pdfDoc.numPages }),
    }).catch(function (err) {
        console.error('Falha ao salvar progresso de leitura:', err);
    });
}

document.getElementById('pageInput').addEventListener('change', function () {
    const num = parseInt(this.value);
    irParaPaginaLeitor(num);
});

document.getElementById('pageInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const num = parseInt(this.value);
        irParaPaginaLeitor(num);
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
document.getElementById('btnUltimaPagina')?.addEventListener('click', () => irParaPaginaLeitor(pdfDoc ? pdfDoc.numPages : pageNum));
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
// um zoom manualmente — renderPage recalcula a escala. O debounce evita dezenas de
// renderizações enquanto a janela está sendo arrastada.
let temporizadorResize = null;
window.addEventListener('resize', function () {
    if (!pdfDoc || zoomAlteradoManualmente) return;
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(function () {
        renderPage(pageNum);
    }, 150);
});

/* --------------------- virar a página rolando (mouse) --------------------- */
container.addEventListener('wheel', (e) => {
    if (!pdfDoc) return;

    const scrollNoFundo = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
    const scrollNoTopo = container.scrollTop === 0;

    if (e.deltaY > 0 && scrollNoFundo) {
        if (pageNum < pdfDoc.numPages) {
            mudarPagina(1);
            container.scrollTop = 10;
        }
    } else if (e.deltaY < 0 && scrollNoTopo) {
        if (pageNum > 1) {
            mudarPagina(-1);
            setTimeout(() => {
                container.scrollTop = container.scrollHeight - container.clientHeight - 10;
            }, 50);
        }
    }
});

/* ----------------- toque: virar página, mostrar HUD e pinça ----------------- */
// - Arrastar para cima/baixo no fim/começo da página vira a página (como já era).
// - Toque curto: borda esquerda (25%) volta, borda direita (25%) avança, centro mostra/esconde a interface.
// - Pinça (dois dedos): dá zoom; a página acompanha os dedos e é redesenhada nítida ao soltar.
let toqueInicio = null;
let pinca = null;

function distanciaEntre(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        pinca = { d0: distanciaEntre(e.touches[0], e.touches[1]), escala0: scale, fator: 1 };
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
        canvas.style.transform = `scale(${pinca.fator})`;
    }
}, { passive: true });

container.addEventListener('touchend', (e) => {
    if (pinca) {
        if (e.touches.length < 2) {
            const novaEscala = Math.round(pinca.escala0 * pinca.fator * 100) / 100;
            pinca = null;
            canvas.style.transform = '';
            if (Math.abs(novaEscala - scale) > 0.01) {
                scale = novaEscala;
                zoomAlteradoManualmente = true;
                renderPage(pageNum);
            }
        }
        toqueInicio = null;
        return;
    }
    if (!toqueInicio) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - toqueInicio.x;
    const diff = toqueInicio.y - t.clientY;
    const duracao = Date.now() - toqueInicio.t;
    toqueInicio = null;

    const scrollNoFundo = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
    const scrollNoTopo = container.scrollTop === 0;

    // Toque curto e parado
    if (Math.abs(dx) < 10 && Math.abs(diff) < 10 && duracao < 350) {
        const proporcao = t.clientX / window.innerWidth;
        if (proporcao < 0.25) {
            mudarPagina(-1);
        } else if (proporcao > 0.75) {
            mudarPagina(1);
        } else if (document.body.classList.contains('inactive')) {
            mostrarHud();
        } else {
            clearTimeout(timeoutMenu);
            document.body.classList.add('inactive');
        }
        return;
    }

    if (diff > 100 && scrollNoFundo) {
        mudarPagina(1);
        container.scrollTop = 0;
    } else if (diff < -100 && scrollNoTopo) {
        mudarPagina(-1);
        setTimeout(() => {
            container.scrollTop = container.scrollHeight - container.clientHeight;
        }, 50);
    }
}, { passive: true });
