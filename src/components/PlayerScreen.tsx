import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Campaign, Token, Combatant, cn } from '../types';
import { searchSpells } from '../data/spellDatabase';
import { User, Search, X, LogOut, GripHorizontal, ArrowLeft, ArrowRight, Circle, Cone, Cylinder, Box, Slash, BookOpen, Zap, ChevronRight } from '../icons';
import { motion, AnimatePresence } from 'motion/react';

// ─── Sign-in spot types ───
type SpotId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left';
const SPOT_IDS: SpotId[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left'];

const AOE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  sphere: Circle, cone: Cone, line: Slash, cube: Box, cylinder: Cylinder,
};

// ─── Sign-in Button ───
const SignInSpot: React.FC<{
  player: Combatant | null;
  availablePlayers: Combatant[];
  showPicker: boolean;
  onTogglePicker: () => void;
  onSignIn: (playerId: string) => void;
  onSignOut: () => void;
  rotation: number;
  className: string;
  style?: React.CSSProperties;
  onDrag?: (deltaXPercent: number) => void;
  edge: 'top' | 'bottom' | 'left';
}> = ({ player, availablePlayers, showPicker, onTogglePicker, onSignIn, onSignOut, rotation, className, style, onDrag, edge }) => {
  const dragRef = useRef<{ startX: number; startY: number; pointerId: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!onDrag) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [onDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId || !onDrag) return;
    const dx = e.clientX - dragRef.current.startX;
    // Convert pixel delta to viewport percentage
    const pct = (dx / window.innerWidth) * 100;
    onDrag(pct);
    dragRef.current.startX = e.clientX;
  }, [onDrag]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
  }, []);

  return (
    <div className={cn('absolute z-20', className)} style={style}>
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        {player ? (
          <div
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-3 backdrop-blur-sm"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
              style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32'), outline: `2px solid ${player.color || '#cd7f32'}`, outlineOffset: '2px' }}
            >
              {player.avatar
                ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                : player.name[0]?.toUpperCase()
              }
            </div>
            <span className="text-white font-bold text-sm tracking-wide">{player.name}</span>
            <button
              onClick={onSignOut}
              className="btn-ghost ml-1 px-2 py-1"
            >
              <LogOut size={10} /> Sign Out
            </button>
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
                          style={{ background: p.avatar ? 'transparent' : (p.color || '#cd7f32') }}
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
      {/* Drag handle — outside rotation so it stays oriented correctly */}
      {edge !== 'left' && (
        <div
          className="flex items-center justify-center gap-1 mt-1 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <ArrowLeft size={10} className="text-white/15 hover:text-white/30 transition-colors" />
          <GripHorizontal size={16} className="text-white/15 hover:text-white/30 transition-colors" />
          <ArrowRight size={10} className="text-white/15 hover:text-white/30 transition-colors" />
        </div>
      )}
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

// ─── Action Ring ───
const ActionRing: React.FC<{
  anchorX: number;
  anchorY: number;
  edge: 'top' | 'bottom' | 'left';
  onSpells: () => void;
  onConditions: () => void;
  onEndTurn: () => void;
  onClose: () => void;
}> = ({ anchorX, anchorY, edge, onSpells, onConditions, onEndTurn, onClose }) => {
  const offsets = RING_OFFSETS[edge];
  const textRotate = edge === 'top' ? 180 : edge === 'left' ? -90 : 0;
  const items = [
    { label: 'Spells',     icon: BookOpen,      color: 'bg-purple-500/20 border-purple-500/40 text-purple-300', onClick: onSpells },
    { label: 'Conditions', icon: Zap,           color: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300', onClick: onConditions },
    { label: 'End Turn',   icon: ChevronRight,  color: 'bg-green-500/20  border-green-500/40  text-green-300',  onClick: onEndTurn },
  ];
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
            'fixed z-50 rounded-full border flex flex-col items-center justify-center gap-0.5 shadow-xl backdrop-blur-sm',
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
          <item.icon size={18} />
          <span className="text-[8px] font-bold tracking-wide" style={{ transform: `rotate(${textRotate}deg)` }}>
            {item.label}
          </span>
        </motion.button>
      ))}
    </>
  );
};

// ─── Spell Row (reusable inside SpellsPanel) ───
const SpellRow: React.FC<{
  spell: any;
  spellSaveDc?: number;
  onPress: () => void;
}> = ({ spell, spellSaveDc, onPress }) => {
  const hasAoe = !!(spell.aoeType && spell.aoeSize);
  return (
    <button
      onClick={hasAoe ? onPress : undefined}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg border transition-colors',
        hasAoe
          ? 'bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/15 active:bg-purple-500/25 cursor-pointer'
          : 'bg-white/[0.02] border-white/5 cursor-default'
      )}
    >
      <span className={cn('font-bold flex-1 min-w-0 truncate text-xs', hasAoe ? 'text-purple-400' : 'text-white/40')}>{spell.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {spell.saveAbility && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/10 text-red-400">
            {spell.saveAbility.toUpperCase()}{spellSaveDc ? ` ${spellSaveDc}` : ''}
          </span>
        )}
        {spell.aoeType && (
          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 flex items-center gap-0.5">
            {spell.aoeSize ? `${spell.aoeSize}ft` : ''}{AOE_ICONS[spell.aoeType] ? React.createElement(AOE_ICONS[spell.aoeType], { size: 10 }) : ''}
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 text-white/30">
          {spell.range == null ? '' : spell.range === 0 ? 'Self' : spell.range === -1 ? 'Touch' : `${spell.range}ft`}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded opacity-40">
          {spell.level === 0 ? 'C' : spell.level}
        </span>
      </div>
    </button>
  );
};

// ─── Spells Panel ───
const SpellsPanel: React.FC<{
  player: Combatant;
  anchorX: number;
  anchorY: number;
  edge: 'top' | 'bottom' | 'left';
  onCast: (spell: any) => void;
  onClose: () => void;
}> = ({ player, anchorX, anchorY, edge, onCast, onClose }) => {
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

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'lookup'>('my');
  const [enabledSources, setEnabledSources] = useState<Set<'2014' | '2024'>>(new Set(['2014', '2024']));
  const [recentSpells, setRecentSpells] = useState<any[]>([]);
  const [spellSearch, setSpellSearch] = useState('');

  const searchResults = spellSearch.trim().length >= 2
    ? searchSpells(spellSearch, 20, { sources: enabledSources, aoeOnly: true })
    : [];

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

  const PANEL_W = 380;
  const OFFSET = 160;
  const panelStyle: React.CSSProperties = (() => {
    if (edge === 'top') {
      return {
        left: Math.max(4, Math.min(window.innerWidth - PANEL_W - 4, anchorX - PANEL_W / 2)),
        top: Math.max(4, anchorY - OFFSET - 20),
        transform: 'rotate(180deg)',
        transformOrigin: 'center top',
      };
    }
    if (edge === 'left') {
      return {
        left: Math.max(4, anchorX - OFFSET - PANEL_W),
        top: Math.max(4, anchorY - 200),
      };
    }
    return {
      left: Math.max(4, Math.min(window.innerWidth - PANEL_W - 4, anchorX - PANEL_W / 2)),
      top: Math.min(window.innerHeight - 20, anchorY + OFFSET),
    };
  })();

  return (
    <>
      <div className="fixed inset-0 z-50" onPointerDown={onClose} />
      <div
        className="fixed bg-black/95 border border-white/10 rounded-lg p-3"
        style={{ ...panelStyle, width: PANEL_W, zIndex: 60 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
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
          {(['my', 'lookup'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'lookup') setShowKeyboard(true); else setShowKeyboard(false); }}
              className={cn(
                'flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
                activeTab === tab ? 'text-purple-400 border-purple-500' : 'text-white/25 border-transparent hover:text-white/40'
              )}
            >
              {tab === 'my' ? 'My Spells' : 'Spell Lookup'}
            </button>
          ))}
        </div>

        {/* My Spells */}
        {activeTab === 'my' && (
          <div className="max-h-[280px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="space-y-1">
              {spells.length === 0 ? (
                <div className="text-white/15 text-xs text-center py-3 border border-dashed border-white/10 rounded-lg">No spells</div>
              ) : spells.map((spell, i) => (
                <SpellRow
                  key={i}
                  spell={spell}
                  spellSaveDc={spellSaveDc}
                  onPress={() => {
                    if (!(spell.aoeType && spell.aoeSize)) return;
                    const half = spell.halfDamageOnSave ?? /half (as much )?damage|half damage/i.test(spell.desc || '');
                    onCast({ ...spell, saveDc: spellSaveDc, halfDamageOnSave: half });
                  }}
                />
              ))}
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
                <div className="space-y-1">
                  {recentSpells.map((spell, i) => (
                    <SpellRow key={`r-${i}`} spell={spell} spellSaveDc={spellSaveDc} onPress={() => handleSpellTap(spell)} />
                  ))}
                </div>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-2">
                {searchResults.map((spell, i) => (
                  <SpellRow key={`s-${i}`} spell={spell} spellSaveDc={spellSaveDc} onPress={() => handleSpellTap(spell)} />
                ))}
              </div>
            )}
            <div
              className={cn('relative mb-2 cursor-pointer', showKeyboard && 'ring-1 ring-purple-500/30 rounded-lg')}
              onClick={() => setShowKeyboard(true)}
            >
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
              <div className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-white min-h-[30px] flex items-center">
                {spellSearch || <span className="text-white/25">Tap to search AoE spells...</span>}
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
      </div>
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
  const OFFSET = 160;
  const panelStyle: React.CSSProperties = (() => {
    if (edge === 'top') {
      return {
        left: Math.max(4, Math.min(window.innerWidth - PANEL_W - 4, anchorX - PANEL_W / 2)),
        top: Math.max(4, anchorY - OFFSET - 20),
        transform: 'rotate(180deg)',
        transformOrigin: 'center top',
      };
    }
    if (edge === 'left') {
      return {
        left: Math.max(4, anchorX - OFFSET - PANEL_W),
        top: Math.max(4, anchorY - 150),
      };
    }
    return {
      left: Math.max(4, Math.min(window.innerWidth - PANEL_W - 4, anchorX - PANEL_W / 2)),
      top: Math.min(window.innerHeight - 20, anchorY + OFFSET),
    };
  })();

  return (
    <>
      <div className="fixed inset-0 z-50" onPointerDown={onClose} />
      <div
        className="fixed bg-black/95 border border-white/10 rounded-lg p-3"
        style={{ ...panelStyle, width: PANEL_W, zIndex: 60 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
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
      </div>
    </>
  );
};

// ─── Initiative Strip ───
const InitiativeStrip: React.FC<{
  combatants: Combatant[];
  activeCombatantId?: string | null;
  aoeHighlights?: { affectedCombatantIds: string[]; saveResults: Record<string, any> | null } | null;
}> = ({ combatants, activeCombatantId, aoeHighlights }) => {
  const sorted = useMemo(() =>
    [...combatants].sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return a.name.localeCompare(b.name);
    }),
    [combatants]
  );

  const affectedSet = useMemo(() => new Set(aoeHighlights?.affectedCombatantIds || []), [aoeHighlights?.affectedCombatantIds]);

  const typeColor = (type: string) => {
    if (type === 'player') return { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.2)' };
    if (type === 'enemy') return { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' };
    return { bg: 'rgba(96,165,250,0.08)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' };
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-12 bg-black/80 border-l border-white/10 flex flex-col z-20 backdrop-blur-sm">
      {sorted.map((c) => {
        const colors = typeColor(c.type);
        const isActive = c.id === activeCombatantId;
        const isAffected = affectedSet.has(c.sourceCombatantId || c.id);
        const saveResult = aoeHighlights?.saveResults?.[c.sourceCombatantId || c.id];
        return (
          <div
            key={c.id}
            className={cn(
              'flex-1 flex flex-col items-center justify-center border-b border-white/5 last:border-0 min-h-[40px] transition-all duration-300',
              isActive && 'ring-2 ring-inset ring-amber-400/80 bg-amber-400/15',
              isAffected && !isActive && 'ring-2 ring-inset ring-orange-400/80 bg-orange-400/10'
            )}
            style={{ backgroundColor: isActive ? undefined : isAffected ? 'rgba(255,120,30,0.1)' : colors.bg, borderLeft: `2px solid ${isActive ? '#fbbf24' : isAffected ? '#ff781e' : colors.border}` }}
          >
            <span
              className={cn(
                'text-[11px] font-bold tracking-wider whitespace-nowrap',
                isActive && 'text-amber-300'
              )}
              style={{ writingMode: 'vertical-lr', transform: 'rotate(0deg)', color: isActive ? undefined : isAffected ? '#ff781e' : colors.text }}
            >
              {c.name}
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

  // Sign-in state
  const [signedInSpots, setSignedInSpots] = useState<Record<SpotId, string | null>>({
    'top-left': null, 'top-right': null,
    'bottom-left': null, 'bottom-right': null,
    'left': null,
  });
  const [activePickerSpot, setActivePickerSpot] = useState<SpotId | null>(null);

  // Draggable spot positions (horizontal % from left edge)
  const [spotPositions, setSpotPositions] = useState<Record<SpotId, number>>({
    'top-left': 25, 'top-right': 62,
    'bottom-left': 25, 'bottom-right': 62,
    'left': 50,
  });

  const handleSpotDrag = useCallback((spotId: SpotId, deltaPercent: number) => {
    setSpotPositions(prev => {
      const clamped = Math.max(5, Math.min(95, prev[spotId] + deltaPercent));
      return { ...prev, [spotId]: clamped };
    });
  }, []);

  // Action ring + panel state (play mode)
  const [actionRing, setActionRing] = useState<{ tokenId: string; spotId: SpotId; x: number; y: number } | null>(null);
  const [openPanel, setOpenPanel] = useState<'spells' | 'conditions' | null>(null);

  // Ref for spell casting from drawers
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }, combatantId: string) => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);
  const confirmCastRef = useRef<(() => void) | null>(null);

  // Track active player casting (for banner positioning)
  const [activeCasting, setActiveCasting] = useState<{ spotId: SpotId; spellName: string; saveAbility?: string } | null>(null);

  // AoE highlights received from MapView
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string } | null>(null);

  // Active combatant turn (received from DM via IPC)
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);

  // ── IPC ──
  useEffect(() => {
    const handleStateUpdate = (newState: { campaign: Campaign; scenarioId: string; playerMode?: string; activeCombatantId?: string | null; viewportCenter?: { x: number; y: number } | null }) => {
      if (isDraggingRef.current) return;
      setCampaign(newState.campaign);
      setCurrentScenarioId(newState.scenarioId);
      if (newState.playerMode) {
        setMode(newState.playerMode as 'setup' | 'play');
      }
      setActiveCombatantId(newState.activeCombatantId ?? null);
      if (newState.viewportCenter) {
        setViewportCenter(newState.viewportCenter);
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
            scenarios: prev.scenarios.map(s =>
              s.id === scenarioId ? { ...s, tokens: newTokens } : s
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
      }
      if (window.electronAPI?.removePlayerModeListener) {
        window.electronAPI.removePlayerModeListener();
      }
    };
  }, []);

  // ── Callbacks ──
  const handleTokensChange = useCallback((newTokens: Token[]) => {
    if (window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(newTokens);
    }
    setCampaign(prev => {
      const scenarioId = currentScenarioIdRef.current;
      if (!prev || !scenarioId) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s =>
          s.id === scenarioId ? { ...s, tokens: newTokens } : s
        ),
      };
    });
  }, []);

  const handleDragStatusChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  // ── Derived state ──
  const availablePlayers = useMemo(() => {
    if (!campaign) return [];
    const signedInIds = new Set(Object.values(signedInSpots).filter(Boolean) as string[]);
    return campaign.players.filter(p => !signedInIds.has(p.id));
  }, [campaign?.players, signedInSpots]);

  const [viewportCenter, setViewportCenter] = useState<{ x: number; y: number } | null>(null);

  const currentScenario = campaign?.scenarios.find(s => s.id === currentScenarioId) ?? null;
  const activeCombatants = currentScenario?.activeCombatants || [];
  const hasInitiative = activeCombatants.length > 0;

  // ── Sign-in handlers ──
  const handleSignIn = useCallback((spotId: SpotId, playerId: string) => {
    setSignedInSpots(prev => ({ ...prev, [spotId]: playerId }));
    setActivePickerSpot(null);
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

  const handlePlayerTokenDoubleTap = useCallback((tokenId: string, screenX: number, screenY: number) => {
    // Match token to a signed-in player: token.id should equal the player combatant id
    const spotEntry = Object.entries(signedInSpots).find(([, playerId]) => playerId === tokenId);
    if (!spotEntry) return;
    const spotId = spotEntry[0] as SpotId;
    setActionRing({ tokenId, spotId, x: screenX, y: screenY });
    setOpenPanel(null);
  }, [signedInSpots]);

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
    'top-left':     { rotation: 180, edge: 'top',    setupClass: 'top-6 -translate-x-1/2',     drawerClass: '-translate-x-1/2' },
    'top-right':    { rotation: 180, edge: 'top',    setupClass: 'top-6 -translate-x-1/2',     drawerClass: '-translate-x-1/2' },
    'bottom-left':  { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 -translate-x-1/2',  drawerClass: '-translate-x-1/2' },
    'bottom-right': { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 -translate-x-1/2',  drawerClass: '-translate-x-1/2' },
    'left':         { rotation: 90,  edge: 'left',   setupClass: 'left-6 top-1/2 -translate-y-1/2',       drawerClass: 'top-1/2 -translate-y-1/2' },
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
              rotation={config.rotation}
              className={config.setupClass}
              edge={config.edge}
              style={config.edge !== 'left' ? { left: `${spotPositions[spotId]}%` } : undefined}
              onDrag={(delta) => handleSpotDrag(spotId, delta)}
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
        <MapView
          tokens={currentScenario.tokens || []}
          onTokensChange={handleTokensChange}
          scenarioName={currentScenario.name}
          mapImage={currentScenario.mapImage}
          onMapChange={() => {}}
          mapNotes={[]}
          onMapNotesChange={() => {}}
          players={campaign.players || []}
          npcs={campaign.npcs || []}
          persistentEnemies={campaign.persistentEnemies || []}
          scenarioCombatants={currentScenario.combatants || []}
          activeCombatants={currentScenario.activeCombatants || []}
          onUpdateCombatantHp={() => {}}
          onAddEnemy={() => {}}
          onStartCombat={() => {}}
          leftSidebarOpen={false}
          setLeftSidebarOpen={() => {}}
          rightSidebarOpen={false}
          setRightSidebarOpen={() => {}}
          isPlayerView={true}
          walls={currentScenario.walls}
          objectWalls={currentScenario.objectWalls}
          portals={currentScenario.portals}
          gridResolution={currentScenario.gridResolution}
          onDragStatusChange={handleDragStatusChange}
          viewportCenter={viewportCenter}
          darknessLevel={currentScenario.darknessLevel}
          startCastingRef={startCastingRef}
          cancelCastingRef={cancelCastingRef}
          confirmCastRef={confirmCastRef}
          onCastingDismissed={() => { setActiveCasting(null); setAoeHighlights(null); }}
          onAoeHighlightsChange={setAoeHighlights}
          activeCombatantId={activeCombatantId}
          onPlayerTokenDoubleTap={handlePlayerTokenDoubleTap}
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
          ? 'left-4 top-1/2 -translate-y-1/2 -rotate-90'
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
                <span className="text-xs text-white/40">DM applying damage...</span>
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

      {/* Action Ring */}
      {actionRing && openPanel === null && (() => {
        const config = spotConfigs[actionRing.spotId];
        return (
          <ActionRing
            anchorX={actionRing.x}
            anchorY={actionRing.y}
            edge={config.edge}
            onSpells={() => setOpenPanel('spells')}
            onConditions={() => setOpenPanel('conditions')}
            onEndTurn={() => { window.electronAPI?.sendPlayerEndTurn?.(); setActionRing(null); }}
            onClose={() => setActionRing(null)}
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
            onClose={() => { setOpenPanel(null); setActionRing(null); }}
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
      {hasInitiative && <InitiativeStrip combatants={activeCombatants} activeCombatantId={activeCombatantId} aoeHighlights={aoeHighlights} />}
    </div>
  );
}
