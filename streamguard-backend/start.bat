@echo off
setlocal

cd /d "%~dp0"

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
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8011
