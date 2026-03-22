"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    launchPlayerScreen: () => electron_1.ipcRenderer.send('launch-player-screen'),
    closePlayerScreen: () => electron_1.ipcRenderer.send('close-player-screen'),
    sendStateUpdate: (state) => electron_1.ipcRenderer.send('dm-state-update', state),
    requestStateUpdate: () => electron_1.ipcRenderer.send('request-state-update'),
    sendPlayerTokenUpdate: (tokens) => electron_1.ipcRenderer.send('player-token-update', tokens),
    onPlayerTokenUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-token-update', (_event, tokens) => callback(tokens));
    },
    removePlayerTokenUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-token-update');
    },
    sendDMTokenUpdate: (tokens) => electron_1.ipcRenderer.send('dm-token-update', tokens),
    onDMTokenUpdate: (callback) => {
        electron_1.ipcRenderer.on('dm-token-update', (_event, tokens) => callback(tokens));
    },
    removeDMTokenUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-token-update');
    },
    sendPlayerMode: (mode) => electron_1.ipcRenderer.send('player-mode-update', mode),
    onStateUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-state-update', (_event, value) => callback(value));
    },
    onPlayerModeUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-mode-update', (_event, mode) => callback(mode));
    },
    onPlayerScreenStatus: (callback) => {
        electron_1.ipcRenderer.on('player-screen-status', (_event, isOpen) => callback(isOpen));
    },
    // We need to clean up listeners to avoid memory leaks
    removeStateUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-state-update');
    },
    removePlayerModeListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-mode-update');
    },
    removePlayerScreenStatusListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-screen-status');
    },
    importDndBeyondCharacter: (url) => electron_1.ipcRenderer.invoke('fetch-dndb-character', url),
    sendDMAoeUpdate: (aoe) => electron_1.ipcRenderer.send('dm-aoe-update', aoe),
    onDMAoeUpdate: (callback) => {
        electron_1.ipcRenderer.on('dm-aoe-update', (_event, aoe) => callback(aoe));
    },
    sendPlayerAoeUpdate: (aoe) => electron_1.ipcRenderer.send('player-aoe-update', aoe),
    onPlayerAoeUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-aoe-update', (_event, aoe) => callback(aoe));
    },
});
