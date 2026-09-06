import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { DMNotes } from './components/DMNotes';
import { MapView } from './components/MapView';
import { FloorMapContainer } from './components/FloorMapContainer';
import { BottomPanel } from './components/BottomPanel';
import { CampaignSettings } from './components/CampaignSettings';
import { SplashScreen } from './components/SplashScreen';
import { PlayerScreen } from './components/PlayerScreen';
import { cn, nextImageRotation, Campaign, Scenario, Combatant, Token, Monster, WallSegment, Portal, GridResolution, MapNote, Viewpoint, Floor, TransitionZone, UVTTLight } from './types';
import { Layout, Map as MapIcon, Settings, ChevronRight, Folder, FileText, Zap, Plus, Menu, Users, User, Skull, LogOut, ArrowLeft, Edit2, X, MonitorUp, MonitorX, Swords, Maximize, Minimize, Pencil, Eraser, Disc2 } from './icons';
import { motion, AnimatePresence } from 'motion/react';

import { AddCombatantModal } from './components/AddCombatantModal';
import { createDebouncedWriter, type DebouncedWriter } from './utils/debouncedWriter';
import type { DarkZone, DifficultTerrainZone } from './types';
import { SpellDamageModal } from './components/SpellDamageModal';
import { SpellConditionModal } from './components/SpellConditionModal';
import { EnlargeReduceModal } from './components/EnlargeReduceModal';
import { ImageNoteOverlay } from './components/ImageNoteOverlay';
import { parseDndBeyondCharacter } from './services/dndBeyondParser';
import { parseSpellDamage } from './utils/actionParser';
import { lookupSpell } from './data/spellDatabase';
import { initImageStore, isImageStoreReady, getImage, setImage, removeImage, loadImages, releaseImagesExcept } from './utils/imageStore';
import { rollInitiativeFor, type InitiativeRoll } from './utils/initiative';
import { InitiativeRollModal } from './components/InitiativeRollModal';
import { useUndoableState } from './hooks/useUndoableState';

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

/** Strip imageData from every map note except the one currently being shown to players. */
function stripUndisplayedNoteImages(floors: NonNullable<Scenario['floors']>, displayedNoteId: string | null | undefined) {
  return floors.map(f => ({
    ...f,
    mapNotes: (f.mapNotes || []).map(n => {
      if (n.type !== 'image') return n;
      if (n.id === displayedNoteId) return n;
      const { imageData: _img, ...rest } = n;
      return rest;
    }),
  }));
}

/** Build a lightweight campaign for IPC — keep current scenario's floor images, strip everything else */
function buildLightCampaignForIPC(campaign: Campaign, currentScenarioId: string): Campaign {
  return {
    ...campaign,
    scenarios: campaign.scenarios.map(s => {
      if (s.id === currentScenarioId) {
        // Keep current scenario's map images; only ship the displayed image note's data
        return {
          ...s,
          floors: s.floors ? stripUndisplayedNoteImages(s.floors, s.displayedImageNoteId ?? null) : s.floors,
        };
      }
      // Strip floor images and all note images from non-current scenarios
      const { mapImage, ...rest } = s;
      return {
        ...rest,
        floors: rest.floors?.map(f => {
          const { mapImage: _fImg, ...fRest } = f;
          return {
            ...fRest,
            mapNotes: (fRest.mapNotes || []).map(n => {
              if (n.type !== 'image') return n;
              const { imageData: _img, ...nRest } = n;
              return nRest;
            }),
          };
        })
      };
    })
  };
}

/**
 * Every image-store key a campaign could reference: one per floor map, the
 * pre-floors fallback key, and one per image note. Used to pull just this
 * campaign's images into memory when it's opened, instead of loading every
 * image the app has ever stored. A key with nothing behind it is harmless.
 */
function campaignImageKeys(campaign: Campaign): string[] {
  const keys: string[] = [];
  const addNoteKeys = (notes: MapNote[] | undefined) => {
    for (const n of notes || []) {
      if (n.type === 'image') keys.push(`note_img_${n.id}`);
    }
  };
  for (const s of campaign.scenarios || []) {
    // Pre-floors campaigns keep the map on the scenario itself.
    keys.push(`map_img_${s.id}`);
    addNoteKeys(s.mapNotes);
    for (const f of s.floors || []) {
      keys.push(`map_img_${s.id}_${f.id}`);
      addNoteKeys(f.mapNotes);
    }
  }
  return keys;
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
  /** When set, the Add NPC modal opens in edit mode for this combatant. */
  const [editingNPC, setEditingNPC] = useState<Combatant | null>(null);
  const [playerScreenOpen, setPlayerScreenOpen] = useState(false);
  /** When true, the user is painting a new Dark Zone polygon. */
  const [darkZonePainting, setDarkZonePainting] = useState(false);
  const [difficultTerrainPainting, setDifficultTerrainPainting] = useState(false);
  /** When true, the user is in Paint Walls mode. */
  const [wallPainting, setWallPainting] = useState(false);
  /** When true, clicking a wall deletes it. */
  const [wallErasing, setWallErasing] = useState(false);
  /** When true, painted wall vertices snap to the nearest grid intersection. */
  const [wallSnapToGrid, setWallSnapToGrid] = useState(false);
  /** When non-null, the user is placing a new portal of this type by two-click span. */
  const [portalPlacementMode, setPortalPlacementMode] = useState<'door' | 'window' | null>(null);
  /** When true, the user is calibrating the map's grid (two-click opposite corners of one square). */
  const [gridCalibrating, setGridCalibrating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dicePopover, setDicePopover] = useState<{ sides: number; total: number; count: number; x: number; y: number } | null>(null);
  const diceRollerRef = useRef<HTMLDivElement>(null);
  // Dismiss the dice popover on any click outside the dice buttons. (Clicks on the
  // buttons themselves are ignored here so re-clicking a die accumulates instead of
  // closing — the button's own handler updates the running total.)
  useEffect(() => {
    if (!dicePopover) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (diceRollerRef.current?.contains(e.target as Node)) return;
      setDicePopover(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [dicePopover]);
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
  const [playerMode, setPlayerMode] = useState<'setup' | 'play'>('setup');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);

  // Image store readiness — opening the IndexedDB connection and migrating any
  // legacy localStorage entries. This no longer reads the images themselves, so
  // it finishes in milliseconds regardless of library size; the images for a
  // campaign are fetched when that campaign is opened.
  const [imageStoreReady, setImageStoreReady] = useState<boolean>(isImageStoreReady());
  /** Campaign whose images are being fetched, so the splash can show progress. */
  const [openingCampaignId, setOpeningCampaignId] = useState<string | null>(null);
  /** Initiative rolled but not yet committed — the roll modal is showing it. */
  const [initiativeDraft, setInitiativeDraft] = useState<{
    rolls: InitiativeRoll[];
    existing: Combatant[];
    isAddingToCombat: boolean;
  } | null>(null);
  useEffect(() => {
    if (imageStoreReady) return;
    let cancelled = false;
    initImageStore().finally(() => {
      if (!cancelled) setImageStoreReady(true);
    });
    return () => { cancelled = true; };
  }, [imageStoreReady]);

  // Campaign State — undoable so Ctrl+Z can revert any campaign change
  const [campaign, setCampaign, campaignHistory] = useUndoableState<Campaign | null>(null);
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

  // ── Global undo/redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) ──
  // Brief confirmation chip so the shortcut never feels like it did nothing
  const [undoToast, setUndoToast] = useState<{ text: string; key: number } | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndoToast = useCallback((text: string) => {
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast({ text, key: Date.now() });
    undoToastTimer.current = setTimeout(() => setUndoToast(null), 1400);
  }, []);

  // Start history fresh whenever a campaign is loaded, created, or switched —
  // undo should never step back to the splash screen or another campaign.
  useEffect(() => {
    campaignHistory.clear();
  }, [campaign?.id, campaignHistory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // One press = one step: ignore held-key auto-repeat so it can't
      // machine-gun through the whole history.
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      // Leave text fields alone so typing keeps its native undo
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!campaignRef.current) return;
      e.preventDefault();
      if (isUndo) {
        showUndoToast(campaignHistory.undo() ? 'Undone' : 'Nothing to undo');
      } else {
        showUndoToast(campaignHistory.redo() ? 'Redone' : 'Nothing to redo');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [campaignHistory, showUndoToast]);

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
  const startPlacingRef = useRef<((spell: { name: string; school?: string; effectRadius?: number; range?: number; shapeType?: 'point' | 'wall' | 'ring'; maxLength?: number; maxThickness?: number; blocksVision?: boolean; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean }, combatantId: string) => void) | null>(null);
  const startEnlargeReduceRef = useRef<((mode: 'enlarge' | 'reduce', casterId: string) => void) | null>(null);
  const startDrawingRef = useRef<((opts: { mode: 'persistent' | 'ephemeral' | 'eraser'; color: string; ownerId?: string }) => void) | null>(null);
  const cancelDrawingRef = useRef<(() => void) | null>(null);
  const clearDrawingSessionRef = useRef<(() => void) | null>(null);
  const setDrawingOptionsRef = useRef<((opts: { mode?: 'persistent' | 'ephemeral' | 'eraser'; color?: string }) => void) | null>(null);
  const startPingRef = useRef<((opts: { color: string }) => void) | null>(null);
  const cancelPingRef = useRef<(() => void) | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const PING_COLOR = '#fde047';
  const [dmDrawingMode, setDmDrawingMode] = useState<'off' | 'persistent' | 'eraser'>('off');
  const [dmDrawColor, setDmDrawColor] = useState<string>('#ffffff');
  const [dmColorPickerOpen, setDmColorPickerOpen] = useState(false);
  const dmColorPickerRef = useRef<HTMLDivElement | null>(null);
  const DM_DRAW_PALETTE = ['#ffffff', '#ef4444', '#f59e0b', '#facc15', '#22c55e', '#3b82f6'];
  const toggleDmDrawing = (mode: 'persistent' | 'eraser') => {
    if (dmDrawingMode === mode) {
      cancelDrawingRef.current?.();
      setDmDrawingMode('off');
    } else if (dmDrawingMode === 'off') {
      startDrawingRef.current?.({ mode, color: dmDrawColor, ownerId: 'dm' });
      setDmDrawingMode(mode);
    } else {
      setDrawingOptionsRef.current?.({ mode });
      setDmDrawingMode(mode);
    }
  };
  const pickDmDrawColor = (color: string) => {
    setDmDrawColor(color);
    setDmColorPickerOpen(false);
    if (dmDrawingMode === 'eraser') {
      setDrawingOptionsRef.current?.({ color, mode: 'persistent' });
      setDmDrawingMode('persistent');
    } else if (dmDrawingMode === 'persistent') {
      setDrawingOptionsRef.current?.({ color });
    }
  };
  useEffect(() => {
    if (!dmColorPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dmColorPickerRef.current && !dmColorPickerRef.current.contains(e.target as Node)) {
        setDmColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [dmColorPickerOpen]);
  const toggleDmPing = () => {
    if (isPinging) {
      cancelPingRef.current?.();
      setIsPinging(false);
    } else {
      if (dmDrawingMode !== 'off') {
        cancelDrawingRef.current?.();
        setDmDrawingMode('off');
      }
      startPingRef.current?.({ color: PING_COLOR });
      setIsPinging(true);
    }
  };
  const [enlargeReduceModal, setEnlargeReduceModal] = useState<{ casterId: string } | null>(null);
  const [activeCombatantId, setActiveCombatantId] = useState<string | null>(null);
  const activeCombatantIdRef = useRef(activeCombatantId);
  activeCombatantIdRef.current = activeCombatantId;

  // Player targeting — combatant IDs that players have tapped to target
  const [targetedCombatantIds, setTargetedCombatantIds] = useState<Set<string>>(new Set());

  // "View as Player" — when set, the DM map's fog (and the Player Screen's fog) is restricted to that player's vision.
  const [dmViewAsPlayerId, setDmViewAsPlayerId] = useState<string | null>(null);
  const dmViewAsPlayerIdRef = useRef(dmViewAsPlayerId);
  dmViewAsPlayerIdRef.current = dmViewAsPlayerId;
  useEffect(() => {
    try { window.electronAPI?.sendDMViewAsPlayer?.(dmViewAsPlayerId); } catch (_e) { /* */ }
  }, [dmViewAsPlayerId]);

  // Active emanation rings broadcast from the Player screen (so they render on the DM map too)
  const [playerEmanations, setPlayerEmanations] = useState<import('./types').ActiveEmanation[]>([]);

  // AoE highlights from MapView (for BottomPanel display)
  const [aoeHighlights, setAoeHighlights] = useState<{ affectedCombatantIds: string[]; saveResults: Record<string, any> | null; spellName?: string; saveAbility?: string; saveDc?: number; halfDamageOnSave?: boolean; spellDesc?: string; saveEffect?: string; condition?: string } | null>(null);
  const [spellDamageModal, setSpellDamageModal] = useState<{ spellName: string; saveAbility: string; saveDc: number; halfDamageOnSave: boolean; saveResults: Record<string, any>; damageType?: string; combatantTraits?: Record<string, { resistant: boolean; immune: boolean; vulnerable: boolean }> } | null>(null);
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

    const spellEntry = lookupSpell(aoeHighlights.spellName || '');
    const damageType = spellEntry?.damageType;

    const combatantTraits: Record<string, { resistant: boolean; immune: boolean; vulnerable: boolean }> = {};
    if (damageType) {
      const dt = damageType.toLowerCase();
      const hasType = (field: string | undefined) =>
        !!field && field.toLowerCase().split(/[;,]/).map(s => s.trim()).includes(dt);
      const scenario = campaign.scenarios.find(s => s.id === selectedScenarioId);
      const allCombatants = [
        ...(scenario?.combatants || []),
        ...(scenario?.activeCombatants || []),
        ...(campaign.persistentEnemies || []),
      ];
      for (const id of Object.keys(curr)) {
        const c = allCombatants.find(ac => ac.id === id || ac.sourceCombatantId === id);
        if (c) {
          combatantTraits[id] = {
            resistant: hasType(c.resistances),
            immune: hasType(c.immunities),
            vulnerable: hasType(c.vulnerabilities),
          };
        }
      }
    }

    setSpellDamageModal({
      spellName: aoeHighlights.spellName,
      saveAbility: aoeHighlights.saveAbility || '',
      saveDc: aoeHighlights.saveDc || 0,
      halfDamageOnSave: aoeHighlights.saveEffect === 'damage-auto' ? false : (aoeHighlights.halfDamageOnSave || false),
      saveResults: curr,
      damageType,
      combatantTraits,
    });
  }, [aoeHighlights?.saveResults]);

  // Persist panel open/closed states
  useEffect(() => {
    savePanelStates(leftSidebarOpen, navSidebarOpen);
  }, [leftSidebarOpen, navSidebarOpen]);

  // ── Campaign persistence ────────────────────────────────────────────────
  // Writing a campaign is not cheap: it rebuilds every scenario minus its
  // images, re-parses the whole saved-campaigns array, re-serialises it, and
  // writes it back synchronously. Campaign state changes as often as 20x a
  // second while a player drags a token on the table, so this runs on a
  // trailing debounce rather than on every change.
  //
  // The writer's maxWait bounds how much can be lost: a pure debounce would
  // never write at all during a long continuous drag, so a save is forced once
  // the oldest unsaved change reaches that age. Quitting, unmounting, leaving
  // to the campaign list, and switching campaigns all flush immediately.
  const writeCampaign = useCallback((c: Campaign) => {
    // Strip mapImage and note imageData from all scenarios/floors/notes before persisting the campaign JSON
    const lightCampaign = {
      ...c,
      scenarios: c.scenarios.map(s => {
        const { mapImage, ...rest } = s;
        return {
          ...rest,
          floors: rest.floors?.map(f => {
            const { mapImage: _fImg, ...fRest } = f;
            return {
              ...fRest,
              mapNotes: (fRest.mapNotes || []).map(n => {
                if (n.type !== 'image') return n;
                const { imageData: _img, ...nRest } = n;
                return nRest;
              }),
            };
          })
        };
      })
    };
    const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
    const index = savedCampaigns.findIndex((sc: Campaign) => sc.id === c.id);
    if (index >= 0) {
      savedCampaigns[index] = lightCampaign;
    } else {
      savedCampaigns.push(lightCampaign);
    }
    localStorage.setItem('dungeon_master_campaigns', JSON.stringify(savedCampaigns));
  }, []);

  // writeCampaign is stable, so this writer is created once and lives for the
  // life of the screen.
  const campaignWriterRef = useRef<DebouncedWriter<Campaign> | null>(null);
  if (campaignWriterRef.current === null) {
    campaignWriterRef.current = createDebouncedWriter<Campaign>(
      c => writeCampaign(c),
      {
        debounceMs: 500,
        maxWaitMs: 2000,
        // Never let a campaign switch swallow the previous one's last edits.
        sameTarget: (pending, next) => pending.id === next.id,
      },
    );
  }

  /** Write any pending campaign immediately and cancel the scheduled save. */
  const flushCampaignSave = useCallback(() => {
    campaignWriterRef.current?.flush();
  }, []);

  // Map images live in IndexedDB, not localStorage, to avoid the ~5–10MB
  // localStorage quota that silently kills uploads past ~12 floors of maps.
  // setImage ignores writes whose contents haven't changed, so this sweep is
  // just a cache lookup per floor except when an image is actually new.
  useEffect(() => {
    if (!campaign) return;
    for (const s of campaign.scenarios) {
      if (s.floors) {
        for (const f of s.floors) {
          if (f.mapImage) {
            setImage(`map_img_${s.id}_${f.id}`, f.mapImage);
          }
          // Note images on this floor
          for (const n of f.mapNotes || []) {
            if (n.type === 'image' && n.imageData) {
              setImage(`note_img_${n.id}`, n.imageData);
            }
          }
        }
      }
      // Legacy fallback for non-migrated scenarios
      if (s.mapImage && !s.floors) {
        setImage(`map_img_${s.id}`, s.mapImage);
      }
    }
  }, [campaign]);

  // Schedule the debounced campaign JSON write.
  useEffect(() => {
    if (!campaign) {
      // Leaving to the campaign list. This screen doesn't unmount when the
      // splash takes over, so commit now: the splash rewrites this same
      // saved-campaigns array when deleting, and a write landing after that
      // would re-add a campaign the user had just deleted.
      campaignWriterRef.current?.flush();
      return;
    }
    campaignWriterRef.current?.schedule(campaign);
  }, [campaign]);

  // Never lose the tail of a session: commit on quit and on unmount.
  useEffect(() => {
    window.addEventListener('beforeunload', flushCampaignSave);
    return () => {
      window.removeEventListener('beforeunload', flushCampaignSave);
      flushCampaignSave();
    };
  }, [flushCampaignSave]);

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
            // Re-broadcast the current "View as Player" selection so a freshly
            // opened player window picks up state set before it existed.
            try { window.electronAPI?.sendDMViewAsPlayer?.(dmViewAsPlayerIdRef.current); } catch (_e) { /* */ }
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
            tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, color } : t),
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

  useEffect(() => {
    if (!window.electronAPI?.onPlayerSummonCombatant) return;
    window.electronAPI.onPlayerSummonCombatant(({ combatant, tokenId }) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s => {
            if (s.id !== selectedScenarioIdRef.current) return s;
            return {
              ...s,
              combatants: [...(s.combatants || []), combatant],
              tokens: s.tokens.map(t => t.id === tokenId ? { ...t, combatantId: combatant.id } : t),
            };
          }),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerSummonCombatantListener?.(); };
  }, []);

  // Listen for image-note rotation from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerImageRotation) return;
    window.electronAPI.onPlayerImageRotation(({ noteId, rotation }) => {
      setCampaign(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s => ({
            ...s,
            floors: s.floors?.map(f => ({
              ...f,
              mapNotes: (f.mapNotes || []).map(n => n.id === noteId ? { ...n, imageRotation: rotation } : n),
            })),
          })),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerImageRotationListener?.(); };
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
    // A fresh campaign has no stored images, so anything still cached belongs
    // to a campaign that was open earlier this session.
    releaseImagesExcept([]);
    setCampaign(newCampaign);
    setSelectedScenarioId(newCampaign.scenarios[0].id);
  };

  const handleSelectCampaign = async (selected: Campaign) => {
    // Pull this campaign's images into the cache before rehydrating below —
    // the rehydration reads them synchronously via getImage. Startup no longer
    // loads every image in every campaign, so this is where they arrive now.
    setOpeningCampaignId(selected.id);
    try {
      const keys = campaignImageKeys(selected);
      await loadImages(keys);
      // Anything held for a previously-opened campaign is dead weight now.
      releaseImagesExcept(keys);
    } finally {
      setOpeningCampaignId(null);
    }

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
          const legacyMapImage = s.mapImage || getImage(`map_img_${s.id}`) || undefined;
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
          // Migrate to image store
          if (legacyMapImage) {
            setImage(`map_img_${s.id}_${defaultFloorId}`, legacyMapImage);
          }
          // Set floorId on all existing tokens
          for (const t of scenario.tokens) {
            if (!t.floorId) t.floorId = defaultFloorId;
          }
        } else {
          // Rehydrate floor map images and note images from separate storage
          scenario.floors = scenario.floors.map(f => ({
            ...f,
            mapImage: f.mapImage || getImage(`map_img_${s.id}_${f.id}`) || undefined,
            mapNotes: (f.mapNotes || []).map(n => {
              if (n.type !== 'image') return n;
              return {
                ...n,
                imageData: n.imageData || getImage(`note_img_${n.id}`) || undefined,
              };
            }),
          }));
          if (!scenario.activeFloorId) {
            scenario.activeFloorId = scenario.floors[0]?.id;
          }
        }

        // Two note types are gone from saved campaigns:
        //   'sound'  — the sound feature was removed; drop those pins entirely,
        //              along with the floor-level ambient/zone fields left behind,
        //              so nothing lingers as an iconless note or a dead JSON key.
        //   'poison' — the skull slot became the d20 'check' note. Convert rather
        //              than drop, so any text on an old skull pin survives.
        // Audio files on disk are left untouched.
        const retypeNotes = (notes: MapNote[]) => notes
          .filter(n => (n.type as string) !== 'sound')
          .map(n => (n.type as string) === 'poison' ? { ...n, type: 'check' as const } : n);

        scenario.floors = (scenario.floors || []).map(f => {
          const { ambientSoundId, ambientVolume, soundZones, ...rest } =
            f as Floor & { ambientSoundId?: string; ambientVolume?: number; soundZones?: unknown[] };
          void ambientSoundId; void ambientVolume; void soundZones;
          return { ...rest, mapNotes: retypeNotes(rest.mapNotes || []) };
        });
        scenario.mapNotes = retypeNotes(scenario.mapNotes || []);

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

  const toggleDisplayImageNote = useCallback((noteId: string) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s =>
          s.id === selectedScenarioIdRef.current
            ? { ...s, displayedImageNoteId: s.displayedImageNoteId === noteId ? null : noteId }
            : s
        ),
      };
    });
  }, []);

  const setImageNoteRotation = useCallback((noteId: string, rotation: number) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          return {
            ...s,
            floors: s.floors?.map(f => ({
              ...f,
              mapNotes: (f.mapNotes || []).map(n => n.id === noteId ? { ...n, imageRotation: rotation } : n),
            })),
          };
        }),
      };
    });
  }, []);

  const updateViewpoints = useCallback((viewpoints: Viewpoint[]) => {
    updateActiveFloor(f => ({ ...f, viewpoints }));
  }, [updateActiveFloor]);

  const moveAllPlayersHere = useCallback((x: number, y: number, floorId: string, spacingPx: number) => {
    setCampaign(prev => {
      if (!prev) return prev;
      let idx = 0;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          const updatedTokens = s.tokens.map(t => {
            if (t.type !== 'player' || t.hidden) return t;
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            idx++;
            return { ...t, floorId, x: x + (col - 0.5) * spacingPx, y: y + (row - 0.5) * spacingPx };
          });
          return { ...s, tokens: updatedTokens };
        }),
      };
    });
  }, []);

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

  const addConditionToCombatant = useCallback((sourceCombatantId: string, condition: string) => {
    setCampaign(prev => {
      if (!prev) return prev;
      const addTo = (list: Combatant[]) =>
        list.map(c => {
          if (c.id !== sourceCombatantId && c.sourceCombatantId !== sourceCombatantId) return c;
          const current = new Set(c.conditions || []);
          current.add(condition);
          return { ...c, conditions: Array.from(current) };
        });
      return {
        ...prev,
        players: addTo(prev.players),
        npcs: addTo(prev.npcs),
        persistentEnemies: addTo(prev.persistentEnemies),
        scenarios: prev.scenarios.map(s => ({
          ...s,
          combatants: addTo(s.combatants || []),
          activeCombatants: addTo(s.activeCombatants || []),
        })),
      };
    });
  }, []);

  const removeConditionFromCombatant = useCallback((sourceCombatantId: string, condition: string) => {
    setCampaign(prev => {
      if (!prev) return prev;
      const removeFrom = (list: Combatant[]) =>
        list.map(c =>
          c.id === sourceCombatantId || c.sourceCombatantId === sourceCombatantId
            ? { ...c, conditions: (c.conditions || []).filter(cd => cd !== condition) }
            : c
        );
      return {
        ...prev,
        players: removeFrom(prev.players),
        npcs: removeFrom(prev.npcs),
        persistentEnemies: removeFrom(prev.persistentEnemies),
        scenarios: prev.scenarios.map(s => ({
          ...s,
          combatants: removeFrom(s.combatants || []),
          activeCombatants: removeFrom(s.activeCombatants || []),
        })),
      };
    });
  }, []);

  /** Update a combatant's HP by delta across every list it lives in (campaign-level
   *  players/npcs/persistentEnemies, scenario combatants, and active combat copies). */
  const updateCombatantHp = useCallback((sourceCombatantId: string, delta: number) => {
    setCampaign(prev => {
      if (!prev) return prev;
      const applyHp = (c: Combatant) =>
        ({ ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) });
      const applyToList = (list: Combatant[]) =>
        list.map(c => c.id === sourceCombatantId ? applyHp(c) : c);
      return {
        ...prev,
        players: applyToList(prev.players),
        npcs: applyToList(prev.npcs),
        persistentEnemies: applyToList(prev.persistentEnemies),
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          const updatedActive = (s.activeCombatants || []).map(ac =>
            ac.sourceCombatantId === sourceCombatantId ? applyHp(ac) : ac
          );
          return { ...s, combatants: applyToList(s.combatants || []), activeCombatants: updatedActive };
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

  const updateWalls = useCallback((walls: WallSegment[]) => {
    updateActiveFloor(f => ({ ...f, walls }));
  }, [updateActiveFloor]);

  const updateWallsAndPortals = useCallback((walls: WallSegment[], portals: Portal[]) => {
    updateActiveFloor(f => ({ ...f, walls, portals }));
  }, [updateActiveFloor]);

  const updatePortals = useCallback((portals: Portal[]) => {
    updateActiveFloor(f => ({ ...f, portals }));
  }, [updateActiveFloor]);

  const updateGridResolution = useCallback((gr: GridResolution) => {
    updateActiveFloor(f => ({ ...f, gridResolution: gr }));
  }, [updateActiveFloor]);

  const togglePortal = useCallback((portalId: string) => {
    updateActiveFloor(f => ({
      ...f,
      portals: f.portals?.map(p =>
        p.id === portalId && !p.locked ? { ...p, closed: !p.closed } : p
      )
    }));
  }, [updateActiveFloor]);

  const changePortalType = useCallback((portalId: string, type: 'door' | 'window' | 'secret', locked?: boolean) => {
    updateActiveFloor(f => ({
      ...f,
      portals: f.portals?.map(p =>
        p.id === portalId ? { ...p, portalType: type, locked: !!locked, closed: locked ? true : p.closed } : p
      )
    }));
  }, [updateActiveFloor]);

  // Listen for portal toggle from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerPortalToggle) return;
    window.electronAPI.onPlayerPortalToggle((portalId) => {
      // Skip the full campaign rebroadcast — the Player screen already
      // applied this change optimistically, so re-sending it just adds latency.
      skipStateBroadcastRef.current = true;
      togglePortal(portalId);
    });
    return () => { window.electronAPI?.removePlayerPortalToggleListener?.(); };
  }, [togglePortal]);

  // Listen for floor change from the Player screen (e.g. transition zone use)
  useEffect(() => {
    if (!window.electronAPI?.onPlayerFloorChange) return;
    window.electronAPI.onPlayerFloorChange((floorId) => {
      // Player already applied this optimistically — skip the rebroadcast.
      skipStateBroadcastRef.current = true;
      setActiveFloorId(floorId);
    });
    return () => { window.electronAPI?.removePlayerFloorChangeListener?.(); };
  }, [setActiveFloorId]);

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

  // Listen for active emanation rings from the Player screen
  useEffect(() => {
    if (!window.electronAPI?.onPlayerEmanationsUpdate) return;
    window.electronAPI.onPlayerEmanationsUpdate((emanations: any) => {
      setPlayerEmanations(Array.isArray(emanations) ? emanations : []);
    });
    return () => { window.electronAPI?.removePlayerEmanationsUpdateListener?.(); };
  }, []);

  // Listen for drawings from the Player screen (per-floor)
  useEffect(() => {
    if (!window.electronAPI?.onPlayerDrawingsUpdate) return;
    window.electronAPI.onPlayerDrawingsUpdate(({ floorId, drawings }: { floorId: string; drawings: any[] }) => {
      setCampaign(prev => {
        const scenarioId = selectedScenarioIdRef.current;
        if (!prev || !scenarioId) return prev;
        return {
          ...prev,
          scenarios: prev.scenarios.map(s =>
            s.id === scenarioId
              ? { ...s, floors: s.floors?.map(f => f.id === floorId ? { ...f, drawings } : f) }
              : s
          ),
        };
      });
    });
    return () => { window.electronAPI?.removePlayerDrawingsUpdateListener?.(); };
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

  /**
   * Promote an Extra token into a real Combatant. Keeps the token's avatar (the Extra's face)
   * and replaces everything else with the chosen monster's statblock. After this the token has
   * a combatantId, can be hit in combat, etc.
   */
  const promoteExtra = useCallback((tokenId: string, monster: Monster, opts: { combatantType: 'enemy' | 'npc'; size: string }) => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newCombatantId = `${opts.combatantType === 'enemy' ? 'e' : 'n'}-${uniqueId}`;
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          const targetToken = s.tokens.find(t => t.id === tokenId);
          if (!targetToken) return s;
          const newCombatant: Combatant = {
            id: newCombatantId,
            name: targetToken.name,
            hp: monster.hp,
            maxHp: monster.hp,
            ac: monster.ac,
            initiative: 0,
            type: opts.combatantType,
            description: monster.description,
            stats: monster.stats,
            actions: monster.actions,
            avatar: targetToken.avatar,
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
            size: opts.size,
          };
          return {
            ...s,
            tokens: s.tokens.map(t => t.id === tokenId
              ? {
                  ...t,
                  combatantId: newCombatantId,
                  type: opts.combatantType,
                  color: opts.combatantType === 'enemy' ? '#ef4444' : '#059669',
                  size: opts.size as Token['size'],
                  isExtra: undefined,
                  extraId: undefined,
                }
              : t
            ),
            combatants: [...(s.combatants || []), newCombatant],
          };
        }),
      };
    });
  }, []);

  const addSummonCombatant = useCallback((combatant: Combatant, tokenId: string) => {
    setCampaign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenarios: prev.scenarios.map(s => {
          if (s.id !== selectedScenarioIdRef.current) return s;
          return {
            ...s,
            combatants: [...(s.combatants || []), combatant],
            tokens: s.tokens.map(t => t.id === tokenId ? { ...t, combatantId: combatant.id } : t),
          };
        }),
      };
    });
  }, []);

  const handleViewportCenter = useCallback((center: { x: number; y: number }) => {
    dmViewportCenterRef.current = center;
  }, []);

  // --- End stable callbacks ---

  const currentScenario = useMemo(() => {
    if (!campaign || !selectedScenarioId) return null;
    return campaign.scenarios.find(s => s.id === selectedScenarioId) || campaign.scenarios[0];
  }, [campaign, selectedScenarioId]);

  // Drop the target as soon as its monster dies. The corpse stays on the board
  // with a death marker, so without this the reticle sat on it indefinitely —
  // and since only one thing can be targeted at a time, targeting the next
  // monster would leave two reticles on the table. This also clears the
  // "Targeted" badge the dead combatant kept in the initiative list.
  //
  // The DM is the authority on HP, so pruning here; the player screen picks it
  // up from the state broadcast that already carries targetedCombatantIds.
  useEffect(() => {
    if (targetedCombatantIds.size === 0) return;
    // Same set of sources, and the same id-or-sourceId matching, that MapView
    // uses to decide which tokens are dead — keep them in step or a target can
    // outlive the death marker drawn on the very same token.
    const pool = [
      ...(currentScenario?.activeCombatants || []),
      ...(currentScenario?.combatants || []),
      ...(campaign?.players || []),
      ...(campaign?.npcs || []),
      ...(campaign?.persistentEnemies || []),
    ];
    const survivors = new Set<string>();
    for (const id of targetedCombatantIds) {
      const c = pool.find(x => x.id === id || x.sourceCombatantId === id);
      // Only drop what is known to be dead — an id we can't resolve stays put.
      if (!c || c.hp > 0) survivors.add(id);
    }
    if (survivors.size === targetedCombatantIds.size) return;
    setTargetedCombatantIds(survivors);
  }, [targetedCombatantIds, currentScenario, campaign?.players, campaign?.npcs, campaign?.persistentEnemies]);

  const activeFloor = useMemo(() => {
    if (!currentScenario?.floors) return null;
    return currentScenario.floors.find(f => f.id === activeFloorId) || currentScenario.floors[0] || null;
  }, [currentScenario, activeFloorId]);

  if (!imageStoreReady) {
    return <div className="fixed inset-0 bg-[var(--bg)]" />;
  }

  if (!campaign) {
    return (
      <SplashScreen
        onSelectCampaign={handleSelectCampaign}
        onCreateCampaign={handleCreateCampaign}
        openingCampaignId={openingCampaignId}
      />
    );
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
    // Sync HP back to source combatants (campaign players/npcs/persistentEnemies and
    // scenario combatants) so damage taken in combat persists outside it
    const syncHp = (list: Combatant[]) =>
      list.map(c => {
        const active = activeCombatants.find(ac => ac.sourceCombatantId === c.id);
        return active ? { ...c, hp: active.hp } : c;
      });
    setCampaign(prev => prev ? ({
      ...prev,
      players: syncHp(prev.players),
      npcs: syncHp(prev.npcs),
      persistentEnemies: syncHp(prev.persistentEnemies),
      scenarios: prev.scenarios.map(s => {
        if (s.id !== selectedScenarioId) return s;
        return { ...s, activeCombatants, combatants: syncHp(s.combatants || []) };
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
    const condition = spellConditionModal?.condition;
    if (!condition || applyToIds.length === 0) return;
    const idSet = new Set(applyToIds);
    setCampaign(prev => {
      if (!prev) return prev;
      const applyToList = (list: Combatant[]) =>
        list.map(c => {
          if (!idSet.has(c.id) && !idSet.has(c.sourceCombatantId || '')) return c;
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
          combatants: applyToList(s.combatants || []),
          activeCombatants: applyToList(s.activeCombatants || []),
        })),
      };
    });
    cancelCastingRef.current?.();
    clearRemoteAoeRef.current?.();
    window.electronAPI?.sendDismissPlayerAoe?.();
    setAoeHighlights(null);
    setSpellConditionModal(null);
  };

  /**
   * Roll initiative for the selected tokens and stage the result for review.
   * Nothing enters the tracker until the DM confirms in the modal, so rolls can
   * be replaced with a player's own before combat begins.
   */
  const startCombat = (tokenIds: string[]) => {
    if (!currentScenario) return;

    const selectedTokens = currentScenario.tokens.filter(t => tokenIds.includes(t.id));
    const currentActive = [...(currentScenario.activeCombatants || [])];

    // Creatures already in the fight seed the name groups, so a goblin joining
    // mid-combat lands on the initiative its packmates are already using.
    const seeded = new Map<string, number>();
    for (const c of currentActive) {
      if (c.type !== 'player' && c.name) seeded.set(c.name, c.initiative);
    }

    const entrants: Combatant[] = [];
    for (const token of selectedTokens) {
      // The token id keys the tracker entry, so several copies of one monster
      // can be in combat at once.
      const combatantTrackerId = `combat-${token.id}`;
      if (currentActive.some(c => c.id === combatantTrackerId)) continue;

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

      entrants.push(baseCombatant
        ? { ...baseCombatant, id: combatantTrackerId, sourceCombatantId: baseCombatant.id }
        // Fallback for a token with no combatant record behind it.
        : { id: combatantTrackerId, name: token.name, type: token.type, hp: 10, maxHp: 10, ac: 10, initiative: 0 });
    }

    if (entrants.length === 0) return;
    setInitiativeDraft({
      rolls: rollInitiativeFor(entrants, { seeded }),
      existing: currentActive,
      isAddingToCombat: currentActive.length > 0,
    });
  };

  /** Commit the staged rolls, with any overrides the DM typed in. */
  const confirmInitiative = (totals: Record<string, number>) => {
    if (!initiativeDraft) return;
    const entering = initiativeDraft.rolls.map(r => ({
      ...r.combatant,
      initiative: totals[r.combatant.id] ?? r.total,
    }));
    updateActiveCombatants([...initiativeDraft.existing, ...entering]);
    setInitiativeDraft(null);
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
                  <div key={p.id} className="flex items-center gap-3 px-1 py-1 rounded-lg transition-all group hover:bg-white/5">
                    <button
                      onClick={() => {
                        const token = currentScenario?.tokens?.find(t => t.combatantId === p.id);
                        if (token) {
                          setPanToNote({ id: '_pan', type: 'warning', content: '', x: token.x, y: token.y });
                        }
                      }}
                      className="flex items-center gap-5 flex-1 min-w-0 text-left"
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCampaign(prev => prev ? ({ ...prev, players: prev.players.filter(pl => pl.id !== p.id) }) : prev);
                      }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-2 text-white transition-opacity shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
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
                  <div key={n.id} className="flex items-center gap-3 px-1 py-1 rounded-lg transition-all group">
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 overflow-hidden"
                        style={{
                          background: n.avatar ? 'transparent' : 'rgba(0,0,0,0.2)',
                          border: n.avatar ? 'none' : '1px solid rgba(var(--line-rgb, 255,255,255), 0.3)',
                          outline: n.avatar ? `2px solid ${n.color || 'var(--accent)'}` : 'none',
                          outlineOffset: n.avatar ? '2px' : undefined,
                        }}
                      >
                        {n.avatar
                          ? <img src={n.avatar} alt={n.name} className="w-full h-full object-cover" />
                          : n.name[0]
                        }
                      </div>
                      <span className="text-[16px] font-medium opacity-90 group-hover:opacity-100 truncate tracking-wide text-white">{n.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingNPC(n);
                        setAddNPCModalOpen(true);
                      }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-2 text-white transition-opacity shrink-0"
                      title="Edit NPC"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCampaign(prev => prev ? ({ ...prev, npcs: prev.npcs.filter(npc => npc.id !== n.id) }) : prev);
                      }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-2 text-white transition-opacity shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
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
                      {campaign.scenarios.length > 1 && (
                        <button
                          onClick={() => {
                            setConfirmDialog({
                              message: `Delete scenario "${s.name}"? This will also remove all of its floors, maps, and tokens.`,
                              onConfirm: () => {
                                // Clean up persisted images for every floor + image note in this scenario
                                for (const f of s.floors || []) {
                                  removeImage(`map_img_${s.id}_${f.id}`);
                                  for (const n of f.mapNotes || []) {
                                    if (n.type === 'image') removeImage(`note_img_${n.id}`);
                                  }
                                }
                                // Legacy single-map key
                                removeImage(`map_img_${s.id}`);

                                setCampaign(prev => {
                                  if (!prev) return prev;
                                  const remaining = prev.scenarios.filter(sc => sc.id !== s.id);
                                  if (selectedScenarioId === s.id) {
                                    setSelectedScenarioId(remaining[0]?.id || null);
                                  }
                                  return { ...prev, scenarios: remaining };
                                });
                              }
                            });
                          }}
                          className="p-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-red-400"
                          title="Delete scenario"
                        >
                          <X size={12} />
                        </button>
                      )}
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
        <header className="border-b border-[var(--line)] bg-[var(--surface)] px-4 flex items-center h-14 shrink-0 z-20">
          <div className="flex items-center gap-4 flex-1">
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

          {/* Centered dice roller */}
          <div className="flex items-center gap-1">
            <div ref={diceRollerRef} className="flex items-center gap-1">
            {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
              <button
                key={sides}
                onClick={(e) => {
                  const roll = Math.floor(Math.random() * sides) + 1;
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = rect.left + rect.width / 2;
                  const y = rect.bottom;
                  // Clicking the same die again adds another roll to the running total;
                  // a different die (or a fresh popover) starts over.
                  setDicePopover(prev =>
                    prev && prev.sides === sides
                      ? { ...prev, total: prev.total + roll, count: prev.count + 1 }
                      : { sides, total: roll, count: 1, x, y }
                  );
                }}
                className="px-2.5 py-1 rounded text-xs font-bold font-mono tracking-tight hover:bg-white/10 transition-colors text-white/50 hover:text-[var(--accent)]"
              >
                d{sides}
              </button>
            ))}
            </div>
            <div className="w-px h-4 bg-white/10 mx-1" />
            <div className="relative" ref={dmColorPickerRef}>
              <button
                onClick={() => setDmColorPickerOpen(o => !o)}
                title="Pencil color"
                className="p-1 rounded hover:bg-white/10 transition-colors flex items-center"
              >
                <span
                  className="block w-3 h-3 rounded-full border border-white/30"
                  style={{ background: dmDrawColor }}
                />
              </button>
              {dmColorPickerOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 flex items-center gap-1 p-1.5 rounded-md bg-[#1a1714] border border-white/15 shadow-lg">
                  {DM_DRAW_PALETTE.map(c => (
                    <button
                      key={c}
                      onClick={() => pickDmDrawColor(c)}
                      title={c}
                      className={cn(
                        'w-5 h-5 rounded-full border transition-all',
                        dmDrawColor === c
                          ? 'border-white scale-110 ring-2 ring-white/30'
                          : 'border-white/30 hover:border-white/60'
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => toggleDmDrawing('persistent')}
              title={dmDrawingMode === 'persistent' ? 'Stop drawing' : 'Draw on map'}
              className={cn(
                "p-1.5 rounded transition-colors",
                dmDrawingMode === 'persistent'
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/10 text-white/50 hover:text-[var(--accent)]"
              )}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => toggleDmDrawing('eraser')}
              title={dmDrawingMode === 'eraser' ? 'Stop erasing' : 'Erase drawings'}
              className={cn(
                "p-1.5 rounded transition-colors",
                dmDrawingMode === 'eraser'
                  ? "bg-rose-500/20 text-rose-300"
                  : "hover:bg-white/10 text-white/50 hover:text-[var(--accent)]"
              )}
            >
              <Eraser size={14} />
            </button>
            <button
              onClick={toggleDmPing}
              title={isPinging ? 'Cancel ping' : 'Ping a location on the map'}
              className={cn(
                "p-1.5 rounded transition-colors",
                isPinging
                  ? "bg-yellow-500/20 text-yellow-300"
                  : "hover:bg-white/10 text-white/50 hover:text-[var(--accent)]"
              )}
            >
              <Disc2 size={14} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
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
        {portalPlacementMode && (
          <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[150] bg-[#1a1512] border border-blue-400/50 rounded-md px-4 py-2 shadow-xl flex items-center gap-3 pointer-events-auto">
            <span className="text-xs">
              Adding <strong>{portalPlacementMode}</strong> — click on a wall where it starts, then click where it ends.
            </span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-black/40">Esc</kbd>
            <button
              className="text-[10px] opacity-60 hover:opacity-100 ml-1"
              onClick={() => setPortalPlacementMode(null)}
            >
              exit
            </button>
          </div>
        )}
        {gridCalibrating && (
          <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[150] bg-[#1a1512] border border-yellow-400/50 rounded-md px-4 py-2 shadow-xl flex items-center gap-3 pointer-events-auto">
            <span className="text-xs">
              <strong>Calibrating grid</strong> — drag the Bandit and resize it to match one grid square on your map. Click Apply when it looks right.
            </span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-black/40">Esc</kbd>
            <span className="text-[10px] opacity-60">cancel</span>
          </div>
        )}

        {/* Dice roll popover */}
        {dicePopover && (
          <div
            className="fixed z-[61] bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-xl px-4 py-2.5 text-center pointer-events-none"
            style={{ left: dicePopover.x, top: dicePopover.y + 8, transform: 'translateX(-50%)' }}
          >
            <div className="text-2xl font-bold text-[var(--accent)]">{dicePopover.total}</div>
            {dicePopover.count > 1 && (
              <div className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-[#1a1512] text-[10px] font-bold flex items-center justify-center shadow">
                {dicePopover.count}
              </div>
            )}
          </div>
        )}

        {/* Undo/redo confirmation chip */}
        <AnimatePresence>
          {undoToast && (
            <motion.div
              key={undoToast.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] bg-[#1a1512] border border-[var(--accent)]/40 rounded-full px-3.5 py-1.5 shadow-xl text-xs pointer-events-none"
            >
              {undoToast.text}
            </motion.div>
          )}
        </AnimatePresence>

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
                showTokenNames={campaign.showTokenNames !== false}
                onUpdateCombatantHp={updateCombatantHp}
                onAddCondition={addConditionToCombatant}
                onRemoveCondition={removeConditionFromCombatant}
                onAddEnemy={addEnemyToMap}
                onAddSummonCombatant={addSummonCombatant}
                onPromoteExtra={promoteExtra}
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
                activeEmanations={playerEmanations}
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
                onDrawingsChange={(floorId, nextDrawings) => {
                  updateFloorById(floorId, f => ({ ...f, drawings: nextDrawings }));
                  try { window.electronAPI?.sendDMDrawingsUpdate?.({ floorId, drawings: nextDrawings }); } catch (_e) { /* */ }
                }}
                onWallDataChange={updateWallData}
                onPortalToggle={togglePortal}
                onPortalTypeChange={changePortalType}
                onViewportCenter={handleViewportCenter}
                onDarknessLevelChange={updateDarknessLevel}
                clearMovementPathsRef={clearMovementPathsRef}
                clearRemoteAoeRef={clearRemoteAoeRef}
                cancelCastingRef={cancelCastingRef}
                startEnlargeReduceRef={startEnlargeReduceRef}
                startDrawingRef={startDrawingRef}
                cancelDrawingRef={cancelDrawingRef}
                clearDrawingSessionRef={clearDrawingSessionRef}
                setDrawingOptionsRef={setDrawingOptionsRef}
                startPingRef={startPingRef}
                cancelPingRef={cancelPingRef}
                onPingDrop={(opts) => {
                  setIsPinging(false);
                  try { window.electronAPI?.sendDMPing?.({ floorId: opts.floorId, x: opts.x, y: opts.y, color: opts.color }); } catch (_e) { /* */ }
                }}
                onAoeHighlightsChange={setAoeHighlights}
                activeCombatantId={activeCombatantId}
                targetedCombatantIds={targetedCombatantIds}
                onTransitionZonesChange={(zones: TransitionZone[]) => updateActiveFloor(f => ({ ...f, transitionZones: zones }))}
                onSwitchFloor={setActiveFloorId}
                onUpdateFloorById={updateFloorById}
                onMoveAllPlayersHere={moveAllPlayersHere}
                onDarkZonesChange={(floorId, zones) => updateFloorById(floorId, f => ({ ...f, darkZones: zones }))}
                darkZonePainting={darkZonePainting}
                onStartDarkZonePainting={() => {
                  setDifficultTerrainPainting(false);
                  setDarkZonePainting(true);
                }}
                onDarkZonePaintCommit={(points) => {
                  if (!activeFloorId) return;
                  const newZone: DarkZone = {
                    id: `dz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    points,
                  };
                  updateFloorById(activeFloorId, f => ({
                    ...f,
                    darkZones: [...(f.darkZones || []), newZone],
                  }));
                  // Stay in paint mode so additional dark zones can be drawn; the DM
                  // exits via right-click, Esc, or the cancel button.
                }}
                onDarkZonePaintCancel={() => setDarkZonePainting(false)}
                onDifficultTerrainChange={(floorId, zones) => updateFloorById(floorId, f => ({ ...f, difficultTerrain: zones }))}
                difficultTerrainPainting={difficultTerrainPainting}
                onStartDifficultTerrainPainting={() => {
                  setDarkZonePainting(false);
                  setDifficultTerrainPainting(false);
                  setWallPainting(false);
                  setWallErasing(false);
                  setPortalPlacementMode(null);
                  setGridCalibrating(false);
                  setDifficultTerrainPainting(true);
                }}
                onDifficultTerrainPaintCommit={(points) => {
                  if (!activeFloorId) return;
                  const newZone: DifficultTerrainZone = {
                    id: `dt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    points,
                  };
                  updateFloorById(activeFloorId, f => ({
                    ...f,
                    difficultTerrain: [...(f.difficultTerrain || []), newZone],
                  }));
                  // Stay in paint mode so additional areas can be drawn; the DM
                  // exits via right-click, Esc, or the cancel button.
                }}
                onDifficultTerrainPaintCancel={() => setDifficultTerrainPainting(false)}
                wallPainting={wallPainting}
                wallErasing={wallErasing}
                wallSnapToGrid={wallSnapToGrid}
                onStartWallPainting={() => {
                  setWallErasing(false);
                  setDarkZonePainting(false);
                  setDifficultTerrainPainting(false);
                  setWallPainting(true);
                }}
                onStopWallPainting={() => setWallPainting(false)}
                onToggleWallErasing={() => {
                  setWallPainting(false);
                  setWallErasing(v => !v);
                }}
                onToggleWallSnapToGrid={() => setWallSnapToGrid(v => !v)}
                onWallsChange={updateWalls}
                portalPlacementMode={portalPlacementMode}
                onStartPortalPlacement={(mode) => {
                  setWallPainting(false);
                  setWallErasing(false);
                  setDarkZonePainting(false);
                  setDifficultTerrainPainting(false);
                  setPortalPlacementMode(mode);
                }}
                onStopPortalPlacement={() => setPortalPlacementMode(null)}
                onPortalsChange={updatePortals}
                onWallsAndPortalsChange={updateWallsAndPortals}
                gridCalibrating={gridCalibrating}
                onStartGridCalibration={() => {
                  setWallPainting(false);
                  setWallErasing(false);
                  setPortalPlacementMode(null);
                  setDarkZonePainting(false);
                  setDifficultTerrainPainting(false);
                  setGridCalibrating(true);
                }}
                onStopGridCalibration={() => setGridCalibrating(false)}
                onGridResolutionChange={(gr) => {
                  updateGridResolution(gr);
                  setGridCalibrating(false);
                }}
                dmViewAsPlayerId={dmViewAsPlayerId}
              />
            )}
          </main>

          {/* Left Sidebar: Notes (overlay). The slide-out distance below must
              match the panel width, or a sliver stays on screen when closed. */}
          <motion.aside
            initial={false}
            animate={{ x: leftSidebarOpen ? 0 : -420 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 w-[420px] bg-[var(--surface)] border-r border-[var(--line)] z-[45] overflow-hidden"
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
                  displayedImageNoteId={currentScenario.displayedImageNoteId ?? null}
                  onToggleDisplayImage={toggleDisplayImageNote}
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
              selectedTokenId={selectedTokenId}
              onSelectedTokenIdChange={setSelectedTokenId}
              onSelectedTokenIdsChange={setSelectedTokenIds}
              onUpdateCombatantHp={updateCombatantHp}
              onRemoveCondition={removeConditionFromCombatant}
              onAddCondition={addConditionToCombatant}
              startCastingRef={startCastingRef}
              startPlacingRef={startPlacingRef}
              onExceptionSpellCast={(spellName, casterId) => {
                if (spellName === 'Enlarge/Reduce') setEnlargeReduceModal({ casterId });
              }}
              targetedCombatantIds={targetedCombatantIds}
              wildShapeState={wildShapeState}
              dmViewAsPlayerId={dmViewAsPlayerId}
              onToggleViewAsPlayer={(playerId) => setDmViewAsPlayerId(prev => prev === playerId ? null : playerId)}
              onSetViewAsPlayer={(playerId) => setDmViewAsPlayerId(playerId)}
              onRefreshPlayer={async (playerId) => {
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
                  const newAvatar = parsed.avatar ?? prev.players.find(p => p.id === playerId)?.avatar;
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
                      initiativeBonus: parsed.initiativeBonus ?? p.initiativeBonus,
                      initiativeAdvantage: parsed.initiativeAdvantage ?? p.initiativeAdvantage,
                      stats: parsed.stats ?? p.stats,
                      proficiencyBonus: parsed.proficiencyBonus ?? p.proficiencyBonus,
                      spells: parsed.spells ?? p.spells,
                      atWillSpells: parsed.atWillSpells ?? p.atWillSpells,
                      actions: parsed.actions ?? p.actions,
                      spellSaveDc: parsed.spellSaveDc ?? p.spellSaveDc,
                      avatar: parsed.avatar ?? p.avatar,
                      dndBeyondId: parsed.dndBeyondId ?? p.dndBeyondId,
                    } : p),
                    scenarios: prev.scenarios.map(s => ({
                      ...s,
                      tokens: s.tokens.map(t => t.combatantId === playerId ? { ...t, avatar: newAvatar ?? t.avatar } : t),
                    })),
                  };
                });
              }}
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
          onClose={() => { setAddNPCModalOpen(false); setEditingNPC(null); }}
          type="npc"
          editing={editingNPC}
          onAdd={(n) => {
            setCampaign(prev => {
              if (!prev) return prev;
              if (editingNPC) {
                return {
                  ...prev,
                  npcs: prev.npcs.map(npc => npc.id === editingNPC.id ? { ...npc, ...n, id: npc.id } as Combatant : npc)
                };
              }
              return {
                ...prev,
                npcs: [...prev.npcs, { ...n, id: `n-${Date.now()}` } as Combatant]
              };
            });
          }}
        />

        {/* Initiative roll review — rolls are staged here until confirmed */}
        {initiativeDraft && (
          <InitiativeRollModal
            rolls={initiativeDraft.rolls}
            isAddingToCombat={initiativeDraft.isAddingToCombat}
            onConfirm={confirmInitiative}
            onClose={() => setInitiativeDraft(null)}
          />
        )}

        {/* Spell Damage Modal — auto-opens when player confirms spell cast */}
        <SpellDamageModal
          isOpen={!!spellDamageModal}
          spellName={spellDamageModal?.spellName || ''}
          saveAbility={spellDamageModal?.saveAbility || ''}
          saveDc={spellDamageModal?.saveDc || 0}
          halfDamageOnSave={spellDamageModal?.halfDamageOnSave || false}
          saveResults={spellDamageModal?.saveResults || {}}
          damageType={spellDamageModal?.damageType}
          combatantTraits={spellDamageModal?.combatantTraits}
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

        {/* Enlarge/Reduce Modal */}
        <EnlargeReduceModal
          isOpen={!!enlargeReduceModal}
          onConfirm={(mode) => {
            if (enlargeReduceModal) {
              startEnlargeReduceRef.current?.(mode, enlargeReduceModal.casterId);
            }
            setEnlargeReduceModal(null);
          }}
          onClose={() => setEnlargeReduceModal(null)}
        />

        {/* Image-note overlay — shown when DM has hit "Show" on an image note */}
        {currentScenario?.displayedImageNoteId && (() => {
          const noteId = currentScenario.displayedImageNoteId;
          const note = (activeFloor?.mapNotes || []).find(n => n.id === noteId)
            || currentScenario.floors?.flatMap(f => f.mapNotes || []).find(n => n.id === noteId);
          if (!note || note.type !== 'image') return null;
          return (
            <ImageNoteOverlay
              imageData={note.imageData}
              caption={note.content}
              rotation={note.imageRotation || 0}
              onRotate={() => setImageNoteRotation(note.id, nextImageRotation(note.imageRotation))}
              onClose={() => toggleDisplayImageNote(note.id)}
            />
          );
        })()}

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
