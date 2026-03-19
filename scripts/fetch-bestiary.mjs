#!/usr/bin/env node

/**
 * Fetches 2014 + 2024 Monster Manual bestiary data from the 5e.tools GitHub repo,
 * transforms it to the app's Monster schema, and writes two static JSON files.
 *
 * Usage: node scripts/fetch-bestiary.mjs
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Data Sources ────────────────────────────────────────────────────────────
const SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/bestiary-mm.json',
    sourceCode: 'MM',
    sourceLabel: '2014',
    outFile: resolve(__dirname, '../src/data/bestiary-2014.json'),
  },
  {
    url: 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/bestiary-xmm.json',
    sourceCode: 'XMM',
    sourceLabel: '2024',
    outFile: resolve(__dirname, '../src/data/bestiary-2024.json'),
  },
];

// ── Size Code → Display Name ────────────────────────────────────────────────
const SIZE_MAP = {
  T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan',
};

// ── CR → XP Lookup ──────────────────────────────────────────────────────────
const CR_XP = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

// ── CR float → display string (5e.tools uses string CRs, but just in case) ─
function formatCr(cr) {
  if (typeof cr === 'number') {
    if (cr === 0.125) return '1/8';
    if (cr === 0.25) return '1/4';
    if (cr === 0.5) return '1/2';
    return String(cr);
  }
  if (typeof cr === 'object' && cr.cr) return String(cr.cr);
  return String(cr);
}

// ── Tag Stripping ───────────────────────────────────────────────────────────
function cleanEntryText(text) {
  if (typeof text !== 'string') return '';
  return text
    // Specific semantic tags
    .replace(/\{@atk mw\}/g, 'Melee Weapon Attack:')
    .replace(/\{@atk rw\}/g, 'Ranged Weapon Attack:')
    .replace(/\{@atk mw,rw\}/g, 'Melee or Ranged Weapon Attack:')
    .replace(/\{@atk ms\}/g, 'Melee Spell Attack:')
    .replace(/\{@atk rs\}/g, 'Ranged Spell Attack:')
    .replace(/\{@atk ms,rs\}/g, 'Melee or Ranged Spell Attack:')
    .replace(/\{@h\}/g, 'Hit: ')
    .replace(/\{@hit (\d+)\}/g, '+$1')
    .replace(/\{@dc (\d+)\}/g, 'DC $1')
    .replace(/\{@recharge\}/g, '(Recharge 6)')
    .replace(/\{@recharge (\d+)\}/g, '(Recharge $1-6)')
    .replace(/\{@damage ([^}]+)\}/g, '$1')
    .replace(/\{@dice ([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@scaledamage [^}]*\|[^}]*\|([^|}]+)[^}]*\}/g, '$1')
    // Generic tags: {@tag content|extra|more} → content
    .replace(/\{@\w+ ([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .trim();
}

// ── Entries Processing (recursive) ──────────────────────────────────────────
function processEntries(entries) {
  if (!entries || !Array.isArray(entries)) return '';
  return entries
    .map((entry) => {
      if (typeof entry === 'string') return cleanEntryText(entry);
      if (entry.type === 'list' && entry.items) {
        return entry.items
          .map((item) =>
            typeof item === 'string'
              ? `• ${cleanEntryText(item)}`
              : item.entry
                ? `• ${cleanEntryText(item.entry)}`
                : item.entries
                  ? processEntries(item.entries)
                  : ''
          )
          .filter(Boolean)
          .join('\n');
      }
      if (entry.type === 'entries' && entry.entries) {
        const heading = entry.name ? `${entry.name}. ` : '';
        return heading + processEntries(entry.entries);
      }
      if (entry.type === 'table') {
        // Skip tables – not worth rendering in a VTT tooltip
        return '';
      }
      if (entry.type === 'inline' && entry.entries) {
        return processEntries(entry.entries);
      }
      if (entry.type === 'inset' && entry.entries) {
        return processEntries(entry.entries);
      }
      if (entry.entries) return processEntries(entry.entries);
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

// ── Damage / Resistance Array Flattening ────────────────────────────────────
function flattenDamageArray(arr) {
  if (!arr || !Array.isArray(arr)) return undefined;
  const parts = arr
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item.immune) return item.immune.join(', ') + (item.note ? ` (${cleanEntryText(item.note)})` : '');
      if (item.resist) return item.resist.join(', ') + (item.note ? ` (${cleanEntryText(item.note)})` : '');
      if (item.special) return cleanEntryText(item.special);
      return '';
    })
    .filter(Boolean);
  return parts.length ? parts.join('; ') : undefined;
}

// ── Transform One Monster ───────────────────────────────────────────────────
function transformMonster(raw, sourceLabel) {
  // Type string — can be string, object with .type, or something else entirely
  let typeStr;
  if (typeof raw.type === 'string') {
    typeStr = raw.type;
  } else if (raw.type && typeof raw.type === 'object') {
    typeStr = typeof raw.type.type === 'string' ? raw.type.type : String(raw.type.type || 'unknown');
  } else {
    typeStr = 'unknown';
  }
  const typeTags =
    typeof raw.type === 'object' && raw.type?.tags
      ? raw.type.tags
          .map((t) => (typeof t === 'string' ? t : t.tag || ''))
          .filter(Boolean)
      : [];
  const tagSuffix = typeTags.length ? ` (${typeTags.join(', ')})` : '';

  // Size
  const sizeArr = Array.isArray(raw.size) ? raw.size : [raw.size || 'M'];
  const size = sizeArr.map((s) => SIZE_MAP[s] || s).join('/');

  // Display type: "Large Aberration (Devil)"
  const displayType = `${size} ${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}${tagSuffix}`;

  // AC
  let ac = 10;
  if (Array.isArray(raw.ac)) {
    const first = raw.ac[0];
    ac = typeof first === 'number' ? first : first?.ac ?? 10;
  } else if (typeof raw.ac === 'number') {
    ac = raw.ac;
  }

  // HP
  const hp = raw.hp?.average || (typeof raw.hp === 'number' ? raw.hp : 1);

  // CR
  const cr = formatCr(raw.cr);

  // Speed
  let speed;
  if (raw.speed) {
    const parts = [];
    for (const [key, val] of Object.entries(raw.speed)) {
      if (key === 'canHover') continue;
      const num = typeof val === 'object' ? val.number : val;
      if (key === 'walk') {
        parts.push(`${num} ft.`);
      } else {
        parts.push(`${key} ${num} ft.`);
      }
    }
    speed = parts.join(', ') || undefined;
  }

  // Senses
  const senses = raw.senses?.length ? raw.senses.join(', ') : undefined;

  // Languages
  const languages = raw.languages?.length ? raw.languages.join(', ') : undefined;

  // Saves
  const saves = raw.save
    ? Object.entries(raw.save)
        .map(([k, v]) => `${k.toUpperCase()} ${v}`)
        .join(', ')
    : undefined;

  // Damage immunities / resistances / condition immunities
  const immunities = flattenDamageArray(raw.immune);
  const resistances = flattenDamageArray(raw.resist);
  const conditionImmunities = raw.conditionImmune
    ? raw.conditionImmune
        .map((c) => (typeof c === 'string' ? c : c.conditionImmune || ''))
        .filter(Boolean)
        .join(', ') || undefined
    : undefined;

  // Transform action-like arrays
  function transformActions(arr) {
    if (!arr || !Array.isArray(arr)) return undefined;
    const result = arr
      .map((a) => ({
        name: a.name || 'Unknown',
        desc: processEntries(a.entries),
      }))
      .filter((a) => a.desc);
    return result.length ? result : undefined;
  }

  // Spellcasting → merge into specialAbilities
  let spellcastingAbilities = [];
  if (raw.spellcasting && Array.isArray(raw.spellcasting)) {
    spellcastingAbilities = raw.spellcasting.map((sc) => {
      const headerText = sc.headerEntries ? processEntries(sc.headerEntries) : '';
      const parts = [headerText];

      // "will" spells (at will)
      if (sc.will) {
        parts.push(`At will: ${sc.will.map((s) => cleanEntryText(s)).join(', ')}`);
      }
      // daily spells
      if (sc.daily) {
        for (const [uses, spells] of Object.entries(sc.daily)) {
          const usesLabel = uses.endsWith('e') ? `${uses.slice(0, -1)}/day each` : `${uses}/day`;
          parts.push(`${usesLabel}: ${spells.map((s) => cleanEntryText(s)).join(', ')}`);
        }
      }
      // spells by level
      if (sc.spells) {
        for (const [level, data] of Object.entries(sc.spells)) {
          const slots = data.slots ? ` (${data.slots} slots)` : '';
          const spellList = data.spells?.map((s) => cleanEntryText(s)).join(', ') || '';
          if (level === '0') {
            parts.push(`Cantrips (at will): ${spellList}`);
          } else {
            parts.push(`${ordinal(parseInt(level))} level${slots}: ${spellList}`);
          }
        }
      }
      if (sc.footerEntries) {
        parts.push(processEntries(sc.footerEntries));
      }

      return { name: sc.name || 'Spellcasting', desc: parts.filter(Boolean).join('\n') };
    });
  }

  const traits = transformActions(raw.trait) || [];
  const allSpecialAbilities = [...spellcastingAbilities, ...traits];

  // ID: source-prefixed slug
  const id = `${sourceLabel}-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;

  const monster = {
    id,
    name: raw.name,
    source: sourceLabel,
    hp,
    ac,
    type: displayType,
    size,
    cr,
    xp: CR_XP[cr] || 0,
    description: '',
    stats: {
      str: raw.str || 10,
      dex: raw.dex || 10,
      con: raw.con || 10,
      int: raw.int || 10,
      wis: raw.wis || 10,
      cha: raw.cha || 10,
    },
    actions: transformActions(raw.action) || [],
    speed,
    senses,
    languages,
    saves,
    immunities,
    resistances,
    conditionImmunities,
  };

  // Only add optional arrays if they have content (keeps JSON small)
  if (allSpecialAbilities.length) monster.specialAbilities = allSpecialAbilities;
  if (transformActions(raw.legendary)) monster.legendaryActions = transformActions(raw.legendary);
  if (transformActions(raw.reaction)) monster.reactions = transformActions(raw.reaction);

  return monster;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Strip undefined values from JSON ────────────────────────────────────────
function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  for (const source of SOURCES) {
    console.log(`Fetching ${source.sourceLabel} Monster Manual from 5e.tools...`);
    const res = await fetch(source.url);
    if (!res.ok) {
      console.error(`  Failed to fetch: ${res.status} ${res.statusText}`);
      continue;
    }

    const data = await res.json();
    const rawMonsters = data.monster || [];
    console.log(`  Raw entries: ${rawMonsters.length}`);

    // Filter to only monsters from this specific source book
    const filtered = rawMonsters.filter((m) => m.source === source.sourceCode);
    console.log(`  Filtered to source "${source.sourceCode}": ${filtered.length}`);

    // Skip monsters with "_copy" that have no stats (they're references to other entries)
    const valid = filtered.filter((m) => m.hp && !m._isCopy);
    console.log(`  Valid (has HP, not a copy): ${valid.length}`);

    const transformed = valid.map((m) => stripUndefined(transformMonster(m, source.sourceLabel)));

    // Sort alphabetically
    transformed.sort((a, b) => a.name.localeCompare(b.name));

    writeFileSync(source.outFile, JSON.stringify(transformed, null, 2), 'utf-8');
    console.log(`  ✓ Wrote ${transformed.length} monsters to ${source.outFile}\n`);
  }

  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
