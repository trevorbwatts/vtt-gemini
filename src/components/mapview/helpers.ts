import { Token } from '../../types';

/** Ray-casting point-in-polygon test for a flat [x0,y0,x1,y1,...] vertex array. */
export function pointInFlatPolygon(px: number, py: number, pts: number[]): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1];
    const xj = pts[j * 2], yj = pts[j * 2 + 1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Axis-aligned bounding box of a flat [x0,y0,...] polygon. */
export function polygonBounds(pts: number[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Average of a flat [x0,y0,...] polygon's vertices. */
export function polygonCentroid(pts: number[]): { x: number; y: number } {
  let sx = 0, sy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; }
  return { x: sx / n, y: sy / n };
}

/** Shift-key axis constraint (Illustrator-style): snap `pos` onto the horizontal
 *  or vertical line through the anchor point, whichever the cursor is closer to. */
export function constrainToAxis(
  pos: { x: number; y: number },
  anchorX: number,
  anchorY: number,
): { x: number; y: number } {
  return Math.abs(pos.x - anchorX) >= Math.abs(pos.y - anchorY)
    ? { x: pos.x, y: anchorY }
    : { x: anchorX, y: pos.y };
}

export const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: '#3b82f6',
  Conjuration: '#f59e0b',
  Divination: '#c0c0c0',
  Enchantment: '#ec4899',
  Evocation: '#ef4444',
  Illusion: '#a855f7',
  Necromancy: '#22c55e',
  Transmutation: '#f97316',
};

export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// Per-spell color overrides (take priority over school color)
export const SPELL_COLOR_OVERRIDES: Record<string, string> = {
  'Mage Hand': '#1d4ed8',
  'Arcane Gate (Near)': '#06b6d4',
  'Arcane Gate (Far)': '#0891b2',
};

// Lucide icon SVG inner content (24x24 viewbox) for each spell school.
// Rendered as stroke="white" images on a colored circle background.
export const SCHOOL_ICON_SVGS: Record<string, string> = {
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
export const SPELL_ICON_SVGS: Record<string, string> = {
  'Mage Hand': `<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`,
  'Cordon of Arrows': `<path d="M5 19h14"/><path d="M12 15V5"/><polyline points="8 9 12 5 16 9"/>`,
  'Arcane Gate (Near)': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="21"/>`,
  'Arcane Gate (Far)': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="3" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="21" y2="12"/>`,
};

// Cache for rendered icon HTMLImageElements keyed by SVG content string
export const iconImageCache = new Map<string, HTMLImageElement>();

export function makeIconSvgUrl(svgContent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

/** Returns a cached HTMLImageElement for an icon SVG, or null if not yet loaded. onLoad fires when ready. */
export function getIconImage(svgContent: string, onLoad?: () => void): HTMLImageElement | null {
  if (!svgContent) return null;
  const cached = iconImageCache.get(svgContent);
  if (cached) return cached.complete ? cached : null;
  const img = new window.Image();
  img.onload = () => onLoad?.();
  img.src = makeIconSvgUrl(svgContent);
  iconImageCache.set(svgContent, img);
  return null;
}

export function getSchoolColor(school: string): string {
  return SCHOOL_COLORS[school] || '#a855f7';
}

/**
 * Compute the 4 corner positions (world coordinates) of a wall-shape spell marker.
 * Order: near-left, near-right, far-right, far-left (clockwise when angle=0).
 * `length` and `thickness` are in feet; `ppg` is pixels per grid (5 ft).
 */
export function computeWallCorners(
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

export function getTokenSizeMultiplier(size?: Token['size']): number {
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

export type AoeState = {
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
export function getTokensInAoe(
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
