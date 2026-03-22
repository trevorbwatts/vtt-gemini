import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { SpellAccordion } from './SpellAccordion';
import { Campaign, Token, Combatant, cn } from '../types';
import { searchSpells } from '../data/spellDatabase';
import { User, Search, X, LogOut } from '../icons';
import { motion, AnimatePresence } from 'motion/react';

// ─── Sign-in spot types ───
type SpotId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left';
const SPOT_IDS: SpotId[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left'];

const AOE_LABELS: Record<string, string> = {
  sphere: 'Sphere', cone: 'Cone', line: 'Line', cube: 'Cube', cylinder: 'Cylinder',
};

// ─── Sign-in Button ───
const SignInSpot: React.FC<{
  player: Combatant | null;
  availablePlayers: Combatant[];
  showPicker: boolean;
  onTogglePicker: () => void;
  onSignIn: (playerId: string) => void;
  onSignOut: () => void;
  rotation: number;
  className: string;
}> = ({ player, availablePlayers, showPicker, onTogglePicker, onSignIn, onSignOut, rotation, className }) => {
  return (
    <div className={cn('absolute z-20', className)}>
      <div style={{ transform: `rotate(${rotation}deg)` }}>
        {player ? (
          <button
            onClick={onSignOut}
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-3 hover:bg-white/10 transition-all group backdrop-blur-sm"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
              style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32'), outline: `2px solid ${player.color || '#cd7f32'}`, outlineOffset: '2px' }}
            >
              {player.avatar
                ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                : player.name[0]?.toUpperCase()
              }
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-sm tracking-wide">{player.name}</div>
              <div className="text-white/20 text-[10px] uppercase tracking-wider group-hover:text-red-400/60 transition-colors flex items-center gap-1">
                <LogOut size={10} /> Sign Out
              </div>
            </div>
          </button>
        ) : (
          <div className="relative">
            <button
              onClick={onTogglePicker}
              className="flex items-center gap-3 bg-white/5 border border-dashed border-white/15 rounded-xl px-8 py-4 hover:bg-white/10 hover:border-white/25 transition-all backdrop-blur-sm"
            >
              <User size={20} className="text-white/25" />
              <span className="text-white/30 font-bold text-lg tracking-widest">Sign In</span>
            </button>
            <AnimatePresence>
              {showPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1a1715] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px] z-50"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  onTouchEnd={(e: React.TouchEvent) => e.stopPropagation()}
                >
                  <div className="px-3 py-2 border-b border-white/5 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                    Choose your character
                  </div>
                  {availablePlayers.length === 0 ? (
                    <div className="px-4 py-4 text-white/20 text-xs text-center">All players signed in</div>
                  ) : (
                    availablePlayers.map(p => (
                      <button
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); onSignIn(p.id); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden"
                          style={{ background: p.avatar ? 'transparent' : (p.color || '#cd7f32') }}
                        >
                          {p.avatar ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : p.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-white/80 text-sm font-medium">{p.name}</div>
                          {p.classes && p.classes.length > 0 && (
                            <div className="text-white/30 text-[10px]">{p.classes.map(c => `${c.name} ${c.level}`).join(' / ')}</div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Player Drawer (Play Mode) ───
const PlayerDrawer: React.FC<{
  player: Combatant;
  isOpen: boolean;
  onToggle: () => void;
  spellSearch: string;
  onSpellSearchChange: (val: string) => void;
  onCast: (spell: any) => void;
  edge: 'top' | 'bottom' | 'left';
  className: string;
}> = ({ player, isOpen, onToggle, spellSearch, onSpellSearchChange, onCast, edge, className }) => {
  const spells = player.spells || [];
  const searchResults = spellSearch.trim().length >= 2 ? searchSpells(spellSearch) : [];

  const drawerContent = (
    <div className="bg-black/95 border border-white/10 rounded-lg p-3 w-[280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 overflow-hidden"
            style={{ background: player.avatar ? 'transparent' : (player.color || '#cd7f32') }}
          >
            {player.avatar ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" /> : player.name[0]?.toUpperCase()}
          </div>
          <span className="text-white font-bold text-xs tracking-wide">{player.name}</span>
        </div>
        <button onClick={onToggle} className="p-1 hover:bg-white/10 rounded transition-colors">
          <X size={14} className="text-white/40" />
        </button>
      </div>

      {/* My Spells */}
      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2 font-bold">My Spells</div>
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
        {spells.length === 0 ? (
          <div className="text-white/15 text-xs text-center py-3 border border-dashed border-white/10 rounded-lg">No spells</div>
        ) : (
          spells.map((spell, i) => {
            const aoeBadge = spell.aoeType
              ? `${spell.aoeSize ? `${spell.aoeSize}ft ` : ''}${AOE_LABELS[spell.aoeType] || ''}`
              : undefined;
            const saveBadge = spell.saveAbility
              ? `${spell.saveAbility.toUpperCase()} SAVE`
              : undefined;
            return (
              <SpellAccordion
                key={i}
                name={spell.name}
                desc={spell.desc}
                badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                aoeBadge={aoeBadge}
                saveBadge={saveBadge}
                onCast={spell.aoeType && spell.aoeSize ? () => onCast(spell) : undefined}
              />
            );
          })
        )}
      </div>

      {/* Spell Lookup */}
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2 font-bold">Spell Lookup</div>
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            type="text"
            value={spellSearch}
            onChange={(e) => onSpellSearchChange(e.target.value)}
            placeholder="Search all spells..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-white outline-none focus:border-purple-500/30 transition-colors"
          />
          {spellSearch && (
            <button onClick={() => onSpellSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={12} className="text-white/30" />
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
            {searchResults.map((spell, i) => {
              const aoeBadge = spell.aoeType
                ? `${spell.aoeSize ? `${spell.aoeSize}ft ` : ''}${AOE_LABELS[spell.aoeType] || ''}`
                : undefined;
              const saveBadge = spell.saveAbility
                ? `${spell.saveAbility.toUpperCase()} SAVE`
                : undefined;
              return (
                <SpellAccordion
                  key={`search-${i}`}
                  name={spell.name}
                  desc={spell.desc}
                  badge={spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`}
                  aoeBadge={aoeBadge}
                  saveBadge={saveBadge}
                  onCast={spell.aoeType && spell.aoeSize ? () => onCast(spell) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // Tab content
  const tabLabel = (
    <span className="text-white/50 text-xs font-bold tracking-wider truncate max-w-[140px]">{player.name}</span>
  );

  // ── Bottom edge ──
  if (edge === 'bottom') {
    return (
      <div className={cn('absolute bottom-0 z-30', className)}>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pb-1">{drawerContent}</div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={onToggle}
          className={cn(
            'w-[180px] h-[34px] rounded-t-lg flex items-center justify-center gap-2 transition-colors border border-b-0',
            isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10 hover:bg-white/10'
          )}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: player.color || '#cd7f32' }} />
          {tabLabel}
        </button>
      </div>
    );
  }

  // ── Top edge ──
  if (edge === 'top') {
    return (
      <div className={cn('absolute top-0 z-30', className)}>
        <button
          onClick={onToggle}
          className={cn(
            'w-[180px] h-[34px] rounded-b-lg flex items-center justify-center gap-2 transition-colors border border-t-0',
            isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10 hover:bg-white/10'
          )}
          style={{ transform: 'rotate(180deg)' }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: player.color || '#cd7f32' }} />
          {tabLabel}
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-1" style={{ transform: 'rotate(180deg)' }}>{drawerContent}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Left edge ──
  return (
    <div className={cn('absolute left-0 z-30 flex items-center', className)}>
      <button
        onClick={onToggle}
        className={cn(
          'w-[34px] h-[180px] rounded-r-lg flex items-center justify-center transition-colors border border-l-0 shrink-0',
          isOpen ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/10 hover:bg-white/10'
        )}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: player.color || '#cd7f32' }} />
          <span
            className="text-white/50 text-xs font-bold tracking-wider whitespace-nowrap"
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
          >
            {player.name}
          </span>
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-1">{drawerContent}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Initiative Strip ───
const InitiativeStrip: React.FC<{ combatants: Combatant[] }> = ({ combatants }) => {
  const sorted = useMemo(() =>
    [...combatants].sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return a.name.localeCompare(b.name);
    }),
    [combatants]
  );

  const typeColor = (type: string) => {
    if (type === 'player') return { bg: 'rgba(34,197,94,0.08)', text: '#22c55e', border: 'rgba(34,197,94,0.2)' };
    if (type === 'enemy') return { bg: 'rgba(239,68,68,0.08)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' };
    return { bg: 'rgba(96,165,250,0.08)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' };
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-12 bg-black/80 border-l border-white/10 flex flex-col z-20 backdrop-blur-sm">
      {sorted.map((c) => {
        const colors = typeColor(c.type);
        return (
          <div
            key={c.id}
            className="flex-1 flex items-center justify-center border-b border-white/5 last:border-0 min-h-[40px]"
            style={{ backgroundColor: colors.bg, borderLeft: `2px solid ${colors.border}` }}
          >
            <span
              className="text-[11px] font-bold tracking-wider whitespace-nowrap"
              style={{ writingMode: 'vertical-lr', transform: 'rotate(0deg)', color: colors.text }}
            >
              {c.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main PlayerScreen ───
export function PlayerScreen() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [mode, setMode] = useState<'setup' | 'play'>('play');

  // Refs to avoid stale closures in IPC callbacks
  const currentScenarioIdRef = useRef(currentScenarioId);
  currentScenarioIdRef.current = currentScenarioId;

  // Track whether the player is actively dragging a token
  const isDraggingRef = useRef(false);

  // Sign-in state
  const [signedInSpots, setSignedInSpots] = useState<Record<SpotId, string | null>>({
    'top-left': null, 'top-right': null,
    'bottom-left': null, 'bottom-right': null,
    'left': null,
  });
  const [activePickerSpot, setActivePickerSpot] = useState<SpotId | null>(null);

  // Drawer state (play mode)
  const [openDrawers, setOpenDrawers] = useState<Set<SpotId>>(new Set());
  const [spellSearches, setSpellSearches] = useState<Record<SpotId, string>>({
    'top-left': '', 'top-right': '',
    'bottom-left': '', 'bottom-right': '',
    'left': '',
  });

  // Ref for spell casting from drawers
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number }, combatantId: string) => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);

  // Track active player casting (for banner positioning)
  const [activeCasting, setActiveCasting] = useState<{ spotId: SpotId; spellName: string } | null>(null);

  // ── IPC ──
  useEffect(() => {
    const handleStateUpdate = (newState: { campaign: Campaign; scenarioId: string; playerMode?: string }) => {
      if (isDraggingRef.current) return;
      setCampaign(newState.campaign);
      setCurrentScenarioId(newState.scenarioId);
      if (newState.playerMode) {
        setMode(newState.playerMode as 'setup' | 'play');
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onStateUpdate(handleStateUpdate);
    }

    if (window.electronAPI?.onPlayerModeUpdate) {
      window.electronAPI.onPlayerModeUpdate((newMode: string) => {
        setMode(newMode as 'setup' | 'play');
      });
    }

    if (window.electronAPI?.onDMTokenUpdate) {
      window.electronAPI.onDMTokenUpdate((newTokens: Token[]) => {
        if (isDraggingRef.current) return;
        setCampaign(prev => {
          const scenarioId = currentScenarioIdRef.current;
          if (!prev || !scenarioId) return prev;
          return {
            ...prev,
            scenarios: prev.scenarios.map(s =>
              s.id === scenarioId ? { ...s, tokens: newTokens } : s
            ),
          };
        });
      });
    }

    // Request state AFTER all listeners are registered so we don't miss the response
    if (window.electronAPI?.requestStateUpdate) {
      window.electronAPI.requestStateUpdate();
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeStateUpdateListener();
        window.electronAPI.removeDMTokenUpdateListener?.();
      }
      if (window.electronAPI?.removePlayerModeListener) {
        window.electronAPI.removePlayerModeListener();
      }
    };
  }, []);

  // ── Callbacks ──
  const handleTokensChange = useCallback((newTokens: Token[]) => {
    if (window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(newTokens);
    }
    setCampaign(prev => {
      const scenarioId = currentScenarioIdRef.current;
      if (!prev || !scenarioId) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s =>
          s.id === scenarioId ? { ...s, tokens: newTokens } : s
        ),
      };
    });
  }, []);

  const handleDragStatusChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  // ── Derived state ──
  const availablePlayers = useMemo(() => {
    if (!campaign) return [];
    const signedInIds = new Set(Object.values(signedInSpots).filter(Boolean) as string[]);
    return campaign.players.filter(p => !signedInIds.has(p.id));
  }, [campaign?.players, signedInSpots]);

  const viewportCenter = useMemo(() => {
    if (!campaign || !currentScenarioId) return null;
    const scenario = campaign.scenarios.find(s => s.id === currentScenarioId);
    const firstPlayerToken = scenario?.tokens?.find(t => t.type === 'player');
    return firstPlayerToken ? { x: firstPlayerToken.x, y: firstPlayerToken.y } : null;
  }, [campaign?.id, currentScenarioId]);

  const currentScenario = campaign?.scenarios.find(s => s.id === currentScenarioId) ?? null;
  const activeCombatants = currentScenario?.activeCombatants || [];
  const hasInitiative = activeCombatants.length > 0;

  // ── Sign-in handlers ──
  const handleSignIn = useCallback((spotId: SpotId, playerId: string) => {
    setSignedInSpots(prev => ({ ...prev, [spotId]: playerId }));
    setActivePickerSpot(null);
  }, []);

  const handleSignOut = useCallback((spotId: SpotId) => {
    setSignedInSpots(prev => ({ ...prev, [spotId]: null }));
    setOpenDrawers(prev => { const next = new Set(prev); next.delete(spotId); return next; });
  }, []);

  const toggleDrawer = useCallback((spotId: SpotId) => {
    setOpenDrawers(prev => {
      const next = new Set(prev);
      if (next.has(spotId)) next.delete(spotId);
      else next.add(spotId);
      return next;
    });
  }, []);

  const handleCastSpell = useCallback((spotId: SpotId, spell: any, combatantId: string) => {
    setOpenDrawers(prev => { const next = new Set(prev); next.delete(spotId); return next; });
    startCastingRef.current?.(spell, combatantId);
    setActiveCasting({ spotId, spellName: spell.name });
  }, []);

  // ── Helper: get player combatant for a spot ──
  const getPlayerForSpot = (spotId: SpotId): Combatant | null => {
    const playerId = signedInSpots[spotId];
    if (!playerId || !campaign) return null;
    return campaign.players.find(p => p.id === playerId) || null;
  };

  // Close picker when clicking/tapping outside
  useEffect(() => {
    if (!activePickerSpot) return;
    const openedAt = Date.now();
    const handleClick = () => {
      // Ignore clicks that fire within 300ms of opening (touch event double-fire)
      if (Date.now() - openedAt < 300) return;
      setActivePickerSpot(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('touchend', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('touchend', handleClick);
    };
  }, [activePickerSpot]);

  // ── No campaign yet ──
  if (!campaign) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Awaiting DM Connection...
      </div>
    );
  }

  // ── Spot position configs ──
  const spotConfigs: Record<SpotId, { rotation: number; edge: 'top' | 'bottom' | 'left'; setupClass: string; drawerClass: string }> = {
    'top-left':     { rotation: 180, edge: 'top',    setupClass: 'top-6 left-[25%] -translate-x-1/2',     drawerClass: 'left-[20%] -translate-x-1/2' },
    'top-right':    { rotation: 180, edge: 'top',    setupClass: 'top-6 left-[62%] -translate-x-1/2',     drawerClass: 'left-[55%] -translate-x-1/2' },
    'bottom-left':  { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 left-[25%] -translate-x-1/2',  drawerClass: 'left-[20%] -translate-x-1/2' },
    'bottom-right': { rotation: 0,   edge: 'bottom', setupClass: 'bottom-6 left-[62%] -translate-x-1/2',  drawerClass: 'left-[55%] -translate-x-1/2' },
    'left':         { rotation: 90,  edge: 'left',   setupClass: 'left-6 top-1/2 -translate-y-1/2',       drawerClass: 'top-1/2 -translate-y-1/2' },
  };

  // ── SETUP MODE ──
  if (mode === 'setup') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_50%_50%,_rgba(205,127,50,0.3),_transparent_70%)]" />

        {/* Center title */}
        <div className="text-center z-0 select-none">
          <div className="text-white/10 font-serif text-5xl font-bold tracking-[0.3em] mb-3">PLAYER SCREEN</div>
          <div className="text-white/5 font-sans text-sm tracking-[0.2em] uppercase">Sign in at your seat</div>
        </div>

        {/* Sign-in spots */}
        {SPOT_IDS.map(spotId => {
          const config = spotConfigs[spotId];
          return (
            <SignInSpot
              key={spotId}
              player={getPlayerForSpot(spotId)}
              availablePlayers={availablePlayers}
              showPicker={activePickerSpot === spotId}
              onTogglePicker={() => setActivePickerSpot(prev => prev === spotId ? null : spotId)}
              onSignIn={(playerId) => handleSignIn(spotId, playerId)}
              onSignOut={() => handleSignOut(spotId)}
              rotation={config.rotation}
              className={config.setupClass}
            />
          );
        })}
      </div>
    );
  }

  // ── No scenario loaded ──
  if (!currentScenarioId || !currentScenario) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Loading Scenario...
      </div>
    );
  }

  // ── PLAY MODE ──
  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      {/* Map View - leaves room for initiative strip on right if active */}
      <div className={cn('absolute inset-0', hasInitiative && 'right-12')}>
        <MapView
          tokens={currentScenario.tokens || []}
          onTokensChange={handleTokensChange}
          scenarioName={currentScenario.name}
          mapImage={currentScenario.mapImage}
          onMapChange={() => {}}
          mapNotes={[]}
          onMapNotesChange={() => {}}
          players={campaign.players || []}
          npcs={campaign.npcs || []}
          persistentEnemies={campaign.persistentEnemies || []}
          scenarioCombatants={currentScenario.combatants || []}
          activeCombatants={currentScenario.activeCombatants || []}
          onUpdateCombatantHp={() => {}}
          onAddEnemy={() => {}}
          onStartCombat={() => {}}
          leftSidebarOpen={false}
          setLeftSidebarOpen={() => {}}
          rightSidebarOpen={false}
          setRightSidebarOpen={() => {}}
          isPlayerView={true}
          walls={currentScenario.walls}
          objectWalls={currentScenario.objectWalls}
          portals={currentScenario.portals}
          gridResolution={currentScenario.gridResolution}
          onDragStatusChange={handleDragStatusChange}
          viewportCenter={viewportCenter}
          darknessLevel={currentScenario.darknessLevel}
          startCastingRef={startCastingRef}
          cancelCastingRef={cancelCastingRef}
          onCastingDismissed={() => setActiveCasting(null)}
        />
      </div>

      {/* Casting Banner — positioned near the casting player's drawer */}
      {activeCasting && (() => {
        const config = spotConfigs[activeCasting.spotId];
        const edge = config.edge;
        // Position the banner inset from the edge, near the drawer
        const posClass = edge === 'top'
          ? 'top-4 left-1/2 -translate-x-1/2 rotate-180'
          : edge === 'left'
          ? 'left-4 top-1/2 -translate-y-1/2 -rotate-90'
          : 'bottom-4 left-1/2 -translate-x-1/2';
        return (
          <div className={cn('absolute z-50 pointer-events-auto', posClass)}>
            <div className="bg-black/80 border border-orange-500/50 rounded-lg px-4 py-2 flex items-center gap-3 shadow-lg shadow-orange-500/10">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-sm font-bold text-orange-400">Casting {activeCasting.spellName}</span>
              <span className="text-xs text-white/40">Drag to place</span>
              <button
                onClick={() => { cancelCastingRef.current?.(); setActiveCasting(null); }}
                className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Player Drawers */}
      {SPOT_IDS.map(spotId => {
        const player = getPlayerForSpot(spotId);
        if (!player) return null;
        const config = spotConfigs[spotId];
        return (
          <PlayerDrawer
            key={spotId}
            player={player}
            isOpen={openDrawers.has(spotId)}
            onToggle={() => toggleDrawer(spotId)}
            spellSearch={spellSearches[spotId] || ''}
            onSpellSearchChange={(val) => setSpellSearches(prev => ({ ...prev, [spotId]: val }))}
            onCast={(spell) => handleCastSpell(spotId, spell, player.id)}
            edge={config.edge}
            className={config.drawerClass}
          />
        );
      })}

      {/* Initiative Strip */}
      {hasInitiative && <InitiativeStrip combatants={activeCombatants} />}
    </div>
  );
}
