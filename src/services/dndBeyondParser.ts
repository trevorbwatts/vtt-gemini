/**
 * D&D Beyond Character Parser
 * 
 * Parses the JSON response from the D&D Beyond character-service API
 * into our local Combatant type.
 * 
 * Reference: based on the DDB JSON structure documented by ddb2alchemy
 * (https://github.com/alchemyrpg/ddb2alchemy)
 */

import { Combatant, ClassDefinition, MonsterAction } from '../types';

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
  // Medium armor caps DEX bonus at 2
  if (equipped.some((item: any) => item.definition?.armorTypeId === 2)) {
    dexBonus = Math.min(dexBonus, 2);
  }
  // Heavy armor negates DEX bonus
  if (equipped.some((item: any) => item.definition?.armorTypeId === 3)) {
    dexBonus = 0;
  }

  return baseAc + bonusAc + dexBonus;
}

// --- Speed & Darkvision ---

function getSpeed(data: any): number {
  const walkingSpeed = (data.race?.weightSpeeds?.normal?.walk || 30);
  const bonusSpeed = sumModifiers(data, 'bonus', 'speed');
  return walkingSpeed + bonusSpeed;
}

function getDarkvision(data: any): number {
  // Check racial traits and modifiers for darkvision
  const mods = getAllModifiers(data).filter(m => m.subType === 'darkvision');
  if (mods.length > 0) {
    return Math.max(...mods.map(m => m.value || m.fixedValue || 60));
  }
  // Check racial traits text
  const racialTraits = data.race?.racialTraits || [];
  const dvTrait = racialTraits.find((t: any) => t.definition?.name?.toLowerCase().includes('darkvision'));
  if (dvTrait) return 60; // Default darkvision range
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

// --- Spells ---

function getSpells(data: any): { name: string; level: number; desc: string }[] {
  const spells: { name: string; level: number; desc: string }[] = [];
  const seen = new Set<string>();

  const addSpell = (spell: any) => {
    const def = spell.definition || spell;
    if (!def?.name || seen.has(def.name)) return;
    seen.add(def.name);
    spells.push({
      name: def.name,
      level: def.level || 0,
      desc: stripHtml(def.description || ''),
    });
  };

  // Class spells
  (data.classSpells || []).forEach((cs: any) => {
    (cs.spells || []).forEach(addSpell);
  });

  // Race/class direct spells
  if (data.spells) {
    (data.spells.race || []).forEach(addSpell);
    (data.spells.class || []).forEach(addSpell);
  }

  return spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// --- Actions (class features, racial traits) ---

function getActions(data: any): MonsterAction[] {
  const actions: MonsterAction[] = [];
  const seen = new Set<string>();

  const addAction = (name: string, desc: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    actions.push({ name, desc: stripHtml(desc || '') });
  };

  // Class features
  (data.classes || []).forEach((c: any) => {
    (c.definition?.classFeatures || []).forEach((f: any) => {
      if (f.requiredLevel <= c.level) {
        addAction(f.name, f.description);
      }
    });
    // Subclass features
    (c.subclassDefinition?.classFeatures || []).forEach((f: any) => {
      if (f.requiredLevel <= c.level) {
        addAction(f.name, f.description);
      }
    });
  });

  // Racial traits
  (data.race?.racialTraits || []).forEach((t: any) => {
    addAction(t.definition?.name, t.definition?.description);
  });

  // Feats
  (data.feats || []).forEach((f: any) => {
    addAction(f.definition?.name, f.definition?.description);
  });

  return actions;
}

// --- Utility ---

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Main Parser ---

export function parseDndBeyondCharacter(response: any): Omit<Combatant, 'id'> {
  // The character-service wraps in { data: { ... } }
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
    actions: getActions(data),
    spells: getSpells(data),
    avatar: data.decorations?.avatarUrl || undefined,
  };
}
