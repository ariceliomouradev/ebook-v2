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
