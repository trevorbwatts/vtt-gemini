import React from 'react';
import {
  Token, MapNote, Combatant, Monster, WallSegment, Portal, GridResolution,
  Floor, TransitionZone, UVTTLight, Stroke, Extra, TokenTimer, SpellMarker,
} from '../../types';
import type { Viewpoint } from '../../types';
import type { SaveResult } from './helpers';

export interface MapViewProps {
  tokens: Token[];
  onTokensChange: (tokens: Token[]) => void;
  scenarioName: string;
  /** Scenario id — keys the per-floor explored-fog masks in IndexedDB. */
  scenarioId?: string;
  /** Floor's last "Reset Explored Fog" timestamp (synced to the player window via IPC). */
  exploredFogResetAt?: number;
  mapImage: string | undefined;
  onMapChange: (mapImage: string) => void;
  mapNotes: MapNote[];
  onMapNotesChange: (notes: MapNote[]) => void;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  scenarioCombatants: Combatant[];
  activeCombatants: Combatant[];
  onUpdateCombatantHp: (sourceCombatantId: string, delta: number) => void;
  onAddCondition?: (sourceCombatantId: string, condition: string) => void;
  onRemoveCondition?: (sourceCombatantId: string, condition: string) => void;
  onAddEnemy: (monster: Monster, x: number, y: number) => void;
  onAddSummonCombatant?: (combatant: Combatant, tokenId: string) => void;
  onStartCombat: (tokenIds: string[]) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  onNoteClick?: (noteId: string) => void;
  onAddScenario?: () => void;
  panToNote?: MapNote | null;
  isPlayerView?: boolean;
  /** When set on the DM view, the fog of war is restricted to JUST this player's
   *  vision (darkvision + LOS, just like the player screen). All other DM
   *  interactions remain enabled. */
  dmViewAsPlayerId?: string | null;
  /** Show token name labels on the DM screen (campaign setting; defaults to true). */
  showTokenNames?: boolean;
  /** Combatant IDs that this viewer "is" — used to restrict spell-marker dragging
   *  and double-tap dismiss on the player screen to the actual caster. Unused in
   *  DM view (DM can always interact). */
  viewerCasterIds?: string[];
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
  lights?: UVTTLight[];
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution, lights?: UVTTLight[]) => void;
  onPortalToggle?: (portalId: string) => void;
  onPortalTypeChange?: (portalId: string, type: 'door' | 'window' | 'secret', locked?: boolean) => void;
  onDragStatusChange?: (isDragging: boolean) => void;
  onViewportCenter?: (center: { x: number; y: number }) => void;
  viewportCenter?: { x: number; y: number } | null;
  selectedTokenId?: string | null;
  onSelectedTokenIdChange?: (id: string | null) => void;
  selectedTokenIds?: string[];
  onSelectedTokenIdsChange?: (ids: string[]) => void;
  darknessLevel?: 'daylight' | 'dark';
  onDarknessLevelChange?: (level: 'daylight' | 'dark') => void;
  /** Ref that MapView populates so external code (e.g. player drawers) can trigger AoE spell casting */
  startCastingRef?: React.MutableRefObject<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string; mapInteraction?: string; saveEffect?: string; condition?: string }, combatantId: string) => void) | null>;
  /** Ref that MapView populates so external code can trigger spell marker placement */
  startPlacingRef?: React.MutableRefObject<((spell: { name: string; school?: string; effectRadius?: number; aoeType?: string; aoeSize?: number; range?: number; shapeType?: 'point' | 'wall' | 'ring'; maxLength?: number; maxThickness?: number; blocksVision?: boolean; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean }, combatantId: string) => void) | null>;
  /** Ref that MapView populates so external code can add spell markers directly (no interactive placement) */
  addMarkersDirectlyRef?: React.MutableRefObject<((markers: import('../../types').SpellMarker[]) => void) | null>;
  /** Ref that MapView populates so external code can cancel placed AoE */
  cancelCastingRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref that MapView populates so external code can start Enlarge/Reduce token targeting */
  startEnlargeReduceRef?: React.MutableRefObject<((mode: 'enlarge' | 'reduce', casterId: string) => void) | null>;
  /** Ref that MapView populates so players can enter ruler/measure mode */
  startMeasuringRef?: React.MutableRefObject<((edge: 'top' | 'bottom' | 'left') => void) | null>;
  /** Ref that MapView populates so players can cancel measure mode */
  cancelMeasuringRef?: React.MutableRefObject<(() => void) | null>;
  /** Called with the current measured distance in feet as the player drags (null when cleared) */
  onMeasureDistanceChange?: (feet: number | null) => void;
  /** Ref that MapView populates so external code can confirm cast (roll saves) */
  confirmCastRef?: React.MutableRefObject<(() => boolean) | null>;
  /** Called when placed AoE is dismissed (by any means) */
  onCastingDismissed?: () => void;
  /** Ref that MapView populates so external code (e.g. DM apply-damage) can immediately clear the remote AoE */
  clearRemoteAoeRef?: React.MutableRefObject<(() => void) | null>;
  /** Called when tokens in AoE changes — passes combatant IDs of affected tokens */
  onAoeHighlightsChange?: (data: { affectedCombatantIds: string[]; saveResults: Record<string, SaveResult> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string; saveEffect?: string; condition?: string } | null) => void;
  /** Ref that MapView populates so external code (e.g. CombatView "Next Turn") can clear movement paths */
  clearMovementPathsRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref that MapView populates so external code can undo a specific token's movement */
  undoMovementRef?: React.MutableRefObject<((tokenId: string) => void) | null>;
  /** Called when a cast-and-emanate spell is confirmed — parent should create the persistent emanation */
  onEmanationCast?: (spellName: string, casterId: string) => void;
  /** Called when the set of tokens with completed movement paths changes */
  onMovementPathTokensChange?: (tokenIds: Set<string>) => void;
  /** ID of the currently active combatant (for turn indicator) */
  activeCombatantId?: string | null;
  /** Called when a player double-taps their own token; provides screen coordinates for ring positioning */
  onPlayerTokenDoubleTap?: (tokenId: string, screenX: number, screenY: number) => void;
  /** Set of combatant IDs currently targeted by players */
  targetedCombatantIds?: Set<string>;
  /** Called when a player taps an enemy token to toggle targeting */
  onToggleTarget?: (combatantId: string) => void;
  /** Called when a player taps empty space to clear all targets */
  onClearTargets?: () => void;
  viewpoints?: Viewpoint[];
  onViewpointsChange?: (viewpoints: Viewpoint[]) => void;
  /** Current active floor ID for floor-aware token placement */
  activeFloorId?: string | null;
  /** All floors in the current scenario (for transition zone config) */
  floors?: Floor[];
  /** Callback to update transition zones on the active floor */
  onTransitionZonesChange?: (zones: TransitionZone[]) => void;
  /** Switch the active floor (for two-step transition zone drawing) */
  onSwitchFloor?: (floorId: string) => void;
  /** Always switch the *real* active floor when a token transitions through a zone.
   *  Distinct from `onSwitchFloor` because secondary panels in split view rewire
   *  `onSwitchFloor` to only change their own panel; transitions must affect the
   *  whole view regardless of which panel they fire from. */
  onTransitionToFloor?: (floorId: string) => void;
  /** Update a specific floor by ID (for cross-floor operations) */
  onUpdateFloorById?: (floorId: string, updater: (floor: Floor) => Floor) => void;
  /** Move every player token (across all floors) to a 2×2 grid around the given point */
  onMoveAllPlayersHere?: (x: number, y: number, floorId: string, spacingPx: number) => void;
  /** Whether this is the primary (left-most) map panel */
  isPrimary?: boolean;
  /** Spell markers placed on the map */
  spellMarkers?: import('../../types').SpellMarker[];
  /** Callback to update spell markers */
  onSpellMarkersChange?: (markers: import('../../types').SpellMarker[]) => void;
  /** Tremorsense data — when active, reveals nearby enemy/NPC tokens as grey circles above fog */
  tremorsenseData?: { playerId: string; rangeFt: number } | null;
  /** Detect Magic data — when active, reveals 'magic' type map notes within range below fog */
  detectMagicData?: { playerId: string; rangeFt: number } | null;

  /** Active emanation rings that follow their casters */
  activeEmanations?: import('../../types').ActiveEmanation[];
  /** Whether any player has See Invisibility active (player view only) */
  seeInvisibility?: boolean;
  /** Active timers for tokens to display countdown rings */
  activeTimers?: import('../../types').TokenTimer[];
  /** Maps combatantId → which side of the table the player signed in on, for avatar rotation */
  playerSides?: Record<string, 'top' | 'bottom'>;

  // ── Drawings (freehand) ──
  /** Persistent strokes for the current floor. */
  drawings?: Stroke[];
  /** Called when persistent drawings change (for the active floor). */
  onDrawingsChange?: (drawings: Stroke[]) => void;
  /** Ref MapView populates so the player banner can enter drawing mode. */
  startDrawingRef?: React.MutableRefObject<((opts: { mode: 'persistent' | 'ephemeral' | 'eraser'; color: string; ownerId?: string }) => void) | null>;
  /** Ref MapView populates so the player banner can leave drawing mode. */
  cancelDrawingRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref MapView populates so the banner can clear all strokes drawn in the current pencil session. */
  clearDrawingSessionRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref MapView populates so the banner can update the active drawing color/mode without re-entering. */
  setDrawingOptionsRef?: React.MutableRefObject<((opts: { mode?: 'persistent' | 'ephemeral' | 'eraser'; color?: string }) => void) | null>;
  /** Promote an Extra token into a real Combatant using the chosen monster's statblock. */
  onPromoteExtra?: (tokenId: string, monster: Monster, opts: { combatantType: 'enemy' | 'npc'; size: string }) => void;

  // ── Ping ──
  /** Enter one-shot ping mode — next map click drops a ping. */
  startPingRef?: React.MutableRefObject<((opts: { color: string }) => void) | null>;
  /** Exit ping mode without dropping a ping. */
  cancelPingRef?: React.MutableRefObject<(() => void) | null>;
  /** Drop a ping at the given canvas coords (used to render pings received from the other window). */
  triggerPingRef?: React.MutableRefObject<((opts: { x: number; y: number; color: string }) => void) | null>;
  /** Called when the local user drops a ping by clicking — parent uses this to broadcast. */
  onPingDrop?: (opts: { x: number; y: number; color: string }) => void;

  // ── Dark zones ──
  /** Polygonal regions on the active floor that stay dark even in Daylight. */
  darkZones?: import('../../types').DarkZone[];
  /** Called when the dark-zone list changes (delete/edit). */
  onDarkZonesChange?: (zones: import('../../types').DarkZone[]) => void;
  /** When true, MapView captures clicks as polygon vertices for a new dark zone. */
  darkZonePainting?: boolean;
  /** Begin a new dark-zone paint session. */
  onStartDarkZonePainting?: () => void;
  /** Commit a painted dark-zone polygon (flat points array). */
  onDarkZonePaintCommit?: (points: number[]) => void;
  /** Cancel the current dark-zone paint session (Escape pressed or user clicked Cancel). */
  onDarkZonePaintCancel?: () => void;

  // ── Difficult terrain (DM-only; doubles measured movement cost) ──
  /** Painted regions on the active floor that cost double movement to cross. */
  difficultTerrain?: import('../../types').DifficultTerrainZone[];
  /** Called when the difficult-terrain list changes (delete/edit). */
  onDifficultTerrainChange?: (zones: import('../../types').DifficultTerrainZone[]) => void;
  /** When true, MapView captures clicks as polygon vertices for a new difficult-terrain area. */
  difficultTerrainPainting?: boolean;
  /** Begin a new difficult-terrain paint session. */
  onStartDifficultTerrainPainting?: () => void;
  /** Commit a painted difficult-terrain polygon (flat points array). */
  onDifficultTerrainPaintCommit?: (points: number[]) => void;
  /** Cancel the current difficult-terrain paint session. */
  onDifficultTerrainPaintCancel?: () => void;

  // ── Wall painting / erasing ──
  /** When true, MapView captures clicks as polyline vertices for a new wall. */
  wallPainting?: boolean;
  /** When true, clicking on an existing wall deletes it. */
  wallErasing?: boolean;
  /** When true, painted wall vertices snap to the nearest grid intersection. */
  wallSnapToGrid?: boolean;
  onStartWallPainting?: () => void;
  onStopWallPainting?: () => void;
  onToggleWallErasing?: () => void;
  onToggleWallSnapToGrid?: () => void;
  /** Replace the floor's walls array. */
  onWallsChange?: (walls: WallSegment[]) => void;

  // ── Portal placement ──
  /** When set, MapView uses a two-click span flow to add a door or window. */
  portalPlacementMode?: 'door' | 'window' | null;
  onStartPortalPlacement?: (mode: 'door' | 'window') => void;
  onStopPortalPlacement?: () => void;
  /** Replace the floor's portals array (used by eraser to delete a portal). */
  onPortalsChange?: (portals: Portal[]) => void;
  /** Replace walls + portals atomically — used when splitting a wall to add a portal. */
  onWallsAndPortalsChange?: (walls: WallSegment[], portals: Portal[]) => void;

  // ── Grid calibration ──
  /** When true, MapView captures two clicks (opposite corners of one grid square) to compute the grid. */
  gridCalibrating?: boolean;
  onStartGridCalibration?: () => void;
  onStopGridCalibration?: () => void;
  /** Called with the new GridResolution once two corners have been clicked. */
  onGridResolutionChange?: (gr: GridResolution) => void;
}

