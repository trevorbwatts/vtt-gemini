import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Shield } from '../icons';
import { cn } from '../types';

interface SaveResult {
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  name: string;
}

interface SpellConditionModalProps {
  isOpen: boolean;
  spellName: string;
  saveAbility: string;
  saveDc: number;
  condition: string; // e.g. 'prone', 'restrained', 'blinded'
  saveResults: Record<string, SaveResult>;
  onApply: (applyToIds: string[]) => void;
  onClose: () => void;
}

export const SpellConditionModal: React.FC<SpellConditionModalProps> = ({
  isOpen,
  spellName,
  saveAbility,
  saveDc,
  condition,
  saveResults,
  onApply,
  onClose,
}) => {
  const failed = Object.entries(saveResults).filter(([, r]) => !r.success);
  const passed = Object.entries(saveResults).filter(([, r]) => r.success);

  // DM can uncheck individual failed monsters to override (e.g. Legendary Saves)
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      // Default: all failed monsters get the condition
      setChecked(new Set(failed.map(([id]) => id)));
    }
  }, [isOpen, saveResults]);

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    onApply(Array.from(checked));
    onClose();
  };

  if (!isOpen) return null;

  const abilityLabel = saveAbility.toUpperCase();
  const conditionLabel = condition.charAt(0).toUpperCase() + condition.slice(1);

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
              <p className="text-[11px] text-white/50 mt-0.5">{abilityLabel} Save DC {saveDc} — Apply {conditionLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className={cn('grid gap-4', passed.length > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
              {/* Failed Save Column — condition applied (checkable) */}
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
                      <div
                        key={id}
                        onClick={() => toggle(id)}
                        className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-red-500/10 transition-colors"
                      >
                        <div className={cn(
                          'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                          checked.has(id)
                            ? 'bg-red-500/60 border-red-500'
                            : 'bg-transparent border-white/20'
                        )}>
                          {checked.has(id) && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs font-bold text-white/70 flex-1 truncate">{result.name}</span>
                        <span className="text-[9px] text-red-400/60 shrink-0">{result.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Passed Save Column */}
              {passed.length > 0 && (
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
                        <span className="text-xs font-bold text-white/30 flex-1 truncate">{result.name}</span>
                        <span className="text-[9px] text-green-400/60 shrink-0">{result.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {failed.length === 0 && (
              <p className="text-sm text-white/30 text-center py-2">
                No monsters failed — condition not applied.
              </p>
            )}

            <button
              onClick={handleApply}
              className="w-full py-2.5 rounded-lg font-bold text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
            >
              {checked.size > 0 ? `Apply ${conditionLabel} (${checked.size})` : 'Dismiss'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
