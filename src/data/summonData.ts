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
    { name: 'Beholderkin', spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium', avatar: '/tokens/summon-aberration-beholderkin.jpg' },
    { name: 'Mind Flayer', spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium', avatar: '/tokens/summon-aberration-mind-flayer.jpg' },
    { name: 'Slaad',       spellName: 'Summon Aberration', hp: 40, ac: 16, size: 'Medium', avatar: '/tokens/summon-aberration-slaad.jpg' },
  ],
  'Summon Beast': [
    { name: 'Air Beast',   spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small', avatar: '/tokens/summon-beast-air.jpg' },
    { name: 'Land Beast',  spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small', avatar: '/tokens/summon-beast-land.jpg' },
    { name: 'Water Beast', spellName: 'Summon Beast', hp: 30, ac: 13, size: 'Small', avatar: '/tokens/summon-beast-water.jpg' },
  ],
  'Summon Fey': [
    { name: 'Fuming Fey',   spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small', avatar: '/tokens/summon-fey-fuming.jpg' },
    { name: 'Mirthful Fey', spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small', avatar: '/tokens/summon-fey-mirthful.jpg' },
    { name: 'Tricksy Fey',  spellName: 'Summon Fey', hp: 30, ac: 14, size: 'Small', avatar: '/tokens/summon-fey-tricksy.jpg' },
  ],
  'Summon Undead': [
    { name: 'Ghostly',  spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium', avatar: '/tokens/summon-undead-ghostly.jpg' },
    { name: 'Putrid',   spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium', avatar: '/tokens/summon-undead-putrid.jpg' },
    { name: 'Skeletal', spellName: 'Summon Undead', hp: 30, ac: 11, size: 'Medium', avatar: '/tokens/summon-undead-skeletal.jpg' },
  ],
  'Summon Construct': [
    { name: 'Clay Construct',  spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium', avatar: '/tokens/summon-construct-clay.jpg' },
    { name: 'Metal Construct', spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium', avatar: '/tokens/summon-construct-metal.jpg' },
    { name: 'Stone Construct', spellName: 'Summon Construct', hp: 40, ac: 17, size: 'Medium', avatar: '/tokens/summon-construct-stone.jpg' },
  ],
  'Summon Elemental': [
    { name: 'Air Elemental',   spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large', avatar: '/tokens/air-elemental.jpg' },
    { name: 'Earth Elemental', spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large', avatar: '/tokens/earth-elemental.jpg' },
    { name: 'Fire Elemental',  spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large', avatar: '/tokens/fire-elemental.jpg' },
    { name: 'Water Elemental', spellName: 'Summon Elemental', hp: 50, ac: 15, size: 'Large', avatar: '/tokens/water-elemental.jpg' },
  ],
  'Summon Celestial': [
    { name: 'Avenger Celestial',  spellName: 'Summon Celestial', hp: 40, ac: 16, size: 'Medium', avatar: '/tokens/summon-celestial-avenger.jpg' },
    { name: 'Defender Celestial', spellName: 'Summon Celestial', hp: 40, ac: 16, size: 'Medium', avatar: '/tokens/summon-celestial-defender.jpg' },
  ],
  'Summon Dragon': [
    { name: 'Chromatic Dragon', spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large', avatar: '/tokens/summon-dragon.jpg' },
    { name: 'Gem Dragon',       spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large', avatar: '/tokens/summon-dragon.jpg' },
    { name: 'Metallic Dragon',  spellName: 'Summon Dragon', hp: 100, ac: 19, size: 'Large', avatar: '/tokens/summon-dragon.jpg' },
  ],
  'Summon Fiend': [
    { name: 'Demon',    spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium', avatar: '/tokens/summon-fiend-demon.jpg' },
    { name: 'Devil',    spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium', avatar: '/tokens/summon-fiend-devil.jpg' },
    { name: 'Yugoloth', spellName: 'Summon Fiend', hp: 50, ac: 12, size: 'Medium', avatar: '/tokens/summon-fiend-yugoloth.jpg' },
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

  // --- Non-"Summon X" spells that create tokens on the map ---

  'Find Familiar': [
    { name: 'Cat',           spellName: 'Find Familiar', hp: 2,  ac: 12, size: 'Tiny'  },
    { name: 'Owl',           spellName: 'Find Familiar', hp: 1,  ac: 11, size: 'Tiny'  },
    { name: 'Raven',         spellName: 'Find Familiar', hp: 1,  ac: 12, size: 'Tiny'  },
    { name: 'Toad',          spellName: 'Find Familiar', hp: 1,  ac: 11, size: 'Tiny'  },
    { name: 'Bat',           spellName: 'Find Familiar', hp: 1,  ac: 12, size: 'Tiny'  },
    { name: 'Crab',          spellName: 'Find Familiar', hp: 2,  ac: 11, size: 'Tiny'  },
    { name: 'Fish',          spellName: 'Find Familiar', hp: 1,  ac: 13, size: 'Tiny'  },
    { name: 'Hawk',          spellName: 'Find Familiar', hp: 1,  ac: 13, size: 'Tiny'  },
    { name: 'Lizard',        spellName: 'Find Familiar', hp: 2,  ac: 10, size: 'Tiny'  },
    { name: 'Octopus',       spellName: 'Find Familiar', hp: 3,  ac: 12, size: 'Small' },
    { name: 'Poisonous Snake',spellName: 'Find Familiar', hp: 2,  ac: 13, size: 'Tiny'  },
    { name: 'Quasit',        spellName: 'Find Familiar', hp: 7,  ac: 13, size: 'Tiny'  },
    { name: 'Imp',           spellName: 'Find Familiar', hp: 10, ac: 13, size: 'Tiny'  },
    { name: 'Pseudodragon',  spellName: 'Find Familiar', hp: 7,  ac: 13, size: 'Tiny'  },
    { name: 'Sprite',        spellName: 'Find Familiar', hp: 2,  ac: 15, size: 'Tiny'  },
  ],

  'Unseen Servant': [
    { name: 'Unseen Servant', spellName: 'Unseen Servant', hp: 1, ac: 10, size: 'Medium' },
  ],

  'Find Steed': [
    { name: 'Warhorse',     spellName: 'Find Steed', hp: 19, ac: 11, size: 'Large'  },
    { name: 'Riding Horse', spellName: 'Find Steed', hp: 13, ac: 10, size: 'Large'  },
    { name: 'Elk',          spellName: 'Find Steed', hp: 13, ac: 10, size: 'Large'  },
    { name: 'Pony',         spellName: 'Find Steed', hp: 11, ac: 10, size: 'Medium' },
    { name: 'Mastiff',      spellName: 'Find Steed', hp: 5,  ac: 12, size: 'Medium' },
  ],

  'Animate Dead': [
    { name: 'Skeleton', spellName: 'Animate Dead', hp: 13, ac: 13, size: 'Medium' },
    { name: 'Zombie',   spellName: 'Animate Dead', hp: 22, ac: 8,  size: 'Medium' },
  ],

  'Create Undead': [
    { name: 'Ghoul',  spellName: 'Create Undead', hp: 22, ac: 12, size: 'Medium' },
    { name: 'Ghast',  spellName: 'Create Undead', hp: 36, ac: 13, size: 'Medium' },
    { name: 'Wight',  spellName: 'Create Undead', hp: 45, ac: 14, size: 'Medium' },
    { name: 'Mummy',  spellName: 'Create Undead', hp: 58, ac: 11, size: 'Medium' },
  ],

  'Conjure Animals': [
    { name: 'Wolf',        spellName: 'Conjure Animals', hp: 11, ac: 13, size: 'Medium' },
    { name: 'Black Bear',  spellName: 'Conjure Animals', hp: 19, ac: 11, size: 'Medium' },
    { name: 'Dire Wolf',   spellName: 'Conjure Animals', hp: 37, ac: 14, size: 'Large'  },
    { name: 'Giant Eagle', spellName: 'Conjure Animals', hp: 26, ac: 13, size: 'Large'  },
    { name: 'Giant Spider',spellName: 'Conjure Animals', hp: 26, ac: 14, size: 'Large'  },
    { name: 'Elk',         spellName: 'Conjure Animals', hp: 13, ac: 10, size: 'Large'  },
  ],

  'Phantom Steed': [
    { name: 'Phantom Steed', spellName: 'Phantom Steed', hp: 13, ac: 11, size: 'Large' },
  ],

  "Mordenkainen's Faithful Hound": [
    { name: 'Faithful Hound', spellName: "Mordenkainen's Faithful Hound", hp: 4, ac: 13, size: 'Medium' },
  ],

  "Mordenkainen's Sword": [
    { name: 'Spectral Sword', spellName: "Mordenkainen's Sword", hp: 20, ac: 20, size: 'Medium' },
  ],

  'Arcane Eye': [
    { name: 'Arcane Eye', spellName: 'Arcane Eye', hp: 1, ac: 10, size: 'Tiny' },
  ],

  'Giant Insect': [
    { name: 'Giant Centipede', spellName: 'Giant Insect', hp: 4,  ac: 13, size: 'Small'  },
    { name: 'Giant Spider',    spellName: 'Giant Insect', hp: 26, ac: 14, size: 'Large'  },
    { name: 'Giant Wasp',      spellName: 'Giant Insect', hp: 13, ac: 12, size: 'Medium' },
    { name: 'Giant Scorpion',  spellName: 'Giant Insect', hp: 52, ac: 15, size: 'Large'  },
  ],

  'Animate Objects': [
    { name: 'Tiny Object',   spellName: 'Animate Objects', hp: 20, ac: 18, size: 'Tiny'   },
    { name: 'Small Object',  spellName: 'Animate Objects', hp: 25, ac: 16, size: 'Small'  },
    { name: 'Medium Object', spellName: 'Animate Objects', hp: 40, ac: 13, size: 'Medium' },
    { name: 'Large Object',  spellName: 'Animate Objects', hp: 50, ac: 10, size: 'Large'  },
    { name: 'Huge Object',   spellName: 'Animate Objects', hp: 80, ac: 10, size: 'Huge'   },
  ],

  'Conjure Elemental': [
    { name: 'Air Elemental',   spellName: 'Conjure Elemental', hp: 90,  ac: 15, size: 'Large' },
    { name: 'Earth Elemental', spellName: 'Conjure Elemental', hp: 126, ac: 17, size: 'Large' },
    { name: 'Fire Elemental',  spellName: 'Conjure Elemental', hp: 102, ac: 13, size: 'Large' },
    { name: 'Water Elemental', spellName: 'Conjure Elemental', hp: 114, ac: 14, size: 'Large' },
  ],

  'Conjure Fey': [
    { name: 'Pixie',     spellName: 'Conjure Fey', hp: 1,  ac: 15, size: 'Tiny'   },
    { name: 'Sprite',    spellName: 'Conjure Fey', hp: 2,  ac: 15, size: 'Tiny'   },
    { name: 'Dryad',     spellName: 'Conjure Fey', hp: 22, ac: 11, size: 'Medium' },
    { name: 'Satyr',     spellName: 'Conjure Fey', hp: 31, ac: 14, size: 'Medium' },
    { name: 'Green Hag', spellName: 'Conjure Fey', hp: 82, ac: 17, size: 'Medium' },
  ],

  'Finger of Death': [
    { name: 'Zombie', spellName: 'Finger of Death', hp: 22, ac: 8, size: 'Medium' },
  ],
};
