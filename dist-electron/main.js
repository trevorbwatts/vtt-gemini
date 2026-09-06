"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const http_1 = __importDefault(require("http"));
// --- Serving the built app ---------------------------------------------------
// Outside of dev there is no Vite server, but the app still asks for things by
// absolute path (/tokens/goblin.jpg, /extras/manifest.json, ...), which plain
// file:// would resolve against the drive root and never find. So the built app
// is served by a small static server inside the main process instead.
//
// It deliberately listens on the same address Vite uses in dev. Chromium keys
// saved data to the address a page was served from, so anything else — file://,
// a custom app:// scheme — would strand every campaign and map already saved
// under this origin in a bucket the app can no longer see.
const APP_PORT = 5173;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
// Campaigns, maps and settings live in a folder named after the app. The
// installed build would otherwise pick a different name than the one the repo
// launcher uses and open completely empty, so the name is pinned here and both
// share a single data folder. Must run before the app is ready.
electron_1.app.setName('dungeon-master-desktop-vtt');
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff2': 'font/woff2',
};
/** Locate a requested URL path on disk, or null if nothing matches. */
function resolveRequest(urlPath) {
    const segments = urlPath.split('/').filter(Boolean);
    const top = segments[0];
    // Extras are user-editable, so they're read from the writable library
    // folder first and only then from the copy that shipped with the app.
    // That way a freshly added avatar appears immediately rather than after the
    // next rebuild, and the shipped library still shows up on a machine where
    // nothing has been added yet.
    let roots;
    let relativePath;
    if (top === 'extras') {
        relativePath = segments.slice(1).join(path_1.default.sep);
        const bundled = bundledLibraryDir(top);
        roots = bundled ? [libraryDir(top), bundled] : [libraryDir(top)];
    }
    else {
        relativePath = segments.length > 0 ? segments.join(path_1.default.sep) : 'index.html';
        roots = [path_1.default.resolve(__dirname, '..', 'dist')];
    }
    for (const root of roots) {
        const filePath = path_1.default.join(root, relativePath);
        // Never serve anything outside the intended root, whatever the page asks for.
        if (!filePath.startsWith(root))
            continue;
        if (fs_1.default.existsSync(filePath) && fs_1.default.statSync(filePath).isFile())
            return filePath;
    }
    return null;
}
/**
 * Static server for the built app. Bound to the loopback address only, so it is
 * reachable from this machine and nowhere else.
 */
function startStaticServer() {
    const server = http_1.default.createServer((req, res) => {
        let filePath = null;
        try {
            filePath = resolveRequest(decodeURIComponent(new URL(req.url ?? '/', APP_ORIGIN).pathname));
        }
        catch {
            // Malformed URL — fall through to the 404 below.
        }
        if (!filePath) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const size = fs_1.default.statSync(filePath).size;
        const type = MIME_TYPES[path_1.default.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        // Video seeking asks for byte ranges rather than the whole file.
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (range) {
            const start = range[1] ? parseInt(range[1], 10) : 0;
            const end = range[2] ? parseInt(range[2], 10) : size - 1;
            if (start >= size || end >= size || start > end) {
                res.writeHead(416, { 'content-range': `bytes */${size}` });
                res.end();
                return;
            }
            res.writeHead(206, {
                'content-type': type,
                'content-length': end - start + 1,
                'content-range': `bytes ${start}-${end}/${size}`,
                'accept-ranges': 'bytes',
            });
            fs_1.default.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }
        res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
        fs_1.default.createReadStream(filePath).pipe(res);
    });
    return new Promise((resolve) => {
        server.once('error', (err) => {
            // Something already owns the port — almost always a Vite dev server
            // serving this same app. Loading the page will reach it either way.
            if (err.code !== 'EADDRINUSE')
                throw err;
            resolve();
        });
        server.listen(APP_PORT, '127.0.0.1', resolve);
    });
}
let dmWindow = null;
let playerWindow = null;
let lastKnownState = null;
let savedMenu = null;
function createDmWindow() {
    dmWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Dungeon Master Desktop VTT',
        // Stay hidden until the page has painted so the user never sees a blank
        // white window while the app is still loading.
        show: false,
        backgroundColor: '#0c0a09', // matches --bg in src/index.css
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    dmWindow.once('ready-to-show', () => {
        dmWindow?.show();
    });
    // Same address in dev and in the built app — see the note on APP_PORT.
    dmWindow.loadURL(APP_ORIGIN);
    // In dev the Vite server may still be starting when Electron launches;
    // keep retrying until it responds (otherwise the hidden window would
    // never fire ready-to-show and the app would never appear).
    dmWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => dmWindow?.loadURL(APP_ORIGIN), 300);
    });
    dmWindow.on('enter-full-screen', () => {
        dmWindow?.webContents.send('fullscreen-status', true);
    });
    dmWindow.on('leave-full-screen', () => {
        // Restore the menu bar when exiting fullscreen by any means (Escape, F11, etc.)
        if (savedMenu) {
            electron_1.Menu.setApplicationMenu(savedMenu);
        }
        dmWindow?.setAutoHideMenuBar(false);
        dmWindow?.setMenuBarVisibility(true);
        dmWindow?.webContents.send('fullscreen-status', false);
    });
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
    const displays = electron_1.screen.getAllDisplays();
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const externalDisplay = displays.find(d => d.id !== primaryDisplay.id);
    const targetDisplay = externalDisplay || primaryDisplay;
    // Use bounds instead of workArea to cover the entire screen including the taskbar.
    // We create it frameless at the exact x/y of the target display,
    // then set it to fullscreen after creation to prevent Windows from
    // forcefully moving it back to the primary display.
    playerWindow = new electron_1.BrowserWindow({
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y,
        width: targetDisplay.bounds.width,
        height: targetDisplay.bounds.height,
        frame: false, // frameless for a clean player experience
        backgroundColor: '#0c0a09', // dark until content paints — never flash white
        title: 'VTT Player Map',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });
    // Make it truly fullscreen on the target display
    playerWindow.setFullScreen(true);
    playerWindow.setMenuBarVisibility(false);
    // We pass a hash to let the react router/app differentiate the view
    playerWindow.loadURL(`${APP_ORIGIN}/#player`);
    playerWindow.on('closed', () => {
        playerWindow = null;
        // Notify DM window that player screen was closed
        if (dmWindow) {
            dmWindow.webContents.send('player-screen-status', false);
        }
    });
}
electron_1.app.whenReady().then(async () => {
    // In dev, Vite is already serving this address.
    if (process.env.NODE_ENV !== 'development') {
        await startStaticServer();
    }
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
// --- Fullscreen toggle for DM window ---
electron_1.ipcMain.on('toggle-fullscreen', () => {
    if (!dmWindow)
        return;
    const isFs = dmWindow.isFullScreen();
    if (!isFs) {
        // Entering fullscreen — save the menu and remove it entirely
        savedMenu = electron_1.Menu.getApplicationMenu();
        dmWindow.setMenuBarVisibility(false);
        dmWindow.setAutoHideMenuBar(true);
        electron_1.Menu.setApplicationMenu(null);
        dmWindow.setFullScreen(true);
    }
    else {
        // Leaving fullscreen — restore the menu
        dmWindow.setFullScreen(false);
        if (savedMenu) {
            electron_1.Menu.setApplicationMenu(savedMenu);
        }
        dmWindow.setAutoHideMenuBar(false);
        dmWindow.setMenuBarVisibility(true);
    }
});
// --- IPC Communication between Windows ---
electron_1.ipcMain.on('launch-player-screen', () => {
    createPlayerWindow();
    // Notify DM window only after the player window has finished loading,
    // so that when the DM sends state back, the player's IPC listeners are ready.
    if (playerWindow) {
        playerWindow.webContents.once('did-finish-load', () => {
            if (dmWindow) {
                dmWindow.webContents.send('player-screen-status', true);
            }
        });
    }
});
electron_1.ipcMain.on('close-player-screen', () => {
    if (playerWindow) {
        playerWindow.close();
        playerWindow = null;
    }
});
electron_1.ipcMain.on('player-mode-update', (_event, mode) => {
    if (playerWindow) {
        playerWindow.webContents.send('player-mode-update', mode);
    }
});
// DM toggled "View as Player" — proxy to the Player window so the projected
// map shows just that one player's vision (or null to restore combined vision).
electron_1.ipcMain.on('dm-view-as-player-update', (_event, playerId) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-view-as-player-update', playerId);
    }
});
// When the DM updates the campaign state, proxy it to the Player window
electron_1.ipcMain.on('dm-state-update', (_event, state) => {
    lastKnownState = state;
    if (playerWindow) {
        playerWindow.webContents.send('player-state-update', state);
    }
});
// Allow Player window to request the latest state on mount
electron_1.ipcMain.on('request-state-update', () => {
    if (lastKnownState && playerWindow) {
        playerWindow.webContents.send('player-state-update', lastKnownState);
    }
});
// When the Player moves tokens, proxy it back to the DM window
electron_1.ipcMain.on('player-token-update', (_event, tokens) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-token-update', tokens);
    }
});
// When the DM drags tokens, proxy them swiftly to the Player window
electron_1.ipcMain.on('dm-token-update', (_event, tokens) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-token-update', tokens);
    }
});
// AoE spell sync between DM and Player
electron_1.ipcMain.on('dm-aoe-update', (_event, aoe) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-aoe-update', aoe);
    }
});
electron_1.ipcMain.on('player-aoe-update', (_event, aoe) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-aoe-update', aoe);
    }
});
// DM dismisses player AoE (after applying damage from spell modal)
electron_1.ipcMain.on('dismiss-player-aoe', () => {
    if (playerWindow) {
        playerWindow.webContents.send('dismiss-player-aoe');
    }
});
// Player condition updates: proxy to DM window
electron_1.ipcMain.on('player-condition-update', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-condition-update', data);
    }
});
// Player darkvision updates: proxy to DM window
electron_1.ipcMain.on('player-darkvision-update', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-darkvision-update', data);
    }
});
// Player color updates: proxy to DM window
electron_1.ipcMain.on('player-color-update', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-color-update', data);
    }
});
// Player requests end of their turn: proxy to DM window
electron_1.ipcMain.on('player-end-turn', () => {
    if (dmWindow) {
        dmWindow.webContents.send('player-end-turn');
    }
});
// Player target updates: proxy to DM window
electron_1.ipcMain.on('player-target-update', (_event, combatantIds) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-target-update', combatantIds);
    }
});
// Player portal toggle: proxy to DM window
electron_1.ipcMain.on('player-portal-toggle', (_event, portalId) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-portal-toggle', portalId);
    }
});
// Player floor change: proxy to DM window (when a player uses a transition zone)
electron_1.ipcMain.on('player-floor-change', (_event, floorId) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-floor-change', floorId);
    }
});
// Spell marker sync between DM and Player
electron_1.ipcMain.on('dm-spell-marker-update', (_event, markers) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-spell-marker-update', markers);
    }
});
electron_1.ipcMain.on('player-spell-marker-update', (_event, markers) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-spell-marker-update', markers);
    }
});
// Active emanation rings: proxy from player window to DM window
electron_1.ipcMain.on('player-emanations-update', (_event, emanations) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-emanations-update', emanations);
    }
});
// Player Wild Shape updates: proxy to DM window
electron_1.ipcMain.on('player-wild-shape', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-wild-shape', data);
    }
});
// Player Invisible toggle: proxy to DM window
electron_1.ipcMain.on('player-invisible-toggle', (_event, tokenId) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-invisible-toggle', tokenId);
    }
});
electron_1.ipcMain.on('player-summon-combatant', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-summon-combatant', data);
    }
});
// Player rotated the image-note overlay: proxy to DM window
electron_1.ipcMain.on('player-image-rotation', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-image-rotation', data);
    }
});
// DM ping → Player
electron_1.ipcMain.on('dm-ping', (_event, ping) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-ping', ping);
    }
});
// ── Drawings sync ──
// DM drawings → Player
electron_1.ipcMain.on('dm-drawings-update', (_event, data) => {
    if (playerWindow) {
        playerWindow.webContents.send('dm-drawings-update', data);
    }
});
// Player drawings → DM
electron_1.ipcMain.on('player-drawings-update', (_event, data) => {
    if (dmWindow) {
        dmWindow.webContents.send('player-drawings-update', data);
    }
});
// Ephemeral strokes — broadcast to the *other* window only
electron_1.ipcMain.on('ephemeral-stroke', (event, stroke) => {
    const sender = event.sender;
    if (dmWindow && dmWindow.webContents !== sender) {
        dmWindow.webContents.send('ephemeral-stroke', stroke);
    }
    if (playerWindow && playerWindow.webContents !== sender) {
        playerWindow.webContents.send('ephemeral-stroke', stroke);
    }
});
/** Writable location for a library — where new files and the manifest go. */
function libraryDir(name) {
    return electron_1.app.isPackaged
        ? path_1.default.join(electron_1.app.getPath('userData'), name)
        : path_1.default.resolve(__dirname, '..', 'public', name);
}
/**
 * Read-only copy of a library shipped inside the installed app. Null when
 * running from the repo, where the writable folder is already the only copy.
 */
function bundledLibraryDir(name) {
    return electron_1.app.isPackaged ? path_1.default.join(__dirname, '..', 'dist', name) : null;
}
function libraryManifestPath(name) {
    return path_1.default.join(libraryDir(name), 'manifest.json');
}
async function ensureLibraryDir(name) {
    const dir = libraryDir(name);
    if (!fs_1.default.existsSync(dir)) {
        await promises_1.default.mkdir(dir, { recursive: true });
    }
}
async function readLibraryManifest(name) {
    // The user's own manifest takes over once they've added or edited anything.
    // Until then, fall back to the manifest that shipped with the app.
    const candidates = [libraryManifestPath(name)];
    const bundled = bundledLibraryDir(name);
    if (bundled)
        candidates.push(path_1.default.join(bundled, 'manifest.json'));
    for (const p of candidates) {
        if (!fs_1.default.existsSync(p))
            continue;
        const parsed = JSON.parse(await promises_1.default.readFile(p, 'utf-8'));
        if (Array.isArray(parsed))
            return parsed;
    }
    return [];
}
/** Wire up the load/save/write/delete IPC for one library. */
function registerLibraryIpc(name, channels) {
    electron_1.ipcMain.handle(channels.load, async () => {
        try {
            await ensureLibraryDir(name);
            return { manifest: await readLibraryManifest(name) };
        }
        catch (err) {
            return { manifest: [], error: err?.message ?? 'load failed' };
        }
    });
    electron_1.ipcMain.handle(channels.saveManifest, async (_event, manifest) => {
        try {
            if (!Array.isArray(manifest))
                return { ok: false, error: 'manifest must be an array' };
            await ensureLibraryDir(name);
            const body = JSON.stringify(manifest, null, 2) + '\n';
            await promises_1.default.writeFile(libraryManifestPath(name), body, 'utf-8');
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err?.message ?? 'save failed' };
        }
    });
    electron_1.ipcMain.handle(channels.writeFile, async (_event, payload) => {
        try {
            if (!payload?.filename || !payload?.dataUrl) {
                return { ok: false, error: 'filename and dataUrl are required' };
            }
            // Defend against path traversal — filename must be a plain basename.
            const safeName = path_1.default.basename(payload.filename);
            if (safeName !== payload.filename) {
                return { ok: false, error: 'invalid filename' };
            }
            const match = payload.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match)
                return { ok: false, error: 'expected a base64 data URL' };
            const buf = Buffer.from(match[2], 'base64');
            await ensureLibraryDir(name);
            await promises_1.default.writeFile(path_1.default.join(libraryDir(name), safeName), buf);
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err?.message ?? 'save failed' };
        }
    });
    electron_1.ipcMain.handle(channels.deleteFile, async (_event, filename) => {
        try {
            const safeName = path_1.default.basename(filename);
            if (safeName !== filename)
                return { ok: false, error: 'invalid filename' };
            const target = path_1.default.join(libraryDir(name), safeName);
            if (fs_1.default.existsSync(target)) {
                await promises_1.default.unlink(target);
            }
            // A file that exists only in the shipped copy can't be removed from disk.
            // Dropping it from the manifest is enough to take it out of the app.
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err?.message ?? 'delete failed' };
        }
    });
}
registerLibraryIpc('extras', {
    load: 'extras-load-manifest',
    saveManifest: 'extras-save-manifest',
    writeFile: 'extras-save-image',
    deleteFile: 'extras-delete-image',
});
// D&D Beyond character import
electron_1.ipcMain.handle('fetch-dndb-character', async (_event, url) => {
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
    }
    catch (err) {
        return { error: `Network error: ${err.message}. Make sure you are connected to the internet.` };
    }
});
