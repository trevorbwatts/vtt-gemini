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

REM --- Rebuild only when the app has changed since the last launch ---
set "NEEDS_BUILD="
node "scripts\check-build-fresh.mjs"
if errorlevel 1 set "NEEDS_BUILD=1"

if defined NEEDS_BUILD (
    echo Updating the app after recent changes...
    echo This only happens the first time you run a new version.
    echo.
    call npm run build:app
    if errorlevel 1 (
        echo.
        echo The update failed. See the messages above.
        pause
        exit /b 1
    )
)

REM --- Launch the built app and let this window close on its own ---
REM  "start" hands the app off to Windows as its own process, so this script
REM  finishes immediately instead of babysitting a dev server all session.
set "NODE_ENV=production"
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
