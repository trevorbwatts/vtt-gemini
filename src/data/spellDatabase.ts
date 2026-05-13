import spells2014 from './spells-2014.json';
import spells2024 from './spells-2024.json';

export interface SpellEntry {
  name: string;
  level: number;
  school: string;
  desc: string;
  range: number;
  aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
  aoeSize?: number;
  effectRadius?: number;
  saveAbility?: string;
  halfDamageOnSave?: boolean;
  source?: '2014' | '2024';
  // --- wall-shape spells (Wall of Sand, etc.) ---
  shapeType?: 'wall';
  maxLength?: number;
  maxThickness?: number;
  blocksVision?: boolean;
  // --- map interaction ---
  /** How the spell behaves on the map. Defaults to 'cast' if aoeType+aoeSize present, else 'none'. */
  mapInteraction?: 'cast' | 'place' | 'cast-and-place' | 'cast-and-emanate' | 'summon' | 'exception' | 'none';
  damageType?: string;
  /** What happens when the cast is confirmed. 'damage-save': existing damage modal. 'damage-auto': all fail, damage modal. 'condition': condition modal. */
  saveEffect?: 'damage-save' | 'damage-auto' | 'condition';
  /** Condition to apply on failed save (used with saveEffect: 'condition'). */
  condition?: string;
}

const allSpells: SpellEntry[] = [
  ...(spells2014 as SpellEntry[]),
  ...(spells2024 as SpellEntry[]),
];

// Simple name → first match (prefers 2014 since it's first in the array)
const spellMap = new Map<string, SpellEntry>();
allSpells.forEach(spell => {
  const key = spell.name.toLowerCase();
  if (!spellMap.has(key)) spellMap.set(key, spell);
});

// Composite key for edition-specific lookups
const spellMapByEdition = new Map<string, SpellEntry>();
allSpells.forEach(spell => {
  spellMapByEdition.set(`${spell.name.toLowerCase()}|${spell.source}`, spell);
});

/** Look up a spell by name (case-insensitive). When `source` is provided, prefer that edition. */
export function lookupSpell(name: string, source?: '2014' | '2024'): SpellEntry | undefined {
  const key = name.toLowerCase().trim();
  if (source) {
    const editionMatch = spellMapByEdition.get(`${key}|${source}`);
    if (editionMatch) return editionMatch;
  }
  return spellMap.get(key);
}

/** Look up multiple spell names and return structured Combatant-compatible spell objects */
export function resolveSpells(spellNames: string[], source?: '2014' | '2024'): {
  name: string;
  level: number;
  desc: string;
  school?: string;
  aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
  aoeSize?: number;
  effectRadius?: number;
  range?: number;
  saveAbility?: string;
  halfDamageOnSave?: boolean;
  shapeType?: 'wall';
  maxLength?: number;
  maxThickness?: number;
  blocksVision?: boolean;
  mapInteraction?: 'cast' | 'place' | 'cast-and-place' | 'cast-and-emanate' | 'summon' | 'exception' | 'none';
  damageType?: string;
  saveEffect?: 'damage-save' | 'damage-auto' | 'condition';
  condition?: string;
}[] {
  const results: ReturnType<typeof resolveSpells> = [];
  const seen = new Set<string>();

  for (const rawName of spellNames) {
    const cleanName = rawName.trim()
      .replace(/\(.*$/g, '')   // remove parenthetical suffixes
      .replace(/\*$/g, '')      // remove asterisks
      .trim();

    if (!cleanName || cleanName.length < 3 || seen.has(cleanName.toLowerCase())) continue;
    seen.add(cleanName.toLowerCase());

    const entry = lookupSpell(cleanName, source);
    if (entry) {
      results.push({
        name: entry.name,
        level: entry.level,
        desc: entry.desc,
        ...(entry.school ? { school: entry.school } : {}),
        ...(entry.aoeType ? { aoeType: entry.aoeType } : {}),
        ...(entry.aoeSize ? { aoeSize: entry.aoeSize } : {}),
        ...(entry.effectRadius ? { effectRadius: entry.effectRadius } : {}),
        ...(entry.range != null ? { range: entry.range } : {}),
        ...(entry.saveAbility ? { saveAbility: entry.saveAbility } : {}),
        ...(entry.halfDamageOnSave ? { halfDamageOnSave: entry.halfDamageOnSave } : {}),
        ...(entry.shapeType ? { shapeType: entry.shapeType } : {}),
        ...(entry.maxLength != null ? { maxLength: entry.maxLength } : {}),
        ...(entry.maxThickness != null ? { maxThickness: entry.maxThickness } : {}),
        ...(entry.blocksVision ? { blocksVision: entry.blocksVision } : {}),
        ...(entry.mapInteraction ? { mapInteraction: entry.mapInteraction } : {}),
        ...(entry.damageType ? { damageType: entry.damageType } : {}),
        ...(entry.saveEffect ? { saveEffect: entry.saveEffect } : {}),
        ...(entry.condition ? { condition: entry.condition } : {}),
      });
    } else {
      // Spell not in database — include with minimal info
      results.push({
        name: cleanName,
        level: 0,
        desc: '',
      });
    }
  }

  return results.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** Search spells by name (case-insensitive substring match). Returns up to `limit` results sorted by level. */
export function searchSpells(
  query: string,
  limit = 20,
  filter?: { sources?: Set<'2014' | '2024'>; aoeOnly?: boolean },
): SpellEntry[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase().trim();
  const results: SpellEntry[] = [];
  const seen = new Set<string>();

  for (const spell of allSpells) {
    if (!spell.name.toLowerCase().includes(lower)) continue;
    if (filter?.sources && spell.source && !filter.sources.has(spell.source)) continue;
    if (filter?.aoeOnly && !(spell.aoeType && spell.aoeSize)) continue;

    // Deduplicate by name when both editions match
    const dedupeKey = spell.name.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push(spell);
  }
  return results.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, limit);
}

/**
 * Parse a Spellcasting special ability description and return structured spells.
 *
 * Expected format:
 *   "The creature casts ... (spell save DC X):\nAt will: Spell1, Spell2\n1/day each: Spell3, Spell4"
 */
export function parseSpellcastingTrait(desc: string): {
  preamble: string;
  saveDc?: number;
  spells: ReturnType<typeof resolveSpells>;
} {
  const lines = desc.split('\n').filter(Boolean);
  const preamble = lines[0] || '';
  const spellNames: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const spellsPart = line.substring(colonIdx + 1)
      // Strip parenthetical notes before splitting on commas (e.g. "Shapechange (Beast or Humanoid form only, ...)")
      .replace(/\([^)]*\)/g, '');
    spellsPart.split(',').forEach(s => {
      const name = s.trim()
        .replace(/\(.*$/g, '')
        .replace(/\*$/g, '')
        .trim();
      if (name && name.length > 2) {
        spellNames.push(name);
      }
    });
  }

  const dcMatch = preamble.match(/DC\s*(\d+)/i);
  const saveDc = dcMatch ? parseInt(dcMatch[1], 10) : undefined;

  return {
    preamble,
    saveDc,
    spells: resolveSpells(spellNames),
  };
}
