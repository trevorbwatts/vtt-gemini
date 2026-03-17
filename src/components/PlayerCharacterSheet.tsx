import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Heart, Zap, Eye, MoreVertical, Trash2, User } from 'lucide-react';
import { Combatant, cn } from '../types';

interface PlayerCharacterSheetProps {
  player: Combatant | null;
  onClose: () => void;
  onDelete: (playerId: string) => void;
  onColorChange: (playerId: string, color: string) => void;
}

const STAT_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

const statMod = (val: number) => {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
};

const getLevel = (p: Combatant) => p.classes?.reduce((s, c) => s + c.level, 0) || 0;
const getClassSummary = (p: Combatant) =>
  p.classes?.map(c => `${c.name} ${c.level}`).join(' / ') || '';

export const PlayerCharacterSheet: React.FC<PlayerCharacterSheetProps> = ({
  player,
  onClose,
  onDelete,
  onColorChange,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Close 3-dot menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!player) return null;

  const level = getLevel(player);
  const classSummary = getClassSummary(player);
  const ringColor = player.color || '#3b82f6';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Sheet */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 24 }}
          transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
          className="relative w-full max-w-3xl max-h-[90vh] bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="relative flex items-center gap-5 p-6 pb-5 border-b border-[var(--line)] shrink-0"
            style={{ background: `linear-gradient(135deg, ${ringColor}18 0%, transparent 60%)` }}
          >
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-full overflow-hidden shrink-0 border-4 shadow-lg"
              style={{ borderColor: ringColor }}
            >
              {player.avatar ? (
                <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-3xl font-bold text-white"
                  style={{ background: `${ringColor}40` }}
                >
                  {player.name[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + class */}
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-serif font-bold tracking-tight text-white truncate">
                {player.name}
              </h2>
              {classSummary && (
                <p className="text-sm opacity-60 mt-1 font-sans">
                  {classSummary}
                  {level > 0 && (
                    <span
                      className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: `${ringColor}30`, color: ringColor }}
                    >
                      LVL {level}
                    </span>
                  )}
                </p>
              )}
              {player.species && (
                <p className="text-xs opacity-40 mt-0.5 font-sans italic">{player.species}</p>
              )}
            </div>

            {/* Right controls: color picker + 3-dot menu + close */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Color Picker */}
              <div className="relative">
                <button
                  onClick={() => colorInputRef.current?.click()}
                  className="w-9 h-9 rounded-full border-2 border-white/20 hover:border-white/50 transition-colors shadow-md flex items-center justify-center overflow-hidden"
                  style={{ background: ringColor }}
                  title="Change token color"
                >
                  <span className="sr-only">Pick color</span>
                </button>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={ringColor}
                  onChange={(e) => onColorChange(player.id, e.target.value)}
                  className="absolute opacity-0 pointer-events-none w-0 h-0"
                />
              </div>

              {/* 3-dot Menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false); }}
                  className="w-9 h-9 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center"
                  title="More options"
                >
                  <MoreVertical size={18} />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-1 w-44 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden z-10"
                    >
                      {!confirmDelete ? (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={14} />
                          Delete Player
                        </button>
                      ) : (
                        <div className="p-3 space-y-2">
                          <p className="text-[10px] text-center opacity-60 uppercase tracking-widest font-bold">Are you sure?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setConfirmDelete(false); setMenuOpen(false); }}
                              className="flex-1 py-1.5 rounded text-xs border border-[var(--line)] hover:bg-white/5 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => { onDelete(player.id); onClose(); }}
                              className="flex-1 py-1.5 rounded text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Close */}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center opacity-50 hover:opacity-100"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* Quick Stats Row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'HP', value: `${player.hp} / ${player.maxHp}`, icon: <Heart size={14} />, color: '#ef4444' },
                { label: 'AC', value: player.ac, icon: <Shield size={14} />, color: '#3b82f6' },
                { label: 'Speed', value: player.speed ? `${player.speed} ft` : '—', icon: <Zap size={14} />, color: '#f59e0b' },
                { label: 'Darkvision', value: player.darkvision ? `${player.darkvision} ft` : '—', icon: <Eye size={14} />, color: '#8b5cf6' },
              ].map(({ label, value, icon, color }) => (
                <div
                  key={label}
                  className="bg-black/30 border border-white/5 rounded-xl p-3 text-center space-y-1"
                >
                  <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest opacity-40 font-bold">
                    <span style={{ color }}>{icon}</span>
                    {label}
                  </div>
                  <div className="text-lg font-bold font-serif text-white">{value}</div>
                </div>
              ))}
            </div>

            {/* Extra badges */}
            <div className="flex flex-wrap gap-2">
              {player.proficiencyBonus && (
                <span className="px-3 py-1 bg-[var(--accent)]/15 border border-[var(--accent)]/30 rounded-full text-[11px] font-bold text-[var(--accent)]">
                  Prof. +{player.proficiencyBonus}
                </span>
              )}
              {player.species && (
                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] font-sans opacity-70">
                  {player.species}
                </span>
              )}
              {player.dndBeyondUrl && (
                <a
                  href={player.dndBeyondUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] font-sans opacity-50 hover:opacity-100 transition-opacity"
                >
                  D&D Beyond ↗
                </a>
              )}
            </div>

            {/* Ability Scores */}
            {player.stats && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-3">Ability Scores</h3>
                <div className="grid grid-cols-6 gap-2">
                  {Object.entries(player.stats).map(([stat, val]) => (
                    <div
                      key={stat}
                      className="bg-black/30 border border-white/5 rounded-xl py-3 text-center"
                    >
                      <div className="text-[9px] uppercase tracking-widest opacity-40 font-bold mb-1">
                        {STAT_LABELS[stat] || stat.toUpperCase()}
                      </div>
                      <div className="text-xl font-bold font-serif text-white">{val}</div>
                      <div
                        className="text-[11px] font-bold mt-0.5"
                        style={{ color: val >= 14 ? '#4ade80' : val <= 8 ? '#f87171' : 'rgba(255,255,255,0.4)' }}
                      >
                        {statMod(val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two-column: Actions + Spells */}
            <div className="grid grid-cols-2 gap-6">
              {/* Actions */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-3">Actions</h3>
                {player.actions && player.actions.length > 0 ? (
                  <div className="space-y-2">
                    {player.actions.map((action, i) => (
                      <div
                        key={i}
                        className="bg-black/20 border border-white/5 rounded-lg p-3 text-xs"
                      >
                        <div className="font-bold italic text-[var(--accent)] mb-1">{action.name}</div>
                        <div className="opacity-60 leading-relaxed">{action.desc}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs opacity-30 italic">No actions listed.</p>
                )}
              </div>

              {/* Spells */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-3">Spells</h3>
                {player.spells && player.spells.length > 0 ? (
                  <div className="space-y-2">
                    {player.spells.map((spell, i) => (
                      <div
                        key={i}
                        className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-xs"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold italic text-blue-400">{spell.name}</span>
                          <span className="text-[9px] opacity-40 uppercase tracking-wide">
                            {spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                          </span>
                        </div>
                        <div className="opacity-60 leading-relaxed">{spell.desc}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs opacity-30 italic">No spells listed.</p>
                )}
              </div>
            </div>

            {/* Description */}
            {player.description && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-3">Notes</h3>
                <div className="text-sm opacity-70 leading-relaxed bg-black/20 border border-white/5 rounded-xl p-4">
                  {player.description}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
