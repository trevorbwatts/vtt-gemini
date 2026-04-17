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
  'Summon Beast': [
    { name: 'Air Beast',   spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small' },
    { name: 'Land Beast',  spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small' },
    { name: 'Water Beast', spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small' },
  ],
  'Summon Fey': [
    { name: 'Fuming Fey',   spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small' },
    { name: 'Mirthful Fey', spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small' },
    { name: 'Tricksy Fey',  spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small' },
  ],
  'Summon Undead': [
    { name: 'Ghostly',  spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium' },
    { name: 'Putrid',   spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium' },
    { name: 'Skeletal', spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium' },
  ],
  'Summon Construct': [
    { name: 'Clay Construct',  spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium' },
    { name: 'Metal Construct', spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium' },
    { name: 'Stone Construct', spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium' },
  ],
  'Summon Elemental': [
    { name: 'Air Elemental',   spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large' },
    { name: 'Earth Elemental', spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large' },
    { name: 'Fire Elemental',  spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large' },
    { name: 'Water Elemental', spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large' },
  ],
  'Summon Celestial': [
    { name: 'Avenger Celestial',  spellName: 'Summon Celestial', hp: 40, ac: 16, size: 'Medium' },
    { name: 'Defender Celestial', spellName: 'Summon Celestial', hp: 40, ac: 16, size: 'Medium' },
  ],
  'Summon Dragon': [
    { name: 'Chromatic Dragon', spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large' },
    { name: 'Gem Dragon',       spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large' },
    { name: 'Metallic Dragon',  spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large' },
  ],
  'Summon Fiend': [
    { name: 'Demon',    spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium' },
    { name: 'Devil',    spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium' },
    { name: 'Yugoloth', spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium' },
  ],
  'Summon Shadowspawn': [
    { name: 'Fury Shadow',    spellName: 'Summon Shadowspawn', hp: 35, ac: 11, size: 'Medium' },
    { name: 'Despair Shadow', spellName: 'Summon Shadowspawn', hp: 35, ac: 11, size: 'Medium' },
    { name: 'Fear Shadow',    spellName: 'Summon Shadowspawn', hp: 35, ac: 11, size: 'Medium' },
  ],
  'Summon Lesser Demons': [
    { name: 'Manes',  spellName: 'Summon Lesser Demons', hp: 9,  ac: 9,  size: 'Small' },
    { name: 'Dretch', spellName: 'Summon Lesser Demons', hp: 18, ac: 11, size: 'Small' },
    { name: 'Quasit', spellName: 'Summon Lesser Demons', hp: 7,  ac: 13, size: 'Tiny'  },
  ],
  'Summon Greater Demon': [
    { name: 'Shadow Demon', spellName: 'Summon Greater Demon', hp: 66,  ac: 13, size: 'Medium' },
    { name: 'Barlgura',     spellName: 'Summon Greater Demon', hp: 68,  ac: 15, size: 'Large'  },
    { name: 'Vrock',        spellName: 'Summon Greater Demon', hp: 104, ac: 15, size: 'Large'  },
  ],
};
