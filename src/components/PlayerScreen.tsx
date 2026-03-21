import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { MapView } from './MapView';
import { Campaign, Token } from '../types';

export function PlayerScreen() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [mode, setMode] = useState<'setup' | 'play'>('setup');

  // Refs to avoid stale closures in IPC callbacks
  const currentScenarioIdRef = useRef(currentScenarioId);
  currentScenarioIdRef.current = currentScenarioId;

  // Track whether the player is actively dragging a token.
  // While dragging, we MUST ignore incoming state updates from the DM,
  // otherwise the full-state broadcast will overwrite our drag position.
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // Attempt to load the initial state from localStorage just in case
    try {
      const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
      if (savedCampaigns.length > 0) {
        setCampaign(savedCampaigns[0]);
        if (savedCampaigns[0].scenarios.length > 0) {
          setCurrentScenarioId(savedCampaigns[0].scenarios[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load initial campaign state for Player Screen");
    }

    // Listen for full state updates from the DM Screen via IPC
    const handleStateUpdate = (newState: { campaign: Campaign; scenarioId: string; playerMode?: string }) => {
      // CRITICAL: Skip state updates while the player is dragging a token.
      // The DM's campaign useEffect fires on every campaign change and
      // broadcasts the full state back — this would overwrite our drag.
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

    // Listen for dedicated mode updates (for instant toggle response)
    if (window.electronAPI?.onPlayerModeUpdate) {
      window.electronAPI.onPlayerModeUpdate((newMode: string) => {
        setMode(newMode as 'setup' | 'play');
      });
    }

    // Listen for high-frequency token updates from the DM (e.g. while DM is dragging)
    if (window.electronAPI?.onDMTokenUpdate) {
      window.electronAPI.onDMTokenUpdate((newTokens: Token[]) => {
        // Also skip DM token updates if WE are dragging — otherwise our
        // local drag gets overwritten by the DM's view of the token positions.
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

  // When the player drags tokens, send the update back to the DM
  const handleTokensChange = useCallback((newTokens: Token[]) => {
    if (window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(newTokens);
    }
    // Also update local state so the drag feels instant
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

  // Callback from MapView to track drag state
  const handleDragStatusChange = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  // Derive viewport center from the first available player token so the
  // map opens centered on that token rather than on an arbitrary map corner.
  const viewportCenter = useMemo(() => {
    if (!campaign || !currentScenarioId) return null;
    const scenario = campaign.scenarios.find(s => s.id === currentScenarioId);
    const firstPlayerToken = scenario?.tokens?.find(t => t.type === 'player');
    return firstPlayerToken ? { x: firstPlayerToken.x, y: firstPlayerToken.y } : null;
  }, [campaign?.id, currentScenarioId]); // Only recompute on scenario/campaign switch, not every token move

  // Setup mode: show blank state
  if (mode === 'setup') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/20 font-serif text-3xl tracking-widest mb-3">Setup Mode</div>
          <div className="text-white/10 font-sans text-sm tracking-wide">The DM is preparing the session...</div>
        </div>
      </div>
    );
  }

  if (!campaign || !currentScenarioId) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Awaiting DM Connection...
      </div>
    );
  }

  const currentScenario = campaign.scenarios.find(s => s.id === currentScenarioId);

  if (!currentScenario) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white/30 font-serif text-2xl tracking-widest">
        Loading Scenario...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
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
      />
    </div>
  );
}
