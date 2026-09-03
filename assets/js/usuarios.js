document.addEventListener('click', function (e) {
    const btnReset = e.target.closest('.btn-abrir-reset-senha');
    if (btnReset) {
        document.getElementById('resetUsuarioId').value = btnReset.dataset.id;
        document.getElementById('resetUsuarioNome').innerText = btnReset.dataset.nome;
        new bootstrap.Modal(document.getElementById('modalResetSenhaUsuario')).show();
        return;
    }

    const btnExcluir = e.target.closest('.btn-abrir-excluir-usuario');
    if (btnExcluir) {
        document.getElementById('excluirUsuarioId').value = btnExcluir.dataset.id;
        document.getElementById('excluirUsuarioNome').innerText = btnExcluir.dataset.nome;
        new bootstrap.Modal(document.getElementById('modalExcluirUsuario')).show();
    }
});
