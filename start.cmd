@echo off
setlocal
cd /d "%~dp0"
title RAKU Discord Bot

echo =========================================
echo  RAKU DISCORD BOT
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
  echo [INFO] Fill in the Discord credentials in C:\Discord-Bot\.env, then start again.
  notepad ".env"
  pause
  exit /b 0
)

if not exist "node_modules\" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [WARN] npm install failed. Check the network connection and try again.
    pause
    exit /b 1
  )
)

echo [INFO] Starting bot and dashboard...
echo.
call npm start

echo.
echo [INFO] Process stopped.
pause
