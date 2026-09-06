import { app, BrowserWindow, ipcMain, screen, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';

// --- Serving the built app ---------------------------------------------------
// Outside of dev there is no Vite server, but the app still asks for things by
// absolute path (/tokens/goblin.jpg, /extras/manifest.json, ...), which plain
// file:// would resolve against the drive root and never find. So the built app
// is served by a small static server inside the main process instead.
//
// It deliberately listens on the same address Vite uses in dev. Chromium keys
// saved data to the address a page was served from, so anything else — file://,
// a custom app:// scheme — would strand every campaign and map already saved
// under this origin in a bucket the app can no longer see.
const APP_PORT = 5173;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;

// Campaigns, maps and settings live in a folder named after the app. The
// installed build would otherwise pick a different name than the one the repo
// launcher uses and open completely empty, so the name is pinned here and both
// share a single data folder. Must run before the app is ready.
app.setName('dungeon-master-desktop-vtt');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
};

/** Locate a requested URL path on disk, or null if nothing matches. */
function resolveRequest(urlPath: string): string | null {
  const segments = urlPath.split('/').filter(Boolean);
  const top = segments[0];

  // Extras are user-editable, so they're read from the writable library
  // folder first and only then from the copy that shipped with the app.
  // That way a freshly added avatar appears immediately rather than after the
  // next rebuild, and the shipped library still shows up on a machine where
  // nothing has been added yet.
  let roots: string[];
  let relativePath: string;
  if (top === 'extras') {
    relativePath = segments.slice(1).join(path.sep);
    const bundled = bundledLibraryDir(top);
    roots = bundled ? [libraryDir(top), bundled] : [libraryDir(top)];
  } else {
    relativePath = segments.length > 0 ? segments.join(path.sep) : 'index.html';
    roots = [path.resolve(__dirname, '..', 'dist')];
  }

  for (const root of roots) {
    const filePath = path.join(root, relativePath);
    // Never serve anything outside the intended root, whatever the page asks for.
    if (!filePath.startsWith(root)) continue;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  }
  return null;
}

/**
 * Static server for the built app. Bound to the loopback address only, so it is
 * reachable from this machine and nowhere else.
 */
function startStaticServer(): Promise<void> {
  const server = http.createServer((req, res) => {
    let filePath: string | null = null;
    try {
      filePath = resolveRequest(decodeURIComponent(new URL(req.url ?? '/', APP_ORIGIN).pathname));
    } catch {
      // Malformed URL — fall through to the 404 below.
    }

    if (!filePath) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const size = fs.statSync(filePath).size;
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';

    // Video seeking asks for byte ranges rather than the whole file.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : 0;
      const end = range[2] ? parseInt(range[2], 10) : size - 1;
      if (start >= size || end >= size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'content-type': type,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      // Something already owns the port — almost always a Vite dev server
      // serving this same app. Loading the page will reach it either way.
      if (err.code !== 'EADDRINUSE') throw err;
      resolve();
    });
    server.listen(APP_PORT, '127.0.0.1', resolve);
  });
}

let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let lastKnownState: any = null;
let savedMenu: Menu | null = null;

function createDmWindow() {
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Dungeon Master Desktop VTT',
    // Stay hidden until the page has painted so the user never sees a blank
    // white window while the app is still loading.
    show: false,
    backgroundColor: '#0c0a09', // matches --bg in src/index.css
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  dmWindow.once('ready-to-show', () => {
    dmWindow?.show();
  });

  // Same address in dev and in the built app — see the note on APP_PORT.
  dmWindow.loadURL(APP_ORIGIN);
  // In dev the Vite server may still be starting when Electron launches;
  // keep retrying until it responds (otherwise the hidden window would
  // never fire ready-to-show and the app would never appear).
  dmWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => dmWindow?.loadURL(APP_ORIGIN), 300);
  });

  dmWindow.on('enter-full-screen', () => {
    dmWindow?.webContents.send('fullscreen-status', true);
  });
  dmWindow.on('leave-full-screen', () => {
    // Restore the menu bar when exiting fullscreen by any means (Escape, F11, etc.)
    if (savedMenu) {
      Menu.setApplicationMenu(savedMenu);
    }
    dmWindow?.setAutoHideMenuBar(false);
    dmWindow?.setMenuBarVisibility(true);
    dmWindow?.webContents.send('fullscreen-status', false);
  });

  dmWindow.on('closed', () => {
    dmWindow = null;
    if (playerWindow) {
      playerWindow.close();
    }
  });
}

function createPlayerWindow() {
  if (playerWindow) {
    playerWindow.focus();
    return;
  }

  // Try to open on a secondary display, fall back to primary
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const externalDisplay = displays.find(d => d.id !== primaryDisplay.id);
  const targetDisplay = externalDisplay || primaryDisplay;

  // Use bounds instead of workArea to cover the entire screen including the taskbar.
  // We create it frameless at the exact x/y of the target display,
  // then set it to fullscreen after creation to prevent Windows from
  // forcefully moving it back to the primary display.
  playerWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,          // frameless for a clean player experience
    backgroundColor: '#0c0a09', // dark until content paints — never flash white
    title: 'VTT Player Map',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Make it truly fullscreen on the target display
  playerWindow.setFullScreen(true);
  playerWindow.setMenuBarVisibility(false);

  // We pass a hash to let the react router/app differentiate the view
  playerWindow.loadURL(`${APP_ORIGIN}/#player`);

  playerWindow.on('closed', () => {
    playerWindow = null;
    // Notify DM window that player screen was closed
    if (dmWindow) {
      dmWindow.webContents.send('player-screen-status', false);
    }
  });
}

app.whenReady().then(async () => {
  // In dev, Vite is already serving this address.
  if (process.env.NODE_ENV !== 'development') {
    await startStaticServer();
  }
  createDmWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDmWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- Fullscreen toggle for DM window ---
ipcMain.on('toggle-fullscreen', () => {
  if (!dmWindow) return;
  const isFs = dmWindow.isFullScreen();

  if (!isFs) {
    // Entering fullscreen — save the menu and remove it entirely
    savedMenu = Menu.getApplicationMenu();
    dmWindow.setMenuBarVisibility(false);
    dmWindow.setAutoHideMenuBar(true);
    Menu.setApplicationMenu(null);
    dmWindow.setFullScreen(true);
  } else {
    // Leaving fullscreen — restore the menu
    dmWindow.setFullScreen(false);
    if (savedMenu) {
      Menu.setApplicationMenu(savedMenu);
    }
    dmWindow.setAutoHideMenuBar(false);
    dmWindow.setMenuBarVisibility(true);
  }
});

// --- IPC Communication between Windows ---

ipcMain.on('launch-player-screen', () => {
  createPlayerWindow();
  // Notify DM window only after the player window has finished loading,
  // so that when the DM sends state back, the player's IPC listeners are ready.
  if (playerWindow) {
    playerWindow.webContents.once('did-finish-load', () => {
      if (dmWindow) {
        dmWindow.webContents.send('player-screen-status', true);
      }
    });
  }
});

ipcMain.on('close-player-screen', () => {
  if (playerWindow) {
    playerWindow.close();
    playerWindow = null;
  }
});

ipcMain.on('player-mode-update', (_event, mode: string) => {
  if (playerWindow) {
    playerWindow.webContents.send('player-mode-update', mode);
  }
});

// DM toggled "View as Player" — proxy to the Player window so the projected
// map shows just that one player's vision (or null to restore combined vision).
ipcMain.on('dm-view-as-player-update', (_event, playerId: string | null) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-view-as-player-update', playerId);
  }
});

  // When the DM updates the campaign state, proxy it to the Player window
ipcMain.on('dm-state-update', (_event, state) => {
  lastKnownState = state;
  if (playerWindow) {
    playerWindow.webContents.send('player-state-update', state);
  }
});

// Allow Player window to request the latest state on mount
ipcMain.on('request-state-update', () => {
  if (lastKnownState && playerWindow) {
    playerWindow.webContents.send('player-state-update', lastKnownState);
  }
});

// When the Player moves tokens, proxy it back to the DM window
ipcMain.on('player-token-update', (_event, tokens) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-token-update', tokens);
  }
});

// When the DM drags tokens, proxy them swiftly to the Player window
ipcMain.on('dm-token-update', (_event, tokens) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-token-update', tokens);
  }
});

// AoE spell sync between DM and Player
ipcMain.on('dm-aoe-update', (_event, aoe) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-aoe-update', aoe);
  }
});

ipcMain.on('player-aoe-update', (_event, aoe) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-aoe-update', aoe);
  }
});

// DM dismisses player AoE (after applying damage from spell modal)
ipcMain.on('dismiss-player-aoe', () => {
  if (playerWindow) {
    playerWindow.webContents.send('dismiss-player-aoe');
  }
});

// Player condition updates: proxy to DM window
ipcMain.on('player-condition-update', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-condition-update', data);
  }
});

// Player darkvision updates: proxy to DM window
ipcMain.on('player-darkvision-update', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-darkvision-update', data);
  }
});

// Player color updates: proxy to DM window
ipcMain.on('player-color-update', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-color-update', data);
  }
});

// Player requests end of their turn: proxy to DM window
ipcMain.on('player-end-turn', () => {
  if (dmWindow) {
    dmWindow.webContents.send('player-end-turn');
  }
});

// Player target updates: proxy to DM window
ipcMain.on('player-target-update', (_event, combatantIds) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-target-update', combatantIds);
  }
});

// Player portal toggle: proxy to DM window
ipcMain.on('player-portal-toggle', (_event, portalId) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-portal-toggle', portalId);
  }
});

// Player floor change: proxy to DM window (when a player uses a transition zone)
ipcMain.on('player-floor-change', (_event, floorId) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-floor-change', floorId);
  }
});

// Spell marker sync between DM and Player
ipcMain.on('dm-spell-marker-update', (_event, markers) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-spell-marker-update', markers);
  }
});

ipcMain.on('player-spell-marker-update', (_event, markers) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-spell-marker-update', markers);
  }
});

// Active emanation rings: proxy from player window to DM window
ipcMain.on('player-emanations-update', (_event, emanations) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-emanations-update', emanations);
  }
});

// Player Wild Shape updates: proxy to DM window
ipcMain.on('player-wild-shape', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-wild-shape', data);
  }
});


// Player Invisible toggle: proxy to DM window
ipcMain.on('player-invisible-toggle', (_event, tokenId) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-invisible-toggle', tokenId);
  }
});

ipcMain.on('player-summon-combatant', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-summon-combatant', data);
  }
});

// Player rotated the image-note overlay: proxy to DM window
ipcMain.on('player-image-rotation', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-image-rotation', data);
  }
});

// DM ping → Player
ipcMain.on('dm-ping', (_event, ping) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-ping', ping);
  }
});

// ── Drawings sync ──
// DM drawings → Player
ipcMain.on('dm-drawings-update', (_event, data) => {
  if (playerWindow) {
    playerWindow.webContents.send('dm-drawings-update', data);
  }
});
// Player drawings → DM
ipcMain.on('player-drawings-update', (_event, data) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-drawings-update', data);
  }
});
// Ephemeral strokes — broadcast to the *other* window only
ipcMain.on('ephemeral-stroke', (event, stroke) => {
  const sender = event.sender;
  if (dmWindow && dmWindow.webContents !== sender) {
    dmWindow.webContents.send('ephemeral-stroke', stroke);
  }
  if (playerWindow && playerWindow.webContents !== sender) {
    playerWindow.webContents.send('ephemeral-stroke', stroke);
  }
});

// ── Media library (Extras gallery) ──
// A global, file-based library: real files on disk next to a
// manifest.json. Where it lives depends on how the app is running.
//
//   From the repo (dev, or the .bat launcher) → <project>/public/<name>/
//     Authoring mode. New files land in the source folder so they can be
//     committed to git and ship inside the next build.
//   Installed                                 → <userData>/<name>/
//     An installed app's own folder is read-only, so additions go to the
//     Windows app-data folder and layer on top of the library that shipped.

type LibraryName = 'extras';

/** Writable location for a library — where new files and the manifest go. */
function libraryDir(name: LibraryName): string {
  return app.isPackaged
    ? path.join(app.getPath('userData'), name)
    : path.resolve(__dirname, '..', 'public', name);
}

/**
 * Read-only copy of a library shipped inside the installed app. Null when
 * running from the repo, where the writable folder is already the only copy.
 */
function bundledLibraryDir(name: LibraryName): string | null {
  return app.isPackaged ? path.join(__dirname, '..', 'dist', name) : null;
}

function libraryManifestPath(name: LibraryName): string {
  return path.join(libraryDir(name), 'manifest.json');
}

async function ensureLibraryDir(name: LibraryName): Promise<void> {
  const dir = libraryDir(name);
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

async function readLibraryManifest(name: LibraryName): Promise<any[]> {
  // The user's own manifest takes over once they've added or edited anything.
  // Until then, fall back to the manifest that shipped with the app.
  const candidates = [libraryManifestPath(name)];
  const bundled = bundledLibraryDir(name);
  if (bundled) candidates.push(path.join(bundled, 'manifest.json'));

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const parsed = JSON.parse(await fsp.readFile(p, 'utf-8'));
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

/** Wire up the load/save/write/delete IPC for one library. */
function registerLibraryIpc(
  name: LibraryName,
  channels: { load: string; saveManifest: string; writeFile: string; deleteFile: string },
) {
  ipcMain.handle(channels.load, async () => {
    try {
      await ensureLibraryDir(name);
      return { manifest: await readLibraryManifest(name) };
    } catch (err: any) {
      return { manifest: [], error: err?.message ?? 'load failed' };
    }
  });

  ipcMain.handle(channels.saveManifest, async (_event, manifest: any) => {
    try {
      if (!Array.isArray(manifest)) return { ok: false, error: 'manifest must be an array' };
      await ensureLibraryDir(name);
      const body = JSON.stringify(manifest, null, 2) + '\n';
      await fsp.writeFile(libraryManifestPath(name), body, 'utf-8');
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'save failed' };
    }
  });

  ipcMain.handle(channels.writeFile, async (_event, payload: { filename: string; dataUrl: string }) => {
    try {
      if (!payload?.filename || !payload?.dataUrl) {
        return { ok: false, error: 'filename and dataUrl are required' };
      }
      // Defend against path traversal — filename must be a plain basename.
      const safeName = path.basename(payload.filename);
      if (safeName !== payload.filename) {
        return { ok: false, error: 'invalid filename' };
      }
      const match = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return { ok: false, error: 'expected a base64 data URL' };
      const buf = Buffer.from(match[2], 'base64');
      await ensureLibraryDir(name);
      await fsp.writeFile(path.join(libraryDir(name), safeName), buf);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'save failed' };
    }
  });

  ipcMain.handle(channels.deleteFile, async (_event, filename: string) => {
    try {
      const safeName = path.basename(filename);
      if (safeName !== filename) return { ok: false, error: 'invalid filename' };
      const target = path.join(libraryDir(name), safeName);
      if (fs.existsSync(target)) {
        await fsp.unlink(target);
      }
      // A file that exists only in the shipped copy can't be removed from disk.
      // Dropping it from the manifest is enough to take it out of the app.
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'delete failed' };
    }
  });
}

registerLibraryIpc('extras', {
  load: 'extras-load-manifest',
  saveManifest: 'extras-save-manifest',
  writeFile: 'extras-save-image',
  deleteFile: 'extras-delete-image',
});

// D&D Beyond character import
ipcMain.handle('fetch-dndb-character', async (_event, url: string) => {
  try {
    // Extract character ID from URL
    // Supports: dndbeyond.com/characters/12345, dndbeyond.com/characters/12345/CHARNAME
    const match = url.match(/characters\/(\d+)/);
    if (!match) {
      return { error: 'Could not find a character ID in that URL. Expected format: https://www.dndbeyond.com/characters/12345678' };
    }
    const characterId = match[1];
    const apiUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return { error: 'This character is private. The player must set their character to "Public" on D&D Beyond (Edit Character → Settings → Character Privacy → Public).' };
      }
      return { error: `D&D Beyond returned an error (HTTP ${response.status}). The character may be private or the URL may be incorrect.` };
    }

    const json = await response.json();
    return { data: json };
  } catch (err: any) {
    return { error: `Network error: ${err.message}. Make sure you are connected to the internet.` };
  }
});
