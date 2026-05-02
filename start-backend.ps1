$ErrorActionPreference = "Stop"

$Port = 8011
$BackendDir = Join-Path $PSScriptRoot "streamguard-backend"

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

python -m uvicorn app:app --reload --host 0.0.0.0 --port $Port
