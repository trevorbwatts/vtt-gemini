import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  launchPlayerScreen: () => ipcRenderer.send('launch-player-screen'),
  closePlayerScreen: () => ipcRenderer.send('close-player-screen'),
  sendStateUpdate: (state: any) => ipcRenderer.send('dm-state-update', state),
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
});
