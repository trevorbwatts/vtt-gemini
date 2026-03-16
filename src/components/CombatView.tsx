import React, { useState, useMemo } from 'react';
import { Combatant, cn, ClassDefinition } from '../types';
import { Plus, Trash2, ChevronUp, ChevronDown, Heart, Shield, Zap, Swords } from 'lucide-react';
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
}

export const CombatView: React.FC<CombatViewProps> = ({ 
  activeCombatants,
  onActiveCombatantsChange,
  players, 
  npcs, 
  persistentEnemies
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
    const nextIndex = (currentIndex + 1) % sortedCombatants.length;
    setActiveCombatantId(sortedCombatants[nextIndex].id);
  };

  const clearCombat = () => {
    onActiveCombatantsChange([]);
    setActiveCombatantId(null);
  };

  return (
    <div className="h-full flex flex-col bg-transparent relative z-10">
      {/* Initiative Controls */}
      <div className="h-10 px-3 border-b border-[var(--line)] bg-black/5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <Swords size={12} className="opacity-50" />
          <h3 className="text-[10px] uppercase tracking-widest opacity-50 font-sans font-bold">Initiative Tracker</h3>
        </div>
        <div className="flex gap-1">
          <button 
            onClick={clearCombat}
            className="px-2 py-0.5 bg-[var(--btn-bg)]/20 text-[var(--btn-bg)] rounded text-[10px] font-sans hover:bg-[var(--btn-bg)]/30 transition-colors"
          >
            CLEAR
          </button>
          <button 
            onClick={sortInitiative}
            className="px-2 py-0.5 bg-[var(--ink)] text-[var(--bg)] rounded text-[10px] font-sans hover:opacity-80"
          >
            RESET
          </button>
          <button 
            onClick={nextTurn}
            className="px-2 py-0.5 border border-[var(--line)] rounded text-[10px] font-sans hover:bg-[var(--surface-hover)]"
          >
            NEXT
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedCombatants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8">
            <Zap size={32} className="mb-2" />
            <p className="text-xs font-sans uppercase tracking-widest">No active combat</p>
            <p className="text-[10px] mt-1">Select tokens on the map and click "Roll Initiative"</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedCombatants.map((c) => (
              <div 
                key={c.id} 
                className={cn(
                  "relative overflow-hidden rounded border transition-all flex items-center gap-3 pr-2",
                  activeCombatantId === c.id ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--surface-hover)]" : "border-[var(--line)] bg-[var(--surface)]",
                )}
              >
                {/* Colored Sidebar */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1",
                  c.type === 'enemy' ? "bg-red-500" : 
                  c.type === 'player' ? "bg-blue-500" : "bg-emerald-500"
                )} />

                {/* Initiative Input */}
                <div className="pl-3 py-3 shrink-0">
                  <input 
                    type="number"
                    value={c.initiative}
                    onChange={(e) => updateInitiative(c.id, parseInt(e.target.value) || 0)}
                    className="w-8 bg-black border border-white/10 rounded text-xs font-bold text-center py-1 outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="py-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-bold text-base truncate font-serif">{c.name}</div>
                    {c.type === 'player' && (
                      <span className="text-[7px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-bold uppercase tracking-wider border border-blue-500/30">
                        LVL {getCharacterLevel(c.classes)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] opacity-60 font-bold shrink-0">
                        <Shield size={10} className="opacity-50" /> {c.ac}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[var(--accent)] transition-all shadow-[0_0_8px_rgba(233,190,89,0.4)]"
                            style={{ width: `${(c.hp / c.maxHp) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-sans font-bold opacity-80 shrink-0">{c.hp}/{c.maxHp}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <div className="flex flex-col items-center">
                    <button onClick={() => updateHp(c.id, -1)} className="p-1 hover:bg-[var(--accent)]/10 rounded text-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors">
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => updateHp(c.id, 1)} className="p-1 hover:bg-emerald-500/10 rounded text-emerald-500/50 hover:text-emerald-500 transition-colors">
                      <ChevronUp size={14} />
                    </button>
                  </div>
                  <button onClick={() => removeCombatant(c.id)} className="p-1 hover:bg-black/10 rounded opacity-20 hover:opacity-100 transition-opacity">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
