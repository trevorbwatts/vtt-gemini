import React, { useState, useEffect, useRef } from 'react';
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

interface CombatantTrait {
  resistant: boolean;
  immune: boolean;
  vulnerable: boolean;
}

interface SpellDamageModalProps {
  isOpen: boolean;
  spellName: string;
  saveAbility: string;
  saveDc: number;
  halfDamageOnSave: boolean;
  saveResults: Record<string, SaveResult>;
  damageType?: string;
  combatantTraits?: Record<string, CombatantTrait>;
  onApply: (damages: Record<string, number>) => void;
  onClose: () => void;
}

function applyTraits(base: number, trait: CombatantTrait | undefined): number {
  if (!trait) return base;
  if (trait.immune) return 0;
  let val = base;
  if (trait.resistant) val = Math.floor(val / 2);
  if (trait.vulnerable) val = val * 2;
  return val;
}

function TraitBadge({ trait }: { trait: CombatantTrait | undefined }) {
  if (!trait) return null;
  if (trait.immune) return (
    <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
      Immune
    </span>
  );
  if (trait.resistant) return (
    <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shrink-0">
      Resist
    </span>
  );
  if (trait.vulnerable) return (
    <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 shrink-0">
      Vuln
    </span>
  );
  return null;
}

export const SpellDamageModal: React.FC<SpellDamageModalProps> = ({
  isOpen,
  spellName,
  saveAbility,
  saveDc,
  halfDamageOnSave,
  saveResults,
  damageType,
  combatantTraits,
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

  useEffect(() => {
    if (isOpen) {
      setTotalDamage('');
      setIndividualDamage({});
      setDirtyFields(new Set());
      setTimeout(() => totalInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const val = parseInt(totalDamage, 10);
    if (isNaN(val) || val < 0) return;

    const updates: Record<string, string> = {};
    for (const [id] of failed) {
      if (!dirtyFields.has(id)) {
        const adjusted = applyTraits(val, combatantTraits?.[id]);
        updates[id] = String(adjusted);
      }
    }
    if (halfDamageOnSave) {
      const halfVal = Math.floor(val / 2);
      for (const [id] of passed) {
        if (!dirtyFields.has(id)) {
          const adjusted = applyTraits(halfVal, combatantTraits?.[id]);
          updates[id] = String(adjusted);
        }
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
              <p className="text-[11px] text-white/50 mt-0.5">
                {abilityLabel} Save DC {saveDc}
                {damageType && <span className="ml-2 opacity-70">· {damageType}</span>}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* ── Player Damage Input ── */}
            {hasMonsters && (
              <div>
                <label className="text-[11px] uppercase tracking-widest font-bold text-white/40 mb-1.5 block">
                  Damage Rolled by Player
                </label>
                <input
                  ref={totalInputRef}
                  type="number"
                  min="0"
                  value={totalDamage}
                  onChange={(e) => setTotalDamage(e.target.value)}
                  placeholder="Enter damage..."
                  className="w-full h-12 text-center text-2xl font-bold bg-black/50 border border-orange-500/30 rounded-lg text-orange-400 placeholder:text-white/20 focus:outline-none focus:border-orange-500/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            )}

            {/* ── Monster Save Results ── */}
            {hasMonsters && (
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
                      {failed.map(([id, result]) => {
                        const trait = combatantTraits?.[id];
                        const isImmune = trait?.immune;
                        return (
                          <div key={id} className="flex items-center gap-2 bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs font-bold text-white/70 flex-1 truncate">{result.name}</span>
                            <TraitBadge trait={trait} />
                            <span className="text-[9px] text-red-400/60 shrink-0">{result.total}</span>
                            <input
                              type="number"
                              min="0"
                              value={individualDamage[id] || ''}
                              onChange={(e) => handleIndividualChange(id, e.target.value)}
                              placeholder="0"
                              disabled={isImmune}
                              className={cn(
                                "w-12 h-6 text-center text-[12px] font-bold bg-black/50 border rounded text-red-400 placeholder:text-white/15 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                isImmune
                                  ? "border-white/10 opacity-30 cursor-not-allowed"
                                  : "border-red-500/20 focus:border-red-500/50"
                              )}
                            />
                          </div>
                        );
                      })}
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
                      {passed.map(([id, result]) => {
                        const trait = combatantTraits?.[id];
                        const isImmune = trait?.immune;
                        return (
                          <div key={id} className="flex items-center gap-2 bg-green-500/5 border border-green-500/10 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs font-bold text-white/70 flex-1 truncate">{result.name}</span>
                            <TraitBadge trait={trait} />
                            <span className="text-[9px] text-green-400/60 shrink-0">{result.total}</span>
                            <input
                              type="number"
                              min="0"
                              value={individualDamage[id] || ''}
                              onChange={(e) => handleIndividualChange(id, e.target.value)}
                              placeholder="0"
                              disabled={isImmune}
                              className={cn(
                                "w-12 h-6 text-center text-[12px] font-bold bg-black/50 border rounded text-green-400 placeholder:text-white/15 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                isImmune
                                  ? "border-white/10 opacity-30 cursor-not-allowed"
                                  : "border-green-500/20 focus:border-green-500/50"
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Players-only AoE — no monsters to apply damage to */}
            {!hasMonsters && (
              <p className="text-sm text-white/30 text-center py-2">
                No monsters in AoE — announce damage to players.
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
