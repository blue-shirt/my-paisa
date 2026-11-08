@echo off
cd /d "%~dp0"

if not exist "server.js" (
  echo.
  echo ERROR: server.js was not found next to this file.
  echo.
  echo Make sure you extracted the whole zip, then run start-windows.bat from
  echo inside the my-paisa folder. The folder must contain server.js, package.json
  echo and a folder named public.
  echo.
  pause
  exit /b 1
)

node -v >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org, install it, then run this file again.
  pause
  exit /b 1
)

echo Starting My Paisa...
echo Open http://127.0.0.1:3000 in your browser.
echo.
node server.js
pause
