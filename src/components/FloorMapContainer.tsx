import React, { useMemo } from 'react';
import { MapView } from './MapView';
import { Scenario, Token, Floor, Combatant, Monster, MapNote, WallSegment, Portal, GridResolution, Viewpoint, TransitionZone } from '../types';
import type { SaveResult } from './MapView';

/**
 * FloorMapContainer handles split-screen rendering when player tokens
 * occupy multiple floors. It renders one or two MapView instances.
 */

interface FloorMapContainerProps {
  scenario: Scenario;
  allTokens: Token[];
  activeFloorId: string | null;
  onTokensChange: (tokens: Token[]) => void;
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
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution) => void;
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
  cancelCastingRef?: React.MutableRefObject<(() => void) | null>;
  confirmCastRef?: React.MutableRefObject<(() => void) | null>;
  onCastingDismissed?: () => void;
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
    // Prefer showing the active floor first, then the other
    if (activeFloorId && ids.includes(activeFloorId)) {
      const other = ids.find(id => id !== activeFloorId) || ids[0];
      return [activeFloorId, other];
    }
    return [ids[0], ids[1]];
  }, [needsSplit, occupiedFloorIds, activeFloorId]);

  const activeFloor = floors.find(f => f.id === activeFloorId) || floors[0] || null;

  const firstFloorId = floors[0]?.id;
  const getFloorTokens = (floorId: string) =>
    allTokens.filter(t => t.floorId === floorId || (!t.floorId && floorId === firstFloorId));

  const buildMapViewProps = (floor: Floor, floorTokens: Token[], isPrimary: boolean) => ({
    tokens: floorTokens,
    onTokensChange: props.onTokensChange,
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
    onWallDataChange: isPrimary ? props.onWallDataChange : undefined,
    onPortalToggle: props.onPortalToggle,
    onPortalTypeChange: isPrimary ? props.onPortalTypeChange : undefined,
    onDragStatusChange: props.onDragStatusChange,
    darknessLevel: floor.darknessLevel,
    onDarknessLevelChange: isPrimary ? props.onDarknessLevelChange : undefined,
    activeFloorId: floor.id,
    floors: floors,
    onTransitionZonesChange: isPrimary ? props.onTransitionZonesChange : undefined,
    onSwitchFloor: props.onSwitchFloor,
    onUpdateFloorById: props.onUpdateFloorById,
    activeCombatantId: props.activeCombatantId,
    targetedCombatantIds: props.targetedCombatantIds,
    // Player interaction props — needed on both views for player interactivity
    onPlayerTokenDoubleTap: props.onPlayerTokenDoubleTap,
    onToggleTarget: props.onToggleTarget,
    onClearTargets: props.onClearTargets,
    // Only pass through DM-specific refs and editing callbacks to the primary view
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
      cancelCastingRef: props.cancelCastingRef,
      confirmCastRef: props.confirmCastRef,
      onCastingDismissed: props.onCastingDismissed,
      clearRemoteAoeRef: props.clearRemoteAoeRef,
      onAoeHighlightsChange: props.onAoeHighlightsChange,
      clearMovementPathsRef: props.clearMovementPathsRef,
      undoMovementRef: props.undoMovementRef,
      onMovementPathTokensChange: props.onMovementPathTokensChange,
    } : {}),
  });

  if (!needsSplit || !splitFloorIds) {
    // Single floor view
    if (!activeFloor) return null;
    const floorTokens = getFloorTokens(activeFloor.id);
    return <MapView {...buildMapViewProps(activeFloor, floorTokens, true)} />;
  }

  // Split-screen: two MapViews side by side
  const [primaryFloorId, secondaryFloorId] = splitFloorIds;
  const primaryFloor = floors.find(f => f.id === primaryFloorId);
  const secondaryFloor = floors.find(f => f.id === secondaryFloorId);
  if (!primaryFloor || !secondaryFloor) return null;

  return (
    <div className="flex w-full h-full">
      <div className="w-1/2 h-full relative border-r border-[var(--line)]">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-black/60 rounded-full text-[10px] font-bold tracking-widest uppercase text-white/70 pointer-events-none">
          {primaryFloor.name}
        </div>
        <MapView {...buildMapViewProps(primaryFloor, getFloorTokens(primaryFloorId), true)} />
      </div>
      <div className="w-1/2 h-full relative">
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-black/60 rounded-full text-[10px] font-bold tracking-widest uppercase text-white/70 pointer-events-none">
          {secondaryFloor.name}
        </div>
        <MapView {...buildMapViewProps(secondaryFloor, getFloorTokens(secondaryFloorId), false)} />
      </div>
    </div>
  );
}
