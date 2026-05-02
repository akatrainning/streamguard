$ErrorActionPreference = "Stop"

$FrontendDir = Join-Path $PSScriptRoot "streamguard-web"

Write-Host "Starting StreamGuard frontend" -ForegroundColor Cyan
Set-Location $FrontendDir

if (-not (Test-Path "node_modules")) {
    npm install
}

npm run dev
