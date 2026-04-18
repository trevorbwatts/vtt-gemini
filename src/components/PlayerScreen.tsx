import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { FloorMapContainer } from './FloorMapContainer';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Campaign, Token, Combatant, Monster, cn, ActiveEmanation } from '../types';
import { searchSpells } from '../data/spellDatabase';
import { User, Search, X, LogOut, Circle, Cone, Cylinder, Box, Slash, BookOpen, Zap, ChevronRight, ChevronDown, Flame, Ruler } from '../icons';
import { motion, AnimatePresence } from 'motion/react';
import actionsData from '../data/actions.json';
import { parseDamageType, DamageTypeBadge } from '../utils/damageColors';
import { parseActionAoe, ActionAoe, parseSpellDamage, rollAction, RollMode, ActionRollResult } from '../utils/actionParser';
import { ActionRollModal } from './ActionRollModal';
import { lookupSpell } from '../data/spellDatabase';
import { searchBeasts } from '../data/bestiary';
import { SUMMON_OPTIONS, SummonOption } from '../data/summonData';

/** Derive the effective map interaction for a spell, falling back to DB lookup then aoeType heuristic. */
function getMapInteraction(spell: any, dbEntry?: any): 'cast' | 'place' | 'cast-and-place' | 'cast-and-emanate' | 'summon' | 'exception' | 'none' {
  const mi = spell.mapInteraction ?? dbEntry?.mapInteraction;
  if (mi) return mi;
  // Default: has aoeType + aoeSize → cast; otherwise → none
  if ((spell.aoeType ?? dbEntry?.aoeType) && (spell.aoeSize ?? dbEntry?.aoeSize)) return 'cast';
  return 'none';
}

// ─── Sign-in spot types ───
type SpotId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const SPOT_IDS: SpotId[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const AOE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  sphere: Circle, cone: Cone, line: Slash, cube: Box, cylinder: Cylinder,
};

const PLAYER_COLORS = [
  '#3b82f6', '#059669', '#f59e0b', '#8b5cf6',
  '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#6366f1',
];

// ─── Emanation spell config (color + optional timer duration) ───
const EMANATION_CONFIG: Record<string, { color: string; durationMs?: number }> = {
  'Spirit Guardians':         { color: '#fbbf24', durationMs: 600000 },
  'Shield of Faith':          { color: '#60a5fa', durationMs: 600000 },
  'Antilife Shell':           { color: '#f87171' },
  'Antimagic Field':          { color: '#9ca3af' },
  'Aura of Life':             { color: '#fbbf24', durationMs: 600000 },
  'Aura of Purity':           { color: '#c4b5fd', durationMs: 600000 },
  'Aura of Vitality':         { color: '#4ade80' },
  'Circle of Power':          { color: '#fde047', durationMs: 600000 },
  'Conjure Minor Elementals': { color: '#2dd4bf', durationMs: 600000 },
  'Conjure Woodland Beings':  { color: '#86efac', durationMs: 600000 },
  "Crusader's Mantle":        { color: '#f87171' },
  'Detect Evil and Good':     { color: '#fde047' },
  'Globe of Invulnerability': { color: '#67e8f9' },
  'Holy Aura':                { color: '#fde047' },
  'Pass without Trace':       { color: '#94a3b8' },
  "Yolande's Regal Presence": { color: '#a78bfa' },
};

// ─── Sign-in Button ───
const SignInSpot: React.FC<{
  player: Combatant | null;
  availablePlayers: Combatant[];
  showPicker: boolean;
  onTogglePicker: () => void;
  onSignIn: (playerId: string) => void;
  onSignOut: () => void;
  onColorChange: (playerId: string, color: string) => void;
  rotation: number;
  className: string;
  style?: React.CSSProperties;
  edge: 'top' | 'bottom' | 'left';
}> = ({ player, availablePlayers, showPicker, onTogglePicker, onSignIn, onSignOut, onColorChange, rotation, className, style, edge }) => {

  return (
    <div className={cn('absolute z-20', className)} style={style}>
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        {player ? (
          <div className="flex flex-col gap-2 bg-white/5 border border-white/10 rounded-xl px-5 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32'), boxShadow: `0 0 0 2px #111, 0 0 0 4px ${player.color || '#cd7f32'}` }}
              >
                {player.avatar
                  ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                  : player.name[0]?.toUpperCase()
                }
              </div>
              <span className="text-white font-bold text-sm tracking-wide flex-1">{player.name}</span>
              <button onClick={onSignOut} className="btn-ghost ml-1 px-2 py-1">
                <LogOut size={10} /> Sign Out
              </button>
            </div>
            {/* Color swatches */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {PLAYER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onColorChange(player.id, c)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{
                    backgroundColor: c,
                    boxShadow: (player.color || '#cd7f32') === c
                      ? `0 0 0 1.5px #111, 0 0 0 3px ${c}`
                      : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={onTogglePicker}
              className="flex items-center gap-3 bg-white/5 border border-dashed border-white/15 rounded-xl px-8 py-4 hover:bg-white/10 hover:border-white/25 transition-all backdrop-blur-sm"
            >
              <User size={20} className="text-white/25" />
              <span className="text-white/30 font-bold text-lg tracking-widest">Sign In</span>
            </button>
            <AnimatePresence>
              {showPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1715] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px] z-50"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onTouchEnd={(e: React.TouchEvent) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                    Choose your character
                  </div>
                  {availablePlayers.length === 0 ? (
                    <div className="px-4 py-4 text-white/20 text-xs text-center">All players signed in</div>
                  ) : (
                    availablePlayers.map(p => (
                      <button
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); onSignIn(p.id); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
                          style={{
                            background: p.avatar ? 'transparent' : (p.color || '#cd7f32'),
                            boxShadow: `0 0 0 2px #111, 0 0 0 4px ${p.color || '#cd7f32'}`,
                          }}
                        >
                          {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : p.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white/80 text-sm font-medium">{p.name}</div>
                          {p.classes && p.classes.length > 0 && (
                            <div className="text-white/30 text-[10px]">{p.classes.map(c => `${c.name} ${c.level}`).join(' / ')}</div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── D&D 5e Conditions ───
const D5E_CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

// ─── Ring item pixel offsets per edge (fan toward the player's seat) ───
const RING_OFFSETS: Record<'bottom' | 'top' | 'left', { dx: number; dy: number }[]> = {
  bottom: [{ dx: -78, dy: 64 }, { dx: 0,   dy: 95 }, { dx: 78,  dy: 64 }],
  top:    [{ dx: -78, dy: -64 }, { dx: 0,   dy: -95 }, { dx: 78,  dy: -64 }],
  left:   [{ dx: -64, dy: -78 }, { dx: -95, dy: 0  }, { dx: -64, dy: 78  }],
};

// ─── Ring item offsets: 2-item layout (wider spread) vs 3-item layout ───
const RING_OFFSETS_2: Record<'bottom' | 'top' | 'left', { dx: number; dy: number }[]> = {
  bottom: [{ dx: -70, dy: 75 }, { dx: 70,  dy: 75 }],
  top:    [{ dx: -70, dy: -75 }, { dx: 70,  dy: -75 }],
  left:   [{ dx: -75, dy: -70 }, { dx: -75, dy: 70  }],
};

// ─── Ring item offsets: 4-item layout ───
const RING_OFFSETS_4: Record<'bottom' | 'top' | 'left', { dx: number; dy: number }[]> = {
  bottom: [{ dx: -90, dy: 52 }, { dx: -42, dy: 90 }, { dx: 42, dy: 90 }, { dx: 90, dy: 52 }],
  top:    [{ dx: -90, dy: -52 }, { dx: -42, dy: -90 }, { dx: 42, dy: -90 }, { dx: 90, dy: -52 }],
  left:   [{ dx: -52, dy: -90 }, { dx: -90, dy: -42 }, { dx: -90, dy: 42 }, { dx: -52, dy: 90 }],
};

// ─── Ring item offsets: 5-item layout ───
const RING_OFFSETS_5: Record<'bottom' | 'top' | 'left', { dx: number; dy: number }[]> = {
  bottom: [{ dx: -90, dy: 52 }, { dx: -52, dy: 86 }, { dx: 0, dy: 97 }, { dx: 52, dy: 86 }, { dx: 90, dy: 52 }],
  top:    [{ dx: -90, dy: -52 }, { dx: -52, dy: -86 }, { dx: 0, dy: -97 }, { dx: 52, dy: -86 }, { dx: 90, dy: -52 }],
  left:   [{ dx: -52, dy: -90 }, { dx: -86, dy: -52 }, { dx: -97, dy: 0 }, { dx: -86, dy: 52 }, { dx: -52, dy: 90 }],
};

// ─── Ring item offsets: 6-item layout ───
const RING_OFFSETS_6: Record<'bottom' | 'top' | 'left', { dx: number; dy: number }[]> = {
  bottom: [{ dx: -95, dy: 50 }, { dx: -68, dy: 77 }, { dx: -28, dy: 95 }, { dx: 28, dy: 95 }, { dx: 68, dy: 77 }, { dx: 95, dy: 50 }],
  top:    [{ dx: -95, dy: -50 }, { dx: -68, dy: -77 }, { dx: -28, dy: -95 }, { dx: 28, dy: -95 }, { dx: 68, dy: -77 }, { dx: 95, dy: -50 }],
  left:   [{ dx: -50, dy: -95 }, { dx: -77, dy: -68 }, { dx: -95, dy: -28 }, { dx: -95, dy: 28 }, { dx: -77, dy: 68 }, { dx: -50, dy: 95 }],
};

// ─── Action Ring ───
const ActionRing: React.FC<{
  anchorX: number;
  anchorY: number;
  edge: 'top' | 'bottom' | 'left';
  onSpells: () => void;
  onConditions: () => void;
  onMeasure: () => void;
  onEndTurn: () => void;
  onToggleTorch: () => void;
  isTorchLit: boolean;
  onClose: () => void;
  isPlayersTurn: boolean;
}> = ({ anchorX, anchorY, edge, onSpells, onConditions, onMeasure, onEndTurn, onToggleTorch, isTorchLit, onClose, isPlayersTurn }) => {
  const contentRotate = edge === 'top' ? 180 : edge === 'left' ? 90 : 0;
  const allItems = [
    { label: 'Spells &\nAbilities', icon: BookOpen, color: 'bg-[#1a0d2e] border-purple-500/40 text-purple-400', onClick: onSpells },
    // { label: 'Conditions', icon: Zap,      color: 'bg-[#1a1500] border-yellow-500/40 text-yellow-300', onClick: onConditions },
    {
      label: isTorchLit ? 'Douse' : 'Torch',
      icon: Flame,
      color: isTorchLit
        ? 'bg-[#1a1200] border-orange-400/60 text-orange-300 opacity-60'
        : 'bg-[#1a0e00] border-orange-500/40 text-orange-400',
      onClick: onToggleTorch,
    },
    { label: 'Measure', icon: Ruler, color: 'bg-[#1a1400] border-yellow-500/40 text-yellow-400', onClick: onMeasure },
  ];
  if (isPlayersTurn) {
    allItems.push(
      { label: 'End Turn', icon: ChevronRight, color: 'bg-[#001a0a] border-green-500/40 text-green-300', onClick: onEndTurn },
    );
  }
  const items = allItems;
  const offsets = items.length === 6 ? RING_OFFSETS_6[edge] : items.length === 5 ? RING_OFFSETS_5[edge] : items.length === 4 ? RING_OFFSETS_4[edge] : items.length === 3 ? RING_OFFSETS[edge] : RING_OFFSETS_2[edge];
  const BUTTON_SIZE = 62;
  return (
    <>
      {/* Backdrop — dismisses ring */}
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      {/* Ring buttons */}
      {items.map((item, i) => (
        <motion.button
          key={item.label}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.05, type: 'spring', stiffness: 420, damping: 26 }}
          className={cn(
            'fixed z-50 rounded-full border flex flex-col items-center justify-center gap-0.5 shadow-xl',
            item.color
          )}
          style={{
            left: anchorX + offsets[i].dx - BUTTON_SIZE / 2,
            top:  anchorY + offsets[i].dy - BUTTON_SIZE / 2,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
          }}
          onPointerDown={(e) => { e.stopPropagation(); item.onClick(); }}
        >
          <div className="flex flex-col items-center justify-center gap-0.5" style={{ transform: `rotate(${contentRotate}deg)` }}>
            <item.icon size={18} />
            <span className="text-[8px] font-bold tracking-wide text-center whitespace-pre-line leading-tight">
              {item.label}
            </span>
          </div>
        </motion.button>
      ))}
    </>
  );
};

// ─── Spell Row (reusable inside SpellsPanel) ───
const SpellRow: React.FC<{
  spell: any;
  spellSaveDc?: number;
  spellAttackBonus?: number;
  onPress: () => void;
  onPlace?: () => void;
  onSummon?: () => void;
  onRoll?: (mode: import('../utils/actionParser').RollMode) => void;
  onDismiss?: () => void;
  isDismissable?: boolean;
  disabled?: boolean;
}> = ({ spell, spellSaveDc, spellAttackBonus, onPress, onPlace, onSummon, onRoll, onDismiss, isDismissable, disabled }) => {
  const mi = spell.mapInteraction as string | undefined;
  const isCast = mi === 'cast' || mi === 'cast-and-place' || mi === 'cast-and-emanate';
  const isPlace = mi === 'place' || mi === 'exception';
  const isSummon = mi === 'summon';
  const isActive = (isCast || isPlace || isSummon) && !disabled;
  // Resolve effective description for damage type badge
  const effectiveDesc = spell.desc || (isCast ? null : lookupSpell(spell.name)?.desc) || '';
  const damageType = effectiveDesc ? parseDamageType(effectiveDesc) : null;
  return (
    <div className="flex items-center gap-2 py-2">
      {spell.atWill && (
        <div className="flex flex-col items-center shrink-0 mr-0.5">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30 leading-none">AT</span>
          <span className="text-[8px] font-black uppercase tracking-widest text-white/30 leading-none">WILL</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className={cn(
          'font-bold text-xs block truncate',
          isActive ? 'text-purple-400' : 'text-white/40'
        )}>{spell.name}</span>
        {spell.source && (
          <span className="text-[9px] text-white/20 truncate block">{spell.source}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <DamageTypeBadge damageType={damageType} />
        {spell.saveAbility && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/10 text-red-400">
            {spell.saveAbility.toUpperCase()}{spellSaveDc ? ` ${spellSaveDc}` : ''}
          </span>
        )}
        {spell.aoeType && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 flex items-center gap-0.5">
            {spell.aoeSize ? `${spell.aoeSize}ft` : ''}{AOE_ICONS[spell.aoeType] ? React.createElement(AOE_ICONS[spell.aoeType], { size: 9 }) : ''}
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 text-white/30">
          {spell.range == null ? '' : spell.range === 0 ? 'Self' : spell.range === -1 ? 'Touch' : `${spell.range}ft`}
        </span>
        {(isCast || (isPlace && mi === 'exception')) && !disabled && isDismissable && onDismiss && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onDismiss(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 active:bg-red-500/40 transition-colors"
          >
            Dismiss
          </button>
        )}
        {isCast && !disabled && !isDismissable && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 active:bg-[var(--accent)]/40 transition-colors"
          >
            Cast
          </button>
        )}
        {isPlace && !disabled && onPlace && !(mi === 'exception' && isDismissable) && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onPlace(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/40 active:bg-purple-500/40 transition-colors"
          >
            {mi === 'exception' ? 'Cast' : 'Place'}
          </button>
        )}
        {isSummon && !disabled && onSummon && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onSummon(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-teal-500/20 text-teal-400 border border-teal-500/40 active:bg-teal-500/40 transition-colors"
          >
            Cast
          </button>
        )}
      </div>
    </div>
  );
};

// Dragon ancestry → damage type mapping
const DRACONIC_DAMAGE: Record<string, string> = {
  black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning',
  copper: 'acid', gold: 'fire', green: 'poison', red: 'fire',
  silver: 'cold', white: 'cold',
};

/** Breath Weapon damage dice based on total character level */
function getBreathWeaponDice(player: Combatant): string {
  const level = player.classes?.reduce((sum, c) => sum + c.level, 0) || 1;
  if (level >= 17) return '4d10';
  if (level >= 11) return '3d10';
  if (level >= 5)  return '2d10';
  return '1d10';
}

/** Compute a save DC for a player action when not present in the description. */
function computeActionSaveDc(player: Combatant): number {
  if (!player.stats || !player.proficiencyBonus) return 13;
  // Default: CON-based (covers most racial features like Breath Weapon)
  const conMod = Math.floor(((player.stats.con || 10) - 10) / 2);
  return 8 + player.proficiencyBonus + conMod;
}

// ─── Spells Panel ───
const SpellsPanel: React.FC<{
  player: Combatant;
  anchorX: number;
  anchorY: number;
  edge: 'top' | 'bottom' | 'left';
  onCast: (spell: any) => void;
  onPlace: (spell: any) => void;
  onSummon: (spell: any) => void;
  onClose: () => void;
  onDarkvisionChange: (newValue: number) => void;
  preAbilityDarkvisionRef: React.MutableRefObject<Record<string, number>>;
  onTremorsenseChange?: (data: { playerId: string; rangeFt: number } | null) => void;
  activeAbilities: Set<string>;
  onToggleAbility: (entry: AbilityEntry) => void;
  isTorchLit: boolean;
  onToggleTorch: () => void;
  onMeasure: () => void;
  isPlayersTurn: boolean;
  onEndTurn: () => void;
  onWildShape?: (creature: Monster) => void;
  isWildShaped?: boolean;
  onRevertWildShape?: () => void;
  activeEmanations?: ActiveEmanation[];
  onDismissEmanation?: (spellName: string) => void;
  invisibilityActive?: boolean;
  onDismissInvisibility?: () => void;
  seeInvisibilityActive?: boolean;
  onDismissSeeInvisibility?: () => void;
}> = ({ player, anchorX, anchorY, edge, onCast, onPlace, onSummon, onClose, onDarkvisionChange, preAbilityDarkvisionRef, onTremorsenseChange, activeAbilities, onToggleAbility, isTorchLit, onToggleTorch, onMeasure, isPlayersTurn, onEndTurn, onWildShape, isWildShaped, onRevertWildShape, activeEmanations, onDismissEmanation, invisibilityActive, onDismissInvisibility, seeInvisibilityActive, onDismissSeeInvisibility }) => {
  const spells = useMemo(() => {
    const enrich = (spell: any) => {
      const db = lookupSpell(spell.name);
      return {
        ...spell,
        aoeType: spell.aoeType ?? db?.aoeType,
        aoeSize: spell.aoeSize ?? db?.aoeSize,
        mapInteraction: getMapInteraction(spell, db),
        saveEffect: spell.saveEffect ?? db?.saveEffect,
        condition: spell.condition ?? db?.condition,
      };
    };
    const base = (player.spells || []).map(enrich);
    const atWill = (player.atWillSpells || []).flatMap(({ spellName, source }) => {
      const found = lookupSpell(spellName);
      if (!found) return [];
      return [enrich({ ...found, atWill: true as const, source })];
    });
    // Merge and sort alphabetically; skip at-will duplicates already in the manual list
    const manualNames = new Set(base.map((s: any) => s.name.toLowerCase()));
    return [...atWill.filter((s: any) => !manualNames.has(s.name.toLowerCase())), ...base]
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [player.spells, player.atWillSpells]);

  const spellSaveDc = useMemo(() => {
    if (player.spellSaveDc) return player.spellSaveDc;
    if (!player.stats || !player.proficiencyBonus || !player.classes?.length) return undefined;
    const CASTING_ABILITY: Record<string, keyof NonNullable<typeof player.stats>> = {
      wizard: 'int', artificer: 'int',
      cleric: 'wis', druid: 'wis', ranger: 'wis', monk: 'wis',
      bard: 'cha', sorcerer: 'cha', warlock: 'cha', paladin: 'cha',
    };
    let bestMod = -Infinity;
    for (const cls of player.classes) {
      const ability = CASTING_ABILITY[cls.name.toLowerCase()];
      if (ability && player.stats) {
        const mod = Math.floor((player.stats[ability] - 10) / 2);
        if (mod > bestMod) bestMod = mod;
      }
    }
    if (bestMod === -Infinity) return undefined;
    return 8 + player.proficiencyBonus + bestMod;
  }, [player]);

  const spellAttackBonus = useMemo(() => {
    if (!player.proficiencyBonus || !player.classes?.length || !player.stats) return undefined;
    // spellSaveDc = 8 + prof + mod  →  spell attack bonus = prof + mod = spellSaveDc - 8
    if (player.spellSaveDc != null) return player.spellSaveDc - 8;
    if (spellSaveDc != null) return spellSaveDc - 8;
    return undefined;
  }, [player, spellSaveDc]);

  const [rollModal, setRollModal] = useState<{ name: string; result: ActionRollResult } | null>(null);

  // ── Abilities (from static actions data) ──
  const abilities = useMemo(() => (actionsData as AbilityEntry[]).filter(entry => {
    if (entry.source === 'species') {
      if (!entry.species) return false;
      return player.species?.toLowerCase().includes(entry.species.toLowerCase()) ?? false;
    }
    return player.classes?.some(c =>
      c.name.toLowerCase() === (entry.class ?? '').toLowerCase() &&
      (!entry.subclass || c.subclass?.toLowerCase().includes(entry.subclass.toLowerCase())) &&
      c.level >= entry.levelRequired
    ) ?? false;
  }), [player]);

  const handleToggleAbility = (entry: AbilityEntry) => {
    onToggleAbility(entry);
  };

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'abilities' | 'lookup' | 'wildshape'>(isWildShaped ? 'wildshape' : 'my');
  const [enabledSources, setEnabledSources] = useState<Set<'2014' | '2024'>>(new Set(['2024']));
  const [recentSpells, setRecentSpells] = useState<any[]>([]);
  const [spellSearch, setSpellSearch] = useState('');
  const [beastSearch, setBeastSearch] = useState('');
  const [unsupportedOpen, setUnsupportedOpen] = useState(false);

  const hasWildShape = abilities.some(a => a.behavior === 'wildshape');

  const ready = true;

  const searchResults = useMemo(() => {
    if (spellSearch.trim().length < 2) return [];
    return searchSpells(spellSearch, 40, { sources: enabledSources }).filter(spell => {
      const mi = getMapInteraction(spell);
      return mi !== 'none';
    }).slice(0, 20).map(spell => ({
      ...spell,
      mapInteraction: spell.mapInteraction ?? getMapInteraction(spell),
    }));
  }, [spellSearch, enabledSources]);

  const beastResults = useMemo(() => {
    if (beastSearch.trim().length < 2) return [];
    return searchBeasts(beastSearch, 20, { sources: enabledSources });
  }, [beastSearch, enabledSources]);

  const toggleSource = (src: '2014' | '2024') => {
    setEnabledSources(prev => {
      const next = new Set(prev);
      if (next.has(src) && next.size > 1) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const handleSpellTap = (spell: any) => {
    const mi = getMapInteraction(spell);
    if (mi === 'summon') {
      onSummon(spell);
    } else if (mi === 'cast' || mi === 'cast-and-place' || mi === 'cast-and-emanate') {
      const halfDamageOnSave = spell.halfDamageOnSave ?? /half (as much )?damage|half damage/i.test(spell.desc || '');
      onCast({ ...spell, saveDc: spellSaveDc, halfDamageOnSave });
    } else if (mi === 'place' || mi === 'exception') {
      onPlace(spell);
    }
    setRecentSpells(prev => [spell, ...prev.filter(s => s.name !== spell.name)].slice(0, 5));
    setSpellSearch('');
    setShowKeyboard(false);
  };

  const PANEL_W = 430;
  const isLeft = edge === 'left';
  const panelStyle: React.CSSProperties = (() => {
    const hCenter = Math.max(8, Math.min(window.innerWidth - PANEL_W - 8, anchorX - PANEL_W / 2));
    if (edge === 'top') {
      return {
        left: hCenter,
        top: 8,
        transform: 'rotate(180deg)',
      };
    }
    if (isLeft) {
      // Place a tall container on the left edge — content rotates inside.
      const vh = window.innerHeight;
      return {
        left: 8,
        top: Math.max(8, (vh - PANEL_W) / 2),
        width: Math.min(vh - 16, PANEL_W),
        height: PANEL_W,
      };
    }
    // bottom — pin to bottom of viewport so it grows upward
    return {
      left: hCenter,
      bottom: 8,
    };
  })();

  // For the left edge the outer box is tall-and-narrow; inner content is
  // rendered at PANEL_W width and rotated 90° CW so the player can read it.
  const innerWrap = isLeft ? {
    transform: 'rotate(90deg)',
    width: PANEL_W,
    maxHeight: 'calc(100vw - 16px)',
  } as React.CSSProperties : undefined;

  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
            style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32') }}
          >
            {player.avatar ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" /> : player.name[0]?.toUpperCase()}
          </div>
          <span className="text-white font-bold text-xs tracking-wide truncate">{player.name}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          {isPlayersTurn && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); onEndTurn(); }}
              title="End Turn"
              className="p-1.5 rounded hover:bg-green-500/20 transition-colors"
            >
              <ChevronRight size={14} className="text-green-400" />
            </button>
          )}
          <button
            onPointerDown={(e) => { e.stopPropagation(); onToggleTorch(); }}
            title={isTorchLit ? 'Douse torch' : 'Light torch'}
            className={cn('p-1.5 rounded transition-colors', isTorchLit ? 'bg-orange-500/20 hover:bg-orange-500/30' : 'hover:bg-white/10')}
          >
            <Flame size={14} className={isTorchLit ? 'text-orange-300' : 'text-orange-500/50'} />
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); onMeasure(); }}
            title="Measure distance"
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
          >
            <Ruler size={14} className="text-yellow-500/60" />
          </button>
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          <button onPointerDown={(e) => { e.stopPropagation(); onClose(); }} className="p-1.5 hover:bg-white/10 rounded transition-colors">
            <X size={14} className="text-white/40" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-3">
        <button
          onClick={() => { setActiveTab('my'); setShowKeyboard(false); }}
          className={cn('flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
            activeTab === 'my' ? 'text-purple-400 border-purple-500' : 'text-white/25 border-transparent hover:text-white/40')}
        >
          My Spells
        </button>
        {abilities.length > 0 && (
          <button
            onClick={() => { setActiveTab('abilities'); setShowKeyboard(false); }}
            className={cn('flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
              activeTab === 'abilities' ? 'text-teal-400 border-teal-500' : 'text-white/25 border-transparent hover:text-white/40')}
          >
            Abilities
          </button>
        )}
        <button
          onClick={() => { setActiveTab('lookup'); setShowKeyboard(true); }}
          className={cn('flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
            activeTab === 'lookup' ? 'text-purple-400 border-purple-500' : 'text-white/25 border-transparent hover:text-white/40')}
        >
          Spell Lookup
        </button>
        {hasWildShape && (
          <button
            onClick={() => { setActiveTab('wildshape'); setShowKeyboard(true); }}
            className={cn('flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
              activeTab === 'wildshape' ? 'text-emerald-400 border-emerald-500' : 'text-white/25 border-transparent hover:text-white/40')}
          >
            Wild Shape
          </button>
        )}
      </div>

      {/* My Spells */}
      {activeTab === 'my' && (() => {
        const supportedSpells = spells.filter(s => s.mapInteraction !== 'none');
        const unsupportedSpells = spells.filter(s => s.mapInteraction === 'none');
        const renderRow = (spell: any, i: number) => (
          <SpellRow
            key={i}
            spell={spell}
            spellSaveDc={spellSaveDc}
            spellAttackBonus={spellAttackBonus}
            disabled={!ready}
            isDismissable={
              !!(activeEmanations?.some(e => e.spellName === spell.name)) ||
              (spell.name === 'Invisibility' && !!invisibilityActive) ||
              (spell.name === 'See Invisibility' && !!seeInvisibilityActive)
            }
            onDismiss={
              activeEmanations?.some(e => e.spellName === spell.name) ? () => onDismissEmanation?.(spell.name) :
              spell.name === 'Invisibility' ? onDismissInvisibility :
              spell.name === 'See Invisibility' ? onDismissSeeInvisibility :
              undefined
            }
            onPress={() => {
              const mi = spell.mapInteraction as string | undefined;
              if (mi !== 'cast' && mi !== 'cast-and-place' && mi !== 'cast-and-emanate') return;
              const half = spell.halfDamageOnSave ?? /half (as much )?damage|half damage/i.test(spell.desc || '');
              onCast({ ...spell, saveDc: spellSaveDc, halfDamageOnSave: half });
            }}
            onPlace={() => onPlace(spell)}
            onSummon={() => onSummon(spell)}
            onRoll={(mode) => {
              const localDesc = lookupSpell(spell.name)?.desc || '';
              const groups = parseSpellDamage(spell.desc || '') ?? parseSpellDamage(localDesc);
              if (!groups) return;
              const bonus = spellAttackBonus ?? 0;
              const result = rollAction({ attackBonus: bonus, damageGroups: groups }, mode);
              setRollModal({ name: spell.name, result });
            }}
          />
        );
        return (
          <div className="max-h-[280px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="divide-y divide-white/10">
              {spells.length === 0 ? (
                <div className="text-white/15 text-xs text-center py-3 border border-dashed border-white/10 rounded-lg">No spells</div>
              ) : supportedSpells.map((spell, i) => renderRow(spell, i))}
            </div>
            {unsupportedSpells.length > 0 && (
              <div className="mt-1 border-t border-white/10">
                <button
                  onPointerDown={(e) => { e.stopPropagation(); setUnsupportedOpen(v => !v); }}
                  className="w-full flex items-center justify-between py-2 text-[10px] font-bold uppercase tracking-widest text-white/20 hover:text-white/30 transition-colors"
                >
                  <span>Spells Not Supported ({unsupportedSpells.length})</span>
                  <ChevronDown size={12} className={cn('transition-transform opacity-50', unsupportedOpen && 'rotate-180')} />
                </button>
                {unsupportedOpen && (
                  <div className="divide-y divide-white/10">
                    {unsupportedSpells.map((spell, i) => renderRow(spell, supportedSpells.length + i))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Abilities */}
      {activeTab === 'abilities' && (
        <div className="max-h-[280px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="divide-y divide-white/10">
            {abilities.flatMap(entry => {
              const isInteractive = entry.behavior === 'toggle' || entry.behavior === 'darkvision' || entry.behavior === 'darkvisionSet' || entry.behavior === 'tremorsense';
              if (isInteractive) {
                const isActive = activeAbilities.has(entry.id);
                return [(
                  <div key={entry.id} className="flex items-center gap-2 py-2">
                    <span className={cn('font-bold flex-1 min-w-0 truncate text-xs', isActive ? 'text-teal-300' : 'text-white/40')}>
                      {entry.name}
                    </span>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); handleToggleAbility(entry); }}
                      className={cn(
                        'shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-colors',
                        isActive
                          ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 active:bg-teal-500/30'
                          : 'bg-white/10 border-white/20 text-white/40 active:bg-white/15'
                      )}
                    >
                      {isActive ? 'On' : 'Off'}
                    </button>
                  </div>
                )];
              }

              // Wild Shape: show a button that switches to the Wild Shape tab
              if (entry.behavior === 'wildshape') {
                return [(
                  <div key={entry.id} className="flex items-center gap-2 py-2">
                    <span className="font-bold flex-1 min-w-0 truncate text-xs text-emerald-400">
                      {entry.name}
                    </span>
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); setActiveTab('wildshape'); setShowKeyboard(true); }}
                      className="shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 active:bg-emerald-500/40 transition-colors"
                    >
                      {isWildShaped ? 'Change Form' : 'Cast'}
                    </button>
                  </div>
                )];
              }

              // Entries with multiple AoE variants (e.g. Breath Weapon: Cone + Line)
              if (entry.variants && entry.variants.length > 0) {
                const ancestryKey = player.draconicAncestry?.toLowerCase() || '';
                const damageType = DRACONIC_DAMAGE[ancestryKey] || 'fire';
                const dice = getBreathWeaponDice(player);
                const saveDc = computeActionSaveDc(player);
                return entry.variants.map(variant => {
                  const asSpell = {
                    name: `${entry.name} (${variant.label})`,
                    desc: `${dice} ${damageType} damage`,
                    aoeType: variant.aoeType as any,
                    aoeSize: variant.aoeSize,
                    range: 0,
                    saveAbility: 'dex',
                    level: 0,
                  };
                  return (
                    <SpellRow
                      key={`${entry.id}-${variant.label}`}
                      spell={asSpell}
                      spellSaveDc={saveDc}
                      disabled={!ready}
                      onPress={() => onCast({ ...asSpell, saveDc, halfDamageOnSave: true })}
                    />
                  );
                });
              }

              // Explicit castable ability (behavior === 'cast') — uses fields from actions.json directly
              if (entry.behavior === 'cast') {
                const saveDc = spellSaveDc ?? computeActionSaveDc(player);
                const asSpell = {
                  name: entry.name,
                  desc: entry.description,
                  aoeType: entry.aoeType,
                  aoeSize: entry.aoeSize,
                  range: 0,
                  saveAbility: entry.saveAbility,
                  mapInteraction: 'cast' as const,
                  level: 0,
                };
                return [(
                  <SpellRow
                    key={entry.id}
                    spell={asSpell}
                    spellSaveDc={saveDc}
                    disabled={!ready}
                    onPress={() => onCast({ ...asSpell, saveDc, halfDamageOnSave: entry.halfDamageOnSave ?? false })}
                  />
                )];
              }

              // Standard single-AoE castable ability (parsed from description)
              const aoe = parseActionAoe(entry.description);
              const saveDc = aoe?.saveDc ?? computeActionSaveDc(player);
              const asSpell = {
                name: entry.name,
                desc: entry.description,
                aoeType: aoe?.aoeType,
                aoeSize: aoe?.aoeSize,
                range: 0,
                saveAbility: aoe?.saveAbility,
                level: 0,
              };
              return [(
                <SpellRow
                  key={entry.id}
                  spell={asSpell}
                  spellSaveDc={saveDc}
                  disabled={!ready}
                  onPress={() => {
                    if (!aoe) return;
                    onCast({ ...asSpell, saveDc, halfDamageOnSave: aoe.halfDamageOnSave ?? true });
                  }}
                />
              )];
            })}
          </div>
        </div>
      )}

      {/* Spell Lookup */}
      {activeTab === 'lookup' && (
        <div>
          <div className="flex items-center gap-1 mb-2">
            {(['2014', '2024'] as const).map(src => (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide transition-colors',
                  enabledSources.has(src) ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-white/20')}
              >
                {src}
              </button>
            ))}
          </div>
          {searchResults.length === 0 && recentSpells.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1 font-bold">Recent</div>
              <div className="divide-y divide-white/10">
                {recentSpells.map((spell, i) => (
                 <SpellRow key={`r-${i}`} spell={spell} spellSaveDc={spellSaveDc} spellAttackBonus={spellAttackBonus} disabled={!ready} onPress={() => handleSpellTap(spell)} onPlace={() => onPlace(spell)} onSummon={() => handleSpellTap(spell)} />
                ))}
              </div>
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="divide-y divide-white/10 max-h-[150px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-2">
              {searchResults.map((spell, i) => (
                <SpellRow key={`s-${i}`} spell={spell} spellSaveDc={spellSaveDc} spellAttackBonus={spellAttackBonus} disabled={!ready} onPress={() => handleSpellTap(spell)} onPlace={() => onPlace(spell)} onSummon={() => handleSpellTap(spell)} />
              ))}
            </div>
          )}
          <div
            className={cn('relative mb-2 cursor-pointer', showKeyboard && 'ring-1 ring-purple-500/30 rounded-lg')}
            onClick={() => setShowKeyboard(true)}
          >
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
            <div className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-white min-h-[30px] flex items-center">
              {spellSearch || <span className="text-white/25">Tap to search spells...</span>}
            </div>
            {spellSearch && (
              <button onClick={(e) => { e.stopPropagation(); setSpellSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={12} className="text-white/30" />
              </button>
            )}
          </div>
          {showKeyboard && (
            <OnScreenKeyboard
              onKeyPress={(ch) => setSpellSearch(prev => prev + ch)}
              onBackspace={() => setSpellSearch(prev => prev.slice(0, -1))}
              onClear={() => setSpellSearch('')}
            />
          )}
        </div>
      )}

      {/* Wild Shape */}
      {activeTab === 'wildshape' && (
        <div>
          {isWildShaped && onRevertWildShape && (
            <button
              onClick={(e) => { e.stopPropagation(); onRevertWildShape(); onClose(); }}
              className="w-full mb-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 active:bg-red-500/40 transition-colors"
            >
              Revert Wild Shape
            </button>
          )}
          <div className="flex items-center gap-1 mb-2">
            {(['2014', '2024'] as const).map(src => (
              <button
                key={src}
                onClick={() => toggleSource(src)}
                className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide transition-colors',
                  enabledSources.has(src) ? 'bg-emerald-500/25 text-emerald-300' : 'bg-white/5 text-white/20')}
              >
                {src}
              </button>
            ))}
          </div>
          {beastResults.length > 0 && (
            <div className="divide-y divide-white/10 max-h-[150px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-2">
              {beastResults.map((beast, i) => (
                <div key={`b-${i}`} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs block truncate text-emerald-400">{beast.name}</span>
                    <span className="text-[9px] text-white/20 truncate block">{beast.type}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 text-white/30">
                      CR {beast.cr}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/10 text-red-400">
                      HP {beast.hp}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">
                      AC {beast.ac}
                    </span>
                    {onWildShape && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onWildShape(beast); setBeastSearch(''); setShowKeyboard(false); onClose(); }}
                        className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 active:bg-emerald-500/40 transition-colors"
                      >
                        Shift
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div
            className={cn('relative mb-2 cursor-pointer', showKeyboard && 'ring-1 ring-emerald-500/30 rounded-lg')}
            onClick={() => setShowKeyboard(true)}
          >
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
            <div className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-white min-h-[30px] flex items-center">
              {beastSearch || <span className="text-white/25">Tap to search beasts...</span>}
            </div>
            {beastSearch && (
              <button onClick={(e) => { e.stopPropagation(); setBeastSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={12} className="text-white/30" />
              </button>
            )}
          </div>
          {showKeyboard && (
            <OnScreenKeyboard
              onKeyPress={(ch) => setBeastSearch(prev => prev + ch)}
              onBackspace={() => setBeastSearch(prev => prev.slice(0, -1))}
              onClear={() => setBeastSearch('')}
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50" onPointerDown={onClose} />
      <div
        className="fixed bg-black/95 border border-white/10 rounded-lg overflow-hidden"
        style={{ ...panelStyle, ...(!isLeft && { width: PANEL_W, maxHeight: 'calc(100vh - 16px)' }), zIndex: 60 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isLeft ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div style={innerWrap} className="p-3 overflow-y-auto">
              {panelContent}
            </div>
          </div>
        ) : (
          <div className="p-3 overflow-y-auto h-full">
            {panelContent}
          </div>
        )}
      </div>
      <ActionRollModal
        isOpen={!!rollModal}
        actionName={rollModal?.name || ''}
        result={rollModal?.result || null}
        onClose={() => setRollModal(null)}
        edge={edge}
      />
    </>
  );
};

// ─── Conditions Panel ───
const ConditionsPanel: React.FC<{
  player: Combatant;
  anchorX: number;
  anchorY: number;
  edge: 'top' | 'bottom' | 'left';
  onToggle: (condition: string) => void;
  onClose: () => void;
}> = ({ player, anchorX, anchorY, edge, onToggle, onClose }) => {
  const activeConditions = new Set(player.conditions || []);
  const PANEL_W = 320;
  const isLeft = edge === 'left';
  const panelStyle: React.CSSProperties = (() => {
    const hCenter = Math.max(8, Math.min(window.innerWidth - PANEL_W - 8, anchorX - PANEL_W / 2));
    if (edge === 'top') {
      return {
        left: hCenter,
        top: 8,
        transform: 'rotate(180deg)',
      };
    }
    if (isLeft) {
      const vh = window.innerHeight;
      return {
        left: 8,
        top: Math.max(8, (vh - PANEL_W) / 2),
        width: Math.min(vh - 16, PANEL_W),
        height: PANEL_W,
      };
    }
    // bottom — pin to bottom of viewport
    return {
      left: hCenter,
      bottom: 8,
    };
  })();

  const innerWrap = isLeft ? {
    transform: 'rotate(90deg)',
    width: PANEL_W,
  } as React.CSSProperties : undefined;

  const panelContent = (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/60 text-[10px] uppercase tracking-widest font-bold">Conditions — {player.name}</span>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X size={14} className="text-white/40" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {D5E_CONDITIONS.map(cond => (
          <button
            key={cond}
            onClick={() => onToggle(cond)}
            className={cn(
              'px-2 py-1.5 rounded-lg text-[10px] font-bold tracking-wide border transition-colors',
              activeConditions.has(cond)
                ? 'bg-red-500/25 border-red-500/50 text-red-300'
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60'
            )}
          >
            {cond}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50" onPointerDown={onClose} />
      <div
        className="fixed bg-black/95 border border-white/10 rounded-lg overflow-hidden"
        style={{ ...panelStyle, ...(!isLeft && { width: PANEL_W, maxHeight: 'calc(100vh - 16px)' }), zIndex: 60 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isLeft ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div style={innerWrap} className="p-3">
              {panelContent}
            </div>
          </div>
        ) : (
          <div className="p-3 overflow-y-auto h-full">
            {panelContent}
          </div>
        )}
      </div>
    </>
  );
};

// ─── Actions Panel ───
interface AbilityEntry {
  id: string;
  name: string;
  source: 'class' | 'subclass' | 'species';
  class?: string;
  subclass?: string | null;
  species?: string;
  levelRequired: number;
  actionType: string;
  description: string;
  behavior: 'toggle' | 'darkvision' | 'darkvisionSet' | 'tremorsense' | 'display' | 'wip' | 'cast' | 'wildshape';
  darkvisionBonus?: number;
  darkvisionValue?: number;
  tremorsenseRange?: number;
  durationMs?: number;
  variants?: Array<{ label: string; aoeType: string; aoeSize: number }>;
  aoeType?: string;
  aoeSize?: number;
  saveAbility?: string;
  halfDamageOnSave?: boolean;
}

// ─── Initiative Strip ───
// Condenses multiple enemies of the same name into a single entry.
interface StripEntry {
  key: string;
  name: string;
  type: 'player' | 'enemy' | 'npc';
  count: number;
  deadCount: number;
  isActive: boolean;
  color?: string;
  avatar?: string;
}

const InitiativeStrip: React.FC<{
  combatants: Combatant[];
  activeCombatantId?: string | null;
  wide?: boolean;
}> = ({ combatants, activeCombatantId, wide = false }) => {
  // Sort by initiative desc, then name asc
  const sorted = useMemo(() =>
    [...combatants].sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return a.name.localeCompare(b.name);
    }),
    [combatants]
  );

  // Condense consecutive enemies of the same name into one entry.
  // Players and NPCs always get their own entry.
  // Enemy groups where every member is dead are omitted entirely.
  const entries = useMemo(() => {
    const result: StripEntry[] = [];
    for (const c of sorted) {
      const isActive = c.id === activeCombatantId;
      const isDead = c.hp <= 0;

      if (c.type === 'enemy') {
        const prev = result[result.length - 1];
        if (prev && prev.type === 'enemy' && prev.name === c.name) {
          prev.count += 1;
          if (isDead) prev.deadCount += 1;
          if (isActive) prev.isActive = true;
          continue;
        }
      }
      result.push({ key: c.id, name: c.name, type: c.type, count: 1, deadCount: isDead ? 1 : 0, isActive, color: c.color, avatar: c.avatar });
    }
    // Remove enemy groups where every member is dead
    return result.filter(e => e.type !== 'enemy' || e.deadCount < e.count);
  }, [sorted, activeCombatantId]);

  const typeColor = (type: string, color?: string) => {
    if (type === 'player' && color) {
      return { bg: `${color}14`, text: color, border: `${color}33` };
    }
    if (type === 'player') return { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.2)' };
    if (type === 'enemy') return { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' };
    return { bg: 'rgba(96,165,250,0.08)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' };
  };

  return (
    <div className={cn("absolute top-0 right-0 bottom-0 bg-black/80 border-l border-white/10 z-20 backdrop-blur-sm", wide ? "w-24 grid grid-cols-2" : "w-12 flex flex-col")}>
      {entries.map((entry) => {
        const colors = typeColor(entry.type, entry.color);
        return (
          <div
            key={entry.key}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 border-b border-white/5 last:border-0 transition-all duration-300',
              entry.isActive && 'ring-2 ring-inset ring-amber-400/80 bg-amber-400/15',
            )}
            style={{ backgroundColor: entry.isActive ? undefined : colors.bg, borderLeft: `2px solid ${entry.isActive ? '#fbbf24' : colors.border}` }}
          >
            {(entry.avatar || entry.type !== 'npc') && (
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                  style={{
                    background: entry.avatar ? 'transparent' : (entry.color || colors.text),
                    boxShadow: `0 0 0 1.5px #111, 0 0 0 3px ${entry.isActive ? '#fbbf24' : (entry.color || colors.text)}`,
                    transform: 'rotate(90deg)',
                  }}
                >
                  {entry.avatar
                    ? <img src={entry.avatar} alt={entry.name} className="w-full h-full object-cover" />
                    : entry.name[0]?.toUpperCase()
                  }
                </div>
                {entry.type === 'enemy' && entry.count > 1 && (
                  <span className="text-[9px] font-bold leading-none" style={{ color: colors.text, writingMode: 'vertical-lr' }}>
                    ×{entry.count}
                  </span>
                )}
              </div>
            )}
            {entry.type !== 'enemy' && (
              <span
                className={cn(
                  'text-[11px] font-bold tracking-wider whitespace-nowrap',
                  entry.isActive && 'text-amber-300'
                )}
                style={{ writingMode: 'vertical-lr', transform: 'rotate(0deg)', color: entry.isActive ? undefined : colors.text, marginTop: '6px' }}
              >
                {entry.name.length > 12 ? entry.name.slice(0, 11) + '…' : entry.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main PlayerScreen ───
export function PlayerScreen() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [mode, setMode] = useState<'setup' | 'play'>('play');

  // Refs to avoid stale closures in IPC callbacks
  const currentScenarioIdRef = useRef(currentScenarioId);
  currentScenarioIdRef.current = currentScenarioId;

  // Track whether the player is actively dragging a token
  const isDraggingRef = useRef(false);

  // Torch state — tracks which player IDs have an active torch so that DM broadcasts
  // can't accidentally wipe the locally-set darkvision.
  const torchLitPlayerIdsRef = useRef<Set<string>>(new Set());
  const [torchLitPlayerIds, setTorchLitPlayerIds] = useState<Set<string>>(new Set());
  // Stores each player's darkvision before the torch was lit so we can restore it on douse.
  const preTorchDarkvisionRef = useRef<Record<string, number>>({});
  // Stores each player's darkvision before an ability toggle so we can restore it when toggled off.
  const preAbilityDarkvisionRef = useRef<Record<string, number>>({});

  // Sign-in state
  const [signedInSpots, setSignedInSpots] = useState<Record<SpotId, string | null>>({
    'top-left': null, 'top-right': null,
    'bottom-left': null, 'bottom-right': null,
    'left': null,
  });
  const [activePickerSpot, setActivePickerSpot] = useState<SpotId | null>(null);


  // Action ring + panel state (play mode)
  const [actionRing, setActionRing] = useState<{ tokenId: string; spotId: SpotId; x: number; y: number } | null>(null);
  const [openPanel, setOpenPanel] = useState<'spells' | 'conditions' | null>(null);

  // Ref for spell casting from drawers
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string; mapInteraction?: string; saveEffect?: string; condition?: string }, combatantId: string) => void) | null>(null);
  const startPlacingRef = useRef<((spell: { name: string; school?: string; effectRadius?: number; range?: number; shapeType?: 'point' | 'wall' | 'ring'; maxLength?: number; maxThickness?: number; blocksVision?: boolean; aoeType?: string; aoeSize?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean }, combatantId: string) => void) | null>(null);
  const addMarkersDirectlyRef = useRef<((markers: import('../types').SpellMarker[]) => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);
  const confirmCastRef = useRef<(() => void) | null>(null);
  const startMeasuringRef = useRef<((edge: 'top' | 'bottom' | 'left') => void) | null>(null);
  const cancelMeasuringRef = useRef<(() => void) | null>(null);

  // Track active player casting (for banner positioning)
  const [activeCasting, setActiveCasting] = useState<{ spotId: SpotId; spellName: string; saveAbility?: string; aoeType?: string } | null>(null);
  // Track active measuring (for banner positioning)
  const [activeMeasuring, setActiveMeasuring] = useState<{ spotId: SpotId } | null>(null);
  const [measureDistanceFeet, setMeasureDistanceFeet] = useState<number | null>(null);

  // AoE highlights received from MapView
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string } | null>(null);

  // Wall of Fire variant picker — shown when player casts Wall of Fire before choosing Wall vs Ring
  const [wallOfFirePicker, setWallOfFirePicker] = useState<{ spotId: SpotId; playerId: string; saveDc?: number } | null>(null);

  // Summon creature picker — shown when player casts a Summon spell (e.g. Summon Aberration)
  const [summonPicker, setSummonPicker] = useState<{ spotId: SpotId; playerId: string; spell: any; options: SummonOption[] } | null>(null);
  // Active summoning placement banner — drives the "Summoning X — Tap to Place" banner
  const [activeSummoning, setActiveSummoning] = useState<{ spotId: SpotId; creatureName: string } | null>(null);

  // Active combatant turn (received from DM via IPC)
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);
  // Player targeting — combatant IDs of monsters players have targeted
  const [targetedCombatantIds, setTargetedCombatantIds] = useState<Set<string>>(new Set());
  // Tremorsense — active when a player toggles Stonecunning (or similar tremorsense ability)
  const [tremorsenseData, setTremorsenseData] = useState<{ playerId: string; rangeFt: number } | null>(null);
  // Detect Magic — active when a player casts Detect Magic
  const [detectMagicData, setDetectMagicData] = useState<{ playerId: string; rangeFt: number } | null>(null);
  // Generic active emanations — persistent rings following their casters
  const [activeEmanations, setActiveEmanations] = useState<ActiveEmanation[]>([]);

  // Invisibility — tracks which players have cast Invisibility on themselves
  const [invisiblePlayerIds, setInvisiblePlayerIds] = useState<Set<string>>(new Set());
  // See Invisibility — reveals invisible tokens on the player screen
  const [seeInvisibilityPlayerIds, setSeeInvisibilityPlayerIds] = useState<Set<string>>(new Set());

  // Wild Shape — tracks which players are currently wild-shaped
  // Map of playerId -> { creatureName, originalAvatar, creatureAvatar }
  const [wildShapeData, setWildShapeData] = useState<Record<string, { creatureName: string; originalAvatar?: string; creatureAvatar: string; creatureHp: number; creatureAc: number; creatureSpeed?: string }>>({});

  // Lifted abilities state (playerId -> set of ability IDs)
  const [playerActiveAbilities, setPlayerActiveAbilities] = useState<Record<string, Set<string>>>({});
  // Active timers for abilities with durationMs (Array mapping mapped by playerId)
  const [activeTimers, setActiveTimers] = useState<import('../types').TokenTimer[]>([]);

  // Clear detect magic when its timer expires
  useEffect(() => {
    if (!detectMagicData) return;
    const timer = activeTimers.find(t => t.playerId === detectMagicData.playerId && t.abilityId === 'detect-magic');
    if (!timer) {
      setDetectMagicData(null);
      return;
    }
    const remaining = timer.durationMs - (Date.now() - timer.startTime);
    if (remaining <= 0) {
      setDetectMagicData(null);
      setActiveTimers(prev => prev.filter(t => !(t.playerId === detectMagicData.playerId && t.abilityId === 'detect-magic')));
      return;
    }
    const timeout = setTimeout(() => {
      setDetectMagicData(null);
      setActiveTimers(prev => prev.filter(t => !(t.playerId === detectMagicData.playerId && t.abilityId === 'detect-magic')));
    }, remaining);
    return () => clearTimeout(timeout);
  }, [detectMagicData, activeTimers]);

  // Clear emanations when their timers expire
  useEffect(() => {
    if (activeEmanations.length === 0) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (const em of activeEmanations) {
      const abilityId = em.spellName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const timer = activeTimers.find(t => t.playerId === em.playerId && t.abilityId === abilityId);
      if (!timer) continue; // no timer = dismiss-only, no auto-expire
      const remaining = timer.durationMs - (Date.now() - timer.startTime);
      if (remaining <= 0) {
        setActiveEmanations(prev => prev.filter(e => e.id !== em.id));
        setActiveTimers(prev => prev.filter(t => !(t.playerId === em.playerId && t.abilityId === abilityId)));
      } else {
        timeouts.push(setTimeout(() => {
          setActiveEmanations(prev => prev.filter(e => e.id !== em.id));
          setActiveTimers(prev => prev.filter(t => !(t.playerId === em.playerId && t.abilityId === abilityId)));
        }, remaining));
      }
    }
    return () => timeouts.forEach(clearTimeout);
  }, [activeEmanations, activeTimers]);

  const handleTogglePlayerAbility = (playerId: string, entry: AbilityEntry, onDarkvisionChange: (val: number) => void) => {
    setPlayerActiveAbilities(prev => {
      const current = prev[playerId] || new Set();
      const next = new Set(current);
      const isOn = next.has(entry.id);
      let timers = [...activeTimers];
      
      if (isOn) {
        next.delete(entry.id);
        timers = timers.filter(t => !(t.playerId === playerId && t.abilityId === entry.id));
        if (entry.behavior === 'darkvision' || entry.behavior === 'darkvisionSet') {
          const original = preAbilityDarkvisionRef.current[entry.id] ?? 0;
          delete preAbilityDarkvisionRef.current[entry.id];
          onDarkvisionChange(original);
        }
        if (entry.behavior === 'tremorsense') {
          setTremorsenseData(null);
        }
      } else {
        next.add(entry.id);
        if (entry.durationMs) {
          timers.push({
            playerId,
            abilityId: entry.id,
            startTime: Date.now(),
            durationMs: entry.durationMs,
            color: '#fbbf24' // default gold timer color
          });
        }
        if (entry.behavior === 'darkvision' && entry.darkvisionBonus != null) {
          const player = campaign?.players.find(p => p.id === playerId);
          preAbilityDarkvisionRef.current[entry.id] = player?.darkvision ?? 0;
          onDarkvisionChange((player?.darkvision ?? 0) + entry.darkvisionBonus);
        } else if (entry.behavior === 'darkvisionSet' && entry.darkvisionValue != null) {
          const player = campaign?.players.find(p => p.id === playerId);
          preAbilityDarkvisionRef.current[entry.id] = player?.darkvision ?? 0;
          onDarkvisionChange(entry.darkvisionValue);
        } else if (entry.behavior === 'tremorsense' && entry.tremorsenseRange != null) {
          setTremorsenseData({ playerId, rangeFt: entry.tremorsenseRange });
        }
      }
      setActiveTimers(timers);
      return { ...prev, [playerId]: next };
    });
  };

  // ── IPC ──
  useEffect(() => {
    const handleStateUpdate = (newState: { campaign: Campaign; scenarioId: string; playerMode?: string; activeCombatantId?: string | null; viewportCenter?: { x: number; y: number } | null; targetedCombatantIds?: string[] }) => {
      if (isDraggingRef.current) return;
      setCampaign(prev => {
        const incoming = newState.campaign;
        if (!incoming) return prev;
        if (!incoming.players?.length) return incoming;
        // If any players have an active torch, keep their darkvision at 40 so
        // a DM broadcast with stale data can't accidentally extinguish it.
        const litIds = torchLitPlayerIdsRef.current;
        if (litIds.size === 0) return incoming;
        return {
          ...incoming,
          players: incoming.players.map(np =>
            litIds.has(np.id) ? { ...np, darkvision: 40 } : np
          ),
        };
      });
      setCurrentScenarioId(newState.scenarioId);
      if (newState.playerMode) {
        setMode(newState.playerMode as 'setup' | 'play');
      }
      setActiveCombatantId(newState.activeCombatantId ?? null);
      if (newState.viewportCenter) {
        setViewportCenter(newState.viewportCenter);
      }
      if (newState.targetedCombatantIds) {
        setTargetedCombatantIds(new Set(newState.targetedCombatantIds));
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onStateUpdate(handleStateUpdate);
    }

    if (window.electronAPI?.onPlayerModeUpdate) {
      window.electronAPI.onPlayerModeUpdate((newMode: string) => {
        setMode(newMode as 'setup' | 'play');
      });
    }

    if (window.electronAPI?.onDMTokenUpdate) {
      window.electronAPI.onDMTokenUpdate((newTokens: Token[]) => {
        if (isDraggingRef.current) return;
        setCampaign(prev => {
          const scenarioId = currentScenarioIdRef.current;
          if (!prev || !scenarioId) return prev;
          return {
            ...prev,
            scenarios: prev.scenarios.map(s => {
              if (s.id !== scenarioId) return s;
              // Merge by ID: DM sends floor-filtered tokens, keep tokens from other floors
              const updatedIds = new Set(newTokens.map(t => t.id));
              const kept = s.tokens.filter(t => !updatedIds.has(t.id));
              return { ...s, tokens: [...kept, ...newTokens] };
            }),
          };
        });
      });
    }

    // Listen for DM spell marker updates
    if (window.electronAPI?.onDMSpellMarkerUpdate) {
      window.electronAPI.onDMSpellMarkerUpdate((markers: any) => {
        setCampaign(prev => {
          const scenarioId = currentScenarioIdRef.current;
          if (!prev || !scenarioId) return prev;
          return {
            ...prev,
            scenarios: prev.scenarios.map(s =>
              s.id === scenarioId ? { ...s, spellMarkers: markers } : s
            ),
          };
        });
      });
    }

    // Listen for DM dismiss (after DM applies damage from the modal)
    if (window.electronAPI?.onDismissPlayerAoe) {
      window.electronAPI.onDismissPlayerAoe(() => {
        cancelCastingRef.current?.();
        setActiveCasting(null);
        setAoeHighlights(null);
      });
    }

    // Request state AFTER all listeners are registered so we don't miss the response
    if (window.electronAPI?.requestStateUpdate) {
      window.electronAPI.requestStateUpdate();
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeStateUpdateListener();
        window.electronAPI.removeDMTokenUpdateListener?.();
        window.electronAPI.removeDismissPlayerAoeListener?.();
        window.electronAPI.removeDMSpellMarkerUpdateListener?.();
      }
      if (window.electronAPI?.removePlayerModeListener) {
        window.electronAPI.removePlayerModeListener();
      }
    };
  }, []);

  // ── Callbacks ──
  const handleTokensChange = useCallback((sourceFloorId: string, newTokens: Token[]) => {
    setCampaign(prev => {
      const scenarioId = currentScenarioIdRef.current;
      if (!prev || !scenarioId) return prev;
      const scenario = prev.scenarios.find(s => s.id === scenarioId);
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== scenarioId) return s;
          // Merge by ID: update existing tokens, keep tokens from other floors
          const updatedIds = new Set(newTokens.map(t => t.id));
          const kept = s.tokens.filter(t => !updatedIds.has(t.id));
          const firstFloorId = s.floors?.[0]?.id;
          const originalFloorTokenIds = new Set(s.tokens.filter(t =>
            t.floorId === sourceFloorId || (!t.floorId && sourceFloorId === firstFloorId)
          ).map(t => t.id));
          const deletedIds = new Set([...originalFloorTokenIds].filter(id => !updatedIds.has(id)));
          const surviving = kept.filter(t => !deletedIds.has(t.id));
          const merged = [...surviving, ...newTokens];
          // Send full merged array to DM
          if (window.electronAPI?.sendPlayerTokenUpdate) {
            window.electronAPI.sendPlayerTokenUpdate(merged);
          }
          return { ...s, tokens: merged };
        }),
      };
    });
  }, []);

  const handleDragStatusChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  const handleToggleTarget = useCallback((combatantId: string) => {
    setTargetedCombatantIds(prev => {
      const next = new Set(prev);
      if (next.has(combatantId)) next.delete(combatantId);
      else next.add(combatantId);
      window.electronAPI?.sendPlayerTargetUpdate?.([...next]);
      return next;
    });
  }, []);

  const handleClearTargets = useCallback(() => {
    setTargetedCombatantIds(new Set());
    window.electronAPI?.sendPlayerTargetUpdate?.([]);
  }, []);

  // ── Derived state ──
  const availablePlayers = useMemo(() => {
    if (!campaign) return [];
    const signedInIds = new Set(Object.values(signedInSpots).filter(Boolean) as string[]);
    return campaign.players.filter(p => !signedInIds.has(p.id));
  }, [campaign?.players, signedInSpots]);

  const [viewportCenter, setViewportCenter] = useState<{ x: number; y: number } | null>(null);

  const currentScenario = campaign?.scenarios.find(s => s.id === currentScenarioId) ?? null;
  const activeFloor = useMemo(() => {
    if (!currentScenario?.floors) return null;
    return currentScenario.floors.find(f => f.id === currentScenario.activeFloorId) || currentScenario.floors[0] || null;
  }, [currentScenario]);
  const activeCombatants = currentScenario?.activeCombatants || [];
  const hasInitiative = activeCombatants.length > 0 && activeCombatantId !== null;
  const stripWide = hasInitiative && activeCombatants.length >= 8;

  // ── Sign-in handlers ──
  const handleSignIn = useCallback((spotId: SpotId, playerId: string) => {
    setSignedInSpots(prev => ({ ...prev, [spotId]: playerId }));
    setActivePickerSpot(null);
  }, []);

  const handleColorChange = useCallback((playerId: string, color: string) => {
    window.electronAPI?.sendPlayerColorUpdate?.(playerId, color);
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, color } : p),
      };
    });
  }, []);

  const handleSignOut = useCallback((spotId: SpotId) => {
    setSignedInSpots(prev => ({ ...prev, [spotId]: null }));
    setActionRing(prev => prev?.spotId === spotId ? null : prev);
    setOpenPanel(null);
  }, []);

  const handleCastSpell = useCallback((spell: any) => {
    if (!actionRing) return;
    const { spotId } = actionRing;
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;

    // Detect Magic exception: activate detect magic emanation + start 10-minute timer
    if (spell?.name === 'Detect Magic') {
      setActionRing(null);
      setOpenPanel(null);
      setDetectMagicData({ playerId: player.id, rangeFt: 30 });
      setActiveTimers(prev => [
        ...prev.filter(t => !(t.playerId === player.id && t.abilityId === 'detect-magic')),
        {
          playerId: player.id,
          abilityId: 'detect-magic',
          startTime: Date.now(),
          durationMs: 600000, // 10 minutes
          color: '#22d3ee',   // cyan to match magic note color
        }
      ]);
      return;
    }

    setActionRing(null);
    setOpenPanel(null);
    // Pass mapInteraction, saveEffect, condition through so MapView knows post-cast behavior
    const enriched = {
      ...spell,
      mapInteraction: spell.mapInteraction,
      saveEffect: spell.saveEffect,
      condition: spell.condition,
    };
    startCastingRef.current?.(enriched, player.id);
    setActiveCasting({ spotId, spellName: spell.name, saveAbility: spell.saveAbility, aoeType: spell.aoeType });
  }, [actionRing, signedInSpots, campaign]);

  const handleDismissEmanation = useCallback((playerId: string, spellName: string) => {
    setActiveEmanations(prev => prev.filter(e => !(e.playerId === playerId && e.spellName === spellName)));
    const abilityId = spellName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    setActiveTimers(prev => prev.filter(t => !(t.playerId === playerId && t.abilityId === abilityId)));
  }, []);

  // Called by MapView after a cast-and-emanate spell is confirmed
  const handleEmanationCast = useCallback((spellName: string, casterId: string) => {
    const cfg = EMANATION_CONFIG[spellName];
    const color = cfg?.color ?? '#a78bfa';
    const rangeFt = lookupSpell(spellName)?.aoeSize ?? 10;
    const abilityId = spellName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Concentration: dismiss any existing emanation from this player
    setActiveEmanations(prev => {
      const dismissed = prev.filter(e => e.playerId === casterId);
      if (dismissed.length > 0) {
        setActiveTimers(at => at.filter(t => !dismissed.some(d => t.playerId === d.playerId && t.abilityId === d.spellName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))));
      }
      return [
        ...prev.filter(e => e.playerId !== casterId),
        { id: `${abilityId}-${casterId}`, spellName, playerId: casterId, rangeFt, color },
      ];
    });

    // Add timer if spell has a duration
    if (cfg?.durationMs) {
      setActiveTimers(prev => [
        ...prev.filter(t => !(t.playerId === casterId && t.abilityId === abilityId)),
        { playerId: casterId, abilityId, startTime: Date.now(), durationMs: cfg.durationMs!, color },
      ]);
    }
  }, []);

  const handleDismissInvisibility = useCallback((playerId: string) => {
    const token = campaign?.scenarios.flatMap(s => s.tokens || []).find(t => t.combatantId === playerId);
    if (token) {
      window.electronAPI?.sendPlayerInvisibleToggle?.(token.id);
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s => ({
            ...s,
            tokens: s.tokens.map(t => t.id === token.id ? { ...t, invisible: false } : t),
          })),
        };
      });
    }
    setInvisiblePlayerIds(prev => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    setActiveTimers(prev => prev.filter(t => !(t.playerId === playerId && t.abilityId === 'invisibility')));
  }, [campaign]);

  const handleDismissSeeInvisibility = useCallback((playerId: string) => {
    setSeeInvisibilityPlayerIds(prev => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
    setActiveTimers(prev => prev.filter(t => !(t.playerId === playerId && t.abilityId === 'see-invisibility')));
  }, []);

  const handlePlaceSpell = useCallback((spell: any) => {
    if (!actionRing) return;
    const { spotId } = actionRing;
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    setActionRing(null);
    setOpenPanel(null);

    // Dancing Lights exception: place 4 tokens immediately near the player's token
    if (spell?.name === 'Dancing Lights') {
      const token = campaign.scenarios.flatMap(s => s.tokens || []).find(t => t.combatantId === player.id);
      const baseX = token?.x ?? window.innerWidth / 2;
      const baseY = token?.y ?? window.innerHeight / 2;
      const offset = 30; // pixels apart in a 2x2 cluster
      const positions = [
        { x: baseX - offset, y: baseY - offset },
        { x: baseX + offset, y: baseY - offset },
        { x: baseX - offset, y: baseY + offset },
        { x: baseX + offset, y: baseY + offset },
      ];
      const dbEntry = lookupSpell('Dancing Lights');
      const markers: import('../types').SpellMarker[] = positions.map((pos, i) => ({
        id: `sm-dl-${Date.now()}-${i}`,
        spellName: 'Dancing Lights',
        school: dbEntry?.school || 'Illusion',
        casterId: player.id,
        x: pos.x,
        y: pos.y,
        effectRadius: 10,
        visibleToPlayers: true,
        lightSource: true,
      }));
      addMarkersDirectlyRef.current?.(markers);
      return;
    }

    // Wall of Fire exception: show variant picker (Wall vs Ring) before placement
    if (spell?.name === 'Wall of Fire') {
      const CASTING_ABILITY: Record<string, string> = { wizard: 'int', artificer: 'int', cleric: 'wis', druid: 'wis', ranger: 'wis', monk: 'wis', bard: 'cha', sorcerer: 'cha', warlock: 'cha', paladin: 'cha' };
      let wofSaveDc: number | undefined = (player as any).spellSaveDc;
      if (!wofSaveDc && (player as any).stats && (player as any).proficiencyBonus && (player as any).classes?.length) {
        let bestMod = -Infinity;
        for (const cls of (player as any).classes) {
          const ability = CASTING_ABILITY[cls.name?.toLowerCase?.()];
          if (ability) { const m = Math.floor(((player as any).stats[ability] - 10) / 2); if (m > bestMod) bestMod = m; }
        }
        if (bestMod !== -Infinity) wofSaveDc = 8 + (player as any).proficiencyBonus + bestMod;
      }
      setWallOfFirePicker({ spotId, playerId, saveDc: wofSaveDc });
      setOpenPanel(null);
      setActionRing(null);
      return;
    }

    // Invisibility exception: make the caster's token invisible + start 1hr timer
    if (spell?.name === 'Invisibility') {
      const token = campaign.scenarios.flatMap(s => s.tokens || []).find(t => t.combatantId === player.id);
      if (token) {
        window.electronAPI?.sendPlayerInvisibleToggle?.(token.id);
        setCampaign(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenarios: prev.scenarios.map(s => ({
              ...s,
              tokens: s.tokens.map(t => t.id === token.id ? { ...t, invisible: true } : t),
            })),
          };
        });
        setInvisiblePlayerIds(prev => new Set(prev).add(player.id));
        setActiveTimers(prev => [...prev.filter(t => !(t.playerId === player.id && t.abilityId === 'invisibility')), {
          playerId: player.id,
          abilityId: 'invisibility',
          startTime: Date.now(),
          durationMs: 3600000, // 1 hour
          color: '#a855f7', // purple
        }]);
      }
      return;
    }

    // See Invisibility exception: reveal all invisible tokens on the player screen + start 1hr timer
    if (spell?.name === 'See Invisibility') {
      setSeeInvisibilityPlayerIds(prev => new Set(prev).add(player.id));
      setActiveTimers(prev => [...prev.filter(t => !(t.playerId === player.id && t.abilityId === 'see-invisibility')), {
        playerId: player.id,
        abilityId: 'see-invisibility',
        startTime: Date.now(),
        durationMs: 3600000, // 1 hour
        color: '#a855f7', // purple
      }]);
      return;
    }

    // Detect wall-shape spell (fallback to spell DB lookup if the spell object
    // passed in doesn't carry shapeType)
    const dbEntry = lookupSpell(spell?.name || '');
    const isWallSpell = spell?.shapeType === 'wall' || dbEntry?.shapeType === 'wall';
    // Merge in DB metadata so MapView gets maxLength/maxThickness/blocksVision/shapeType
    const enrichedSpell = isWallSpell
      ? {
          ...spell,
          shapeType: 'wall' as const,
          maxLength: spell?.maxLength ?? dbEntry?.maxLength,
          maxThickness: spell?.maxThickness ?? dbEntry?.maxThickness,
          blocksVision: spell?.blocksVision ?? dbEntry?.blocksVision,
        }
      : spell;
    startPlacingRef.current?.(enrichedSpell, player.id);
    // Wall-shape placements (e.g. Wall of Sand) get the same bottom casting banner
    // as other cast spells, so the player can Confirm/Cancel from their drawer edge.
    if (isWallSpell) {
      setActiveCasting({ spotId, spellName: spell.name, saveAbility: undefined });
    }
  }, [actionRing, signedInSpots, campaign]);

  const handleSummonSpell = useCallback((spell: any) => {
    if (!actionRing) return;
    const { spotId } = actionRing;
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;

    // Look up available summon options for this spell
    const options = SUMMON_OPTIONS[spell.name];
    if (!options || options.length === 0) return;

    setActionRing(null);
    setOpenPanel(null);
    setSummonPicker({ spotId, playerId, spell, options });
  }, [actionRing, signedInSpots, campaign]);

  const handleWildShape = useCallback((spotId: SpotId, creature: Monster) => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    setActionRing(null);
    setOpenPanel(null);

    // Resolve creature size (e.g. "Small/Medium" → "Small")
    const creatureSize = (creature.size?.split('/')[0]?.trim() as Token['size']) || 'Medium';
    // Find the player's current token to save original size for revert
    const playerToken = campaign.scenarios.flatMap(s => s.tokens).find(t => t.combatantId === playerId);
    const originalSize = playerToken?.size || 'Medium';

    // Store wild shape state locally
    setWildShapeData(prev => ({
      ...prev,
      [playerId]: {
        creatureName: creature.name,
        originalAvatar: player.avatar,
        creatureAvatar: creature.avatar || `/tokens/${creature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.jpg`,
        creatureHp: creature.hp,
        creatureAc: creature.ac,
        creatureSpeed: creature.speed,
        originalSize,
      },
    }));

    // Update local campaign so token avatar and size change immediately
    const creatureAvatar = creature.avatar || `/tokens/${creature.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.jpg`;
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, avatar: creatureAvatar } : p),
        scenarios: prev.scenarios.map(s => ({
          ...s,
          tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, avatar: creatureAvatar, size: creatureSize } : t),
        })),
      };
    });

    // Notify DM (include originalAvatar/originalSize so DM can revert correctly)
    window.electronAPI?.sendPlayerWildShape?.({
      playerId,
      creatureName: creature.name,
      creatureAvatar,
      originalAvatar: player.avatar,
      creatureHp: creature.hp,
      creatureAc: creature.ac,
      creatureSpeed: creature.speed,
      creatureSize,
      originalSize,
    });
  }, [signedInSpots, campaign]);

  const handleRevertWildShape = useCallback((spotId: SpotId) => {
    const playerId = signedInSpots[spotId];
    if (!playerId) return;
    const wsData = wildShapeData[playerId];
    if (!wsData) return;

    const originalAvatar = wsData.originalAvatar;
    const originalSize = (wsData as any).originalSize as Token['size'] || 'Medium';

    // Notify DM FIRST so the IPC is dispatched before any local state changes
    console.log('[Player] Sending wild shape revert for', playerId, { originalAvatar, originalSize });
    window.electronAPI?.sendPlayerWildShape?.({ playerId, revert: true, originalAvatar, originalSize });

    setActionRing(null);
    setOpenPanel(null);

    // Clear wild shape state
    setWildShapeData(prev => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });

    // Restore original avatar and size locally
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map(p => p.id === playerId ? { ...p, avatar: originalAvatar } : p),
        scenarios: prev.scenarios.map(s => ({
          ...s,
          tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, avatar: originalAvatar, size: originalSize } : t),
        })),
      };
    });
  }, [signedInSpots, wildShapeData]);

  const handleConditionToggle = useCallback((spotId: SpotId, condition: string) => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    const current = new Set(player.conditions || []);
    if (current.has(condition)) current.delete(condition);
    else current.add(condition);
    const newConditions = Array.from(current);
    window.electronAPI?.sendPlayerConditionUpdate?.(player.id, newConditions);
    setCampaign(prev => {
      if (!prev) return prev;
      return { ...prev, players: prev.players.map(p => p.id === player.id ? { ...p, conditions: newConditions } : p) };
    });
  }, [signedInSpots, campaign]);

  const handleLightTorch = useCallback((spotId: SpotId) => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    const newDarkvision = Math.max(40, player.darkvision ?? 0);
    if (newDarkvision === (player.darkvision ?? 0)) return; // already >= 40ft, no change
    // Remember the original darkvision so we can restore it on douse
    preTorchDarkvisionRef.current[player.id] = player.darkvision ?? 0;
    torchLitPlayerIdsRef.current.add(player.id);
    setTorchLitPlayerIds(prev => new Set([...prev, player.id]));
    window.electronAPI?.sendPlayerDarkvisionUpdate?.(player.id, newDarkvision);
    setCampaign(prev => {
      if (!prev) return prev;
      return { ...prev, players: prev.players.map(p => p.id === player.id ? { ...p, darkvision: newDarkvision } : p) };
    });
  }, [signedInSpots, campaign]);

  const handleDouseTorch = useCallback((spotId: SpotId) => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    const original = preTorchDarkvisionRef.current[player.id] ?? 0;
    delete preTorchDarkvisionRef.current[player.id];
    torchLitPlayerIdsRef.current.delete(player.id);
    setTorchLitPlayerIds(prev => { const next = new Set(prev); next.delete(player.id); return next; });
    window.electronAPI?.sendPlayerDarkvisionUpdate?.(player.id, original);
    setCampaign(prev => {
      if (!prev) return prev;
      return { ...prev, players: prev.players.map(p => p.id === player.id ? { ...p, darkvision: original } : p) };
    });
  }, [signedInSpots, campaign]);

  const handlePlayerTokenDoubleTap = useCallback((tokenId: string, screenX: number, screenY: number) => {
    // Look up the token's combatantId (token.id is a random string, not the player ID)
    const token = currentScenario?.tokens.find(t => t.id === tokenId);
    const combatantId = token?.combatantId ?? tokenId;
    console.log('[PlayerScreen] handlePlayerTokenDoubleTap:', { tokenId, combatantId, signedInSpots, scenarioTokenCount: currentScenario?.tokens.length });
    // Match combatantId against signed-in player IDs
    const spotEntry = Object.entries(signedInSpots).find(([, playerId]) => playerId === combatantId);
    if (!spotEntry) {
      console.log('[PlayerScreen] No matching signed-in spot for combatantId:', combatantId);
      return;
    }
    const spotId = spotEntry[0] as SpotId;
    console.log('[PlayerScreen] Opening spells panel for spot:', spotId, 'at', screenX, screenY);
    setActionRing({ tokenId, spotId, x: screenX, y: screenY });
    setOpenPanel('spells');
  }, [signedInSpots, currentScenario]);

  // ── Helper: get player combatant for a spot ──
  const getPlayerForSpot = (spotId: SpotId): Combatant | null => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return null;
    return campaign.players.find(p => p.id === playerId) || null;
  };

  // Close picker when clicking/tapping outside
  useEffect(() => {
    if (!activePickerSpot) return;
    const openedAt = Date.now();
    const handleClick = () => {
      // Ignore clicks that fire within 300ms of opening (touch event double-fire)
      if (Date.now() - openedAt < 300) return;
      setActivePickerSpot(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('touchend', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('touchend', handleClick);
    };
  }, [activePickerSpot]);

  // ── No campaign yet ──
  if (!campaign) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Awaiting DM Connection...
      </div>
    );
  }

  // ── Spot position configs ──
  const spotConfigs: Record<SpotId, { rotation: number; edge: 'top' | 'bottom' | 'left'; setupClass: string; drawerClass: string }> = {
    'top-left':     { rotation: 180, edge: 'top',    setupClass: 'top-6 left-[25%] -translate-x-1/2',     drawerClass: '-translate-x-1/2' },
    'top-right':    { rotation: 180, edge: 'top',    setupClass: 'top-6 left-[62%] -translate-x-1/2',     drawerClass: '-translate-x-1/2' },
    'bottom-left':  { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 left-[25%] -translate-x-1/2',  drawerClass: '-translate-x-1/2' },
    'bottom-right': { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 left-[62%] -translate-x-1/2',  drawerClass: '-translate-x-1/2' },
  };

  // ── SETUP MODE ──
  if (mode === 'setup') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_50%_50%,_rgba(205,127,50,0.3),_transparent_70%)]" />

        {/* Center title */}
        <div className="text-center z-0 select-none">
          <div className="text-white/10 font-serif text-5xl font-bold tracking-[0.3em] mb-3">PLAYER SCREEN</div>
          <div className="text-white/5 font-sans text-sm tracking-[0.2em] uppercase">Sign in at your seat</div>
        </div>

        {/* Sign-in spots */}
        {SPOT_IDS.map(spotId => {
          const config = spotConfigs[spotId];
          return (
            <SignInSpot
              key={spotId}
              player={getPlayerForSpot(spotId)}
              availablePlayers={availablePlayers}
              showPicker={activePickerSpot === spotId}
              onTogglePicker={() => setActivePickerSpot(prev => prev === spotId ? null : spotId)}
              onSignIn={(playerId) => handleSignIn(spotId, playerId)}
              onSignOut={() => handleSignOut(spotId)}
              onColorChange={handleColorChange}
              rotation={config.rotation}
              className={config.setupClass}
              edge={config.edge}
            />
          );
        })}
      </div>
    );
  }

  // ── No scenario loaded ──
  if (!currentScenarioId || !currentScenario) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Loading Scenario...
      </div>
    );
  }

  // ── PLAY MODE ──
  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      {/* Map View - leaves room for initiative strip on right if active */}
      <div className={cn('absolute inset-0', hasInitiative && (stripWide ? 'right-24' : 'right-12'))}>
        <FloorMapContainer
          scenario={currentScenario}
          allTokens={currentScenario.tokens || []}
          activeFloorId={currentScenario.activeFloorId || null}
          onTokensChange={handleTokensChange}
          onMapChange={() => {}}
          onMapNotesChange={() => {}}
          players={campaign.players || []}
          npcs={campaign.npcs || []}
          persistentEnemies={campaign.persistentEnemies || []}
          onUpdateCombatantHp={() => {}}
          onAddEnemy={() => {}}
          onStartCombat={() => {}}
          leftSidebarOpen={false}
          setLeftSidebarOpen={() => {}}
          isPlayerView={true}
          onPortalToggle={(portalId) => window.electronAPI?.sendPlayerPortalToggle?.(portalId)}
          onDragStatusChange={handleDragStatusChange}
          viewportCenter={viewportCenter}
          startCastingRef={startCastingRef}
          startPlacingRef={startPlacingRef}
          addMarkersDirectlyRef={addMarkersDirectlyRef}
          cancelCastingRef={cancelCastingRef}
          confirmCastRef={confirmCastRef}
          onCastingDismissed={() => { setActiveCasting(null); setActiveSummoning(null); setAoeHighlights(null); }}
          onEmanationCast={handleEmanationCast}
          startMeasuringRef={startMeasuringRef}
          cancelMeasuringRef={cancelMeasuringRef}
          onMeasureDistanceChange={(feet) => setMeasureDistanceFeet(feet)}
          onAoeHighlightsChange={setAoeHighlights}
          activeCombatantId={activeCombatantId}
          onPlayerTokenDoubleTap={handlePlayerTokenDoubleTap}
          targetedCombatantIds={targetedCombatantIds}
          onToggleTarget={handleToggleTarget}
          onClearTargets={handleClearTargets}
          spellMarkers={currentScenario?.spellMarkers || []}
          onSpellMarkersChange={(markers) => {
            window.electronAPI?.sendPlayerSpellMarkerUpdate?.(markers);
            setCampaign(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                scenarios: prev.scenarios.map(s =>
                  s.id === currentScenarioId ? { ...s, spellMarkers: markers } : s
                ),
              };
            });
          }}
          tremorsenseData={tremorsenseData}
          detectMagicData={detectMagicData}
          activeEmanations={activeEmanations}
          seeInvisibility={seeInvisibilityPlayerIds.size > 0}
          activeTimers={activeTimers}
        />
      </div>

      {/* Casting Banner — positioned near the casting player's drawer */}
      {activeCasting && (() => {
        const config = spotConfigs[activeCasting.spotId];
        const edge = config.edge;
        // Position the banner inset from the edge, near the drawer
        const posClass = edge === 'top'
          ? 'top-4 left-1/2 -translate-x-1/2 rotate-180'
          : edge === 'left'
          ? 'left-4 top-1/2 -translate-y-1/2 origin-left rotate-90'
          : 'bottom-4 left-1/2 -translate-x-1/2';
        return (
          <div className={cn('absolute z-50 pointer-events-auto', posClass)}>
            <div className="bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-sm font-bold text-orange-400">Casting {activeCasting.spellName}</span>
              {!aoeHighlights?.saveResults && (
                <span className="text-xs text-white/40">
                  {activeCasting.aoeType === 'emanation' ? 'Centered on you' : 'Drag to place'}
                </span>
              )}
              {!aoeHighlights?.saveResults && (
                <button
                  onClick={() => confirmCastRef.current?.()}
                  onPointerDown={(e) => e.preventDefault()}
                  className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                >
                  {(activeCasting.saveAbility || activeCasting.aoeType === 'emanation') ? 'Confirm Cast' : 'Place'}
                </button>
              )}
              {aoeHighlights?.saveResults && (
                <span className="text-xs text-white/40">Roll for damage and tell the DM</span>
              )}
              {!aoeHighlights?.saveResults && (
                <button
                  onClick={() => { cancelCastingRef.current?.(); setActiveCasting(null); setAoeHighlights(null); }}
                  onPointerDown={(e) => e.preventDefault()}
                  className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Measuring Banner */}
      {activeMeasuring && (() => {
        const config = spotConfigs[activeMeasuring.spotId];
        const edge = config.edge;
        const posClass = edge === 'top'
          ? 'top-4 left-1/2 -translate-x-1/2 rotate-180'
          : edge === 'left'
          ? 'left-4 top-1/2 -translate-y-1/2 origin-left rotate-90'
          : 'bottom-4 left-1/2 -translate-x-1/2';
        return (
          <div className={cn('absolute z-50 pointer-events-auto', posClass)}>
            <div className="bg-black/80 border border-yellow-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-yellow-500/10">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              {measureDistanceFeet != null
                ? <span className="text-sm font-bold text-yellow-300">{measureDistanceFeet} ft</span>
                : <span className="text-sm font-bold text-yellow-400">Measuring</span>
              }
              <span className="text-xs text-white/40">Touch &amp; drag to measure</span>
              <button
                onClick={() => { cancelMeasuringRef.current?.(); setActiveMeasuring(null); setMeasureDistanceFeet(null); }}
                onPointerDown={(e) => e.preventDefault()}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Spells Panel — opens directly on double-tap, no action ring step */}
      {actionRing && openPanel === 'spells' && (() => {
        const player = getPlayerForSpot(actionRing.spotId);
        if (!player) return null;
        const config = spotConfigs[actionRing.spotId];
        const playerId = signedInSpots[actionRing.spotId];
        const activeEntry = activeCombatants.find(c => c.id === activeCombatantId);
        const isPlayersTurn = !!(activeEntry && activeEntry.sourceCombatantId === playerId);
        const isTorchLit = !!(playerId && torchLitPlayerIds.has(playerId));

        const handleDarkvisionChange = (newValue: number) => {
          if (!playerId) return;
          window.electronAPI?.sendPlayerDarkvisionUpdate?.(playerId, newValue);
          setCampaign(prev => {
            if (!prev) return prev;
            return { ...prev, players: prev.players.map(p => p.id === playerId ? { ...p, darkvision: newValue } : p) };
          });
        };

        return (
          <SpellsPanel
            player={player}
            anchorX={actionRing.x}
            anchorY={actionRing.y}
            edge={config.edge}
            onCast={handleCastSpell}
            onPlace={handlePlaceSpell}
            onSummon={handleSummonSpell}
            onClose={() => { setOpenPanel(null); setActionRing(null); }}
            onDarkvisionChange={handleDarkvisionChange}
            preAbilityDarkvisionRef={preAbilityDarkvisionRef}
            onTremorsenseChange={setTremorsenseData}
            activeAbilities={playerActiveAbilities[player.id] || new Set()}
            onToggleAbility={(entry) => handleTogglePlayerAbility(player.id, entry, handleDarkvisionChange)}
            isTorchLit={isTorchLit}
            onToggleTorch={() => {
              if (isTorchLit) handleDouseTorch(actionRing.spotId);
              else handleLightTorch(actionRing.spotId);
            }}
            onMeasure={() => {
              const spotId = actionRing.spotId;
              const edge = spotConfigs[spotId].edge;
              setActionRing(null);
              setOpenPanel(null);
              startMeasuringRef.current?.(edge);
              setActiveMeasuring({ spotId });
              setMeasureDistanceFeet(null);
            }}
            isPlayersTurn={isPlayersTurn}
            onEndTurn={() => { window.electronAPI?.sendPlayerEndTurn?.(); setActionRing(null); setOpenPanel(null); }}
            onWildShape={(creature) => handleWildShape(actionRing.spotId, creature)}
            isWildShaped={!!(playerId && wildShapeData[playerId])}
            onRevertWildShape={() => handleRevertWildShape(actionRing.spotId)}
            activeEmanations={playerId ? activeEmanations.filter(e => e.playerId === playerId) : []}
            onDismissEmanation={(spellName) => playerId && handleDismissEmanation(playerId, spellName)}
            invisibilityActive={!!(playerId && invisiblePlayerIds.has(playerId))}
            onDismissInvisibility={() => playerId && handleDismissInvisibility(playerId)}
            seeInvisibilityActive={!!(playerId && seeInvisibilityPlayerIds.has(playerId))}
            onDismissSeeInvisibility={() => playerId && handleDismissSeeInvisibility(playerId)}
          />
        );
      })()}

      {/* Wall of Fire variant picker */}
      {wallOfFirePicker && (() => {
        const { spotId, playerId, saveDc: wofSaveDc } = wallOfFirePicker;
        const handleVariant = (variant: 'wall' | 'ring') => {
          setWallOfFirePicker(null);
          if (variant === 'wall') {
            startPlacingRef.current?.({ name: 'Wall of Fire', school: 'Evocation', shapeType: 'wall', maxLength: 60, maxThickness: 1, blocksVision: false, saveAbility: 'dex', saveDc: wofSaveDc, halfDamageOnSave: true }, playerId);
            setActiveCasting({ spotId, spellName: 'Wall of Fire', saveAbility: 'dex' });
          } else {
            startPlacingRef.current?.({ name: 'Wall of Fire (Ring)', school: 'Evocation', shapeType: 'ring', saveAbility: 'dex', saveDc: wofSaveDc, halfDamageOnSave: true }, playerId);
            setActiveCasting({ spotId, spellName: 'Wall of Fire (Ring)', saveAbility: 'dex' });
          }
        };
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto bg-black/60">
            <div className="bg-[#1a1a2e] border border-orange-500/40 rounded-2xl p-6 shadow-2xl shadow-orange-500/10 flex flex-col items-center gap-4 min-w-[240px]">
              <div className="flex items-center gap-2">
                <span className="text-orange-400 text-lg">🔥</span>
                <span className="text-white font-bold text-sm tracking-wide">Wall of Fire</span>
              </div>
              <p className="text-white/50 text-xs text-center">Choose a shape</p>
              <div className="flex gap-3 w-full">
                <button
                  onPointerDown={() => handleVariant('wall')}
                  className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40 active:bg-orange-500/40 transition-colors flex flex-col items-center gap-1"
                >
                  <span className="text-base">⬜</span>
                  Wall
                  <span className="text-[9px] text-white/30 normal-case font-normal">60 ft long</span>
                </button>
                <button
                  onPointerDown={() => handleVariant('ring')}
                  className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/40 active:bg-orange-500/40 transition-colors flex flex-col items-center gap-1"
                >
                  <span className="text-base">⭕</span>
                  Ring
                  <span className="text-[9px] text-white/30 normal-case font-normal">20 ft diameter</span>
                </button>
              </div>
              <button
                onPointerDown={() => setWallOfFirePicker(null)}
                className="text-white/25 text-xs hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}
      {/* Summon Creature Picker */}
      {summonPicker && (() => {
        const { spotId, playerId, spell, options } = summonPicker;
        const player = campaign?.players.find(p => p.id === playerId);
        const handleSummonChoice = (option: SummonOption) => {
          setSummonPicker(null);
          setActiveSummoning({ spotId, creatureName: option.name });
          // Pass summon data through starting placing so MapView knows to create a token instead of a spell marker
          startPlacingRef.current?.({
            name: `Summon: ${option.name}`,
            school: spell.school || 'Conjuration',
            summonData: {
              creatureName: option.name,
              spellName: option.spellName,
              casterId: playerId,
              playerColor: player?.color || '#3b82f6',
              size: option.size,
            },
          } as any, playerId);
        };
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto bg-black/60">
            <div className="bg-[#1a1a2e] border border-teal-500/40 rounded-2xl p-6 shadow-2xl shadow-teal-500/10 flex flex-col items-center gap-4 min-w-[280px]">
              <div className="flex items-center gap-2">
                <span className="text-teal-400 text-lg">✦</span>
                <span className="text-white font-bold text-sm tracking-wide">{spell.name}</span>
              </div>
              <p className="text-white/50 text-xs text-center">Choose a creature to summon</p>
              <div className="flex flex-col gap-2 w-full">
                {options.map(option => (
                  <button
                    key={option.name}
                    onPointerDown={() => handleSummonChoice(option)}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-teal-500/15 text-teal-300 border border-teal-500/30 active:bg-teal-500/30 transition-colors flex items-center justify-between gap-3"
                  >
                    <span className="text-sm normal-case font-semibold">{option.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                        HP {option.hp}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        AC {option.ac}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">
                        Summon
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onPointerDown={() => setSummonPicker(null)}
                className="text-white/25 text-xs hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Summoning Banner — positioned near the summoning player's drawer */}
      {activeSummoning && (() => {
        const config = spotConfigs[activeSummoning.spotId];
        const edge = config.edge;
        const posClass = edge === 'top'
          ? 'top-4 left-1/2 -translate-x-1/2 rotate-180'
          : edge === 'left'
          ? 'left-4 top-1/2 -translate-y-1/2 origin-left rotate-90'
          : 'bottom-4 left-1/2 -translate-x-1/2';
        return (
          <div className={cn('absolute z-50 pointer-events-auto', posClass)}>
            <div className="bg-black/80 border border-teal-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-teal-500/10">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-sm font-bold text-teal-400">Summoning {activeSummoning.creatureName}</span>
              <span className="text-xs text-white/40">Tap to Place</span>
              <button
                onClick={() => { cancelCastingRef.current?.(); setActiveSummoning(null); }}
                onPointerDown={(e) => e.preventDefault()}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Conditions Panel — commented out, may restore later */}
      {/* {actionRing && openPanel === 'conditions' && (() => {
        const player = getPlayerForSpot(actionRing.spotId);
        if (!player) return null;
        const config = spotConfigs[actionRing.spotId];
        return (
          <ConditionsPanel
            player={player}
            anchorX={actionRing.x}
            anchorY={actionRing.y}
            edge={config.edge}
            onToggle={(cond) => handleConditionToggle(actionRing.spotId, cond)}
            onClose={() => { setOpenPanel(null); setActionRing(null); }}
          />
        );
      })()} */}

      {/* Initiative Strip */}
      {hasInitiative && <InitiativeStrip combatants={activeCombatants} activeCombatantId={activeCombatantId} wide={stripWide} />}
    </div>
  );
}
