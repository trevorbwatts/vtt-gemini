import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Combatant, Token, cn, ClassDefinition } from '../types';
import { Trash2, Zap, Swords, ChevronRight, ChevronLeft, Skull, X, Footprints, Droplet, Feather, Shovel, Circle, Cone, Slash, Box, Cylinder, Dices, Eye } from '../icons';
import { SpeedText } from './SpeedText';
import { SpellAccordion } from './SpellAccordion';
import { parseSpellcastingTrait } from '../data/spellDatabase';
import { BESTIARY } from '../data/bestiary';
import { parseAction, rollAction, parseActionAoe, ActionAoe, parseSpellDamage } from '../utils/actionParser';
import { ActionRollModal } from './ActionRollModal';
import type { ActionRollResult } from '../utils/actionParser';
import { parseDamageType, DamageTypeBadge } from '../utils/damageColors';
import actionsData from '../data/actions.json';

const AOE_ICONS_SMALL: Record<string, React.FC<{ size?: number }>> = {
  sphere: Circle, cone: Cone, line: Slash, cube: Box, cylinder: Cylinder,
};

/** Strip the [Area of Effect] marker from a displayed action description. */
function cleanActionDesc(desc: string): string {
  return desc.replace(/\s*\[Area of Effect\]/gi, '').trim();
}

const getCharacterLevel = (classes?: ClassDefinition[]) => {
  return classes?.reduce((sum, c) => sum + c.level, 0) || 0;
};

const getClassSummary = (classes?: ClassDefinition[]) => {
  if (!classes || classes.length === 0) return '';
  return classes.map(c => `${c.name} ${c.level}`).join(' / ');
};

const InitiativeInput: React.FC<{ value: number; onCommit: (value: number) => void }> = ({ value, onCommit }) => {
  const [draft, setDraft] = useState<string>(String(value));

  // Keep draft in sync when the committed value changes externally (e.g. initial roll)
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseInt(draft, 10);
        const committed = isNaN(parsed) ? 0 : parsed;
        setDraft(String(committed));
        onCommit(committed);
      }}
      className="w-7 h-6 rounded text-[12px] text-center font-bold bg-black border border-white/10 text-white focus:outline-none focus:border-[var(--accent)] hover:border-white/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
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
    spellName?: string;
    spellDesc?: string;
    saveEffect?: string;
    condition?: string;
  } | null;

  // Token selection
  tokens: Token[];
  selectedTokenIds: string[];
  /** Token whose details should be shown in the panel. Set on double-click (outside initiative)
   *  or single-click (during initiative). When null, the panel is closed unless combat is active. */
  selectedTokenId?: string | null;
  onSelectedTokenIdChange?: (id: string | null) => void;
  onSelectedTokenIdsChange?: (ids: string[]) => void;

  // HP management (for token detail panel)
  onUpdateCombatantHp: (sourceCombatantId: string, delta: number) => void;
  onRemoveCondition?: (sourceCombatantId: string, condition: string) => void;
  onAddCondition?: (sourceCombatantId: string, condition: string) => void;

  // Spell casting from detail panel
  startCastingRef?: React.MutableRefObject<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string; mapInteraction?: string; saveEffect?: string; condition?: string }, combatantId: string) => void) | null>;

  // Spell marker placement from detail panel
  startPlacingRef?: React.MutableRefObject<((spell: { name: string; school?: string; effectRadius?: number; range?: number; shapeType?: 'point' | 'wall'; maxLength?: number; maxThickness?: number; blocksVision?: boolean }, combatantId: string) => void) | null>;

  // Exception spell handler (e.g. Enlarge/Reduce)
  onExceptionSpellCast?: (spellName: string, casterId: string) => void;

  // Targeting
  targetedCombatantIds?: Set<string>;

  // Wild Shape state — maps playerId to creature name for beast stat display
  wildShapeState?: Record<string, { creatureName: string; originalAvatar?: string }>;

  // Refresh player from D&D Beyond
  onRefreshPlayer?: (playerId: string) => Promise<void>;

  // DM "view as player" — when set, MapView fog is restricted to this player's vision
  dmViewAsPlayerId?: string | null;
  onToggleViewAsPlayer?: (playerId: string) => void;
  /** Direct setter (used by the auto-perspective-on-turn feature to follow whose turn it is). */
  onSetViewAsPlayer?: (playerId: string | null) => void;
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
  selectedTokenId,
  onSelectedTokenIdChange,
  onSelectedTokenIdsChange,
  onUpdateCombatantHp,
  onRemoveCondition,
  onAddCondition,
  startCastingRef,
  startPlacingRef,
  onExceptionSpellCast,
  targetedCombatantIds,
  wildShapeState,
  onRefreshPlayer,
  dmViewAsPlayerId,
  onToggleViewAsPlayer,
  onSetViewAsPlayer,
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

  // ── Auto "View as Player" on each player's turn ──
  // When on, the map fog auto-switches to the active player's perspective during combat,
  // and reverts to combined vision on monster/NPC turns.
  const [autoPerspectiveOnTurn, setAutoPerspectiveOnTurn] = useState<boolean>(() => {
    try { return localStorage.getItem('auto_perspective_on_turn') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('auto_perspective_on_turn', autoPerspectiveOnTurn ? '1' : '0'); } catch { /* */ }
  }, [autoPerspectiveOnTurn]);

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
  const [conditionDropdownOpen, setConditionDropdownOpen] = useState(false);
  const [conditionDropdownPos, setConditionDropdownPos] = useState({ bottom: 0, left: 0 });
  const conditionBtnRef = useRef<HTMLButtonElement>(null);

  // ── Action roll state ──
  const [actionRollOpen, setActionRollOpen] = useState(false);
  const [actionRollName, setActionRollName] = useState('');
  const [actionRollResult, setActionRollResult] = useState<ActionRollResult | null>(null);

  // ── Stat roll popover ──
  const [rollPopover, setRollPopover] = useState<{ label: string; roll: number; modifier: number; total: number; x: number; y: number } | null>(null);
  const handleStatRoll = (label: string, modifier: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const roll = Math.floor(Math.random() * 20) + 1;
    setRollPopover({ label, roll, modifier, total: roll + modifier, x: e.clientX, y: e.clientY });
  };


  const handleRollAction = (actionName: string, desc: string, rollMode: import('../utils/actionParser').RollMode = 'normal') => {
    const parsed = parseAction(desc);
    if (!parsed) return;
    setActionRollName(actionName);
    setActionRollResult(rollAction(parsed, rollMode));
    setActionRollOpen(true);
  };

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
      const first = sortedCombatants.find(c => c.hp > 0);
      if (first) setActiveCombatantId(first.id);
      return;
    }
    // Skip dead combatants
    for (let i = 1; i <= sortedCombatants.length; i++) {
      const candidate = sortedCombatants[(currentIndex + i) % sortedCombatants.length];
      if (candidate.hp > 0) {
        setActiveCombatantId(candidate.id);
        return;
      }
    }
    // All combatants are dead — don't advance
  };

  const prevTurn = () => {
    if (sortedCombatants.length === 0 || !activeCombatantId) return;
    const currentIndex = sortedCombatants.findIndex(c => c.id === activeCombatantId);
    if (currentIndex === -1) return;
    for (let i = 1; i <= sortedCombatants.length; i++) {
      const candidate = sortedCombatants[(currentIndex - i + sortedCombatants.length) % sortedCombatants.length];
      if (candidate.hp > 0) {
        setActiveCombatantId(candidate.id);
        return;
      }
    }
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

  // ── Auto-perspective effect ──
  // While combat is active and the auto-perspective toggle is on: switch the
  // map fog to the current player's vision on their turn, and back to combined
  // vision on monster/NPC turns.
  useEffect(() => {
    if (!autoPerspectiveOnTurn || !onSetViewAsPlayer) return;
    if (!combatActive || !activeCombatantId) {
      onSetViewAsPlayer(null);
      return;
    }
    const active = sortedCombatants.find(c => c.id === activeCombatantId);
    if (active && active.type === 'player') {
      onSetViewAsPlayer(active.sourceCombatantId || active.id);
    } else {
      onSetViewAsPlayer(null);
    }
  }, [autoPerspectiveOnTurn, combatActive, activeCombatantId, sortedCombatants, onSetViewAsPlayer]);

  // When the auto toggle transitions ON→OFF, clear any auto-driven perspective
  // so the DM isn't left stuck in one player's view. (Doesn't fire on mount.)
  const prevAutoRef = useRef(autoPerspectiveOnTurn);
  useEffect(() => {
    if (prevAutoRef.current && !autoPerspectiveOnTurn) {
      onSetViewAsPlayer?.(null);
    }
    prevAutoRef.current = autoPerspectiveOnTurn;
  }, [autoPerspectiveOnTurn, onSetViewAsPlayer]);

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
    // If a token has been opened (double-click outside combat, or single-click during combat), show that one
    if (selectedTokenId) {
      const token = tokens.find(t => t.id === selectedTokenId);
      // Player tokens: wild-shaped shows beast stats, otherwise show player stats
      if (token?.type === 'player') {
        const ws = token.combatantId && wildShapeState?.[token.combatantId];
        if (ws) {
          // Build a virtual combatant from the beast data
          const beast = BESTIARY.find(m => m.name === ws.creatureName && m.source === '2024')
            || BESTIARY.find(m => m.name === ws.creatureName);
          if (!beast) return null;
          const player = allSourceCombatants.find(c => c.id === token.combatantId);
          const virtualCombatant: Combatant = {
            id: token.combatantId || token.id,
            name: beast.name,
            initiative: 0,
            hp: beast.hp,
            maxHp: beast.hp,
            ac: beast.ac,
            type: 'enemy',
            stats: beast.stats,
            actions: beast.actions,
            speed: beast.speed ? parseInt(beast.speed) || 30 : 30,
            color: player?.color,
          };
          return { combatant: virtualCombatant, token, sourceCombatantId: token.combatantId };
        }
        // Normal player: show player stats in panel
        const sourceCombatantId = token.combatantId;
        const source = allSourceCombatants.find(c => c.id === sourceCombatantId);
        const active = activeCombatants.find(ac => ac.sourceCombatantId === sourceCombatantId);
        const merged = active ? { ...source, ...active } : source;
        if (merged) return { combatant: merged as Combatant, token, sourceCombatantId };
        return null;
      }
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
  }, [selectedTokenId, tokens, allSourceCombatants, activeCombatants, combatActive, activeCombatantId, sortedCombatants, wildShapeState]);

  const detailToken = detailCombatant?.token;
  const detailSourceId = detailCombatant?.sourceCombatantId;

  // Enrich combatant with original monster data for fields that weren't stored
  const detailSource = useMemo(() => {
    let combatant = detailCombatant?.combatant;
    if (!combatant) return combatant;
    // Summoned creatures (Find Familiar, Conjure Beast, etc.) carry a monster
    // stat block but may be stored with type 'player' (so their token follows
    // player vision rules). Render them as creatures so the stat block shows.
    if (combatant.summonedBy && combatant.type === 'player') {
      combatant = { ...combatant, type: 'npc' };
    }
    if (combatant.type === 'player') return combatant;
    // Look up the original monster by name to fill in missing fields
    // Prefer 2024 source over 2014 when both exist
    const monster = BESTIARY.find(m => m.name === combatant.name && m.source === '2024')
      || BESTIARY.find(m => m.name === combatant.name);
    if (!monster) return combatant;
    return {
      ...combatant,
      saves: combatant.saves || monster.saves,
      skills: combatant.skills || monster.skills,
      immunities: combatant.immunities || monster.immunities,
      resistances: combatant.resistances || monster.resistances,
      vulnerabilities: combatant.vulnerabilities || monster.vulnerabilities,
      conditionImmunities: combatant.conditionImmunities || monster.conditionImmunities,
      senses: combatant.senses || monster.senses,
      languages: combatant.languages || monster.languages,
      legendaryActions: combatant.legendaryActions || monster.legendaryActions,
      reactions: combatant.reactions || monster.reactions,
      specialAbilities: combatant.specialAbilities || monster.specialAbilities,
      creatureType: combatant.creatureType || monster.type,
    } as Combatant;
  }, [detailCombatant]);

  // ── Visibility ──
  // Show panel if: combat is active, OR a token has been explicitly opened (double-click)
  const showPanel = combatActive || (!!selectedTokenId && tokens.some(t => t.id === selectedTokenId));

  // Show the Roll Initiative floating button when tokens are selected but combat hasn't started
  const selectedTokens = selectedTokenIds.map(id => tokens.find(t => t.id === id)).filter(Boolean);
  const showRollButton = !combatActive
    && selectedTokens.length >= 2
    && selectedTokens.some(t => t!.type === 'player');

  // Show Add to Initiative button when combat is active and selected token(s) aren't already in it
  const showAddButton = combatActive
    && selectedTokens.length >= 1
    && selectedTokens.some(t => !activeCombatants.some(c => c.id === `combat-${t!.id}`));

  if (!showPanel && !showRollButton && !showAddButton) return null;

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
  const makeRangeBadge = (range?: number) => {
    if (range == null) return undefined;
    if (range === 0) return 'Self';
    if (range === -1) return 'Touch';
    return `${range}ft`;
  };

  const makeAoeBadge = (aoeType?: string, aoeSize?: number) => {
    if (!aoeType) return undefined;
    const Icon = AOE_ICONS[aoeType];
    return (
      <span className="flex items-center gap-0.5">
        {aoeSize ? `${aoeSize}ft` : ''}
        {Icon && <Icon size={9} />}
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

      {showAddButton && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ bottom: rollButtonBottom }}
        >
          <button
            onClick={() => onStartCombat?.(selectedTokenIds)}
            className="btn-filled px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          >
            <Swords size={14} />
            Add to Initiative
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
              {onSetViewAsPlayer && (
                <button
                  onClick={() => setAutoPerspectiveOnTurn(v => !v)}
                  title={autoPerspectiveOnTurn
                    ? 'Auto-switching map to the active player’s perspective during their turn. Click to disable.'
                    : 'Auto-switch the map to each player’s perspective on their turn.'}
                  className={cn(
                    'ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold transition-opacity px-2 py-1 rounded',
                    autoPerspectiveOnTurn
                      ? 'opacity-100 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                      : 'opacity-40 hover:opacity-100 hover:bg-white/10 text-[var(--ink)]'
                  )}
                >
                  <Eye size={11} />
                  {autoPerspectiveOnTurn ? 'Auto-View On' : 'Auto-View'}
                </button>
              )}
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
                  {combatStarted && (
                    <button
                      onClick={prevTurn}
                      className="btn-ghost flex-1 py-1 rounded flex items-center justify-center text-xs"
                    >
                      <ChevronLeft size={11} />
                      Back
                    </button>
                  )}
                  <button
                    onClick={nextTurn}
                    className="btn-filled flex-[2] py-1 rounded flex items-center justify-center text-xs"
                  >
                    {combatStarted ? 'Next' : 'Start Combat'}
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
                    const isTargeted = targetedCombatantIds?.has(c.sourceCombatantId || c.id) ?? false;
                    const isDead = c.hp <= 0;

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
                            : isTargeted
                            ? "bg-[#1a1214] border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                            : isAoeAffected
                            ? "bg-[#1c1510] border-orange-500/50 shadow-[0_0_12px_rgba(255,120,30,0.15)]"
                            : "bg-[#181512] border-[#2e261d]"
                        )}
                      >
                        {/* Top row: initiative, avatar, name/stats, delete */}
                        <div className="flex items-center gap-2.5">
                          {/* Initiative input */}
                          <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                            <InitiativeInput
                              value={c.initiative}
                              onCommit={(val) => updateInitiative(c.id, val)}
                            />
                          </div>

                          {/* Avatar */}
                          {(() => {
                            const tokenColor = c.color || (isEnemy ? '#ef4444' : isPlayer ? '#3b82f6' : '#059669');
                            return c.avatar ? (
                              <div
                                className="relative w-9 h-9 rounded-full overflow-hidden border-2 shrink-0"
                                style={{ borderColor: tokenColor }}
                              >
                                <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                                {isDead && (
                                  <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
                                    <Skull size={16} className="text-white/70" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center border-2 shrink-0"
                                style={{ borderColor: tokenColor, backgroundColor: `${tokenColor}1a` }}
                              >
                                <Skull size={16} className="text-white/40" />
                              </div>
                            );
                          })()}

                          {/* Center: name + targeting badge + hp bar */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[13px] truncate font-serif text-white tracking-wide">{c.name}</span>
                              {isTargeted && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                                  Targeted
                                </span>
                              )}
                            </div>
                            {!isPlayer && c.maxHp > 0 && (
                              <div className="mt-1 h-1 w-full bg-black/50 rounded-full overflow-hidden shadow-inner">
                                <div
                                  className="h-full bg-[var(--accent)] transition-all shadow-[0_0_4px_rgba(205,127,50,0.4)]"
                                  style={{ width: `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%` }}
                                />
                              </div>
                            )}
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
        <div className="flex-1 flex flex-col min-w-0">
          {detailSource ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 px-3 border-b border-[var(--line)] bg-black/20 shrink-0 h-[52px]">
                {/* Color dot */}
                {detailToken?.color && (
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: detailToken.color }} />
                )}
                {/* Name */}
                <h4 className="font-bold text-base tracking-tight shrink-0">{detailSource.name}</h4>
                {/* Player: class summary */}
                {detailSource.type === 'player' && detailSource.classes && (
                  <span className="text-[11px] opacity-40 italic whitespace-nowrap shrink-0">{getClassSummary(detailSource.classes)}</span>
                )}
                {/* Monster/NPC: creature type, CR */}
                {detailSource.creatureType && (
                  <span className="text-[11px] opacity-40 italic whitespace-nowrap shrink-0">{detailSource.creatureType}</span>
                )}
                {detailSource.cr && (
                  <span className="text-[11px] opacity-40 whitespace-nowrap shrink-0">CR {detailSource.cr}</span>
                )}
                {/* HP bar + controls (monsters/NPCs only), inline after CR */}
                {detailSource.type !== 'player' && (
                  <>
                    <div className="w-48 h-2 bg-black/50 rounded-full overflow-hidden shadow-inner shrink-0">
                      <div
                        className="h-full bg-[var(--accent)] transition-all shadow-[0_0_6px_rgba(205,127,50,0.4)]"
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    <div className="text-xs font-bold text-white/50 tabular-nums shrink-0">
                      {detailSource.hp}/{detailSource.maxHp} HP
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
                  </>
                )}
                {/* Conditions */}
                {detailSourceId && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {(detailSource?.conditions || []).map(condition => (
                      <span
                        key={condition}
                        className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[11px] font-semibold capitalize"
                      >
                        {condition}
                        <button
                          onClick={(e) => { e.stopPropagation(); onRemoveCondition?.(detailSourceId, condition); }}
                          className="ml-0.5 text-purple-300 hover:text-white text-[14px] leading-none w-4 h-4 flex items-center justify-center hover:bg-purple-500/40 rounded-full transition-colors"
                          title={`Remove ${condition}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {detailSource.type !== 'player' && <div className="relative">
                      <button
                        ref={conditionBtnRef}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!conditionDropdownOpen && conditionBtnRef.current) {
                            const rect = conditionBtnRef.current.getBoundingClientRect();
                            setConditionDropdownPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
                          }
                          setConditionDropdownOpen(v => !v);
                        }}
                        className="flex items-center gap-1 px-2 h-5 rounded-full bg-white/10 text-white/40 hover:bg-purple-500/30 hover:text-purple-300 text-[11px] leading-none transition-colors"
                        title="Add condition"
                      >
                        <span className="text-[13px]">+</span> Add Condition
                      </button>
                      {conditionDropdownOpen && (
                        <div
                          className="fixed bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-xl z-50 py-1 w-[140px] overflow-y-auto"
                          style={{ bottom: conditionDropdownPos.bottom, left: conditionDropdownPos.left, maxHeight: '160px' }}
                        >
                          {['blinded','charmed','deafened','frightened','grappled','incapacitated','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious']
                            .filter(c => !(detailSource?.conditions || []).includes(c))
                            .map(c => (
                              <button
                                key={c}
                                onClick={(e) => { e.stopPropagation(); onAddCondition?.(detailSourceId, c); setConditionDropdownOpen(false); }}
                                className="w-full text-left px-3 py-1 text-[11px] font-semibold capitalize text-white/70 hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                              >
                                {c}
                              </button>
                            ))
                          }
                        </div>
                      )}
                    </div>}
                  </div>
                )}
                {/* Right-side controls: Refresh (players) + close button */}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {detailSource.type === 'player' && detailSourceId && onToggleViewAsPlayer && (() => {
                    const isViewingAsThis = dmViewAsPlayerId === detailSourceId;
                    return (
                      <button
                        onClick={() => onToggleViewAsPlayer(detailSourceId)}
                        title={isViewingAsThis ? 'Stop viewing as this player' : 'View map from this player’s perspective'}
                        className={cn(
                          'flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold transition-opacity px-2 py-1 rounded',
                          isViewingAsThis
                            ? 'opacity-100 bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                            : 'opacity-40 hover:opacity-100 hover:bg-white/10'
                        )}
                      >
                        <Eye size={12} />
                        {isViewingAsThis ? 'Viewing as Player' : 'View as Player'}
                      </button>
                    );
                  })()}
                  {detailSource.type === 'player' && detailSourceId && onRefreshPlayer && (
                    <button
                      onClick={() => onRefreshPlayer(detailSourceId)}
                      className="text-[11px] uppercase tracking-wider font-bold opacity-40 hover:opacity-100 transition-opacity px-2 py-1 rounded hover:bg-white/10"
                    >
                      Refresh D&D Beyond
                    </button>
                  )}
                  {!combatActive && (
                    <button
                      onClick={() => {
                        onSelectedTokenIdChange?.(null);
                        onSelectedTokenIdsChange?.([]);
                        setPanelHpInput('');
                      }}
                      className="p-1 hover:bg-white/10 rounded transition-colors opacity-50 hover:opacity-100"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Detail content: stats, actions, spells */}
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-8 min-h-0">
                {/* Column 0: Combat stats (AC, Speed, Level/CR) */}
                <div className="min-w-[120px] flex flex-col gap-2 shrink-0">
                  <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-0">Stats</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/20 rounded p-2 text-center">
                      <div className="text-[9px] uppercase opacity-50">AC</div>
                      <div className="text-sm font-bold">{detailSource.ac}</div>
                    </div>
                    {detailSource.type === 'player' ? (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-[9px] uppercase opacity-50">Level</div>
                        <div className="text-sm font-bold">{getCharacterLevel(detailSource.classes)}</div>
                      </div>
                    ) : detailSource.stats ? (
                      <div className="bg-black/20 rounded p-2 text-center">
                        <div className="text-[9px] uppercase opacity-50">Initiative</div>
                        <div className="text-sm font-bold">
                          {Math.floor((detailSource.stats.dex - 10) / 2) >= 0 ? '+' : ''}{Math.floor((detailSource.stats.dex - 10) / 2)}
                        </div>
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
                        <div className="text-[9px] uppercase opacity-50 mb-1.5 text-center">Speed</div>
                        <div className="flex flex-col gap-1 items-center">
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

                {/* Column 1: Attributes, Saving Throws, Skills, Traits */}
                <div className="min-w-[160px] max-w-[220px] flex flex-col min-h-0 shrink-0">
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                    {/* Attributes */}
                    <div>
                      <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2">Attributes</h5>
                      {detailSource.stats ? (
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(detailSource.stats).map(([stat, val]) => {
                            const mod = Math.floor((val - 10) / 2);
                            return (
                            <div key={stat} className="bg-black/20 rounded p-2 text-center cursor-pointer hover:bg-white/10 transition-colors" onClick={(e) => handleStatRoll(stat.toUpperCase(), mod, e)}>
                              <div className="text-[9px] uppercase opacity-50">{stat}</div>
                              <div className="text-sm font-bold">
                                {mod >= 0 ? '+' : ''}{mod}
                              </div>
                              <div className="text-[10px] opacity-30">{val}</div>
                            </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[13px] opacity-40 italic">No stats available</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {detailSource.species && <span className="px-2 py-1 bg-white/5 rounded text-[11px]">{detailSource.species}</span>}
                        {detailSource.darkvision && <span className="px-2 py-1 bg-white/5 rounded text-[11px]">{detailSource.darkvision}ft Darkvision</span>}
                      </div>
                    </div>

                    {/* Saving Throws */}
                    {detailSource.saves && (
                      <div>
                        <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2">Saving Throws</h5>
                        <div className="flex flex-wrap gap-2">
                          {detailSource.saves.split(/,\s*/).map((save, i) => {
                            const modMatch = save.match(/([+-]\d+)$/);
                            const mod = modMatch ? parseInt(modMatch[1], 10) : 0;
                            const label = save.split(/\s+/)[0];
                            return (
                              <span key={i} className="px-2 py-1 bg-black/20 rounded text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors" onClick={(e) => handleStatRoll(label + ' Save', mod, e)}>{save}</span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {detailSource.skills && (
                      <div>
                        <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2">Skills</h5>
                        <div className="flex flex-wrap gap-2">
                          {detailSource.skills.split(/,\s*/).map((skill, i) => (
                            <span key={i} className="px-2 py-1 bg-black/20 rounded text-xs">{skill}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Traits */}
                    {(detailSource.specialAbilities?.some(a => !a.name.toLowerCase().includes('spellcasting')) ||
                      detailSource.immunities || detailSource.resistances || detailSource.vulnerabilities ||
                      detailSource.conditionImmunities || detailSource.senses || detailSource.languages) && (
                      <div>
                        <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2">Traits</h5>
                        <div className="space-y-2">
                          {/* Senses */}
                          {detailSource.senses && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Senses.</span> {detailSource.senses}
                            </div>
                          )}
                          {/* Immunities */}
                          {detailSource.immunities && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Damage Immunities.</span> {detailSource.immunities}
                            </div>
                          )}
                          {/* Resistances */}
                          {detailSource.resistances && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Damage Resistances.</span> {detailSource.resistances}
                            </div>
                          )}
                          {/* Vulnerabilities */}
                          {detailSource.vulnerabilities && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Damage Vulnerabilities.</span> {detailSource.vulnerabilities}
                            </div>
                          )}
                          {/* Condition Immunities */}
                          {detailSource.conditionImmunities && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Condition Immunities.</span> {detailSource.conditionImmunities}
                            </div>
                          )}
                          {/* Special Abilities (non-spellcasting) */}
                          {detailSource.specialAbilities?.filter(a => !a.name.toLowerCase().includes('spellcasting')).map((ability, i) => (
                            <div key={i} className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold italic text-[var(--accent)]">{ability.name}.</span> {ability.desc}
                            </div>
                          ))}
                          {/* Languages */}
                          {detailSource.languages && (
                            <div className="text-[13px] bg-white/5 p-2 rounded border border-white/5">
                              <span className="font-bold text-[var(--accent)]">Languages.</span> {detailSource.languages}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Actions (monsters) or Abilities (players) */}
                <div className="min-w-[250px] flex-1 flex flex-col min-h-0">
                  <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2 shrink-0">
                    {detailSource.type === 'player' ? 'Abilities' : 'Actions'}
                  </h5>
                  <div className="space-y-3 pr-2 overflow-y-auto custom-scrollbar flex-1">
                    {detailSource.type === 'player' ? (() => {
                      const abilities = (actionsData as Array<{ id: string; name: string; source: string; class?: string; subclass?: string | null; species?: string; levelRequired: number; actionType: string; description: string; behavior: string }>).filter(entry => {
                        if (entry.source === 'species') {
                          if (!entry.species) return false;
                          return detailSource.species?.toLowerCase().includes(entry.species.toLowerCase()) ?? false;
                        }
                        return detailSource.classes?.some(c =>
                          c.name.toLowerCase() === (entry.class ?? '').toLowerCase() &&
                          (!entry.subclass || c.subclass?.toLowerCase().includes(entry.subclass.toLowerCase())) &&
                          c.level >= entry.levelRequired
                        ) ?? false;
                      });
                      if (abilities.length === 0) return <p className="text-xs opacity-40 italic">No abilities found</p>;
                      return abilities.map((ability) => (
                        <div key={ability.id} className="text-xs p-2 rounded border bg-white/5 border-white/5">
                          <div>
                            <span className="font-bold italic text-[var(--accent)]">{ability.name}.</span>
                            {' '}
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/40 mr-1">{ability.actionType}</span>
                            {ability.description}
                          </div>
                        </div>
                      ));
                    })() : detailSource.actions && detailSource.actions.length > 0 ? (
                      detailSource.actions.map((action, i) => {
                        const actionAoe = parseActionAoe(action.desc);
                        const AoeIcon = actionAoe ? AOE_ICONS_SMALL[actionAoe.aoeType] : null;
                        const damageType = parseDamageType(action.desc);
                        return (
                          <div key={i} className={`text-xs p-2 rounded border ${actionAoe ? 'bg-orange-500/5 border-orange-500/15' : 'bg-white/5 border-white/5'}`}>
                            {/* Description */}
                            <div>
                              <span className="font-bold italic text-[var(--accent)]">{action.name}.</span>{' '}{cleanActionDesc(action.desc)}
                            </div>
                            {/* AOE badge row */}
                            {actionAoe && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <DamageTypeBadge damageType={damageType} />
                                {actionAoe.saveAbility && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15">
                                    {actionAoe.saveAbility.toUpperCase()}{actionAoe.saveDc ? ` DC ${actionAoe.saveDc}` : ''}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20">
                                  {actionAoe.aoeSize}ft
                                  {AoeIcon && <AoeIcon size={9} />}
                                  {actionAoe.aoeType}
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/30">
                                  Self
                                </span>
                              </div>
                            )}
                            {/* Dice roll buttons */}
                            {parseAction(action.desc) && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <Dices size={12} className="text-orange-400/50" />
                                {(['NRML', 'ADV', 'DIS'] as const).map((label) => {
                                  const mode = label === 'NRML' ? 'normal' : label === 'ADV' ? 'advantage' : 'disadvantage';
                                  return (
                                    <button
                                      key={label}
                                      onClick={() => handleRollAction(action.name, action.desc, mode)}
                                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-orange-400/20 text-orange-400/60 hover:text-orange-400 hover:border-orange-400/50 hover:bg-orange-400/10 transition-all"
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Cast button — bottom of card */}
                            {actionAoe && detailSourceId && startCastingRef && (
                              <div className="mt-2">
                                <button
                                  onClick={() => {
                                    startCastingRef.current?.(
                                      {
                                        name: action.name,
                                        aoeType: actionAoe.aoeType,
                                        aoeSize: actionAoe.aoeSize,
                                        saveAbility: actionAoe.saveAbility,
                                        saveDc: actionAoe.saveDc,
                                        halfDamageOnSave: actionAoe.halfDamageOnSave,
                                        desc: action.desc,
                                        range: 0,
                                      },
                                      detailSourceId
                                    );
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-1"
                                >
                                  {AoeIcon && <AoeIcon size={10} />}
                                  Cast on Map
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs opacity-40 italic">No actions listed</p>
                    )}
                  </div>
                </div>


                {/* Column 2b: Legendary Actions */}
                {detailSource.legendaryActions && detailSource.legendaryActions.length > 0 && (
                  <div className="min-w-[250px] flex-1 flex flex-col min-h-0">
                    <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2 shrink-0">Legendary Actions</h5>
                    <div className="space-y-3 pr-2 overflow-y-auto custom-scrollbar flex-1">
                      {detailSource.legendaryActions.map((action, i) => {
                        const actionAoe = parseActionAoe(action.desc);
                        const AoeIcon = actionAoe ? AOE_ICONS_SMALL[actionAoe.aoeType] : null;
                        const damageType = parseDamageType(action.desc);
                        return (
                          <div key={i} className={`text-xs p-2 rounded border ${actionAoe ? 'bg-orange-500/5 border-orange-500/15' : 'bg-white/5 border-white/5'}`}>
                            {/* Description */}
                            <div>
                              <span className="font-bold italic text-[var(--accent)]">{action.name}.</span>{' '}{cleanActionDesc(action.desc)}
                            </div>
                            {/* AOE badge row */}
                            {actionAoe && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <DamageTypeBadge damageType={damageType} />
                                {actionAoe.saveAbility && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15">
                                    {actionAoe.saveAbility.toUpperCase()}{actionAoe.saveDc ? ` DC ${actionAoe.saveDc}` : ''}
                                  </span>
                                )}
                                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20">
                                  {actionAoe.aoeSize}ft
                                  {AoeIcon && <AoeIcon size={9} />}
                                  {actionAoe.aoeType}
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-white/30">
                                  Self
                                </span>
                              </div>
                            )}
                            {/* Dice roll buttons */}
                            {parseAction(action.desc) && (
                              <div className="mt-1.5 flex items-center gap-1">
                                <Dices size={12} className="text-orange-400/50" />
                                {(['NRML', 'ADV', 'DIS'] as const).map((label) => {
                                  const mode = label === 'NRML' ? 'normal' : label === 'ADV' ? 'advantage' : 'disadvantage';
                                  return (
                                    <button
                                      key={label}
                                      onClick={() => handleRollAction(action.name, action.desc, mode)}
                                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-orange-400/20 text-orange-400/60 hover:text-orange-400 hover:border-orange-400/50 hover:bg-orange-400/10 transition-all"
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {/* Cast button — bottom of card */}
                            {actionAoe && detailSourceId && startCastingRef && (
                              <div className="mt-2">
                                <button
                                  onClick={() => startCastingRef.current?.(
                                    {
                                      name: action.name,
                                      aoeType: actionAoe.aoeType,
                                      aoeSize: actionAoe.aoeSize,
                                      saveAbility: actionAoe.saveAbility,
                                      saveDc: actionAoe.saveDc,
                                      halfDamageOnSave: actionAoe.halfDamageOnSave,
                                      desc: action.desc,
                                      range: 0,
                                    },
                                    detailSourceId
                                  )}
                                  className="w-full px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-1"
                                >
                                  {AoeIcon && <AoeIcon size={10} />}
                                  Cast on Map
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Column 3: Spells */}
                <div className="min-w-[250px] flex-[2] flex flex-col min-h-0">
                  <h5 className="text-[11px] font-bold uppercase tracking-widest opacity-30 mb-2 shrink-0">Spells</h5>
                  <div className="space-y-1.5 pr-2 overflow-y-auto custom-scrollbar flex-1">
                    {(() => {
                      const startCasting = (spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }) => {
                        if (!spell.aoeType || !spell.aoeSize || !detailSourceId) return;
                        startCastingRef?.current?.(spell, detailSourceId);
                      };

                      const startPlacing = (spell: { name: string; school?: string; effectRadius?: number; range?: number }) => {
                        if (!detailSourceId) return;
                        startPlacingRef?.current?.(spell, detailSourceId);
                      };

                      const getSpellMi = (spell: { aoeType?: string; aoeSize?: number; mapInteraction?: string }) => {
                        if (spell.mapInteraction) return spell.mapInteraction;
                        if (spell.aoeType && spell.aoeSize) return 'cast';
                        return 'none';
                      };
                      const isPlaceable = (spell: { aoeType?: string; aoeSize?: number; range?: number; mapInteraction?: string }) =>
                        getSpellMi(spell) === 'place';

                      // Compute spell attack bonus from spellSaveDc (DC = 8 + prof + mod, attack = prof + mod)
                      const spellAtkBonus = detailSource.spellSaveDc ? detailSource.spellSaveDc - 8 : 0;

                      const makeSpellRoll = (spellDesc: string, spellName: string) => {
                        if (!spellDesc) return undefined;
                        const groups = parseSpellDamage(spellDesc);
                        if (!groups) return undefined;
                        return (mode: import('../utils/actionParser').RollMode) => {
                          const result = rollAction({ attackBonus: spellAtkBonus, damageGroups: groups }, mode);
                          setActionRollName(spellName);
                          setActionRollResult(result);
                          setActionRollOpen(true);
                        };
                      };

                      // Structured spells
                      if (detailSource.spells && detailSource.spells.length > 0) {
                        return detailSource.spells.map((spell, i) => {
                          const hasAoe = !!(spell.aoeType && spell.aoeSize);
                          const spellWithDc = { ...spell, saveDc: detailSource.spellSaveDc };
                          return (
                          <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                            badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                            rangeBadge={makeRangeBadge(spell.range)}
                            aoeBadge={makeAoeBadge(spell.aoeType, spell.aoeSize)}
                            saveBadge={spell.saveAbility ? `${spell.saveAbility.toUpperCase()} SAVE${detailSource.spellSaveDc ? ` ${detailSource.spellSaveDc}` : ''}` : undefined}
                            onCast={
                              (getSpellMi(spell) === 'cast' || getSpellMi(spell) === 'cast-and-place')
                                ? () => startCasting(spellWithDc)
                                : (getSpellMi(spell) === 'exception' && detailSourceId && onExceptionSpellCast)
                                ? () => onExceptionSpellCast(spell.name, detailSourceId)
                                : undefined
                            }
                            onPlace={isPlaceable(spell) ? () => startPlacing(spell) : undefined}
                            onRoll={!hasAoe ? makeSpellRoll(spell.desc, spell.name) : undefined} />
                          );
                        });
                      }

                      // Monster spellcasting — parse from specialAbilities
                      const spellcastingTrait = detailSource.specialAbilities?.find(a =>
                        a.name.toLowerCase().includes('spellcasting')
                      );
                      if (spellcastingTrait) {
                        const parsed = parseSpellcastingTrait(spellcastingTrait.desc);
                        // Extract spell attack bonus from preamble if available (e.g. "+7 to hit with spell attacks")
                        const preambleAtkMatch = spellcastingTrait.desc.match(/\+(\d+)\s+to hit with spell attacks/i);
                        const preambleAtkBonus = preambleAtkMatch ? parseInt(preambleAtkMatch[1], 10) : spellAtkBonus;
                        if (parsed.spells.length > 0) {
                          return (
                            <>
                              <p className="text-[11px] opacity-40 italic leading-relaxed mb-2">{parsed.preamble}</p>
                              {parsed.spells.map((spell, i) => {
                                const spellWithDc = { ...spell, saveDc: parsed.saveDc };
                                const hasAoe = !!(spell.aoeType && spell.aoeSize);
                                const rollHandler = !hasAoe && spell.desc ? (() => {
                                  const groups = parseSpellDamage(spell.desc);
                                  if (!groups) return undefined;
                                  return (mode: import('../utils/actionParser').RollMode) => {
                                    const result = rollAction({ attackBonus: preambleAtkBonus, damageGroups: groups }, mode);
                                    setActionRollName(spell.name);
                                    setActionRollResult(result);
                                    setActionRollOpen(true);
                                  };
                                })() : undefined;
                                return (
                                <SpellAccordion key={i} name={spell.name} desc={spell.desc}
                                  badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                                  rangeBadge={makeRangeBadge(spell.range)}
                                  aoeBadge={makeAoeBadge(spell.aoeType, spell.aoeSize)}
                                  saveBadge={spell.saveAbility ? `${spell.saveAbility.toUpperCase()} SAVE${parsed.saveDc ? ` ${parsed.saveDc}` : ''}` : undefined}
                                  onCast={(getSpellMi(spell) === 'cast' || getSpellMi(spell) === 'cast-and-place') ? () => startCasting(spellWithDc) : undefined}
                                  onPlace={isPlaceable(spell) ? () => startPlacing(spell) : undefined}
                                  onRoll={rollHandler} />
                                );
                              })}
                            </>
                          );
                        }
                      }
                      return <p className="text-[13px] opacity-40 italic">No spells listed</p>;
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
    {rollPopover && (
      <>
        <div className="fixed inset-0 z-[60]" onClick={() => setRollPopover(null)} />
        <div
          className="fixed z-[61] bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-xl px-3 py-2 text-center pointer-events-none"
          style={{ left: rollPopover.x - 48, top: rollPopover.y - 80 }}
        >
          <div className="text-[9px] uppercase tracking-widest opacity-40 mb-0.5">{rollPopover.label}</div>
          <div className="text-xl font-bold text-[var(--accent)]">{rollPopover.total}</div>
          <div className="text-[10px] opacity-40 tabular-nums">d20({rollPopover.roll}) {rollPopover.modifier >= 0 ? '+' : ''}{rollPopover.modifier}</div>
        </div>
      </>
    )}
    <ActionRollModal
      isOpen={actionRollOpen}
      actionName={actionRollName}
      result={actionRollResult}
      onClose={() => setActionRollOpen(false)}
    />
    </>
  );
};
