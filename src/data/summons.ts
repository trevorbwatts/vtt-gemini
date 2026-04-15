/** Summon-spell metadata: which creatures a spell can summon, control/duration rules. */

export interface SummonOption {
  /** Creature name as it appears in the bestiary. */
  creatureName: string;
  /** Display label if different from creatureName. */
  label?: string;
  /** Preferred bestiary source edition. Defaults to '2024'. */
  source?: '2014' | '2024';
}

export interface SummonSpec {
  /**
   * - 'fixed': player picks from a preset list of creatures (Find Familiar, Animate Dead).
   * - 'scaling': single statblock that scales with spell level (2024 Summon Beast, etc.).
   * - 'cr-ladder': player picks a CR tier → N creatures (Conjure Animals — deferred).
   */
  kind: 'fixed' | 'scaling' | 'cr-ladder';
  /** For 'fixed': available creature options. */
  options?: SummonOption[];
  /** For 'scaling': the statblock name in the bestiary. */
  statblock?: string;
  /** Who controls the summon on the map. */
  controlledBy: 'caster' | 'dm';
  /** Duration — informational for now; dismissal is explicit. */
  duration: 'concentration' | 'hour' | 'minute' | 'permanent';
}

const SUMMON_SPECS: Record<string, SummonSpec> = {
  'Find Familiar': {
    kind: 'fixed',
    controlledBy: 'caster',
    duration: 'hour',
    options: [
      { creatureName: 'Bat' },
      { creatureName: 'Cat' },
      { creatureName: 'Crab' },
      { creatureName: 'Frog' },
      { creatureName: 'Hawk' },
      { creatureName: 'Lizard' },
      { creatureName: 'Octopus' },
      { creatureName: 'Owl' },
      { creatureName: 'Poisonous Snake' },
      { creatureName: 'Quipper' },
      { creatureName: 'Rat' },
      { creatureName: 'Raven' },
      { creatureName: 'Sea Horse' },
      { creatureName: 'Spider' },
      { creatureName: 'Weasel' },
    ],
  },
};

/** Look up summon metadata for a spell. Returns undefined if the spell isn't a summon. */
export function getSummonSpec(spellName: string): SummonSpec | undefined {
  return SUMMON_SPECS[spellName];
}
