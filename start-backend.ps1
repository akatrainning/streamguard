$ErrorActionPreference = "Stop"

$Port = 8011
$BackendDir = Join-Path $PSScriptRoot "streamguard-backend"

$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:NO_PROXY = if ($env:NO_PROXY) { "$($env:NO_PROXY),localhost,127.0.0.1,::1" } else { "localhost,127.0.0.1,::1" }
$env:no_proxy = if ($env:no_proxy) { "$($env:no_proxy),localhost,127.0.0.1,::1" } else { "localhost,127.0.0.1,::1" }

Write-Host "Starting StreamGuard backend on http://localhost:$Port" -ForegroundColor Cyan

$owners = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($owner in $owners) {
    if ($owner) {
        Write-Host "Stopping process using port $Port (PID=$owner)" -ForegroundColor Yellow
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $BackendDir

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created streamguard-backend/.env from .env.example" -ForegroundColor Green
}

$env:PORT = $Port
python run_uvicorn.py

