import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Path, Line } from 'react-konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster, WallSegment, Portal, GridResolution, WallPoint, MovementPath } from '../types';
import { parseUVTTFile } from '../services/uvttParser';
import { Upload, User, Skull, Shield, Swords, X, EyeOff, Eye, Trash2, ChevronRight, PlusCircle, Search, Map as MapIcon, FileText, Cloud, Sun, Moon, ChevronDown, Footprints, Undo2 } from '../icons';
import { extractBlockingSegments, computeVisibilityPolygon, clipPolygonToCircle } from '../utils/visibility';
import { FogOfWarLayer } from './FogOfWarLayer';
import { motion, AnimatePresence } from 'motion/react';
import { NoteIcon } from './DMNotes';
import { BESTIARY } from '../data/bestiary';
import { parseSpellcastingTrait } from '../data/spellDatabase';
import { SpeedText } from './SpeedText';
import { SpellAccordion } from './SpellAccordion';

interface MapViewProps {
  tokens: Token[];
  onTokensChange: (tokens: Token[]) => void;
  scenarioName: string;
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
  onAddEnemy: (monster: Monster, x: number, y: number) => void;
  onStartCombat: (tokenIds: string[]) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  onNoteClick?: (noteId: string) => void;
  onAddScenario?: () => void;
  panToNote?: MapNote | null;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  isPlayerView?: boolean;
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution) => void;
  onPortalToggle?: (portalId: string) => void;
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
  startCastingRef?: React.MutableRefObject<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }, combatantId: string) => void) | null>;
  /** Ref that MapView populates so external code can cancel placed AoE */
  cancelCastingRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref that MapView populates so external code can confirm cast (roll saves) */
  confirmCastRef?: React.MutableRefObject<(() => void) | null>;
  /** Called when placed AoE is dismissed (by any means) */
  onCastingDismissed?: () => void;
  /** Ref that MapView populates so external code (e.g. DM apply-damage) can immediately clear the remote AoE */
  clearRemoteAoeRef?: React.MutableRefObject<(() => void) | null>;
  /** Called when tokens in AoE changes — passes combatant IDs of affected tokens */
  onAoeHighlightsChange?: (data: { affectedCombatantIds: string[]; saveResults: Record<string, SaveResult> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string } | null) => void;
  /** Ref that MapView populates so external code (e.g. CombatView "Next Turn") can clear movement paths */
  clearMovementPathsRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref that MapView populates so external code can undo a specific token's movement */
  undoMovementRef?: React.MutableRefObject<((tokenId: string) => void) | null>;
  /** Called when the set of tokens with completed movement paths changes */
  onMovementPathTokensChange?: (tokenIds: Set<string>) => void;
  /** ID of the currently active combatant (for turn indicator) */
  activeCombatantId?: string | null;
  /** Called when a player double-taps their own token; provides screen coordinates for ring positioning */
  onPlayerTokenDoubleTap?: (tokenId: string, screenX: number, screenY: number) => void;
}

function getTokenSizeMultiplier(size?: Token['size']): number {
  switch (size) {
    case 'Tiny':        return 0.5;
    case 'Small':       return 1;
    case 'Large':       return 2;
    case 'Huge':        return 3;
    case 'Gargantuan':  return 4;
    default:            return 1; // Medium / unset
  }
}

export interface SaveResult {
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  name: string;
}

type AoeState = {
  name: string;
  aoeType: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
  aoeSize: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  angle: number;
  casterRadiusPx: number;
  selfOrigin?: boolean;
  saveAbility?: string;
  saveDc?: number;
  halfDamageOnSave?: boolean;
  spellDesc?: string;
  saveResults?: Record<string, SaveResult>;
};

/** Determine which tokens overlap a placed AoE shape */
function getTokensInAoe(
  aoe: AoeState | null,
  tokens: Token[],
  pixelsPerGrid: number,
  tokenRadius: number,
): Set<string> {
  if (!aoe) return new Set();
  const feetToPx = (ft: number) => (ft / 5) * pixelsPerGrid;
  const sizePx = feetToPx(aoe.aoeSize);
  const angleRad = aoe.angle * (Math.PI / 180);
  const edgeX = aoe.originX + Math.cos(angleRad) * aoe.casterRadiusPx;
  const edgeY = aoe.originY + Math.sin(angleRad) * aoe.casterRadiusPx;

  const result = new Set<string>();

  for (const token of tokens) {
    const tr = tokenRadius * getTokenSizeMultiplier(token.size);
    const tx = token.x;
    const ty = token.y;
    let hit = false;

    switch (aoe.aoeType) {
      case 'sphere':
      case 'cylinder': {
        const cx = aoe.selfOrigin
          ? aoe.originX + Math.cos(angleRad) * (aoe.casterRadiusPx + sizePx)
          : aoe.x;
        const cy = aoe.selfOrigin
          ? aoe.originY + Math.sin(angleRad) * (aoe.casterRadiusPx + sizePx)
          : aoe.y;
        hit = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2) < sizePx + tr;
        break;
      }
      case 'cube': {
        if (aoe.selfOrigin) {
          const dx = tx - edgeX;
          const dy = ty - edgeY;
          const localFwd = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
          const localPerp = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
          hit = localFwd > -tr && localFwd < sizePx * 2 + tr && Math.abs(localPerp) < sizePx + tr;
        } else {
          hit = Math.abs(tx - aoe.x) < sizePx + tr && Math.abs(ty - aoe.y) < sizePx + tr;
        }
        break;
      }
      case 'cone': {
        const dx = tx - edgeX;
        const dy = ty - edgeY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sizePx + tr) break;
        if (dist < tr) { hit = true; break; }
        const tokenAngle = Math.atan2(dy, dx);
        let angleDiff = tokenAngle - angleRad;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const halfAngle = (53 / 2) * (Math.PI / 180);
        hit = Math.abs(angleDiff) < halfAngle + Math.atan2(tr, dist);
        break;
      }
      case 'line': {
        const halfWidth = feetToPx(5) / 2;
        const dx = tx - edgeX;
        const dy = ty - edgeY;
        const localFwd = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
        const localPerp = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
        hit = localFwd > -tr && localFwd < sizePx + tr && Math.abs(localPerp) < halfWidth + tr;
        break;
      }
    }
    if (hit) result.add(token.id);
  }
  return result;
}

const TokenAvatar: React.FC<{ url: string; radius: number }> = ({ url, radius }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url;
    img.onload = () => setImage(img);
  }, [url]);

  if (!image) return null;

  const size = radius * 2;
  const minDim = Math.min(image.width, image.height);

  return (
    <KonvaImage
      image={image}
      width={size}
      height={size}
      x={-radius}
      y={-radius}
      cornerRadius={radius}
      crop={{
        x: (image.width - minDim) / 2,
        y: (image.height - minDim) / 2,
        width: minDim,
        height: minDim,
      }}
    />
  );
};

/**
 * Persistent pulsing ring around the active combatant's token.
 * Glows amber with a slow pulse animation that stays visible the entire turn.
 */
const ActiveTurnRing: React.FC<{ radius: number; tokenScale: number; color?: string }> = ({ radius, tokenScale, color }) => {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    let raf: number;
    const animate = () => {
      setPulse(Date.now());
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Slow sine wave pulse: 0.5 → 1.0 opacity, period ~2s
  const t = (pulse % 2000) / 2000;
  const opacity = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const ringColor = color || '#fbbf24';

  return (
    <>
      <Circle
        radius={radius + 4 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={2.5 * tokenScale}
        opacity={opacity * 0.9}
        shadowBlur={10 * tokenScale}
        shadowColor={ringColor}
      />
    </>
  );
};

/**
 * Animated 4-chevron turn indicator that zooms in and fades out over 3 seconds.
 * Each chevron points inward from one of the 4 cardinal directions.
 */
const TurnIndicatorChevrons: React.FC<{ radius: number; tokenScale: number }> = ({ radius, tokenScale }) => {
  const [progress, setProgress] = useState(0); // 0..1 over 3 seconds
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    setProgress(0);
    let raf: number;
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const p = Math.min(elapsed / 3000, 1);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (progress >= 1) return null;

  // Chevrons start far away and zoom in, then fade out
  const easeOut = 1 - Math.pow(1 - progress, 3); // cubic ease-out for zoom
  const startDist = radius + 30 * tokenScale;
  const endDist = radius + 4 * tokenScale;
  const dist = startDist + (endDist - startDist) * Math.min(easeOut * 2, 1); // zoom-in happens in first half
  const opacity = progress < 0.5 ? 0.9 : 0.9 * (1 - (progress - 0.5) * 2); // fade in second half
  const chevSize = 6 * tokenScale;

  // 4 chevrons: top, right, bottom, left — each pointing inward
  const chevrons = [
    { angle: -Math.PI / 2, label: 'top' },    // points down
    { angle: 0, label: 'right' },               // points left
    { angle: Math.PI / 2, label: 'bottom' },    // points up
    { angle: Math.PI, label: 'left' },           // points right
  ];

  return (
    <>
      {chevrons.map(({ angle, label }) => {
        const cx = Math.cos(angle) * dist;
        const cy = Math.sin(angle) * dist;
        // Chevron points inward: two lines forming a V.
        // We want the vertex at `(cx, cy)` (closest to token) and the arms extending outward.
        // So they extend away from the token along the same `angle`.
        const armAngle = angle;
        const arm1Angle = armAngle - 0.5;
        const arm2Angle = armAngle + 0.5;
        return (
          <Line
            key={label}
            points={[
              cx + Math.cos(arm1Angle) * chevSize,
              cy + Math.sin(arm1Angle) * chevSize,
              cx,
              cy,
              cx + Math.cos(arm2Angle) * chevSize,
              cy + Math.sin(arm2Angle) * chevSize,
            ]}
            stroke="#fbbf24"
            strokeWidth={2.5 * tokenScale}
            lineCap="round"
            lineJoin="round"
            opacity={opacity}
          />
        );
      })}
    </>
  );
};

export const MapView: React.FC<MapViewProps> = ({
  tokens,
  onTokensChange,
  scenarioName,
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
  onAddEnemy,
  onStartCombat,
  leftSidebarOpen,
  setLeftSidebarOpen,
  onNoteClick,
  onAddScenario,
  panToNote,
  rightSidebarOpen,
  setRightSidebarOpen,
  isPlayerView = false,
  walls,
  objectWalls,
  portals,
  gridResolution,
  onWallDataChange,
  onPortalToggle,
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
  cancelCastingRef,
  confirmCastRef,
  onCastingDismissed,
  onAoeHighlightsChange,
  clearMovementPathsRef,
  clearRemoteAoeRef,
  undoMovementRef,
  onMovementPathTokensChange,
  activeCombatantId: propActiveCombatantId,
  onPlayerTokenDoubleTap,
}) => {
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ tokenId: string; time: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [contextMenu, setContextMenu] = useState<{
    x: number,
    y: number,
    stageX: number,
    stageY: number,
    view: 'root' | 'note' | 'add-player' | 'add-enemy' | 'add-npc'
  } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'player' | 'npc' | null>(null);
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, tokenId: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string }>({ type: 'treasure', content: '' });
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [showChangeMapModal, setShowChangeMapModal] = useState(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [showSource2014, setShowSource2014] = useState(true);
  const [showSource2024, setShowSource2024] = useState(true);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterQuantity, setMonsterQuantity] = useState(1);
  const [internalSelectedTokenId, setInternalSelectedTokenId] = useState<string | null>(null);
  const selectedTokenId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedTokenId;
  const setSelectedTokenId = externalSelectedId !== undefined && onSelectedTokenIdChange ? onSelectedTokenIdChange : setInternalSelectedTokenId;
  
  const [internalSelectedTokenIds, setInternalSelectedTokenIds] = useState<string[]>([]);
  const selectedTokenIds = externalSelectedTokenIds !== undefined ? externalSelectedTokenIds : internalSelectedTokenIds;
  const setSelectedTokenIds = externalSelectedTokenIds !== undefined && onSelectedTokenIdsChange ? onSelectedTokenIdsChange : setInternalSelectedTokenIds;
  
  const [showWalls, setShowWalls] = useState(true);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const didMarqueeRef = useRef(false);

  const [showFog, setShowFog] = useState(false);
  const [darknessOpen, setDarknessOpen] = useState(false);
  const [panelHpInput, setPanelHpInput] = useState('');
  
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
    aoeType: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder';
    aoeSize: number; // feet
    originX: number; // caster token center world coords
    originY: number;
    casterRadiusPx: number; // token radius in world pixels — for edge-origin offset
    selfOrigin?: boolean; // true for range=0 "Self" spells (rotate around caster)
  } | null>(null);
  const [castingMousePos, setCastingMousePos] = useState<{ x: number; y: number } | null>(null);
  const [placedAoe, setPlacedAoe] = useState<AoeState | null>(null);

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
  // Live drag position overrides for player view — drives real-time fog recomputation
  const [livePlayerPos, setLivePlayerPos] = useState<Record<string, { x: number; y: number }>>({});

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
  const PATH_FADE_DELAY = 5000; // ms before fade begins
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
    if (!propActiveCombatantId) { setTurnFlashCombatantId(null); return; }
    setTurnFlashCombatantId(propActiveCombatantId);
    const timer = setTimeout(() => setTurnFlashCombatantId(null), 3100); // slightly over 3s to let animation finish
    return () => clearTimeout(timer);
  }, [propActiveCombatantId]);

  const tokenRadius = gridResolution ? gridResolution.pixelsPerGrid * 0.4 : 20;
  const tokenScale = tokenRadius / 20;

  // Expose casting function to external code (player drawers) via ref
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  if (startCastingRef) {
    startCastingRef.current = (spell, combatantId) => {
      if (!spell.aoeType || !spell.aoeSize) return;
      const token = tokensRef.current.find(t => t.combatantId === combatantId);
      if (!token) return;
      const casterRadiusPx = tokenRadius * getTokenSizeMultiplier(token.size);
      const ppg = gridResolution?.pixelsPerGrid || 40;
      const isSelfOrigin = spell.range === 0 || spell.range === undefined;
      const offsetDist = (spell.aoeSize / 5) * ppg + casterRadiusPx;
      // Place AoE directly in front of the caster (to the right by default)
      setCastingSpell(null);
      setCastingMousePos(null);
      setPlacedAoe({
        name: spell.name,
        aoeType: spell.aoeType as 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder',
        aoeSize: spell.aoeSize,
        x: token.x + offsetDist,
        y: token.y,
        originX: token.x,
        originY: token.y,
        angle: 0,
        casterRadiusPx,
        selfOrigin: isSelfOrigin,
        saveAbility: spell.saveAbility,
        saveDc: spell.saveDc,
        halfDamageOnSave: spell.halfDamageOnSave,
        spellDesc: spell.desc,
      });
    };
  }

  if (cancelCastingRef) {
    cancelCastingRef.current = () => {
      setPlacedAoe(null);
      setCastingSpell(null);
      setCastingMousePos(null);
      onCastingDismissed?.();
      onAoeHighlightsChange?.(null);
    };
  }

  if (clearRemoteAoeRef) {
    clearRemoteAoeRef.current = () => {
      setRemoteAoe(null);
      onAoeHighlightsChange?.(null);
    };
  }

  // ── Token-in-AoE detection ──
  const ppg = gridResolution?.pixelsPerGrid || 40;
  const activeAoe = placedAoe || remoteAoe;
  const tokensInAoe = useMemo(() => {
    return getTokensInAoe(activeAoe, tokens, ppg, tokenRadius);
  }, [activeAoe?.x, activeAoe?.y, activeAoe?.angle, activeAoe?.aoeType, activeAoe?.aoeSize, activeAoe?.originX, activeAoe?.originY, tokens, ppg, tokenRadius]);

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
    });
  }, [tokensInAoe, activeAoe?.saveResults]);

  // Confirm Cast: roll saves for affected monsters
  const handleConfirmCast = () => {
    const aoe = placedAoe; // Only the caster's screen can confirm
    if (!aoe?.saveAbility || !aoe?.saveDc) return;

    const allCombatants = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
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

    setPlacedAoe(prev => prev ? { ...prev, saveResults: results } : null);
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

  const blockingSegments = useMemo(
    () => extractBlockingSegments(walls || [], objectWalls || [], portals || []),
    [walls, objectWalls, portals]
  );

  const playerTokenPositions = useMemo(
    () => tokens.filter(t => t.type === 'player' && !t.hidden).map(t =>
      livePlayerPos[t.id] ? { ...t, ...livePlayerPos[t.id] } : t
    ),
    [tokens, livePlayerPos]
  );

  // DM-only unlimited visibility polygons (skip on player view — playerVisionData handles that)
  const visibilityPolygons = useMemo(
    () => {
      if (isPlayerView || !loadedImage) return [];
      return playerTokenPositions.map(t =>
        computeVisibilityPolygon(
          { x: t.x, y: t.y },
          blockingSegments,
          loadedImage.width,
          loadedImage.height
        )
      );
    },
    [playerTokenPositions, blockingSegments, loadedImage, isPlayerView]
  );

  // Player-view visibility: respects darkness level and per-token darkvision radius.
  // The DM view continues to use the unlimited `visibilityPolygons` above.
  const playerVisionData = useMemo((): WallPoint[][] => {
    if (!isPlayerView || !loadedImage) return [];

    const level = darknessLevel ?? 'dark';
    const allCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const fogPolygons: WallPoint[][] = [];
    const { width: mapW, height: mapH } = loadedImage;

    for (const t of playerTokenPositions) {
      const combatant = allCombatants.find(c => c.id === t.combatantId);
      const darkvisionFt = combatant?.darkvision ?? 0;
      const darkvisionPx = gridResolution
        ? (darkvisionFt / 5) * gridResolution.pixelsPerGrid
        : darkvisionFt * 4;
      const origin = { x: t.x, y: t.y };
      const fullPoly = computeVisibilityPolygon(origin, blockingSegments, mapW, mapH);

      if (level === 'daylight') {
        fogPolygons.push(fullPoly);
      } else {
        // Dark: only darkvision tokens can see, within their radius
        if (darkvisionFt > 0) {
          fogPolygons.push(clipPolygonToCircle(fullPoly, origin, darkvisionPx));
        }
        // 0 darkvision = no vision
      }
    }

    return fogPolygons;
  }, [isPlayerView, loadedImage, darknessLevel, playerTokenPositions, blockingSegments,
      players, npcs, persistentEnemies, scenarioCombatants, gridResolution]);

  const hasFogData = blockingSegments.length > 0;

  const getNoteColor = (type: MapNoteType) => {
    switch (type) {
      case 'treasure': return '#CD7F32';
      case 'quote': return '#60a5fa';
      case 'warning': return '#ef4444';
      case 'secret': return '#a855f7';
      case 'clue': return '#059669';
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
        case 'secret':
          return (
            <Group>
              <Path data="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" {...sp} />
              <Circle x={12} y={12} radius={3} {...sp} />
            </Group>
          );
        case 'clue':
          return (
            <Group>
              <Path data="m21 21-4.34-4.34" {...sp} />
              <Circle x={11} y={11} radius={8} {...sp} />
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
      const img = new Image();
      img.src = mapImage;
      img.onload = () => {
        setLoadedImage(img);
        if (dimensions.width > 0 && dimensions.height > 0) {
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
              (dimensions.width - padding) / img.width,
              (dimensions.height - padding) / img.height,
              1
            );
          }

          const clampedScale = Math.min(Math.max(scale, 0.05), 5);
          const finalScale = isPlayerView ? clampedScale * 1.15 : clampedScale;
          setStageScale(finalScale);
          if (isPlayerView && viewportCenter) {
            // Center the player's view on the same map-space point the DM is looking at
            setStagePos({
              x: dimensions.width / 2 - viewportCenter.x * finalScale,
              y: dimensions.height / 2 - viewportCenter.y * finalScale,
            });
          } else {
            setStagePos({
              x: (dimensions.width - img.width * finalScale) / 2,
              y: (dimensions.height - img.height * finalScale) / 2,
            });
          }
        }
      };
    } else {
      setLoadedImage(null);
    }
  }, [mapImage, gridResolution?.pixelsPerGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
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
          onWallDataChange?.(result.walls, result.objectWalls, result.portals, result.gridResolution);
        } catch (err) {
          alert(`Failed to parse UVTT file: ${(err as Error).message}`);
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onMapChange(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const multiDragStartRef = useRef<{
    draggedId: string;
    draggedStart: { x: number; y: number };
    othersStart: Record<string, { x: number; y: number }>;
  } | null>(null);

  const handleDragStart = (id: string) => {
    onDragStatusChange?.(true);
    const isMulti = selectedTokenIds.includes(id) && selectedTokenIds.length > 1;
    if (isMulti) {
      const draggedToken = tokens.find(t => t.id === id);
      if (!draggedToken) return;
      const othersStart: Record<string, { x: number; y: number }> = {};
      selectedTokenIds.forEach(tid => {
        if (tid !== id) {
          const t = tokens.find(tok => tok.id === tid);
          if (t) othersStart[tid] = { x: t.x, y: t.y };
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

  const handleDragMove = (id: string, e: any) => {
    const pos = { x: e.target.x(), y: e.target.y() };
    draggingPositionsRef.current[id] = pos;

    // Move all other selected tokens by the same delta
    const multi = multiDragStartRef.current;
    if (multi && multi.draggedId === id) {
      const dx = pos.x - multi.draggedStart.x;
      const dy = pos.y - multi.draggedStart.y;
      Object.entries(multi.othersStart).forEach(([tid, start]) => {
        draggingPositionsRef.current[tid] = { x: start.x + dx, y: start.y + dy };
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
          ap.points.push(px, py);
          ap.totalDistancePx += segDist;
          ap.lastSampleX = px;
          ap.lastSampleY = py;
        }
      };
      samplePoint(id, pos.x, pos.y);
      if (multi && multi.draggedId === id) {
        const dx = pos.x - multi.draggedStart.x;
        const dy = pos.y - multi.draggedStart.y;
        Object.entries(multi.othersStart).forEach(([tid, start]) => {
          samplePoint(tid, start.x + dx, start.y + dy);
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
      const dx = pos.x - multi2.draggedStart.x;
      const dy = pos.y - multi2.draggedStart.y;
      Object.entries(multi2.othersStart).forEach(([tid, start]) => {
        liveUpdates[tid] = { x: start.x + dx, y: start.y + dy };
      });
    }
    setLivePlayerPos(prev => ({ ...prev, ...liveUpdates }));

    // Sync movement path ref -> state (throttled at ~20fps)
    if (inCombat) {
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
    const finalPos = { x: e.target.x(), y: e.target.y() };
    const multi = multiDragStartRef.current;

    let updatedTokens;
    if (multi && multi.draggedId === id) {
      const dx = finalPos.x - multi.draggedStart.x;
      const dy = finalPos.y - multi.draggedStart.y;
      updatedTokens = tokens.map(t => {
        if (t.id === id) return { ...t, ...finalPos };
        if (multi.othersStart[t.id]) return { ...t, x: multi.othersStart[t.id].x + dx, y: multi.othersStart[t.id].y + dy };
        return t;
      });
      // Clear live overrides for all dragged tokens
      setLivePlayerPos(prev => {
        const next = { ...prev };
        delete next[id];
        Object.keys(multi.othersStart).forEach(tid => delete next[tid]);
        return next;
      });
      multiDragStartRef.current = null;
    } else {
      delete draggingPositionsRef.current[id];
      setLivePlayerPos(prev => { const next = { ...prev }; delete next[id]; return next; });
      updatedTokens = tokens.map(t => t.id === id ? { ...t, ...finalPos } : t);
    }

    // Finalize movement paths
    if (inCombat) {
      const finalizeToken = (tid: string, fx: number, fy: number) => {
        const ap = activePathRef.current[tid];
        if (!ap) return;
        const dx = fx - ap.lastSampleX;
        const dy = fy - ap.lastSampleY;
        const segDist = Math.sqrt(dx * dx + dy * dy);
        if (segDist > 0) {
          ap.points.push(fx, fy);
          ap.totalDistancePx += segDist;
        }
      };
      finalizeToken(id, finalPos.x, finalPos.y);
      if (multi) {
        const dx = finalPos.x - multi.draggedStart.x;
        const dy = finalPos.y - multi.draggedStart.y;
        Object.entries(multi.othersStart).forEach(([tid, start]) => {
          finalizeToken(tid, start.x + dx, start.y + dy);
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

    onDragStatusChange?.(false);

    if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
    } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
      window.electronAPI.sendDMTokenUpdate(updatedTokens);
    }

    onTokensChange(updatedTokens);
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
      if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
        window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
      } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
        window.electronAPI.sendDMTokenUpdate(updatedTokens);
      }
    } else {
      // Only one segment — revert to original start and remove path entirely
      const updatedTokens = tokens.map(t =>
        t.id === tokenId ? { ...t, x: path.startPos.x, y: path.startPos.y } : t
      );
      onTokensChange(updatedTokens);
      if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
        window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
      } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
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
    };
    onTokensChange([...tokens, newToken]);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
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
      stageX: pointerPosition.x,
      stageY: pointerPosition.y,
      view: 'root'
    });
    setMonsterSearch('');
    setSelectedMonster(null);
    setMonsterQuantity(1);
    setActiveSubmenu(null);
  };

  const handleTokenContextMenu = (e: any, tokenId: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true; // Stop propagation to stage
    setContextMenu(null);

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    setTokenContextMenu({
      x: pointerPosition.x,
      y: pointerPosition.y,
      tokenId
    });
  };

  const toggleTokenVisibility = (tokenId: string) => {
    onTokensChange(tokens.map(t =>
      t.id === tokenId ? { ...t, hidden: !t.hidden } : t
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
      };
      onTokensChange([...tokens, newToken]);
    }
    setContextMenu(null);
  };

  const saveNote = () => {
    if (!contextMenu || !noteDraft.content.trim()) return;

    const newNote: MapNote = {
      id: Math.random().toString(36).substr(2, 9),
      type: noteDraft.type,
      content: noteDraft.content,
      x: contextMenu.x,
      y: contextMenu.y
    };

    onMapNotesChange([...mapNotes, newNote]);
    setContextMenu(null);
    setNoteDraft({ type: 'treasure', content: '' });
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

  const handleTouchStart = (e: any) => {
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
    if (e.evt.touches.length < 2) {
      twoFingerPanRef.current = null;
    }
  };

  const getCanvasPos = (stage: any) => {
    const pos = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  };

  const handleStageMouseDown = (e: any) => {
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
    // DM AoE casting: track mouse in world coords
    if (castingSpell) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
      setCastingMousePos(pos);
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

  return (
    <div className={cn("h-full flex flex-col relative", castingSpell && "cursor-crosshair")} ref={containerRef}>
      {/* Toolbar - Only visible to DM */}
      {!isPlayerView && (
        <div className="h-10 border-b border-[var(--line)] bg-[var(--surface)] flex justify-between items-center shrink-0">
          <div className="flex items-center h-full">
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
            <div className="h-6 w-px bg-[var(--line)] shrink-0" />

            <div className="flex items-center gap-4 px-4">
              <div className="flex items-center gap-2">
                <MapIcon size={12} className="opacity-50" />
                <h3 className="text-[10px] uppercase tracking-widest opacity-50 font-sans font-bold">Map</h3>
              </div>
              <button
                onClick={() => {
                  if (mapImage && (tokens.length > 0 || mapNotes.length > 0)) {
                    setShowChangeMapModal(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="btn-ghost py-1"
              >
                <Upload size={12} /> {mapImage ? 'CHANGE MAP' : 'UPLOAD MAP'}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,.uvtt,.dd2vtt,.df2vtt" />
              {walls && walls.length > 0 && (
                <button
                  onClick={() => setShowWalls(!showWalls)}
                  className="btn-ghost py-1"
                >
                  {showWalls ? <Eye size={12} /> : <EyeOff size={12} />} WALLS
                </button>
              )}
              {hasFogData && (
                <button
                  onClick={() => setShowFog(!showFog)}
                  className={cn("btn-ghost py-1", showFog && "bg-white/10")}
                >
                  <Cloud size={12} /> FOG
                </button>
              )}
              <div className="h-6 w-px bg-[var(--line)] shrink-0" />
              <div className="relative">
                <button
                  onClick={() => setDarknessOpen(o => !o)}
                  className="btn-ghost py-1 gap-2 w-[130px] justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    {(darknessLevel ?? 'dark') === 'daylight'
                      ? <Sun size={12} />
                      : <Moon size={12} />
                    }
                    {(darknessLevel ?? 'dark') === 'daylight' ? 'Daylight' : 'Dark'}
                  </span>
                  <ChevronDown size={10} className="opacity-50" />
                </button>
                {darknessOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-xl z-50 overflow-hidden">
                    {([['daylight', 'Daylight', Sun], ['dark', 'Dark', Moon]] as const).map(([val, label, Icon]) => (
                      <button
                        key={val}
                        onClick={() => { onDarknessLevelChange?.(val); setDarknessOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-white/5 transition-colors',
                          (darknessLevel ?? 'dark') === val && 'text-[var(--accent)]'
                        )}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center h-full">
            {selectedTokenIds.length > 0 && (
              <button
                onClick={() => {
                  onStartCombat(selectedTokenIds);
                  setSelectedTokenIds([]);
                }}
                className="btn-filled px-4 py-1 rounded animate-in fade-in slide-in-from-right-4 mr-2"
              >
                <Swords size={12} /> Roll Initiative ({selectedTokenIds.length})
              </button>
            )}
            <AnimatePresence>
              {!rightSidebarOpen && (
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
                  <div className="h-6 w-px bg-[var(--line)] shrink-0" />
                  <button
                    onClick={() => setRightSidebarOpen(true)}
                    className="h-full px-3 hover:bg-black/5 transition-colors flex items-center justify-center"
                    title="Open Initiative Tracker"
                  >
                    <Swords size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="flex-1 bg-[#111] relative overflow-hidden" style={{ cursor: isPanning && spaceHeld ? 'grabbing' : spaceHeld ? 'grab' : undefined }}>
        {!loadedImage && (
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
          onTouchStart={isPlayerView ? handleTouchStart : undefined}
          onTouchMove={isPlayerView ? handleTouchMove : undefined}
          onTouchEnd={isPlayerView ? handleTouchEnd : undefined}
          onClick={(e) => {
            if (isPlayerView) return;
            if (e.evt.button === 0) {
              if (didMarqueeRef.current) {
                didMarqueeRef.current = false;
                return;
              }
              setContextMenu(null);
              setTokenContextMenu(null);
              setLeftSidebarOpen(false);
              setSelectedTokenIds([]);
              setSelectedTokenId(null);
            }
          }}
        >
          <Layer>
            {loadedImage && (
              <KonvaImage
                image={loadedImage}
                width={loadedImage.width}
                height={loadedImage.height}
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
            {/* Render Portals (Doors/Windows) */}
            {showWalls && !isPlayerView && portals?.map(portal => (
              <Line
                key={portal.id}
                points={[portal.bounds[0].x, portal.bounds[0].y, portal.bounds[1].x, portal.bounds[1].y]}
                stroke={portal.closed ? '#4ade80' : '#60a5fa'}
                strokeWidth={portal.closed ? 4 : 3}
                lineCap="round"
                dash={portal.closed ? [] : [8, 6]}
                opacity={0.9}
                onClick={() => !isPlayerView && onPortalToggle?.(portal.id)}
                onTap={() => !isPlayerView && onPortalToggle?.(portal.id)}
                hitStrokeWidth={12}
              />
            ))}


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
              const pathToken = tokens.find(t => t.id === path.tokenId);
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
                    />
                    <Circle
                      x={path.startPos.x}
                      y={path.startPos.y}
                      radius={6 / stageScale}
                      fill={pathColor}
                      opacity={0.8}
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

            {tokens.map(token => {
              const r = tokenRadius * getTokenSizeMultiplier(token.size);
              return (
              <Group
                key={token.id}
                x={livePlayerPos[token.id]?.x ?? token.x}
                y={livePlayerPos[token.id]?.y ?? token.y}
                draggable={isPlayerView ? token.type === 'player' : true}
                onMouseDown={(e) => { e.cancelBubble = true; }}
                onDragStart={() => handleDragStart(token.id)}
                onDragMove={(e) => handleDragMove(token.id, e)}
                onDragEnd={(e) => handleDragEnd(token.id, e)}
                onContextMenu={(e) => handleTokenContextMenu(e, token.id)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  // Double-tap detection for player view (touch uses onTap below)
                  if (isPlayerView && onPlayerTokenDoubleTap && token.type === 'player') {
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
                    setSelectedTokenId(token.id);
                    onSelectedTokenIdChange?.(token.id);
                  }
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  // Double-tap detection for touch on player view
                  if (isPlayerView && onPlayerTokenDoubleTap && token.type === 'player') {
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
                  shadowBlur={5 * tokenScale}
                  shadowColor="black"
                  opacity={token.hidden ? 0.4 : 1}
                />
                {selectedTokenIds.includes(token.id) && !isPlayerView && (
                  /* Inner rim — above drop shadow */
                  <Circle
                    radius={r + 1.5 * tokenScale}
                    fill=""
                    stroke="white"
                    strokeWidth={tokenScale}
                    opacity={token.hidden ? 0.4 : 1}
                  />
                )}
                {!isPlayerView && tokensInAoe.has(token.id) && !activeAoe?.saveResults && (
                  <Circle
                    radius={r + 3 * tokenScale}
                    fill=""
                    stroke="rgba(255, 120, 30, 0.9)"
                    strokeWidth={2.5 * tokenScale}
                    shadowBlur={12 * tokenScale}
                    shadowColor="rgba(255, 120, 30, 0.7)"
                  />
                )}
                {/* Persistent active-turn ring */}
                {propActiveCombatantId && (() => {
                  const activeComb = activeCombatants.find(c => c.id === propActiveCombatantId);
                  if (!activeComb) return null;
                  const isActiveToken = token.combatantId === activeComb.sourceCombatantId || token.combatantId === activeComb.id;
                  if (!isActiveToken) return null;
                  const ringColor = token.type === 'player' ? '#fbbf24' : token.type === 'enemy' ? '#ef4444' : '#60a5fa';
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
                {token.avatar && (
                  <Group opacity={token.hidden ? 0.4 : 1}>
                    <TokenAvatar
                      url={token.avatar}
                      radius={r - tokenScale}
                    />
                  </Group>
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
                  />
                )}
                {!isPlayerView && tokensInAoe.has(token.id) && activeAoe?.saveResults && (() => {
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
                {!isPlayerView && (
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
                    opacity={token.hidden ? 0.6 : 1}
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
                const pathToken = tokens.find(t => t.id === path.tokenId);
                const r = tokenRadius * (pathToken ? getTokenSizeMultiplier(pathToken.size) : 1);
                const combatant = [...activeCombatants, ...players, ...npcs, ...persistentEnemies, ...scenarioCombatants]
                  .find(c => c.id === pathToken?.combatantId || c.sourceCombatantId === pathToken?.combatantId);
                const speedFt = combatant?.speed ?? null;
                const isOverSpeed = speedFt !== null && distFeet > speedFt;
                const fade = pathFadeProgress[path.tokenId] ?? 0;
                const isFullyFaded = fade >= 1;
                const nameFontSize = Math.max(10, tokenRadius * 0.55);
                const distLabelFontSize = Math.max(9, tokenRadius * 0.45);
                // Estimate wrapped name height: ~0.6 * fontSize per char width, Konva line-height ≈ 1.2×
                const nameWidth = tokenRadius * 5;
                const avgCharWidth = nameFontSize * 0.55; // bold Inter is slightly wider
                const charsPerLine = Math.max(1, Math.floor(nameWidth / avgCharWidth));
                const nameText = pathToken?.name || '';
                const nameLines = Math.max(1, Math.ceil(nameText.length / charsPerLine));
                const nameHeight = nameLines * nameFontSize * 1.2;
                const distY = lastY + r + 5 + nameHeight + 2;
                return (
                  <Text
                    key={`dist-${path.tokenId}`}
                    x={lastX - tokenRadius * 2.5}
                    y={distY}
                    text={speedFt !== null ? `${distFeet} / ${speedFt} ft` : `${distFeet} ft`}
                    fontSize={distLabelFontSize}
                    fill={isOverSpeed ? '#ef4444' : 'rgba(255,255,255,0.7)'}
                    fontStyle="bold"
                    fontFamily="Inter"
                    align="center"
                    width={tokenRadius * 5}
                    opacity={isFullyFaded ? 0.6 : 1}
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
            const fillColor = 'rgba(255, 120, 30, 0.25)';
            const strokeColor = 'rgba(255, 120, 30, 0.8)';
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
                {/* Range line (only for spells with range, not self-origin) */}
                {!isSelfOrigin && (
                  <>
                    <Line
                      points={[edgeX, edgeY, rangeLineEndX, rangeLineEndY]}
                      stroke="rgba(255, 255, 255, 0.4)"
                      strokeWidth={1.5 / stageScale}
                      dash={[4 / stageScale, 4 / stageScale]}
                    />
                    <Text
                      x={midX}
                      y={midY - labelFontSize * 1.5}
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
                    const perpX = Math.cos(angleRad + Math.PI / 2) * sizePx;
                    const perpY = Math.sin(angleRad + Math.PI / 2) * sizePx;
                    const fwdX = Math.cos(angleRad) * sizePx * 2;
                    const fwdY = Math.sin(angleRad) * sizePx * 2;
                    const points = [
                      -perpX, -perpY,
                      perpX, perpY,
                      perpX + fwdX, perpY + fwdY,
                      -perpX + fwdX, -perpY + fwdY,
                    ];
                    return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                  }
                  return <Rect x={targetX - sizePx} y={targetY - sizePx} width={sizePx * 2} height={sizePx * 2}
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
            const fillColor = hasSaveResults ? 'transparent' : 'rgba(255, 120, 30, 0.35)';
            const strokeColor = 'rgba(255, 120, 30, 0.8)';

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

            return (
              <Layer listening={!!isPlayerView}>
                {/* Range line: caster edge → AoE target (only for spells with range) */}
                {!isAnchored && (
                  <>
                    <Line
                      points={[rangeEdgeX, rangeEdgeY, rangeTargetX, rangeTargetY]}
                      stroke="rgba(255, 255, 255, 0.4)"
                      strokeWidth={1.5 / stageScale}
                      dash={[4 / stageScale, 4 / stageScale]}
                      listening={false}
                    />
                    <Text
                      x={rangeMidX}
                      y={rangeMidY - rangeLabelSize * 1.5}
                      text={`${rangeFeet} ft`}
                      fontSize={rangeLabelSize}
                      fill="white"
                      fontStyle="bold"
                      fontFamily="Inter"
                      align="center"
                      listening={false}
                    />
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
                    <Circle
                      x={cx}
                      y={cy}
                      radius={sizePx}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      dash={[6 / stageScale, 4 / stageScale]}
                      draggable={!!isPlayerView}
                      onDragMove={placedAoe.selfOrigin ? handleDirectionalDragMove : handleSphereDragMove}
                      onDragEnd={placedAoe.selfOrigin ? handleDirectionalDragEnd : handleAoeDragEnd}
                    />
                  );
                })()}

                {/* Cube — square at target position */}
                {placedAoe.aoeType === 'cube' && (() => {
                  if (placedAoe.selfOrigin) {
                    // Self-origin cube: near edge touches caster token edge, rotated along angle
                    // perpendicular direction for the cube's width
                    const perpX = Math.cos(angleRad + Math.PI / 2) * sizePx;
                    const perpY = Math.sin(angleRad + Math.PI / 2) * sizePx;
                    // forward direction for the cube's depth (2 * sizePx = full cube side)
                    const fwdX = Math.cos(angleRad) * sizePx * 2;
                    const fwdY = Math.sin(angleRad) * sizePx * 2;
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
                      x={placedAoe.x - sizePx}
                      y={placedAoe.y - sizePx}
                      width={sizePx * 2}
                      height={sizePx * 2}
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
            );
          })()}

          {/* ── Remote AoE (from the other screen) ── */}
          {remoteAoe && (() => {
            const ppg = gridResolution?.pixelsPerGrid || 40;
            const feetToPx = (ft: number) => (ft / 5) * ppg;
            const sizePx = feetToPx(remoteAoe.aoeSize);
            const strokeW = 2 / stageScale;
            const hasRemoteSaveResults = !!remoteAoe.saveResults;
            const fillColor = hasRemoteSaveResults ? 'transparent' : 'rgba(255, 120, 30, 0.25)';
            const strokeColor = 'rgba(255, 120, 30, 0.6)';
            const aRad = remoteAoe.angle * (Math.PI / 180);
            const edgeX = remoteAoe.originX + Math.cos(aRad) * remoteAoe.casterRadiusPx;
            const edgeY = remoteAoe.originY + Math.sin(aRad) * remoteAoe.casterRadiusPx;
            const isAnchored = remoteAoe.aoeType === 'cone' || remoteAoe.aoeType === 'line' || !!remoteAoe.selfOrigin;

            return (
              <Layer listening={false}>
                {(remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (
                  <Circle
                    x={isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x}
                    y={isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y}
                    radius={sizePx}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeW}
                    dash={[6 / stageScale, 4 / stageScale]}
                  />
                )}
                {remoteAoe.aoeType === 'cube' && (() => {
                  if (remoteAoe.selfOrigin) {
                    const perpX = Math.cos(aRad + Math.PI / 2) * sizePx;
                    const perpY = Math.sin(aRad + Math.PI / 2) * sizePx;
                    const fwdX = Math.cos(aRad) * sizePx * 2;
                    const fwdY = Math.sin(aRad) * sizePx * 2;
                    const points = [-perpX, -perpY, perpX, perpY, perpX + fwdX, perpY + fwdY, -perpX + fwdX, -perpY + fwdY];
                    return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                  }
                  return <Rect x={remoteAoe.x - sizePx} y={remoteAoe.y - sizePx} width={sizePx * 2} height={sizePx * 2}
                    fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
                {remoteAoe.aoeType === 'cone' && (() => {
                  const halfAngle = (53 / 2) * (Math.PI / 180);
                  const points = [0, 0,
                    Math.cos(aRad - halfAngle) * sizePx, Math.sin(aRad - halfAngle) * sizePx,
                    Math.cos(aRad - halfAngle / 2) * sizePx, Math.sin(aRad - halfAngle / 2) * sizePx,
                    Math.cos(aRad) * sizePx, Math.sin(aRad) * sizePx,
                    Math.cos(aRad + halfAngle / 2) * sizePx, Math.sin(aRad + halfAngle / 2) * sizePx,
                    Math.cos(aRad + halfAngle) * sizePx, Math.sin(aRad + halfAngle) * sizePx];
                  return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
                {remoteAoe.aoeType === 'line' && (() => {
                  const halfWidth = feetToPx(5) / 2;
                  const perpX = Math.cos(aRad + Math.PI / 2) * halfWidth;
                  const perpY = Math.sin(aRad + Math.PI / 2) * halfWidth;
                  const endX = Math.cos(aRad) * sizePx;
                  const endY = Math.sin(aRad) * sizePx;
                  const points = [-perpX, -perpY, endX - perpX, endY - perpY, endX + perpX, endY + perpY, perpX, perpY];
                  return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                })()}
              </Layer>
            );
          })()}

          {(isPlayerView || showFog) && hasFogData && loadedImage && (
            <Layer listening={false}>
              <FogOfWarLayer
                visibilityPolygons={isPlayerView ? playerVisionData : visibilityPolygons}
                mapWidth={loadedImage.width}
                mapHeight={loadedImage.height}
                opacity={isPlayerView ? 1.0 : 0.7}
              />
            </Layer>
          )}
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
                  onClick={(e) => { e.cancelBubble = true; setLeftSidebarOpen(true); onNoteClick?.(note.id); }}
                >
                  <Circle
                    radius={tokenRadius * 0.6}
                    fill={getNoteColor(note.type)}
                    stroke={hoveredNoteId === note.id ? "white" : "rgba(0,0,0,0.4)"}
                    strokeWidth={1}
                    shadowBlur={hoveredNoteId === note.id ? 10 : 5}
                    shadowColor="black"
                  />
                  <NoteMapIcon type={note.type} />
                </Group>
              ))}
            </Layer>
          )}
        </Stage>

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
        {contextMenu && (
          <div
            className={cn(
              "absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl animate-in zoom-in-95 duration-200",
              contextMenu.view === 'add-enemy' ? "w-[600px] overflow-hidden" : "w-64"
            )}
            style={
              contextMenu.view === 'add-enemy'
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : { left: contextMenu.stageX, top: contextMenu.stageY }
            }
            onMouseLeave={() => setActiveSubmenu(null)}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.view === 'root' && (
              <div className="flex flex-col py-1 relative">
                <button
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'note' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <PlusCircle size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Note</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-50" />

                {/* Player Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => setActiveSubmenu('player')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'player' ? "bg-blue-500 text-white" : "hover:bg-blue-500 hover:text-white"
                    )}
                  >
                    <User size={14} className={cn(activeSubmenu === 'player' ? "text-white" : "text-blue-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add/Move a Player</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* Player Submenu */}
                  {activeSubmenu === 'player' && (
                    <div className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150">
                      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 border-b border-[var(--line)] mb-1">Select Player</div>
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
                                <PlusCircle size={12} className="opacity-50" />
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
                                    <ChevronRight size={12} className="opacity-50" />
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
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-enemy' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[#ef4444] hover:text-white transition-colors group"
                >
                  <Skull size={14} className="text-[#ef4444] group-hover:text-white" />
                  <span className="flex-1 text-left">Add an Enemy</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>

                {/* NPC Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => setActiveSubmenu('npc')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'npc' ? "bg-emerald-500 text-white" : "hover:bg-emerald-500 hover:text-white"
                    )}
                  >
                    <Shield size={14} className={cn(activeSubmenu === 'npc' ? "text-white" : "text-emerald-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add an NPC</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* NPC Submenu */}
                  {activeSubmenu === 'npc' && (
                    <div className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150">
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
                                <PlusCircle size={12} className="opacity-50" />
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
                                    <ChevronRight size={12} className="opacity-50" />
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
              </div>
            )}

            {contextMenu.view === 'note' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Add Map Note</span>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex justify-between mb-3 bg-black/20 p-1 rounded-lg">
                  {(['treasure', 'quote', 'warning', 'secret', 'clue'] as MapNoteType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoteDraft(prev => ({ ...prev, type }))}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        noteDraft.type === type ? "scale-110 shadow-lg" : "hover:bg-white/5 opacity-40 hover:opacity-100"
                      )}
                      style={noteDraft.type === type ? { backgroundColor: getNoteColor(type) } : undefined}
                    >
                      <NoteIcon type={type} size={18} className={noteDraft.type === type ? "text-white" : ""} />
                    </button>
                  ))}
                </div>

                <textarea
                  autoFocus
                  value={noteDraft.content}
                  onChange={(e) => setNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write note content..."
                  className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors min-h-[80px] resize-none mb-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveNote();
                    }
                  }}
                />

                <button
                  disabled={!noteDraft.content.trim()}
                  onClick={saveNote}
                  className="btn-filled w-full py-2 rounded-lg disabled:opacity-30"
                >
                  Save Note
                </button>
              </div>
            )}

            {contextMenu.view === 'add-enemy' && (
              <div className="flex flex-col h-[500px]">
                <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Skull size={14} className="text-[#ef4444]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Bestiary</p>
                  </div>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Left Panel: List */}
                  <div className="w-1/2 border-r border-[var(--line)] flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-[var(--line)]">
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                        <input
                          autoFocus
                          type="text"
                          value={monsterSearch}
                          onChange={(e) => setMonsterSearch(e.target.value)}
                          placeholder="Search monsters..."
                          className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--line)]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2014} onChange={(e) => setShowSource2014(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-[10px] opacity-60">2014</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2024} onChange={(e) => setShowSource2024(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-[10px] opacity-60">2024</span>
                      </label>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                      {BESTIARY.filter(m =>
                        m.name.toLowerCase().includes(monsterSearch.toLowerCase()) &&
                        ((showSource2014 && m.source === '2014') || (showSource2024 && m.source === '2024'))
                      ).map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMonster(m)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between group",
                            selectedMonster?.id === m.id ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold">{m.name}</span>
                            <span className={cn("text-[9px] opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>{m.type}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn("text-[9px] font-sans opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                            <span className={cn("text-[8px] font-sans opacity-30", selectedMonster?.id === m.id ? "text-white" : "")}>{m.source}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Details */}
                  <div className="w-1/2 flex flex-col overflow-hidden bg-black/5">
                    {selectedMonster ? (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {/* Header: Avatar + Name + Badges */}
                          <div className="flex items-center gap-3">
                            {selectedMonster.avatar && (
                              <img
                                src={selectedMonster.avatar}
                                alt={selectedMonster.name}
                                className="w-12 h-12 rounded-full object-cover shrink-0 bg-black/20"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-lg font-bold tracking-tight truncate">{selectedMonster.name}</h4>
                              <p className="text-[10px] italic opacity-50">{selectedMonster.type}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 items-end">
                              <div className="flex gap-1.5">
                                <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-[10px] font-bold">HP {selectedMonster.hp}</div>
                                <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold">AC {selectedMonster.ac}</div>
                              </div>
                              <div className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold self-end">CR {selectedMonster.cr}</div>
                            </div>
                          </div>

                          {/* Speed / Senses / Languages */}
                          {(selectedMonster.speed || selectedMonster.senses || selectedMonster.languages) && (
                            <div className="text-[10px] space-y-0.5 opacity-60">
                              {selectedMonster.speed && <div><span className="font-bold">Speed:</span> <SpeedText text={selectedMonster.speed} /></div>}
                              {selectedMonster.senses && <div><span className="font-bold">Senses:</span> {selectedMonster.senses}</div>}
                              {selectedMonster.languages && <div><span className="font-bold">Languages:</span> {selectedMonster.languages}</div>}
                            </div>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-6 gap-1 text-center">
                            {Object.entries(selectedMonster.stats).map(([stat, val]) => (
                              <div key={stat} className="bg-black/20 rounded p-1">
                                <div className="text-[8px] uppercase opacity-50">{stat}</div>
                                <div className="text-xs font-bold">{val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Saves & Defenses */}
                          {(selectedMonster.saves || selectedMonster.immunities || selectedMonster.resistances || selectedMonster.conditionImmunities) && (
                            <div className="text-[10px] space-y-0.5 opacity-60">
                              {selectedMonster.saves && <div><span className="font-bold">Saves:</span> {selectedMonster.saves}</div>}
                              {selectedMonster.resistances && <div><span className="font-bold">Resistances:</span> {selectedMonster.resistances}</div>}
                              {selectedMonster.immunities && <div><span className="font-bold">Immunities:</span> {selectedMonster.immunities}</div>}
                              {selectedMonster.conditionImmunities && <div><span className="font-bold">Cond. Immunities:</span> {selectedMonster.conditionImmunities}</div>}
                            </div>
                          )}

                          {/* Description */}
                          {selectedMonster.description && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Description</h5>
                              <p className="text-xs leading-relaxed opacity-70">{selectedMonster.description}</p>
                            </div>
                          )}

                          {/* Traits / Special Abilities */}
                          {selectedMonster.specialAbilities && selectedMonster.specialAbilities.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Traits</h5>
                              <div className="space-y-2">
                                {selectedMonster.specialAbilities.map((ability, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-purple-400">{ability.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{ability.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {selectedMonster.actions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.actions.map((action, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-[var(--accent)]">{action.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Reactions */}
                          {selectedMonster.reactions && selectedMonster.reactions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Reactions</h5>
                              <div className="space-y-2">
                                {selectedMonster.reactions.map((reaction, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-blue-400">{reaction.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{reaction.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Legendary Actions */}
                          {selectedMonster.legendaryActions && selectedMonster.legendaryActions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Legendary Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.legendaryActions.map((action, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-amber-400">{action.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-3 border-t border-[var(--line)] bg-[var(--surface)] space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Quantity</span>
                            <div className="flex items-center gap-3 bg-black/20 rounded-lg p-1">
                              <button
                                onClick={() => setMonsterQuantity(Math.max(1, monsterQuantity - 1))}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold w-4 text-center">{monsterQuantity}</span>
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
                              const offsetPx = 10 * getTokenSizeMultiplier(
                                (selectedMonster.size?.split('/')[0]?.trim() as Token['size']) || 'Medium'
                              );
                              for (let i = 0; i < monsterQuantity; i++) {
                                // Add a small offset for each subsequent token so they aren't perfectly stacked
                                onAddEnemy(selectedMonster, contextMenu.x + (i * offsetPx), contextMenu.y + (i * offsetPx));
                              }
                              setContextMenu(null);
                            }}
                            className="btn-filled w-full py-2 rounded-lg !bg-[#ef4444] shadow-lg shadow-[#ef4444]/20"
                          >
                            <PlusCircle size={14} />
                            Add {monsterQuantity > 1 ? `${monsterQuantity} Tokens` : 'to Map'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center opacity-20 p-8 text-center">
                        <Skull size={48} className="mb-4 text-[#ef4444]" />
                        <p className="text-sm font-sans uppercase tracking-widest">Select a monster to view details</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clear Movement Paths floating button */}
        {inCombat && Object.keys(movementPaths).length > 0 && !Object.values(movementPaths).some(p => p.isDragging) && (
          <button
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-[var(--surface)] border border-[var(--line)] rounded-lg text-xs opacity-60 hover:opacity-100 transition-opacity flex items-center gap-2"
            onClick={() => {
              setMovementPaths({}); activePathRef.current = {};
              // Clear all fade timers/state
              Object.values(pathFadeTimers.current).forEach(t => clearTimeout(t));
              pathFadeTimers.current = {};
              pathFadeStartRef.current = {};
              setPathFadeProgress({});
            }}
          >
            <Footprints size={12} /> Clear Movement Paths
          </button>
        )}

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
            className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-2xl overflow-hidden w-48 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: tokenContextMenu.x, top: tokenContextMenu.y }}
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
            <button
              onClick={() => deleteToken(tokenContextMenu.tokenId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--btn-bg)] hover:text-white transition-colors text-[var(--btn-bg)]"
            >
              <Trash2 size={14} /> Delete Token
            </button>
          </div>
        )}

        {/* Token Detail Panel — only for non-player tokens; players use the Character Sheet modal */}
        {selectedTokenIds.length === 1 && (() => {
          const tokenId = selectedTokenIds[0];
          const token = tokens.find(t => t.id === tokenId);

          // Players get the dedicated Character Sheet modal via the main menu
          if (token?.type === 'player') return null;

          const sourceCombatantId = token?.combatantId;
          const sourceCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
          const sourceCombatant = sourceCombatants.find(c => c.id === sourceCombatantId);
          // If this combatant is currently in the initiative tracker, use that HP (it's the live value)
          const activeCombatant = activeCombatants.find(ac => ac.sourceCombatantId === sourceCombatantId);
          const combatant = activeCombatant
            ? { ...sourceCombatant, ...activeCombatant }
            : sourceCombatant;

          if (!combatant) return null;

          const hpPct = combatant.maxHp > 0 ? (combatant.hp / combatant.maxHp) * 100 : 0;
          const applyPanelHpDelta = (sign: 1 | -1) => {
            const val = parseInt(panelHpInput || '0', 10);
            if (!val || !sourceCombatantId) return;
            onUpdateCombatantHp(sourceCombatantId, val * sign);
            setPanelHpInput('');
          };

          return (
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--line)] shadow-2xl animate-in slide-in-from-bottom duration-300 z-40 max-h-[40%] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-[var(--line)] bg-black/20 shrink-0">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: token?.color }} />
                    <h4 className="font-bold text-base tracking-tight truncate">{combatant.name}</h4>
                  </div>
                  {/* Stats & controls */}
                  <div className="flex items-center gap-4 shrink-0 px-2 justify-end">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-1">
                      AC {combatant.ac}
                    </div>
                    {(combatant.speedText || combatant.speed != null) && (
                      <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest flex items-center gap-1">
                        <Footprints size={12} className="opacity-70" />
                        <SpeedText text={combatant.speedText ? combatant.speedText : `${combatant.speed} ft.`} />
                      </div>
                    )}

                    <div className="w-48 h-2 bg-black/50 rounded-full overflow-hidden ml-2 shadow-inner">
                      <div
                        className="h-full bg-[var(--accent)] transition-all shadow-[0_0_6px_rgba(205,127,50,0.4)]"
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>

                    <div className="text-xs font-bold text-white/50 w-20 text-right tabular-nums">
                      {combatant.hp}/{combatant.maxHp} HP
                    </div>

                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => applyPanelHpDelta(-1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                      >
                        <span className="text-[14px] font-bold leading-none">−</span>
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={panelHpInput}
                        onChange={(e) => setPanelHpInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyPanelHpDelta(-1); }}
                        placeholder="0"
                        className="w-10 h-6 text-center text-[12px] font-bold bg-black/50 border border-white/10 rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => applyPanelHpDelta(1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors"
                      >
                        <span className="text-[14px] font-bold leading-none">+</span>
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedTokenId(null);
                    setSelectedTokenIds([]);
                    setPanelHpInput('');
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors opacity-50 hover:opacity-100 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-x-auto p-4 flex gap-8">
                {/* Column 1: Stats & Info */}
                <div className="min-w-[200px] flex flex-col gap-4">
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Attributes</h5>
                    {combatant.stats ? (
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(combatant.stats).map(([stat, val]) => (
                          <div key={stat} className="bg-black/20 rounded p-2 text-center">
                            <div className="text-[8px] uppercase opacity-50">{stat}</div>
                            <div className="text-sm font-bold">
                              {Math.floor((val - 10) / 2) >= 0 ? '+' : ''}{Math.floor((val - 10) / 2)}
                            </div>
                            <div className="text-[9px] opacity-30">{val}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs opacity-40 italic">No stats available</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {combatant.species && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{combatant.species}</span>}
                    {(combatant.speedText || combatant.speed != null) && <span className="px-2 py-1 bg-white/5 rounded flex-wrap flex gap-1 items-center text-[10px]"><SpeedText text={combatant.speedText ? combatant.speedText : `${combatant.speed} ft`} /> Speed</span>}
                    {combatant.darkvision && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{combatant.darkvision}ft Darkvision</span>}
                  </div>
                </div>

                {/* Column 2: Actions */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Actions</h5>
                  <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {combatant.actions && combatant.actions.length > 0 ? (
                      combatant.actions.map((action, i) => (
                        <div key={i} className="text-xs bg-white/5 p-2 rounded border border-white/5">
                          <span className="font-bold italic text-[var(--accent)]">{action.name}.</span> {action.desc}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs opacity-40 italic">No actions listed</p>
                    )}
                  </div>
                </div>

                {/* Column 4: Spells */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Spells</h5>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {(() => {
                      const AOE_LABELS: Record<string, string> = {
                        sphere: 'Sphere', cone: 'Cone', line: 'Line', cube: 'Cube', cylinder: 'Cylinder',
                      };
                      const tokenX = token?.x ?? 0;
                      const tokenY = token?.y ?? 0;

                      const startCasting = (spell: { name: string; aoeType?: string; aoeSize?: number; range?: number }) => {
                        if (!spell.aoeType || !spell.aoeSize) return;
                        const casterRadiusPx = tokenRadius * getTokenSizeMultiplier(token?.size);
                        setCastingSpell({
                          name: spell.name,
                          aoeType: spell.aoeType as any,
                          aoeSize: spell.aoeSize,
                          originX: tokenX,
                          originY: tokenY,
                          casterRadiusPx,
                          selfOrigin: spell.range === 0 || spell.range === undefined,
                        });
                        setPlacedAoe(null);
                      };

                      // Structured player spells
                      if (combatant.spells && combatant.spells.length > 0) {
                        return combatant.spells.map((spell, i) => {
                          const aoeBadge = spell.aoeType
                            ? `${spell.aoeSize ? `${spell.aoeSize}ft ` : ''}${AOE_LABELS[spell.aoeType] || ''}`
                            : undefined;
                          const saveBadge = spell.saveAbility
                            ? `${spell.saveAbility.toUpperCase()} SAVE`
                            : undefined;
                          return (
                            <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                              badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                              aoeBadge={aoeBadge} saveBadge={saveBadge}
                              onCast={spell.aoeType ? () => startCasting(spell) : undefined} />
                          );
                        });
                      }

                      // Monster spellcasting — parse from specialAbilities Spellcasting trait
                      const spellcastingTrait = combatant.specialAbilities?.find(a =>
                        a.name.toLowerCase().includes('spellcasting')
                      );
                      if (spellcastingTrait) {
                        const parsed = parseSpellcastingTrait(spellcastingTrait.desc);
                        if (parsed.spells.length > 0) {
                          return (
                            <>
                              <p className="text-[10px] opacity-40 italic leading-relaxed mb-2">{parsed.preamble}</p>
                              {parsed.spells.map((spell, i) => {
                                const aoeBadge = spell.aoeType
                                  ? `${spell.aoeSize ? `${spell.aoeSize}ft ` : ''}${AOE_LABELS[spell.aoeType] || ''}`
                                  : undefined;
                                const saveBadge = spell.saveAbility
                                  ? `${spell.saveAbility.toUpperCase()} SAVE${parsed.saveDc ? ` ${parsed.saveDc}` : ''}`
                                  : undefined;
                                return (
                                  <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                                    badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                                    aoeBadge={aoeBadge} saveBadge={saveBadge}
                                    onCast={spell.aoeType ? () => startCasting(spell) : undefined} />
                                );
                              })}
                            </>
                          );
                        }
                      }
                      return <p className="text-xs opacity-40 italic">No spells listed</p>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Change Map Warning Modal */}
      <AnimatePresence>
        {showChangeMapModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowChangeMapModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-[420px] p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Upload size={18} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif mb-1">Change Map?</h3>
                  <p className="text-sm opacity-60 leading-relaxed">
                    This scenario has {tokens.length > 0 && mapNotes.length > 0
                      ? `${tokens.length} token${tokens.length !== 1 ? 's' : ''} and ${mapNotes.length} note${mapNotes.length !== 1 ? 's' : ''}`
                      : tokens.length > 0
                        ? `${tokens.length} token${tokens.length !== 1 ? 's' : ''}`
                        : `${mapNotes.length} note${mapNotes.length !== 1 ? 's' : ''}`
                    } placed on the current map. Uploading a new map will remove all of them.
                  </p>
                </div>
              </div>

              <div className="bg-black/20 border border-[var(--line)] rounded-xl p-3 mb-5 text-xs opacity-60 leading-relaxed">
                If you want to keep this scenario's content, consider creating a new scenario instead.
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowChangeMapModal(false);
                    fileInputRef.current?.click();
                  }}
                  className="btn-filled py-2.5 rounded-xl"
                >
                  Change Map Anyway
                </button>
                {onAddScenario && (
                  <button
                    onClick={() => {
                      setShowChangeMapModal(false);
                      onAddScenario();
                    }}
                    className="btn-ghost py-2.5 rounded-xl"
                  >
                    Create New Scenario Instead
                  </button>
                )}
                <button
                  onClick={() => setShowChangeMapModal(false)}
                  className="py-2 text-xs opacity-40 hover:opacity-70 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
};
