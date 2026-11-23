@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required.
 pause
 exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
 echo npm is required.
 pause
 exit /b 1
)
echo Creating a local acceptance evidence packet...
node.exe scripts\export-acceptance.mjs
set "HAK_RESULT=%ERRORLEVEL%"
echo.
echo Review the local packet before sharing. Do not share credentials or private traces.
pause
exit /b %HAK_RESULT%
