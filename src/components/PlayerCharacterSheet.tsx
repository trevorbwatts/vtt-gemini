import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Heart, Zap, Eye, MoreVertical, Trash2, Sword, Sparkles, BookOpen, Award, Backpack, RefreshCw, ChevronDown, Brain } from '../icons';
import { Combatant, cn } from '../types';

interface PlayerCharacterSheetProps {
  player: Combatant | null;
  onClose: () => void;
  onDelete: (playerId: string) => void;
  onColorChange: (playerId: string, color: string) => void;
  onRefresh?: (playerId: string) => Promise<void>;
}

const STAT_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

const CURATED_COLORS = [
  '#3b82f6', '#059669', '#f59e0b', '#8b5cf6',
  '#ec4899', '#f97316', '#06b6d4', '#84cc16', '#6366f1',
];

const statMod = (val: number) => {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
};

const getLevel = (p: Combatant) => p.classes?.reduce((s, c) => s + c.level, 0) || 0;
const getClassSummary = (p: Combatant) =>
  p.classes?.map(c => `${c.name} ${c.level}`).join(' / ') || '';

type SheetTab = 'actions' | 'spells' | 'features' | 'feats' | 'inventory' | 'skills';

const TABS: { id: SheetTab; label: string; icon: React.ReactNode }[] = [
  { id: 'skills',   label: 'Skills',            icon: <Brain size={15} /> },
  { id: 'actions',  label: 'Actions',           icon: <Sword size={15} /> },
  { id: 'spells',   label: 'Spells',            icon: <Sparkles size={15} /> },
  { id: 'features', label: 'Features & Traits', icon: <BookOpen size={15} /> },
  { id: 'feats',    label: 'Feats',             icon: <Award size={15} /> },
  { id: 'inventory',label: 'Inventory',         icon: <Backpack size={15} /> },
];

export const PlayerCharacterSheet: React.FC<PlayerCharacterSheetProps> = ({
  player, onClose, onDelete, onColorChange, onRefresh,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<SheetTab>('skills');
  const menuRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !colorsOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (colorsOpen && colorsRef.current && !colorsRef.current.contains(e.target as Node)) setColorsOpen(false);
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
          <div className="space-y-1.5">
            {player.actions.map((a, i) => (
              <AccordionCard key={i} name={a.name} desc={a.desc}
                nameClass="text-blue-400" bg="bg-blue-500/5" border="border-blue-500/10" />
            ))}
          </div>
        ) : <EmptyTab label="No actions listed." />;

      case 'spells':
        return player.spells && player.spells.length > 0 ? (
          <div className="space-y-1.5">
            {player.spells.map((s, i) => (
              <AccordionCard key={i} name={s.name} desc={s.desc}
                badge={s.level === 0 ? 'Cantrip' : `Level ${s.level}`}
                nameClass="text-purple-400" bg="bg-purple-500/5" border="border-purple-500/10" />
            ))}
          </div>
        ) : <EmptyTab label="No spells listed." />;

      case 'features':
        return player.features && player.features.length > 0 ? (
          <div className="space-y-1.5">
            {player.features.map((f, i) => (
              <AccordionCard key={i} name={f.name} desc={f.desc} badge={f.source}
                nameClass="text-emerald-400" bg="bg-emerald-500/5" border="border-emerald-500/10" />
            ))}
          </div>
        ) : <EmptyTab label="No features or traits listed." />;

      case 'feats':
        return player.feats && player.feats.length > 0 ? (
          <div className="space-y-1.5">
            {player.feats.map((f, i) => (
              <AccordionCard key={i} name={f.name} desc={f.desc}
                nameClass="text-amber-400" bg="bg-amber-500/5" border="border-amber-500/10" />
            ))}
          </div>
        ) : <EmptyTab label="No feats listed." />;

      case 'skills':
        return player.skills && player.skills.length > 0 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {player.skills.map((skill, i) => {
              const modStr = (skill.modifier >= 0 ? '+' : '') + skill.modifier;
              return (
                <div key={i} className="flex items-center gap-2 bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-sm">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{
                    background: skill.expertise ? 'rgba(168,85,247,0.2)' : skill.proficient ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: skill.expertise ? '#a855f7' : skill.proficient ? 'white' : 'rgba(255,255,255,0.3)',
                    border: skill.expertise ? '1px solid rgba(168,85,247,0.5)' : skill.proficient ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.08)',
                  }}>{modStr}</span>
                  <div className="flex-1 min-w-0">
                    <div className={skill.proficient || skill.expertise ? 'text-white font-medium' : 'opacity-50'}>{skill.name}</div>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider opacity-30 shrink-0">{skill.ability.toUpperCase()}</span>
                </div>
              );
            })}
          </div>
        ) : <EmptyTab label="No skill data. Refresh from D&D Beyond." />;

      case 'inventory':
        return player.inventory && player.inventory.length > 0 ? (
          <div className="space-y-1.5">
            {player.inventory.map((item, i) => (
              <AccordionCard key={i} name={item.name} desc={item.desc}
                badge={item.equipped ? 'Equipped' : undefined} badgeAccent={item.equipped}
                suffix={item.quantity != null && item.quantity !== 1 ? `×${item.quantity}` : undefined}
                nameClass="text-white" bg="bg-black/20" border="border-white/5" />
            ))}
          </div>
        ) : <EmptyTab label="No inventory items listed." />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 24 }}
          transition={{ type: 'spring', bounce: 0.18, duration: 0.35 }}
          className="relative w-full max-w-4xl h-[80vh] bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Slim header bar */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--line)] shrink-0"
            style={{ background: `linear-gradient(90deg, ${ringColor}18 0%, transparent 50%)` }}>

            <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 shadow" style={{ borderColor: ringColor }}>
              {player.avatar
                ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white"
                    style={{ background: `${ringColor}40` }}>{player.name[0]?.toUpperCase()}</div>}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-2xl font-serif font-bold text-white truncate">{player.name}</h2>
                {level > 0 && (
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: `${ringColor}30`, color: ringColor }}>Lvl {level}</span>
                )}
              </div>
              {classSummary && <p className="text-sm opacity-50 truncate">{classSummary}{player.species ? ` · ${player.species}` : ''}</p>}
            </div>

            {/* Inline key stats */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center">
                <div className="flex items-center gap-1 text-[10px] opacity-40 uppercase tracking-wider justify-center"><Heart size={11} style={{ color: '#ef4444' }} />HP</div>
                <div className="text-sm font-bold font-serif">{player.hp}<span className="opacity-30 text-xs">/{player.maxHp}</span></div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <div className="flex items-center gap-1 text-[10px] opacity-40 uppercase tracking-wider justify-center"><Shield size={11} style={{ color: '#3b82f6' }} />AC</div>
                <div className="text-sm font-bold font-serif">{player.ac}</div>
              </div>
              {player.speed != null && <>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="flex items-center gap-1 text-[10px] opacity-40 uppercase tracking-wider justify-center"><Zap size={11} style={{ color: '#f59e0b' }} />Spd</div>
                  <div className="text-sm font-bold font-serif">{player.speed} ft</div>
                </div>
              </>}
              {player.darkvision != null && player.darkvision > 0 && <>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="flex items-center gap-1 text-[10px] opacity-40 uppercase tracking-wider justify-center"><Eye size={11} style={{ color: '#8b5cf6' }} />DV</div>
                  <div className="text-sm font-bold font-serif">{player.darkvision} ft</div>
                </div>
              </>}
              {player.initiative != null && <>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="text-[10px] opacity-40 uppercase tracking-wider">Init</div>
                  <div className="text-sm font-bold font-serif" style={{ color: player.initiative >= 0 ? '#4ade80' : '#f87171' }}>
                    {player.initiative >= 0 ? '+' : ''}{player.initiative}
                  </div>
                </div>
              </>}
              {player.proficiencyBonus && <>
                <div className="w-px h-8 bg-white/10" />
                <div className="text-center">
                  <div className="text-[10px] opacity-40 uppercase tracking-wider">Prof</div>
                  <div className="text-sm font-bold font-serif text-[var(--accent)]">+{player.proficiencyBonus}</div>
                </div>
              </>}
              <div className="w-px h-8 bg-white/10" />

              {/* Color swatch */}
              <div className="relative" ref={colorsRef}>
                <button onClick={() => setColorsOpen(!colorsOpen)}
                  className="w-8 h-8 rounded-full border-2 border-white/20 hover:border-white/50 transition-colors shadow-md shrink-0"
                  style={{ background: ringColor }} title="Change token color" />
                <AnimatePresence>
                  {colorsOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }} transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-2 p-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl z-20 w-[184px]">
                      <div className="grid grid-cols-5 gap-2">
                        {CURATED_COLORS.map(c => (
                          <button key={c} onClick={() => { onColorChange(player.id, c); setColorsOpen(false); }}
                            className={cn("w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform",
                              c === ringColor ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--surface)]" : "")}
                            style={{ background: c }} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 3-dot menu */}
              <div className="relative" ref={menuRef}>
                <button onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false); }}
                  className="w-8 h-8 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center">
                  <MoreVertical size={16} />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }} transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-1 w-52 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden z-20">
                      {!confirmDelete ? (
                        <>
                          {onRefresh && (player.dndBeyondId || player.dndBeyondUrl) && (
                            <button disabled={isRefreshing}
                              onClick={async () => { setMenuOpen(false); setIsRefreshing(true); try { await onRefresh(player.id); } finally { setIsRefreshing(false); } }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors disabled:opacity-40">
                              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                              {isRefreshing ? 'Refreshing…' : 'Refresh from D&D Beyond'}
                            </button>
                          )}
                          <button onClick={() => setConfirmDelete(true)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 size={15} /> Delete Player
                          </button>
                        </>
                      ) : (
                        <div className="p-3 space-y-2">
                          <p className="text-xs text-center opacity-60 uppercase tracking-widest font-bold">Are you sure?</p>
                          <div className="flex gap-2">
                            <button onClick={() => { setConfirmDelete(false); setMenuOpen(false); }}
                              className="flex-1 py-1.5 rounded text-sm border border-[var(--line)] hover:bg-white/5 transition-colors">Cancel</button>
                            <button onClick={() => { onDelete(player.id); onClose(); }}
                              className="flex-1 py-1.5 rounded text-sm bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Close */}
              <button onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center opacity-40 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Ability score strip */}
          {player.stats && (
            <div className="flex border-b border-[var(--line)] shrink-0 bg-black/20">
              {Object.entries(player.stats).map(([stat, val]) => {
                const save = player.savingThrows?.[stat];
                const saveStr = save ? (save.modifier >= 0 ? '+' : '') + save.modifier : null;
                return (
                  <div key={stat} className="flex-1 text-center py-2.5 border-r border-white/5 last:border-r-0">
                    <div className="text-[10px] uppercase tracking-widest opacity-40 font-bold">{STAT_LABELS[stat]}</div>
                    <div className="text-xl font-bold font-serif text-white">
                      {statMod(val)}
                    </div>
                    <div className="text-[11px] opacity-40">{val}</div>
                    {saveStr && (
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <span className="w-1 h-1 rounded-full"
                          style={{ background: save?.proficient ? '#4ade80' : 'rgba(255,255,255,0.15)' }} />
                        <span className="text-[10px] opacity-40">{saveStr}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex border-b border-white/10 shrink-0">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-px",
                  activeTab === tab.id ? "border-[var(--accent)] text-white" : "border-transparent opacity-40 hover:opacity-70"
                )}>
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {renderTabContent()}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const EmptyTab: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-sm opacity-30 italic py-4 text-center">{label}</p>
);

interface AccordionCardProps {
  name: string; desc?: string; badge?: string; badgeAccent?: boolean;
  suffix?: string; nameClass?: string; bg: string; border: string;
}

const AccordionCard: React.FC<AccordionCardProps> = ({
  name, desc, badge, badgeAccent, suffix, nameClass = 'text-white', bg, border,
}) => {
  const [open, setOpen] = useState(false);
  const hasDesc = !!desc;
  return (
    <div className={`${bg} border ${border} rounded-lg text-sm overflow-hidden`}>
      <button onClick={() => hasDesc && setOpen(o => !o)}
        className={cn('w-full flex items-center gap-2 px-3 py-2.5 text-left',
          hasDesc ? 'cursor-pointer hover:bg-white/5 transition-colors' : 'cursor-default')}>
        <span className={`font-bold flex-1 min-w-0 truncate ${nameClass}`}>{name}</span>
        {suffix && <span className="shrink-0 font-mono opacity-40">{suffix}</span>}
        {badge && (
          <span className={cn('shrink-0 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
            badgeAccent ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'opacity-40')}>
            {badge}
          </span>
        )}
        {hasDesc && <ChevronDown size={15} className={cn('shrink-0 opacity-40 transition-transform duration-200', open && 'rotate-180')} />}
      </button>
      {hasDesc && open && (
        <div className="px-3 pb-3 opacity-60 leading-relaxed border-t border-white/5 pt-2 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5"
          dangerouslySetInnerHTML={{ __html: desc }} />
      )}
    </div>
  );
};
