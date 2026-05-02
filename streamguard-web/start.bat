@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required.
  exit /b 1
)

if not exist node_modules (
  call npm install
)

call npm run dev
