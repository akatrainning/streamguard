$PORT = 8012
$BackendDir = "$PSScriptRoot\streamguard-backend"

Write-Host "=== StreamGuard Backend Launcher ===" -ForegroundColor Cyan

# 清理占用端口的所有进程
$pids = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
if ($pids) {
    foreach ($p in $pids) {
        Write-Host "  杀掉占用端口 $PORT 的进程 PID=$p" -ForegroundColor Yellow
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}

# 确认端口已释放
$still = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
if ($still) {
    Write-Host "  ⚠️  端口 $PORT 仍被占用，尝试强制释放..." -ForegroundColor Red
    $still | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

Write-Host "  ✅ 端口 $PORT 已释放，启动后端..." -ForegroundColor Green
Set-Location $BackendDir
python -m uvicorn app:app --host 127.0.0.1 --port $PORT
