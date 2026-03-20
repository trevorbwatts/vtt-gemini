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
      desc: sanitizeHtml(def.description || ''),
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

// --- Actions (activatable combat/resource abilities from DDB top-level actions) ---

function getActions(data: any): MonsterAction[] {
  const seen = new Set<string>();
  const result: MonsterAction[] = [];
  const allGroups = [
    ...(data.actions?.class || []),
    ...(data.actions?.race || []),
    ...(data.actions?.feat || []),
    ...(data.actions?.background || []),
    ...(data.actions?.item || []),
  ];
  for (const a of allGroups) {
    const name = a.name;
    const desc = a.snippet ? stripHtml(a.snippet) : sanitizeHtml(a.description || '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({ name, desc });
  }
  return result;
}

// --- Features & Traits (class features, subclass features, racial traits) ---

function getFeatures(data: any): { name: string; desc: string; source?: string }[] {
  const seen = new Set<string>();
  const result: { name: string; desc: string; source?: string }[] = [];

  for (const c of data.classes || []) {
    const className = c.definition?.name || 'Class';
    for (const f of c.definition?.classFeatures || []) {
      if (f.requiredLevel <= c.level && f.name && !seen.has(f.name)) {
        seen.add(f.name);
        result.push({ name: f.name, desc: sanitizeHtml(f.description || ''), source: className });
      }
    }
    const subName = c.subclassDefinition?.name;
    for (const f of c.subclassDefinition?.classFeatures || []) {
      if (f.requiredLevel <= c.level && f.name && !seen.has(f.name)) {
        seen.add(f.name);
        result.push({ name: f.name, desc: sanitizeHtml(f.description || ''), source: subName || className });
      }
    }
  }

  const speciesName = data.race?.fullName || data.race?.baseRaceName || 'Species';
  for (const t of data.race?.racialTraits || []) {
    const name = t.definition?.name;
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push({ name, desc: sanitizeHtml(t.definition?.description || ''), source: speciesName });
    }
  }

  return result;
}

// --- Feats ---

function getFeats(data: any): { name: string; desc: string }[] {
  return (data.feats || [])
    .filter((f: any) => f.definition?.name)
    .map((f: any) => ({
      name: f.definition.name,
      desc: sanitizeHtml(f.definition.description || ''),
    }));
}

// --- Saving Throws ---

const SAVE_SUBTYPES: Record<string, string> = {
  str: 'strength-saving-throws',
  dex: 'dexterity-saving-throws',
  con: 'constitution-saving-throws',
  int: 'intelligence-saving-throws',
  wis: 'wisdom-saving-throws',
  cha: 'charisma-saving-throws',
};

function getSavingThrows(data: any): Record<string, { modifier: number; proficient: boolean }> {
  const mods = getAllModifiers(data);
  const prof = PROFICIENCY_BY_LEVEL[getLevel(data)] || 2;
  const result: Record<string, { modifier: number; proficient: boolean }> = {};

  for (const [ability, subType] of Object.entries(SAVE_SUBTYPES)) {
    const statId = { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6 }[ability]!;
    const abilityMod = getStatBonus(data, statId);
    const proficient = mods.some(m => m.type === 'proficiency' && m.subType === subType);
    result[ability] = { modifier: abilityMod + (proficient ? prof : 0), proficient };
  }

  return result;
}

// --- Skills ---

const SKILLS: { name: string; ability: string; subType: string }[] = [
  { name: 'Acrobatics',     ability: 'dex', subType: 'acrobatics' },
  { name: 'Animal Handling',ability: 'wis', subType: 'animal-handling' },
  { name: 'Arcana',         ability: 'int', subType: 'arcana' },
  { name: 'Athletics',      ability: 'str', subType: 'athletics' },
  { name: 'Deception',      ability: 'cha', subType: 'deception' },
  { name: 'History',        ability: 'int', subType: 'history' },
  { name: 'Insight',        ability: 'wis', subType: 'insight' },
  { name: 'Intimidation',   ability: 'cha', subType: 'intimidation' },
  { name: 'Investigation',  ability: 'int', subType: 'investigation' },
  { name: 'Medicine',       ability: 'wis', subType: 'medicine' },
  { name: 'Nature',         ability: 'int', subType: 'nature' },
  { name: 'Perception',     ability: 'wis', subType: 'perception' },
  { name: 'Performance',    ability: 'cha', subType: 'performance' },
  { name: 'Persuasion',     ability: 'cha', subType: 'persuasion' },
  { name: 'Religion',       ability: 'int', subType: 'religion' },
  { name: 'Sleight of Hand',ability: 'dex', subType: 'sleight-of-hand' },
  { name: 'Stealth',        ability: 'dex', subType: 'stealth' },
  { name: 'Survival',       ability: 'wis', subType: 'survival' },
];

const STAT_ID_MAP: Record<string, number> = {
  str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6,
};

function getSkills(data: any): { name: string; ability: string; modifier: number; proficient: boolean; expertise: boolean }[] {
  const mods = getAllModifiers(data);
  const prof = PROFICIENCY_BY_LEVEL[getLevel(data)] || 2;

  return SKILLS.map(({ name, ability, subType }) => {
    const abilityMod = getStatBonus(data, STAT_ID_MAP[ability]);
    const proficient = mods.some(m => m.type === 'proficiency' && m.subType === subType);
    const expertise = mods.some(m => m.type === 'expertise' && m.subType === subType);
    const bonus = expertise ? prof * 2 : proficient ? prof : 0;
    return { name, ability, modifier: abilityMod + bonus, proficient, expertise };
  });
}

// --- Inventory ---

function getInventory(data: any): { name: string; quantity?: number; desc?: string; equipped?: boolean }[] {
  return (data.inventory || [])
    .filter((item: any) => item.definition?.name)
    .map((item: any) => ({
      name: item.definition.name,
      quantity: item.quantity ?? 1,
      desc: item.definition.description ? sanitizeHtml(item.definition.description) : undefined,
      equipped: item.equipped ?? false,
    }));
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

// Keeps safe formatting tags (<p>, <strong>, <em>, <br>, <ul>, <ol>, <li>)
// so rich descriptions can be rendered as HTML in the UI.
function sanitizeHtml(html: string): string {
  const allowed = ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li'];
  return html
    // Strip attributes from tags and drop disallowed tags entirely
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
    features: getFeatures(data),
    feats: getFeats(data),
    inventory: getInventory(data),
    skills: getSkills(data),
    savingThrows: getSavingThrows(data),
    spells: getSpells(data),
    avatar: data.decorations?.avatarUrl || undefined,
  };
}
