import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Shield, Eye, Link as LinkIcon, Download, Edit2, ImagePlus, AlertCircle } from 'lucide-react';
import { Combatant, cn } from '../types';
import { parseDndBeyondCharacter } from '../services/dndBeyondParser';

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
  const [color, setColor] = useState(type === 'player' ? '#3b82f6' : '#10b981');
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatar(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

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
      darkvision,
      color,
      ...(avatar ? { avatar } : {})
    });
    resetAndClose();
  };

  const handleImport = async () => {
    if (!url.trim()) return;
    setIsImporting(true);
    setImportError(null);
    try {
      if (!window.electronAPI?.importDndBeyondCharacter) {
        setImportError('D&D Beyond import requires the Desktop App. Please use the Electron build.');
        return;
      }

      const result = await window.electronAPI.importDndBeyondCharacter(url);

      if (result.error) {
        setImportError(result.error);
        return;
      }

      const parsed = parseDndBeyondCharacter(result.data);
      onAdd({
        ...parsed,
        type,
        color,
        dndBeyondUrl: url.trim(),
      });
      resetAndClose();
    } catch (error: any) {
      setImportError(error.message || 'An unexpected error occurred.');
    } finally {
      setIsImporting(false);
    }
  };

  const resetAndClose = () => {
    setStep('choice');
    setName('');
    setAc(10);
    setDarkvision(0);
    setColor(type === 'player' ? '#3b82f6' : '#10b981');
    setUrl('');
    setAvatar(null);
    setImportError(null);
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
                <div className="flex flex-col gap-2 max-w-[240px] mx-auto">
                  <button
                    onClick={() => setStep('manual')}
                    className="btn-ghost w-full px-4 py-3 rounded-lg"
                  >
                    <Edit2 size={14} />
                    <span>Manually</span>
                  </button>
                  <button
                    onClick={() => setStep('import')}
                    className="btn-ghost w-full px-4 py-3 rounded-lg"
                  >
                    <Download size={14} />
                    <span>Import from D&D Beyond</span>
                  </button>
                </div>
              </div>
            )}

            {step === 'manual' && (
              <div className="space-y-6">

                {/* Avatar Upload */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className={cn(
                      "w-24 h-24 rounded-full border-2 border-dashed border-[var(--line)] flex items-center justify-center overflow-hidden transition-all hover:border-[var(--accent)] group relative",
                      avatar ? "border-solid border-[var(--accent)]" : ""
                    )}
                  >
                    {avatar ? (
                      <>
                        <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ImagePlus size={20} className="text-white" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-[var(--accent)] opacity-40 group-hover:opacity-100 transition-opacity">
                        <ImagePlus size={22} />
                        <span className="text-[9px] uppercase font-bold tracking-wider">Avatar</span>
                      </div>
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  {avatar && (
                    <button
                      onClick={() => setAvatar(null)}
                      className="text-[9px] font-bold uppercase tracking-widest opacity-30 hover:opacity-70 transition-opacity"
                    >
                      Remove
                    </button>
                  )}
                </div>

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
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                      Color
                    </label>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-full h-11 bg-black border border-[var(--line)] rounded-xl px-2 py-1 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button 
                    onClick={() => setStep('choice')}
                    className="btn-text opacity-40 hover:opacity-100"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!name.trim()}
                    onClick={handleManualAdd}
                    className="btn-filled px-6 py-2.5 rounded-lg disabled:opacity-30"
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
                    Color
                  </label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-11 bg-black border border-[var(--line)] rounded-xl px-2 py-1 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    <LinkIcon size={12} /> D&D Beyond Character URL
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setImportError(null); }}
                    placeholder="https://www.dndbeyond.com/characters/12345678"
                    className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                  />
                  <p className="text-[10px] opacity-30 italic">
                    The character must be set to Public on D&D Beyond.
                  </p>
                </div>

                {importError && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-4 pt-2">
                  <button 
                    onClick={() => setStep('choice')}
                    className="btn-text opacity-40 hover:opacity-100"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!url.trim() || isImporting}
                    onClick={handleImport}
                    className="btn-filled px-6 py-2.5 rounded-lg disabled:opacity-30 flex items-center gap-2"
                  >
                    {isImporting ? (
                      <>
                        <span className="animate-spin">⟳</span>
                        Importing...
                      </>
                    ) : (
                      <>Import Character</>
                    )}
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
