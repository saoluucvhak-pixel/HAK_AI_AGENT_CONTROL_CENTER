@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required.
 pause
 exit /b 1
)
node.exe scripts\agent-readiness-windows.mjs
set "RESULT=%ERRORLEVEL%"
echo.
echo Readiness probe completed. No AI agents were started.
pause
exit /b %RESULT%
