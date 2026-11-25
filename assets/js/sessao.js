/**
 * Mantém o login enquanto a pessoa está ativa. O servidor derruba a sessão após 4 horas sem ação; quem lê um
 * livro longo quase não faz requisições, então enquanto houver atividade (toque, tecla, rolagem, troca de
 * página) a página avisa o servidor a cada 5 minutos. Sem atividade, nada é enviado e o prazo corre.
 * Leitores chamam window.mlAtividade() quando algo acontece dentro de um iframe (EPUB).
 */
(function () {
    'use strict';
    const INTERVALO_MS = 5 * 60 * 1000;
    let ativo = true;
    let csrf = '';
    try {
        const cfg = document.getElementById('livro-config') || document.getElementById('app-config');
        csrf = (cfg && JSON.parse(cfg.textContent).csrfToken) || '';
    } catch (e) { /* sem token: não envia */ }
    const origem = (document.currentScript && document.currentScript.src) || '';
    const url = origem.replace(/assets\/js\/sessao\.js.*$/, 'api/ping.php');

    function marcar() { ativo = true; }
    window.mlAtividade = marcar;
    ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach((ev) => document.addEventListener(ev, marcar, { passive: true, capture: true }));

    function ping() {
        if (!csrf || !url || !ativo || document.visibilityState === 'hidden') return;
        ativo = false;
        fetch(url, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' } })
            .catch(() => { ativo = true; });
    }
    setInterval(ping, INTERVALO_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ping(); });
})();
