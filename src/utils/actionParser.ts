// ── Types ──

export interface DamageGroup {
  count: number;
  sides: number;
  modifier: number;
  damageType: string;
}

export interface ParsedAction {
  attackBonus: number;
  damageGroups: DamageGroup[];
}

export interface DamageRollResult {
  rolls: number[];
  modifier: number;
  total: number;
  damageType: string;
  diceNotation: string; // e.g. "2d10"
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface ActionRollResult {
  attackRoll: number;
  attackBonus: number;
  attackTotal: number;
  isCrit: boolean;
  isFumble: boolean;
  damageResults: DamageRollResult[];
  totalDamage: number;
  rollMode: RollMode;
  d20Rolls?: [number, number]; // both dice when adv/dis
}

// ── Parser ──

const ATTACK_BONUS_RE =
  /(?:^m,r\s*|(?:Melee|Ranged|Melee or Ranged)\s+(?:Weapon\s+)?Attack(?:\s+Roll)?:\s*)([+-]\d+)/i;

const DAMAGE_GROUP_RE =
  /(\d+)\s*\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s*(\w+)\s*damage/gi;

export function parseAction(desc: string): ParsedAction | null {
  const atkMatch = desc.match(ATTACK_BONUS_RE);
  if (!atkMatch) return null;

  const attackBonus = parseInt(atkMatch[1], 10);

  // Find the "Hit:" section, then truncate at the first standalone " or " to skip conditional damage
  const hitIdx = desc.search(/Hit:\s*/i);
  if (hitIdx === -1) return null;

  let hitText = desc.slice(hitIdx);
  const orIdx = hitText.search(/\bor\s+\d+\s*\(/);
  if (orIdx !== -1) hitText = hitText.slice(0, orIdx);

  const damageGroups: DamageGroup[] = [];
  let m: RegExpExecArray | null;
  DAMAGE_GROUP_RE.lastIndex = 0;
  while ((m = DAMAGE_GROUP_RE.exec(hitText)) !== null) {
    const sign = m[4] === '-' ? -1 : 1;
    damageGroups.push({
      count: parseInt(m[2], 10),
      sides: parseInt(m[3], 10),
      modifier: m[5] ? sign * parseInt(m[5], 10) : 0,
      damageType: m[6].charAt(0).toUpperCase() + m[6].slice(1).toLowerCase(),
    });
  }

  if (damageGroups.length === 0) return null;

  return { attackBonus, damageGroups };
}

// ── Roller ──

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollAction(parsed: ParsedAction, rollMode: RollMode = 'normal'): ActionRollResult {
  let attackRoll: number;
  let d20Rolls: [number, number] | undefined;

  if (rollMode === 'advantage' || rollMode === 'disadvantage') {
    const a = rollDie(20);
    const b = rollDie(20);
    d20Rolls = [a, b];
    attackRoll = rollMode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  } else {
    attackRoll = rollDie(20);
  }

  const isCrit = attackRoll === 20;
  const isFumble = attackRoll === 1;
  const attackTotal = attackRoll + parsed.attackBonus;

  const damageResults: DamageRollResult[] = parsed.damageGroups.map(g => {
    const diceCount = isCrit ? g.count * 2 : g.count;
    const rolls: number[] = [];
    for (let i = 0; i < diceCount; i++) {
      rolls.push(rollDie(g.sides));
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + g.modifier;
    return { rolls, modifier: g.modifier, total: Math.max(0, total), damageType: g.damageType, diceNotation: `${g.count}d${g.sides}` };
  });

  const totalDamage = damageResults.reduce((sum, r) => sum + r.total, 0);

  return { attackRoll, attackBonus: parsed.attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage, rollMode, d20Rolls };
}

// ── AOE damage-only roller (no attack roll) ──

const AOE_DAMAGE_GROUP_RE =
  /(\d+)\s*\((\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\)\s*(\w+)\s*damage/gi;

/**
 * Parse damage groups from an AOE action description (no attack bonus required).
 * Returns null if no dice damage is found.
 */
export function parseAoeDamage(desc: string): DamageGroup[] | null {
  const groups: DamageGroup[] = [];
  let m: RegExpExecArray | null;
  AOE_DAMAGE_GROUP_RE.lastIndex = 0;
  while ((m = AOE_DAMAGE_GROUP_RE.exec(desc)) !== null) {
    const sign = m[4] === '-' ? -1 : 1;
    groups.push({
      count: parseInt(m[2], 10),
      sides: parseInt(m[3], 10),
      modifier: m[5] ? sign * parseInt(m[5], 10) : 0,
      damageType: m[6].charAt(0).toUpperCase() + m[6].slice(1).toLowerCase(),
    });
  }
  return groups.length > 0 ? groups : null;
}

// ── Spell damage parser — handles bare dice format used in spell descriptions ──

const BARE_DICE_RE = /\b(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?\s+(\w+)\s+damage/gi;

/**
 * Parses damage groups from a spell description.
 * Handles both the parenthetical monster format "10 (2d6) fire damage"
 * and the bare dice format "2d6 fire damage" used in spell descriptions.
 */
export function parseSpellDamage(desc: string): DamageGroup[] | null {
  if (!desc) return null;

  // Try parenthetical format first: "10 (2d6) fire damage"
  const groups = parseAoeDamage(desc);
  if (groups) return groups;

  // Fall back to bare dice format: "2d6 fire damage"
  const bareGroups: DamageGroup[] = [];
  let m: RegExpExecArray | null;
  BARE_DICE_RE.lastIndex = 0;
  while ((m = BARE_DICE_RE.exec(desc)) !== null) {
    const sign = m[3] === '-' ? -1 : 1;
    bareGroups.push({
      count: parseInt(m[1], 10),
      sides: parseInt(m[2], 10),
      modifier: m[4] ? sign * parseInt(m[4], 10) : 0,
      damageType: m[5].charAt(0).toUpperCase() + m[5].slice(1).toLowerCase(),
    });
  }
  return bareGroups.length > 0 ? bareGroups : null;
}

// ── Action AOE parser (shared between BottomPanel and PlayerScreen) ──

export interface ActionAoe {
  aoeType: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
  aoeSize: number;        // feet (radius for sphere/cylinder, length for cone/line, side for cube)
  saveAbility?: string;  // 'str'|'dex'|'con'|'int'|'wis'|'cha'
  saveDc?: number;
  halfDamageOnSave?: boolean;
}

/**
 * Extracts AOE info from a monster/player action description.
 * Handles patterns like:
 *   "90-foot-long, 5-foot-wide Line [Area of Effect]"
 *   "90-foot Cone [Area of Effect]"
 *   "20-foot-radius Sphere"
 *   "15-foot Cube"
 *   "10-foot-radius Cylinder"
 */
export function parseActionAoe(desc: string): ActionAoe | null {
  if (!desc) return null;

  const hasAoeMarker = /\[area of effect\]/i.test(desc);
  if (!hasAoeMarker && !/\b(cone|sphere|cylinder|cube)\b/i.test(desc)) return null;

  let aoeType: ActionAoe['aoeType'] | null = null;
  if (/\bline\b/i.test(desc)) aoeType = 'line';
  else if (/\bcone\b/i.test(desc)) aoeType = 'cone';
  else if (/\bsphere\b/i.test(desc)) aoeType = 'sphere';
  else if (/\bcylinder\b/i.test(desc)) aoeType = 'cylinder';
  else if (/\bcube\b/i.test(desc)) aoeType = 'cube';
  if (!aoeType) return null;

  const sizeMatch = desc.match(/(\d+)[-\s]foot(?:[-\s](?:long|wide|radius|tall))?/gi);
  if (!sizeMatch || sizeMatch.length === 0) return null;
  const aoeSize = parseInt(sizeMatch[0].match(/\d+/)![0], 10);
  if (!aoeSize) return null;

  let saveAbility: string | undefined;
  let saveDc: number | undefined;
  const saveMatch1 = desc.match(/\b(STR|DEX|CON|INT|WIS|CHA)\s+DC\s+(\d+)/i);
  const saveMatch2 = desc.match(/DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i);
  if (saveMatch1) {
    saveAbility = saveMatch1[1].toLowerCase();
    saveDc = parseInt(saveMatch1[2], 10);
  } else if (saveMatch2) {
    saveDc = parseInt(saveMatch2[1], 10);
    const abilityMap: Record<string, string> = {
      strength: 'str', dexterity: 'dex', constitution: 'con',
      intelligence: 'int', wisdom: 'wis', charisma: 'cha',
    };
    saveAbility = abilityMap[saveMatch2[2].toLowerCase()];
  }

  const halfDamageOnSave = /half(?:\s+as\s+much)?\s+damage|half\s+damage/i.test(desc);

  return { aoeType, aoeSize, saveAbility, saveDc, halfDamageOnSave };
}

/**
 * Roll damage for an AOE action (save-based, no attack roll).
 * Returns an ActionRollResult with attackRoll === -1 as a damage-only sentinel.
 */
export function rollAoeDamage(groups: DamageGroup[]): ActionRollResult {
  const damageResults: DamageRollResult[] = groups.map(g => {
    const rolls: number[] = [];
    for (let i = 0; i < g.count; i++) {
      rolls.push(rollDie(g.sides));
    }
    const total = rolls.reduce((sum, r) => sum + r, 0) + g.modifier;
    return { rolls, modifier: g.modifier, total: Math.max(0, total), damageType: g.damageType, diceNotation: `${g.count}d${g.sides}` };
  });
  const totalDamage = damageResults.reduce((sum, r) => sum + r.total, 0);
  // attackRoll === -1 signals "damage-only" mode to ActionRollModal
  return { attackRoll: -1, attackBonus: 0, attackTotal: 0, isCrit: false, isFumble: false, damageResults, totalDamage, rollMode: 'normal' };
}
