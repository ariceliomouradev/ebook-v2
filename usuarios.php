<?php
// A gestão de usuários agora é um modal do painel. Este endereço (/usuarios) só redireciona,
// para favoritos e links antigos não quebrarem. O acesso é validado de novo no painel e na API.
define('CAMINHO_RAIZ', '');
require_once 'config/bootstrap.php';
require_perfil(['admin']);
header('Location: ' . url('index.php') . '?abrir=usuarios');
exit;