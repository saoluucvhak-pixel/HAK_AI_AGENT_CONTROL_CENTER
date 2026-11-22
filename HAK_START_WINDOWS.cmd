@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
 echo Node.js is not installed or is not on PATH.
 echo Install Node.js 22 or newer, then double-click this file again.
 pause
 exit /b 1
)
node.exe scripts\launch.mjs
if errorlevel 1 pause
