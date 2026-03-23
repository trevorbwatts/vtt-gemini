import React, { useState, useMemo } from 'react';
import { Combatant, cn, ClassDefinition } from '../types';
import { Minus, Plus, Trash2, Heart, Shield, Zap, Swords, ChevronRight, Wind, Footprints, Skull } from '../icons';
import { motion, Reorder } from 'motion/react';
import { SpeedText } from './SpeedText';

const getCharacterLevel = (classes?: ClassDefinition[]) => {
  return classes?.reduce((sum, c) => sum + c.level, 0) || 0;
};

const getClassSummary = (classes?: ClassDefinition[]) => {
  if (!classes || classes.length === 0) return '';
  return classes.map(c => `${c.name} ${c.level}`).join(' / ');
};

interface CombatViewProps {
  activeCombatants: Combatant[];
  onActiveCombatantsChange: (combatants: Combatant[]) => void;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  onCombatantClick?: (combatantId: string, tokenId: string) => void;
  onStartCombat?: () => void;
  selectedTokenCount?: number;
  onClose?: () => void;
  onClearMovementPaths?: () => void;
  onActiveCombatantIdChange?: (id: string | null) => void;
}

export const CombatView: React.FC<CombatViewProps> = ({
  activeCombatants,
  onActiveCombatantsChange,
  players,
  npcs,
  persistentEnemies,
  onCombatantClick,
  onStartCombat,
  selectedTokenCount = 0,
  onClose,
  onClearMovementPaths,
  onActiveCombatantIdChange,
}) => {
  const [activeCombatantId, _setActiveCombatantId] = useState<string | null>(null);
  const setActiveCombatantId = (id: string | null) => {
    _setActiveCombatantId(id);
    onActiveCombatantIdChange?.(id);
  };
  const [hpInputs, setHpInputs] = useState<Record<string, string>>({});

  const sortedCombatants = useMemo(() => {
    return [...activeCombatants].sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return a.name.localeCompare(b.name);
    });
  }, [activeCombatants]);

  const sortInitiative = () => {
    if (sortedCombatants.length > 0) {
      setActiveCombatantId(sortedCombatants[0].id);
    }
  };

  const updateHp = (id: string, delta: number) => {
    onActiveCombatantsChange(activeCombatants.map(c =>
      c.id === id ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) } : c
    ));
  };

  const applyHpDelta = (id: string, sign: 1 | -1) => {
    const val = parseInt(hpInputs[id] || '0', 10);
    if (!val) return;
    updateHp(id, val * sign);
    setHpInputs(prev => ({ ...prev, [id]: '' }));
  };

  const updateInitiative = (id: string, value: number) => {
    onActiveCombatantsChange(activeCombatants.map(c =>
      c.id === id ? { ...c, initiative: value } : c
    ));
  };

  const removeCombatant = (id: string) => {
    onActiveCombatantsChange(activeCombatants.filter(c => c.id !== id));
    if (activeCombatantId === id) {
      const index = sortedCombatants.findIndex(c => c.id === id);
      const nextIndex = (index + 1) % sortedCombatants.length;
      if (sortedCombatants.length > 1) {
        setActiveCombatantId(sortedCombatants[nextIndex === 0 && sortedCombatants.length > 1 ? 0 : nextIndex].id);
      } else {
        setActiveCombatantId(null);
      }
    }
  };

  const nextTurn = () => {
    if (sortedCombatants.length === 0) return;
    onClearMovementPaths?.();
    const currentIndex = sortedCombatants.findIndex(c => c.id === activeCombatantId);
    if (currentIndex === -1) {
      setActiveCombatantId(sortedCombatants[0].id);
      return;
    }
    const nextIndex = (currentIndex + 1) % sortedCombatants.length;
    setActiveCombatantId(sortedCombatants[nextIndex].id);
  };

  const clearCombat = () => {
    onActiveCombatantsChange([]);
    setActiveCombatantId(null);
  };

  const combatStarted = activeCombatantId !== null;

  return (
    <div className="h-full flex flex-col bg-transparent relative z-10 font-sans">
      {/* Title Row */}
      <div className="h-10 px-5 border-b border-[var(--line)] flex justify-between items-center shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity group"
        >
          <Swords size={12} className="opacity-50 text-[var(--ink)] group-hover:opacity-100 transition-opacity" />
          <h3 className="text-[12px] uppercase tracking-[0.15em] opacity-50 font-bold text-[var(--ink)] group-hover:opacity-100 transition-opacity">Initiative Tracker</h3>
        </button>
        <button onClick={onClose} className="opacity-30 hover:opacity-100 transition-opacity text-[var(--ink)]">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="px-5 py-4 flex gap-3 shrink-0">
        {!combatStarted && activeCombatants.length === 0 ? (
          <button
            onClick={onStartCombat}
            disabled={selectedTokenCount === 0}
            className="btn-filled w-full py-2.5 rounded flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Swords size={14} />
            Roll Initiative {selectedTokenCount > 0 ? `(${selectedTokenCount})` : ''}
          </button>
        ) : (
          <>
            <button
              onClick={clearCombat}
              className="btn-ghost flex-1 py-2.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              Clear
            </button>
            <button
              onClick={nextTurn}
              className="btn-filled flex-[2] py-2.5 rounded flex items-center justify-center"
            >
              {combatStarted ? 'Next Turn' : 'Start Combat'}
            </button>
          </>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 overflow-x-hidden">
        {sortedCombatants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8 text-[var(--ink)]">
            <Zap size={32} className="mb-4" />
            <p className="text-sm font-sans uppercase tracking-[0.15em] font-bold">No active combat</p>
            <p className="text-[11px] mt-2 tracking-wide font-medium">Select tokens on the map to begin</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCombatants.map((c) => {
              const isActive = activeCombatantId === c.id;
              const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0;
              const isEnemy = c.type === 'enemy';
              const isPlayer = c.type === 'player';

              return (
                <div
                  key={c.id}
                  onClick={() => onCombatantClick?.(c.id, c.id)}
                  className={cn(
                    "relative overflow-hidden rounded-lg border transition-all p-3 cursor-pointer",
                    isActive
                      ? "bg-[#1d1a16] border-[var(--accent)] shadow-[0_0_15px_rgba(205,127,50,0.15)]"
                      : "bg-[#181512] border-[#2e261d]"
                  )}
                >
                  {/* Top row: initiative, avatar, name/stats, delete */}
                  <div className="flex items-center gap-3">
                    {/* Initiative input */}
                    <div className="flex items-center shrink-0">
                      <input
                        type="number"
                        value={c.initiative}
                        onChange={(e) => updateInitiative(c.id, parseInt(e.target.value) || 0)}
                        disabled={combatStarted}
                        className={cn(
                          "w-8 h-7 rounded text-[13px] text-center font-bold bg-black border border-white/10 text-white focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                          combatStarted ? "opacity-80 cursor-default" : "hover:border-white/30"
                        )}
                      />
                    </div>

                    {/* Avatar */}
                    {c.avatar ? (
                      <div className={cn(
                        "w-11 h-11 rounded-full overflow-hidden border-2 shrink-0",
                        isEnemy ? "border-red-500" :
                        isPlayer ? "border-blue-500" : "border-emerald-500"
                      )}>
                        <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center border-2 shrink-0",
                        isEnemy ? "border-red-500 bg-red-500/10" :
                        isPlayer ? "border-blue-500 bg-blue-500/10" : "border-emerald-500 bg-emerald-500/10"
                      )}>
                        <Skull size={18} className="text-white/40" />
                      </div>
                    )}

                    {/* Center: name + stat pills */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="font-bold text-[15px] truncate font-serif text-white tracking-wide">{c.name}</div>
                        {isPlayer && (
                          <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-blue-500/30">
                            LVL {getCharacterLevel(c.classes)}
                          </span>
                        )}
                        {!isPlayer && c.cr && (
                          <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/30">
                            CR {c.cr}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-full text-white/60">
                          <Shield size={10} /> {c.ac}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-full text-white/60">
                          <Footprints size={10} /> {!isPlayer && c.speedText ? <SpeedText text={c.speedText} /> : `${c.speed || 30}ft`}
                        </span>
                      </div>
                    </div>

                    {/* Delete */}
                    <div className="flex items-center shrink-0">
                      <button onClick={() => removeCombatant(c.id)} className="p-1 hover:bg-white/10 rounded opacity-30 hover:opacity-100 transition-opacity text-white">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Enemy-only: HP bar + HP numbers + damage/heal controls */}
                  {!isPlayer && (
                    <>
                      <div className="mt-2.5 h-1 bg-black/50 rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--accent)] transition-all shadow-[0_0_8px_rgba(205,127,50,0.3)]" style={{ width: `${hpPct}%` }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-white/50">
                          <Heart size={10} className="inline -mt-0.5 mr-1" />{c.hp}/{c.maxHp}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => applyHpDelta(c.id, -1)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                          >
                            <Minus size={12} strokeWidth={3} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={hpInputs[c.id] || ''}
                            onChange={(e) => setHpInputs(prev => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') applyHpDelta(c.id, -1);
                            }}
                            placeholder="0"
                            className="w-10 h-6 text-center text-[12px] font-bold bg-black/50 border border-white/10 rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => applyHpDelta(c.id, 1)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors"
                          >
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
