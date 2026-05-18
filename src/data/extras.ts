import { useEffect, useState, useCallback, useRef } from 'react';
import type { Extra } from '../types';

/**
 * Global "Extras" gallery — background-character avatars reusable across campaigns.
 * Stored on disk: public/extras/manifest.json + public/extras/<filename>.
 * Manifest is loaded via fetch on startup; writes are persisted through Electron IPC
 * so the project's source folder gets updated and can be committed to git.
 */

const MANIFEST_URL = '/extras/manifest.json';

/** Public URL for an Extra's avatar image. */
export function extraImageUrl(filename: string): string {
  return `/extras/${filename}`;
}

/** Slugify a string for use in filenames or ids. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'extra';
}

/** Extract the file extension from a File (or a filename), defaulting to png. */
export function fileExt(file: File | string): string {
  const name = typeof file === 'string' ? file : file.name;
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = m ? m[1].toLowerCase() : 'png';
  // Normalize jpeg → jpg
  return ext === 'jpeg' ? 'jpg' : ext;
}

/** Read a File into a base64 data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unexpected reader result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

/** Search/filter helper. Case-insensitive name match + every requiredTag must match. */
export function filterExtras(extras: Extra[], query: string, requiredTags: string[]): Extra[] {
  const q = query.trim().toLowerCase();
  const tagsLower = requiredTags.map(t => t.toLowerCase());
  return extras.filter(e => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (tagsLower.length > 0) {
      const eTags = e.tags.map(t => t.toLowerCase());
      if (!tagsLower.every(t => eTags.includes(t))) return false;
    }
    return true;
  });
}

/** Collect all unique tags from a list of extras, sorted alphabetically. */
export function allTags(extras: Extra[]): string[] {
  const set = new Set<string>();
  extras.forEach(e => e.tags.forEach(t => set.add(t)));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

async function loadManifestFromDisk(): Promise<Extra[]> {
  // Prefer Electron IPC (reads the source file in dev so writes-then-restart pick up).
  try {
    const api = (window as any).electronAPI;
    if (api?.extrasLoadManifest) {
      const res = await api.extrasLoadManifest();
      if (!res?.error && Array.isArray(res?.manifest)) return res.manifest;
    }
  } catch (_e) { /* fall through */ }
  // Fallback: fetch from public/.
  try {
    const r = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!r.ok) return [];
    const json = await r.json();
    return Array.isArray(json) ? json : [];
  } catch (_e) {
    return [];
  }
}

/**
 * React hook giving access to the global Extras list plus mutation helpers.
 * The list is loaded once on mount; mutations update state and persist via IPC.
 */
export function useExtras() {
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loaded, setLoaded] = useState(false);
  const extrasRef = useRef<Extra[]>([]);
  extrasRef.current = extras;

  useEffect(() => {
    let cancelled = false;
    loadManifestFromDisk().then(list => {
      if (cancelled) return;
      setExtras(list);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const persistManifest = useCallback(async (next: Extra[]) => {
    setExtras(next);
    try {
      const api = (window as any).electronAPI;
      if (api?.extrasSaveManifest) {
        await api.extrasSaveManifest(next);
      }
    } catch (_e) { /* non-fatal */ }
  }, []);

  /**
   * Bulk-import a set of File objects. Each file is saved to disk and added to the manifest.
   * `metaForFile(file, index)` lets the caller supply name + tags per file.
   */
  const addExtras = useCallback(async (
    files: File[],
    metaForFile: (file: File, index: number) => { name: string; tags: string[] }
  ): Promise<{ added: Extra[]; errors: string[] }> => {
    const api = (window as any).electronAPI;
    const added: Extra[] = [];
    const errors: string[] = [];
    const existing = [...extrasRef.current];
    const usedFilenames = new Set(existing.map(e => e.filename));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metaForFile(file, i);
      const baseSlug = slugify(meta.name || file.name.replace(/\.[^.]+$/, '')) || 'extra';
      const ext = fileExt(file);
      // Ensure unique filename within manifest
      let filename = `${baseSlug}.${ext}`;
      let n = 1;
      while (usedFilenames.has(filename)) {
        filename = `${baseSlug}-${n++}.${ext}`;
      }
      usedFilenames.add(filename);

      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (api?.extrasSaveImage) {
          const res = await api.extrasSaveImage({ filename, dataUrl });
          if (!res?.ok) {
            errors.push(`${file.name}: ${res?.error ?? 'save failed'}`);
            continue;
          }
        }
        const extra: Extra = {
          id: filename,
          filename,
          name: meta.name || baseSlug,
          tags: meta.tags.filter(t => t.trim().length > 0),
        };
        existing.push(extra);
        added.push(extra);
      } catch (err: any) {
        errors.push(`${file.name}: ${err?.message ?? 'unknown error'}`);
      }
    }

    if (added.length > 0) {
      await persistManifest(existing);
    }
    return { added, errors };
  }, [persistManifest]);

  /** Update name and/or tags on an existing Extra. */
  const updateExtra = useCallback(async (id: string, patch: Partial<Pick<Extra, 'name' | 'tags'>>) => {
    const next = extrasRef.current.map(e => e.id === id ? { ...e, ...patch } : e);
    await persistManifest(next);
  }, [persistManifest]);

  /** Delete an Extra from the manifest and remove its image from disk. */
  const deleteExtra = useCallback(async (id: string) => {
    const target = extrasRef.current.find(e => e.id === id);
    const next = extrasRef.current.filter(e => e.id !== id);
    try {
      const api = (window as any).electronAPI;
      if (target && api?.extrasDeleteImage) {
        await api.extrasDeleteImage(target.filename);
      }
    } catch (_e) { /* non-fatal */ }
    await persistManifest(next);
  }, [persistManifest]);

  return { extras, loaded, addExtras, updateExtra, deleteExtra };
}
