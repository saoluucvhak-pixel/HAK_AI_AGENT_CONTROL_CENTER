@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo FAIL: Install Node.js 22 or newer.
 pause
 exit /b 1
)
echo HAK automatic acceptance: isolated tests, no live data or credentials.
node.exe scripts\auto-accept-windows.mjs
set "HAK_RESULT=%ERRORLEVEL%"
echo.
if "%HAK_RESULT%"=="0" (
 echo PASS: Local isolated acceptance checks completed.
) else (
 echo FAIL: Review the checks above.
)
echo External AI agents and production readiness are NOT certified.
pause
exit /b %HAK_RESULT%
