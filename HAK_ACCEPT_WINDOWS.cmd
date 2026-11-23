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
 echo npm is not installed or is not on PATH.
 pause
 exit /b 1
)
echo Running HAK local acceptance checks...
node.exe scripts\accept-local.mjs
set "HAK_RESULT=%ERRORLEVEL%"
echo.
if "%HAK_RESULT%"=="0" (
 echo Local baseline checks passed. External agents are NOT verified.
) else (
 echo Local baseline checks failed. See sanitized summary above.
)
echo Do not post credentials or private event data to GitHub.
pause
exit /b %HAK_RESULT%
