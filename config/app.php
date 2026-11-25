<?php
// Constantes de configuração da aplicação (centraliza os "números mágicos" antes espalhados pelo código).
require_once __DIR__ . '/env.php';

const ITENS_POR_PAGINA = 10;              // grade da biblioteca (10 = 2 linhas de 5, 3 de 4 ou 5 de 2 colunas)
const ITENS_POR_PAGINA_GERENCIADOR = 20;  // lista do modal "Gerenciar Biblioteca" (carregada por AJAX)
const RESET_TOKEN_VALIDADE_HORAS = 1;
const SESSAO_INATIVIDADE_MAX_SEGUNDOS = 14400; // 4 horas sem ação (o logout também pode ser manual)
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_BLOQUEIO_SEGUNDOS = 300; // 5 minutos
const UPLOAD_PDF_TAMANHO_MAX = 100 * 1024 * 1024; // 100MB
const UPLOAD_IMG_TAMANHO_MAX = 5 * 1024 * 1024;   // 5MB

// Perfis comerciais (os nomes internos continuam leitor/contribuidor/admin; ver includes/perfis.php).
const LIMITE_ACESSOS = ['admin' => 0, 'contribuidor' => 3, 'leitor' => 1]; // acessos simultâneos (0 = sem limite); família = o grupo todo
const ANUNCIOS_PERFIS = ['admin', 'leitor']; // quem vê o banner de anúncio: Administrador (prévia) e Grátis (leitor); Pro não
const LIMITE_DEPENDENTES = 2;          // contas extras que o titular do Pro pode criar (titular + 2 = 3 acessos)
const ACERVO_POR_PAGINA = 10;            // livros por página em "Explorar acervo" (troca do Grátis)
// Teste grátis e mensalidade (ver includes/assinatura.php). Pagamento por PIX, combinado com o suporte no WhatsApp.
const TESTE_DIAS = 30;
const PRECOS_MENSAIS = ['leitor' => 0, 'contribuidor' => 25]; // Grátis R$ 0, Pro R$ 25
const SUPORTE_WHATSAPP_PADRAO = '5585986920243';           // troque pelo .env: SUPORTE_WHATSAPP

const APROVACOES_POR_VEZ = 10;          // pedidos por página na fila do administrador
const LIMITE_ENVIOS_ASSINANTE = 10;     // livros que um Grátis pode ter enviados ao mesmo tempo

