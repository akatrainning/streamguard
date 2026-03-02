@echo off
REM StreamGuard Quick Start Script for Windows

echo.
echo ========================================
echo StreamGuard v2.2 - Quick Start
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is required but not installed.
    echo Download from: https://nodejs.org/
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo Error: npm is required but not installed.
    exit /b 1
)

echo.
echo [1] Starting frontend server...
echo.

cd streamguard-web

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo ========================================
echo Frontend is starting...
echo Access at: http://localhost:5175
echo ========================================
echo.
echo When you see "ready in XXXms", the app is ready.
echo.
echo Next steps:
echo 1. Open http://localhost:5175 in your browser
echo 2. Select "🎬 Mock Live Stream"
echo 3. Click "Start Monitoring"
echo 4. Enjoy the interactive dashboard!
echo.
echo To stop: Press Ctrl+C
echo.

call npm run dev
