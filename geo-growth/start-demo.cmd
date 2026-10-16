@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or later, then run this file again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser. Ctrl+C stops the demo.
node --env-file-if-exists=.env server.mjs
pause
