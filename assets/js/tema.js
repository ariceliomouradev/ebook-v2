/**
 * Tema do sistema: escuro (padrão), claro ou papel. A escolha fica em localStorage ('ml-tema') e vale para a
 * biblioteca, as telas de acesso e o leitor de EPUB. Este arquivo é carregado no <head> (components/head.php)
 * para aplicar o tema antes da primeira pintura, sem piscar.
 */
(function () {
    'use strict';

    const TEMAS = {
        escuro: { nome: 'Escuro', cor: '#0d0f14', bs: 'dark', icone: 'fa-moon' },
        claro: { nome: 'Claro', cor: '#f5f6f8', bs: 'light', icone: 'fa-sun' },
        papel: { nome: 'Papel', cor: '#f4ecd8', bs: 'light', icone: 'fa-book-open' },
    };

    function ler() {
        try {
            const t = localStorage.getItem('ml-tema');
            return TEMAS[t] ? t : 'escuro';
        } catch (e) { return 'escuro'; }
    }

    function aplicar(tema) {
        const raiz = document.documentElement;
        raiz.setAttribute('data-tema', tema);
        raiz.setAttribute('data-bs-theme', TEMAS[tema].bs);
        const cor = document.querySelector('meta[name="theme-color"]');
        if (cor) cor.setAttribute('content', TEMAS[tema].cor);
        const esquema = document.querySelector('meta[name="color-scheme"]');
        if (esquema) esquema.setAttribute('content', TEMAS[tema].bs);
    }

    function escolher(tema) {
        if (!TEMAS[tema]) return;
        try { localStorage.setItem('ml-tema', tema); } catch (e) { /* sem storage: vale só nesta página */ }
        aplicar(tema);
        marcarBotoes();
    }

    function marcarBotoes() {
        const atual = ler();
        document.querySelectorAll('[data-tema-opcao]').forEach((b) => {
            const ativo = b.dataset.temaOpcao === atual;
            b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
            b.classList.toggle('is-ativo', ativo);
        });
        const icone = document.querySelector('[data-tema-icone]');
        if (icone) icone.className = 'fas ' + TEMAS[atual].icone;
    }

    aplicar(ler());
    window.mlTema = { ler: ler, escolher: escolher, temas: TEMAS };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-tema-opcao]').forEach((b) => b.addEventListener('click', () => escolher(b.dataset.temaOpcao)));
        marcarBotoes();
    });
    // outra aba mudou o tema: acompanha
    window.addEventListener('storage', (e) => { if (e.key === 'ml-tema') { aplicar(ler()); marcarBotoes(); } });
})();
