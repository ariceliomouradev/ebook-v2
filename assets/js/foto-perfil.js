/**
 * Foto do perfil (menu do usuário > "Foto do perfil", modal #modalFotoPerfil de components/header.php).
 * Escolhe a imagem, mostra a prévia, confere tipo e tamanho ANTES de enviar (o servidor confere de novo e
 * reduz tudo para 256 px) e atualiza o avatar da barra superior sem recarregar a página.
 */
(function () {
    'use strict';

    const modal = document.getElementById('modalFotoPerfil');
    if (!modal) return;

    const MAX_BYTES = 2 * 1024 * 1024;
    const TIPOS = ['image/jpeg', 'image/png'];
    const $ = (id) => document.getElementById(id);
    const arquivoEl = $('fotoArquivo');
    const previa = $('fotoPrevia');
    const erroEl = $('fotoErro');
    const btnSalvar = $('btnSalvarFoto');
    const btnRemover = $('btnRemoverFoto');
    const btnEscolher = $('btnEscolherFoto');
    const inicial = previa.dataset.inicial || '';
    let csrf = '';
    try { csrf = JSON.parse($('app-config').textContent).csrfToken || ''; } catch (e) { /* sem token: o servidor recusa */ }
    let urlPrevia = null;
    let urlSalva = (previa.querySelector('img') || {}).src || ''; // a foto que está gravada hoje

    function mostrarErro(msg) {
        erroEl.textContent = msg || '';
        erroEl.classList.toggle('d-none', !msg);
    }

    function pintar(el, url) {
        el.textContent = '';
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            el.appendChild(img);
        } else {
            const s = document.createElement('span');
            s.textContent = inicial;
            el.appendChild(s);
        }
    }

    function atualizarAvatar(url) {
        document.querySelectorAll('[data-avatar]').forEach((a) => {
            a.textContent = '';
            if (url) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = '';
                a.appendChild(img);
            } else {
                a.textContent = a.dataset.inicial || inicial;
            }
        });
    }

    function soltarPrevia() {
        if (urlPrevia) { URL.revokeObjectURL(urlPrevia); urlPrevia = null; }
    }

    arquivoEl.addEventListener('change', () => {
        mostrarErro('');
        const f = arquivoEl.files && arquivoEl.files[0];
        btnSalvar.disabled = true;
        if (!f) return;
        if (!TIPOS.includes(f.type)) { mostrarErro('Envie uma imagem JPG, JPEG ou PNG.'); arquivoEl.value = ''; return; }
        if (f.size > MAX_BYTES) { mostrarErro('A foto deve ter no máximo ' + (MAX_BYTES / 1048576) + ' MB.'); arquivoEl.value = ''; return; }
        soltarPrevia();
        urlPrevia = URL.createObjectURL(f);
        pintar(previa, urlPrevia);
        btnSalvar.disabled = false;
    });

    btnEscolher.addEventListener('click', () => arquivoEl.click());

    function enviar(corpo, botao) {
        mostrarErro('');
        botao.disabled = true;
        corpo.append('csrf_token', csrf);
        return fetch('api/foto_perfil.php', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' }, body: corpo })
            .then((r) => r.json().catch(() => ({ success: false, error: 'Resposta inesperada do servidor.' })))
            .then((d) => {
                if (!d.success) { mostrarErro(d.error || 'Não foi possível salvar a foto.'); return null; }
                return d;
            })
            .catch(() => { mostrarErro('Sem conexão com o servidor. Tente de novo.'); return null; })
            .finally(() => { botao.disabled = false; });
    }

    btnSalvar.addEventListener('click', () => {
        const f = arquivoEl.files && arquivoEl.files[0];
        if (!f) return;
        const fd = new FormData();
        fd.append('action', 'enviar');
        fd.append('foto', f);
        enviar(fd, btnSalvar).then((d) => {
            if (!d) return;
            soltarPrevia();
            arquivoEl.value = '';
            urlSalva = d.url;
            pintar(previa, d.url);
            atualizarAvatar(d.url);
            btnRemover.classList.remove('d-none');
            $('rotuloEscolherFoto').textContent = 'Escolher outra foto';
            btnSalvar.disabled = true;
            if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).hide();
        });
    });

    btnRemover.addEventListener('click', () => {
        const fd = new FormData();
        fd.append('action', 'remover');
        enviar(fd, btnRemover).then((d) => {
            if (!d) return;
            soltarPrevia();
            arquivoEl.value = '';
            urlSalva = '';
            pintar(previa, '');
            atualizarAvatar('');
            btnRemover.classList.add('d-none');
            $('rotuloEscolherFoto').textContent = 'Escolher foto';
            btnSalvar.disabled = true;
            if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(modal).hide();
        });
    });

    modal.addEventListener('hidden.bs.modal', () => { mostrarErro(''); arquivoEl.value = ''; btnSalvar.disabled = true; soltarPrevia(); pintar(previa, urlSalva); });
})();
