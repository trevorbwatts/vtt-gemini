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
      sendDMViewAsPlayer?: (playerId: string | null) => void;
      onDMViewAsPlayer?: (callback: (playerId: string | null) => void) => void;
      removeDMViewAsPlayerListener?: () => void;
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
      removeDMAoeUpdateListener?: () => void;
      sendPlayerAoeUpdate: (aoe: any) => void;
      onPlayerAoeUpdate: (callback: (aoe: any) => void) => void;
      removePlayerAoeUpdateListener?: () => void;
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
      sendPlayerFloorChange?: (floorId: string) => void;
      onPlayerFloorChange?: (callback: (floorId: string) => void) => void;
      removePlayerFloorChangeListener?: () => void;
      sendPlayerDarkvisionUpdate?: (playerId: string, darkvision: number) => void;
      onPlayerDarkvisionUpdate?: (callback: (data: { playerId: string; darkvision: number }) => void) => void;
      removePlayerDarkvisionUpdateListener?: () => void;
      sendDMSpellMarkerUpdate?: (markers: any) => void;
      onDMSpellMarkerUpdate?: (callback: (markers: any) => void) => void;
      removeDMSpellMarkerUpdateListener?: () => void;
      sendPlayerSpellMarkerUpdate?: (markers: any) => void;
      onPlayerSpellMarkerUpdate?: (callback: (markers: any) => void) => void;
      removePlayerSpellMarkerUpdateListener?: () => void;
      sendPlayerEmanationsUpdate?: (emanations: any) => void;
      onPlayerEmanationsUpdate?: (callback: (emanations: any) => void) => void;
      removePlayerEmanationsUpdateListener?: () => void;
      toggleFullscreen?: () => void;
      onFullscreenStatus?: (callback: (isFs: boolean) => void) => void;
      removeFullscreenStatusListener?: () => void;
      sendPlayerWildShape?: (data: { playerId: string; creatureName: string; creatureAvatar: string; originalAvatar?: string; creatureHp: number; creatureAc: number; creatureSpeed?: string; creatureSize?: string; originalSize?: string } | { playerId: string; revert: true; originalAvatar?: string; originalSize?: string }) => void;
      onPlayerWildShape?: (callback: (data: { playerId: string; creatureName: string; creatureAvatar: string; originalAvatar?: string; creatureHp: number; creatureAc: number; creatureSpeed?: string; creatureSize?: string; originalSize?: string } | { playerId: string; revert: true; originalAvatar?: string; originalSize?: string }) => void) => void;
      removePlayerWildShapeListener?: () => void;
      sendPlayerInvisibleToggle?: (tokenId: string) => void;
      onPlayerInvisibleToggle?: (callback: (tokenId: string) => void) => void;
      removePlayerInvisibleToggleListener?: () => void;
      sendPlayerSummonCombatant?: (combatant: any, tokenId: string) => void;
      onPlayerSummonCombatant?: (callback: (data: { combatant: any; tokenId: string }) => void) => void;
      removePlayerSummonCombatantListener?: () => void;
      sendPlayerImageRotation?: (data: { noteId: string; rotation: number }) => void;
      onPlayerImageRotation?: (callback: (data: { noteId: string; rotation: number }) => void) => void;
      removePlayerImageRotationListener?: () => void;
      // Persistent drawings (per-floor) sync — DM <-> Player
      sendDMDrawingsUpdate?: (data: { floorId: string; drawings: Stroke[] }) => void;
      onDMDrawingsUpdate?: (callback: (data: { floorId: string; drawings: Stroke[] }) => void) => void;
      removeDMDrawingsUpdateListener?: () => void;
      sendPlayerDrawingsUpdate?: (data: { floorId: string; drawings: Stroke[] }) => void;
      onPlayerDrawingsUpdate?: (callback: (data: { floorId: string; drawings: Stroke[] }) => void) => void;
      removePlayerDrawingsUpdateListener?: () => void;
      // Ephemeral stroke broadcast — fades automatically, never persisted
      sendEphemeralStroke?: (stroke: Stroke & { floorId: string }) => void;
      onEphemeralStroke?: (callback: (stroke: Stroke & { floorId: string }) => void) => void;
      removeEphemeralStrokeListener?: () => void;
      // DM ping → Player
      sendDMPing?: (ping: { floorId: string; x: number; y: number; color: string }) => void;
      onDMPing?: (callback: (ping: { floorId: string; x: number; y: number; color: string }) => void) => void;
      removeDMPingListener?: () => void;
      // --- Extras gallery (global, file-based) ---
      extrasLoadManifest?: () => Promise<{ manifest: Extra[]; error?: string }>;
      extrasSaveManifest?: (manifest: Extra[]) => Promise<{ ok: boolean; error?: string }>;
      extrasSaveImage?: (data: { filename: string; dataUrl: string }) => Promise<{ ok: boolean; error?: string }>;
      extrasDeleteImage?: (filename: string) => Promise<{ ok: boolean; error?: string }>;
    }
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Next rotation for a displayed image note.
 *
 * Players sit on one of two sides of the table, so only two orientations are
 * ever useful: as placed, or turned to face the far side. Rotating toggles
 * between them instead of stepping through 90° quarters — and because both
 * views animate the CSS transform, turning back winds the image the way it
 * came rather than continuing around. A legacy 90/270 value normalises to 0
 * the first time it's rotated.
 */
export function nextImageRotation(current: number | undefined): 0 | 180 {
  return (current ?? 0) === 0 ? 180 : 0;
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
  /** Visual-only flag for illusions (Project Image, etc.) — renders translucent with a dashed outline. */
  illusory?: boolean;
  // --- extras ---
  /** True when this token is an "Extra" — a background character with an avatar but no statblock. Not a Combatant. */
  isExtra?: boolean;
  /** Reference back to the Extra entry in the global gallery (extras manifest id). */
  extraId?: string;
}

/**
 * An "Extra" is a background-character avatar in the global gallery (reusable across campaigns).
 * Lives on disk in public/extras/, indexed by manifest.json. Not a Combatant — just a face + tags.
 */
export interface Extra {
  /** Stable unique id (slug derived from filename + suffix if needed). */
  id: string;
  /** Filename within public/extras/, e.g. "tavern-keeper-01.jpg". */
  filename: string;
  /** Display name shown in the gallery. */
  name: string;
  /** Freeform tags for filtering (e.g. "tavern", "noble", "guard"). */
  tags: string[];
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
  /** Total bonus added to a d20 when rolling initiative (Dex mod + Alert feat, Jack of All Trades, etc.).
   *  When set, this is used instead of recomputing from Dex alone. */
  initiativeBonus?: number;
  /** Rolls initiative with advantage (2024 Champion's Remarkable Athlete,
   *  Feral Instinct, Sentinel Shield…). Imported from D&D Beyond. */
  initiativeAdvantage?: boolean;
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
  size?: string;
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
  locked?: boolean;
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

export type MapNoteType = 'treasure' | 'quote' | 'warning' | 'magic' | 'check' | 'image';

export interface MapNote {
  id: string;
  type: MapNoteType;
  content: string;
  x: number;
  y: number;
  /** Base64 data URL for image-type notes. Stripped from persisted JSON; rehydrated from localStorage(`note_img_<id>`). */
  imageData?: string;
  /** Rotation in degrees for image-type notes (0/90/180/270). Defaults to 0. */
  imageRotation?: number;
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
  /** Axis-aligned bounding box — drives label/badge placement and legacy rectangle zones. */
  rect: { x: number; y: number; width: number; height: number };
  /**
   * Optional polygon outline (flat [x1,y1,x2,y2,...]). When present the zone is a
   * free-form polygon: hit-testing and the on-map shape use these points, while `rect`
   * is kept as the bounding box for labels/badges. Older zones have only `rect`.
   */
  points?: number[];
  targetFloorId: string;
  targetPosition: { x: number; y: number };
  label?: string;
  pairedZoneId?: string;
  pairIndex?: number;
  locked?: boolean;
}

/**
 * A single freehand drawing stroke placed by a player on the map.
 * Stored on Floor.drawings when persistent. Ephemeral strokes are never persisted —
 * they are broadcast over IPC and faded out by each viewer's local timer.
 */
export interface Stroke {
  id: string;
  /** combatantId of the player who drew it (used for attribution / colors). */
  ownerId?: string;
  /** Hex color, e.g. '#ffffff'. */
  color: string;
  /** Flat array of map-coordinate points: [x1,y1, x2,y2, ...]. */
  points: number[];
  /** Stroke thickness in map pixels. */
  width: number;
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
  /** Persistent freehand drawings on this floor. Survives app restart; per-floor scope. */
  drawings?: Stroke[];
  /** Polygonal regions that remain dark even when the floor is set to Daylight (caves, houses, etc.). */
  darkZones?: DarkZone[];
  /** DM-only painted regions that cost double movement to cross (mud, rubble, undergrowth). */
  difficultTerrain?: DifficultTerrainZone[];
  /** Timestamp of the last "Reset Explored Fog" on this floor. The explored-area
   *  mask itself lives in IndexedDB (see utils/exploredFog.ts); this field only
   *  propagates the reset to the player window over the existing IPC state sync. */
  exploredFogResetAt?: number;
}

/**
 * A DM-only painted region of difficult terrain. While a token is dragged across it
 * during combat, the measured movement distance counts double (matching the 5e rule),
 * which also trips the "over Speed" warning on the movement ruler. It does not block
 * movement and is never shown on the player screen.
 */
export interface DifficultTerrainZone {
  id: string;
  /** Polygon vertices in map pixel coordinates, flat: [x1, y1, x2, y2, ...]. */
  points: number[];
  /** Optional label shown in the DM panel (e.g. "Mud", "Rubble"). */
  label?: string;
}

/**
 * A polygonal region treated as Dark even when the floor's darknessLevel is 'daylight'.
 * Tokens without darkvision see nothing inside the polygon; tokens with darkvision or
 * blindsight see up to their sense radius into it. Outside the polygon, normal daylight
 * vision applies.
 */
export interface DarkZone {
  id: string;
  /** Polygon vertices in map pixel coordinates, flat: [x1, y1, x2, y2, ...]. */
  points: number[];
  /** Optional label shown in the DM panel (e.g. "Cave", "Tavern"). */
  label?: string;
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
  /** When set, an image-type MapNote with this id is currently being shown as an overlay on the player + DM screens. */
  displayedImageNoteId?: string | null;
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
  /** Show token name labels on the DM screen. Defaults to true when undefined. */
  showTokenNames?: boolean;
}
