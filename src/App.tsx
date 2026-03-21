import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DMNotes } from './components/DMNotes';
import { MapView } from './components/MapView';
import { CombatView } from './components/CombatView';
import { CampaignSettings } from './components/CampaignSettings';
import { SplashScreen } from './components/SplashScreen';
import { PlayerScreen } from './components/PlayerScreen';
import { PlayerCharacterSheet } from './components/PlayerCharacterSheet';
import { cn, Campaign, Scenario, Combatant, WallSegment, Portal, GridResolution, MapNote } from './types';
import { Layout, Map as MapIcon, Swords, Settings, ChevronRight, Folder, FileText, Zap, Plus, Menu, Users, User, Skull, LogOut, ArrowLeft, Edit2, X, MonitorUp, MonitorX } from './icons';
import { motion, AnimatePresence } from 'motion/react';

import { AddCombatantModal } from './components/AddCombatantModal';
import { parseDndBeyondCharacter } from './services/dndBeyondParser';

export function DMScreen() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [panToNote, setPanToNote] = useState<MapNote | null>(null);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [navSidebarOpen, setNavSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [addNPCModalOpen, setAddNPCModalOpen] = useState(false);
  const [playerScreenOpen, setPlayerScreenOpen] = useState(false);
  const [playerMode, setPlayerMode] = useState<'setup' | 'play'>('setup');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Campaign State
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const selectedScenarioIdRef = useRef(selectedScenarioId);
  selectedScenarioIdRef.current = selectedScenarioId;
  const skipStateBroadcastRef = useRef(false);
  const dmViewportCenterRef = useRef<{ x: number; y: number } | null>(null);

  // Persistence
  useEffect(() => {
    if (campaign) {
      const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
      const index = savedCampaigns.findIndex((c: Campaign) => c.id === campaign.id);
      if (index >= 0) {
        savedCampaigns[index] = campaign;
      } else {
        savedCampaigns.push(campaign);
      }
      localStorage.setItem('dungeon_master_campaigns', JSON.stringify(savedCampaigns));
    }
  }, [campaign]);

  // Reset viewport center when the scenario changes so the player gets a fresh default view
  useEffect(() => {
    dmViewportCenterRef.current = null;
  }, [selectedScenarioId]);

  // IPC Sync to Player Screen
  useEffect(() => {
    if (campaign && selectedScenarioId && window.electronAPI) {
      if (skipStateBroadcastRef.current) {
        skipStateBroadcastRef.current = false; // Reset but don't broadcast
        return;
      }
      window.electronAPI.sendStateUpdate({
        campaign,
        scenarioId: selectedScenarioId,
        playerMode,
        viewportCenter: dmViewportCenterRef.current,
      });
    }
  }, [campaign, selectedScenarioId, playerMode]);

  // Listen for player screen open/close events from Electron
  useEffect(() => {
    if (window.electronAPI?.onPlayerScreenStatus) {
      window.electronAPI.onPlayerScreenStatus((isOpen: boolean) => {
        setPlayerScreenOpen(isOpen);
        if (!isOpen) setPlayerMode('setup');
      });
    }
    return () => {
      if (window.electronAPI?.removePlayerScreenStatusListener) {
        window.electronAPI.removePlayerScreenStatusListener();
      }
    };
  }, []);

  // Send player mode changes to the player window
  useEffect(() => {
    if (window.electronAPI?.sendPlayerMode && playerScreenOpen) {
      window.electronAPI.sendPlayerMode(playerMode);
    }
  }, [playerMode, playerScreenOpen]);

  // Listen for token updates from the Player screen
  useEffect(() => {
    if (window.electronAPI?.onPlayerTokenUpdate) {
      window.electronAPI.onPlayerTokenUpdate((tokens: any) => {
        // Skip state broadcast for high-frequency localized token updates
        skipStateBroadcastRef.current = true;

        // We use the functional state update to always get the freshest campaign
        setCampaign(prev => {
          const scenarioId = selectedScenarioIdRef.current;
          if (!prev || !scenarioId) return prev;

          return {
            ...prev,
            scenarios: prev.scenarios.map(s => {
              if (s.id === scenarioId) {
                console.log('[DM] Applying tokens to scenario', scenarioId);
                return { ...s, tokens };
              }
              return s;
            }),
          };
        });
      });
    }
    return () => {
      if (window.electronAPI?.removePlayerTokenUpdateListener) {
        window.electronAPI.removePlayerTokenUpdateListener();
      }
    };
  }, []);

  const handleCreateCampaign = (name: string) => {
    const newCampaign: Campaign = {
      id: `c-${Date.now()}`,
      name,
      players: [],
      npcs: [],
      persistentEnemies: [],
      scenarios: [
        {
          id: `s-${Date.now()}`,
          name: 'Initial Scenario',
          notes: '<h2>Welcome to your new campaign</h2><p>Start by adding some notes or tokens to the map.</p>',
          mapNotes: [],
          tokens: [],
          combatants: [],
          activeCombatants: []
        }
      ]
    };
    setCampaign(newCampaign);
    setSelectedScenarioId(newCampaign.scenarios[0].id);
  };

  const handleSelectCampaign = (selected: Campaign) => {
    // Migrate old data if necessary
    const migrated = {
      ...selected,
      players: selected.players || [],
      npcs: selected.npcs || [],
      persistentEnemies: selected.persistentEnemies || [],
      scenarios: (selected.scenarios || []).map(s => ({
        ...s,
        tokens: s.tokens || [],
        combatants: s.combatants || [],
        activeCombatants: s.activeCombatants || [],
        mapNotes: s.mapNotes || []
      }))
    };
    setCampaign(migrated);
    setSelectedScenarioId(migrated.scenarios[0]?.id || null);
  };

  const currentScenario = useMemo(() => {
    if (!campaign || !selectedScenarioId) return null;
    return campaign.scenarios.find(s => s.id === selectedScenarioId) || campaign.scenarios[0];
  }, [campaign, selectedScenarioId]);

  if (!campaign) {
    return <SplashScreen onSelectCampaign={handleSelectCampaign} onCreateCampaign={handleCreateCampaign} />;
  }

  const updateScenarioName = (name: string) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? { ...s, name } : s)
    }) : prev);
  };

  const updateCampaignName = (name: string) => {
    if (!name.trim()) return;
    setCampaign(prev => prev ? ({ ...prev, name }) : prev);
  };

  const updateMapNotes = (mapNotes: any[]) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? { ...s, mapNotes } : s)
    }) : prev);
  };

  const updateScenarioTokens = (tokens: any[]) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? { ...s, tokens } : s)
    }) : prev);
  };

  const updateActiveCombatants = (activeCombatants: Combatant[]) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? { ...s, activeCombatants } : s)
    }) : prev);
  };

  const updateScenarioMap = (mapImage: string) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? { ...s, mapImage } : s)
    }) : prev);
  };

  const updateWallData = (
    walls: WallSegment[],
    objectWalls: WallSegment[],
    portals: Portal[],
    gridResolution: GridResolution
  ) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s =>
        s.id === selectedScenarioId
          ? { ...s, walls, objectWalls, portals, gridResolution }
          : s
      )
    }) : prev);
  };

  const updateDarknessLevel = (level: 'daylight' | 'dark') => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s =>
        s.id === selectedScenarioId ? { ...s, darknessLevel: level } : s
      )
    }) : prev);
  };

  const togglePortal = (portalId: string) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s =>
        s.id === selectedScenarioId
          ? {
            ...s,
            portals: s.portals?.map(p =>
              p.id === portalId ? { ...p, closed: !p.closed } : p
            )
          }
          : s
      )
    }) : prev);
  };

  const addEnemyToMap = (monster: any, x: number, y: number) => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newEnemyId = `e-${uniqueId}`;
    const newEnemy: Combatant = {
      id: newEnemyId,
      name: monster.name,
      hp: monster.hp,
      maxHp: monster.hp,
      ac: monster.ac,
      initiative: 0,
      type: 'enemy',
      description: monster.description,
      stats: monster.stats,
      actions: monster.actions,
      avatar: monster.avatar,
    };

    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioId ? {
        ...s,
        tokens: [...s.tokens, {
          id: `t-${uniqueId}`,
          combatantId: newEnemyId,
          name: newEnemy.name,
          type: 'enemy',
          x,
          y,
          color: '#ef4444',
          avatar: newEnemy.avatar
        }],
        combatants: [...(s.combatants || []), newEnemy]
      } : s),
      persistentEnemies: monster.isBoss ? [...prev.persistentEnemies, newEnemy] : prev.persistentEnemies
    }) : prev);
  };

  const startCombat = (tokenIds: string[]) => {
    if (!currentScenario) return;

    const selectedTokens = currentScenario.tokens.filter(t => tokenIds.includes(t.id));
    const currentActive = [...(currentScenario.activeCombatants || [])];
    const newCombatants: Combatant[] = [];

    selectedTokens.forEach(token => {
      // Use the token's ID as the unique key in the combat tracker to allow multiple instances of same monster
      const combatantTrackerId = `combat-${token.id}`;

      // Don't add if already in combat
      if (currentActive.some(c => c.id === combatantTrackerId)) return;

      let baseCombatant: Combatant | undefined;

      if (token.type === 'player') {
        baseCombatant = campaign.players.find(p => p.id === token.combatantId);
      } else if (token.type === 'npc') {
        baseCombatant = campaign.npcs.find(n => n.id === token.combatantId);
      } else {
        baseCombatant = campaign.persistentEnemies.find(e => e.id === token.combatantId);
        if (!baseCombatant && currentScenario.combatants) {
          baseCombatant = currentScenario.combatants.find(c => c.id === token.combatantId);
        }
      }

      if (baseCombatant) {
        const dexMod = baseCombatant.stats ? Math.floor((baseCombatant.stats.dex - 10) / 2) : 0;
        const roll = Math.floor(Math.random() * 20) + 1 + dexMod;

        newCombatants.push({
          ...baseCombatant,
          id: combatantTrackerId,
          initiative: roll
        });
      } else {
        // Fallback for tokens without a full combatant record
        const roll = Math.floor(Math.random() * 20) + 1;
        newCombatants.push({
          id: combatantTrackerId,
          name: token.name,
          type: token.type,
          hp: 10,
          maxHp: 10,
          ac: 10,
          initiative: roll
        });
      }
    });

    if (newCombatants.length > 0) {
      updateActiveCombatants([...currentActive, ...newCombatants]);
    }
    setRightSidebarOpen(true);
  };

  const addScenario = () => {
    const newId = `s-${Date.now()}`;
    const newScenario: Scenario = {
      id: newId,
      name: 'New Scenario',
      notes: '<h2>New Scenario</h2><p>Start by adding some notes or tokens to the map.</p>',
      mapNotes: [],
      tokens: [],
      combatants: [],
      activeCombatants: [],
      mapImage: undefined
    };
    setCampaign(prev => prev ? ({ ...prev, scenarios: [...prev.scenarios, newScenario] }) : prev);
    setSelectedScenarioId(newId);
  };

  return (
    <div className="h-screen flex flex-row font-sans overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Navigation Sidebar (Full Height, Squishing) */}
      <motion.aside
        initial={false}
        animate={{ width: navSidebarOpen ? 320 : 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "h-full bg-[var(--surface)] overflow-hidden shrink-0 z-30",
          navSidebarOpen && "border-r border-[var(--line)]"
        )}
      >
        <div className="w-[320px] h-full flex flex-col">
          <div className="h-14 px-6 border-b border-[var(--line)] flex items-center justify-between shrink-0">
            <button
              onClick={() => setCampaign(null)}
              className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.15em] opacity-60 hover:opacity-100 transition-opacity"
            >
              <ArrowLeft size={16} className="opacity-70" />
              <span>Switch Campaign</span>
            </button>
            <button
              onClick={() => setNavSidebarOpen(false)}
              className="p-2 hover:bg-black/5 rounded-lg transition-colors group"
            >
              <Menu size={22} className="text-[var(--accent)]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Campaign Section */}
            <div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] uppercase tracking-[0.15em] opacity-40 font-sans font-bold">Campaign</h3>
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="btn-text"
                  >
                    Settings
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[22px] font-bold font-serif tracking-tight truncate text-white">{campaign.name}</div>
                </div>
              </div>
            </div>

            <div className="h-px bg-[var(--line)]" />

            {/* Players Section */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] uppercase tracking-[0.15em] opacity-40 font-sans font-bold">Players</h3>
                <button
                  onClick={() => setAddPlayerModalOpen(true)}
                  className="btn-text"
                >
                  + Add Player
                </button>
              </div>
              <div className="space-y-2">
                {campaign.players.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlayerId(p.id)}
                    className="w-full flex items-center gap-5 px-1 py-1 rounded-lg transition-all group hover:bg-white/5 text-left"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 overflow-hidden"
                      style={{ background: p.avatar ? 'transparent' : (p.color || 'var(--accent)'), outline: `2px solid ${p.color || 'var(--accent)'}`, outlineOffset: '2px' }}
                    >
                      {p.avatar
                        ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                        : p.name[0]
                      }
                    </div>
                    <span className="text-[16px] font-medium opacity-90 group-hover:opacity-100 truncate tracking-wide text-white">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-[var(--line)]" />

            {/* NPCs Section */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] uppercase tracking-[0.15em] opacity-40 font-sans font-bold">NPCs</h3>
                <button
                  onClick={() => setAddNPCModalOpen(true)}
                  className="btn-text"
                >
                  + Add NPC
                </button>
              </div>
              <div className="space-y-2">
                {campaign.npcs.map((n) => (
                  <div key={n.id} className="flex items-center gap-5 px-1 py-1 rounded-lg transition-all group">
                    <div className="w-8 h-8 rounded-full bg-black/20 border border-[var(--line)]/30 flex items-center justify-center text-[13px] font-bold text-white shrink-0">
                      {n.name[0]}
                    </div>
                    <span className="text-[16px] font-medium opacity-90 group-hover:opacity-100 truncate tracking-wide text-white">{n.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-[var(--line)]" />

            {/* Scenarios Section */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[11px] uppercase tracking-[0.15em] opacity-40 font-sans font-bold">Scenarios</h3>
                <button
                  onClick={addScenario}
                  className="btn-text"
                >
                  + Add Scenario
                </button>
              </div>
              <div className="space-y-3">
                {campaign.scenarios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => setSelectedScenarioId(s.id)}
                      className={cn(
                        "flex-1 flex items-center gap-4 px-5 py-4 rounded-[12px] text-[15px] font-medium transition-all tracking-wide",
                        selectedScenarioId === s.id
                          ? "bg-[#181512] border border-[#2e261d] text-white shadow-sm"
                          : "hover:bg-[#181512] opacity-70 hover:opacity-100 border border-transparent text-white"
                      )}
                    >
                      <FileText size={18} className={cn(selectedScenarioId === s.id ? "text-[var(--accent)]" : "opacity-40")} />
                      <span className="flex-1 text-left truncate">{s.name}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedScenarioId(s.id);
                        // Logic to edit scenario name
                      }}
                      className="p-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-[var(--line)]" />
          </div>

          <div className="p-6 border-t border-[var(--line)] shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold text-[14px] shrink-0">
                DM
              </div>
              <div className="flex flex-col">
                <span className="text-[15px] font-bold text-white tracking-wide">Dungeon Master</span>
                <span className="text-[12px] opacity-40 font-sans tracking-[0.05em] mt-0.5">v1.0</span>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-[var(--line)] bg-[var(--surface)] px-4 flex items-center justify-between h-14 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <AnimatePresence>
              {!navSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { delay: 0.2, duration: 0.1 }
                  }}
                  exit={{
                    opacity: 0,
                    transition: { delay: 0, duration: 0.05 }
                  }}
                >
                  <button
                    onClick={() => setNavSidebarOpen(true)}
                    className="p-2 hover:bg-black/5 rounded-lg transition-colors group"
                  >
                    <Menu size={20} className="group-hover:text-[var(--accent)] transition-colors" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-3 text-lg font-serif font-bold tracking-tight">
              <span className="opacity-40">{campaign.name}</span>
              {currentScenario && (
                <>
                  <ChevronRight size={16} className="opacity-20 shrink-0" />
                  <span className="text-[var(--accent)]">{currentScenario.name}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {playerScreenOpen && (
              <div className="flex items-center bg-black/40 rounded-lg p-0.5 mr-2">
                <button
                  onClick={() => setPlayerMode('setup')}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-sans font-semibold tracking-wide transition-all",
                    playerMode === 'setup'
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  Setup
                </button>
                <button
                  onClick={() => setPlayerMode('play')}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-sans font-semibold tracking-wide transition-all",
                    playerMode === 'play'
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  Play
                </button>
              </div>
            )}
            <button
              onClick={() => {
                if (!window.electronAPI) {
                  alert("Player Screen is only available in the Electron Desktop App.");
                  return;
                }
                if (playerScreenOpen) {
                  window.electronAPI.closePlayerScreen();
                  setPlayerScreenOpen(false);
                  setPlayerMode('setup');
                } else {
                  window.electronAPI.launchPlayerScreen();
                  setPlayerScreenOpen(true);
                }
              }}
              className="btn-ghost"
            >
              {playerScreenOpen ? <MonitorX size={14} /> : <MonitorUp size={14} />}
              <span>{playerScreenOpen ? 'Close Player Screen' : 'Launch Player Screen'}</span>
            </button>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex-1 overflow-hidden relative">
          {/* Center: Map View (Always Present, full area) */}
          <main className="w-full h-full relative bg-[#111] overflow-hidden">
            {currentScenario && (
              <MapView
                tokens={currentScenario.tokens || []}
                onTokensChange={updateScenarioTokens}
                scenarioName={currentScenario.name}
                mapImage={currentScenario.mapImage}
                onMapChange={updateScenarioMap}
                mapNotes={currentScenario.mapNotes || []}
                onMapNotesChange={updateMapNotes}
                players={campaign.players || []}
                npcs={campaign.npcs || []}
                persistentEnemies={campaign.persistentEnemies || []}
                scenarioCombatants={currentScenario.combatants || []}
                onAddEnemy={addEnemyToMap}
                onStartCombat={startCombat}
                leftSidebarOpen={leftSidebarOpen}
                setLeftSidebarOpen={setLeftSidebarOpen}
                onNoteClick={(id) => setHighlightedNoteId(id)}
                onAddScenario={addScenario}
                panToNote={panToNote}
                rightSidebarOpen={rightSidebarOpen}
                setRightSidebarOpen={setRightSidebarOpen}
                walls={currentScenario.walls}
                objectWalls={currentScenario.objectWalls}
                portals={currentScenario.portals}
                gridResolution={currentScenario.gridResolution}
                onWallDataChange={updateWallData}
                onPortalToggle={togglePortal}
                onViewportCenter={(center) => { dmViewportCenterRef.current = center; }}
                darknessLevel={currentScenario.darknessLevel}
                onDarknessLevelChange={updateDarknessLevel}
              />
            )}
          </main>

          {/* Left Sidebar: Notes (overlay) */}
          <motion.aside
            initial={false}
            animate={{ x: leftSidebarOpen ? 0 : -320 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 w-[320px] bg-[var(--surface)] border-r border-[var(--line)] z-20 overflow-hidden"
          >
            <div className="w-full h-full relative">
              <div className="absolute inset-0 bg-[var(--parchment-texture)] opacity-10 pointer-events-none" />
              {currentScenario && (
                <DMNotes
                  notes={currentScenario.mapNotes}
                  onChange={updateMapNotes}
                  title={currentScenario.name}
                  onTitleChange={updateScenarioName}
                  onClose={() => setLeftSidebarOpen(false)}
                  highlightedNoteId={highlightedNoteId}
                  onNoteNavigate={(note) => {
                    setHighlightedNoteId(note.id);
                    setPanToNote({ ...note });
                  }}
                />
              )}
            </div>
          </motion.aside>

          {/* Right Sidebar: Combat View (overlay) */}
          <motion.aside
            initial={false}
            animate={{ x: rightSidebarOpen ? 0 : 350 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-y-0 right-0 w-[350px] bg-[var(--surface)] border-l border-[var(--line)] z-20 overflow-hidden"
          >
            <div className="w-full h-full relative">
              <div className="absolute inset-0 bg-[var(--parchment-texture)] opacity-10 pointer-events-none" />
              {currentScenario && (
                <CombatView
                  activeCombatants={currentScenario.activeCombatants || []}
                  onActiveCombatantsChange={updateActiveCombatants}
                  players={campaign.players || []}
                  npcs={campaign.npcs || []}
                  persistentEnemies={campaign.persistentEnemies || []}
                  onClose={() => setRightSidebarOpen(false)}
                />
              )}
            </div>
          </motion.aside>
        </div>

        {/* Campaign Settings Modal */}
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CampaignSettings
                campaign={campaign}
                onUpdate={setCampaign}
                onClose={() => setSettingsOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>



        <AddCombatantModal
          isOpen={addPlayerModalOpen}
          onClose={() => setAddPlayerModalOpen(false)}
          type="player"
          onAdd={(p) => {
            setCampaign(prev => prev ? ({
              ...prev,
              players: [...prev.players, { ...p, id: `p-${Date.now()}` } as Combatant]
            }) : prev);
          }}
        />

        <AddCombatantModal
          isOpen={addNPCModalOpen}
          onClose={() => setAddNPCModalOpen(false)}
          type="npc"
          onAdd={(n) => {
            setCampaign(prev => prev ? ({
              ...prev,
              npcs: [...prev.npcs, { ...n, id: `n-${Date.now()}` } as Combatant]
            }) : prev);
          }}
        />

        {/* Player Character Sheet Modal */}
        <PlayerCharacterSheet
          player={campaign.players.find(p => p.id === selectedPlayerId) || null}
          onClose={() => setSelectedPlayerId(null)}
          onDelete={(playerId) => {
            setCampaign(prev => prev ? ({
              ...prev,
              players: prev.players.filter(p => p.id !== playerId)
            }) : prev);
            setSelectedPlayerId(null);
          }}
          onColorChange={(playerId, color) => {
            setCampaign(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                players: prev.players.map(p => p.id === playerId ? { ...p, color } : p),
                // Also update any matching tokens in all scenarios
                scenarios: prev.scenarios.map(s => ({
                  ...s,
                  tokens: s.tokens.map(t =>
                    t.combatantId === playerId ? { ...t, color } : t
                  )
                }))
              };
            });
          }}
          onRefresh={async (playerId) => {
            const player = campaign.players.find(p => p.id === playerId);
            if (!player) return;
            const syncUrl = player.dndBeyondUrl
              || (player.dndBeyondId ? `https://www.dndbeyond.com/characters/${player.dndBeyondId}` : null);
            if (!syncUrl || !window.electronAPI?.importDndBeyondCharacter) return;
            const result = await window.electronAPI.importDndBeyondCharacter(syncUrl);
            if (result.error) throw new Error(result.error);
            const parsed = parseDndBeyondCharacter(result.data);
            setCampaign(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                players: prev.players.map(p => p.id === playerId ? {
                  ...p,
                  name: parsed.name ?? p.name,
                  hp: parsed.hp ?? p.hp,
                  maxHp: parsed.maxHp ?? p.maxHp,
                  ac: parsed.ac ?? p.ac,
                  species: parsed.species ?? p.species,
                  speed: parsed.speed ?? p.speed,
                  darkvision: parsed.darkvision ?? p.darkvision,
                  classes: parsed.classes ?? p.classes,
                  initiative: parsed.initiative ?? p.initiative,
                  stats: parsed.stats ?? p.stats,
                  proficiencyBonus: parsed.proficiencyBonus ?? p.proficiencyBonus,
                  spells: parsed.spells ?? p.spells,
                  avatar: parsed.avatar ?? p.avatar,
                  dndBeyondId: parsed.dndBeyondId ?? p.dndBeyondId,
                } : p),
              };
            });
          }}
        />

      </div>
    </div>
  );
}

// Router Component
export default function App() {
  const [isPlayerView, setIsPlayerView] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      setIsPlayerView(window.location.hash === '#player');
    };

    // Initial check
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return isPlayerView ? <PlayerScreen /> : <DMScreen />;
}
