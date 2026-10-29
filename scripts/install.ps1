#Requires -Version 5.1
<#
.SYNOPSIS
    Instala a extensão OpenCode Browser e o plugin do relay.

.DESCRIPTION
    Valida Node.js 20+, npm e OpenCode v2 e, em seguida, roda:
    npm install, npm run build, npm run install:plugin e
    opencode service restart.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    !   $Message" -ForegroundColor Yellow
}

function Stop-Install {
    param([string]$Message)
    Write-Host ""
    Write-Host "ERRO: $Message" -ForegroundColor Red
    exit 1
}

function Invoke-Npm {
    param([string[]]$Command, [string]$Failure)
    & npm @Command
    if ($LASTEXITCODE -ne 0) { Stop-Install $Failure }
}

# ---------------------------------------------------------------- validações

Write-Step "Validando o ambiente"

if (-not (Test-Path (Join-Path $Root "package.json"))) {
    Stop-Install "package.json não encontrado em $Root. Rode o script de dentro do repositório."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Install "Node.js não encontrado no PATH. Instale Node.js 20 ou superior: https://nodejs.org"
}
$nodeVersion = (& node -v 2>$null | Out-String).Trim()
if ($nodeVersion -match '^v(\d+)\.') {
    $nodeMajor = [int]$Matches[1]
} else {
    Stop-Install "Não foi possível ler a versão do Node.js (saída: $nodeVersion)."
}
if ($nodeMajor -lt 20) {
    Stop-Install "Node.js $nodeVersion encontrado; é necessário Node.js 20 ou superior."
}
Write-Ok "Node.js $nodeVersion"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-Install "npm não encontrado no PATH. Ele vem com o Node.js: reinstale em https://nodejs.org"
}
Write-Ok "npm $((& npm -v 2>$null | Out-String).Trim())"

$opencodeCommand = Get-Command opencode -ErrorAction SilentlyContinue
if ($opencodeCommand) {
    $opencodePath = $opencodeCommand.Source
} elseif (Test-Path (Join-Path $HOME ".opencode\bin\opencode.exe")) {
    $opencodePath = Join-Path $HOME ".opencode\bin\opencode.exe"
    Write-Warn "opencode não está no PATH; usando $opencodePath"
    Write-Warn "Adicione essa pasta ao PATH para os próximos terminais."
} else {
    Stop-Install "OpenCode v2 não encontrado no PATH. Instale o OpenCode v2 e abra um novo terminal."
}

$versionOutput = ((& $opencodePath --version 2>$null | Out-String)).Trim()
if ($versionOutput -match '(\d+)\.(\d+)\.(\d+)') {
    $opencodeVersion = $Matches[0]
    $opencodeMajor = [int]$Matches[1]
} else {
    Stop-Install "Não foi possível interpretar a versão do OpenCode (saída: $versionOutput). Confirme com 'opencode --version'."
}
if ($opencodeMajor -lt 2) {
    Stop-Install "OpenCode v$opencodeVersion encontrado. Esta extensão exige OpenCode v2 ou superior."
}
Write-Ok "OpenCode v$opencodeVersion ($opencodePath)"

# ---------------------------------------------------------------- instalação

Write-Step "Instalando dependências (npm install)"
Invoke-Npm @("install") "Falha no npm install. Veja o erro acima."
Write-Ok "Dependências instaladas."

Write-Step "Gerando o build da extensão (npm run build)"
Invoke-Npm @("run", "build") "Falha no build. Veja o erro acima."
Write-Ok "Build gerado em $Root\dist"

Write-Step "Instalando o plugin no OpenCode (npm run install:plugin)"
Invoke-Npm @("run", "install:plugin") "Falha ao instalar o plugin."
Write-Ok "Plugin copiado para a pasta de plugins do OpenCode."

Write-Step "Reiniciando o serviço do OpenCode (opencode service restart)"
& $opencodePath service restart
if ($LASTEXITCODE -ne 0) {
    Stop-Install "Não foi possível reiniciar o serviço. Rode 'opencode service restart' manualmente; sem isso o plugin antigo continua em memória."
}
Write-Ok "Serviço reiniciado."

# O relay só responde depois que o plugin carrega. Falha aqui não invalida a
# instalação, por isso é só um aviso.
$healthy = $false
for ($attempt = 0; $attempt -lt 5; $attempt++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8799/health" -TimeoutSec 1
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if ($healthy) {
    Write-Ok "Relay do plugin respondendo em http://127.0.0.1:8799/health"
} else {
    Write-Warn "O relay ainda não respondeu em 127.0.0.1:8799. Abra o painel da extensão e verifique."
}

# ---------------------------------------------------------------- resumo

Write-Host ""
Write-Host "Instalação concluída." -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:"
Write-Host "  1. Abra chrome://extensions e recarregue `"OpenCode Browser`""
Write-Host "     (ou use `"Carregar sem compactação`" apontando para a pasta dist\)."
Write-Host "  2. Abra o side panel e clique em `"Conectar`" para parear com o OpenCode."
Write-Host "  3. Se o painel não conectar, confira o relay:"
Write-Host "       curl http://127.0.0.1:8799/health"
