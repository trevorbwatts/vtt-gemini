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
      requestStateUpdate: () => void;
      sendDMAoeUpdate: (aoe: any) => void;
      onDMAoeUpdate: (callback: (aoe: any) => void) => void;
      sendPlayerAoeUpdate: (aoe: any) => void;
      onPlayerAoeUpdate: (callback: (aoe: any) => void) => void;
      sendDismissPlayerAoe: () => void;
      onDismissPlayerAoe: (callback: () => void) => void;
      removeDismissPlayerAoeListener?: () => void;
      sendPlayerConditionUpdate?: (tokenId: string, conditions: string[]) => void;
      onPlayerConditionUpdate?: (callback: (data: { tokenId: string; conditions: string[] }) => void) => void;
      removePlayerConditionUpdateListener?: () => void;
      sendPlayerEndTurn?: () => void;
      onPlayerEndTurn?: (callback: () => void) => void;
      removePlayerEndTurnListener?: () => void;
      sendPlayerColorUpdate?: (playerId: string, color: string) => void;
      onPlayerColorUpdate?: (callback: (data: { playerId: string; color: string }) => void) => void;
      removePlayerColorUpdateListener?: () => void;
      sendPlayerTargetUpdate?: (combatantIds: string[]) => void;
      onPlayerTargetUpdate?: (callback: (combatantIds: string[]) => void) => void;
      removePlayerTargetUpdateListener?: () => void;
      sendPlayerPortalToggle?: (portalId: string) => void;
      onPlayerPortalToggle?: (callback: (portalId: string) => void) => void;
      removePlayerPortalToggleListener?: () => void;
      sendPlayerDarkvisionUpdate?: (playerId: string, darkvision: number) => void;
      onPlayerDarkvisionUpdate?: (callback: (data: { playerId: string; darkvision: number }) => void) => void;
      removePlayerDarkvisionUpdateListener?: () => void;
      sendDMSpellMarkerUpdate?: (markers: any) => void;
      onDMSpellMarkerUpdate?: (callback: (markers: any) => void) => void;
      removeDMSpellMarkerUpdateListener?: () => void;
      sendPlayerSpellMarkerUpdate?: (markers: any) => void;
      onPlayerSpellMarkerUpdate?: (callback: (markers: any) => void) => void;
      removePlayerSpellMarkerUpdateListener?: () => void;
      toggleFullscreen?: () => void;
      onFullscreenStatus?: (callback: (isFs: boolean) => void) => void;
      removeFullscreenStatusListener?: () => void;
      sendPlayerWildShape?: (data: { playerId: string; creatureName: string; creatureAvatar: string; originalAvatar?: string; creatureHp: number; creatureAc: number; creatureSpeed?: string; creatureSize?: string; originalSize?: string } | { playerId: string; revert: true; originalAvatar?: string; originalSize?: string }) => void;
      onPlayerWildShape?: (callback: (data: { playerId: string; creatureName: string; creatureAvatar: string; originalAvatar?: string; creatureHp: number; creatureAc: number; creatureSpeed?: string; creatureSize?: string; originalSize?: string } | { playerId: string; revert: true; originalAvatar?: string; originalSize?: string }) => void) => void;
      removePlayerWildShapeListener?: () => void;
      sendPlayerInvisibleToggle?: (tokenId: string) => void;
      onPlayerInvisibleToggle?: (callback: (tokenId: string) => void) => void;
      removePlayerInvisibleToggleListener?: () => void;
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
  floorId?: string;
  invisible?: boolean;
  /** Set when this token is currently under an Enlarge/Reduce effect; stores its size before the spell so it can be reverted. */
  enlargedFrom?: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';
  // --- summoned creatures ---
  /** True if this token was created by a summon spell. */
  isSummon?: boolean;
  /** The name of the spell that summoned it (e.g. "Find Familiar"). */
  summonSpellName?: string;
  /** combatantId of the caster — used for dismissal and initiative ordering. */
  summonedBy?: string;
  /** combatantId of the player who controls this token (summons/pets). */
  controlledBy?: string;
}

export interface MovementPathSegment {
  startIndex: number;           // index into points[] where this segment begins
  startPos: { x: number; y: number };  // token position at start of this segment
}

export interface MovementPath {
  tokenId: string;
  startPos: { x: number; y: number };  // original position before any movement
  points: number[];             // flat [x1,y1,x2,y2,...] for Konva <Line>
  totalDistancePx: number;
  isDragging: boolean;
  segments: MovementPathSegment[];
}

export interface TokenTimer {
  playerId: string;
  abilityId: string;
  startTime: number;
  durationMs: number;
  color?: string;
}

/** A persistent emanation ring that follows a caster on the map. */
export interface ActiveEmanation {
  id: string;          // unique key, e.g. 'spirit-guardians-{playerId}'
  spellName: string;   // e.g. 'Spirit Guardians'
  playerId: string;    // caster's combatant ID
  rangeFt: number;     // radius in feet
  color: string;       // hex color for timer badge & map ring, e.g. '#fbbf24'
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
  skills?: string;
  immunities?: string;
  resistances?: string;
  vulnerabilities?: string;
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
  draconicAncestry?: string; // e.g. 'red', 'blue', 'gold' — for Dragonborn breath weapon
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
  spellSaveDc?: number;
  spells?: {
    name: string;
    level: number;       // 0 = cantrip
    desc: string;
    school?: string;     // e.g. 'Illusion', 'Conjuration'
    aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
    aoeSize?: number;    // feet: radius for sphere/cylinder/emanation, length for cone/line, side for cube
    effectRadius?: number; // feet — for non-AoE spells with an area (Light, Alarm, etc.)
    range?: number;      // cast range in feet (0 = self, -1 = touch)
    saveAbility?: string; // 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
    halfDamageOnSave?: boolean;
    atWill?: boolean;    // granted by a feat/feature, always available
    source?: string;     // e.g. 'Magic Initiate (Wizard)', 'Evocation Savant'
    mapInteraction?: 'cast' | 'place' | 'cast-and-place' | 'cast-and-emanate' | 'exception' | 'none';
    saveEffect?: 'damage-save' | 'damage-auto' | 'condition';
    condition?: string;
  }[];
  /** Spells granted at will by feats or class features — looked up automatically from the spell DB */
  atWillSpells?: { spellName: string; source: string; }[];
  conditions?: string[];
  avatar?: string;
  color?: string;
  speedText?: string;
  cr?: string;
  actions?: MonsterAction[];
  specialAbilities?: MonsterAction[];
  legendaryActions?: MonsterAction[];
  reactions?: MonsterAction[];
  saves?: string;
  skills?: string;
  immunities?: string;
  resistances?: string;
  vulnerabilities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  creatureType?: string;
  /** When this combatant is an activeCombatant copy, stores the id of the original source combatant */
  sourceCombatantId?: string;
  /** combatantId of the caster who summoned this creature. Used for initiative ordering and dismissal. */
  summonedBy?: string;
  /** Spell that summoned this combatant (e.g. "Find Familiar"). */
  summonSpellName?: string;
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
  portalType?: 'door' | 'window' | 'secret';
}

export interface GridResolution {
  mapOrigin: WallPoint;
  mapSize: WallPoint;
  pixelsPerGrid: number;
}

export interface UVTTLight {
  id: string;
  x: number;        // pixel coords
  y: number;
  radiusPx: number; // illumination radius in pixels (converted from feet at parse time)
  color?: string;   // hex color string from UVTT file
  intensity?: number; // 0–1
}

export type MapNoteType = 'treasure' | 'quote' | 'warning' | 'magic' | 'poison';

export interface MapNote {
  id: string;
  type: MapNoteType;
  content: string;
  x: number;
  y: number;
}

export interface SpellMarker {
  id: string;
  spellName: string;
  school: string;
  casterId?: string;
  x: number;                 // for walls: center of the rectangle
  y: number;
  effectRadius?: number;     // feet — rendered as translucent circle (used when no aoeType)
  aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation'; // renders the matching shape on the placed marker
  aoeSize?: number;          // feet — side/radius for the placed marker shape
  visibleToPlayers: boolean;
  floorId?: string;
  /** When true, this marker acts as a dynamic light source that reveals fog of war within effectRadius feet. */
  lightSource?: boolean;

  // --- wall-shape fields (Wall of Sand, etc.) ---
  shapeType?: 'point' | 'wall' | 'ring';  // default behavior is 'point'
  length?: number;                // feet — long axis
  thickness?: number;             // feet — short axis
  angle?: number;                 // degrees — rotation of long axis
  blocksVision?: boolean;         // true for Wall of Sand — fog-of-war integration
  hotSide?: 'inside' | 'outside'; // Wall of Fire (Ring) — which face emits fire
}

export interface Viewpoint {
  id: string;
  x: number;
  y: number;
  /** Absolute Konva stage scale value to zoom to when activated */
  zoomScale: number;
  isHidden?: boolean;
}

export interface TransitionZone {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
  targetFloorId: string;
  targetPosition: { x: number; y: number };
  label?: string;
  pairedZoneId?: string;
  pairIndex?: number;
}

export interface Floor {
  id: string;
  name: string;
  order: number;
  mapImage?: string;
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
  lights?: UVTTLight[];
  darknessLevel?: 'daylight' | 'dark';
  mapNotes: MapNote[];
  spellMarkers?: SpellMarker[];
  viewpoints?: Viewpoint[];
  transitionZones?: TransitionZone[];
}

export interface Scenario {
  id: string;
  name: string;
  notes: string;
  mapNotes: MapNote[];
  spellMarkers?: SpellMarker[];
  viewpoints?: Viewpoint[];
  tokens: Token[];
  combatants: Combatant[];
  activeCombatants: Combatant[];
  floors?: Floor[];
  activeFloorId?: string;
  /** @deprecated Use floors[].mapImage instead. Kept for migration. */
  mapImage?: string;
  /** @deprecated Use floors[].walls instead. Kept for migration. */
  walls?: WallSegment[];
  /** @deprecated Use floors[].objectWalls instead. Kept for migration. */
  objectWalls?: WallSegment[];
  /** @deprecated Use floors[].portals instead. Kept for migration. */
  portals?: Portal[];
  /** @deprecated Use floors[].gridResolution instead. Kept for migration. */
  gridResolution?: GridResolution;
  /** @deprecated Use floors[].darknessLevel instead. Kept for migration. */
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
