import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Skull, Shield } from '../icons';
import type { Monster, Token } from '../types';
import { BESTIARY } from '../data/bestiary';
import { cn } from '../types';

interface MakeCreatureModalProps {
  /** The Extra token being promoted — used for the header preview. */
  token: Token;
  onClose: () => void;
  /**
   * Confirm: replace this Extra token with a real Combatant built from the chosen monster.
   * Keeps the Extra's avatar; takes everything else from the monster.
   */
  onConfirm: (monster: Monster, opts: { combatantType: 'enemy' | 'npc'; size: string }) => void;
}

/**
 * Pick a creature from the Bestiary to promote an Extra token with.
 * The token keeps its current avatar (the Extra's face) but gains a real statblock.
 */
export const MakeCreatureModal: React.FC<MakeCreatureModalProps> = ({ token, onClose, onConfirm }) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Monster | null>(null);
  const [combatantType, setCombatantType] = useState<'enemy' | 'npc'>('enemy');
  const [sizeChoice, setSizeChoice] = useState<string>('Medium');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return BESTIARY.filter(m => m.name.toLowerCase().includes(q));
  }, [search]);

  const pickMonster = (m: Monster) => {
    setSelected(m);
    setSizeChoice(m.size?.includes('/') ? 'Medium' : (m.size || 'Medium'));
  };

  const confirm = () => {
    if (!selected) return;
    onConfirm(selected, { combatantType, size: sizeChoice });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)] bg-black/10">
          <div className="flex items-center gap-3">
            {token.avatar && (
              <img
                src={token.avatar}
                alt={token.name}
                className="w-10 h-10 rounded-full object-cover bg-black/30"
              />
            )}
            <div>
              <h2 className="text-base font-bold tracking-tight">Make {token.name} a creature</h2>
              <p className="text-[11px] opacity-50">Keeps this face, picks up the statblock.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* List */}
          <div className="w-2/5 border-r border-[var(--line)] flex flex-col overflow-hidden">
            <div className="p-2 border-b border-[var(--line)]">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search monsters…"
                  className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {filtered.map(m => (
                <button
                  key={m.id}
                  onClick={() => pickMonster(m)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between group",
                    selected?.id === m.id ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-bold">{m.name}</span>
                    <span className={cn("text-[10px] opacity-50", selected?.id === m.id ? "text-white" : "")}>{m.type}</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={cn("text-[10px] font-sans opacity-50", selected?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="w-3/5 flex flex-col overflow-hidden bg-black/5">
            {selected ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xl font-bold tracking-tight truncate">{selected.name}</h4>
                      <p className="text-xs italic opacity-50">{selected.type}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-xs font-bold">HP {selected.hp}</div>
                      <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-xs font-bold">AC {selected.ac}</div>
                      <div className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-bold">CR {selected.cr}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-1 text-center">
                    {Object.entries(selected.stats).map(([stat, val]) => (
                      <div key={stat} className="bg-black/20 rounded p-1">
                        <div className="text-[9px] uppercase opacity-50">{stat}</div>
                        <div className="text-sm font-bold">{val}</div>
                      </div>
                    ))}
                  </div>
                  {selected.description && (
                    <p className="text-sm leading-relaxed opacity-70">{selected.description}</p>
                  )}
                  {selected.actions.length > 0 && (
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                      <div className="space-y-2">
                        {selected.actions.map((a, i) => (
                          <div key={i} className="text-sm leading-relaxed">
                            <span className="font-bold italic text-[var(--accent)]">{a.name}.</span>{' '}
                            <span className="opacity-80 whitespace-pre-wrap">{a.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-[var(--line)] bg-[var(--surface)] space-y-3">
                  {/* Disposition */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-50">Side</span>
                    <div className="flex items-center bg-black/20 rounded-lg p-1 gap-0.5">
                      <button
                        onClick={() => setCombatantType('enemy')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors",
                          combatantType === 'enemy' ? "bg-[#ef4444] text-white" : "opacity-50 hover:opacity-100"
                        )}
                      >
                        <Skull size={12} /> Enemy
                      </button>
                      <button
                        onClick={() => setCombatantType('npc')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors",
                          combatantType === 'npc' ? "bg-emerald-500 text-white" : "opacity-50 hover:opacity-100"
                        )}
                      >
                        <Shield size={12} /> NPC
                      </button>
                    </div>
                  </div>

                  {/* Size — only if polymorphic, else read-only display */}
                  {selected.size?.includes('/') ? (
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-50">Size</span>
                      <div className="flex items-center bg-black/20 rounded-lg p-1 gap-0.5">
                        {selected.size.split('/').map(s => s.trim()).map(s => (
                          <button
                            key={s}
                            onClick={() => setSizeChoice(s)}
                            className={cn(
                              "px-3 py-1 rounded text-xs font-bold transition-colors",
                              sizeChoice === s ? "bg-[var(--accent)] text-white" : "opacity-50 hover:opacity-100"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <button
                    onClick={confirm}
                    className={cn(
                      "btn-filled w-full py-2 rounded-lg shadow-lg",
                      combatantType === 'enemy'
                        ? "!bg-[#ef4444] shadow-[#ef4444]/20"
                        : "!bg-emerald-500 shadow-emerald-500/20"
                    )}
                  >
                    Promote to {selected.name}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-20 p-8 text-center">
                <Skull size={48} className="mb-4" />
                <p className="text-base font-sans uppercase tracking-widest">Select a creature</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MakeCreatureModal;
