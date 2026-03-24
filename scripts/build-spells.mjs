/**
 * build-spells.mjs
 *
 * Transforms raw 5etools spell JSON into the app's SpellEntry format.
 *
 * Input:  raw-data/spells-phb.json, spells-xge.json, spells-tce.json (2014)
 *         raw-data/spells-xphb.json (2024)
 * Output: src/data/spells-2014.json, src/data/spells-2024.json
 *
 * Usage:  node scripts/build-spells.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── School code → full name ──
const SCHOOL_MAP = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
  V: 'Evocation',
};

// ── Area tag → aoeType ──
const AREA_TAG_MAP = {
  S: 'sphere',
  N: 'cone',
  C: 'cone',
  L: 'line',
  Q: 'cube',
  Y: 'cylinder',
};

// ── Range type → aoeType (for self-origin AoEs) ──
const RANGE_TYPE_MAP = {
  cone: 'cone',
  line: 'line',
  cube: 'cube',
  sphere: 'sphere',
  radius: 'sphere',
  hemisphere: 'sphere',
};

// ── Strip 5etools {@tag ...} markup ──
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\{@variantrule ([^|}\s]+)[^}]*\}/g, '$1')
    .replace(/\{@\w+ ([^|}]+)\|?[^}]*\}/g, '$1')
    .replace(/\{@\w+[^}]*\}/g, '')
    .replace(/  +/g, ' ')
    .trim();
}

// ── Recursively flatten entries array into a single string ──
function flattenEntries(entries) {
  if (!entries) return '';
  const parts = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      parts.push(cleanText(entry));
    } else if (entry && typeof entry === 'object') {
      if (entry.entries) {
        parts.push(flattenEntries(entry.entries));
      }
      if (entry.items) {
        for (const item of entry.items) {
          if (typeof item === 'string') {
            parts.push(cleanText(item));
          } else if (item && item.entries) {
            parts.push(flattenEntries(item.entries));
          } else if (item && item.entry) {
            parts.push(cleanText(typeof item.entry === 'string' ? item.entry : ''));
          }
        }
      }
    }
  }
  return parts.filter(Boolean).join(' ');
}

// ── Extract AoE size from spell description text ──
function extractAoeSizeFromText(text, aoeType) {
  if (!text || !aoeType) return undefined;
  const shapeWord = aoeType === 'sphere' ? '(?:sphere|radius)'
    : aoeType === 'cone' ? 'cone'
    : aoeType === 'line' ? 'line'
    : aoeType === 'cube' ? 'cube'
    : aoeType === 'cylinder' ? 'cylinder'
    : null;
  if (!shapeWord) return undefined;

  // Try "X-foot-radius sphere", "X-foot cone", "X-foot line", "X-foot cube"
  const patterns = [
    new RegExp(`(\\d+)-foot[- ]radius\\s+${shapeWord}`, 'i'),
    new RegExp(`(\\d+)-foot[- ]${shapeWord}`, 'i'),
    new RegExp(`(\\d+)-foot[- ]radius`, 'i'),
    new RegExp(`(\\d+)[- ]foot[- ](?:wide|long|tall|high)?\\s*${shapeWord}`, 'i'),
    new RegExp(`${shapeWord}[^.]{0,30}?(\\d+)[- ](?:foot|feet|ft)`, 'i'),
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

// ── Transform a single 5etools spell into SpellEntry format ──
function transformSpell(raw, source) {
  const name = raw.name;
  const level = raw.level ?? 0;
  const school = SCHOOL_MAP[raw.school] || raw.school || '';

  // Description
  const desc = flattenEntries(raw.entries);

  // Range (in feet)
  let range = 0;
  if (raw.range) {
    if (raw.range.distance?.amount != null) {
      range = raw.range.distance.amount;
    } else if (raw.range.type === 'touch') {
      range = -1;
    } else if (raw.range.type === 'special' || raw.range.type === 'self' || raw.range.type === 'sight' || raw.range.type === 'unlimited') {
      range = 0;
    }
  }

  // AoE type — first from range.type, then from areaTags
  let aoeType = undefined;
  if (raw.range?.type && RANGE_TYPE_MAP[raw.range.type]) {
    aoeType = RANGE_TYPE_MAP[raw.range.type];
  } else if (raw.areaTags) {
    for (const tag of raw.areaTags) {
      if (AREA_TAG_MAP[tag]) {
        aoeType = AREA_TAG_MAP[tag];
        break;
      }
    }
  }

  // AoE size
  let aoeSize = undefined;
  if (aoeType) {
    // For self-origin shapes (cone, line, cube, sphere from range.type), the distance IS the aoeSize
    if (raw.range?.type && RANGE_TYPE_MAP[raw.range.type] && raw.range.distance?.amount) {
      aoeSize = raw.range.distance.amount;
    } else {
      // For point-range spells with AoE (like Fireball), extract from description
      aoeSize = extractAoeSizeFromText(desc, aoeType);
    }
  }

  // Save ability
  let saveAbility = undefined;
  if (raw.savingThrow?.length) {
    saveAbility = raw.savingThrow[0].substring(0, 3).toLowerCase();
  }

  // Half damage on successful save?
  const halfDamageOnSave = /half (as much )?damage|half damage/i.test(desc);

  const entry = { name, level, school, desc, range, source };
  if (aoeType) entry.aoeType = aoeType;
  if (aoeSize) entry.aoeSize = aoeSize;
  if (saveAbility) entry.saveAbility = saveAbility;
  if (halfDamageOnSave) entry.halfDamageOnSave = true;
  return entry;
}

// ── Load and process files ──
function loadSpells(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  return data.spell || [];
}

// ── 2014 sources ──
const phb = loadSpells(join(root, 'raw-data/spells-phb.json'));
const xge = loadSpells(join(root, 'raw-data/spells-xge.json'));
const tce = loadSpells(join(root, 'raw-data/spells-tce.json'));

const seen2014 = new Set();
const spells2014 = [];
for (const raw of [...phb, ...xge, ...tce]) {
  const key = raw.name.toLowerCase();
  if (seen2014.has(key)) continue;
  seen2014.add(key);
  spells2014.push(transformSpell(raw, '2014'));
}
spells2014.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

// ── 2024 sources ──
const xphb = loadSpells(join(root, 'raw-data/spells-xphb.json'));
const spells2024 = xphb.map(raw => transformSpell(raw, '2024'));
spells2024.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

// ── Write output ──
writeFileSync(join(root, 'src/data/spells-2014.json'), JSON.stringify(spells2014, null, 2));
writeFileSync(join(root, 'src/data/spells-2024.json'), JSON.stringify(spells2024, null, 2));

// ── Stats ──
const aoe2014 = spells2014.filter(s => s.aoeType && s.aoeSize).length;
const aoe2024 = spells2024.filter(s => s.aoeType && s.aoeSize).length;
console.log(`2014: ${spells2014.length} spells total, ${aoe2014} with AoE`);
console.log(`2024: ${spells2024.length} spells total, ${aoe2024} with AoE`);
console.log('Written to src/data/spells-2014.json and src/data/spells-2024.json');
