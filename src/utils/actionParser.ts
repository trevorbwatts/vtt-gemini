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
}

export interface ActionRollResult {
  attackRoll: number;
  attackBonus: number;
  attackTotal: number;
  isCrit: boolean;
  isFumble: boolean;
  damageResults: DamageRollResult[];
  totalDamage: number;
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

export function rollAction(parsed: ParsedAction): ActionRollResult {
  const attackRoll = rollDie(20);
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
    return { rolls, modifier: g.modifier, total: Math.max(0, total), damageType: g.damageType };
  });

  const totalDamage = damageResults.reduce((sum, r) => sum + r.total, 0);

  return { attackRoll, attackBonus: parsed.attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage };
}
