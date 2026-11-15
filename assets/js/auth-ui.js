/**
 * Utilitários compartilhados por telas de autenticação (login, redefinir senha,
 * trocar senha) e por qualquer botão de "mostrar/ocultar senha" no sistema.
 */
function togglePassword(btn) {
    const input = btn.previousElementSibling;
    const icon = btn.querySelector('i');
    if (!input || !icon) return;

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-toggle-password]');
    if (btn) togglePassword(btn);
});

document.addEventListener('DOMContentLoaded', function () {
    const modalAlerta = document.getElementById('modalAlertaGlobal');
    if (modalAlerta && window.bootstrap) {
        new bootstrap.Modal(modalAlerta).show();
    }
});

// Máscara do WhatsApp: (85) 98602-0364 enquanto digita (só formata; a validação é do servidor).
document.addEventListener('input', function (e) {
    const campo = e.target.closest('[data-mascara-whatsapp]');
    if (!campo) return;
    let d = campo.value.replace(/\D+/g, '');
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    let f = d;
    if (d.length > 6) f = d.length > 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    else if (d.length > 2) f = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    else if (d.length > 0) f = `(${d}`;
    campo.value = f;
});
