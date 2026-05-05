@echo off
setlocal

cd /d "%~dp0"
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set NO_PROXY=localhost,127.0.0.1,::1
set no_proxy=localhost,127.0.0.1,::1

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10+ is required.
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Created .env from .env.example
  )
)

call pip install -r requirements.txt
python run_uvicorn.py

