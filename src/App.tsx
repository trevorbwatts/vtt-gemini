import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { DMNotes } from './components/DMNotes';
import { MapView } from './components/MapView';
import { FloorMapContainer } from './components/FloorMapContainer';
import { BottomPanel } from './components/BottomPanel';
import { CampaignSettings } from './components/CampaignSettings';
import { SplashScreen } from './components/SplashScreen';
import { PlayerScreen } from './components/PlayerScreen';
import { PlayerCharacterSheet } from './components/PlayerCharacterSheet';
import { cn, Campaign, Scenario, Combatant, Token, WallSegment, Portal, GridResolution, MapNote, Viewpoint, Floor, TransitionZone, UVTTLight } from './types';
import { Layout, Map as MapIcon, Settings, ChevronRight, Folder, FileText, Zap, Plus, Menu, Users, User, Skull, LogOut, ArrowLeft, Edit2, X, MonitorUp, MonitorX, Swords, Maximize, Minimize } from './icons';
import { motion, AnimatePresence } from 'motion/react';

import { AddCombatantModal } from './components/AddCombatantModal';
import { SpellDamageModal } from './components/SpellDamageModal';
import { SpellConditionModal } from './components/SpellConditionModal';
import { parseDndBeyondCharacter } from './services/dndBeyondParser';
import { parseSpellDamage } from './utils/actionParser';

// Load persisted panel states from localStorage
function loadPanelStates(): { left: boolean; nav: boolean } {
  try {
    const raw = localStorage.getItem('dm_panel_states');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { left: false, nav: false };
}

function savePanelStates(left: boolean, nav: boolean) {
  localStorage.setItem('dm_panel_states', JSON.stringify({ left, nav }));
}

/** Build a lightweight campaign for IPC — keep current scenario's floor images, strip everything else */
function buildLightCampaignForIPC(campaign: Campaign, currentScenarioId: string): Campaign {
  return {
    ...campaign,
    scenarios: campaign.scenarios.map(s => {
      if (s.id === currentScenarioId) return s; // keep current scenario's images
      // Strip floor images from non-current scenarios
      const { mapImage, ...rest } = s;
      return {
        ...rest,
        floors: rest.floors?.map(f => {
          const { mapImage: _fImg, ...fRest } = f;
          return fRest;
        })
      };
    })
  };
}

export function DMScreen() {
  const savedPanels = useRef(loadPanelStates());
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(savedPanels.current.left);
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [panToNote, setPanToNote] = useState<MapNote | null>(null);
  const [navSidebarOpen, setNavSidebarOpen] = useState(savedPanels.current.nav);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [addNPCModalOpen, setAddNPCModalOpen] = useState(false);
  const [playerScreenOpen, setPlayerScreenOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Listen for both browser fullscreen and Electron fullscreen changes

  useEffect(() => {
    // Browser fullscreen (dev mode fallback)
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    // Electron native fullscreen
    window.electronAPI?.onFullscreenStatus?.((isFs) => setIsFullscreen(isFs));
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.electronAPI?.removeFullscreenStatusListener?.();
    };
  }, []);
  const [playerMode, setPlayerMode] = useState<'setup' | 'play'>('play');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);

  // Campaign State
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<{ type: 'scenario' | 'floor'; scenarioId: string; floorId?: string; value: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const selectedScenarioIdRef = useRef(selectedScenarioId);
  selectedScenarioIdRef.current = selectedScenarioId;
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const playerModeRef = useRef(playerMode);
  playerModeRef.current = playerMode;
  // Active floor tracking — derived from current scenario
  const activeFloorId = useMemo(() => {
    if (!campaign || !selectedScenarioId) return null;
    const scenario = campaign.scenarios.find(s => s.id === selectedScenarioId);
    return scenario?.activeFloorId || scenario?.floors?.[0]?.id || null;
  }, [campaign, selectedScenarioId]);
  const activeFloorIdRef = useRef(activeFloorId);
  activeFloorIdRef.current = activeFloorId;

  const setActiveFloorId = useCallback((floorId: string) => {
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s =>
        s.id === selectedScenarioIdRef.current ? { ...s, activeFloorId: floorId } : s
      )
    }) : prev);
  }, []);

  const skipStateBroadcastRef = useRef(false);
  const dmViewportCenterRef = useRef<{ x: number; y: number } | null>(null);
  const clearMovementPathsRef = useRef<(() => void) | null>(null);
  const clearRemoteAoeRef = useRef<(() => void) | null>(null);
  const cancelCastingRef = useRef<(() => void) | null>(null);
  const startCastingRef = useRef<((spell: { name: string; aoeType?: string; aoeSize?: number; range?: number; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; desc?: string }, combatantId: string) => void) | null>(null);
  const startPlacingRef = useRef<((spell: { name: string; school?: string; effectRadius?: number; range?: number; shapeType?: 'point' | 'wall'; maxLength?: number; maxThickness?: number; blocksVision?: boolean }, combatantId: string) => void) | null>(null);
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);
  const activeCombatantIdRef = useRef(activeCombatantId);
  activeCombatantIdRef.current = activeCombatantId;

  // Player targeting — combatant IDs that players have tapped to target
  const [targetedCombatantIds, setTargetedCombatantIds] = useState<Set<string>>(new Set());

  // AoE highlights from MapView (for BottomPanel display)
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string; saveEffect?: string; condition?: string } | null>(null);
  const [spellDamageModal, setSpellDamageModal] = useState<{ spellName: string; saveAbility: string; saveDc: number; halfDamageOnSave: boolean; saveResults: Record<string, any> } | null>(null);
  const [spellConditionModal, setSpellConditionModal] = useState<{ spellName: string; saveAbility: string; saveDc: number; condition: string; saveResults: Record<string, any> } | null>(null);
  const prevSaveResultsRef = useRef<Record<string, any> | null>(null);

  // Auto-open damage or condition modal when player confirms an AoE cast
  useEffect(() => {
    const prev = prevSaveResultsRef.current;
    const curr = aoeHighlights?.saveResults;
    prevSaveResultsRef.current = curr || null;

    // Only trigger when transitioning from no results to results
    if (prev || !curr) return;
    if (!aoeHighlights?.spellName) return;

    // Condition spell (e.g. Grease) — open condition modal
    if (aoeHighlights.saveEffect === 'condition') {
      if (!aoeHighlights.saveAbility || !aoeHighlights.saveDc || !aoeHighlights.condition) return;
      setSpellConditionModal({
        spellName: aoeHighlights.spellName,
        saveAbility: aoeHighlights.saveAbility,
        saveDc: aoeHighlights.saveDc,
        condition: aoeHighlights.condition,
        saveResults: curr,
      });
      return;
    }

    // damage-auto (e.g. Cloud of Daggers) or damage-save — open damage modal
    if (!aoeHighlights.saveAbility || !aoeHighlights.saveDc) {
      // No save info and not a condition spell — check desc for damage
      const hasDamage = !!parseSpellDamage(aoeHighlights.spellDesc || '');
      if (!hasDamage) {
        window.electronAPI?.sendDismissPlayerAoe?.();
        setAoeHighlights(null);
        return;
      }
    }

    setSpellDamageModal({
      spellName: aoeHighlights.spellName,
      saveAbility: aoeHighlights.saveAbility || '',
      saveDc: aoeHighlights.saveDc || 0,
      halfDamageOnSave: aoeHighlights.saveEffect === 'damage-auto' ? false : (aoeHighlights.halfDamageOnSave || false),
      saveResults: curr,
    });
  }, [aoeHighlights?.saveResults]);

  // Persist panel open/closed states
  useEffect(() => {
    savePanelStates(leftSidebarOpen, navSidebarOpen);
  }, [leftSidebarOpen, navSidebarOpen]);

  // Persistence — store map images separately to avoid serializing multi-MB base64 strings
  // into the main campaign JSON on every state change
  useEffect(() => {
    if (campaign) {
      // Save map images separately, keyed by scenario ID + floor ID
      for (const s of campaign.scenarios) {
        if (s.floors) {
          for (const f of s.floors) {
            if (f.mapImage) {
              try { localStorage.setItem(`map_img_${s.id}_${f.id}`, f.mapImage); } catch { /* quota */ }
            }
          }
        }
        // Legacy fallback for non-migrated scenarios
        if (s.mapImage && !s.floors) {
          try { localStorage.setItem(`map_img_${s.id}`, s.mapImage); } catch { /* quota */ }
        }
      }
      // Strip mapImage from all scenarios and floors before persisting the campaign JSON
      const lightCampaign = {
        ...campaign,
        scenarios: campaign.scenarios.map(s => {
          const { mapImage, ...rest } = s;
          return {
            ...rest,
            floors: rest.floors?.map(f => {
              const { mapImage: _fImg, ...fRest } = f;
              return fRest;
            })
          };
        })
      };
      const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
      const index = savedCampaigns.findIndex((c: Campaign) => c.id === campaign.id);
      if (index >= 0) {
        savedCampaigns[index] = lightCampaign;
      } else {
        savedCampaigns.push(lightCampaign);
      }
      localStorage.setItem('dungeon_master_campaigns', JSON.stringify(savedCampaigns));
    }
  }, [campaign]);

  // Reset viewport center when the scenario changes so the player gets a fresh default view
  useEffect(() => {
    dmViewportCenterRef.current = null;
  }, [selectedScenarioId]);

  // IPC Sync to Player Screen — strip mapImage from non-current scenarios to avoid
  // serializing multi-MB base64 strings for scenarios the player isn't viewing
  useEffect(() => {
    if (campaign && selectedScenarioId && window.electronAPI) {
      if (skipStateBroadcastRef.current) {
        skipStateBroadcastRef.current = false; // Reset but don't broadcast
        return;
      }
      window.electronAPI.sendStateUpdate({
        campaign: buildLightCampaignForIPC(campaign, selectedScenarioId),
        scenarioId: selectedScenarioId,
        playerMode,
        viewportCenter: dmViewportCenterRef.current,
        activeCombatantId,
        targetedCombatantIds: [...targetedCombatantIds],
      });
    }
  }, [campaign, selectedScenarioId, playerMode, activeCombatantId, targetedCombatantIds]);

  // Listen for player screen open/close events from Electron
  useEffect(() => {
    if (window.electronAPI?.onPlayerScreenStatus) {
      window.electronAPI.onPlayerScreenStatus((isOpen: boolean) => {
        setPlayerScreenOpen(isOpen);
        if (isOpen) {
          // Send current state immediately so the player screen doesn't rely on stale localStorage
          if (campaignRef.current && selectedScenarioIdRef.current) {
            const c = campaignRef.current;
            const sid = selectedScenarioIdRef.current;
            window.electronAPI!.sendStateUpdate({
              campaign: buildLightCampaignForIPC(c, sid),
              scenarioId: sid,
              playerMode: playerModeRef.current,
              viewportCenter: dmViewportCenterRef.current,
              targetedCombatantIds: [...targetedCombatantIds],
            });
          }
        } else {
          setPlayerMode('setup');
        }
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

  // Listen for condition updates from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerConditionUpdate) return;
    window.electronAPI.onPlayerConditionUpdate(({ tokenId, conditions }) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.id === tokenId ? { ...p, conditions } : p),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerConditionUpdateListener?.(); };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onPlayerDarkvisionUpdate) return;
    window.electronAPI.onPlayerDarkvisionUpdate(({ playerId, darkvision }) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, darkvision } : p),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerDarkvisionUpdateListener?.(); };
  }, []);

  // Listen for color changes from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerColorUpdate) return;
    window.electronAPI.onPlayerColorUpdate(({ playerId, color }) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, color } : p),
          scenarios: prev.scenarios.map(s => ({
            ...s,
            activeCombatants: s.activeCombatants.map(c => (c.id === playerId || c.sourceCombatantId === playerId) ? { ...c, color } : c),
          })),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerColorUpdateListener?.(); };
  }, []);

  // Listen for target updates from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerTargetUpdate) return;
    window.electronAPI.onPlayerTargetUpdate((ids) => {
      setTargetedCombatantIds(new Set(ids));
    });
    return () => { window.electronAPI?.removePlayerTargetUpdateListener?.(); };
  }, []);

  // Wild Shape state (playerId -> original avatar, for reverting on DM side)
  const [wildShapeState, setWildShapeState] = useState<Record<string, { creatureName: string; originalAvatar?: string }>>({});

  // Listen for Wild Shape updates from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerWildShape) return;
    window.electronAPI.onPlayerWildShape((data) => {
      if (!data) return;

      const { playerId, revert, originalAvatar, originalSize, creatureName, creatureAvatar, creatureSize } = data as any;
      console.log('[DM] Received wild shape IPC:', { playerId, revert, originalAvatar, originalSize, creatureName, creatureAvatar, creatureSize });

      if (revert) {
        // Revert this specific player back to their original avatar and size
        console.log('[DM] Processing wild shape REVERT for', playerId);
        setWildShapeState(prev => {
          const next = { ...prev };
          delete next[playerId];
          return next;
        });
        setCampaign(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map(p => p.id === playerId ? { ...p, avatar: originalAvatar } : p),
            scenarios: prev.scenarios.map(s => ({
              ...s,
              tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, avatar: originalAvatar, size: originalSize || 'Medium' } : t),
            })),
          };
        });
        return;
      }

      // Transform — store the originalAvatar sent from the player screen (not captured from campaign state)
      setWildShapeState(prev => ({
        ...prev,
        [playerId]: { creatureName, originalAvatar },
      }));
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map(p => p.id === playerId ? { ...p, avatar: creatureAvatar } : p),
          scenarios: prev.scenarios.map(s => ({
            ...s,
            tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, avatar: creatureAvatar, size: creatureSize || 'Medium' } : t),
          })),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerWildShapeListener?.(); };
  }, []);

  // Listen for Invisible toggle from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerInvisibleToggle) return;
    window.electronAPI.onPlayerInvisibleToggle((tokenId: string) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s => ({
            ...s,
            tokens: s.tokens.map(t => t.id === tokenId ? { ...t, invisible: !t.invisible } : t),
          })),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerInvisibleToggleListener?.(); };
  }, []);

  const handleCreateCampaign = (name: string) => {
    const scenarioId = `s-${Date.now()}`;
    const defaultFloorId = `floor-${scenarioId}-0`;
    const newCampaign: Campaign = {
      id: `c-${Date.now()}`,
      name,
      players: [],
      npcs: [],
      persistentEnemies: [],
      scenarios: [
        {
          id: scenarioId,
          name: 'Initial Scenario',
          notes: '<h2>Welcome to your new campaign</h2><p>Start by adding some notes or tokens to the map.</p>',
          mapNotes: [],
          tokens: [],
          combatants: [],
          activeCombatants: [],
          floors: [{
            id: defaultFloorId,
            name: 'Floor 1',
            order: 0,
            mapNotes: [],
            viewpoints: [],
            transitionZones: [],
          }],
          activeFloorId: defaultFloorId,
        }
      ]
    };
    setCampaign(newCampaign);
    setSelectedScenarioId(newCampaign.scenarios[0].id);
  };

  const handleSelectCampaign = (selected: Campaign) => {
    // Migrate old data if necessary, and rehydrate map images from separate storage
    const migrated = {
      ...selected,
      players: selected.players || [],
      npcs: selected.npcs || [],
      persistentEnemies: selected.persistentEnemies || [],
      scenarios: (selected.scenarios || []).map(s => {
        const scenario = {
          ...s,
          tokens: s.tokens || [],
          combatants: s.combatants || [],
          activeCombatants: s.activeCombatants || [],
          mapNotes: s.mapNotes || [],
        };

        // Migrate legacy flat-map scenario into floors structure
        if (!scenario.floors || scenario.floors.length === 0) {
          const defaultFloorId = `floor-${s.id}-0`;
          const legacyMapImage = s.mapImage || localStorage.getItem(`map_img_${s.id}`) || undefined;
          scenario.floors = [{
            id: defaultFloorId,
            name: 'Floor 1',
            order: 0,
            mapImage: legacyMapImage,
            walls: s.walls,
            objectWalls: s.objectWalls,
            portals: s.portals,
            gridResolution: s.gridResolution,
            darknessLevel: s.darknessLevel,
            mapNotes: scenario.mapNotes || [],
            viewpoints: s.viewpoints || [],
            transitionZones: [],
          }];
          scenario.activeFloorId = defaultFloorId;
          // Migrate localStorage key
          if (legacyMapImage) {
            try { localStorage.setItem(`map_img_${s.id}_${defaultFloorId}`, legacyMapImage); } catch { /* quota */ }
          }
          // Set floorId on all existing tokens
          for (const t of scenario.tokens) {
            if (!t.floorId) t.floorId = defaultFloorId;
          }
        } else {
          // Rehydrate floor map images from separate storage
          scenario.floors = scenario.floors.map(f => ({
            ...f,
            mapImage: f.mapImage || localStorage.getItem(`map_img_${s.id}_${f.id}`) || undefined,
          }));
          if (!scenario.activeFloorId) {
            scenario.activeFloorId = scenario.floors[0]?.id;
          }
        }

        return scenario;
      })
    };
    setCampaign(migrated);
    setSelectedScenarioId(migrated.scenarios[0]?.id || null);
  };

  // --- Stable callbacks (useCallback) — must be defined before any early return ---

  /** Helper: update a field on the active floor within the current scenario */
  const updateActiveFloor = useCallback((updater: (floor: Floor) => Floor) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          return {
            ...s,
            floors: s.floors?.map(f =>
              f.id === activeFloorIdRef.current ? updater(f) : f
            )
          };
        })
      };
    });
  }, []);

  /** Update a specific floor by ID (for cross-floor operations like paired transition zones) */
  const updateFloorById = useCallback((floorId: string, updater: (floor: Floor) => Floor) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          return {
            ...s,
            floors: s.floors?.map(f => f.id === floorId ? updater(f) : f)
          };
        })
      };
    });
  }, []);

  const updateMapNotes = useCallback((mapNotes: any[]) => {
    updateActiveFloor(f => ({ ...f, mapNotes }));
  }, [updateActiveFloor]);

  const updateViewpoints = useCallback((viewpoints: Viewpoint[]) => {
    updateActiveFloor(f => ({ ...f, viewpoints }));
  }, [updateActiveFloor]);

  const updateScenarioTokens = useCallback((sourceFloorId: string, floorTokens: Token[]) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          // Merge by ID: update existing tokens, add new ones, keep tokens not in the update
          const updatedIds = new Set(floorTokens.map(t => t.id));
          const kept = s.tokens.filter(t => !updatedIds.has(t.id));
          // Also check for tokens that were in the original set but removed (deleted)
          const originalFloorId = sourceFloorId;
          const firstFloorId = s.floors?.[0]?.id;
          const originalFloorTokenIds = new Set(s.tokens.filter(t =>
            t.floorId === originalFloorId || (!t.floorId && originalFloorId === firstFloorId)
          ).map(t => t.id));
          const deletedIds = new Set([...originalFloorTokenIds].filter(id => !updatedIds.has(id)));
          const surviving = kept.filter(t => !deletedIds.has(t.id));
          // Remove stale tokens on other floors that share a combatantId with an incoming token
          const newCombatantIds = new Set(floorTokens.filter(t => t.combatantId).map(t => t.combatantId!));
          const deduped = surviving.filter(t => !t.combatantId || !newCombatantIds.has(t.combatantId));
          return { ...s, tokens: [...deduped, ...floorTokens] };
        })
      };
    });
  }, []);

  /** Update a combatant's HP by delta, keeping both scenarioCombatants and activeCombatants in sync */
  const updateCombatantHp = useCallback((sourceCombatantId: string, delta: number) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          const updatedCombatants = (s.combatants || []).map(sc =>
            sc.id === sourceCombatantId
              ? { ...sc, hp: Math.max(0, Math.min(sc.maxHp, sc.hp + delta)) }
              : sc
          );
          const updatedActive = (s.activeCombatants || []).map(ac =>
            ac.sourceCombatantId === sourceCombatantId
              ? { ...ac, hp: Math.max(0, Math.min(ac.maxHp, ac.hp + delta)) }
              : ac
          );
          return { ...s, combatants: updatedCombatants, activeCombatants: updatedActive };
        })
      };
    });
  }, []);

  const updateScenarioMap = useCallback((mapImage: string) => {
    updateActiveFloor(f => ({ ...f, mapImage }));
  }, [updateActiveFloor]);

  const updateWallData = useCallback((
    walls: WallSegment[],
    objectWalls: WallSegment[],
    portals: Portal[],
    gridResolution: GridResolution,
    lights?: UVTTLight[]
  ) => {
    updateActiveFloor(f => ({ ...f, walls, objectWalls, portals, gridResolution, lights: lights ?? [] }));
  }, [updateActiveFloor]);

  const updateDarknessLevel = useCallback((level: 'daylight' | 'dark') => {
    updateActiveFloor(f => ({ ...f, darknessLevel: level }));
  }, [updateActiveFloor]);

  const togglePortal = useCallback((portalId: string) => {
    updateActiveFloor(f => ({
      ...f,
      portals: f.portals?.map(p =>
        p.id === portalId ? { ...p, closed: !p.closed } : p
      )
    }));
  }, [updateActiveFloor]);

  const changePortalType = useCallback((portalId: string, type: 'door' | 'window') => {
    updateActiveFloor(f => ({
      ...f,
      portals: f.portals?.map(p =>
        p.id === portalId ? { ...p, portalType: type } : p
      )
    }));
  }, [updateActiveFloor]);

  // Listen for portal toggle from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerPortalToggle) return;
    window.electronAPI.onPlayerPortalToggle((portalId) => {
      togglePortal(portalId);
    });
    return () => { window.electronAPI?.removePlayerPortalToggleListener?.(); };
  }, [togglePortal]);

  // Listen for spell marker updates from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerSpellMarkerUpdate) return;
    window.electronAPI.onPlayerSpellMarkerUpdate((markers: any) => {
      setCampaign(prev => {
        const scenarioId = selectedScenarioIdRef.current;
        if (!prev || !scenarioId) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s =>
            s.id === scenarioId ? { ...s, spellMarkers: markers } : s
          ),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerSpellMarkerUpdateListener?.(); };
  }, []);

  const addEnemyToMap = useCallback((monster: any, x: number, y: number) => {
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
      speedText: monster.speed,
      cr: monster.cr,
      specialAbilities: monster.specialAbilities,
      legendaryActions: monster.legendaryActions,
      reactions: monster.reactions,
      saves: monster.saves,
      skills: monster.skills,
      immunities: monster.immunities,
      resistances: monster.resistances,
      vulnerabilities: monster.vulnerabilities,
      conditionImmunities: monster.conditionImmunities,
      senses: monster.senses,
      languages: monster.languages,
      creatureType: monster.type,
    };

    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === selectedScenarioIdRef.current ? {
        ...s,
        tokens: [...s.tokens, {
          id: `t-${uniqueId}`,
          combatantId: newEnemyId,
          name: newEnemy.name,
          type: 'enemy',
          x,
          y,
          color: '#ef4444',
          avatar: newEnemy.avatar,
          size: (monster.size?.split('/')[0]?.trim() as Token['size']) || 'Medium',
          floorId: activeFloorIdRef.current || undefined,
        }],
        combatants: [...(s.combatants || []), newEnemy]
      } : s),
      persistentEnemies: monster.isBoss ? [...prev.persistentEnemies, newEnemy] : prev.persistentEnemies
    }) : prev);
  }, []);

  const handleViewportCenter = useCallback((center: { x: number; y: number }) => {
    dmViewportCenterRef.current = center;
  }, []);

  // --- End stable callbacks ---

  const currentScenario = useMemo(() => {
    if (!campaign || !selectedScenarioId) return null;
    return campaign.scenarios.find(s => s.id === selectedScenarioId) || campaign.scenarios[0];
  }, [campaign, selectedScenarioId]);

  const activeFloor = useMemo(() => {
    if (!currentScenario?.floors) return null;
    return currentScenario.floors.find(f => f.id === activeFloorId) || currentScenario.floors[0] || null;
  }, [currentScenario, activeFloorId]);

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

  const updateActiveCombatants = (activeCombatants: Combatant[]) => {
    // Clear targeting when combat ends
    if (activeCombatants.length === 0) setTargetedCombatantIds(new Set());
    setCampaign(prev => prev ? ({
      ...prev,
      scenarios: prev.scenarios.map(s => {
        if (s.id !== selectedScenarioId) return s;
        // Sync HP back to scenarioCombatants so the bottom panel stays current
        const updatedCombatants = (s.combatants || []).map(sc => {
          const active = activeCombatants.find(ac => ac.sourceCombatantId === sc.id);
          return active ? { ...sc, hp: active.hp } : sc;
        });
        return { ...s, activeCombatants, combatants: updatedCombatants };
      })
    }) : prev);
  };

  const handleApplySpellDamage = (damages: Record<string, number>) => {
    for (const [combatantId, amount] of Object.entries(damages)) {
      updateCombatantHp(combatantId, -amount);
    }
    // Clear both the DM's placed AoE and any remote (player) AoE
    cancelCastingRef.current?.();
    clearRemoteAoeRef.current?.();
    // Dismiss the AoE on the player screen via IPC
    window.electronAPI?.sendDismissPlayerAoe?.();
    setAoeHighlights(null);
    setSpellDamageModal(null);
  };

  const handleApplySpellCondition = (applyToIds: string[]) => {
    // Apply the condition to the selected combatants
    for (const combatantId of applyToIds) {
      const condition = spellConditionModal?.condition;
      if (!condition) continue;
      setCampaign(prev => {
        if (!prev) return prev;
        const applyToList = (list: Combatant[]) =>
          list.map(c => {
            if (c.id !== combatantId && c.sourceCombatantId !== combatantId) return c;
            const current = new Set(c.conditions || []);
            current.add(condition);
            return { ...c, conditions: Array.from(current) };
          });
        return {
          ...prev,
          players: applyToList(prev.players),
          npcs: applyToList(prev.npcs),
          persistentEnemies: applyToList(prev.persistentEnemies),
          scenarios: prev.scenarios.map(s => ({
            ...s,
            activeCombatants: applyToList(s.activeCombatants || []),
          })),
        };
      });
    }
    cancelCastingRef.current?.();
    clearRemoteAoeRef.current?.();
    window.electronAPI?.sendDismissPlayerAoe?.();
    setAoeHighlights(null);
    setSpellConditionModal(null);
  };

  const startCombat = (tokenIds: string[]) => {
    if (!currentScenario) return;

    const selectedTokens = currentScenario.tokens.filter(t => tokenIds.includes(t.id));
    const currentActive = [...(currentScenario.activeCombatants || [])];
    const newCombatants: Combatant[] = [];
    
    // Group non-player creatures by name so they share the same initiative roll
    const groupInitiative = new Map<string, number>();
    currentActive.forEach(c => {
      if (c.type !== 'player' && c.name) {
        groupInitiative.set(c.name, c.initiative);
      }
    });

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
        let roll: number;
        if (baseCombatant.type !== 'player' && groupInitiative.has(baseCombatant.name)) {
          roll = groupInitiative.get(baseCombatant.name)!;
        } else {
          const dexMod = baseCombatant.stats ? Math.floor((baseCombatant.stats.dex - 10) / 2) : 0;
          roll = Math.floor(Math.random() * 20) + 1 + dexMod;
          if (baseCombatant.type !== 'player') {
            groupInitiative.set(baseCombatant.name, roll);
          }
        }

        newCombatants.push({
          ...baseCombatant,
          id: combatantTrackerId,
          initiative: roll,
          sourceCombatantId: baseCombatant.id,
        });
      } else {
        // Fallback for tokens without a full combatant record
        let roll: number;
        if (token.type !== 'player' && groupInitiative.has(token.name)) {
          roll = groupInitiative.get(token.name)!;
        } else {
          roll = Math.floor(Math.random() * 20) + 1;
          if (token.type !== 'player') {
            groupInitiative.set(token.name, roll);
          }
        }
        
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
  };

  const addScenario = () => {
    const newId = `s-${Date.now()}`;
    const defaultFloorId = `floor-${newId}-0`;
    const newScenario: Scenario = {
      id: newId,
      name: 'New Scenario',
      notes: '<h2>New Scenario</h2><p>Start by adding some notes or tokens to the map.</p>',
      mapNotes: [],
      tokens: [],
      combatants: [],
      activeCombatants: [],
      floors: [{
        id: defaultFloorId,
        name: 'Floor 1',
        order: 0,
        mapNotes: [],
        viewpoints: [],
        transitionZones: [],
      }],
      activeFloorId: defaultFloorId,
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
                  <div key={s.id}>
                    <div className="flex items-center gap-2 group">
                      {editingName?.type === 'scenario' && editingName.scenarioId === s.id ? (
                        <input
                          autoFocus
                          value={editingName.value}
                          onChange={e => setEditingName({ ...editingName, value: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (editingName.value.trim()) {
                                setCampaign(prev => prev ? ({ ...prev, scenarios: prev.scenarios.map(sc => sc.id === s.id ? { ...sc, name: editingName.value.trim() } : sc) }) : prev);
                              }
                              setEditingName(null);
                            } else if (e.key === 'Escape') {
                              setEditingName(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingName.value.trim()) {
                              setCampaign(prev => prev ? ({ ...prev, scenarios: prev.scenarios.map(sc => sc.id === s.id ? { ...sc, name: editingName.value.trim() } : sc) }) : prev);
                            }
                            setEditingName(null);
                          }}
                          className="flex-1 px-5 py-4 rounded-[12px] text-[15px] font-medium bg-[#181512] border border-[var(--accent)] text-white outline-none"
                        />
                      ) : (
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
                      )}
                      <button
                        onClick={() => setEditingName({ type: 'scenario', scenarioId: s.id, value: s.name })}
                        className="p-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                        title="Rename scenario"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                    {/* Floor list — shown when this scenario is selected */}
                    {selectedScenarioId === s.id && s.floors && s.floors.length > 0 && (
                      <div className="mt-1 mb-1 space-y-0.5">
                        {s.floors.sort((a, b) => a.order - b.order).map((floor) => {
                          const firstFloorId = s.floors![0].id;
                          const floorTokens = (s.tokens || []).filter(t =>
                            t.floorId === floor.id || (!t.floorId && floor.id === firstFloorId)
                          );
                          const saveFloorName = (name: string) => {
                            if (name.trim()) {
                              setCampaign(prev => prev ? ({
                                ...prev,
                                scenarios: prev.scenarios.map(sc =>
                                  sc.id !== s.id ? sc : {
                                    ...sc,
                                    floors: sc.floors?.map(f =>
                                      f.id === floor.id ? { ...f, name: name.trim() } : f
                                    )
                                  }
                                )
                              }) : prev);
                            }
                            setEditingName(null);
                          };
                          return (
                          <div key={floor.id} className="flex items-center gap-1 group/floor">
                            {editingName?.type === 'floor' && editingName.floorId === floor.id ? (
                              <input
                                autoFocus
                                value={editingName.value}
                                onChange={e => setEditingName({ ...editingName, value: e.target.value })}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveFloorName(editingName.value);
                                  else if (e.key === 'Escape') setEditingName(null);
                                }}
                                onBlur={() => saveFloorName(editingName.value)}
                                className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-black/40 border border-[var(--accent)] text-white outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => setActiveFloorId(floor.id)}
                                className={cn(
                                  "flex-1 text-left px-3 py-1.5 rounded-lg text-[13px] transition-all flex items-center gap-2",
                                  activeFloorId === floor.id
                                    ? "bg-[var(--accent)]/20 text-[var(--accent)] font-medium"
                                    : "opacity-50 hover:opacity-80 text-white"
                                )}
                              >
                                <span className="flex-1">{floor.name}</span>
                                {floorTokens.length > 0 && (
                                  <span className="flex items-center gap-0.5">
                                    {floorTokens.slice(0, 5).map(t => (
                                      <span
                                        key={t.id}
                                        className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-[8px] font-bold text-white"
                                        style={{ background: t.avatar ? undefined : t.color, border: `1px solid ${t.color}` }}
                                        title={t.name}
                                      >
                                        {t.avatar
                                          ? <img src={t.avatar} alt={t.name} className="w-full h-full object-cover" />
                                          : t.name[0]?.toUpperCase()}
                                      </span>
                                    ))}
                                    {floorTokens.length > 5 && (
                                      <span className="text-[9px] opacity-50 ml-0.5">+{floorTokens.length - 5}</span>
                                    )}
                                  </span>
                                )}
                              </button>
                            )}
                            <button
                              onClick={() => setEditingName({ type: 'floor', scenarioId: s.id, floorId: floor.id, value: floor.name })}
                              className="p-1 opacity-0 group-hover/floor:opacity-40 hover:!opacity-100 transition-opacity"
                              title="Rename floor"
                            >
                              <Edit2 size={10} />
                            </button>
                            {s.floors!.length > 1 && (
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    message: `Delete floor "${floor.name}"?`,
                                    onConfirm: () => { setCampaign(prev => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      scenarios: prev.scenarios.map(sc => {
                                        if (sc.id !== s.id) return sc;
                                        const remaining = sc.floors?.filter(f => f.id !== floor.id) || [];
                                        const newActiveId = sc.activeFloorId === floor.id
                                          ? remaining[0]?.id
                                          : sc.activeFloorId;
                                        // Move orphaned tokens to the first remaining floor
                                        const tokens = sc.tokens.map(t =>
                                          t.floorId === floor.id ? { ...t, floorId: remaining[0]?.id } : t
                                        );
                                        return { ...sc, floors: remaining, activeFloorId: newActiveId, tokens };
                                      })
                                    };
                                  }); }
                                  });
                                }}
                                className="p-1 opacity-0 group-hover/floor:opacity-40 hover:!opacity-100 transition-opacity text-red-400"
                                title="Delete floor"
                              >
                                <X size={10} />
                              </button>
                            )}
                          </div>
                          );
                        })}
                        <button
                          onClick={() => {
                            const floorId = `floor-${s.id}-${Date.now()}`;
                            const newOrder = Math.max(0, ...(s.floors?.map(f => f.order) || [])) + 1;
                            setCampaign(prev => prev ? ({
                              ...prev,
                              scenarios: prev.scenarios.map(sc =>
                                sc.id !== s.id ? sc : {
                                  ...sc,
                                  floors: [...(sc.floors || []), {
                                    id: floorId,
                                    name: `Floor ${newOrder + 1}`,
                                    order: newOrder,
                                    mapNotes: [],
                                    viewpoints: [],
                                    transitionZones: [],
                                  }]
                                }
                              )
                            }) : prev);
                            setActiveFloorId(floorId);
                          }}
                          className="w-full text-left px-3 py-1 text-[12px] opacity-40 hover:opacity-70 transition-opacity text-[var(--accent)]"
                        >
                          + Add Floor
                        </button>
                      </div>
                    )}
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
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-semibold tracking-wide transition-all",
                    playerMode === 'setup'
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  <Settings size={11} /> Setup
                </button>
                <button
                  onClick={() => setPlayerMode('play')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-semibold tracking-wide transition-all",
                    playerMode === 'play'
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  <Swords size={11} /> Play
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
                  setPlayerMode('play');
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
            <button
              onClick={() => {
                if (window.electronAPI?.toggleFullscreen) {
                  window.electronAPI.toggleFullscreen();
                } else if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              className="btn-ghost px-2"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex-1 overflow-hidden relative">
          {/* Center: Map View (Always Present, full area) */}
          <main className="w-full h-full relative bg-[#111] overflow-hidden">
            {currentScenario && (
              <FloorMapContainer
                scenario={currentScenario}
                allTokens={currentScenario.tokens || []}
                activeFloorId={activeFloorId}
                onTokensChange={updateScenarioTokens}
                onMapChange={updateScenarioMap}
                onMapNotesChange={updateMapNotes}
                onViewpointsChange={updateViewpoints}
                players={campaign.players || []}
                npcs={campaign.npcs || []}
                persistentEnemies={campaign.persistentEnemies || []}
                onUpdateCombatantHp={updateCombatantHp}
                onAddEnemy={addEnemyToMap}
                onStartCombat={startCombat}
                selectedTokenId={selectedTokenId}
                onSelectedTokenIdChange={setSelectedTokenId}
                selectedTokenIds={selectedTokenIds}
                onSelectedTokenIdsChange={setSelectedTokenIds}
                leftSidebarOpen={leftSidebarOpen}
                setLeftSidebarOpen={setLeftSidebarOpen}
                onNoteClick={setHighlightedNoteId}
                onAddScenario={addScenario}
                panToNote={panToNote}
                startCastingRef={startCastingRef}
                startPlacingRef={startPlacingRef}
                spellMarkers={currentScenario?.spellMarkers || []}
                onSpellMarkersChange={(markers) => {
                  setCampaign(prev => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      scenarios: prev.scenarios.map(s =>
                        s.id === currentScenario?.id ? { ...s, spellMarkers: markers } : s
                      ),
                    };
                  });
                }}
                onWallDataChange={updateWallData}
                onPortalToggle={togglePortal}
                onPortalTypeChange={changePortalType}
                onViewportCenter={handleViewportCenter}
                onDarknessLevelChange={updateDarknessLevel}
                clearMovementPathsRef={clearMovementPathsRef}
                clearRemoteAoeRef={clearRemoteAoeRef}
                cancelCastingRef={cancelCastingRef}
                onAoeHighlightsChange={setAoeHighlights}
                activeCombatantId={activeCombatantId}
                targetedCombatantIds={targetedCombatantIds}
                onTransitionZonesChange={(zones: TransitionZone[]) => updateActiveFloor(f => ({ ...f, transitionZones: zones }))}
                onSwitchFloor={setActiveFloorId}
                onUpdateFloorById={updateFloorById}
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
                  notes={activeFloor?.mapNotes || []}
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

          {/* Bottom Panel: Initiative Tracker + Token Detail */}
          {currentScenario && (
            <BottomPanel
              activeCombatants={(currentScenario.activeCombatants || []).map(c => {
                if (c.type !== 'player') return c;
                const player = campaign?.players.find(p => p.id === (c.sourceCombatantId || c.id));
                return player?.color ? { ...c, color: player.color } : c;
              })}
              onActiveCombatantsChange={updateActiveCombatants}
              onCombatantClick={(cid) => {
                const tid = cid.startsWith('combat-') ? cid.replace('combat-', '') : cid;
                setSelectedTokenId(tid);
                setSelectedTokenIds([tid]);
              }}
              onStartCombat={(tokenIds) => {
                const ids = tokenIds.length > 0 ? tokenIds : selectedTokenIds;
                if (ids.length > 0) {
                  startCombat(ids);
                  setSelectedTokenIds([]);
                }
              }}
              selectedTokenCount={selectedTokenIds.length}
              players={campaign.players || []}
              npcs={campaign.npcs || []}
              persistentEnemies={campaign.persistentEnemies || []}
              scenarioCombatants={currentScenario.combatants || []}
              onClearMovementPaths={() => clearMovementPathsRef.current?.()}
              onActiveCombatantIdChange={setActiveCombatantId}
              aoeHighlights={aoeHighlights}
              tokens={currentScenario.tokens || []}
              selectedTokenIds={selectedTokenIds}
              onSelectedTokenIdChange={setSelectedTokenId}
              onSelectedTokenIdsChange={setSelectedTokenIds}
              onUpdateCombatantHp={updateCombatantHp}
              startCastingRef={startCastingRef}
              startPlacingRef={startPlacingRef}
              targetedCombatantIds={targetedCombatantIds}
              wildShapeState={wildShapeState}
            />
          )}
        </div>

        {/* Campaign Settings Modal */}
        {/* Custom Confirm Dialog */}
        <AnimatePresence>
          {confirmDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmDialog(null)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-[360px] p-6 mx-4"
                onClick={e => e.stopPropagation()}
              >
                <p className="text-sm mb-6 leading-relaxed">{confirmDialog.message}</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="btn-ghost py-1.5 px-4 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
                    className="py-1.5 px-4 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                  >
                    DELETE
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Spell Damage Modal — auto-opens when player confirms spell cast */}
        <SpellDamageModal
          isOpen={!!spellDamageModal}
          spellName={spellDamageModal?.spellName || ''}
          saveAbility={spellDamageModal?.saveAbility || ''}
          saveDc={spellDamageModal?.saveDc || 0}
          halfDamageOnSave={spellDamageModal?.halfDamageOnSave || false}
          saveResults={spellDamageModal?.saveResults || {}}
          onApply={handleApplySpellDamage}
          onClose={() => {
            // DM closed without applying — still clear the AoE on both screens
            cancelCastingRef.current?.();
            clearRemoteAoeRef.current?.();
            window.electronAPI?.sendDismissPlayerAoe?.();
            setAoeHighlights(null);
            setSpellDamageModal(null);
          }}
        />

        {/* Spell Condition Modal — opens for condition-applying spells (Grease, etc.) */}
        <SpellConditionModal
          isOpen={!!spellConditionModal}
          spellName={spellConditionModal?.spellName || ''}
          saveAbility={spellConditionModal?.saveAbility || ''}
          saveDc={spellConditionModal?.saveDc || 0}
          condition={spellConditionModal?.condition || ''}
          saveResults={spellConditionModal?.saveResults || {}}
          onApply={handleApplySpellCondition}
          onClose={() => {
            cancelCastingRef.current?.();
            clearRemoteAoeRef.current?.();
            window.electronAPI?.sendDismissPlayerAoe?.();
            setAoeHighlights(null);
            setSpellConditionModal(null);
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
                  atWillSpells: parsed.atWillSpells ?? p.atWillSpells,
                  actions: parsed.actions ?? p.actions,
                  spellSaveDc: parsed.spellSaveDc ?? p.spellSaveDc,
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
