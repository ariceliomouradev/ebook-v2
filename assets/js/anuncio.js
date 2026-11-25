/**
 * Anúncio quadrado (components/anuncio_modal.php). Abre:
 *   - na biblioteca: ao entrar no sistema (1ª vez na aba) e ao voltar de um livro;
 *   - no leitor: ao abrir um livro.
 * O leitor marca a saída em sessionStorage ('ml-saiu-leitor'); a biblioteca lê essa marca ao carregar.
 * Os banners rodam em sequência a cada exibição. Fecha no X, no Esc e tocando fora da arte.
 */
(function () {
    'use strict';

    const el = document.getElementById('anuncio');
    const dadosEl = document.getElementById('anuncio-dados');
    if (!el || !dadosEl) return;

    let dados;
    try { dados = JSON.parse(dadosEl.textContent); } catch (e) { return; }
    if (!dados.banners || !dados.banners.length) return;

    function ler(chave) { try { return sessionStorage.getItem(chave); } catch (e) { return null; } }
    function gravar(chave, valor) { try { sessionStorage.setItem(chave, valor); } catch (e) { /* sem storage */ } }
    function apagar(chave) { try { sessionStorage.removeItem(chave); } catch (e) { /* sem storage */ } }
    function lerLocal(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
    function gravarLocal(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* sem storage */ } }

    let devePular = false;
    if (dados.momento === 'leitor') {
        gravar('ml-saiu-leitor', '1'); // ao sair deste livro, a biblioteca mostra o anúncio
    } else {
        const entrou = ler('ml-anuncio-entrada') === '1';
        const voltou = ler('ml-saiu-leitor') === '1';
        apagar('ml-saiu-leitor');
        gravar('ml-anuncio-entrada', '1');
        devePular = entrou && !voltou; // recarregar a biblioteca (filtro, ordem) não reabre o anúncio
    }
    if (devePular) return;

    const proximo = ((parseInt(lerLocal('ml-anuncio-idx') || '0', 10) || 0) + 1) % dados.banners.length;
    gravarLocal('ml-anuncio-idx', String(proximo));
    const b = dados.banners[proximo];

    const comLink = document.getElementById('anuncioLink');
    const semLink = document.getElementById('anuncioSemLink');
    const arte = b.link ? comLink : semLink;
    const img = b.link ? document.getElementById('anuncioImgLink') : document.getElementById('anuncioImg');
    img.src = b.src;
    img.alt = b.alt || 'Anúncio';
    arte.style.setProperty('--fundo', 'url("' + b.src.replace(/"/g, '%22') + '")');
    if (b.link) { comLink.href = b.link; comLink.hidden = false; comLink.setAttribute('aria-label', (b.alt || 'Anúncio') + ' (abre em nova aba)'); semLink.hidden = true; }

    const fechar = document.getElementById('anuncioFechar');
    let focoAnterior = null;

    function abrir() {
        focoAnterior = document.activeElement;
        el.hidden = false;
        fechar.focus();
    }
    function encerrar() {
        el.hidden = true;
        document.removeEventListener('keydown', aoTeclar, true);
        if (focoAnterior && focoAnterior.focus) { try { focoAnterior.focus(); } catch (e) { /* elemento sumiu */ } }
        if (window.mlAtividade) window.mlAtividade();
    }
    function aoTeclar(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); encerrar(); return; }
        if (e.key === 'Tab') { // mantém o foco dentro do anúncio enquanto ele está aberto
            const foco = Array.from(el.querySelectorAll('button, a[href]')).filter((n) => !n.closest('[hidden]'));
            if (!foco.length) return;
            const primeiro = foco[0], ultimo = foco[foco.length - 1];
            if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        } else if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' '].includes(e.key)) {
            e.stopPropagation(); // não vira a página do livro por trás
        }
    }

    fechar.addEventListener('click', encerrar);
    el.addEventListener('click', (e) => { if (e.target === el) encerrar(); });
    document.addEventListener('keydown', aoTeclar, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', abrir); else abrir();
})();
