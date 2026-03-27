import { Monster } from '../types';
import bestiary2014 from './bestiary-2014.json';
import bestiary2024 from './bestiary-2024.json';

function tokenSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '');
}

/** Strip / replace all {@tag ...} template tokens from D&D 5e data format */
function cleanText(text: string): string {
  if (!text) return text;
  return text
    // 2024 attack-roll shorthands at the start of action descriptions
    .replace(/^m ([+-]\d+),/g, 'Melee Attack Roll: $1,')
    .replace(/^r ([+-]\d+),/g, 'Ranged Attack Roll: $1,')
    // Recharge tags in action names
    .replace(/\{@recharge 4\}/g, '(Recharge 4–6)')
    .replace(/\{@recharge 5\}/g, '(Recharge 5–6)')
    .replace(/\{@recharge\}/g, '(Recharge 6)')
    // Save result markers → readable labels
    .replace(/\{@actSaveFail\}\s*/g, 'On a failed save, ')
    .replace(/\{@actSaveSuccess\}\s*/g, 'On a successful save, ')
    .replace(/\{@actSaveSuccessOrFail\}\s*/g, '')
    // Reaction structure markers
    .replace(/\{@actTrigger\}\s*/g, 'Trigger: ')
    .replace(/\{@actResponse\}\s*/g, '')
    // Misc separators
    .replace(/\{@hom\}/g, '')
    // Variant rules: {@variantrule DisplayName|Source} → DisplayName
    .replace(/\{@variantrule ([^|}\s]+)[^}]*\}/g, '$1')
    // Catch-all: strip any remaining {@...} tags
    .replace(/\{@\w+[^}]*\}/g, '')
    // Uppercase ability abbreviations before DC (e.g. "int DC 16" → "INT DC 16")
    .replace(/\b(str|dex|con|int|wis|cha)\s+(DC\s+\d+)/gi, (_, ab, dc) => `${ab.toUpperCase()} ${dc}`)
    // Clean up any double spaces left behind
    .replace(/  +/g, ' ')
    .trim();
}

/** Recursively clean all string values in a monster object */
function cleanMonster(m: Monster): Monster {
  const clean = (val: unknown): unknown => {
    if (typeof val === 'string') return cleanText(val);
    if (Array.isArray(val)) return val.map(clean);
    if (val && typeof val === 'object') {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).map(([k, v]) => [k, clean(v)])
      );
    }
    return val;
  };
  return clean(m) as Monster;
}

function withAvatar(monsters: Monster[]): Monster[] {
  return monsters.map(m => ({
    ...cleanMonster(m),
    avatar: `/tokens/${tokenSlug(m.name)}.jpg`,
  }));
}

export const BESTIARY: Monster[] = [
  ...withAvatar(bestiary2014 as Monster[]),
  ...withAvatar(bestiary2024 as Monster[]),
];
