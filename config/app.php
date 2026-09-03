<?php
// Constantes de configuração da aplicação (centraliza os "números mágicos" antes espalhados pelo código).
require_once __DIR__ . '/env.php';

const ITENS_POR_PAGINA = 10;
const RESET_TOKEN_VALIDADE_HORAS = 1;
const SESSAO_INATIVIDADE_MAX_SEGUNDOS = 1800; // 30 minutos
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_BLOQUEIO_SEGUNDOS = 300; // 5 minutos
const UPLOAD_PDF_TAMANHO_MAX = 100 * 1024 * 1024; // 100MB
const UPLOAD_IMG_TAMANHO_MAX = 5 * 1024 * 1024;   // 5MB

