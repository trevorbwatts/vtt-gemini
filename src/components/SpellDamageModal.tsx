import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Shield } from '../icons';
import { cn } from '../types';
import { getDamageRgb } from '../utils/damageColors';
import type { ActionRollResult } from '../utils/actionParser';

interface SaveResult {
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  name: string;
}

interface SpellDamageModalProps {
  isOpen: boolean;
  spellName: string;
  saveAbility: string;
  saveDc: number;
  halfDamageOnSave: boolean;
  saveResults: Record<string, SaveResult>;
  rolledDamage: ActionRollResult | null;
  onApply: (damages: Record<string, number>) => void;
  onClose: () => void;
}

export const SpellDamageModal: React.FC<SpellDamageModalProps> = ({
  isOpen,
  spellName,
  saveAbility,
  saveDc,
  halfDamageOnSave,
  saveResults,
  rolledDamage,
  onApply,
  onClose,
}) => {
  const [totalDamage, setTotalDamage] = useState('');
  const [individualDamage, setIndividualDamage] = useState<Record<string, string>>({});
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const totalInputRef = useRef<HTMLInputElement>(null);

  const failed = Object.entries(saveResults).filter(([, r]) => !r.success);
  const passed = Object.entries(saveResults).filter(([, r]) => r.success);
  const hasMonsters = failed.length > 0 || (halfDamageOnSave && passed.length > 0);

  // Auto-fill total damage from rolled result when modal opens; focus input if no pre-roll
  useEffect(() => {
    if (isOpen) {
      const prerolled = rolledDamage ? String(rolledDamage.totalDamage) : '';
      setTotalDamage(prerolled);
      setIndividualDamage({});
      setDirtyFields(new Set());
      if (!rolledDamage) {
        setTimeout(() => totalInputRef.current?.focus(), 100);
      }
    }
  }, [isOpen]);

  // Auto-fill individual damage boxes when total changes
  useEffect(() => {
    const val = parseInt(totalDamage, 10);
    if (isNaN(val) || val < 0) return;

    const updates: Record<string, string> = {};
    for (const [id] of failed) {
      if (!dirtyFields.has(id)) updates[id] = String(val);
    }
    if (halfDamageOnSave) {
      const halfVal = Math.floor(val / 2);
      for (const [id] of passed) {
        if (!dirtyFields.has(id)) updates[id] = String(halfVal);
      }
    }
    setIndividualDamage(prev => ({ ...prev, ...updates }));
  }, [totalDamage]);

  const handleIndividualChange = (id: string, value: string) => {
    setDirtyFields(prev => new Set(prev).add(id));
    setIndividualDamage(prev => ({ ...prev, [id]: value }));
  };

  const handleApply = () => {
    const damages: Record<string, number> = {};
    for (const [id] of failed) {
      const val = parseInt(individualDamage[id] || '0', 10);
      if (val > 0) damages[id] = val;
    }
    if (halfDamageOnSave) {
      for (const [id] of passed) {
        const val = parseInt(individualDamage[id] || '0', 10);
        if (val > 0) damages[id] = val;
      }
    }
    onApply(damages);
    onClose();
  };

  if (!isOpen) return null;

  const abilityLabel = saveAbility.toUpperCase();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
          className="relative w-full max-w-md bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
            <div>
              <h2 className="text-lg font-serif font-bold tracking-tight text-orange-400">{spellName}</h2>
              <p className="text-[11px] text-white/50 mt-0.5">{abilityLabel} Save DC {saveDc}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* ── Damage Roll Breakdown ── */}
            {rolledDamage && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-widest font-bold text-white/40">Damage Rolled</p>
                {rolledDamage.damageResults.map((dr, i) => {
                  const rgb = getDamageRgb(dr.damageType);
                  return (
                    <div key={i} className="rounded-lg p-2.5" style={{ backgroundColor: `rgba(${rgb}, 0.06)`, border: `1px solid rgba(${rgb}, 0.12)` }}>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap flex-1">
                          <span className="text-xs font-bold font-sans text-white/30 mr-0.5">{dr.diceNotation}</span>
                          {dr.rolls.map((roll, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold font-sans opacity-70"
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-bold uppercase tracking-wider opacity-50" style={{ color: `rgb(${rgb})` }}>{dr.damageType}</span>
                          <span className="text-xl font-bold font-sans" style={{ color: `rgb(${rgb})` }}>{dr.total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {rolledDamage.damageResults.length > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-white/30">Total</span>
                    <span className="text-2xl font-bold font-sans text-orange-400">{rolledDamage.totalDamage}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Separator if we have both breakdown and monster section ── */}
            {rolledDamage && hasMonsters && (
              <div className="border-t border-[var(--line)]" />
            )}

            {/* ── Monster Save Results ── */}
            {hasMonsters && (
              <>
                {/* Editable total — hidden when pre-rolled and monsters are shown, but kept for manual override */}
                {!rolledDamage && (
                  <div>
                    <label className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1.5 block">
                      Total Damage Rolled
                    </label>
                    <input
                      ref={totalInputRef}
                      type="number"
                      min="0"
                      value={totalDamage}
                      onChange={(e) => setTotalDamage(e.target.value)}
                      placeholder="Enter damage..."
                      className="w-full h-10 text-center text-lg font-bold bg-black/50 border border-orange-500/30 rounded-lg text-orange-400 placeholder:text-white/20 focus:outline-none focus:border-orange-500/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}

                {/* Two columns: Failed / Passed */}
                <div className={cn("grid gap-4", halfDamageOnSave && passed.length > 0 ? "grid-cols-2" : "grid-cols-1")}>
                  {/* Failed Save Column */}
                  {failed.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Zap size={12} className="text-red-400" />
                        <span className="text-[11px] uppercase tracking-widest font-bold text-red-400">
                          Failed ({failed.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {failed.map(([id, result]) => (
                          <div key={id} className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs font-bold text-white/70 flex-1 truncate">{result.name}</span>
                            <span className="text-[9px] text-red-400/60 shrink-0">{result.total}</span>
                            <input
                              type="number"
                              min="0"
                              value={individualDamage[id] || ''}
                              onChange={(e) => handleIndividualChange(id, e.target.value)}
                              placeholder="0"
                              className="w-12 h-6 text-center text-[12px] font-bold bg-black/50 border border-red-500/20 rounded text-red-400 placeholder:text-white/15 focus:outline-none focus:border-red-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Passed Save Column (half damage) */}
                  {halfDamageOnSave && passed.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield size={12} className="text-green-400" />
                        <span className="text-[11px] uppercase tracking-widest font-bold text-green-400">
                          Passed ({passed.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {passed.map(([id, result]) => (
                          <div key={id} className="flex items-center gap-2 bg-green-500/5 border border-green-500/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs font-bold text-white/70 flex-1 truncate">{result.name}</span>
                            <span className="text-[9px] text-green-400/60 shrink-0">{result.total}</span>
                            <input
                              type="number"
                              min="0"
                              value={individualDamage[id] || ''}
                              onChange={(e) => handleIndividualChange(id, e.target.value)}
                              placeholder="0"
                              className="w-12 h-6 text-center text-[12px] font-bold bg-black/50 border border-green-500/20 rounded text-green-400 placeholder:text-white/15 focus:outline-none focus:border-green-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Players-only AoE — no monsters to apply damage to */}
            {!hasMonsters && (
              <p className="text-sm text-white/30 text-center py-2">
                {rolledDamage ? 'No monsters in AoE — announce damage to players.' : 'No creatures to apply damage to.'}
              </p>
            )}

            {/* Apply / Dismiss Button */}
            <button
              onClick={handleApply}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
            >
              {hasMonsters ? 'Apply Damage' : 'Dismiss'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
