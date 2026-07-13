/**
 * StarCraft-style "explored" fog-of-war memory.
 *
 * Every area a player token has ever seen is accumulated into a per-floor
 * offscreen mask canvas (white = explored, transparent = never seen). The
 * FogOfWarLayer uses the mask to dim previously-seen terrain instead of
 * hiding it behind pitch-black fog.
 *
 * Masks are downscaled (long side capped at MAX_MASK_DIM px) — fog edges are
 * soft enough that quarter-resolution is indistinguishable, and it keeps the
 * persisted PNGs small.
 *
 * Persistence lives in its own IndexedDB database (not the imageStore DB) so
 * the player window can read fresh values directly from IDB — imageStore's
 * in-memory cache is only populated at startup and would go stale across the
 * two Electron windows. Each record stores the mask PNG plus the timestamp of
 * the last applied "reset explored fog", so a reset done in the DM window
 * isn't re-applied (wiping newer exploration) when a window reloads later.
 */

const DB_NAME = 'vtt-fog-store';
const STORE_NAME = 'masks';
const DB_VERSION = 1;

/** Longest side of a mask canvas, in px. */
const MAX_MASK_DIM = 2048;
/** Debounce for persisting a dirty mask to IndexedDB. */
const SAVE_DEBOUNCE_MS = 3000;

interface FogRecord {
  mask: string | null; // PNG data URL, null right after a reset
  resetAt: number;     // last reset timestamp applied to this mask
}

interface FogEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** mask px per map px (<= 1). */
  scale: number;
  mapW: number;
  mapH: number;
  /** Bumped on every visual change; lets React re-render the fog layer. */
  version: number;
  /** IDB load finished (successfully or not). */
  loaded: boolean;
  /** Timestamp of the last floor.exploredFogResetAt applied locally. */
  appliedResetAt: number;
  dirty: boolean;
  persist: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, FogEntry>();
const listeners = new Map<string, Set<() => void>>();

// One reusable scratch canvas for compositing the "currently visible" stamp
// before OR-ing it into the accumulated mask (so dark-zone erases in the
// stamp can't punch holes in previously explored areas).
let scratch: HTMLCanvasElement | null = null;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<FogRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as FogRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: FogRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function notify(key: string): void {
  listeners.get(key)?.forEach(cb => cb());
}

export function exploredFogKey(scenarioId: string, floorId: string): string {
  return `fog_mask_${scenarioId}_${floorId}`;
}

/** Subscribe to visual changes of a mask. Returns an unsubscribe function. */
export function subscribeExploredFog(key: string, cb: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => { set!.delete(cb); };
}

/** Current version counter for a mask (0 if the entry doesn't exist yet). */
export function getExploredFogVersion(key: string): number {
  return entries.get(key)?.version ?? 0;
}

/**
 * Get (or lazily create) the mask entry for a floor. Creation kicks off an
 * async IndexedDB load; subscribers are notified when the stored mask lands.
 */
export function getExploredFogEntry(key: string, mapW: number, mapH: number): FogEntry {
  let entry = entries.get(key);
  if (entry && entry.mapW === mapW && entry.mapH === mapH) return entry;

  const scale = Math.min(1, MAX_MASK_DIM / Math.max(mapW, mapH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(mapW * scale));
  canvas.height = Math.max(1, Math.round(mapH * scale));
  const ctx = canvas.getContext('2d')!;

  entry = {
    canvas, ctx, scale, mapW, mapH,
    version: 1,
    loaded: false,
    appliedResetAt: 0,
    dirty: false,
    persist: false,
    saveTimer: null,
  };
  entries.set(key, entry);

  idbGet(key).then(record => {
    if (entries.get(key) !== entry) return; // superseded (e.g. map resized)
    const storedResetAt = record?.resetAt ?? 0;
    // A reset newer than the stored record arrived while we were loading —
    // the stored mask predates it, so drop the mask entirely.
    const maskIsStale = entry!.appliedResetAt > storedResetAt;
    entry!.appliedResetAt = Math.max(entry!.appliedResetAt, storedResetAt);
    if (record?.mask && !maskIsStale) {
      const img = new Image();
      const resetSeqAtLoad = entry!.appliedResetAt;
      img.onload = () => {
        if (entries.get(key) !== entry) return;
        // A reset arrived while the image decoded — stale mask, drop it.
        if (entry!.appliedResetAt <= resetSeqAtLoad) {
          entry!.ctx.drawImage(img, 0, 0, entry!.canvas.width, entry!.canvas.height);
        }
        markLoaded(key, entry!);
      };
      img.onerror = () => markLoaded(key, entry!);
      img.src = record.mask;
    } else {
      markLoaded(key, entry!);
    }
  }).catch(() => markLoaded(key, entry!));

  return entry;
}

/** Mark an entry's IDB load complete and wake subscribers/effects. */
function markLoaded(key: string, entry: FogEntry): void {
  entry.loaded = true;
  entry.version++;
  notify(key);
}

function scheduleSave(key: string, entry: FogEntry): void {
  entry.dirty = true;
  if (!entry.persist || entry.saveTimer) return;
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    flushEntry(key, entry);
  }, SAVE_DEBOUNCE_MS);
}

function flushEntry(key: string, entry: FogEntry): void {
  if (!entry.dirty || !entry.persist) return;
  entry.dirty = false;
  try {
    const record: FogRecord = {
      mask: entry.canvas.toDataURL('image/png'),
      resetAt: entry.appliedResetAt,
    };
    idbPut(key, record).catch(err => {
      // eslint-disable-next-line no-console
      console.warn('[exploredFog] save failed for', key, err);
    });
  } catch { /* toDataURL can throw on a broken context; skip this save */ }
}

/** Persist any dirty masks immediately (used on window unload). */
export function flushExploredFog(): void {
  for (const [key, entry] of entries) {
    if (entry.saveTimer) {
      clearTimeout(entry.saveTimer);
      entry.saveTimer = null;
    }
    flushEntry(key, entry);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushExploredFog);
}

/**
 * OR the currently-visible region into the accumulated mask.
 *
 * `drawVisible` receives a scratch context already scaled so it can draw in
 * MAP pixel coordinates; it must paint the visible region opaque (any color)
 * using the same compositing rules as the live fog layer.
 *
 * `persist` should be true only in the DM window so the two Electron windows
 * don't race writes for the same key.
 */
export function stampExploredFog(
  key: string,
  mapW: number,
  mapH: number,
  persist: boolean,
  drawVisible: (ctx: CanvasRenderingContext2D) => void,
): void {
  const entry = getExploredFogEntry(key, mapW, mapH);
  entry.persist = entry.persist || persist;

  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== entry.canvas.width || scratch.height !== entry.canvas.height) {
    scratch.width = entry.canvas.width;
    scratch.height = entry.canvas.height;
  }
  const sctx = scratch.getContext('2d')!;
  sctx.save();
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, scratch.width, scratch.height);
  sctx.scale(entry.scale, entry.scale);
  drawVisible(sctx);
  sctx.restore();

  entry.ctx.globalCompositeOperation = 'source-over';
  entry.ctx.drawImage(scratch, 0, 0);
  entry.version++;
  notify(key);
  scheduleSave(key, entry);
}

/**
 * Wipe a floor's explored memory. `resetAt` is the floor's exploredFogResetAt
 * timestamp; it's recorded so reloads and the other window don't re-apply an
 * old reset over newer exploration. No-op if this reset was already applied.
 */
export function resetExploredFog(
  key: string,
  resetAt: number,
  persist: boolean,
): void {
  const entry = entries.get(key);
  if (!entry) {
    // Nothing in memory — persist the reset marker so a later load ignores
    // any stale stored mask.
    if (persist) {
      idbPut(key, { mask: null, resetAt }).catch(() => { /* ignore */ });
    }
    return;
  }
  if (resetAt <= entry.appliedResetAt) return;
  entry.appliedResetAt = resetAt;
  entry.ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
  entry.version++;
  notify(key);
  // Only persist once the IDB load has finished. Before that, appliedResetAt
  // can't distinguish a brand-new reset from a replay of an old one on mount,
  // and persisting a replay would overwrite the stored mask with null.
  if ((persist || entry.persist) && entry.loaded) {
    if (entry.saveTimer) {
      clearTimeout(entry.saveTimer);
      entry.saveTimer = null;
    }
    entry.dirty = false;
    idbPut(key, { mask: null, resetAt }).catch(() => { /* ignore */ });
  }
}
