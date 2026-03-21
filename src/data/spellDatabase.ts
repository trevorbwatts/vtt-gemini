import spellData from './spells.json';

export interface SpellEntry {
  name: string;
  level: number;
  school: string;
  desc: string;
  range: number;
  aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
  aoeSize?: number;
  saveAbility?: string;
}

// Build a lookup map (lowercase name → spell entry) for fast matching
const spellMap = new Map<string, SpellEntry>();
(spellData as SpellEntry[]).forEach(spell => {
  spellMap.set(spell.name.toLowerCase(), spell);
});

/** Look up a spell by name (case-insensitive). Returns undefined if not found. */
export function lookupSpell(name: string): SpellEntry | undefined {
  return spellMap.get(name.toLowerCase().trim());
}

/** Look up multiple spell names and return structured Combatant-compatible spell objects */
export function resolveSpells(spellNames: string[]): {
  name: string;
  level: number;
  desc: string;
  aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
  aoeSize?: number;
  range?: number;
  saveAbility?: string;
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
        ...(entry.aoeType ? { aoeType: entry.aoeType } : {}),
        ...(entry.aoeSize ? { aoeSize: entry.aoeSize } : {}),
        ...(entry.range != null ? { range: entry.range } : {}),
        ...(entry.saveAbility ? { saveAbility: entry.saveAbility } : {}),
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

/**
 * Parse a Spellcasting special ability description and return structured spells.
 *
 * Expected format:
 *   "The creature casts ... (spell save DC X):\nAt will: Spell1, Spell2\n1/day each: Spell3, Spell4"
 */
export function parseSpellcastingTrait(desc: string): {
  preamble: string;
  spells: ReturnType<typeof resolveSpells>;
} {
  const lines = desc.split('\n').filter(Boolean);
  const preamble = lines[0] || '';
  const spellNames: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const spellsPart = line.substring(colonIdx + 1);
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

  return {
    preamble,
    spells: resolveSpells(spellNames),
  };
}
