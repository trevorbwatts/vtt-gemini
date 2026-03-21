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
      sendPlayerTokenUpdate: (tokens: any) => void;
      onPlayerTokenUpdate: (callback: (tokens: any) => void) => void;
      removePlayerTokenUpdateListener: () => void;
      sendDMTokenUpdate: (tokens: any) => void;
      onDMTokenUpdate: (callback: (tokens: any) => void) => void;
      removeDMTokenUpdateListener: () => void;
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
  size?: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
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
  source: '2014' | '2024';
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
  size?: string;
  speed?: string;
  senses?: string;
  languages?: string;
  saves?: string;
  immunities?: string;
  resistances?: string;
  conditionImmunities?: string;
  specialAbilities?: MonsterAction[];
  legendaryActions?: MonsterAction[];
  reactions?: MonsterAction[];
  xp?: number;
  avatar?: string;
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
  spells?: {
    name: string;
    level: number;       // 0 = cantrip
    desc: string;
    aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
    aoeSize?: number;    // feet: radius for sphere/cylinder, length for cone/line, side for cube
    range?: number;      // cast range in feet (0 = self, -1 = touch)
    saveAbility?: string; // 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
  }[];
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

export type MapNoteType = 'treasure' | 'quote' | 'warning' | 'secret' | 'clue';

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
  darknessLevel?: 'daylight' | 'dark';
}

export interface Campaign {
  id: string;
  name: string;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  scenarios: Scenario[];
}
