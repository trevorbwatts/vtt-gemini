import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from '../icons';
import { cn } from '../types';
import { getDamageRgb } from '../utils/damageColors';
import type { ActionRollResult } from '../utils/actionParser';

const ROLL_MODE_LABEL: Record<string, string> = {
  normal: 'Normal',
  advantage: 'Advantage',
  disadvantage: 'Disadvantage',
};

interface ActionRollModalProps {
  isOpen: boolean;
  actionName: string;
  result: ActionRollResult | null;
  onClose: () => void;
}

export const ActionRollModal: React.FC<ActionRollModalProps> = ({ isOpen, actionName, result, onClose }) => {
  if (!isOpen || !result) return null;

  const { attackRoll, attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage, rollMode, d20Rolls } = result;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
            <h2 className="text-2xl font-serif font-bold tracking-tight text-orange-400">{actionName}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Attack Roll */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm uppercase tracking-widest font-bold text-white/40">Attack Roll</p>
                {rollMode !== 'normal' && (
                  <span className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                    rollMode === 'advantage' && 'text-green-400 border-green-500/30 bg-green-500/10',
                    rollMode === 'disadvantage' && 'text-purple-400 border-purple-500/30 bg-purple-500/10',
                  )}>
                    {ROLL_MODE_LABEL[rollMode]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Breakdown — left side */}
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-sans text-white/30">
                    <span>d20</span>
                    {d20Rolls ? (
                      d20Rolls.map((roll, i) => {
                        const isChosen = roll === attackRoll && (
                          (rollMode === 'advantage' && roll === Math.max(...d20Rolls!)) ||
                          (rollMode === 'disadvantage' && roll === Math.min(...d20Rolls!))
                        );
                        return (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold',
                              isChosen && isCrit && 'text-yellow-400 bg-yellow-500/15',
                              isChosen && isFumble && 'text-red-400 bg-red-500/15',
                              isChosen && !isCrit && !isFumble && 'text-white/80 bg-white/10',
                              !isChosen && 'text-white/25 bg-white/5 line-through',
                            )}
                          >
                            {roll}
                          </span>
                        );
                      })
                    ) : (
                      <span className={cn(
                        'inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold',
                        isCrit && 'text-yellow-400 bg-yellow-500/15',
                        isFumble && 'text-red-400 bg-red-500/15',
                        !isCrit && !isFumble && 'text-white/60 bg-white/10',
                      )}>{attackRoll}</span>
                    )}
                    <span>+</span>
                    <span className="text-white/50">{attackBonus}</span>
                  </div>
                  {isCrit && (
                    <span className="text-xs font-bold uppercase tracking-widest text-yellow-400">
                      Critical Hit!
                    </span>
                  )}
                  {isFumble && (
                    <span className="text-xs font-bold uppercase tracking-widest text-red-400">
                      Critical Miss!
                    </span>
                  )}
                </div>
                {/* Attack total — right side */}
                <div className={cn(
                  'w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold font-sans shrink-0',
                  isCrit && 'bg-yellow-500/15 text-yellow-400 ring-2 ring-yellow-500/30',
                  isFumble && 'bg-red-500/15 text-red-400 ring-2 ring-red-500/30',
                  !isCrit && !isFumble && 'bg-white/10 text-white',
                )}>
                  {attackTotal}
                </div>
              </div>
            </div>

            {/* Damage */}
            <div>
              <p className="text-sm uppercase tracking-widest font-bold text-white/40 mb-2">
                {isCrit ? 'Critical Damage' : 'Damage'}
              </p>
              <div className="space-y-2">
                {damageResults.map((dr, i) => {
                  const rgb = getDamageRgb(dr.damageType);
                  return (
                    <div key={i} className="rounded-lg p-2.5" style={{ backgroundColor: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.12)` }}>
                      <div className="flex items-center gap-2">
                        {/* Breakdown — left side */}
                        <div className="flex items-center gap-1.5 flex-wrap flex-1">
                          <span className="text-xs font-bold font-sans text-white/30 mr-0.5">{dr.diceNotation}</span>
                          {dr.rolls.map((roll, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold font-sans opacity-60"
                              style={{ backgroundColor: `rgba(${rgb}, 0.12)`, color: `rgb(${rgb})` }}
                            >
                              {roll}
                            </span>
                          ))}
                          {dr.modifier !== 0 && (
                            <span className="text-xs font-sans text-white/30">
                              {dr.modifier > 0 ? '+' : '−'}{Math.abs(dr.modifier)}
                            </span>
                          )}
                        </div>
                        {/* Damage total — right side */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-50" style={{ color: `rgb(${rgb})` }}>{dr.damageType}</span>
                          <span className="text-xl font-bold font-sans" style={{ color: `rgb(${rgb})` }}>{dr.total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
              <span className="text-sm uppercase tracking-widest font-bold text-white/40">Total Damage</span>
              <span className={cn(
                'text-3xl font-bold font-sans',
                isCrit ? 'text-yellow-400' : 'text-orange-400',
              )}>
                {totalDamage}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
