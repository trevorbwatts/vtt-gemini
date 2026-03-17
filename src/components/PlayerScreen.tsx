import React, { useEffect, useState } from 'react';
import { MapView } from './MapView';
import { Campaign, Scenario, Combatant } from '../types';

export function PlayerScreen() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [mode, setMode] = useState<'setup' | 'play'>('setup');

  useEffect(() => {
    // Attempt to load the initial state from localStorage just in case
    try {
      const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
      if (savedCampaigns.length > 0) {
          setCampaign(savedCampaigns[0]);
          if(savedCampaigns[0].scenarios.length > 0) {
              setCurrentScenarioId(savedCampaigns[0].scenarios[0].id);
          }
      }
    } catch (e) {
      console.error("Failed to load initial campaign state for Player Screen");
    }

    // Listen for state updates from the DM Screen via IPC
    // The state update now includes playerMode so we get it reliably
    const handleStateUpdate = (newState: { campaign: Campaign, scenarioId: string, playerMode?: string }) => {
      setCampaign(newState.campaign);
      setCurrentScenarioId(newState.scenarioId);
      if (newState.playerMode) {
        setMode(newState.playerMode as 'setup' | 'play');
      }
    };

    if (window.electronAPI) {
        window.electronAPI.onStateUpdate(handleStateUpdate);
    }

    // Also listen for dedicated mode updates (for instant toggle response)
    if (window.electronAPI?.onPlayerModeUpdate) {
        window.electronAPI.onPlayerModeUpdate((newMode: string) => {
          setMode(newMode as 'setup' | 'play');
        });
    }

    return () => {
        if (window.electronAPI) {
            window.electronAPI.removeStateUpdateListener();
        }
        if (window.electronAPI?.removePlayerModeListener) {
            window.electronAPI.removePlayerModeListener();
        }
    };
  }, []);

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
    <div className="h-screen w-screen overflow-hidden bg-black pointer-events-none">
      <MapView
        tokens={currentScenario.tokens || []}
        onTokensChange={() => {}}
        scenarioName={currentScenario.name}
        mapImage={currentScenario.mapImage}
        onMapChange={() => {}}
        mapNotes={[]}
        onMapNotesChange={() => {}}
        players={campaign.players || []}
        npcs={campaign.npcs || []}
        persistentEnemies={campaign.persistentEnemies || []}
        scenarioCombatants={currentScenario.combatants || []}
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
      />
    </div>
  );
}
