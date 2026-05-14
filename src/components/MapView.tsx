import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Stage, Layer, Image as KonvaImage, Circle, RegularPolygon, Text, Group, Rect, Path, Line, Transformer, Arc } from 'react-konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster, WallSegment, Portal, GridResolution, WallPoint, MovementPath, Floor, TransitionZone, UVTTLight, Stroke } from '../types';
import { parseUVTTFile } from '../services/uvttParser';
import { Upload, User, Skull, Shield, X, EyeOff, Eye, Trash2, ChevronRight, ChevronDown, PlusCircle, Search, Map as MapIcon, FileText, Cloud, Sun, Moon, Footprints, Undo2, DoorClosed, Blinds, Edit2, SquareDashed, Layers, ArrowUpDown, SquareDashedTopSolid } from '../icons';
import { Lock, Unlock } from 'lucide-react';
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
  addMarkersDirectlyRef?: React.MutableRefObject<((markers: import('../types').SpellMarker[]) => void) | null>;
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
  /** Update a specific floor by ID (for cross-floor operations) */
  onUpdateFloorById?: (floorId: string, updater: (floor: Floor) => Floor) => void;
  /** Move every player token (across all floors) to a 2×2 grid around the given point */
  onMoveAllPlayersHere?: (x: number, y: number, floorId: string, spacingPx: number) => void;
  /** Whether this is the primary (left-most) map panel */
  isPrimary?: boolean;
  /** Spell markers placed on the map */
  spellMarkers?: import('../types').SpellMarker[];
  /** Callback to update spell markers */
  onSpellMarkersChange?: (markers: import('../types').SpellMarker[]) => void;
  /** Tremorsense data — when active, reveals nearby enemy/NPC tokens as grey circles above fog */
  tremorsenseData?: { playerId: string; rangeFt: number } | null;
  /** Detect Magic data — when active, reveals 'magic' type map notes within range below fog */
  detectMagicData?: { playerId: string; rangeFt: number } | null;
  detectPoisonData?: { playerId: string; rangeFt: number } | null;

  /** Active emanation rings that follow their casters */
  activeEmanations?: import('../types').ActiveEmanation[];
  /** Whether any player has See Invisibility active (player view only) */
  seeInvisibility?: boolean;
  /** Active timers for tokens to display countdown rings */
  activeTimers?: import('../types').TokenTimer[];
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

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// Per-spell color overrides (take priority over school color)
const SPELL_COLOR_OVERRIDES: Record<string, string> = {
  'Mage Hand': '#1d4ed8',
  'Arcane Gate (Near)': '#06b6d4',
  'Arcane Gate (Far)': '#0891b2',
};

// Lucide icon SVG inner content (24x24 viewbox) for each spell school.
// Rendered as stroke="white" images on a colored circle background.
const SCHOOL_ICON_SVGS: Record<string, string> = {
  Abjuration: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`,
  Conjuration: `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
  Divination: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`,
  Enchantment: `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>`,
  Evocation: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
  Illusion: `<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>`,
  Necromancy: `<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>`,
  Transmutation: `<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>`,
};

// Per-spell SVG icon overrides (take priority over school icon)
const SPELL_ICON_SVGS: Record<string, string> = {
  'Mage Hand': `<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`,
  'Cordon of Arrows': `<path d="M5 19h14"/><path d="M12 15V5"/><polyline points="8 9 12 5 16 9"/>`,
  'Arcane Gate (Near)': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/>`,
  'Arcane Gate (Far)': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/>`,
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
    rot(halfL, -halfT),
    rot(halfL, halfT),
    rot(-halfL, halfT),
  ];
}

function getTokenSizeMultiplier(size?: Token['size']): number {
  switch (size) {
    case 'Tiny': return 0.5;
    case 'Small': return 0.75;
    case 'Large': return 2;
    case 'Huge': return 3;
    case 'Gargantuan': return 4;
    default: return 1; // Medium / unset
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

/** Animated countdown ring for abilities with a duration */
const CountdownRing: React.FC<{ radius: number; tokenScale: number; startTime: number; durationMs: number; color?: string }> = ({ radius, tokenScale, startTime, durationMs, color }) => {
  const [remainingRatio, setRemainingRatio] = useState(() => {
    const elapsed = Date.now() - startTime;
    return Math.max(0, 1 - elapsed / durationMs);
  });

  useEffect(() => {
    let frameId: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const ratio = 1 - elapsed / durationMs;
      if (ratio <= 0) {
        setRemainingRatio(0);
        return;
      }
      setRemainingRatio(ratio);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [startTime, durationMs]);

  if (remainingRatio <= 0) return null;

  return (
    <Arc
      angle={360 * remainingRatio}
      rotation={-90 + 360 * (1 - remainingRatio)} /* Move starting angle clockwise as time drains */
      innerRadius={radius + 4 * tokenScale}
      outerRadius={radius + 8 * tokenScale}
      fill={color || '#fcd34d'}
      opacity={0.8}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};

/**
 * Fire particles streaming outward from the hot face of Wall of Fire.
 * p0/p1 are the two endpoints of the hot edge in layer/world coords.
 * normalX/normalY is the unit vector pointing away from that face.
 */
const WallOfFireParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 90;
  const BASE_PERIOD = 1300;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);                            // position along edge 0..1
    const drift = wallLen * (0.05 + rand(i, 4) * 0.16);  // outward drift distance
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.015; // tiny sideways wobble
    const sizeMul = 0.3 + rand(i, 6) * 0.85;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * phase * drift;
    const y = by + normalY * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice particles drifting outward from both faces of Wall of Ice.
 * Light blue shards, structure matches WallOfFireParticles.
 */
const WallOfIceParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 100;
  const BASE_PERIOD = 1700;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.12);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wip${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#a7d8ff"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice particles for Wall of Ice (Dome). Emits from the dome circumference
 * drifting gently inward, light blue tones.
 */
const WallOfIceDomeParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.1 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    // Mix: mostly inward, some outward for "frost shedding" feel
    const dir = rand(i, 11) < 0.7 ? -1 : 1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`widp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#a7d8ff"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Force particles shimmering along both faces of Wall of Force.
 * Purple/violet tones, bidirectional like WallOfIceParticles.
 */
const WallOfForceParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 100;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.03 + rand(i, 4) * 0.1);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f3e8ff' : shade > 0.33 ? '#c084fc' : '#a855f7';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c084fc"
        shadowBlur={size * 3}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Force particles for Wall of Force (Dome). Emits along the dome circumference,
 * drifting gently, purple/violet tones.
 */
const WallOfForceDomeParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1900;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.08 + rand(i, 4) * 0.18);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    const dir = rand(i, 11) < 0.5 ? -1 : 1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f3e8ff' : shade > 0.33 ? '#c084fc' : '#a855f7';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfdp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c084fc"
        shadowBlur={size * 3}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Wind particles streaming outward from both faces of Wind Wall.
 * Gray tones, same structure as WallOfFireParticles but bidirectional.
 */
const WindWallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 110;
  const BASE_PERIOD = 1200;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);                            // position along edge 0..1
    const drift = wallLen * (0.06 + rand(i, 4) * 0.2);   // outward drift distance
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;  // sideways wobble
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    // Half the particles blow to each side
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wwp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#aaaaaa"
        shadowBlur={size * 2.5}
        shadowOpacity={0.7}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Radiant particles streaming outward from both faces of Wall of Light.
 * Yellow/gold tones, same bidirectional structure as WindWallParticles.
 */
const WallOfLightParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 110;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.06 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#fff3a3' : '#ffd84a';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wlp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ffe066"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Sand particles swirling along both faces of Wall of Sand.
 * Tan/brown tones, with a gentle swirl to feel granular and dusty.
 */
const WallOfSandParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 140;
  const BASE_PERIOD = 1600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.14);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.025;
    const sizeMul = 0.25 + rand(i, 6) * 0.7;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    // Swirl: sideways oscillation grows with phase for a dusty curl feel
    const swirlAmp = wallLen * 0.015 * sizeMul;
    const swirlFreq = 2 + rand(i, 12) * 3;
    const swirl = Math.sin(phase * Math.PI * swirlFreq + rand(i, 13) * Math.PI * 2) * swirlAmp * phase;

    const alongX = wallDirX * tAlong * wallLen + swirl * wallDirX;
    const alongY = wallDirY * tAlong * wallLen + swirl * wallDirY;
    const bx = p0.x + alongX + jitter * (-wallDirY);
    const by = p0.y + alongY + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.12;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.5);
    const size = Math.max(0.4, 1.6 * sizeMul * (1 - phase * 0.25));
    const shade = rand(i, 9);
    // Sand palette: pale dune → warm sand → dark ochre
    const fill = shade > 0.75 ? '#f5e4b5' : shade > 0.45 ? '#d9b982' : shade > 0.2 ? '#b5894f' : '#8b6230';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wsp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c9a468"
        shadowBlur={size * 1.8}
        shadowOpacity={0.55}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Prismatic Wall — dense band of particles along the wall length. Color is
 * driven by the particle's position along the wall plus a time offset, so the
 * seven rainbow hues flow through the wall like colored water through a hose.
 */
const PrismaticWallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  // Seven prismatic layers, red → violet
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#6366f1', '#a855f7'];
  const shadowPalette = ['#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#4338ca', '#7e22ce'];

  const COUNT = 180;
  // Speed of color flow along the wall (cycles per second)
  const FLOW_SPEED = 0.35;
  // How many full rainbow cycles fit along the wall length
  const BANDS = 2.5;
  const particles: React.ReactElement[] = [];

  // Pulse period for per-particle in/out fade
  const BASE_PERIOD = 1300;

  for (let i = 0; i < COUNT; i++) {
    const tAlong = rand(i, 3);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    // Small side sway around the wall plane
    const swaySide = (rand(i, 11) - 0.5) * 2;
    const swayAmp = wallLen * 0.012 * (0.4 + rand(i, 12) * 0.8);
    const swayFreq = 0.8 + rand(i, 13) * 1.2;
    const sway = Math.sin(tick / 1000 * swayFreq + rand(i, 14) * Math.PI * 2) * swayAmp * swaySide;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sway;
    const y = by + normalY * sway;

    // Color cycles based on position along the wall plus time — the "hose" flow
    const colorPhase = (tAlong * BANDS + (tick / 1000) * FLOW_SPEED) % 1;
    const colorIdx = Math.floor(colorPhase * palette.length) % palette.length;
    const fill = palette[colorIdx];
    const shadow = shadowPalette[colorIdx];

    // Per-particle pulse so not every dot has the same brightness
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const pulse = ((tick / period) + offset) % 1;
    const pulseFade = pulse < 0.5 ? pulse * 2 : (1 - pulse) * 2;
    const opacity = 0.55 + pulseFade * 0.4;

    const sizeMul = 0.4 + rand(i, 6) * 0.9;
    const size = Math.max(0.6, 2.0 * sizeMul);
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`pwp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor={shadow}
        shadowBlur={size * 3.5}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Thorn particles drifting along both faces of Wall of Thorns.
 * Green palette to evoke brambles and foliage.
 */
const WallOfThornsParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 120;
  const BASE_PERIOD = 1500;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.05 + rand(i, 4) * 0.18);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d1fae5' : shade > 0.4 ? '#86efac' : shade > 0.18 ? '#22c55e' : '#15803d';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wtp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#15803d"
        shadowBlur={size * 2.5}
        shadowOpacity={0.75}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Thorn particles for Wall of Thorns (Ring). Emits from the ring circumference
 * radially both inward and outward with a green palette.
 */
const WallOfThornsRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 100;
  const BASE_PERIOD = 1500;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.1 + rand(i, 4) * 0.22);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    const dir = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d1fae5' : shade > 0.4 ? '#86efac' : shade > 0.18 ? '#22c55e' : '#15803d';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wtrp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#15803d"
        shadowBlur={size * 2.5}
        shadowOpacity={0.8}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Soft golden motes drifting throughout a Hallow sphere. Suggests
 * hallowed/sanctified ground — slow, warm, even glow across the area.
 */
const HallowParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  // Density scales with area, capped so giant 60ft circles stay performant.
  const COUNT = Math.min(220, Math.max(40, Math.round((radiusPx * radiusPx) / 110)));
  const BASE_PERIOD = 2600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 1.0);
    const offset = rand(i, 2);
    const phase = ((tick / period) + offset) % 1;
    // Sample uniformly inside the disc: r = R * sqrt(u)
    const u = rand(i, 3);
    const r = radiusPx * Math.sqrt(u);
    const a = rand(i, 4) * Math.PI * 2;
    // Small slow upward drift so it feels alive, not static
    const drift = (phase - 0.5) * 4;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a) - drift;
    const fade = phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8;
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 5) * 0.4);
    const size = 1.0 + rand(i, 6) * 1.6;
    const shade = rand(i, 7);
    const fill = shade > 0.7 ? '#fff7d6' : shade > 0.4 ? '#fde68a' : shade > 0.18 ? '#fbbf24' : '#f59e0b';
    particles.push(
      <Circle
        key={`hp${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#fbbf24"
        shadowBlur={size * 2.2}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Vertical "bars" suggested by parallel rows of violet sparks across the
 * Forcecage (Cage) footprint. Bars run perpendicular to the long axis.
 */
const ForcecageBarsParticles: React.FC<{
  cx: number;
  cy: number;
  lengthPx: number;
  thicknessPx: number;
  angleRad: number;
}> = ({ cx, cy, lengthPx, thicknessPx, angleRad }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (lengthPx < 1 || thicknessPx < 1) return null;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  // Local axes: u = along length, v = along thickness
  const ux = cosA, uy = sinA;
  const vx = -sinA, vy = cosA;

  const halfL = lengthPx / 2;
  const halfT = thicknessPx / 2;

  // Suggest bars: a regular row of "columns" running across length,
  // each column shimmering top-to-bottom along the thickness.
  const BAR_COUNT = Math.max(6, Math.round(lengthPx / 14));
  const PER_BAR = 9;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let b = 0; b < BAR_COUNT; b++) {
    const uFrac = (b + 0.5) / BAR_COUNT; // 0..1
    const u = -halfL + uFrac * lengthPx;
    for (let k = 0; k < PER_BAR; k++) {
      const i = b * PER_BAR + k;
      const period = BASE_PERIOD * (0.7 + rand(i, 1) * 0.6);
      const offset = rand(i, 2);
      const phase = ((tick / period) + offset) % 1;
      const vFrac = (k + rand(i, 3) * 0.6) / PER_BAR; // 0..1 along thickness
      const v = -halfT + vFrac * thicknessPx;
      const jitterU = (rand(i, 4) - 0.5) * 1.5;
      const jitterV = (rand(i, 5) - 0.5) * 1.5;
      const x = cx + (u + jitterU) * ux + (v + jitterV) * vx;
      const y = cy + (u + jitterU) * uy + (v + jitterV) * vy;
      const fade = phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85;
      const opacity = Math.max(0, fade) * (0.5 + rand(i, 6) * 0.4);
      const size = 1.2 + rand(i, 7) * 1.4;
      const shade = rand(i, 8);
      const fill = shade > 0.7 ? '#ede9fe' : shade > 0.4 ? '#c4b5fd' : shade > 0.18 ? '#a78bfa' : '#7c3aed';
      particles.push(
        <Circle
          key={`fcb${i}`}
          x={x}
          y={y}
          radius={size}
          fill={fill}
          shadowColor="#7c3aed"
          shadowBlur={size * 2}
          shadowOpacity={0.85}
          opacity={opacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

/**
 * Soft, even violet shimmer filling the Forcecage (Box) footprint.
 * Used for the solid-box variant — no visible bars.
 */
const ForcecageBoxParticles: React.FC<{
  cx: number;
  cy: number;
  lengthPx: number;
  thicknessPx: number;
  angleRad: number;
}> = ({ cx, cy, lengthPx, thicknessPx, angleRad }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (lengthPx < 1 || thicknessPx < 1) return null;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const ux = cosA, uy = sinA;
  const vx = -sinA, vy = cosA;

  const COUNT = Math.max(40, Math.round((lengthPx * thicknessPx) / 80));
  const BASE_PERIOD = 2000;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const phase = ((tick / period) + offset) % 1;
    const u = (rand(i, 3) - 0.5) * lengthPx;
    const v = (rand(i, 4) - 0.5) * thicknessPx;
    const x = cx + u * ux + v * vx;
    const y = cy + u * uy + v * vy;
    const fade = phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8;
    const opacity = Math.max(0, fade) * (0.35 + rand(i, 5) * 0.35);
    const size = 1.0 + rand(i, 6) * 1.6;
    const shade = rand(i, 7);
    const fill = shade > 0.7 ? '#ede9fe' : shade > 0.4 ? '#c4b5fd' : '#a78bfa';
    particles.push(
      <Circle
        key={`fcx${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#a78bfa"
        shadowBlur={size * 2}
        shadowOpacity={0.7}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Stone-dust motes drifting lazily inside a Passwall passage.
 * Brown/tan palette to evoke a freshly opened tunnel through stone.
 */
const PasswallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 60;
  const BASE_PERIOD = 2600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 1.0);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    // Drift along the long axis of the passage (rather than perpendicular)
    const drift = wallLen * (0.2 + rand(i, 4) * 0.4);
    // Stay within the passage thickness
    const lateral = (rand(i, 5) - 0.5) * wallLen * 0.06;
    const sizeMul = 0.4 + rand(i, 6) * 0.9;
    const dirSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const baseAlong = tAlong * wallLen;
    const along = baseAlong + dirSign * phase * drift;
    const x = p0.x + wallDirX * along + normalX * lateral;
    const y = p0.y + wallDirY * along + normalY * lateral;

    const fadeIn = 0.1 + rand(i, 7) * 0.12;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.3 + rand(i, 8) * 0.35);
    const size = Math.max(0.5, 1.6 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d6c4a8' : shade > 0.4 ? '#a88c66' : shade > 0.18 ? '#7a5e3e' : '#5a4226';

    particles.push(
      <Circle
        key={`pwp${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Blade shards spinning along both faces of Blade Barrier.
 * Metallic silver palette, square/diamond shapes to evoke whirling steel.
 */
const BladeBarrierParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 130;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.16);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.025;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.06 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 8) * 0.4);
    const size = Math.max(0.6, 2.4 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.75 ? '#ffffff' : shade > 0.45 ? '#e2e8f0' : shade > 0.2 ? '#94a3b8' : '#64748b';
    const rotation = (rand(i, 10) * 360 + tick * (0.4 + rand(i, 12) * 0.6)) % 360;

    particles.push(
      <RegularPolygon
        key={`bbp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#cbd5e1"
        shadowBlur={size * 2.2}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Blade shards for Blade Barrier (Ring). Emits from the ring circumference
 * radially both inward and outward with a metallic silver palette.
 */
const BladeBarrierRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 140;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.08 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.4 + rand(i, 6) * 0.95;
    const dir = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.06 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 8) * 0.4);
    const size = Math.max(0.6, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.75 ? '#ffffff' : shade > 0.45 ? '#e2e8f0' : shade > 0.2 ? '#94a3b8' : '#64748b';
    const rotation = (rand(i, 10) * 360 + tick * (0.4 + rand(i, 12) * 0.6)) % 360;

    particles.push(
      <RegularPolygon
        key={`bbrp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#cbd5e1"
        shadowBlur={size * 2.2}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles for Wall of Fire (Ring). Emits from the ring circumference
 * radially inward or outward depending on hotSide.
 */
const WallOfFireRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
  hotSide: 'inside' | 'outside';
}> = ({ cx, cy, radiusPx, hotSide }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1300;
  const dir = hotSide === 'outside' ? 1 : -1;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.12 + rand(i, 4) * 0.22);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfrp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Dr. Strange–style particle ring for Fireball. Particles orbit the AoE
 * perimeter clockwise, drifting outward with a small trail and fading.
 * Cheap: one RAF loop, pure trig — no per-particle state.
 */
const FireballParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Deterministic hash-based pseudo-random in [0,1) so each particle keeps
  // its own stable "personality" across frames without any state.
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 120;
  const BASE_PERIOD = 1600;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const inward = rand(i, 11) < 0.38; // ~38% of particles spiral inward
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.45 + rand(i, 3) * 0.9);
    const drift = radius * (0.04 + rand(i, 4) * 0.22);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.04;
    const sizeMul = 0.35 + rand(i, 7) * 0.9;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    // Inward particles start at ring and travel toward center; outward drift away
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.55 + rand(i, 12) * 0.35))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.008 * sizeMul * (1 - phase * 0.4));
    const warm = rand(i, 10);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`p${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.8}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire-damage spells whose AoE shape should render with the same Fireball-style
 * ember/particle treatment. Centralized so it can be reused across the placed
 * preview, the remote echo, and persisted markers.
 */
const FIRE_SPELLS_SPHERE = new Set<string>([
  'Fireball',
  'Flaming Sphere',
  'Delayed Blast Fireball',
  'Incendiary Cloud',
  'Meteor Swarm',
  'Flame Strike',
]);
const FIRE_SPELLS_CONE = new Set<string>([
  'Burning Hands',
]);
const FIRE_SPELLS_LINE = new Set<string>([
  "Aganazzar's Scorcher",
  'Investiture of Flame',
]);
const FIRE_SPELLS_CUBE = new Set<string>([
  'Fire Storm',
]);
const isFireSphereSpell = (n?: string) => !!n && FIRE_SPELLS_SPHERE.has(n);
const isFireConeSpell = (n?: string) => !!n && FIRE_SPELLS_CONE.has(n);
const isFireLineSpell = (n?: string) => !!n && FIRE_SPELLS_LINE.has(n);
const isFireCubeSpell = (n?: string) => !!n && FIRE_SPELLS_CUBE.has(n);

/**
 * Fire particles filling a cone (Burning Hands). Cone is rendered in a local
 * frame where +x is forward; halfAngle bounds it on each side. Particles flow
 * from the apex outward, wobbling slightly, and fade near the far edge.
 */
const FireConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 110;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.08 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.003 + rand(i, 5) * 0.005;
    const sizeMul = 0.35 + rand(i, 6) * 0.95;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.78;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.012 * sizeMul * (1 - phase * 0.35));
    const warm = rand(i, 8);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`fc${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#ff5a00" shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles streaming along a line spell (Aganazzar's Scorcher,
 * Investiture of Flame). Particles flow from origin to far end, wobbling.
 */
const FireLineParticles: React.FC<{ length: number; width: number }> = ({ length, width }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 1000;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.85;
    const waveAmp = width * (0.06 + rand(i, 4) * 0.14);
    const waveFreq = 0.003 + rand(i, 5) * 0.005;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.5);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.012 * sizeMul);
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`fl${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#ff5a00" shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles raining within a square footprint (Fire Storm). Particles
 * appear at random points across the cube and rise upward briefly before
 * fading — evokes burning columns of flame across the area.
 */
const FireCubeParticles: React.FC<{ size: number }> = ({ size }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 160;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];
  const half = size / 2;
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const cx = (rand(i, 3) - 0.5) * size * 0.96;
    const cy = (rand(i, 4) - 0.5) * size * 0.96;
    const rise = size * (0.06 + rand(i, 5) * 0.12);
    const sizeMul = 0.4 + rand(i, 6) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = cx;
    const y = cy - phase * rise;

    const fadeIn = 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 7) * 0.45);
    const sizePx = Math.max(0.5, size * 0.008 * sizeMul * (1 - phase * 0.4));
    const warm = rand(i, 8);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    // Clamp inside the cube to avoid bleed outside the footprint
    if (Math.abs(x) > half || Math.abs(y) > half) continue;

    particles.push(
      <Circle
        key={`fb${i}`}
        x={x} y={y} radius={sizePx} fill={fill}
        shadowColor="#ff5a00" shadowBlur={sizePx * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice/cold AoE spell sets for sphere/cylinder shapes (Ice Knife, Snilloc's
 * Snowball Swarm, Otiluke's Freezing Sphere, Ice Storm, Sleet Storm) and cone
 * shapes (Cone of Cold, Investiture of Ice). Wind sets cover cone (Investiture
 * of Wind) and line (Gust of Wind) shapes.
 */
const ICE_SPELLS_SPHERE = new Set<string>([
  'Ice Knife',
  "Snilloc's Snowball Swarm",
  "Otiluke's Freezing Sphere",
  'Ice Storm',
  'Sleet Storm',
]);
const ICE_SPELLS_CONE = new Set<string>([
  'Cone of Cold',
  'Investiture of Ice',
]);
const WIND_SPELLS_CONE = new Set<string>([
  'Investiture of Wind',
]);
const WIND_SPELLS_LINE = new Set<string>([
  'Gust of Wind',
]);
const isIceSphereSpell = (n?: string) => !!n && ICE_SPELLS_SPHERE.has(n);
const isIceConeSpell = (n?: string) => !!n && ICE_SPELLS_CONE.has(n);
const isWindConeSpell = (n?: string) => !!n && WIND_SPELLS_CONE.has(n);
const isWindLineSpell = (n?: string) => !!n && WIND_SPELLS_LINE.has(n);

/**
 * Ice shards drifting around a sphere/cylinder AoE. Mirrors FireballParticles'
 * structure but uses light blue/white triangular shards with cold glow.
 */
const IceSphereParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 110;
  const BASE_PERIOD = 2000;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const inward = rand(i, 11) < 0.32;
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.3 + rand(i, 3) * 0.7);
    const drift = radius * (0.05 + rand(i, 4) * 0.2);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.05;
    const sizeMul = 0.4 + rand(i, 7) * 0.95;
    const rotation = rand(i, 13) * 360;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.45 + rand(i, 12) * 0.4))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.009 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 10);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';

    particles.push(
      <RegularPolygon
        key={`isp${i}`}
        x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
        shadowColor="#a7d8ff" shadowBlur={size * 3} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice shards spreading outward through a cone (Cone of Cold, Investiture of
 * Ice). Mirrors FireConeParticles but with cold tones and triangular shards.
 */
const IceConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.95);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.06 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.0025 + rand(i, 5) * 0.004;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const rotation = rand(i, 11) * 360;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.8;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.014 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';

    particles.push(
      <RegularPolygon
        key={`icc${i}`}
        x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
        shadowColor="#a7d8ff" shadowBlur={size * 3} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Wind streaks fanning through a cone (Investiture of Wind). Gray tones,
 * mirrors GustOfWindParticles but distributed within a cone wedge.
 */
const WindConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 950;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.1 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.003 + rand(i, 5) * 0.005;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.4 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.01 * sizeMul);
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';

    particles.push(
      <Circle
        key={`wcc${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#aaaaaa" shadowBlur={size * 2.5} shadowOpacity={0.6}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Poison/Acid/Necrotic AoE spell sets. Shapes covered:
 *   - Poison sphere: Cloudkill, Stinking Cloud (sickly green wisps)
 *   - Acid sphere/line: Acid Splash, Vitriolic Sphere, Tasha's Caustic Brew
 *   - Necrotic sphere/cone: Circle of Death, Abi-Dalzim's Horrid Wilting
 */
const POISON_SPELLS_SPHERE = new Set<string>([
  'Cloudkill',
  'Stinking Cloud',
]);
const ACID_SPELLS_SPHERE = new Set<string>([
  'Acid Splash',
  'Vitriolic Sphere',
]);
const ACID_SPELLS_LINE = new Set<string>([
  "Tasha's Caustic Brew",
]);
const NECROTIC_SPELLS_SPHERE = new Set<string>([
  'Circle of Death',
]);
const NECROTIC_SPELLS_CONE = new Set<string>([
  "Abi-Dalzim's Horrid Wilting",
]);
const isPoisonSphereSpell = (n?: string) => !!n && POISON_SPELLS_SPHERE.has(n);
const isAcidSphereSpell = (n?: string) => !!n && ACID_SPELLS_SPHERE.has(n);
const isAcidLineSpell = (n?: string) => !!n && ACID_SPELLS_LINE.has(n);
const isNecroticSphereSpell = (n?: string) => !!n && NECROTIC_SPELLS_SPHERE.has(n);
const isNecroticConeSpell = (n?: string) => !!n && NECROTIC_SPELLS_CONE.has(n);

/** Generic radial-AoE particle component, parameterized by palette/glow. */
const RadialAoEParticles: React.FC<{
  radius: number;
  count?: number;
  basePeriod?: number;
  inwardChance?: number;
  palette: [string, string, string];
  glow: string;
  shape?: 'circle' | 'triangle';
}> = ({ radius, count = 110, basePeriod = 1700, inwardChance = 0.35, palette, glow, shape = 'circle' }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    const inward = rand(i, 11) < inwardChance;
    const period = basePeriod * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.3 + rand(i, 3) * 0.7);
    const drift = radius * (0.05 + rand(i, 4) * 0.22);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.05;
    const sizeMul = 0.4 + rand(i, 7) * 0.95;
    const rotation = rand(i, 13) * 360;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.45 + rand(i, 12) * 0.4))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.009 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 10);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    if (shape === 'triangle') {
      particles.push(
        <RegularPolygon
          key={`rp${i}`}
          x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
          shadowColor={glow} shadowBlur={size * 3} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    } else {
      particles.push(
        <Circle
          key={`rp${i}`}
          x={x} y={y} radius={size} fill={fill}
          shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

/** Generic cone particle component, parameterized by palette/glow. */
const ConeAoEParticles: React.FC<{
  length: number;
  halfAngle: number;
  count?: number;
  basePeriod?: number;
  palette: [string, string, string];
  glow: string;
  shape?: 'circle' | 'triangle';
}> = ({ length, halfAngle, count = 120, basePeriod = 1300, palette, glow, shape = 'circle' }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    const period = basePeriod * (0.55 + rand(i, 1) * 0.95);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.07 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.0025 + rand(i, 5) * 0.005;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const rotation = rand(i, 11) * 360;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.8;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.013 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    if (shape === 'triangle') {
      particles.push(
        <RegularPolygon
          key={`rcp${i}`}
          x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
          shadowColor={glow} shadowBlur={size * 3} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    } else {
      particles.push(
        <Circle
          key={`rcp${i}`}
          x={x} y={y} radius={size} fill={fill}
          shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

/** Generic line particle component, parameterized by palette/glow. */
const LineAoEParticles: React.FC<{
  length: number;
  width: number;
  palette: [string, string, string];
  glow: string;
}> = ({ length, width, palette, glow }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const COUNT = 130;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.85;
    const waveAmp = width * (0.06 + rand(i, 4) * 0.14);
    const waveFreq = 0.003 + rand(i, 5) * 0.005;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.5);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.012 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    particles.push(
      <Circle
        key={`rl${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/** Generic cube particle component (rising motes within a square footprint). */
const CubeAoEParticles: React.FC<{
  size: number;
  palette: [string, string, string];
  glow: string;
  count?: number;
  basePeriod?: number;
}> = ({ size, palette, glow, count = 150, basePeriod = 1300 }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  const half = size / 2;
  for (let i = 0; i < count; i++) {
    const period = basePeriod * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const cx = (rand(i, 3) - 0.5) * size * 0.96;
    const cy = (rand(i, 4) - 0.5) * size * 0.96;
    const rise = size * (0.06 + rand(i, 5) * 0.12);
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const phase = ((tick / period) + offset) % 1;
    const x = cx;
    const y = cy - phase * rise;
    const fadeIn = 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 7) * 0.45);
    const sizePx = Math.max(0.5, size * 0.008 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];
    if (Math.abs(x) > half || Math.abs(y) > half) continue;
    particles.push(
      <Circle
        key={`cb${i}`}
        x={x} y={y} radius={sizePx} fill={fill}
        shadowColor={glow} shadowBlur={sizePx * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

const POISON_PALETTE: [string, string, string] = ['#bef264', '#65a30d', '#365314'];
const ACID_PALETTE:   [string, string, string] = ['#ecfccb', '#a3e635', '#65a30d'];
const NECROTIC_PALETTE: [string, string, string] = ['#d8b4fe', '#7e22ce', '#1e1b2e'];

const POISON_GRADIENT = [0, 'rgba(132,204,22,0.45)', 0.5, 'rgba(101,163,13,0.30)', 0.85, 'rgba(54,83,20,0.15)', 1, 'rgba(20,40,10,0)'] as any;
const ACID_GRADIENT   = [0, 'rgba(236,252,203,0.50)', 0.5, 'rgba(163,230,53,0.34)', 0.85, 'rgba(101,163,13,0.16)', 1, 'rgba(60,100,10,0)'] as any;
const NECROTIC_GRADIENT = [0, 'rgba(168,85,247,0.45)', 0.5, 'rgba(126,34,206,0.30)', 0.85, 'rgba(60,20,90,0.16)', 1, 'rgba(20,8,40,0)'] as any;

/**
 * Remaining elemental damage types (Lightning, Thunder, Radiant, Psychic,
 * Force) routed through a single style table. Each entry provides palette,
 * glow color, radial gradient, and tuning for the generic particle components.
 */
type ElementKey = 'lightning' | 'thunder' | 'radiant' | 'psychic' | 'force';
const ELEMENT_STYLES: Record<ElementKey, {
  palette: [string, string, string];
  glow: string;
  gradient: any;
  basePeriod: number;
  inwardChance: number;
  shape: 'circle' | 'triangle';
}> = {
  lightning: {
    palette: ['#fef9c3', '#fde047', '#60a5fa'],
    glow: '#facc15',
    gradient: [0, 'rgba(254,240,138,0.55)', 0.45, 'rgba(250,204,21,0.34)', 0.85, 'rgba(96,165,250,0.16)', 1, 'rgba(30,60,180,0)'],
    basePeriod: 850,
    inwardChance: 0.35,
    shape: 'circle',
  },
  thunder: {
    palette: ['#ffffff', '#a5f3fc', '#0ea5e9'],
    glow: '#67e8f9',
    gradient: [0, 'rgba(224,250,255,0.55)', 0.5, 'rgba(165,243,252,0.32)', 0.85, 'rgba(14,165,233,0.16)', 1, 'rgba(8,80,150,0)'],
    basePeriod: 1300,
    inwardChance: 0.25,
    shape: 'circle',
  },
  radiant: {
    palette: ['#fffbeb', '#fde047', '#eab308'],
    glow: '#facc15',
    gradient: [0, 'rgba(255,251,235,0.65)', 0.45, 'rgba(253,224,71,0.40)', 0.85, 'rgba(234,179,8,0.18)', 1, 'rgba(140,100,8,0)'],
    basePeriod: 1900,
    inwardChance: 0.2,
    shape: 'circle',
  },
  psychic: {
    palette: ['#fbcfe8', '#e879f9', '#7e22ce'],
    glow: '#d946ef',
    gradient: [0, 'rgba(232,121,249,0.45)', 0.5, 'rgba(126,34,206,0.30)', 0.85, 'rgba(60,20,90,0.16)', 1, 'rgba(20,8,40,0)'],
    basePeriod: 2100,
    inwardChance: 0.55,
    shape: 'triangle',
  },
  force: {
    palette: ['#dbeafe', '#93c5fd', '#3b82f6'],
    glow: '#60a5fa',
    gradient: [0, 'rgba(219,234,254,0.55)', 0.5, 'rgba(147,197,253,0.32)', 0.85, 'rgba(59,130,246,0.16)', 1, 'rgba(20,40,120,0)'],
    basePeriod: 1500,
    inwardChance: 0.4,
    shape: 'circle',
  },
};

const SPHERE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Call Lightning': 'lightning',
  'Lightning Arrow': 'lightning',
  'Lightning Lure': 'lightning',
  'Shatter': 'thunder',
  'Storm of Vengeance': 'thunder',
  'Sunburst': 'radiant',
  'Sickening Radiance': 'radiant',
  'Moonbeam': 'radiant',
  'Dawn': 'radiant',
  "Jallarzi's Storm of Radiance": 'radiant',
  'Conjure Celestial': 'radiant',
  'Synaptic Static': 'psychic',
  'Weird': 'psychic',
  'Sword Burst': 'force',
  'Conjure Volley': 'force',
};
const CONE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Conjure Barrage': 'force',
};
const LINE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Lightning Bolt': 'lightning',
  'Sunbeam': 'radiant',
};
const CUBE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Thunderwave': 'thunder',
};
const getSphereElement = (n?: string) => (n && SPHERE_ELEMENT_MAP[n]) || null;
const getConeElement = (n?: string) => (n && CONE_ELEMENT_MAP[n]) || null;
const getLineElement = (n?: string) => (n && LINE_ELEMENT_MAP[n]) || null;
const getCubeElement = (n?: string) => (n && CUBE_ELEMENT_MAP[n]) || null;

/**
 * Wind particles streaming along a line for Gust of Wind. Particles flow
 * from origin to far end with mild perpendicular wave, in gray tones.
 * One RAF loop, pure trig — no per-particle state.
 */
const GustOfWindParticles: React.FC<{ length: number; width: number }> = ({ length, width }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 140;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.92;
    const waveAmp = width * (0.05 + rand(i, 4) * 0.12);
    const waveFreq = 0.0025 + rand(i, 5) * 0.004;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.4 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.01 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';

    particles.push(
      <Circle
        key={`g${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#aaaaaa"
        shadowBlur={size * 2.5}
        shadowOpacity={0.6}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
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
}) => {
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
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
    view: 'root' | 'note' | 'viewpoint' | 'add-player' | 'add-enemy' | 'add-npc' | 'spell-marker',
    viewpointId?: string,
    markerId?: string,
  } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'player' | 'npc' | null>(null);
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, tokenId: string } | null>(null);
  const [portalContextMenu, setPortalContextMenu] = useState<{ screenX: number, screenY: number, portalId: string, portalType: 'door' | 'window' | 'secret', locked: boolean } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string, imageData?: string }>({ type: 'quote', content: '' });
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [viewpointDraft, setViewpointDraft] = useState<{ zoomPercent: number }>({ zoomPercent: 25 });
  const [activeViewpointId, setActiveViewpointId] = useState<string | null>(null);
  const viewpointReturnRef = useRef<{ scale: number; x: number; y: number } | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  const [viewpointContextMenu, setViewpointContextMenu] = useState<{ screenX: number; screenY: number; viewpointId: string } | null>(null);
  const [zoneContextMenu, setZoneContextMenu] = useState<{ screenX: number; screenY: number; zoneId: string } | null>(null);
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
    summonData?: { creatureName: string; spellName: string; casterId: string; playerColor: string; size?: import('../types').Token['size']; avatar?: string; illusory?: boolean };
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
    const enemyTokens = tokens.filter(t => t.type === 'enemy' || t.type === 'npc');
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
      case 'quote': return '#60a5fa';
      case 'treasure': return '#CD7F32';
      case 'warning': return '#ef4444';
      case 'magic': return '#22d3ee';
      case 'poison': return '#4ade80';
      case 'image': return '#a78bfa';
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
              <Path data="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 7 20v1a1 1 0 0 0 1 1z" {...{ ...sp, stroke: '#4ade80', fill: '' }} />
              <Path data="m12.5 17-.5-1-.5 1h1z" {...{ ...sp, stroke: '#4ade80', fill: '#4ade80' }} />
              <Path data="M9.5 14.5 9 15" {...{ ...sp, stroke: '#4ade80' }} />
              <Path data="m14.5 14.5.5.5" {...{ ...sp, stroke: '#4ade80' }} />
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
        // Defer scale/position calculation to the next animation frame so the
        // ResizeObserver has had a chance to fire and dimensionsRef is current.
        requestAnimationFrame(() => {
          const dims = dimensionsRef.current;
          if (dims.width > 0 && dims.height > 0) {
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
                (dims.width - padding) / img.width,
                (dims.height - padding) / img.height,
                1
              );
            }

            const clampedScale = Math.min(Math.max(scale, 0.05), 5);
            const finalScale = isPlayerView ? clampedScale * 1.15 : clampedScale;
            setStageScale(finalScale);
            if (isPlayerView && viewportCenter) {
              // Center the player's view on the same map-space point the DM is looking at
              setStagePos({
                x: dims.width / 2 - viewportCenter.x * finalScale,
                y: dims.height / 2 - viewportCenter.y * finalScale,
              });
            } else {
              setStagePos({
                x: (dims.width - img.width * finalScale) / 2,
                y: (dims.height - img.height * finalScale) / 2,
              });
            }
          }
        });
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
    const dims = dimensionsRef.current;
    if (isPlayerView && viewportCenter && stageScale > 0 && dims.width > 0 && !activeViewpointId) {
      const prev = lastAppliedViewportRef.current;
      if (prev && prev.x === viewportCenter.x && prev.y === viewportCenter.y) return;
      lastAppliedViewportRef.current = { x: viewportCenter.x, y: viewportCenter.y };
      setStagePos({
        x: dims.width / 2 - viewportCenter.x * stageScale,
        y: dims.height / 2 - viewportCenter.y * stageScale,
      });
    }
  }, [viewportCenter]); // eslint-disable-line react-hooks/exhaustive-deps

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
      stageX: e.evt.clientX,
      stageY: e.evt.clientY,
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
      };
      onTokensChange([...tokens, newToken]);
    }
    setContextMenu(null);
  };

  const saveNote = () => {
    if (!contextMenu) return;
    if (noteDraft.type === 'image') {
      if (!noteDraft.imageData) return;
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
    };

    onMapNotesChange([...mapNotes, newNote]);
    setContextMenu(null);
    setNoteDraft({ type: 'treasure', content: '' });
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
        const newToken: Token = {
          id: Math.random().toString(36).substr(2, 9),
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
          ...(sd.avatar ? { avatar: sd.avatar } : {}),
          ...(sd.illusory ? { illusory: true } : {}),
        };
        const updatedTokens = [...tokens, newToken];
        onTokensChange(updatedTokens);
        if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
          window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
        }
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
        const newToken: Token = {
          id: Math.random().toString(36).substr(2, 9),
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
          ...(sd.avatar ? { avatar: sd.avatar } : {}),
          ...(sd.illusory ? { illusory: true } : {}),
        };
        const updatedTokens = [...tokens, newToken];
        onTokensChange(updatedTokens);
        if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
          window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
        } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
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
        const pos = getCanvasPos(e.target.getStage());
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
              {floors && floors.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setIsFloorMenuOpen(!isFloorMenuOpen)}
                    className="btn-ghost py-1 px-3 flex items-center gap-2"
                  >
                    <Layers size={12} />
                    {floors.find(f => f.id === activeFloorId)?.name ?? 'Floor'}
                    <ChevronDown size={12} className={cn("transition-transform", isFloorMenuOpen && "rotate-180")} />
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
              setZoneContextMenu(null);
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
                        const stage = e.target.getStage();
                        const ptr = stage?.getPointerPosition();
                        const rect = containerRef.current?.getBoundingClientRect();
                        if (ptr && rect) {
                          setZoneContextMenu({
                            screenX: rect.left + ptr.x,
                            screenY: rect.top + ptr.y,
                            zoneId: zone.id,
                          });
                        }
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
                          radius={14}
                          fill="rgba(0,0,0,0.55)"
                          listening={false}
                        />
                        <Text
                          x={zone.rect.x + zone.rect.width / 2 - 7}
                          y={zone.rect.y + zone.rect.height / 2 - 7}
                          text="🔒"
                          fontSize={14}
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
                  onClick={(e) => { e.cancelBubble = true; if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                  onTap={(e) => { e.cancelBubble = true; if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
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
                        playerSides?.[token.combatantId ?? ''] === 'top' ? 180 :
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
                    <>
                      <Circle
                        x={cx}
                        y={cy}
                        radius={sizePx}
                        fill={isFireSphereSpell(placedAoe.name) || isIceSphereSpell(placedAoe.name) || isPoisonSphereSpell(placedAoe.name) || isAcidSphereSpell(placedAoe.name) || isNecroticSphereSpell(placedAoe.name) || getSphereElement(placedAoe.name) ? 'transparent' : fillColor}
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
              <>
              <Layer listening={false}>
                {(remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
                  const cx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
                  const cy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
                  return (
                    <>
                      <Circle
                        x={cx}
                        y={cy}
                        radius={sizePx}
                        fill={isFireSphereSpell(remoteAoe.name) || isIceSphereSpell(remoteAoe.name) || isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name) || getSphereElement(remoteAoe.name) ? 'transparent' : fillColor}
                        stroke={strokeColor} strokeWidth={strokeW}
                        dash={[6 / stageScale, 4 / stageScale]}
                      />
                      {isIceSphereSpell(remoteAoe.name) && (
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
                      {(isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name)) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={isNecroticSphereSpell(remoteAoe.name) ? NECROTIC_GRADIENT : isAcidSphereSpell(remoteAoe.name) ? ACID_GRADIENT : POISON_GRADIENT}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {getSphereElement(remoteAoe.name) && (
                        <Circle
                          x={cx}
                          y={cy}
                          radius={sizePx}
                          fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                          fillRadialGradientStartRadius={0}
                          fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                          fillRadialGradientEndRadius={sizePx}
                          fillRadialGradientColorStops={ELEMENT_STYLES[getSphereElement(remoteAoe.name)!].gradient}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                      )}
                      {isFireSphereSpell(remoteAoe.name) && (
                        <>
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
                        </>
                      )}
                    </>
                  );
                })()}
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
              {isFireSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
                const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
                const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
                return (
                  <Layer listening={false}>
                    <Group x={rcx} y={rcy}>
                      <FireballParticles radius={sizePx} />
                    </Group>
                  </Layer>
                );
              })()}
              {isFireConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <FireConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {isFireLineSpell(remoteAoe.name) && remoteAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <FireLineParticles length={sizePx} width={feetToPx(5)} />
                  </Group>
                </Layer>
              )}
              {isFireCubeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cube' && (
                <Layer listening={false}>
                  {remoteAoe.selfOrigin ? (
                    <Group
                      x={edgeX + Math.cos(aRad) * sizePx / 2}
                      y={edgeY + Math.sin(aRad) * sizePx / 2}
                    >
                      <FireCubeParticles size={sizePx} />
                    </Group>
                  ) : (
                    <Group x={remoteAoe.x} y={remoteAoe.y}>
                      <FireCubeParticles size={sizePx} />
                    </Group>
                  )}
                </Layer>
              )}
              {isIceSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
                const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
                const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
                return (
                  <Layer listening={false}>
                    <Group x={rcx} y={rcy}>
                      <IceSphereParticles radius={sizePx} />
                    </Group>
                  </Layer>
                );
              })()}
              {isIceConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <IceConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {isWindConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <WindConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
                  </Group>
                </Layer>
              )}
              {(isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name)) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
                const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
                const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
                const palette = isNecroticSphereSpell(remoteAoe.name) ? NECROTIC_PALETTE : isAcidSphereSpell(remoteAoe.name) ? ACID_PALETTE : POISON_PALETTE;
                const glow = isNecroticSphereSpell(remoteAoe.name) ? '#7e22ce' : isAcidSphereSpell(remoteAoe.name) ? '#a3e635' : '#65a30d';
                const shape: 'circle' | 'triangle' = isNecroticSphereSpell(remoteAoe.name) ? 'triangle' : 'circle';
                return (
                  <Layer listening={false}>
                    <Group x={rcx} y={rcy}>
                      <RadialAoEParticles radius={sizePx} palette={palette} glow={glow} shape={shape} />
                    </Group>
                  </Layer>
                );
              })()}
              {isAcidLineSpell(remoteAoe.name) && remoteAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={ACID_PALETTE} glow="#a3e635" />
                  </Group>
                </Layer>
              )}
              {isNecroticConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
                <Layer listening={false}>
                  <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                    <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={NECROTIC_PALETTE} glow="#7e22ce" shape="triangle" />
                  </Group>
                </Layer>
              )}
              {getSphereElement(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
                const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
                const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
                const s = ELEMENT_STYLES[getSphereElement(remoteAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={rcx} y={rcy}>
                      <RadialAoEParticles radius={sizePx} palette={s.palette} glow={s.glow} basePeriod={s.basePeriod} inwardChance={s.inwardChance} shape={s.shape} />
                    </Group>
                  </Layer>
                );
              })()}
              {getConeElement(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (() => {
                const s = ELEMENT_STYLES[getConeElement(remoteAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                      <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={s.palette} glow={s.glow} shape={s.shape} />
                    </Group>
                  </Layer>
                );
              })()}
              {getLineElement(remoteAoe.name) && remoteAoe.aoeType === 'line' && (() => {
                const s = ELEMENT_STYLES[getLineElement(remoteAoe.name)!];
                return (
                  <Layer listening={false}>
                    <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
                      <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={s.palette} glow={s.glow} />
                    </Group>
                  </Layer>
                );
              })()}
              {getCubeElement(remoteAoe.name) && remoteAoe.aoeType === 'cube' && (() => {
                const s = ELEMENT_STYLES[getCubeElement(remoteAoe.name)!];
                const groupX = remoteAoe.selfOrigin ? edgeX + Math.cos(aRad) * sizePx / 2 : remoteAoe.x;
                const groupY = remoteAoe.selfOrigin ? edgeY + Math.sin(aRad) * sizePx / 2 : remoteAoe.y;
                return (
                  <Layer listening={false}>
                    <Group x={groupX} y={groupY}>
                      <CubeAoEParticles size={sizePx} palette={s.palette} glow={s.glow} />
                    </Group>
                  </Layer>
                );
              })()}
              {remoteAoe.name === 'Gust of Wind' && remoteAoe.aoeType === 'line' && (
                <Layer listening={false}>
                  <Group
                    x={edgeX}
                    y={edgeY}
                    rotation={(aRad * 180) / Math.PI}
                  >
                    <GustOfWindParticles length={sizePx} width={feetToPx(5)} />
                  </Group>
                </Layer>
              )}
            </>
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
                    onClick={(e) => { e.cancelBubble = true; setPortalContextMenu(null); if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
                    onTap={(e) => { e.cancelBubble = true; }}
                    onTouchStart={(e) => { e.cancelBubble = true; }}
                    onTouchEnd={(e) => { e.cancelBubble = true; setPortalContextMenu(null); if (isPlayerView && portal.locked) return; onPortalToggle?.(portal.id); }}
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
                      stroke="rgba(74,222,128,0.6)"
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

            // Find enemy/NPC tokens within range that are NOT visible
            const sensedTokens = tokens.filter(t => {
              if (t.type === 'player') return false;
              const pos = livePlayerPos[t.id] ?? t;
              const dx = pos.x - casterPos.x;
              const dy = pos.y - casterPos.y;
              if (Math.sqrt(dx * dx + dy * dy) > rangePx) return false;
              // Only show tremorsense circle if the token is NOT already visible
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

          {/* ── Active emanation rings (player view only) ── */}
          {isPlayerView && activeEmanations.map(em => {
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
                    <Group rotation={playerSides?.[token.combatantId ?? ''] === 'top' ? 180 : 0} listening={false}>
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
                          playerSides?.[token.combatantId ?? ''] === 'top' ? 180 :
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
                      const pos = e.target.getStage()?.getPointerPosition();
                      setContextMenu({
                        x: marker.x, y: marker.y,
                        stageX: pos?.x ?? e.evt.clientX,
                        stageY: pos?.y ?? e.evt.clientY,
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

          {/* ── Wall of Fire particle layer — isolated so RAF redraws don't dirty other layers ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Fire' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Fire' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 10, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfFireParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wind Wall particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wind Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wind Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WindWallParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Light particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Light' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Light' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfLightParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Sand particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Sand' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Sand' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfSandParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Fire Ring particle layer ── */}
          {spellMarkers.some(m => (m.shapeType === 'ring' || m.spellName === 'Wall of Fire (Ring)') && m.spellName !== 'Wall of Ice (Dome)' && m.spellName !== 'Wall of Force (Dome)' && m.spellName !== 'Wall of Thorns (Ring)' && m.spellName !== 'Blade Barrier (Ring)' && m.spellName !== 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => (m.shapeType === 'ring' || m.spellName === 'Wall of Fire (Ring)') && m.spellName !== 'Wall of Ice (Dome)' && m.spellName !== 'Wall of Force (Dome)' && m.spellName !== 'Wall of Thorns (Ring)' && m.spellName !== 'Blade Barrier (Ring)' && m.spellName !== 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <WallOfFireRingParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
                    hotSide={m.hotSide ?? 'outside'}
                  />
                ))}
            </Layer>
          )}

          {/* ── Wall of Ice particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Ice' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Ice' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfIceParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Ice Dome particle layer ── */}
          {spellMarkers.some(m => m.spellName === 'Wall of Ice (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Wall of Ice (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <WallOfIceDomeParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
                  />
                ))}
            </Layer>
          )}

          {/* ── Wall of Force particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Force' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Force' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfForceParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Force Dome particle layer ── */}
          {spellMarkers.some(m => m.spellName === 'Wall of Force (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Wall of Force (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <WallOfForceDomeParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
                  />
                ))}
            </Layer>
          )}

          {/* ── Prismatic Wall particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Prismatic Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Prismatic Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 90, m.thickness ?? 1, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <PrismaticWallParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Thorns particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Thorns' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Thorns' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 60, m.thickness ?? 5, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <WallOfThornsParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Wall of Thorns Ring particle layer ── */}
          {spellMarkers.some(m => m.spellName === 'Wall of Thorns (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Wall of Thorns (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <WallOfThornsRingParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
                  />
                ))}
            </Layer>
          )}

          {/* ── Hallow particle layer ── */}
          {spellMarkers.some(m => m.spellName === 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <HallowParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 30) / 5) * ppg}
                  />
                ))}
            </Layer>
          )}

          {/* ── Forcecage particle layer (Cage variant — bars) ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Forcecage' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Forcecage' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <ForcecageBarsParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    lengthPx={((m.length ?? 20) / 5) * ppg}
                    thicknessPx={((m.thickness ?? 20) / 5) * ppg}
                    angleRad={(m.angle ?? 0) * Math.PI / 180}
                  />
                ))}
            </Layer>
          )}

          {/* ── Forcecage particle layer (Box variant — solid shimmer) ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Forcecage (Box)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Forcecage (Box)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <ForcecageBoxParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    lengthPx={((m.length ?? 10) / 5) * ppg}
                    thicknessPx={((m.thickness ?? 10) / 5) * ppg}
                    angleRad={(m.angle ?? 0) * Math.PI / 180}
                  />
                ))}
            </Layer>
          )}

          {/* ── Passwall particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Passwall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Passwall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 20, m.thickness ?? 5, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <PasswallParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Blade Barrier particle layer ── */}
          {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Blade Barrier' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.shapeType === 'wall' && m.spellName === 'Blade Barrier' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => {
                  const wCorners = computeWallCorners(m.x, m.y, m.length ?? 100, m.thickness ?? 5, m.angle ?? 0, ppg);
                  const ang = (m.angle ?? 0) * Math.PI / 180;
                  return (
                    <BladeBarrierParticles
                      key={m.id}
                      p0={wCorners[0]}
                      p1={wCorners[1]}
                      normalX={Math.sin(ang)}
                      normalY={-Math.cos(ang)}
                    />
                  );
                })}
            </Layer>
          )}

          {/* ── Blade Barrier Ring particle layer ── */}
          {spellMarkers.some(m => m.spellName === 'Blade Barrier (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
            <Layer listening={false}>
              {spellMarkers
                .filter(m => m.spellName === 'Blade Barrier (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
                .map(m => (
                  <BladeBarrierRingParticles
                    key={m.id}
                    cx={m.x}
                    cy={m.y}
                    radiusPx={((m.aoeSize ?? 30) / 5) * ppg}
                  />
                ))}
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

          {/* ── AoE range line overlay — above tokens so it's never hidden ── */}
          {placedAoe && (() => {
            const ppg2 = gridResolution?.pixelsPerGrid || 40;
            const feetToPx2 = (ft: number) => (ft / 5) * ppg2;
            const sizePx2 = feetToPx2(placedAoe.aoeSize);
            const angleRad2 = placedAoe.angle * (Math.PI / 180);
            const isAnchored2 = placedAoe.aoeType === 'cone' || placedAoe.aoeType === 'line' || !!placedAoe.selfOrigin;
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
        {placingSpell && !pendingMarkerPos && placingSpell.shapeType !== 'wall' && (placingSpell.shapeType as any) !== 'ring' && !(isPlayerView && placingSpell.summonData) && (
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
                onClick={() => { setPlacingSpell(null); setPendingMarkerPos(null); setEditingWall(null); setEditingRing(null); onCastingDismissed?.(); }}
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
              className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 min-w-[160px]"
              style={{ left: portalContextMenu.screenX, top: portalContextMenu.screenY }}
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
                      if (isPlayerView) {
                        window.electronAPI?.sendPlayerTokenUpdate?.(updatedTokens);
                      } else {
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
            className={cn(
              "fixed z-[200] bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl animate-in zoom-in-95 duration-200",
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
                  {(['quote', 'treasure', 'warning', 'magic', 'poison', 'image'] as MapNoteType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoteDraft(prev => ({ ...prev, type, imageData: type === 'image' ? prev.imageData : undefined }))}
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

                {noteDraft.type === 'image' ? (
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
                    className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors min-h-[80px] resize-none mb-3"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveNote();
                      }
                    }}
                  />
                )}

                <button
                  disabled={noteDraft.type === 'image' ? !noteDraft.imageData : !noteDraft.content.trim()}
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
                      if (isPlayerView) {
                        window.electronAPI?.sendPlayerTokenUpdate?.(updatedTokens);
                      } else {
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
          {transitionPopup && (() => {
            const popupToken = tokens.find(t => t.id === transitionPopup.tokenId);
            const popupIsTop = playerSides?.[popupToken?.combatantId ?? ''] === 'top';
            return (
              <motion.div
                initial={{ opacity: 0, y: popupIsTop ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: popupIsTop ? 4 : -4 }}
                className="fixed z-[70]"
                style={{
                  left: transitionPopup.screenX - 90,
                  ...(popupIsTop
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
                                  const col = offsetIndex % 2;
                                  const row = Math.floor(offsetIndex / 2);
                                  offsetIndex++;
                                  return { ...t, floorId: zone.targetFloorId, x: arrivalX + (col - 0.5) * spacing, y: arrivalY + (row - 0.5) * spacing };
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
              className="fixed z-[80] bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 min-w-[160px]"
              style={{ left: zoneContextMenu.screenX, top: zoneContextMenu.screenY }}
              onMouseLeave={() => setZoneContextMenu(null)}
            >
              <button
                onClick={() => {
                  const updated = zones.map(z =>
                    z.id === zone.id ? { ...z, locked: !z.locked } : z
                  );
                  onTransitionZonesChange?.(updated);
                  if (zone.pairedZoneId && zone.targetFloorId) {
                    onUpdateFloorById?.(zone.targetFloorId, (f: Floor) => ({
                      ...f,
                      transitionZones: (f.transitionZones || []).map(z =>
                        z.id === zone.pairedZoneId ? { ...z, locked: !zone.locked } : z
                      ),
                    }));
                  }
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
