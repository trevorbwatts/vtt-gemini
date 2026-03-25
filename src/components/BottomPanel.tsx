import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Combatant, Token, cn, ClassDefinition } from '../types';
import { Trash2, Zap, Swords, ChevronRight, Skull, X, Footprints, Droplet, Feather, Shovel, Circle, Cone, Slash, Box, Cylinder } from '../icons';
import { SpeedText } from './SpeedText';
import { SpellAccordion } from './SpellAccordion';
import { parseSpellcastingTrait } from '../data/spellDatabase';

const getCharacterLevel = (classes?: ClassDefinition[]) => {
  return classes?.reduce((sum, c) => sum + c.level, 0) || 0;
};

const getClassSummary = (classes?: ClassDefinition[]) => {
  if (!classes || classes.length === 0) return '';
  return classes.map(c => `${c.name} ${c.level}`).join(' / ');
};

interface BottomPanelProps {
  // Combat / initiative
  activeCombatants: Combatant[];
  onActiveCombatantsChange: (combatants: Combatant[]) => void;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  scenarioCombatants: Combatant[];
  onCombatantClick?: (combatantId: string) => void;
  onStartCombat?: (tokenIds: string[]) => void;
  selectedTokenCount?: number;
  onClearMovementPaths?: () => void;
  onActiveCombatantIdChange?: (id: string | null) => void;
  aoeHighlights?: {
    affectedCombatantIds: string[];
    saveResults: Record<string, { roll: number; modifier: number; total: number; success: boolean; name: string }> | null;
  } | null;

  // Token selection
  tokens: Token[];
  selectedTokenIds: string[];
  onSelectedTokenIdChange?: (id: string | null) => void;
  onSelectedTokenIdsChange?: (ids: string[]) => void;

  // HP management (for token detail panel)
  onUpdateCombatantHp: (sourceCombatantId: string, delta: number) => void;

  // Spell casting from detail panel
  startCastingRef?: React.MutableRefObject<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }, combatantId: string) => void) | null>;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  activeCombatants,
  onActiveCombatantsChange,
  players,
  npcs,
  persistentEnemies,
  scenarioCombatants,
  onCombatantClick,
  onStartCombat,
  selectedTokenCount = 0,
  onClearMovementPaths,
  onActiveCombatantIdChange,
  aoeHighlights,
  tokens,
  selectedTokenIds,
  onSelectedTokenIdChange,
  onSelectedTokenIdsChange,
  onUpdateCombatantHp,
  startCastingRef,
}) => {
  // ── Panel height (resizable) ──
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      const saved = localStorage.getItem('bottom_panel_height');
      return saved ? parseInt(saved, 10) : 280;
    } catch { return 280; }
  });
  const panelHeightRef = useRef(panelHeight);
  panelHeightRef.current = panelHeight;

  // ── Initiative state ──
  const [activeCombatantId, _setActiveCombatantId] = useState<string | null>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeCombatantId) {
      activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeCombatantId]);

  const setActiveCombatantId = (id: string | null) => {
    _setActiveCombatantId(id);
    onActiveCombatantIdChange?.(id);
  };

  const [panelHpInput, setPanelHpInput] = useState('');

  const affectedSet = useMemo(() => new Set(aoeHighlights?.affectedCombatantIds || []), [aoeHighlights?.affectedCombatantIds]);

  const sortedCombatants = useMemo(() => {
    return [...activeCombatants].sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return a.name.localeCompare(b.name);
    });
  }, [activeCombatants]);

  // ── Initiative logic ──
  const updateInitiative = (id: string, value: number) => {
    onActiveCombatantsChange(activeCombatants.map(c =>
      c.id === id ? { ...c, initiative: value } : c
    ));
  };

  const removeCombatant = (id: string) => {
    onActiveCombatantsChange(activeCombatants.filter(c => c.id !== id));
    if (activeCombatantId === id) {
      const index = sortedCombatants.findIndex(c => c.id === id);
      const nextIndex = (index + 1) % sortedCombatants.length;
      if (sortedCombatants.length > 1) {
        setActiveCombatantId(sortedCombatants[nextIndex === 0 && sortedCombatants.length > 1 ? 0 : nextIndex].id);
      } else {
        setActiveCombatantId(null);
      }
    }
  };

  const nextTurn = () => {
    if (sortedCombatants.length === 0) return;
    onClearMovementPaths?.();
    const currentIndex = sortedCombatants.findIndex(c => c.id === activeCombatantId);
    if (currentIndex === -1) {
      setActiveCombatantId(sortedCombatants[0].id);
      return;
    }
    const nextIndex = (currentIndex + 1) % sortedCombatants.length;
    setActiveCombatantId(sortedCombatants[nextIndex].id);
  };

  const nextTurnRef = useRef(nextTurn);
  nextTurnRef.current = nextTurn;

  useEffect(() => {
    if (!window.electronAPI?.onPlayerEndTurn) return;
    window.electronAPI.onPlayerEndTurn(() => nextTurnRef.current());
    return () => { window.electronAPI?.removePlayerEndTurnListener?.(); };
  }, []);

  const clearCombat = () => {
    onActiveCombatantsChange([]);
    setActiveCombatantId(null);
  };

  const combatStarted = activeCombatantId !== null;
  const combatActive = activeCombatants.length > 0;

  // ── Resize handle ──
  const startResize = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const startHeight = panelHeightRef.current;
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      const delta = startY - clientY;
      const newHeight = Math.min(
        window.innerHeight * 0.6,
        Math.max(180, startHeight + delta)
      );
      setPanelHeight(newHeight);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      localStorage.setItem('bottom_panel_height', String(panelHeightRef.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove);
    document.addEventListener('touchend', onUp);
  }, []);

  // ── Resolve selected token for detail panel ──
  const allSourceCombatants = useMemo(
    () => [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants],
    [players, npcs, persistentEnemies, scenarioCombatants]
  );

  // Determine which combatant to show in the detail column
  const detailCombatant = useMemo(() => {
    // If a single token is selected on the map, show that one
    if (selectedTokenIds.length === 1) {
      const token = tokens.find(t => t.id === selectedTokenIds[0]);
      if (token?.type === 'player') return null; // players use Character Sheet modal
      const sourceCombatantId = token?.combatantId;
      const source = allSourceCombatants.find(c => c.id === sourceCombatantId);
      const active = activeCombatants.find(ac => ac.sourceCombatantId === sourceCombatantId);
      const merged = active ? { ...source, ...active } : source;
      if (merged) return { combatant: merged as Combatant, token, sourceCombatantId };
    }
    // During combat, default to the active combatant's detail
    if (combatActive && activeCombatantId) {
      const activeComb = sortedCombatants.find(c => c.id === activeCombatantId);
      if (activeComb && activeComb.type !== 'player') {
        const sourceId = activeComb.sourceCombatantId || activeComb.id;
        const token = tokens.find(t => t.combatantId === sourceId);
        return { combatant: activeComb, token, sourceCombatantId: sourceId };
      }
    }
    return null;
  }, [selectedTokenIds, tokens, allSourceCombatants, activeCombatants, combatActive, activeCombatantId, sortedCombatants]);

  const detailToken = detailCombatant?.token;
  const detailSource = detailCombatant?.combatant;
  const detailSourceId = detailCombatant?.sourceCombatantId;

  // ── Visibility ──
  // Show panel if: combat is active, OR a non-player token is selected
  const showPanel = combatActive || (selectedTokenIds.length === 1 && (() => {
    const token = tokens.find(t => t.id === selectedTokenIds[0]);
    return token && token.type !== 'player';
  })());

  // Show the Roll Initiative floating button when tokens are selected but combat hasn't started
  const selectedTokens = selectedTokenIds.map(id => tokens.find(t => t.id === id)).filter(Boolean);
  const showRollButton = !combatActive
    && selectedTokens.length >= 2
    && selectedTokens.some(t => t!.type === 'player');

  if (!showPanel && !showRollButton) return null;

  // ── Detail panel HP controls ──
  const applyPanelHpDelta = (sign: 1 | -1) => {
    const val = parseInt(panelHpInput || '0', 10);
    if (!val || !detailSourceId) return;
    onUpdateCombatantHp(detailSourceId, val * sign);
    setPanelHpInput('');
  };

  const hpPct = detailSource && detailSource.maxHp > 0 ? (detailSource.hp / detailSource.maxHp) * 100 : 0;

  const AOE_ICONS: Record<string, React.FC<{ size?: number }>> = {
    sphere: Circle, cone: Cone, line: Slash, cube: Box, cylinder: Cylinder,
  };
  const makeAoeBadge = (aoeType?: string, aoeSize?: number) => {
    if (!aoeType) return undefined;
    const Icon = AOE_ICONS[aoeType];
    return (
      <span className="flex items-center gap-0.5">
        {aoeSize ? `${aoeSize}ft` : ''}
        {Icon && <Icon size={10} />}
      </span>
    );
  };

  const rollButtonBottom = showPanel ? panelHeight + 24 : 24;

  return (
    <>
      {/* Floating Roll Initiative button — hovers above the bottom panel */}
      {showRollButton && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ bottom: rollButtonBottom }}
        >
          <button
            onClick={() => onStartCombat?.([])}
            className="btn-filled px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          >
            <Swords size={14} />
            Roll Initiative ({selectedTokenCount})
          </button>
        </div>
      )}

      {/* Main panel */}
      {showPanel && <div
      style={{ height: panelHeight }}
      className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--line)] shadow-2xl z-40 flex flex-col animate-in slide-in-from-bottom duration-300"
    >
      {/* Drag handle */}
      <div
        onMouseDown={startResize}
        onTouchStart={startResize}
        className="h-2 cursor-ns-resize flex items-center justify-center shrink-0 hover:bg-white/5 transition-colors group"
      >
        <div className="w-10 h-0.5 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left column: Initiative list (only during combat) */}
        {combatActive && (
          <div className="w-[340px] border-r border-[var(--line)] flex flex-col shrink-0">
            {/* Header row — same height as detail header */}
            <div className="flex items-center gap-2 px-3 border-b border-[var(--line)] bg-black/20 shrink-0 h-[52px]">
              <Swords size={11} className="opacity-40 text-[var(--ink)]" />
              <span className="text-[11px] uppercase tracking-[0.15em] font-bold opacity-40 text-[var(--ink)]">Initiative Tracker</span>
            </div>

            {/* Action buttons */}
            <div className="px-3 py-2 flex gap-2 shrink-0 border-b border-[var(--line)]">
              {!combatStarted && activeCombatants.length === 0 ? (
                <button
                  onClick={() => onStartCombat?.([])}
                  disabled={selectedTokenCount === 0}
                  className="btn-filled w-full py-1 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                >
                  <Swords size={11} />
                  Roll Initiative {selectedTokenCount > 0 ? `(${selectedTokenCount})` : ''}
                </button>
              ) : (
                <>
                  <button
                    onClick={clearCombat}
                    className="btn-ghost flex-1 py-1 rounded !border-red-500/60 !text-red-400 hover:!bg-red-500/10 hover:!text-red-300 hover:!border-red-500/60 text-xs"
                  >
                    <Trash2 size={11} />
                    Clear
                  </button>
                  <button
                    onClick={nextTurn}
                    className="btn-filled flex-[2] py-1 rounded flex items-center justify-center text-xs"
                  >
                    {combatStarted ? 'Next Turn' : 'Start Combat'}
                  </button>
                </>
              )}
            </div>

            {/* Combatant cards */}
            <div className="flex-1 overflow-y-auto px-3 py-2 overflow-x-hidden">
              {sortedCombatants.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-4 text-[var(--ink)]">
                  <Zap size={24} className="mb-2" />
                  <p className="text-[11px] font-sans uppercase tracking-[0.15em] font-bold">No active combat</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedCombatants.map((c) => {
                    const isActive = activeCombatantId === c.id;
                    const isEnemy = c.type === 'enemy';
                    const isPlayer = c.type === 'player';
                    const isAoeAffected = affectedSet.has(c.sourceCombatantId || c.id);

                    return (
                      <div
                        key={c.id}
                        ref={isActive ? activeCardRef : null}
                        onClick={() => {
                          onCombatantClick?.(c.id);
                          // Also select the token on the map
                          const sourceId = c.sourceCombatantId || c.id;
                          const token = tokens.find(t => t.combatantId === sourceId);
                          if (token) {
                            onSelectedTokenIdChange?.(token.id);
                            onSelectedTokenIdsChange?.([token.id]);
                          }
                        }}
                        className={cn(
                          "relative overflow-hidden rounded-lg border transition-all p-2.5 cursor-pointer",
                          isActive
                            ? "bg-[#1d1a16] border-[var(--accent)] shadow-[0_0_15px_rgba(205,127,50,0.15)]"
                            : isAoeAffected
                            ? "bg-[#1c1510] border-orange-500/50 shadow-[0_0_12px_rgba(255,120,30,0.15)]"
                            : "bg-[#181512] border-[#2e261d]"
                        )}
                      >
                        {/* Top row: initiative, avatar, name/stats, delete */}
                        <div className="flex items-center gap-2.5">
                          {/* Initiative input */}
                          <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              value={c.initiative}
                              onChange={(e) => updateInitiative(c.id, parseInt(e.target.value) || 0)}
                              className="w-7 h-6 rounded text-[12px] text-center font-bold bg-black border border-white/10 text-white focus:outline-none focus:border-[var(--accent)] hover:border-white/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>

                          {/* Avatar */}
                          {c.avatar ? (
                            <div className={cn(
                              "w-9 h-9 rounded-full overflow-hidden border-2 shrink-0",
                              isEnemy ? "border-red-500" :
                              isPlayer ? "border-blue-500" : "border-emerald-500"
                            )}>
                              <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center border-2 shrink-0",
                              isEnemy ? "border-red-500 bg-red-500/10" :
                              isPlayer ? "border-blue-500 bg-blue-500/10" : "border-emerald-500 bg-emerald-500/10"
                            )}>
                              <Skull size={16} className="text-white/40" />
                            </div>
                          )}

                          {/* Center: name only */}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[13px] truncate font-serif text-white tracking-wide">{c.name}</div>
                          </div>

                          {/* Delete */}
                          <div className="flex items-center shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); removeCombatant(c.id); }} className="p-1 hover:bg-white/10 rounded opacity-30 hover:opacity-100 transition-opacity text-white">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right column: Token detail (or full width if no combat) */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {detailSource ? (
            <>
              {/* Detail header */}
              <div className="flex items-center justify-between px-3 border-b border-[var(--line)] bg-black/20 shrink-0 h-[52px]">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {detailToken?.color && (
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: detailToken.color }} />
                    )}
                    <h4 className="font-bold text-base tracking-tight truncate">{detailSource.name}</h4>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 px-2 justify-end">
                    <div className="w-48 h-2 bg-black/50 rounded-full overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-[var(--accent)] transition-all shadow-[0_0_6px_rgba(205,127,50,0.4)]"
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    <div className="text-xs font-bold text-white/50 w-20 text-right tabular-nums">
                      {detailSource.hp}/{detailSource.maxHp} HP
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => applyPanelHpDelta(-1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                      >
                        <span className="text-[14px] font-bold leading-none">&minus;</span>
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={panelHpInput}
                        onChange={(e) => setPanelHpInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyPanelHpDelta(-1); }}
                        placeholder="0"
                        className="w-10 h-6 text-center text-[12px] font-bold bg-black/50 border border-white/10 rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => applyPanelHpDelta(1)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 transition-colors"
                      >
                        <span className="text-[14px] font-bold leading-none">+</span>
                      </button>
                    </div>
                  </div>
                </div>
                {!combatActive && (
                  <button
                    onClick={() => {
                      onSelectedTokenIdChange?.(null);
                      onSelectedTokenIdsChange?.([]);
                      setPanelHpInput('');
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-colors opacity-50 hover:opacity-100 shrink-0"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Detail content: stats, actions, spells */}
              <div className="flex-1 overflow-x-auto p-4 flex gap-8">
                {/* Column 0: Combat stats (AC, Speed, Level/CR) */}
                <div className="min-w-[120px] flex flex-col gap-2 shrink-0">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-0">Stats</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div className="text-[8px] uppercase opacity-50">AC</div>
                      <div className="text-sm font-bold">{detailSource.ac}</div>
                    </div>
                    {detailSource.type === 'player' ? (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-[8px] uppercase opacity-50">Level</div>
                        <div className="text-sm font-bold">{getCharacterLevel(detailSource.classes)}</div>
                      </div>
                    ) : detailSource.cr ? (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-[8px] uppercase opacity-50">CR</div>
                        <div className="text-sm font-bold">{detailSource.cr}</div>
                      </div>
                    ) : null}
                  </div>
                  {(detailSource.speedText || detailSource.speed != null) && (() => {
                    const raw = detailSource.speedText || `${detailSource.speed} ft.`;
                    const segments = raw.split(/,\s*/).map(seg => {
                      seg = seg.trim();
                      if (/^fly\s/i.test(seg)) return { Icon: Feather, color: 'text-teal-300', value: seg.replace(/^fly\s*/i, '') };
                      if (/^swim\s/i.test(seg)) return { Icon: Droplet, color: 'text-blue-400', value: seg.replace(/^swim\s*/i, '') };
                      if (/^burrow\s/i.test(seg)) return { Icon: Shovel, color: 'text-amber-600', value: seg.replace(/^burrow\s*/i, '') };
                      return { Icon: Footprints, color: 'text-white/60', value: seg };
                    });
                    return (
                      <div className="bg-black/20 rounded p-2 col-span-2">
                        <div className="text-[8px] uppercase opacity-50 mb-1.5 text-center">Speed</div>
                        <div className="flex flex-col gap-1">
                          {segments.map(({ Icon, color, value }, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Icon size={10} className={color} />
                              <span className="text-sm font-bold leading-none">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Column 1: Stats & Info */}
                <div className="min-w-[200px] flex flex-col gap-4">
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Attributes</h5>
                    {detailSource.stats ? (
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(detailSource.stats).map(([stat, val]) => (
                          <div key={stat} className="bg-black/20 rounded p-2 text-center">
                            <div className="text-[8px] uppercase opacity-50">{stat}</div>
                            <div className="text-sm font-bold">
                              {Math.floor((val - 10) / 2) >= 0 ? '+' : ''}{Math.floor((val - 10) / 2)}
                            </div>
                            <div className="text-[9px] opacity-30">{val}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs opacity-40 italic">No stats available</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailSource.species && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{detailSource.species}</span>}
                    {detailSource.darkvision && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{detailSource.darkvision}ft Darkvision</span>}
                  </div>
                </div>

                {/* Column 2: Actions */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Actions</h5>
                  <div className="space-y-3 pr-2 custom-scrollbar">
                    {detailSource.actions && detailSource.actions.length > 0 ? (
                      detailSource.actions.map((action, i) => (
                        <div key={i} className="text-xs bg-white/5 p-2 rounded border border-white/5">
                          <span className="font-bold italic text-[var(--accent)]">{action.name}.</span> {action.desc}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs opacity-40 italic">No actions listed</p>
                    )}
                  </div>
                </div>

                {/* Column 3: Spells */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Spells</h5>
                  <div className="space-y-1.5 pr-2 custom-scrollbar">
                    {(() => {
                      const startCasting = (spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }) => {
                        if (!spell.aoeType || !spell.aoeSize || !detailSourceId) return;
                        startCastingRef?.current?.(spell, detailSourceId);
                      };

                      // Structured spells
                      if (detailSource.spells && detailSource.spells.length > 0) {
                        return detailSource.spells.map((spell, i) => (
                          <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                            badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                            aoeBadge={makeAoeBadge(spell.aoeType, spell.aoeSize)}
                            saveBadge={spell.saveAbility ? `${spell.saveAbility.toUpperCase()} SAVE` : undefined}
                            onCast={spell.aoeType ? () => startCasting(spell) : undefined} />
                        ));
                      }

                      // Monster spellcasting — parse from specialAbilities
                      const spellcastingTrait = detailSource.specialAbilities?.find(a =>
                        a.name.toLowerCase().includes('spellcasting')
                      );
                      if (spellcastingTrait) {
                        const parsed = parseSpellcastingTrait(spellcastingTrait.desc);
                        if (parsed.spells.length > 0) {
                          return (
                            <>
                              <p className="text-[10px] opacity-40 italic leading-relaxed mb-2">{parsed.preamble}</p>
                              {parsed.spells.map((spell, i) => (
                                <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                                  badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                                  aoeBadge={makeAoeBadge(spell.aoeType, spell.aoeSize)}
                                  saveBadge={spell.saveAbility ? `${spell.saveAbility.toUpperCase()} SAVE${parsed.saveDc ? ` ${parsed.saveDc}` : ''}` : undefined}
                                  onCast={spell.aoeType ? () => startCasting(spell) : undefined} />
                              ))}
                            </>
                          );
                        }
                      }
                      return <p className="text-xs opacity-40 italic">No spells listed</p>;
                    })()}
                  </div>
                </div>
              </div>
            </>
          ) : combatActive ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-8 text-[var(--ink)]">
              <Swords size={28} className="mb-3" />
              <p className="text-xs font-sans uppercase tracking-[0.15em] font-bold">Select a combatant to view details</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>}
    </>
  );
};
