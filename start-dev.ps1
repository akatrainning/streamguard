$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "start-backend.ps1"
$frontend = Join-Path $PSScriptRoot "start-frontend.ps1"

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$backend`""
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$frontend`""

Write-Host "Started StreamGuard backend and frontend in separate PowerShell windows." -ForegroundColor Green
