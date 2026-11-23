@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required.
 pause
 exit /b 1
)
echo Testing Observer backup, checksum and restore with synthetic data only...
node.exe scripts\accept-observer-backup.mjs
set "HAK_RESULT=%ERRORLEVEL%"
echo.
echo This test does not read or modify live Observer data.
echo Production acceptance still requires operator review.
pause
exit /b %HAK_RESULT%
