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

import { Combatant, ClassDefinition } from '../types';

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

function getSpells(data: any): NonNullable<Combatant['spells']> {
  const spells: NonNullable<Combatant['spells']> = [];
  const seen = new Set<string>();

  const addSpell = (spell: any) => {
    const def = spell.definition || spell;
    if (!def?.name || seen.has(def.name)) return;
    if (spell.isAssigned === false) return;
    if (def.isHomebrew === true) return;
    seen.add(def.name);

    const aoeType = normalizeAoeType(def.range?.aoeType);
    const aoeSize = def.range?.aoeValue || undefined;
    const range   = def.range?.rangeValue ?? undefined;
    const saveAbility = def.saveDcAbilityId
      ? SAVE_ABILITY_NAMES[def.saveDcAbilityId as number]
      : undefined;

    spells.push({
      name: def.name,
      level: def.level || 0,
      desc: sanitizeHtml(def.description || ''),
      ...(aoeType    ? { aoeType }    : {}),
      ...(aoeSize    ? { aoeSize }    : {}),
      ...(range != null ? { range }   : {}),
      ...(saveAbility ? { saveAbility } : {}),
    });
  };

  (data.classSpells || []).forEach((cs: any) => (cs.spells || []).forEach(addSpell));
  if (data.spells) {
    (data.spells.race  || []).forEach(addSpell);
    (data.spells.class || []).forEach(addSpell);
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

// --- Main Parser ---

export function parseDndBeyondCharacter(response: any): Omit<Combatant, 'id'> {
  const data = response?.data || response;
  const level = getLevel(data);

  return {
    name: data.name || 'Unknown Character',
    initiative: getStatBonus(data, STAT_IDS.DEX),
    hp: getCurrentHp(data),
    maxHp: getMaxHp(data),
    ac: getArmorClass(data),
    type: 'player',
    species: data.race?.fullName || data.race?.baseRaceName,
    speed: getSpeed(data),
    darkvision: getDarkvision(data),
    classes: getClasses(data),
    dndBeyondId: String(data.id || ''),
    proficiencyBonus: PROFICIENCY_BY_LEVEL[level] || 2,
    stats: {
      str: getStatValue(data, STAT_IDS.STR),
      dex: getStatValue(data, STAT_IDS.DEX),
      con: getStatValue(data, STAT_IDS.CON),
      int: getStatValue(data, STAT_IDS.INT),
      wis: getStatValue(data, STAT_IDS.WIS),
      cha: getStatValue(data, STAT_IDS.CHA),
    },
    spells: getSpells(data),
    avatar: data.decorations?.avatarUrl || undefined,
  };
}
