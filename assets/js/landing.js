// Página de apresentação: menu no celular e linha sob o topo ao rolar.
(function () {
    const topo = document.getElementById('topo');
    const menu = document.getElementById('menu');
    const btn = document.getElementById('btnMenu');

    function fecharMenu() {
        if (!menu || !btn) return;
        menu.classList.remove('aberto');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Abrir o menu');
    }
    if (btn && menu) {
        btn.addEventListener('click', () => {
            const abrir = !menu.classList.contains('aberto');
            menu.classList.toggle('aberto', abrir);
            btn.setAttribute('aria-expanded', String(abrir));
            btn.setAttribute('aria-label', abrir ? 'Fechar o menu' : 'Abrir o menu');
        });
        menu.addEventListener('click', (e) => { if (e.target.closest('a')) fecharMenu(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
        window.addEventListener('resize', () => { if (window.innerWidth > 820) fecharMenu(); });
    }

    function aoRolar() {
        if (topo) topo.classList.toggle('com-linha', window.scrollY > 8);
    }
    window.addEventListener('scroll', aoRolar, { passive: true });
    aoRolar();
})();
