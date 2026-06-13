@echo off
title Dungeon Master VTT
cd /d "%~dp0"

REM --- Make sure Node.js / npm is available ---
where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js does not appear to be installed.
    echo Please install it from https://nodejs.org and then run this again.
    echo.
    pause
    exit /b 1
)

REM --- First-time setup: install dependencies if they're missing ---
if not exist "node_modules\" (
    echo First-time setup: installing dependencies...
    echo This may take a minute and only happens once.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo Dependency installation failed. See the messages above.
        pause
        exit /b 1
    )
)

REM --- Launch the app (Vite dev server + Electron) ---
echo.
echo Launching Dungeon Master VTT...
echo Keep this window open while you play. Closing it will quit the app.
echo.
call npm start

REM --- Keep the window open if something went wrong so you can read it ---
echo.
echo The app has closed.
pause
