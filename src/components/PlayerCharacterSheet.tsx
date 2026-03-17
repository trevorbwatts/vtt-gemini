import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Heart, Zap, Eye, MoreVertical, Trash2, Sword, Sparkles, BookOpen, Award, Backpack } from 'lucide-react';
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

const CURATED_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#6366f1', // Indigo
];

const statMod = (val: number) => {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
};

const getLevel = (p: Combatant) => p.classes?.reduce((s, c) => s + c.level, 0) || 0;
const getClassSummary = (p: Combatant) =>
  p.classes?.map(c => `${c.name} ${c.level}`).join(' / ') || '';

type SheetTab = 'actions' | 'spells' | 'features' | 'feats' | 'inventory';

const TABS: { id: SheetTab; label: string; icon: React.ReactNode }[] = [
  { id: 'actions',  label: 'Actions',           icon: <Sword size={13} /> },
  { id: 'spells',   label: 'Spells',            icon: <Sparkles size={13} /> },
  { id: 'features', label: 'Features & Traits', icon: <BookOpen size={13} /> },
  { id: 'feats',    label: 'Feats',             icon: <Award size={13} /> },
  { id: 'inventory',label: 'Inventory',         icon: <Backpack size={13} /> },
];

export const PlayerCharacterSheet: React.FC<PlayerCharacterSheetProps> = ({
  player,
  onClose,
  onDelete,
  onColorChange,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<SheetTab>('actions');
  const menuRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    if (!menuOpen && !colorsOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (colorsOpen && colorsRef.current && !colorsRef.current.contains(e.target as Node)) {
        setColorsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, colorsOpen]);

  if (!player) return null;

  const level = getLevel(player);
  const classSummary = getClassSummary(player);
  const ringColor = player.color || '#3b82f6';

  const renderTabContent = () => {
    switch (activeTab) {
      case 'actions':
        return player.actions && player.actions.length > 0 ? (
          <div className="space-y-2">
            {player.actions.map((action, i) => (
              <div key={i} className="bg-black/20 border border-white/5 rounded-lg p-3 text-xs">
                <div className="font-bold text-[var(--accent)] mb-1">{action.name}</div>
                <div className="opacity-60 leading-relaxed">{action.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyTab label="No actions listed." />
        );

      case 'spells':
        return player.spells && player.spells.length > 0 ? (
          <div className="space-y-2">
            {player.spells.map((spell, i) => (
              <div key={i} className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-blue-400">{spell.name}</span>
                  <span className="text-[9px] opacity-40 uppercase tracking-wide">
                    {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
                  </span>
                </div>
                <div className="opacity-60 leading-relaxed">{spell.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyTab label="No spells listed." />
        );

      case 'features':
        return player.features && player.features.length > 0 ? (
          <div className="space-y-2">
            {player.features.map((feat, i) => (
              <div key={i} className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-xs">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-emerald-400">{feat.name}</span>
                  {feat.source && (
                    <span className="text-[9px] opacity-40 uppercase tracking-wide shrink-0 ml-2">{feat.source}</span>
                  )}
                </div>
                <div className="opacity-60 leading-relaxed">{feat.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyTab label="No features or traits listed." />
        );

      case 'feats':
        return player.feats && player.feats.length > 0 ? (
          <div className="space-y-2">
            {player.feats.map((feat, i) => (
              <div key={i} className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 text-xs">
                <div className="font-bold text-amber-400 mb-1">{feat.name}</div>
                <div className="opacity-60 leading-relaxed">{feat.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyTab label="No feats listed." />
        );

      case 'inventory':
        return player.inventory && player.inventory.length > 0 ? (
          <div className="space-y-1.5">
            {player.inventory.map((item, i) => (
              <div key={i} className="bg-black/20 border border-white/5 rounded-lg p-3 text-xs flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.name}</span>
                    {item.equipped && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.5 rounded">
                        Equipped
                      </span>
                    )}
                  </div>
                  {item.desc && <div className="opacity-50 leading-relaxed mt-0.5">{item.desc}</div>}
                </div>
                {item.quantity != null && item.quantity !== 1 && (
                  <span className="shrink-0 text-[11px] font-mono opacity-40">x{item.quantity}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyTab label="No inventory items listed." />
        );
    }
  };

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

        {/* Sheet — wider: max-w-4xl */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 24 }}
          transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
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

            {/* Right controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Color swatch */}
              <div className="relative" ref={colorsRef}>
                <button
                  onClick={() => setColorsOpen(!colorsOpen)}
                  className="w-9 h-9 rounded-full border-2 border-white/20 hover:border-white/50 transition-colors shadow-md"
                  style={{ background: ringColor }}
                  title="Change token color"
                />
                <AnimatePresence>
                  {colorsOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-2 p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl z-10 w-[184px]"
                    >
                      <div className="grid grid-cols-5 gap-2">
                        {CURATED_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => { onColorChange(player.id, c); setColorsOpen(false); }}
                            className={cn(
                              "w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform",
                              c === ringColor ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)]" : ""
                            )}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
          <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
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

            {/* Badges row */}
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

            {/* Divider */}
            <div className="border-t border-white/5" />

            {/* Tab Bar */}
            <div className="flex gap-1 bg-black/20 rounded-xl p-1 shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                    activeTab === tab.id
                      ? "bg-[var(--surface)] text-white shadow-sm"
                      : "opacity-40 hover:opacity-70"
                  )}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="min-h-[120px]">
              {renderTabContent()}
            </div>

            {/* Description / Notes */}
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

const EmptyTab: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-xs opacity-30 italic py-4 text-center">{label}</p>
);
