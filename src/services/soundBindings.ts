/**
 * Sound Bindings — DM-configurable mappings from game events to sound asset ids.
 *
 * Two kinds of bindings:
 * - Built-in interactions (door open/close, window open/close): four named slots.
 * - Spell sounds: per-spell-name → soundId map, populated lazily as the DM
 *   binds sounds to spells they care about.
 *
 * Stored in localStorage under "vtt_sound_bindings". Lives on the DM machine
 * — not part of the campaign file (so the same library can power any campaign).
 */

export interface SoundBindings {
  doorOpen: string | null;
  doorClose: string | null;
  windowOpen: string | null;
  windowClose: string | null;
  /** spellName → soundId. Names are matched case-sensitively against the spell DB. */
  spells: Record<string, string>;
}

const STORAGE_KEY = 'vtt_sound_bindings';

export const EMPTY_BINDINGS: SoundBindings = {
  doorOpen: null,
  doorClose: null,
  windowOpen: null,
  windowClose: null,
  spells: {},
};

export function loadSoundBindings(): SoundBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_BINDINGS, spells: {} };
    const parsed = JSON.parse(raw);
    return {
      doorOpen: parsed.doorOpen ?? null,
      doorClose: parsed.doorClose ?? null,
      windowOpen: parsed.windowOpen ?? null,
      windowClose: parsed.windowClose ?? null,
      spells: (parsed.spells && typeof parsed.spells === 'object') ? parsed.spells : {},
    };
  } catch {
    return { ...EMPTY_BINDINGS, spells: {} };
  }
}

export function saveSoundBindings(b: SoundBindings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch { /* non-fatal */ }
}

/** Convenience: get the sound id bound to a spell, or null if unbound. */
export function getSpellSoundId(spellName: string): string | null {
  const b = loadSoundBindings();
  return b.spells[spellName] ?? null;
}
