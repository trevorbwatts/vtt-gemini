import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Shield, Eye, Link as LinkIcon, Download, Edit2 } from 'lucide-react';
import { Combatant, cn } from '../types';

interface AddCombatantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (combatant: Omit<Combatant, 'id'>) => void;
  type: 'player' | 'npc';
}

type Step = 'choice' | 'manual' | 'import';

export const AddCombatantModal: React.FC<AddCombatantModalProps> = ({ isOpen, onClose, onAdd, type }) => {
  const [step, setStep] = useState<Step>('choice');
  const [name, setName] = useState('');
  const [ac, setAc] = useState(10);
  const [darkvision, setDarkvision] = useState(0);
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleManualAdd = () => {
    if (!name.trim()) return;
    onAdd({
      name,
      hp: 10,
      maxHp: 10,
      ac,
      initiative: 0,
      type,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      actions: [],
      darkvision
    });
    resetAndClose();
  };

  const handleImport = async () => {
    if (!url.trim()) return;
    setIsImporting(true);
    try {
      // Mock import logic
      await new Promise(resolve => setTimeout(resolve, 1500));
      onAdd({
        name: "Imported Character",
        hp: 25,
        maxHp: 25,
        ac: 15,
        initiative: 0,
        type,
        stats: { str: 12, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
        actions: [],
        darkvision: 60
      });
      resetAndClose();
    } catch (error) {
      console.error("Import failed", error);
    } finally {
      setIsImporting(false);
    }
  };

  const resetAndClose = () => {
    setStep('choice');
    setName('');
    setAc(10);
    setDarkvision(0);
    setUrl('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={resetAndClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
            <h2 className="text-xl font-serif font-bold tracking-tight">
              Add {type === 'player' ? 'Player' : 'NPC'}
            </h2>
            <button 
              onClick={resetAndClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-8">
            {step === 'choice' && (
              <div className="space-y-8 text-center">
                <h3 className="text-2xl font-serif font-bold tracking-tight">
                  How do you want to add this {type === 'player' ? 'Player' : 'NPC'}?
                </h3>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setStep('manual')}
                    className="btn-filled flex-1 px-6 py-4 rounded-xl text-sm"
                  >
                    <Edit2 size={20} />
                    <span>Manually</span>
                  </button>
                  <button
                    onClick={() => setStep('import')}
                    className="btn-ghost flex-1 px-6 py-4 rounded-xl text-sm"
                  >
                    <Download size={20} />
                    <span>Import from D&D Beyond</span>
                  </button>
                </div>
              </div>
            )}

            {step === 'manual' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                      <User size={12} /> Name
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Character Name"
                      className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                        <Shield size={12} /> AC
                      </label>
                      <input
                        type="number"
                        value={ac}
                        onChange={(e) => setAc(parseInt(e.target.value))}
                        className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                        <Eye size={12} /> Darkvision
                      </label>
                      <input
                        type="number"
                        value={darkvision}
                        onChange={(e) => setDarkvision(parseInt(e.target.value))}
                        className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button 
                    onClick={() => setStep('choice')}
                    className="text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!name.trim()}
                    onClick={handleManualAdd}
                    className="btn-filled px-8 py-3 rounded-xl disabled:opacity-30"
                  >
                    Add {type === 'player' ? 'Player' : 'NPC'}
                  </button>
                </div>
              </div>
            )}

            {step === 'import' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    <LinkIcon size={12} /> Character URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://www.dndbeyond.com/characters/..."
                      className="flex-1 bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                    />
                    <button
                      disabled={!url.trim() || isImporting}
                      onClick={handleImport}
                      className="btn-ghost px-4 py-3 rounded-xl"
                    >
                      {isImporting ? 'Importing...' : '+ Import Character'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button 
                    onClick={() => setStep('choice')}
                    className="text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!url.trim() || isImporting}
                    onClick={handleImport}
                    className="btn-filled px-8 py-3 rounded-xl disabled:opacity-30"
                  >
                    Add {type === 'player' ? 'Player' : 'NPC'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
