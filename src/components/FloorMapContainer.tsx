import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MapView } from './MapView';
import { motion, AnimatePresence } from 'motion/react';
import { Scenario, Token, Floor, Combatant, Monster, MapNote, WallSegment, Portal, GridResolution, Viewpoint, TransitionZone, UVTTLight } from '../types';
import type { SaveResult } from './MapView';

/**
 * FloorMapContainer handles split-screen rendering when player tokens
 * occupy multiple floors. It renders one or two MapView instances.
 */

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
  onAddEnemy: (monster: Monster, x: number, y: number) => void;
  onStartCombat: (tokenIds: string[]) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  onNoteClick?: (noteId: string) => void;
  onAddScenario?: () => void;
  panToNote?: MapNote | null;
  isPlayerView?: boolean;
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
  confirmCastRef?: React.MutableRefObject<(() => void) | null>;
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
  spellMarkers?: import('../types').SpellMarker[];
  onSpellMarkersChange?: (markers: import('../types').SpellMarker[]) => void;
  tremorsenseData?: { playerId: string; rangeFt: number } | null;
  detectMagicData?: { playerId: string; rangeFt: number } | null;
  activeEmanations?: import('../types').ActiveEmanation[];
  seeInvisibility?: boolean;
  activeTimers?: import('../types').TokenTimer[];
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

  // Decide if we need split screen
  const needsSplit = occupiedFloorIds.size >= 2;

  // Get the two floors to display in split mode
  const splitFloorIds = useMemo(() => {
    if (!needsSplit) return null;
    const ids = [...occupiedFloorIds];
    // Primary: the active (left) floor
    let primaryId = (activeFloorId && ids.includes(activeFloorId)) ? activeFloorId : ids[0];
    // Secondary: use the override if valid, otherwise pick the other occupied floor
    const defaultSecondaryId = ids.find(id => id !== primaryId) || ids[1] || ids[0];
    const secondaryId = (secondaryFloorOverride && floors.some(f => f.id === secondaryFloorOverride))
      ? secondaryFloorOverride
      : defaultSecondaryId;
    return [primaryId, secondaryId];
  }, [needsSplit, occupiedFloorIds, activeFloorId, secondaryFloorOverride, floors]);

  const activeFloor = floors.find(f => f.id === activeFloorId) || floors[0] || null;

  const firstFloorId = floors[0]?.id;

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

  // Independent floor selection for the right (secondary) panel
  const [secondaryFloorOverride, setSecondaryFloorOverride] = useState<string | null>(null);

  const prevSplitRef = useRef(splitFloorIds);
  const [showOverlay, setShowOverlay] = useState(false);
  const [secondaryCenter, setSecondaryCenter] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const prev = prevSplitRef.current;
    if (splitFloorIds && !prev) {
      setShowOverlay(true);
      setTimeout(() => setShowOverlay(false), 800); // fade out after slide finishes
      
      const secondaryId = splitFloorIds[1];
      const secondaryTokens = allTokens.filter(t => t.floorId === secondaryId && t.type === 'player' && !t.hidden);
      if (secondaryTokens.length > 0) {
        setSecondaryCenter({ x: secondaryTokens[0].x, y: secondaryTokens[0].y });
      }
    } else if (!splitFloorIds && prev) {
      setShowOverlay(false);
      setSecondaryCenter(null);
    }
    prevSplitRef.current = splitFloorIds;
  }, [splitFloorIds, allTokens]);

  const buildMapViewProps = (floor: Floor, floorTokens: Token[], isPrimary: boolean) => ({
    tokens: floorTokens,
    onTokensChange: (tokens: Token[]) => props.onTokensChange(floor.id, tokens),
    scenarioName: scenario.name,
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
    onAddEnemy: props.onAddEnemy,
    onStartCombat: props.onStartCombat,
    leftSidebarOpen: props.leftSidebarOpen,
    setLeftSidebarOpen: props.setLeftSidebarOpen,
    isPlayerView: props.isPlayerView,
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
    onUpdateFloorById: props.onUpdateFloorById,
    spellMarkers: props.spellMarkers,
    onSpellMarkersChange: isPrimary ? props.onSpellMarkersChange : undefined,
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
    ...(isPrimary ? {
      onNoteClick: props.onNoteClick,
      onAddScenario: props.onAddScenario,
      panToNote: props.panToNote,
      onViewportCenter: props.onViewportCenter,
      viewportCenter: props.viewportCenter,
      selectedTokenId: props.selectedTokenId,
      onSelectedTokenIdChange: props.onSelectedTokenIdChange,
      selectedTokenIds: props.selectedTokenIds,
      onSelectedTokenIdsChange: props.onSelectedTokenIdsChange,
      startCastingRef: props.startCastingRef,
      startPlacingRef: props.startPlacingRef,
      addMarkersDirectlyRef: props.addMarkersDirectlyRef,
      cancelCastingRef: props.cancelCastingRef,
      confirmCastRef: props.confirmCastRef,
      onCastingDismissed: props.onCastingDismissed,
      onEmanationCast: props.onEmanationCast,
      startMeasuringRef: props.startMeasuringRef,
      cancelMeasuringRef: props.cancelMeasuringRef,
      onMeasureDistanceChange: props.onMeasureDistanceChange,
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

  if (!primaryFloor) return null;

  return (
    <div className="flex w-full h-full overflow-hidden bg-black">
      <motion.div 
        className={`h-full relative z-10 ${splitFloorIds ? 'border-r border-[var(--line)]' : ''}`}
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
