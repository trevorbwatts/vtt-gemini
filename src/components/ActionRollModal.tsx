import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from '../icons';
import { cn } from '../types';
import { getDamageRgb } from '../utils/damageColors';
import type { ActionRollResult } from '../utils/actionParser';

interface ActionRollModalProps {
  isOpen: boolean;
  actionName: string;
  result: ActionRollResult | null;
  onClose: () => void;
}

export const ActionRollModal: React.FC<ActionRollModalProps> = ({ isOpen, actionName, result, onClose }) => {
  if (!isOpen || !result) return null;

  const { attackRoll, attackBonus, attackTotal, isCrit, isFumble, damageResults, totalDamage } = result;

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
            <h2 className="text-lg font-serif font-bold tracking-tight text-orange-400">{actionName}</h2>
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
              <p className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2">Attack Roll</p>
              <div className="flex items-center gap-3">
                {/* d20 badge */}
                <div className={cn(
                  'w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold font-mono shrink-0',
                  isCrit && 'bg-yellow-500/15 text-yellow-400 ring-2 ring-yellow-500/30',
                  isFumble && 'bg-red-500/15 text-red-400 ring-2 ring-red-500/30',
                  !isCrit && !isFumble && 'bg-white/10 text-white',
                )}>
                  {attackRoll}
                </div>
                {/* Formula */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-sm font-mono text-white/70">
                    <span>{attackRoll}</span>
                    <span className="text-white/30">+</span>
                    <span>{attackBonus}</span>
                    <span className="text-white/30">=</span>
                    <span className="font-bold text-white text-lg">{attackTotal}</span>
                  </div>
                  {isCrit && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                      Critical Hit!
                    </span>
                  )}
                  {isFumble && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                      Critical Miss!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Damage */}
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-2">
                {isCrit ? 'Critical Damage' : 'Damage'}
              </p>
              <div className="space-y-2">
                {damageResults.map((dr, i) => {
                  const rgb = getDamageRgb(dr.damageType);
                  return (
                    <div key={i} className="rounded-lg p-2.5" style={{ backgroundColor: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.12)` }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Individual dice */}
                        {dr.rolls.map((roll, j) => (
                          <span
                            key={j}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold font-mono"
                            style={{ backgroundColor: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}
                          >
                            {roll}
                          </span>
                        ))}
                        {/* Modifier */}
                        {dr.modifier !== 0 && (
                          <>
                            <span className="text-white/30 text-xs font-mono">{dr.modifier > 0 ? '+' : '−'}</span>
                            <span className="text-xs font-bold font-mono text-white/60">{Math.abs(dr.modifier)}</span>
                          </>
                        )}
                        {/* = total */}
                        <span className="text-white/30 text-xs font-mono">=</span>
                        <span className="text-sm font-bold font-mono" style={{ color: `rgb(${rgb})` }}>{dr.total}</span>
                        {/* Damage type label */}
                        <span className="text-[9px] font-bold uppercase tracking-wider ml-auto opacity-60" style={{ color: `rgb(${rgb})` }}>
                          {dr.damageType}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--line)]">
              <span className="text-[11px] uppercase tracking-widest font-bold text-white/40">Total Damage</span>
              <span className={cn(
                'text-2xl font-bold font-mono',
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
