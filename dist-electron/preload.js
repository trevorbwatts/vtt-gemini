"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    toggleFullscreen: () => electron_1.ipcRenderer.send('toggle-fullscreen'),
    onFullscreenStatus: (callback) => {
        electron_1.ipcRenderer.on('fullscreen-status', (_event, isFs) => callback(isFs));
    },
    removeFullscreenStatusListener: () => {
        electron_1.ipcRenderer.removeAllListeners('fullscreen-status');
    },
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
    sendDMViewAsPlayer: (playerId) => electron_1.ipcRenderer.send('dm-view-as-player-update', playerId),
    onDMViewAsPlayer: (callback) => {
        electron_1.ipcRenderer.on('dm-view-as-player-update', (_event, playerId) => callback(playerId));
    },
    removeDMViewAsPlayerListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-view-as-player-update');
    },
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
    removeDMAoeUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-aoe-update');
    },
    sendPlayerAoeUpdate: (aoe) => electron_1.ipcRenderer.send('player-aoe-update', aoe),
    onPlayerAoeUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-aoe-update', (_event, aoe) => callback(aoe));
    },
    removePlayerAoeUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-aoe-update');
    },
    sendDismissPlayerAoe: () => electron_1.ipcRenderer.send('dismiss-player-aoe'),
    onDismissPlayerAoe: (callback) => {
        electron_1.ipcRenderer.on('dismiss-player-aoe', () => callback());
    },
    removeDismissPlayerAoeListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dismiss-player-aoe');
    },
    sendPlayerConditionUpdate: (tokenId, conditions) => electron_1.ipcRenderer.send('player-condition-update', { tokenId, conditions }),
    onPlayerConditionUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-condition-update', (_event, data) => callback(data));
    },
    removePlayerConditionUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-condition-update');
    },
    sendPlayerEndTurn: () => electron_1.ipcRenderer.send('player-end-turn'),
    onPlayerEndTurn: (callback) => {
        electron_1.ipcRenderer.on('player-end-turn', () => callback());
    },
    removePlayerEndTurnListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-end-turn');
    },
    sendPlayerColorUpdate: (playerId, color) => electron_1.ipcRenderer.send('player-color-update', { playerId, color }),
    onPlayerColorUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-color-update', (_event, data) => callback(data));
    },
    removePlayerColorUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-color-update');
    },
    sendPlayerTargetUpdate: (combatantIds) => electron_1.ipcRenderer.send('player-target-update', combatantIds),
    onPlayerTargetUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-target-update', (_event, ids) => callback(ids));
    },
    removePlayerTargetUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-target-update');
    },
    sendPlayerPortalToggle: (portalId) => electron_1.ipcRenderer.send('player-portal-toggle', portalId),
    onPlayerPortalToggle: (callback) => {
        electron_1.ipcRenderer.on('player-portal-toggle', (_event, portalId) => callback(portalId));
    },
    removePlayerPortalToggleListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-portal-toggle');
    },
    sendPlayerFloorChange: (floorId) => electron_1.ipcRenderer.send('player-floor-change', floorId),
    onPlayerFloorChange: (callback) => {
        electron_1.ipcRenderer.on('player-floor-change', (_event, floorId) => callback(floorId));
    },
    removePlayerFloorChangeListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-floor-change');
    },
    sendPlayerDarkvisionUpdate: (playerId, darkvision) => electron_1.ipcRenderer.send('player-darkvision-update', { playerId, darkvision }),
    onPlayerDarkvisionUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-darkvision-update', (_event, data) => callback(data));
    },
    removePlayerDarkvisionUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-darkvision-update');
    },
    sendDMSpellMarkerUpdate: (markers) => electron_1.ipcRenderer.send('dm-spell-marker-update', markers),
    onDMSpellMarkerUpdate: (callback) => {
        electron_1.ipcRenderer.on('dm-spell-marker-update', (_event, markers) => callback(markers));
    },
    removeDMSpellMarkerUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-spell-marker-update');
    },
    sendPlayerSpellMarkerUpdate: (markers) => electron_1.ipcRenderer.send('player-spell-marker-update', markers),
    onPlayerSpellMarkerUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-spell-marker-update', (_event, markers) => callback(markers));
    },
    removePlayerSpellMarkerUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-spell-marker-update');
    },
    sendPlayerEmanationsUpdate: (emanations) => electron_1.ipcRenderer.send('player-emanations-update', emanations),
    onPlayerEmanationsUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-emanations-update', (_event, emanations) => callback(emanations));
    },
    removePlayerEmanationsUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-emanations-update');
    },
    sendPlayerWildShape: (data) => electron_1.ipcRenderer.send('player-wild-shape', data),
    onPlayerWildShape: (callback) => {
        electron_1.ipcRenderer.on('player-wild-shape', (_event, data) => callback(data));
    },
    removePlayerWildShapeListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-wild-shape');
    },
    sendPlayerInvisibleToggle: (tokenId) => electron_1.ipcRenderer.send('player-invisible-toggle', tokenId),
    onPlayerInvisibleToggle: (callback) => {
        electron_1.ipcRenderer.on('player-invisible-toggle', (_event, tokenId) => callback(tokenId));
    },
    removePlayerInvisibleToggleListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-invisible-toggle');
    },
    sendPlayerSummonCombatant: (combatant, tokenId) => electron_1.ipcRenderer.send('player-summon-combatant', { combatant, tokenId }),
    onPlayerSummonCombatant: (callback) => {
        electron_1.ipcRenderer.on('player-summon-combatant', (_event, data) => callback(data));
    },
    removePlayerSummonCombatantListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-summon-combatant');
    },
    sendPlayerImageRotation: (data) => electron_1.ipcRenderer.send('player-image-rotation', data),
    onPlayerImageRotation: (callback) => {
        electron_1.ipcRenderer.on('player-image-rotation', (_event, data) => callback(data));
    },
    removePlayerImageRotationListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-image-rotation');
    },
    // ── Drawings ──
    sendDMDrawingsUpdate: (data) => electron_1.ipcRenderer.send('dm-drawings-update', data),
    onDMDrawingsUpdate: (callback) => {
        electron_1.ipcRenderer.on('dm-drawings-update', (_event, data) => callback(data));
    },
    removeDMDrawingsUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-drawings-update');
    },
    sendPlayerDrawingsUpdate: (data) => electron_1.ipcRenderer.send('player-drawings-update', data),
    onPlayerDrawingsUpdate: (callback) => {
        electron_1.ipcRenderer.on('player-drawings-update', (_event, data) => callback(data));
    },
    removePlayerDrawingsUpdateListener: () => {
        electron_1.ipcRenderer.removeAllListeners('player-drawings-update');
    },
    sendEphemeralStroke: (stroke) => electron_1.ipcRenderer.send('ephemeral-stroke', stroke),
    onEphemeralStroke: (callback) => {
        electron_1.ipcRenderer.on('ephemeral-stroke', (_event, stroke) => callback(stroke));
    },
    removeEphemeralStrokeListener: () => {
        electron_1.ipcRenderer.removeAllListeners('ephemeral-stroke');
    },
    // ── Ping (DM → Player) ──
    sendDMPing: (ping) => electron_1.ipcRenderer.send('dm-ping', ping),
    onDMPing: (callback) => {
        electron_1.ipcRenderer.on('dm-ping', (_event, ping) => callback(ping));
    },
    removeDMPingListener: () => {
        electron_1.ipcRenderer.removeAllListeners('dm-ping');
    },
    // ── Extras gallery (global, file-based) ──
    extrasLoadManifest: () => electron_1.ipcRenderer.invoke('extras-load-manifest'),
    extrasSaveManifest: (manifest) => electron_1.ipcRenderer.invoke('extras-save-manifest', manifest),
    extrasSaveImage: (data) => electron_1.ipcRenderer.invoke('extras-save-image', data),
    extrasDeleteImage: (filename) => electron_1.ipcRenderer.invoke('extras-delete-image', filename),
});
