import React, { useEffect, useState } from 'react';
import { MapView } from './MapView';
import { Campaign, Scenario, Combatant } from '../types';

export function PlayerScreen() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);

  useEffect(() => {
    // Attempt to load the initial state from localStorage just in case
    try {
      const savedCampaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
      if (savedCampaigns.length > 0) {
          // For simplicity in the prototype, we just grab the first one if not explicitly told otherwise
          setCampaign(savedCampaigns[0]);
          if(savedCampaigns[0].scenarios.length > 0) {
              setCurrentScenarioId(savedCampaigns[0].scenarios[0].id);
          }
      }
    } catch (e) {
      console.error("Failed to load initial campaign state for Player Screen");
    }

    // Listen for state updates from the DM Screen via IPC
    const handleStateUpdate = (newState: { campaign: Campaign, scenarioId: string }) => {
      setCampaign(newState.campaign);
      setCurrentScenarioId(newState.scenarioId);
    };

    if (window.electronAPI) {
        window.electronAPI.onStateUpdate(handleStateUpdate);
    }

    return () => {
        if (window.electronAPI) {
            window.electronAPI.removeStateUpdateListener();
        }
    };
  }, []);

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
      {/* Player Screen is strictly read-only for now, so we pass empty handlers for modifications */}
      <MapView
        tokens={currentScenario.tokens || []}
        onTokensChange={() => {}}
        scenarioName={currentScenario.name}
        mapImage={currentScenario.mapImage}
        onMapChange={() => {}}
        mapNotes={[]} // Map notes are hidden on the player screen
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
