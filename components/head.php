<?php
if (!defined('ACESSO_PERMITIDO')) {
    header('Location: ' . (defined('CAMINHO_RAIZ') ? CAMINHO_RAIZ : '') . 'login.php');
    exit;
}
$raiz = caminhoRaiz();
?>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= e($tituloPagina ?? 'Meus Livros') ?></title>

<!-- Cor da interface do navegador: pinta a barra de endereços do Chrome no
     Android e o topo do Safari no iOS 15+ com o mesmo tom do fundo da página,
     em vez de deixar a faixa clara padrão emendando com o tema escuro.
     color-scheme faz controles de formulário e barras de rolagem nativas
     seguirem o tema escuro; os metas apple-* valem quando o site é salvo na
     tela de início do iPhone. -->
<meta name="theme-color" content="#121212">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Meus Livros">
<meta name="application-name" content="Meus Livros">
<meta name="msapplication-TileColor" content="#121212">

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<link rel="stylesheet" href="<?= asset('assets/css/style.css') ?>">
