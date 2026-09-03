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
    };
}

function carregarLivros(novoEstadoParcial, options = {}) {
    const estado = Object.assign(estadoAtualDaUrl(), novoEstadoParcial);
    const params = new URLSearchParams();
    if (estado.busca) params.set('busca', estado.busca);
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

function filtrarLivros() {
    const input = document.getElementById('campoBusca');
    const btnLimpar = document.getElementById('btnLimparBusca');
    const termo = input ? input.value : '';

    if (btnLimpar) btnLimpar.style.display = termo.length > 0 ? 'block' : 'none';

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

    const linkPagina = e.target.closest('#areaPaginacao a.btn-page');
    if (linkPagina && !linkPagina.classList.contains('disabled')) {
        e.preventDefault();
        const url = new URL(linkPagina.href, window.location.href);
        carregarLivros({ pagina: url.searchParams.get('pagina') || '1' });
    }
});

/**
 * ============================================================================
 * 4. PESQUISA (GERENCIADOR / MODAL EDIT — permanece client-side pois a lista
 *    completa já foi carregada de uma vez ao abrir o modal)
 * ============================================================================
 */
function filtrarGerenciador() {
    const input = document.getElementById('buscaGerenciador');
    const termo = input ? input.value.toLowerCase().trim() : '';
    const btnLimpar = document.getElementById('btnLimparGerenciador');
    const itens = document.getElementsByClassName('item-gerenciador');
    const msgBuscaVazia = document.getElementById('msgBuscaGerenciarVazia');
    const msgBancoVazio = document.getElementById('msgGerenciarVazio');
    let encontrados = 0;
    const totalItensExistentes = itens.length;

    if (btnLimpar) btnLimpar.style.display = termo.length > 0 ? 'block' : 'none';

    for (let i = 0; i < itens.length; i++) {
        const texto = itens[i].getAttribute('data-texto') || '';
        if (termo === '' || texto.includes(termo)) {
            itens[i].classList.remove('d-none');
            itens[i].classList.add('d-flex');
            encontrados++;
        } else {
            itens[i].classList.remove('d-flex');
            itens[i].classList.add('d-none');
        }
    }

    atualizarContadorGerenciador(encontrados);

    if (msgBuscaVazia) msgBuscaVazia.style.display = 'none';
    if (msgBancoVazio) msgBancoVazio.classList.add('d-none');

    if (totalItensExistentes === 0) {
        if (msgBancoVazio) msgBancoVazio.classList.remove('d-none');
    } else if (encontrados === 0 && termo !== '') {
        if (msgBuscaVazia) msgBuscaVazia.style.display = 'block';
    }
}

function atualizarContadorGerenciador(valorCustomizado = null) {
    const contadorSpan = document.getElementById('contadorRegistros');
    if (contadorSpan) {
        if (valorCustomizado !== null) {
            contadorSpan.innerText = valorCustomizado;
        } else {
            contadorSpan.innerText = document.querySelectorAll('.item-gerenciador:not(.d-none)').length;
        }
    }
}

function verificarEstadoVazio() {
    atualizarContadorGerenciador();

    const msgVazioBanco = document.getElementById('msgVazioBanco');
    if (msgVazioBanco) {
        const cardsRestantes = document.querySelectorAll('.livro-item');
        msgVazioBanco.style.display = cardsRestantes.length === 0 ? 'flex' : 'none';
    }

    const msgGerenciarVazio = document.getElementById('msgGerenciarVazio');
    if (msgGerenciarVazio) {
        const itensRestantesGerenciador = document.querySelectorAll('.item-gerenciador');
        if (itensRestantesGerenciador.length === 0) msgGerenciarVazio.classList.remove('d-none');
        else msgGerenciarVazio.classList.add('d-none');
    }
}

document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'buscaGerenciador') filtrarGerenciador();
});

document.addEventListener('click', function (e) {
    if (e.target && e.target.closest('#btnLimparGerenciador')) {
        const input = document.getElementById('buscaGerenciador');
        if (input) { input.value = ''; input.focus(); }
        filtrarGerenciador();
    }
});

/**
 * ============================================================================
 * 5. OPERAÇÕES CRUD (EDIÇÃO E EXCLUSÃO VIA AJAX)
 * ============================================================================
 */
function abrirEdicao(id, titulo, autor) {
    document.getElementById('editId').value = id;
    document.getElementById('editTitulo').value = titulo;
    document.getElementById('editAutor').value = autor;

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
        abrirEdicao(item.dataset.id, item.dataset.titulo, item.dataset.autor);
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
                itemGerenciador.setAttribute('data-texto', (data.titulo + ' ' + data.autor).toLowerCase());
                itemGerenciador.setAttribute('data-titulo', data.titulo);
                itemGerenciador.setAttribute('data-autor', data.autor);

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

                document.querySelector(`.item-gerenciador[data-id="${id}"]`)?.remove();
                document.querySelector(`.livro-item[data-id="${id}"]`)?.remove();

                const inputBusca = document.getElementById('buscaGerenciador');
                if (inputBusca && inputBusca.value.trim() !== '') {
                    filtrarGerenciador();
                } else {
                    verificarEstadoVazio();
                }
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

document.addEventListener('click', function (e) {
    if (e.target.closest('#linkGerenciarBanners')) abrirViewBanners();
    if (e.target.closest('#btnVoltarBanners')) voltarParaLista();

    const btnSubir = e.target.closest('.btn-subir-banner');
    if (btnSubir) {
        document.getElementById(btnSubir.dataset.targetInput)?.click();
    }
});

document.addEventListener('change', function (e) {
    const input = e.target.closest('[data-tipo-banner]');
    if (input && input.tagName === 'INPUT' && input.type === 'file') {
        uploadBannerAjax(input.dataset.tipoBanner, input);
    }
});

function uploadBannerAjax(tipo, inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    showLoader('Enviando banner...');

    const formData = new FormData();
    formData.append('action', 'upload');
    formData.append('tipo', tipo);
    formData.append('imagem', file);
    formData.append('csrf_token', CSRF_TOKEN);

    fetch(`${BASE_URL}api/manage_banners.php`, {
        method: 'POST',
        headers: headersComCsrf(),
        body: formData,
    })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || !data.success) {
                mostrarErro((data && data.error) || 'Erro ao enviar o banner.');
                return;
            }
            bibliotecaAlterada = true;
            inputElement.value = '';
        })
        .catch((err) => {
            console.error('Erro no upload do banner:', err);
            mostrarErro('Erro de conexão ao enviar o banner.');
        })
        .finally(() => hideLoader());
}

document.addEventListener('click', function (e) {
    const btnRemover = e.target.closest('.btn-remover-banner');
    if (!btnRemover) return;

    const tipo = btnRemover.dataset.tipoBanner;
    const modalEl = document.getElementById('modalConfirmarExcluirBanner');
    const btnConfirmar = document.getElementById('btnConfirmarRemocaoBanner');
    const modalInstance = new bootstrap.Modal(modalEl);

    const novoBtn = btnConfirmar.cloneNode(true);
    btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);

    novoBtn.onclick = function () {
        modalInstance.hide();
        executarRemocaoRealBanner(tipo, btnRemover);
    };

    modalInstance.show();
});

function executarRemocaoRealBanner(tipo, btnAcionador) {
    showLoader('Removendo banner...');

    const formData = new FormData();
    formData.append('action', 'remove');
    formData.append('tipo', tipo);
    formData.append('csrf_token', CSRF_TOKEN);

    fetch(`${BASE_URL}api/manage_banners.php`, {
        method: 'POST',
        headers: headersComCsrf(),
        body: formData,
    })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || !data.success) {
                mostrarErro((data && data.error) || 'Erro ao remover o banner.');
                return;
            }
            bibliotecaAlterada = true;
            if (btnAcionador) {
                const original = btnAcionador.innerHTML;
                btnAcionador.innerHTML = '<i class="fas fa-check"></i> Removido!';
                setTimeout(() => (btnAcionador.innerHTML = original), 1500);
            }
        })
        .catch((err) => {
            console.error('Erro:', err);
            mostrarErro('Erro de conexão ao tentar remover.');
        })
        .finally(() => hideLoader());
}
