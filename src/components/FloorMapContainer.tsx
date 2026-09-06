import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MapView } from './MapView';
import { motion, AnimatePresence } from 'motion/react';
import { Scenario, Token, Floor, Combatant, Monster, MapNote, WallSegment, Portal, GridResolution, Viewpoint, TransitionZone, UVTTLight } from '../types';
import type { SaveResult } from './MapView';

/**
 * FloorMapContainer handles split-screen rendering when player tokens
 * occupy multiple floors. Renders 1, 2, or 4 (GoldenEye-style quad) MapView
 * instances depending on how many distinct floors are occupied.
 */

export type QuadSpotId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const QUAD_SPOT_ORDER: QuadSpotId[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

interface FloorMapContainerProps {
  scenario: Scenario;
  allTokens: Token[];
  activeFloorId: string | null;
  onTokensChange: (floorId: string, tokens: Token[]) => void;
  // Shared props that get passed through to MapView
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
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
  /** When set on the DM view, fog of war is restricted to this player's vision. */
  dmViewAsPlayerId?: string | null;
  /** Show token name labels on the DM screen (campaign setting; defaults to true). */
  showTokenNames?: boolean;
  onMapChange: (mapImage: string) => void;
  onMapNotesChange: (notes: MapNote[]) => void;
  onViewpointsChange?: (viewpoints: Viewpoint[]) => void;
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution, lights?: UVTTLight[]) => void;
  onPortalToggle?: (portalId: string) => void;
  onPortalTypeChange?: (portalId: string, type: 'door' | 'window') => void;
  onDragStatusChange?: (isDragging: boolean) => void;
  onViewportCenter?: (center: { x: number; y: number }) => void;
  viewportCenter?: { x: number; y: number } | null;
  selectedTokenId?: string | null;
  onSelectedTokenIdChange?: (id: string | null) => void;
  selectedTokenIds?: string[];
  onSelectedTokenIdsChange?: (ids: string[]) => void;
  onDarknessLevelChange?: (level: 'daylight' | 'dark') => void;
  startCastingRef?: React.MutableRefObject<((spell: any, combatantId: string) => void) | null>;
  startPlacingRef?: React.MutableRefObject<((spell: { name: string; school?: string; effectRadius?: number; range?: number; shapeType?: 'point' | 'wall'; maxLength?: number; maxThickness?: number; blocksVision?: boolean; aoeType?: string; aoeSize?: number }, combatantId: string) => void) | null>;
  addMarkersDirectlyRef?: React.MutableRefObject<((markers: import('../types').SpellMarker[]) => void) | null>;
  cancelCastingRef?: React.MutableRefObject<(() => void) | null>;
  startEnlargeReduceRef?: React.MutableRefObject<((mode: 'enlarge' | 'reduce', casterId: string) => void) | null>;
  confirmCastRef?: React.MutableRefObject<(() => boolean) | null>;
  onCastingDismissed?: () => void;
  onEmanationCast?: (spellName: string, casterId: string) => void;
  startMeasuringRef?: React.MutableRefObject<((edge: 'top' | 'bottom' | 'left') => void) | null>;
  cancelMeasuringRef?: React.MutableRefObject<(() => void) | null>;
  onMeasureDistanceChange?: (feet: number | null) => void;
  clearRemoteAoeRef?: React.MutableRefObject<(() => void) | null>;
  onAoeHighlightsChange?: (data: { affectedCombatantIds: string[]; saveResults: Record<string, SaveResult> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string } | null) => void;
  clearMovementPathsRef?: React.MutableRefObject<(() => void) | null>;
  undoMovementRef?: React.MutableRefObject<((tokenId: string) => void) | null>;
  onMovementPathTokensChange?: (tokenIds: Set<string>) => void;
  activeCombatantId?: string | null;
  onPlayerTokenDoubleTap?: (tokenId: string, screenX: number, screenY: number) => void;
  targetedCombatantIds?: Set<string>;
  onToggleTarget?: (combatantId: string) => void;
  onClearTargets?: () => void;
  onTransitionZonesChange?: (zones: TransitionZone[]) => void;
  onSwitchFloor?: (floorId: string) => void;
  onUpdateFloorById?: (floorId: string, updater: (floor: Floor) => Floor) => void;
  onMoveAllPlayersHere?: (x: number, y: number, floorId: string, spacingPx: number) => void;
  spellMarkers?: import('../types').SpellMarker[];
  onSpellMarkersChange?: (markers: import('../types').SpellMarker[]) => void;
  /** Called when persistent drawings on a floor change. */
  onDrawingsChange?: (floorId: string, drawings: import('../types').Stroke[]) => void;
  startDrawingRef?: React.MutableRefObject<((opts: { mode: 'persistent' | 'ephemeral' | 'eraser'; color: string; ownerId?: string }) => void) | null>;
  cancelDrawingRef?: React.MutableRefObject<(() => void) | null>;
  clearDrawingSessionRef?: React.MutableRefObject<(() => void) | null>;
  setDrawingOptionsRef?: React.MutableRefObject<((opts: { mode?: 'persistent' | 'ephemeral' | 'eraser'; color?: string }) => void) | null>;
  startPingRef?: React.MutableRefObject<((opts: { color: string }) => void) | null>;
  cancelPingRef?: React.MutableRefObject<(() => void) | null>;
  triggerPingRef?: React.MutableRefObject<((opts: { x: number; y: number; color: string }) => void) | null>;
  onPingDrop?: (opts: { x: number; y: number; color: string; floorId: string }) => void;
  tremorsenseData?: { playerId: string; rangeFt: number } | null;
  detectMagicData?: { playerId: string; rangeFt: number } | null;
  activeEmanations?: import('../types').ActiveEmanation[];
  seeInvisibility?: boolean;
  activeTimers?: import('../types').TokenTimer[];
  viewerCasterIds?: string[];
  playerSides?: Record<string, 'top' | 'bottom'>;
  /** Map from combatantId -> the spot (quadrant) where that player signed in.
   *  Used to position quadrants in 4-up GoldenEye-style split. */
  playerSpots?: Record<string, QuadSpotId>;
  onPromoteExtra?: (tokenId: string, monster: Monster, opts: { combatantType: 'enemy' | 'npc'; size: string }) => void;
  /** Tier 2 zone painting template (active only on the primary panel). */
  /** Per-floor updates to the list of Dark Zones. */
  onDarkZonesChange?: (floorId: string, zones: import('../types').DarkZone[]) => void;
  /** When true, the primary MapView captures clicks as polygon vertices for a new dark zone. */
  darkZonePainting?: boolean;
  onStartDarkZonePainting?: () => void;
  onDarkZonePaintCommit?: (points: number[]) => void;
  onDarkZonePaintCancel?: () => void;
  /** Per-floor updates to the list of Difficult Terrain areas. */
  onDifficultTerrainChange?: (floorId: string, zones: import('../types').DifficultTerrainZone[]) => void;
  /** When true, the primary MapView captures clicks as polygon vertices for a new difficult-terrain area. */
  difficultTerrainPainting?: boolean;
  onStartDifficultTerrainPainting?: () => void;
  onDifficultTerrainPaintCommit?: (points: number[]) => void;
  onDifficultTerrainPaintCancel?: () => void;
  // ── Wall painting/erasing ──
  wallPainting?: boolean;
  wallErasing?: boolean;
  wallSnapToGrid?: boolean;
  onStartWallPainting?: () => void;
  onStopWallPainting?: () => void;
  onToggleWallErasing?: () => void;
  onToggleWallSnapToGrid?: () => void;
  /** Replace the active floor's walls array (just walls, not portals or objectWalls). */
  onWallsChange?: (walls: import('../types').WallSegment[]) => void;
  // ── Portal placement (two-click span) ──
  portalPlacementMode?: 'door' | 'window' | null;
  onStartPortalPlacement?: (mode: 'door' | 'window') => void;
  onStopPortalPlacement?: () => void;
  /** Replace the active floor's portals array. */
  onPortalsChange?: (portals: import('../types').Portal[]) => void;
  /** Replace walls + portals atomically — used when splitting a wall to add a portal. */
  onWallsAndPortalsChange?: (
    walls: import('../types').WallSegment[],
    portals: import('../types').Portal[]
  ) => void;
  // ── Grid calibration ──
  gridCalibrating?: boolean;
  onStartGridCalibration?: () => void;
  onStopGridCalibration?: () => void;
  onGridResolutionChange?: (gr: import('../types').GridResolution) => void;
}

export function FloorMapContainer(props: FloorMapContainerProps) {
  const { scenario, allTokens, activeFloorId, isPlayerView } = props;
  const floors = scenario.floors || [];

  // Determine which floors have player tokens on them
  const occupiedFloorIds = useMemo(() => {
    const ids = new Set<string>();
    const defaultFloorId = floors[0]?.id;
    for (const t of allTokens) {
      if (t.type === 'player' && !t.hidden) {
        ids.add(t.floorId || defaultFloorId || '');
      }
    }
    ids.delete('');
    return ids;
  }, [allTokens, floors]);

  // Layout mode based on how many floors players occupy
  const layoutMode: 'full' | 'split' | 'quad' =
    occupiedFloorIds.size >= 3 ? 'quad'
    : occupiedFloorIds.size === 2 ? 'split'
    : 'full';

  // Independent floor selection for the right (secondary) panel (2-up only)
  const [secondaryFloorOverride, setSecondaryFloorOverride] = useState<string | null>(null);

  // Get the two floors to display in 2-up split mode
  const splitFloorIds = useMemo(() => {
    if (layoutMode !== 'split') return null;
    const ids = [...occupiedFloorIds];
    // Primary: the active (left) floor
    let primaryId = (activeFloorId && ids.includes(activeFloorId)) ? activeFloorId : ids[0];
    // Secondary: use the override if valid, otherwise pick the other occupied floor
    const defaultSecondaryId = ids.find(id => id !== primaryId) || ids[1] || ids[0];
    const secondaryId = (secondaryFloorOverride && floors.some(f => f.id === secondaryFloorOverride))
      ? secondaryFloorOverride
      : defaultSecondaryId;
    return [primaryId, secondaryId];
  }, [layoutMode, occupiedFloorIds, activeFloorId, secondaryFloorOverride, floors]);

  const activeFloor = floors.find(f => f.id === activeFloorId) || floors[0] || null;

  const firstFloorId = floors[0]?.id;

  // Quad (4-up) assignment: maps each spot (top-left, top-right, …) to a floorId.
  // Floors are placed into the quadrant matching where their player signed in.
  // Floors with no signed-in player (or with conflicts) fall back to filling free spots.
  const quadAssignments = useMemo<Record<QuadSpotId, string | null> | null>(() => {
    if (layoutMode !== 'quad') return null;
    const result: Record<QuadSpotId, string | null> = {
      'top-left': null, 'top-right': null, 'bottom-left': null, 'bottom-right': null,
    };
    const ids = [...occupiedFloorIds];

    // Build floor -> player-spot preferences using tokens currently on that floor
    const floorToSpots = new Map<string, QuadSpotId[]>();
    for (const id of ids) {
      const spots: QuadSpotId[] = [];
      for (const t of allTokens) {
        const onFloor = t.floorId === id || (!t.floorId && id === firstFloorId);
        if (!onFloor || t.type !== 'player' || t.hidden) continue;
        const spot = props.playerSpots?.[t.combatantId ?? ''];
        if (spot && !spots.includes(spot)) spots.push(spot);
      }
      floorToSpots.set(id, spots);
    }

    // Place constrained floors first (fewer preference options → claim earlier)
    const placed = new Set<string>();
    const ordered = [...ids].sort((a, b) =>
      (floorToSpots.get(a)?.length || 99) - (floorToSpots.get(b)?.length || 99)
    );
    for (const id of ordered) {
      const prefs = floorToSpots.get(id) || [];
      const free = prefs.find(s => result[s] === null);
      if (free) {
        result[free] = id;
        placed.add(id);
      }
    }
    // Fill any remaining unplaced floors into remaining quadrants in spot order
    for (const id of ordered) {
      if (placed.has(id)) continue;
      const freeSpot = QUAD_SPOT_ORDER.find(s => result[s] === null);
      if (!freeSpot) break;
      result[freeSpot] = id;
      placed.add(id);
    }
    return result;
  }, [layoutMode, occupiedFloorIds, allTokens, firstFloorId, props.playerSpots]);

  // Produce stable token arrays per floor — without memoization, .filter() creates a new array
  // reference on every render, which causes MapView's tokensInAoe useMemo to always invalidate,
  // triggering an infinite onAoeHighlightsChange → setAoeHighlights → re-render loop.
  const floorTokensMap = useMemo(() => {
    const map = new Map<string, Token[]>();
    for (const floor of floors) {
      map.set(
        floor.id,
        allTokens.filter(t => t.floorId === floor.id || (!t.floorId && floor.id === firstFloorId))
      );
    }
    return map;
  }, [allTokens, floors, firstFloorId]);

  const getFloorTokens = (floorId: string) => floorTokensMap.get(floorId) ?? [];

  const prevOccupiedRef = useRef<Set<string>>(new Set());
  const [showOverlay, setShowOverlay] = useState(false);
  // Per-floor camera-center override. Set when a new floor becomes occupied or
  // when a floor's player set changes, so the panel re-centers on its players.
  const [floorCenters, setFloorCenters] = useState<Record<string, { x: number; y: number } | null>>({});
  // One-shot center override for the active/primary floor (e.g. on re-center after split).
  const [primaryCenterOverride, setPrimaryCenterOverride] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const prev = prevOccupiedRef.current;
    const next = occupiedFloorIds;
    const newlyAdded = [...next].filter(id => !prev.has(id));
    const removed = [...prev].filter(id => !next.has(id));

    if (newlyAdded.length > 0) {
      setShowOverlay(true);
      setTimeout(() => setShowOverlay(false), 800);

      const updates: Record<string, { x: number; y: number }> = {};

      // Center each newly occupied floor on its first arriving player
      for (const id of newlyAdded) {
        const tokens = allTokens.filter(t =>
          (t.floorId === id || (!t.floorId && id === firstFloorId)) && t.type === 'player' && !t.hidden
        );
        if (tokens.length > 0) {
          updates[id] = { x: tokens[0].x, y: tokens[0].y };
        }
      }

      // Re-center previously-occupied floors on their remaining players
      // (a player may have just moved off them onto the new floor).
      for (const id of next) {
        if (newlyAdded.includes(id)) continue;
        const tokens = allTokens.filter(t =>
          (t.floorId === id || (!t.floorId && id === firstFloorId)) && t.type === 'player' && !t.hidden
        );
        if (tokens.length === 0) continue;
        const avgX = tokens.reduce((s, t) => s + t.x, 0) / tokens.length;
        const avgY = tokens.reduce((s, t) => s + t.y, 0) / tokens.length;
        // For the active floor, use the one-shot override path so the DM-driven viewportCenter takes back over after a tick.
        if (id === activeFloorId) {
          setPrimaryCenterOverride({ x: avgX, y: avgY });
          setTimeout(() => setPrimaryCenterOverride(null), 100);
        } else {
          updates[id] = { x: avgX, y: avgY };
        }
      }

      if (Object.keys(updates).length > 0) {
        setFloorCenters(prev => ({ ...prev, ...updates }));
      }
    }

    if (removed.length > 0) {
      setFloorCenters(prev => {
        const updated = { ...prev };
        let changed = false;
        for (const id of removed) {
          if (id in updated) { delete updated[id]; changed = true; }
        }
        return changed ? updated : prev;
      });
    }

    if (next.size <= 1) {
      setShowOverlay(false);
    }

    prevOccupiedRef.current = new Set(next);
  }, [occupiedFloorIds, allTokens, firstFloorId, activeFloorId]);

  const buildMapViewProps = (floor: Floor, floorTokens: Token[], isPrimary: boolean) => ({
    tokens: floorTokens,
    onTokensChange: (tokens: Token[]) => props.onTokensChange(floor.id, tokens),
    scenarioName: scenario.name,
    scenarioId: scenario.id,
    exploredFogResetAt: floor.exploredFogResetAt,
    mapImage: floor.mapImage,
    onMapChange: isPrimary ? props.onMapChange : () => {},
    mapNotes: floor.mapNotes || [],
    onMapNotesChange: isPrimary ? props.onMapNotesChange : () => {},
    viewpoints: floor.viewpoints || [],
    onViewpointsChange: isPrimary ? props.onViewpointsChange : undefined,
    players: props.players,
    npcs: props.npcs,
    persistentEnemies: props.persistentEnemies,
    scenarioCombatants: scenario.combatants || [],
    activeCombatants: scenario.activeCombatants || [],
    onUpdateCombatantHp: props.onUpdateCombatantHp,
    onAddCondition: props.onAddCondition,
    onRemoveCondition: props.onRemoveCondition,
    onAddEnemy: props.onAddEnemy,
    onAddSummonCombatant: props.onAddSummonCombatant,
    onStartCombat: props.onStartCombat,
    leftSidebarOpen: props.leftSidebarOpen,
    setLeftSidebarOpen: props.setLeftSidebarOpen,
    isPlayerView: props.isPlayerView,
    dmViewAsPlayerId: props.dmViewAsPlayerId,
    showTokenNames: props.showTokenNames,
    walls: floor.walls,
    objectWalls: floor.objectWalls,
    portals: floor.portals,
    gridResolution: floor.gridResolution,
    lights: floor.lights ?? [],
    onWallDataChange: isPrimary ? props.onWallDataChange : undefined,
    onPortalToggle: props.onPortalToggle,
    onPortalTypeChange: isPrimary ? props.onPortalTypeChange : undefined,
    onDragStatusChange: props.onDragStatusChange,
    darknessLevel: floor.darknessLevel,
    onDarknessLevelChange: isPrimary ? props.onDarknessLevelChange : undefined,
    activeFloorId: floor.id,
    floors: floors,
    onTransitionZonesChange: isPrimary ? props.onTransitionZonesChange : undefined,
    onSwitchFloor: isPrimary ? props.onSwitchFloor : (floorId: string) => setSecondaryFloorOverride(floorId),
    // Transition zones must always change the *real* active floor (never the
    // secondary-panel-only override) — otherwise a player who triggers a
    // transition from the secondary panel ends up with the view not following.
    onTransitionToFloor: props.onSwitchFloor,
    onUpdateFloorById: props.onUpdateFloorById,
    onMoveAllPlayersHere: props.onMoveAllPlayersHere,
    spellMarkers: props.spellMarkers,
    onSpellMarkersChange: isPrimary ? props.onSpellMarkersChange : undefined,
    drawings: floor.drawings || [],
    onDrawingsChange: (next: import('../types').Stroke[]) => props.onDrawingsChange?.(floor.id, next),
    darkZones: floor.darkZones || [],
    onDarkZonesChange: (next: import('../types').DarkZone[]) => props.onDarkZonesChange?.(floor.id, next),
    darkZonePainting: isPrimary ? (props.darkZonePainting ?? false) : false,
    onStartDarkZonePainting: isPrimary ? props.onStartDarkZonePainting : undefined,
    onDarkZonePaintCommit: isPrimary ? props.onDarkZonePaintCommit : undefined,
    onDarkZonePaintCancel: isPrimary ? props.onDarkZonePaintCancel : undefined,
    difficultTerrain: floor.difficultTerrain || [],
    onDifficultTerrainChange: (next: import('../types').DifficultTerrainZone[]) => props.onDifficultTerrainChange?.(floor.id, next),
    difficultTerrainPainting: isPrimary ? (props.difficultTerrainPainting ?? false) : false,
    onStartDifficultTerrainPainting: isPrimary ? props.onStartDifficultTerrainPainting : undefined,
    onDifficultTerrainPaintCommit: isPrimary ? props.onDifficultTerrainPaintCommit : undefined,
    onDifficultTerrainPaintCancel: isPrimary ? props.onDifficultTerrainPaintCancel : undefined,
    wallPainting: isPrimary ? (props.wallPainting ?? false) : false,
    wallErasing: isPrimary ? (props.wallErasing ?? false) : false,
    wallSnapToGrid: isPrimary ? (props.wallSnapToGrid ?? false) : false,
    onStartWallPainting: isPrimary ? props.onStartWallPainting : undefined,
    onStopWallPainting: isPrimary ? props.onStopWallPainting : undefined,
    onToggleWallErasing: isPrimary ? props.onToggleWallErasing : undefined,
    onToggleWallSnapToGrid: isPrimary ? props.onToggleWallSnapToGrid : undefined,
    onWallsChange: isPrimary ? props.onWallsChange : undefined,
    portalPlacementMode: isPrimary ? (props.portalPlacementMode ?? null) : null,
    onStartPortalPlacement: isPrimary ? props.onStartPortalPlacement : undefined,
    onStopPortalPlacement: isPrimary ? props.onStopPortalPlacement : undefined,
    onPortalsChange: isPrimary ? props.onPortalsChange : undefined,
    onWallsAndPortalsChange: isPrimary ? props.onWallsAndPortalsChange : undefined,
    gridCalibrating: isPrimary ? (props.gridCalibrating ?? false) : false,
    onStartGridCalibration: isPrimary ? props.onStartGridCalibration : undefined,
    onStopGridCalibration: isPrimary ? props.onStopGridCalibration : undefined,
    onGridResolutionChange: isPrimary ? props.onGridResolutionChange : undefined,
    activeCombatantId: props.activeCombatantId,
    targetedCombatantIds: props.targetedCombatantIds,
    onPlayerTokenDoubleTap: props.onPlayerTokenDoubleTap,
    onToggleTarget: props.onToggleTarget,
    onClearTargets: props.onClearTargets,
    tremorsenseData: props.tremorsenseData,
    detectMagicData: props.detectMagicData,
    activeEmanations: props.activeEmanations,
    seeInvisibility: props.seeInvisibility,
    activeTimers: props.activeTimers,
    viewerCasterIds: props.viewerCasterIds,
    playerSides: props.playerSides,
    onPromoteExtra: isPrimary ? props.onPromoteExtra : undefined,
    selectedTokenId: props.selectedTokenId,
    onSelectedTokenIdChange: props.onSelectedTokenIdChange,
    selectedTokenIds: props.selectedTokenIds,
    onSelectedTokenIdsChange: props.onSelectedTokenIdsChange,
    ...(isPrimary ? {
      onNoteClick: props.onNoteClick,
      onAddScenario: props.onAddScenario,
      panToNote: props.panToNote,
      onViewportCenter: props.onViewportCenter,
      // Prefer (in order): a one-shot recenter override, the per-floor center
      // that gets set when a transition makes this floor newly occupied (so the
      // camera lands on the arriving player), and finally the DM-driven center.
      viewportCenter: primaryCenterOverride || floorCenters[floor.id] || props.viewportCenter,
      startCastingRef: props.startCastingRef,
      startPlacingRef: props.startPlacingRef,
      addMarkersDirectlyRef: props.addMarkersDirectlyRef,
      cancelCastingRef: props.cancelCastingRef,
      startEnlargeReduceRef: props.startEnlargeReduceRef,
      confirmCastRef: props.confirmCastRef,
      onCastingDismissed: props.onCastingDismissed,
      onEmanationCast: props.onEmanationCast,
      startMeasuringRef: props.startMeasuringRef,
      cancelMeasuringRef: props.cancelMeasuringRef,
      onMeasureDistanceChange: props.onMeasureDistanceChange,
      startDrawingRef: props.startDrawingRef,
      cancelDrawingRef: props.cancelDrawingRef,
      clearDrawingSessionRef: props.clearDrawingSessionRef,
      setDrawingOptionsRef: props.setDrawingOptionsRef,
      startPingRef: props.startPingRef,
      cancelPingRef: props.cancelPingRef,
      triggerPingRef: props.triggerPingRef,
      onPingDrop: props.onPingDrop
        ? (opts: { x: number; y: number; color: string }) =>
            props.onPingDrop?.({ ...opts, floorId: floor.id })
        : undefined,
      clearRemoteAoeRef: props.clearRemoteAoeRef,
      onAoeHighlightsChange: props.onAoeHighlightsChange,
      clearMovementPathsRef: props.clearMovementPathsRef,
      undoMovementRef: props.undoMovementRef,
      onMovementPathTokensChange: props.onMovementPathTokensChange,
    } : {}),
    isPrimary,
  });

  const primaryFloor = splitFloorIds ? floors.find(f => f.id === splitFloorIds[0]) : activeFloor;
  const secondaryFloor = splitFloorIds ? floors.find(f => f.id === splitFloorIds[1]) : null;

  // ── Quad (4-up) render path ─────────────────────────────────────────────
  if (layoutMode === 'quad' && quadAssignments) {
    // The "primary" panel is the one for the active floor (gets full DM controls).
    // If the active floor isn't among the occupied ones, pick the first placed floor as primary.
    const activeIsPlaced = activeFloorId && Object.values(quadAssignments).includes(activeFloorId);
    const fallbackPrimaryId = QUAD_SPOT_ORDER.map(s => quadAssignments[s]).find(id => id) || null;
    const primaryId = activeIsPlaced ? activeFloorId : fallbackPrimaryId;

    return (
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full overflow-hidden bg-black">
        {QUAD_SPOT_ORDER.map(spot => {
          const floorId = quadAssignments[spot];
          const floor = floorId ? floors.find(f => f.id === floorId) : null;
          const isTopRow = spot === 'top-left' || spot === 'top-right';
          const isLeftCol = spot === 'top-left' || spot === 'bottom-left';
          const borderClasses = [
            !isTopRow ? 'border-t border-[var(--line)]' : '',
            isLeftCol ? 'border-r border-[var(--line)]' : '',
          ].filter(Boolean).join(' ');

          if (!floor) {
            // Empty quadrant (e.g. only 3 floors occupied) — leave dark.
            return <div key={spot} className={`relative overflow-hidden bg-black ${borderClasses}`} />;
          }

          const isPrimary = floor.id === primaryId;
          const center = isPrimary
            ? (primaryCenterOverride || floorCenters[floor.id] || props.viewportCenter || undefined)
            : (floorCenters[floor.id] || undefined);

          return (
            <div key={spot} className={`relative overflow-hidden ${borderClasses}`}>
              <MapView
                {...buildMapViewProps(floor, getFloorTokens(floor.id), isPrimary)}
                viewportCenter={center}
              />
              <AnimatePresence>
                {showOverlay && (
                  <motion.div
                    className="absolute inset-0 bg-black z-40 pointer-events-none"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Full / 2-up (split) render path ────────────────────────────────────
  if (!primaryFloor) return null;

  const secondaryCenter = secondaryFloor ? floorCenters[secondaryFloor.id] : null;

  // Place the new (secondary) panel on the side of the table where its players
  // are sitting — mirrors the quad-mode behavior. Defaults to the right.
  let secondaryOnLeft = false;
  if (secondaryFloor) {
    let leftCount = 0;
    let rightCount = 0;
    for (const t of allTokens) {
      if (t.type !== 'player' || t.floorId !== secondaryFloor.id) continue;
      const spot = props.playerSpots?.[t.combatantId ?? ''];
      if (spot === 'top-left' || spot === 'bottom-left') leftCount++;
      else if (spot === 'top-right' || spot === 'bottom-right') rightCount++;
    }
    secondaryOnLeft = leftCount > rightCount;
  }

  return (
    <div className={`flex w-full h-full overflow-hidden bg-black ${secondaryOnLeft ? 'flex-row-reverse' : ''}`}>
      <motion.div
        className={`h-full relative z-10 ${splitFloorIds ? (secondaryOnLeft ? 'border-l' : 'border-r') + ' border-[var(--line)]' : ''}`}
        initial={{ width: '100%' }}
        animate={{ width: splitFloorIds ? '50%' : '100%' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <MapView {...buildMapViewProps(primaryFloor, getFloorTokens(primaryFloor.id), true)} />
      </motion.div>
      <AnimatePresence>
        {splitFloorIds && secondaryFloor && (
          <motion.div
            className="h-full relative overflow-hidden shrink-0"
            initial={{ width: '0%', opacity: 1 }}
            animate={{ width: '50%', opacity: 1 }}
            exit={{ width: '0%', opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="absolute inset-0 min-w-[50vw]">
              <MapView
                {...buildMapViewProps(secondaryFloor, getFloorTokens(secondaryFloor.id), false)}
                viewportCenter={secondaryCenter || undefined}
              />
            </div>

            <AnimatePresence>
              {showOverlay && (
                <motion.div
                  className="absolute inset-0 bg-black z-40 pointer-events-none"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
