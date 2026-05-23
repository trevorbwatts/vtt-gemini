/**
 * IndexedDB-backed store for map images and image-note data URLs.
 *
 * Map images are multi-megabyte base64 strings. localStorage has a ~5–10 MB
 * total quota, which silently fails (QuotaExceededError) once a campaign has
 * roughly a dozen floors with maps. IndexedDB on Electron has a multi-GB
 * quota, so we use it for the large blobs and keep localStorage for the small
 * campaign metadata.
 *
 * A synchronous in-memory cache is populated once at startup (after migrating
 * any legacy localStorage entries), so the rest of the app can keep its
 * existing synchronous read patterns.
 */
const DB_NAME = 'vtt-image-store';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const cache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;
let ready = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

async function idbGetAll(): Promise<Array<{ key: string; value: string }>> {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const result: Array<{ key: string; value: string }> = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        if (typeof cur.value === 'string') {
          result.push({ key: String(cur.key), value: cur.value });
        }
        cur.continue();
      } else {
        resolve(result);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: string): Promise<void> {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function isImageKey(k: string): boolean {
  return k.startsWith('map_img_') || k.startsWith('note_img_');
}

/**
 * Move any legacy `map_img_*` / `note_img_*` entries from localStorage into
 * IndexedDB, then remove the localStorage copies to free quota. Safe to call
 * repeatedly — already-migrated keys just get re-copied (idempotent put).
 */
async function migrateFromLocalStorage(): Promise<void> {
  const toMigrate: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !isImageKey(k)) continue;
    const v = localStorage.getItem(k);
    if (v) toMigrate.push({ key: k, value: v });
  }
  for (const { key, value } of toMigrate) {
    try {
      await idbPut(key, value);
      cache.set(key, value);
      localStorage.removeItem(key);
    } catch (err) {
      // Leave it in localStorage as a fallback if IDB write fails for this key.
      // eslint-disable-next-line no-console
      console.warn('[imageStore] migration failed for', key, err);
    }
  }
}

/**
 * Open the DB, migrate any legacy localStorage entries, and load every stored
 * image into the in-memory cache. Call once at app startup before rendering
 * UI that depends on images.
 */
export async function initImageStore(): Promise<void> {
  if (ready) return;
  try {
    await openDb();
    await migrateFromLocalStorage();
    const all = await idbGetAll();
    for (const { key, value } of all) cache.set(key, value);
    ready = true;
  } catch (err) {
    // If IDB is unavailable, fall back to a pure-memory + localStorage flow:
    // pre-populate the cache from whatever's still in localStorage.
    // eslint-disable-next-line no-console
    console.warn('[imageStore] init failed, falling back to localStorage', err);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !isImageKey(k)) continue;
      const v = localStorage.getItem(k);
      if (v) cache.set(k, v);
    }
    ready = true;
  }
}

export function isImageStoreReady(): boolean {
  return ready;
}

/** Synchronous read from the in-memory cache. Returns undefined if absent. */
export function getImage(key: string): string | undefined {
  return cache.get(key);
}

/**
 * Synchronously update the in-memory cache and fire-and-forget the IDB write.
 * If the IDB write fails we fall back to localStorage (which itself may fail
 * the quota, but that's the best we can do).
 */
export function setImage(key: string, value: string): void {
  cache.set(key, value);
  idbPut(key, value).catch(err => {
    // eslint-disable-next-line no-console
    console.warn('[imageStore] idb put failed for', key, err);
    try { localStorage.setItem(key, value); } catch { /* quota */ }
  });
}

export function removeImage(key: string): void {
  cache.delete(key);
  idbDelete(key).catch(() => { /* ignore */ });
  // Also clean up any stale localStorage copy from before migration.
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
