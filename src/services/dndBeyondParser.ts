/**
 * D&D Beyond Character Parser
 *
 * Parses the JSON response from the D&D Beyond character-service API
 * into our local Combatant type.
 *
 * Only imports what the VTT actually needs:
 *   - Core combat stats (HP, AC, Speed, Darkvision, Initiative, Prof)
 *   - Ability scores
 *   - Spells with AoE geometry (for the future Player Drawer casting system)
 */

import { Combatant, ClassDefinition, MonsterAction } from '../types';
import { lookupSpell } from '../data/spellDatabase';

// Stat IDs used by D&D Beyond
const STAT_IDS = { STR: 1, DEX: 2, CON: 3, INT: 4, WIS: 5, CHA: 6 } as const;

const STAT_BONUS: Record<number, number> = {};
for (let i = 1; i <= 30; i++) STAT_BONUS[i] = Math.floor((i - 10) / 2);

const PROFICIENCY_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

const STAT_NAMES: Record<number, string> = {
  1: 'strength', 2: 'dexterity', 3: 'constitution',
  4: 'intelligence', 5: 'wisdom', 6: 'charisma',
};

// DDB saveDcAbilityId → short ability name
const SAVE_ABILITY_NAMES: Record<number, string> = {
  1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha',
};

// --- Modifier Helpers ---

interface DdbModifier {
  type: string;
  subType: string;
  value: number;
  statId: number;
  fixedValue: number;
  [key: string]: any;
}

function getAllModifiers(data: any): DdbModifier[] {
  if (!data.modifiers) return [];
  return Object.values(data.modifiers).flat() as DdbModifier[];
}

function sumModifiers(data: any, matchType: string, matchSubType: string): number {
  return getAllModifiers(data)
    .filter(m => m.type === matchType && m.subType === matchSubType)
    .reduce((sum, m) => sum + (m.value || m.fixedValue || 0), 0);
}

function maxModifier(data: any, matchType: string, matchSubType: string): number {
  return getAllModifiers(data)
    .filter(m => m.type === matchType && m.subType === matchSubType)
    .reduce((max, m) => Math.max(max, m.value || m.fixedValue || 0), 0);
}

// --- Stat Calculations ---

function getStatValue(data: any, statId: number): number {
  const baseStat = data.stats?.find((s: any) => s.id === statId)?.value || 10;
  const overrideStat = maxModifier(data, 'set-base', `${STAT_NAMES[statId]}-score`);
  const bonuses = sumModifiers(data, 'bonus', `${STAT_NAMES[statId]}-score`);
  return (overrideStat || baseStat) + bonuses;
}

function getStatBonus(data: any, statId: number): number {
  return STAT_BONUS[getStatValue(data, statId)] || 0;
}

// --- Level & Proficiency ---

function getLevel(data: any): number {
  return (data.classes || []).reduce((total: number, c: any) => total + (c.level || 0), 0);
}

// --- Initiative ---

/**
 * Total initiative bonus = Dex mod + any modifiers with subType 'initiative'.
 * Covers Alert (flat bonus), Jack of All Trades (half-proficiency),
 * and 2024 features that grant full proficiency to initiative.
 */
function getInitiativeBonus(data: any): number {
  const dex = getStatValue(data, STAT_IDS.DEX);
  const dexMod = STAT_BONUS[dex] ?? 0;

  const flatBonus = sumModifiers(data, 'bonus', 'initiative');

  const prof = PROFICIENCY_BY_LEVEL[getLevel(data)] || 2;
  const mods = getAllModifiers(data);
  const hasHalfProf = mods.some(m => m.type === 'half-proficiency' && m.subType === 'initiative');
  const hasFullProf = mods.some(m => m.type === 'proficiency' && m.subType === 'initiative');
  const profBonus = hasFullProf ? prof : hasHalfProf ? Math.floor(prof / 2) : 0;

  return dexMod + flatBonus + profBonus;
}

// --- HP Calculations ---

function getMaxHp(data: any): number {
  const conBonus = getStatBonus(data, STAT_IDS.CON);
  const levels = getLevel(data);
  const baseHp = (data.baseHitPoints || 0) + conBonus * levels;
  return (data.overrideHitPoints || baseHp) + (data.bonusHitPoints || 0);
}

function getCurrentHp(data: any): number {
  const maxHp = getMaxHp(data);
  return maxHp - (data.removedHitPoints || 0) + (data.temporaryHitPoints || 0);
}

// --- AC Calculation ---

function getArmorClass(data: any): number {
  const inventory = data.inventory || [];
  const equipped = inventory.filter((item: any) => item.equipped && item.definition?.armorTypeId);
  const baseAc = equipped.reduce((ac: number, item: any) => ac + (item.definition?.armorClass || 0), 0) || 10;
  const bonusAc = sumModifiers(data, 'bonus', 'armor-class');

  let dexBonus = getStatBonus(data, STAT_IDS.DEX);
  if (equipped.some((item: any) => item.definition?.armorTypeId === 2)) dexBonus = Math.min(dexBonus, 2);
  if (equipped.some((item: any) => item.definition?.armorTypeId === 3)) dexBonus = 0;

  return baseAc + bonusAc + dexBonus;
}

// --- Draconic Ancestry ---

const DRAGON_COLORS = ['black','blue','brass','bronze','copper','gold','green','red','silver','white'];

function getDraconicAncestry(data: any): string | undefined {
  // Only applies to Dragonborn characters
  const raceName = (data.race?.baseRaceName || data.race?.fullName || '').toLowerCase();
  if (!raceName.includes('dragonborn')) return undefined;

  const search = (str: string) => {
    const s = str.toLowerCase();
    return DRAGON_COLORS.find(c => s.includes(c));
  };

  // Strategy 1: color in fullName / subRaceName / subRaceShortName
  for (const field of ['fullName', 'subRaceName', 'subRaceShortName', 'baseRaceName']) {
    const found = search(data.race?.[field] || '');
    if (found) return found;
  }

  // Strategy 2: racial traits like "Draconic Ancestry (Red)"
  for (const trait of (data.race?.racialTraits || [])) {
    const found = search(trait.definition?.name || '');
    if (found) return found;
  }

  // Strategy 3: racial choices — find the "Draconic Ancestry" choice and read its selected option
  for (const choice of (data.choices?.race || [])) {
    const defName = (choice.definition?.name || '').toLowerCase();
    if (defName.includes('draconic') || defName.includes('ancestry') || defName.includes('dragon')) {
      const options: any[] = choice.definition?.options || [];
      const selected = options.find((o: any) => o.id === choice.optionValue);
      if (selected) {
        const found = search(selected.label || selected.name || '');
        if (found) return found;
      }
      // Also try string-searching the option keys directly
      for (const opt of options) {
        if (opt.id === choice.optionValue) {
          const found = search(JSON.stringify(opt));
          if (found) return found;
        }
      }
    }
  }

  // Strategy 4: scan all racial trait definitions for a color name
  for (const trait of (data.race?.racialTraits || [])) {
    const found = search(JSON.stringify(trait.definition || ''));
    if (found) return found;
  }

  return undefined;
}

// --- Speed & Darkvision ---

function getSpeed(data: any): number {
  const walkingSpeed = (data.race?.weightSpeeds?.normal?.walk || 30);
  const bonusSpeed = sumModifiers(data, 'bonus', 'speed');
  return walkingSpeed + bonusSpeed;
}

function getDarkvision(data: any): number {
  const mods = getAllModifiers(data).filter(m => m.subType === 'darkvision');
  if (mods.length > 0) return Math.max(...mods.map(m => m.value || m.fixedValue || 60));
  const racialTraits = data.race?.racialTraits || [];
  const dvTrait = racialTraits.find((t: any) => t.definition?.name?.toLowerCase().includes('darkvision'));
  if (dvTrait) return 60;
  return 0;
}

// --- Classes ---

function getClasses(data: any): ClassDefinition[] {
  return (data.classes || []).map((c: any) => ({
    name: c.definition?.name || 'Unknown',
    level: c.level || 1,
    subclass: c.subclassDefinition?.name,
  }));
}

// --- Spells (with AoE geometry for the Player Drawer) ---

// DDB aoeType can be a string ('Sphere', 'Cone', etc.) or a numeric ID
function normalizeAoeType(raw: any): 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | undefined {
  if (!raw) return undefined;
  const s = String(raw).toLowerCase();
  if (s === 'sphere'   || s === '1') return 'sphere';
  if (s === 'cone'     || s === '2') return 'cone';
  if (s === 'cube'     || s === '3') return 'cube';
  if (s === 'cylinder' || s === '4') return 'cylinder';
  if (s === 'line'     || s === '5') return 'line';
  return undefined;
}

function getSpellSaveDc(data: any): number | undefined {
  const level = getLevel(data);
  const prof = PROFICIENCY_BY_LEVEL[level] || 2;
  // Find the highest spellcasting ability modifier across all classes
  let bestMod = -Infinity;
  for (const cs of (data.classSpells || [])) {
    const abilityId = cs.spellCastingAbilityId;
    if (abilityId) {
      const mod = getStatBonus(data, abilityId);
      if (mod > bestMod) bestMod = mod;
    }
  }
  if (bestMod === -Infinity) return undefined;
  return 8 + prof + bestMod;
}

// DDB marks innate racial spells as at-will when they have no limitedUse
// AND they don't consume a spell slot (usesSpellSlot === false).
// Class spells typically don't have limitedUse either but DO use spell slots,
// so we can't use limitedUse alone as the marker.
function isAtWillInnate(spell: any): boolean {
  if (spell.limitedUse != null) return false;
  if (spell.usesSpellSlot === true) return false;
  return true;
}

function getAtWillSpells(data: any): NonNullable<Combatant['atWillSpells']> {
  const atWill: NonNullable<Combatant['atWillSpells']> = [];
  const seen = new Set<string>();

  // Only racial/innate sources — class spells are never at-will
  const sources: Array<{ spells: any[]; source: string }> = [
    { spells: data.spells?.race   || [], source: 'Racial Trait' },
    { spells: data.spells?.innate || [], source: 'Innate Spellcasting' },
  ];

  for (const { spells, source } of sources) {
    for (const spell of spells) {
      if (!isAtWillInnate(spell)) continue;
      const def = spell.definition || spell;
      if (!def?.name || seen.has(def.name)) continue;
      if (def.isHomebrew === true) continue;
      seen.add(def.name);
      atWill.push({ spellName: def.name, source });
    }
  }

  return atWill;
}

function getSpells(data: any, ruleset?: '2014' | '2024'): NonNullable<Combatant['spells']> {
  const spells: NonNullable<Combatant['spells']> = [];
  const seen = new Set<string>();

  // Pre-compute the set of at-will racial/innate spell names so we can skip
  // them here (they're surfaced via atWillSpells instead, to avoid duplication).
  const atWillNames = new Set<string>();
  for (const arr of [data.spells?.race || [], data.spells?.innate || []]) {
    for (const spell of arr) {
      if (isAtWillInnate(spell)) {
        const name = (spell.definition || spell)?.name;
        if (name) atWillNames.add(name);
      }
    }
  }

  // Every spell-source bucket that DDB exposes. We must iterate ALL of them
  // (not just race + class), otherwise spells granted by feats (e.g. Magic
  // Initiate → Mage Hand), items, or backgrounds get silently dropped on
  // import. This was the cause of two players seemingly having "the same"
  // Mage Hand but only one importing — one had it from their class, the
  // other from a feat that we weren't reading.
  const SPELL_SOURCE_KEYS = ['race', 'class', 'feat', 'item', 'background', 'condition'] as const;

  const addSpell = (spell: any) => {
    const def = spell.definition || spell;
    if (!def?.name || seen.has(def.name)) return;
    if (spell.isAssigned === false) return;
    if (def.isHomebrew === true) return;
    if (atWillNames.has(def.name)) return;
    seen.add(def.name);

    const aoeType = normalizeAoeType(def.range?.aoeType);
    const aoeSize = def.range?.aoeValue || undefined;
    const range   = def.range?.rangeValue ?? undefined;
    const saveAbility = def.saveDcAbilityId
      ? SAVE_ABILITY_NAMES[def.saveDcAbilityId as number]
      : undefined;

    const desc = sanitizeHtml(def.description || '');
    const halfDamageOnSave = /half (as much )?damage|half damage/i.test(desc);

    spells.push({
      name: def.name,
      level: def.level || 0,
      desc,
      ...(aoeType    ? { aoeType }    : {}),
      ...(aoeSize    ? { aoeSize }    : {}),
      ...(range != null ? { range }   : {}),
      ...(saveAbility ? { saveAbility } : {}),
      ...(halfDamageOnSave ? { halfDamageOnSave } : {}),
    });
  };

  (data.classSpells || []).forEach((cs: any) => (cs.spells || []).forEach(addSpell));
  if (data.spells) {
    for (const key of SPELL_SOURCE_KEYS) {
      (data.spells[key] || []).forEach(addSpell);
    }
  }

  // Domain/subclass spells aren't included in classSpells by DDB — they only
  // appear as an HTML table inside the subclass feature description.  Parse
  // them out and resolve via our local spell database.
  const level = getLevel(data);
  for (const cls of (data.classes || [])) {
    for (const feat of (cls.subclassDefinition?.classFeatures || [])) {
      if (!feat.name?.toLowerCase().includes('spell')) continue;
      const desc: string = feat.description || '';
      // Match table rows: <td>level</td><td>spell list</td>
      const rowRe = /<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<\/tr>/gi;
      let match: RegExpExecArray | null;
      while ((match = rowRe.exec(desc)) !== null) {
        const reqLevel = parseInt(match[1], 10);
        if (reqLevel > level) continue;
        const names = match[2].split(',').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          if (seen.has(name)) continue;
          seen.add(name);
          const entry = lookupSpell(name, ruleset);
          if (entry) {
            spells.push({
              name: entry.name,
              level: entry.level,
              desc: entry.desc,
              ...(entry.aoeType    ? { aoeType: entry.aoeType }    : {}),
              ...(entry.aoeSize    ? { aoeSize: entry.aoeSize }    : {}),
              ...(entry.range != null ? { range: entry.range }     : {}),
              ...(entry.saveAbility ? { saveAbility: entry.saveAbility } : {}),
              ...(entry.halfDamageOnSave ? { halfDamageOnSave: entry.halfDamageOnSave } : {}),
            });
          } else {
            spells.push({ name, level: 0, desc: '' });
          }
        }
      }
    }
  }

  return spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// --- Utility ---

function sanitizeHtml(html: string): string {
  const allowed = ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li'];
  return html
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi, (match, tag: string) => {
      const t = tag.toLowerCase();
      if (!allowed.includes(t)) return '';
      const closing = match.startsWith('</');
      if (closing) return `</${t}>`;
      if (t === 'br') return '<br/>';
      return `<${t}>`;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .trim();
}

// --- Player Actions (racial/class/feat features that show up as usable actions) ---

function getPlayerActions(data: any): MonsterAction[] | undefined {
  // D&D Beyond stores activatable actions under data.actions.{class,race,feat,item}
  const sources = [
    ...(data.actions?.class || []),
    ...(data.actions?.race  || []),
    ...(data.actions?.feat  || []),
  ];

  const actions: MonsterAction[] = sources
    .map((a: any) => ({
      name: (a.definition?.name || a.name || '').trim(),
      desc: sanitizeHtml(a.definition?.description || a.definition?.snippet || ''),
    }))
    .filter((a: MonsterAction) => a.name.length > 0);

  return actions.length > 0 ? actions : undefined;
}

// --- Main Parser ---

function getRuleset(data: any): '2014' | '2024' {
  if (data.gameVersionId === 2) return '2024';
  if (data.gameVersionId === 1) return '2014';
  // Heuristic: 2024 characters use sourceId 145 (2024 PHB) on their classes
  for (const cls of (data.classes || [])) {
    if (cls.definition?.sourceId === 145) return '2024';
  }
  return '2014';
}

export function parseDndBeyondCharacter(response: any): Omit<Combatant, 'id'> {
  const data = response?.data || response;
  const level = getLevel(data);
  const ruleset = getRuleset(data);

  const initBonus = getInitiativeBonus(data);

  return {
    name: data.name || 'Unknown Character',
    initiative: initBonus,
    initiativeBonus: initBonus,
    hp: getCurrentHp(data),
    maxHp: getMaxHp(data),
    ac: getArmorClass(data),
    type: 'player',
    species: data.race?.fullName || data.race?.baseRaceName,
    draconicAncestry: getDraconicAncestry(data),
    speed: getSpeed(data),
    darkvision: getDarkvision(data),
    classes: getClasses(data),
    dndBeyondId: String(data.id || ''),
    ruleset,
    proficiencyBonus: PROFICIENCY_BY_LEVEL[level] || 2,
    stats: {
      str: getStatValue(data, STAT_IDS.STR),
      dex: getStatValue(data, STAT_IDS.DEX),
      con: getStatValue(data, STAT_IDS.CON),
      int: getStatValue(data, STAT_IDS.INT),
      wis: getStatValue(data, STAT_IDS.WIS),
      cha: getStatValue(data, STAT_IDS.CHA),
    },
    spellSaveDc: getSpellSaveDc(data),
    spells: getSpells(data, ruleset),
    atWillSpells: getAtWillSpells(data),
    actions: getPlayerActions(data),
    avatar: data.decorations?.avatarUrl || undefined,
  };
}
