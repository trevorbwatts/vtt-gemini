<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Dungeon Master Desktop VTT

A desktop Virtual Tabletop for running D&D games, built with Electron + React.

## Run Locally (for development)

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Run the app: `npm start`

## Run without a terminal

Double-click **Run Dungeon Master VTT.bat**. It launches the built app and closes
its own window immediately. If anything in `src/` or `electron/` changed since the
last launch it rebuilds first (a few seconds), otherwise it opens straight away.

## Build the Windows installer

To produce a standalone, double-click installer (`.exe`) that runs on any Windows
machine with no Node.js or terminal required:

1. `npm install` (once)
2. `npm run build`

The installer is written to a `vtt-builds/` folder **next to** this repo, e.g.
`../vtt-builds/Dungeon Master VTT Setup 1.0.0.exe` — kept outside the project so
the ~190 MB output never lands in git. Upload that file to a
[GitHub Release](../../releases) and share the link; anyone can download and
double-click it to install.

> **Note:** the installer is unsigned, so the first launch shows a Windows SmartScreen
> warning ("Windows protected your PC"). Click **More info → Run anyway** to proceed.
> Worth saying this on the release page so people aren't alarmed.

### If the build fails on "Cannot create symbolic link"

electron-builder downloads a signing toolkit containing macOS symlinks, and Windows
refuses to create those without elevated rights. It's only needed for macOS builds,
so extract it without them (one time per machine):

```bash
node_modules/7zip-bin/win/x64/7za.exe x "$LOCALAPPDATA/electron-builder/Cache/winCodeSign/<any-cached>.7z" -o"$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0" -x!darwin -y
```

Turning on Windows Developer Mode fixes it permanently instead.

## Where your data lives

Campaigns, maps and fog are stored in `%APPDATA%\dungeon-master-desktop-vtt`. The
launcher and the installed app deliberately share that folder, so your games follow
you between them.

Two details keep it that way, and both are load-bearing — changing either one hides
every existing campaign and map behind a bucket the app can't read:

- `app.setName()` in `electron/main.ts` pins the folder name, which would otherwise
  differ between the repo build and the installed build.
- The built app serves itself from `http://localhost:5173` (loopback only, same
  address Vite uses in dev) rather than from `file://` or a custom scheme. Chromium
  keys saved data to the address a page was served from.

Added avatars and sounds behave differently depending on how you're running:

- **From this repo** they're written into `public/extras/` and `public/sounds/`, so
  they can be committed to git and ship inside the next build for everyone.
- **From the installed app** they go to `%APPDATA%\dungeon-master-desktop-vtt\`
  and layer on top of the library that shipped — which is what lets the app add
  files at all once installed, since its own folder is read-only.
