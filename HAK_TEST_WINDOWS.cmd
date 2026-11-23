@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 is required.
 pause
 exit /b 1
)
echo Running isolated HAK Dashboard smoke test on loopback...
node.exe scripts\accept-windows-smoke.mjs
set "HAK_RESULT=%ERRORLEVEL%"
echo.
echo This is a local smoke test, not production approval.
pause
exit /b %HAK_RESULT%
