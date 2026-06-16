<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Dungeon Master Desktop VTT

A desktop Virtual Tabletop for running D&D games, built with Electron + React.

## Run Locally (for development)

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Run the app: `npm start`

## Build the Windows installer

To produce a standalone, double-click installer (`.exe`) that runs on any Windows
machine with no Node.js or terminal required:

1. `npm install` (once)
2. `npm run build`

The installer is written to the `release/` folder, e.g.
`release/Dungeon Master VTT Setup 1.0.0.exe`. Upload that file to a
[GitHub Release](../../releases) and anyone can download and double-click it to install.

> Note: the installer is unsigned, so the first launch shows a Windows SmartScreen
> warning ("Windows protected your PC"). Click **More info → Run anyway** to proceed.
