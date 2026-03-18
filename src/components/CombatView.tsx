import React, { useState, useMemo } from 'react';
import { Combatant, cn, ClassDefinition } from '../types';
import { Plus, Trash2, ChevronUp, ChevronDown, Heart, Shield, Zap, Swords, ChevronRight } from '../icons';
import { motion, Reorder } from 'motion/react';

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
  onClose?: () => void;
}

export const CombatView: React.FC<CombatViewProps> = ({ 
  activeCombatants,
  onActiveCombatantsChange,
  players, 
  npcs, 
  persistentEnemies,
  onClose
}) => {
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);

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
        <button 
          onClick={clearCombat}
          className="btn-ghost flex-1 py-2.5 rounded"
        >
          Clear
        </button>
        <button 
          onClick={nextTurn}
          className="btn-filled flex-[2] py-2.5 rounded flex items-center justify-center gap-2"
        >
          Next &rarr;
        </button>
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
            {sortedCombatants.map((c) => (
              <div 
                key={c.id} 
                className={cn(
                  "relative overflow-hidden rounded-lg border transition-all flex items-stretch h-[76px]",
                  activeCombatantId === c.id 
                    ? "bg-[#1d1a16] border-[var(--accent)] shadow-[0_0_15px_rgba(205,127,50,0.15)]" 
                    : "bg-[#181512] border-[#2e261d]"
                )}
              >
                {/* Colored Left Bar */}
                <div className={cn(
                  "w-1.5 shrink-0",
                  c.type === 'enemy' ? "bg-red-500" : 
                  c.type === 'player' ? "bg-blue-500" : "bg-emerald-600"
                )} />

                <div className="flex-1 py-3 pr-3 flex items-center gap-4">
                  {/* Initiative Box */}
                  <div className="ml-3 w-8 h-8 bg-black rounded flex items-center justify-center text-[15px] font-bold text-white shrink-0 border border-white/5">
                    {c.initiative}
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="font-bold text-[16px] truncate font-serif text-white tracking-wide">{c.name}</div>
                      {c.type === 'player' && (
                        <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-blue-500/30">
                          LVL {getCharacterLevel(c.classes)}
                        </span>
                      )}
                    </div>

                    {/* Status Row */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-[11px] opacity-60 font-bold shrink-0 text-white">
                        <Shield size={12} className="opacity-70" /> {c.ac}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[var(--accent)] transition-all shadow-[0_0_8px_rgba(205,127,50,0.3)]"
                            style={{ width: `${(c.hp / c.maxHp) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-sans font-bold opacity-80 shrink-0 w-6 text-white">{c.hp}/</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <div className="flex flex-col items-center gap-1.5 mr-1 pt-0.5">
                      <button onClick={() => updateHp(c.id, -1)} className="hover:text-yellow-400 text-yellow-600/50 transition-colors">
                        <ChevronDown size={14} strokeWidth={3} />
                      </button>
                      <button onClick={() => updateHp(c.id, 1)} className="hover:text-emerald-400 text-emerald-600/50 transition-colors">
                        <ChevronUp size={14} strokeWidth={3} />
                      </button>
                    </div>
                    <button onClick={() => removeCombatant(c.id)} className="p-1 hover:bg-white/10 rounded opacity-30 hover:opacity-100 transition-opacity ml-1 text-white">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
