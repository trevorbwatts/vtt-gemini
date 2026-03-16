import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  launchPlayerScreen: () => ipcRenderer.send('launch-player-screen'),
  sendStateUpdate: (state: any) => ipcRenderer.send('dm-state-update', state),
  onStateUpdate: (callback: (value: any) => void) => {
    ipcRenderer.on('player-state-update', (_event, value) => callback(value));
  },
  // We need to clean up listeners to avoid memory leaks
  removeStateUpdateListener: () => {
      ipcRenderer.removeAllListeners('player-state-update');
  },
  importDndBeyondCharacter: (url: string) => ipcRenderer.invoke('fetch-dndb-character', url),
});
