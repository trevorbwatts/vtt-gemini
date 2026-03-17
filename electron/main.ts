import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;

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
    dmWindow.webContents.openDevTools();
  } else {
    dmWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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

// --- IPC Communication between Windows ---

ipcMain.on('launch-player-screen', () => {
  createPlayerWindow();
  // Notify DM window that the player screen is now open
  if (dmWindow) {
    dmWindow.webContents.send('player-screen-status', true);
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
  if (playerWindow) {
    playerWindow.webContents.send('player-state-update', state);
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
