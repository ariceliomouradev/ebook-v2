/**
 * ============================================================================
 * 1. VARIÁVEIS DE CONTROLE GLOBAL
 * ============================================================================
 */
let searchTimeout;
let loadTimeoutCheck;
let bibliotecaAlterada = false;

// Dados vindos do servidor via <script type="application/json"> (não um <script> inline
// executável) para respeitar a Content-Security-Policy sem precisar de 'unsafe-inline'.
const APP_CONFIG_EL = document.getElementById('app-config');
const APP_CONFIG = APP_CONFIG_EL ? JSON.parse(APP_CONFIG_EL.textContent) : {};

const BASE_URL = APP_CONFIG.baseUrl || '';
const CSRF_TOKEN = APP_CONFIG.csrfToken || '';

function headersComCsrf(extra = {}) {
    return Object.assign({ 'X-CSRF-Token': CSRF_TOKEN, 'X-Requested-With': 'XMLHttpRequest' }, extra);
}

// A URL do worker do PDF.js é estática, então fica no arquivo externo em vez de inline no HTML.
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

/**
 * ============================================================================
 * 2. CONTROLE DE INTERFACE (LOADER, ERRO E TOAST)
 * ============================================================================
 */
function showLoader(texto = 'Carregando...') {
    const loader = document.getElementById('globalLoader');
    const errorScreen = document.getElementById('errorTimeout');

    if (loader) {
        const msgEl = loader.querySelector('h5');
        if (msgEl) msgEl.innerText = texto;
        loader.classList.remove('loader-hidden');
    }
    if (errorScreen) errorScreen.classList.add('d-none');

    clearTimeout(loadTimeoutCheck);
    loadTimeoutCheck = setTimeout(() => {
        if (loader && !loader.classList.contains('loader-hidden')) {
            loader.classList.add('loader-hidden');
            if (errorScreen) errorScreen.classList.remove('d-none');
        }
    }, 10000);
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('loader-hidden');

    clearTimeout(loadTimeoutCheck);
    const errorScreen = document.getElementById('errorTimeout');
    if (errorScreen) errorScreen.classList.add('d-none');
}

function mostrarErro(mensagem) {
    const toastEl = document.getElementById('toastErro');
    const msgEl = document.getElementById('toastErroMsg');
    if (!toastEl || !msgEl || !window.bootstrap) {
        alert(mensagem);
        return;
    }
    msgEl.innerText = mensagem;
    new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

/**
 * ============================================================================
 * 3. BUSCA, ORDENAÇÃO E PAGINAÇÃO (SERVIDOR — via AJAX)
 * ============================================================================
 * A busca roda no servidor sobre todo o acervo (antes filtrava só os 10
 * livros já renderizados na página atual, então nunca encontrava o resto).
 */
function estadoAtualDaUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
        busca: params.get('busca') || '',
        ordem: params.get('ordem') || 'recentes',
        pagina: params.get('pagina') || '1',
        categoria: params.get('categoria') || '',
    };
}

function carregarLivros(novoEstadoParcial, options = {}) {
    const estado = Object.assign(estadoAtualDaUrl(), novoEstadoParcial);
    const params = new URLSearchParams();
    if (estado.busca) params.set('busca', estado.busca);
    if (estado.categoria) params.set('categoria', estado.categoria);
    params.set('ordem', estado.ordem);
    params.set('pagina', estado.pagina);

    const areaLivros = document.getElementById('areaLivros');
    if (areaLivros) areaLivros.classList.add('grid-searching');

    fetch(`${BASE_URL}api/buscar.php?${params.toString()}`, { headers: headersComCsrf() })
        .then((response) => {
            if (!response.ok) throw new Error('Falha ao carregar a biblioteca.');
            return response.json();
        })
        .then((data) => {
            if (!data.success) throw new Error(data.error || 'Falha ao carregar a biblioteca.');

            const areaPaginacao = document.getElementById('areaPaginacao');
            if (areaLivros) areaLivros.innerHTML = data.gradeHtml;
            if (areaPaginacao) areaPaginacao.innerHTML = data.paginacaoHtml;
            atualizarCabecalhoAcervo(data.totalLivros, estado);
            marcarCategoriaAtiva(estado.categoria);

            if (!options.semHistorico) {
                const novaUrl = window.location.pathname + '?' + params.toString();
                window.history.pushState({}, '', novaUrl);
            }
        })
        .catch((err) => {
            console.error('Erro ao buscar livros:', err);
            mostrarErro('Não foi possível carregar a biblioteca. Tente novamente.');
        })
        .finally(() => {
            if (areaLivros) areaLivros.classList.remove('grid-searching');
        });
}

/** Atualiza título, contagem e a faixa 'Continue lendo' conforme a busca/página atual. */
function atualizarCabecalhoAcervo(total, estado) {
    const totalEl = document.getElementById('totalLivros');
    const rotuloEl = document.getElementById('rotuloTotal');
    const tituloEl = document.getElementById('tituloAcervo');
    const faixa = document.getElementById('faixaContinuar');
    if (typeof total === 'number') {
        if (totalEl) totalEl.textContent = String(total);
        if (rotuloEl) rotuloEl.textContent = total === 1 ? 'livro' : 'livros';
    }
    if (tituloEl) tituloEl.textContent = estado && (estado.busca || estado.categoria) ? 'Resultados' : 'Acervo';
    // O atalho só faz sentido na vitrine; durante busca ou em outra página ele some.
    if (faixa) faixa.hidden = !!(estado && (estado.busca || estado.categoria || String(estado.pagina) !== '1'));
}

/** Destaca o chip da categoria escolhida (e mantém o escolhido à vista no trilho). */
function marcarCategoriaAtiva(slug) {
    document.querySelectorAll('#chipsCategorias .chip').forEach((chip) => {
        const ativo = (chip.dataset.categoria || '') === (slug || '');
        chip.classList.toggle('is-ativo', ativo);
        if (ativo) chip.setAttribute('aria-current', 'true');
        else chip.removeAttribute('aria-current');
        if (ativo) chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
}

/** Trilhos horizontais sem barra de rolagem: no mouse dá para arrastar; no toque o navegador já rola. */
function habilitarArrastar(trilho) {
    let apertado = false;
    let moveu = false;
    let x0 = 0;
    let rolagem0 = 0;
    trilho.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        apertado = true;
        moveu = false;
        x0 = e.clientX;
        rolagem0 = trilho.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
        if (!apertado) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 4) {
            moveu = true;
            trilho.classList.add('is-arrastando');
        }
        trilho.scrollLeft = rolagem0 - dx;
    });
    window.addEventListener('pointerup', () => {
        apertado = false;
        trilho.classList.remove('is-arrastando');
    });
    // Se houve arrasto, o "clique" que o navegador dispara ao soltar não deve abrir o link.
    trilho.addEventListener('click', (e) => {
        if (moveu) {
            e.preventDefault();
            e.stopPropagation();
            moveu = false;
        }
    }, true);
}
document.querySelectorAll('[data-arrastar], .continuar-trilho').forEach(habilitarArrastar);

/** Tecla '/' leva o foco para a busca (como em GitHub e YouTube), sem atrapalhar quem digita. */
document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const alvo = e.target;
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
    const campo = document.getElementById('campoBusca');
    if (campo) {
        e.preventDefault();
        campo.focus();
        campo.select();
    }
});

function filtrarLivros() {
    const input = document.getElementById('campoBusca');
    const btnLimpar = document.getElementById('btnLimparBusca');
    const termo = input ? input.value : '';

    if (btnLimpar) btnLimpar.style.display = termo.length > 0 ? 'flex' : 'none';

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        carregarLivros({ busca: termo, pagina: '1' });
    }, 500);
}

document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'campoBusca') filtrarLivros();
});

document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'selectOrdenacao') {
        carregarLivros({ ordem: e.target.value, pagina: '1' });
    }
});

document.addEventListener('click', function (e) {
    if (e.target && e.target.closest('#btnLimparBusca')) {
        const input = document.getElementById('campoBusca');
        if (input) input.value = '';
        const btnLimpar = document.getElementById('btnLimparBusca');
        if (btnLimpar) btnLimpar.style.display = 'none';
        carregarLivros({ busca: '', pagina: '1' });
        return;
    }

    const chip = e.target.closest('#chipsCategorias .chip');
    if (chip) {
        e.preventDefault();
        carregarLivros({ categoria: chip.dataset.categoria || '', pagina: '1' });
        return;
    }

    const linkPagina = e.target.closest('#areaPaginacao a.btn-page');
    if (linkPagina && !linkPagina.classList.contains('disabled')) {
        e.preventDefault();
        const url = new URL(linkPagina.href, window.location.href);
        carregarLivros({ pagina: url.searchParams.get('pagina') || '1' });
    }
});

/**
 * ============================================================================
 * 4. GERENCIADOR (MODAL "GERENCIAR BIBLIOTECA") — LISTA PAGINADA NO SERVIDOR
 * ============================================================================
 * Antes o PHP colocava TODOS os livros no HTML do painel e o filtro rodava no DOM: com um
 * acervo de milhares de títulos isso eram megabytes a cada carregamento de página. Agora o
 * modal pede ao servidor uma página por vez (api/gerenciar_lista.php), já filtrada pela busca.
 */
const estadoGerenciador = { busca: '', pagina: 1, totalPaginas: 1, sequencia: 0 };
let temporizadorGerenciador;

function carregarGerenciador({ busca, pagina } = {}) {
    if (busca !== undefined) estadoGerenciador.busca = busca;
    if (pagina !== undefined) estadoGerenciador.pagina = pagina;

    const container = document.getElementById('containerListaGerenciar');
    if (!container) return Promise.resolve();

    // Se o usuário digitar de novo antes da resposta chegar, só a última resposta vale.
    const minhaVez = ++estadoGerenciador.sequencia;
    container.classList.add('grid-searching');
    container.setAttribute('aria-busy', 'true');

    const params = new URLSearchParams({ busca: estadoGerenciador.busca, pagina: String(estadoGerenciador.pagina) });
    return fetch(`${BASE_URL}api/gerenciar_lista.php?${params.toString()}`, { headers: headersComCsrf() })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (minhaVez !== estadoGerenciador.sequencia) return;
            if (!ok || !data.success) throw new Error((data && data.error) || 'Não foi possível carregar a lista.');

            container.innerHTML = data.html;
            estadoGerenciador.pagina = data.pagina;
            estadoGerenciador.totalPaginas = data.totalPaginas;
            atualizarRodapeGerenciador(data);
        })
        .catch((err) => {
            if (minhaVez !== estadoGerenciador.sequencia) return;
            console.error('Erro ao carregar o gerenciador:', err);
            mostrarErro('Não foi possível carregar a lista de livros. Tente novamente.');
        })
        .finally(() => {
            if (minhaVez === estadoGerenciador.sequencia) {
                container.classList.remove('grid-searching');
                container.setAttribute('aria-busy', 'false');
            }
        });
}

function atualizarRodapeGerenciador(data) {
    const contador = document.getElementById('contadorRegistros');
    if (contador) contador.innerText = data.total;

    const barra = document.getElementById('paginacaoGerenciador');
    if (!barra) return;

    barra.classList.toggle('d-none', data.totalPaginas <= 1);

    const info = document.getElementById('infoPaginaGerenciador');
    if (info) info.innerText = `Página ${data.pagina} de ${data.totalPaginas} · ${data.inicio}–${data.fim} de ${data.total}`;

    const anterior = document.getElementById('btnGerenciadorAnterior');
    const proxima = document.getElementById('btnGerenciadorProxima');
    if (anterior) anterior.disabled = data.pagina <= 1;
    if (proxima) proxima.disabled = data.pagina >= data.totalPaginas;
}

// Mostra o estado vazio da GRADE da biblioteca depois de uma exclusão.
function verificarEstadoVazio() {
    const msgVazioBanco = document.getElementById('msgVazioBanco');
    if (msgVazioBanco) {
        const cardsRestantes = document.querySelectorAll('.livro-item');
        msgVazioBanco.style.display = cardsRestantes.length === 0 ? 'flex' : 'none';
    }
}

document.addEventListener('input', function (e) {
    if (!e.target || e.target.id !== 'buscaGerenciador') return;

    const termo = e.target.value;
    const btnLimpar = document.getElementById('btnLimparGerenciador');
    if (btnLimpar) btnLimpar.style.display = termo.length > 0 ? 'flex' : 'none';

    clearTimeout(temporizadorGerenciador);
    temporizadorGerenciador = setTimeout(() => carregarGerenciador({ busca: termo.trim(), pagina: 1 }), 350);
});

document.addEventListener('click', function (e) {
    if (e.target.closest('#btnLimparGerenciador')) {
        const input = document.getElementById('buscaGerenciador');
        if (input) { input.value = ''; input.focus(); }
        const btnLimpar = document.getElementById('btnLimparGerenciador');
        if (btnLimpar) btnLimpar.style.display = 'none';
        clearTimeout(temporizadorGerenciador);
        carregarGerenciador({ busca: '', pagina: 1 });
        return;
    }

    if (e.target.closest('#btnGerenciadorAnterior') && estadoGerenciador.pagina > 1) {
        carregarGerenciador({ pagina: estadoGerenciador.pagina - 1 });
        return;
    }
    if (e.target.closest('#btnGerenciadorProxima') && estadoGerenciador.pagina < estadoGerenciador.totalPaginas) {
        carregarGerenciador({ pagina: estadoGerenciador.pagina + 1 });
    }
});

// A lista só é buscada quando o modal abre (e sempre começa limpa, na primeira página).
document.getElementById('modalGerenciar')?.addEventListener('show.bs.modal', function (evento) {
    // O item "Gerenciar banners" do menu do perfil abre o mesmo modal, já na tela de banners.
    // O Bootstrap informa em relatedTarget qual botão abriu o modal.
    if (evento.relatedTarget && evento.relatedTarget.hasAttribute('data-abrir-banners')) {
        abrirViewBanners();
    } else {
        voltarParaLista();
    }
    const input = document.getElementById('buscaGerenciador');
    if (input) input.value = '';
    const btnLimpar = document.getElementById('btnLimparGerenciador');
    if (btnLimpar) btnLimpar.style.display = 'none';
    carregarGerenciador({ busca: '', pagina: 1 });
});
/**
 * ============================================================================
 * 5. OPERAÇÕES CRUD (EDIÇÃO E EXCLUSÃO VIA AJAX)
 * ============================================================================
 */
function abrirEdicao(id, titulo, autor, categoria) {
    document.getElementById('editId').value = id;
    document.getElementById('editTitulo').value = titulo;
    document.getElementById('editAutor').value = autor;
    const selCategoria = document.getElementById('editCategoria');
    if (selCategoria) selCategoria.value = categoria || '';

    document.getElementById('viewLista').style.display = 'none';
    document.getElementById('viewFormulario').style.display = 'block';
    document.getElementById('tituloModalGerenciar').innerText = 'Editar Livro';
}

function cancelarEdicao() {
    document.getElementById('viewFormulario').style.display = 'none';
    document.getElementById('viewLista').style.display = 'block';
    document.getElementById('tituloModalGerenciar').innerText = 'Gerenciar Biblioteca';
}

document.addEventListener('click', function (e) {
    const btnEditar = e.target.closest('.btn-editar-livro');
    if (btnEditar) {
        const item = btnEditar.closest('.item-gerenciador');
        abrirEdicao(item.dataset.id, item.dataset.titulo, item.dataset.autor, item.dataset.categoria);
        return;
    }

    if (e.target.closest('#btnVoltarEdicao') || e.target.closest('#btnCancelarEdicao')) {
        cancelarEdicao();
    }
});

document.getElementById('formEditarLivro')?.addEventListener('submit', function (event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const btnSalvar = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSalvar.innerHTML;

    btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btnSalvar.disabled = true;

    fetch(`${BASE_URL}api/editar.php`, {
        method: 'POST',
        headers: headersComCsrf(),
        body: formData,
    })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || !data.success) {
                mostrarErro(data.error || 'Não foi possível salvar as alterações.');
                return;
            }

            const itemGerenciador = document.querySelector(`.item-gerenciador[data-id="${data.id}"]`);
            if (itemGerenciador) {
                itemGerenciador.querySelector('[data-testid="item-titulo-livro"]').innerText = data.titulo;
                itemGerenciador.querySelector('[data-testid="item-autor-livro"]').innerText = data.autor;
                itemGerenciador.setAttribute('data-titulo', data.titulo);
                itemGerenciador.setAttribute('data-autor', data.autor);
                itemGerenciador.setAttribute('data-categoria', data.categoria || '');

                itemGerenciador.style.backgroundColor = 'rgba(40, 167, 69, 0.2)';
                setTimeout(() => (itemGerenciador.style.backgroundColor = ''), 1000);
            }

            const cardGrid = document.querySelector(`.livro-item[data-id="${data.id}"]`);
            if (cardGrid) {
                cardGrid.querySelector('[data-testid="book-title"]').innerText = data.titulo;
                cardGrid.querySelector('[data-testid="book-title"]').title = data.titulo;
                cardGrid.querySelector('[data-testid="book-author"]').innerText = data.autor;
                cardGrid.setAttribute('data-titulo', data.titulo.toLowerCase());
                cardGrid.setAttribute('data-autor', data.autor.toLowerCase());
            }

            bibliotecaAlterada = true;
            cancelarEdicao();
        })
        .catch((err) => {
            console.error('Erro requisição AJAX:', err);
            mostrarErro('Falha ao comunicar com o servidor.');
        })
        .finally(() => {
            btnSalvar.innerHTML = textoOriginal;
            btnSalvar.disabled = false;
        });
});

document.addEventListener('click', function (e) {
    const btnExcluir = e.target.closest('.btn-excluir-livro');
    if (!btnExcluir) return;

    const item = btnExcluir.closest('.item-gerenciador');
    const id = item.dataset.id;
    const titulo = item.dataset.titulo;

    document.getElementById('nomeLivroExcluir').innerText = titulo;
    const btnConfirmar = document.getElementById('btnConfirmarExcluir');

    const novoBtn = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);

    novoBtn.onclick = function () {
        showLoader('Excluindo livro...');

        fetch(`${BASE_URL}api/excluir.php`, {
            method: 'POST',
            headers: headersComCsrf(),
            body: new URLSearchParams({ id }),
        })
            .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    mostrarErro((data && data.error) || 'Não foi possível excluir o livro.');
                    return;
                }

                bibliotecaAlterada = true;

                const modalEl = document.getElementById('modalConfirmarExcluir');
                if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

                document.querySelector(`.livro-item[data-id="${id}"]`)?.remove();
                verificarEstadoVazio();

                // A lista do gerenciador vem do servidor: recarrega a página atual. Isso repõe o
                // item que "subiu" da página seguinte, atualiza o contador e, se a página ficou
                // vazia, o servidor devolve a última página válida.
                carregarGerenciador();
            })
            .catch((err) => {
                console.error('Erro ao excluir:', err);
                mostrarErro('Falha ao comunicar com o servidor.');
            })
            .finally(() => hideLoader());
    };

    const modalConfirmar = new bootstrap.Modal(document.getElementById('modalConfirmarExcluir'));
    modalConfirmar.show();
});

/**
 * ============================================================================
 * 6. PROCESSAMENTO DE UPLOAD (PDF.js)
 * ============================================================================
 */
document.getElementById('inputFile')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    const fileReader = new FileReader();
    fileReader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = document.getElementById('canvasPreview');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const previewArea = document.getElementById('previewArea');
        if (previewArea) previewArea.style.display = 'block';

        canvas.style.display = 'block';

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        document.getElementById('capaBase64').value = canvas.toDataURL('image/png');
    };
    fileReader.readAsArrayBuffer(file);
});

document.getElementById('formNovoLivro')?.addEventListener('submit', function () {
    showLoader('Enviando livro...');
});

/**
 * ============================================================================
 * 7. CICLO DE VIDA E EVENTOS GLOBAIS
 * ============================================================================
 */
document.getElementById('btnRetryTimeout')?.addEventListener('click', () => window.location.reload());

window.addEventListener('load', function () {
    setTimeout(() => hideLoader(), 800);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('msg')) {
        urlParams.delete('msg');
        const novaQuery = urlParams.toString();
        const novaUrl = window.location.pathname + (novaQuery ? '?' + novaQuery : '');
        window.history.replaceState({}, document.title, novaUrl);
    }
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        window.location.reload();
    } else {
        document.querySelectorAll('.modal.show').forEach((modal) => {
            bootstrap.Modal.getInstance(modal)?.hide();
        });
    }
});

const modalGerenciarEl = document.getElementById('modalGerenciar');
if (modalGerenciarEl) {
    modalGerenciarEl.addEventListener('hidden.bs.modal', function () {
        if (bibliotecaAlterada) {
            showLoader('Sincronizando biblioteca...');
            window.location.reload();
        }
    });
}

/**
 * ============================================================================
 * 8. GESTÃO DE BANNERS (UPLOAD E REMOÇÃO)
 * ============================================================================
 */
function abrirViewBanners() {
    document.getElementById('viewLista').style.display = 'none';
    document.getElementById('viewFormulario').style.display = 'none';
    document.getElementById('viewBanners').style.display = 'block';
    document.getElementById('tituloModalGerenciar').innerText = 'Aparência do Sistema';
}

function voltarParaLista() {
    document.getElementById('viewBanners').style.display = 'none';
    document.getElementById('viewFormulario').style.display = 'none';
    document.getElementById('viewLista').style.display = 'block';
    document.getElementById('tituloModalGerenciar').innerText = 'Gerenciar Biblioteca';
}

/**
 * Chamada única para a API de banners. Toda resposta de sucesso traz `html` (o gerenciador já
 * renderizado), que substitui o conteúdo da tela: assim a lista nunca fica fora de sincronia.
 */
function chamarApiBanners(campos, mensagemCarregando) {
    showLoader(mensagemCarregando || 'Salvando...');

    const formData = new FormData();
    Object.entries(campos).forEach(([chave, valor]) => formData.append(chave, valor));
    formData.append('csrf_token', CSRF_TOKEN);

    return fetch(`${BASE_URL}api/manage_banners.php`, {
        method: 'POST',
        headers: headersComCsrf(),
        body: formData,
    })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || !data.success) {
                mostrarErro((data && data.error) || 'Não foi possível concluir a operação.');
                return false;
            }
            const area = document.getElementById('bannersGerenciador');
            if (area && data.html) area.innerHTML = data.html;
            bibliotecaAlterada = true;
            return true;
        })
        .catch((err) => {
            console.error('Erro na API de banners:', err);
            mostrarErro('Erro de conexão. Tente novamente.');
            return false;
        })
        .finally(() => hideLoader());
}

document.addEventListener('click', function (e) {
    // Escolher a imagem de um novo banner
    const btnSubir = e.target.closest('.btn-subir-banner');
    if (btnSubir) {
        document.getElementById(btnSubir.dataset.targetInput)?.click();
        return;
    }

    // Reordenar
    const btnMover = e.target.closest('.btn-mover-banner');
    if (btnMover) {
        chamarApiBanners({ action: 'mover', id: btnMover.dataset.id, direcao: btnMover.dataset.direcao }, 'Reordenando...');
        return;
    }

    // Remover (com confirmação)
    const btnRemover = e.target.closest('.btn-remover-banner');
    if (btnRemover) {
        const id = btnRemover.dataset.id;
        const modalEl = document.getElementById('modalConfirmarExcluirBanner');
        const btnConfirmar = document.getElementById('btnConfirmarRemocaoBanner');
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

        // clona o botão para descartar o handler da confirmação anterior
        const novoBtn = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);
        novoBtn.onclick = function () {
            modalInstance.hide();
            chamarApiBanners({ action: 'remover', id }, 'Removendo banner...');
        };
        modalInstance.show();
    }
});

// Enviar a imagem assim que ela é escolhida
document.addEventListener('change', function (e) {
    const input = e.target;
    if (input.tagName !== 'INPUT' || input.type !== 'file' || !input.dataset.formatoBanner) return;

    const arquivo = input.files[0];
    if (!arquivo) return;
    const formato = input.dataset.formatoBanner;
    const alt = document.getElementById(`bmAlt-${formato}`)?.value || '';
    const link = document.getElementById(`bmLinkNovo-${formato}`)?.value || '';

    chamarApiBanners({ action: 'adicionar', formato, imagem: arquivo, alt, link }, 'Enviando banner...').then(() => {
        input.value = '';
    });
});

// Salvar o link de um banner já cadastrado
document.addEventListener('submit', function (e) {
    const form = e.target.closest('.form-salvar-link-banner');
    if (!form) return;
    e.preventDefault();
    chamarApiBanners({ action: 'salvar_link', id: form.dataset.id, link: form.querySelector('input').value }, 'Salvando link...');
});

/**
 * ============================================================================
 * 9. GERENCIAR USUÁRIOS (MODAL, SÓ ADMIN) — tudo por AJAX, sem recarregar a página
 * ============================================================================
 * Quatro telas no mesmo modal (lista, novo, redefinir senha, excluir). Fechar o modal é o jeito
 * de "voltar": a página inicial nunca é recarregada nem trocada.
 */
(function () {
    const modalEl = document.getElementById('modalUsuarios');
    if (!modalEl) return;

    const telas = {
        lista: document.getElementById('viewUsuariosLista'),
        novo: document.getElementById('formNovoUsuario'),
        reset: document.getElementById('formResetSenha'),
        excluir: document.getElementById('formExcluirUsuario'),
    };
    const aviso = document.getElementById('usuariosAviso');

    function mostrarTela(nome) {
        Object.entries(telas).forEach(([chave, el]) => el.classList.toggle('d-none', chave !== nome));
    }

    function mostrarAviso(mensagem, tipo) {
        if (!mensagem) {
            aviso.classList.add('d-none');
            return;
        }
        aviso.className = `alert alert-${tipo} py-2 small`;
        aviso.textContent = mensagem;
    }

    async function chamarUsuarios(campos) {
        showLoader('Salvando...');
        const formData = new FormData();
        Object.entries(campos).forEach(([chave, valor]) => formData.append(chave, valor));
        formData.append('csrf_token', CSRF_TOKEN);
        try {
            const response = await fetch(`${BASE_URL}api/usuarios_gerenciar.php`, {
                method: 'POST',
                headers: headersComCsrf(),
                body: formData,
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                mostrarAviso((data && data.error) || 'Não foi possível concluir a operação.', 'danger');
                return false;
            }
            document.getElementById('usuariosTabela').innerHTML = data.html;
            document.getElementById('usuariosTotal').textContent = String(data.total);
            document.getElementById('usuariosRotulo').textContent = data.total === 1 ? 'pessoa' : 'pessoas';
            mostrarAviso(data.mensagem, 'success');
            mostrarTela('lista');
            return true;
        } catch (err) {
            console.error('Erro na API de usuários:', err);
            mostrarAviso('Erro de conexão. Tente novamente.', 'danger');
            return false;
        } finally {
            hideLoader();
        }
    }

    // Sempre abre na lista, sem aviso antigo, com os dados do servidor (outra aba pode ter mudado algo).
    modalEl.addEventListener('show.bs.modal', function () {
        mostrarTela('lista');
        mostrarAviso('');
        Object.values(telas).forEach((el) => el.tagName === 'FORM' && el.reset());
    });

    modalEl.addEventListener('click', function (e) {
        if (e.target.closest('#btnNovoUsuario')) {
            mostrarAviso('');
            mostrarTela('novo');
            document.getElementById('novoUsuarioNome').focus();
            return;
        }
        if (e.target.closest('.btn-cancelar-usuarios')) {
            mostrarAviso('');
            mostrarTela('lista');
            return;
        }
        const btnReset = e.target.closest('.btn-abrir-reset-senha');
        if (btnReset) {
            mostrarAviso('');
            document.getElementById('resetUsuarioId').value = btnReset.dataset.id;
            document.getElementById('resetUsuarioNome').textContent = btnReset.dataset.nome;
            telas.reset.reset();
            document.getElementById('resetUsuarioId').value = btnReset.dataset.id; // reset() limpa o hidden
            mostrarTela('reset');
            document.getElementById('resetNovaSenha').focus();
            return;
        }
        const btnExcluir = e.target.closest('.btn-abrir-excluir-usuario');
        if (btnExcluir) {
            mostrarAviso('');
            document.getElementById('excluirUsuarioId').value = btnExcluir.dataset.id;
            document.getElementById('excluirUsuarioNome').textContent = btnExcluir.dataset.nome;
            mostrarTela('excluir');
        }
    });

    function aoEnviar(form, acao) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!form.reportValidity()) return; // mantém a dica nativa do padrão de senha forte
            const campos = { action: acao };
            new FormData(form).forEach((valor, chave) => (campos[chave] = valor));
            chamarUsuarios(campos).then((ok) => {
                if (ok) form.reset();
            });
        });
    }
    aoEnviar(telas.novo, 'adicionar');
    aoEnviar(telas.reset, 'redefinir_senha');
    aoEnviar(telas.excluir, 'excluir');

    // Endereço antigo (/usuarios) leva ao painel já com o modal aberto.
    if (new URLSearchParams(window.location.search).get('abrir') === 'usuarios' && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        window.history.replaceState({}, '', window.location.pathname); // tira o ?abrir= do endereço
    }
})();