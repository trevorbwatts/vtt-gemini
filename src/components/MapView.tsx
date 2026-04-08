import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Path, Line, Transformer } from 'react-konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster, WallSegment, Portal, GridResolution, WallPoint, MovementPath, Floor, TransitionZone, UVTTLight } from '../types';
import { parseUVTTFile } from '../services/uvttParser';
import { Upload, User, Skull, Shield, X, EyeOff, Eye, Trash2, ChevronRight, ChevronDown, PlusCircle, Search, Map as MapIcon, FileText, Cloud, Sun, Moon, Footprints, Undo2, DoorClosed, Blinds, Edit2, SquareDashed, Layers, ArrowUpDown, SquareDashedTopSolid } from '../icons';
import { constrainPositionAgainstWalls, getTokenCollisionRadius } from '../utils/wallCollision';
import type { Viewpoint } from '../types';
import { extractBlockingSegments, computeVisibilityPolygon, clipPolygonToCircle, computeRadiusLimitedVisibilityPolygon } from '../utils/visibility';
import { FogOfWarLayer } from './FogOfWarLayer';
import { motion, AnimatePresence } from 'motion/react';
import { NoteIcon } from './DMNotes';
import { BESTIARY } from '../data/bestiary';
import { lookupSpell } from '../data/spellDatabase';
import { parseDamageType, getDamageRgb } from '../utils/damageColors';
import { SpeedText } from './SpeedText';
import type { SpellMarker } from '../types';

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
  isPlayerView?: boolean;
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
  lights?: UVTTLight[];
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution, lights?: UVTTLight[]) => void;
  onPortalToggle?: (portalId: string) => void;
  onPortalTypeChange?: (portalId: string, type: 'door' | 'window' | 'secret') => void;
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
  startPlacingRef?: React.MutableRefObject<((spell: { name: string; school?: string; effectRadius?: number; aoeType?: string; aoeSize?: number; range?: number; shapeType?: 'point' | 'wall'; maxLength?: number; maxThickness?: number; blocksVision?: boolean }, combatantId: string) => void) | null>;
  /** Ref that MapView populates so external code can add spell markers directly (no interactive placement) */
  addMarkersDirectlyRef?: React.MutableRefObject<((markers: import('../types').SpellMarker[]) => void) | null>;
  /** Ref that MapView populates so external code can cancel placed AoE */
  cancelCastingRef?: React.MutableRefObject<(() => void) | null>;
  /** Ref that MapView populates so players can enter ruler/measure mode */
  startMeasuringRef?: React.MutableRefObject<((edge: 'top' | 'bottom' | 'left') => void) | null>;
  /** Ref that MapView populates so players can cancel measure mode */
  cancelMeasuringRef?: React.MutableRefObject<(() => void) | null>;
  /** Called with the current measured distance in feet as the player drags (null when cleared) */
  onMeasureDistanceChange?: (feet: number | null) => void;
  /** Ref that MapView populates so external code can confirm cast (roll saves) */
  confirmCastRef?: React.MutableRefObject<(() => void) | null>;
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
  /** Update a specific floor by ID (for cross-floor operations) */
  onUpdateFloorById?: (floorId: string, updater: (floor: Floor) => Floor) => void;
  /** Whether this is the primary (left-most) map panel */
  isPrimary?: boolean;
  /** Spell markers placed on the map */
  spellMarkers?: import('../types').SpellMarker[];
  /** Callback to update spell markers */
  onSpellMarkersChange?: (markers: import('../types').SpellMarker[]) => void;
}

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: '#3b82f6',
  Conjuration: '#f59e0b',
  Divination: '#c0c0c0',
  Enchantment: '#ec4899',
  Evocation: '#ef4444',
  Illusion: '#a855f7',
  Necromancy: '#22c55e',
  Transmutation: '#f97316',
};

// Per-spell color overrides (take priority over school color)
const SPELL_COLOR_OVERRIDES: Record<string, string> = {
  'Mage Hand': '#1d4ed8', // dark blue
};

// Lucide icon SVG inner content (24x24 viewbox) for each spell school.
// Rendered as stroke="white" images on a colored circle background.
const SCHOOL_ICON_SVGS: Record<string, string> = {
  Abjuration:    `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`,
  Conjuration:   `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
  Divination:    `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`,
  Enchantment:   `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>`,
  Evocation:     `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
  Illusion:      `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>`,
  Necromancy:    `<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>`,
  Transmutation: `<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>`,
};

// Per-spell SVG icon overrides (take priority over school icon)
const SPELL_ICON_SVGS: Record<string, string> = {
  'Mage Hand': `<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`,
};

// Cache for rendered icon HTMLImageElements keyed by SVG content string
const iconImageCache = new Map<string, HTMLImageElement>();

function makeIconSvgUrl(svgContent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/** Returns a cached HTMLImageElement for an icon SVG, or null if not yet loaded. onLoad fires when ready. */
function getIconImage(svgContent: string, onLoad?: () => void): HTMLImageElement | null {
  if (!svgContent) return null;
  const cached = iconImageCache.get(svgContent);
  if (cached) return cached.complete ? cached : null;
  const img = new window.Image();
  img.onload = () => onLoad?.();
  img.src = makeIconSvgUrl(svgContent);
  iconImageCache.set(svgContent, img);
  return null;
}

function getSchoolColor(school: string): string {
  return SCHOOL_COLORS[school] || '#a855f7';
}

/**
 * Compute the 4 corner positions (world coordinates) of a wall-shape spell marker.
 * Order: near-left, near-right, far-right, far-left (clockwise when angle=0).
 * `length` and `thickness` are in feet; `ppg` is pixels per grid (5 ft).
 */
function computeWallCorners(
  x: number,
  y: number,
  lengthFt: number,
  thicknessFt: number,
  angleDeg: number,
  ppg: number,
): { x: number; y: number }[] {
  const halfL = (lengthFt / 5) * ppg / 2;
  const halfT = (thicknessFt / 5) * ppg / 2;
  const a = angleDeg * Math.PI / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rot = (lx: number, ly: number) => ({
    x: x + lx * c - ly * s,
    y: y + lx * s + ly * c,
  });
  return [
    rot(-halfL, -halfT),
    rot( halfL, -halfT),
    rot( halfL,  halfT),
    rot(-halfL,  halfT),
  ];
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
  aoeType: 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder' | 'emanation';
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
  damageType?: string;
  saveResults?: Record<string, SaveResult>;
  mapInteraction?: string;
  saveEffect?: string;
  condition?: string;
  casterId?: string;
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

    // Exclude the caster's own token for self-origin spells, cones/lines, and emanations
    const isAnchoredToCaster = aoe.selfOrigin || aoe.aoeType === 'cone' || aoe.aoeType === 'line' || aoe.aoeType === 'emanation';
    if (isAnchoredToCaster) {
      const distToOrigin = Math.sqrt((tx - aoe.originX) ** 2 + (ty - aoe.originY) ** 2);
      if (distToOrigin < aoe.casterRadiusPx + 2) continue;
    }

    switch (aoe.aoeType) {
      case 'emanation': {
        // Sphere centered on caster — radius measured from caster's edge
        hit = Math.sqrt((tx - aoe.originX) ** 2 + (ty - aoe.originY) ** 2) < sizePx + aoe.casterRadiusPx + tr;
        break;
      }
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
          hit = localFwd > -tr && localFwd < sizePx + tr && Math.abs(localPerp) < sizePx / 2 + tr;
        } else {
          hit = Math.abs(tx - aoe.x) < sizePx / 2 + tr && Math.abs(ty - aoe.y) < sizePx / 2 + tr;
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

const TOKEN_IMAGE_CACHE_MAX = 50;
const tokenImageCache = new Map<string, HTMLImageElement>();

const TokenAvatar: React.FC<{ url: string; radius: number }> = ({ url, radius }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) return;
    if (tokenImageCache.has(url)) {
      // Move to end (most recently used) for LRU ordering
      const cached = tokenImageCache.get(url)!;
      tokenImageCache.delete(url);
      tokenImageCache.set(url, cached);
      setImage(cached);
      return;
    }
    const img = new window.Image();
    img.src = url;
    img.onload = () => {
      // Evict oldest entry if cache is full
      if (tokenImageCache.size >= TOKEN_IMAGE_CACHE_MAX) {
        const oldest = tokenImageCache.keys().next().value;
        if (oldest !== undefined) tokenImageCache.delete(oldest);
      }
      tokenImageCache.set(url, img);
      setImage(img);
    };
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
 * Static glowing ring around the active combatant's token.
 * No animation — avoids interfering with the Konva layer's rendering.
 */
const ActiveTurnRing: React.FC<{ radius: number; tokenScale: number; color?: string }> = ({ radius, tokenScale, color }) => {
  const ringColor = color || '#fbbf24';
  return (
    <>
      {/* Outer glow — no shadowBlur for GPU perf */}
      <Circle
        radius={radius + 6 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={3 * tokenScale}
        opacity={0.15}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Mid glow */}
      <Circle
        radius={radius + 5 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={1.5 * tokenScale}
        opacity={0.3}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Inner bright ring */}
      <Circle
        radius={radius + 3 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={2.5 * tokenScale}
        opacity={0.85}
        listening={false}
        perfectDrawEnabled={false}
      />
    </>
  );
};

/** Target ring — red crosshair-style indicator for targeted monsters */
const TargetRing: React.FC<{ radius: number; tokenScale: number }> = ({ radius, tokenScale }) => {
  const r = radius + 5 * tokenScale;
  const dashLen = r * 0.35;
  return (
    <Circle
      radius={r}
      fill=""
      stroke="#ef4444"
      strokeWidth={2.5 * tokenScale}
      opacity={0.9}
      dash={[dashLen, dashLen]}
      listening={false}
      perfectDrawEnabled={false}
    />
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
    let lastUpdate = 0;
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / 3000, 1);
      // Throttle React state updates to ~20fps to reduce GPU load
      if (now - lastUpdate >= 50 || p >= 1) {
        lastUpdate = now;
        setProgress(p);
      }
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

// ── Lucide SVG path data for viewpoint icon (Eye, 24×24 viewBox) ──
type IconNode = ['path' | 'rect' | 'circle', Record<string, string>];
const VIEWPOINT_NODES: IconNode[] = [
  ['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }],
  ['circle', { cx: '12', cy: '12', r: '3' }],
];

// ── Lucide SVG path data for portal icons (24×24 viewBox) ──
const DOOR_CLOSED_NODES: IconNode[] = [
  ['path', { d: 'M10 12h.01' }],
  ['path', { d: 'M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14' }],
  ['path', { d: 'M2 20h20' }],
];
const DOOR_OPEN_NODES: IconNode[] = [
  ['path', { d: 'M11 20H2' }],
  ['path', { d: 'M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z' }],
  ['path', { d: 'M11 4H8a2 2 0 0 0-2 2v14' }],
  ['path', { d: 'M14 12h.01' }],
  ['path', { d: 'M22 20h-3' }],
];
const GRID2X2_NODES: IconNode[] = [
  ['path', { d: 'M12 3v18' }],
  ['path', { d: 'M3 12h18' }],
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
];
const BLINDS_NODES: IconNode[] = [
  ['path', { d: 'M3 3h18' }],
  ['path', { d: 'M20 7H8' }],
  ['path', { d: 'M20 11H8' }],
  ['path', { d: 'M10 19h10' }],
  ['path', { d: 'M8 15h12' }],
  ['path', { d: 'M4 3v14' }],
  ['circle', { cx: '4', cy: '19', r: '2' }],
];

const MapViewInner: React.FC<MapViewProps> = ({
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
  isPlayerView = false,
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
  confirmCastRef,
  onCastingDismissed,
  startMeasuringRef,
  cancelMeasuringRef,
  onMeasureDistanceChange,
  onAoeHighlightsChange,
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
  onUpdateFloorById,
  isPrimary = true,
  spellMarkers = [],
  onSpellMarkersChange,
}) => {
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ tokenId: string; time: number } | null>(null);
  const aoeJustPlacedRef = useRef(false); // prevents token reselection after AoE placement click
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [contextMenu, setContextMenu] = useState<{
    x: number,
    y: number,
    stageX: number,
    stageY: number,
    view: 'root' | 'note' | 'viewpoint' | 'add-player' | 'add-enemy' | 'add-npc' | 'spell-marker',
    viewpointId?: string,
    markerId?: string,
  } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'player' | 'npc' | null>(null);
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, tokenId: string } | null>(null);
  const [portalContextMenu, setPortalContextMenu] = useState<{ screenX: number, screenY: number, portalId: string, portalType: 'door' | 'window' | 'secret' } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string }>({ type: 'treasure', content: '' });
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [viewpointDraft, setViewpointDraft] = useState<{ zoomPercent: number }>({ zoomPercent: 25 });
  const [activeViewpointId, setActiveViewpointId] = useState<string | null>(null);
  const viewpointReturnRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  const [viewpointContextMenu, setViewpointContextMenu] = useState<{ screenX: number; screenY: number; viewpointId: string } | null>(null);
  const [showChangeMapModal, setShowChangeMapModal] = useState(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [showSource2014, setShowSource2014] = useState(false);
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
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
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
  } | null>(null);
  const [pendingMarkerPos, setPendingMarkerPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
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
  // Increments when icon images finish loading, triggering a re-render so KonvaImage nodes appear
  const [iconVersion, setIconVersion] = useState(0);

  // Wall collision — prevents tokens from passing through walls during drag
  const [wallCollisionEnabled, setWallCollisionEnabled] = useState(true);
  const lastValidPosRef = useRef<Record<string, { x: number; y: number }>>({});
  const dragTokenRadiusRef = useRef<Record<string, number>>({});

  // Transition zone drawing mode
  const [transitionZoneMode, setTransitionZoneMode] = useState(false);
  const [drawingZone, setDrawingZone] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [transitionZoneConfig, setTransitionZoneConfig] = useState<{ rect: { x: number; y: number; width: number; height: number } } | null>(null);
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
    sourceRect: { x: number; y: number; width: number; height: number };
    targetFloorId: string;
    label?: string;
    pairIndex: number;
  } | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
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
      if (!spell.aoeType || !spell.aoeSize) return;
      const token = tokensRef.current.find(t => t.combatantId === combatantId);
      if (!token) return;
      const casterRadiusPx = tokenRadius * getTokenSizeMultiplier(token.size);
      const isSelfOrigin = spell.range === 0 || spell.range === undefined;

      // Emanation: skip mouse-follow — immediately place AoE locked to caster position
      if (spell.aoeType === 'emanation') {
        setPlacedAoe({
          name: spell.name,
          aoeType: 'emanation',
          aoeSize: spell.aoeSize,
          x: token.x,
          y: token.y,
          originX: token.x,
          originY: token.y,
          angle: 0,
          casterRadiusPx,
          saveAbility: spell.saveAbility,
          saveDc: spell.saveDc,
          halfDamageOnSave: spell.halfDamageOnSave,
          spellDesc: spell.desc,
          damageType: parseDamageType(spell.desc || ''),
          mapInteraction: spell.mapInteraction,
          saveEffect: spell.saveEffect,
          condition: spell.condition,
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
        aoeType: spell.aoeType as 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder',
        aoeSize: spell.aoeSize,
        originX: token.x,
        originY: token.y,
        casterRadiusPx,
        selfOrigin: isSelfOrigin,
        saveAbility: spell.saveAbility,
        saveDc: spell.saveDc,
        halfDamageOnSave: spell.halfDamageOnSave,
        spellDesc: spell.desc,
        damageType: parseDamageType(spell.desc || ''),
        mapInteraction: spell.mapInteraction,
        saveEffect: spell.saveEffect,
        condition: spell.condition,
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

      // Default: point-marker placement flow (Light, Darkness, etc.)
      setPlacingSpell({
        name: spell.name,
        school,
        effectRadius: spell.effectRadius ?? entry?.effectRadius,
        casterId: combatantId,
        aoeType: (spell.aoeType ?? entry?.aoeType) as any,
        aoeSize: spell.aoeSize ?? entry?.aoeSize,
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
      setPlacingSpell(null);
      onCastingDismissed?.();
      onAoeHighlightsChange?.(null);
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

  if (clearRemoteAoeRef) {
    clearRemoteAoeRef.current = () => {
      setRemoteAoe(null);
      onAoeHighlightsChange?.(null);
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

  // Engaged pairs: player ↔ enemy/npc tokens within 5ft (melee range) during combat
  const engagedPairs = useMemo(() => {
    if (!inCombat || !gridResolution) return [] as { key: string; ptId: string; etId: string; px1: number; py1: number; px2: number; py2: number }[];
    const pairs: { key: string; ptId: string; etId: string; px1: number; py1: number; px2: number; py2: number }[] = [];
    const playerTokens = tokens.filter(t => t.type === 'player');
    const enemyTokens  = tokens.filter(t => t.type === 'enemy' || t.type === 'npc');
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
  }, [inCombat, tokens, livePlayerPos, tokenRadius, ppg, gridResolution]);

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

  // Confirm Cast: roll saves for affected monsters
  const handleConfirmCast = () => {
    // Wall-shape placement (Wall of Sand, etc.) — create a persistent rotated-rectangle marker
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
      setEditingWall(null);
      setPlacingSpell(null);
      onCastingDismissed?.();
      return;
    }

    const aoe = placedAoe; // Only the caster's screen can confirm
    if (!aoe) return;

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
        // No monsters hit — skip modal
        if (Object.keys(results).length === 0) {
          setPlacedAoe(null);
          onCastingDismissed?.();
          return;
        }
        setPlacedAoe(prev => prev ? { ...prev, saveResults: results } : null);
        return;
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
      return;
    }

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

    // For cast-and-place spells (Grease, etc.), also drop a persistent marker
    if (aoe.mapInteraction === 'cast-and-place') placePersistentMarker();

    // No monsters hit — skip modal
    if (Object.keys(results).length === 0) {
      setPlacedAoe(null);
      onCastingDismissed?.();
      return;
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

    // Placed Light cantrip markers — treated as dynamic light sources.
    // Use live drag position if currently being dragged for real-time fog update.
    for (const marker of spellMarkers) {
      if (marker.spellName !== 'Light' || !marker.effectRadius) continue;
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
  // light-visible areas. Only computed when there are lights and we're in player view.
  const playerFullLOSPolygons = useMemo((): WallPoint[][] => {
    if (!isPlayerView || !loadedImage || !lightPolygons.length) return [];
    const { width: mapW, height: mapH } = loadedImage;
    return playerTokenPositions.map(t =>
      computeVisibilityPolygon({ x: t.x, y: t.y }, blockingSegments, mapW, mapH)
    );
  }, [isPlayerView, loadedImage, lightPolygons.length, playerTokenPositions, blockingSegments]);

  const hasFogData = blockingSegments.length > 0;

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

  // Re-centre the player's camera whenever the DM's viewport *coordinates* change.
  // Compares by value so that a new object reference with the same coordinates
  // (common after IPC round-trips) does NOT reset a player's two-finger pan.
  const lastAppliedViewportRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (isPlayerView && viewportCenter && stageScale > 0 && dimensions.width > 0 && !activeViewpointId) {
      const prev = lastAppliedViewportRef.current;
      if (prev && prev.x === viewportCenter.x && prev.y === viewportCenter.y) return;
      lastAppliedViewportRef.current = { x: viewportCenter.x, y: viewportCenter.y };
      setStagePos({
        x: dimensions.width / 2 - viewportCenter.x * stageScale,
        y: dimensions.height / 2 - viewportCenter.y * stageScale,
      });
    }
  }, [viewportCenter]); // eslint-disable-line react-hooks/exhaustive-deps

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
          onWallDataChange?.(result.walls, result.objectWalls, result.portals, result.gridResolution, result.lights);
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

  // Track drag start pos per token so we can cancel micro-drags (finger wobble)
  const tokenDragOriginRef = useRef<Record<string, { x: number; y: number }>>({});

  const handleDragStart = (id: string) => {
    // Block token drag while measuring
    if (isMeasuringActive) return;
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

  const handleDragMove = (id: string, e: any) => {
    let pos = { x: e.target.x(), y: e.target.y() };

    // Wall collision: constrain token position against blocking segments
    const shouldCollide = (isPlayerView || wallCollisionEnabled) && blockingSegments.length > 0;
    if (shouldCollide) {
      const radius = dragTokenRadiusRef.current[id] ?? 20;
      const prevPos = lastValidPosRef.current[id] ?? pos;
      pos = constrainPositionAgainstWalls(pos, prevPos, radius, blockingSegments);
      e.target.x(pos.x);
      e.target.y(pos.y);
      lastValidPosRef.current[id] = pos;
    } else {
      lastValidPosRef.current[id] = pos;
    }

    draggingPositionsRef.current[id] = pos;

    // Move all other selected tokens by the same delta
    const multi = multiDragStartRef.current;
    if (multi && multi.draggedId === id) {
      const dx = pos.x - multi.draggedStart.x;
      const dy = pos.y - multi.draggedStart.y;
      Object.entries(multi.othersStart).forEach(([tid, start]) => {
        let otherPos = { x: start.x + dx, y: start.y + dy };
        if (shouldCollide) {
          const otherRadius = dragTokenRadiusRef.current[tid] ?? 20;
          const otherPrev = lastValidPosRef.current[tid] ?? otherPos;
          otherPos = constrainPositionAgainstWalls(otherPos, otherPrev, otherRadius, blockingSegments);
          lastValidPosRef.current[tid] = otherPos;
        }
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
          ap.points.push(px, py);
          ap.totalDistancePx += segDist;
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
    if (shouldCollide) {
      const radius = dragTokenRadiusRef.current[id] ?? 20;
      const prevPos = lastValidPosRef.current[id] ?? finalPos;
      finalPos = constrainPositionAgainstWalls(finalPos, prevPos, radius, blockingSegments);
      e.target.x(finalPos.x);
      e.target.y(finalPos.y);
    }

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
          ap.points.push(fx, fy);
          ap.totalDistancePx += segDist;
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

    if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
    } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
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
          droppedToken.x >= z.rect.x && droppedToken.x <= z.rect.x + z.rect.width &&
          droppedToken.y >= z.rect.y && droppedToken.y <= z.rect.y + z.rect.height
        );
        if (hitZone) {
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
      floorId: activeFloorId || undefined,
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
        floorId: activeFloorId || undefined,
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
    // Wall-shape spells use their own preview — skip tap-to-place
    if (placingSpell && placingSpell.shapeType === 'wall') {
      return;
    }
    // Spell marker placement on touch (player view)
    if (placingSpell && e.evt.changedTouches.length === 1) {
      const stage = e.target.getStage();
      const pos = getCanvasPos(stage);
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
    // Transition zone drawing mode
    if (transitionZoneMode && e.evt.button === 0 && !spaceHeldRef.current) {
      const canvas = getCanvasPos(e.target.getStage());
      setDrawingZone({ startX: canvas.x, startY: canvas.y, endX: canvas.x, endY: canvas.y });
      return;
    }

    // Measure mode: mouse down sets start point (desktop support)
    if (isMeasuringActive && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
      setMeasureStart(pos);
      setMeasureEnd(pos);
      return;
    }

    // Spell marker placement: click to place
    // Wall-shape spells use a dedicated preview (editingWall) and should ignore the click-to-place flow
    if (placingSpell && placingSpell.shapeType === 'wall') {
      return;
    }
    if (placingSpell && e.evt.button === 0) {
      const pos = getCanvasPos(e.target.getStage());
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
    // Transition zone drawing
    if (drawingZone) {
      const canvas = getCanvasPos(e.target.getStage());
      setDrawingZone(prev => prev ? { ...prev, endX: canvas.x, endY: canvas.y } : null);
      return;
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
    // Finish transition zone drawing
    if (drawingZone) {
      const x = Math.min(drawingZone.startX, drawingZone.endX);
      const y = Math.min(drawingZone.startY, drawingZone.endY);
      const width = Math.abs(drawingZone.endX - drawingZone.startX);
      const height = Math.abs(drawingZone.endY - drawingZone.startY);
      if (width > 10 && height > 10) {
        if (pendingPairData) {
          // This is the second zone in a paired flow
          const targetRect = { x, y, width, height };
          const sourceZoneId = `tz-${Date.now()}-a`;
          const targetZoneId = `tz-${Date.now()}-b`;
          const sourceCenter = {
            x: pendingPairData.sourceRect.x + pendingPairData.sourceRect.width / 2,
            y: pendingPairData.sourceRect.y + pendingPairData.sourceRect.height / 2,
          };
          const targetCenter = { x: x + width / 2, y: y + height / 2 };

          // Create target zone on current (target) floor
          const targetZone: TransitionZone = {
            id: targetZoneId,
            rect: targetRect,
            targetFloorId: pendingPairData.sourceFloorId,
            targetPosition: sourceCenter,
            label: pendingPairData.label,
            pairedZoneId: sourceZoneId,
            pairIndex: pendingPairData.pairIndex,
          };
          const currentFloor = floors?.find(f => f.id === pendingPairData.targetFloorId);
          const existingTarget = currentFloor?.transitionZones || [];
          onTransitionZonesChange?.([...existingTarget, targetZone]);

          // Create source zone on original floor
          const sourceZone: TransitionZone = {
            id: sourceZoneId,
            rect: pendingPairData.sourceRect,
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
        } else {
          setTransitionZoneConfig({ rect: { x, y, width, height } });
        }
      }
      setDrawingZone(null);
      setTransitionZoneMode(false);
      return;
    }

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

  return (
    <div className={cn("h-full flex flex-col relative", castingSpell && "cursor-crosshair")} ref={containerRef}>
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
                  {floors && floors.length > 1
                    ? `Map | ${floors.find(f => f.id === activeFloorId)?.name ?? 'Floor'}`
                    : 'Map'}
                </h3>
              </div>
              <div className="relative">
                <button
                  onClick={() => setIsMapMenuOpen(!isMapMenuOpen)}
                  className="btn-ghost py-1 px-3 flex items-center gap-2"
                >
                  MAP SETTINGS <ChevronDown size={12} className={cn("transition-transform", isMapMenuOpen && "rotate-180")} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,.uvtt,.dd2vtt,.df2vtt" />
                
                <AnimatePresence>
                  {isMapMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsMapMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full left-0 mt-2 z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[180px] flex flex-col items-stretch"
                      >
                        <button
                          onClick={() => {
                            setIsMapMenuOpen(false);
                            if (mapImage && (tokens.length > 0 || mapNotes.length > 0)) {
                              setShowChangeMapModal(true);
                            } else {
                              fileInputRef.current?.click();
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-white/5 transition-colors text-left"
                        >
                          <Upload size={14} /> Change Map
                        </button>
                        
                        {walls && walls.length > 0 && (
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
                        
                        {hasFogData && (
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
                        
                        {hasFogData && (
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
              setSelectedZoneId(null);
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

            {/* Render Transition Zones — DM only */}
            {!isPlayerView && (() => {
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
                    <Rect
                      ref={(node) => { if (node) zoneRectRefs.current[zone.id] = node; }}
                      x={zone.rect.x}
                      y={zone.rect.y}
                      width={zone.rect.width}
                      height={zone.rect.height}
                      fill={`rgba(${r}, ${g}, ${b}, 0.2)`}
                      stroke={selectedZoneId === zone.id ? color : color}
                      strokeWidth={selectedZoneId === zone.id ? 3 : 2}
                      dash={[8, 4]}
                      listening={true}
                      draggable={!transitionZoneMode}
                      onClick={(e) => {
                        e.cancelBubble = true;
                        setSelectedZoneId(prev => prev === zone.id ? null : zone.id);
                      }}
                      onContextMenu={(e) => {
                        e.evt.preventDefault();
                        e.cancelBubble = true;
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
                                transitionZones: (f.transitionZones || []).filter(z => z.id !== zone.pairedZoneId)
                              }));
                            }
                          }
                        });
                      }}
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
                    <Text
                      x={zone.rect.x + 4}
                      y={zone.rect.y + 4}
                      text={`${zone.pairIndex != null ? `#${zone.pairIndex} ` : ''}↔ ${targetFloor?.name || '?'}${zone.label ? ` (${zone.label})` : ''}`}
                      fontSize={12}
                      fill={color}
                      listening={false}
                    />
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
            })()}

            {/* Render drawing-in-progress transition zone */}
            {drawingZone && (
              <Rect
                x={Math.min(drawingZone.startX, drawingZone.endX)}
                y={Math.min(drawingZone.startY, drawingZone.endY)}
                width={Math.abs(drawingZone.endX - drawingZone.startX)}
                height={Math.abs(drawingZone.endY - drawingZone.startY)}
                fill="rgba(59, 130, 246, 0.2)"
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[8, 4]}
                listening={false}
              />
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
                ? (isSecret ? '#a855f7' : portal.closed ? '#4ade80' : '#60a5fa')
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
                  onClick={(e) => { e.cancelBubble = true; onPortalToggle?.(portal.id); }}
                  onTap={(e) => { e.cancelBubble = true; onPortalToggle?.(portal.id); }}
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

            {/* Engaged range lines — rendered UNDER tokens */}
            {engagedPairs.map(pair => (
              <Line
                key={pair.key}
                points={[pair.px1, pair.py1, pair.px2, pair.py2]}
                stroke="#FF4444"
                strokeWidth={2 / stageScale}
                opacity={0.6}
                dash={[8 / stageScale, 5 / stageScale]}
                listening={false}
                perfectDrawEnabled={false}
              />
            ))}

            {tokens.filter(t => !(isPlayerView && t.type === 'player')).map(token => {
              const r = tokenRadius * getTokenSizeMultiplier(token.size);
              return (
              <Group
                key={token.id}
                x={livePlayerPos[token.id]?.x ?? token.x}
                y={livePlayerPos[token.id]?.y ?? token.y}
                draggable={isPlayerView ? (token.type === 'player' && !activeAoe && !isMeasuringActive) : true}
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
                    setSelectedTokenId(token.id);
                    onSelectedTokenIdChange?.(token.id);
                  }
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
                  opacity={token.hidden ? 0.4 : 1}
                  perfectDrawEnabled={false}
                />
                {/* Engaged range ring — shown when within 5ft of an opposing token during combat */}
                {engagedTokenIds.has(token.id) && (
                  <Circle
                    radius={r + 5 / stageScale}
                    fill="transparent"
                    stroke="#FF4444"
                    strokeWidth={2 / stageScale}
                    opacity={0.75}
                    dash={[6 / stageScale, 4 / stageScale]}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
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
                {token.avatar && (
                  <Group opacity={token.hidden ? 0.4 : 1} listening={false}>
                    <TokenAvatar
                      url={token.avatar}
                      radius={r - tokenScale}
                    />
                  </Group>
                )}
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
                // On the player view names are hidden, so sit the label tight under the avatar
                let nameHeight = 0;
                if (!isPlayerView) {
                  // Estimate wrapped name height: ~0.6 * fontSize per char width, Konva line-height ≈ 1.2×
                  const nameWidth = tokenRadius * 5;
                  const avgCharWidth = nameFontSize * 0.55;
                  const charsPerLine = Math.max(1, Math.floor(nameWidth / avgCharWidth));
                  const nameText = pathToken?.name || '';
                  const nameLines = Math.max(1, Math.ceil(nameText.length / charsPerLine));
                  nameHeight = nameLines * nameFontSize * 1.2;
                }
                const distY = lastY - r - distLabelFontSize - 5;
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

                {/* Emanation — non-draggable circle locked to caster origin */}
                {placedAoe.aoeType === 'emanation' && (
                  <Circle
                    x={placedAoe.originX}
                    y={placedAoe.originY}
                    radius={sizePx + placedAoe.casterRadiusPx}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    dash={[6 / stageScale, 4 / stageScale]}
                    draggable={false}
                    listening={false}
                  />
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
            );
          })()}

          {/* ── Wall-shape spell preview (Wall of Sand, etc.) ── */}
          {editingWall && (() => {
            const aRad = editingWall.angle * Math.PI / 180;
            const cosA = Math.cos(aRad);
            const sinA = Math.sin(aRad);
            const halfL = (editingWall.length / 5) * ppg / 2;
            const halfT = (editingWall.thickness / 5) * ppg / 2;
            // Local corners (relative to wall center at 0,0) — Line is positioned via x/y
            const localCorners = [
              { x: -halfL * cosA - -halfT * sinA, y: -halfL * sinA + -halfT * cosA },
              { x:  halfL * cosA - -halfT * sinA, y:  halfL * sinA + -halfT * cosA },
              { x:  halfL * cosA -  halfT * sinA, y:  halfL * sinA +  halfT * cosA },
              { x: -halfL * cosA -  halfT * sinA, y: -halfL * sinA +  halfT * cosA },
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

            return (
              <Layer>
                {/* Wall body — draggable to translate the whole wall */}
                <Line
                  x={editingWall.x}
                  y={editingWall.y}
                  points={pointsFlat}
                  closed
                  fill="rgba(212,165,116,0.35)"
                  stroke="#d4a574"
                  strokeWidth={2 / stageScale}
                  dash={[8 / stageScale, 4 / stageScale]}
                  draggable
                  onDragMove={onBodyDragMove}
                  onDragEnd={onBodyDragMove}
                />
                {/* Length handles (both ends of long axis) — rotate + resize length */}
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
                {/* Thickness handles — resize thickness along perpendicular axis */}
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
                {/* Live dimensions readout */}
                <Text
                  x={labelX - 40 / stageScale}
                  y={labelY - labelFontSize / 2}
                  text={`${Math.round(editingWall.length)} \u00d7 ${Math.round(editingWall.thickness)} ft`}
                  fontSize={labelFontSize}
                  fill="#ffd9a6"
                  fontStyle="bold"
                  align="center"
                  width={80 / stageScale}
                  listening={false}
                />
              </Layer>
            );
          })()}

          {/* ── Measure / Ruler ── */}
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

          {/* ── Remote AoE (from the other screen) ── */}
          {remoteAoe && (() => {
            const ppg = gridResolution?.pixelsPerGrid || 40;
            const feetToPx = (ft: number) => (ft / 5) * ppg;
            const sizePx = feetToPx(remoteAoe.aoeSize);
            const strokeW = 2 / stageScale;
            const hasRemoteSaveResults = !!remoteAoe.saveResults;
            const remoteRgb = getDamageRgb(remoteAoe.damageType);
            const fillColor = hasRemoteSaveResults ? 'transparent' : `rgba(${remoteRgb}, 0.25)`;
            const strokeColor = `rgba(${remoteRgb}, 0.6)`;
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
                    const perpX = Math.cos(aRad + Math.PI / 2) * sizePx / 2;
                    const perpY = Math.sin(aRad + Math.PI / 2) * sizePx / 2;
                    const fwdX = Math.cos(aRad) * sizePx;
                    const fwdY = Math.sin(aRad) * sizePx;
                    const points = [-perpX, -perpY, perpX, perpY, perpX + fwdX, perpY + fwdY, -perpX + fwdX, -perpY + fwdY];
                    return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
                  }
                  return <Rect x={remoteAoe.x - sizePx / 2} y={remoteAoe.y - sizePx / 2} width={sizePx} height={sizePx}
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
                } else if (portal.closed) {
                  iconColor = '#ffffff';
                  bgFill = 'rgba(255,255,255,0.15)';
                  bgStroke = 'rgba(255,255,255,0.35)';
                } else if (isWindow) {
                  iconColor = '#60a5fa';
                  bgFill = 'rgba(37,99,235,0.45)';
                  bgStroke = 'rgba(96,165,250,0.5)';
                } else {
                  iconColor = '#4ade80';
                  bgFill = 'rgba(22,163,74,0.45)';
                  bgStroke = 'rgba(74,222,128,0.5)';
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
                    onClick={(e) => { e.cancelBubble = true; setPortalContextMenu(null); onPortalToggle?.(portal.id); }}
                    onTap={(e) => { e.cancelBubble = true; }}
                    onTouchStart={(e) => { e.cancelBubble = true; }}
                    onTouchEnd={(e) => { e.cancelBubble = true; setPortalContextMenu(null); onPortalToggle?.(portal.id); }}
                    onContextMenu={!isPlayerView ? (e) => {
                      e.evt.preventDefault();
                      e.cancelBubble = true;
                      const stage = e.target.getStage();
                      const pos = stage?.getPointerPosition();
                      if (!pos) return;
                      setPortalContextMenu({
                        screenX: pos.x,
                        screenY: pos.y,
                        portalId: portal.id,
                        portalType: (portal.portalType ?? 'door') as 'door' | 'window' | 'secret',
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

          {(isPlayerView || showFog) && hasFogData && loadedImage && (
            <Layer listening={false}>
              <FogOfWarLayer
                visibilityPolygons={isPlayerView ? playerVisionData : visibilityPolygons}
                playerLOSPolygons={playerFullLOSPolygons}
                lightPolygons={lightPolygons}
                mapWidth={loadedImage.width}
                mapHeight={loadedImage.height}
                opacity={isPlayerView ? 1.0 : 0.7}
              />
            </Layer>
          )}
          {/* Darkness spell circles — rendered above fog but below tokens */}
          {spellMarkers.some(m => m.spellName === 'Darkness' && (!m.floorId || m.floorId === activeFloorId) && (!isPlayerView || m.visibleToPlayers)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Darkness' && (!m.floorId || m.floorId === activeFloorId) && (!isPlayerView || m.visibleToPlayers))
                .map(marker => {
                  const effectPx = marker.effectRadius ? (marker.effectRadius / 5) * ppg : 0;
                  if (effectPx <= 0) return null;
                  const live = liveMarkerPos[marker.id];
                  return (
                    <Circle
                      key={marker.id}
                      x={live?.x ?? marker.x}
                      y={live?.y ?? marker.y}
                      radius={effectPx}
                      fill="black"
                      opacity={0.92}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  );
                })}
            </Layer>
          )}

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
                  draggable={!activeAoe && !isMeasuringActive}
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
                  <Circle
                    radius={r}
                    fill={token.avatar ? 'transparent' : token.color}
                    stroke={token.color}
                    strokeWidth={2 * tokenScale}
                    opacity={token.hidden ? 0.4 : 1}
                    perfectDrawEnabled={false}
                  />
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
                    <Group opacity={token.hidden ? 0.4 : 1} listening={false}>
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
                    const wallCorners = computeWallCorners(
                      marker.x, marker.y,
                      marker.length ?? 30,
                      marker.thickness ?? 10,
                      marker.angle ?? 0,
                      ppg,
                    );
                    const wallPts = wallCorners.flatMap(c => [c.x, c.y]);
                    return (
                      <Line
                        key={marker.id}
                        points={wallPts}
                        closed
                        fill="rgba(212,165,116,0.55)"
                        stroke="#8b5a2b"
                        strokeWidth={1.5 / stageScale}
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
                          const pos = e.target.getStage()?.getPointerPosition();
                          setContextMenu({
                            x: marker.x,
                            y: marker.y,
                            stageX: pos?.x ?? e.evt.clientX,
                            stageY: pos?.y ?? e.evt.clientY,
                            view: 'spell-marker',
                            markerId: marker.id,
                          });
                        }}
                        onMouseDown={(e) => { e.cancelBubble = true; }}
                      />
                    );
                  }
                  const color = SPELL_COLOR_OVERRIDES[marker.spellName] ?? getSchoolColor(marker.school);
                  const iconSvg = SPELL_ICON_SVGS[marker.spellName] ?? SCHOOL_ICON_SVGS[marker.school] ?? '';
                  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                  iconVersion; // depend on iconVersion so we re-render when images load
                  const iconImg = iconSvg ? getIconImage(iconSvg) : null;
                  const markerRadius = tokenRadius * 0.5;
                  const effectPx = marker.effectRadius ? (marker.effectRadius / 5) * ppg : 0;
                  return (
                    <Group
                      key={marker.id}
                      x={marker.x}
                      y={marker.y}
                      draggable={true}
                      onDragMove={(e) => {
                        setDismissMarkerBubble(null);
                        if (marker.spellName === 'Light' || marker.spellName === 'Darkness') {
                          setLiveMarkerPos(prev => ({
                            ...prev,
                            [marker.id]: { x: e.target.x(), y: e.target.y() },
                          }));
                        }
                      }}
                      onDragEnd={(e) => {
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
                        if (!isPlayerView) {
                          try { window.electronAPI?.sendDMSpellMarkerUpdate?.(updated); } catch (_e) { /* */ }
                        }
                      }}
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
                      onMouseEnter={() => setHoveredMarkerId(marker.id)}
                      onMouseLeave={() => setHoveredMarkerId(null)}
                      onContextMenu={(e) => {
                        if (isPlayerView) return;
                        e.evt.preventDefault();
                        e.cancelBubble = true;
                        const pos = e.target.getStage()?.getPointerPosition();
                        setContextMenu({
                          x: marker.x,
                          y: marker.y,
                          stageX: pos?.x ?? e.evt.clientX,
                          stageY: pos?.y ?? e.evt.clientY,
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
                      {marker.spellName !== 'Light' && marker.spellName !== 'Darkness' && (() => {
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
                      {/* Hover label */}
                      {hoveredMarkerId === marker.id && (
                        <Text
                          text={marker.spellName}
                          y={markerRadius + 4}
                          fontSize={12}
                          fill="white"
                          align="center"
                          offsetX={0}
                          width={120}
                          x={-60}
                        />
                      )}
                    </Group>
                  );
                })}
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
                    strokeWidth={hoveredNoteId === note.id ? 2 : 1}
                  />
                  <NoteMapIcon type={note.type} />
                </Group>
              ))}
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

        {/* Placing spell indicator — hidden for wall-shape spells, which use the
            player-drawer-anchored Casting Banner in PlayerScreen instead. */}
        {placingSpell && !pendingMarkerPos && placingSpell.shapeType !== 'wall' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl shadow-2xl border"
              style={{
                background: `${getSchoolColor(placingSpell.school)}20`,
                borderColor: `${getSchoolColor(placingSpell.school)}40`,
              }}
            >
              <span className="text-xs font-bold" style={{ color: getSchoolColor(placingSpell.school) }}>
                {`Placing: ${placingSpell.name}`}
              </span>
              <button
                onClick={() => { setPlacingSpell(null); setPendingMarkerPos(null); setEditingWall(null); onCastingDismissed?.(); }}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <X size={14} />
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
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[160px]"
              style={{ left: portalContextMenu.screenX, top: portalContextMenu.screenY }}
            >
              <div className="px-3 py-2 border-b border-[var(--line)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Portal Type</p>
              </div>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'door' ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'door');
                  setPortalContextMenu(null);
                }}
              >
                <DoorClosed size={14} />
                Door
                {portalContextMenu.portalType === 'door' && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'window' ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'window');
                  setPortalContextMenu(null);
                }}
              >
                <Blinds size={14} />
                Window
                {portalContextMenu.portalType === 'window' && <span className="ml-auto text-[10px] text-orange-400/60">current</span>}
              </button>
              <button
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left',
                  portalContextMenu.portalType === 'secret' ? 'text-orange-400' : 'text-white/60',
                )}
                onClick={() => {
                  onPortalTypeChange?.(portalContextMenu.portalId, 'secret');
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
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[160px]"
              style={{ left: viewpointContextMenu.screenX, top: viewpointContextMenu.screenY }}
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
              contextMenu.view === 'add-enemy' ? "w-[840px] overflow-hidden" : "w-64"
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
                <button
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'viewpoint' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <Eye size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Viewpoint</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                {floors && floors.length > 1 && (
                  <button
                    onMouseEnter={() => setActiveSubmenu(null)}
                    onClick={() => {
                      setTransitionZoneMode(!transitionZoneMode);
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                  >
                    <ArrowUpDown size={14} className="opacity-50 group-hover:opacity-100" />
                    <span className="flex-1 text-left">{transitionZoneMode ? 'Cancel Transition Zone' : 'Add Transition Zone'}</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>
                )}
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

                <div className="flex-1 flex overflow-hidden">
                  {/* Left Panel: List */}
                  <div className="w-2/5 border-r border-[var(--line)] flex flex-col overflow-hidden">
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
                    <div className="flex-1 overflow-y-auto py-1">
                      {BESTIARY.filter(m =>
                        m.name.toLowerCase().includes(monsterSearch.toLowerCase()) &&
                        ((showSource2014 && m.source === '2014') || (showSource2024 && m.source === '2024'))
                      ).map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMonster(m)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between group",
                            selectedMonster?.id === m.id ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold">{m.name}</span>
                            <span className={cn("text-[10px] opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>{m.type}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn("text-[10px] font-sans opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                            <span className={cn("text-[9px] font-sans opacity-30", selectedMonster?.id === m.id ? "text-white" : "")}>{m.source}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Details */}
                  <div className="w-3/5 flex flex-col overflow-hidden bg-black/5">
                    {selectedMonster ? (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {/* Header: Avatar + Name + Badges */}
                          <div className="flex items-center gap-3">
                            {selectedMonster.avatar && (
                              <img
                                key={selectedMonster.id}
                                src={selectedMonster.avatar}
                                alt={selectedMonster.name}
                                className="w-12 h-12 rounded-full object-cover shrink-0 bg-black/20"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xl font-bold tracking-tight truncate">{selectedMonster.name}</h4>
                              <p className="text-xs italic opacity-50">{selectedMonster.type}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 items-end">
                              <div className="flex gap-1.5">
                                <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-xs font-bold">HP {selectedMonster.hp}</div>
                                <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-xs font-bold">AC {selectedMonster.ac}</div>
                              </div>
                              <div className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-bold self-end">CR {selectedMonster.cr}</div>
                            </div>
                          </div>

                          {/* Speed / Senses / Languages */}
                          {(selectedMonster.speed || selectedMonster.senses || selectedMonster.languages) && (
                            <div className="text-xs space-y-0.5 opacity-60">
                              {selectedMonster.speed && <div><span className="font-bold">Speed:</span> <SpeedText text={selectedMonster.speed} /></div>}
                              {selectedMonster.senses && <div><span className="font-bold">Senses:</span> {selectedMonster.senses}</div>}
                              {selectedMonster.languages && <div><span className="font-bold">Languages:</span> {selectedMonster.languages}</div>}
                            </div>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-6 gap-1 text-center">
                            {Object.entries(selectedMonster.stats).map(([stat, val]) => (
                              <div key={stat} className="bg-black/20 rounded p-1">
                                <div className="text-[9px] uppercase opacity-50">{stat}</div>
                                <div className="text-sm font-bold">{val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Saves & Defenses */}
                          {(selectedMonster.saves || selectedMonster.immunities || selectedMonster.resistances || selectedMonster.conditionImmunities) && (
                            <div className="text-xs space-y-0.5 opacity-60">
                              {selectedMonster.saves && <div><span className="font-bold">Saves:</span> {selectedMonster.saves}</div>}
                              {selectedMonster.resistances && <div><span className="font-bold">Resistances:</span> {selectedMonster.resistances}</div>}
                              {selectedMonster.immunities && <div><span className="font-bold">Immunities:</span> {selectedMonster.immunities}</div>}
                              {selectedMonster.conditionImmunities && <div><span className="font-bold">Cond. Immunities:</span> {selectedMonster.conditionImmunities}</div>}
                            </div>
                          )}

                          {/* Description */}
                          {selectedMonster.description && (
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Description</h5>
                              <p className="text-sm leading-relaxed opacity-70">{selectedMonster.description}</p>
                            </div>
                          )}

                          {/* Traits / Special Abilities */}
                          {selectedMonster.specialAbilities && selectedMonster.specialAbilities.length > 0 && (
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Traits</h5>
                              <div className="space-y-2">
                                {selectedMonster.specialAbilities.map((ability, i) => (
                                  <div key={i} className="text-sm leading-relaxed">
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
                              <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.actions.map((action, i) => (
                                  <div key={i} className="text-sm leading-relaxed">
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
                              <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Reactions</h5>
                              <div className="space-y-2">
                                {selectedMonster.reactions.map((reaction, i) => (
                                  <div key={i} className="text-sm leading-relaxed">
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
                              <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Legendary Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.legendaryActions.map((action, i) => (
                                  <div key={i} className="text-sm leading-relaxed">
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
                        <p className="text-base font-sans uppercase tracking-widest">Select a monster to view details</p>
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
                </>
              ) : null;
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
                            className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-2xl overflow-hidden"
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
                        sourceRect: transitionZoneConfig.rect,
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
              ? `Draw arrival zone on ${floors?.find(f => f.id === pendingPairData.targetFloorId)?.name || 'target floor'} — click and drag`
              : 'Draw transition zone — click and drag'}
          </span>
          <button
            onClick={() => {
              if (pendingPairData) onSwitchFloor?.(pendingPairData.sourceFloorId);
              setPendingPairData(null);
              setTransitionZoneMode(false);
              setDrawingZone(null);
            }}
            className="px-2 py-0.5 bg-white/20 rounded-md hover:bg-white/30"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Transition Popup — appears when token is dropped on a transition zone */}
      <AnimatePresence>
        {transitionPopup && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="fixed z-[70] bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl p-3 min-w-[180px]"
            style={{ left: transitionPopup.screenX - 90, top: transitionPopup.screenY + 30 }}
          >
            {(() => {
              const zone = transitionPopup.zone;
              const targetFloor = floors?.find(f => f.id === zone.targetFloorId);
              // Compute arrival position: use partner zone's rect center if available, fall back to targetPosition
              let arrivalX = zone.targetPosition.x;
              let arrivalY = zone.targetPosition.y;
              if (zone.pairedZoneId && targetFloor) {
                const partnerZone = targetFloor.transitionZones?.find(tz => tz.id === zone.pairedZoneId);
                if (partnerZone) {
                  arrivalX = partnerZone.rect.x + partnerZone.rect.width / 2;
                  arrivalY = partnerZone.rect.y + partnerZone.rect.height / 2;
                }
              }
              return (
                <>
                  <p className="text-xs opacity-60 mb-2 text-center">
                    {zone.label || `Go to ${targetFloor?.name || 'next floor'}`}
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
                        if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
                          window.electronAPI.sendPlayerTokenUpdate(updated);
                        }
                        setTransitionPopup(null);
                      }}
                      className="btn-ghost py-2 px-3 rounded-lg text-xs text-left flex items-center gap-2 hover:bg-blue-500/10"
                    >
                      <User size={12} className="text-blue-400" /> Move Just Me
                    </button>
                    <button
                      onClick={() => {
                        const spacing = gridResolution?.pixelsPerGrid || 70;
                        let offsetIndex = 0;
                        const updated = tokens.map(t => {
                          if (t.type === 'player') {
                            const offset = offsetIndex * spacing;
                            offsetIndex++;
                            return { ...t, floorId: zone.targetFloorId, x: arrivalX + offset, y: arrivalY };
                          }
                          return t;
                        });
                        onTokensChange(updated);
                        if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
                          window.electronAPI.sendPlayerTokenUpdate(updated);
                        }
                        setTransitionPopup(null);
                      }}
                      className="btn-ghost py-2 px-3 rounded-lg text-xs text-left flex items-center gap-2 hover:bg-blue-500/10"
                    >
                      <Layers size={12} className="text-blue-400" /> Move Whole Team
                    </button>
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
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
};

export const MapView = React.memo(MapViewInner);
