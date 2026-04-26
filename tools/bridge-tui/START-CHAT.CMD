@echo off
setlocal
title ShadowChat Bridge Chat
cd /d "%~dp0"
echo ShadowChat Bridge Chat
echo.
echo Auto-detecting the ESP bridge serial port...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-tui.ps1"
echo.
pause
