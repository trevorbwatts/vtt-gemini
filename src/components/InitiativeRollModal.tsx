import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Swords, Dices } from '../icons';
import { cn } from '../types';
import type { InitiativeRoll } from '../utils/initiative';

interface InitiativeRollModalProps {
  rolls: InitiativeRoll[];
  /** True when adding to a combat already in progress — changes the verb. */
  isAddingToCombat: boolean;
  /** Called with the final initiative per tracker id, after any DM overrides. */
  onConfirm: (totals: Record<string, number>) => void;
  onClose: () => void;
}

/** Small round avatar, matching the initiative tracker's. */
const RollAvatar: React.FC<{ avatar?: string; name: string; color?: string }> = ({ avatar, name, color }) => (
  <div
    className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-bold text-white border border-black/40"
    style={{ background: avatar ? 'transparent' : (color || '#57534e') }}
  >
    {avatar
      ? <img src={avatar} alt="" className="w-full h-full object-cover" />
      : name.charAt(0).toUpperCase()}
  </div>
);

export const InitiativeRollModal: React.FC<InitiativeRollModalProps> = ({
  rolls,
  isAddingToCombat,
  onConfirm,
  onClose,
}) => {
  // Overrides are kept as raw strings so the field can be empty mid-edit
  // without snapping back to a number under the DM's cursor.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const finalTotal = (roll: InitiativeRoll): number => {
    const raw = overrides[roll.combatant.id];
    if (raw === undefined || raw.trim() === '') return roll.total;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? roll.total : parsed;
  };

  const handleConfirm = () => {
    const totals: Record<string, number> = {};
    for (const roll of rolls) totals[roll.combatant.id] = finalTotal(roll);
    onConfirm(totals);
  };

  // Enter confirms, Escape cancels — same as the app's other modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA') return;
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Highest first, so the reading order matches turn order.
  const ordered = [...rolls].sort((a, b) => finalTotal(b) - finalTotal(a));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
            <h2 className="text-lg font-serif font-bold tracking-tight text-[var(--accent)]">Initiative</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {/* Column labels — the override field needs explaining, the rest doesn't. */}
            <div className="flex items-center gap-3 px-1">
              <span className="flex-1 text-[9px] uppercase tracking-widest font-bold text-white/25">Roll</span>
              <span className="w-[68px] text-[9px] uppercase tracking-widest font-bold text-white/25 text-center">
                Override
              </span>
            </div>

            {ordered.map(roll => {
              const c = roll.combatant;
              const overridden = (overrides[c.id] ?? '').trim() !== '';
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-black/20 border border-[#2e261d]"
                >
                  <RollAvatar avatar={c.avatar} name={c.name} color={c.color} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[13px] truncate font-serif text-white tracking-wide">
                        {c.name}
                      </span>
                      {roll.advantage && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider bg-green-500/20 text-green-400 border border-green-500/30">
                          Advantage
                        </span>
                      )}
                    </div>

                    {/* The working: dice, then modifier. Shared rolls have none. */}
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/30 font-sans">
                      {roll.shared ? (
                        <span className="italic">matches others of this name</span>
                      ) : (
                        <>
                          {roll.d20s.map((die, i) => {
                            // Under advantage the discarded die is struck through, so
                            // it's obvious which one counted.
                            const kept = die === roll.kept;
                            const isFirstKept = kept && roll.d20s.indexOf(roll.kept) === i;
                            const counted = roll.d20s.length === 1 || isFirstKept;
                            return (
                              <span
                                key={i}
                                className={cn(
                                  'inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold',
                                  counted && die === 20 && 'text-yellow-400 bg-yellow-500/15',
                                  counted && die === 1 && 'text-red-400 bg-red-500/15',
                                  counted && die !== 20 && die !== 1 && 'text-white/80 bg-white/10',
                                  !counted && 'text-white/25 bg-white/5 line-through',
                                )}
                              >
                                {die}
                              </span>
                            );
                          })}
                          <span className="opacity-50">
                            {roll.bonus >= 0 ? `+ ${roll.bonus}` : `− ${Math.abs(roll.bonus)}`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rolled total — dimmed once overridden, so it reads as superseded. */}
                  <span
                    className={cn(
                      'text-xl font-bold tabular-nums shrink-0 w-9 text-right',
                      overridden ? 'text-white/20 line-through' : 'text-[var(--accent)]',
                    )}
                  >
                    {roll.total}
                  </span>

                  {/* Player's own roll goes here. */}
                  <input
                    type="number"
                    value={overrides[c.id] ?? ''}
                    placeholder="—"
                    onChange={e => setOverrides(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="w-[68px] shrink-0 bg-black border border-[var(--line)] rounded-lg py-1.5 text-center text-sm tabular-nums outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--line)] bg-black/10 flex items-center gap-3">
            <p className="flex-1 text-[10px] text-white/30 leading-tight">
              <Dices size={11} className="inline mr-1 -mt-0.5" />
              Type a number to use a player's own roll instead.
            </p>
            <button
              onClick={handleConfirm}
              className="btn-filled px-5 py-2.5 rounded-lg flex items-center gap-2 shrink-0"
            >
              <Swords size={14} />
              {isAddingToCombat ? 'Add to Initiative' : 'Start Combat'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
