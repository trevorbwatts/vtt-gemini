import React, { useState } from 'react';
import { Campaign, Combatant, cn, ClassDefinition } from '../types';
import { X, Plus, Trash2, User, Shield, Heart, Sword, Zap, Wind, Eye, RefreshCw, Settings } from 'lucide-react';
import { parseDndBeyondCharacter } from '../services/dndBeyondParser';

interface CampaignSettingsProps {
  campaign: Campaign;
  onUpdate: (campaign: Campaign) => void;
  onClose: () => void;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ campaign, onUpdate, onClose }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'players' | 'npcs'>('general');
  const [isImporting, setIsImporting] = useState(false);

  const removeCombatant = (id: string) => {
    const updatedCampaign = { ...campaign };
    if (activeTab === 'players') updatedCampaign.players = campaign.players.filter(c => c.id !== id);
    else updatedCampaign.npcs = campaign.npcs.filter(c => c.id !== id);

    onUpdate(updatedCampaign);
  };

  const updateCombatant = (id: string, updates: Partial<Combatant>) => {
    const updatedCampaign = { ...campaign };
    const mapper = (c: Combatant) => c.id === id ? { ...c, ...updates } : c;

    if (activeTab === 'players') updatedCampaign.players = campaign.players.map(mapper);
    else updatedCampaign.npcs = campaign.npcs.map(mapper);

    onUpdate(updatedCampaign);
  };

  const addClass = (combatantId: string) => {
    const combatant = campaign.players.find(p => p.id === combatantId);
    if (!combatant) return;
    const classes = [...(combatant.classes || []), { name: 'New Class', level: 1 }];
    updateCombatant(combatantId, { classes });
  };

  const removeClass = (combatantId: string, index: number) => {
    const combatant = campaign.players.find(p => p.id === combatantId);
    if (!combatant || !combatant.classes) return;
    const classes = combatant.classes.filter((_, i) => i !== index);
    updateCombatant(combatantId, { classes });
  };

  const updateClass = (combatantId: string, index: number, updates: Partial<ClassDefinition>) => {
    const combatant = campaign.players.find(p => p.id === combatantId);
    if (!combatant || !combatant.classes) return;
    const classes = combatant.classes.map((c, i) => i === index ? { ...c, ...updates } : c);
    updateCombatant(combatantId, { classes });
  };

  const syncCharacter = async (combatantId: string) => {
    const combatant = campaign.players.find(p => p.id === combatantId)
      || campaign.npcs.find(n => n.id === combatantId);
    if (!combatant) return;

    // Need a URL or ID to re-sync
    const syncUrl = combatant.dndBeyondUrl
      || (combatant.dndBeyondId ? `https://www.dndbeyond.com/characters/${combatant.dndBeyondId}` : null);
    if (!syncUrl) return;

    if (!window.electronAPI?.importDndBeyondCharacter) {
      alert('Re-sync requires the Desktop App.');
      return;
    }

    setIsImporting(true);
    try {
      const result = await window.electronAPI.importDndBeyondCharacter(syncUrl);
      if (result.error) {
        alert(`Sync failed: ${result.error}`);
        return;
      }
      const parsed = parseDndBeyondCharacter(result.data);
      updateCombatant(combatantId, {
        name: parsed.name,
        hp: parsed.hp,
        maxHp: parsed.maxHp,
        ac: parsed.ac,
        species: parsed.species,
        speed: parsed.speed,
        darkvision: parsed.darkvision,
        classes: parsed.classes,
        initiative: parsed.initiative,
        stats: parsed.stats,
        actions: parsed.actions,
        spells: parsed.spells,
        avatar: parsed.avatar,
        proficiencyBonus: parsed.proficiencyBonus,
        dndBeyondId: parsed.dndBeyondId,
      });
    } catch (err: any) {
      alert('Failed to sync with D&D Beyond. Please try again later.');
    } finally {
      setIsImporting(false);
    }
  };

  const getCharacterLevel = (classes?: ClassDefinition[]) => {
    return classes?.reduce((sum, c) => sum + c.level, 0) || 0;
  };

  const currentList = activeTab === 'general' ? [] : (activeTab === 'players' ? campaign.players : campaign.npcs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-white">
      <div className="bg-[var(--surface)] border border-[var(--line)] w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-hover)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--ink)] text-[var(--bg)] rounded">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">Campaign Settings</h2>
              <p className="text-[10px] uppercase tracking-widest opacity-50 text-white">Configure your world</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full transition-colors text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--line)]">
          {[
            { id: 'general', label: 'General', icon: Settings },
            { id: 'players', label: 'Players', icon: User },
            { id: 'npcs', label: 'NPCs', icon: User },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2",
                activeTab === tab.id ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-hover)]" : "border-transparent opacity-50 hover:opacity-100 text-white"
              )}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {activeTab === 'general' ? (
            <div className="space-y-6 p-2">
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 text-white">Campaign Name</label>
                <input 
                  type="text" 
                  value={campaign.name}
                  onChange={(e) => onUpdate({ ...campaign, name: e.target.value })}
                  className="w-full bg-black/20 border border-[var(--line)] rounded-xl px-4 py-3 font-serif text-xl focus:outline-none focus:border-[var(--accent)] transition-colors text-white"
                  placeholder="Enter campaign name..."
                />
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wide">Pro Tip</h4>
                <p className="text-xs opacity-60 leading-relaxed text-white">
                  Your campaign name is visible on the player screen and helps you stay organized across multiple adventures.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-start px-2">
                <button 
                  onClick={() => {
                    const newCombatant: Combatant = {
                      id: `c-${Date.now()}`,
                      name: `New ${activeTab === 'players' ? 'Player' : 'NPC'}`,
                      initiative: 0,
                      hp: 10,
                      maxHp: 10,
                      ac: 10,
                      type: activeTab === 'players' ? 'player' : 'npc',
                      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
                      actions: []
                    };
                    const updatedCampaign = { ...campaign };
                    if (activeTab === 'players') updatedCampaign.players = [...campaign.players, newCombatant];
                    else updatedCampaign.npcs = [...campaign.npcs, newCombatant];
                    onUpdate(updatedCampaign);
                  }}
                  className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <Plus size={14} /> Add {activeTab === 'players' ? 'Player' : 'NPC'}
                </button>
              </div>

              {currentList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                  <Plus size={48} />
                  <p className="mt-2 font-mono text-sm uppercase tracking-widest">No {activeTab} defined</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentList.map((c) => (
                    <div key={c.id} className="p-4 border border-[var(--line)] bg-[var(--surface-hover)] rounded-lg flex flex-col gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {c.dndBeyondId ? (
                              <div className="font-bold text-xl flex-1 py-1 text-white">{c.name}</div>
                            ) : (
                              <input 
                                value={c.name}
                                onChange={(e) => updateCombatant(c.id, { name: e.target.value })}
                                className="bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] outline-none font-bold text-xl flex-1 text-white"
                                placeholder="Entity Name"
                              />
                            )}
                            {c.type === 'player' && (
                              <div className="flex items-center gap-2">
                                {c.dndBeyondId && (
                                  <button 
                                    onClick={() => syncCharacter(c.id)}
                                    disabled={isImporting}
                                    className="p-1 hover:bg-black/10 rounded text-[var(--accent)] transition-all"
                                    title="Sync from D&D Beyond"
                                  >
                                    <RefreshCw size={14} className={isImporting ? "animate-spin" : ""} />
                                  </button>
                                )}
                                <div className="bg-[var(--accent)] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                  Level {getCharacterLevel(c.classes)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => removeCombatant(c.id)}
                          className="p-2 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                      {/* Profile Fields */}
                      <div className="grid grid-cols-3 gap-4 p-3 bg-black/20 rounded-lg border border-[var(--line)]/50 text-white">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <User size={10} /> Species
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 text-sm font-medium italic opacity-60">{c.species || '—'}</div>
                          ) : (
                            <input 
                              value={c.species || ''}
                              onChange={(e) => updateCombatant(c.id, { species: e.target.value })}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)] text-white"
                              placeholder="Species"
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <Wind size={10} /> Speed
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 font-mono text-sm opacity-60">{c.speed || 0} ft</div>
                          ) : (
                            <input 
                              type="number"
                              value={c.speed || 0}
                              onChange={(e) => updateCombatant(c.id, { speed: parseInt(e.target.value) || 0 })}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)] text-white"
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <Eye size={10} /> Darkvision
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 font-mono text-sm opacity-60">{c.darkvision || 0} ft</div>
                          ) : (
                            <input 
                              type="number"
                              value={c.darkvision || 0}
                              onChange={(e) => updateCombatant(c.id, { darkvision: parseInt(e.target.value) || 0 })}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)] text-white"
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-white">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <Heart size={10} /> Max HP
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 font-mono text-sm opacity-60">{c.maxHp}</div>
                          ) : (
                            <input 
                              type="number"
                              value={c.maxHp}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                updateCombatant(c.id, { maxHp: val, hp: val });
                              }}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)] text-white"
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <Shield size={10} /> Armor Class
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 font-mono text-sm opacity-60">{c.ac}</div>
                          ) : (
                            <input 
                              type="number"
                              value={c.ac}
                              onChange={(e) => updateCombatant(c.id, { ac: parseInt(e.target.value) || 0 })}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)] text-white"
                            />
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                            <Zap size={10} /> Base Init
                          </label>
                          {c.dndBeyondId ? (
                            <div className="px-2 py-1 font-mono text-sm opacity-60">{c.initiative}</div>
                          ) : (
                            <input 
                              type="number"
                              value={c.initiative}
                              onChange={(e) => updateCombatant(c.id, { initiative: parseInt(e.target.value) || 0 })}
                              className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)] text-white"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--line)] bg-[var(--surface-hover)] flex justify-between items-center shrink-0 text-white">
          <div className="text-[10px] uppercase tracking-widest opacity-30 font-mono">
            {activeTab === 'general' ? 'Global Settings' : `${currentList.length} ${activeTab} total`}
          </div>
        </div>
      </div>
    </div>
  );
};
