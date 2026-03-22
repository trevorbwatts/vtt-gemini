import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  launchPlayerScreen: () => ipcRenderer.send('launch-player-screen'),
  closePlayerScreen: () => ipcRenderer.send('close-player-screen'),
  sendStateUpdate: (state: any) => ipcRenderer.send('dm-state-update', state),
  requestStateUpdate: () => ipcRenderer.send('request-state-update'),
  sendPlayerTokenUpdate: (tokens: any) => ipcRenderer.send('player-token-update', tokens),
  onPlayerTokenUpdate: (callback: (tokens: any) => void) => {
    ipcRenderer.on('player-token-update', (_event, tokens) => callback(tokens));
  },
  removePlayerTokenUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-token-update');
  },
  sendDMTokenUpdate: (tokens: any) => ipcRenderer.send('dm-token-update', tokens),
  onDMTokenUpdate: (callback: (tokens: any) => void) => {
    ipcRenderer.on('dm-token-update', (_event, tokens) => callback(tokens));
  },
  removeDMTokenUpdateListener: () => {
    ipcRenderer.removeAllListeners('dm-token-update');
  },
  sendPlayerMode: (mode: string) => ipcRenderer.send('player-mode-update', mode),
  onStateUpdate: (callback: (value: any) => void) => {
    ipcRenderer.on('player-state-update', (_event, value) => callback(value));
  },
  onPlayerModeUpdate: (callback: (mode: string) => void) => {
    ipcRenderer.on('player-mode-update', (_event, mode) => callback(mode));
  },
  onPlayerScreenStatus: (callback: (isOpen: boolean) => void) => {
    ipcRenderer.on('player-screen-status', (_event, isOpen) => callback(isOpen));
  },
  // We need to clean up listeners to avoid memory leaks
  removeStateUpdateListener: () => {
      ipcRenderer.removeAllListeners('player-state-update');
  },
  removePlayerModeListener: () => {
      ipcRenderer.removeAllListeners('player-mode-update');
  },
  removePlayerScreenStatusListener: () => {
      ipcRenderer.removeAllListeners('player-screen-status');
  },
  importDndBeyondCharacter: (url: string) => ipcRenderer.invoke('fetch-dndb-character', url),
  sendDMAoeUpdate: (aoe: any) => ipcRenderer.send('dm-aoe-update', aoe),
  onDMAoeUpdate: (callback: (aoe: any) => void) => {
    ipcRenderer.on('dm-aoe-update', (_event, aoe) => callback(aoe));
  },
  sendPlayerAoeUpdate: (aoe: any) => ipcRenderer.send('player-aoe-update', aoe),
  onPlayerAoeUpdate: (callback: (aoe: any) => void) => {
    ipcRenderer.on('player-aoe-update', (_event, aoe) => callback(aoe));
  },
});
