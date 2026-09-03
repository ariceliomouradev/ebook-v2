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
    scale = calcularEscalaResponsiva(),
    zoomAlteradoManualmente = false,
    canvas = document.getElementById('the-canvas'),
    ctx = canvas.getContext('2d');

function calcularEscalaResponsiva() {
    const larguraTela = window.innerWidth;

    if (larguraTela < 576) {
        return 0.8;
    } else if (larguraTela < 992) {
        return 1.1;
    } else {
        return 1.4;
    }
}

pdfjsLib.getDocument(url).promise.then(function (pdfDoc_) {
    pdfDoc = pdfDoc_;
    document.getElementById('pageCount').textContent = pdfDoc.numPages;
    document.getElementById('pageInput').max = pdfDoc.numPages;
    renderPage(pageNum);
}).catch(function (err) {
    console.error('Erro ao carregar o PDF:', err);
    alert('Não foi possível carregar este livro. Volte à biblioteca e tente novamente.');
});

// Renderiza a página no canvas. Não salva progresso sozinha — quem navega decide se deve salvar.
function renderPage(num) {
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';

    pdfDoc.getPage(num).then(function (page) {
        const viewport = page.getViewport({ scale: scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        page.render({ canvasContext: ctx, viewport: viewport });
    });

    const inputPagina = document.getElementById('pageInput');
    if (inputPagina) {
        inputPagina.value = num;
    }
}

function irParaPagina(num, salvar) {
    if (!pdfDoc) return;

    if (num >= 1 && num <= pdfDoc.numPages) {
        pageNum = num;
        renderPage(pageNum);
        document.getElementById('canvas-container').scrollTop = 0;
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
    if (novoScale < 0.4) novoScale = 0.4;
    if (novoScale > 3.0) novoScale = 3.0;
    scale = Math.round(novoScale * 10) / 10;
    zoomAlteradoManualmente = true;
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

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        document.getElementById('iconFull').className = 'fas fa-compress';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            document.getElementById('iconFull').className = 'fas fa-expand';
        }
    }
}

// Botões do HUD
document.getElementById('btnPrimeiraPagina')?.addEventListener('click', () => irParaPaginaLeitor(1));
document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => mudarPagina(-1));
document.getElementById('btnProximaPagina')?.addEventListener('click', () => mudarPagina(1));
document.getElementById('btnUltimaPagina')?.addEventListener('click', () => irParaPaginaLeitor(pdfDoc ? pdfDoc.numPages : pageNum));
document.getElementById('btnZoomOut')?.addEventListener('click', () => mudarZoom(-0.2));
document.getElementById('btnZoomIn')?.addEventListener('click', () => mudarZoom(0.2));
document.getElementById('btnFullscreen')?.addEventListener('click', toggleFullScreen);

// Auto-hide do menu
let timeoutMenu;
document.addEventListener('mousemove', function () {
    document.body.classList.remove('inactive');
    clearTimeout(timeoutMenu);
    timeoutMenu = setTimeout(function () {
        document.body.classList.add('inactive');
    }, 3000);
});

// Reajusta a escala responsiva no resize, mas só enquanto o usuário não tiver escolhido um zoom manualmente.
window.addEventListener('resize', function () {
    if (!pdfDoc || zoomAlteradoManualmente) return;
    const novaEscala = calcularEscalaResponsiva();
    if (novaEscala !== scale) {
        scale = novaEscala;
        renderPage(pageNum);
    }
});

const container = document.getElementById('canvas-container');

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

let touchStartY = 0;
container.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

container.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    const scrollNoFundo = container.scrollHeight - container.scrollTop <= container.clientHeight + 1;
    const scrollNoTopo = container.scrollTop === 0;

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
