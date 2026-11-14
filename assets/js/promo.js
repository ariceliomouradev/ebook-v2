/**
 * Carrossel de divulgação: troca sozinho, sem setas nem indicadores.
 *
 * - Pausa com o mouse/foco em cima (quem está lendo ou clicando não é interrompido) e com a aba
 *   em segundo plano (não gasta bateria).
 * - Quem pediu menos movimento no sistema operacional recebe troca instantânea e mais lenta.
 * - Só a peça ativa fica exposta a leitores de tela (aria-hidden nas demais).
 */
(function () {
    'use strict';

    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const INTERVALO = reduzMovimento ? 9000 : 5500;
    const DURACAO = 800; // igual ao transition do CSS

    function iniciar(raiz) {
        const slides = Array.from(raiz.querySelectorAll('.promo__slide'));
        if (slides.length < 2) return; // uma peça só: nada para girar

        let atual = 0;
        let timer = null;
        let pausado = false;
        let trocando = false;

        function ir(proximo) {
            if (trocando || proximo === atual) return;
            trocando = true;
            const saindo = slides[atual];
            const entrando = slides[proximo];

            entrando.classList.add('is-entering'); // posiciona à direita, sem animar
            void entrando.offsetWidth; // força o navegador a registrar a posição inicial
            entrando.classList.remove('is-entering');
            entrando.classList.add('is-active');
            saindo.classList.remove('is-active');
            saindo.classList.add('is-leaving');

            entrando.removeAttribute('aria-hidden');
            saindo.setAttribute('aria-hidden', 'true');
            entrando.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '0'));
            saindo.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));

            atual = proximo;
            setTimeout(() => {
                saindo.classList.remove('is-leaving');
                trocando = false;
            }, reduzMovimento ? 0 : DURACAO);
        }

        function agendar() {
            clearTimeout(timer);
            if (pausado || document.hidden) return;
            timer = setTimeout(() => {
                ir((atual + 1) % slides.length);
                agendar();
            }, INTERVALO);
        }

        raiz.addEventListener('mouseenter', () => { pausado = true; clearTimeout(timer); });
        raiz.addEventListener('mouseleave', () => { pausado = false; agendar(); });
        raiz.addEventListener('focusin', () => { pausado = true; clearTimeout(timer); });
        raiz.addEventListener('focusout', () => { pausado = false; agendar(); });
        document.addEventListener('visibilitychange', agendar);

        agendar();
    }

    document.querySelectorAll('[data-promo]').forEach(iniciar);
})();
