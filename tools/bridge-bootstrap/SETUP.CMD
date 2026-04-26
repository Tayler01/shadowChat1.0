@echo off
setlocal
title ShadowChat Bridge Bootstrap
cd /d "%~dp0"
echo ShadowChat Bridge bootstrap
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Receive-ShadowChatBridge.ps1" -Output "%USERPROFILE%\Desktop"
echo.
pause
