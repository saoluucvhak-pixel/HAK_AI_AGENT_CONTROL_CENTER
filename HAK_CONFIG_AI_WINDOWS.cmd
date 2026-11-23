@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-ai-windows.ps1"
if errorlevel 1 (echo AI configuration failed.)
pause
