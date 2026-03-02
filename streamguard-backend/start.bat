@echo off
REM StreamGuard Backend Quick Start Script for Windows

echo.
echo ========================================
echo StreamGuard Backend v2.2 - Quick Start
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python 3.8+ is required but not installed.
    echo Download from: https://www.python.org/
    exit /b 1
)

echo.
echo [1] Installing Python dependencies...
echo.

call pip install -q -r requirements.txt 2>nul
if errorlevel 1 (
    echo Installing with details...
    call pip install -r requirements.txt
)

echo.
echo [2] Checking for .env file...
echo.

if not exist ".env" (
    echo Creating .env from template...
    copy .env.example .env >nul
    echo.
    echo ⚠️  IMPORTANT: You need to configure OpenAI API Key
    echo.
    echo Steps:
    echo 1. Get API Key from: https://platform.openai.com/api-keys
    echo 2. Edit .env file (opened in notepad)
    echo 3. Replace: OPENAI_API_KEY=sk-your-key-here
    echo 4. Save and close
    echo.
    timeout /t 5
    start notepad .env
    echo.
    echo Waiting for you to configure .env...
    timeout /t 10
) else (
    echo ✓ .env file found
    echo.
)

echo.
echo [3] Starting backend server...
echo.

echo ========================================
echo Backend is starting at http://localhost:8000
echo ========================================
echo.
echo Available endpoints:
echo   GET  http://localhost:8000/health
echo   GET  http://localhost:8000/analyze?text=...
echo   POST http://localhost:8000/transcribe
echo   POST http://localhost:8000/analyze-with-transcript
echo   WS   ws://localhost:8000/ws/stream
echo.
echo To stop: Press Ctrl+C
echo.

python -m uvicorn app:app --reload --port 8000
