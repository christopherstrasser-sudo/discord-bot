@echo off
setlocal
cd /d "%~dp0"
title Raku Dev Bridge - Discord Bot

where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge.ps1"

if errorlevel 1 (
  echo.
  echo [ERROR] Dev Bridge stopped with an error.
  pause
)
