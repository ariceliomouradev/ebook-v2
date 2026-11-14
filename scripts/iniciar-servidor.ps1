<#
  Inicia o Apache e o MariaDB do XAMPP (se ainda nao estiverem no ar) e abre o sistema no navegador.

  Uso:
    npm run servidor
    powershell -ExecutionPolicy Bypass -File scripts\iniciar-servidor.ps1 [-SemNavegador]

  Pasta do XAMPP: variavel de ambiente XAMPP, ou C:\xampp.
  A URL aberta vem do APP_URL do .env (padrao http://localhost/meus_livros/).

  Observacao: este arquivo e propositalmente ASCII (sem acentos). O PowerShell 5.1 le .ps1 sem BOM
  como ANSI e corromperia o texto acentuado.
#>
param([switch]$SemNavegador)

$ErrorActionPreference = 'Stop'

$xampp  = if ($env:XAMPP) { $env:XAMPP } else { 'C:\xampp' }
$mysqld = Join-Path $xampp 'mysql\bin\mysqld.exe'
$httpd  = Join-Path $xampp 'apache\bin\httpd.exe'
$myIni  = Join-Path $xampp 'mysql\bin\my.ini'

foreach ($exe in $mysqld, $httpd) {
    if (-not (Test-Path $exe)) {
        throw "Nao encontrei $exe. Instale o XAMPP ou defina a variavel de ambiente XAMPP com a pasta dele."
    }
}

function PortaAberta([int]$porta) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $porta -ErrorAction SilentlyContinue)
}

function AguardarPorta([int]$porta, [string]$nome) {
    for ($i = 0; $i -lt 40; $i++) {
        if (PortaAberta $porta) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "$nome nao respondeu na porta $porta em 20 segundos."
}

Write-Host ''
if (PortaAberta 3306) {
    Write-Host '  MySQL    ja estava no ar'
} else {
    Start-Process $mysqld -ArgumentList "--defaults-file=$myIni", '--standalone' -WindowStyle Hidden
    AguardarPorta 3306 'MySQL'
    Write-Host '  MySQL    iniciado'
}

if (PortaAberta 80) {
    Write-Host '  Apache   ja estava no ar'
} else {
    Start-Process $httpd -WindowStyle Hidden
    AguardarPorta 80 'Apache'
    Write-Host '  Apache   iniciado'
}

$url = 'http://localhost/meus_livros/'
$arquivoEnv = Join-Path $PSScriptRoot '..\.env'
if (Test-Path $arquivoEnv) {
    $linha = Select-String -Path $arquivoEnv -Pattern '^\s*APP_URL\s*=\s*(.+)$' | Select-Object -First 1
    if ($linha) { $url = $linha.Matches[0].Groups[1].Value.Trim() }
}

Write-Host ''
Write-Host "  Sistema: $url"
Write-Host ''
if (-not $SemNavegador) { Start-Process $url }
