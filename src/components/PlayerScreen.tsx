import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { FloorMapContainer } from './FloorMapContainer';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Campaign, Token, Combatant, cn } from '../types';
import { searchSpells } from '../data/spellDatabase';
import { User, Search, X, LogOut, Circle, Cone, Cylinder, Box, Slash, BookOpen, Zap, ChevronRight, Flame, Ruler } from '../icons';
import { motion, AnimatePresence } from 'motion/react';
import actionsData from '../data/actions.json';
import { parseDamageType, DamageTypeBadge } from '../utils/damageColors';
import { parseActionAoe, ActionAoe, parseSpellDamage, rollAction, RollMode, ActionRollResult } from '../utils/actionParser';
import { ActionRollModal } from './ActionRollModal';
import { lookupSpell } from '../data/spellDatabase';

// Spells with range 0 (touch) that should still appear as placeable map markers
const PLACEABLE_EXCEPTIONS = ['Light'];

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
    { label: 'Spells &\nAbils', icon: BookOpen, color: 'bg-[#1a0d2e] border-purple-500/40 text-purple-400', onClick: onSpells },
    { label: 'Conditions', icon: Zap,      color: 'bg-[#1a1500] border-yellow-500/40 text-yellow-300', onClick: onConditions },
    {
      label: isTorchLit ? 'Douse' : 'Torch',
      icon: Flame,
      color: isTorchLit
        ? 'bg-[#1a1200] border-orange-400/60 text-orange-300 opacity-60'
        : 'bg-[#1a0e00] border-orange-500/40 text-orange-400',
      onClick: onToggleTorch,
    },
    { label: 'Measure', icon: Ruler, color: 'bg-[#0a001a] border-indigo-500/40 text-indigo-400', onClick: onMeasure },
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
  disabled?: boolean;
}> = ({ spell, spellSaveDc, spellAttackBonus, onPress, onPlace, disabled }) => {
  const hasAoe = !!(spell.aoeType && spell.aoeSize);
  const isPlaceable = !hasAoe && (PLACEABLE_EXCEPTIONS.includes(spell.name) || (spell.range != null && spell.range > 0));
  // Resolve effective description: prefer spell.desc, fall back to local DB if it yields no damage
  const localEntry = !hasAoe ? lookupSpell(spell.name) : null;
  const effectiveDesc = spell.desc || localEntry?.desc || '';
  const damageType = effectiveDesc ? parseDamageType(effectiveDesc) : null;
  return (
    <div className="flex items-center gap-2 py-2">
      <span className={cn(
        'font-bold flex-1 min-w-0 truncate text-xs',
        hasAoe && !disabled ? 'text-purple-400' : isPlaceable && !disabled && onPlace ? 'text-purple-400' : 'text-white/40'
      )}>{spell.name}</span>
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
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded opacity-40">
          {spell.level === 0 ? 'C' : spell.level}
        </span>
        {hasAoe && !disabled && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onPress(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 active:bg-[var(--accent)]/40 transition-colors"
          >
            Cast
          </button>
        )}
        {isPlaceable && !disabled && onPlace && (
          <button
            onPointerDown={(e) => { e.stopPropagation(); onPlace(); }}
            className="ml-1 shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/40 active:bg-purple-500/40 transition-colors"
          >
            Place
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
  onClose: () => void;
  onDarkvisionChange: (newValue: number) => void;
  preAbilityDarkvisionRef: React.MutableRefObject<Record<string, number>>;
}> = ({ player, anchorX, anchorY, edge, onCast, onPlace, onClose, onDarkvisionChange, preAbilityDarkvisionRef }) => {
  const spells = player.spells || [];

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

  const [activeAbilities, setActiveAbilities] = useState<Set<string>>(new Set());

  const handleToggleAbility = (entry: AbilityEntry) => {
    const isOn = activeAbilities.has(entry.id);
    const next = new Set(activeAbilities);
    if (isOn) {
      next.delete(entry.id);
      if (entry.behavior === 'darkvision' || entry.behavior === 'darkvisionSet') {
        const original = preAbilityDarkvisionRef.current[entry.id] ?? (player.darkvision ?? 0);
        delete preAbilityDarkvisionRef.current[entry.id];
        onDarkvisionChange(original);
      }
    } else {
      next.add(entry.id);
      if (entry.behavior === 'darkvision' && entry.darkvisionBonus != null) {
        preAbilityDarkvisionRef.current[entry.id] = player.darkvision ?? 0;
        onDarkvisionChange((player.darkvision ?? 0) + entry.darkvisionBonus);
      } else if (entry.behavior === 'darkvisionSet' && entry.darkvisionValue != null) {
        preAbilityDarkvisionRef.current[entry.id] = player.darkvision ?? 0;
        onDarkvisionChange(entry.darkvisionValue);
      }
    }
    setActiveAbilities(next);
  };

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'abilities' | 'lookup'>('my');
  const [enabledSources, setEnabledSources] = useState<Set<'2014' | '2024'>>(new Set(['2014', '2024']));
  const [recentSpells, setRecentSpells] = useState<any[]>([]);
  const [spellSearch, setSpellSearch] = useState('');

  // Prevent accidental taps: spells are not tappable for 400ms after the panel opens
  // Block spell taps until the pointer that opened the panel has been fully released.
  // This prevents "pass-through" taps where the finger used to tap "Spells" also triggers a spell.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onUp = () => setReady(true);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointerup', onUp);
  }, []);

  const searchResults = useMemo(() => {
    if (spellSearch.trim().length < 2) return [];
    // Include AoE spells (for Cast), placeable spells (range > 0, no aoeType), and named exceptions
    return searchSpells(spellSearch, 40, { sources: enabledSources }).filter(spell =>
      (spell.aoeType && spell.aoeSize) ||
      (!spell.aoeType && spell.range != null && spell.range > 0) ||
      PLACEABLE_EXCEPTIONS.includes(spell.name)
    ).slice(0, 20);
  }, [spellSearch, enabledSources]);

  const toggleSource = (src: '2014' | '2024') => {
    setEnabledSources(prev => {
      const next = new Set(prev);
      if (next.has(src) && next.size > 1) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const handleSpellTap = (spell: any) => {
    const halfDamageOnSave = spell.halfDamageOnSave ?? /half (as much )?damage|half damage/i.test(spell.desc || '');
    onCast({ ...spell, saveDc: spellSaveDc, halfDamageOnSave });
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
        transformOrigin: 'center top',
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
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
            style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32') }}
          >
            {player.avatar ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" /> : player.name[0]?.toUpperCase()}
          </div>
          <span className="text-white font-bold text-xs tracking-wide">{player.name}</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X size={14} className="text-white/40" />
        </button>
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
      </div>

      {/* My Spells */}
      {activeTab === 'my' && (
        <div className="max-h-[280px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="divide-y divide-white/10">
            {spells.length === 0 ? (
              <div className="text-white/15 text-xs text-center py-3 border border-dashed border-white/10 rounded-lg">No spells</div>
            ) : spells.map((spell, i) => (
              <SpellRow
                key={i}
                spell={spell}
                spellSaveDc={spellSaveDc}
                spellAttackBonus={spellAttackBonus}
                disabled={!ready}
                onPress={() => {
                  if (!(spell.aoeType && spell.aoeSize)) return;
                  const half = spell.halfDamageOnSave ?? /half (as much )?damage|half damage/i.test(spell.desc || '');
                  onCast({ ...spell, saveDc: spellSaveDc, halfDamageOnSave: half });
                }}
                onPlace={() => onPlace(spell)}
                onRoll={(mode) => {
                  const localDesc = lookupSpell(spell.name)?.desc || '';
                  const groups = parseSpellDamage(spell.desc || '') ?? parseSpellDamage(localDesc);
                  if (!groups) return;
                  const bonus = spellAttackBonus ?? 0;
                  const result = rollAction({ attackBonus: bonus, damageGroups: groups }, mode);
                  setRollModal({ name: spell.name, result });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Abilities */}
      {activeTab === 'abilities' && (
        <div className="max-h-[280px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="divide-y divide-white/10">
            {abilities.flatMap(entry => {
              const isInteractive = entry.behavior === 'toggle' || entry.behavior === 'darkvision' || entry.behavior === 'darkvisionSet';
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

              // Standard single-AoE castable ability
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
                 <SpellRow key={`r-${i}`} spell={spell} spellSaveDc={spellSaveDc} spellAttackBonus={spellAttackBonus} disabled={!ready} onPress={() => handleSpellTap(spell)} onPlace={() => onPlace(spell)} />
                ))}
              </div>
            </div>
          )}
          {searchResults.length > 0 && (
            <div className="divide-y divide-white/10 max-h-[150px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-2">
              {searchResults.map((spell, i) => (
                <SpellRow key={`s-${i}`} spell={spell} spellSaveDc={spellSaveDc} spellAttackBonus={spellAttackBonus} disabled={!ready} onPress={() => handleSpellTap(spell)} onPlace={() => onPlace(spell)} />
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
        transformOrigin: 'center top',
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
  behavior: 'toggle' | 'darkvision' | 'darkvisionSet' | 'display' | 'wip';
  darkvisionBonus?: number;
  darkvisionValue?: number;
  variants?: Array<{ label: string; aoeType: string; aoeSize: number }>;
}

// ─── Initiative Strip ───
// Condenses multiple enemies of the same name into a single entry.
interface StripEntry {
  key: string;
  name: string;
  type: 'player' | 'enemy' | 'npc';
  count: number;
  isActive: boolean;
}

const InitiativeStrip: React.FC<{
  combatants: Combatant[];
  activeCombatantId?: string | null;
}> = ({ combatants, activeCombatantId }) => {
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
  const entries = useMemo(() => {
    const result: StripEntry[] = [];
    for (const c of sorted) {
      const isActive = c.id === activeCombatantId;

      if (c.type === 'enemy') {
        const prev = result[result.length - 1];
        if (prev && prev.type === 'enemy' && prev.name === c.name) {
          prev.count += 1;
          if (isActive) prev.isActive = true;
          continue;
        }
      }
      result.push({ key: c.id, name: c.name, type: c.type, count: 1, isActive });
    }
    return result;
  }, [sorted, activeCombatantId]);

  const typeColor = (type: string) => {
    if (type === 'player') return { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.2)' };
    if (type === 'enemy') return { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' };
    return { bg: 'rgba(96,165,250,0.08)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' };
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-12 bg-black/80 border-l border-white/10 flex flex-col z-20 backdrop-blur-sm">
      {entries.map((entry) => {
        const colors = typeColor(entry.type);
        return (
          <div
            key={entry.key}
            className={cn(
              'flex-1 flex flex-col items-center justify-center border-b border-white/5 last:border-0 min-h-[40px] transition-all duration-300',
              entry.isActive && 'ring-2 ring-inset ring-amber-400/80 bg-amber-400/15',
            )}
            style={{ backgroundColor: entry.isActive ? undefined : colors.bg, borderLeft: `2px solid ${entry.isActive ? '#fbbf24' : colors.border}` }}
          >
            <span
              className={cn(
                'text-[11px] font-bold tracking-wider whitespace-nowrap',
                entry.isActive && 'text-amber-300'
              )}
              style={{ writingMode: 'vertical-lr', transform: 'rotate(0deg)', color: entry.isActive ? undefined : colors.text }}
            >
              {entry.name}
            </span>
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
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }, combatantId: string) => void) | null>(null);
  const startPlacingRef = useRef<((spell: { name: string; school?: string; effectRadius?: number; range?: number }, combatantId: string) => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);
  const confirmCastRef = useRef<(() => void) | null>(null);
  const startMeasuringRef = useRef<((edge: 'top' | 'bottom' | 'left') => void) | null>(null);
  const cancelMeasuringRef = useRef<(() => void) | null>(null);

  // Track active player casting (for banner positioning)
  const [activeCasting, setActiveCasting] = useState<{ spotId: SpotId; spellName: string; saveAbility?: string } | null>(null);
  // Track active measuring (for banner positioning)
  const [activeMeasuring, setActiveMeasuring] = useState<{ spotId: SpotId } | null>(null);
  const [measureDistanceFeet, setMeasureDistanceFeet] = useState<number | null>(null);

  // AoE highlights received from MapView
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string } | null>(null);

  // Active combatant turn (received from DM via IPC)
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);
  // Player targeting — combatant IDs of monsters players have targeted
  const [targetedCombatantIds, setTargetedCombatantIds] = useState<Set<string>>(new Set());

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
  const hasInitiative = activeCombatants.length > 0;

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
    setActionRing(null);
    setOpenPanel(null);
    startCastingRef.current?.(spell, player.id);
    setActiveCasting({ spotId, spellName: spell.name, saveAbility: spell.saveAbility });
  }, [actionRing, signedInSpots, campaign]);

  const handlePlaceSpell = useCallback((spell: any) => {
    if (!actionRing) return;
    const { spotId } = actionRing;
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return;
    const player = campaign.players.find(p => p.id === playerId);
    if (!player) return;
    setActionRing(null);
    setOpenPanel(null);
    startPlacingRef.current?.(spell, player.id);
  }, [actionRing, signedInSpots, campaign]);

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
    console.log('[PlayerScreen] Opening action ring for spot:', spotId, 'at', screenX, screenY);
    setActionRing({ tokenId, spotId, x: screenX, y: screenY });
    setOpenPanel(null);
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
      <div className={cn('absolute inset-0', hasInitiative && 'right-12')}>
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
          cancelCastingRef={cancelCastingRef}
          confirmCastRef={confirmCastRef}
          onCastingDismissed={() => { setActiveCasting(null); setAoeHighlights(null); }}
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
              {!aoeHighlights?.saveResults && <span className="text-xs text-white/40">Drag to place</span>}
              {!aoeHighlights?.saveResults && activeCasting.saveAbility && (
                <button
                  onClick={() => confirmCastRef.current?.()}
                  onPointerDown={(e) => e.preventDefault()}
                  className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                >
                  Confirm Cast
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
            <div className="bg-black/80 border border-indigo-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-indigo-500/10">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              {measureDistanceFeet != null
                ? <span className="text-sm font-bold text-indigo-300">{measureDistanceFeet} ft</span>
                : <span className="text-sm font-bold text-indigo-400">Measuring</span>
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

      {/* Action Ring */}
      {actionRing && openPanel === null && (() => {
        const config = spotConfigs[actionRing.spotId];
        const playerId = signedInSpots[actionRing.spotId];
        const activeEntry = activeCombatants.find(c => c.id === activeCombatantId);
        const isPlayersTurn = !!(activeEntry && activeEntry.sourceCombatantId === playerId);
        const isTorchLit = !!(playerId && torchLitPlayerIds.has(playerId));
        return (
          <ActionRing
            anchorX={actionRing.x}
            anchorY={actionRing.y}
            edge={config.edge}
            onSpells={() => setOpenPanel('spells')}
            onConditions={() => setOpenPanel('conditions')}
            onMeasure={() => {
              const spotId = actionRing.spotId;
              const edge = spotConfigs[spotId].edge;
              setActionRing(null);
              setOpenPanel(null);
              startMeasuringRef.current?.(edge);
              setActiveMeasuring({ spotId });
              setMeasureDistanceFeet(null);
            }}
            onEndTurn={() => { window.electronAPI?.sendPlayerEndTurn?.(); setActionRing(null); }}
            onToggleTorch={() => {
              if (isTorchLit) handleDouseTorch(actionRing.spotId);
              else handleLightTorch(actionRing.spotId);
              setActionRing(null);
            }}
            isTorchLit={isTorchLit}
            onClose={() => setActionRing(null)}
            isPlayersTurn={isPlayersTurn}
          />
        );
      })()}

      {/* Spells Panel */}
      {actionRing && openPanel === 'spells' && (() => {
        const player = getPlayerForSpot(actionRing.spotId);
        if (!player) return null;
        const config = spotConfigs[actionRing.spotId];
        return (
          <SpellsPanel
            player={player}
            anchorX={actionRing.x}
            anchorY={actionRing.y}
            edge={config.edge}
            onCast={handleCastSpell}
            onPlace={handlePlaceSpell}
            onClose={() => { setOpenPanel(null); setActionRing(null); }}
            onDarkvisionChange={(newValue) => {
              const playerId = signedInSpots[actionRing.spotId];
              if (!playerId) return;
              window.electronAPI?.sendPlayerDarkvisionUpdate?.(playerId, newValue);
              setCampaign(prev => {
                if (!prev) return prev;
                return { ...prev, players: prev.players.map(p => p.id === playerId ? { ...p, darkvision: newValue } : p) };
              });
            }}
            preAbilityDarkvisionRef={preAbilityDarkvisionRef}
          />
        );
      })()}

      {/* Conditions Panel */}
      {actionRing && openPanel === 'conditions' && (() => {
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
      })()}

      {/* Initiative Strip */}
      {hasInitiative && <InitiativeStrip combatants={activeCombatants} activeCombatantId={activeCombatantId} />}
    </div>
  );
}
