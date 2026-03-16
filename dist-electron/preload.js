"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    launchPlayerScreen: () => electron_1.ipcRenderer.send('launch-player-screen'),
    sendStateUpdate: (state) => electron_1.ipcRenderer.send('dm-state-update', state),
    onStateUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-state-update', (_event, value) => callback(value));
    },
    // We need to clean up listeners to avoid memory leaks
    removeStateUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-state-update');
    }
});
