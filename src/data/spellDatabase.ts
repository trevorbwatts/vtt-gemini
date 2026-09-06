import spellData from './spells.json';

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

const allSpells: SpellEntry[] = spellData as SpellEntry[];

const spellMap = new Map<string, SpellEntry>();
allSpells.forEach(spell => {
  spellMap.set(spell.name.toLowerCase(), spell);
});

/** Look up a spell by name (case-insensitive). */
export function lookupSpell(name: string): SpellEntry | undefined {
  return spellMap.get(name.toLowerCase().trim());
}

/** Look up multiple spell names and return structured Combatant-compatible spell objects */
export function resolveSpells(spellNames: string[]): {
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

    const entry = lookupSpell(cleanName);
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
  filter?: { aoeOnly?: boolean },
): SpellEntry[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase().trim();
  const results: SpellEntry[] = [];

  for (const spell of allSpells) {
    if (!spell.name.toLowerCase().includes(lower)) continue;
    if (filter?.aoeOnly && !(spell.aoeType && spell.aoeSize)) continue;

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
