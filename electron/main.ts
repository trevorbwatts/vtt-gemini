import { app, BrowserWindow, ipcMain } from 'electron';
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

  playerWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'VTT Player Map',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Remove the standard UI frame for the player screen
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
});

// When the DM updates the campaign state, proxy it to the Player window
ipcMain.on('dm-state-update', (_event, state) => {
  if (playerWindow) {
    playerWindow.webContents.send('player-state-update', state);
  }
});
