/**
 * Leitor de EPUB (epub.js). Página: views/leitor_epub.php, aberta por views/leitor.php quando o livro é EPUB.
 *
 * Um EPUB não tem páginas fixas: o texto reflui conforme a tela e o tamanho da letra. Por isso o progresso é a
 * fração lida em milésimos (pagina 1..1000, total 1000 em api/progresso.php) e a posição exata vai como CFI
 * (`posicao`), que leva de volta à mesma linha em qualquer tela.
 */
(function () {
    'use strict';

    const cfg = JSON.parse(document.getElementById('livro-config').textContent);
    const $ = (id) => document.getElementById(id);

    const TOTAL = 1000;
    const ATRASO_SALVAR_MS = 1200;
    const FONTE_MIN = 70, FONTE_MAX = 220, FONTE_PASSO = 10;

    const TEMAS = {
        escuro: { nome: 'Escuro', fundo: '#0d0f14', texto: '#e6e8ee', link: '#f6b445' },
        sepia: { nome: 'Sépia', fundo: '#f4ecd8', texto: '#3b3126', link: '#8a4b08' },
        claro: { nome: 'Claro', fundo: '#ffffff', texto: '#1b1d22', link: '#0b5ed7' },
    };

    /* ---------- preferências (só conveniência: se o navegador bloquear o storage, segue o padrão) ---------- */
    function lerPref(chave, padrao) {
        try { return localStorage.getItem('ml-epub-' + chave) || padrao; } catch (e) { return padrao; }
    }
    function gravarPref(chave, valor) {
        try { localStorage.setItem('ml-epub-' + chave, String(valor)); } catch (e) { /* sem storage */ }
    }

    // o tema é o mesmo do resto do sistema (localStorage 'ml-tema': escuro | claro | papel); aqui 'papel' se chama 'sepia'
    const PARA_SISTEMA = { escuro: 'escuro', claro: 'claro', sepia: 'papel' };
    const DO_SISTEMA = { escuro: 'escuro', claro: 'claro', papel: 'sepia' };
    function temaDoSistema() {
        try { return DO_SISTEMA[localStorage.getItem('ml-tema')] || 'escuro'; } catch (e) { return 'escuro'; }
    }
    let tema = temaDoSistema();
    let fonte = Math.min(FONTE_MAX, Math.max(FONTE_MIN, parseInt(lerPref('fonte', '100'), 10) || 100));

    let book = null;
    let rendition = null;
    let locaisProntos = false;
    let fracao = null;          // 0..1, null enquanto o livro ainda não foi medido
    let cfiAtual = null;
    let ultimoSalvo = null;     // "pagina|cfi" já enviado
    let temporizador = null;
    let abriu = false;
    let layoutFixo = false;     // EPUB "pre-paginated": a letra não muda de tamanho

    /* ---------- tela de carregando / erro ---------- */
    function mostrarErro() {
        $('leitorCarregando').hidden = true;
        $('leitorErro').hidden = false;
    }

    /* ---------- tema e fonte ---------- */
    function regrasDoTema(t) {
        const c = TEMAS[t];
        // Livro de layout fixo (ilustrado, página = imagem posicionada): mexer em cor, altura ou fundo dos
        // elementos o deixa em branco ou desfigurado. Só o fundo da página acompanha o tema.
        if (layoutFixo) return { 'html, body': { background: c.fundo + ' !important' } };
        return {
            'html, body': { background: c.fundo + ' !important' },
            body: { color: c.texto + ' !important', 'line-height': '1.6' },
            'p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, em, strong, i, b, section, article': {
                color: 'inherit !important',
                'background-color': 'transparent !important',
            },
            a: { color: c.link + ' !important' },
            // só <img>: um <svg> (capas e páginas-imagem de muitos livros) com altura "auto" encolhe a zero e some
            img: { 'max-width': '100% !important', 'max-height': '85vh', 'object-fit': 'contain' },
            svg: { 'max-width': '100% !important', 'max-height': '85vh' },
        };
    }

    function aplicarTema() {
        document.body.dataset.tema = tema;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMAS[tema].fundo);
        // Um único tema ("ativo") reescrito a cada troca: registrar um tema por cor deixava as folhas de estilo
        // antigas no livro e a mais recente na ordem do documento vencia, então a cor da página não voltava.
        if (rendition) {
            rendition.themes.register('ativo', regrasDoTema(tema));
            rendition.themes.select('ativo');
        }
        const b = $('btnTema');
        if (b) {
            b.title = 'Tema: ' + TEMAS[tema].nome + ' (tocar para trocar)';
            b.setAttribute('aria-label', 'Trocar o tema da leitura. Atual: ' + TEMAS[tema].nome);
        }
    }

    function aplicarFonte() {
        if (rendition && !layoutFixo) rendition.themes.fontSize(fonte + '%');
        $('btnFonteMenos').disabled = layoutFixo || fonte <= FONTE_MIN;
        $('btnFonteMais').disabled = layoutFixo || fonte >= FONTE_MAX;
        $('btnFonteMenos').title = $('btnFonteMais').title = layoutFixo ? 'Este livro tem layout fixo: a letra não muda de tamanho' : '';
        if (!layoutFixo) { $('btnFonteMenos').title = 'Diminuir a letra'; $('btnFonteMais').title = 'Aumentar a letra'; }
    }

    /* ---------- progresso ---------- */
    function atualizarTextoProgresso() {
        const pct = fracao === null ? null : Math.round(fracao * 100);
        $('epubPercentual').textContent = pct === null ? '…' : pct + '%';
        $('barraProgresso').style.width = (pct === null ? 0 : pct) + '%';
        $('progressoTexto').textContent = pct === null ? 'Medindo o livro…' : pct + '% lido';
    }

    function salvarProgresso() {
        if (fracao === null || !cfiAtual || !cfg.progressoUrl) return; // sem URL = modo análise: não grava
        const pagina = Math.min(TOTAL, Math.max(1, Math.round(fracao * TOTAL)));
        const chave = pagina + '|' + cfiAtual;
        if (chave === ultimoSalvo) return;
        ultimoSalvo = chave;
        fetch(cfg.progressoUrl, {
            method: 'POST',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': cfg.csrfToken,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ pagina: pagina, total: TOTAL, posicao: cfiAtual }),
        }).catch(function (err) {
            ultimoSalvo = null;
            console.error('Falha ao salvar progresso de leitura:', err);
        });
    }

    function agendarSalvar() {
        clearTimeout(temporizador);
        temporizador = setTimeout(salvarProgresso, ATRASO_SALVAR_MS);
    }

    function salvarAgora() {
        if (!abriu) return;
        clearTimeout(temporizador);
        salvarProgresso();
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAgora(); });
    window.addEventListener('pagehide', salvarAgora);

    function aoMudarLocal(loc) {
        if (!loc || !loc.start) return;
        if (window.mlAtividade) window.mlAtividade(); // virar página é atividade: mantém o login (assets/js/sessao.js)
        cfiAtual = loc.start.cfi;
        if (layoutFixo) {
            // Livro de páginas-imagem (quadrinhos, infantis): quase não tem texto, então a medida por caracteres
            // (locations) dá 1 ou 2 pontos e a leitura aparecia como 100% logo no começo. Aqui o progresso é a
            // posição da página na ordem do livro (página N de M).
            const total = (book.spine && (book.spine.length || (book.spine.items && book.spine.items.length))) || 0;
            const indice = typeof loc.start.index === 'number' ? loc.start.index : 0;
            fracao = total > 0 ? Math.min(1, (indice + 1) / total) : null;
        } else if (locaisProntos) {
            fracao = loc.atEnd ? 1 : book.locations.percentageFromCfi(cfiAtual);
        }
        atualizarTextoProgresso();
        // capítulo atual no título pequeno da barra de cima
        if (fracao !== null) {
            const item = book.navigation && book.navigation.get ? book.navigation.get(loc.start.href) : null;
            const nome = item && item.label ? item.label.trim() : '';
            $('progressoTexto').textContent = Math.round(fracao * 100) + '% lido' + (nome ? ' · ' + nome : '');
        }
        $('btnEpubAnterior').disabled = !!loc.atStart;
        $('btnEpubProximo').disabled = !!loc.atEnd;
        agendarSalvar();
    }

    /* ---------- navegação ---------- */
    function anterior() { if (rendition) rendition.prev(); }
    function proximo() { if (rendition) rendition.next(); }

    function tratarTecla(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        switch (e.key) {
            case 'ArrowLeft': case 'PageUp': anterior(); e.preventDefault(); break;
            case 'ArrowRight': case 'PageDown': proximo(); e.preventDefault(); break;
            case ' ': (e.shiftKey ? anterior : proximo)(); e.preventDefault(); break;
            case '+': case '=': mudarFonte(FONTE_PASSO); break;
            case '-': mudarFonte(-FONTE_PASSO); break;
            case 'f': case 'F': alternarTelaCheia(); break;
            case 'Escape': fecharSumario(); break;
            default: break;
        }
    }
    document.addEventListener('keydown', tratarTecla);

    // toque/clique: terço esquerdo volta, terço direito avança, centro mostra/esconde a interface
    function tratarToque(x, largura) {
        if (largura <= 0) return;
        const r = x / largura;
        if (r < 0.3) anterior();
        else if (r > 0.7) proximo();
        else document.body.classList.toggle('inactive');
    }

    function mudarFonte(delta) {
        fonte = Math.min(FONTE_MAX, Math.max(FONTE_MIN, fonte + delta));
        gravarPref('fonte', fonte);
        aplicarFonte();
    }

    /* ---------- sumário ---------- */
    function abrirSumario() {
        $('painelSumario').hidden = false;
        $('btnSumario').setAttribute('aria-expanded', 'true');
        $('painelSumario').querySelector('button, a')?.focus();
    }
    function fecharSumario() {
        if ($('painelSumario').hidden) return;
        $('painelSumario').hidden = true;
        $('btnSumario').setAttribute('aria-expanded', 'false');
        $('btnSumario').focus();
    }

    function montarSumario(itens) {
        const lista = $('listaSumario');
        lista.textContent = '';
        const adicionar = (arr, nivel) => {
            arr.forEach((item) => {
                const li = document.createElement('li');
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'sumario-item';
                b.style.paddingLeft = (14 + nivel * 16) + 'px';
                b.textContent = (item.label || '').trim() || 'Sem título';
                b.addEventListener('click', () => {
                    fecharSumario();
                    rendition.display(item.href);
                });
                li.appendChild(b);
                lista.appendChild(li);
                if (item.subitems && item.subitems.length) adicionar(item.subitems, nivel + 1);
            });
        };
        adicionar(itens, 0);
        if (!lista.children.length) {
            $('btnSumario').hidden = true;
        }
    }

    $('btnSumario').addEventListener('click', () => ($('painelSumario').hidden ? abrirSumario() : fecharSumario()));
    $('btnFecharSumario').addEventListener('click', fecharSumario);

    /* ---------- tela cheia ---------- */
    const raiz = document.documentElement;
    const pedirTelaCheia = raiz.requestFullscreen || raiz.webkitRequestFullscreen;
    const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    function alternarTelaCheia() {
        if (!emTelaCheia()) { if (pedirTelaCheia) pedirTelaCheia.call(raiz); }
        else if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    function iconeTelaCheia() {
        const i = $('iconFull');
        if (i) i.className = emTelaCheia() ? 'fas fa-compress' : 'fas fa-expand';
    }
    document.addEventListener('fullscreenchange', iconeTelaCheia);
    document.addEventListener('webkitfullscreenchange', iconeTelaCheia);
    if (!pedirTelaCheia) $('btnFullscreen').hidden = true;
    $('btnFullscreen').addEventListener('click', alternarTelaCheia);

    /* ---------- botões ---------- */
    $('btnEpubAnterior').addEventListener('click', anterior);
    $('btnEpubProximo').addEventListener('click', proximo);
    $('btnFonteMenos').addEventListener('click', () => mudarFonte(-FONTE_PASSO));
    $('btnFonteMais').addEventListener('click', () => mudarFonte(FONTE_PASSO));
    $('btnTema').addEventListener('click', () => {
        const nomes = Object.keys(TEMAS);
        tema = nomes[(nomes.indexOf(tema) + 1) % nomes.length];
        try { localStorage.setItem('ml-tema', PARA_SISTEMA[tema]); } catch (e) { /* sem storage */ }
        aplicarTema();
    });

    // cliques na margem (fora da área do texto)
    $('epubPalco').addEventListener('click', (e) => {
        if (e.target.closest('#epubViewer')) return; // dentro do texto quem trata é o epub.js
        tratarToque(e.clientX, window.innerWidth);
    });

    /* ---------- favorito (coração) ---------- */
    (function () {
        const b = $('btnFavoritoLeitor');
        if (!b || !cfg.favoritosUrl) return;
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
            fd.append('livro_id', cfg.id);
            fd.append('favorito', quer ? '1' : '0');
            fd.append('csrf_token', cfg.csrfToken);
            fetch(cfg.favoritosUrl, { method: 'POST', headers: { 'X-CSRF-Token': cfg.csrfToken }, body: fd })
                .then((r) => r.json())
                .then((d) => { if (!d.success) pintar(!quer); })
                .catch(() => pintar(!quer));
        });
    })();

    /* ---------- abrir o livro ---------- */
    aplicarTema();

    if (!window.ePub || !window.JSZip) {
        mostrarErro();
        return;
    }

    fetch(cfg.url, { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then((buffer) => {
            book = window.ePub(buffer);
            return book.ready.then(() => abrirLivro());
        })
        .then(() => {
            locaisProntos = true;
            const atual = rendition.currentLocation();
            if (atual && atual.start) {
                aoMudarLocal({
                    start: atual.start,
                    atStart: atual.atStart,
                    atEnd: atual.atEnd,
                });
            }
        })
        .catch((err) => {
            console.error('Falha ao abrir o EPUB:', err);
            if (!abriu) mostrarErro();
        });

    // Livro de layout fixo: desloca o quadro para que o conteúdo (união dos elementos visíveis do corpo) fique no meio
    function centralizarPagina(visao) {
        try {
            const quadro = visao && visao.iframe;
            const doc = quadro && quadro.contentDocument;
            if (!doc || !doc.body) return;
            let esq = Infinity, dir = -Infinity;
            Array.prototype.forEach.call(doc.body.children, (el) => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none') {
                    esq = Math.min(esq, r.left); dir = Math.max(dir, r.right);
                }
            });
            if (!isFinite(esq) || dir <= esq) return;
            const area = $('epubViewer').getBoundingClientRect();
            const q = quadro.getBoundingClientRect();
            const centroConteudo = q.left + (esq + dir) / 2;       // posição atual do meio do conteúdo
            const alvo = area.left + area.width / 2;
            const atual = parseFloat(quadro.dataset.desloc || '0');
            const novo = atual + (alvo - centroConteudo);
            quadro.dataset.desloc = String(novo);
            quadro.style.transform = 'translateX(' + Math.round(novo) + 'px)';
        } catch (e) { /* sem centralizar: o livro continua legível */ }
    }

    function abrirLivro() {
        {
            layoutFixo = !!(book.packaging && book.packaging.metadata && book.packaging.metadata.layout === 'pre-paginated');
            rendition = book.renderTo('epubViewer', {
                width: '100%',
                height: '100%',
                flow: 'paginated',
                spread: 'none',
                allowScriptedContent: false, // o conteúdo do livro nunca executa script
            });
            aplicarTema();
            if (layoutFixo) {
                // página-imagem: o epub.js a encosta na esquerda; centraliza o conteúdo na coluna de leitura
                rendition.on('rendered', (secao, visao) => {
                    [0, 250, 900].forEach((ms) => setTimeout(() => centralizarPagina(visao), ms));
                });
            }
            aplicarFonte();

            rendition.on('relocated', aoMudarLocal);
            rendition.on('keydown', tratarTecla);
            rendition.on('click', (e) => {
                if (e.target && e.target.closest && e.target.closest('a[href]')) return; // link do livro
                const janela = e.view || (e.target.ownerDocument && e.target.ownerDocument.defaultView);
                if (janela && janela.getSelection && String(janela.getSelection()).length) return; // está selecionando texto
                tratarToque(e.clientX, janela ? janela.innerWidth : 0);
            });
            // deslizar o dedo para os lados vira a página
            let toqueX = null;
            rendition.on('touchstart', (e) => { toqueX = e.changedTouches[0].screenX; });
            rendition.on('touchend', (e) => {
                if (toqueX === null) return;
                const dx = e.changedTouches[0].screenX - toqueX;
                toqueX = null;
                if (Math.abs(dx) > 50) (dx < 0 ? proximo : anterior)();
            });

            book.loaded.navigation.then((nav) => montarSumario(nav.toc || [])).catch(() => { $('btnSumario').hidden = true; });
            const titulo = rendition.display(cfg.posicao || undefined);
            return titulo.catch(() => rendition.display()).then(() => {
                abriu = true;
                $('leitorCarregando').hidden = true;
                $('epubViewer').focus();
                atualizarTextoProgresso();
                // medir o livro (para a % e a barra): roda em segundo plano, o texto já está na tela.
                // Layout fixo não precisa: o progresso vem da página (acima) e medir caracteres só atrapalhava.
                return layoutFixo ? undefined : book.locations.generate(1200);
            });
        }
    }
})();
