import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Shield, Eye, Link as LinkIcon, Download, Edit2, ImagePlus, AlertCircle, Skull, Search, Swords } from '../icons';
import { Combatant, Monster, cn } from '../types';
import { parseDndBeyondCharacter } from '../services/dndBeyondParser';
import { BESTIARY } from '../data/bestiary';
import { ImageCropper } from './ImageCropper';

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
}

type Step = 'choice' | 'manual' | 'import' | 'bestiary' | 'bestiary-customize';

export const AddCombatantModal: React.FC<AddCombatantModalProps> = ({ isOpen, onClose, onAdd, type }) => {
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
  const [showSource2014, setShowSource2014] = useState(false);
  const [showSource2024, setShowSource2024] = useState(true);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [sizeChoice, setSizeChoice] = useState<string>('Medium');
  const avatarInputRef = useRef<HTMLInputElement>(null);

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
    // - Monster.source and Monster.id are not Combatant fields
    const { type: creatureType, speed: speedText, source: _source, id: _id, ...monsterRest } = selectedMonster;
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
    m.name.toLowerCase().includes(monsterSearch.toLowerCase()) &&
    ((showSource2014 && m.source === '2014') || (showSource2024 && m.source === '2024'))
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
            isBestiaryStep ? "max-w-4xl" : "max-w-lg"
          )}
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
          <div className={cn(isBestiaryStep ? "" : "p-8")}>
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

            {step === 'bestiary' && (
              <div className="flex flex-col h-[600px]">
                <div className="flex-1 flex overflow-hidden">
                  {/* Left Panel: List */}
                  <div className="w-2/5 border-r border-[var(--line)] flex flex-col overflow-hidden">
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
                    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--line)]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2014} onChange={(e) => setShowSource2014(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-xs opacity-60">2014</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2024} onChange={(e) => setShowSource2024(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-xs opacity-60">2024</span>
                      </label>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                      {filteredMonsters.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedMonster(m); setSizeChoice(m.size?.includes('/') ? 'Medium' : (m.size || 'Medium')); }}
                          className={cn(
                            "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between",
                            selectedMonster?.id === m.id ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold">{m.name}</span>
                            <span className={cn("text-[10px] opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>{m.type}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn("text-[10px] font-sans opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                            <span className={cn("text-[9px] font-sans opacity-30", selectedMonster?.id === m.id ? "text-white" : "")}>{m.source}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Stat Block */}
                  <div className="w-3/5 flex flex-col overflow-hidden bg-black/5">
                    {selectedMonster ? (
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                          {selectedMonster.avatar && (
                            <img
                              key={selectedMonster.id}
                              src={selectedMonster.avatar}
                              alt={selectedMonster.name}
                              className="w-12 h-12 rounded-full object-cover shrink-0 bg-black/20"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xl font-bold tracking-tight truncate">{selectedMonster.name}</h4>
                            <p className="text-xs italic opacity-50">{selectedMonster.type}</p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0 items-end">
                            <div className="flex gap-1.5">
                              <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-xs font-bold">HP {selectedMonster.hp}</div>
                              <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-xs font-bold">AC {selectedMonster.ac}</div>
                            </div>
                            <div className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-bold self-end">CR {selectedMonster.cr}</div>
                          </div>
                        </div>

                        {selectedMonster.size?.includes('/') && (
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Size</span>
                            <div className="flex items-center bg-black/20 rounded-lg p-0.5 gap-0.5">
                              {selectedMonster.size.split('/').map(s => s.trim()).map(s => (
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
                        )}

                        {/* Speed / Senses / Languages */}
                        {(selectedMonster.speed || selectedMonster.senses || selectedMonster.languages) && (
                          <div className="text-xs space-y-0.5 opacity-60">
                            {selectedMonster.speed && <div><span className="font-bold">Speed:</span> {selectedMonster.speed}</div>}
                            {selectedMonster.senses && <div><span className="font-bold">Senses:</span> {selectedMonster.senses}</div>}
                            {selectedMonster.languages && <div><span className="font-bold">Languages:</span> {selectedMonster.languages}</div>}
                          </div>
                        )}

                        {/* Stats Grid */}
                        <div className="grid grid-cols-6 gap-1 text-center">
                          {Object.entries(selectedMonster.stats).map(([stat, val]) => (
                            <div key={stat} className="bg-black/20 rounded p-1">
                              <div className="text-[9px] uppercase opacity-50">{stat}</div>
                              <div className="text-sm font-bold">{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Saves & Defenses */}
                        {(selectedMonster.saves || selectedMonster.immunities || selectedMonster.resistances || selectedMonster.conditionImmunities) && (
                          <div className="text-xs space-y-0.5 opacity-60">
                            {selectedMonster.saves && <div><span className="font-bold">Saves:</span> {selectedMonster.saves}</div>}
                            {selectedMonster.resistances && <div><span className="font-bold">Resistances:</span> {selectedMonster.resistances}</div>}
                            {selectedMonster.immunities && <div><span className="font-bold">Immunities:</span> {selectedMonster.immunities}</div>}
                            {selectedMonster.conditionImmunities && <div><span className="font-bold">Cond. Immunities:</span> {selectedMonster.conditionImmunities}</div>}
                          </div>
                        )}

                        {/* Description */}
                        {selectedMonster.description && (
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Description</h5>
                            <p className="text-sm leading-relaxed opacity-70">{selectedMonster.description}</p>
                          </div>
                        )}

                        {/* Special Abilities */}
                        {selectedMonster.specialAbilities && selectedMonster.specialAbilities.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Traits</h5>
                            <div className="space-y-2">
                              {selectedMonster.specialAbilities.map((ability, i) => (
                                <div key={i} className="text-sm leading-relaxed">
                                  <span className="font-bold italic text-purple-400">{ability.name}.</span>{' '}
                                  <span className="opacity-80 whitespace-pre-wrap">{ability.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {selectedMonster.actions.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                            <div className="space-y-2">
                              {selectedMonster.actions.map((action, i) => (
                                <div key={i} className="text-sm leading-relaxed">
                                  <span className="font-bold italic text-[var(--accent)]">{action.name}.</span>{' '}
                                  <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Reactions */}
                        {selectedMonster.reactions && selectedMonster.reactions.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Reactions</h5>
                            <div className="space-y-2">
                              {selectedMonster.reactions.map((reaction, i) => (
                                <div key={i} className="text-sm leading-relaxed">
                                  <span className="font-bold italic text-blue-400">{reaction.name}.</span>{' '}
                                  <span className="opacity-80 whitespace-pre-wrap">{reaction.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Legendary Actions */}
                        {selectedMonster.legendaryActions && selectedMonster.legendaryActions.length > 0 && (
                          <div>
                            <h5 className="text-xs font-bold uppercase tracking-widest opacity-30 mb-1">Legendary Actions</h5>
                            <div className="space-y-2">
                              {selectedMonster.legendaryActions.map((action, i) => (
                                <div key={i} className="text-sm leading-relaxed">
                                  <span className="font-bold italic text-amber-400">{action.name}.</span>{' '}
                                  <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center opacity-20">
                        <div className="text-center space-y-2">
                          <Skull size={32} className="mx-auto" />
                          <p className="text-sm">Select a monster</p>
                        </div>
                      </div>
                    )}
                  </div>
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
