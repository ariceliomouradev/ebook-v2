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
        favoritos: params.get('favoritos') || '',
    };
}

function carregarLivros(novoEstadoParcial, options = {}) {
    const estado = Object.assign(estadoAtualDaUrl(), novoEstadoParcial);
    const params = new URLSearchParams();
    if (estado.busca) params.set('busca', estado.busca);
    if (estado.categoria) params.set('categoria', estado.categoria);
    if (estado.favoritos) params.set('favoritos', '1');
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
            marcarFavoritosAtivo(estado.favoritos);
            if (typeof data.totalFavoritos === 'number') atualizarContagemFavoritos(data.totalFavoritos);

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
    if (tituloEl) tituloEl.textContent = estado && estado.favoritos ? 'Favoritos' : (estado && (estado.busca || estado.categoria) ? 'Resultados' : 'Acervo');
    // O atalho só faz sentido na vitrine; durante busca ou em outra página ele some.
    if (faixa) faixa.hidden = !!(estado && (estado.busca || estado.categoria || estado.favoritos || String(estado.pagina) !== '1'));
}

/** Botão "Favoritos" da barra do acervo: aceso quando só os favoritos estão sendo mostrados. */
function marcarFavoritosAtivo(valor) {
    const b = document.getElementById('btnFavoritosFiltro');
    if (!b) return;
    const ativo = valor === '1' || valor === true;
    b.classList.toggle('is-ativo', ativo);
    b.setAttribute('aria-pressed', String(ativo));
}

function atualizarContagemFavoritos(total) {
    const n = document.getElementById('totalFavoritos');
    if (n) n.textContent = String(total);
}

/** Coração de um livro: marca/desmarca no servidor; nos "Favoritos", o livro desmarcado sai da lista. */
function alternarFavorito(botao) {
    const id = botao.dataset.id;
    const quer = botao.getAttribute('aria-pressed') !== 'true';
    const pintar = (ativo) => {
        botao.classList.toggle('is-ativo', ativo);
        botao.setAttribute('aria-pressed', String(ativo));
        const icone = botao.querySelector('i');
        if (icone) icone.className = (ativo ? 'fas' : 'far') + ' fa-heart';
        botao.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    };
    pintar(quer); // responde na hora; volta atrás se o servidor recusar
    const fd = new FormData();
    fd.append('action', 'alternar');
    fd.append('livro_id', id);
    fd.append('favorito', quer ? '1' : '0');
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(`${BASE_URL}api/favoritos.php`, { method: 'POST', headers: headersComCsrf(), body: fd })
        .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || !data.success) {
                pintar(!quer);
                mostrarErro((data && data.error) || 'Não foi possível atualizar os favoritos.');
                return;
            }
            atualizarContagemFavoritos(data.total);
            if (!data.favorito && estadoAtualDaUrl().favoritos === '1') {
                // na lista de favoritos, tirar o coração tira o livro da lista
                carregarLivros({}, { semHistorico: true });
            }
        })
        .catch(() => {
            pintar(!quer);
            mostrarErro('Falha ao comunicar com o servidor.');
        });
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

    // Toque (sem mouse): o 1º toque no cartão só abre o painel sobre a capa ("Ler agora", título, progresso e o
    // coração); o 2º toque abre o livro. Tocar fora (ou noutro cartão) fecha o painel. Com mouse nada muda: o painel
    // aparece no hover e o clique abre o livro direto.
    const cartaoToque = e.target.closest('.card-livro');
    if (window.matchMedia('(hover: none)').matches) {
        const abertoAntes = document.querySelectorAll('.card-livro.is-aberto');
        if (cartaoToque && e.target.closest('.stretched-link') && !cartaoToque.classList.contains('is-aberto')) {
            e.preventDefault();
            abertoAntes.forEach((c) => c.classList.remove('is-aberto'));
            cartaoToque.classList.add('is-aberto');
            return;
        }
        if (!cartaoToque) abertoAntes.forEach((c) => c.classList.remove('is-aberto'));
    }

    const coracao = e.target.closest('.btn-favorito');
    if (coracao) {
        e.preventDefault(); // o cartão inteiro é um link para o leitor
        e.stopPropagation();
        alternarFavorito(coracao);
        return;
    }

    if (e.target.closest('#btnFavoritosFiltro')) {
        carregarLivros({ favoritos: estadoAtualDaUrl().favoritos === '1' ? '' : '1', pagina: '1' });
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
function abrirEdicao(id, titulo, autor, categoria, vis, sinopse) {
    document.getElementById('editId').value = id;
    const campoSinopse = document.getElementById('editSinopse');
    if (campoSinopse) campoSinopse.value = sinopse || '';
    document.getElementById('editTitulo').value = titulo;
    document.getElementById('editAutor').value = autor;
    const selCategoria = document.getElementById('editCategoria');
    if (selCategoria) selCategoria.value = categoria || '';
    vis = vis || { contribuidor: true, leitor: true, liberarEm: '' };
    document.getElementById('editVisContribuidor').checked = !!vis.contribuidor;
    document.getElementById('editVisLeitor').checked = !!vis.leitor;
    document.getElementById('editLiberarEm').value = vis.liberarEm || '';

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
        abrirEdicao(item.dataset.id, item.dataset.titulo, item.dataset.autor, item.dataset.categoria, {
            contribuidor: item.dataset.visContribuidor === '1',
            leitor: item.dataset.visLeitor === '1',
            liberarEm: item.dataset.liberarEm || '',
        }, item.dataset.sinopse || '');
        return;
    }

    if (e.target.closest('#btnVoltarEdicao') || e.target.closest('#btnCancelarEdicao')) {
        cancelarEdicao();
    }
});

// "Não é repetido": o livro volta a aparecer para Pro e Grátis
document.addEventListener('click', function (e) {
    const b = e.target.closest('.btn-nao-repetido');
    if (!b) return;
    const fd = new FormData();
    fd.append('action', 'limpar');
    fd.append('id', b.dataset.id);
    fd.append('csrf_token', CSRF_TOKEN);
    fetch(`${BASE_URL}api/duplicado.php`, { method: 'POST', headers: headersComCsrf(), body: fd })
        .then((r) => r.json())
        .then((d) => {
            if (!d.success) { mostrarErro(d.error || 'Não foi possível alterar.'); return; }
            b.closest('[data-testid="item-repetido"]')?.remove();
            bibliotecaAlterada = true;
        })
        .catch(() => mostrarErro('Falha ao comunicar com o servidor.'));
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
                itemGerenciador.setAttribute('data-sinopse', data.sinopse || '');
                itemGerenciador.setAttribute('data-categoria', data.categoria || '');
                const perfisVis = (data.visivel_para || '').split(',');
                itemGerenciador.setAttribute('data-vis-contribuidor', perfisVis.includes('contribuidor') ? '1' : '0');
                itemGerenciador.setAttribute('data-vis-leitor', perfisVis.includes('leitor') ? '1' : '0');
                itemGerenciador.setAttribute('data-liberar-em', data.liberar_em_input || '');
                const selo = itemGerenciador.querySelector('[data-testid="item-visibilidade"]');
                if (selo && data.selo) {
                    selo.className = `vis-selo ${data.selo.classe} mt-1`;
                    selo.querySelector('.vis-selo__texto').textContent = data.selo.texto;
                }

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

    // EPUB: não há capa para gerar aqui (o servidor a tira do arquivo) e título/autor podem vir dos metadados.
    const ehEpub = !!file && (file.type === 'application/epub+zip' || /\.epub$/i.test(file.name));
    const form = document.getElementById('formNovoLivro');
    const campoTitulo = form?.querySelector('[name="titulo"]');
    const campoAutor = form?.querySelector('[name="autor"]');
    if (campoTitulo) campoTitulo.required = !ehEpub;
    if (campoAutor) campoAutor.required = !ehEpub;
    const dicaEpub = document.getElementById('dicaEpub');
    if (dicaEpub) dicaEpub.hidden = !ehEpub;
    if (ehEpub) {
        const area = document.getElementById('previewArea');
        if (area) area.style.display = 'none';
        const capa = document.getElementById('capaBase64');
        if (capa) capa.value = '';
        return;
    }

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
 * Telas no mesmo modal (lista, novo, editar, senha temporária, excluir). Fechar o modal é o jeito
 * de "voltar": a página inicial nunca é recarregada nem trocada.
 */
(function () {
    const modalEl = document.getElementById('modalUsuarios');
    if (!modalEl) return;

    const telas = {
        lista: document.getElementById('viewUsuariosLista'),
        novo: document.getElementById('formNovoUsuario'),
        reset: document.getElementById('formResetSenha'),
        editar: document.getElementById('formEditarUsuario'),
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

    async function chamarUsuarios(campos, opcoes = {}) {
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
            if (!opcoes.semVoltar) mostrarTela('lista');
            return data;
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
        prepararSenhaTemporaria();
    });
    // a senha temporária não fica no HTML depois que o modal fecha
    modalEl.addEventListener('hidden.bs.modal', prepararSenhaTemporaria);

    /* ---------- senha temporária ---------- */
    const passo1 = document.getElementById('resetPasso1');
    const passo2 = document.getElementById('resetPasso2');
    const campoSenhaGerada = document.getElementById('resetSenhaGerada');
    const linkWhats = document.getElementById('resetLinkWhats');
    let zapDaPessoa = '';

    function prepararSenhaTemporaria() {
        passo1.classList.remove('d-none');
        passo2.classList.add('d-none');
        campoSenhaGerada.value = '';
        linkWhats.classList.add('d-none');
        linkWhats.removeAttribute('href');
    }

    function mostrarSenhaTemporaria(senha, nome) {
        campoSenhaGerada.value = senha;
        passo1.classList.add('d-none');
        passo2.classList.remove('d-none');
        if (zapDaPessoa) {
            const numero = zapDaPessoa.startsWith('55') ? zapDaPessoa : '55' + zapDaPessoa;
            const texto = 'Olá, ' + nome.split(' ')[0] + '! Sua senha temporária do Meus Livros é: ' + senha +
                '\n' + 'Entre em ' + new URL(BASE_URL, window.location.href).href + ' e crie a sua senha definitiva no primeiro acesso.';
            linkWhats.href = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
            linkWhats.classList.remove('d-none');
        }
        campoSenhaGerada.focus();
        campoSenhaGerada.select();
    }

    document.getElementById('btnCopiarSenhaTemp').addEventListener('click', async function () {
        const rotulo = this.innerHTML;
        try {
            await navigator.clipboard.writeText(campoSenhaGerada.value);
        } catch (err) {
            campoSenhaGerada.select();
            document.execCommand('copy');
        }
        this.innerHTML = '<i class="fas fa-check me-1"></i>Copiada';
        setTimeout(() => { this.innerHTML = rotulo; }, 1800);
    });

    telas.reset.addEventListener('submit', function (e) {
        e.preventDefault();
        const id = document.getElementById('resetUsuarioId').value;
        const nome = document.getElementById('resetUsuarioNome').textContent;
        chamarUsuarios({ action: 'redefinir_senha', usuario_id: id }, { semVoltar: true }).then((data) => {
            if (data && data.senha_temporaria) mostrarSenhaTemporaria(data.senha_temporaria, nome);
        });
    });

    /* ---------- editar WhatsApp e vencimento ---------- */
    telas.editar.addEventListener('submit', function (e) {
        e.preventDefault();
        const campos = { action: 'editar' };
        new FormData(telas.editar).forEach((valor, chave) => (campos[chave] = valor));
        chamarUsuarios(campos);
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
        const btnRenovar = e.target.closest('.btn-renovar-usuario');
        if (btnRenovar) {
            chamarUsuarios({ action: 'renovar', usuario_id: btnRenovar.dataset.id });
            return;
        }
        const btnBloquear = e.target.closest('.btn-bloquear-usuario');
        if (btnBloquear) {
            chamarUsuarios({ action: btnBloquear.dataset.acao, usuario_id: btnBloquear.dataset.id });
            return;
        }
        const btnReset = e.target.closest('.btn-abrir-reset-senha');
        if (btnReset) {
            mostrarAviso('');
            document.getElementById('resetUsuarioId').value = btnReset.dataset.id;
            document.getElementById('resetUsuarioNome').textContent = btnReset.dataset.nome;
            zapDaPessoa = btnReset.dataset.whatsapp || '';
            prepararSenhaTemporaria();
            mostrarTela('reset');
            return;
        }
        const btnEditar = e.target.closest('.btn-abrir-editar-usuario');
        if (btnEditar) {
            mostrarAviso('');
            const d = btnEditar.dataset;
            document.getElementById('editarUsuarioId').value = d.id;
            document.getElementById('editarUsuarioNome').textContent = d.nome;
            document.getElementById('editarWhatsapp').value = d.whatsapp || '';
            const comVenc = d.vencEditavel === '1';
            const campoData = document.getElementById('editarVencimento');
            const campoTipo = document.getElementById('editarTipo');
            campoData.value = d.vencimento || '';
            campoTipo.value = d.tipo || 'pago';
            campoData.disabled = !comVenc; // desabilitado não é enviado: o servidor não mexe no vencimento
            campoTipo.disabled = !comVenc;
            document.getElementById('editarBlocoVencimento').classList.toggle('d-none', !comVenc);
            document.getElementById('editarBlocoTipo').classList.toggle('d-none', !comVenc);
            document.getElementById('editarSemVencimento').classList.toggle('d-none', comVenc);
            mostrarTela('editar');
            document.getElementById('editarWhatsapp').focus();
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

    // Troca de perfil direto na linha. Se falhar, a tabela é redesenhada com o valor real do servidor.
    modalEl.addEventListener('change', function (e) {
        const sel = e.target.closest('.select-perfil-usuario');
        if (!sel) return;
        if (sel.value === 'admin' && !window.confirm('Dar acesso total (Administrador) a ' + sel.dataset.nome + '?')) {
            sel.value = sel.dataset.atual;
            return;
        }
        chamarUsuarios({ action: 'mudar_perfil', usuario_id: sel.dataset.id, perfil: sel.value }).then((ok) => {
            if (!ok) sel.value = sel.dataset.atual;
        });
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
    aoEnviar(telas.excluir, 'excluir');

    // Endereço antigo (/usuarios) leva ao painel já com o modal aberto.
    if (new URLSearchParams(window.location.search).get('abrir') === 'usuarios' && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        window.history.replaceState({}, '', window.location.pathname); // tira o ?abrir= do endereço
    }
})();

/**
 * ============================================================================
 * 10. PERFIS: APROVAÇÕES (admin), MEUS ENVIOS e MINHA FAMÍLIA
 * ============================================================================
 * Três modais que carregam por AJAX ao abrir. Cada API responde `html` (a lista pronta) e,
 * quando há, `mensagem` para o aviso do modal.
 */
(function () {
    function avisar(chave, texto, tipo) {
        const el = document.getElementById(`perfisAviso-${chave}`);
        if (!el) return;
        if (!texto) {
            el.classList.add('d-none');
            return;
        }
        el.className = `alert alert-${tipo || 'success'} py-2 small`;
        el.textContent = texto;
    }

    function chamar(url, campos) {
        const formData = new FormData();
        Object.entries(campos).forEach(([k, v]) => formData.append(k, v));
        formData.append('csrf_token', CSRF_TOKEN);
        return fetch(`${BASE_URL}${url}`, { method: 'POST', headers: headersComCsrf(), body: formData })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .catch(() => ({ ok: false, data: { error: 'Falha ao comunicar com o servidor.' } }));
    }

    function configurar({ modalId, listaId, aviso, url, aoCarregar, pular }) {
        const modal = document.getElementById(modalId);
        const lista = document.getElementById(listaId);
        if (!modal || !lista) return null;

        const executar = (campos, rolar) =>
            chamar(url, campos).then(({ ok, data }) => {
                if (!ok || !data.success) {
                    avisar(aviso, (data && data.error) || 'Não foi possível concluir.', 'danger');
                    return false;
                }
                lista.innerHTML = data.html;
                avisar(aviso, data.mensagem || '', 'success');
                if (aoCarregar) aoCarregar(data);
                if (rolar) lista.scrollIntoView({ block: 'nearest' });
                return true;
            });

        modal.addEventListener('show.bs.modal', () => {
            if (pular && pular()) return;
            lista.innerHTML = '<div class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Carregando...</div>';
            avisar(aviso, '');
            executar({ action: 'listar' });
        });
        return { modal, lista, executar };
    }

    // --- Aprovações (administrador) ---
    const emblema = (n) => {
        document.querySelectorAll('[data-testid="badge-aprovacoes"]').forEach((b) => {
            b.textContent = n;
            b.classList.toggle('d-none', !n);
        });
    };
    let filaAlterada = false; // aprovou/negou: a grade do painel recarrega ao fechar a fila
    let aprovPagina = 1;
    // depois de aprovar/negar o acervo por trás do modal já mostra o livro liberado e a contagem nova
    const atualizarAcervoAoFundo = () => carregarLivros({}, { semHistorico: true });
    function atualizarPaginacaoFila(d) {
        aprovPagina = d.pagina || 1;
        const total = d.totalPaginas || 1;
        const info = document.getElementById('aprovInfo');
        if (info) info.textContent = d.pendentes ? `Página ${aprovPagina} de ${total} · ${d.pendentes} pedido${d.pendentes === 1 ? '' : 's'}` : 'Nenhum pedido pendente';
        document.getElementById('aprovAnterior').disabled = aprovPagina <= 1;
        document.getElementById('aprovProxima').disabled = aprovPagina >= total;
    }
    let manterListaAprovacoes = false; // ao voltar da prévia do PDF a fila não recarrega
    const aprov = configurar({
        modalId: 'modalAprovacoes', listaId: 'listaAprovacoes', aviso: 'aprovacoes',
        pular: () => manterListaAprovacoes,
        url: 'api/aprovacoes.php', aoCarregar: (d) => { emblema(d.pendentes); atualizarPaginacaoFila(d); },
    });
    // toda chamada da fila leva a página atual: depois de aprovar, a mesma página é recarregada
    const executarFila = (campos, rolar) => aprov.executar({ pagina: aprovPagina, ...campos }, rolar);
    if (aprov) {
        const irPara = (p) => executarFila({ action: 'listar', pagina: p }).then(() => { aprov.modal.querySelector('.modal-body').scrollTop = 0; });
        document.getElementById('aprovAnterior').addEventListener('click', () => irPara(aprovPagina - 1));
        document.getElementById('aprovProxima').addEventListener('click', () => irPara(aprovPagina + 1));
    }
    if (aprov) {
        aprov.lista.addEventListener('click', (e) => {
            const item = e.target.closest('.item-aprovacao');
            if (!item) return;
            const ver = e.target.closest('.btn-aprov-ver');
            if (ver) {
                const campoAutor = item.querySelector('.aprov-autor');
                abrirPrevia(ver.dataset.id, ver.dataset.titulo, campoAutor ? campoAutor.value : '');
                return;
            }
            if (e.target.closest('.btn-aprov-aprovar')) {
                const autor = item.querySelector('.aprov-autor');
                executarFila({ action: 'aprovar', id: item.dataset.id, autor: autor ? autor.value : '' }).then((ok) => { if (ok) { filaAlterada = true; atualizarAcervoAoFundo(); } });
            } else if (e.target.closest('.btn-aprov-negar')) {
                executarFila({ action: 'negar', id: item.dataset.id }).then((ok) => { if (ok) { filaAlterada = true; atualizarAcervoAoFundo(); } });
            }
        });
    }

    // --- Prévia do PDF (dentro de um modal, sem nova aba e sem download) ---
    const modalPrevia = document.getElementById('modalPreviaPdf');
    const modalFila = document.getElementById('modalAprovacoes');
    let previaDoc = null;
    let previaPag = 1;
    let previaCorpoScroll = 0;

    async function desenharPagina() {
        const canvas = document.getElementById('previaPdfCanvas');
        const estado = document.getElementById('previaPdfEstado');
        if (!previaDoc || !canvas) return;
        const pagina = await previaDoc.getPage(previaPag);
        const area = document.getElementById('previaPdfArea');
        const larguraAlvo = Math.min(area.clientWidth - 16, 900);
        const base = pagina.getViewport({ scale: 1 });
        const escala = Math.max(0.3, larguraAlvo / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = pagina.getViewport({ scale: escala * dpr });
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        canvas.classList.remove('d-none');
        estado.classList.add('d-none');
        area.scrollTop = 0;
        document.getElementById('previaPagina').textContent = `${previaPag} / ${previaDoc.numPages}`;
        document.getElementById('previaAnterior').disabled = previaPag <= 1;
        document.getElementById('previaProxima').disabled = previaPag >= previaDoc.numPages;
    }

    let previaId = 0;

    function abrirPrevia(id, titulo, autor) {
        if (!modalPrevia || !window.pdfjsLib) return;
        previaId = id;
        document.getElementById('tituloPreviaPdf').textContent = titulo || 'Prévia';
        document.getElementById('previaTitulo').value = titulo || '';
        document.getElementById('previaAutor').value = autor || '';
        document.getElementById('previaAviso').textContent = '';
        document.getElementById('previaVisContribuidor').checked = true;
        document.getElementById('previaVisLeitor').checked = true;
        document.getElementById('previaLiberarEm').value = '';
        const estado = document.getElementById('previaPdfEstado');
        estado.textContent = 'Carregando...';
        estado.classList.remove('d-none');
        document.getElementById('previaPdfCanvas').classList.add('d-none');
        document.getElementById('previaPagina').textContent = '–';
        previaDoc = null;
        previaPag = 1;
        // troca de modal: esconde a fila, mostra a prévia e, ao fechar, a fila volta como estava
        previaCorpoScroll = modalFila.querySelector('.modal-body').scrollTop;
        manterListaAprovacoes = true;
        bootstrap.Modal.getOrCreateInstance(modalFila).hide();
        modalFila.addEventListener('hidden.bs.modal', function abrir() {
            modalFila.removeEventListener('hidden.bs.modal', abrir);
            bootstrap.Modal.getOrCreateInstance(modalPrevia).show();
            pdfjsLib.getDocument({ url: `${BASE_URL}api/download.php?id=${encodeURIComponent(id)}` }).promise
                .then((doc) => {
                    previaDoc = doc;
                    // se o modal ainda está abrindo (largura 0), o desenho acontece em shown.bs.modal
                    if (document.getElementById('previaPdfArea').clientWidth > 100) return desenharPagina();
                })
                .catch(() => { estado.textContent = 'Não foi possível abrir este PDF.'; estado.classList.remove('d-none'); });
        });
    }

    if (modalPrevia) {
        document.getElementById('previaAnterior').addEventListener('click', () => { if (previaPag > 1) { previaPag--; desenharPagina(); } });
        document.getElementById('previaProxima').addEventListener('click', () => { if (previaDoc && previaPag < previaDoc.numPages) { previaPag++; desenharPagina(); } });
        document.getElementById('formPrevia').addEventListener('submit', (e) => {
            e.preventDefault();
            const titulo = document.getElementById('previaTitulo').value.trim();
            const autor = document.getElementById('previaAutor').value.trim();
            const aviso = document.getElementById('previaAviso');
            if (!titulo || !autor) {
                aviso.className = 'small text-danger';
                aviso.textContent = 'Preencha o título e o autor.';
                return;
            }
            const botao = document.getElementById('previaSalvar');
            botao.disabled = true;
            chamar('api/aprovacoes.php', { action: 'editar', id: previaId, titulo, autor, pagina: aprovPagina }).then(({ ok, data }) => {
                botao.disabled = false;
                if (!ok || !data.success) {
                    aviso.className = 'small text-danger';
                    aviso.textContent = (data && data.error) || 'Não foi possível salvar.';
                    return;
                }
                aprov.lista.innerHTML = data.html; // a fila já mostra o texto novo quando você voltar
                emblema(data.pendentes);
                atualizarPaginacaoFila(data);
                filaAlterada = true;
                document.getElementById('tituloPreviaPdf').textContent = data.titulo;
                aviso.className = 'small text-success';
                aviso.textContent = 'Salvo.';
            });
        });
        document.getElementById('previaAprovar').addEventListener('click', () => {
            const titulo = document.getElementById('previaTitulo').value.trim();
            const autor = document.getElementById('previaAutor').value.trim();
            const aviso = document.getElementById('previaAviso');
            if (!titulo || !autor) {
                aviso.className = 'small text-danger';
                aviso.textContent = 'Preencha o título e o autor.';
                return;
            }
            const botoes = [document.getElementById('previaAprovar'), document.getElementById('previaSalvar')];
            botoes.forEach((b) => { b.disabled = true; });
            chamar('api/aprovacoes.php', {
                action: 'aprovar', id: previaId, titulo, autor, pagina: aprovPagina,
                definir_visibilidade: 1,
                vis_contribuidor: document.getElementById('previaVisContribuidor').checked ? 1 : '',
                vis_leitor: document.getElementById('previaVisLeitor').checked ? 1 : '',
                liberar_em: document.getElementById('previaLiberarEm').value,
            }).then(({ ok, data }) => {
                botoes.forEach((b) => { b.disabled = false; });
                if (!ok || !data.success) {
                    aviso.className = 'small text-danger';
                    aviso.textContent = (data && data.error) || 'Não foi possível aprovar.';
                    return;
                }
                aprov.lista.innerHTML = data.html;
                avisar('aprovacoes', 'Livro aprovado e publicado.', 'success');
                emblema(data.pendentes);
                atualizarPaginacaoFila(data);
                filaAlterada = true;
                atualizarAcervoAoFundo();
                bootstrap.Modal.getOrCreateInstance(modalPrevia).hide(); // volta para a fila
            });
        });
        modalPrevia.addEventListener('shown.bs.modal', () => { if (previaDoc) desenharPagina(); });
        modalPrevia.addEventListener('keydown', (e) => {
            if (e.target.closest('input')) return; // as setas dentro dos campos não trocam de página
            if (e.key === 'ArrowRight') document.getElementById('previaProxima').click();
            if (e.key === 'ArrowLeft') document.getElementById('previaAnterior').click();
        });
        modalPrevia.addEventListener('hidden.bs.modal', () => {
            if (previaDoc) previaDoc.destroy();
            previaDoc = null;
            bootstrap.Modal.getOrCreateInstance(modalFila).show();
            modalFila.addEventListener('shown.bs.modal', function voltar() {
                modalFila.removeEventListener('shown.bs.modal', voltar);
                manterListaAprovacoes = false;
                modalFila.querySelector('.modal-body').scrollTop = previaCorpoScroll;
            });
        });
    }

    if (modalFila) {
        modalFila.addEventListener('hidden.bs.modal', () => {
            if (filaAlterada && !manterListaAprovacoes) {
                showLoader('Sincronizando biblioteca...');
                window.location.reload();
            }
        });
    }

    // --- Meus envios (Pro titular e Grátis) ---
    let enviosAlterados = false;
    const envios = configurar({
        modalId: 'modalEnvios', listaId: 'listaEnvios', aviso: 'envios', url: 'api/meus_envios.php',
        aoCarregar: (d) => {
            const c = document.getElementById('enviosContagem');
            if (c) c.textContent = d.limite ? `${d.total} de ${d.limite} envios usados.` : `${d.total} livro(s) enviado(s).`;
        },
    });
    if (envios) {
        envios.modal.addEventListener('hidden.bs.modal', () => {
            if (enviosAlterados) window.location.reload();
        });
        envios.lista.addEventListener('click', (e) => {
            const pedir = e.target.closest('.btn-envio-solicitar');
            const excluir = e.target.closest('.btn-envio-excluir');
            if (pedir) {
                envios.executar({ action: 'solicitar', id: pedir.dataset.id });
            } else if (excluir && window.confirm('Excluir este livro da sua biblioteca? Essa ação não pode ser desfeita.')) {
                envios.executar({ action: 'excluir', id: excluir.dataset.id }).then((ok) => { if (ok) enviosAlterados = true; });
            }
        });
    }

    // --- Explorar acervo (Grátis, troca 1 por 1) ---
    let acervoPagina = 1;
    let acervoAlterado = false;
    let acervoBuscaTimer = null;
    const acervoBusca = document.getElementById('acervoBusca');
    const acervo = configurar({
        modalId: 'modalAcervo', listaId: 'listaAcervo', aviso: 'acervo', url: 'api/acervo.php',
        aoCarregar: (d) => {
            acervoPagina = d.pagina || 1;
            const total = d.totalPaginas || 1;
            const v = d.vagas || {};
            document.getElementById('acervoVagas').textContent = `Você tem ${v.livres} vaga${v.livres === 1 ? '' : 's'} livre${v.livres === 1 ? '' : 's'} (${v.usadas} de ${v.total} usadas).`;
            document.getElementById('acervoInfo').textContent = d.total ? `Página ${acervoPagina} de ${total} · ${d.total} livro${d.total === 1 ? '' : 's'}` : '';
            document.getElementById('acervoAnterior').disabled = acervoPagina <= 1;
            document.getElementById('acervoProxima').disabled = acervoPagina >= total;
            document.querySelectorAll('[data-testid="badge-vagas"]').forEach((b) => { b.textContent = v.livres; });
        },
    });
    if (acervo) {
        const buscar = (campos) => acervo.executar({ pagina: acervoPagina, busca: acervoBusca.value.trim(), ...campos });
        acervo.modal.addEventListener('show.bs.modal', () => { acervoBusca.value = ''; });
        acervo.modal.addEventListener('hidden.bs.modal', () => { if (acervoAlterado) window.location.reload(); });
        document.getElementById('acervoAnterior').addEventListener('click', () => buscar({ action: 'listar', pagina: acervoPagina - 1 }));
        document.getElementById('acervoProxima').addEventListener('click', () => buscar({ action: 'listar', pagina: acervoPagina + 1 }));
        acervoBusca.addEventListener('input', () => {
            clearTimeout(acervoBuscaTimer);
            acervoBuscaTimer = setTimeout(() => buscar({ action: 'listar', pagina: 1 }), 300);
        });
        acervo.lista.addEventListener('click', (e) => {
            const b = e.target.closest('.btn-acervo-liberar');
            if (!b) return;
            buscar({ action: 'liberar', id: b.dataset.id }).then((ok) => {
                if (ok) { acervoAlterado = true; carregarLivros({}, { semHistorico: true }); }
            });
        });
    }

    // --- Acessos do Pro (titular do Pro) ---
    const familia = configurar({ modalId: 'modalFamilia', listaId: 'listaFamilia', aviso: 'familia', url: 'api/familia.php' });
    if (familia) {
        familia.lista.addEventListener('click', (e) => {
            const remover = e.target.closest('.btn-familia-remover');
            if (remover && window.confirm(`Remover o acesso de ${remover.dataset.nome}?`)) {
                familia.executar({ action: 'remover', usuario_id: remover.dataset.id });
            }
        });
        const form = document.getElementById('formFamilia');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }
                const campos = Object.fromEntries(new FormData(form).entries());
                familia.executar({ ...campos, action: 'adicionar' }).then((ok) => { if (ok) form.reset(); });
            });
        }
    }
})();
