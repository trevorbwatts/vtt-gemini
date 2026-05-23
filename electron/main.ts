import { app, BrowserWindow, ipcMain, screen, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let lastKnownState: any = null;
let savedMenu: Menu | null = null;

function createDmWindow() {
  dmWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Dungeon Master Desktop VTT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    dmWindow.loadURL('http://localhost:5173');
  } else {
    dmWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    // We pass a hash to let the react router/app differentiate the view
    playerWindow.loadURL('http://localhost:5173/#player');
  } else {
    playerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'player' });
  }

  playerWindow.on('closed', () => {
    playerWindow = null;
    // Notify DM window that player screen was closed
    if (dmWindow) {
      dmWindow.webContents.send('player-screen-status', false);
    }
  });
}

app.whenReady().then(() => {
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

// When the Player moves tokens, proxy it back to the DM window
ipcMain.on('player-token-update', (_event, tokens) => {
  if (dmWindow) {
    dmWindow.webContents.send('player-token-update', tokens);
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

// ── Extras gallery (global, file-based) ──
// Reusable background-character avatars committed to git as actual files
// in <project>/public/extras/ alongside a manifest.json.
//
// In dev (__dirname = dist-electron/), the source folder lives one level up.
// In packaged mode writes will likely fail (asar is read-only) — the user
// builds up their library in dev, then commits the new files.
function extrasDir(): string {
  return path.resolve(__dirname, '..', 'public', 'extras');
}
function extrasManifestPath(): string {
  return path.join(extrasDir(), 'manifest.json');
}
async function ensureExtrasDir(): Promise<void> {
  const dir = extrasDir();
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

ipcMain.handle('extras-load-manifest', async () => {
  try {
    await ensureExtrasDir();
    const p = extrasManifestPath();
    if (!fs.existsSync(p)) return { manifest: [] };
    const txt = await fsp.readFile(p, 'utf-8');
    const parsed = JSON.parse(txt);
    return { manifest: Array.isArray(parsed) ? parsed : [] };
  } catch (err: any) {
    return { manifest: [], error: err?.message ?? 'load failed' };
  }
});

ipcMain.handle('extras-save-manifest', async (_event, manifest: any) => {
  try {
    if (!Array.isArray(manifest)) return { ok: false, error: 'manifest must be an array' };
    await ensureExtrasDir();
    const p = extrasManifestPath();
    await fsp.writeFile(p, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'save failed' };
  }
});

ipcMain.handle('extras-save-image', async (_event, payload: { filename: string; dataUrl: string }) => {
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
    await ensureExtrasDir();
    const outPath = path.join(extrasDir(), safeName);
    await fsp.writeFile(outPath, buf);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'save failed' };
  }
});

ipcMain.handle('extras-delete-image', async (_event, filename: string) => {
  try {
    const safeName = path.basename(filename);
    if (safeName !== filename) return { ok: false, error: 'invalid filename' };
    const target = path.join(extrasDir(), safeName);
    if (fs.existsSync(target)) {
      await fsp.unlink(target);
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'delete failed' };
  }
});

// ── Sound library (global, file-based) ──
// Reusable audio files for the Sound Mixer feature. Same on-disk pattern as
// Extras: actual files in <project>/public/sounds/ + manifest.json, intended
// to be committed to git so they ship with the app.
function soundsDir(): string {
  return path.resolve(__dirname, '..', 'public', 'sounds');
}
function soundsManifestPath(): string {
  return path.join(soundsDir(), 'manifest.json');
}
async function ensureSoundsDir(): Promise<void> {
  const dir = soundsDir();
  if (!fs.existsSync(dir)) {
    await fsp.mkdir(dir, { recursive: true });
  }
}

ipcMain.handle('sounds-load-manifest', async () => {
  try {
    await ensureSoundsDir();
    const p = soundsManifestPath();
    if (!fs.existsSync(p)) return { manifest: [] };
    const txt = await fsp.readFile(p, 'utf-8');
    const parsed = JSON.parse(txt);
    return { manifest: Array.isArray(parsed) ? parsed : [] };
  } catch (err: any) {
    return { manifest: [], error: err?.message ?? 'load failed' };
  }
});

ipcMain.handle('sounds-save-manifest', async (_event, manifest: any) => {
  try {
    if (!Array.isArray(manifest)) return { ok: false, error: 'manifest must be an array' };
    await ensureSoundsDir();
    const p = soundsManifestPath();
    await fsp.writeFile(p, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'save failed' };
  }
});

ipcMain.handle('sounds-save-audio', async (_event, payload: { filename: string; dataUrl: string }) => {
  try {
    if (!payload?.filename || !payload?.dataUrl) {
      return { ok: false, error: 'filename and dataUrl are required' };
    }
    const safeName = path.basename(payload.filename);
    if (safeName !== payload.filename) {
      return { ok: false, error: 'invalid filename' };
    }
    const match = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return { ok: false, error: 'expected a base64 data URL' };
    const buf = Buffer.from(match[2], 'base64');
    await ensureSoundsDir();
    const outPath = path.join(soundsDir(), safeName);
    await fsp.writeFile(outPath, buf);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'save failed' };
  }
});

ipcMain.handle('sounds-delete-audio', async (_event, filename: string) => {
  try {
    const safeName = path.basename(filename);
    if (safeName !== filename) return { ok: false, error: 'invalid filename' };
    const target = path.join(soundsDir(), safeName);
    if (fs.existsSync(target)) {
      await fsp.unlink(target);
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'delete failed' };
  }
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
