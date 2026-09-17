@echo off
setlocal
cd /d "%~dp0"
title ORBIT Discord Control

echo =========================================
echo  ORBIT DISCORD CONTROL
echo =========================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
  echo [WARN] Node.js was not found in PATH.
  echo Install Node.js 20 or newer and start this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [WARN] npm was not found in PATH.
  echo Repair the Node.js installation and start this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [INFO] Created .env from .env.example.
  echo [INFO] Fill in the Discord credentials in the .env file, then start again.
  notepad ".env"
  pause
  exit /b 0
)

findstr /B /C:"PUBLIC_BASE_URL=http://localhost:3000" ".env" >nul 2>&1
if not errorlevel 1 (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$p='.env'; $c=[IO.File]::ReadAllText($p); $c=$c.Replace('PUBLIC_BASE_URL=http://localhost:3000','PUBLIC_BASE_URL=http://31.70.115.79:3000'); [IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding($false)))" >nul 2>&1
  echo [INFO] Updated PUBLIC_BASE_URL to http://31.70.115.79:3000
)

set NEED_NPM_INSTALL=0
if not exist "node_modules\" set NEED_NPM_INSTALL=1
if not exist "node_modules\piratetok-live-js\package.json" set NEED_NPM_INSTALL=1
if not exist "node_modules\puppeteer-core\package.json" set NEED_NPM_INSTALL=1
if not exist "node_modules\tiktok-signature\package.json" set NEED_NPM_INSTALL=1
if not exist "node_modules\impit\package.json" set NEED_NPM_INSTALL=1

if "%NEED_NPM_INSTALL%"=="1" (
  echo [INFO] Installing/updating ORBIT dependencies...
  set PUPPETEER_SKIP_DOWNLOAD=true
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [WARN] npm install failed. Check the network connection and try again.
    pause
    exit /b 1
  )
)

echo [INFO] Starting ORBIT bot and dashboard...
echo.
call npm start

echo.
echo [INFO] ORBIT stopped.
pause
