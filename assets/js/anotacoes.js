/*
 * ANOTAÇÕES NO LEITOR: marca-texto colorido (no texto selecionado ou por área), notas e comentários.
 *
 *  - Texto:  seleciona o texto (PDF.js desenha uma camada de texto invisível sobre a página) e toca em "Marcar".
 *  - Área:   arrasta um retângulo colorido; serve para páginas que são imagem (PDF escaneado), sem texto.
 *  - Nota:   um toque coloca um ponto com comentário.
 *
 * As posições são frações (0 a 1) da página, então acompanham o zoom. As anotações são só do usuário que
 * as fez (o servidor filtra por usuário em toda consulta) e não alteram o PDF.
 *
 * Roda depois do leitor.js e usa as variáveis dele (container, listaEl, paginas, tops, alturas, listaTopo).
 */
(function () {
    const CORES = { amarelo: '#ffd84d', verde: '#7ed957', azul: '#5ab0ff', rosa: '#ff7eb6', laranja: '#ffa94d' };
    const NOMES_COR = { amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', rosa: 'Rosa', laranja: 'Laranja' };
    const TAMANHO_MINIMO_PX = 8; // arrastos menores que isso não viram marcação

    let anotacoes = [];
    let ferramenta = 'rolar'; // rolar | texto | area | nota
    let corAtual = 'amarelo';
    let modoAtivo = false;
    let filtroPainel = '';
    let abertaId = null;
    let popCor = 'amarelo';
    let comentarioOriginal = '';

    const el = (id) => document.getElementById(id);
    const barra = el('barraMarcador');
    const btnMarcador = el('btnMarcador');
    const btnAnotacoes = el('btnAnotacoes');
    const pop = el('popAnotacao');
    const painel = el('painelAnotacoes');
    const bolha = el('bolhaTexto');
    if (!barra || !btnMarcador || !pop || !painel || !bolha) return;

    /* ------------------------------- servidor ------------------------------- */
    function chamar(campos) {
        const fd = new FormData();
        Object.entries(campos).forEach(([k, v]) => fd.append(k, v));
        fd.append('csrf_token', livroConfig.csrfToken);
        return fetch(livroConfig.anotacoesUrl, { method: 'POST', headers: { 'X-CSRF-Token': livroConfig.csrfToken }, body: fd })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .catch(() => ({ ok: false, data: { error: 'Falha ao comunicar com o servidor.' } }));
    }

    function aviso(texto) {
        const t = el('avisoAnotacao');
        if (!t) return;
        t.textContent = texto;
        t.hidden = !texto;
        clearTimeout(aviso.t);
        if (texto) aviso.t = setTimeout(() => { t.hidden = true; }, 4500);
    }

    /* ----------------------------- camada de cada página ----------------------------- */
    function camada(i) {
        const p = paginas[i];
        if (!p) return null;
        let c = p.el.querySelector(':scope > .camada-anot');
        if (!c) {
            c = document.createElement('div');
            c.className = 'camada-anot';
            c.dataset.pagina = String(p.n);
            p.el.appendChild(c);
        }
        return c;
    }

    function marcaDe(a) {
        const c = camada(a.pagina - 1);
        if (!c) return null;
        let m = c.querySelector(`:scope > [data-id="${a.id}"]`);
        if (!m) {
            m = document.createElement(a.tipo === 'nota' ? 'button' : 'div');
            if (a.tipo === 'nota') m.type = 'button';
            m.dataset.id = String(a.id);
            c.appendChild(m);
        }
        m.className = `anot anot--${a.tipo}`;
        m.style.setProperty('--cor', CORES[a.cor]);
        if (a.tipo === 'texto') {
            m.textContent = '';
            (a.rects || []).forEach((r) => {
                const d = document.createElement('div');
                d.className = 'anot-r';
                d.style.left = r[0] * 100 + '%';
                d.style.top = r[1] * 100 + '%';
                d.style.width = r[2] * 100 + '%';
                d.style.height = r[3] * 100 + '%';
                m.appendChild(d);
            });
        } else {
            m.style.left = a.x * 100 + '%';
            m.style.top = a.y * 100 + '%';
            if (a.tipo === 'area') {
                m.style.width = a.w * 100 + '%';
                m.style.height = a.h * 100 + '%';
            } else {
                m.innerHTML = '<i class="fas fa-comment" aria-hidden="true"></i>';
            }
        }
        const rotulo = a.tipo === 'nota' ? 'Nota' : (a.tipo === 'texto' ? 'Trecho marcado' : 'Marcação');
        m.title = a.comentario ? a.comentario : `${rotulo} (toque para comentar)`;
        m.setAttribute('aria-label', `${rotulo} ${NOMES_COR[a.cor].toLowerCase()} na página ${a.pagina}${a.comentario ? ': ' + a.comentario : ''}`);
        m.dataset.testid = 'anotacao-marca';
        m.classList.toggle('anot--comentada', !!a.comentario);
        return m;
    }

    function removerMarca(a) {
        const c = paginas[a.pagina - 1] && paginas[a.pagina - 1].el.querySelector(':scope > .camada-anot');
        const m = c && c.querySelector(`:scope > [data-id="${a.id}"]`);
        if (m) m.remove();
    }

    function porId(id) {
        return anotacoes.find((a) => a.id === id);
    }

    /* ----------------------------- modo marcador (barra) ----------------------------- */
    function definirFerramenta(f) {
        ferramenta = f;
        barra.querySelectorAll('[data-ferramenta]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ferramenta === f)));
        document.body.classList.toggle('marcando', modoAtivo && f !== 'rolar');
        document.body.classList.toggle('marcando-area', modoAtivo && f === 'area');
        document.body.classList.toggle('marcando-nota', modoAtivo && f === 'nota');
        document.body.classList.toggle('marcando-texto', modoAtivo && f === 'texto');
        if (f !== 'texto') esconderBolha(true);
    }

    function definirCor(cor) {
        corAtual = cor;
        barra.querySelectorAll('[data-cor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cor === cor)));
    }

    /** Página sem texto selecionável (imagem/escaneada)? Só sabemos depois de ela ser desenhada. */
    function paginaSemTexto(i) {
        const p = paginas[i];
        return !!p && p.el.dataset.semTexto === '1';
    }

    function alternarModo(ligar) {
        modoAtivo = typeof ligar === 'boolean' ? ligar : !modoAtivo;
        if (modoAtivo) paginas.forEach((_, i) => camada(i)); // toda página precisa da camada para receber o arrasto
        barra.hidden = !modoAtivo;
        btnMarcador.setAttribute('aria-pressed', String(modoAtivo));
        if (modoAtivo && ferramenta === 'rolar') {
            // ao ligar já fica pronto para marcar: texto, ou área se a página atual for uma imagem
            definirFerramenta(paginaSemTexto(pageNum - 1) ? 'area' : 'texto');
        } else {
            definirFerramenta(ferramenta);
        }
        if (!modoAtivo) {
            fecharPop(true);
            esconderBolha(true);
        }
    }

    btnMarcador.addEventListener('click', () => alternarModo());
    barra.addEventListener('click', (e) => {
        const f = e.target.closest('[data-ferramenta]');
        if (f) { definirFerramenta(f.dataset.ferramenta); return; }
        const c = e.target.closest('[data-cor]');
        if (c) { definirCor(c.dataset.cor); return; }
        if (e.target.closest('#btnSairMarcador')) alternarModo(false);
    });

    /* ------------------------------ camada de texto (PDF.js) ------------------------------ */
    const geracaoTexto = new Map(); // i -> número, para ignorar camadas atrasadas

    document.addEventListener('leitor:pagina-desenhada', (e) => {
        const { i, page, viewport } = e.detail;
        const p = paginas[i];
        if (!p || !window.pdfjsLib || !pdfjsLib.renderTextLayer) return;
        const geracao = (geracaoTexto.get(i) || 0) + 1;
        geracaoTexto.set(i, geracao);
        page.getTextContent().then((conteudo) => {
            if (geracaoTexto.get(i) !== geracao || !p.renderizada) return; // a página mudou/foi descartada no meio do caminho
            let t = p.el.querySelector(':scope > .camada-texto');
            if (!t) {
                t = document.createElement('div');
                t.className = 'camada-texto';
                p.el.insertBefore(t, p.el.querySelector(':scope > .camada-anot'));
            }
            t.textContent = '';
            const temTexto = conteudo.items.some((it) => it.str && it.str.trim() !== '');
            p.el.dataset.semTexto = temTexto ? '0' : '1';
            if (!temTexto) return;
            pdfjsLib.renderTextLayer({ textContent: conteudo, container: t, viewport, textDivs: [] }).promise.catch(() => {});
        }).catch(() => {});
    });

    document.addEventListener('leitor:pagina-descartada', (e) => {
        const i = e.detail.i;
        geracaoTexto.set(i, (geracaoTexto.get(i) || 0) + 1);
        const p = paginas[i];
        const t = p && p.el.querySelector(':scope > .camada-texto');
        if (t) t.textContent = '';
    });

    /* ------------------------------ marcar o texto selecionado ------------------------------ */
    function retangulosNaPagina(range, paginaEl) {
        const pr = paginaEl.getBoundingClientRect();
        const brutos = Array.from(range.getClientRects()).filter((r) =>
            r.width > 1 && r.height > 2 && r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom
            && !(r.width >= pr.width * 0.98 && r.height >= pr.height * 0.5)); // descarta a "caixa" da camada inteira
        brutos.sort((a, b) => a.top - b.top || a.left - b.left);
        const linhas = [];
        brutos.forEach((r) => {
            const u = linhas[linhas.length - 1];
            const sobrepoe = u && Math.min(u.b, r.bottom) - Math.max(u.t, r.top) > 0.5 * Math.min(u.b - u.t, r.height);
            if (sobrepoe && r.left - u.r < 8 && r.right > u.l) { // mesma linha, encostado: junta
                u.l = Math.min(u.l, r.left);
                u.r = Math.max(u.r, r.right);
                u.t = Math.min(u.t, r.top);
                u.b = Math.max(u.b, r.bottom);
            } else {
                linhas.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
            }
        });
        const cl = (v) => Math.min(1, Math.max(0, v));
        return linhas.map((u) => {
            const x = cl((u.l - pr.left) / pr.width);
            const y = cl((u.t - pr.top) / pr.height);
            const w = Math.min(1 - x, (u.r - u.l) / pr.width);
            const h = Math.min(1 - y, (u.b - u.t) / pr.height);
            return [+x.toFixed(6), +y.toFixed(6), +w.toFixed(6), +h.toFixed(6)];
        }).filter((r) => r[2] > 0.002 && r[3] > 0.002);
    }

    function selecaoAtual() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const range = sel.getRangeAt(0);
        if (!listaEl.contains(range.commonAncestorContainer)) return null;
        const texto = sel.toString().replace(/\s+/g, ' ').trim();
        if (!texto) return null;
        return { sel, range, texto };
    }

    function esconderBolha(limpar) {
        bolha.hidden = true;
        if (limpar) {
            const s = window.getSelection();
            if (s && !s.isCollapsed && listaEl.contains(s.anchorNode)) s.removeAllRanges();
        }
    }

    let temporizadorSelecao = null;
    document.addEventListener('selectionchange', () => {
        if (!modoAtivo || ferramenta !== 'texto') return;
        clearTimeout(temporizadorSelecao);
        temporizadorSelecao = setTimeout(() => {
            const s = selecaoAtual();
            if (!s) { bolha.hidden = true; return; }
            const r = s.range.getBoundingClientRect();
            bolha.hidden = false;
            const largura = bolha.offsetWidth || 110;
            bolha.style.left = Math.min(window.innerWidth - largura - 8, Math.max(8, r.left + r.width / 2 - largura / 2)) + 'px';
            const abaixo = r.bottom + 14;
            bolha.style.top = (abaixo + 48 > window.innerHeight ? Math.max(8, r.top - 54) : abaixo) + 'px';
        }, 220);
    });
    // não deixa o toque na bolha desfazer a seleção antes de usá-la
    bolha.addEventListener('pointerdown', (e) => e.preventDefault());
    bolha.addEventListener('mousedown', (e) => e.preventDefault());

    bolha.addEventListener('click', () => {
        const s = selecaoAtual();
        if (!s) { bolha.hidden = true; return; }
        const alvos = [];
        paginas.forEach((p, i) => {
            const rects = retangulosNaPagina(s.range, p.el);
            if (rects.length) alvos.push({ pagina: p.n, rects });
        });
        esconderBolha(true);
        if (!alvos.length) { aviso('Não deu para marcar essa seleção. Tente selecionar de novo.'); return; }
        const trecho = s.texto.slice(0, 600);
        alvos.forEach((alvo, idx) => {
            criar({ pagina: alvo.pagina, tipo: 'texto', x: 0, y: 0, w: 0, h: 0, rects: JSON.stringify(alvo.rects), trecho }, idx === 0);
        });
    });

    // tocar numa página sem texto no modo "Texto": explica e oferece o caminho certo
    let avisouSemTexto = 0;
    listaEl.addEventListener('pointerdown', (e) => {
        if (!modoAtivo || ferramenta !== 'texto') return;
        const pg = e.target.closest('.pagina');
        if (!pg || pg.dataset.semTexto !== '1' || Date.now() - avisouSemTexto < 6000) return;
        avisouSemTexto = Date.now();
        aviso('Esta página é uma imagem, sem texto para selecionar. Use a ferramenta “Área” para marcar.');
    });

    /* ------------------------------ criar com o dedo/mouse (área e nota) ------------------------------ */
    let arrasto = null;

    function fracaoNaPagina(camadaEl, e) {
        const r = camadaEl.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
            r,
        };
    }

    listaEl.addEventListener('pointerdown', (e) => {
        if (!modoAtivo || (ferramenta !== 'area' && ferramenta !== 'nota') || e.button > 0) return;
        const c = e.target.closest('.camada-anot');
        if (!c || e.target.closest('.anot')) return;
        e.preventDefault();
        fecharPop(true);
        const ini = fracaoNaPagina(c, e);
        const rascunho = document.createElement('div');
        rascunho.className = 'anot anot--area anot--rascunho';
        rascunho.style.setProperty('--cor', CORES[corAtual]);
        if (ferramenta === 'area') c.appendChild(rascunho);
        arrasto = { c, ini, rascunho, id: e.pointerId, movido: false };
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* sem captura: segue assim mesmo */ }
    });

    listaEl.addEventListener('pointermove', (e) => {
        if (!arrasto || e.pointerId !== arrasto.id) return;
        const atual = fracaoNaPagina(arrasto.c, e);
        const dx = (atual.x - arrasto.ini.x) * atual.r.width;
        const dy = (atual.y - arrasto.ini.y) * atual.r.height;
        if (Math.hypot(dx, dy) > 4) arrasto.movido = true;
        if (ferramenta !== 'area') return;
        const x = Math.min(arrasto.ini.x, atual.x);
        const y = Math.min(arrasto.ini.y, atual.y);
        arrasto.rascunho.style.left = x * 100 + '%';
        arrasto.rascunho.style.top = y * 100 + '%';
        arrasto.rascunho.style.width = Math.abs(atual.x - arrasto.ini.x) * 100 + '%';
        arrasto.rascunho.style.height = Math.abs(atual.y - arrasto.ini.y) * 100 + '%';
    });

    function terminarArrasto(e, cancelar) {
        if (!arrasto || e.pointerId !== arrasto.id) return;
        const { c, ini, rascunho } = arrasto;
        const fim = fracaoNaPagina(c, e);
        const movido = arrasto.movido;
        rascunho.remove();
        arrasto = null;
        if (cancelar) return;
        const pagina = Number(c.dataset.pagina);

        if (ferramenta === 'nota') {
            if (movido) return; // arrastou: não era um toque
            criar({ pagina, tipo: 'nota', x: ini.x, y: ini.y, w: 0, h: 0 }, true);
            return;
        }
        const x = Math.min(ini.x, fim.x);
        const y = Math.min(ini.y, fim.y);
        const w = Math.abs(fim.x - ini.x);
        const h = Math.abs(fim.y - ini.y);
        if (w * fim.r.width < TAMANHO_MINIMO_PX || h * fim.r.height < TAMANHO_MINIMO_PX) return;
        criar({ pagina, tipo: 'area', x, y, w, h }, true);
    }
    listaEl.addEventListener('pointerup', (e) => terminarArrasto(e, false));
    listaEl.addEventListener('pointercancel', (e) => terminarArrasto(e, true));

    function criar(dados, abrirJanela) {
        return chamar({ action: 'criar', livro_id: livroConfig.id, cor: corAtual, ...dados }).then(({ ok, data }) => {
            if (!ok || !data.success) { aviso(data.error || 'Não foi possível salvar a marcação.'); return; }
            anotacoes.push(data.anotacao);
            const m = marcaDe(data.anotacao);
            atualizarContagem();
            if (abrirJanela) abrirPop(data.anotacao.id, m, true);
        });
    }

    /* --------------------------------- janelinha de comentário --------------------------------- */
    function posicionarPop(m) {
        if (window.matchMedia('(max-width: 599px)').matches) {
            pop.style.left = pop.style.top = '';
            return; // no celular a janelinha fica fixa embaixo (CSS)
        }
        const alvo = m.classList.contains('anot--texto') ? (m.querySelector('.anot-r') || m) : m;
        const r = alvo.getBoundingClientRect();
        const lp = pop.offsetWidth;
        const ap = pop.offsetHeight;
        const left = Math.min(window.innerWidth - lp - 12, Math.max(12, r.left + r.width / 2 - lp / 2));
        let top = r.bottom + 10;
        if (top + ap > window.innerHeight - 12) top = Math.max(12, r.top - ap - 10);
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
    }

    function pintarCoresPop() {
        pop.querySelectorAll('[data-cor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cor === popCor)));
    }

    function abrirPop(id, marca, novo) {
        const a = porId(id);
        if (!a) return;
        if (abertaId && abertaId !== id) fecharPop(true);
        abertaId = id;
        popCor = a.cor;
        comentarioOriginal = a.comentario || '';
        el('inputComentario').value = comentarioOriginal;
        const rotulo = a.tipo === 'nota' ? 'Nota' : (a.tipo === 'texto' ? 'Trecho marcado' : 'Marcação');
        el('popTitulo').textContent = `${rotulo} · página ${a.pagina}`;
        const q = el('popTrecho');
        q.hidden = !(a.tipo === 'texto' && a.trecho);
        q.textContent = a.trecho || '';
        pintarCoresPop();
        pop.hidden = false;
        posicionarPop(marca || marcaDe(a));
        if (novo || !comentarioOriginal) el('inputComentario').focus({ preventScroll: true });
    }

    /** Fecha a janelinha; com `salvar`, grava o comentário/cor se mudaram. */
    function fecharPop(salvar) {
        if (!abertaId) { pop.hidden = true; return; }
        const id = abertaId;
        const texto = el('inputComentario').value.trim();
        const a = porId(id);
        abertaId = null;
        pop.hidden = true;
        if (salvar && a && (texto !== (a.comentario || '') || popCor !== a.cor)) {
            gravar(a, popCor, texto);
        }
    }

    function gravar(a, cor, texto) {
        chamar({ action: 'editar', id: a.id, cor, comentario: texto }).then(({ ok, data }) => {
            if (!ok || !data.success) { aviso(data.error || 'Não foi possível salvar o comentário.'); return; }
            Object.assign(a, data.anotacao);
            marcaDe(a);
            atualizarPainel();
        });
    }

    pop.addEventListener('click', (e) => {
        const cor = e.target.closest('[data-cor]');
        if (cor) { popCor = cor.dataset.cor; pintarCoresPop(); return; }
        if (e.target.closest('#btnSalvarAnotacao')) { fecharPop(true); return; }
        if (e.target.closest('#btnFecharAnotacao')) { fecharPop(true); return; }
        if (e.target.closest('#btnExcluirAnotacao')) {
            const a = porId(abertaId);
            if (!a) return;
            if (!window.confirm('Apagar esta anotação?')) return;
            abertaId = null;
            pop.hidden = true;
            chamar({ action: 'excluir', id: a.id }).then(({ ok, data }) => {
                if (!ok || !data.success) { aviso(data.error || 'Não foi possível apagar.'); return; }
                removerMarca(a);
                anotacoes = anotacoes.filter((x) => x.id !== a.id);
                atualizarContagem();
                atualizarPainel();
            });
        }
    });

    // tocar numa marcação existente (com ou sem o modo ligado) abre a janelinha
    listaEl.addEventListener('click', (e) => {
        const m = e.target.closest('.anot:not(.anot--rascunho)');
        if (!m) return;
        e.preventDefault();
        abrirPop(Number(m.dataset.id), e.target.closest('.anot-r') || m, false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!pop.hidden) fecharPop(true);
        else if (!bolha.hidden) esconderBolha(true);
        else if (!painel.hidden) alternarPainel(false);
        else if (modoAtivo) alternarModo(false);
    });

    /* ----------------------------------- painel "Minhas anotações" ----------------------------------- */
    function atualizarContagem() {
        const n = anotacoes.length;
        const b = el('contagemAnotacoes');
        if (b) { b.textContent = String(n); b.hidden = n === 0; }
    }

    function atualizarPainel() {
        atualizarContagem();
        const lista = el('listaAnotacoes');
        const itens = anotacoes
            .filter((a) => !filtroPainel || a.cor === filtroPainel)
            .sort((a, b) => a.pagina - b.pagina || a.y - b.y || a.x - b.x);
        lista.textContent = '';
        if (!itens.length) {
            const vazio = document.createElement('p');
            vazio.className = 'painel-anot__vazio';
            vazio.textContent = anotacoes.length ? 'Nenhuma anotação nesta cor.' : 'Você ainda não anotou nada neste livro. Toque no marcador, escolha uma cor e marque um trecho.';
            lista.appendChild(vazio);
            return;
        }
        itens.forEach((a) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'item-anot';
            b.dataset.id = String(a.id);
            b.dataset.testid = 'item-anotacao';
            b.style.setProperty('--cor', CORES[a.cor]);
            const ponto = document.createElement('span');
            ponto.className = 'item-anot__cor';
            const corpo = document.createElement('span');
            corpo.className = 'item-anot__corpo';
            const pg = document.createElement('strong');
            pg.textContent = `Página ${a.pagina}` + (a.tipo === 'nota' ? ' · nota' : '');
            corpo.appendChild(pg);
            if (a.tipo === 'texto' && a.trecho) {
                const q = document.createElement('span');
                q.className = 'item-anot__trecho';
                q.textContent = '“' + (a.trecho.length > 140 ? a.trecho.slice(0, 140) + '…' : a.trecho) + '”';
                corpo.appendChild(q);
            }
            const txt = document.createElement('span');
            txt.textContent = a.comentario || (a.tipo === 'texto' ? '' : 'Sem comentário');
            if (!a.comentario) txt.className = 'item-anot__vazio';
            if (txt.textContent) corpo.appendChild(txt);
            b.append(ponto, corpo);
            lista.appendChild(b);
        });
    }

    function alternarPainel(abrir) {
        painel.hidden = !abrir;
        btnAnotacoes.setAttribute('aria-expanded', String(abrir));
        if (abrir) { fecharPop(true); atualizarPainel(); }
    }
    btnAnotacoes.addEventListener('click', () => alternarPainel(painel.hidden));
    el('btnFecharPainel').addEventListener('click', () => alternarPainel(false));
    painel.addEventListener('click', (e) => {
        const f = e.target.closest('[data-filtro]');
        if (f) {
            filtroPainel = f.dataset.filtro;
            painel.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtroPainel)));
            atualizarPainel();
            return;
        }
        const item = e.target.closest('.item-anot');
        if (!item) return;
        const a = porId(Number(item.dataset.id));
        if (!a) return;
        if (window.matchMedia('(max-width: 599px)').matches) alternarPainel(false);
        // leva a marcação para o terço de cima da tela e abre o comentário
        const alvoTopo = tops[a.pagina - 1] + alturas[a.pagina - 1] * a.y + listaTopo - container.clientHeight * 0.3;
        container.scrollTo({ top: Math.max(0, alvoTopo), behavior: 'auto' });
        setTimeout(() => {
            const m = marcaDe(a);
            if (!m) return;
            m.classList.add('anot--destaque');
            setTimeout(() => m.classList.remove('anot--destaque'), 1600);
            abrirPop(a.id, m, false);
        }, 250);
    });

    /* ------------------------------------------- carga ------------------------------------------- */
    document.addEventListener('leitor:paginas-prontas', () => {
        chamar({ action: 'listar', livro_id: livroConfig.id }).then(({ ok, data }) => {
            if (!ok || !data.success) return; // sem anotações: o leitor segue normal
            anotacoes = data.anotacoes;
            anotacoes.forEach(marcaDe);
            atualizarContagem();
            atualizarPainel();
        });
    });
    definirCor('amarelo');
})();
