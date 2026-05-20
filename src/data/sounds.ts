import { useEffect, useState, useCallback, useRef } from 'react';
import type { SoundAsset, SoundCategory } from '../types';

/**
 * Global sound library — audio files reusable across campaigns. Stored on disk:
 * public/sounds/manifest.json + public/sounds/<filename>. Mirrors the Extras
 * pattern: manifest is loaded on startup, writes go through Electron IPC so
 * the project's source folder gets updated and can be committed to git.
 */

const MANIFEST_URL = '/sounds/manifest.json';

export function soundUrl(filename: string): string {
  return `/sounds/${filename}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sound';
}

export function fileExt(file: File | string): string {
  const name = typeof file === 'string' ? file : file.name;
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'mp3';
}

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

export function filterSounds(
  sounds: SoundAsset[],
  query: string,
  category: SoundCategory | 'all',
): SoundAsset[] {
  const q = query.trim().toLowerCase();
  return sounds.filter(s => {
    if (category !== 'all' && s.category !== category) return false;
    if (q) {
      const hay = `${s.name.toLowerCase()} ${s.tags.join(' ').toLowerCase()}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function loadManifestFromDisk(): Promise<SoundAsset[]> {
  try {
    const api = (window as any).electronAPI;
    if (api?.soundsLoadManifest) {
      const res = await api.soundsLoadManifest();
      if (!res?.error && Array.isArray(res?.manifest)) return res.manifest;
    }
  } catch (_e) { /* fall through */ }
  try {
    const r = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!r.ok) return [];
    const json = await r.json();
    return Array.isArray(json) ? json : [];
  } catch (_e) {
    return [];
  }
}

export function useSounds() {
  const [sounds, setSounds] = useState<SoundAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const soundsRef = useRef<SoundAsset[]>([]);
  soundsRef.current = sounds;

  useEffect(() => {
    let cancelled = false;
    loadManifestFromDisk().then(list => {
      if (cancelled) return;
      setSounds(list);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const persistManifest = useCallback(async (next: SoundAsset[]) => {
    setSounds(next);
    try {
      const api = (window as any).electronAPI;
      if (api?.soundsSaveManifest) {
        await api.soundsSaveManifest(next);
      }
    } catch (_e) { /* non-fatal */ }
  }, []);

  /** Bulk import audio files; meta supplies name + category + tags per file. */
  const addSounds = useCallback(async (
    files: File[],
    metaForFile: (file: File, index: number) => { name: string; category: SoundCategory; tags: string[] }
  ): Promise<{ added: SoundAsset[]; errors: string[] }> => {
    const api = (window as any).electronAPI;
    const added: SoundAsset[] = [];
    const errors: string[] = [];
    const existing = [...soundsRef.current];
    const usedFilenames = new Set(existing.map(e => e.filename));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = metaForFile(file, i);
      const baseSlug = slugify(meta.name || file.name.replace(/\.[^.]+$/, '')) || 'sound';
      const ext = fileExt(file);
      let filename = `${baseSlug}.${ext}`;
      let n = 1;
      while (usedFilenames.has(filename)) {
        filename = `${baseSlug}-${n++}.${ext}`;
      }
      usedFilenames.add(filename);

      try {
        const dataUrl = await readFileAsDataUrl(file);
        if (api?.soundsSaveAudio) {
          const res = await api.soundsSaveAudio({ filename, dataUrl });
          if (!res?.ok) {
            errors.push(`${file.name}: ${res?.error ?? 'save failed'}`);
            continue;
          }
        }
        const asset: SoundAsset = {
          id: filename,
          filename,
          name: meta.name || baseSlug,
          category: meta.category,
          tags: meta.tags.filter(t => t.trim().length > 0),
        };
        existing.push(asset);
        added.push(asset);
      } catch (err: any) {
        errors.push(`${file.name}: ${err?.message ?? 'unknown error'}`);
      }
    }

    if (added.length > 0) {
      await persistManifest(existing);
    }
    return { added, errors };
  }, [persistManifest]);

  const updateSound = useCallback(async (
    id: string,
    patch: Partial<Pick<SoundAsset, 'name' | 'category' | 'tags'>>,
  ) => {
    const next = soundsRef.current.map(s => s.id === id ? { ...s, ...patch } : s);
    await persistManifest(next);
  }, [persistManifest]);

  const deleteSound = useCallback(async (id: string) => {
    const target = soundsRef.current.find(s => s.id === id);
    const next = soundsRef.current.filter(s => s.id !== id);
    try {
      const api = (window as any).electronAPI;
      if (target && api?.soundsDeleteAudio) {
        await api.soundsDeleteAudio(target.filename);
      }
    } catch (_e) { /* non-fatal */ }
    await persistManifest(next);
  }, [persistManifest]);

  return { sounds, loaded, addSounds, updateSound, deleteSound };
}
