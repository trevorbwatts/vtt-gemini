import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Shield, Eye, Link as LinkIcon, Download, Edit2, ImagePlus, AlertCircle, Skull, Search } from '../icons';
import { Combatant, Monster, cn } from '../types';
import { parseDndBeyondCharacter } from '../services/dndBeyondParser';
import { BESTIARY } from '../data/bestiary';
import { ImageCropper } from './ImageCropper';
import { BestiaryList } from './BestiaryList';

const CURATED_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#059669', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#6366f1', // Indigo
];

const PLAYER_COLORS = CURATED_COLORS.filter(c => c !== '#ef4444');

interface AddCombatantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (combatant: Omit<Combatant, 'id'>) => void;
  type: 'player' | 'npc';
  /** When set, the modal opens pre-filled on the manual form and saves changes onto this combatant. */
  editing?: Combatant | null;
}

type Step = 'choice' | 'manual' | 'import' | 'bestiary' | 'bestiary-customize';

export const AddCombatantModal: React.FC<AddCombatantModalProps> = ({ isOpen, onClose, onAdd, type, editing }) => {
  const [step, setStep] = useState<Step>('choice');
  const [name, setName] = useState('');
  const [ac, setAc] = useState(10);
  const [darkvision, setDarkvision] = useState(0);
  const [color, setColor] = useState(type === 'player' ? '#3b82f6' : '#059669');
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [sizeChoice, setSizeChoice] = useState<string>('Medium');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Editing an existing combatant: skip the choice step and pre-fill the manual form.
  useEffect(() => {
    if (isOpen && editing) {
      setStep('manual');
      setName(editing.name);
      setAc(editing.ac ?? 10);
      setDarkvision(editing.darkvision ?? 0);
      setColor(editing.color || (type === 'player' ? '#3b82f6' : '#059669'));
      setAvatar(editing.avatar ?? null);
      setSizeChoice(editing.size || 'Medium');
    }
  }, [isOpen, editing, type]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleManualAdd = () => {
    if (!name.trim()) return;
    if (editing) {
      // Merge edits onto the existing combatant so stats/actions from a
      // bestiary pick or D&D Beyond import survive the edit.
      onAdd({
        ...editing,
        name,
        ac,
        darkvision,
        color,
        avatar: avatar ?? undefined,
        ...(type !== 'player' ? { size: sizeChoice } : {}),
      });
      resetAndClose();
      return;
    }
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
      ...(avatar ? { avatar } : {}),
      ...(type !== 'player' ? { size: sizeChoice } : {}),
    });
    resetAndClose();
  };

  const handleBestiaryAdd = () => {
    if (!name.trim() || !selectedMonster) return;
    // Destructure conflicting Monster fields before spreading:
    // - Monster.type is a creature string (e.g. "Medium Humanoid") → Combatant.creatureType
    // - Monster.speed is a string (e.g. "30 ft.") → Combatant.speedText
    // - Monster.id is not a Combatant field
    const { type: creatureType, speed: speedText, id: _id, ...monsterRest } = selectedMonster;
    const resolvedSize = selectedMonster.size?.includes('/') ? sizeChoice : (selectedMonster.size || 'Medium');
    onAdd({
      ...monsterRest,
      name,
      maxHp: selectedMonster.hp,
      initiative: 0,
      type,
      creatureType,
      speedText,
      size: resolvedSize,
      color,
      avatar: avatar ?? undefined,
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
    setColor(type === 'player' ? '#3b82f6' : '#059669');
    setUrl('');
    setAvatar(null);
    setRawImage(null);
    setImportError(null);
    setSelectedMonster(null);
    setMonsterSearch('');
    setSizeChoice('Medium');
    onClose();
  };

  const filteredMonsters = BESTIARY.filter(m =>
    m.name.toLowerCase().includes(monsterSearch.toLowerCase())
  );

  if (!isOpen) return null;

  const isBestiaryStep = step === 'bestiary';

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
          className={cn(
            "relative w-full bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden",
            isBestiaryStep ? "max-w-md" : "max-w-lg"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
            {isBestiaryStep ? (
              <div className="flex items-center gap-2">
                <Skull size={14} className="text-[#ef4444]" />
                <p className="text-xs font-bold uppercase tracking-widest opacity-50">Bestiary</p>
              </div>
            ) : (
              <h2 className="text-xl font-serif font-bold tracking-tight">
                {editing ? 'Edit' : 'Add'} {type === 'player' ? 'Player' : 'NPC'}
              </h2>
            )}
            <button
              onClick={resetAndClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content. Each step supplies its own padding — this wrapper used to
              add p-8 as well, which left the customize step only 384px of content
              and wrapped the tenth colour swatch onto a row of its own. */}
          <div>
            {step === 'choice' && (
              <div className="space-y-8 text-center p-8">
                <h3 className="text-2xl font-serif font-bold tracking-tight">
                  How do you want to add this {type === 'player' ? 'Player' : 'NPC'}?
                </h3>
                <div className="flex flex-col gap-2 max-w-[240px] mx-auto">
                  <button
                    onClick={() => setStep('manual')}
                    className="btn-ghost w-full px-4 py-3 rounded-lg"
                  >
                    <Edit2 size={14} />
                    <span>Manually from Scratch</span>
                  </button>
                  {type === 'npc' && (
                    <button
                      onClick={() => setStep('bestiary')}
                      className="btn-ghost w-full px-4 py-3 rounded-lg"
                    >
                      <Skull size={14} />
                      <span>Manually from a Monster</span>
                    </button>
                  )}
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
              <div className="space-y-6 p-8">

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
                  {type !== 'player' && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                        Size
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setSizeChoice(s)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                              sizeChoice === s ? "bg-[var(--accent)] text-white" : "bg-black/20 opacity-50 hover:opacity-100"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                      Color
                    </label>
                    <div className="flex flex-wrap gap-2 py-1">
                      {(type === 'player' ? PLAYER_COLORS : CURATED_COLORS).map(c => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className={cn(
                            "w-8 h-8 rounded-full border border-white/10 transition-all hover:scale-110",
                            color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)] scale-110" : "opacity-60 hover:opacity-100"
                          )}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button
                    onClick={() => editing ? resetAndClose() : setStep('choice')}
                    className="btn-text opacity-40 hover:opacity-100"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!name.trim()}
                    onClick={handleManualAdd}
                    className="btn-filled px-6 py-2.5 rounded-lg disabled:opacity-30"
                  >
                    {editing ? 'Save Changes' : `Add ${type === 'player' ? 'Player' : 'NPC'}`}
                  </button>
                </div>
              </div>
            )}

            {step === 'bestiary' && (
              <div className="flex flex-col h-[550px]">
                {/* Just the list — same single-panel shape as the Bestiary. The
                    full stat block used to sit alongside it, which was more detail
                    than picking a monster needs. */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-2 border-b border-[var(--line)]">
                    <div className="relative">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                      <input
                        autoFocus
                        type="text"
                        value={monsterSearch}
                        onChange={(e) => setMonsterSearch(e.target.value)}
                        placeholder="Search monsters..."
                        className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                      />
                    </div>
                  </div>
                  {/* Same virtualized list the Bestiary uses, so both routes to
                      picking a monster look and perform identically. */}
                  <BestiaryList
                    monsters={filteredMonsters}
                    selectedId={selectedMonster?.id ?? null}
                    onSelect={(m) => { setSelectedMonster(m); setSizeChoice(m.size?.includes('/') ? 'Medium' : (m.size || 'Medium')); }}
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-[var(--line)] bg-black/10 shrink-0">
                  <button
                    onClick={() => setStep('choice')}
                    className="btn-text opacity-40 hover:opacity-100"
                  >
                    Back
                  </button>
                  <button
                    disabled={!selectedMonster}
                    onClick={() => setStep('bestiary-customize')}
                    className="btn-filled px-6 py-2.5 rounded-lg disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {step === 'bestiary-customize' && selectedMonster && (
              <div className="space-y-6 p-8">
                <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-[var(--line)]">
                  {selectedMonster.avatar && (
                    <img
                      src={selectedMonster.avatar}
                      alt={selectedMonster.name}
                      className="w-10 h-10 rounded-full object-cover shrink-0 bg-black/20"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold">{selectedMonster.name}</p>
                    <p className="text-[10px] opacity-40 italic">{selectedMonster.type} · CR {selectedMonster.cr} · HP {selectedMonster.hp} · AC {selectedMonster.ac}</p>
                  </div>
                </div>

                {/* Avatar Upload */}
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Custom Avatar</p>
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
                        <span className="text-[9px] uppercase font-bold tracking-wider">Upload</span>
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

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    <User size={12} /> Name
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="NPC Name"
                    className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2 py-1">
                    {CURATED_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "w-8 h-8 rounded-full border border-white/10 transition-all hover:scale-110",
                          color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)] scale-110" : "opacity-60 hover:opacity-100"
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button
                    onClick={() => setStep('bestiary')}
                    className="btn-text opacity-40 hover:opacity-100"
                  >
                    Back
                  </button>
                  <button
                    disabled={!name.trim()}
                    onClick={handleBestiaryAdd}
                    className="btn-filled px-6 py-2.5 rounded-lg disabled:opacity-30"
                  >
                    Add NPC
                  </button>
                </div>
              </div>
            )}

            {step === 'import' && (
              <div className="space-y-6 p-8">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2 py-1">
                    {PLAYER_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "w-8 h-8 rounded-full border border-white/10 transition-all hover:scale-110",
                          color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)] scale-110" : "opacity-60 hover:opacity-100"
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
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
      {rawImage && (
        <ImageCropper
          imageSrc={rawImage}
          onConfirm={(cropped) => { setAvatar(cropped); setRawImage(null); }}
          onCancel={() => setRawImage(null)}
        />
      )}
    </AnimatePresence>
  );
};
