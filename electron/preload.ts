import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  onFullscreenStatus: (callback: (isFs: boolean) => void) => {
    ipcRenderer.on('fullscreen-status', (_event, isFs) => callback(isFs));
  },
  removeFullscreenStatusListener: () => {
    ipcRenderer.removeAllListeners('fullscreen-status');
  },
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
  sendDismissPlayerAoe: () => ipcRenderer.send('dismiss-player-aoe'),
  onDismissPlayerAoe: (callback: () => void) => {
    ipcRenderer.on('dismiss-player-aoe', () => callback());
  },
  removeDismissPlayerAoeListener: () => {
    ipcRenderer.removeAllListeners('dismiss-player-aoe');
  },
  sendPlayerConditionUpdate: (tokenId: string, conditions: string[]) =>
    ipcRenderer.send('player-condition-update', { tokenId, conditions }),
  onPlayerConditionUpdate: (callback: (data: { tokenId: string; conditions: string[] }) => void) => {
    ipcRenderer.on('player-condition-update', (_event, data) => callback(data));
  },
  removePlayerConditionUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-condition-update');
  },
  sendPlayerEndTurn: () => ipcRenderer.send('player-end-turn'),
  onPlayerEndTurn: (callback: () => void) => {
    ipcRenderer.on('player-end-turn', () => callback());
  },
  removePlayerEndTurnListener: () => {
    ipcRenderer.removeAllListeners('player-end-turn');
  },
  sendPlayerColorUpdate: (playerId: string, color: string) =>
    ipcRenderer.send('player-color-update', { playerId, color }),
  onPlayerColorUpdate: (callback: (data: { playerId: string; color: string }) => void) => {
    ipcRenderer.on('player-color-update', (_event, data) => callback(data));
  },
  removePlayerColorUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-color-update');
  },
  sendPlayerTargetUpdate: (combatantIds: string[]) =>
    ipcRenderer.send('player-target-update', combatantIds),
  onPlayerTargetUpdate: (callback: (combatantIds: string[]) => void) => {
    ipcRenderer.on('player-target-update', (_event, ids) => callback(ids));
  },
  removePlayerTargetUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-target-update');
  },
  sendPlayerPortalToggle: (portalId: string) =>
    ipcRenderer.send('player-portal-toggle', portalId),
  onPlayerPortalToggle: (callback: (portalId: string) => void) => {
    ipcRenderer.on('player-portal-toggle', (_event, portalId) => callback(portalId));
  },
  removePlayerPortalToggleListener: () => {
    ipcRenderer.removeAllListeners('player-portal-toggle');
  },
  sendPlayerDarkvisionUpdate: (playerId: string, darkvision: number) =>
    ipcRenderer.send('player-darkvision-update', { playerId, darkvision }),
  onPlayerDarkvisionUpdate: (callback: (data: { playerId: string; darkvision: number }) => void) => {
    ipcRenderer.on('player-darkvision-update', (_event, data) => callback(data));
  },
  removePlayerDarkvisionUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-darkvision-update');
  },
  sendDMSpellMarkerUpdate: (markers: any) => ipcRenderer.send('dm-spell-marker-update', markers),
  onDMSpellMarkerUpdate: (callback: (markers: any) => void) => {
    ipcRenderer.on('dm-spell-marker-update', (_event, markers) => callback(markers));
  },
  removeDMSpellMarkerUpdateListener: () => {
    ipcRenderer.removeAllListeners('dm-spell-marker-update');
  },
  sendPlayerSpellMarkerUpdate: (markers: any) => ipcRenderer.send('player-spell-marker-update', markers),
  onPlayerSpellMarkerUpdate: (callback: (markers: any) => void) => {
    ipcRenderer.on('player-spell-marker-update', (_event, markers) => callback(markers));
  },
  removePlayerSpellMarkerUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-spell-marker-update');
  },
  sendPlayerWildShape: (data: any) => ipcRenderer.send('player-wild-shape', data),
  onPlayerWildShape: (callback: (data: any) => void) => {
    ipcRenderer.on('player-wild-shape', (_event, data) => callback(data));
  },
  removePlayerWildShapeListener: () => {
    ipcRenderer.removeAllListeners('player-wild-shape');
  },
  sendPlayerInvisibleToggle: (tokenId: string) => ipcRenderer.send('player-invisible-toggle', tokenId),
  onPlayerInvisibleToggle: (callback: (tokenId: string) => void) => {
    ipcRenderer.on('player-invisible-toggle', (_event, tokenId) => callback(tokenId));
  },
  removePlayerInvisibleToggleListener: () => {
    ipcRenderer.removeAllListeners('player-invisible-toggle');
  },
  sendPlayerSummonCombatant: (combatant: any, tokenId: string) =>
    ipcRenderer.send('player-summon-combatant', { combatant, tokenId }),
  onPlayerSummonCombatant: (callback: (data: { combatant: any; tokenId: string }) => void) => {
    ipcRenderer.on('player-summon-combatant', (_event, data) => callback(data));
  },
  removePlayerSummonCombatantListener: () => {
    ipcRenderer.removeAllListeners('player-summon-combatant');
  },
  sendPlayerImageRotation: (data: { noteId: string; rotation: number }) =>
    ipcRenderer.send('player-image-rotation', data),
  onPlayerImageRotation: (callback: (data: { noteId: string; rotation: number }) => void) => {
    ipcRenderer.on('player-image-rotation', (_event, data) => callback(data));
  },
  removePlayerImageRotationListener: () => {
    ipcRenderer.removeAllListeners('player-image-rotation');
  },

  // ── Drawings ──
  sendDMDrawingsUpdate: (data: { floorId: string; drawings: any[] }) =>
    ipcRenderer.send('dm-drawings-update', data),
  onDMDrawingsUpdate: (callback: (data: { floorId: string; drawings: any[] }) => void) => {
    ipcRenderer.on('dm-drawings-update', (_event, data) => callback(data));
  },
  removeDMDrawingsUpdateListener: () => {
    ipcRenderer.removeAllListeners('dm-drawings-update');
  },
  sendPlayerDrawingsUpdate: (data: { floorId: string; drawings: any[] }) =>
    ipcRenderer.send('player-drawings-update', data),
  onPlayerDrawingsUpdate: (callback: (data: { floorId: string; drawings: any[] }) => void) => {
    ipcRenderer.on('player-drawings-update', (_event, data) => callback(data));
  },
  removePlayerDrawingsUpdateListener: () => {
    ipcRenderer.removeAllListeners('player-drawings-update');
  },
  sendEphemeralStroke: (stroke: any) => ipcRenderer.send('ephemeral-stroke', stroke),
  onEphemeralStroke: (callback: (stroke: any) => void) => {
    ipcRenderer.on('ephemeral-stroke', (_event, stroke) => callback(stroke));
  },
  removeEphemeralStrokeListener: () => {
    ipcRenderer.removeAllListeners('ephemeral-stroke');
  },
});
