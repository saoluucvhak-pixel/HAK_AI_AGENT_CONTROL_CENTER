@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required.
 pause
 exit /b 1
)
node.exe scripts\accept-live-ai-windows.mjs
set "HAK_RESULT=%ERRORLEVEL%"
pause
exit /b %HAK_RESULT%
