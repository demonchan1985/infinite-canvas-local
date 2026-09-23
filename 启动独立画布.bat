@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js 22.12+ is required. Install Node.js and try again.
    pause
    exit /b 1
)
node scripts\start-local.mjs
if errorlevel 1 pause
