import type { Token } from '../types';

export interface SummonOption {
  /** Display name for the summoned creature (e.g. "Beholderkin") */
  name: string;
  /** The spell that summons this creature */
  spellName: string;
  /** Default HP for the summoned creature */
  hp: number;
  /** Default AC for the summoned creature */
  ac: number;
  /** Token size on the map */
  size: Token['size'];
  /** Optional token avatar path */
  avatar?: string;
}

/**
 * Map of spell name → available summon options.
 * Extend this to add more "Summon X" spells.
 */
export const SUMMON_OPTIONS: Record<string, SummonOption[]> = {
  'Summon Aberration': [
    { name: 'Beholderkin', spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium' },
    { name: 'Mind Flayer', spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium' },
    { name: 'Slaad',       spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium' },
  ],
};
