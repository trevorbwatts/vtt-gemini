import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Declare electronAPI globally
declare global {
  interface Window {
    electronAPI?: {
      launchPlayerScreen: () => void;
      closePlayerScreen: () => void;
      sendStateUpdate: (state: any) => void;
      sendPlayerMode: (mode: string) => void;
      onStateUpdate: (callback: (state: any) => void) => void;
      onPlayerModeUpdate: (callback: (mode: string) => void) => void;
      onPlayerScreenStatus: (callback: (isOpen: boolean) => void) => void;
      removeStateUpdateListener: () => void;
      removePlayerModeListener: () => void;
      removePlayerScreenStatusListener: () => void;
      importDndBeyondCharacter: (url: string) => Promise<any>;
    }
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Token {
  id: string;
  name: string;
  type: 'player' | 'enemy' | 'npc';
  x: number;
  y: number;
  color: string;
  hidden?: boolean;
  combatantId?: string;
  avatar?: string;
}

export interface ClassDefinition {
  name: string;
  level: number;
  subclass?: string;
}

export interface MonsterAction {
  name: string;
  desc: string;
}

export interface Monster {
  id: string;
  name: string;
  hp: number;
  ac: number;
  type: string;
  cr: string;
  description: string;
  actions: MonsterAction[];
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
}

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  type: 'player' | 'enemy' | 'npc';
  species?: string;
  speed?: number;
  darkvision?: number;
  classes?: ClassDefinition[];
  dndBeyondId?: string;
  dndBeyondUrl?: string;
  proficiencyBonus?: number;
  description?: string;
  stats?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  actions?: MonsterAction[];
  spells?: { name: string; level: number; desc: string }[];
  avatar?: string;
  color?: string;
}

export interface WallPoint {
  x: number;
  y: number;
}

export interface WallSegment {
  id: string;
  points: WallPoint[];
}

export interface Portal {
  id: string;
  bounds: [WallPoint, WallPoint];
  closed: boolean;
  freestanding: boolean;
}

export interface GridResolution {
  mapOrigin: WallPoint;
  mapSize: WallPoint;
  pixelsPerGrid: number;
}

export type MapNoteType = 'treasure' | 'quote' | 'combat' | 'info' | 'trap';

export interface MapNote {
  id: string;
  type: MapNoteType;
  content: string;
  x: number;
  y: number;
}

export interface Scenario {
  id: string;
  name: string;
  notes: string;
  mapNotes: MapNote[];
  tokens: Token[];
  combatants: Combatant[];
  activeCombatants: Combatant[];
  mapImage?: string;
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
}

export interface Campaign {
  id: string;
  name: string;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  scenarios: Scenario[];
}
