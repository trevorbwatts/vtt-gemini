/**
 * IndexedDB-backed store for map images and image-note data URLs.
 *
 * Map images are multi-megabyte base64 strings. localStorage has a ~5–10 MB
 * total quota, which silently fails (QuotaExceededError) once a campaign has
 * roughly a dozen floors with maps. IndexedDB on Electron has a multi-GB
 * quota, so we use it for the large blobs and keep localStorage for the small
 * campaign metadata.
 *
 * Reads stay synchronous, off an in-memory cache. That cache is filled one
 * campaign at a time via loadImages(), not wholesale at startup: loading every
 * image the app has ever stored meant launch time and memory both scaled with
 * the user's entire library rather than with the campaign being opened.
 */
const DB_NAME = 'vtt-image-store';
const STORE_NAME = 'images';
const DB_VERSION = 1;

const cache = new Map<string, string>();
/** Keys whose IndexedDB write hasn't settled yet. Evicting one of these would
 *  lose it: the cache is the only copy until the put resolves. */
const inFlightWrites = new Set<string>();
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

function idbGet(key: string): Promise<string | undefined> {
  return tx('readonly').then(store => new Promise<string | undefined>((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : undefined);
    req.onerror = () => reject(req.error);
  }));
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
 * Open the DB and migrate any legacy localStorage entries. Deliberately does
 * NOT read any images — call loadImages() with a campaign's keys when that
 * campaign is opened. Call once at app startup.
 */
export async function initImageStore(): Promise<void> {
  if (ready) return;
  try {
    await openDb();
    await migrateFromLocalStorage();
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

/**
 * Pull the given keys into the cache so getImage() can serve them
 * synchronously. Keys already cached are skipped, and keys with nothing stored
 * resolve to nothing rather than failing — a floor with no map is normal.
 */
export async function loadImages(keys: Iterable<string>): Promise<void> {
  const wanted = [...new Set(keys)].filter(k => !cache.has(k));
  if (wanted.length === 0) return;
  await Promise.all(wanted.map(async key => {
    try {
      const value = await idbGet(key);
      if (value !== undefined) cache.set(key, value);
    } catch (err) {
      // A miss degrades to "no image" rather than blocking the whole campaign.
      // eslint-disable-next-line no-console
      console.warn('[imageStore] failed to load', key, err);
    }
  }));
}

/**
 * Drop cached images that the given keys don't cover, so switching campaigns
 * doesn't accumulate every map visited this session. Keys with a write still
 * in flight are kept — the cache is their only copy until it lands.
 */
export function releaseImagesExcept(keep: Iterable<string>): void {
  const keepSet = new Set(keep);
  for (const key of [...cache.keys()]) {
    if (keepSet.has(key) || inFlightWrites.has(key)) continue;
    cache.delete(key);
  }
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
  // The campaign save sweep calls this for every map and note image on every
  // campaign change — which happens up to 20x/second while a player drags a
  // token — so without this guard each of those ticks rewrote multi-megabyte
  // base64 strings back into IndexedDB unchanged. Images loaded at startup are
  // handed straight from this cache into the campaign object, so the common
  // "nothing changed" case is a pointer comparison, not a string scan.
  if (cache.get(key) === value) return;
  cache.set(key, value);
  inFlightWrites.add(key);
  idbPut(key, value)
    .catch(err => {
      // eslint-disable-next-line no-console
      console.warn('[imageStore] idb put failed for', key, err);
      try { localStorage.setItem(key, value); } catch { /* quota */ }
    })
    .finally(() => { inFlightWrites.delete(key); });
}

export function removeImage(key: string): void {
  cache.delete(key);
  inFlightWrites.delete(key);
  idbDelete(key).catch(() => { /* ignore */ });
  // Also clean up any stale localStorage copy from before migration.
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
