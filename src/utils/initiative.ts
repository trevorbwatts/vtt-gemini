import type { Combatant } from '../types';

/**
 * One combatant's initiative roll, kept in enough detail for the roll modal to
 * show its working rather than just a number — a total you can't audit is a
 * total you can't trust.
 */
export interface InitiativeRoll {
  /** The combatant as it will enter the tracker (tracker id already assigned). */
  combatant: Combatant;
  /** Every d20 rolled: one normally, two with advantage. */
  d20s: number[];
  /** The die actually used — the higher of the two under advantage. */
  kept: number;
  bonus: number;
  /** kept + bonus. What lands in the tracker unless the DM overrides it. */
  total: number;
  advantage: boolean;
  /**
   * True when this roll was copied from another creature of the same name
   * rather than rolled fresh, which is how a pack of goblins shares one
   * initiative. Those rows have no dice of their own to show.
   */
  shared: boolean;
}

/** Injectable for tests; defaults to Math.random. */
export type Rng = () => number;

const d20 = (rng: Rng) => Math.floor(rng() * 20) + 1;

/** Dex modifier, or 0 when a combatant has no stat block. */
export function dexModifier(combatant: Pick<Combatant, 'stats'>): number {
  return combatant.stats ? Math.floor((combatant.stats.dex - 10) / 2) : 0;
}

/**
 * Roll one initiative. Rolls twice and keeps the higher when the combatant has
 * advantage — imported from D&D Beyond, where features like the 2024 Champion's
 * Remarkable Athlete expose it as a modifier.
 */
export function rollOne(
  combatant: Pick<Combatant, 'stats' | 'initiativeBonus' | 'initiativeAdvantage'>,
  rng: Rng = Math.random,
): { d20s: number[]; kept: number; bonus: number; total: number; advantage: boolean } {
  const advantage = !!combatant.initiativeAdvantage;
  const bonus = combatant.initiativeBonus ?? dexModifier(combatant);
  const d20s = advantage ? [d20(rng), d20(rng)] : [d20(rng)];
  const kept = Math.max(...d20s);
  return { d20s, kept, bonus, total: kept + bonus, advantage };
}

/**
 * Roll initiative for a group of combatants.
 *
 * Non-player creatures sharing a name share a single roll, so a pack of six
 * goblins acts on one initiative rather than six. `seeded` carries the rolls
 * already on the board when adding to an in-progress combat, so newcomers join
 * their existing group instead of rolling a second one for the same name.
 */
export function rollInitiativeFor(
  combatants: Combatant[],
  opts: { seeded?: Map<string, number>; rng?: Rng } = {},
): InitiativeRoll[] {
  const rng = opts.rng ?? Math.random;
  const groups = new Map(opts.seeded ?? []);
  const out: InitiativeRoll[] = [];

  for (const combatant of combatants) {
    const groupable = combatant.type !== 'player' && !!combatant.name;

    if (groupable && groups.has(combatant.name)) {
      const total = groups.get(combatant.name)!;
      out.push({ combatant, d20s: [], kept: 0, bonus: 0, total, advantage: false, shared: true });
      continue;
    }

    const { d20s, kept, bonus, total, advantage } = rollOne(combatant, rng);
    if (groupable) groups.set(combatant.name, total);
    out.push({ combatant, d20s, kept, bonus, total, advantage, shared: false });
  }

  return out;
}
