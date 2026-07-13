import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Image as KonvaImage, Circle, RegularPolygon, Text, Group, Rect, Path, Line, Transformer, Arc } from 'react-konva';
import Konva from 'konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster, WallSegment, Portal, GridResolution, WallPoint, MovementPath, Floor, TransitionZone, UVTTLight, Stroke, Extra } from '../types';
import { parseUVTTFile } from '../services/uvttParser';
import { Upload, User, Users, Skull, Shield, X, EyeOff, Eye, Trash2, ChevronRight, ChevronDown, PlusCircle, Search, Map as MapIcon, FileText, Cloud, Sun, Moon, Footprints, Undo2, DoorClosed, Blinds, Edit2, SquareDashed, Layers, ArrowUpDown, SquareDashedTopSolid, Pencil, Eraser, Volume2 } from '../icons';
import { useExtras, extraImageUrl, filterExtras, allTags } from '../data/extras';
import { ManageExtrasModal } from './ManageExtrasModal';
import { MakeCreatureModal } from './MakeCreatureModal';
import { Lock, Unlock } from 'lucide-react';
import { constrainPositionAgainstWalls, getTokenCollisionRadius } from '../utils/wallCollision';
import type { Viewpoint } from '../types';
import { extractBlockingSegments, computeVisibilityPolygon, clipPolygonToCircle, computeRadiusLimitedVisibilityPolygon } from '../utils/visibility';
import { FogOfWarLayer, EXPLORED_DIM } from './FogOfWarLayer';
import {
  exploredFogKey, getExploredFogEntry, getExploredFogVersion,
  stampExploredFog, resetExploredFog, subscribeExploredFog,
} from '../utils/exploredFog';
import { motion, AnimatePresence } from 'motion/react';
import { NoteIcon } from './DMNotes';
import { audioEngine, soundUrlFromId } from '../services/audioEngine';
import { SoundPicker } from './SoundPicker';
import { useSounds } from '../data/sounds';
import { loadSoundBindings } from '../services/soundBindings';
import { BESTIARY } from '../data/bestiary';
import { BestiaryList } from './BestiaryList';
import { lookupSpell } from '../data/spellDatabase';
import { parseDamageType, getDamageRgb } from '../utils/damageColors';
import type { SpellMarker } from '../types';

import {
  pointInFlatPolygon, polygonBounds, polygonCentroid, constrainToAxis,
  SCHOOL_COLORS, hexToRgb, SPELL_COLOR_OVERRIDES, SCHOOL_ICON_SVGS, SPELL_ICON_SVGS,
  iconImageCache, makeIconSvgUrl, getIconImage, getSchoolColor, computeWallCorners, getTokenSizeMultiplier,
  getTokensInAoe,
} from './mapview/helpers';
import type { AoeState, SaveResult } from './mapview/helpers';
import {
  TokenAvatar, ActiveTurnRing, TargetRing, CountdownRing, TurnIndicatorChevrons,
  VIEWPOINT_NODES, DOOR_CLOSED_NODES, DOOR_OPEN_NODES, GRID2X2_NODES, BLINDS_NODES,
} from './mapview/tokenVisuals';
import type { IconNode } from './mapview/tokenVisuals';
import {
  WallOfFireParticles, WallOfIceParticles, WallOfIceDomeParticles, WallOfForceParticles,
  WallOfForceDomeParticles, WindWallParticles, WallOfLightParticles, WallOfSandParticles,
  PrismaticWallParticles, WallOfThornsParticles, WallOfThornsRingParticles, HallowParticles,
  ForcecageBarsParticles, ForcecageBoxParticles, PasswallParticles, BladeBarrierParticles,
  BladeBarrierRingParticles, WallOfFireRingParticles, FireballParticles,
  isFireSphereSpell, isFireConeSpell, isFireLineSpell, isFireCubeSpell,
  isThunderSphereSpell, isThunderCubeSpell, isThunderEmanationSpell,
  isLightningSphereSpell, isLightningLineSpell,
  FireConeParticles, FireLineParticles, FireCubeParticles,
  isIceSphereSpell, isIceConeSpell, isWindConeSpell, isWindLineSpell,
  IceSphereParticles, IceConeParticles, WindConeParticles,
  isPoisonSphereSpell, isAcidSphereSpell, isAcidLineSpell, isNecroticSphereSpell, isNecroticConeSpell,
  RadialAoEParticles, THUNDER_PALETTE, THUNDER_GRADIENT, ThunderShockwaveParticles, ThunderCubeParticles,
  LIGHTNING_GRADIENT, LightningSphereParticles, LightningLineParticles,
  ConeAoEParticles, LineAoEParticles, CubeAoEParticles,
  POISON_PALETTE, ACID_PALETTE, NECROTIC_PALETTE, POISON_GRADIENT, ACID_GRADIENT, NECROTIC_GRADIENT,
  ELEMENT_STYLES, getSphereElement, getConeElement, getLineElement, getCubeElement,
  GustOfWindParticles,
} from './mapview/particles';
import { WallSpellParticleLayers } from './mapview/WallSpellParticleLayers';
import { RemoteAoeLayers } from './mapview/RemoteAoeLayers';
import type { MapViewProps } from './mapview/MapViewProps';

export type { SaveResult } from './mapview/helpers';

/** Small round avatar for context-menu rows; falls back to a colored initial. */
const MenuAvatar: React.FC<{ avatar?: string; name: string; color?: string }> = ({ avatar, name, color }) => (
  <div
    className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
    style={{ background: avatar ? 'transparent' : (color || '#64748b') }}
  >
    {avatar
      ? <img src={avatar} alt="" className="w-full h-full object-cover" />
      : name[0]?.toUpperCase()}
  </div>
);

const MapViewInner: React.FC<MapViewProps> = ({
  tokens,
  onTokensChange,
  scenarioName,
  scenarioId,
  exploredFogResetAt,
  mapImage,
  onMapChange,
  mapNotes,
  onMapNotesChange,
  players,
  npcs,
  persistentEnemies,
  scenarioCombatants,
  activeCombatants,
  onUpdateCombatantHp,
  onAddCondition,
  onRemoveCondition,
  onAddEnemy,
  onAddSummonCombatant,
  onStartCombat,
  leftSidebarOpen,
  setLeftSidebarOpen,
  onNoteClick,
  onAddScenario,
  panToNote,
  isPlayerView = false,
  dmViewAsPlayerId = null,
  showTokenNames = true,
  viewerCasterIds,
  walls,
  objectWalls,
  portals,
  gridResolution,
  lights,
  onWallDataChange,
  onPortalToggle,
  onPortalTypeChange,
  onDragStatusChange,
  onViewportCenter,
  viewportCenter,
  selectedTokenId: externalSelectedId,
  onSelectedTokenIdChange,
  selectedTokenIds: externalSelectedTokenIds,
  onSelectedTokenIdsChange,
  darknessLevel,
  onDarknessLevelChange,
  startCastingRef,
  startPlacingRef,
  addMarkersDirectlyRef,
  cancelCastingRef,
  startEnlargeReduceRef,
  confirmCastRef,
  onCastingDismissed,
  startMeasuringRef,
  cancelMeasuringRef,
  onMeasureDistanceChange,
  onAoeHighlightsChange,
  onEmanationCast,
  clearMovementPathsRef,
  clearRemoteAoeRef,
  undoMovementRef,
  onMovementPathTokensChange,
  activeCombatantId: propActiveCombatantId,
  onPlayerTokenDoubleTap,
  targetedCombatantIds,
  onToggleTarget,
  onClearTargets,
  viewpoints,
  onViewpointsChange,
  activeFloorId,
  floors,
  onTransitionZonesChange,
  onSwitchFloor,
  onTransitionToFloor,
  onUpdateFloorById,
  onMoveAllPlayersHere,
  isPrimary = true,
  spellMarkers = [],
  onSpellMarkersChange,
  tremorsenseData,
  detectMagicData,
  detectPoisonData,
  activeEmanations = [],
  seeInvisibility,
  activeTimers = [],
  playerSides,
  drawings = [],
  onDrawingsChange,
  startDrawingRef,
  cancelDrawingRef,
  clearDrawingSessionRef,
  setDrawingOptionsRef,
  onPromoteExtra,
  startPingRef,
  cancelPingRef,
  triggerPingRef,
  onPingDrop,
  soundZones = [],
  onSoundZonesChange,
  zonePainting = null,
  onSoundZonePaintCommit,
  onSoundZonePaintCancel,
  darkZones = [],
  onDarkZonesChange,
  darkZonePainting = false,
  onStartDarkZonePainting,
  onDarkZonePaintCommit,
  onDarkZonePaintCancel,
  difficultTerrain = [],
  onDifficultTerrainChange,
  difficultTerrainPainting = false,
  onStartDifficultTerrainPainting,
  onDifficultTerrainPaintCommit,
  onDifficultTerrainPaintCancel,
  wallPainting = false,
  wallErasing = false,
  wallSnapToGrid = false,
  onStartWallPainting,
  onStopWallPainting,
  onToggleWallErasing,
  onToggleWallSnapToGrid,
  onWallsChange,
  portalPlacementMode = null,
  onStartPortalPlacement,
  onStopPortalPlacement,
  onPortalsChange,
  onWallsAndPortalsChange,
  gridCalibrating = false,
  onStartGridCalibration,
  onStopGridCalibration,
  onGridResolutionChange,
  onOpenFloorAudioPicker,
  onClearFloorAudio,
  onOpenSoundZones,
}) => {
  // ── Sound zone painting (Tier 2) ──
  const [zonePaintPoints, setZonePaintPoints] = useState<number[]>([]);
  const [zonePaintCursor, setZonePaintCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoneSnapToOrigin, setZoneSnapToOrigin] = useState(false);
  // ── Dark zone painting ──
  const [darkPaintPoints, setDarkPaintPoints] = useState<number[]>([]);
  const [darkPaintHover, setDarkPaintHover] = useState<{ x: number; y: number } | null>(null);
  const [darkSnapToOrigin, setDarkSnapToOrigin] = useState(false);
  const [terrainPaintPoints, setTerrainPaintPoints] = useState<number[]>([]);
  const [terrainPaintHover, setTerrainPaintHover] = useState<{ x: number; y: number } | null>(null);
  const [terrainSnapToOrigin, setTerrainSnapToOrigin] = useState(false);
  // ── Wall painting ──
  /** Flat [x1,y1,x2,y2,…] for the wall currently being drawn. */
  const [wallPaintPoints, setWallPaintPoints] = useState<number[]>([]);
  /** Cursor position in map coords while wall painting — drives the preview line + origin snap. */
  const [wallPaintHover, setWallPaintHover] = useState<{ x: number; y: number } | null>(null);
  /** True when the hover position is close enough to the first vertex to snap back to it. */
  const [wallSnapToOrigin, setWallSnapToOrigin] = useState(false);
  /** True while the floating "Edit Walls" toolbar is open. */
  const [wallEditMode, setWallEditMode] = useState(false);
  /** Exit wall-editing: close the toolbar and stop any active sub-mode. */
  const exitWallEditMode = () => {
    if (wallPainting) onStopWallPainting?.();
    if (wallErasing) onToggleWallErasing?.();
    if (portalPlacementMode) onStopPortalPlacement?.();
    setWallEditMode(false);
  };
  /** True while the floating "Dark Zones" toolbar is open. */
  const [darkZoneEditMode, setDarkZoneEditMode] = useState(false);
  /** True while clicking a dark zone on the map deletes it. */
  const [darkZoneErasing, setDarkZoneErasing] = useState(false);
  /** True while the floating "Difficult Terrain" toolbar is open. */
  const [terrainEditMode, setTerrainEditMode] = useState(false);
  /** True while clicking a difficult-terrain area on the map deletes it. */
  const [terrainErasing, setTerrainErasing] = useState(false);
  /** True while the floating "Sound Zones" toolbar is open. */
  const [soundZoneEditMode, setSoundZoneEditMode] = useState(false);
  /** True while clicking a sound zone on the map deletes it. */
  const [soundZoneErasing, setSoundZoneErasing] = useState(false);
  /**
   * Commit the wall currently being drawn (needs 2+ corners) and clear the
   * working points so a fresh wall can be started. Used by Enter and right-click.
   */
  const commitCurrentWall = () => {
    if (wallPaintPoints.length >= 4 && onWallsChange) {
      const pts: WallPoint[] = [];
      for (let i = 0; i < wallPaintPoints.length; i += 2) {
        pts.push({ x: wallPaintPoints[i], y: wallPaintPoints[i + 1] });
      }
      const newSeg: WallSegment = {
        id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        points: pts,
      };
      onWallsChange([...(walls || []), newSeg]);
      setWallPaintPoints([]);
    }
  };
  /**
   * Commit the difficult-terrain polygon currently being drawn (needs 3+ corners)
   * and clear the working points so a fresh area can be started without leaving
   * paint mode. Used by Enter, double-click, origin-snap click, right-click, and Esc.
   */
  const commitCurrentTerrain = () => {
    if (terrainPaintPoints.length >= 6) {
      onDifficultTerrainPaintCommit?.(terrainPaintPoints);
    }
    setTerrainPaintPoints([]);
    setTerrainSnapToOrigin(false);
    setTerrainPaintHover(null);
  };
  /** Commit the dark-zone polygon being drawn (3+ corners) and clear, staying in mode. */
  const commitCurrentDark = () => {
    if (darkPaintPoints.length >= 6) {
      onDarkZonePaintCommit?.(darkPaintPoints);
    }
    setDarkPaintPoints([]);
    setDarkSnapToOrigin(false);
    setDarkPaintHover(null);
  };
  /** Exit dark-zone editing: commit any in-progress shape, stop sub-modes, close the toolbar. */
  const exitDarkZoneEditMode = () => {
    if (darkZonePainting) {
      commitCurrentDark();
      onDarkZonePaintCancel?.();
    }
    setDarkZoneErasing(false);
    setDarkZoneEditMode(false);
  };
  /** Commit the sound-zone polygon being drawn (3+ corners) and clear, staying in mode. */
  const commitCurrentZone = () => {
    if (zonePaintPoints.length >= 6) {
      onSoundZonePaintCommit?.(zonePaintPoints);
    }
    setZonePaintPoints([]);
    setZoneSnapToOrigin(false);
    setZonePaintCursor(null);
  };
  /** Exit difficult-terrain editing: commit any in-progress shape, stop sub-modes, close the toolbar. */
  const exitTerrainEditMode = () => {
    if (difficultTerrainPainting) {
      commitCurrentTerrain();
      onDifficultTerrainPaintCancel?.();
    }
    setTerrainErasing(false);
    setTerrainEditMode(false);
  };
  /** Exit sound-zone editing: commit any in-progress shape, stop sub-modes, close the toolbar. */
  const exitSoundZoneEditMode = () => {
    if (zonePainting) {
      commitCurrentZone();
      onSoundZonePaintCancel?.();
    }
    setSoundZoneErasing(false);
    setSoundZoneEditMode(false);
  };
  const clearTzPaint = () => {
    setTzPaintPoints([]);
    setTzSnapToOrigin(false);
    setTzPaintHover(null);
  };
  /**
   * Finish the transition-zone polygon currently being drawn (3+ corners). The first
   * polygon opens the config modal (pick target floor); the second polygon (after the
   * config) creates the paired source/target zones across the two floors.
   */
  const commitCurrentTransition = () => {
    if (tzPaintPoints.length < 6) return;
    const points = [...tzPaintPoints];
    if (pendingPairData) {
      // Second polygon — create both zones of the pair.
      const sourceZoneId = `tz-${Date.now()}-a`;
      const targetZoneId = `tz-${Date.now()}-b`;
      const sourceCenter = polygonCentroid(pendingPairData.sourcePoints);
      const targetCenter = polygonCentroid(points);

      const targetZone: TransitionZone = {
        id: targetZoneId,
        rect: polygonBounds(points),
        points,
        targetFloorId: pendingPairData.sourceFloorId,
        targetPosition: sourceCenter,
        label: pendingPairData.label,
        pairedZoneId: sourceZoneId,
        pairIndex: pendingPairData.pairIndex,
      };
      const currentFloor = floors?.find(f => f.id === pendingPairData.targetFloorId);
      const existingTarget = currentFloor?.transitionZones || [];
      onTransitionZonesChange?.([...existingTarget, targetZone]);

      const sourceZone: TransitionZone = {
        id: sourceZoneId,
        rect: polygonBounds(pendingPairData.sourcePoints),
        points: pendingPairData.sourcePoints,
        targetFloorId: pendingPairData.targetFloorId,
        targetPosition: targetCenter,
        label: pendingPairData.label,
        pairedZoneId: targetZoneId,
        pairIndex: pendingPairData.pairIndex,
      };
      onUpdateFloorById?.(pendingPairData.sourceFloorId, (f: Floor) => ({
        ...f,
        transitionZones: [...(f.transitionZones || []), sourceZone],
      }));

      setPendingPairData(null);
      setTransitionZoneMode(false);
    } else {
      // First polygon — open the config modal to choose the target floor. Leave
      // drawing mode while configuring; the modal re-enables it for the arrival zone.
      setTransitionZoneConfig({ points });
      setTransitionZoneMode(false);
    }
    clearTzPaint();
  };
  // ── Portal placement (two-click span) ──
  /** First click anchor: identifies which wall edge and parametric position the span starts at. */
  const [portalPlaceStart, setPortalPlaceStart] = useState<
    { wallId: string; edgeIndex: number; t: number; point: { x: number; y: number } } | null
  >(null);
  /** Live projection of the cursor onto the nearest (or constrained) wall edge. */
  const [portalPlaceHover, setPortalPlaceHover] = useState<
    { wallId: string; edgeIndex: number; t: number; point: { x: number; y: number } } | null
  >(null);
  // Reset placement state whenever the mode toggles off.
  useEffect(() => {
    setPortalPlaceStart(null);
    setPortalPlaceHover(null);
  }, [portalPlacementMode]);
  // Esc cancels portal placement.
  useEffect(() => {
    if (!portalPlacementMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (portalPlaceStart) {
          setPortalPlaceStart(null);
        } else {
          onStopPortalPlacement?.();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [portalPlacementMode, portalPlaceStart, onStopPortalPlacement]);

  // ── Grid calibration via a draggable/resizable Bandit token ──
  /** Live draft of where the calibration bandit sits and how big it is.
   *  ppg = pixels per 5 ft (one grid square). The bandit is Medium = 1 square = ppg wide. */
  const [calibrationDraft, setCalibrationDraft] = useState<{ x: number; y: number; ppg: number } | null>(null);
  // When calibration mode toggles on, drop a starter bandit at the viewport center,
  // sized to the current pixelsPerGrid (or a sensible default).
  useEffect(() => {
    if (!gridCalibrating) {
      setCalibrationDraft(null);
      return;
    }
    const startPpg = gridResolution?.pixelsPerGrid ?? 70;
    // Place near the center of the loaded map, falling back to (200,200).
    const cx = loadedImage ? loadedImage.width / 2 : 200;
    const cy = loadedImage ? loadedImage.height / 2 : 200;
    setCalibrationDraft({ x: cx, y: cy, ppg: startPpg });
  }, [gridCalibrating]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc cancels calibration.
  useEffect(() => {
    if (!gridCalibrating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStopGridCalibration?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gridCalibrating, onStopGridCalibration]);

  /**
   * Project a map-coord point onto the nearest wall edge within `threshold` pixels.
   * If `constrainTo` is given, only that wall edge is considered (used for the second
   * portal click so the span stays on the same edge as the start anchor).
   */
  const projectToWallEdge = (
    p: { x: number; y: number },
    threshold: number,
    constrainTo?: { wallId: string; edgeIndex: number }
  ): { wallId: string; edgeIndex: number; t: number; point: { x: number; y: number } } | null => {
    let best: { wallId: string; edgeIndex: number; t: number; point: { x: number; y: number }; distSq: number } | null = null;
    const thresholdSq = threshold * threshold;
    const consider = (w: WallSegment, edgeIndex: number) => {
      const a = w.points[edgeIndex];
      const b = w.points[edgeIndex + 1];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const ex = p.x - cx, ey = p.y - cy;
      const d2 = ex * ex + ey * ey;
      if (d2 <= thresholdSq && (!best || d2 < best.distSq)) {
        best = { wallId: w.id, edgeIndex, t, point: { x: cx, y: cy }, distSq: d2 };
      }
    };
    if (constrainTo) {
      const w = (walls || []).find(w => w.id === constrainTo.wallId);
      if (w) consider(w, constrainTo.edgeIndex);
    } else {
      for (const w of walls || []) {
        for (let i = 0; i + 1 < w.points.length; i++) consider(w, i);
      }
    }
    if (!best) return null;
    const { wallId, edgeIndex, t, point } = best;
    return { wallId, edgeIndex, t, point };
  };
  // Reset paint points whenever the painting session starts or ends.
  useEffect(() => {
    setZonePaintPoints([]);
    setZonePaintCursor(null);
    setZoneSnapToOrigin(false);
  }, [zonePainting]);
  // Keyboard: Enter commits the current sound zone and chains a new one; Esc commits
  // any pending zone then exits paint mode.
  useEffect(() => {
    if (!zonePainting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        commitCurrentZone();
        onSoundZonePaintCancel?.();
      } else if (e.key === 'Enter') {
        commitCurrentZone();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonePainting, zonePaintPoints, onSoundZonePaintCommit, onSoundZonePaintCancel]);
  useEffect(() => {
    setDarkPaintPoints([]);
    setDarkPaintHover(null);
    setDarkSnapToOrigin(false);
  }, [darkZonePainting]);
  // Keyboard: Enter commits the current dark zone and chains a new one; Esc commits
  // any pending zone then exits paint mode.
  useEffect(() => {
    if (!darkZonePainting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        commitCurrentDark();
        onDarkZonePaintCancel?.();
      } else if (e.key === 'Enter') {
        commitCurrentDark();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkZonePainting, darkPaintPoints, onDarkZonePaintCommit, onDarkZonePaintCancel]);
  useEffect(() => {
    setTerrainPaintPoints([]);
    setTerrainPaintHover(null);
    setTerrainSnapToOrigin(false);
  }, [difficultTerrainPainting]);
  // Keyboard: Enter commits the current area and chains a new one; Esc commits any
  // pending area then exits paint mode.
  useEffect(() => {
    if (!difficultTerrainPainting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        commitCurrentTerrain();
        onDifficultTerrainPaintCancel?.();
      } else if (e.key === 'Enter') {
        commitCurrentTerrain();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficultTerrainPainting, terrainPaintPoints, onDifficultTerrainPaintCommit, onDifficultTerrainPaintCancel]);
  // Reset wall paint points whenever paint mode toggles.
  useEffect(() => {
    setWallPaintPoints([]);
    setWallPaintHover(null);
    setWallSnapToOrigin(false);
  }, [wallPainting]);
  // Keyboard for wall painting: Enter commits the current wall and chains a new one;
  // Esc exits paint mode (commits any pending wall first).
  useEffect(() => {
    if (!wallPainting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Commit any pending segment of 2+ points before exiting.
        if (wallPaintPoints.length >= 4 && onWallsChange) {
          const pts: WallPoint[] = [];
          for (let i = 0; i < wallPaintPoints.length; i += 2) {
            pts.push({ x: wallPaintPoints[i], y: wallPaintPoints[i + 1] });
          }
          const newSeg: WallSegment = {
            id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            points: pts,
          };
          onWallsChange([...(walls || []), newSeg]);
        }
        setWallPaintPoints([]);
        onStopWallPainting?.();
      } else if (e.key === 'Enter') {
        // Commit current wall (needs at least 2 points) and start a new one.
        commitCurrentWall();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wallPainting, wallPaintPoints, walls, onWallsChange, onStopWallPainting]);
  // Keyboard for wall erasing: Esc exits eraser mode.
  useEffect(() => {
    if (!wallErasing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onToggleWallErasing?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wallErasing, onToggleWallErasing]);
  // Keyboard for zone erasing (dark / terrain / sound): Esc exits eraser mode.
  useEffect(() => {
    if (!darkZoneErasing && !terrainErasing && !soundZoneErasing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDarkZoneErasing(false);
        setTerrainErasing(false);
        setSoundZoneErasing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [darkZoneErasing, terrainErasing, soundZoneErasing]);
  // Sound-zone painting starts from the App-level Sound Zones panel; open the
  // toolbar automatically so the drawing state and hints are visible, and close
  // the other zone toolbars so they don't stack on top of it.
  useEffect(() => {
    if (!zonePainting) return;
    setSoundZoneEditMode(true);
    setSoundZoneErasing(false);
    setWallEditMode(false);
    setDarkZoneEditMode(false);
    setDarkZoneErasing(false);
    setTerrainEditMode(false);
    setTerrainErasing(false);
  }, [zonePainting]);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const mapLayerRef = useRef<Konva.Layer | null>(null);
  // Leaving a zone eraser mode (Done, Esc, or the toolbar toggle) can happen
  // while a zone is hovered; the shape stops listening, so its onMouseLeave never
  // fires to reset the pointer cursor. Reset it here instead.
  useEffect(() => {
    if (darkZoneErasing || terrainErasing || soundZoneErasing) return;
    const container = mapLayerRef.current?.getStage()?.container();
    if (container) container.style.cursor = 'default';
  }, [darkZoneErasing, terrainErasing, soundZoneErasing]);
  // Transient banner shown after uploading a video map onto a floor that
  // already has UVTT wall/light/grid data: confirms the data was kept, or
  // warns when the video resolution doesn't match the UVTT map.
  const [videoImportNotice, setVideoImportNotice] = useState<{ kind: 'kept' | 'mismatch'; text: string } | null>(null);

  useEffect(() => {
    if (!videoImportNotice) return;
    // Give mismatch warnings longer on screen — they're actionable.
    const t = setTimeout(() => setVideoImportNotice(null), videoImportNotice.kind === 'mismatch' ? 15000 : 8000);
    return () => clearTimeout(t);
  }, [videoImportNotice]);
  // Tracks which mapImage URL is actually painted on the canvas. While this lags
  // behind the mapImage prop (e.g. during a floor transition while the new image
  // is still loading), we hide the stage behind a black overlay so the user
  // never sees the old map background with the new floor's tokens layered on it.
  const [displayedMapImage, setDisplayedMapImage] = useState<string | undefined>(mapImage);
  // Ref mirror of viewportCenter so the asynchronous image .onload callback can
  // read the latest target center (which may have been updated by the parent
  // between when the load began and when it completed).
  const viewportCenterRef = useRef(viewportCenter);
  useEffect(() => { viewportCenterRef.current = viewportCenter; }, [viewportCenter]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ tokenId: string; time: number } | null>(null);
  const aoeJustPlacedRef = useRef(false); // prevents token reselection after AoE placement click
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const dimensionsRef = useRef({ width: 800, height: 600 });

  const [contextMenu, setContextMenu] = useState<{
    x: number,
    y: number,
    stageX: number,
    stageY: number,
    clientY: number,
    view: 'root' | 'note' | 'viewpoint' | 'add-player' | 'add-enemy' | 'add-npc' | 'add-extra' | 'spell-marker',
    viewpointId?: string,
    markerId?: string,
  } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'player' | 'npc' | 'extras' | null>(null);
  // Grace period so the cursor can travel diagonally toward an open flyout without it
  // snapping shut the moment it passes over a sibling menu item (e.g. "Add an Enemy").
  const submenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSubmenuClose = () => {
    if (submenuCloseTimer.current) {
      clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  };
  const openSubmenu = (name: 'player' | 'npc' | 'extras') => {
    cancelSubmenuClose();
    setActiveSubmenu(name);
  };
  const scheduleSubmenuClose = () => {
    cancelSubmenuClose();
    submenuCloseTimer.current = setTimeout(() => setActiveSubmenu(null), 220);
  };
  // ── Extras gallery ──
  const { extras: extrasList, addExtras, updateExtra, deleteExtra } = useExtras();
  const [extraSearch, setExtraSearch] = useState('');
  const [extraSizeChoice, setExtraSizeChoice] = useState<Token['size']>('Medium');
  const [extraTagFilter, setExtraTagFilter] = useState<string[]>([]);
  const [manageExtrasOpen, setManageExtrasOpen] = useState(false);
  const [promoteExtraTokenId, setPromoteExtraTokenId] = useState<string | null>(null);
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, clientY: number, tokenId: string } | null>(null);
  const [conditionSubmenuOpen, setConditionSubmenuOpen] = useState(false);
  const [portalContextMenu, setPortalContextMenu] = useState<{ screenX: number, screenY: number, clientY: number, portalId: string, portalType: 'door' | 'window' | 'secret', locked: boolean } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string, imageData?: string, soundId?: string }>({ type: 'quote', content: '' });
  const [noteSoundPickerOpen, setNoteSoundPickerOpen] = useState(false);
  const { sounds: librarySoundsForNotes } = useSounds();
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [viewpointDraft, setViewpointDraft] = useState<{ zoomPercent: number }>({ zoomPercent: 25 });
  const [activeViewpointId, setActiveViewpointId] = useState<string | null>(null);
  const viewpointReturnRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  const [viewpointContextMenu, setViewpointContextMenu] = useState<{ screenX: number; screenY: number; clientY: number; viewpointId: string } | null>(null);
  const [zoneContextMenu, setZoneContextMenu] = useState<{ screenX: number; screenY: number; clientY: number; zoneId: string } | null>(null);

  // Dismiss any open right-click context menus when the user clicks anywhere outside of them
  // (e.g. on the sidebar or main menu bar, which lives outside this component).
  useEffect(() => {
    const anyOpen = !!(contextMenu || tokenContextMenu || portalContextMenu || viewpointContextMenu || zoneContextMenu);
    if (!anyOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-context-menu]')) return;
      setContextMenu(null);
      setTokenContextMenu(null);
      setPortalContextMenu(null);
      setViewpointContextMenu(null);
      setZoneContextMenu(null);
      setActiveSubmenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, tokenContextMenu, portalContextMenu, viewpointContextMenu, zoneContextMenu]);

  const [monsterSearch, setMonsterSearch] = useState('');
  const [showSource2014, setShowSource2014] = useState(false);
  const [showSource2024, setShowSource2024] = useState(true);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterQuantity, setMonsterQuantity] = useState(1);
  const [monsterSizeChoice, setMonsterSizeChoice] = useState<string>('Medium');
  const [internalSelectedTokenId, setInternalSelectedTokenId] = useState<string | null>(null);
  const selectedTokenId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedTokenId;
  const setSelectedTokenId = externalSelectedId !== undefined && onSelectedTokenIdChange ? onSelectedTokenIdChange : setInternalSelectedTokenId;

  const [internalSelectedTokenIds, setInternalSelectedTokenIds] = useState<string[]>([]);
  const selectedTokenIds = externalSelectedTokenIds !== undefined ? externalSelectedTokenIds : internalSelectedTokenIds;
  const setSelectedTokenIds = externalSelectedTokenIds !== undefined && onSelectedTokenIdsChange ? onSelectedTokenIdsChange : setInternalSelectedTokenIds;

  const [showWalls, setShowWalls] = useState(true);
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
  const [isFloorMenuOpen, setIsFloorMenuOpen] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const didMarqueeRef = useRef(false);

  const [showFog, setShowFog] = useState(false);
  // Sync external selection from Initiative Tracker
  useEffect(() => {
    // We already sync selectedTokenIds in App.tsx now
    if (externalSelectedId !== undefined) {
      setSelectedTokenId(externalSelectedId);
    }
  }, [externalSelectedId]);

  // ── AoE Casting State ──
  const [castingSpell, setCastingSpell] = useState<{
    name: string;
    aoeType: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
    aoeSize: number; // feet
    originX: number; // caster token center world coords
    originY: number;
    casterRadiusPx: number; // token radius in world pixels — for edge-origin offset
    selfOrigin?: boolean; // true for range=0 "Self" spells (rotate around caster)
    saveAbility?: string;
    saveDc?: number;
    halfDamageOnSave?: boolean;
    spellDesc?: string;
    damageType?: string;
    mapInteraction?: string;
    saveEffect?: string;
    condition?: string;
    casterId?: string;
  } | null>(null);
  const [castingMousePos, setCastingMousePos] = useState<{ x: number; y: number } | null>(null);
  const [placedAoe, setPlacedAoe] = useState<AoeState | null>(null);

  // ── Measure / Ruler State ──
  const [isMeasuringActive, setIsMeasuringActive] = useState(false);
  const [measureEdge, setMeasureEdge] = useState<'top' | 'bottom' | 'left'>('bottom');
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);

  // ── Drawing State ──
  // 'off' = drawing tool inactive. While any other mode is active, token drag/select is suppressed.
  const [drawingMode, setDrawingMode] = useState<'off' | 'persistent' | 'ephemeral' | 'eraser'>('off');
  const [drawingColor, setDrawingColor] = useState<string>('#ffffff');
  const [drawingOwnerId, setDrawingOwnerId] = useState<string | undefined>(undefined);
  // The stroke currently being drawn (touch/mouse down → up). Renders alongside committed strokes.
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  // IDs of strokes added since the pencil tool was opened — "clear all" only nukes these.
  // A new Set is created each time the player enters drawing mode (via startDrawingRef).
  const sessionStrokeIdsRef = useRef<Set<string>>(new Set());
  // Local-only ephemeral strokes (this device's own + strokes received from the other window).
  // Each entry has a fade animation driven by setTimeout.
  const [ephemeralStrokes, setEphemeralStrokes] = useState<Stroke[]>([]);
  const ephemeralTimersRef = useRef<Record<string, number>>({});

  // ── Ping state ──
  // One-shot ping mode: when active, the next map click drops a pulsing marker, then exits.
  const [pingMode, setPingMode] = useState<{ color: string } | null>(null);
  type ActivePing = { id: string; x: number; y: number; color: string; startTime: number };
  const [pings, setPings] = useState<ActivePing[]>([]);
  const PING_DURATION_MS = 2200;
  // Drives a per-frame re-render while any ping is on screen so the rings animate.
  const [pingTick, setPingTick] = useState(0);
  useEffect(() => {
    if (pings.length === 0) return;
    let raf = 0;
    const loop = () => {
      const now = Date.now();
      setPings(prev => prev.filter(p => now - p.startTime < PING_DURATION_MS));
      setPingTick(t => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pings.length]);

  // Drawing constants — feel-tuned defaults
  const STROKE_WIDTH_PX = 4;        // map-pixel thickness (will be visually scaled with zoom)
  const ERASER_RADIUS_PX = 18;      // hit radius used by rub-to-erase
  const EPHEMERAL_FADE_MS = 3000;   // total fade time after stroke is finished

  /** Schedule an ephemeral stroke to be removed after EPHEMERAL_FADE_MS. */
  const scheduleEphemeralFade = (strokeId: string) => {
    const existing = ephemeralTimersRef.current[strokeId];
    if (existing) window.clearTimeout(existing);
    ephemeralTimersRef.current[strokeId] = window.setTimeout(() => {
      setEphemeralStrokes(prev => prev.filter(s => s.id !== strokeId));
      delete ephemeralTimersRef.current[strokeId];
    }, EPHEMERAL_FADE_MS);
  };

  /** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
  const distSqPointToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ex = px - ax, ey = py - ay;
      return ex * ex + ey * ey;
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const ex = px - cx, ey = py - cy;
    return ex * ex + ey * ey;
  };

  /**
   * Erase any stroke vertices within `radius` of (x,y). Strokes are split into
   * multiple shorter strokes wherever an erased gap appears. Operates on the
   * provided list and returns a new list. Used for both persistent and ephemeral.
   */
  const eraseAt = (strokes: Stroke[], x: number, y: number, radius: number): { next: Stroke[]; changed: boolean } => {
    const r2 = radius * radius;
    let changed = false;
    const next: Stroke[] = [];
    for (const stroke of strokes) {
      const pts = stroke.points;
      // Find runs of consecutive points that survive erasure
      const surviving: number[][] = [];
      let current: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i], py = pts[i + 1];
        const ax = px - x, ay = py - y;
        const inside = (ax * ax + ay * ay) <= r2;
        if (inside) {
          if (current.length >= 4) surviving.push(current);
          current = [];
          changed = true;
        } else {
          current.push(px, py);
        }
      }
      if (current.length >= 4) surviving.push(current);
      if (!changed && surviving.length === 1 && surviving[0].length === pts.length) {
        // Untouched
        next.push(stroke);
        continue;
      }
      if (surviving.length === 0) {
        // Whole stroke erased
        changed = true;
        continue;
      }
      surviving.forEach((segPts, idx) => {
        next.push({
          ...stroke,
          id: idx === 0 ? stroke.id : `${stroke.id}-e${Date.now().toString(36)}-${idx}`,
          points: segPts,
        });
      });
    }
    return { next, changed };
  };

  // ── Remote drawings (received from the other window for OTHER floors than the active one) ──
  // We don't push remote drawings for *this* floor — App.tsx already syncs scenarios via state.
  // But ephemeral strokes are window-only and broadcast separately.
  useEffect(() => {
    const onEphemeral = (data: any) => {
      // Only render if it's for the floor we're currently displaying
      if (data?.floorId && activeFloorId && data.floorId !== activeFloorId) return;
      const stroke: Stroke = {
        id: data.id,
        ownerId: data.ownerId,
        color: data.color,
        points: data.points,
        width: data.width,
      };
      setEphemeralStrokes(prev => [...prev, stroke]);
      scheduleEphemeralFade(stroke.id);
    };
    try { window.electronAPI?.onEphemeralStroke?.(onEphemeral); } catch (_e) { /* */ }
    return () => {
      try { window.electronAPI?.removeEphemeralStrokeListener?.(); } catch (_e) { /* */ }
    };
  }, [activeFloorId]);

  // Clean up fade timers on unmount
  useEffect(() => {
    return () => {
      Object.values(ephemeralTimersRef.current).forEach(id => window.clearTimeout(id));
      ephemeralTimersRef.current = {};
    };
  }, []);


  // ── Spell Marker Placement State ──
  const [placingSpell, setPlacingSpell] = useState<{
    name: string;
    school: string;
    effectRadius?: number;
    aoeType?: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
    aoeSize?: number;
    casterId?: string;
    shapeType?: 'point' | 'wall';
    maxLength?: number;
    maxThickness?: number;
    blocksVision?: boolean;
    // Summon creature data — when present, tap-to-place creates a Token instead of a SpellMarker
    summonData?: { creatureName: string; spellName: string; casterId: string; playerColor: string; size?: import('../types').Token['size']; avatar?: string; illusory?: boolean; monster?: import('../types').Monster };
  } | null>(null);
  const [pendingMarkerPos, setPendingMarkerPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [targetingEnlargeReduce, setTargetingEnlargeReduce] = useState<{ mode: 'enlarge' | 'reduce'; casterId: string; targetTokenId: string | null } | null>(null);
  // Editing/preview state for wall-shape spells (Wall of Sand, etc.) — before confirmation
  const [editingWall, setEditingWall] = useState<{
    x: number;
    y: number;
    length: number;      // feet
    thickness: number;   // feet
    angle: number;       // degrees
    maxLength: number;
    maxThickness: number;
    spellName: string;
    school: string;
    casterId?: string;
    blocksVision: boolean;
    saveAbility?: string;
    saveDc?: number;
    halfDamageOnSave?: boolean;
  } | null>(null);
  // Editing/preview state for Wall of Fire (Ring) — before confirmation
  const [editingRing, setEditingRing] = useState<{
    x: number;
    y: number;
    radius: number;    // feet, 5–20
    hotSide: 'inside' | 'outside';
    spellName: string;
    school: string;
    casterId?: string;
    saveAbility?: string;
    saveDc?: number;
    halfDamageOnSave?: boolean;
  } | null>(null);

  // Remote AoE: placed by the other screen (DM sees player's AoE, player sees DM's AoE)
  const [remoteAoe, setRemoteAoe] = useState<typeof placedAoe>(null);

  // Broadcast local AoE changes to the other screen
  useEffect(() => {
    try {
      if (isPlayerView) {
        window.electronAPI?.sendPlayerAoeUpdate?.(placedAoe);
      } else {
        window.electronAPI?.sendDMAoeUpdate?.(placedAoe);
      }
    } catch (e) {
      // IPC not available (dev mode or stale preload)
    }
  }, [placedAoe, isPlayerView]);

  // Broadcast measure distance to PlayerScreen banner
  useEffect(() => {
    if (!onMeasureDistanceChange) return;
    if (!isMeasuringActive || !measureStart || !measureEnd) {
      // Don't clear if we're just waiting for first touch
      return;
    }
    const ppg = gridResolution?.pixelsPerGrid || 40;
    const dx = measureEnd.x - measureStart.x;
    const dy = measureEnd.y - measureStart.y;
    const distFeet = Math.round((Math.sqrt(dx * dx + dy * dy) / ppg) * 5);
    onMeasureDistanceChange(distFeet);
  }, [measureStart, measureEnd, isMeasuringActive, gridResolution, onMeasureDistanceChange]);

  // Listen for AoE from the other screen
  useEffect(() => {
    try {
      if (isPlayerView) {
        window.electronAPI?.onDMAoeUpdate?.((aoe: any) => setRemoteAoe(aoe));
      } else {
        window.electronAPI?.onPlayerAoeUpdate?.((aoe: any) => setRemoteAoe(aoe));
      }
    } catch (e) {
      // IPC not available
    }
  }, [isPlayerView]);

  // Use a ref for dragging positions so we can read them without triggering React re-renders.
  // Konva moves the node natively during drag; we just need the position for IPC broadcasts.
  const draggingPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const lastBroadcastRef = useRef(0);
  const BROADCAST_INTERVAL = 50; // ~20fps throttle — smooth on TV, much lighter on IPC
  const lastPathSyncRef = useRef(0);
  const PATH_SYNC_INTERVAL = 150; // ~7fps — movement path visuals are cosmetic during drag
  // Live drag position overrides for player view — drives real-time fog recomputation
  const [livePlayerPos, setLivePlayerPos] = useState<Record<string, { x: number; y: number }>>({});
  // Live drag positions for spell markers (Light cantrip) — drives real-time fog recomputation
  const [liveMarkerPos, setLiveMarkerPos] = useState<Record<string, { x: number; y: number }>>({});
  // Double-tap dismiss bubble for spell markers (player view)
  const [dismissMarkerBubble, setDismissMarkerBubble] = useState<{ markerId: string; screenX: number; screenY: number } | null>(null);
  const lastMarkerTapRef = useRef<{ markerId: string; time: number } | null>(null);
  // Tracks whether a marker drag is in progress to suppress onTap after drag
  const markerDraggingRef = useRef(false);
  // Increments when icon images finish loading, triggering a re-render so KonvaImage nodes appear
  const [iconVersion, setIconVersion] = useState(0);

  // Wall collision — prevents tokens from passing through walls during drag
  const [wallCollisionEnabled, setWallCollisionEnabled] = useState(false);
  const lastValidPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const dragTokenRadiusRef = useRef<Record<string, number>>({});

  // Transition zone drawing mode
  const [transitionZoneMode, setTransitionZoneMode] = useState(false);
  // New transition zones are drawn as click-to-draw polygons (flat [x,y,...]).
  const [tzPaintPoints, setTzPaintPoints] = useState<number[]>([]);
  const [tzPaintHover, setTzPaintHover] = useState<{ x: number; y: number } | null>(null);
  const [tzSnapToOrigin, setTzSnapToOrigin] = useState(false);
  const [transitionZoneConfig, setTransitionZoneConfig] = useState<{ points: number[] } | null>(null);
  const [tzFloorPickerOpen, setTzFloorPickerOpen] = useState(false);
  const [tzSelectedFloorId, setTzSelectedFloorId] = useState<string>('');
  const [transitionPopup, setTransitionPopup] = useState<{
    tokenId: string;
    zone: TransitionZone;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [pendingPairData, setPendingPairData] = useState<{
    sourceFloorId: string;
    sourcePoints: number[];
    targetFloorId: string;
    label?: string;
    pairIndex: number;
  } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  // Clear any in-progress transition polygon whenever drawing mode toggles.
  useEffect(() => {
    setTzPaintPoints([]);
    setTzPaintHover(null);
    setTzSnapToOrigin(false);
  }, [transitionZoneMode]);
  // Keyboard: Enter finishes the current transition polygon; Esc cancels the flow.
  useEffect(() => {
    if (!transitionZoneMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitCurrentTransition();
      } else if (e.key === 'Escape') {
        if (pendingPairData) onSwitchFloor?.(pendingPairData.sourceFloorId);
        setPendingPairData(null);
        setTransitionZoneMode(false);
        clearTzPaint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionZoneMode, tzPaintPoints, pendingPairData]);
  // Ctrl+Z / Cmd+Z: undo the last point placed in whichever click-to-draw mode is
  // active (walls, sound/dark zones, difficult terrain, transition zones). Registered
  // before the movement-undo handler so it wins while drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) || e.shiftKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      const pop = (arr: number[]) => arr.slice(0, -2);
      let handled = false;
      if (wallPainting && wallPaintPoints.length > 0) { setWallPaintPoints(pop); handled = true; }
      else if (darkZonePainting && darkPaintPoints.length > 0) { setDarkPaintPoints(pop); handled = true; }
      else if (zonePainting && zonePaintPoints.length > 0) { setZonePaintPoints(pop); handled = true; }
      else if (difficultTerrainPainting && terrainPaintPoints.length > 0) { setTerrainPaintPoints(pop); handled = true; }
      else if (transitionZoneMode && tzPaintPoints.length > 0) { setTzPaintPoints(pop); handled = true; }
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    wallPainting, wallPaintPoints,
    darkZonePainting, darkPaintPoints,
    zonePainting, zonePaintPoints,
    difficultTerrainPainting, terrainPaintPoints,
    transitionZoneMode, tzPaintPoints,
  ]);
  const zoneTransformerRef = useRef<any>(null);
  const zoneRectRefs = useRef<Record<string, any>>({});
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Movement path tracking — only active during initiative/combat
  const inCombat = activeCombatants.length > 0;
  const [movementPaths, setMovementPaths] = useState<Record<string, MovementPath>>({});
  const activePathRef = useRef<Record<string, {
    points: number[];
    totalDistancePx: number;
    lastSampleX: number;
    lastSampleY: number;
  }>>({});

  // Movement path fade-out: after 5s idle the line wipes away origin→endpoint
  const pathFadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [pathFadeProgress, setPathFadeProgress] = useState<Record<string, number>>({}); // 0 = visible, 1 = gone
  const pathFadeStartRef = useRef<Record<string, number>>({}); // timestamp when fade started
  const pathFadeRafRef = useRef<number | null>(null);
  const PATH_FADE_DELAY = 2000; // ms before fade begins
  const PATH_FADE_DURATION = 1500; // ms for the wipe animation

  // Animation loop for path fading — runs whenever any fade is in progress
  useEffect(() => {
    const hasActiveFades = Object.values(pathFadeProgress).some(p => p >= 0 && p < 1);
    if (!hasActiveFades && Object.keys(pathFadeStartRef.current).length === 0) {
      return;
    }
    let raf: number;
    const tick = () => {
      const now = performance.now();
      const next: Record<string, number> = {};
      let anyActive = false;
      for (const tid of Object.keys(pathFadeStartRef.current)) {
        const elapsed = now - pathFadeStartRef.current[tid];
        const progress = Math.min(1, elapsed / PATH_FADE_DURATION);
        next[tid] = progress;
        if (progress < 1) anyActive = true;
        else delete pathFadeStartRef.current[tid];
      }
      if (Object.keys(next).length > 0) {
        setPathFadeProgress(prev => ({ ...prev, ...next }));
      }
      if (anyActive) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pathFadeProgress]);

  // Turn indicator animation — shows chevrons for 3 seconds when active combatant changes
  const [turnFlashCombatantId, setTurnFlashCombatantId] = useState<string | null>(null);

  useEffect(() => {
    if (propActiveCombatantId && inCombat) {
      // Clear all movement paths and their fade state when the turn advances
      Object.values(pathFadeTimers.current).forEach(clearTimeout);
      pathFadeTimers.current = {};
      pathFadeStartRef.current = {};
      setPathFadeProgress({});
      setMovementPaths({});
      activePathRef.current = {};

      setTurnFlashCombatantId(propActiveCombatantId);
      const timer = setTimeout(() => setTurnFlashCombatantId(null), 3100); // slightly over 3s to let animation finish
      return () => clearTimeout(timer);
    } else {
      setTurnFlashCombatantId(null);
    }
  }, [propActiveCombatantId, inCombat]);

  const tokenRadius = gridResolution ? gridResolution.pixelsPerGrid * 0.4 : 20;
  const tokenScale = tokenRadius / 20;

  // Expose casting function to external code (player drawers) via ref
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  if (startCastingRef) {
    startCastingRef.current = (spell, combatantId) => {
      // Always consult the DB — campaign data may have a stale aoeType (e.g. 'sphere' instead
      // of 'emanation' if the spell was added before the DB was updated).
      const dbEntry = lookupSpell(spell.name);
      const resolvedAoeType = dbEntry?.aoeType ?? spell.aoeType;
      const resolvedAoeSize = spell.aoeSize ?? dbEntry?.aoeSize;
      const resolvedSaveAbility = spell.saveAbility ?? dbEntry?.saveAbility;
      const resolvedSaveDc = spell.saveDc;
      if (!resolvedAoeType || !resolvedAoeSize) return;
      const token = tokensRef.current.find(t => t.combatantId === combatantId);
      if (!token) return;
      const casterRadiusPx = tokenRadius * getTokenSizeMultiplier(token.size);
      const isSelfOrigin = spell.range === 0 || (spell.range === undefined && dbEntry?.range === 0);

      // Emanation: skip mouse-follow — immediately place AoE locked to caster position
      if (resolvedAoeType === 'emanation') {
        setPlacedAoe({
          name: spell.name,
          aoeType: 'emanation',
          aoeSize: resolvedAoeSize,
          x: token.x,
          y: token.y,
          originX: token.x,
          originY: token.y,
          angle: 0,
          casterRadiusPx,
          saveAbility: resolvedSaveAbility,
          saveDc: resolvedSaveDc,
          halfDamageOnSave: spell.halfDamageOnSave ?? dbEntry?.halfDamageOnSave,
          spellDesc: spell.desc || dbEntry?.desc,
          damageType: parseDamageType(spell.desc || dbEntry?.desc || ''),
          mapInteraction: spell.mapInteraction,
          saveEffect: spell.saveEffect ?? dbEntry?.saveEffect,
          condition: spell.condition ?? dbEntry?.condition,
          casterId: combatantId,
        });
        setCastingSpell(null);
        setCastingMousePos(null);
        setSelectedTokenIds([]);
        setSelectedTokenId(null);
        return;
      }

      // Enter mouse-follow casting mode
      setPlacedAoe(null);
      setCastingSpell({
        name: spell.name,
        aoeType: resolvedAoeType as 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder',
        aoeSize: resolvedAoeSize,
        originX: token.x,
        originY: token.y,
        casterRadiusPx,
        selfOrigin: isSelfOrigin,
        saveAbility: resolvedSaveAbility,
        saveDc: resolvedSaveDc,
        halfDamageOnSave: spell.halfDamageOnSave ?? dbEntry?.halfDamageOnSave,
        spellDesc: spell.desc || dbEntry?.desc,
        damageType: parseDamageType(spell.desc || dbEntry?.desc || ''),
        mapInteraction: spell.mapInteraction,
        saveEffect: spell.saveEffect ?? dbEntry?.saveEffect,
        condition: spell.condition ?? dbEntry?.condition,
        casterId: combatantId,
      });
      setCastingMousePos(null);
      // Deselect token so the monster panel dismisses
      setSelectedTokenIds([]);
      setSelectedTokenId(null);
    };
  }

  // Expose spell-marker placement function to external code via ref
  if (startPlacingRef) {
    startPlacingRef.current = (spell, combatantId) => {
      const entry = lookupSpell(spell.name);
      const shapeType = spell.shapeType ?? entry?.shapeType;
      const school = spell.school || entry?.school || 'Evocation';

      // Wall-shape spell (Wall of Sand, etc.): open editing preview immediately
      if (shapeType === 'wall') {
        const maxLength = spell.maxLength ?? entry?.maxLength ?? 30;
        const maxThickness = spell.maxThickness ?? entry?.maxThickness ?? 10;
        const blocksVision = spell.blocksVision ?? entry?.blocksVision ?? true;

        // Anchor above the caster token (so the wall sits in front of them, not on top)
        // else viewport center
        let anchorX: number;
        let anchorY: number;
        const casterToken = tokens.find(t => t.combatantId === combatantId);
        if (casterToken) {
          const ppgLocal = gridResolution?.pixelsPerGrid || 40;
          const halfThicknessPx = (maxThickness / 5) * ppgLocal / 2;
          // Place center of wall one token-diameter + half-thickness above the token
          anchorX = casterToken.x;
          anchorY = casterToken.y - tokenRadius * 2 - halfThicknessPx;
        } else {
          const rect = containerRef.current?.getBoundingClientRect();
          const cx = (rect ? rect.width / 2 : 400);
          const cy = (rect ? rect.height / 2 : 300);
          anchorX = (cx - stagePos.x) / stageScale;
          anchorY = (cy - stagePos.y) / stageScale;
        }

        setEditingWall({
          x: anchorX,
          y: anchorY,
          length: maxLength,
          thickness: maxThickness,
          angle: 0,
          maxLength,
          maxThickness,
          spellName: spell.name,
          school,
          casterId: combatantId,
          blocksVision,
          saveAbility: spell.saveAbility,
          saveDc: spell.saveDc,
          halfDamageOnSave: spell.halfDamageOnSave,
        });
        setPlacingSpell({
          name: spell.name,
          school,
          casterId: combatantId,
          shapeType: 'wall',
          maxLength,
          maxThickness,
          blocksVision,
        });
        setPendingMarkerPos(null);
        setSelectedTokenIds([]);
        setSelectedTokenId(null);
        return;
      }

      // Ring-shape spell (Wall of Fire Ring): open ring editing preview immediately
      if (shapeType === 'ring') {
        const casterToken = tokens.find(t => t.combatantId === combatantId);
        let anchorX: number;
        let anchorY: number;
        if (casterToken) {
          const ppgLocal = gridResolution?.pixelsPerGrid || 40;
          anchorX = casterToken.x;
          anchorY = casterToken.y - tokenRadius * 2 - (10 / 5) * ppgLocal;
        } else {
          const rect = containerRef.current?.getBoundingClientRect();
          anchorX = ((rect ? rect.width / 2 : 400) - stagePos.x) / stageScale;
          anchorY = ((rect ? rect.height / 2 : 300) - stagePos.y) / stageScale;
        }
        setEditingRing({
          x: anchorX,
          y: anchorY,
          radius: 5,
          hotSide: 'outside',
          spellName: spell.name,
          school,
          casterId: combatantId,
          saveAbility: spell.saveAbility,
          saveDc: spell.saveDc,
          halfDamageOnSave: spell.halfDamageOnSave,
        });
        setPendingMarkerPos(null);
        setSelectedTokenIds([]);
        setSelectedTokenId(null);
        return;
      }

      // Default: point-marker placement flow (Light, Darkness, etc.) OR summon creature placement
      setPlacingSpell({
        name: spell.name,
        school,
        effectRadius: spell.effectRadius ?? entry?.effectRadius,
        casterId: combatantId,
        aoeType: (spell.aoeType ?? entry?.aoeType) as any,
        aoeSize: spell.aoeSize ?? entry?.aoeSize,
        summonData: (spell as any).summonData,
      });
      setPendingMarkerPos(null);
      setSelectedTokenIds([]);
      setSelectedTokenId(null);
    };
  }

  // Expose direct marker placement (no interactive flow) for multi-token spells like Dancing Lights
  if (addMarkersDirectlyRef) {
    addMarkersDirectlyRef.current = (newMarkers) => {
      const updated = [...spellMarkers, ...newMarkers];
      onSpellMarkersChange?.(updated);
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }
    };
  }

  if (cancelCastingRef) {
    cancelCastingRef.current = () => {
      setPlacedAoe(null);
      setCastingSpell(null);
      setCastingMousePos(null);
      setEditingWall(null);
      setEditingRing(null);
      setPlacingSpell(null);
      setTargetingEnlargeReduce(null);
      onCastingDismissed?.();
      onAoeHighlightsChange?.(null);
    };
  }

  if (startEnlargeReduceRef) {
    startEnlargeReduceRef.current = (mode, casterId) => {
      setTargetingEnlargeReduce({ mode, casterId, targetTokenId: null });
      setSelectedTokenIds([]);
      setSelectedTokenId(null);
    };
  }

  if (startMeasuringRef) {
    startMeasuringRef.current = (edge: 'top' | 'bottom' | 'left') => {
      setIsMeasuringActive(true);
      setMeasureEdge(edge);
      setMeasureStart(null);
      setMeasureEnd(null);
    };
  }

  if (cancelMeasuringRef) {
    cancelMeasuringRef.current = () => {
      setIsMeasuringActive(false);
      setMeasureStart(null);
      setMeasureEnd(null);
      onMeasureDistanceChange?.(null);
    };
  }

  if (startDrawingRef) {
    startDrawingRef.current = ({ mode, color, ownerId }) => {
      // Fresh session — "clear all" should only affect strokes drawn from this point on.
      sessionStrokeIdsRef.current = new Set();
      setDrawingMode(mode);
      setDrawingColor(color);
      setDrawingOwnerId(ownerId);
      setCurrentStroke(null);
    };
  }
  if (cancelDrawingRef) {
    cancelDrawingRef.current = () => {
      setDrawingMode('off');
      setCurrentStroke(null);
    };
  }
  if (setDrawingOptionsRef) {
    setDrawingOptionsRef.current = ({ mode, color }) => {
      if (mode) setDrawingMode(mode);
      if (color) setDrawingColor(color);
    };
  }
  if (clearDrawingSessionRef) {
    clearDrawingSessionRef.current = () => {
      const ids = sessionStrokeIdsRef.current;
      if (ids.size === 0) return;
      // Drop persistent session strokes
      const nextDrawings = drawings.filter(s => !ids.has(s.id));
      if (nextDrawings.length !== drawings.length) {
        onDrawingsChange?.(nextDrawings);
      }
      // Drop ephemeral session strokes
      setEphemeralStrokes(prev => prev.filter(s => !ids.has(s.id)));
      // Cancel their fade timers
      ids.forEach(id => {
        const t = ephemeralTimersRef.current[id];
        if (t) { window.clearTimeout(t); delete ephemeralTimersRef.current[id]; }
      });
      // Reset the session — anything drawn after this is the start of a new "this time"
      sessionStrokeIdsRef.current = new Set();
    };
  }

  if (clearRemoteAoeRef) {
    clearRemoteAoeRef.current = () => {
      setRemoteAoe(null);
      onAoeHighlightsChange?.(null);
    };
  }

  if (startPingRef) {
    startPingRef.current = ({ color }) => {
      setPingMode({ color });
    };
  }
  if (cancelPingRef) {
    cancelPingRef.current = () => {
      setPingMode(null);
    };
  }
  if (triggerPingRef) {
    triggerPingRef.current = ({ x, y, color }) => {
      const id = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setPings(prev => [...prev, { id, x, y, color, startTime: Date.now() }]);
    };
  }

  // ── Token lookup map for O(1) access ──
  const tokenById = useMemo(() => new Map(tokens.map(t => [t.id, t])), [tokens]);

  // ── Token-in-AoE detection ──
  const ppg = gridResolution?.pixelsPerGrid || 40;
  // Build a preview AoeState from mouse-follow casting so we can highlight tokens during drag
  const castingPreviewAoe = useMemo<AoeState | null>(() => {
    if (!castingSpell || !castingMousePos) return null;
    const angleRad = Math.atan2(castingMousePos.y - castingSpell.originY, castingMousePos.x - castingSpell.originX);
    const angle = angleRad * (180 / Math.PI);
    const isSelf = !!castingSpell.selfOrigin;
    const edgeX = castingSpell.originX + Math.cos(angleRad) * castingSpell.casterRadiusPx;
    const edgeY = castingSpell.originY + Math.sin(angleRad) * castingSpell.casterRadiusPx;
    return {
      name: castingSpell.name,
      aoeType: castingSpell.aoeType,
      aoeSize: castingSpell.aoeSize,
      x: isSelf ? edgeX : castingMousePos.x,
      y: isSelf ? edgeY : castingMousePos.y,
      originX: castingSpell.originX,
      originY: castingSpell.originY,
      angle,
      casterRadiusPx: castingSpell.casterRadiusPx,
      selfOrigin: isSelf,
      damageType: castingSpell.damageType,
    };
  }, [castingSpell, castingMousePos]);
  const activeAoe = placedAoe || remoteAoe || castingPreviewAoe;
  const tokensInAoe = useMemo(() => {
    return getTokensInAoe(activeAoe, tokens, ppg, tokenRadius);
  }, [activeAoe?.x, activeAoe?.y, activeAoe?.angle, activeAoe?.aoeType, activeAoe?.aoeSize, activeAoe?.originX, activeAoe?.originY, tokens, ppg, tokenRadius]);

  // Engaged pairs: player ↔ enemy/npc tokens within 5ft (melee range) during combat.
  // Only tokens whose combatant is in the initiative order count, and hidden or
  // invisible creatures never reveal engagement.
  const engagedPairs = useMemo(() => {
    if (!inCombat || !gridResolution) return [] as { key: string; ptId: string; etId: string; px1: number; py1: number; px2: number; py2: number }[];
    const pairs: { key: string; ptId: string; etId: string; px1: number; py1: number; px2: number; py2: number }[] = [];
    const canEngage = (t: Token) => {
      if (t.hidden || t.invisible) return false;
      if (!t.combatantId) return false;
      const combatant = activeCombatants.find(c => c.id === t.combatantId || c.sourceCombatantId === t.combatantId);
      if (!combatant) return false;
      if (combatant.conditions?.some(cond => cond === 'Invisible' || cond === 'Hidden')) return false;
      return true;
    };
    const playerTokens = tokens.filter(t => t.type === 'player' && canEngage(t));
    const enemyTokens = tokens.filter(t => (t.type === 'enemy' || t.type === 'npc') && canEngage(t));
    for (const pt of playerTokens) {
      const r1 = tokenRadius * getTokenSizeMultiplier(pt.size);
      const px1 = livePlayerPos[pt.id]?.x ?? pt.x;
      const py1 = livePlayerPos[pt.id]?.y ?? pt.y;
      for (const et of enemyTokens) {
        const r2 = tokenRadius * getTokenSizeMultiplier(et.size);
        const px2 = livePlayerPos[et.id]?.x ?? et.x;
        const py2 = livePlayerPos[et.id]?.y ?? et.y;
        const dist = Math.sqrt((px2 - px1) ** 2 + (py2 - py1) ** 2);
        if (dist - r1 - r2 <= ppg) {
          pairs.push({ key: `engaged-${pt.id}|${et.id}`, ptId: pt.id, etId: et.id, px1, py1, px2, py2 });
        }
      }
    }
    return pairs;
  }, [inCombat, tokens, livePlayerPos, tokenRadius, ppg, gridResolution, activeCombatants]);

  const engagedTokenIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pair of engagedPairs) {
      ids.add(pair.ptId);
      ids.add(pair.etId);
    }
    return ids;
  }, [engagedPairs]);

  // Bloodied tokens: enemy/npc tokens at or below half HP
  const bloodiedTokenIds = useMemo(() => {
    const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const set = new Set<string>();
    for (const token of tokens) {
      if (token.type === 'player') continue;
      if (!token.combatantId) continue;
      const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
      if (combatant && combatant.maxHp > 0 && combatant.hp <= combatant.maxHp / 2 && combatant.hp > 0) {
        set.add(token.id);
      }
    }
    return set;
  }, [tokens, activeCombatants, players, npcs, persistentEnemies, scenarioCombatants]);

  // Tokens whose combatant has at least one active condition
  const conditionedTokenIds = useMemo(() => {
    const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const set = new Set<string>();
    for (const token of tokens) {
      if (!token.combatantId) continue;
      const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
      if (combatant?.conditions && combatant.conditions.length > 0) {
        set.add(token.id);
      }
    }
    return set;
  }, [tokens, activeCombatants, players, npcs, persistentEnemies, scenarioCombatants]);

  // Dead tokens: enemy/npc tokens at 0 HP
  const deadTokenIds = useMemo(() => {
    const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const set = new Set<string>();
    for (const token of tokens) {
      if (token.type === 'player') continue;
      if (!token.combatantId) continue;
      const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
      if (combatant && combatant.hp <= 0) {
        set.add(token.id);
      }
    }
    return set;
  }, [tokens, activeCombatants, players, npcs, persistentEnemies, scenarioCombatants]);

  // Notify parent of affected combatant IDs whenever tokensInAoe changes
  useEffect(() => {
    if (tokensInAoe.size === 0 && !activeAoe) {
      onAoeHighlightsChange?.(null);
      return;
    }
    const combatantIds: string[] = [];
    for (const tid of tokensInAoe) {
      const token = tokens.find(t => t.id === tid);
      if (token?.combatantId) combatantIds.push(token.combatantId);
    }
    onAoeHighlightsChange?.({
      affectedCombatantIds: combatantIds,
      saveResults: activeAoe?.saveResults || null,
      spellName: activeAoe?.name,
      saveAbility: activeAoe?.saveAbility,
      saveDc: activeAoe?.saveDc,
      halfDamageOnSave: activeAoe?.halfDamageOnSave,
      spellDesc: activeAoe?.spellDesc,
      saveEffect: activeAoe?.saveEffect,
      condition: activeAoe?.condition,
    });
  }, [tokensInAoe, activeAoe?.saveResults]);

  // Confirm Cast: roll saves for affected monsters.
  // Returns true if the casting banner should remain visible (save results were produced
  // and the banner will now show a "Roll for damage" prompt), false if it should dismiss.
  const handleConfirmCast = (): boolean => {
    const ppgLocal = gridResolution?.pixelsPerGrid || 40;
    const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];

    // Tier 3: spell sound binding — play one-shot if the DM has bound this spell.
    const castingSpellName: string | undefined =
      editingWall?.spellName ?? editingRing?.spellName ?? placedAoe?.name ?? placingSpell?.name;
    if (castingSpellName) {
      const bindings = loadSoundBindings();
      const spellSoundId = bindings.spells[castingSpellName];
      if (spellSoundId) {
        audioEngine.ensure();
        audioEngine.playOneShot(soundUrlFromId(spellSoundId), 'sfx', 1).catch(() => { /* ignore */ });
      }
    }

    /** Roll saves for a set of tokens and return results. */
    const rollSaves = (
      affectedTokens: typeof tokens,
      saveAbility: string,
      saveDc: number,
    ): Record<string, SaveResult> => {
      const results: Record<string, SaveResult> = {};
      for (const token of affectedTokens) {
        if (!token.combatantId) continue;
        const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
        if (!combatant || combatant.type === 'player') continue;
        const statValue = (combatant.stats as any)?.[saveAbility] || 10;
        const modifier = Math.floor((statValue - 10) / 2);
        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + modifier;
        results[combatant.sourceCombatantId || combatant.id] = {
          roll, modifier, total, success: total >= saveDc, name: combatant.name,
        };
      }
      return results;
    };

    // Wall-shape placement (Wall of Sand, Wall of Fire, etc.) — create a persistent rotated-rectangle marker
    if (editingWall) {
      const marker: SpellMarker = {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        spellName: editingWall.spellName,
        school: editingWall.school,
        casterId: editingWall.casterId,
        x: editingWall.x,
        y: editingWall.y,
        visibleToPlayers: true,
        floorId: activeFloorId || undefined,
        shapeType: 'wall',
        length: editingWall.length,
        thickness: editingWall.thickness,
        angle: editingWall.angle,
        blocksVision: editingWall.blocksVision,
      };
      const updated = [...spellMarkers, marker];
      onSpellMarkersChange?.(updated);
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }

      // Roll saves for tokens overlapping the wall rectangle
      if (editingWall.saveAbility && editingWall.saveDc) {
        const wallRad = (editingWall.angle * Math.PI) / 180;
        const cosA = Math.cos(wallRad);
        const sinA = Math.sin(wallRad);
        const halfL = (editingWall.length / 5) * ppgLocal / 2;
        const halfT = (editingWall.thickness / 5) * ppgLocal / 2;
        const tRadius = ppgLocal * 0.5;
        const affected = tokens.filter(t => {
          const dx = t.x - editingWall!.x;
          const dy = t.y - editingWall!.y;
          return Math.abs(dx * cosA + dy * sinA) <= halfL + tRadius &&
                 Math.abs(-dx * sinA + dy * cosA) <= halfT + tRadius;
        });
        const results = rollSaves(affected, editingWall.saveAbility, editingWall.saveDc);
        const combatantIds = Object.keys(results);
        setEditingWall(null);
        setPlacingSpell(null);
        if (combatantIds.length === 0) { onCastingDismissed?.(); return false; }
        onAoeHighlightsChange?.({
          affectedCombatantIds: combatantIds,
          saveResults: results,
          spellName: editingWall.spellName,
          saveAbility: editingWall.saveAbility,
          saveDc: editingWall.saveDc,
          halfDamageOnSave: editingWall.halfDamageOnSave,
        });
        return true;
      }

      setEditingWall(null);
      setPlacingSpell(null);
      onCastingDismissed?.();
      return false;
    }

    // Ring-shape placement (Wall of Fire Ring) — create a persistent ring marker
    if (editingRing) {
      const marker: SpellMarker = {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        spellName: editingRing.spellName,
        school: editingRing.school,
        casterId: editingRing.casterId,
        x: editingRing.x,
        y: editingRing.y,
        visibleToPlayers: true,
        floorId: activeFloorId || undefined,
        shapeType: 'ring',
        aoeSize: editingRing.radius,
        hotSide: editingRing.hotSide,
      };
      const updated = [...spellMarkers, marker];
      onSpellMarkersChange?.(updated);
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }

      // Roll saves for tokens touching the ring (within one token-radius of the ring edge)
      if (editingRing.saveAbility && editingRing.saveDc) {
        const ringRadiusPx = (editingRing.radius / 5) * ppgLocal;
        const tRadius = ppgLocal * 0.5;
        const affected = tokens.filter(t => {
          const dist = Math.hypot(t.x - editingRing!.x, t.y - editingRing!.y);
          return Math.abs(dist - ringRadiusPx) <= tRadius;
        });
        const results = rollSaves(affected, editingRing.saveAbility, editingRing.saveDc);
        const combatantIds = Object.keys(results);
        setEditingRing(null);
        setPlacingSpell(null);
        if (combatantIds.length === 0) { onCastingDismissed?.(); return false; }
        onAoeHighlightsChange?.({
          affectedCombatantIds: combatantIds,
          saveResults: results,
          spellName: editingRing.spellName,
          saveAbility: editingRing.saveAbility,
          saveDc: editingRing.saveDc,
          halfDamageOnSave: editingRing.halfDamageOnSave,
        });
        return true;
      }

      setEditingRing(null);
      setPlacingSpell(null);
      onCastingDismissed?.();
      return false;
    }

    const aoe = placedAoe; // Only the caster's screen can confirm
    if (!aoe) return false;

    /** Helper: place a persistent spell marker at the AoE position */
    const placePersistentMarker = () => {
      const entry = lookupSpell(aoe.name);
      const marker: SpellMarker = {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        spellName: aoe.name,
        school: entry?.school || 'Conjuration',
        casterId: aoe.casterId,
        x: aoe.x,
        y: aoe.y,
        aoeType: aoe.aoeType,
        aoeSize: aoe.aoeSize,
        visibleToPlayers: true,
        floorId: activeFloorId || undefined,
      };
      const updated = [...spellMarkers, marker];
      onSpellMarkersChange?.(updated);
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }
    };

    // cast-confirm spells (e.g. Prayer of Healing) — show AoE preview then just dismiss
    if (aoe.mapInteraction === 'cast-confirm') {
      setPlacedAoe(null);
      onCastingDismissed?.();
      return false;
    }

    // No save roll needed (e.g. Darkness) — place as a persistent spell marker
    if (!aoe.saveAbility || !aoe.saveDc) {
      // damage-auto: all tokens in AoE auto-fail — trigger damage modal via save results
      if (aoe.saveEffect === 'damage-auto') {
        const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
        const results: Record<string, SaveResult> = {};
        for (const tokenId of tokensInAoe) {
          const token = tokens.find(t => t.id === tokenId);
          if (!token?.combatantId) continue;
          const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
          if (!combatant || combatant.type === 'player') continue;
          results[combatant.sourceCombatantId || combatant.id] = {
            roll: 0,
            modifier: 0,
            total: 0,
            success: false, // all auto-fail
            name: combatant.name,
          };
        }
        // Place persistent marker (cast-and-place)
        if (aoe.mapInteraction === 'cast-and-place') placePersistentMarker();
        // Activate emanation (cast-and-emanate)
        if (aoe.mapInteraction === 'cast-and-emanate' && aoe.casterId) onEmanationCast?.(aoe.name, aoe.casterId);
        // No monsters hit — skip modal
        if (Object.keys(results).length === 0) {
          setPlacedAoe(null);
          onCastingDismissed?.();
          return false;
        }
        setPlacedAoe(prev => prev ? { ...prev, saveResults: results } : null);
        return true;
      }

      // cast-and-emanate with no save (Shield of Faith, etc.) — activate emanation and dismiss
      if (aoe.mapInteraction === 'cast-and-emanate' && aoe.casterId) {
        onEmanationCast?.(aoe.name, aoe.casterId);
        setPlacedAoe(null);
        onCastingDismissed?.();
        return false;
      }

      // Regular no-save spell (Darkness, etc.) — place as a persistent spell marker
      const entry = lookupSpell(aoe.name);
      const marker: SpellMarker = {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        spellName: aoe.name,
        school: entry?.school || 'Illusion',
        x: aoe.x,
        y: aoe.y,
        effectRadius: aoe.aoeSize,
        visibleToPlayers: true,
        floorId: activeFloorId || undefined,
      };
      const updated = [...spellMarkers, marker];
      onSpellMarkersChange?.(updated);
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }
      setPlacedAoe(null);
      onCastingDismissed?.();
      return false;
    }

    const results: Record<string, SaveResult> = {};

    for (const tokenId of tokensInAoe) {
      const token = tokens.find(t => t.id === tokenId);
      if (!token?.combatantId) continue;
      const combatant = allCombatants.find(c => c.id === token.combatantId || c.sourceCombatantId === token.combatantId);
      if (!combatant || combatant.type === 'player') continue; // Only roll for monsters/NPCs

      const abilityKey = aoe.saveAbility as keyof NonNullable<typeof combatant.stats>;
      const statValue = combatant.stats?.[abilityKey] || 10;
      const modifier = Math.floor((statValue - 10) / 2);
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + modifier;

      results[combatant.sourceCombatantId || combatant.id] = {
        roll,
        modifier,
        total,
        success: total >= aoe.saveDc,
        name: combatant.name,
      };
    }

    // For cast-and-place spells (Grease, Moonbeam, etc.), also drop a persistent marker
    if (aoe.mapInteraction === 'cast-and-place') placePersistentMarker();
    // Activate emanation (cast-and-emanate)
    if (aoe.mapInteraction === 'cast-and-emanate' && aoe.casterId) onEmanationCast?.(aoe.name, aoe.casterId);

    // No monsters hit — skip modal
    if (Object.keys(results).length === 0) {
      setPlacedAoe(null);
      onCastingDismissed?.();
      return false;
    }

    setPlacedAoe(prev => prev ? { ...prev, saveResults: results } : null);
    return true;
  };

  if (confirmCastRef) {
    confirmCastRef.current = handleConfirmCast;
  }

  // Expose clear movement paths to external code (e.g. CombatView "Next Turn")
  if (clearMovementPathsRef) {
    clearMovementPathsRef.current = () => {
      setMovementPaths({});
      activePathRef.current = {};
    };
  }

  // Notify external code when tokens with movement paths changes
  useEffect(() => {
    onMovementPathTokensChange?.(new Set(
      Object.values(movementPaths)
        .filter(p => !p.isDragging && p.points.length >= 4)
        .map(p => p.tokenId)
    ));
  }, [movementPaths]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear movement paths when combat ends
  useEffect(() => {
    if (!inCombat) {
      setMovementPaths({});
      activePathRef.current = {};
    }
  }, [inCombat]);

  // Ctrl+Z to undo movement (DM view only)
  useEffect(() => {
    if (!inCombat || isPlayerView) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const targetId = selectedTokenIds.length === 1 ? selectedTokenIds[0] : null;
        if (targetId && movementPaths[targetId] && !movementPaths[targetId].isDragging) {
          e.preventDefault();
          undoMovement(targetId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inCombat, isPlayerView, selectedTokenIds, movementPaths, tokens]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload all spell marker icons so KonvaImage nodes render on first paint
  useEffect(() => {
    let pending = 0;
    const onLoad = () => {
      pending--;
      if (pending <= 0) setIconVersion(v => v + 1);
    };
    const allSvgs = [...Object.values(SCHOOL_ICON_SVGS), ...Object.values(SPELL_ICON_SVGS)];
    for (const svg of allSvgs) {
      const cached = iconImageCache.get(svg);
      if (!cached || !cached.complete) {
        pending++;
        getIconImage(svg, onLoad);
      }
    }
    if (pending === 0) setIconVersion(v => v + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ppgForBlocking = gridResolution?.pixelsPerGrid || 40;
  const blockingSegments = useMemo(
    () => {
      const base = extractBlockingSegments(walls || [], objectWalls || [], portals || []);
      // Inject 4 segments per vision-blocking wall-shape spell marker on the active floor
      const wallMarkerSegs = (spellMarkers || [])
        .filter(m => m.shapeType === 'wall' && m.blocksVision)
        .filter(m => !m.floorId || m.floorId === activeFloorId)
        .flatMap(m => {
          const corners = computeWallCorners(
            m.x, m.y,
            m.length ?? 30,
            m.thickness ?? 10,
            m.angle ?? 0,
            ppgForBlocking,
          );
          return [
            { a: corners[0], b: corners[1] },
            { a: corners[1], b: corners[2] },
            { a: corners[2], b: corners[3] },
            { a: corners[3], b: corners[0] },
          ];
        });
      return [...base, ...wallMarkerSegs];
    },
    [walls, objectWalls, portals, spellMarkers, activeFloorId, ppgForBlocking]
  );

  // Base player token positions from committed state.
  const playerTokensBase = useMemo(
    () => tokens.filter(t => t.type === 'player' && !t.hidden),
    [tokens]
  );

  // Live player token positions including drag offsets — used for rendering AND visibility ray-casts.
  const playerTokenPositions = useMemo(
    () => playerTokensBase.map(t =>
      livePlayerPos[t.id] ? { ...t, ...livePlayerPos[t.id] } : t
    ),
    [playerTokensBase, livePlayerPos]
  );

  // When the DM has "View as Player" active, restrict vision raycasts to that one player's token.
  const visionPlayerTokenPositions = useMemo(
    () => dmViewAsPlayerId
      ? playerTokenPositions.filter(t => t.combatantId === dmViewAsPlayerId)
      : playerTokenPositions,
    [playerTokenPositions, dmViewAsPlayerId]
  );

  // True whenever fog should be computed from a player's perspective (player screen OR DM viewing as player).
  const useFromPlayerPerspective = isPlayerView || !!dmViewAsPlayerId;

  // DM-only unlimited visibility polygons (skip when rendering from a player's perspective — playerVisionData handles that)
  const visibilityPolygons = useMemo(
    () => {
      if (useFromPlayerPerspective || !loadedImage) return [];
      return playerTokenPositions.map(t =>
        computeVisibilityPolygon(
          { x: t.x, y: t.y },
          blockingSegments,
          loadedImage.width,
          loadedImage.height
        )
      );
    },
    [playerTokenPositions, blockingSegments, loadedImage, useFromPlayerPerspective]
  );

  // Player-perspective visibility: respects darkness level and per-token darkvision radius.
  // Used by the player screen AND by the DM's "View as Player" mode.
  const playerVisionData = useMemo((): WallPoint[][] => {
    if (!useFromPlayerPerspective || !loadedImage) return [];

    const level = darknessLevel ?? 'dark';
    const allCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const fogPolygons: WallPoint[][] = [];
    const { width: mapW, height: mapH } = loadedImage;

    for (const t of visionPlayerTokenPositions) {
      const combatant = allCombatants.find(c => c.id === t.combatantId);
      // Blindsight functions like darkvision for fog-of-war reveal (e.g. a summoned Bat
      // has Blindsight 60 ft but no darkvision — it should still light up the map).
      const blindsightMatch = combatant?.senses?.match(/blindsight\s+(\d+)/i);
      const blindsightFt = blindsightMatch ? parseInt(blindsightMatch[1], 10) : 0;
      const visionFt = Math.max(combatant?.darkvision ?? 0, blindsightFt);
      const visionPx = gridResolution
        ? (visionFt / 5) * gridResolution.pixelsPerGrid
        : visionFt * 4;
      const origin = { x: t.x, y: t.y };
      const fullPoly = computeVisibilityPolygon(origin, blockingSegments, mapW, mapH);

      if (level === 'daylight') {
        fogPolygons.push(fullPoly);
      } else {
        // Dark: only tokens with darkvision or blindsight see, within their radius
        if (visionFt > 0) {
          fogPolygons.push(clipPolygonToCircle(fullPoly, origin, visionPx));
        }
        // no vision range = no reveal
      }
    }

    return fogPolygons;
  }, [useFromPlayerPerspective, loadedImage, darknessLevel, visionPlayerTokenPositions, blockingSegments,
    players, npcs, persistentEnemies, scenarioCombatants, gridResolution]);

  // Light illumination polygons — UVTT static lights + placed Light spell markers.
  // Each polygon represents the area a light source can illuminate (wall-blocked raycasting
  // from the light's position). The FogOfWarLayer intersects these with player LOS to reveal fog.
  const lightPolygons = useMemo((): WallPoint[][] => {
    if (!loadedImage) return [];
    const { width: mapW, height: mapH } = loadedImage;
    const results: WallPoint[][] = [];

    // UVTT static lights (torches, fires, etc. baked into the map file)
    for (const light of (lights ?? [])) {
      results.push(computeRadiusLimitedVisibilityPolygon(
        { x: light.x, y: light.y },
        blockingSegments,
        mapW, mapH,
        light.radiusPx
      ));
    }

    // Placed light-source markers (Light, Dancing Lights, etc.) — treated as dynamic light sources.
    // Use live drag position if currently being dragged for real-time fog update.
    for (const marker of spellMarkers) {
      if (!marker.lightSource || !marker.effectRadius) continue;
      if (marker.floorId && marker.floorId !== activeFloorId) continue;
      const live = liveMarkerPos[marker.id];
      const radiusPx = (marker.effectRadius / 5) * ppg;
      results.push(computeRadiusLimitedVisibilityPolygon(
        { x: live?.x ?? marker.x, y: live?.y ?? marker.y },
        blockingSegments,
        mapW, mapH,
        radiusPx
      ));
    }

    return results;
  }, [lights, spellMarkers, liveMarkerPos, activeFloorId, blockingSegments, loadedImage, ppg]);

  // Full (unclipped) LOS polygons for every player token — used as clip masks when rendering
  // light-visible areas. Only computed when there are lights and we're rendering from a player's perspective.
  const playerFullLOSPolygons = useMemo((): WallPoint[][] => {
    if (!useFromPlayerPerspective || !loadedImage || !lightPolygons.length) return [];
    const { width: mapW, height: mapH } = loadedImage;
    return visionPlayerTokenPositions.map(t =>
      computeVisibilityPolygon({ x: t.x, y: t.y }, blockingSegments, mapW, mapH)
    );
  }, [useFromPlayerPerspective, loadedImage, lightPolygons.length, visionPlayerTokenPositions, blockingSegments]);

  // ── Dark Zones ──
  // In Daylight, dark-zone polygons should re-fog the area inside them. Applies to
  // the player perspective AND the DM's fog preview, so the preview matches what
  // players actually see (the DM additionally sees the dashed zone outline).
  const darkZonePolygons = useMemo((): WallPoint[][] => {
    if ((darknessLevel ?? 'dark') !== 'daylight') return [];
    if (!darkZones.length) return [];
    return darkZones
      .filter(z => z.points.length >= 6)
      .map(z => {
        const pts: WallPoint[] = [];
        for (let i = 0; i < z.points.length; i += 2) {
          pts.push({ x: z.points[i], y: z.points[i + 1] });
        }
        return pts;
      });
  }, [darknessLevel, darkZones]);

  // Darkvision-radius-limited LOS polygons for every player token that has
  // darkvision or blindsight. Used to re-erase fog inside dark zones so tokens
  // with darkvision can see partway into them.
  const darkvisionRevealPolygons = useMemo((): WallPoint[][] => {
    if (!loadedImage || !darkZonePolygons.length) return [];
    const { width: mapW, height: mapH } = loadedImage;
    const allCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const result: WallPoint[][] = [];
    for (const t of visionPlayerTokenPositions) {
      const combatant = allCombatants.find(c => c.id === t.combatantId);
      const blindsightMatch = combatant?.senses?.match(/blindsight\s+(\d+)/i);
      const blindsightFt = blindsightMatch ? parseInt(blindsightMatch[1], 10) : 0;
      const visionFt = Math.max(combatant?.darkvision ?? 0, blindsightFt);
      if (visionFt <= 0) continue;
      const visionPx = gridResolution
        ? (visionFt / 5) * gridResolution.pixelsPerGrid
        : visionFt * 4;
      const origin = { x: t.x, y: t.y };
      const fullPoly = computeVisibilityPolygon(origin, blockingSegments, mapW, mapH);
      result.push(clipPolygonToCircle(fullPoly, origin, visionPx));
    }
    return result;
  }, [loadedImage, darkZonePolygons.length, visionPlayerTokenPositions, blockingSegments,
    players, npcs, persistentEnemies, scenarioCombatants, gridResolution]);

  const hasFogData = blockingSegments.length > 0;

  // ── Explored fog memory (StarCraft-style) ──
  // Everything players have ever seen accumulates into a per-floor mask
  // (utils/exploredFog.ts) that the fog layer uses to dim previously-seen
  // terrain instead of hiding it in pitch black. Both the DM and player
  // windows accumulate independently from the same synced token positions;
  // only the DM window persists to IndexedDB to avoid write races.
  const exploredFogMaskKey = scenarioId && activeFloorId
    ? exploredFogKey(scenarioId, activeFloorId)
    : null;

  const exploredMaskEntry = useMemo(() => {
    if (!exploredFogMaskKey || !loadedImage || !hasFogData) return null;
    return getExploredFogEntry(exploredFogMaskKey, loadedImage.width, loadedImage.height);
  }, [exploredFogMaskKey, loadedImage, hasFogData]);

  const [exploredMaskVersion, setExploredMaskVersion] = useState(0);
  useEffect(() => {
    if (!exploredFogMaskKey) return;
    setExploredMaskVersion(getExploredFogVersion(exploredFogMaskKey));
    return subscribeExploredFog(exploredFogMaskKey, () =>
      setExploredMaskVersion(getExploredFogVersion(exploredFogMaskKey))
    );
  }, [exploredFogMaskKey]);

  // Apply "Reset Explored Fog" — the timestamp travels on the Floor object so
  // the player window picks it up over the normal IPC state sync. Re-runs on
  // version bumps so it also applies right after the async IndexedDB load.
  useEffect(() => {
    if (!exploredFogMaskKey || !exploredFogResetAt || !exploredMaskEntry) return;
    resetExploredFog(exploredFogMaskKey, exploredFogResetAt, !isPlayerView);
  }, [exploredFogMaskKey, exploredFogResetAt, exploredMaskEntry, isPlayerView, exploredMaskVersion]);

  // Current visible region for ALL player tokens under player-vision rules
  // (darkness level, darkvision/blindsight radius). Unlike playerVisionData
  // this ignores "View as Player" filtering and runs on the DM screen too, so
  // exploration accrues whenever tokens move — even during session prep.
  const exploredStampData = useMemo(() => {
    if (!loadedImage || !hasFogData || !exploredFogMaskKey) return null;
    const { width: mapW, height: mapH } = loadedImage;
    const level = darknessLevel ?? 'dark';
    const allCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const visionPolys: WallPoint[][] = [];
    const darkvisionPolys: WallPoint[][] = [];
    const losPolys: WallPoint[][] = [];
    const hasDarkZones = darkZonePolygons.length > 0;
    const hasLights = lightPolygons.length > 0;

    for (const t of playerTokenPositions) {
      const combatant = allCombatants.find(c => c.id === t.combatantId);
      const blindsightMatch = combatant?.senses?.match(/blindsight\s+(\d+)/i);
      const blindsightFt = blindsightMatch ? parseInt(blindsightMatch[1], 10) : 0;
      const visionFt = Math.max(combatant?.darkvision ?? 0, blindsightFt);
      const visionPx = gridResolution
        ? (visionFt / 5) * gridResolution.pixelsPerGrid
        : visionFt * 4;
      const origin = { x: t.x, y: t.y };
      const fullPoly = computeVisibilityPolygon(origin, blockingSegments, mapW, mapH);

      if (level === 'daylight') {
        visionPolys.push(fullPoly);
      } else if (visionFt > 0) {
        visionPolys.push(clipPolygonToCircle(fullPoly, origin, visionPx));
      }
      if (hasDarkZones && visionFt > 0) {
        darkvisionPolys.push(clipPolygonToCircle(fullPoly, origin, visionPx));
      }
      if (hasLights) {
        losPolys.push(fullPoly);
      }
    }
    return { visionPolys, darkvisionPolys, losPolys };
  }, [loadedImage, hasFogData, exploredFogMaskKey, darknessLevel, playerTokenPositions,
    blockingSegments, players, npcs, persistentEnemies, scenarioCombatants, gridResolution,
    darkZonePolygons.length, lightPolygons.length]);

  // Stamp the current visible region into the explored mask, trailing-throttled
  // so continuous token drags don't redraw the mask every frame.
  const exploredStampThrottleRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    latest: (() => void) | null;
    latestKey: string | null;
  }>({ timer: null, latest: null, latestKey: null });

  useEffect(() => {
    if (!exploredFogMaskKey || !loadedImage || !exploredStampData) return;
    const { visionPolys, darkvisionPolys, losPolys } = exploredStampData;
    const anyLight = losPolys.length > 0 && lightPolygons.length > 0;
    if (!visionPolys.length && !darkvisionPolys.length && !anyLight) return;
    const { width: mapW, height: mapH } = loadedImage;

    const doStamp = () => {
      // Paint the currently-visible region opaque, mirroring the compositing
      // order of FogOfWarLayer (vision → dark-zone cutout → darkvision → light∩LOS).
      stampExploredFog(exploredFogMaskKey, mapW, mapH, !isPlayerView, (ctx) => {
        const trace = (polygon: WallPoint[]) => {
          ctx.beginPath();
          ctx.moveTo(polygon[0].x, polygon[0].y);
          for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
          ctx.closePath();
        };
        ctx.fillStyle = 'white';
        for (const poly of visionPolys) {
          if (poly.length < 3) continue;
          trace(poly);
          ctx.fill();
        }
        if (darkZonePolygons.length) {
          ctx.globalCompositeOperation = 'destination-out';
          for (const poly of darkZonePolygons) {
            if (poly.length < 3) continue;
            trace(poly);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const poly of darkvisionPolys) {
            if (poly.length < 3) continue;
            trace(poly);
            ctx.fill();
          }
        }
        if (anyLight) {
          for (const losPoly of losPolys) {
            if (losPoly.length < 3) continue;
            for (const lightPoly of lightPolygons) {
              if (lightPoly.length < 3) continue;
              ctx.save();
              trace(losPoly);
              ctx.clip();
              trace(lightPoly);
              ctx.fill();
              ctx.restore();
            }
          }
        }
      });
    };

    const st = exploredStampThrottleRef.current;
    // Floor switched with a stamp still pending — flush it for the old floor
    // now so the final token positions there aren't lost (the primary MapView
    // is reused across floor switches, not remounted).
    if (st.latest && st.latestKey !== exploredFogMaskKey) {
      const fn = st.latest;
      st.latest = null;
      fn();
    }
    st.latest = doStamp;
    st.latestKey = exploredFogMaskKey;
    if (!st.timer) {
      st.timer = setTimeout(() => {
        st.timer = null;
        const fn = st.latest;
        st.latest = null;
        fn?.();
      }, 200);
    }
  }, [exploredFogMaskKey, loadedImage, exploredStampData, darkZonePolygons, lightPolygons, isPlayerView]);

  // Flush any pending stamp on unmount (e.g. switching floors mid-drag).
  useEffect(() => () => {
    const st = exploredStampThrottleRef.current;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }
    const fn = st.latest;
    st.latest = null;
    fn?.();
  }, []);

  // Pre-dimmed terrain masked to explored areas, painted on top of the fog by
  // FogOfWarLayer (source-atop). Keeping the fog itself fully opaque means
  // tokens underneath are occluded exactly at the visibility boundary — a
  // half-exposed enemy shows half — while explored terrain reads through as
  // dim "memory". Rebuilt only when the mask or map changes, not every frame.
  const exploredOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const exploredOverlayCanvas = useMemo(() => {
    if (!exploredMaskEntry || !loadedImage) return null;
    const mask = exploredMaskEntry.canvas;
    if (!exploredOverlayRef.current) {
      exploredOverlayRef.current = document.createElement('canvas');
    }
    const buf = exploredOverlayRef.current;
    if (buf.width !== mask.width || buf.height !== mask.height) {
      buf.width = mask.width;
      buf.height = mask.height;
    }
    const bctx = buf.getContext('2d');
    if (!bctx) return null;
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, buf.width, buf.height);
    bctx.drawImage(loadedImage, 0, 0, buf.width, buf.height);
    // Keep terrain only where explored
    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(mask, 0, 0);
    // Bake in the memory dim
    bctx.globalCompositeOperation = 'source-atop';
    bctx.fillStyle = `rgba(0, 0, 0, ${EXPLORED_DIM})`;
    bctx.fillRect(0, 0, buf.width, buf.height);
    bctx.globalCompositeOperation = 'source-over';
    return buf;
    // exploredMaskVersion re-runs this when the mask contents change in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploredMaskEntry, exploredMaskVersion, loadedImage]);

  // Viewpoint proximity — which viewpoints have a player token within 3 grid squares
  const VIEWPOINT_RANGE_GRIDS = 3;
  const viewpointProximity = useMemo(() => {
    const range = VIEWPOINT_RANGE_GRIDS * (gridResolution?.pixelsPerGrid ?? 70);
    const range2 = range * range;
    const inRange = new Set<string>();
    (viewpoints ?? []).forEach(vp => {
      playerTokenPositions.forEach(t => {
        const dx = t.x - vp.x;
        const dy = t.y - vp.y;
        if (dx * dx + dy * dy <= range2) inRange.add(vp.id);
      });
    });
    return inRange;
  }, [viewpoints, playerTokenPositions, gridResolution?.pixelsPerGrid]);

  const getNoteColor = (type: MapNoteType) => {
    switch (type) {
      case 'quote': return '#60a5fa';
      case 'treasure': return '#CD7F32';
      case 'warning': return '#ef4444';
      case 'magic': return '#22d3ee';
      case 'poison': return '#16a34a';
      case 'image': return '#a78bfa';
      case 'sound': return '#f59e0b';
      default: return '#ffffff';
    }
  };

  const NoteMapIcon = ({ type }: { type: MapNoteType }) => {
    const noteRadius = tokenRadius * 0.6;
    const s = noteRadius / 28;
    const offset = -(12 * s);
    const sp = { stroke: 'white', strokeWidth: 2, lineCap: 'round' as const, lineJoin: 'round' as const, fill: '' };

    const icon = (() => {
      switch (type) {
        case 'treasure':
          return (
            <Group>
              <Path data="M10.5 3 8 9l4 13 4-13-2.5-6" {...sp} />
              <Path data="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" {...sp} />
              <Path data="M2 9h20" {...sp} />
            </Group>
          );
        case 'quote':
          return (
            <Group>
              <Path data="M12 7v14" {...sp} />
              <Path data="M16 12h2" {...sp} />
              <Path data="M16 8h2" {...sp} />
              <Path data="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" {...sp} />
              <Path data="M6 12h2" {...sp} />
              <Path data="M6 8h2" {...sp} />
            </Group>
          );
        case 'warning':
          return (
            <Group>
              <Path data="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" {...sp} />
              <Path data="M12 9v4" {...sp} />
              <Circle x={12} y={17} radius={0.5} fill="white" stroke="white" strokeWidth={1} />
            </Group>
          );
        case 'poison':
          return (
            <Group>
              <Path data="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" {...sp} />
              <Path data="m12.5 17-.5-1-.5 1h1z" {...{ ...sp, fill: 'white' }} />
              <Circle x={15} y={12} radius={1} fill="white" stroke="white" strokeWidth={1} />
              <Circle x={9} y={12} radius={1} fill="white" stroke="white" strokeWidth={1} />
            </Group>
          );
        case 'magic':
          return (
            <Group>
              <Path data="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" {...sp} />
              <Path data="M20 3v4" {...sp} />
              <Path data="M22 5h-4" {...sp} />
              <Path data="M4 17v2" {...sp} />
              <Path data="M5 18H3" {...sp} />
            </Group>
          );
        case 'image':
          return (
            <Group>
              <Path data="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" {...sp} />
              <Circle x={9} y={9} radius={2} {...sp} />
              <Path data="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" {...sp} />
            </Group>
          );
        case 'sound':
          // Lucide Music icon paths
          return (
            <Group>
              <Path data="M9 18V5l12-2v13" {...sp} />
              <Circle x={6} y={18} radius={3} {...sp} />
              <Circle x={18} y={16} radius={3} {...sp} />
            </Group>
          );
        default:
          return null;
      }
    })();

    return <Group scale={{ x: s, y: s }} x={offset} y={offset}>{icon}</Group>;
  };

  useEffect(() => {
    if (mapImage) {
      const applyLoadedMedia = (media: HTMLImageElement | HTMLVideoElement, mediaW: number, mediaH: number) => {
        // Defer EVERY state update (image + scale + position + reveal flag) to
        // the same animation frame, so the new map, the new camera, and the
        // overlay reveal all happen atomically in a single render. Without
        // this, the stage can briefly render the new image with the old
        // camera transform, causing a visible jump as the transition
        // overlay fades out.
        requestAnimationFrame(() => {
          const dims = dimensionsRef.current;
          if (dims.width <= 0 || dims.height <= 0) {
            // Dimensions aren't ready yet — at minimum, swap in the new
            // image and mark the transition complete so the overlay fades.
            // A later ResizeObserver tick will set the camera.
            setLoadedImage(media);
            setDisplayedMapImage(mapImage);
            return;
          }
          // Target a consistent token screen size of ~40px radius
          const targetTokenScreenRadius = 18;
          let scale: number;

          if (gridResolution && gridResolution.pixelsPerGrid > 0) {
            // Token radius in source image = pixelsPerGrid * 0.4
            // We want (pixelsPerGrid * 0.4) * scale = targetTokenScreenRadius
            const sourceTokenRadius = gridResolution.pixelsPerGrid * 0.4;
            scale = targetTokenScreenRadius / sourceTokenRadius;
          } else {
            // No grid info: fit the map snugly in the viewport
            const padding = 80;
            scale = Math.min(
              (dims.width - padding) / mediaW,
              (dims.height - padding) / mediaH,
              1
            );
          }

          const clampedScale = Math.min(Math.max(scale, 0.05), 5);
          const finalScale = isPlayerView ? clampedScale * 1.15 : clampedScale;
          // Use the ref so we pick up any viewportCenter updates the parent
          // pushed between when this load started and when it finished
          // (e.g. a floor-transition's arrival-position update).
          const vc = viewportCenterRef.current;
          const nextPos = (isPlayerView && vc)
            ? {
                x: dims.width / 2 - vc.x * finalScale,
                y: dims.height / 2 - vc.y * finalScale,
              }
            : {
                x: (dims.width - mediaW * finalScale) / 2,
                y: (dims.height - mediaH * finalScale) / 2,
              };
          setLoadedImage(media);
          setStageScale(finalScale);
          setStagePos(nextPos);
          setDisplayedMapImage(mapImage);
        });
      };

      if (mapImage.startsWith('data:video/')) {
        // Animated map (Dungeon Alchemist MP4/WEBM export). Konva draws a
        // <video> element the same way it draws an image; a Konva.Animation
        // (see the effect below) keeps the layer redrawing while it plays.
        const video = document.createElement('video');
        video.src = mapImage;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.addEventListener('loadeddata', () => {
          // Give the element explicit width/height attributes so all the
          // downstream loadedImage.width/height reads work like they do
          // for HTMLImageElement.
          video.width = video.videoWidth;
          video.height = video.videoHeight;
          video.play().catch(() => { /* autoplay is allowed for muted video */ });
          applyLoadedMedia(video, video.videoWidth, video.videoHeight);
        }, { once: true });
      } else {
        const img = new Image();
        img.src = mapImage;
        img.onload = () => applyLoadedMedia(img, img.width, img.height);
      }
    } else {
      setLoadedImage(null);
      setDisplayedMapImage(undefined);
    }
  }, [mapImage, gridResolution?.pixelsPerGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animated (video) maps: Konva only repaints a layer when told to, so run a
  // Konva.Animation that redraws the base-map layer every frame while a video
  // map is playing. Cleanup pauses the old video and releases its decoder.
  useEffect(() => {
    if (!(loadedImage instanceof HTMLVideoElement)) return;
    const video = loadedImage;
    const anim = new Konva.Animation(() => { /* redraw only */ }, mapLayerRef.current);
    anim.start();
    return () => {
      anim.stop();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [loadedImage]);

  // When the player-view target center changes after the image is already
  // loaded (e.g. parent set floorCenters[newFloor]=arrival just after a
  // transition), re-center the camera on the new spot. This catches the case
  // where the image .onload fires before the parent's effect can update
  // viewportCenter — without this, the camera would land at a stale spot.
  useEffect(() => {
    if (!isPlayerView) return;
    if (!viewportCenter || !loadedImage) return;
    const dims = dimensionsRef.current;
    if (dims.width <= 0 || dims.height <= 0) return;
    setStagePos({
      x: dims.width / 2 - viewportCenter.x * stageScale,
      y: dims.height / 2 - viewportCenter.y * stageScale,
    });
    // intentionally only depends on the center coords + image identity — we
    // don't want this to retrigger on stageScale changes the user makes by
    // pinching.
  }, [viewportCenter?.x, viewportCenter?.y, loadedImage]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const d = { width: entry.contentRect.width, height: entry.contentRect.height };
          dimensionsRef.current = d;
          setDimensions(d);
        }
      });

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isUVTT = ['uvtt', 'dd2vtt', 'df2vtt'].includes(ext || '');

    if (isUVTT) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = parseUVTTFile(event.target?.result as string);
          onMapChange(result.mapImage);
          onWallDataChange?.(result.walls, result.objectWalls, result.portals, result.gridResolution, result.lights);
        } catch (err) {
          alert(`Failed to parse UVTT file: ${(err as Error).message}`);
        }
      };
      reader.readAsText(file);
    } else {
      // Video maps (Dungeon Alchemist MP4/WEBM export): the OS may report a
      // missing/generic MIME type, so force the data URL to data:video/… —
      // that prefix is what the map-loading effect keys on.
      const videoMime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : null;
      const reader = new FileReader();
      reader.onload = (event) => {
        let result = event.target?.result as string | undefined;
        if (!result) return;
        if (videoMime && !result.startsWith('data:video/')) {
          result = result.replace(/^data:[^;,]*/, `data:${videoMime}`);
        }
        onMapChange(result);
        if (videoMime) notifyVideoImport(result);
      };
      reader.readAsDataURL(file);
    }
  };

  // After a video map is uploaded onto a floor that already has UVTT data
  // (walls/doors/lights/grid), tell the DM that data was kept — that's the
  // intended Dungeon Alchemist workflow (import the .uvtt for walls, then the
  // video as the visual). Warn instead if the video resolution doesn't match
  // the UVTT map, since wall coordinates are in pixels of the original image.
  const notifyVideoImport = (videoDataUrl: string) => {
    const hasWallData = !!(walls?.length || objectWalls?.length || portals?.length || lights?.length);
    if (!hasWallData && !gridResolution) return;

    const probe = document.createElement('video');
    probe.muted = true;
    probe.src = videoDataUrl;
    probe.addEventListener('loadedmetadata', () => {
      const vw = probe.videoWidth;
      const vh = probe.videoHeight;
      probe.removeAttribute('src');
      probe.load();

      const expectedW = gridResolution ? Math.round(gridResolution.mapSize.x * gridResolution.pixelsPerGrid) : null;
      const expectedH = gridResolution ? Math.round(gridResolution.mapSize.y * gridResolution.pixelsPerGrid) : null;
      // Video encoders round dimensions to even numbers, so allow a couple px.
      const mismatch = expectedW !== null && expectedH !== null &&
        (Math.abs(vw - expectedW) > 2 || Math.abs(vh - expectedH) > 2);

      if (mismatch) {
        setVideoImportNotice({
          kind: 'mismatch',
          text: `Video is ${vw}×${vh}px but the imported UVTT map is ${expectedW}×${expectedH}px — walls, lights & grid may not line up. Re-export the video at the same resolution as the UVTT export.`,
        });
      } else if (hasWallData) {
        setVideoImportNotice({
          kind: 'kept',
          text: 'Animated map imported — existing walls, doors, lights & grid were kept.',
        });
      }
    }, { once: true });
  };

  const multiDragStartRef = useRef<{
    draggedId: string;
    draggedStart: { x: number; y: number };
    othersStart: Record<string, { x: number; y: number }>;
  } | null>(null);

  // Track drag start pos per token so we can cancel micro-drags (finger wobble)
  const tokenDragOriginRef = useRef<Record<string, { x: number; y: number }>>({});

  // Difficult terrain costs double movement. Returns 2 when (px,py) is inside any
  // painted difficult-terrain polygon on this floor, otherwise 1.
  const terrainMoveCost = (px: number, py: number): number => {
    for (const zone of difficultTerrain) {
      if (zone.points.length >= 6 && pointInFlatPolygon(px, py, zone.points)) return 2;
    }
    return 1;
  };

  const handleDragStart = (id: string) => {
    // Block token drag while measuring
    if (isMeasuringActive) return;
    // Block token drag while drawing
    if (drawingMode !== 'off') return;
    // Block token drag if a two-finger pan is active
    if (twoFingerPanRef.current) return;
    isTokenDraggingRef.current = true;
    onDragStatusChange?.(true);
    // Record the starting position so we can detect micro-drags
    const startToken = tokens.find(t => t.id === id);
    if (startToken) {
      tokenDragOriginRef.current[id] = { x: startToken.x, y: startToken.y };
      lastValidPosRef.current[id] = { x: startToken.x, y: startToken.y };
      dragTokenRadiusRef.current[id] = getTokenCollisionRadius(startToken.size, gridResolution?.pixelsPerGrid ?? 70);
    }
    const isMulti = selectedTokenIds.includes(id) && selectedTokenIds.length > 1;
    if (isMulti) {
      const draggedToken = tokens.find(t => t.id === id);
      if (!draggedToken) return;
      const othersStart: Record<string, { x: number; y: number }> = {};
      selectedTokenIds.forEach(tid => {
        if (tid !== id) {
          const t = tokens.find(tok => tok.id === tid);
          if (t) {
            othersStart[tid] = { x: t.x, y: t.y };
            lastValidPosRef.current[tid] = { x: t.x, y: t.y };
            dragTokenRadiusRef.current[tid] = getTokenCollisionRadius(t.size, gridResolution?.pixelsPerGrid ?? 70);
          }
        }
      });
      multiDragStartRef.current = {
        draggedId: id,
        draggedStart: { x: draggedToken.x, y: draggedToken.y },
        othersStart,
      };
    } else {
      multiDragStartRef.current = null;
    }

    // Initialize movement path tracking in combat
    if (inCombat) {
      const initPath = (tid: string, startX: number, startY: number) => {
        // Reset any active fade for this token
        if (pathFadeTimers.current[tid]) clearTimeout(pathFadeTimers.current[tid]);
        delete pathFadeTimers.current[tid];
        delete pathFadeStartRef.current[tid];
        setPathFadeProgress(prev => { const n = { ...prev }; delete n[tid]; return n; });

        const existing = movementPaths[tid];
        if (existing) {
          // Accumulate: continue from existing path
          activePathRef.current[tid] = {
            points: [...existing.points],
            totalDistancePx: existing.totalDistancePx,
            lastSampleX: startX,
            lastSampleY: startY,
          };
          setMovementPaths(prev => ({
            ...prev,
            [tid]: {
              ...prev[tid],
              isDragging: true,
              segments: [...(prev[tid]?.segments || []), { startIndex: existing.points.length, startPos: { x: startX, y: startY } }],
            },
          }));
        } else {
          // Fresh path
          activePathRef.current[tid] = {
            points: [startX, startY],
            totalDistancePx: 0,
            lastSampleX: startX,
            lastSampleY: startY,
          };
          setMovementPaths(prev => ({
            ...prev,
            [tid]: {
              tokenId: tid,
              startPos: { x: startX, y: startY },
              points: [startX, startY],
              totalDistancePx: 0,
              isDragging: true,
              segments: [{ startIndex: 0, startPos: { x: startX, y: startY } }],
            },
          }));
        }
      };

      const token = tokens.find(t => t.id === id);
      if (token) initPath(id, token.x, token.y);

      if (multiDragStartRef.current) {
        Object.entries(multiDragStartRef.current.othersStart).forEach(([tid, start]) => {
          initPath(tid, start.x, start.y);
        });
      }
    }
  };

  // Clamp a token center to within the map image bounds, so the token can't
  // be dragged off into the black margins. Player view only — the DM may
  // legitimately want to stage tokens off-map.
  const clampToMapBounds = (p: { x: number; y: number }, radius: number) => {
    if (!isPlayerView || !loadedImage) return p;
    return {
      x: Math.max(radius, Math.min(loadedImage.width - radius, p.x)),
      y: Math.max(radius, Math.min(loadedImage.height - radius, p.y)),
    };
  };

  const handleDragMove = (id: string, e: any) => {
    let pos = { x: e.target.x(), y: e.target.y() };

    // Wall collision: constrain token position against blocking segments
    const shouldCollide = (isPlayerView || wallCollisionEnabled) && blockingSegments.length > 0;
    const radius = dragTokenRadiusRef.current[id] ?? 20;
    if (shouldCollide) {
      const prevPos = lastValidPosRef.current[id] ?? pos;
      pos = constrainPositionAgainstWalls(pos, prevPos, radius, blockingSegments);
    }
    // Keep the token on the map (player view only)
    pos = clampToMapBounds(pos, radius);
    e.target.x(pos.x);
    e.target.y(pos.y);
    lastValidPosRef.current[id] = pos;

    draggingPositionsRef.current[id] = pos;

    // Move all other selected tokens by the same delta
    const multi = multiDragStartRef.current;
    if (multi && multi.draggedId === id) {
      const dx = pos.x - multi.draggedStart.x;
      const dy = pos.y - multi.draggedStart.y;
      Object.entries(multi.othersStart).forEach(([tid, start]) => {
        let otherPos = { x: start.x + dx, y: start.y + dy };
        const otherRadius = dragTokenRadiusRef.current[tid] ?? 20;
        if (shouldCollide) {
          const otherPrev = lastValidPosRef.current[tid] ?? otherPos;
          otherPos = constrainPositionAgainstWalls(otherPos, otherPrev, otherRadius, blockingSegments);
        }
        otherPos = clampToMapBounds(otherPos, otherRadius);
        lastValidPosRef.current[tid] = otherPos;
        draggingPositionsRef.current[tid] = otherPos;
      });
    }

    // Sample movement path points (ref-only, no React render)
    if (inCombat) {
      const SAMPLE_THRESHOLD_PX = 8;
      const samplePoint = (tid: string, px: number, py: number) => {
        const ap = activePathRef.current[tid];
        if (!ap) return;
        const dx = px - ap.lastSampleX;
        const dy = py - ap.lastSampleY;
        const segDist = Math.sqrt(dx * dx + dy * dy);
        if (segDist >= SAMPLE_THRESHOLD_PX) {
          const cost = difficultTerrain.length
            ? terrainMoveCost((ap.lastSampleX + px) / 2, (ap.lastSampleY + py) / 2)
            : 1;
          ap.points.push(px, py);
          ap.totalDistancePx += segDist * cost;
          ap.lastSampleX = px;
          ap.lastSampleY = py;
        }
      };
      samplePoint(id, pos.x, pos.y);
      if (multi && multi.draggedId === id) {
        Object.keys(multi.othersStart).forEach(tid => {
          const corrected = draggingPositionsRef.current[tid];
          if (corrected) samplePoint(tid, corrected.x, corrected.y);
        });
      }
    }

    const now = Date.now();
    if (now - lastBroadcastRef.current < BROADCAST_INTERVAL) return;
    lastBroadcastRef.current = now;

    // Build live positions for fog/visibility and IPC
    const liveUpdates: Record<string, { x: number; y: number }> = { [id]: pos };
    const multi2 = multiDragStartRef.current;
    if (multi2 && multi2.draggedId === id) {
      Object.keys(multi2.othersStart).forEach(tid => {
        const corrected = draggingPositionsRef.current[tid];
        if (corrected) liveUpdates[tid] = corrected;
      });
    }
    setLivePlayerPos(prev => ({ ...prev, ...liveUpdates }));

    // Sync movement path ref -> state (throttled at ~7fps — cosmetic during drag)
    if (inCombat && now - lastPathSyncRef.current >= PATH_SYNC_INTERVAL) {
      lastPathSyncRef.current = now;
      setMovementPaths(prev => {
        const next = { ...prev };
        Object.entries(activePathRef.current).forEach(([tid, ap]) => {
          if (next[tid]) {
            next[tid] = { ...next[tid], points: [...ap.points], totalDistancePx: ap.totalDistancePx };
          }
        });
        return next;
      });
    }

    if (!isPlayerView) {
      const updatedTokens = tokens.map(t => liveUpdates[t.id] ? { ...t, ...liveUpdates[t.id] } : t);
      if (window.electronAPI?.sendDMTokenUpdate) {
        window.electronAPI.sendDMTokenUpdate(updatedTokens);
      }
    }
  };

  const handleDragEnd = (id: string, e: any) => {
    let finalPos = { x: e.target.x(), y: e.target.y() };

    // Apply wall collision to the final position
    const shouldCollide = (isPlayerView || wallCollisionEnabled) && blockingSegments.length > 0;
    const radius = dragTokenRadiusRef.current[id] ?? 20;
    if (shouldCollide) {
      const prevPos = lastValidPosRef.current[id] ?? finalPos;
      finalPos = constrainPositionAgainstWalls(finalPos, prevPos, radius, blockingSegments);
    }
    // Keep the token on the map (player view only)
    finalPos = clampToMapBounds(finalPos, radius);
    e.target.x(finalPos.x);
    e.target.y(finalPos.y);

    const multi = multiDragStartRef.current;

    // ── Micro-drag cancellation (player view only) ──
    // If the finger barely moved, treat it as a tap rather than a drag so
    // double-tap detection still works despite minor touch wobble.
    const DRAG_THRESHOLD_PX = 8;
    if (isPlayerView) {
      const origin = tokenDragOriginRef.current[id];
      if (origin) {
        const dx = finalPos.x - origin.x;
        const dy = finalPos.y - origin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < DRAG_THRESHOLD_PX) {
          // Snap back to the original position
          e.target.x(origin.x);
          e.target.y(origin.y);
          delete tokenDragOriginRef.current[id];
          delete lastValidPosRef.current[id];
          delete dragTokenRadiusRef.current[id];
          setLivePlayerPos(prev => { const next = { ...prev }; delete next[id]; return next; });
          isTokenDraggingRef.current = false;
          onDragStatusChange?.(false);
          // Register as a tap so the second tap can complete the double-tap
          const token = tokens.find(t => t.id === id);
          if (token && onPlayerTokenDoubleTap && token.type === 'player') {
            const now = Date.now();
            const last = lastTapRef.current;
            if (last && last.tokenId === id && now - last.time < 600) {
              lastTapRef.current = null;
              const rect = containerRef.current?.getBoundingClientRect();
              if (rect) {
                const screenX = rect.left + token.x * stageScale + stagePos.x;
                const screenY = rect.top + token.y * stageScale + stagePos.y;
                onPlayerTokenDoubleTap(id, screenX, screenY);
              }
            } else {
              lastTapRef.current = { tokenId: id, time: now };
            }
          }
          return;
        }
        delete tokenDragOriginRef.current[id];
      }
    }

    let updatedTokens;
    if (multi && multi.draggedId === id) {
      updatedTokens = tokens.map(t => {
        if (t.id === id) return { ...t, ...finalPos };
        if (multi.othersStart[t.id]) {
          // Use collision-corrected position from draggingPositionsRef
          const corrected = draggingPositionsRef.current[t.id];
          if (corrected) return { ...t, x: corrected.x, y: corrected.y };
          const dx = finalPos.x - multi.draggedStart.x;
          const dy = finalPos.y - multi.draggedStart.y;
          return { ...t, x: multi.othersStart[t.id].x + dx, y: multi.othersStart[t.id].y + dy };
        }
        return t;
      });
      // Clear live overrides and collision refs for all dragged tokens
      setLivePlayerPos(prev => {
        const next = { ...prev };
        delete next[id];
        Object.keys(multi.othersStart).forEach(tid => {
          delete next[tid];
          delete lastValidPosRef.current[tid];
          delete dragTokenRadiusRef.current[tid];
        });
        return next;
      });
      multiDragStartRef.current = null;
    } else {
      delete draggingPositionsRef.current[id];
      setLivePlayerPos(prev => { const next = { ...prev }; delete next[id]; return next; });
      updatedTokens = tokens.map(t => t.id === id ? { ...t, ...finalPos } : t);
    }
    // Clean up collision refs for the primary dragged token
    delete lastValidPosRef.current[id];
    delete dragTokenRadiusRef.current[id];

    // Finalize movement paths
    if (inCombat) {
      const finalizeToken = (tid: string, fx: number, fy: number) => {
        const ap = activePathRef.current[tid];
        if (!ap) return;
        const dx = fx - ap.lastSampleX;
        const dy = fy - ap.lastSampleY;
        const segDist = Math.sqrt(dx * dx + dy * dy);
        if (segDist > 0) {
          const cost = difficultTerrain.length
            ? terrainMoveCost((ap.lastSampleX + fx) / 2, (ap.lastSampleY + fy) / 2)
            : 1;
          ap.points.push(fx, fy);
          ap.totalDistancePx += segDist * cost;
        }
      };
      finalizeToken(id, finalPos.x, finalPos.y);
      if (multi) {
        Object.keys(multi.othersStart).forEach(tid => {
          const corrected = draggingPositionsRef.current[tid];
          if (corrected) finalizeToken(tid, corrected.x, corrected.y);
        });
      }

      // Capture the current paths synchronously before the updater enqueues
      const capturedPaths = { ...activePathRef.current };

      // Commit final path state
      setMovementPaths(prev => {
        const next = { ...prev };
        Object.keys(capturedPaths).forEach(tid => {
          const ap = capturedPaths[tid];
          if (next[tid] && ap) {
            next[tid] = {
              ...next[tid],
              points: [...ap.points],
              totalDistancePx: ap.totalDistancePx,
              isDragging: false,
            };
          }
        });
        return next;
      });
      activePathRef.current = {};

      // Schedule fade-out for each finalized path (reset timer if they drag again)
      const tokenIds = Object.keys(capturedPaths);
      tokenIds.forEach(tid => {
        // Clear any existing fade / timer for this token
        if (pathFadeTimers.current[tid]) clearTimeout(pathFadeTimers.current[tid]);
        delete pathFadeStartRef.current[tid];
        setPathFadeProgress(prev => { const n = { ...prev }; delete n[tid]; return n; });
        // Start 5s countdown
        pathFadeTimers.current[tid] = setTimeout(() => {
          pathFadeStartRef.current[tid] = performance.now();
          // Trigger the animation loop by forcing a state update
          setPathFadeProgress(prev => ({ ...prev, [tid]: 0 }));
        }, PATH_FADE_DELAY);
      });
    }

    isTokenDraggingRef.current = false;
    onDragStatusChange?.(false);

    // Player-side IPC is handled by onTokensChange → PlayerScreen.handleTokensChange,
    // which merges this floor's tokens with the other floors' before sending.
    // Sending the floor-filtered array from here would momentarily wipe the
    // other floors' tokens on the DM screen (collapsing its split view).
    if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
      window.electronAPI.sendDMTokenUpdate(updatedTokens);
    }

    onTokensChange(updatedTokens);

    // Check if token landed in a transition zone
    const currentFloor = floors?.find(f => f.id === activeFloorId);
    const zones = currentFloor?.transitionZones || [];
    if (zones.length > 0) {
      const droppedToken = updatedTokens.find(t => t.id === id);
      if (droppedToken) {
        const hitZone = zones.find(z =>
          z.points && z.points.length >= 6
            ? pointInFlatPolygon(droppedToken.x, droppedToken.y, z.points)
            : (droppedToken.x >= z.rect.x && droppedToken.x <= z.rect.x + z.rect.width &&
               droppedToken.y >= z.rect.y && droppedToken.y <= z.rect.y + z.rect.height)
        );
        if (hitZone && !hitZone.locked) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const screenX = rect.left + droppedToken.x * stageScale + stagePos.x;
            const screenY = rect.top + droppedToken.y * stageScale + stagePos.y;
            setTransitionPopup({ tokenId: id, zone: hitZone, screenX, screenY });
          }
        }
      }
    }
  };

  // Undo a token's last movement segment (or all movement if only one segment)
  const undoMovement = (tokenId: string) => {
    const path = movementPaths[tokenId];
    if (!path || path.isDragging) return;

    // Clear fade state for this token
    if (pathFadeTimers.current[tokenId]) clearTimeout(pathFadeTimers.current[tokenId]);
    delete pathFadeTimers.current[tokenId];
    delete pathFadeStartRef.current[tokenId];
    setPathFadeProgress(prev => { const n = { ...prev }; delete n[tokenId]; return n; });

    if (path.segments.length > 1) {
      // Pop last segment, revert to that segment's start position
      const lastSeg = path.segments[path.segments.length - 1];
      const truncatedPoints = path.points.slice(0, lastSeg.startIndex);
      // Recalculate distance from remaining points
      let dist = 0;
      for (let i = 2; i < truncatedPoints.length; i += 2) {
        const dx = truncatedPoints[i] - truncatedPoints[i - 2];
        const dy = truncatedPoints[i + 1] - truncatedPoints[i - 1];
        dist += Math.sqrt(dx * dx + dy * dy);
      }
      setMovementPaths(prev => ({
        ...prev,
        [tokenId]: {
          ...prev[tokenId],
          points: truncatedPoints,
          totalDistancePx: dist,
          segments: prev[tokenId].segments.slice(0, -1),
        },
      }));
      // Move token back
      const updatedTokens = tokens.map(t =>
        t.id === tokenId ? { ...t, x: lastSeg.startPos.x, y: lastSeg.startPos.y } : t
      );
      onTokensChange(updatedTokens);
      if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
        window.electronAPI.sendDMTokenUpdate(updatedTokens);
      }
    } else {
      // Only one segment — revert to original start and remove path entirely
      const updatedTokens = tokens.map(t =>
        t.id === tokenId ? { ...t, x: path.startPos.x, y: path.startPos.y } : t
      );
      onTokensChange(updatedTokens);
      if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
        window.electronAPI.sendDMTokenUpdate(updatedTokens);
      }
      setMovementPaths(prev => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
    }
  };

  // Expose undo movement to external code (e.g. PlayerDrawer)
  if (undoMovementRef) {
    undoMovementRef.current = undoMovement;
  }

  const handleNoteDragEnd = (id: string, e: any) => {
    onMapNotesChange(mapNotes.map(n =>
      n.id === id ? { ...n, x: e.target.x(), y: e.target.y() } : n
    ));
  };

  const addToken = (type: Token['type']) => {
    const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#059669' };
    const newToken: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type}`,
      type,
      x: 50,
      y: 50,
      color: colors[type],
      floorId: activeFloorId || undefined,
    };
    onTokensChange([...tokens, newToken]);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    // While drawing a wall, right-click commits the current wall (same as Enter)
    // and starts a fresh one without leaving paint mode.
    if (wallPainting) {
      // Right-click commits any completed wall and exits paint mode.
      commitCurrentWall();
      onStopWallPainting?.();
      return;
    }
    // While painting difficult terrain, right-click commits any completed area and
    // exits paint mode.
    if (difficultTerrainPainting) {
      commitCurrentTerrain();
      onDifficultTerrainPaintCancel?.();
      return;
    }
    // While painting a dark zone, right-click commits any completed area and exits.
    if (darkZonePainting) {
      commitCurrentDark();
      onDarkZonePaintCancel?.();
      return;
    }
    // While painting a sound zone, right-click commits any completed area and exits.
    if (zonePainting) {
      commitCurrentZone();
      onSoundZonePaintCancel?.();
      return;
    }
    // While drawing a transition zone, right-click finishes the current polygon (3+
    // points) and advances the flow; with too few points it cancels the whole flow.
    if (transitionZoneMode) {
      if (tzPaintPoints.length >= 6) {
        commitCurrentTransition();
      } else {
        if (pendingPairData) onSwitchFloor?.(pendingPairData.sourceFloorId);
        setPendingPairData(null);
        setTransitionZoneMode(false);
        clearTzPaint();
      }
      return;
    }
    // Other map-editing/drawing modes: suppress the right-click menu so the
    // user can right-click freely (e.g. to cancel) without it popping up.
    if (wallErasing || darkZoneErasing || terrainErasing || soundZoneErasing || drawingMode !== 'off') {
      return;
    }
    setTokenContextMenu(null);
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    // Coordinates relative to the stage's draggable content
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(pointerPosition);

    setContextMenu({
      x: pos.x,
      y: pos.y,
      stageX: e.evt.clientX,
      stageY: e.evt.clientY,
      clientY: e.evt.clientY,
      view: 'root'
    });
    setMonsterSearch('');
    setSelectedMonster(null);
    setMonsterQuantity(1);
    setMonsterSizeChoice('Medium');
    setActiveSubmenu(null);
  };

  const handleTokenContextMenu = (e: any, tokenId: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true; // Stop propagation to stage
    setContextMenu(null);
    setConditionSubmenuOpen(false);

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    setTokenContextMenu({
      x: pointerPosition.x,
      y: pointerPosition.y,
      clientY: e.evt.clientY,
      tokenId
    });
  };

  const toggleTokenVisibility = (tokenId: string) => {
    onTokensChange(tokens.map(t =>
      t.id === tokenId ? { ...t, hidden: !t.hidden } : t
    ));
    setTokenContextMenu(null);
  };

  const toggleTokenInvisible = (tokenId: string) => {
    onTokensChange(tokens.map(t =>
      t.id === tokenId ? { ...t, invisible: !t.invisible } : t
    ));
    setTokenContextMenu(null);
  };

  const deleteToken = (tokenId: string) => {
    onTokensChange(tokens.filter(t => t.id !== tokenId));
    setSelectedTokenIds(selectedTokenIds.filter(id => id !== tokenId));
    if (selectedTokenId === tokenId) {
      setSelectedTokenId(null);
    }
    setTokenContextMenu(null);
    // Clean up movement path if any
    setMovementPaths(prev => {
      const next = { ...prev };
      delete next[tokenId];
      return next;
    });
  };

  const handleCombatantSelect = (combatant: Combatant, type: Token['type']) => {
    if (!contextMenu) return;

    const existingToken = tokens.find(t => t.combatantId === combatant.id);

    if (existingToken) {
      // Move existing token
      onTokensChange(tokens.map(t =>
        t.id === existingToken.id ? { ...t, x: contextMenu.x, y: contextMenu.y, avatar: combatant.avatar, color: combatant.color || t.color } : t
      ));
    } else {
      // Add new token
      const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#059669' };
      const newToken: Token = {
        id: Math.random().toString(36).substr(2, 9),
        combatantId: combatant.id,
        name: combatant.name,
        type,
        x: contextMenu.x,
        y: contextMenu.y,
        color: combatant.color || colors[type],
        avatar: combatant.avatar,
        floorId: activeFloorId || undefined,
        ...(combatant.size ? { size: combatant.size as Token['size'] } : {}),
      };
      onTokensChange([...tokens, newToken]);
    }
    setContextMenu(null);
  };

  /** Place an Extra as a bare Token (no Combatant) at the right-click point with the chosen size. */
  const handleExtraSelect = (extra: Extra) => {
    if (!contextMenu) return;
    const newToken: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name: extra.name,
      type: 'npc',
      x: contextMenu.x,
      y: contextMenu.y,
      color: '#94a3b8', // slate — neutral, distinct from npc green / enemy red
      avatar: extraImageUrl(extra.filename),
      size: extraSizeChoice,
      floorId: activeFloorId || undefined,
      isExtra: true,
      extraId: extra.id,
    };
    onTokensChange([...tokens, newToken]);
    setContextMenu(null);
  };

  const saveNote = () => {
    if (!contextMenu) return;
    if (noteDraft.type === 'image') {
      if (!noteDraft.imageData) return;
    } else if (noteDraft.type === 'sound') {
      if (!noteDraft.soundId) return;
    } else if (!noteDraft.content.trim()) {
      return;
    }

    const newNote: MapNote = {
      id: Math.random().toString(36).substr(2, 9),
      type: noteDraft.type,
      content: noteDraft.content,
      x: contextMenu.x,
      y: contextMenu.y,
      ...(noteDraft.type === 'image' && noteDraft.imageData ? { imageData: noteDraft.imageData, imageRotation: 0 } : {}),
      ...(noteDraft.type === 'sound' && noteDraft.soundId ? { soundId: noteDraft.soundId } : {}),
    };

    onMapNotesChange([...mapNotes, newNote]);
    setContextMenu(null);
    setNoteDraft({ type: 'quote', content: '' });
  };

  const handleNoteImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setNoteDraft(prev => ({ ...prev, imageData: typeof reader.result === 'string' ? reader.result : undefined }));
    };
    reader.readAsDataURL(file);
  };

  const saveViewpoint = () => {
    if (!contextMenu) return;
    if (contextMenu.viewpointId) {
      onViewpointsChange?.((viewpoints ?? []).map(vp =>
        vp.id === contextMenu.viewpointId
          ? { ...vp, zoomScale: stageScale * (viewpointDraft.zoomPercent / 100) }
          : vp
      ));
    } else {
      const newViewpoint: Viewpoint = {
        id: Math.random().toString(36).substr(2, 9),
        x: contextMenu.x,
        y: contextMenu.y,
        zoomScale: stageScale * (viewpointDraft.zoomPercent / 100),
      };
      onViewpointsChange?.([...(viewpoints ?? []), newViewpoint]);
    }
    setContextMenu(null);
    setViewpointDraft({ zoomPercent: 25 });
  };

  /** Smooth zoom animation using RAF — 500ms ease-in-out */
  const animateZoom = (targetScale: number, targetX: number, targetY: number, onComplete?: () => void) => {
    if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
    const startScale = stageScale;
    const startX = stagePos.x;
    const startY = stagePos.y;
    const startTime = performance.now();
    const DURATION = 500;
    const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const frame = (now: number) => {
      const t = Math.min(1, (now - startTime) / DURATION);
      const e = easeInOut(t);
      setStageScale(startScale + (targetScale - startScale) * e);
      setStagePos({
        x: startX + (targetX - startX) * e,
        y: startY + (targetY - startY) * e,
      });
      if (t < 1) {
        zoomAnimRef.current = requestAnimationFrame(frame);
      } else {
        zoomAnimRef.current = null;
        onComplete?.();
      }
    };
    zoomAnimRef.current = requestAnimationFrame(frame);
  };

  const handleViewpointClick = (vp: Viewpoint) => {
    if (!isPlayerView) return;
    if (!viewpointProximity.has(vp.id)) return;
    if (activeViewpointId === vp.id) {
      // Toggle off: return to saved position
      const ret = viewpointReturnRef.current;
      if (ret) {
        animateZoom(ret.scale, ret.x, ret.y, () => {
          setActiveViewpointId(null);
          viewpointReturnRef.current = null;
        });
      } else {
        setActiveViewpointId(null);
      }
    } else {
      // Toggle on: save current state and zoom to viewpoint
      viewpointReturnRef.current = { scale: stageScale, x: stagePos.x, y: stagePos.y };
      const targetScale = vp.zoomScale;
      const targetX = dimensions.width / 2 - vp.x * targetScale;
      const targetY = dimensions.height / 2 - vp.y * targetScale;
      setActiveViewpointId(vp.id);
      animateZoom(targetScale, targetX, targetY);
    }
  };

  const handleViewpointDragEnd = (vpId: string, e: any) => {
    const pos = { x: e.target.x(), y: e.target.y() };
    onViewpointsChange?.((viewpoints ?? []).map(v => v.id === vpId ? { ...v, ...pos } : v));
  };

  const [isPanning, setIsPanning] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    if (!panToNote) return;
    setStagePos({
      x: dimensions.width / 2 - panToNote.x * stageScale,
      y: dimensions.height / 2 - panToNote.y * stageScale,
    });
  }, [panToNote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isPlayerView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape cancels AoE casting or dismisses placed AoE
      if (e.code === 'Escape') {
        if (placedAoe) { setPlacedAoe(null); onCastingDismissed?.(); return; }
        if (castingSpell) { setCastingSpell(null); setCastingMousePos(null); onCastingDismissed?.(); return; }
        if (editingWall) { setEditingWall(null); setPlacingSpell(null); onCastingDismissed?.(); return; }
        if (editingRing) { setEditingRing(null); setPlacingSpell(null); onCastingDismissed?.(); return; }
        if (targetingEnlargeReduce) { setTargetingEnlargeReduce(null); onCastingDismissed?.(); return; }
      }

      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;

      if ((e.code === 'Backspace' || e.code === 'Delete') && !isInput) {
        if (selectedTokenIds.length > 0) {
          e.preventDefault();
          onTokensChange(tokens.filter(t => !selectedTokenIds.includes(t.id)));
          setSelectedTokenIds([]);
          if (selectedTokenId && selectedTokenIds.includes(selectedTokenId)) {
            setSelectedTokenId(null);
          }
          setTokenContextMenu(null);
          return;
        }
      }

      if (e.code !== 'Space') return;
      if (isInput) return;
      e.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
      setIsPanning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isPlayerView, castingSpell, placedAoe, tokens, selectedTokenIds, onTokensChange, setSelectedTokenIds, selectedTokenId, setSelectedTokenId]);

  // Two-finger pan for player view
  const twoFingerPanRef = useRef<{ midX: number; midY: number } | null>(null);
  // Tracks whether any token is mid-drag — prevents accidental pan start from a stray second touch
  const isTokenDraggingRef = useRef(false);
  // Tracks whether a token tap consumed the current touch — prevents clearing targets on token taps
  const tokenTapConsumedRef = useRef(false);

  const handleTouchStart = (e: any) => {
    // Drawing mode intercepts ALL touches first — same precedence as measure mode.
    if (drawingMode !== 'off' && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      if (drawingMode === 'eraser') {
        // Erase under the initial touch
        const erased = eraseAt(drawings, pos.x, pos.y, ERASER_RADIUS_PX);
        if (erased.changed) onDrawingsChange?.(erased.next);
        const eErased = eraseAt(ephemeralStrokes, pos.x, pos.y, ERASER_RADIUS_PX);
        if (eErased.changed) setEphemeralStrokes(eErased.next);
      } else {
        const id = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        sessionStrokeIdsRef.current.add(id);
        setCurrentStroke({
          id, color: drawingColor, ownerId: drawingOwnerId,
          width: STROKE_WIDTH_PX, points: [pos.x, pos.y],
        });
      }
      e.evt.preventDefault();
      return;
    }

    // Measure mode intercepts ALL touches first — must come before the drag guard
    // so that touching your own token doesn't start a drag instead of measuring.
    if (isMeasuringActive && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setMeasureStart(pos);
      setMeasureEnd(pos);
      e.evt.preventDefault();
      return;
    }

    if (isTokenDraggingRef.current) return;

    // AoE casting on player view: track touch position for preview
    if (castingSpell && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setCastingMousePos(pos);
      e.evt.preventDefault();
      return;
    }

    if (e.evt.touches.length === 2) {
      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      twoFingerPanRef.current = {
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      };
      e.evt.preventDefault();
    }
  };

  const handleTouchMove = (e: any) => {
    // Drawing mode update — runs before any other touch logic
    if (drawingMode !== 'off' && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      if (drawingMode === 'eraser') {
        const erased = eraseAt(drawings, pos.x, pos.y, ERASER_RADIUS_PX);
        if (erased.changed) onDrawingsChange?.(erased.next);
        const eErased = eraseAt(ephemeralStrokes, pos.x, pos.y, ERASER_RADIUS_PX);
        if (eErased.changed) setEphemeralStrokes(eErased.next);
      } else if (currentStroke) {
        // Append point only if it's far enough from the previous point — keeps the
        // stroke smooth without exploding the points array.
        const last = currentStroke.points;
        const lx = last[last.length - 2], ly = last[last.length - 1];
        const dx = pos.x - lx, dy = pos.y - ly;
        if (dx * dx + dy * dy > 4) {
          setCurrentStroke({ ...currentStroke, points: [...last, pos.x, pos.y] });
        }
      }
      e.evt.preventDefault();
      return;
    }

    if (isTokenDraggingRef.current) return;

    // AoE casting on player view: update preview position as finger moves
    if (castingSpell && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setCastingMousePos(pos);
      e.evt.preventDefault();
      return;
    }

    // Measure mode: update end point as finger drags
    if (isMeasuringActive && measureStart && e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setMeasureEnd(pos);
      e.evt.preventDefault();
      return;
    }

    if (e.evt.touches.length === 2 && twoFingerPanRef.current) {
      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - twoFingerPanRef.current.midX;
      const dy = midY - twoFingerPanRef.current.midY;
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      twoFingerPanRef.current = { midX, midY };
      e.evt.preventDefault();
    }
  };

  const handleTouchEnd = (e: any) => {
    // Drawing mode: finish the in-progress stroke.
    if (drawingMode !== 'off') {
      if (currentStroke && currentStroke.points.length >= 2) {
        if (drawingMode === 'persistent') {
          onDrawingsChange?.([...drawings, currentStroke]);
        } else if (drawingMode === 'ephemeral') {
          setEphemeralStrokes(prev => [...prev, currentStroke]);
          scheduleEphemeralFade(currentStroke.id);
          // Broadcast ephemeral stroke to the other window
          try {
            window.electronAPI?.sendEphemeralStroke?.({
              ...currentStroke,
              floorId: activeFloorId || '',
            } as any);
          } catch (_e) { /* */ }
        }
      }
      setCurrentStroke(null);
      e.evt.preventDefault();
      return;
    }

    // Enlarge/Reduce token targeting on touch: tap a token to select it as the target
    if (targetingEnlargeReduce && e.evt.changedTouches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      const floorTokens = tokens.filter(t => !activeFloorId || !t.floorId || t.floorId === activeFloorId);
      let nearest: Token | null = null;
      let nearestDist = tokenRadius * 4;
      for (const t of floorTokens) {
        const dx = t.x - pos.x;
        const dy = t.y - pos.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = t; }
      }
      if (nearest) {
        setTargetingEnlargeReduce(prev => prev ? { ...prev, targetTokenId: nearest!.id } : null);
        setSelectedTokenId(nearest.id);
      }
      e.evt.preventDefault();
      return;
    }

    // Wall-shape spells use their own preview — skip tap-to-place
    if (placingSpell && placingSpell.shapeType === 'wall') {
      return;
    }
    // Spell marker placement on touch (player view)
    if (placingSpell && e.evt.changedTouches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);

      // Summon creature: create a Token instead of a SpellMarker
      if (placingSpell.summonData) {
        const sd = placingSpell.summonData;
        const uniqueId = Math.random().toString(36).substr(2, 9);
        const combatantId = sd.monster ? `sc-${uniqueId}` : undefined;
        const newToken: Token = {
          id: uniqueId,
          name: sd.creatureName,
          type: 'player',
          x: pos.x,
          y: pos.y,
          color: sd.playerColor,
          floorId: activeFloorId || undefined,
          isSummon: true,
          summonSpellName: sd.spellName,
          summonedBy: sd.casterId,
          controlledBy: sd.casterId,
          size: sd.size,
          ...(combatantId ? { combatantId } : {}),
          ...(sd.avatar ? { avatar: sd.avatar } : {}),
          ...(sd.illusory ? { illusory: true } : {}),
        };
        if (sd.monster && combatantId && onAddSummonCombatant) {
          const m = sd.monster;
          const dvMatch = m.senses?.match(/darkvision\s+(\d+)/i);
          const darkvision = dvMatch ? parseInt(dvMatch[1], 10) : 0;
          const combatant: Combatant = {
            id: combatantId,
            name: sd.creatureName,
            hp: m.hp,
            maxHp: m.hp,
            ac: m.ac,
            initiative: 0,
            type: 'npc',
            description: m.description,
            stats: m.stats,
            actions: m.actions,
            avatar: m.avatar,
            speedText: m.speed,
            cr: m.cr,
            specialAbilities: m.specialAbilities,
            legendaryActions: m.legendaryActions,
            reactions: m.reactions,
            saves: m.saves,
            skills: m.skills,
            immunities: m.immunities,
            resistances: m.resistances,
            vulnerabilities: m.vulnerabilities,
            conditionImmunities: m.conditionImmunities,
            senses: m.senses,
            languages: m.languages,
            creatureType: m.type,
            darkvision,
            summonedBy: sd.casterId,
            summonSpellName: sd.spellName,
          };
          onAddSummonCombatant(combatant, uniqueId);
        }
        const updatedTokens = [...tokens, newToken];
        onTokensChange(updatedTokens);
        setPlacingSpell(null);
        onCastingDismissed?.();
        e.evt.preventDefault();
        return;
      }

      const marker: SpellMarker = {
        id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        spellName: placingSpell.name,
        school: placingSpell.school,
        casterId: placingSpell.casterId,
        x: pos.x,
        y: pos.y,
        effectRadius: placingSpell.effectRadius,
        aoeType: placingSpell.aoeType,
        aoeSize: placingSpell.aoeSize,
        visibleToPlayers: true,
        floorId: activeFloorId || undefined,
        // Pure light sources have effectRadius but no AoE shape
        lightSource: !!placingSpell.effectRadius && !placingSpell.aoeType,
      };
      const updated = [...spellMarkers, marker];
      onSpellMarkersChange?.(updated);
      // Immediately notify the other screen via IPC
      try {
        if (isPlayerView) {
          window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
        } else {
          window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
        }
      } catch (_e) { /* IPC not available */ }
      setPlacingSpell(null);
      e.evt.preventDefault();
      return;
    }

    // AoE casting on player view: place AoE on finger lift
    if (castingSpell && e.evt.changedTouches.length === 1 && castingMousePos) {
      const angle = Math.atan2(
        castingMousePos.y - castingSpell.originY,
        castingMousePos.x - castingSpell.originX
      ) * (180 / Math.PI);
      setPlacedAoe({
        name: castingSpell.name,
        aoeType: castingSpell.aoeType,
        aoeSize: castingSpell.aoeSize,
        x: castingMousePos.x,
        y: castingMousePos.y,
        originX: castingSpell.originX,
        originY: castingSpell.originY,
        angle,
        casterRadiusPx: castingSpell.casterRadiusPx,
        selfOrigin: castingSpell.selfOrigin,
        saveAbility: castingSpell.saveAbility,
        saveDc: castingSpell.saveDc,
        halfDamageOnSave: castingSpell.halfDamageOnSave,
        spellDesc: castingSpell.spellDesc,
        damageType: castingSpell.damageType,
        mapInteraction: castingSpell.mapInteraction,
        saveEffect: castingSpell.saveEffect,
        condition: castingSpell.condition,
        casterId: castingSpell.casterId,
      });
      setCastingSpell(null);
      setCastingMousePos(null);
      return;
    }

    if (e.evt.touches.length < 2) {
      // If this was a two-finger pan ending, just clear the ref
      if (twoFingerPanRef.current) {
        twoFingerPanRef.current = null;
        return;
      }
      // Single-finger tap on empty space: clear targets
      // Use a microtask so Konva's onTap/onClick fire first and set tokenTapConsumedRef
      if (e.evt.changedTouches.length === 1 && !isTokenDraggingRef.current) {
        Promise.resolve().then(() => {
          if (!tokenTapConsumedRef.current && onClearTargets && targetedCombatantIds && targetedCombatantIds.size > 0) {
            onClearTargets();
          }
          tokenTapConsumedRef.current = false;
        });
      }
    }
  };

  const getCanvasPos = (stage: any) => {
    const pos = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  };

  const handleStageMouseDown = (e: any) => {
    // Ping mode: next click drops a pulse, then exits the mode.
    if (pingMode && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
      const id = `ping-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setPings(prev => [...prev, { id, x: pos.x, y: pos.y, color: pingMode.color, startTime: Date.now() }]);
      onPingDrop?.({ x: pos.x, y: pos.y, color: pingMode.color });
      setPingMode(null);
      return;
    }

    // Transition zones are drawn as click-to-draw polygons (handled in the click
    // handler), so swallow the mousedown here to avoid starting a marquee/pan.
    if (transitionZoneMode && e.evt.button === 0 && !spaceHeldRef.current) {
      return;
    }

    // Measure mode: mouse down sets start point (desktop support)
    if (isMeasuringActive && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
      setMeasureStart(pos);
      setMeasureEnd(pos);
      return;
    }

    // Drawing mode: mouse down (desktop fallback)
    if (drawingMode !== 'off' && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
      if (drawingMode === 'eraser') {
        const erased = eraseAt(drawings, pos.x, pos.y, ERASER_RADIUS_PX);
        if (erased.changed) onDrawingsChange?.(erased.next);
        const eErased = eraseAt(ephemeralStrokes, pos.x, pos.y, ERASER_RADIUS_PX);
        if (eErased.changed) setEphemeralStrokes(eErased.next);
      } else {
        const id = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        sessionStrokeIdsRef.current.add(id);
        setCurrentStroke({
          id, color: drawingColor, ownerId: drawingOwnerId,
          width: STROKE_WIDTH_PX, points: [pos.x, pos.y],
        });
      }
      return;
    }

    // Enlarge/Reduce token targeting: click a token to select it as the target
    if (targetingEnlargeReduce && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
      const floorTokens = tokens.filter(t => !activeFloorId || !t.floorId || t.floorId === activeFloorId);
      let nearest: Token | null = null;
      let nearestDist = tokenRadius * 4;
      for (const t of floorTokens) {
        const dx = t.x - pos.x;
        const dy = t.y - pos.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = t; }
      }
      if (nearest) {
        setTargetingEnlargeReduce(prev => prev ? { ...prev, targetTokenId: nearest!.id } : null);
        setSelectedTokenId(nearest.id);
      }
      return;
    }

    // Spell marker placement: click to place
    // Wall/ring-shape spells use dedicated previews and should ignore the click-to-place flow
    if (placingSpell && (placingSpell.shapeType === 'wall' || (placingSpell.shapeType as any) === 'ring')) {
      return;
    }
    if (placingSpell && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());

      // Summon creature: create a Token instead of a SpellMarker
      if (placingSpell.summonData) {
        const sd = placingSpell.summonData;
        const uniqueId = Math.random().toString(36).substr(2, 9);
        const combatantId = sd.monster ? `sc-${uniqueId}` : undefined;
        const newToken: Token = {
          id: uniqueId,
          name: sd.creatureName,
          type: 'player',
          x: pos.x,
          y: pos.y,
          color: sd.playerColor,
          floorId: activeFloorId || undefined,
          isSummon: true,
          summonSpellName: sd.spellName,
          summonedBy: sd.casterId,
          controlledBy: sd.casterId,
          size: sd.size,
          ...(combatantId ? { combatantId } : {}),
          ...(sd.avatar ? { avatar: sd.avatar } : {}),
          ...(sd.illusory ? { illusory: true } : {}),
        };
        if (sd.monster && combatantId && onAddSummonCombatant) {
          const m = sd.monster;
          const dvMatch = m.senses?.match(/darkvision\s+(\d+)/i);
          const darkvision = dvMatch ? parseInt(dvMatch[1], 10) : 0;
          const combatant: Combatant = {
            id: combatantId,
            name: sd.creatureName,
            hp: m.hp,
            maxHp: m.hp,
            ac: m.ac,
            initiative: 0,
            type: 'npc',
            description: m.description,
            stats: m.stats,
            actions: m.actions,
            avatar: m.avatar,
            speedText: m.speed,
            cr: m.cr,
            specialAbilities: m.specialAbilities,
            legendaryActions: m.legendaryActions,
            reactions: m.reactions,
            saves: m.saves,
            skills: m.skills,
            immunities: m.immunities,
            resistances: m.resistances,
            vulnerabilities: m.vulnerabilities,
            conditionImmunities: m.conditionImmunities,
            senses: m.senses,
            languages: m.languages,
            creatureType: m.type,
            darkvision,
            summonedBy: sd.casterId,
            summonSpellName: sd.spellName,
          };
          onAddSummonCombatant(combatant, uniqueId);
        }
        const updatedTokens = [...tokens, newToken];
        onTokensChange(updatedTokens);
        if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
          window.electronAPI.sendDMTokenUpdate(updatedTokens);
        }
        setPlacingSpell(null);
        onCastingDismissed?.();
        return;
      }

      if (isPlayerView) {
        // Player: place immediately as visible
        const marker: SpellMarker = {
          id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          spellName: placingSpell.name,
          school: placingSpell.school,
          casterId: placingSpell.casterId,
          x: pos.x,
          y: pos.y,
          effectRadius: placingSpell.effectRadius,
          aoeType: placingSpell.aoeType,
          aoeSize: placingSpell.aoeSize,
          visibleToPlayers: true,
          floorId: activeFloorId || undefined,
          lightSource: !!placingSpell.effectRadius && !placingSpell.aoeType,
        };
        const updated = [...spellMarkers, marker];
        onSpellMarkersChange?.(updated);
        try { window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
        setPlacingSpell(null);
      } else {
        // DM: show visibility prompt
        setPendingMarkerPos(pos);
      }
      return;
    }

    // DM AoE casting: click to place (mouse-follow mode)
    if (castingSpell && e.evt.button === 0) {
      if (castingMousePos) {
        const angle = Math.atan2(
          castingMousePos.y - castingSpell.originY,
          castingMousePos.x - castingSpell.originX
        ) * (180 / Math.PI);
        setPlacedAoe({
          name: castingSpell.name,
          aoeType: castingSpell.aoeType,
          aoeSize: castingSpell.aoeSize,
          x: castingMousePos.x,
          y: castingMousePos.y,
          originX: castingSpell.originX,
          originY: castingSpell.originY,
          angle,
          casterRadiusPx: castingSpell.casterRadiusPx,
          selfOrigin: castingSpell.selfOrigin,
          saveAbility: castingSpell.saveAbility,
          saveDc: castingSpell.saveDc,
          halfDamageOnSave: castingSpell.halfDamageOnSave,
          spellDesc: castingSpell.spellDesc,
          damageType: castingSpell.damageType,
          mapInteraction: castingSpell.mapInteraction,
          saveEffect: castingSpell.saveEffect,
          condition: castingSpell.condition,
          casterId: castingSpell.casterId,
        });
        setCastingSpell(null);
        setCastingMousePos(null);
      }
      return;
    }

    if (e.evt.button === 2 || e.evt.button === 1 || (e.evt.button === 0 && spaceHeldRef.current)) {
      setIsPanning(true);
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    } else if (e.evt.button === 0) {
      // DM click-to-dismiss placed AoE
      if (placedAoe && !isPlayerView) {
        setPlacedAoe(null);
        onCastingDismissed?.();
        return;
      }
      const canvas = getCanvasPos(e.target.getStage());
      selectionStartRef.current = canvas;
      selectionRectRef.current = { x: canvas.x, y: canvas.y, w: 0, h: 0 };
      setSelectionRect(selectionRectRef.current);
    }
  };

  const handleStageMouseMove = (e: any) => {
    // Portal placement: project cursor onto a wall edge for the hover preview.
    if (portalPlacementMode) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      const scale = stage?.scaleX() || 1;
      const threshold = 14 / scale;
      const projection = portalPlaceStart
        ? projectToWallEdge(pos, threshold * 6, { wallId: portalPlaceStart.wallId, edgeIndex: portalPlaceStart.edgeIndex })
        : projectToWallEdge(pos, threshold);
      setPortalPlaceHover(projection);
      return;
    }
    // Wall painting: track hover so we can draw a preview line + origin-snap indicator.
    if (wallPainting) {
      const stage = e.target.getStage();
      let pos = getCanvasPos(stage);
      if (e.evt.shiftKey && wallPaintPoints.length >= 2) {
        pos = constrainToAxis(pos, wallPaintPoints[wallPaintPoints.length - 2], wallPaintPoints[wallPaintPoints.length - 1]);
      }
      let snap = false;
      if (wallPaintPoints.length >= 4) {
        const ox = wallPaintPoints[0];
        const oy = wallPaintPoints[1];
        // Snap threshold scales with zoom so it always feels ~14 screen pixels.
        const scale = stage?.scaleX() || 1;
        const thresh = 14 / scale;
        const dx = pos.x - ox;
        const dy = pos.y - oy;
        if (dx * dx + dy * dy <= thresh * thresh) snap = true;
      }
      setWallSnapToOrigin(snap);
      setWallPaintHover(snap ? { x: wallPaintPoints[0], y: wallPaintPoints[1] } : pos);
      // Fall through — other modes shouldn't be active simultaneously, but be safe.
    }
    // Difficult-terrain painting: track hover for the rubber-band preview + origin snap.
    if (difficultTerrainPainting) {
      const stage = e.target.getStage();
      let pos = getCanvasPos(stage);
      if (e.evt.shiftKey && terrainPaintPoints.length >= 2) {
        pos = constrainToAxis(pos, terrainPaintPoints[terrainPaintPoints.length - 2], terrainPaintPoints[terrainPaintPoints.length - 1]);
      }
      let snap = false;
      if (terrainPaintPoints.length >= 6) {
        const ox = terrainPaintPoints[0];
        const oy = terrainPaintPoints[1];
        const scale = stage?.scaleX() || 1;
        const thresh = 14 / scale;
        const dx = pos.x - ox;
        const dy = pos.y - oy;
        if (dx * dx + dy * dy <= thresh * thresh) snap = true;
      }
      setTerrainSnapToOrigin(snap);
      setTerrainPaintHover(snap ? { x: terrainPaintPoints[0], y: terrainPaintPoints[1] } : pos);
    }
    // Dark-zone painting: track hover for the rubber-band preview + origin snap.
    if (darkZonePainting) {
      const stage = e.target.getStage();
      let pos = getCanvasPos(stage);
      if (e.evt.shiftKey && darkPaintPoints.length >= 2) {
        pos = constrainToAxis(pos, darkPaintPoints[darkPaintPoints.length - 2], darkPaintPoints[darkPaintPoints.length - 1]);
      }
      let snap = false;
      if (darkPaintPoints.length >= 6) {
        const ox = darkPaintPoints[0];
        const oy = darkPaintPoints[1];
        const scale = stage?.scaleX() || 1;
        const thresh = 14 / scale;
        const dx = pos.x - ox;
        const dy = pos.y - oy;
        if (dx * dx + dy * dy <= thresh * thresh) snap = true;
      }
      setDarkSnapToOrigin(snap);
      setDarkPaintHover(snap ? { x: darkPaintPoints[0], y: darkPaintPoints[1] } : pos);
    }
    // Sound-zone painting: track hover for the rubber-band preview + origin snap.
    if (zonePainting) {
      const stage = e.target.getStage();
      let pos = getCanvasPos(stage);
      if (e.evt.shiftKey && zonePaintPoints.length >= 2) {
        pos = constrainToAxis(pos, zonePaintPoints[zonePaintPoints.length - 2], zonePaintPoints[zonePaintPoints.length - 1]);
      }
      let snap = false;
      if (zonePaintPoints.length >= 6) {
        const ox = zonePaintPoints[0];
        const oy = zonePaintPoints[1];
        const scale = stage?.scaleX() || 1;
        const thresh = 14 / scale;
        const dx = pos.x - ox;
        const dy = pos.y - oy;
        if (dx * dx + dy * dy <= thresh * thresh) snap = true;
      }
      setZoneSnapToOrigin(snap);
      setZonePaintCursor(snap ? { x: zonePaintPoints[0], y: zonePaintPoints[1] } : pos);
    }
    // Transition zone drawing: track hover for the rubber-band preview + origin snap.
    if (transitionZoneMode) {
      const stage = e.target.getStage();
      let pos = getCanvasPos(stage);
      if (e.evt.shiftKey && tzPaintPoints.length >= 2) {
        pos = constrainToAxis(pos, tzPaintPoints[tzPaintPoints.length - 2], tzPaintPoints[tzPaintPoints.length - 1]);
      }
      let snap = false;
      if (tzPaintPoints.length >= 6) {
        const ox = tzPaintPoints[0];
        const oy = tzPaintPoints[1];
        const scale = stage?.scaleX() || 1;
        const thresh = 14 / scale;
        const dx = pos.x - ox;
        const dy = pos.y - oy;
        if (dx * dx + dy * dy <= thresh * thresh) snap = true;
      }
      setTzSnapToOrigin(snap);
      setTzPaintHover(snap ? { x: tzPaintPoints[0], y: tzPaintPoints[1] } : pos);
    }

    // DM AoE casting: track mouse in world coords
    if (castingSpell) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setCastingMousePos(pos);
      return;
    }

    // Measure mode: update end point as mouse moves (after start is set)
    if (isMeasuringActive && measureStart) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setMeasureEnd(pos);
      return;
    }

    // Drawing mode: extend the active stroke as the mouse moves while dragging
    if (drawingMode !== 'off') {
      // Mouse-drawing only when button is held — currentStroke acts as the "is dragging" flag.
      if (drawingMode === 'eraser' && (e.evt.buttons & 1)) {
        const pos = getCanvasPos(e.target.getStage());
        const erased = eraseAt(drawings, pos.x, pos.y, ERASER_RADIUS_PX);
        if (erased.changed) onDrawingsChange?.(erased.next);
        const eErased = eraseAt(ephemeralStrokes, pos.x, pos.y, ERASER_RADIUS_PX);
        if (eErased.changed) setEphemeralStrokes(eErased.next);
      } else if (currentStroke) {
        let pos = getCanvasPos(e.target.getStage());
        // Shift constrains the stroke to a straight horizontal/vertical line
        // through its starting point.
        if (e.evt.shiftKey && currentStroke.points.length >= 2) {
          pos = constrainToAxis(pos, currentStroke.points[0], currentStroke.points[1]);
        }
        const last = currentStroke.points;
        const lx = last[last.length - 2], ly = last[last.length - 1];
        const dx = pos.x - lx, dy = pos.y - ly;
        if (dx * dx + dy * dy > 4) {
          setCurrentStroke({ ...currentStroke, points: [...last, pos.x, pos.y] });
        }
      }
      return;
    }

    if (isPanning) {
      const dx = e.evt.clientX - lastPos.x;
      const dy = e.evt.clientY - lastPos.y;
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    } else if (selectionStartRef.current) {
      const canvas = getCanvasPos(e.target.getStage());
      const start = selectionStartRef.current;
      const rect = {
        x: Math.min(start.x, canvas.x),
        y: Math.min(start.y, canvas.y),
        w: Math.abs(canvas.x - start.x),
        h: Math.abs(canvas.y - start.y),
      };
      selectionRectRef.current = rect;
      setSelectionRect({ ...rect });
    }
  };

  const handleStageMouseUp = () => {
    // Drawing mode: commit the in-progress stroke
    if (drawingMode !== 'off' && currentStroke) {
      if (currentStroke.points.length >= 2) {
        if (drawingMode === 'persistent') {
          onDrawingsChange?.([...drawings, currentStroke]);
        } else if (drawingMode === 'ephemeral') {
          setEphemeralStrokes(prev => [...prev, currentStroke]);
          scheduleEphemeralFade(currentStroke.id);
          try {
            window.electronAPI?.sendEphemeralStroke?.({
              ...currentStroke,
              floorId: activeFloorId || '',
            } as any);
          } catch (_e) { /* */ }
        }
      }
      setCurrentStroke(null);
      return;
    }

    // Finish transition zone drawing
    setIsPanning(false);
    const rect = selectionRectRef.current;
    if (selectionStartRef.current && rect && (rect.w > 5 || rect.h > 5)) {
      const { x, y, w, h } = rect;
      const selected = tokens
        .filter(t => {
          const tx = livePlayerPos[t.id]?.x ?? t.x;
          const ty = livePlayerPos[t.id]?.y ?? t.y;
          return tx >= x && tx <= x + w && ty >= y && ty <= y + h;
        })
        .map(t => t.id);
      if (selected.length > 0) {
        setSelectedTokenIds(selected);
        didMarqueeRef.current = true;
      }
    }
    selectionStartRef.current = null;
    selectionRectRef.current = null;
    setSelectionRect(null);
  };

  // Attach Konva Transformer to the selected transition zone rect
  useEffect(() => {
    const tr = zoneTransformerRef.current;
    if (!tr) return;
    if (selectedZoneId && zoneRectRefs.current[selectedZoneId]) {
      tr.nodes([zoneRectRefs.current[selectedZoneId]]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedZoneId]);

  // Emit the DM's current viewport center (in map-space) whenever pan/zoom changes
  useEffect(() => {
    if (!isPlayerView && dimensions.width > 0 && stageScale > 0) {
      const cx = (-stagePos.x + dimensions.width / 2) / stageScale;
      const cy = (-stagePos.y + dimensions.height / 2) / stageScale;
      onViewportCenter?.({ x: cx, y: cy });
    }
  }, [stagePos, stageScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();

    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Ctrl+scroll = zoom toward pointer
      const scaleBy = 1.08;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stagePos.x) / stageScale,
        y: (pointer.y - stagePos.y) / stageScale,
      };

      const newScale = e.evt.deltaY < 0
        ? stageScale * scaleBy
        : stageScale / scaleBy;

      const clampedScale = Math.min(Math.max(newScale, 0.05), 5);

      setStageScale(clampedScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    } else {
      // Plain scroll = pan
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY,
      }));
    }
  };

  // Transition-zone overlay is rebuilt only when its own inputs change,
  // not on every pan / zoom / token tick.
  const transitionZonesNodes = useMemo(() => {
    if (isPlayerView) return null;
    const PAIR_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316'];
    const currentFloor = floors?.find(f => f.id === activeFloorId);
    const zones = currentFloor?.transitionZones || [];
    return zones.map(zone => {
      const targetFloor = floors?.find(f => f.id === zone.targetFloorId);
      const color = PAIR_COLORS[(zone.pairIndex ?? 0) % PAIR_COLORS.length];
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return (
        <Group key={zone.id}>
          {(() => {
            const onSelect = (e: any) => {
              e.cancelBubble = true;
              setSelectedZoneId(prev => prev === zone.id ? null : zone.id);
            };
            const onZoneContextMenu = (e: any) => {
              e.evt.preventDefault();
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              const rect = containerRef.current?.getBoundingClientRect();
              if (ptr && rect) {
                setZoneContextMenu({
                  screenX: rect.left + ptr.x,
                  screenY: rect.top + ptr.y,
                  clientY: rect.top + ptr.y,
                  zoneId: zone.id,
                });
              }
            };
            // Polygon zones: a draggable Line (move-only; no resize handles).
            if (zone.points && zone.points.length >= 6) {
              return (
                <Line
                  points={zone.points}
                  closed
                  fill={`rgba(${r}, ${g}, ${b}, 0.2)`}
                  stroke={color}
                  strokeWidth={selectedZoneId === zone.id ? 3 : 2}
                  dash={[8, 4]}
                  listening={true}
                  draggable={!transitionZoneMode}
                  onClick={onSelect}
                  onContextMenu={onZoneContextMenu}
                  onDragEnd={(e) => {
                    const node = e.target;
                    const dx = node.x();
                    const dy = node.y();
                    node.x(0); node.y(0);
                    const movedPoints = (zone.points || []).map((v, idx) => idx % 2 === 0 ? v + dx : v + dy);
                    const movedRect = { ...zone.rect, x: zone.rect.x + dx, y: zone.rect.y + dy };
                    const updated = zones.map(z => z.id === zone.id ? { ...z, points: movedPoints, rect: movedRect } : z);
                    onTransitionZonesChange?.(updated);
                  }}
                />
              );
            }
            // Legacy rectangle zones: a Rect with resize handles via the Transformer.
            return (
              <Rect
                ref={(node) => { if (node) zoneRectRefs.current[zone.id] = node; }}
                x={zone.rect.x}
                y={zone.rect.y}
                width={zone.rect.width}
                height={zone.rect.height}
                fill={`rgba(${r}, ${g}, ${b}, 0.2)`}
                stroke={color}
                strokeWidth={selectedZoneId === zone.id ? 3 : 2}
                dash={[8, 4]}
                listening={true}
                draggable={!transitionZoneMode}
                onClick={onSelect}
                onContextMenu={onZoneContextMenu}
                onDragEnd={(e) => {
                  const node = e.target;
                  const newRect = { ...zone.rect, x: node.x(), y: node.y() };
                  const updated = zones.map(z => z.id === zone.id ? { ...z, rect: newRect } : z);
                  onTransitionZonesChange?.(updated);
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  node.scaleX(1);
                  node.scaleY(1);
                  const newRect = {
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(20, node.width() * scaleX),
                    height: Math.max(20, node.height() * scaleY),
                  };
                  node.width(newRect.width);
                  node.height(newRect.height);
                  const updated = zones.map(z => z.id === zone.id ? { ...z, rect: newRect } : z);
                  onTransitionZonesChange?.(updated);
                }}
              />
            );
          })()}
          {(() => {
            const line1 = targetFloor?.name || '?';
            const line2 = zone.label || '';
            const labelText = line2 ? `${line1}\n${line2}` : line1;
            const maxW = Math.max(40, zone.rect.width - 24);
            const bgH = line2 ? 34 : 20;
            return (
              <>
                <Rect
                  x={zone.rect.x + 4}
                  y={zone.rect.y + 4}
                  width={maxW}
                  height={bgH}
                  fill="rgba(0,0,0,0.55)"
                  cornerRadius={4}
                  listening={false}
                />
                <Text
                  x={zone.rect.x + 8}
                  y={zone.rect.y + 7}
                  text={labelText}
                  fontSize={11}
                  lineHeight={1.4}
                  fill={color}
                  fontStyle="bold"
                  width={maxW - 8}
                  ellipsis={true}
                  listening={false}
                />
              </>
            );
          })()}
          {zone.locked && (
            <>
              <Circle
                x={zone.rect.x + zone.rect.width / 2}
                y={zone.rect.y + zone.rect.height / 2}
                radius={18}
                fill="rgba(0,0,0,0.65)"
                listening={false}
              />
              <Path
                x={zone.rect.x + zone.rect.width / 2}
                y={zone.rect.y + zone.rect.height / 2}
                data="M5 11 L19 11 Q21 11 21 13 L21 20 Q21 22 19 22 L5 22 Q3 22 3 20 L3 13 Q3 11 5 11 Z M7 11 L7 7 A5 5 0 0 1 17 7 L17 11"
                stroke="white"
                strokeWidth={2}
                fill="transparent"
                offsetX={12}
                offsetY={12}
                scaleX={0.95}
                scaleY={0.95}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            </>
          )}
          {zone.pairIndex != null && (
            <>
              <Circle
                x={zone.rect.x + zone.rect.width - 2}
                y={zone.rect.y + 2}
                radius={10}
                fill={color}
                listening={false}
              />
              <Text
                x={zone.rect.x + zone.rect.width - 2}
                y={zone.rect.y + 2}
                text={String(zone.pairIndex)}
                fontSize={11}
                fill="white"
                fontStyle="bold"
                align="center"
                verticalAlign="middle"
                offsetX={10}
                offsetY={10}
                width={20}
                height={20}
                listening={false}
              />
            </>
          )}
        </Group>
      );
    });
  }, [isPlayerView, floors, activeFloorId, selectedZoneId, transitionZoneMode, onTransitionZonesChange]);

  return (
    <div className={cn("h-full flex flex-col relative", (castingSpell || pingMode) && "cursor-crosshair")} ref={containerRef}>
      {/* Grid calibration floating panel — appears in the bottom-center while calibrating. */}
      {!isPlayerView && gridCalibrating && calibrationDraft && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[160] bg-[#1a1512] border border-yellow-400/50 rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3 pointer-events-auto">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wider opacity-50">Token size</span>
            <span className="text-xl font-bold text-yellow-400 tabular-nums">{Math.round(calibrationDraft.ppg)} px</span>
            <span className="text-[10px] opacity-60">= 5 ft (one square)</span>
          </div>
          <div className="h-10 w-px bg-white/15 mx-2" />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCalibrationDraft(prev => prev ? { ...prev, ppg: Math.max(8, prev.ppg - 2) } : prev)}
                className="w-6 h-6 rounded bg-black/40 hover:bg-black/60 text-xs leading-none"
                title="Smaller"
              >
                −
              </button>
              <button
                onClick={() => setCalibrationDraft(prev => prev ? { ...prev, ppg: prev.ppg + 2 } : prev)}
                className="w-6 h-6 rounded bg-black/40 hover:bg-black/60 text-xs leading-none"
                title="Bigger"
              >
                +
              </button>
            </div>
            <span className="text-[9px] opacity-50 leading-tight max-w-[100px]">Drag corners or use ±</span>
          </div>
          <div className="h-10 w-px bg-white/15 mx-2" />
          <button
            onClick={() => onStopGridCalibration?.()}
            className="px-3 py-1.5 text-xs rounded bg-black/40 hover:bg-black/60 text-white/80"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!calibrationDraft) return;
              const ppg = Math.max(8, calibrationDraft.ppg);
              const imgW = loadedImage?.width ?? 0;
              const imgH = loadedImage?.height ?? 0;
              // Origin aligned so the bandit sits centered in a grid square.
              const mox = (((calibrationDraft.x - ppg / 2) % ppg) + ppg) % ppg;
              const moy = (((calibrationDraft.y - ppg / 2) % ppg) + ppg) % ppg;
              const gr: GridResolution = {
                pixelsPerGrid: ppg,
                mapOrigin: { x: mox, y: moy },
                mapSize: {
                  x: imgW > 0 ? Math.max(1, Math.floor((imgW - mox) / ppg)) : 0,
                  y: imgH > 0 ? Math.max(1, Math.floor((imgH - moy) / ppg)) : 0,
                },
              };
              onGridResolutionChange?.(gr);
            }}
            className="px-4 py-1.5 text-xs rounded bg-yellow-500/80 hover:bg-yellow-500 text-black font-semibold"
          >
            Apply
          </button>
        </div>
      )}

      {/* Toolbar - Only visible to DM */}
      {!isPlayerView && (
        <div className="h-10 border-b border-[var(--line)] bg-[var(--surface)] flex justify-between items-center shrink-0">
          <div className="flex items-center h-full">
            {isPrimary && (
              <AnimatePresence>
                {!leftSidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { delay: 0.2, duration: 0.1 }
                    }}
                    exit={{
                      opacity: 0,
                      transition: { delay: 0, duration: 0.05 }
                    }}
                    className="flex items-center h-full"
                  >
                    <button
                      onClick={() => setLeftSidebarOpen(true)}
                      className="h-full px-3 hover:bg-black/5 transition-colors flex items-center justify-center"
                      title="Open Notes"
                    >
                      <FileText size={12} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <div className="h-6 w-px bg-[var(--line)] shrink-0" />

            <div className="flex items-center gap-4 px-4">
              <div className="flex items-center gap-2">
                <MapIcon size={12} className="opacity-50" />
                <h3 className="text-[10px] uppercase tracking-widest opacity-50 font-sans font-bold">
                  Map
                </h3>
              </div>
              {floors && floors.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setIsFloorMenuOpen(!isFloorMenuOpen)}
                    className="btn-ghost py-1 px-3 flex items-center gap-2 w-[220px]"
                  >
                    <Layers size={12} className="shrink-0" />
                    <span className="truncate flex-1 text-left">
                      {floors.find(f => f.id === activeFloorId)?.name ?? 'Floor'}
                    </span>
                    <ChevronDown size={12} className={cn("transition-transform shrink-0", isFloorMenuOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence>
                    {isFloorMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsFloorMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="absolute top-full left-0 mt-2 z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden min-w-[160px] flex flex-col items-stretch"
                        >
                          {[...floors].sort((a, b) => a.order - b.order).map(floor => (
                            <button
                              key={floor.id}
                              onClick={() => {
                                onSwitchFloor?.(floor.id);
                                setIsFloorMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left",
                                floor.id === activeFloorId && "text-[var(--accent)]"
                              )}
                            >
                              <Layers size={13} />
                              {floor.name}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="relative">
                <button
                  onClick={() => setIsMapMenuOpen(!isMapMenuOpen)}
                  className="btn-ghost py-1 px-3 flex items-center gap-2"
                >
                  MAP SETTINGS <ChevronDown size={12} className={cn("transition-transform", isMapMenuOpen && "rotate-180")} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,video/mp4,video/webm,.mp4,.webm,.uvtt,.dd2vtt,.df2vtt" />

                <AnimatePresence>
                  {isMapMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsMapMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full left-0 mt-2 z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[240px] flex flex-col items-stretch"
                      >
                        <button
                          onClick={() => {
                            setIsMapMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                        >
                          <Upload size={14} /> Change Map
                        </button>

                        {loadedImage && (
                          <button
                            onClick={() => {
                              setShowWalls(!showWalls);
                              setIsMapMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                          >
                            {showWalls ? <EyeOff size={14} /> : <Eye size={14} />}
                            {showWalls ? 'Hide Walls' : 'Show Walls'}
                          </button>
                        )}

                        {loadedImage && (
                          <button
                            onClick={() => {
                              setWallCollisionEnabled(!wallCollisionEnabled);
                              setIsMapMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                          >
                            <Footprints size={14} />
                            {wallCollisionEnabled ? 'Disable Collisions' : 'Enable Collisions'}
                          </button>
                        )}

                        {loadedImage && (
                          <button
                            onClick={() => {
                              setShowFog(!showFog);
                              setIsMapMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                          >
                            <Cloud size={14} />
                            {showFog ? 'Turn Off Fog' : 'Turn On Fog'}
                          </button>
                        )}

                        {loadedImage && exploredFogMaskKey && (
                          <button
                            onClick={() => {
                              const now = Date.now();
                              resetExploredFog(exploredFogMaskKey, now, !isPlayerView);
                              // Stamp the timestamp onto the floor so the reset syncs
                              // to the player window (and survives reloads).
                              if (activeFloorId) {
                                onUpdateFloorById?.(activeFloorId, f => ({ ...f, exploredFogResetAt: now }));
                              }
                              setIsMapMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                          >
                            <Eraser size={14} />
                            Reset Explored Fog
                          </button>
                        )}

                        <div className="h-px bg-[var(--line)] mx-2 my-1" />
                        <div className="px-3 py-1">
                          <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Lighting</p>
                          <div className="flex items-center bg-black/40 rounded-lg p-0.5">
                            {([['daylight', 'Bright', Sun], ['dark', 'Dark', Moon]] as const).map(([val, label, Icon]) => (
                              <button
                                key={val}
                                onClick={() => onDarknessLevelChange?.(val)}
                                className={cn(
                                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-semibold tracking-wide transition-all flex-1 justify-center',
                                  (darknessLevel ?? 'dark') === val
                                    ? 'bg-white/15 text-white shadow-sm'
                                    : 'text-white/40 hover:text-white/60'
                                )}
                              >
                                <Icon size={11} /> {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {onStartGridCalibration && loadedImage && (
                          <>
                            <div className="h-px bg-[var(--line)] mx-2 my-1" />
                            <div className="px-3 py-1.5">
                              <div className="flex items-baseline justify-between mb-1.5">
                                <p className="text-[10px] opacity-40 uppercase tracking-wider">Grid</p>
                                {gridResolution && !gridCalibrating && (
                                  <p className="text-[10px] opacity-50">
                                    Current: {Math.round(gridResolution.pixelsPerGrid)} px / 5 ft
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  onStartGridCalibration();
                                  setIsMapMenuOpen(false);
                                }}
                                disabled={gridCalibrating}
                                className={cn(
                                  'w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border transition-colors disabled:opacity-40',
                                  gridCalibrating
                                    ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-200'
                                    : 'bg-yellow-500/15 hover:bg-yellow-500/25 border-yellow-400/30'
                                )}
                              >
                                <SquareDashed size={11} />
                                {gridCalibrating ? 'Calibrating…' : 'Calibrate Grid'}
                              </button>
                              {!gridResolution && !gridCalibrating && (
                                <p className="text-[10px] opacity-40 mt-1 leading-snug">
                                  Tell the app how big one square is so distances and snap-to-grid stay accurate.
                                </p>
                              )}
                            </div>
                          </>
                        )}

                        {onStartWallPainting && (
                          <>
                            <div className="h-px bg-[var(--line)] mx-2 my-1" />
                            <div className="px-3 py-1.5">
                              <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Edit Walls</p>
                              <button
                                onClick={() => {
                                  exitDarkZoneEditMode();
                                  exitTerrainEditMode();
                                  exitSoundZoneEditMode();
                                  setWallEditMode(true);
                                  setIsMapMenuOpen(false);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border transition-colors bg-orange-500/15 hover:bg-orange-500/25 border-orange-400/30"
                              >
                                <Pencil size={11} />
                                Edit Walls
                              </button>
                            </div>
                          </>
                        )}

                        {loadedImage && onStartDarkZonePainting && (
                          <>
                            <div className="h-px bg-[var(--line)] mx-2 my-1" />
                            <div className="px-3 py-1.5">
                              <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Dark Zones</p>
                              {onStartDarkZonePainting && (
                                <button
                                  onClick={() => {
                                    exitWallEditMode();
                                    exitTerrainEditMode();
                                    exitSoundZoneEditMode();
                                    setDarkZoneEditMode(true);
                                    setIsMapMenuOpen(false);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-md transition-colors"
                                >
                                  <Pencil size={11} />
                                  Edit Dark Zones
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        {loadedImage && onStartDifficultTerrainPainting && (
                          <>
                            <div className="h-px bg-[var(--line)] mx-2 my-1" />
                            <div className="px-3 py-1.5">
                              <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Difficult Terrain</p>
                              {onStartDifficultTerrainPainting && (
                                <button
                                  onClick={() => {
                                    exitWallEditMode();
                                    exitDarkZoneEditMode();
                                    exitSoundZoneEditMode();
                                    setTerrainEditMode(true);
                                    setIsMapMenuOpen(false);
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded-md transition-colors"
                                >
                                  <Pencil size={11} />
                                  Edit Difficult Terrain
                                </button>
                              )}
                            </div>
                          </>
                        )}

                        {floors && floors.length > 1 && loadedImage && (
                          <>
                            <div className="h-px bg-[var(--line)] mx-2 my-1" />
                            <div className="px-3 py-1.5">
                              <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Transition Zones</p>
                              <button
                                onClick={() => {
                                  exitWallEditMode();
                                  exitDarkZoneEditMode();
                                  exitTerrainEditMode();
                                  exitSoundZoneEditMode();
                                  setTransitionZoneMode(!transitionZoneMode);
                                  setIsMapMenuOpen(false);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/30 rounded-md transition-colors"
                              >
                                <ArrowUpDown size={11} />
                                {transitionZoneMode ? 'Cancel Transition Zone' : 'Add Transition Zone'}
                              </button>
                            </div>
                          </>
                        )}

                        {onOpenFloorAudioPicker && activeFloorId && (() => {
                          const activeFloor = floors?.find(f => f.id === activeFloorId);
                          if (!activeFloor) return null;
                          const ambientId = activeFloor.ambientSoundId;
                          const ambientSound = ambientId
                            ? librarySoundsForNotes.find(s => s.id === ambientId)
                            : null;
                          const ambientLabel = ambientSound?.name ?? ambientId ?? null;
                          return (
                            <>
                              <div className="h-px bg-[var(--line)] mx-2 my-1" />
                              <div className="px-3 py-1.5">
                                <p className="text-[10px] opacity-40 uppercase tracking-wider mb-1.5">Floor Audio</p>
                                {ambientLabel ? (
                                  <div className="flex items-center gap-1.5 text-[11px] bg-black/30 rounded px-2 py-1">
                                    <Volume2 size={11} className="text-[var(--accent)] shrink-0" />
                                    <span className="flex-1 truncate text-[var(--accent)]">{ambientLabel}</span>
                                    <button
                                      onClick={() => {
                                        onOpenFloorAudioPicker(activeFloorId);
                                        setIsMapMenuOpen(false);
                                      }}
                                      className="opacity-60 hover:opacity-100 transition-opacity"
                                      title="Change sound"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                    <button
                                      onClick={() => onClearFloorAudio?.(activeFloorId)}
                                      className="opacity-60 hover:opacity-100 hover:text-red-400 transition-colors"
                                      title="Clear sound"
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      onOpenFloorAudioPicker(activeFloorId);
                                      setIsMapMenuOpen(false);
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30 rounded-md transition-colors"
                                  >
                                    <Volume2 size={11} />
                                    Set Ambient Sound
                                  </button>
                                )}
                                {onOpenSoundZones && (
                                  <button
                                    onClick={() => {
                                      exitWallEditMode();
                                      exitDarkZoneEditMode();
                                      exitTerrainEditMode();
                                      setSoundZoneEditMode(true);
                                      setIsMapMenuOpen(false);
                                    }}
                                    className="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 border border-[var(--accent)]/30 rounded-md transition-colors"
                                    title="Sound Zones (active floor)"
                                  >
                                    <Volume2 size={11} />
                                    Edit Sound Zones
                                  </button>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </div>

        </div>
      )}

      <div className="flex-1 bg-black relative overflow-hidden" style={{ cursor: isPanning && spaceHeld ? 'grabbing' : spaceHeld ? 'grab' : undefined }}>
        {!loadedImage && !mapImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-10">
            <div className="max-w-md space-y-6">
              <h2 className="text-6xl font-serif font-bold tracking-tight">Scenario Map</h2>
              <p className="text-lg opacity-40 font-sans">Upload a map to get started</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-filled px-8 py-4 rounded-xl text-sm shadow-xl"
              >
                <Upload size={20} />
                <span>Upload Map</span>
              </button>
            </div>
          </div>
        )}
        {/* Floor-transition cover: while the new map image is loading and the
            camera hasn't repositioned yet, hide the canvas so the user doesn't
            see the old map background with new-floor tokens placed on it. */}
        <AnimatePresence>
          {mapImage && displayedMapImage !== mapImage && (
            <motion.div
              key="map-transition-cover"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 bg-black z-30 pointer-events-none"
            />
          )}
        </AnimatePresence>
        {/* Video map import notice — confirms UVTT wall data was kept, or
            warns when the video resolution doesn't match the UVTT map. */}
        <AnimatePresence>
          {videoImportNotice && (
            <motion.div
              key="video-import-notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg bg-black/85 border rounded-lg px-4 py-2 flex items-start gap-3 shadow-lg pointer-events-auto',
                videoImportNotice.kind === 'mismatch'
                  ? 'border-amber-500/50 shadow-amber-500/10'
                  : 'border-emerald-500/50 shadow-emerald-500/10'
              )}
            >
              <div className={cn(
                'w-2 h-2 rounded-full mt-1.5 shrink-0',
                videoImportNotice.kind === 'mismatch' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              )} />
              <span className={cn(
                'text-sm',
                videoImportNotice.kind === 'mismatch' ? 'text-amber-300' : 'text-emerald-300'
              )}>
                {videoImportNotice.text}
              </span>
              <button
                onClick={() => setVideoImportNotice(null)}
                className="ml-1 mt-0.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onMouseDown={isPlayerView ? undefined : handleStageMouseDown}
          onMouseMove={isPlayerView ? undefined : handleStageMouseMove}
          onMouseUp={isPlayerView ? undefined : handleStageMouseUp}
          onMouseLeave={isPlayerView ? undefined : handleStageMouseUp}
          onContextMenu={isPlayerView ? undefined : handleContextMenu}
          onWheel={isPlayerView ? undefined : handleWheel}
          onTouchStart={isPlayerView && (!activeAoe || castingSpell) ? handleTouchStart : undefined}
          onTouchMove={isPlayerView && (!activeAoe || castingSpell) ? handleTouchMove : undefined}
          onTouchEnd={isPlayerView && (!activeAoe || castingSpell) ? handleTouchEnd : undefined}
          onClick={(e) => {
            if (isPlayerView) {
              // Tap on empty space clears all targets
              if (onClearTargets && targetedCombatantIds && targetedCombatantIds.size > 0) {
                onClearTargets();
              }
              return;
            }
            // Sound zone painting (Tier 2): clicks add polygon vertices.
            if (zonePainting && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                let p = tx.point(ptr);
                if (e.evt.shiftKey && zonePaintPoints.length >= 2) {
                  p = constrainToAxis(p, zonePaintPoints[zonePaintPoints.length - 2], zonePaintPoints[zonePaintPoints.length - 1]);
                }
                // Clicking the first node closes the shape; double-click also commits.
                // Either way we stay in paint mode for the next zone.
                if (zoneSnapToOrigin && zonePaintPoints.length >= 6) {
                  commitCurrentZone();
                  return;
                }
                if (e.evt.detail >= 2 && zonePaintPoints.length >= 6) {
                  commitCurrentZone();
                  return;
                }
                setZonePaintPoints(prev => [...prev, p.x, p.y]);
              }
              return;
            }
            // Grid calibration uses a draggable Bandit token (see below) — no click handler needed here.
            if (gridCalibrating) return;
            // Portal placement (two-click span on a wall).
            if (portalPlacementMode && e.evt.button === 0) {
              const stage = e.target.getStage();
              if (!stage) return;
              const pos = getCanvasPos(stage);
              const scale = stage.scaleX() || 1;
              const threshold = 14 / scale;
              if (!portalPlaceStart) {
                // First click — must land on a wall edge.
                const proj = projectToWallEdge(pos, threshold);
                if (!proj) return;
                setPortalPlaceStart(proj);
                setPortalPlaceHover(proj);
                return;
              }
              // Second click — constrained to the same edge as the start anchor.
              const endProj = projectToWallEdge(pos, threshold * 6, {
                wallId: portalPlaceStart.wallId,
                edgeIndex: portalPlaceStart.edgeIndex,
              });
              if (!endProj) return;
              if (!onWallsAndPortalsChange) return;
              // Reject if start and end coincide.
              const ddx = endProj.point.x - portalPlaceStart.point.x;
              const ddy = endProj.point.y - portalPlaceStart.point.y;
              if (ddx * ddx + ddy * ddy < 4) return;
              // Split the wall: remove the affected edge and insert (before, portal, after) pieces.
              const w = (walls || []).find(w => w.id === portalPlaceStart.wallId);
              if (!w) return;
              const ei = portalPlaceStart.edgeIndex;
              const tA = Math.min(portalPlaceStart.t, endProj.t);
              const tB = Math.max(portalPlaceStart.t, endProj.t);
              const a = w.points[ei];
              const b = w.points[ei + 1];
              const startPt = { x: a.x + tA * (b.x - a.x), y: a.y + tA * (b.y - a.y) };
              const endPt = { x: a.x + tB * (b.x - a.x), y: a.y + tB * (b.y - a.y) };
              const beforeBase = w.points.slice(0, ei + 1);          // p0..p_ei
              const afterBase = w.points.slice(ei + 1);              // p_{ei+1}..end
              const beforePoints: WallPoint[] = tA > 0.001 ? [...beforeBase, startPt] : beforeBase;
              const afterPoints: WallPoint[] = tB < 0.999 ? [endPt, ...afterBase] : afterBase;
              const newWalls: WallSegment[] = [];
              for (const ww of walls || []) {
                if (ww.id !== w.id) { newWalls.push(ww); continue; }
                if (beforePoints.length >= 2) {
                  newWalls.push({ id: `${w.id}-a-${Date.now().toString(36)}`, points: beforePoints });
                }
                if (afterPoints.length >= 2) {
                  newWalls.push({ id: `${w.id}-b-${Date.now().toString(36)}`, points: afterPoints });
                }
              }
              const newPortal: Portal = {
                id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                bounds: [startPt, endPt],
                closed: true,
                freestanding: false,
                portalType: portalPlacementMode,
              };
              const newPortals = [...(portals || []), newPortal];
              onWallsAndPortalsChange(newWalls, newPortals);
              setPortalPlaceStart(null);
              setPortalPlaceHover(null);
              return;
            }
            // Wall painting: clicks add polyline vertices for the current wall.
            if (wallPainting && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                let p = tx.point(ptr);
                if (e.evt.shiftKey && wallPaintPoints.length >= 2) {
                  p = constrainToAxis(p, wallPaintPoints[wallPaintPoints.length - 2], wallPaintPoints[wallPaintPoints.length - 1]);
                }
                // Origin snap takes priority: clicking near the first vertex closes
                // the loop by snapping the new vertex exactly to it, then committing.
                if (wallSnapToOrigin && wallPaintPoints.length >= 4 && onWallsChange) {
                  const ox = wallPaintPoints[0];
                  const oy = wallPaintPoints[1];
                  const closedPts: WallPoint[] = [];
                  for (let i = 0; i < wallPaintPoints.length; i += 2) {
                    closedPts.push({ x: wallPaintPoints[i], y: wallPaintPoints[i + 1] });
                  }
                  closedPts.push({ x: ox, y: oy });
                  const newSeg: WallSegment = {
                    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    points: closedPts,
                  };
                  onWallsChange([...(walls || []), newSeg]);
                  setWallPaintPoints([]);
                  setWallSnapToOrigin(false);
                  setWallPaintHover(null);
                  return;
                }
                if (wallSnapToGrid && gridResolution) {
                  const g = gridResolution.pixelsPerGrid;
                  const ox = gridResolution.mapOrigin?.x ?? 0;
                  const oy = gridResolution.mapOrigin?.y ?? 0;
                  p = {
                    x: Math.round((p.x - ox) / g) * g + ox,
                    y: Math.round((p.y - oy) / g) * g + oy,
                  };
                }
                // Double-click commits the current wall and starts a new one.
                if (e.evt.detail >= 2 && wallPaintPoints.length >= 4 && onWallsChange) {
                  const pts: WallPoint[] = [];
                  for (let i = 0; i < wallPaintPoints.length; i += 2) {
                    pts.push({ x: wallPaintPoints[i], y: wallPaintPoints[i + 1] });
                  }
                  const newSeg: WallSegment = {
                    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    points: pts,
                  };
                  onWallsChange([...(walls || []), newSeg]);
                  setWallPaintPoints([]);
                  return;
                }
                setWallPaintPoints(prev => [...prev, p.x, p.y]);
              }
              return;
            }
            // Wall erasing: click near an existing wall OR portal to delete it.
            if (wallErasing && !wallPainting && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                const p = tx.point(ptr);
                // Hit threshold: ~10 map pixels (a bit wider than the wall stroke).
                const stageScale = stage.scaleX() || 1;
                const hitDist = Math.max(8, 12 / stageScale);
                // Point-to-segment distance squared.
                const distSqToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
                  const dx = bx - ax, dy = by - ay;
                  const lenSq = dx * dx + dy * dy;
                  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
                  t = Math.max(0, Math.min(1, t));
                  const cx = ax + t * dx, cy = ay + t * dy;
                  const ex = px - cx, ey = py - cy;
                  return ex * ex + ey * ey;
                };
                const thresholdSq = hitDist * hitDist;
                // Try portals first (they're drawn on top of walls).
                let portalHitId: string | null = null;
                let bestDistSq = thresholdSq;
                for (const portal of portals || []) {
                  const a = portal.bounds[0], b = portal.bounds[1];
                  const d2 = distSqToSeg(p.x, p.y, a.x, a.y, b.x, b.y);
                  if (d2 < bestDistSq) {
                    bestDistSq = d2;
                    portalHitId = portal.id;
                  }
                }
                if (portalHitId && onPortalsChange) {
                  onPortalsChange((portals || []).filter(p => p.id !== portalHitId));
                  return;
                }
                // Otherwise look for the single wall EDGE nearest the cursor.
                if (!onWallsChange) return;
                let hitId: string | null = null;
                let hitEdge = -1;
                bestDistSq = thresholdSq;
                for (const w of walls || []) {
                  for (let i = 0; i + 1 < w.points.length; i++) {
                    const a = w.points[i], b = w.points[i + 1];
                    const d2 = distSqToSeg(p.x, p.y, a.x, a.y, b.x, b.y);
                    if (d2 < bestDistSq) {
                      bestDistSq = d2;
                      hitId = w.id;
                      hitEdge = i;
                    }
                  }
                }
                if (hitId && hitEdge >= 0) {
                  const target = (walls || []).find(w => w.id === hitId)!;
                  // Split the polyline at the erased edge: the corners up to and
                  // including the edge's start become one wall, the corners from
                  // the edge's end onward become another. Pieces with fewer than
                  // 2 corners (i.e. erasing an end edge) are simply dropped.
                  const before = target.points.slice(0, hitEdge + 1);
                  const after = target.points.slice(hitEdge + 1);
                  const replacements: WallSegment[] = [];
                  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
                  if (before.length >= 2) {
                    replacements.push({ id: `${target.id}-a${stamp}`, points: before });
                  }
                  if (after.length >= 2) {
                    replacements.push({ id: `${target.id}-b${stamp}`, points: after });
                  }
                  onWallsChange((walls || []).flatMap(w => (w.id === hitId ? replacements : [w])));
                }
              }
              return;
            }
            // Dark-zone painting: clicks add polygon vertices.
            if (darkZonePainting && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                let p = tx.point(ptr);
                if (e.evt.shiftKey && darkPaintPoints.length >= 2) {
                  p = constrainToAxis(p, darkPaintPoints[darkPaintPoints.length - 2], darkPaintPoints[darkPaintPoints.length - 1]);
                }
                // Clicking the first node closes the shape; double-click also commits.
                // Either way we stay in paint mode for the next zone.
                if (darkSnapToOrigin && darkPaintPoints.length >= 6) {
                  commitCurrentDark();
                  return;
                }
                if (e.evt.detail >= 2 && darkPaintPoints.length >= 6) {
                  commitCurrentDark();
                  return;
                }
                setDarkPaintPoints(prev => [...prev, p.x, p.y]);
              }
              return;
            }
            // Difficult-terrain painting: clicks add polygon vertices.
            if (difficultTerrainPainting && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                let p = tx.point(ptr);
                if (e.evt.shiftKey && terrainPaintPoints.length >= 2) {
                  p = constrainToAxis(p, terrainPaintPoints[terrainPaintPoints.length - 2], terrainPaintPoints[terrainPaintPoints.length - 1]);
                }
                // Clicking the first node (origin snap) closes the loop and finishes
                // this area, staying in paint mode for the next one.
                if (terrainSnapToOrigin && terrainPaintPoints.length >= 6) {
                  commitCurrentTerrain();
                  return;
                }
                // Double-click also finishes the current area and starts a new one.
                if (e.evt.detail >= 2 && terrainPaintPoints.length >= 6) {
                  commitCurrentTerrain();
                  return;
                }
                setTerrainPaintPoints(prev => [...prev, p.x, p.y]);
              }
              return;
            }
            // Transition zone drawing: clicks add polygon vertices.
            if (transitionZoneMode && e.evt.button === 0) {
              const stage = e.target.getStage();
              const ptr = stage?.getPointerPosition();
              if (stage && ptr) {
                const tx = stage.getAbsoluteTransform().copy();
                tx.invert();
                let p = tx.point(ptr);
                if (e.evt.shiftKey && tzPaintPoints.length >= 2) {
                  p = constrainToAxis(p, tzPaintPoints[tzPaintPoints.length - 2], tzPaintPoints[tzPaintPoints.length - 1]);
                }
                // Clicking the first node (origin snap) or double-clicking finishes
                // the shape and advances the transition-zone flow.
                if (tzSnapToOrigin && tzPaintPoints.length >= 6) {
                  commitCurrentTransition();
                  return;
                }
                if (e.evt.detail >= 2 && tzPaintPoints.length >= 6) {
                  commitCurrentTransition();
                  return;
                }
                setTzPaintPoints(prev => [...prev, p.x, p.y]);
              }
              return;
            }
            if (e.evt.button === 0) {
              if (didMarqueeRef.current) {
                didMarqueeRef.current = false;
                return;
              }
              setContextMenu(null);
              setTokenContextMenu(null);
              setZoneContextMenu(null);
              setLeftSidebarOpen(false);
              setSelectedTokenIds([]);
              setSelectedTokenId(null);
              setSelectedZoneId(null);
            }
          }}
        >
          {/* ── Static base map — isolated on its own layer so dragging tokens,
               drawing, fog, etc. don't force the full-resolution map image to
               re-render every frame. listening=false skips hit-testing on it
               (the map itself has no click handlers; the Stage handles those). ── */}
          <Layer listening={false} ref={mapLayerRef}>
            {loadedImage && (
              <KonvaImage
                image={loadedImage}
                width={loadedImage.width}
                height={loadedImage.height}
              />
            )}
          </Layer>

          <Layer>
            {/* Render Transition Zones — DM only (memoized above) */}
            {transitionZonesNodes}

            {/* ── Sound zones (Tier 2) — DM only ── */}
            {!isPlayerView && soundZones.length > 0 && soundZones.map(z => {
              if (z.points.length < 6) return null;
              const color = z.color ?? '#f59e0b';
              const r = parseInt(color.slice(1, 3), 16);
              const g = parseInt(color.slice(3, 5), 16);
              const b = parseInt(color.slice(5, 7), 16);
              // Deleting removes the shape under the cursor, so onMouseLeave never
              // fires — reset the cursor here or the pointer hand sticks around.
              const deleteZone = (e: Konva.KonvaEventObject<Event>) => {
                const st = e.target.getStage();
                if (st) st.container().style.cursor = 'default';
                onSoundZonesChange?.(soundZones.filter(d => d.id !== z.id));
              };
              return (
                <Line
                  key={`soundzone-${z.id}`}
                  points={z.points}
                  closed
                  fill={soundZoneErasing ? 'rgba(220, 38, 38, 0.18)' : `rgba(${r}, ${g}, ${b}, 0.18)`}
                  stroke={soundZoneErasing ? '#ef4444' : color}
                  strokeWidth={2}
                  dash={[10, 6]}
                  listening={soundZoneErasing}
                  onClick={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onTap={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onMouseEnter={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; }}
                  onMouseLeave={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'default'; }}
                />
              );
            })}
            {/* ── Dark zones — DM only, hidden when walls are hidden (always shown
                 while the Dark Zones toolbar is open so the eraser has targets) ── */}
            {!isPlayerView && (showWalls || darkZoneEditMode) && darkZones.length > 0 && darkZones.map(z => {
              if (z.points.length < 6) return null;
              // Deleting removes the shape under the cursor, so onMouseLeave never
              // fires — reset the cursor here or the pointer hand sticks around.
              const deleteZone = (e: Konva.KonvaEventObject<Event>) => {
                const st = e.target.getStage();
                if (st) st.container().style.cursor = 'default';
                onDarkZonesChange?.(darkZones.filter(d => d.id !== z.id));
              };
              return (
                <Line
                  key={`darkzone-${z.id}`}
                  points={z.points}
                  closed
                  fill={darkZoneErasing ? 'rgba(220, 38, 38, 0.18)' : 'rgba(20, 24, 60, 0.32)'}
                  stroke={darkZoneErasing ? '#ef4444' : '#6366f1'}
                  strokeWidth={2}
                  dash={[8, 4]}
                  listening={darkZoneErasing}
                  onClick={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onTap={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onMouseEnter={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; }}
                  onMouseLeave={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'default'; }}
                />
              );
            })}
            {/* ── Difficult terrain — DM only, hidden when walls are hidden (always
                 shown while the Difficult Terrain toolbar is open so the eraser has targets) ── */}
            {!isPlayerView && (showWalls || terrainEditMode) && difficultTerrain.length > 0 && difficultTerrain.map(z => {
              if (z.points.length < 6) return null;
              // Deleting removes the shape under the cursor, so onMouseLeave never
              // fires — reset the cursor here or the pointer hand sticks around.
              const deleteZone = (e: Konva.KonvaEventObject<Event>) => {
                const st = e.target.getStage();
                if (st) st.container().style.cursor = 'default';
                onDifficultTerrainChange?.(difficultTerrain.filter(d => d.id !== z.id));
              };
              return (
                <Line
                  key={`terrain-${z.id}`}
                  points={z.points}
                  closed
                  fill={terrainErasing ? 'rgba(220, 38, 38, 0.18)' : 'rgba(180, 120, 30, 0.22)'}
                  stroke={terrainErasing ? '#ef4444' : '#d97706'}
                  strokeWidth={2}
                  dash={[3, 5]}
                  listening={terrainErasing}
                  onClick={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onTap={(e) => { e.cancelBubble = true; deleteZone(e); }}
                  onMouseEnter={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'pointer'; }}
                  onMouseLeave={(e) => { const st = e.target.getStage(); if (st) st.container().style.cursor = 'default'; }}
                />
              );
            })}
            {/* ── Grid calibration: a draggable/resizable Bandit token ── */}
            {!isPlayerView && gridCalibrating && calibrationDraft && (() => {
              const calColor = '#ef4444';      // Bandit red
              const accentColor = '#fbbf24';   // Yellow for handles + ruler
              const ppg = Math.max(8, calibrationDraft.ppg);
              const radius = ppg / 2;
              const cx = calibrationDraft.x;
              const cy = calibrationDraft.y;
              const imgW = loadedImage?.width ?? 0;
              const imgH = loadedImage?.height ?? 0;
              // Grid overlay aligned so the token sits centered in a square.
              const mox = (((cx - ppg / 2) % ppg) + ppg) % ppg;
              const moy = (((cy - ppg / 2) % ppg) + ppg) % ppg;
              const gridLines: number[][] = [];
              if (imgW > 0 && imgH > 0) {
                const maxLines = 250;
                const cols = Math.min(maxLines, Math.ceil((imgW - mox) / ppg) + 1);
                const rows = Math.min(maxLines, Math.ceil((imgH - moy) / ppg) + 1);
                for (let i = 0; i <= cols; i++) {
                  const x = mox + i * ppg;
                  gridLines.push([x, 0, x, imgH]);
                }
                for (let j = 0; j <= rows; j++) {
                  const y = moy + j * ppg;
                  gridLines.push([0, y, imgW, y]);
                }
              }
              // The 4 corner resize handles, in canvas coords.
              const handles: { id: string; hx: number; hy: number }[] = [
                { id: 'nw', hx: cx - radius, hy: cy - radius },
                { id: 'ne', hx: cx + radius, hy: cy - radius },
                { id: 'sw', hx: cx - radius, hy: cy + radius },
                { id: 'se', hx: cx + radius, hy: cy + radius },
              ];
              return (
                <Group>
                  {/* Faint live grid overlay so the user can compare to the map's actual grid. */}
                  {gridLines.map((pts, i) => (
                    <Line key={`calgrid-${i}`} points={pts} stroke={accentColor} strokeWidth={0.6} opacity={0.4} listening={false} />
                  ))}
                  {/* The "bounding square" of the bandit — visualizes the 5 ft grid cell. */}
                  <Rect
                    x={cx - radius}
                    y={cy - radius}
                    width={ppg}
                    height={ppg}
                    fill="rgba(251, 191, 36, 0.10)"
                    stroke={accentColor}
                    strokeWidth={1.5}
                    dash={[6, 4]}
                    listening={false}
                  />
                  {/* The bandit token — a draggable circle. */}
                  <Group
                    x={cx}
                    y={cy}
                    draggable
                    onDragMove={(e) => {
                      const node = e.target;
                      setCalibrationDraft(prev => prev ? { ...prev, x: node.x(), y: node.y() } : prev);
                    }}
                  >
                    <Circle radius={radius} fill={calColor} stroke="white" strokeWidth={2} opacity={0.85} />
                  </Group>
                  {/* Resize handles at each corner — drag to change ppg. */}
                  {handles.map(h => (
                    <Circle
                      key={`cal-handle-${h.id}`}
                      x={h.hx}
                      y={h.hy}
                      radius={7}
                      fill={accentColor}
                      stroke="white"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const node = e.target;
                        const dx = Math.abs(node.x() - cx);
                        const dy = Math.abs(node.y() - cy);
                        // Use the larger axis distance so diagonal drag still feels right.
                        const half = Math.max(6, Math.max(dx, dy));
                        setCalibrationDraft(prev => prev ? { ...prev, ppg: half * 2 } : prev);
                      }}
                      onDragEnd={(e) => {
                        // Snap the handle visually back to its computed corner so it doesn't drift.
                        e.target.x(h.hx);
                        e.target.y(h.hy);
                      }}
                    />
                  ))}
                </Group>
              );
            })()}

            {/* ── Portal placement preview ── */}
            {!isPlayerView && portalPlacementMode && (() => {
              const previewColor = portalPlacementMode === 'window' ? '#60a5fa' : '#4ade80';
              const ppg = gridResolution?.pixelsPerGrid || 0;
              // Compute span length + label position when we have a start anchor + hover.
              let lengthFt: number | null = null;
              let lengthLabel: string | null = null;
              let labelX = 0, labelY = 0, labelAngleDeg = 0, midX = 0, midY = 0;
              let tickPts: number[] | null = null;
              if (portalPlaceStart && portalPlaceHover && ppg > 0) {
                const dx = portalPlaceHover.point.x - portalPlaceStart.point.x;
                const dy = portalPlaceHover.point.y - portalPlaceStart.point.y;
                const distPx = Math.sqrt(dx * dx + dy * dy);
                lengthFt = (distPx / ppg) * 5;
                // Round to one decimal; drop the decimal if it's a whole number.
                const rounded = Math.round(lengthFt * 10) / 10;
                lengthLabel = (Math.abs(rounded - Math.round(rounded)) < 0.05)
                  ? `${Math.round(rounded)} ft`
                  : `${rounded.toFixed(1)} ft`;
                midX = (portalPlaceStart.point.x + portalPlaceHover.point.x) / 2;
                midY = (portalPlaceStart.point.y + portalPlaceHover.point.y) / 2;
                // Offset the label perpendicular to the span so it doesn't overlap the line.
                const len = distPx || 1;
                const nx = -dy / len;       // perpendicular unit vector
                const ny = dx / len;
                const offset = 18;
                labelX = midX + nx * offset;
                labelY = midY + ny * offset;
                // Angle for rotated text — keep upright (no upside-down readouts).
                let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (angle > 90) angle -= 180;
                else if (angle < -90) angle += 180;
                labelAngleDeg = angle;
                // End-tick marks (short perpendicular hashes at both ends of the span)
                const tickLen = 10;
                const sx = portalPlaceStart.point.x;
                const sy = portalPlaceStart.point.y;
                const ex = portalPlaceHover.point.x;
                const ey = portalPlaceHover.point.y;
                tickPts = [
                  sx + nx * tickLen, sy + ny * tickLen, sx - nx * tickLen, sy - ny * tickLen,
                  ex + nx * tickLen, ey + ny * tickLen, ex - nx * tickLen, ey - ny * tickLen,
                ];
              }
              // Color the label if the length is very close to 5 ft — visual confirmation.
              const isFiveFt = lengthFt !== null && Math.abs(lengthFt - 5) < 0.15;
              const labelBg = isFiveFt ? '#fbbf24' : '#0f0c0a';
              const labelFg = isFiveFt ? '#1a1512' : '#ffffff';
              const labelText = lengthLabel || '';
              // Approx label box size (Konva Text doesn't auto-measure synchronously).
              const labelW = labelText.length * 7 + 12;
              const labelH = 18;
              return (
                <Group listening={false}>
                  {/* Start anchor dot */}
                  {portalPlaceStart && (
                    <>
                      <Circle
                        x={portalPlaceStart.point.x}
                        y={portalPlaceStart.point.y}
                        radius={9}
                        stroke={previewColor}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                      <Circle
                        x={portalPlaceStart.point.x}
                        y={portalPlaceStart.point.y}
                        radius={4}
                        fill={previewColor}
                        stroke="white"
                        strokeWidth={1}
                      />
                    </>
                  )}
                  {/* Span between start and current hover (along the same wall edge) */}
                  {portalPlaceStart && portalPlaceHover && (
                    <Line
                      points={[
                        portalPlaceStart.point.x,
                        portalPlaceStart.point.y,
                        portalPlaceHover.point.x,
                        portalPlaceHover.point.y,
                      ]}
                      stroke={previewColor}
                      strokeWidth={5}
                      lineCap="round"
                      opacity={0.7}
                    />
                  )}
                  {/* End-tick hashes — short marks perpendicular at both ends of the span */}
                  {tickPts && (
                    <>
                      <Line
                        points={tickPts.slice(0, 4)}
                        stroke={previewColor}
                        strokeWidth={2}
                        lineCap="round"
                        opacity={0.85}
                      />
                      <Line
                        points={tickPts.slice(4, 8)}
                        stroke={previewColor}
                        strokeWidth={2}
                        lineCap="round"
                        opacity={0.85}
                      />
                    </>
                  )}
                  {/* Ruler label — distance in feet, shown next to the span */}
                  {lengthLabel && (
                    <Group x={labelX} y={labelY} rotation={labelAngleDeg}>
                      <Rect
                        x={-labelW / 2}
                        y={-labelH / 2}
                        width={labelW}
                        height={labelH}
                        cornerRadius={4}
                        fill={labelBg}
                        stroke={previewColor}
                        strokeWidth={1}
                        opacity={0.95}
                      />
                      <Text
                        x={-labelW / 2}
                        y={-labelH / 2}
                        width={labelW}
                        height={labelH}
                        text={labelText}
                        fontSize={12}
                        fontStyle="bold"
                        fill={labelFg}
                        align="center"
                        verticalAlign="middle"
                      />
                    </Group>
                  )}
                  {/* Hover marker (before first click, or live endpoint during span) */}
                  {portalPlaceHover && (
                    <Circle
                      x={portalPlaceHover.point.x}
                      y={portalPlaceHover.point.y}
                      radius={5}
                      fill="white"
                      stroke={previewColor}
                      strokeWidth={2}
                    />
                  )}
                </Group>
              );
            })()}

            {/* ── In-progress wall polyline ── */}
            {!isPlayerView && wallPainting && wallPaintPoints.length >= 2 && (
              <Group listening={false}>
                <Line
                  points={wallPaintPoints}
                  stroke="#ff6b35"
                  strokeWidth={3}
                  lineCap="round"
                  lineJoin="round"
                  opacity={0.9}
                />
                {/* Preview rubber-band line from last vertex to cursor (or to origin when snapping). */}
                {wallPaintHover && (
                  <Line
                    points={[
                      wallPaintPoints[wallPaintPoints.length - 2],
                      wallPaintPoints[wallPaintPoints.length - 1],
                      wallPaintHover.x,
                      wallPaintHover.y,
                    ]}
                    stroke="#ff6b35"
                    strokeWidth={2}
                    dash={[6, 4]}
                    opacity={0.55}
                  />
                )}
                {Array.from({ length: wallPaintPoints.length / 2 }).map((_, i) => {
                  const isOrigin = i === 0;
                  const highlight = isOrigin && wallSnapToOrigin;
                  return (
                    <React.Fragment key={`wp-${i}`}>
                      {highlight && (
                        <Circle
                          x={wallPaintPoints[i * 2]}
                          y={wallPaintPoints[i * 2 + 1]}
                          radius={11}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}
                      <Circle
                        x={wallPaintPoints[i * 2]}
                        y={wallPaintPoints[i * 2 + 1]}
                        radius={highlight ? 6 : 4}
                        fill={highlight ? '#fbbf24' : '#ff6b35'}
                        stroke="white"
                        strokeWidth={1}
                      />
                    </React.Fragment>
                  );
                })}
              </Group>
            )}
            {/* In-progress dark zone polygon */}
            {!isPlayerView && darkZonePainting && darkPaintPoints.length >= 2 && (
              <Group listening={false}>
                <Line
                  points={darkPaintPoints}
                  closed={darkPaintPoints.length >= 6}
                  fill={darkPaintPoints.length >= 6 ? 'rgba(20, 24, 60, 0.22)' : undefined}
                  stroke="#6366f1"
                  strokeWidth={2}
                  dash={[6, 4]}
                />
                {/* Rubber-band preview from last vertex to cursor (or origin when snapping). */}
                {darkPaintHover && (
                  <Line
                    points={[
                      darkPaintPoints[darkPaintPoints.length - 2],
                      darkPaintPoints[darkPaintPoints.length - 1],
                      darkPaintHover.x,
                      darkPaintHover.y,
                    ]}
                    stroke="#6366f1"
                    strokeWidth={2}
                    dash={[6, 4]}
                    opacity={0.55}
                  />
                )}
                {Array.from({ length: darkPaintPoints.length / 2 }).map((_, i) => {
                  const isOrigin = i === 0;
                  const highlight = isOrigin && darkSnapToOrigin;
                  return (
                    <React.Fragment key={`dp-${i}`}>
                      {highlight && (
                        <Circle
                          x={darkPaintPoints[i * 2]}
                          y={darkPaintPoints[i * 2 + 1]}
                          radius={11}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}
                      <Circle
                        x={darkPaintPoints[i * 2]}
                        y={darkPaintPoints[i * 2 + 1]}
                        radius={highlight ? 6 : 5}
                        fill={highlight ? '#fbbf24' : (isOrigin ? 'white' : '#6366f1')}
                        stroke="#6366f1"
                        strokeWidth={1.5}
                      />
                    </React.Fragment>
                  );
                })}
              </Group>
            )}
            {/* In-progress difficult terrain polygon */}
            {!isPlayerView && difficultTerrainPainting && terrainPaintPoints.length >= 2 && (
              <Group listening={false}>
                <Line
                  points={terrainPaintPoints}
                  closed={terrainPaintPoints.length >= 6}
                  fill={terrainPaintPoints.length >= 6 ? 'rgba(180, 120, 30, 0.18)' : undefined}
                  stroke="#d97706"
                  strokeWidth={2}
                  dash={[4, 4]}
                />
                {/* Rubber-band preview from last vertex to cursor (or origin when snapping). */}
                {terrainPaintHover && (
                  <Line
                    points={[
                      terrainPaintPoints[terrainPaintPoints.length - 2],
                      terrainPaintPoints[terrainPaintPoints.length - 1],
                      terrainPaintHover.x,
                      terrainPaintHover.y,
                    ]}
                    stroke="#d97706"
                    strokeWidth={2}
                    dash={[6, 4]}
                    opacity={0.55}
                  />
                )}
                {Array.from({ length: terrainPaintPoints.length / 2 }).map((_, i) => {
                  const isOrigin = i === 0;
                  const highlight = isOrigin && terrainSnapToOrigin;
                  return (
                    <React.Fragment key={`tp-${i}`}>
                      {highlight && (
                        <Circle
                          x={terrainPaintPoints[i * 2]}
                          y={terrainPaintPoints[i * 2 + 1]}
                          radius={11}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}
                      <Circle
                        x={terrainPaintPoints[i * 2]}
                        y={terrainPaintPoints[i * 2 + 1]}
                        radius={highlight ? 6 : 5}
                        fill={highlight ? '#fbbf24' : (isOrigin ? 'white' : '#d97706')}
                        stroke="#d97706"
                        strokeWidth={1.5}
                      />
                    </React.Fragment>
                  );
                })}
              </Group>
            )}
            {/* In-progress sound zone polygon */}
            {!isPlayerView && zonePainting && zonePaintPoints.length >= 2 && (() => {
              const color = zonePainting.color;
              const r = parseInt(color.slice(1, 3), 16);
              const g = parseInt(color.slice(3, 5), 16);
              const b = parseInt(color.slice(5, 7), 16);
              return (
                <Group listening={false}>
                  <Line
                    points={zonePaintPoints}
                    closed={zonePaintPoints.length >= 6}
                    fill={zonePaintPoints.length >= 6 ? `rgba(${r}, ${g}, ${b}, 0.12)` : undefined}
                    stroke={color}
                    strokeWidth={2}
                    dash={[6, 4]}
                  />
                  {/* Rubber-band preview from last vertex to cursor (or origin when snapping). */}
                  {zonePaintCursor && (
                    <Line
                      points={[
                        zonePaintPoints[zonePaintPoints.length - 2],
                        zonePaintPoints[zonePaintPoints.length - 1],
                        zonePaintCursor.x,
                        zonePaintCursor.y,
                      ]}
                      stroke={color}
                      strokeWidth={2}
                      dash={[6, 4]}
                      opacity={0.55}
                    />
                  )}
                  {Array.from({ length: zonePaintPoints.length / 2 }).map((_, i) => {
                    const isOrigin = i === 0;
                    const highlight = isOrigin && zoneSnapToOrigin;
                    return (
                      <React.Fragment key={`zp-${i}`}>
                        {highlight && (
                          <Circle
                            x={zonePaintPoints[i * 2]}
                            y={zonePaintPoints[i * 2 + 1]}
                            radius={11}
                            stroke="#fbbf24"
                            strokeWidth={2}
                            opacity={0.9}
                          />
                        )}
                        <Circle
                          x={zonePaintPoints[i * 2]}
                          y={zonePaintPoints[i * 2 + 1]}
                          radius={highlight ? 6 : 5}
                          fill={highlight ? '#fbbf24' : (isOrigin ? 'white' : color)}
                          stroke={color}
                          strokeWidth={1.5}
                        />
                      </React.Fragment>
                    );
                  })}
                </Group>
              );
            })()}

            {/* In-progress transition zone polygon */}
            {!isPlayerView && transitionZoneMode && tzPaintPoints.length >= 2 && (
              <Group listening={false}>
                <Line
                  points={tzPaintPoints}
                  closed={tzPaintPoints.length >= 6}
                  fill={tzPaintPoints.length >= 6 ? 'rgba(59, 130, 246, 0.2)' : undefined}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dash={[8, 4]}
                />
                {tzPaintHover && (
                  <Line
                    points={[
                      tzPaintPoints[tzPaintPoints.length - 2],
                      tzPaintPoints[tzPaintPoints.length - 1],
                      tzPaintHover.x,
                      tzPaintHover.y,
                    ]}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dash={[6, 4]}
                    opacity={0.55}
                  />
                )}
                {Array.from({ length: tzPaintPoints.length / 2 }).map((_, i) => {
                  const isOrigin = i === 0;
                  const highlight = isOrigin && tzSnapToOrigin;
                  return (
                    <React.Fragment key={`tz-${i}`}>
                      {highlight && (
                        <Circle
                          x={tzPaintPoints[i * 2]}
                          y={tzPaintPoints[i * 2 + 1]}
                          radius={11}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          opacity={0.9}
                        />
                      )}
                      <Circle
                        x={tzPaintPoints[i * 2]}
                        y={tzPaintPoints[i * 2 + 1]}
                        radius={highlight ? 6 : 5}
                        fill={highlight ? '#fbbf24' : (isOrigin ? 'white' : '#3b82f6')}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                      />
                    </React.Fragment>
                  );
                })}
              </Group>
            )}

            {/* Transformer for selected transition zone — DM only */}
            {!isPlayerView && (
              <Transformer
                ref={zoneTransformerRef}
                rotateEnabled={false}
                keepRatio={false}
                borderStroke="white"
                borderStrokeWidth={1}
                anchorStroke="white"
                anchorFill="white"
                anchorSize={8}
                anchorCornerRadius={2}
              />
            )}

            {/* Render Walls */}
            {showWalls && !isPlayerView && walls?.map(wall => (
              <Line
                key={wall.id}
                points={wall.points.flatMap(p => [p.x, p.y])}
                stroke="#ff6b35"
                strokeWidth={3}
                lineCap="round"
                lineJoin="round"
                opacity={0.8}
                listening={false}
              />
            ))}
            {showWalls && !isPlayerView && objectWalls?.map(wall => (
              <Line
                key={wall.id}
                points={wall.points.flatMap(p => [p.x, p.y])}
                stroke="#ff6b35"
                strokeWidth={2}
                lineCap="round"
                lineJoin="round"
                opacity={0.5}
                dash={[6, 3]}
                listening={false}
              />
            ))}
            {/* Render Portals (Doors/Windows) — line overlay on DM view, invisible hitboxes on Player view */}
            {((showWalls && !isPlayerView) || isPlayerView) && portals?.map(portal => {
              const isSecret = portal.portalType === 'secret';
              // Secret doors are invisible to players
              if (isPlayerView && isSecret) return null;
              const showVisuals = showWalls && !isPlayerView;
              const strokeColor = showVisuals
                ? (isSecret ? '#a855f7' : portal.locked ? '#fbbf24' : portal.closed ? '#4ade80' : '#60a5fa')
                : 'transparent';
              return (
                <Line
                  key={portal.id}
                  points={[portal.bounds[0].x, portal.bounds[0].y, portal.bounds[1].x, portal.bounds[1].y]}
                  stroke={strokeColor}
                  strokeWidth={showVisuals ? (portal.closed ? 4 : 3) : 2}
                  lineCap="round"
                  dash={showVisuals && (!portal.closed || isSecret) ? [8, 6] : []}
                  opacity={showVisuals ? (isSecret ? 0.7 : 0.9) : 1}
                  onClick={(e) => { e.cancelBubble = true; if (!isPlayerView && wallErasing && !wallPainting) { onPortalsChange?.((portals || []).filter(p => p.id !== portal.id)); return; } if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                  onTap={(e) => { e.cancelBubble = true; if (!isPlayerView && wallErasing && !wallPainting) { onPortalsChange?.((portals || []).filter(p => p.id !== portal.id)); return; } if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                  hitStrokeWidth={isPlayerView ? 30 : 12}
                />
              );
            })}


            {/* Marquee selection rect (DM only) */}
            {!isPlayerView && selectionRect && selectionRect.w > 0 && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.w}
                height={selectionRect.h}
                fill="rgba(205,127,50,0.08)"
                stroke="#CD7F32"
                strokeWidth={1 / stageScale}
                dash={[6 / stageScale, 4 / stageScale]}
                listening={false}
              />
            )}

            {/* Movement path lines — rendered UNDER tokens */}
            {inCombat && Object.values(movementPaths).map(path => {
              if (path.points.length < 4) return null;
              const fade = pathFadeProgress[path.tokenId] ?? 0;
              const isFullyFaded = fade >= 1;
              if (isFullyFaded) return null;
              const pathToken = tokenById.get(path.tokenId);
              const pathColor = pathToken?.color || '#CD7F32';
              const totalPairs = path.points.length / 2;
              const FEATHER_SEGMENTS = 16;
              const segmentSize = Math.max(2, Math.ceil(totalPairs / FEATHER_SEGMENTS));

              if (fade === 0 || path.isDragging) {
                return (
                  <React.Fragment key={`pathline-${path.tokenId}`}>
                    <Line
                      points={path.points}
                      stroke={pathColor}
                      strokeWidth={3 / stageScale}
                      opacity={0.8}
                      lineCap="round"
                      lineJoin="round"
                      dash={[8 / stageScale, 4 / stageScale]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Circle
                      x={path.startPos.x}
                      y={path.startPos.y}
                      radius={6 / stageScale}
                      fill={pathColor}
                      opacity={0.8}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  </React.Fragment>
                );
              }
              // Fading — segmented line with feathered opacity
              const fadeFront = fade * totalPairs;
              const featherWidth = totalPairs * 0.15;
              const segments: React.ReactNode[] = [];
              for (let i = 0; i < totalPairs - 1; i += segmentSize) {
                const endI = Math.min(i + segmentSize, totalPairs - 1);
                const chunkPoints = path.points.slice(i * 2, (endI + 1) * 2);
                if (chunkPoints.length < 4) continue;
                const mid = (i + endI) / 2;
                let segOpacity: number;
                if (mid < fadeFront - featherWidth) {
                  segOpacity = 0;
                } else if (mid > fadeFront + featherWidth) {
                  segOpacity = 0.8;
                } else {
                  segOpacity = 0.8 * ((mid - (fadeFront - featherWidth)) / (featherWidth * 2));
                }
                if (segOpacity <= 0.01) continue;
                segments.push(
                  <Line
                    key={`seg-${path.tokenId}-${i}`}
                    points={chunkPoints}
                    stroke={pathColor}
                    strokeWidth={3 / stageScale}
                    opacity={segOpacity}
                    lineCap="round"
                    lineJoin="round"
                    dash={[8 / stageScale, 4 / stageScale]}
                  />
                );
              }
              const markerOpacity = Math.max(0, 0.8 * (1 - fade * 2.5));
              return (
                <React.Fragment key={`pathline-${path.tokenId}`}>
                  {segments}
                  {markerOpacity > 0 && (
                    <Circle
                      x={path.startPos.x}
                      y={path.startPos.y}
                      radius={6 / stageScale}
                      fill={pathColor}
                      opacity={markerOpacity}
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* Engaged range lines — rendered UNDER tokens. Dark halo behind red for contrast on any map. */}
            {engagedPairs.map(pair => (
              <React.Fragment key={pair.key}>
                <Line
                  points={[pair.px1, pair.py1, pair.px2, pair.py2]}
                  stroke="#000000"
                  strokeWidth={4 / stageScale}
                  opacity={0.5}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                <Line
                  points={[pair.px1, pair.py1, pair.px2, pair.py2]}
                  stroke="#FF4444"
                  strokeWidth={2 / stageScale}
                  opacity={0.85}
                  dash={[8 / stageScale, 5 / stageScale]}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </React.Fragment>
            ))}

            {tokens.filter(t => {
              if (isPlayerView && t.type === 'player') return false;
              // In player view, hide tokens marked as hidden by the DM
              if (isPlayerView && t.hidden) return false;
              // In player view, hide invisible non-player tokens unless See Invisibility is active
              if (isPlayerView && t.invisible && !seeInvisibility) return false;
              return true;
            }).map(token => {
              const r = tokenRadius * getTokenSizeMultiplier(token.size);
              return (
                <Group
                  key={token.id}
                  x={livePlayerPos[token.id]?.x ?? token.x}
                  y={livePlayerPos[token.id]?.y ?? token.y}
                  draggable={isPlayerView ? (token.type === 'player' && !activeAoe && !isMeasuringActive && drawingMode === 'off') : (drawingMode === 'off')}
                  onMouseDown={(e) => {
                    if (castingSpell && !isPlayerView) {
                      // Let stage mousedown fire so the AoE gets placed
                      aoeJustPlacedRef.current = true;
                      return;
                    }
                    e.cancelBubble = true;
                  }}
                  onDragStart={() => handleDragStart(token.id)}
                  onDragMove={(e) => handleDragMove(token.id, e)}
                  onDragEnd={(e) => handleDragEnd(token.id, e)}
                  onContextMenu={(e) => handleTokenContextMenu(e, token.id)}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    // If we just placed an AoE via this mousedown, skip token selection
                    if (aoeJustPlacedRef.current) {
                      aoeJustPlacedRef.current = false;
                      return;
                    }
                    if (isPlayerView) tokenTapConsumedRef.current = true;
                    // Player view: tap enemy/npc token to toggle targeting
                    if (isPlayerView && onToggleTarget && token.type !== 'player' && token.combatantId) {
                      onToggleTarget(token.combatantId);
                      return;
                    }
                    // Double-tap detection for player view (touch uses onTap below)
                    if (isPlayerView && onPlayerTokenDoubleTap && token.type === 'player' && !activeAoe) {
                      const now = Date.now();
                      const last = lastTapRef.current;
                      if (last && last.tokenId === token.id && now - last.time < 400) {
                        lastTapRef.current = null;
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          const screenX = rect.left + token.x * stageScale + stagePos.x;
                          const screenY = rect.top + token.y * stageScale + stagePos.y;
                          onPlayerTokenDoubleTap(token.id, screenX, screenY);
                        }
                        return;
                      }
                      lastTapRef.current = { tokenId: token.id, time: now };
                      return;
                    }
                    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
                      setSelectedTokenIds(
                        selectedTokenIds.includes(token.id) ? selectedTokenIds.filter(id => id !== token.id) : [...selectedTokenIds, token.id]
                      );
                    } else {
                      setSelectedTokenIds([token.id]);
                      // Outside initiative, single click only selects visually — double click opens the panel
                      if (inCombat) {
                        setSelectedTokenId(token.id);
                        onSelectedTokenIdChange?.(token.id);
                      } else if (selectedTokenId !== token.id) {
                        // Clicking a different token closes the previously open panel
                        setSelectedTokenId(null);
                        onSelectedTokenIdChange?.(null);
                      }
                    }
                  }}
                  onDblClick={(e) => {
                    if (isPlayerView) return;
                    if (inCombat) return; // initiative already opens on single click
                    e.cancelBubble = true;
                    setSelectedTokenIds([token.id]);
                    setSelectedTokenId(token.id);
                    onSelectedTokenIdChange?.(token.id);
                  }}
                  onDblTap={(e) => {
                    if (isPlayerView) return;
                    if (inCombat) return;
                    e.cancelBubble = true;
                    setSelectedTokenIds([token.id]);
                    setSelectedTokenId(token.id);
                    onSelectedTokenIdChange?.(token.id);
                  }}
                  onTap={(e) => {
                    e.cancelBubble = true;
                    if (isPlayerView) tokenTapConsumedRef.current = true;
                    // Player view: tap enemy/npc token to toggle targeting
                    if (isPlayerView && onToggleTarget && token.type !== 'player' && token.combatantId) {
                      onToggleTarget(token.combatantId);
                      return;
                    }
                    // Double-tap detection for touch on player view
                    if (isPlayerView && onPlayerTokenDoubleTap && token.type === 'player' && !activeAoe) {
                      const now = Date.now();
                      const last = lastTapRef.current;
                      if (last && last.tokenId === token.id && now - last.time < 400) {
                        lastTapRef.current = null;
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (rect) {
                          const screenX = rect.left + token.x * stageScale + stagePos.x;
                          const screenY = rect.top + token.y * stageScale + stagePos.y;
                          onPlayerTokenDoubleTap(token.id, screenX, screenY);
                        }
                        return;
                      }
                      lastTapRef.current = { tokenId: token.id, time: now };
                    }
                  }}
                >
                  <Circle
                    radius={r}
                    fill={token.avatar ? "transparent" : token.color}
                    stroke={token.color}
                    strokeWidth={2 * tokenScale}
                    opacity={(token.invisible || token.illusory) ? 0.5 : token.hidden ? 0.4 : 1}
                    dash={(token.invisible || token.illusory) ? [6 * tokenScale, 4 * tokenScale] : undefined}
                    perfectDrawEnabled={false}
                  />
                  {/* Engaged range ring — shown when within 5ft of an opposing token during combat. Dark halo behind red for contrast. */}
                  {engagedTokenIds.has(token.id) && (
                    <>
                      <Circle
                        radius={r + 5 / stageScale}
                        fill="transparent"
                        stroke="#000000"
                        strokeWidth={4 / stageScale}
                        opacity={0.5}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                      <Circle
                        radius={r + 5 / stageScale}
                        fill="transparent"
                        stroke="#FF4444"
                        strokeWidth={2 / stageScale}
                        opacity={0.9}
                        dash={[6 / stageScale, 4 / stageScale]}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    </>
                  )}
                  {selectedTokenIds.includes(token.id) && !isPlayerView && (
                    /* Inner rim — above drop shadow */
                    <Circle
                      radius={r + 1.5 * tokenScale}
                      fill=""
                      stroke="white"
                      strokeWidth={tokenScale}
                      opacity={token.hidden ? 0.4 : 1}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                  {tokensInAoe.has(token.id) && !activeAoe?.saveResults && (() => {
                    const hlRgb = getDamageRgb(activeAoe?.damageType);
                    return <>
                      <Circle
                        radius={r + 4 * tokenScale}
                        fill=""
                        stroke={`rgba(${hlRgb}, 0.4)`}
                        strokeWidth={3 * tokenScale}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                      <Circle
                        radius={r + 3 * tokenScale}
                        fill=""
                        stroke={`rgba(${hlRgb}, 0.9)`}
                        strokeWidth={2.5 * tokenScale}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    </>;
                  })()}
                  {/* Persistent active-turn ring */}
                  {propActiveCombatantId && (() => {
                    const activeComb = activeCombatants.find(c => c.id === propActiveCombatantId);
                    if (!activeComb) return null;
                    const isActiveToken = token.combatantId === activeComb.sourceCombatantId || token.combatantId === activeComb.id;
                    if (!isActiveToken) return null;
                    const ringColor = '#fbbf24';
                    return <ActiveTurnRing radius={r} tokenScale={tokenScale} color={ringColor} />;
                  })()}
                  {/* Active turn indicator — 4 chevrons zoom in and fade */}
                  {turnFlashCombatantId && (() => {
                    const activeComb = activeCombatants.find(c => c.id === turnFlashCombatantId);
                    if (!activeComb) return null;
                    const isActiveToken = token.combatantId === activeComb.sourceCombatantId || token.combatantId === activeComb.id;
                    if (!isActiveToken) return null;
                    return <TurnIndicatorChevrons key={turnFlashCombatantId} radius={r} tokenScale={tokenScale} />;
                  })()}
                  {/* Target ring for targeted monsters */}
                  {targetedCombatantIds && token.combatantId && targetedCombatantIds.has(token.combatantId) && (
                    <TargetRing radius={r} tokenScale={tokenScale} />
                  )}
                  {/* Condition indicator — small white dot on the outer ring */}
                  {conditionedTokenIds.has(token.id) && (
                    <Circle
                      x={r * 0.707}
                      y={-r * 0.707}
                      radius={3.5 * tokenScale}
                      fill="white"
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={tokenScale}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                  {token.avatar && (
                    <Group
                      opacity={(token.invisible || token.illusory) ? 0.5 : token.hidden ? 0.4 : 1}
                      rotation={
                        playerSides?.[token.summonedBy ?? token.combatantId ?? ''] === 'top' ? 180 :
                        (isPlayerView && (token.type === 'enemy' || token.type === 'npc')) ? 90 : 0
                      }
                      listening={false}
                    >
                      <TokenAvatar
                        url={token.avatar}
                        radius={r - tokenScale}
                      />
                    </Group>
                  )}
                  {/* Dead overlay — black tint + skull when at 0 HP */}
                  {deadTokenIds.has(token.id) && (() => {
                    const s = r / 28;
                    const ox = -12 * s;
                    const oy = -12 * s;
                    return (
                      <Group listening={false}>
                        <Circle
                          radius={r - tokenScale}
                          fill="rgba(0, 0, 0, 0.72)"
                          perfectDrawEnabled={false}
                        />
                        {/* Skull body + jaw */}
                        <Path
                          data="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth={1.5}
                          fill="rgba(255,255,255,0.18)"
                          lineCap="round"
                          lineJoin="round"
                          scale={{ x: s, y: s }}
                          x={ox}
                          y={oy}
                          perfectDrawEnabled={false}
                        />
                        {/* Nose */}
                        <Path
                          data="m12.5 17-.5-1-.5 1h1z"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth={1.5}
                          fill="rgba(255,255,255,0.9)"
                          lineCap="round"
                          lineJoin="round"
                          scale={{ x: s, y: s }}
                          x={ox}
                          y={oy}
                          perfectDrawEnabled={false}
                        />
                        {/* Left eye */}
                        <Circle
                          x={9 * s + ox}
                          y={12 * s + oy}
                          radius={s}
                          fill="rgba(255,255,255,0.9)"
                          perfectDrawEnabled={false}
                        />
                        {/* Right eye */}
                        <Circle
                          x={15 * s + ox}
                          y={12 * s + oy}
                          radius={s}
                          fill="rgba(255,255,255,0.9)"
                          perfectDrawEnabled={false}
                        />
                      </Group>
                    );
                  })()}
                  {/* Bloodied overlay — red tint when at or below half HP */}
                  {bloodiedTokenIds.has(token.id) && (
                    <Circle
                      radius={r - tokenScale}
                      fill="rgba(220, 38, 38, 0.35)"
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                  {token.hidden && (
                    <Path
                      data="M9.88 9.88l-3.29-3.29m7.53 7.53l3.29 3.29M3 3l18 18M10.37 4.37a11 11 0 0 1 10.63 7.63 11 11 0 0 1-7.01 6.14m-3.99-.14A11 11 0 0 1 3 12a11 11 0 0 1 3.17-4.83m2.22 2.22a3 3 0 0 0 4.24 4.24"
                      stroke="white"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      scale={{ x: tokenRadius / 25, y: tokenRadius / 25 }}
                      x={-12 * (tokenRadius / 25)}
                      y={-12 * (tokenRadius / 25)}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                  {tokensInAoe.has(token.id) && activeAoe?.saveResults && (() => {
                    const combId = token.combatantId || '';
                    const sr = activeAoe.saveResults![combId];
                    if (!sr) return null;
                    const color = sr.success ? 'rgba(34, 197, 94,' : 'rgba(239, 68, 68,';
                    // Lucide icons are 24x24 viewbox; scale to ~60% of token diameter
                    const iconScale = (r * 1.2) / 24;
                    return (
                      <>
                        <Circle
                          radius={r}
                          fill={`${color} 0.45)`}
                        />
                        <Path
                          data={sr.success
                            ? 'M20 6L9 17l-5-5' // Lucide "Check"
                            : 'M18 6L6 18M6 6l12 12' // Lucide "X"
                          }
                          stroke="white"
                          strokeWidth={2.5}
                          lineCap="round"
                          lineJoin="round"
                          fill=""
                          scale={{ x: iconScale, y: iconScale }}
                          x={-12 * iconScale}
                          y={-12 * iconScale}
                        />
                      </>
                    );
                  })()}
                  {!isPlayerView && showTokenNames && (
                    <Text
                      text={token.name}
                      fontSize={Math.max(10, tokenRadius * 0.55)}
                      fill="white"
                      y={r + 5}
                      align="center"
                      width={tokenRadius * 5}
                      x={-tokenRadius * 2.5}
                      fontStyle="bold"
                      fontFamily="Inter"
                      opacity={(token.invisible || token.illusory) ? 0.5 : token.hidden ? 0.6 : 1}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                </Group>
              );
            })}
          </Layer>

          {/* ── Movement distance labels (combat only) — rendered ABOVE tokens ── */}
          {inCombat && Object.keys(movementPaths).length > 0 && (
            <Layer listening={false}>
              {Object.values(movementPaths).map(path => {
                if (path.points.length < 4) return null;
                const ppg = gridResolution?.pixelsPerGrid || 40;
                const distFeet = Math.round((path.totalDistancePx / ppg) * 5);
                const lastX = path.points[path.points.length - 2];
                const lastY = path.points[path.points.length - 1];
                const pathToken = tokenById.get(path.tokenId);
                const r = tokenRadius * (pathToken ? getTokenSizeMultiplier(pathToken.size) : 1);
                const combatant = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants]
                  .find(c => c.id === pathToken?.combatantId || c.sourceCombatantId === pathToken?.combatantId);
                const speedFt = combatant?.speed ?? null;
                const isOverSpeed = speedFt !== null && distFeet > speedFt;
                const fade = pathFadeProgress[path.tokenId] ?? 0;
                const isFullyFaded = fade >= 1;
                const nameFontSize = Math.max(10, tokenRadius * 0.55);
                const distLabelFontSize = isPlayerView
                  ? Math.max(12, tokenRadius * 0.6)
                  : Math.max(9, tokenRadius * 0.45);
                // When names are hidden (player view or DM setting), sit the label tight under the avatar
                let nameHeight = 0;
                if (!isPlayerView && showTokenNames) {
                  // Estimate wrapped name height: ~0.6 * fontSize per char width, Konva line-height ≈ 1.2×
                  const nameWidth = tokenRadius * 5;
                  const avgCharWidth = nameFontSize * 0.55;
                  const charsPerLine = Math.max(1, Math.floor(nameWidth / avgCharWidth));
                  const nameText = pathToken?.name || '';
                  const nameLines = Math.max(1, Math.ceil(nameText.length / charsPerLine));
                  nameHeight = nameLines * nameFontSize * 1.2;
                }
                const isTop = playerSides?.[pathToken?.combatantId ?? ''] === 'top';
                const labelCenterY = isTop
                  ? lastY + r + distLabelFontSize / 2 + 5
                  : lastY - r - distLabelFontSize / 2 - 5;
                return (
                  <Text
                    key={`dist-${path.tokenId}`}
                    x={lastX}
                    y={labelCenterY}
                    offsetX={tokenRadius * 2.5}
                    offsetY={distLabelFontSize / 2}
                    text={`${distFeet} ft`}
                    fontSize={distLabelFontSize}
                    fill={isOverSpeed ? '#ef4444' : 'rgba(255,255,255,0.7)'}
                    fontStyle="bold"
                    fontFamily="Inter"
                    align="center"
                    width={tokenRadius * 5}
                    rotation={isTop ? 180 : 0}
                    opacity={isFullyFaded ? 0.6 : 1}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                );
              })}
            </Layer>
          )}

          {/* ── AoE Casting Preview (DM mouse-follow) ── */}
          {castingSpell && castingMousePos && (() => {
            const ppg = gridResolution?.pixelsPerGrid || 40;
            const feetToPx = (ft: number) => (ft / 5) * ppg;
            const sizePx = feetToPx(castingSpell.aoeSize);
            const strokeW = 2 / stageScale;
            const castRgb = getDamageRgb(castingSpell.damageType);
            const fillColor = `rgba(${castRgb}, 0.25)`;
            const strokeColor = `rgba(${castRgb}, 0.8)`;
            const angleRad = Math.atan2(castingMousePos.y - castingSpell.originY, castingMousePos.x - castingSpell.originX);
            const edgeX = castingSpell.originX + Math.cos(angleRad) * castingSpell.casterRadiusPx;
            const edgeY = castingSpell.originY + Math.sin(angleRad) * castingSpell.casterRadiusPx;

            // For self-origin spells, the AoE is anchored at caster edge
            const isSelfOrigin = !!castingSpell.selfOrigin;
            const targetX = isSelfOrigin ? edgeX : castingMousePos.x;
            const targetY = isSelfOrigin ? edgeY : castingMousePos.y;
            // Range line goes to far edge of AoE for anchored spells
            const isDirectionalCast = castingSpell.aoeType === 'cone' || castingSpell.aoeType === 'line';
            const castReach = (isDirectionalCast || !isSelfOrigin)
              ? 0 // for non-self, range line just goes to targetX/Y; for cone/line, it's from edge
              : sizePx * 2; // self-origin sphere/cube: far edge
            const rangeLineEndX = isSelfOrigin
              ? castingSpell.originX + Math.cos(angleRad) * (castingSpell.casterRadiusPx + (isDirectionalCast ? sizePx : sizePx * 2))
              : castingMousePos.x;
            const rangeLineEndY = isSelfOrigin
              ? castingSpell.originY + Math.sin(angleRad) * (castingSpell.casterRadiusPx + (isDirectionalCast ? sizePx : sizePx * 2))
              : castingMousePos.y;

            // Range line: caster edge → target point
            const distPx = Math.sqrt((rangeLineEndX - castingSpell.originX) ** 2 + (rangeLineEndY - castingSpell.originY) ** 2) - castingSpell.casterRadiusPx;
            const rangeFeet = Math.max(0, Math.round((distPx / ppg) * 5));
            const midX = (edgeX + rangeLineEndX) / 2;
            const midY = (edgeY + rangeLineEndY) / 2;
            const labelFontSize = 14 / stageScale;

            return (
              <Layer listening={false}>
                {/* Range line (only for freely-placed spells, not self-origin or directional cones/lines) */}
                {!isSelfOrigin && !isDirectionalCast && (
                  <>
                    <Line
                      points={[edgeX, edgeY, rangeLineEndX, rangeLineEndY]}
                      stroke="rgba(255, 255, 255, 0.4)"
                      strokeWidth={1.5 / stageScale}
                      dash={[4 / stageScale, 4 / stageScale]}
                    />
                    <Text
                      x={midX}
                      y={playerSides?.[castingSpell.casterId ?? ''] === 'top' ? midY + labelFontSize * 1.5 : midY - labelFontSize * 1.5}
                      offsetY={labelFontSize / 2}
                      rotation={playerSides?.[castingSpell.casterId ?? ''] === 'top' ? 180 : 0}
                      text={`${rangeFeet} ft`}
                      fontSize={labelFontSize}
                      fill="white"
                      fontStyle="bold"
                      fontFamily="Inter"
                      align="center"
                      offsetX={0}
                      listening={false}
                    />
                  </>
                )}

                {(castingSpell.aoeType === 'sphere' || castingSpell.aoeType === 'cylinder') && (
                  <Circle x={targetX} y={targetY} radius={sizePx}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />
                )}
                {castingSpell.aoeType === 'cube' && (() => {
                  if (isSelfOrigin) {
                    // Self-origin cube: near edge at caster token edge, rotated along angle
                    const perpX = Math.cos(angleRad + Math.PI / 2) * sizePx / 2;
                    const perpY = Math.sin(angleRad + Math.PI / 2) * sizePx / 2;
                    const fwdX = Math.cos(angleRad) * sizePx;
                    const fwdY = Math.sin(angleRad) * sizePx;
                    const points = [
                      -perpX, -perpY,
                      perpX, perpY,
                      perpX + fwdX, perpY + fwdY,
                      -perpX + fwdX, -perpY + fwdY,
                    ];
                    return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                  }
                  return <Rect x={targetX - sizePx / 2} y={targetY - sizePx / 2} width={sizePx} height={sizePx}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
                {castingSpell.aoeType === 'cone' && (() => {
                  const halfAngle = (53 / 2) * (Math.PI / 180);
                  const points = [
                    0, 0,
                    Math.cos(angleRad - halfAngle) * sizePx, Math.sin(angleRad - halfAngle) * sizePx,
                    Math.cos(angleRad - halfAngle / 2) * sizePx, Math.sin(angleRad - halfAngle / 2) * sizePx,
                    Math.cos(angleRad) * sizePx, Math.sin(angleRad) * sizePx,
                    Math.cos(angleRad + halfAngle / 2) * sizePx, Math.sin(angleRad + halfAngle / 2) * sizePx,
                    Math.cos(angleRad + halfAngle) * sizePx, Math.sin(angleRad + halfAngle) * sizePx,
                  ];
                  return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
                {castingSpell.aoeType === 'line' && (() => {
                  const halfWidth = feetToPx(5) / 2;
                  const perpX = Math.cos(angleRad + Math.PI / 2) * halfWidth;
                  const perpY = Math.sin(angleRad + Math.PI / 2) * halfWidth;
                  const endX = Math.cos(angleRad) * sizePx;
                  const endY = Math.sin(angleRad) * sizePx;
                  const points = [-perpX, -perpY, endX - perpX, endY - perpY, endX + perpX, endY + perpY, perpX, perpY];
                  return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
              </Layer>
            );
          })()}

          {/* ── AoE Placed Layer (draggable spell token) ── */}
          {placedAoe && (() => {
            const ppg = gridResolution?.pixelsPerGrid || 40;
            const feetToPx = (ft: number) => (ft / 5) * ppg;
            const sizePx = feetToPx(placedAoe.aoeSize);
            const strokeW = 2 / stageScale;
            const hasSaveResults = !!placedAoe.saveResults;
            const placedRgb = getDamageRgb(placedAoe.damageType);
            const fillColor = hasSaveResults ? 'transparent' : `rgba(${placedRgb}, 0.35)`;
            const strokeColor = `rgba(${placedRgb}, 0.8)`;

            // Live-update position during drag so range line tracks in real-time
            const handleSphereDragMove = (e: any) => {
              const node = e.target;
              setPlacedAoe(prev => {
                if (!prev) return null;
                return { ...prev, x: node.x(), y: node.y() };
              });
            };

            const handleAoeDragEnd = (e: any) => {
              const node = e.target;
              setPlacedAoe(prev => {
                if (!prev) return null;
                return { ...prev, x: node.x(), y: node.y() };
              });
            };

            const handleCubeDragMove = (e: any) => {
              const node = e.target;
              setPlacedAoe(prev => {
                if (!prev) return null;
                return { ...prev, x: node.x() + sizePx, y: node.y() + sizePx };
              });
            };

            const handleCubeDragEnd = (e: any) => {
              const node = e.target;
              setPlacedAoe(prev => {
                if (!prev) return null;
                return { ...prev, x: node.x() + sizePx, y: node.y() + sizePx };
              });
            };

            // For player view: dragging a cone/line rotates it around the caster
            const handleDirectionalDragMove = (e: any) => {
              if (!isPlayerView) return;
              const node = e.target;
              const dragX = node.x();
              const dragY = node.y();
              // Calculate new angle from caster origin to drag position
              const newAngle = Math.atan2(dragY - placedAoe.originY, dragX - placedAoe.originX);
              // Snap node back to the caster edge at the new angle
              const newEdgeX = placedAoe.originX + Math.cos(newAngle) * placedAoe.casterRadiusPx;
              const newEdgeY = placedAoe.originY + Math.sin(newAngle) * placedAoe.casterRadiusPx;
              node.x(newEdgeX);
              node.y(newEdgeY);
              // Live-update the angle so the shape redraws pointing the right way
              setPlacedAoe(prev => prev ? { ...prev, angle: newAngle * (180 / Math.PI) } : null);
            };

            const handleDirectionalDragEnd = (e: any) => {
              if (isPlayerView) {
                // Angle already updated via onDragMove — just ensure node is at edge
                const node = e.target;
                const aRad = (placedAoe.angle) * (Math.PI / 180);
                const newEdgeX = placedAoe.originX + Math.cos(aRad) * placedAoe.casterRadiusPx;
                const newEdgeY = placedAoe.originY + Math.sin(aRad) * placedAoe.casterRadiusPx;
                node.x(newEdgeX);
                node.y(newEdgeY);
                return;
              }
              const node = e.target;
              setPlacedAoe(prev => {
                if (!prev) return null;
                const aRad = prev.angle * (Math.PI / 180);
                const origEdgeX = prev.originX + Math.cos(aRad) * prev.casterRadiusPx;
                const origEdgeY = prev.originY + Math.sin(aRad) * prev.casterRadiusPx;
                const dx = node.x() - origEdgeX;
                const dy = node.y() - origEdgeY;
                return { ...prev, x: prev.x + dx, y: prev.y + dy, originX: prev.originX + dx, originY: prev.originY + dy };
              });
            };

            const angleRad = placedAoe.angle * (Math.PI / 180);
            const edgeX = placedAoe.originX + Math.cos(angleRad) * placedAoe.casterRadiusPx;
            const edgeY = placedAoe.originY + Math.sin(angleRad) * placedAoe.casterRadiusPx;

            // Spells that rotate around the caster: cone, line, or any self-origin spell
            const isAnchored = placedAoe.aoeType === 'cone' || placedAoe.aoeType === 'line' || !!placedAoe.selfOrigin;
            // For anchored spells, range line goes to the far edge of the AoE
            // Cone/line: sizePx is length from edge. Sphere/cube self-origin: sizePx*2 is far edge (near edge at token, far edge at near+2*size)
            const anchoredReach = (placedAoe.aoeType === 'cone' || placedAoe.aoeType === 'line')
              ? sizePx
              : sizePx * 2; // sphere radius*2 or cube side length from token edge
            const rangeTargetX = isAnchored
              ? placedAoe.originX + Math.cos(angleRad) * (placedAoe.casterRadiusPx + anchoredReach)
              : placedAoe.x;
            const rangeTargetY = isAnchored
              ? placedAoe.originY + Math.sin(angleRad) * (placedAoe.casterRadiusPx + anchoredReach)
              : placedAoe.y;
            const rangeEdgeAngle = Math.atan2(rangeTargetY - placedAoe.originY, rangeTargetX - placedAoe.originX);
            const rangeEdgeX = placedAoe.originX + Math.cos(rangeEdgeAngle) * placedAoe.casterRadiusPx;
            const rangeEdgeY = placedAoe.originY + Math.sin(rangeEdgeAngle) * placedAoe.casterRadiusPx;
            const rangeDistPx = Math.sqrt((rangeTargetX - placedAoe.originX) ** 2 + (rangeTargetY - placedAoe.originY) ** 2) - placedAoe.casterRadiusPx;
            const rangeFeet = Math.max(0, Math.round((rangeDistPx / ppg) * 5));
            const rangeMidX = (rangeEdgeX + rangeTargetX) / 2;
            const rangeMidY = (rangeEdgeY + rangeTargetY) / 2;
            const rangeLabelSize = 14 / stageScale;

            const fireballCx = placedAoe.selfOrigin
              ? placedAoe.originX + Math.cos(angleRad) * (placedAoe.casterRadiusPx + sizePx)
              : placedAoe.x;
            const fireballCy = placedAoe.selfOrigin
              ? placedAoe.originY + Math.sin(angleRad) * (placedAoe.casterRadiusPx + sizePx)
              : placedAoe.y;

            return (
              <>
              <Layer listening={!!isPlayerView}>
                {/* Range line moved to overlay layer above tokens — see below */}

                {/* Emanation — non-draggable circle locked to caster origin */}
                {placedAoe.aoeType === 'emanation' && (
                  <>
                    <Circle
                      x={placedAoe.originX}
                      y={placedAoe.originY}
                      radius={sizePx + placedAoe.casterRadiusPx}
                      fill={isThunderEmanationSpell(placedAoe.name) ? 'transparent' : fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      dash={[6 / stageScale, 4 / stageScale]}
                      draggable={false}
                      listening={false}
                    />
                    {isThunderEmanationSpell(placedAoe.name) && (
                      <Circle
                        x={placedAoe.originX}
                        y={placedAoe.originY}
                        radius={sizePx + placedAoe.casterRadiusPx}
                        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                        fillRadialGradientStartRadius={0}
                        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                        fillRadialGradientEndRadius={sizePx + placedAoe.casterRadiusPx}
                        fillRadialGradientColorStops={THUNDER_GRADIENT}
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    )}
                  </>
                )}

                {/* Sphere / Cylinder — circle at target position */}
                {(placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (() => {
                  // Self-origin: position at edge offset along angle; otherwise free position
                  const cx = placedAoe.selfOrigin
                    ? placedAoe.originX + Math.cos(angleRad) * (placedAoe.casterRadiusPx + sizePx)
                    : placedAoe.x;
                  const cy = placedAoe.selfOrigin
                    ? placedAoe.originY + Math.sin(angleRad) * (placedAoe.casterRadiusPx + sizePx)
                    : placedAoe.y;
                  return (
                    <>
                      <Circle
                        x={cx}
                        y={cy}
                        radius={sizePx}
                        fill={isFireSphereSpell(placedAoe.name) || isIceSphereSpell(placedAoe.name) || isPoisonSphereSpell(placedAoe.name) || isAcidSphereSpell(placedAoe.name) || isNecroticSphereSpell(placedAoe.name) || isThunderSphereSpell(placedAoe.name) || isLightningSphereSpell(placedAoe.name) || getSphereElement(placedAoe.name) ? 'transparent' : fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeW}
                        dash={[6 / stageScale, 4 / stageScale]}
                        draggable={!!isPlayerView}
                        onDragMove={placedAoe.selfOrigin ? handleDirectionalDragMove : handleSphereDragMove}
                        onDragEnd={placedAoe.selfOrigin ? handleDirectionalDragEnd : handleAoeDragEnd}
                      />
                      {isFireSphereSpell(placedAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={[0, 'rgba(255,160,20,0.72)', 0.45, 'rgba(255,90,0,0.42)', 0.8, 'rgba(200,50,0,0.18)', 1, 'rgba(150,30,0,0)']}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {isIceSphereSpell(placedAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={[0, 'rgba(220,240,255,0.55)', 0.5, 'rgba(150,210,240,0.32)', 0.85, 'rgba(80,160,210,0.14)', 1, 'rgba(50,110,170,0)']}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {(isPoisonSphereSpell(placedAoe.name) || isAcidSphereSpell(placedAoe.name) || isNecroticSphereSpell(placedAoe.name)) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={isNecroticSphereSpell(placedAoe.name) ? NECROTIC_GRADIENT : isAcidSphereSpell(placedAoe.name) ? ACID_GRADIENT : POISON_GRADIENT}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {isLightningSphereSpell(placedAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={LIGHTNING_GRADIENT}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {isThunderSphereSpell(placedAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={THUNDER_GRADIENT}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {getSphereElement(placedAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={ELEMENT_STYLES[getSphereElement(placedAoe.name)!].gradient}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                    </>
                  );
                })()}

                {/* Cube — square at target position */}
                {placedAoe.aoeType === 'cube' && (() => {
                  if (placedAoe.selfOrigin) {
                    // Self-origin cube: near edge touches caster token edge, rotated along angle
                    // perpendicular direction for the cube's width (sizePx/2 on each side = sizePx total)
                    const perpX = Math.cos(angleRad + Math.PI / 2) * sizePx / 2;
                    const perpY = Math.sin(angleRad + Math.PI / 2) * sizePx / 2;
                    // forward direction for the cube's depth (sizePx = full cube side)
                    const fwdX = Math.cos(angleRad) * sizePx;
                    const fwdY = Math.sin(angleRad) * sizePx;
                    const points = [
                      -perpX, -perpY,             // near-left corner
                      perpX, perpY,               // near-right corner
                      perpX + fwdX, perpY + fwdY, // far-right corner
                      -perpX + fwdX, -perpY + fwdY, // far-left corner
                    ];
                    return (
                      <Line
                        x={edgeX}
                        y={edgeY}
                        points={points}
                        closed
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={strokeW}
                        dash={[6 / stageScale, 4 / stageScale]}
                        draggable={!!isPlayerView}
                        onDragMove={handleDirectionalDragMove}
                        onDragEnd={handleDirectionalDragEnd}
                      />
                    );
                  }
                  // Free-positioned cube (non-self spells)
                  return (
                    <Rect
                      x={placedAoe.x - sizePx / 2}
                      y={placedAoe.y - sizePx / 2}
                      width={sizePx}
                      height={sizePx}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      dash={[6 / stageScale, 4 / stageScale]}
                      draggable={!!isPlayerView}
                      onDragMove={handleCubeDragMove}
                      onDragEnd={handleCubeDragEnd}
                    />
                  );
                })()}

                {/* Cone — wedge from token edge toward target */}
                {placedAoe.aoeType === 'cone' && (() => {
                  const halfAngle = (53 / 2) * (Math.PI / 180);
                  const points = [
                    0, 0,
                    Math.cos(angleRad - halfAngle) * sizePx,
                    Math.sin(angleRad - halfAngle) * sizePx,
                    Math.cos(angleRad - halfAngle / 2) * sizePx,
                    Math.sin(angleRad - halfAngle / 2) * sizePx,
                    Math.cos(angleRad) * sizePx,
                    Math.sin(angleRad) * sizePx,
                    Math.cos(angleRad + halfAngle / 2) * sizePx,
                    Math.sin(angleRad + halfAngle / 2) * sizePx,
                    Math.cos(angleRad + halfAngle) * sizePx,
                    Math.sin(angleRad + halfAngle) * sizePx,
                  ];
                  return (
                    <Line
                      x={edgeX}
                      y={edgeY}
                      points={points}
                      closed
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      dash={[6 / stageScale, 4 / stageScale]}
                      draggable={!!isPlayerView}
                      onDragMove={handleDirectionalDragMove}
                      onDragEnd={handleDirectionalDragEnd}
                    />
                  );
                })()}

                {/* Line — rectangle from token edge toward target */}
                {placedAoe.aoeType === 'line' && (() => {
                  const halfWidth = feetToPx(5) / 2;
                  const perpX = Math.cos(angleRad + Math.PI / 2) * halfWidth;
                  const perpY = Math.sin(angleRad + Math.PI / 2) * halfWidth;
                  const endX = Math.cos(angleRad) * sizePx;
                  const endY = Math.sin(angleRad) * sizePx;
                  const points = [
                    -perpX, -perpY,
                    endX - perpX, endY - perpY,
                    endX + perpX, endY + perpY,
                    perpX, perpY,
                  ];
                  return (
                    <Line
                      x={edgeX}
                      y={edgeY}
                      points={points}
                      closed
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      dash={[6 / stageScale, 4 / stageScale]}
                      draggable={!!isPlayerView}
                      onDragMove={handleDirectionalDragMove}
                      onDragEnd={handleDirectionalDragEnd}
                    />
                  );
                })()}
              </Layer>
              {isFireSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <FireballParticles radius={sizePx} />
                  </Group>
                </Layer>
              )}
              {isFireConeSpell(placedAoe.name) && placedAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group
                    x={edgeX}
                    y={edgeY}
                    rotation={(angleRad * 180) / Math.PI}
                  >
                    <FireConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {isFireLineSpell(placedAoe.name) && placedAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group
                    x={edgeX}
                    y={edgeY}
                    rotation={(angleRad * 180) / Math.PI}
                  >
                    <FireLineParticles length={sizePx} width={feetToPx(5)} />
                  </Group>
                </Layer>
              )}
              {isFireCubeSpell(placedAoe.name) && placedAoe.aoeType === 'cube' && (
                <Layer listening={false}>
                  {placedAoe.selfOrigin ? (
                    <Group
                      x={edgeX + Math.cos(angleRad) * sizePx / 2}
                      y={edgeY + Math.sin(angleRad) * sizePx / 2}
                    >
                      <FireCubeParticles size={sizePx} />
                    </Group>
                  ) : (
                    <Group x={placedAoe.x} y={placedAoe.y}>
                      <FireCubeParticles size={sizePx} />
                    </Group>
                  )}
                </Layer>
              )}
              {isIceSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <IceSphereParticles radius={sizePx} />
                  </Group>
                </Layer>
              )}
              {isIceConeSpell(placedAoe.name) && placedAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                    <IceConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {isWindConeSpell(placedAoe.name) && placedAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                    <WindConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {isPoisonSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <RadialAoEParticles radius={sizePx} palette={POISON_PALETTE} glow="#65a30d" inwardChance={0.25} basePeriod={2000} />
                  </Group>
                </Layer>
              )}
              {isAcidSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <RadialAoEParticles radius={sizePx} palette={ACID_PALETTE} glow="#a3e635" inwardChance={0.4} basePeriod={1500} />
                  </Group>
                </Layer>
              )}
              {isNecroticSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <RadialAoEParticles radius={sizePx} palette={NECROTIC_PALETTE} glow="#7e22ce" inwardChance={0.5} basePeriod={2200} shape="triangle" />
                  </Group>
                </Layer>
              )}
              {isAcidLineSpell(placedAoe.name) && placedAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                    <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={ACID_PALETTE} glow="#a3e635" />
                  </Group>
                </Layer>
              )}
              {isNecroticConeSpell(placedAoe.name) && placedAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                    <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={NECROTIC_PALETTE} glow="#7e22ce" shape="triangle" />
                  </Group>
                </Layer>
              )}
              {isThunderEmanationSpell(placedAoe.name) && placedAoe.aoeType === 'emanation' && (
                <Layer listening={false}>
                  <Group x={placedAoe.originX} y={placedAoe.originY}>
                    <ThunderShockwaveParticles radius={sizePx + placedAoe.casterRadiusPx} />
                  </Group>
                </Layer>
              )}
              {isLightningSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <LightningSphereParticles radius={sizePx} />
                  </Group>
                </Layer>
              )}
              {isLightningLineSpell(placedAoe.name) && placedAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                    <LightningLineParticles length={sizePx} width={feetToPx(5)} />
                  </Group>
                </Layer>
              )}
              {isThunderSphereSpell(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (
                <Layer listening={false}>
                  <Group x={fireballCx} y={fireballCy}>
                    <ThunderShockwaveParticles radius={sizePx} />
                  </Group>
                </Layer>
              )}
              {isThunderCubeSpell(placedAoe.name) && placedAoe.aoeType === 'cube' && (() => {
                const groupX = placedAoe.selfOrigin ? edgeX + Math.cos(angleRad) * sizePx / 2 : placedAoe.x;
                const groupY = placedAoe.selfOrigin ? edgeY + Math.sin(angleRad) * sizePx / 2 : placedAoe.y;
                return (
                  <Layer listening={false}>
                    <Group x={groupX} y={groupY}>
                      <ThunderCubeParticles size={sizePx} />
                    </Group>
                  </Layer>
                );
              })()}
              {getSphereElement(placedAoe.name) && (placedAoe.aoeType === 'sphere' || placedAoe.aoeType === 'cylinder') && (() => {
                const s = ELEMENT_STYLES[getSphereElement(placedAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={fireballCx} y={fireballCy}>
                      <RadialAoEParticles radius={sizePx} palette={s.palette} glow={s.glow} basePeriod={s.basePeriod} inwardChance={s.inwardChance} shape={s.shape} />
                    </Group>
                  </Layer>
                );
              })()}
              {getConeElement(placedAoe.name) && placedAoe.aoeType === 'cone' && (() => {
                const s = ELEMENT_STYLES[getConeElement(placedAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                      <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={s.palette} glow={s.glow} shape={s.shape} />
                    </Group>
                  </Layer>
                );
              })()}
              {getLineElement(placedAoe.name) && placedAoe.aoeType === 'line' && (() => {
                const s = ELEMENT_STYLES[getLineElement(placedAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={edgeX} y={edgeY} rotation={(angleRad * 180) / Math.PI}>
                      <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={s.palette} glow={s.glow} />
                    </Group>
                  </Layer>
                );
              })()}
              {getCubeElement(placedAoe.name) && placedAoe.aoeType === 'cube' && (() => {
                const s = ELEMENT_STYLES[getCubeElement(placedAoe.name)!];
                const groupX = placedAoe.selfOrigin ? edgeX + Math.cos(angleRad) * sizePx / 2 : placedAoe.x;
                const groupY = placedAoe.selfOrigin ? edgeY + Math.sin(angleRad) * sizePx / 2 : placedAoe.y;
                return (
                  <Layer listening={false}>
                    <Group x={groupX} y={groupY}>
                      <CubeAoEParticles size={sizePx} palette={s.palette} glow={s.glow} />
                    </Group>
                  </Layer>
                );
              })()}
              {placedAoe.name === 'Gust of Wind' && placedAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group
                    x={edgeX}
                    y={edgeY}
                    rotation={(angleRad * 180) / Math.PI}
                  >
                    <GustOfWindParticles length={sizePx} width={feetToPx(5)} />
                  </Group>
                </Layer>
              )}
              </>
            );
          })()}


          {/* ── Remote AoE (from the other screen) ── */}
          {remoteAoe && <RemoteAoeLayers remoteAoe={remoteAoe} stageScale={stageScale} ppg={gridResolution?.pixelsPerGrid || 40} />}

          {/* ── Portal Icons — below fog layer, pans 1:1 with canvas ── */}
          {portals && portals.length > 0 && (
            <Layer>
              {portals.map(portal => {
                const isSecret = portal.portalType === 'secret';
                // Secret doors hidden from players entirely
                if (isPlayerView && isSecret) return null;
                const midX = (portal.bounds[0].x + portal.bounds[1].x) / 2;
                const midY = (portal.bounds[0].y + portal.bounds[1].y) / 2;
                const isWindow = portal.portalType === 'window';
                const iconSize = tokenRadius * 0.82;
                const s = iconSize / 24; // scale from 24×24 viewBox

                // Colors
                let iconColor: string;
                let bgFill: string;
                let bgStroke: string;
                if (isSecret) {
                  iconColor = '#e879f9';
                  bgFill = 'rgba(168,85,247,0.35)';
                  bgStroke = 'rgba(232,121,249,0.6)';
                } else if (portal.locked && !isPlayerView) {
                  iconColor = '#fbbf24';
                  bgFill = 'rgba(251,191,36,0.25)';
                  bgStroke = 'rgba(251,191,36,0.6)';
                } else if (portal.closed) {
                  iconColor = '#ffffff';
                  bgFill = 'rgba(255,255,255,0.15)';
                  bgStroke = 'rgba(255,255,255,0.35)';
                } else if (isWindow) {
                  iconColor = '#60a5fa';
                  bgFill = 'rgba(37,99,235,0.45)';
                  bgStroke = 'rgba(96,165,250,0.5)';
                } else {
                  iconColor = '#16a34a';
                  bgFill = 'rgba(22,101,52,0.45)';
                  bgStroke = 'rgba(22,163,74,0.5)';
                }

                const nodes = isSecret
                  ? (portal.closed ? DOOR_CLOSED_NODES : DOOR_OPEN_NODES)
                  : isWindow
                    ? (portal.closed ? BLINDS_NODES : GRID2X2_NODES)
                    : (portal.closed ? DOOR_CLOSED_NODES : DOOR_OPEN_NODES);

                return (
                  <Group
                    key={`portal-icon-${portal.id}`}
                    x={midX - iconSize / 2}
                    y={midY - iconSize / 2}
                    scaleX={s}
                    scaleY={s}
                    onClick={(e) => { e.cancelBubble = true; setPortalContextMenu(null); if (!isPlayerView && wallErasing && !wallPainting) { onPortalsChange?.((portals || []).filter(p => p.id !== portal.id)); return; } if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                    onTap={(e) => { e.cancelBubble = true; }}
                    onTouchStart={(e) => { e.cancelBubble = true; }}
                    onTouchEnd={(e) => { e.cancelBubble = true; setPortalContextMenu(null); if (!isPlayerView && wallErasing && !wallPainting) { onPortalsChange?.((portals || []).filter(p => p.id !== portal.id)); return; } if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                    onContextMenu={!isPlayerView ? (e) => {
                      e.evt.preventDefault();
                      e.cancelBubble = true;
                      const stage = e.target.getStage();
                      const pos = stage?.getPointerPosition();
                      if (!pos) return;
                      setPortalContextMenu({
                        screenX: pos.x,
                        screenY: pos.y,
                        clientY: e.evt.clientY,
                        portalId: portal.id,
                        portalType: (portal.portalType ?? 'door') as 'door' | 'window' | 'secret',
                        locked: !!portal.locked,
                      });
                    } : undefined}
                  >
                    {/* Background pill */}
                    <Circle x={12} y={12} radius={13.5} fill={bgFill} stroke={bgStroke} strokeWidth={1 / s} />
                    {/* Icon paths */}
                    {nodes.map((node, i) => {
                      const [type, props] = node;
                      const sw = 1.5;
                      if (type === 'path') return (
                        <Path key={i} data={props.d} stroke={iconColor} strokeWidth={sw} fillEnabled={false} lineCap="round" lineJoin="round" listening={false} />
                      );
                      if (type === 'rect') return (
                        <Rect key={i} x={parseFloat(props.x)} y={parseFloat(props.y)} width={parseFloat(props.width)} height={parseFloat(props.height)} cornerRadius={props.rx ? parseFloat(props.rx) : 0} stroke={iconColor} strokeWidth={sw} fillEnabled={false} listening={false} />
                      );
                      if (type === 'circle') return (
                        <Circle key={i} x={parseFloat(props.cx)} y={parseFloat(props.cy)} radius={parseFloat(props.r)} stroke={iconColor} strokeWidth={sw} fillEnabled={false} listening={false} />
                      );
                      return null;
                    })}
                  </Group>
                );
              })}
            </Layer>
          )}

          {/* Viewpoints — below darkness layer on player view, like doors/windows */}
          {(viewpoints ?? []).filter(vp => !isPlayerView || !vp.isHidden).length > 0 && (
            <Layer>
              {(viewpoints ?? []).filter(vp => !isPlayerView || !vp.isHidden).map(vp => {
                const isInRange = viewpointProximity.has(vp.id);
                const isActive = activeViewpointId === vp.id;
                const iconSize = tokenRadius * 1.3;
                const s = iconSize / 24;
                let bgFill: string;
                let bgStroke: string;
                let iconColor: string;
                if (!isPlayerView && vp.isHidden) {
                  bgFill = 'rgba(88,28,135,0.05)';
                  bgStroke = 'rgba(126,34,206,0.15)';
                  iconColor = 'rgba(216,180,254,0.15)';
                } else if (isActive) {
                  bgFill = 'rgba(126,34,206,0.6)';
                  bgStroke = '#c026d3';
                  iconColor = '#f0abfc';
                } else if (!isPlayerView || isInRange) {
                  bgFill = 'rgba(88,28,135,0.55)';
                  bgStroke = '#7e22ce';
                  iconColor = '#d8b4fe';
                } else {
                  bgFill = 'rgba(88,28,135,0.15)';
                  bgStroke = 'rgba(126,34,206,0.3)';
                  iconColor = 'rgba(216,180,254,0.3)';
                }
                return (
                  <Group
                    key={vp.id}
                    x={vp.x - iconSize / 2}
                    y={vp.y - iconSize / 2}
                    scaleX={s}
                    scaleY={s}
                    draggable={!isPlayerView}
                    onDragEnd={!isPlayerView ? (e) => handleViewpointDragEnd(vp.id, e) : undefined}
                    onClick={isPlayerView ? (e) => { e.cancelBubble = true; handleViewpointClick(vp); } : undefined}
                    onTap={isPlayerView ? (e) => { e.cancelBubble = true; handleViewpointClick(vp); } : undefined}
                    onContextMenu={!isPlayerView ? (e) => {
                      e.evt.preventDefault();
                      e.cancelBubble = true;
                      const stage = e.target.getStage();
                      const pos = stage?.getPointerPosition();
                      if (!pos) return;
                      setViewpointContextMenu({
                        screenX: pos.x,
                        screenY: pos.y,
                        clientY: e.evt.clientY,
                        viewpointId: vp.id,
                      });
                    } : undefined}
                  >
                    <Circle x={12} y={12} radius={13.5} fill={bgFill} stroke={bgStroke} strokeWidth={isActive ? 2 / s : 1 / s} />
                    {VIEWPOINT_NODES.map((node, i) => {
                      const [type, props] = node;
                      const sw = 1.5;
                      if (type === 'path') return (
                        <Path key={i} data={props.d} stroke={iconColor} strokeWidth={sw} fillEnabled={false} lineCap="round" lineJoin="round" listening={false} />
                      );
                      if (type === 'circle') return (
                        <Circle key={i} x={parseFloat(props.cx)} y={parseFloat(props.cy)} radius={parseFloat(props.r)} fill={iconColor} listening={false} />
                      );
                      return null;
                    })}
                    {isActive && (
                      <Circle x={12} y={12} radius={15} fill="transparent" stroke="#d946ef" strokeWidth={1.5 / s} opacity={0.6} listening={false} />
                    )}
                  </Group>
                );
              })}
            </Layer>
          )}

          {/* ── Detect Magic: magic item notes below fog (player view only) ── */}
          {isPlayerView && detectMagicData && (() => {
            const casterToken = tokens.find(t => t.combatantId === detectMagicData.playerId);
            if (!casterToken) return null;
            const casterPos = livePlayerPos[casterToken.id] ?? casterToken;
            const rangePx = gridResolution
              ? (detectMagicData.rangeFt / 5) * gridResolution.pixelsPerGrid
              : detectMagicData.rangeFt * 4;

            // Filter magic notes within range of caster
            const magicNotes = mapNotes.filter(note => {
              if (note.type !== 'magic') return false;
              const dx = note.x - casterPos.x;
              const dy = note.y - casterPos.y;
              return Math.sqrt(dx * dx + dy * dy) <= rangePx;
            });
            if (magicNotes.length === 0) return null;
            const noteR = tokenRadius * 0.6;
            return (
              <Layer listening={false}>
                {magicNotes.map(note => (
                  <Group key={`magic-${note.id}`} x={note.x} y={note.y}>
                    <Circle
                      radius={noteR}
                      fill={getNoteColor('magic')}
                      stroke="rgba(34,211,238,0.6)"
                      strokeWidth={2 * tokenScale}
                      opacity={0.85}
                      perfectDrawEnabled={false}
                    />
                    <NoteMapIcon type="magic" />
                  </Group>
                ))}
              </Layer>
            );
          })()}

          {/* ── Detect Poison and Disease: poison/skull notes below fog (player view only) ── */}
          {isPlayerView && detectPoisonData && (() => {
            const casterToken = tokens.find(t => t.combatantId === detectPoisonData.playerId);
            if (!casterToken) return null;
            const casterPos = livePlayerPos[casterToken.id] ?? casterToken;
            const rangePx = gridResolution
              ? (detectPoisonData.rangeFt / 5) * gridResolution.pixelsPerGrid
              : detectPoisonData.rangeFt * 4;

            // Filter poison notes within range of caster
            const poisonNotes = mapNotes.filter(note => {
              if (note.type !== 'poison') return false;
              const dx = note.x - casterPos.x;
              const dy = note.y - casterPos.y;
              return Math.sqrt(dx * dx + dy * dy) <= rangePx;
            });
            if (poisonNotes.length === 0) return null;
            const noteR = tokenRadius * 0.6;
            return (
              <Layer listening={false}>
                {poisonNotes.map(note => (
                  <Group key={`poison-${note.id}`} x={note.x} y={note.y}>
                    <Circle
                      radius={noteR}
                      fill={getNoteColor('poison')}
                      stroke="rgba(22,163,74,0.6)"
                      strokeWidth={2 * tokenScale}
                      opacity={0.85}
                      perfectDrawEnabled={false}
                    />
                    <NoteMapIcon type="poison" />
                  </Group>
                ))}
              </Layer>
            );
          })()}

          {/* ── See Invisibility: reveal invisible enemies below fog (player view only) ── */}
          {/* Rendered below fog so only creatures within the player's vision are visible */}
          {isPlayerView && seeInvisibility && (() => {
            const invisibleEnemies = tokens.filter(t => t.type !== 'player' && t.invisible);
            if (invisibleEnemies.length === 0) return null;
            return (
              <Layer listening={false}>
                {invisibleEnemies.map(token => {
                  const r = tokenRadius * getTokenSizeMultiplier(token.size);
                  const pos = livePlayerPos[token.id] ?? token;
                  return (
                    <Group key={`see-invis-${token.id}`} x={pos.x} y={pos.y}>
                      <Circle
                        radius={r}
                        fill={token.avatar ? 'transparent' : token.color}
                        stroke={token.color}
                        strokeWidth={2 * tokenScale}
                        opacity={0.5}
                        dash={[6 * tokenScale, 4 * tokenScale]}
                        perfectDrawEnabled={false}
                      />
                      {token.avatar && (
                        <Group opacity={0.5} listening={false}>
                          <TokenAvatar url={token.avatar} radius={r - tokenScale} />
                        </Group>
                      )}
                      {!token.avatar && (
                        <Text
                          text={token.name?.[0] || '?'}
                          x={-r}
                          y={-r}
                          width={r * 2}
                          height={r * 2}
                          align="center"
                          verticalAlign="middle"
                          fontSize={r * 0.8}
                          fill="white"
                          opacity={0.5}
                          listening={false}
                        />
                      )}
                    </Group>
                  );
                })}
              </Layer>
            );
          })()}

          {(useFromPlayerPerspective || showFog) && hasFogData && loadedImage && (
            <Layer listening={false}>
              <FogOfWarLayer
                visibilityPolygons={useFromPlayerPerspective ? playerVisionData : visibilityPolygons}
                // DM view reuses the unlimited-LOS polygons as the light clip mask so
                // torch carve-outs inside dark zones show up in the fog preview too.
                playerLOSPolygons={useFromPlayerPerspective ? playerFullLOSPolygons : visibilityPolygons}
                lightPolygons={lightPolygons}
                darkZonePolygons={darkZonePolygons}
                darkvisionRevealPolygons={darkvisionRevealPolygons}
                exploredOverlayCanvas={exploredOverlayCanvas}
                exploredMaskVersion={exploredMaskVersion}
                mapWidth={loadedImage.width}
                mapHeight={loadedImage.height}
                opacity={useFromPlayerPerspective ? 1.0 : 0.7}
              />
            </Layer>
          )}
          {/* Darkness + Fog Cloud circles — rendered above fog but below tokens */}
          {spellMarkers.some(m => (m.spellName === 'Darkness' || m.spellName === 'Fog Cloud') && (!m.floorId || m.floorId === activeFloorId) && (!isPlayerView || m.visibleToPlayers)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => (m.spellName === 'Darkness' || m.spellName === 'Fog Cloud') && (!m.floorId || m.floorId === activeFloorId) && (!isPlayerView || m.visibleToPlayers))
                .map(marker => {
                  const effectPx = marker.effectRadius ? (marker.effectRadius / 5) * ppg : 0;
                  if (effectPx <= 0) return null;
                  const live = liveMarkerPos[marker.id];
                  const isFog = marker.spellName === 'Fog Cloud';
                  return (
                    <Circle
                      key={marker.id}
                      x={live?.x ?? marker.x}
                      y={live?.y ?? marker.y}
                      radius={effectPx}
                      fill={isFog ? 'rgb(160,160,160)' : 'black'}
                      opacity={isFog ? 0.72 : 0.92}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Tremorsense circles above fog (player view only) ── */}
          {isPlayerView && tremorsenseData && (() => {
            // Find the caster's token
            const casterToken = tokens.find(t => t.combatantId === tremorsenseData.playerId);
            if (!casterToken) return null;
            const casterPos = livePlayerPos[casterToken.id] ?? casterToken;
            const rangePx = gridResolution
              ? (tremorsenseData.rangeFt / 5) * gridResolution.pixelsPerGrid
              : tremorsenseData.rangeFt * 4;

            // Point-in-polygon test (ray casting algorithm)
            const pointInPolygon = (px: number, py: number, poly: WallPoint[]): boolean => {
              let inside = false;
              for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y;
                const xj = poly[j].x, yj = poly[j].y;
                if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                  inside = !inside;
                }
              }
              return inside;
            };

            // Check if a point is visible in ANY of the combined vision polygons
            // (playerVisionData already accounts for darkvision + wall raycasting)
            const isVisibleToPlayers = (px: number, py: number): boolean => {
              // Check direct player vision (darkvision-limited LOS)
              for (const poly of playerVisionData) {
                if (poly.length >= 3 && pointInPolygon(px, py, poly)) return true;
              }
              // Check light-illuminated areas visible through player LOS
              // A point is visible via light if it's inside a light polygon AND
              // inside at least one player's full (unclipped) LOS polygon
              for (const lightPoly of lightPolygons) {
                if (lightPoly.length < 3 || !pointInPolygon(px, py, lightPoly)) continue;
                for (const losPoly of playerFullLOSPolygons) {
                  if (losPoly.length >= 3 && pointInPolygon(px, py, losPoly)) return true;
                }
              }
              return false;
            };

            // Find enemy/NPC tokens within range that are NOT already visible to players
            const sensedTokens = tokens.filter(t => {
              if (t.type === 'player') return false;
              const pos = livePlayerPos[t.id] ?? t;
              const dx = pos.x - casterPos.x;
              const dy = pos.y - casterPos.y;
              if (Math.sqrt(dx * dx + dy * dy) > rangePx) return false;
              // Hidden or invisible tokens are always sensed (they're not rendered on the player map)
              if (t.hidden || t.invisible) return true;
              // Otherwise only show if behind walls / outside player vision
              return !isVisibleToPlayers(pos.x, pos.y);
            });
            if (sensedTokens.length === 0) return null;
            return (
              <Layer listening={false}>
                {sensedTokens.map(token => {
                  const r = tokenRadius * getTokenSizeMultiplier(token.size);
                  const pos = livePlayerPos[token.id] ?? token;
                  return (
                    <Group key={`tremor-${token.id}`} x={pos.x} y={pos.y}>
                      <Circle
                        radius={r}
                        fill="#6b7280"
                        stroke="#4b5563"
                        strokeWidth={2 * tokenScale}
                        opacity={0.85}
                        perfectDrawEnabled={false}
                      />
                    </Group>
                  );
                })}
              </Layer>
            );
          })()}

          {/* ── Active emanation rings (both player and DM views) ── */}
          {activeEmanations.map(em => {
            const casterToken = tokens.find(t => t.combatantId === em.playerId);
            if (!casterToken) return null;
            const casterPos = livePlayerPos[casterToken.id] ?? casterToken;
            const rangePx = gridResolution
              ? (em.rangeFt / 5) * gridResolution.pixelsPerGrid
              : em.rangeFt * 4;
            const rgb = hexToRgb(em.color);
            return (
              <Layer key={em.id} listening={false}>
                {/* Outer glow ring */}
                <Circle
                  x={casterPos.x}
                  y={casterPos.y}
                  radius={rangePx}
                  fill={`rgba(${rgb},0.08)`}
                  stroke={`rgba(${rgb},0.7)`}
                  strokeWidth={3 * tokenScale}
                  perfectDrawEnabled={false}
                />
                {/* Inner soft glow */}
                <Circle
                  x={casterPos.x}
                  y={casterPos.y}
                  radius={rangePx * 0.88}
                  fill={`rgba(${rgb},0.05)`}
                  stroke={`rgba(${rgb},0.25)`}
                  strokeWidth={1.5 * tokenScale}
                  perfectDrawEnabled={false}
                />
              </Layer>
            );
          })}

          {/* ── Player tokens above fog (player view only) ── */}
          {isPlayerView && (
            <Layer>
              {tokens.filter(t => t.type === 'player').map(token => {
                const r = tokenRadius * getTokenSizeMultiplier(token.size);
                return (
                  <Group
                    key={token.id}
                    x={livePlayerPos[token.id]?.x ?? token.x}
                    y={livePlayerPos[token.id]?.y ?? token.y}
                    draggable={!activeAoe && !isMeasuringActive && drawingMode === 'off'}
                    onMouseDown={(e) => { e.cancelBubble = true; }}
                    onDragStart={() => handleDragStart(token.id)}
                    onDragMove={(e) => handleDragMove(token.id, e)}
                    onDragEnd={(e) => handleDragEnd(token.id, e)}
                    onContextMenu={(e) => handleTokenContextMenu(e, token.id)}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      tokenTapConsumedRef.current = true;
                      if (onPlayerTokenDoubleTap && !activeAoe) {
                        const now = Date.now();
                        const last = lastTapRef.current;
                        if (last && last.tokenId === token.id && now - last.time < 400) {
                          lastTapRef.current = null;
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (rect) {
                            const screenX = rect.left + token.x * stageScale + stagePos.x;
                            const screenY = rect.top + token.y * stageScale + stagePos.y;
                            onPlayerTokenDoubleTap(token.id, screenX, screenY);
                          }
                          return;
                        }
                        lastTapRef.current = { tokenId: token.id, time: now };
                      }
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      tokenTapConsumedRef.current = true;
                      if (onPlayerTokenDoubleTap && !activeAoe) {
                        const now = Date.now();
                        const last = lastTapRef.current;
                        if (last && last.tokenId === token.id && now - last.time < 400) {
                          lastTapRef.current = null;
                          const rect = containerRef.current?.getBoundingClientRect();
                          if (rect) {
                            const screenX = rect.left + token.x * stageScale + stagePos.x;
                            const screenY = rect.top + token.y * stageScale + stagePos.y;
                            onPlayerTokenDoubleTap(token.id, screenX, screenY);
                          }
                          return;
                        }
                        lastTapRef.current = { tokenId: token.id, time: now };
                      }
                    }}
                  >
                    {/* Countdown Timers */}
                    <Group rotation={playerSides?.[token.summonedBy ?? token.combatantId ?? ''] === 'top' ? 180 : 0} listening={false}>
                      {(activeTimers || []).filter(t => t.playerId === token.combatantId).map((timer, i) => (
                        <CountdownRing
                          key={`timer-${timer.playerId}-${timer.abilityId}-${i}`}
                          radius={r + (i * 5 * tokenScale)}
                          tokenScale={tokenScale}
                          startTime={timer.startTime}
                          durationMs={timer.durationMs}
                          color={timer.color}
                        />
                      ))}
                    </Group>
                    <Circle
                      radius={r}
                      fill={token.avatar ? 'transparent' : token.color}
                      stroke={token.color}
                      strokeWidth={2 * tokenScale}
                      opacity={(token.invisible || token.illusory) ? 0.5 : token.hidden ? 0.4 : 1}
                      dash={(token.invisible || token.illusory) ? [6 * tokenScale, 4 * tokenScale] : undefined}
                      perfectDrawEnabled={false}
                    />
                    {/* Engaged range ring — shown when within 5ft of an opposing token during combat. Dark halo behind red for contrast. */}
                    {engagedTokenIds.has(token.id) && (
                      <>
                        <Circle
                          radius={r + 5 / stageScale}
                          fill="transparent"
                          stroke="#000000"
                          strokeWidth={4 / stageScale}
                          opacity={0.5}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                        <Circle
                          radius={r + 5 / stageScale}
                          fill="transparent"
                          stroke="#FF4444"
                          strokeWidth={2 / stageScale}
                          opacity={0.9}
                          dash={[6 / stageScale, 4 / stageScale]}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      </>
                    )}
                    {tokensInAoe.has(token.id) && !activeAoe?.saveResults && (() => {
                      const hlRgb2 = getDamageRgb(activeAoe?.damageType);
                      return <>
                        <Circle radius={r + 4 * tokenScale} fill="" stroke={`rgba(${hlRgb2}, 0.4)`} strokeWidth={3 * tokenScale} listening={false} perfectDrawEnabled={false} />
                        <Circle radius={r + 3 * tokenScale} fill="" stroke={`rgba(${hlRgb2}, 0.9)`} strokeWidth={2.5 * tokenScale} listening={false} perfectDrawEnabled={false} />
                      </>;
                    })()}
                    {propActiveCombatantId && (() => {
                      const activeComb = activeCombatants.find(c => c.id === propActiveCombatantId);
                      if (!activeComb) return null;
                      const isActiveToken = token.combatantId === activeComb.sourceCombatantId || token.combatantId === activeComb.id;
                      if (!isActiveToken) return null;
                      return <ActiveTurnRing radius={r} tokenScale={tokenScale} color="#fbbf24" />;
                    })()}
                    {turnFlashCombatantId && (() => {
                      const activeComb = activeCombatants.find(c => c.id === turnFlashCombatantId);
                      if (!activeComb) return null;
                      const isActiveToken = token.combatantId === activeComb.sourceCombatantId || token.combatantId === activeComb.id;
                      if (!isActiveToken) return null;
                      return <TurnIndicatorChevrons key={turnFlashCombatantId} radius={r} tokenScale={tokenScale} />;
                    })()}
                    {token.avatar && (
                      <Group
                        opacity={token.invisible ? 0.5 : token.hidden ? 0.4 : 1}
                        rotation={
                          playerSides?.[token.summonedBy ?? token.combatantId ?? ''] === 'top' ? 180 :
                          (isPlayerView && (token.type === 'enemy' || token.type === 'npc')) ? 90 : 0
                        }
                        listening={false}
                      >
                        <TokenAvatar url={token.avatar} radius={r - tokenScale} />
                      </Group>
                    )}
                  </Group>
                );
              })}
            </Layer>
          )}

          {/* Spell Markers — visible to both DM and players */}
          {spellMarkers.length > 0 && (
            <Layer>
              {spellMarkers
                .filter(m => !isPlayerView || m.visibleToPlayers)
                .filter(m => !m.floorId || m.floorId === activeFloorId)
                .map(marker => {
                  // Wall-shape marker (Wall of Sand, etc.) — rotated rectangle, locked after placement
                  if (marker.shapeType === 'wall') {
                    const wallAngle = marker.angle ?? 0;
                    const wallCorners = computeWallCorners(
                      marker.x, marker.y,
                      marker.length ?? 30,
                      marker.thickness ?? 10,
                      wallAngle,
                      ppg,
                    );
                    const wallPts = wallCorners.flatMap(c => [c.x, c.y]);
                    const isWoF = marker.spellName === 'Wall of Fire';
                    const wofAng = wallAngle * Math.PI / 180;
                    // Hot-side outward normal: (sinA, -cosA)
                    const wofNX = Math.sin(wofAng);
                    const wofNY = -Math.cos(wofAng);
                    if (isWoF) {
                      return (
                        <React.Fragment key={marker.id}>
                          {/* Fill */}
                          <Line
                            points={wallPts}
                            closed
                            fill="rgba(255,100,10,0.45)"
                            stroke="transparent"
                            listening={false}
                          />
                          {/* Hot side — solid bright orange */}
                          <Line
                            points={[wallCorners[0].x, wallCorners[0].y, wallCorners[1].x, wallCorners[1].y]}
                            stroke="#ff8c00"
                            strokeWidth={3 / stageScale}
                            listening={false}
                          />
                          {/* Cold side — dashed */}
                          <Line
                            points={[wallCorners[3].x, wallCorners[3].y, wallCorners[2].x, wallCorners[2].y]}
                            stroke="#8b5a2b"
                            strokeWidth={1.5 / stageScale}
                            dash={[8 / stageScale, 4 / stageScale]}
                            listening={false}
                          />
                          {/* End caps */}
                          <Line
                            points={[wallCorners[0].x, wallCorners[0].y, wallCorners[3].x, wallCorners[3].y]}
                            stroke="#8b5a2b" strokeWidth={1.5 / stageScale} listening={false}
                          />
                          <Line
                            points={[wallCorners[1].x, wallCorners[1].y, wallCorners[2].x, wallCorners[2].y]}
                            stroke="#8b5a2b" strokeWidth={1.5 / stageScale} listening={false}
                          />
                          {/* Transparent hit area for tap/context on the whole wall */}
                          <Line
                            points={wallPts}
                            closed
                            fill="rgba(0,0,0,0.001)"
                            stroke="transparent"
                        onTap={(e) => {
                          if (!isPlayerView) return;
                          e.cancelBubble = true;
                          const now = Date.now();
                          const last = lastMarkerTapRef.current;
                          if (last && last.markerId === marker.id && now - last.time < 400) {
                            lastMarkerTapRef.current = null;
                            const rect = containerRef.current?.getBoundingClientRect();
                            setDismissMarkerBubble({
                              markerId: marker.id,
                              screenX: (rect?.left ?? 0) + marker.x * stageScale + stagePos.x,
                              screenY: (rect?.top ?? 0) + marker.y * stageScale + stagePos.y,
                            });
                          } else {
                            lastMarkerTapRef.current = { markerId: marker.id, time: now };
                            setDismissMarkerBubble(null);
                          }
                        }}
                        onContextMenu={(e) => {
                          if (isPlayerView) return;
                          e.evt.preventDefault();
                          e.cancelBubble = true;
                          setContextMenu({
                            x: marker.x,
                            y: marker.y,
                            stageX: e.evt.clientX,
                            stageY: e.evt.clientY,
                            clientY: e.evt.clientY,
                            view: 'spell-marker',
                            markerId: marker.id,
                          });
                        }}
                        onMouseDown={(e) => { e.cancelBubble = true; }}
                      />
                        </React.Fragment>
                      );
                    } else {
                      const isPasswall = marker.spellName === 'Passwall';
                      const isForcecage = marker.spellName === 'Forcecage' || marker.spellName === 'Forcecage (Box)';
                      const isForcecageBox = marker.spellName === 'Forcecage (Box)';
                      const fcFill = isForcecageBox ? 'rgba(167,139,250,0.32)' : 'rgba(167,139,250,0.10)';
                      const fcStroke = '#a78bfa';
                      return (
                        <Line
                          key={marker.id}
                          points={wallPts}
                          closed
                          fill={isForcecage ? fcFill : isPasswall ? 'rgba(20,16,12,0.78)' : 'rgba(212,165,116,0.55)'}
                          stroke={isForcecage ? fcStroke : isPasswall ? '#3a2c1c' : '#8b5a2b'}
                          strokeWidth={isForcecage ? 2 / stageScale : isPasswall ? 2 / stageScale : 1.5 / stageScale}
                          dash={isForcecage && !isForcecageBox ? [6 / stageScale, 4 / stageScale] : undefined}
                          onTap={(e) => {
                            if (!isPlayerView) return;
                            e.cancelBubble = true;
                            const now = Date.now();
                            const last = lastMarkerTapRef.current;
                            if (last && last.markerId === marker.id && now - last.time < 400) {
                              lastMarkerTapRef.current = null;
                              const rect = containerRef.current?.getBoundingClientRect();
                              setDismissMarkerBubble({
                                markerId: marker.id,
                                screenX: (rect?.left ?? 0) + marker.x * stageScale + stagePos.x,
                                screenY: (rect?.top ?? 0) + marker.y * stageScale + stagePos.y,
                              });
                            } else {
                              lastMarkerTapRef.current = { markerId: marker.id, time: now };
                              setDismissMarkerBubble(null);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (isPlayerView) return;
                            e.evt.preventDefault();
                            e.cancelBubble = true;
                            setContextMenu({
                              x: marker.x,
                              y: marker.y,
                              stageX: e.evt.clientX,
                              stageY: e.evt.clientY,
                              clientY: e.evt.clientY,
                              view: 'spell-marker',
                              markerId: marker.id,
                            });
                          }}
                          onMouseDown={(e) => { e.cancelBubble = true; }}
                        />
                      );
                    }
                  }
                  // Ring-shape marker (Wall of Fire Ring / Wall of Ice Dome) — also catches old sphere-format markers
                  if (marker.shapeType === 'ring' || marker.spellName === 'Wall of Fire (Ring)') {
                    const ringRadiusPx = ((marker.aoeSize ?? 10) / 5) * ppg;
                    const isIceDome = marker.spellName === 'Wall of Ice (Dome)';
                    const isForceDome = marker.spellName === 'Wall of Force (Dome)';
                    const isThornsRing = marker.spellName === 'Wall of Thorns (Ring)';
                    const isBladeRing = marker.spellName === 'Blade Barrier (Ring)';
                    const isHallow = marker.spellName === 'Hallow';
                    const ringFill = isForceDome
                      ? 'rgba(168,85,247,0.14)'
                      : isIceDome
                      ? 'rgba(126,200,238,0.18)'
                      : isThornsRing
                      ? 'rgba(34,197,94,0.18)'
                      : isBladeRing
                      ? 'rgba(203,213,225,0.18)'
                      : isHallow
                      ? 'rgba(251,191,36,0.16)'
                      : 'rgba(255,90,10,0.18)';
                    const ringStroke = isForceDome
                      ? '#c084fc'
                      : isIceDome
                      ? '#7ec8ee'
                      : isThornsRing
                      ? '#22c55e'
                      : isBladeRing
                      ? '#cbd5e1'
                      : isHallow
                      ? '#fbbf24'
                      : '#ff8c00';
                    const isHotOutside = (marker.hotSide ?? 'outside') === 'outside';
                    const tapHandler = (e: any) => {
                      if (!isPlayerView) return;
                      e.cancelBubble = true;
                      const now = Date.now();
                      const last = lastMarkerTapRef.current;
                      if (last && last.markerId === marker.id && now - last.time < 400) {
                        lastMarkerTapRef.current = null;
                        const rect = containerRef.current?.getBoundingClientRect();
                        setDismissMarkerBubble({
                          markerId: marker.id,
                          screenX: (rect?.left ?? 0) + marker.x * stageScale + stagePos.x,
                          screenY: (rect?.top ?? 0) + marker.y * stageScale + stagePos.y,
                        });
                      } else {
                        lastMarkerTapRef.current = { markerId: marker.id, time: now };
                        setDismissMarkerBubble(null);
                      }
                    };
                    const ctxHandler = (e: any) => {
                      if (isPlayerView) return;
                      e.evt.preventDefault();
                      e.cancelBubble = true;
                      setContextMenu({
                        x: marker.x, y: marker.y,
                        stageX: e.evt.clientX,
                        stageY: e.evt.clientY,
                        clientY: e.evt.clientY,
                        view: 'spell-marker',
                        markerId: marker.id,
                      });
                    };
                    return (
                      <React.Fragment key={marker.id}>
                        {/* Fill */}
                        <Circle
                          x={marker.x} y={marker.y}
                          radius={ringRadiusPx}
                          fill={ringFill}
                          stroke="transparent"
                          listening={false}
                        />
                        {/* Ring stroke */}
                        <Circle
                          x={marker.x} y={marker.y}
                          radius={ringRadiusPx}
                          fill="transparent"
                          stroke={ringStroke}
                          strokeWidth={3 / stageScale}
                          listening={false}
                        />
                        {/* Transparent hit area */}
                        <Circle
                          x={marker.x} y={marker.y}
                          radius={ringRadiusPx}
                          fill="rgba(0,0,0,0.001)"
                          stroke="transparent"
                          strokeWidth={8 / stageScale}
                          onTap={tapHandler}
                          onContextMenu={ctxHandler}
                          onMouseDown={(e) => { e.cancelBubble = true; }}
                        />
                      </React.Fragment>
                    );
                  }
                  const color = SPELL_COLOR_OVERRIDES[marker.spellName] ?? getSchoolColor(marker.school);
                  const iconSvg = SPELL_ICON_SVGS[marker.spellName] ?? SCHOOL_ICON_SVGS[marker.school] ?? '';
                  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                  iconVersion; // depend on iconVersion so we re-render when images load
                  const iconImg = iconSvg ? getIconImage(iconSvg) : null;
                  const markerRadius = tokenRadius * 0.5;
                  const effectPx = marker.effectRadius ? (marker.effectRadius / 5) * ppg : 0;
                  const canInteract = true;
                  return (
                    <Group
                      key={marker.id}
                      x={marker.x}
                      y={marker.y}
                      draggable={canInteract}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        markerDraggingRef.current = true;
                        // Clear the dismiss bubble once at drag start — not on every move frame
                        setDismissMarkerBubble(null);
                      }}
                      onDragMove={(e) => {
                        if (marker.lightSource || marker.spellName === 'Darkness' || marker.spellName === 'Fog Cloud') {
                          setLiveMarkerPos(prev => ({
                            ...prev,
                            [marker.id]: { x: e.target.x(), y: e.target.y() },
                          }));
                        }
                      }}
                      onDragEnd={(e) => {
                        markerDraggingRef.current = false;
                        // Clear live position override
                        setLiveMarkerPos(prev => {
                          const next = { ...prev };
                          delete next[marker.id];
                          return next;
                        });
                        const updated = spellMarkers.map(m =>
                          m.id === marker.id ? { ...m, x: e.target.x(), y: e.target.y() } : m
                        );
                        onSpellMarkersChange?.(updated);
                        try {
                          if (isPlayerView) {
                            window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated);
                          } else {
                            window.electronAPI?.sendDMSpellMarkerUpdate?.(updated);
                          }
                        } catch (_e) { /* IPC not available */ }
                      }}
                      onTap={(e) => {
                        if (!isPlayerView) return;
                        if (!canInteract) return;
                        // Suppress tap if a drag just completed
                        if (markerDraggingRef.current) return;
                        e.cancelBubble = true;
                        const now = Date.now();
                        const last = lastMarkerTapRef.current;
                        if (last && last.markerId === marker.id && now - last.time < 400) {
                          lastMarkerTapRef.current = null;
                          const rect = containerRef.current?.getBoundingClientRect();
                          setDismissMarkerBubble({
                            markerId: marker.id,
                            screenX: (rect?.left ?? 0) + marker.x * stageScale + stagePos.x,
                            screenY: (rect?.top ?? 0) + marker.y * stageScale + stagePos.y,
                          });
                        } else {
                          lastMarkerTapRef.current = { markerId: marker.id, time: now };
                          setDismissMarkerBubble(null);
                        }
                      }}
                      onMouseEnter={() => setHoveredMarkerId(marker.id)}
                      onMouseLeave={() => setHoveredMarkerId(null)}
                      onContextMenu={(e) => {
                        if (isPlayerView) return;
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        setContextMenu({
                          x: marker.x,
                          y: marker.y,
                          stageX: e.evt.clientX,
                          stageY: e.evt.clientY,
                          clientY: e.evt.clientY,
                          view: 'spell-marker',
                          markerId: marker.id,
                        });
                      }}
                      onMouseDown={(e) => { e.cancelBubble = true; }}
                    >
                      {/* AoE shape overlay — hidden for Light and Darkness.
                          Renders the spell's actual area (cube/sphere/etc.) if aoeType is set,
                          otherwise falls back to effectRadius circle. listening=false so the
                          large shape doesn't capture drag events. */}
                      {marker.spellName !== 'Light' && marker.spellName !== 'Daylight' && marker.spellName !== 'Darkness' && marker.spellName !== 'Fog Cloud' && (() => {
                        if (marker.aoeType && marker.aoeSize) {
                          const aoePx = (marker.aoeSize / 5) * ppg;
                          if (marker.aoeType === 'cube') {
                            return (
                              <Rect
                                x={-aoePx / 2}
                                y={-aoePx / 2}
                                width={aoePx}
                                height={aoePx}
                                fill={color}
                                opacity={0.12}
                                stroke={color}
                                strokeWidth={1}
                                dash={[6, 4]}
                                listening={false}
                              />
                            );
                          }
                          if (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') {
                            return (
                              <Circle
                                radius={aoePx}
                                fill={color}
                                opacity={0.12}
                                stroke={color}
                                strokeWidth={1}
                                dash={[6, 4]}
                                listening={false}
                              />
                            );
                          }
                        }
                        // Fall back to effectRadius circle
                        if (effectPx > 0) {
                          return (
                            <Circle
                              radius={effectPx}
                              fill={color}
                              opacity={0.1}
                              stroke={color}
                              strokeWidth={1}
                              dash={[6, 4]}
                              listening={false}
                            />
                          );
                        }
                        return null;
                      })()}
                      {/* Spell-specific particle effects */}
                      {isFireSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <FireballParticles radius={(marker.aoeSize / 5) * ppg} />
                      )}
                      {isFireCubeSpell(marker.spellName) && marker.aoeType === 'cube' && marker.aoeSize && (
                        <FireCubeParticles size={(marker.aoeSize / 5) * ppg} />
                      )}
                      {isIceSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <IceSphereParticles radius={(marker.aoeSize / 5) * ppg} />
                      )}
                      {isPoisonSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <RadialAoEParticles radius={(marker.aoeSize / 5) * ppg} palette={POISON_PALETTE} glow="#65a30d" inwardChance={0.25} basePeriod={2000} />
                      )}
                      {isAcidSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <RadialAoEParticles radius={(marker.aoeSize / 5) * ppg} palette={ACID_PALETTE} glow="#a3e635" inwardChance={0.4} basePeriod={1500} />
                      )}
                      {isNecroticSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <RadialAoEParticles radius={(marker.aoeSize / 5) * ppg} palette={NECROTIC_PALETTE} glow="#7e22ce" inwardChance={0.5} basePeriod={2200} shape="triangle" />
                      )}
                      {isLightningSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <LightningSphereParticles radius={(marker.aoeSize / 5) * ppg} />
                      )}
                      {isThunderSphereSpell(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (
                        <ThunderShockwaveParticles radius={(marker.aoeSize / 5) * ppg} />
                      )}
                      {isThunderCubeSpell(marker.spellName) && marker.aoeType === 'cube' && marker.aoeSize && (
                        <ThunderCubeParticles size={(marker.aoeSize / 5) * ppg} />
                      )}
                      {getSphereElement(marker.spellName) && (marker.aoeType === 'sphere' || marker.aoeType === 'cylinder') && marker.aoeSize && (() => {
                        const s = ELEMENT_STYLES[getSphereElement(marker.spellName)!];
                        return <RadialAoEParticles radius={(marker.aoeSize / 5) * ppg} palette={s.palette} glow={s.glow} basePeriod={s.basePeriod} inwardChance={s.inwardChance} shape={s.shape} />;
                      })()}
                      {getCubeElement(marker.spellName) && marker.aoeType === 'cube' && marker.aoeSize && (() => {
                        const s = ELEMENT_STYLES[getCubeElement(marker.spellName)!];
                        return <CubeAoEParticles size={(marker.aoeSize / 5) * ppg} palette={s.palette} glow={s.glow} />;
                      })()}
                      {/* Invisible expanded hit area so the marker is easy to grab/drag on touch */}
                      <Circle
                        radius={Math.max(markerRadius * 3, effectPx > 0 ? Math.min(effectPx, markerRadius * 5) : markerRadius * 3)}
                        fill="rgba(0,0,0,0.001)"
                        perfectDrawEnabled={false}
                      />
                      {/* Icon background circle */}
                      <Circle
                        radius={markerRadius}
                        fill={color}
                        opacity={!isPlayerView && !marker.visibleToPlayers ? 0.4 : 0.85}
                        stroke={hoveredMarkerId === marker.id ? 'white' : 'rgba(0,0,0,0.5)'}
                        strokeWidth={hoveredMarkerId === marker.id ? 2 : 1}
                      />
                      {/* School icon — rendered as a Lucide SVG image so stroke-based icons display correctly */}
                      {iconImg && (
                        <KonvaImage
                          image={iconImg}
                          width={markerRadius * 1.5}
                          height={markerRadius * 1.5}
                          offsetX={markerRadius * 0.75}
                          offsetY={markerRadius * 0.75}
                          opacity={0.9}
                          listening={false}
                        />
                      )}
                      {/* Hidden indicator for DM */}
                      {!isPlayerView && !marker.visibleToPlayers && (
                        <Text
                          text="🚫"
                          fontSize={markerRadius * 0.6}
                          x={markerRadius * 0.3}
                          y={-markerRadius * 0.9}
                        />
                      )}
                      {/* Spell name label — always visible below the marker */}
                      <Text
                        text={marker.spellName}
                        y={markerRadius + 4}
                        fontSize={11 / stageScale}
                        fill="white"
                        align="center"
                        width={120 / stageScale}
                        x={-60 / stageScale}
                        shadowColor="black"
                        shadowBlur={3}
                        shadowOpacity={0.9}
                        listening={false}
                      />
                    </Group>
                  );
                })}
            </Layer>
          )}

          {/* ── Wall/ring spell particle layers (Wall of Fire, Wind Wall, Forcecage, …) ── */}
          <WallSpellParticleLayers spellMarkers={spellMarkers} isPlayerView={isPlayerView} activeFloorId={activeFloorId} ppg={ppg} />

          {/* Map Notes — above fog so they're always visible to the DM */}
          {!isPlayerView && mapNotes.length > 0 && (
            <Layer>
              {mapNotes.map(note => (
                <Group
                  key={note.id}
                  x={note.x}
                  y={note.y}
                  draggable
                  onDragEnd={(e) => handleNoteDragEnd(note.id, e)}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId(null)}
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    if (note.type === 'sound') {
                      if (note.soundId) {
                        audioEngine.ensure();
                        audioEngine.playOneShot(soundUrlFromId(note.soundId), 'notes', 1).catch(() => { /* ignore */ });
                      }
                      return;
                    }
                    setLeftSidebarOpen(true);
                    onNoteClick?.(note.id);
                  }}
                >
                  <Circle
                    radius={tokenRadius * 0.6}
                    fill={getNoteColor(note.type)}
                    stroke={hoveredNoteId === note.id ? "white" : "rgba(0,0,0,0.4)"}
                    strokeWidth={hoveredNoteId === note.id ? 2 : 1}
                  />
                  <NoteMapIcon type={note.type} />
                </Group>
              ))}
            </Layer>
          )}

          {/* ── AoE range line overlay — above tokens so it's never hidden ── */}
          {placedAoe && (() => {
            const ppg2 = gridResolution?.pixelsPerGrid || 40;
            const feetToPx2 = (ft: number) => (ft / 5) * ppg2;
            const sizePx2 = feetToPx2(placedAoe.aoeSize);
            const angleRad2 = placedAoe.angle * (Math.PI / 180);
            const isAnchored2 = placedAoe.aoeType === 'cone' || placedAoe.aoeType === 'line' || placedAoe.aoeType === 'emanation' || !!placedAoe.selfOrigin;
            if (isAnchored2) return null;
            const casterR2 = placedAoe.casterRadiusPx ?? 0;
            const rangeEdgeX2 = placedAoe.originX + Math.cos(angleRad2) * casterR2;
            const rangeEdgeY2 = placedAoe.originY + Math.sin(angleRad2) * casterR2;
            const rangeTargetX2 = placedAoe.x;
            const rangeTargetY2 = placedAoe.y;
            const rangeMidX2 = (rangeEdgeX2 + rangeTargetX2) / 2;
            const rangeMidY2 = (rangeEdgeY2 + rangeTargetY2) / 2;
            const dx2 = rangeTargetX2 - rangeEdgeX2;
            const dy2 = rangeTargetY2 - rangeEdgeY2;
            const distPx2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) - sizePx2;
            const rangeFeet2 = Math.round(Math.max(0, distPx2) / ppg2 * 5);
            const labelSize2 = 14 / stageScale;
            return (
              <Layer listening={false}>
                <Line
                  points={[rangeEdgeX2, rangeEdgeY2, rangeTargetX2, rangeTargetY2]}
                  stroke="rgba(255, 255, 255, 0.4)"
                  strokeWidth={1.5 / stageScale}
                  dash={[4 / stageScale, 4 / stageScale]}
                  listening={false}
                />
                <Text
                  x={rangeMidX2}
                  y={playerSides?.[placedAoe.casterId ?? ''] === 'top' ? rangeMidY2 + labelSize2 * 1.5 : rangeMidY2 - labelSize2 * 1.5}
                  offsetY={labelSize2 / 2}
                  rotation={playerSides?.[placedAoe.casterId ?? ''] === 'top' ? 180 : 0}
                  text={`${rangeFeet2} ft`}
                  fontSize={labelSize2}
                  fill="white"
                  fontStyle="bold"
                  fontFamily="Inter"
                  align="center"
                  listening={false}
                />
              </Layer>
            );
          })()}

          {/* ── Wall-shape spell preview (Wall of Sand, Wall of Fire, etc.) ── */}
          {/* Rendered last so handles are always on top of all other layers */}
          {editingWall && (() => {
            const aRad = editingWall.angle * Math.PI / 180;
            const cosA = Math.cos(aRad);
            const sinA = Math.sin(aRad);
            const halfL = (editingWall.length / 5) * ppg / 2;
            const halfT = (editingWall.thickness / 5) * ppg / 2;
            // Local corners (relative to wall center at 0,0) — Line is positioned via x/y
            const localCorners = [
              { x: -halfL * cosA - -halfT * sinA, y: -halfL * sinA + -halfT * cosA },
              { x: halfL * cosA - -halfT * sinA, y: halfL * sinA + -halfT * cosA },
              { x: halfL * cosA - halfT * sinA, y: halfL * sinA + halfT * cosA },
              { x: -halfL * cosA - halfT * sinA, y: -halfL * sinA + halfT * cosA },
            ];
            const pointsFlat = localCorners.flatMap(c => [c.x, c.y]);
            // Handle positions (world coords) — symmetric about center
            const lenHandleA = { x: editingWall.x + cosA * halfL, y: editingWall.y + sinA * halfL };
            const lenHandleB = { x: editingWall.x - cosA * halfL, y: editingWall.y - sinA * halfL };
            const thkHandleA = { x: editingWall.x - sinA * halfT, y: editingWall.y + cosA * halfT };
            const thkHandleB = { x: editingWall.x + sinA * halfT, y: editingWall.y - cosA * halfT };
            const handleR = 7 / stageScale;
            const handleStroke = 1.5 / stageScale;
            const minFeet = 5;

            const onBodyDragMove = (e: any) => {
              const nx = e.target.x();
              const ny = e.target.y();
              setEditingWall(w => w ? { ...w, x: nx, y: ny } : null);
            };

            const onLengthDrag = (e: any) => {
              const px = e.target.x();
              const py = e.target.y();
              const dx = px - editingWall.x;
              const dy = py - editingWall.y;
              const dist = Math.hypot(dx, dy);
              const rawLengthFt = (dist * 2 / ppg) * 5;
              const clampedLengthFt = Math.min(
                editingWall.maxLength,
                Math.max(minFeet, rawLengthFt)
              );
              // Direction from center to drag point (preserves the dragged handle's side)
              const dirX = dist > 0 ? dx / dist : 1;
              const dirY = dist > 0 ? dy / dist : 0;
              const newAngleDeg = Math.atan2(dirY, dirX) * 180 / Math.PI;
              // Snap the handle visually to the clamped position so it never overshoots
              const halfLClampedPx = (clampedLengthFt / 5) * ppg / 2;
              e.target.position({
                x: editingWall.x + dirX * halfLClampedPx,
                y: editingWall.y + dirY * halfLClampedPx,
              });
              setEditingWall(w => w ? { ...w, angle: newAngleDeg, length: clampedLengthFt } : null);
            };

            const onThicknessDrag = (e: any) => {
              const px = e.target.x();
              const py = e.target.y();
              const rad = editingWall.angle * Math.PI / 180;
              const perpX = -Math.sin(rad);
              const perpY = Math.cos(rad);
              const proj = (px - editingWall.x) * perpX + (py - editingWall.y) * perpY;
              const sign = proj < 0 ? -1 : 1;
              const rawThicknessFt = (Math.abs(proj) * 2 / ppg) * 5;
              const clampedThicknessFt = Math.min(
                editingWall.maxThickness,
                Math.max(minFeet, rawThicknessFt)
              );
              // Snap the handle to the perpendicular axis at the clamped distance
              const halfTClampedPx = (clampedThicknessFt / 5) * ppg / 2;
              e.target.position({
                x: editingWall.x + perpX * sign * halfTClampedPx,
                y: editingWall.y + perpY * sign * halfTClampedPx,
              });
              setEditingWall(w => w ? { ...w, thickness: clampedThicknessFt } : null);
            };

            const labelFontSize = 14 / stageScale;
            const labelOffset = (halfT + 22 / stageScale);
            const labelX = editingWall.x - sinA * -labelOffset;
            const labelY = editingWall.y + cosA * -labelOffset;

            const isWallOfFire = editingWall.spellName === 'Wall of Fire';
            const isPasswall = editingWall.spellName === 'Passwall';
            const isForcecage = editingWall.spellName === 'Forcecage' || editingWall.spellName === 'Forcecage (Box)';
            const isForcecageBox = editingWall.spellName === 'Forcecage (Box)';
            // Hot side = corners[0]→[1], normal points in (sinA, -cosA) direction
            const hotNX = sinA;
            const hotNY = -cosA;

            return (
              <>
              <Layer>
                {/* Wall body — draggable to translate the whole wall */}
                <Line
                  x={editingWall.x}
                  y={editingWall.y}
                  points={pointsFlat}
                  closed
                  fill={isWallOfFire ? 'rgba(255,120,20,0.22)' : isPasswall ? 'rgba(20,16,12,0.6)' : isForcecage ? (isForcecageBox ? 'rgba(167,139,250,0.28)' : 'rgba(167,139,250,0.12)') : 'rgba(212,165,116,0.35)'}
                  stroke={isWallOfFire ? 'transparent' : isPasswall ? '#5a4226' : isForcecage ? '#a78bfa' : '#d4a574'}
                  strokeWidth={2 / stageScale}
                  dash={[8 / stageScale, 4 / stageScale]}
                  draggable
                  onDragMove={onBodyDragMove}
                  onDragEnd={onBodyDragMove}
                />
                {/* Wall of Fire: hot side solid, cold side dashed */}
                {isWallOfFire && (
                  <>
                    {/* Hot side — solid bright orange */}
                    <Line
                      x={editingWall.x}
                      y={editingWall.y}
                      points={[localCorners[0].x, localCorners[0].y, localCorners[1].x, localCorners[1].y]}
                      stroke="#ff8c00"
                      strokeWidth={3 / stageScale}
                      listening={false}
                    />
                    {/* Cold side — dashed */}
                    <Line
                      x={editingWall.x}
                      y={editingWall.y}
                      points={[localCorners[3].x, localCorners[3].y, localCorners[2].x, localCorners[2].y]}
                      stroke="#d4a574"
                      strokeWidth={1.5 / stageScale}
                      dash={[8 / stageScale, 4 / stageScale]}
                      listening={false}
                    />
                    {/* End caps */}
                    <Line
                      x={editingWall.x}
                      y={editingWall.y}
                      points={[localCorners[0].x, localCorners[0].y, localCorners[3].x, localCorners[3].y]}
                      stroke="#d4a574"
                      strokeWidth={1.5 / stageScale}
                      listening={false}
                    />
                    <Line
                      x={editingWall.x}
                      y={editingWall.y}
                      points={[localCorners[1].x, localCorners[1].y, localCorners[2].x, localCorners[2].y]}
                      stroke="#d4a574"
                      strokeWidth={1.5 / stageScale}
                      listening={false}
                    />
                  </>
                )}
                {/* Length handles (both ends of long axis) — rotate + resize length.
                    Hidden for Forcecage (fixed-size cube). */}
                {!isForcecage && (
                  <>
                    <Circle
                      x={lenHandleA.x}
                      y={lenHandleA.y}
                      radius={handleR}
                      fill="white"
                      stroke="#8b5a2b"
                      strokeWidth={handleStroke}
                      draggable
                      onDragMove={onLengthDrag}
                    />
                    <Circle
                      x={lenHandleB.x}
                      y={lenHandleB.y}
                      radius={handleR}
                      fill="white"
                      stroke="#8b5a2b"
                      strokeWidth={handleStroke}
                      draggable
                      onDragMove={onLengthDrag}
                    />
                  </>
                )}
                {/* Thickness handles — resize thickness along perpendicular axis (not shown for Wall of Fire or Forcecage) */}
                {!isWallOfFire && !isForcecage && (
                  <>
                    <Circle
                      x={thkHandleA.x}
                      y={thkHandleA.y}
                      radius={handleR}
                      fill="#ffe6b3"
                      stroke="#8b5a2b"
                      strokeWidth={handleStroke}
                      draggable
                      onDragMove={onThicknessDrag}
                    />
                    <Circle
                      x={thkHandleB.x}
                      y={thkHandleB.y}
                      radius={handleR}
                      fill="#ffe6b3"
                      stroke="#8b5a2b"
                      strokeWidth={handleStroke}
                      draggable
                      onDragMove={onThicknessDrag}
                    />
                  </>
                )}
                {/* Live dimensions readout */}
                <Text
                  x={labelX}
                  y={labelY}
                  offsetX={40 / stageScale}
                  offsetY={labelFontSize / 2}
                  rotation={playerSides?.[editingWall.casterId ?? ''] === 'top' ? 180 : 0}
                  text={`${Math.round(editingWall.length)} \u00d7 ${Math.round(editingWall.thickness)} ft`}
                  fontSize={labelFontSize}
                  fill="#ffd9a6"
                  fontStyle="bold"
                  align="center"
                  width={80 / stageScale}
                  listening={false}
                />
              </Layer>
              {isWallOfFire && (
                <Layer listening={false}>
                  <WallOfFireParticles
                    p0={{ x: editingWall.x + localCorners[0].x, y: editingWall.y + localCorners[0].y }}
                    p1={{ x: editingWall.x + localCorners[1].x, y: editingWall.y + localCorners[1].y }}
                    normalX={hotNX}
                    normalY={hotNY}
                  />
                </Layer>
              )}
              {editingWall.spellName === 'Blade Barrier' && (
                <Layer listening={false}>
                  <BladeBarrierParticles
                    p0={{ x: editingWall.x + localCorners[0].x, y: editingWall.y + localCorners[0].y }}
                    p1={{ x: editingWall.x + localCorners[1].x, y: editingWall.y + localCorners[1].y }}
                    normalX={hotNX}
                    normalY={hotNY}
                  />
                </Layer>
              )}
              {isPasswall && (
                <Layer listening={false}>
                  <PasswallParticles
                    p0={{ x: editingWall.x + localCorners[0].x, y: editingWall.y + localCorners[0].y }}
                    p1={{ x: editingWall.x + localCorners[1].x, y: editingWall.y + localCorners[1].y }}
                    normalX={hotNX}
                    normalY={hotNY}
                  />
                </Layer>
              )}
              {isForcecage && (
                <Layer listening={false}>
                  {isForcecageBox ? (
                    <ForcecageBoxParticles
                      cx={editingWall.x}
                      cy={editingWall.y}
                      lengthPx={(editingWall.length / 5) * ppg}
                      thicknessPx={(editingWall.thickness / 5) * ppg}
                      angleRad={aRad}
                    />
                  ) : (
                    <ForcecageBarsParticles
                      cx={editingWall.x}
                      cy={editingWall.y}
                      lengthPx={(editingWall.length / 5) * ppg}
                      thicknessPx={(editingWall.thickness / 5) * ppg}
                      angleRad={aRad}
                    />
                  )}
                </Layer>
              )}
            </>
            );
          })()}

          {/* ── Wall of Fire Ring editing preview ── */}
          {editingRing && (() => {
            const ringRadiusPx = (editingRing.radius / 5) * ppg;
            const handleX = editingRing.x + ringRadiusPx;
            const handleY = editingRing.y;
            const handleR = 7 / stageScale;
            const handleStroke = 1.5 / stageScale;
            const isHotOutside = editingRing.hotSide === 'outside';
            const isIceDome = editingRing.spellName === 'Wall of Ice (Dome)';
            const isForceDome = editingRing.spellName === 'Wall of Force (Dome)';
            const isThornsRing = editingRing.spellName === 'Wall of Thorns (Ring)';
            const isBladeRing = editingRing.spellName === 'Blade Barrier (Ring)';
            const isHallow = editingRing.spellName === 'Hallow';
            const minRadiusFt = 2.5;
            const maxRadiusFt = isHallow ? 60 : isBladeRing ? 30 : 10;
            const previewFill = isForceDome
              ? 'rgba(168,85,247,0.10)'
              : isIceDome
              ? 'rgba(126,200,238,0.12)'
              : isThornsRing
              ? 'rgba(34,197,94,0.14)'
              : isBladeRing
              ? 'rgba(203,213,225,0.14)'
              : isHallow
              ? 'rgba(251,191,36,0.14)'
              : 'rgba(255,100,10,0.12)';
            const previewStroke = isForceDome
              ? '#c084fc'
              : isIceDome
              ? '#7ec8ee'
              : isThornsRing
              ? '#22c55e'
              : isBladeRing
              ? '#cbd5e1'
              : isHallow
              ? '#fbbf24'
              : '#ff8c00';
            const previewLabel = isForceDome
              ? '#e9d5ff'
              : isIceDome
              ? '#cfeeff'
              : isThornsRing
              ? '#bbf7d0'
              : isBladeRing
              ? '#e2e8f0'
              : isHallow
              ? '#fde68a'
              : '#ffd9a6';

            const onBodyDragMove = (e: any) => {
              setEditingRing(r => r ? { ...r, x: e.target.x(), y: e.target.y() } : null);
            };
            const onRadiusDrag = (e: any) => {
              const dx = e.target.x() - editingRing.x;
              const dy = e.target.y() - editingRing.y;
              const distPx = Math.hypot(dx, dy);
              const rawFt = (distPx / ppg) * 5;
              const clampedFt = Math.min(maxRadiusFt, Math.max(minRadiusFt, rawFt));
              const clampedPx = (clampedFt / 5) * ppg;
              const dirX = distPx > 0 ? dx / distPx : 1;
              const dirY = distPx > 0 ? dy / distPx : 0;
              e.target.position({ x: editingRing.x + dirX * clampedPx, y: editingRing.y + dirY * clampedPx });
              setEditingRing(r => r ? { ...r, radius: clampedFt } : null);
            };
            const labelFontSize = 14 / stageScale;

            return (
              <>
                <Layer>
                  {/* Ring body — draggable to translate */}
                  <Circle
                    x={editingRing.x}
                    y={editingRing.y}
                    radius={ringRadiusPx}
                    fill={previewFill}
                    stroke={previewStroke}
                    strokeWidth={3 / stageScale}
                    draggable
                    onDragMove={onBodyDragMove}
                    onDragEnd={onBodyDragMove}
                  />
                  {/* Radius drag handle */}
                  <Circle
                    x={handleX}
                    y={handleY}
                    radius={handleR}
                    fill="white"
                    stroke="#8b5a2b"
                    strokeWidth={handleStroke}
                    draggable
                    onDragMove={onRadiusDrag}
                  />
                  {/* Dimension label */}
                  <Text
                    x={editingRing.x}
                    y={playerSides?.[editingRing.casterId ?? ''] === 'top' ? editingRing.y + ringRadiusPx + 20 / stageScale : editingRing.y - ringRadiusPx - 20 / stageScale}
                    offsetX={50 / stageScale}
                    offsetY={labelFontSize / 2}
                    rotation={playerSides?.[editingRing.casterId ?? ''] === 'top' ? 180 : 0}
                    text={`${Math.round(editingRing.radius * 2)} ft`}
                    fontSize={labelFontSize}
                    fill={previewLabel}
                    fontStyle="bold"
                    align="center"
                    width={100 / stageScale}
                    listening={false}
                  />
                </Layer>
                <Layer listening={false}>
                  {isForceDome ? (
                    <WallOfForceDomeParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                    />
                  ) : isIceDome ? (
                    <WallOfIceDomeParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                    />
                  ) : isThornsRing ? (
                    <WallOfThornsRingParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                    />
                  ) : isBladeRing ? (
                    <BladeBarrierRingParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                    />
                  ) : isHallow ? (
                    <HallowParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                    />
                  ) : (
                    <WallOfFireRingParticles
                      cx={editingRing.x}
                      cy={editingRing.y}
                      radiusPx={ringRadiusPx}
                      hotSide={editingRing.hotSide}
                    />
                  )}
                </Layer>
              </>
            );
          })()}

          {/* ── Drawings — above fog of war so players can scribble on dark areas ── */}
          {(drawings.length > 0 || ephemeralStrokes.length > 0 || currentStroke) && (
            <Layer listening={false}>
              {drawings.map(s => (
                <Line
                  key={s.id}
                  points={s.points}
                  stroke={s.color}
                  strokeWidth={s.width / stageScale}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                  perfectDrawEnabled={false}
                />
              ))}
              {ephemeralStrokes.map(s => (
                <Line
                  key={s.id}
                  points={s.points}
                  stroke={s.color}
                  strokeWidth={s.width / stageScale}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                  opacity={0.85}
                  perfectDrawEnabled={false}
                />
              ))}
              {currentStroke && (
                <Line
                  points={currentStroke.points}
                  stroke={currentStroke.color}
                  strokeWidth={currentStroke.width / stageScale}
                  lineCap="round"
                  lineJoin="round"
                  tension={0.4}
                  perfectDrawEnabled={false}
                />
              )}
            </Layer>
          )}

          {/* ── Measure / Ruler — above fog of war ── */}
          {isMeasuringActive && measureStart && measureEnd && (() => {
            const ppg = gridResolution?.pixelsPerGrid || 40;
            const dx = measureEnd.x - measureStart.x;
            const dy = measureEnd.y - measureStart.y;
            const distPx = Math.sqrt(dx * dx + dy * dy);
            const distFeet = Math.round((distPx / ppg) * 5);
            const midX = (measureStart.x + measureEnd.x) / 2;
            const midY = (measureStart.y + measureEnd.y) / 2;
            const labelFontSize = 14 / stageScale;
            const dotR = 5 / stageScale;
            const sw = 2 / stageScale;
            const textW = 80 / stageScale;
            const labelRotation = measureEdge === 'top' ? 180 : measureEdge === 'left' ? -90 : 0;
            return (
              <Layer listening={false}>
                <Line
                  points={[measureStart.x, measureStart.y, measureEnd.x, measureEnd.y]}
                  stroke="rgba(100, 220, 255, 0.85)"
                  strokeWidth={sw}
                  dash={[8 / stageScale, 5 / stageScale]}
                />
                <Circle x={measureStart.x} y={measureStart.y} radius={dotR} fill="rgba(100, 220, 255, 0.95)" />
                <Circle x={measureEnd.x} y={measureEnd.y} radius={dotR} fill="rgba(100, 220, 255, 0.95)" />
                <Text
                  x={midX}
                  y={midY}
                  width={textW}
                  offsetX={textW / 2}
                  offsetY={labelFontSize / 2}
                  rotation={labelRotation}
                  text={`${distFeet} ft`}
                  fontSize={labelFontSize}
                  fill="rgba(100, 220, 255, 1)"
                  fontStyle="bold"
                  fontFamily="Inter"
                  align="center"
                  listening={false}
                />
              </Layer>
            );
          })()}

          {/* ── Pings — expanding pulse rings, fade out after ~2s ── */}
          {pings.length > 0 && (
            <Layer listening={false}>
              {pings.map(p => {
                void pingTick;
                const elapsed = Date.now() - p.startTime;
                const t = Math.min(1, elapsed / PING_DURATION_MS);
                // Two staggered rings for a "pulse" feel
                const rings = [0, 0.35].map((delay, i) => {
                  const localT = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
                  if (localT <= 0) return null;
                  const baseR = 18 / stageScale;
                  const maxR = 70 / stageScale;
                  const r = baseR + (maxR - baseR) * localT;
                  const opacity = (1 - localT) * 0.9;
                  const sw = 3 / stageScale;
                  return (
                    <Circle
                      key={`${p.id}-ring-${i}`}
                      x={p.x}
                      y={p.y}
                      radius={r}
                      stroke={p.color}
                      strokeWidth={sw}
                      opacity={opacity}
                      listening={false}
                    />
                  );
                });
                // Solid center dot pulsing in size
                const dotR = (6 / stageScale) * (1 + 0.4 * Math.sin(t * Math.PI * 4));
                const dotOpacity = Math.max(0, 1 - t);
                return (
                  <React.Fragment key={p.id}>
                    {rings}
                    <Circle
                      x={p.x}
                      y={p.y}
                      radius={dotR}
                      fill={p.color}
                      opacity={dotOpacity}
                      listening={false}
                    />
                  </React.Fragment>
                );
              })}
            </Layer>
          )}

        </Stage>

        {/* Spell marker dismiss bubble — player view double-tap */}
        {isPlayerView && dismissMarkerBubble && (
          <>
            {/* Backdrop to dismiss on tap-outside */}
            <div
              className="absolute inset-0 z-40"
              onClick={() => setDismissMarkerBubble(null)}
            />
            <div
              className="absolute z-50 pointer-events-auto -translate-x-1/2 -translate-y-full"
              style={{ left: dismissMarkerBubble.screenX, top: dismissMarkerBubble.screenY - 12 }}
            >
              <div className="bg-black/80 border border-red-500/40 rounded-lg px-3 py-2 shadow-xl flex items-center gap-2 animate-in zoom-in-95 duration-150">
                <button
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const updated = spellMarkers.filter(m => m.id !== dismissMarkerBubble.markerId);
                    onSpellMarkersChange?.(updated);
                    try { window.electronAPI?.sendPlayerSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                    setDismissMarkerBubble(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-400"
                >
                  <Trash2 size={12} />
                  Dismiss
                </button>
              </div>
            </div>
          </>
        )}

        {/* Placing spell indicator — hidden for wall/ring-shape spells and summon placements in player view
            (which use their own banners in PlayerScreen instead). */}
        {placingSpell && !pendingMarkerPos && !isPlayerView && placingSpell.shapeType !== 'wall' && (placingSpell.shapeType as any) !== 'ring' && !(isPlayerView && placingSpell.summonData) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
            <div className="bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-sm font-bold text-orange-400">
                {`Casting ${placingSpell.name}`}
              </span>
              <span className="text-xs text-white/40">Tap to place</span>
              <button
                onClick={() => { setPlacingSpell(null); setPendingMarkerPos(null); setEditingWall(null); setEditingRing(null); onCastingDismissed?.(); }}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Spell marker visibility prompt — DM only */}
        {pendingMarkerPos && placingSpell && !isPlayerView && (
          <div
            className="absolute z-50 pointer-events-auto"
            style={{
              left: (pendingMarkerPos.x * stageScale + stagePos.x) - 60,
              top: (pendingMarkerPos.y * stageScale + stagePos.y) - 60,
            }}
          >
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl p-3 space-y-2 w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 text-center">{placingSpell.name}</p>
              <button
                onClick={() => {
                  const marker: SpellMarker = {
                    id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    spellName: placingSpell.name,
                    school: placingSpell.school,
                    casterId: placingSpell.casterId,
                    x: pendingMarkerPos.x,
                    y: pendingMarkerPos.y,
                    effectRadius: placingSpell.effectRadius,
                    aoeType: placingSpell.aoeType,
                    aoeSize: placingSpell.aoeSize,
                    visibleToPlayers: true,
                    floorId: activeFloorId || undefined,
                    lightSource: !!placingSpell.effectRadius && !placingSpell.aoeType,
                  };
                  const updated = [...spellMarkers, marker];
                  onSpellMarkersChange?.(updated);
                  try { window.electronAPI?.sendDMSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                  setPlacingSpell(null);
                  setPendingMarkerPos(null);
                }}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
              >
                Visible
              </button>
              <button
                onClick={() => {
                  const marker: SpellMarker = {
                    id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    spellName: placingSpell.name,
                    school: placingSpell.school,
                    casterId: placingSpell.casterId,
                    x: pendingMarkerPos.x,
                    y: pendingMarkerPos.y,
                    effectRadius: placingSpell.effectRadius,
                    aoeType: placingSpell.aoeType,
                    aoeSize: placingSpell.aoeSize,
                    visibleToPlayers: false,
                    floorId: activeFloorId || undefined,
                    lightSource: !!placingSpell.effectRadius && !placingSpell.aoeType,
                  };
                  const updated = [...spellMarkers, marker];
                  onSpellMarkersChange?.(updated);
                  try { window.electronAPI?.sendDMSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                  setPlacingSpell(null);
                  setPendingMarkerPos(null);
                }}
                className="w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Hidden
              </button>
              <button
                onClick={() => {
                  setPlacingSpell(null);
                  setPendingMarkerPos(null);
                }}
                className="w-full px-2 py-1 rounded text-[10px] font-bold text-white/20 hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tower View return button — player screen only, shown while a viewpoint is active */}
        {isPlayerView && activeViewpointId && (() => {
          return (
            <div className="absolute bottom-6 right-6 z-30 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
              <button
                onClick={() => {
                  const ret = viewpointReturnRef.current;
                  if (ret) {
                    animateZoom(ret.scale, ret.x, ret.y, () => {
                      setActiveViewpointId(null);
                      viewpointReturnRef.current = null;
                    });
                  } else {
                    setActiveViewpointId(null);
                  }
                }}
                className="flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl font-sans font-semibold text-sm text-white transition-all active:scale-95"
                style={{ background: 'rgba(88,28,135,0.85)', border: '1.5px solid rgba(192,38,211,0.7)', backdropFilter: 'blur(8px)' }}
              >
                <Eye size={15} style={{ color: '#d8b4fe' }} />
                Leave Viewpoint
              </button>
            </div>
          );
        })()}

        {/* Portal Type Context Menu (DM only) */}
        {!isPlayerView && portalContextMenu && (
          <>
            {/* Backdrop to dismiss */}
            <div
              className="absolute inset-0 z-40"
              onClick={() => setPortalContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setPortalContextMenu(null); }}
            />
            <div
              data-context-menu
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[160px]"
              style={portalContextMenu.clientY > window.innerHeight / 2
                ? { left: portalContextMenu.screenX, bottom: (containerRef.current?.clientHeight ?? window.innerHeight) - portalContextMenu.screenY }
                : { left: portalContextMenu.screenX, top: portalContextMenu.screenY }
              }
            >
              <div className="px-3 py-2 border-b border-[var(--line)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Portal Type</p>
              </div>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'door' && !portalContextMenu.locked ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'door', false);
                  setPortalContextMenu(null);
                }}
              >
                <DoorClosed size={14} />
                Door
                {portalContextMenu.portalType === 'door' && !portalContextMenu.locked && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'door' && portalContextMenu.locked ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'door', true);
                  setPortalContextMenu(null);
                }}
              >
                <Lock size={14} />
                Locked Door
                {portalContextMenu.portalType === 'door' && portalContextMenu.locked && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'window' && !portalContextMenu.locked ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'window', false);
                  setPortalContextMenu(null);
                }}
              >
                <Blinds size={14} />
                Window
                {portalContextMenu.portalType === 'window' && !portalContextMenu.locked && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'window' && portalContextMenu.locked ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'window', true);
                  setPortalContextMenu(null);
                }}
              >
                <Lock size={14} />
                Locked Window
                {portalContextMenu.portalType === 'window' && portalContextMenu.locked && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'secret' ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'secret', false);
                  setPortalContextMenu(null);
                }}
              >
                <SquareDashedTopSolid size={14} />
                Secret Door
                {portalContextMenu.portalType === 'secret' && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
            </div>
          </>
        )}

        {/* Viewpoint Context Menu (DM only) */}
        {!isPlayerView && viewpointContextMenu && (
          <>
            <div
              className="absolute inset-0 z-40"
              onClick={() => setViewpointContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setViewpointContextMenu(null); }}
            />
            <div
              data-context-menu
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[160px]"
              style={viewpointContextMenu.clientY > window.innerHeight / 2
                ? { left: viewpointContextMenu.screenX, bottom: (containerRef.current?.clientHeight ?? window.innerHeight) - viewpointContextMenu.screenY }
                : { left: viewpointContextMenu.screenX, top: viewpointContextMenu.screenY }
              }
            >
              <div className="px-3 py-2 border-b border-[var(--line)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Viewpoint</p>
              </div>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left"
                onClick={() => {
                  const vp = viewpoints?.find(v => v.id === viewpointContextMenu.viewpointId);
                  if (vp) {
                    setViewpointDraft({ zoomPercent: (vp.zoomScale / stageScale) * 100 });
                    setContextMenu({
                      x: vp.x,
                      y: vp.y,
                      stageX: viewpointContextMenu.screenX,
                      stageY: viewpointContextMenu.screenY,
                      clientY: viewpointContextMenu.clientY,
                      view: 'viewpoint',
                      viewpointId: vp.id
                    });
                  }
                  setViewpointContextMenu(null);
                }}
              >
                <Edit2 size={14} />
                Edit Viewpoint
              </button>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left"
                onClick={() => {
                  const vp = viewpoints?.find(v => v.id === viewpointContextMenu.viewpointId);
                  if (vp) {
                    onViewpointsChange?.((viewpoints ?? []).map(v => v.id === vp.id ? { ...v, isHidden: !v.isHidden } : v));
                  }
                  setViewpointContextMenu(null);
                }}
              >
                {viewpoints?.find(v => v.id === viewpointContextMenu.viewpointId)?.isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                {viewpoints?.find(v => v.id === viewpointContextMenu.viewpointId)?.isHidden ? 'Show Viewpoint' : 'Hide Viewpoint'}
              </button>
              <div className="border-t border-[var(--line)]"></div>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors text-left"
                onClick={() => {
                  onViewpointsChange?.((viewpoints ?? []).filter(v => v.id !== viewpointContextMenu.viewpointId));
                  setViewpointContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                Delete Viewpoint
              </button>
            </div>
          </>
        )}

        {/* Note Tooltips Overlay */}
        {!isPlayerView && hoveredNoteId && mapNotes.find(n => n.id === hoveredNoteId) && (() => {
          const note = mapNotes.find(n => n.id === hoveredNoteId)!;
          const screenX = note.x * stageScale + stagePos.x;
          // Position relative to note radius (scaled to screen size)
          const screenY = note.y * stageScale + stagePos.y - (tokenRadius * 0.6 * stageScale) - 8;

          return (
            <div
              className="absolute pointer-events-none z-[100] bg-black shadow-[0_4px_20px_rgba(0,0,0,0.5)] rounded px-3 py-2 border border-white/10"
              style={{
                left: screenX,
                top: screenY,
                transform: 'translate(-50%, -100%)',
                maxWidth: 320,
              }}
            >
              <div className="text-white text-[15px] font-sans truncate leading-snug">
                {note.content.split('\n')[0]}
              </div>
            </div>
          );
        })()}

        {/* Wall of Fire Ring — hot-side toggle overlay (hidden for Wall of Ice Dome) */}
        {editingRing && editingRing.spellName !== 'Wall of Ice (Dome)' && editingRing.spellName !== 'Wall of Force (Dome)' && editingRing.spellName !== 'Wall of Thorns (Ring)' && editingRing.spellName !== 'Blade Barrier (Ring)' && editingRing.spellName !== 'Hallow' && (() => {
          const ringRadiusPx = (editingRing.radius / 5) * ppg;
          const screenX = editingRing.x * stageScale + stagePos.x;
          const screenY = editingRing.y * stageScale + stagePos.y;
          const screenR = ringRadiusPx * stageScale;
          return (
            <div
              className="absolute z-50 pointer-events-auto -translate-x-1/2"
              style={{ left: screenX, top: screenY + screenR + 14 }}
            >
              <button
                onClick={() => setEditingRing(r => r ? { ...r, hotSide: r.hotSide === 'inside' ? 'outside' : 'inside' } : null)}
                onPointerDown={(e) => e.preventDefault()}
                className="bg-black/80 border border-orange-500/50 rounded-full px-3 py-1.5 text-xs text-orange-300 font-semibold hover:bg-orange-900/80 transition-colors flex items-center gap-1.5 shadow-lg"
              >
                <span>🔥</span>
                <span>Fire: {editingRing.hotSide === 'inside' ? 'Inward' : 'Outward'}</span>
                <span className="text-white/35 text-[10px] ml-0.5">tap to flip</span>
              </button>
            </div>
          );
        })()}

        {/* Enlarge/Reduce Token Targeting Banner */}
        {targetingEnlargeReduce && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm font-bold text-orange-400">
              Casting Enlarge/Reduce ({targetingEnlargeReduce.mode === 'enlarge' ? 'Enlarge' : 'Reduce'})
            </span>
            {targetingEnlargeReduce.targetTokenId ? (
              <button
                onClick={() => {
                  const { mode, targetTokenId } = targetingEnlargeReduce;
                  const sizes: Token['size'][] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
                  const target = tokens.find(t => t.id === targetTokenId);
                  if (target) {
                    const currentSize = target.size ?? 'Medium';
                    const idx = sizes.indexOf(currentSize);
                    const newSize = mode === 'enlarge'
                      ? sizes[Math.min(idx + 1, sizes.length - 1)]
                      : sizes[Math.max(idx - 1, 0)];
                    // Preserve the original pre-spell size so it can be reverted via right-click.
                    // If the token is already under Enlarge/Reduce, keep the existing enlargedFrom.
                    const originalSize = target.enlargedFrom ?? currentSize;
                    const updatedTokens = tokens.map(t => t.id === targetTokenId ? { ...t, size: newSize, enlargedFrom: originalSize } : t);
                    onTokensChange(updatedTokens);
                    try {
                      if (!isPlayerView) {
                        (window.electronAPI as any)?.sendDMTokenUpdate?.(updatedTokens);
                      }
                    } catch (_e) { /* IPC not available */ }
                  }
                  setTargetingEnlargeReduce(null);
                  setSelectedTokenId(null);
                  onCastingDismissed?.();
                }}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
              >
                Confirm Cast
              </button>
            ) : (
              <span className="text-xs text-white/40">Tap a token to target</span>
            )}
            <button
              onClick={() => { setTargetingEnlargeReduce(null); setSelectedTokenId(null); onCastingDismissed?.(); }}
              className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Edit Walls Toolbar */}
        {wallEditMode && !isPlayerView && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-1.5 pointer-events-none">
          <div className="bg-[#1a1512] border border-orange-400/50 rounded-md px-2 py-1.5 shadow-xl flex items-center gap-1.5 pointer-events-auto">
            <span className="text-[10px] uppercase tracking-wider opacity-40 px-1.5">Edit Walls</span>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={() => {
                if (wallPainting) { onStopWallPainting?.(); }
                else {
                  if (wallErasing) onToggleWallErasing?.();
                  if (portalPlacementMode) onStopPortalPlacement?.();
                  onStartWallPainting?.();
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                wallPainting
                  ? 'bg-orange-500/30 border-orange-400/50 text-orange-200'
                  : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-400/30'
              )}
            >
              <Pencil size={11} />
              {wallPainting ? 'Drawing…' : 'Draw Walls'}
            </button>
            <button
              onClick={() => {
                if (!wallErasing) {
                  if (wallPainting) onStopWallPainting?.();
                  if (portalPlacementMode) onStopPortalPlacement?.();
                }
                onToggleWallErasing?.();
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                wallErasing
                  ? 'bg-red-500/30 border-red-400/50 text-red-200'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-400/25'
              )}
            >
              <Eraser size={11} />
              {wallErasing ? 'Erasing' : 'Eraser'}
            </button>
            {onStartPortalPlacement && (
              <>
                <button
                  onClick={() => {
                    if (wallPainting) onStopWallPainting?.();
                    if (wallErasing) onToggleWallErasing?.();
                    onStartPortalPlacement('door');
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                    portalPlacementMode === 'door'
                      ? 'bg-green-500/30 border-green-400/50 text-green-200'
                      : 'bg-green-500/15 hover:bg-green-500/25 border-green-400/30'
                  )}
                >
                  <DoorClosed size={11} />
                  {portalPlacementMode === 'door' ? 'Placing…' : 'Add Door'}
                </button>
                <button
                  onClick={() => {
                    if (wallPainting) onStopWallPainting?.();
                    if (wallErasing) onToggleWallErasing?.();
                    onStartPortalPlacement('window');
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                    portalPlacementMode === 'window'
                      ? 'bg-blue-500/30 border-blue-400/50 text-blue-200'
                      : 'bg-blue-500/15 hover:bg-blue-500/25 border-blue-400/30'
                  )}
                >
                  <Blinds size={11} />
                  {portalPlacementMode === 'window' ? 'Placing…' : 'Add Window'}
                </button>
              </>
            )}
            {gridResolution && (
              <button
                onClick={() => onToggleWallSnapToGrid?.()}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                  wallSnapToGrid
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-black/30 border-white/10 opacity-70 hover:opacity-100'
                )}
              >
                <SquareDashed size={10} />
                Snap {wallSnapToGrid ? 'ON' : 'OFF'}
              </button>
            )}
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={exitWallEditMode}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border border-white/15 bg-white/5 hover:bg-white/15 transition-colors"
            >
              <X size={11} />
              Done
            </button>
          </div>
          {(wallPainting || wallErasing || portalPlacementMode) && (
            <div className="text-[10px] opacity-60 whitespace-nowrap text-center">
              {wallPainting ? (
                <><kbd className="px-1 py-0.5 rounded bg-black/40">Enter</kbd> finish wall · <kbd className="px-1 py-0.5 rounded bg-black/40">Esc</kbd> stop</>
              ) : wallErasing ? (
                <>Click a wall or portal to delete it.</>
              ) : (
                <>Click two points on a wall to place the {portalPlacementMode}.</>
              )}
            </div>
          )}
          </div>
        )}

        {/* Dark Zones Toolbar */}
        {darkZoneEditMode && !isPlayerView && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-1.5 pointer-events-none">
          <div className="bg-[#13121c] border border-indigo-400/50 rounded-md px-2 py-1.5 shadow-xl flex items-center gap-1.5 pointer-events-auto">
            <span className="text-[10px] uppercase tracking-wider opacity-40 px-1.5">Dark Zones</span>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={() => {
                if (darkZonePainting) {
                  commitCurrentDark();
                  onDarkZonePaintCancel?.();
                } else {
                  setDarkZoneErasing(false);
                  onStartDarkZonePainting?.();
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                darkZonePainting
                  ? 'bg-indigo-500/30 border-indigo-400/50 text-indigo-200'
                  : 'bg-indigo-500/15 hover:bg-indigo-500/25 border-indigo-400/30'
              )}
            >
              <Pencil size={11} />
              {darkZonePainting ? 'Drawing…' : 'Draw Zone'}
            </button>
            <button
              onClick={() => {
                if (!darkZoneErasing && darkZonePainting) {
                  commitCurrentDark();
                  onDarkZonePaintCancel?.();
                }
                setDarkZoneErasing(v => !v);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                darkZoneErasing
                  ? 'bg-red-500/30 border-red-400/50 text-red-200'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-400/25'
              )}
            >
              <Eraser size={11} />
              {darkZoneErasing ? 'Erasing' : 'Eraser'}
            </button>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={exitDarkZoneEditMode}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border border-white/15 bg-white/5 hover:bg-white/15 transition-colors"
            >
              <X size={11} />
              Done
            </button>
          </div>
          {(darkZonePainting || darkZoneErasing) && (
            <div className="text-[10px] opacity-60 whitespace-nowrap text-center">
              {darkZonePainting ? (
                <>Click points · click the first node or <kbd className="px-1 py-0.5 rounded bg-black/40">Enter</kbd> to close · <kbd className="px-1 py-0.5 rounded bg-black/40">Esc</kbd> stop</>
              ) : (
                <>Click a dark zone to delete it.</>
              )}
            </div>
          )}
          </div>
        )}

        {/* Difficult Terrain Toolbar */}
        {terrainEditMode && !isPlayerView && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-1.5 pointer-events-none">
          <div className="bg-[#1a1610] border border-amber-500/50 rounded-md px-2 py-1.5 shadow-xl flex items-center gap-1.5 pointer-events-auto">
            <span className="text-[10px] uppercase tracking-wider opacity-40 px-1.5">Difficult Terrain</span>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={() => {
                if (difficultTerrainPainting) {
                  commitCurrentTerrain();
                  onDifficultTerrainPaintCancel?.();
                } else {
                  setTerrainErasing(false);
                  onStartDifficultTerrainPainting?.();
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                difficultTerrainPainting
                  ? 'bg-amber-600/30 border-amber-500/50 text-amber-200'
                  : 'bg-amber-600/15 hover:bg-amber-600/25 border-amber-500/30'
              )}
            >
              <Pencil size={11} />
              {difficultTerrainPainting ? 'Drawing…' : 'Draw Area'}
            </button>
            <button
              onClick={() => {
                if (!terrainErasing && difficultTerrainPainting) {
                  commitCurrentTerrain();
                  onDifficultTerrainPaintCancel?.();
                }
                setTerrainErasing(v => !v);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                terrainErasing
                  ? 'bg-red-500/30 border-red-400/50 text-red-200'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-400/25'
              )}
            >
              <Eraser size={11} />
              {terrainErasing ? 'Erasing' : 'Eraser'}
            </button>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={exitTerrainEditMode}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border border-white/15 bg-white/5 hover:bg-white/15 transition-colors"
            >
              <X size={11} />
              Done
            </button>
          </div>
          {(difficultTerrainPainting || terrainErasing) && (
            <div className="text-[10px] opacity-60 whitespace-nowrap text-center">
              {difficultTerrainPainting ? (
                <>Click points · click the first node or <kbd className="px-1 py-0.5 rounded bg-black/40">Enter</kbd> to close · <kbd className="px-1 py-0.5 rounded bg-black/40">Esc</kbd> stop</>
              ) : (
                <>Click a difficult-terrain area to delete it.</>
              )}
            </div>
          )}
          </div>
        )}

        {/* Sound Zones Toolbar */}
        {soundZoneEditMode && !isPlayerView && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-1.5 pointer-events-none">
          <div className="bg-[#171512] border border-[var(--accent)]/50 rounded-md px-2 py-1.5 shadow-xl flex items-center gap-1.5 pointer-events-auto">
            <span className="text-[10px] uppercase tracking-wider opacity-40 px-1.5">Sound Zones</span>
            <div className="w-px h-5 bg-white/10" />
            {/* Painting needs a sound attached, so "Add Zone" goes through the
                sound picker panel; painting starts from there. */}
            <button
              onClick={() => {
                if (zonePainting) {
                  commitCurrentZone();
                  onSoundZonePaintCancel?.();
                } else {
                  setSoundZoneErasing(false);
                  onOpenSoundZones?.();
                }
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                zonePainting
                  ? 'bg-[var(--accent)]/30 border-[var(--accent)]/50'
                  : 'bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25 border-[var(--accent)]/30'
              )}
            >
              <PlusCircle size={11} />
              {zonePainting ? 'Drawing…' : 'Add Zone'}
            </button>
            <button
              onClick={() => {
                if (!soundZoneErasing && zonePainting) {
                  commitCurrentZone();
                  onSoundZonePaintCancel?.();
                }
                setSoundZoneErasing(v => !v);
              }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border transition-colors',
                soundZoneErasing
                  ? 'bg-red-500/30 border-red-400/50 text-red-200'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-400/25'
              )}
            >
              <Eraser size={11} />
              {soundZoneErasing ? 'Erasing' : 'Eraser'}
            </button>
            <div className="w-px h-5 bg-white/10" />
            <button
              onClick={exitSoundZoneEditMode}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] whitespace-nowrap rounded-md border border-white/15 bg-white/5 hover:bg-white/15 transition-colors"
            >
              <X size={11} />
              Done
            </button>
          </div>
          {(zonePainting || soundZoneErasing) && (
            <div className="text-[10px] opacity-60 whitespace-nowrap text-center">
              {zonePainting ? (
                <>Painting <strong>{zonePainting.label ?? 'new zone'}</strong> · click points · first node or <kbd className="px-1 py-0.5 rounded bg-black/40">Enter</kbd> closes · <kbd className="px-1 py-0.5 rounded bg-black/40">Esc</kbd> stop</>
              ) : (
                <>Click a sound zone to delete it.</>
              )}
            </div>
          )}
          </div>
        )}

        {/* DM Casting Mode Banner (mouse-follow phase only) */}
        {castingSpell && !isPlayerView && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm font-bold text-orange-400">Casting {castingSpell.name}</span>
            <span className="text-xs text-white/40">Click to place · Escape to cancel</span>
          </div>
        )}

        {/* DM Placed AoE Banner — local DM spell */}
        {placedAoe && !castingSpell && !isPlayerView && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-sm font-bold text-orange-400">Casting {placedAoe.name}</span>
            {!placedAoe.saveResults && placedAoe.saveAbility && (
              <button
                onClick={handleConfirmCast}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
              >
                Confirm Cast
              </button>
            )}
            {placedAoe.saveResults && (
              <span className="text-xs font-semibold text-green-400">Saves Rolled</span>
            )}
            <button
              onClick={() => { setPlacedAoe(null); onCastingDismissed?.(); onAoeHighlightsChange?.(null); }}
              className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              {placedAoe.saveResults ? 'Done' : 'Cancel'}
            </button>
          </div>
        )}

        {/* DM Remote AoE Banner — player's spell visible to DM */}
        {remoteAoe && !isPlayerView && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-purple-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-purple-500/10 pointer-events-auto">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-sm font-bold text-purple-400">Player Casting {remoteAoe.name}</span>
            {remoteAoe.saveResults && (
              <span className="text-xs font-semibold text-green-400">Saves Rolled</span>
            )}
          </div>
        )}

        {/* Context Menu / Note Creator */}
        {contextMenu && createPortal(
          <div
            data-context-menu
            // Big centered panels (bestiary / extras) mount as their own element so
            // they appear at full size immediately, instead of morphing out of the
            // small root menu. They fade in rather than scaling up from small.
            key={contextMenu.view === 'add-enemy' || contextMenu.view === 'add-extra' ? 'cm-panel' : 'cm-menu'}
            className={cn(
              "fixed z-[200] bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl",
              contextMenu.view === 'add-enemy' || contextMenu.view === 'add-extra'
                ? "animate-in fade-in duration-150"
                : "animate-in zoom-in-95 duration-200",
              contextMenu.view === 'add-enemy' ? "w-[440px] overflow-hidden"
                : contextMenu.view === 'add-extra' ? "w-[640px] overflow-hidden"
                : contextMenu.view === 'note' ? "w-72"
                : "w-64"
            )}
            style={
              (contextMenu.view === 'add-enemy' || contextMenu.view === 'add-extra')
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : contextMenu.clientY > window.innerHeight / 2
                  ? { left: contextMenu.stageX, bottom: window.innerHeight - contextMenu.stageY }
                  : { left: contextMenu.stageX, top: contextMenu.stageY }
            }
            onMouseLeave={() => setActiveSubmenu(null)}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.view === 'root' && (
              <div className="flex flex-col py-1 relative">
                <button
                  onMouseEnter={scheduleSubmenuClose}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'note' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <PlusCircle size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Note</span>
                </button>
                {/* "Add a Viewpoint" hidden for now — functionality kept intact, just not exposed in the menu.
                <button
                  onMouseEnter={scheduleSubmenuClose}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'viewpoint' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <Eye size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Viewpoint</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                */}
                <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-50" />

                {/* Player Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => openSubmenu('player')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'player' ? "bg-blue-500 text-white" : "hover:bg-blue-500 hover:text-white"
                    )}
                  >
                    <User size={14} className={cn(activeSubmenu === 'player' ? "text-white" : "text-blue-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add/Move Players</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* Player Submenu */}
                  {activeSubmenu === 'player' && (
                    <div
                      onMouseEnter={cancelSubmenuClose}
                      className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150 before:content-[''] before:absolute before:right-full before:top-0 before:h-full before:w-2"
                    >
                      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 border-b border-[var(--line)] mb-1">Select Player</div>
                      {players.length > 1 && contextMenu && (
                        <button
                          onClick={() => {
                            const spacing = gridResolution?.pixelsPerGrid || 70;
                            onMoveAllPlayersHere?.(contextMenu.x, contextMenu.y, activeFloorId || '', spacing);
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-4 py-2 text-xs hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-2 border-b border-[var(--line)] mb-1"
                        >
                          <Layers size={12} className="opacity-50" />
                          Move All Players Here
                        </button>
                      )}
                      {(() => {
                        const onMap = players.filter(c => tokens.some(t => t.combatantId === c.id));
                        const notOnMap = players.filter(c => !tokens.some(t => t.combatantId === c.id));
                        return (
                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notOnMap.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleCombatantSelect(c, 'player')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-2"
                              >
                                <MenuAvatar avatar={c.avatar} name={c.name} color={c.color} />
                                {c.name}
                              </button>
                            ))}
                            {onMap.length > 0 && (
                              <>
                                {notOnMap.length > 0 && <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-30" />}
                                {onMap.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => handleCombatantSelect(c, 'player')}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-2"
                                  >
                                    <MenuAvatar avatar={c.avatar} name={c.name} color={c.color} />
                                    {c.name}
                                  </button>
                                ))}
                              </>
                            )}
                            {players.length === 0 && (
                              <div className="px-4 py-4 text-center opacity-30 text-[10px] italic">No players found</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <button
                  onMouseEnter={scheduleSubmenuClose}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-enemy' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[#ef4444] hover:text-white transition-colors group"
                >
                  <Skull size={14} className="text-[#ef4444] group-hover:text-white" />
                  <span className="flex-1 text-left">Add Enemies</span>
                </button>

                {/* NPC Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => openSubmenu('npc')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'npc' ? "bg-emerald-500 text-white" : "hover:bg-emerald-500 hover:text-white"
                    )}
                  >
                    <Shield size={14} className={cn(activeSubmenu === 'npc' ? "text-white" : "text-emerald-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add NPCs</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* NPC Submenu */}
                  {activeSubmenu === 'npc' && (
                    <div
                      onMouseEnter={cancelSubmenuClose}
                      className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150 before:content-[''] before:absolute before:right-full before:top-0 before:h-full before:w-2"
                    >
                      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 border-b border-[var(--line)] mb-1">Select NPC</div>
                      {(() => {
                        const onMap = npcs.filter(c => tokens.some(t => t.combatantId === c.id));
                        const notOnMap = npcs.filter(c => !tokens.some(t => t.combatantId === c.id));
                        return (
                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notOnMap.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleCombatantSelect(c, 'npc')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-2"
                              >
                                <MenuAvatar avatar={c.avatar} name={c.name} color={c.color} />
                                {c.name}
                              </button>
                            ))}
                            {onMap.length > 0 && (
                              <>
                                {notOnMap.length > 0 && <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-30" />}
                                {onMap.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => handleCombatantSelect(c, 'npc')}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-2"
                                  >
                                    <MenuAvatar avatar={c.avatar} name={c.name} color={c.color} />
                                    {c.name}
                                  </button>
                                ))}
                              </>
                            )}
                            {npcs.length === 0 && (
                              <div className="px-4 py-4 text-center opacity-30 text-[10px] italic">No NPCs found</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Add an Extra — background characters from the global gallery */}
                <button
                  onMouseEnter={scheduleSubmenuClose}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-extra' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-slate-500 hover:text-white transition-colors group"
                >
                  <Users size={14} className="text-slate-400 group-hover:text-white" />
                  <span className="flex-1 text-left">Add Extras</span>
                </button>
              </div>
            )}

            {contextMenu.view === 'add-extra' && (() => {
              const tags = allTags(extrasList);
              const filtered = filterExtras(extrasList, extraSearch, extraTagFilter);
              const sizes: Token['size'][] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
              return (
                <div className="flex flex-col h-[560px]">
                  <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-slate-400" />
                      <p className="text-xs font-bold uppercase tracking-widest opacity-50">Extras</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setManageExtrasOpen(true)}
                        className="text-[10px] uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
                      >
                        Manage…
                      </button>
                      <button
                        onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)}
                        className="opacity-50 hover:opacity-100 text-xs uppercase font-bold tracking-tighter"
                      >
                        Back
                      </button>
                    </div>
                  </div>

                  {/* Controls: search + size + tag chips */}
                  <div className="p-3 border-b border-[var(--line)] space-y-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                        <input
                          autoFocus
                          type="text"
                          value={extraSearch}
                          onChange={(e) => setExtraSearch(e.target.value)}
                          placeholder="Search…"
                          className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                        />
                      </div>
                      <div className="flex items-center bg-black/20 rounded-md p-0.5 gap-0.5">
                        {sizes.map(s => (
                          <button
                            key={s}
                            onClick={() => setExtraSizeChoice(s)}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors",
                              extraSizeChoice === s ? "bg-[var(--accent)] text-white" : "opacity-50 hover:opacity-100"
                            )}
                            title={s}
                          >
                            {s[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => {
                          const active = extraTagFilter.includes(t);
                          return (
                            <button
                              key={t}
                              onClick={() => setExtraTagFilter(prev =>
                                active ? prev.filter(x => x !== t) : [...prev, t]
                              )}
                              className={cn(
                                "px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-full border transition-colors",
                                active
                                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                  : "border-[var(--line)] opacity-60 hover:opacity-100"
                              )}
                            >
                              {t}
                            </button>
                          );
                        })}
                        {extraTagFilter.length > 0 && (
                          <button
                            onClick={() => setExtraTagFilter([])}
                            className="px-2 py-0.5 text-[10px] uppercase tracking-wider opacity-50 hover:opacity-100"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Gallery */}
                  <div className="flex-1 overflow-y-auto p-3 bg-black/5">
                    {extrasList.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                        <Users size={36} className="mb-3 opacity-50" />
                        <p className="text-sm">No Extras yet.</p>
                        <button
                          onClick={() => setManageExtrasOpen(true)}
                          className="mt-3 px-3 py-1.5 text-xs uppercase tracking-wider rounded-md bg-[var(--accent)] text-white"
                        >
                          Add Some…
                        </button>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="h-full flex items-center justify-center opacity-40 text-sm">
                        No matches.
                      </div>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                        {filtered.map(e => (
                          <button
                            key={e.id}
                            onClick={() => handleExtraSelect(e)}
                            className="group relative aspect-square bg-black/30 rounded-lg overflow-hidden border border-transparent hover:border-[var(--accent)] transition-all"
                            title={`${e.name} — click to place as ${extraSizeChoice}`}
                          >
                            <img
                              src={extraImageUrl(e.filename)}
                              alt={e.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              onError={(ev) => { (ev.target as HTMLImageElement).style.opacity = '0.2'; }}
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-1.5">
                              <p className="text-[10px] font-bold truncate text-white">{e.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {contextMenu.view === 'note' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Add Map Note</span>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex justify-between mb-3 bg-black/20 p-1 rounded-lg">
                  {(['quote', 'treasure', 'warning', 'magic', 'poison', 'image', 'sound'] as MapNoteType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoteDraft(prev => ({ ...prev, type, imageData: type === 'image' ? prev.imageData : undefined }))}
                      className={cn(
                        "px-2 py-2.5 rounded-md transition-all",
                        noteDraft.type === type ? "scale-110 shadow-lg" : "hover:bg-white/5 opacity-40 hover:opacity-100"
                      )}
                      style={noteDraft.type === type ? { backgroundColor: getNoteColor(type) } : undefined}
                    >
                      <NoteIcon type={type} size={18} className={noteDraft.type === type ? "text-white" : ""} />
                    </button>
                  ))}
                </div>

                {noteDraft.type === 'sound' ? (
                  <>
                    {noteDraft.soundId ? (() => {
                      const picked = librarySoundsForNotes.find(s => s.id === noteDraft.soundId);
                      return (
                        <div className="mb-3 rounded-lg overflow-hidden border border-[var(--line)] bg-black/30 p-3">
                          <div className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Sound</div>
                          <div className="text-sm font-medium truncate">{picked?.name ?? noteDraft.soundId}</div>
                          {picked && (
                            <div className="text-[10px] opacity-50 truncate mt-0.5">{picked.filename}</div>
                          )}
                          <button
                            onClick={() => setNoteSoundPickerOpen(true)}
                            className="mt-2 text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100"
                          >
                            Change sound
                          </button>
                        </div>
                      );
                    })() : (
                      <button
                        onClick={() => setNoteSoundPickerOpen(true)}
                        className="w-full mb-3 py-6 rounded-lg border border-dashed border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-xs uppercase tracking-widest opacity-60 hover:opacity-100"
                      >
                        Choose Sound…
                      </button>
                    )}
                    <input
                      value={noteDraft.content}
                      onChange={(e) => setNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Label (optional)"
                      className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors mb-3"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveNote();
                        }
                      }}
                    />
                  </>
                ) : noteDraft.type === 'image' ? (
                  <>
                    <input
                      ref={noteImageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleNoteImagePick}
                      className="hidden"
                    />
                    {noteDraft.imageData ? (
                      <div className="mb-3 rounded-lg overflow-hidden border border-[var(--line)] bg-black/30">
                        <img src={noteDraft.imageData} alt="" className="w-full max-h-[160px] object-contain" />
                        <button
                          onClick={() => noteImageInputRef.current?.click()}
                          className="w-full py-1.5 text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 hover:bg-white/5 transition-colors"
                        >
                          Replace
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => noteImageInputRef.current?.click()}
                        className="w-full mb-3 py-6 rounded-lg border border-dashed border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-xs uppercase tracking-widest opacity-60 hover:opacity-100"
                      >
                        Choose Image…
                      </button>
                    )}
                    <input
                      value={noteDraft.content}
                      onChange={(e) => setNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Caption (optional)"
                      className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors mb-3"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          saveNote();
                        }
                      }}
                    />
                  </>
                ) : (
                  <textarea
                    autoFocus
                    value={noteDraft.content}
                    onChange={(e) => setNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Write note content..."
                    className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors min-h-[120px] resize-none mb-3"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveNote();
                      }
                    }}
                  />
                )}

                <button
                  disabled={
                    noteDraft.type === 'image'
                      ? !noteDraft.imageData
                      : noteDraft.type === 'sound'
                      ? !noteDraft.soundId
                      : !noteDraft.content.trim()
                  }
                  onClick={saveNote}
                  className="btn-filled w-full py-2 rounded-lg disabled:opacity-30"
                >
                  Save Note
                </button>
              </div>
            )}

            {contextMenu.view === 'viewpoint' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{contextMenu.viewpointId ? 'Edit Viewpoint' : 'Add Viewpoint'}</span>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-[10px] opacity-50 mb-1">
                    <span>Zoom Out Amount</span>
                    <span className="font-bold">{viewpointDraft.zoomPercent}% of current zoom</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    step={5}
                    value={viewpointDraft.zoomPercent}
                    onChange={(e) => setViewpointDraft(prev => ({ ...prev, zoomPercent: Number(e.target.value) }))}
                    className="w-full accent-[var(--accent)]"
                  />
                  <div className="flex justify-between text-[9px] opacity-30 mt-0.5">
                    <span>Very far</span>
                    <span>Near</span>
                  </div>
                </div>

                <button
                  onClick={saveViewpoint}
                  className="btn-filled w-full py-2 rounded-lg"
                >
                  {contextMenu.viewpointId ? 'Save Viewpoint' : 'Place Viewpoint'}
                </button>
              </div>
            )}

            {contextMenu.view === 'spell-marker' && contextMenu.markerId && (() => {
              const marker = spellMarkers.find(m => m.id === contextMenu.markerId);
              if (!marker) return null;
              return (
                <div className="flex flex-col py-1">
                  <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest opacity-30">{marker.spellName}</p>
                  <button
                    onClick={() => {
                      const updated = spellMarkers.map(m =>
                        m.id === marker.id ? { ...m, visibleToPlayers: !m.visibleToPlayers } : m
                      );
                      onSpellMarkersChange?.(updated);
                      try { window.electronAPI?.sendDMSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                  >
                    {marker.visibleToPlayers ? <EyeOff size={14} className="opacity-50 group-hover:opacity-100" /> : <Eye size={14} className="opacity-50 group-hover:opacity-100" />}
                    <span>{marker.visibleToPlayers ? 'Hide from Players' : 'Show to Players'}</span>
                  </button>
                  <button
                    onClick={() => {
                      const updated = spellMarkers.filter(m => m.id !== marker.id);
                      onSpellMarkersChange?.(updated);
                      try { window.electronAPI?.sendDMSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-red-500 hover:text-white transition-colors group text-red-400"
                  >
                    <Trash2 size={14} className="opacity-50 group-hover:opacity-100" />
                    <span>Dismiss</span>
                  </button>
                </div>
              );
            })()}

            {contextMenu.view === 'add-enemy' && (
              <div className="flex flex-col h-[550px]">
                <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Skull size={14} className="text-[#ef4444]" />
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50">Bestiary</p>
                  </div>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-xs uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-2 border-b border-[var(--line)]">
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                      <input
                        autoFocus
                        type="text"
                        value={monsterSearch}
                        onChange={(e) => setMonsterSearch(e.target.value)}
                        placeholder="Search monsters..."
                        className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--line)]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={showSource2014} onChange={(e) => setShowSource2014(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                      <span className="text-xs opacity-60">2014</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={showSource2024} onChange={(e) => setShowSource2024(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                      <span className="text-xs opacity-60">2024</span>
                    </label>
                  </div>
                  <BestiaryList
                    monsters={BESTIARY.filter(m =>
                      m.name.toLowerCase().includes(monsterSearch.toLowerCase()) &&
                      ((showSource2014 && m.source === '2014') || (showSource2024 && m.source === '2024'))
                    )}
                    selectedId={selectedMonster?.id ?? null}
                    onSelect={(m) => { setSelectedMonster(m); setMonsterSizeChoice(m.size?.includes('/') ? 'Medium' : (m.size || 'Medium')); }}
                  />
                </div>

                {/* Bottom controls: size / quantity / add */}
                {selectedMonster && (
                  <div className="p-3 border-t border-[var(--line)] bg-[var(--surface)] space-y-3 shrink-0">
                    {selectedMonster.size?.includes('/') && (
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-bold uppercase tracking-widest opacity-50">Size</span>
                        <div className="flex items-center bg-black/20 rounded-lg p-1 gap-0.5">
                          {selectedMonster.size.split('/').map(s => s.trim()).map(s => (
                            <button
                              key={s}
                              onClick={() => setMonsterSizeChoice(s)}
                              className={cn(
                                "px-3 py-1 rounded text-xs font-bold transition-colors",
                                monsterSizeChoice === s ? "bg-[var(--accent)] text-white" : "opacity-50 hover:opacity-100"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-50">Quantity</span>
                      <div className="flex items-center gap-3 bg-black/20 rounded-lg p-1">
                        <button
                          onClick={() => setMonsterQuantity(Math.max(1, monsterQuantity - 1))}
                          className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        >
                          -
                        </button>
                        <span className="text-sm font-bold w-4 text-center">{monsterQuantity}</span>
                        <button
                          onClick={() => setMonsterQuantity(Math.min(20, monsterQuantity + 1))}
                          className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const chosenSize = selectedMonster.size?.includes('/') ? monsterSizeChoice : (selectedMonster.size || 'Medium');
                        const offsetPx = 10 * getTokenSizeMultiplier(chosenSize as Token['size']);
                        for (let i = 0; i < monsterQuantity; i++) {
                          onAddEnemy({ ...selectedMonster, size: chosenSize }, contextMenu.x + (i * offsetPx), contextMenu.y + (i * offsetPx));
                        }
                        setContextMenu(null);
                      }}
                      className="btn-filled w-full py-2 rounded-lg !bg-[#ef4444] shadow-lg shadow-[#ef4444]/20"
                    >
                      <PlusCircle size={14} />
                      Add {monsterQuantity > 1 ? `${monsterQuantity} Tokens` : 'to Map'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        , document.body)}


        {/* On-map undo buttons for movement paths */}
        {inCombat && Object.values(movementPaths).map(path => {
          if (path.isDragging || path.points.length < 4) return null;
          // Position the undo button at the start position marker
          const screenX = path.startPos.x * stageScale + stagePos.x;
          const screenY = path.startPos.y * stageScale + stagePos.y;
          return (
            <button
              key={`undo-${path.tokenId}`}
              className="absolute z-40 w-7 h-7 flex items-center justify-center rounded-full bg-black/80 border border-white/30 text-white/80 hover:text-white hover:bg-black hover:border-white/60 transition-all shadow-lg"
              style={{
                left: screenX,
                top: screenY,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={() => undoMovement(path.tokenId)}
              title="Undo movement"
            >
              <Undo2 size={14} />
            </button>
          );
        })}

        {/* Token Context Menu */}
        {tokenContextMenu && (
          <div
            data-context-menu
            className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-2xl overflow-hidden w-64 animate-in fade-in zoom-in-95 duration-150"
            style={tokenContextMenu.clientY > window.innerHeight / 2
              ? { left: tokenContextMenu.x, bottom: (containerRef.current?.clientHeight ?? window.innerHeight) - tokenContextMenu.y }
              : { left: tokenContextMenu.x, top: tokenContextMenu.y }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-[var(--line)] bg-black/10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 px-2">Token Options</p>
            </div>
            {inCombat && movementPaths[tokenContextMenu.tokenId] && !movementPaths[tokenContextMenu.tokenId].isDragging && (
              <button
                onClick={() => { undoMovement(tokenContextMenu.tokenId); setTokenContextMenu(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
              >
                <Undo2 size={14} /> Undo Movement
              </button>
            )}
            <button
              onClick={() => toggleTokenVisibility(tokenContextMenu.tokenId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              {tokens.find(t => t.id === tokenContextMenu.tokenId)?.hidden ? (
                <><Eye size={14} /> Show Token</>
              ) : (
                <><EyeOff size={14} /> Hide Token</>
              )}
            </button>
            {!isPlayerView && (() => {
              const ctxToken = tokens.find(t => t.id === tokenContextMenu.tokenId);
              if (!ctxToken || !ctxToken.enlargedFrom) return null;
              return (
                <button
                  onClick={() => {
                    const originalSize = ctxToken.enlargedFrom;
                    const updatedTokens = tokens.map(t => t.id === ctxToken.id ? { ...t, size: originalSize, enlargedFrom: undefined } : t);
                    onTokensChange(updatedTokens);
                    try {
                      if (!isPlayerView) {
                        (window.electronAPI as any)?.sendDMTokenUpdate?.(updatedTokens);
                      }
                    } catch (_e) { /* IPC not available */ }
                    setTokenContextMenu(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
                >
                  <Undo2 size={14} /> Revert Enlarge/Reduce
                </button>
              );
            })()}
            {!isPlayerView && (() => {
              const ctxToken = tokens.find(t => t.id === tokenContextMenu.tokenId);
              if (!ctxToken || ctxToken.type === 'player') return null;
              return (
                <button
                  onClick={() => toggleTokenInvisible(tokenContextMenu.tokenId)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
                >
                  {ctxToken.invisible ? (
                    <><Eye size={14} /> Remove Invisibility</>
                  ) : (
                    <><EyeOff size={14} /> Toggle Invisible</>
                  )}
                </button>
              );
            })()}
            {floors && floors.length > 1 && (() => {
              const token = tokens.find(t => t.id === tokenContextMenu.tokenId);
              const tokenFloorId = token?.floorId || floors[0]?.id;
              const otherFloors = floors.filter(f => f.id !== tokenFloorId);
              return otherFloors.length > 0 ? (
                <>
                  <div className="h-px bg-[var(--line)] my-1" />
                  <div className="px-4 py-1">
                    <p className="text-[9px] uppercase tracking-widest opacity-40">Move to Floor</p>
                  </div>
                  <div className="max-h-[222px] overflow-y-auto">
                    {otherFloors.map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          onTokensChange(tokens.map(t =>
                            t.id === tokenContextMenu.tokenId ? { ...t, floorId: f.id } : t
                          ));
                          setTokenContextMenu(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
                      >
                        <Layers size={14} /> {f.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null;
            })()}
            {!isPlayerView && (() => {
              const ctxToken = tokens.find(t => t.id === tokenContextMenu.tokenId);
              if (!ctxToken?.isExtra) return null;
              return (
                <>
                  <div className="h-px bg-[var(--line)] my-1" />
                  <button
                    onClick={() => {
                      setPromoteExtraTokenId(ctxToken.id);
                      setTokenContextMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
                  >
                    <Skull size={14} /> Make this a creature…
                  </button>
                </>
              );
            })()}
            <div className="h-px bg-[var(--line)] my-1" />
            <button
              onClick={() => deleteToken(tokenContextMenu.tokenId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--btn-bg)] hover:text-white transition-colors text-[var(--btn-bg)]"
            >
              <Trash2 size={14} /> Delete Token
            </button>
          </div>
        )}

        {/* Extras: gallery management modal */}
        {manageExtrasOpen && (
          <ManageExtrasModal
            extras={extrasList}
            onClose={() => setManageExtrasOpen(false)}
            onAdd={addExtras}
            onUpdate={updateExtra}
            onDelete={deleteExtra}
          />
        )}

        {/* Sound picker for sound-type map notes */}
        {noteSoundPickerOpen && (
          <SoundPicker
            title="Pick a Sound for this Note"
            subtitle="Tier 4 — tap on the map to play"
            selectedId={noteDraft.soundId ?? null}
            defaultCategory="note"
            onPick={(soundId) => setNoteDraft(prev => ({ ...prev, soundId: soundId ?? undefined }))}
            onClose={() => setNoteSoundPickerOpen(false)}
          />
        )}

        {/* Extras: promote-to-creature modal */}
        {promoteExtraTokenId && (() => {
          const t = tokens.find(tt => tt.id === promoteExtraTokenId);
          if (!t) { setPromoteExtraTokenId(null); return null; }
          return (
            <MakeCreatureModal
              token={t}
              onClose={() => setPromoteExtraTokenId(null)}
              onConfirm={(monster, opts) => {
                onPromoteExtra?.(t.id, monster, opts);
                setPromoteExtraTokenId(null);
              }}
            />
          );
        })()}

        {/* Custom Confirm Dialog */}
        <AnimatePresence>
          {confirmDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmDialog(null)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-[360px] p-6 mx-4"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-sm mb-6 leading-relaxed">{confirmDialog.message}</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="btn-ghost py-1.5 px-4 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                    className="py-1.5 px-4 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    DELETE
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transition Zone Config Modal */}
        <AnimatePresence>
          {transitionZoneConfig && floors && floors.length > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => { setTransitionZoneConfig(null); setTzSelectedFloorId(''); setTzFloorPickerOpen(false); }}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-[400px] p-6 mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <ArrowUpDown size={16} className="text-blue-400" /> Configure Transition Zone
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs opacity-60 block mb-1">Label (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Stairs down, Hole, Ladder..."
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-[var(--line)] text-sm"
                      id="tz-label"
                      autoFocus
                      onKeyDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div>
                    <label className="text-xs opacity-60 block mb-1">Target Floor</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTzFloorPickerOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-black/30 border border-[var(--line)] text-sm hover:border-[var(--accent)] transition-colors"
                      >
                        <span className={tzSelectedFloorId ? '' : 'opacity-40'}>
                          {tzSelectedFloorId
                            ? floors.find(f => f.id === tzSelectedFloorId)?.name
                            : 'Select floor...'}
                        </span>
                        <ChevronDown size={14} className={cn('opacity-50 transition-transform', tzFloorPickerOpen && 'rotate-180')} />
                      </button>
                      <AnimatePresence>
                        {tzFloorPickerOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setTzFloorPickerOpen(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-2xl overflow-y-auto max-h-[180px]"
                            >
                              {floors.filter(f => f.id !== activeFloorId).map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => { setTzSelectedFloorId(f.id); setTzFloorPickerOpen(false); }}
                                  className={cn(
                                    'w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors',
                                    tzSelectedFloorId === f.id && 'text-[var(--accent)]'
                                  )}
                                >
                                  {f.name}
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  <p className="text-xs opacity-40">You'll draw the arrival zone on the target floor next.</p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        const targetFloorId = tzSelectedFloorId;
                        const label = (document.getElementById('tz-label') as HTMLInputElement)?.value?.trim();
                        if (!targetFloorId) return;
                        // Compute next pairIndex from all floors
                        let maxPairIndex = 0;
                        for (const f of floors) {
                          for (const tz of f.transitionZones || []) {
                            if (tz.pairIndex != null && tz.pairIndex > maxPairIndex) maxPairIndex = tz.pairIndex;
                          }
                        }
                        const nextPairIndex = maxPairIndex + 1;
                        setPendingPairData({
                          sourceFloorId: activeFloorId || floors[0]?.id || '',
                          sourcePoints: transitionZoneConfig.points,
                          targetFloorId,
                          label: label || undefined,
                          pairIndex: nextPairIndex,
                        });
                        setTransitionZoneConfig(null);
                        setTzSelectedFloorId('');
                        setTransitionZoneMode(true);
                        onSwitchFloor?.(targetFloorId);
                      }}
                      className="btn-filled py-1.5 px-3 rounded-lg text-xs"
                    >
                      Next: Draw Arrival Zone
                    </button>
                    <button
                      onClick={() => { setTransitionZoneConfig(null); setTzSelectedFloorId(''); setTzFloorPickerOpen(false); }}
                      className="btn-ghost py-1.5 px-3 rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drawing banner — shown during both first and second zone drawing */}
        {transitionZoneMode && !transitionZoneConfig && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-3 px-4 py-2 bg-blue-600/90 rounded-xl shadow-lg text-white text-xs font-medium whitespace-nowrap">
            <span>
              {pendingPairData
                ? `Draw arrival zone on ${floors?.find(f => f.id === pendingPairData.targetFloorId)?.name || 'target floor'} — click points, click the first node to close`
                : 'Draw transition zone — click points, click the first node to close'}
            </span>
            <button
              onClick={() => {
                if (pendingPairData) onSwitchFloor?.(pendingPairData.sourceFloorId);
                setPendingPairData(null);
                setTransitionZoneMode(false);
                clearTzPaint();
              }}
              className="px-2 py-0.5 bg-white/20 rounded-md hover:bg-white/30"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Transition Popup — appears when token is dropped on a transition zone */}
        <AnimatePresence>
          {transitionPopup && (() => {
            const popupToken = tokens.find(t => t.id === transitionPopup.tokenId);
            const popupIsTop = playerSides?.[popupToken?.combatantId ?? ''] === 'top';
            // Place the popup above the token whenever the token is past the
            // vertical halfway point — that way it never runs off the bottom
            // (or off the top, for a top-side player whose token sits high).
            const popupAboveToken = transitionPopup.screenY > window.innerHeight / 2;
            // Slide-in animation should originate from the token side, so the
            // popup feels like it's emerging out of the token regardless of
            // which side of the token it ends up on.
            const initialY = popupAboveToken ? 4 : -4;
            return (
              <motion.div
                initial={{ opacity: 0, y: initialY }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                // Snap the popup away quickly on dismissal so it doesn't linger
                // over the map while the floor-transition cover takes over.
                transition={{ duration: 0.12 }}
                className="fixed z-[70]"
                style={{
                  left: transitionPopup.screenX - 90,
                  ...(popupAboveToken
                    ? { bottom: `calc(100vh - ${transitionPopup.screenY - 30}px)` }
                    : { top: transitionPopup.screenY + 30 }),
                }}
              >
                <div
                  className="bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl p-3 min-w-[180px] relative"
                  style={popupIsTop ? { transform: 'rotate(180deg)' } : undefined}
                >
                  {(() => {
                    const zone = transitionPopup.zone;
                    const targetFloor = floors?.find(f => f.id === zone.targetFloorId);
                    let arrivalX = zone.targetPosition.x;
                    let arrivalY = zone.targetPosition.y;
                    if (zone.pairedZoneId && targetFloor) {
                      const partnerZone = targetFloor.transitionZones?.find(tz => tz.id === zone.pairedZoneId);
                      if (partnerZone) {
                        arrivalX = partnerZone.rect.x + partnerZone.rect.width / 2;
                        arrivalY = partnerZone.rect.y + partnerZone.rect.height / 2;
                      }
                    }
                    // "Whole Team" only moves players currently on the same floor as
                    // the triggering token — split parties stay split.
                    const sourceFloorId = popupToken?.floorId ?? activeFloorId;
                    const teamCount = tokens.filter(t => t.type === 'player' && t.floorId === sourceFloorId).length;
                    return (
                      <>
                        <p className="text-xs opacity-60 mb-2 text-center">
                          {zone.label
                            ? zone.label
                            : isPlayerView
                              ? 'Move to the next area...'
                              : `Go to ${targetFloor?.name || 'next floor'}`}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => {
                              const updated = tokens.map(t =>
                                t.id === transitionPopup.tokenId
                                  ? { ...t, floorId: zone.targetFloorId, x: arrivalX, y: arrivalY }
                                  : t
                              );
                              onTokensChange(updated);
                              (onTransitionToFloor ?? onSwitchFloor)?.(zone.targetFloorId);
                              setTransitionPopup(null);
                            }}
                            className="btn-ghost py-2 px-3 rounded-lg text-xs text-left flex items-center gap-2 hover:bg-blue-500/10"
                          >
                            <User size={12} className="text-blue-400" /> Move Just Me
                          </button>
                          {teamCount > 1 && (
                            <button
                              onClick={() => {
                                const spacing = gridResolution?.pixelsPerGrid || 70;
                                let offsetIndex = 0;
                                const updated = tokens.map(t => {
                                  if (t.type === 'player' && t.floorId === sourceFloorId) {
                                    const col = offsetIndex % 2;
                                    const row = Math.floor(offsetIndex / 2);
                                    offsetIndex++;
                                    return { ...t, floorId: zone.targetFloorId, x: arrivalX + (col - 0.5) * spacing, y: arrivalY + (row - 0.5) * spacing };
                                  }
                                  return t;
                                });
                                onTokensChange(updated);
                                (onTransitionToFloor ?? onSwitchFloor)?.(zone.targetFloorId);
                                setTransitionPopup(null);
                              }}
                              className="btn-ghost py-2 px-3 rounded-lg text-xs text-left flex items-center gap-2 hover:bg-blue-500/10"
                            >
                              <Layers size={12} className="text-blue-400" /> Move Whole Team ({teamCount})
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => setTransitionPopup(null)}
                          className="absolute top-1 right-1 p-1 opacity-40 hover:opacity-100"
                        >
                          <X size={10} />
                        </button>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Zone right-click context menu */}
        {zoneContextMenu && (() => {
          const currentFloor = floors?.find(f => f.id === activeFloorId);
          const zones = currentFloor?.transitionZones || [];
          const zone = zones.find(z => z.id === zoneContextMenu.zoneId);
          if (!zone) return null;
          return (
            <div
              data-context-menu
              className="fixed z-[80] bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 min-w-[160px]"
              style={zoneContextMenu.clientY > window.innerHeight / 2
                ? { left: zoneContextMenu.screenX, bottom: window.innerHeight - zoneContextMenu.screenY }
                : { left: zoneContextMenu.screenX, top: zoneContextMenu.screenY }
              }
              onMouseLeave={() => setZoneContextMenu(null)}
            >
              <button
                onClick={() => {
                  const updated = zones.map(z =>
                    z.id === zone.id ? { ...z, locked: !z.locked } : z
                  );
                  onTransitionZonesChange?.(updated);
                  setZoneContextMenu(null);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors text-left"
              >
                {zone.locked ? <Unlock size={13} className="opacity-70" /> : <Lock size={13} className="opacity-70" />}
                {zone.locked ? 'Unlock Zone' : 'Lock Zone'}
              </button>
              <button
                onClick={() => {
                  const partnerLabel = zone.pairedZoneId ? ' and its paired zone' : '';
                  setConfirmDialog({
                    message: `Delete transition zone${zone.label ? ` "${zone.label}"` : ''}${partnerLabel}?`,
                    onConfirm: () => {
                      setSelectedZoneId(null);
                      const updated = zones.filter(z => z.id !== zone.id);
                      onTransitionZonesChange?.(updated);
                      if (zone.pairedZoneId && zone.targetFloorId) {
                        onUpdateFloorById?.(zone.targetFloorId, (f: Floor) => ({
                          ...f,
                          transitionZones: (f.transitionZones || []).filter(z => z.id !== zone.pairedZoneId),
                        }));
                      }
                    },
                  });
                  setZoneContextMenu(null);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors text-left"
              >
                <Trash2 size={13} className="opacity-70" />
                Delete Zone
              </button>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export const MapView = React.memo(MapViewInner);
