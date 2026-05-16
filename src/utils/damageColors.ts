import React from 'react';
import { FlaskConical, Flame, Snowflake, Zap, Skull, Sun, CloudLightning, Bubbles, Atom, Brain } from '../icons';

const DAMAGE_TYPE_PATTERN = /\b(Acid|Cold|Fire|Force|Lightning|Necrotic|Poison|Psychic|Radiant|Thunder|Bludgeoning|Piercing|Slashing)\s+damage/i;

/** Extract the first damage type mentioned in a spell description. */
export function parseDamageType(desc: string): string | null {
  const match = desc.match(DAMAGE_TYPE_PATTERN);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : null;
}

const RGB_MAP: Record<string, string> = {
  fire:         '255, 120, 30',
  cold:         '100, 180, 255',
  lightning:    '255, 255, 60',
  acid:         '80, 220, 50',
  poison:       '140, 180, 40',
  necrotic:     '140, 50, 180',
  radiant:      '255, 230, 120',
  thunder:      '156, 163, 175',
  force:        '200, 80, 255',
  psychic:      '255, 100, 180',
  bludgeoning:  '160, 120, 80',
  piercing:     '180, 180, 200',
  slashing:     '170, 170, 190',
};

const DEFAULT_RGB = '180, 185, 190';

/** Get the base RGB string for a damage type. Callers apply their own alpha. */
export function getDamageRgb(damageType: string | null | undefined): string {
  if (!damageType) return DEFAULT_RGB;
  return RGB_MAP[damageType.toLowerCase()] || DEFAULT_RGB;
}

const DAMAGE_ICON: Record<string, React.FC<{ size?: number }>> = {
  acid:         FlaskConical,
  fire:         Flame,
  cold:         Snowflake,
  lightning:    Zap,
  necrotic:     Skull,
  radiant:      Sun,
  thunder:      CloudLightning,
  poison:       Bubbles,
  force:        Atom,
  psychic:      Brain,
};

/** Small inline badge showing the damage type icon + color. Returns null if no damage type. */
export const DamageTypeBadge: React.FC<{ damageType: string | null | undefined; size?: number }> = ({ damageType, size = 9 }) => {
  if (!damageType) return null;
  const key = damageType.toLowerCase();
  const Icon = DAMAGE_ICON[key];
  const rgb = RGB_MAP[key] || DEFAULT_RGB;
  if (!Icon) return null;
  return React.createElement('span', {
    className: 'inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-bold uppercase tracking-wider',
    style: { fontSize: size, backgroundColor: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` },
  }, React.createElement(Icon, { size: size }), ' ', damageType);
};
