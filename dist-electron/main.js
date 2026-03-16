"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let dmWindow = null;
let playerWindow = null;
function createDmWindow() {
    dmWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Dungeon Master Desktop VTT',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        dmWindow.loadURL('http://localhost:5173');
        dmWindow.webContents.openDevTools();
    }
    else {
        dmWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
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
    playerWindow = new electron_1.BrowserWindow({
        width: 1920,
        height: 1080,
        title: 'VTT Player Map',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
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
    }
    else {
        playerWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'), { hash: 'player' });
    }
    playerWindow.on('closed', () => {
        playerWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    createDmWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createDmWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// --- IPC Communication between Windows ---
electron_1.ipcMain.on('launch-player-screen', () => {
    createPlayerWindow();
});
// When the DM updates the campaign state, proxy it to the Player window
electron_1.ipcMain.on('dm-state-update', (_event, state) => {
    if (playerWindow) {
        playerWindow.webContents.send('player-state-update', state);
    }
});
