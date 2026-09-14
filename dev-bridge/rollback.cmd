@echo off
setlocal
cd /d "%~dp0"
title Raku Dev Bridge - Rollback

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1"

echo.
pause
