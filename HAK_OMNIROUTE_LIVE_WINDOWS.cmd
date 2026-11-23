@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required.
 pause
 exit /b 1
)
echo HAK OmniRoute live verification
echo This test may incur API costs ONLY when HAK_OMNIROUTE_LIVE_TEST=true.
echo Credentials must be configured privately outside this launcher.
node.exe scripts\omniroute-live-windows.mjs
set "RESULT=%ERRORLEVEL%"
echo.
echo Result saved to HAK_OMNIROUTE_LIVE_RESULT.txt when writable.
pause
exit /b %RESULT%
