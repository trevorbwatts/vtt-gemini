import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { SpellAccordion } from './SpellAccordion';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { Campaign, Token, Combatant, cn } from '../types';
import { searchSpells } from '../data/spellDatabase';
import { User, Search, X, LogOut, Undo2, GripHorizontal, ArrowLeft, ArrowRight, Circle, Cone, Cylinder, Box, Slash } from '../icons';
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

// ─── Player Drawer (Play Mode) ───
const PlayerDrawer: React.FC<{
  player: Combatant;
  isOpen: boolean;
  onToggle: () => void;
  spellSearch: string;
  onSpellSearchChange: (val: string) => void;
  onCast: (spell: any) => void;
  edge: 'top' | 'bottom' | 'left';
  className: string;
  style?: React.CSSProperties;
  isActiveTurn?: boolean;
}> = ({ player, isOpen, onToggle, spellSearch, onSpellSearchChange, onCast, edge, className, style, isActiveTurn }) => {
  const spells = player.spells || [];

  // Compute spell save DC from class + stats + proficiency
  const spellSaveDc = useMemo(() => {
    if (player.spellSaveDc) return player.spellSaveDc;
    if (!player.stats || !player.proficiencyBonus || !player.classes?.length) return undefined;
    const CASTING_ABILITY: Record<string, keyof typeof player.stats> = {
      wizard: 'int', artificer: 'int',
      cleric: 'wis', druid: 'wis', ranger: 'wis', monk: 'wis',
      bard: 'cha', sorcerer: 'cha', warlock: 'cha', paladin: 'cha',
    };
    let bestMod = -Infinity;
    for (const cls of player.classes) {
      const ability = CASTING_ABILITY[cls.name.toLowerCase()];
      if (ability) {
        const mod = Math.floor((player.stats[ability] - 10) / 2);
        if (mod > bestMod) bestMod = mod;
      }
    }
    if (bestMod === -Infinity) return undefined;
    return 8 + player.proficiencyBonus + bestMod;
  }, [player.spellSaveDc, player.stats, player.proficiencyBonus, player.classes]);

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'my' | 'lookup'>('my');
  const [enabledSources, setEnabledSources] = useState<Set<'2014' | '2024'>>(new Set(['2014', '2024']));
  const [recentSpells, setRecentSpells] = useState<any[]>([]);

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
    onCast({ ...spell, saveDc: spellSaveDc });
    setRecentSpells(prev => {
      const filtered = prev.filter(s => s.name !== spell.name);
      return [spell, ...filtered].slice(0, 5);
    });
    onSpellSearchChange('');
    setShowKeyboard(false);
  };

  const drawerContent = (
    <div className="bg-black/95 border border-white/10 rounded-lg p-3 w-[380px]">
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
        <button onClick={onToggle} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X size={14} className="text-white/40" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 mb-3">
        <button
          onClick={() => { setActiveTab('my'); setShowKeyboard(false); }}
          className={cn(
            'flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
            activeTab === 'my'
              ? 'text-purple-400 border-purple-500'
              : 'text-white/25 border-transparent hover:text-white/40'
          )}
        >
          My Spells
        </button>
        <button
          onClick={() => { setActiveTab('lookup'); setShowKeyboard(true); }}
          className={cn(
            'flex-1 pb-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors border-b-2 -mb-px',
            activeTab === 'lookup'
              ? 'text-purple-400 border-purple-500'
              : 'text-white/25 border-transparent hover:text-white/40'
          )}
        >
          Spell Lookup
        </button>
      </div>

      {/* ── My Spells tab ── */}
      {activeTab === 'my' && (
        <div className="max-h-[300px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="space-y-1">
            {spells.length === 0 ? (
              <div className="text-white/15 text-xs text-center py-3 border border-dashed border-white/10 rounded-lg">No spells</div>
            ) : (
              spells.map((spell, i) => {
                const hasAoe = !!(spell.aoeType && spell.aoeSize);
                return (
                  <button
                    key={i}
                    onClick={() => hasAoe && onCast({ ...spell, saveDc: spellSaveDc })}
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
              })
            )}
          </div>

        </div>
      )}

      {/* ── Spell Lookup tab ── */}
      {activeTab === 'lookup' && (
        <div>
          {/* Edition filters */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              <button
                onClick={() => toggleSource('2014')}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide transition-colors',
                  enabledSources.has('2014') ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-white/20'
                )}
              >
                2014
              </button>
              <button
                onClick={() => toggleSource('2024')}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide transition-colors',
                  enabledSources.has('2024') ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-white/20'
                )}
              >
                2024
              </button>
            </div>
          </div>

          {/* Recent lookups — shown when not searching */}
          {searchResults.length === 0 && recentSpells.length > 0 && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-widest text-white/20 mb-1 font-bold">Recent</div>
              <div className="space-y-1">
                {recentSpells.map((spell: any, i: number) => (
                  <button
                    key={`recent-${i}`}
                    onClick={() => handleSpellTap(spell)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left bg-purple-500/5 border border-purple-500/10 rounded-lg hover:bg-purple-500/15 active:bg-purple-500/25 transition-colors"
                  >
                    <span className="font-bold flex-1 min-w-0 truncate text-purple-400 text-xs">{spell.name}</span>
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
                ))}
              </div>
            </div>
          )}

          {/* Search results — above search bar so keyboard stays put */}
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-[160px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-2">
              {searchResults.map((spell, i) => (
                <button
                  key={`search-${i}`}
                  onClick={() => handleSpellTap(spell)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left bg-purple-500/5 border border-purple-500/10 rounded-lg hover:bg-purple-500/15 active:bg-purple-500/25 transition-colors"
                >
                  <span className="font-bold flex-1 min-w-0 truncate text-purple-400 text-xs">{spell.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {spell.saveAbility && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/10 text-red-400">
                        {spell.saveAbility.toUpperCase()}
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
              ))}
            </div>
          )}

          {/* Search display / keyboard toggle */}
          <div
            className={cn(
              'relative mb-2 cursor-pointer',
              showKeyboard && 'ring-1 ring-purple-500/30 rounded-lg'
            )}
            onClick={() => setShowKeyboard(true)}
          >
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
            <div className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-white min-h-[30px] flex items-center">
              {spellSearch || <span className="text-white/25">Tap to search AoE spells...</span>}
            </div>
            {spellSearch && (
              <button onClick={(e) => { e.stopPropagation(); onSpellSearchChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X size={12} className="text-white/30" />
              </button>
            )}
          </div>

          {/* On-screen keyboard */}
          {showKeyboard && (
            <OnScreenKeyboard
              onKeyPress={(ch) => onSpellSearchChange(spellSearch + ch)}
              onBackspace={() => onSpellSearchChange(spellSearch.slice(0, -1))}
              onClear={() => onSpellSearchChange('')}
            />
          )}
        </div>
      )}
    </div>
  );

  // Shared bar content: [color dot] [name] [Spells button] [Undo button (conditional)]
  const barButtons = (vertical?: boolean) => (
    <>
      {vertical ? (
        // Vertical layout for left edge
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: player.color || '#cd7f32' }} />
          <span
            className="text-white/50 text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
          >
            {player.name}
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={cn(
              'px-1 py-1.5 rounded text-[9px] font-bold tracking-wide cursor-pointer transition-colors',
              isOpen ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-white/40 hover:bg-white/15 hover:text-white/60'
            )}
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
          >
            Spells
          </span>
        </div>
      ) : (
        // Horizontal layout for top/bottom edges
        <>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: player.color || '#cd7f32' }} />
          <span className="text-white/50 text-xs font-bold tracking-wider truncate max-w-[80px]">{player.name}</span>
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide cursor-pointer transition-colors',
              isOpen ? 'bg-purple-500/30 text-purple-300' : 'bg-white/5 text-white/40 hover:bg-white/15 hover:text-white/60'
            )}
          >
            Spells
          </span>
        </>
      )}
    </>
  );

  // ── Bottom edge ──
  if (edge === 'bottom') {
    return (
      <div className={cn('absolute bottom-0 z-30', className)} style={style}>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pb-1">{drawerContent}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          className={cn(
            'w-[380px] h-[34px] rounded-t-lg flex items-center justify-center gap-2 px-3 border border-b-0',
            isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10',
            isActiveTurn && 'ring-2 ring-amber-400/80 bg-amber-400/15 animate-pulse'
          )}
        >
          {barButtons()}
        </div>
      </div>
    );
  }

  // ── Top edge ──
  if (edge === 'top') {
    return (
      <div className={cn('absolute top-0 z-30', className)} style={style}>
        <div
          className={cn(
            'w-[380px] h-[34px] rounded-b-lg flex items-center justify-center gap-2 px-3 border border-t-0',
            isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10',
            isActiveTurn && 'ring-2 ring-amber-400/80 bg-amber-400/15 animate-pulse'
          )}
          style={{ transform: 'rotate(180deg)' }}
        >
          {barButtons()}
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-1" style={{ transform: 'rotate(180deg)' }}>{drawerContent}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Left edge ──
  return (
    <div className={cn('absolute left-0 z-30 flex items-center', className)}>
      <div
        className={cn(
          'h-[280px] w-[34px] rounded-r-lg flex items-center justify-center py-2 border border-l-0 shrink-0',
          isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10',
          isActiveTurn && 'ring-2 ring-amber-400/80 bg-amber-400/15 animate-pulse'
        )}
      >
        {barButtons(true)}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-1">{drawerContent}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

  // Drawer state (play mode)
  const [openDrawers, setOpenDrawers] = useState<Set<SpotId>>(new Set());
  const [spellSearches, setSpellSearches] = useState<Record<SpotId, string>>({
    'top-left': '', 'top-right': '',
    'bottom-left': '', 'bottom-right': '',
    'left': '',
  });

  // Ref for spell casting from drawers
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number }, combatantId: string) => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);
  const confirmCastRef = useRef<(() => void) | null>(null);

  // Track active player casting (for banner positioning)
  const [activeCasting, setActiveCasting] = useState<{ spotId: SpotId; spellName: string; saveAbility?: string } | null>(null);

  // AoE highlights received from MapView
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null } | null>(null);

  // Active combatant turn (received from DM via IPC)
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);
  // Flash highlight when turn changes — true for 3 seconds after activeCombatantId changes
  const [turnFlash, setTurnFlash] = useState(false);

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

    // Request state AFTER all listeners are registered so we don't miss the response
    if (window.electronAPI?.requestStateUpdate) {
      window.electronAPI.requestStateUpdate();
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeStateUpdateListener();
        window.electronAPI.removeDMTokenUpdateListener?.();
      }
      if (window.electronAPI?.removePlayerModeListener) {
        window.electronAPI.removePlayerModeListener();
      }
    };
  }, []);

  // Flash highlight for 3 seconds when active turn changes
  useEffect(() => {
    if (!activeCombatantId) { setTurnFlash(false); return; }
    setTurnFlash(true);
    const timer = setTimeout(() => setTurnFlash(false), 3000);
    return () => clearTimeout(timer);
  }, [activeCombatantId]);

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
    setOpenDrawers(prev => { const next = new Set(prev); next.delete(spotId); return next; });
  }, []);

  const toggleDrawer = useCallback((spotId: SpotId) => {
    setOpenDrawers(prev => {
      const next = new Set(prev);
      if (next.has(spotId)) next.delete(spotId);
      else next.add(spotId);
      return next;
    });
  }, []);

  const handleCastSpell = useCallback((spotId: SpotId, spell: any, combatantId: string) => {
    setOpenDrawers(prev => { const next = new Set(prev); next.delete(spotId); return next; });
    startCastingRef.current?.(spell, combatantId);
    setActiveCasting({ spotId, spellName: spell.name, saveAbility: spell.saveAbility });
  }, []);

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
                <span className="text-xs font-semibold text-green-400">Saves Rolled</span>
              )}
              <button
                onClick={() => { cancelCastingRef.current?.(); setActiveCasting(null); setAoeHighlights(null); }}
                onPointerDown={(e) => e.preventDefault()}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                {aoeHighlights?.saveResults ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Player Drawers */}
      {SPOT_IDS.map(spotId => {
        const player = getPlayerForSpot(spotId);
        if (!player) return null;
        const config = spotConfigs[spotId];

        // Check if this player is the active combatant
        const activeEntry = activeCombatants.find(c => c.id === activeCombatantId);
        const isThisPlayersTurn = turnFlash && activeEntry?.sourceCombatantId === player.id;

        return (
          <PlayerDrawer
            key={spotId}
            player={player}
            isOpen={openDrawers.has(spotId)}
            onToggle={() => toggleDrawer(spotId)}
            spellSearch={spellSearches[spotId] || ''}
            onSpellSearchChange={(val) => setSpellSearches(prev => ({ ...prev, [spotId]: val }))}
            onCast={(spell) => handleCastSpell(spotId, spell, player.id)}
            edge={config.edge}
            className={config.drawerClass}
            style={config.edge !== 'left' ? { left: `${spotPositions[spotId]}%` } : undefined}
            isActiveTurn={isThisPlayersTurn}
          />
        );
      })}

      {/* Initiative Strip */}
      {hasInitiative && <InitiativeStrip combatants={activeCombatants} activeCombatantId={activeCombatantId} aoeHighlights={aoeHighlights} />}
    </div>
  );
}
