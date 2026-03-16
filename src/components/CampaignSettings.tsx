import React, { useState } from 'react';
import { Campaign, Combatant, cn, ClassDefinition } from '../types';
import { X, Plus, Trash2, User, Shield, Heart, Sword, Zap, Wind, Eye, RefreshCw } from 'lucide-react';
import { fetchDnDBeyondCharacter } from '../services/dndBeyondService';

interface CampaignSettingsProps {
  campaign: Campaign;
  onUpdate: (campaign: Campaign) => void;
  onClose: () => void;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ campaign, onUpdate, onClose }) => {
  const [activeTab, setActiveTab] = useState<'players' | 'npcs'>('players');
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
    const combatant = campaign.players.find(p => p.id === combatantId);
    if (!combatant || !combatant.dndBeyondId) return;
    
    setIsImporting(true);
    try {
      const data = await fetchDnDBeyondCharacter(combatant.dndBeyondId);
      if (data) {
        updateCombatant(combatantId, {
          name: data.name,
          hp: data.hp,
          maxHp: data.maxHp,
          ac: data.ac,
          species: data.species,
          speed: data.speed,
          darkvision: data.darkvision,
          classes: data.classes,
          initiative: data.initiative
        });
      }
    } catch (err: any) {
      if (err.message === 'CHARACTER_PRIVATE') {
        alert("Failed to sync: Character is now Private.");
      } else {
        alert("Failed to sync with D&D Beyond. Please try again later.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  const getCharacterLevel = (classes?: ClassDefinition[]) => {
    return classes?.reduce((sum, c) => sum + c.level, 0) || 0;
  };

  const currentList = activeTab === 'players' ? campaign.players : campaign.npcs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[var(--surface)] border border-[var(--line)] w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--line)] flex items-center justify-between bg-[var(--surface-hover)]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--ink)] text-[var(--bg)] rounded">
              <Sword size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Players & NPCs</h2>
              <p className="text-[10px] uppercase tracking-widest opacity-50">Manage Campaign Entities</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--line)]">
          {[
            { id: 'players', label: 'Players', icon: User },
            { id: 'npcs', label: 'NPCs', icon: User },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2",
                activeTab === tab.id ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-hover)]" : "border-transparent opacity-50 hover:opacity-100"
              )}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
              className="flex items-center gap-2 bg-[var(--btn-bg)] text-white px-4 py-2 rounded font-bold text-[10px] uppercase tracking-widest hover:opacity-90 transition-all"
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
            currentList.map((c) => (
              <div key={c.id} className="p-4 border border-[var(--line)] bg-[var(--surface-hover)] rounded-lg flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {c.dndBeyondId ? (
                        <div className="font-bold text-xl flex-1 py-1">{c.name}</div>
                      ) : (
                        <input 
                          value={c.name}
                          onChange={(e) => updateCombatant(c.id, { name: e.target.value })}
                          className="bg-transparent border-b border-transparent hover:border-[var(--line)] focus:border-[var(--accent)] outline-none font-bold text-xl flex-1"
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

                {/* Player Specific Profile Fields */}
                {c.type === 'player' && (
                  <div className="grid grid-cols-3 gap-4 p-3 bg-black/20 rounded-lg border border-[var(--line)]/50">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                        <User size={10} /> Species
                      </label>
                      {c.dndBeyondId ? (
                        <div className="px-2 py-1 text-sm font-medium">{c.species || '—'}</div>
                      ) : (
                        <input 
                          value={c.species || ''}
                          onChange={(e) => updateCombatant(c.id, { species: e.target.value })}
                          className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
                          placeholder="Species"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                        <Wind size={10} /> Speed
                      </label>
                      {c.dndBeyondId ? (
                        <div className="px-2 py-1 font-mono text-sm">{c.speed || 0} ft</div>
                      ) : (
                        <input 
                          type="number"
                          value={c.speed || 0}
                          onChange={(e) => updateCombatant(c.id, { speed: parseInt(e.target.value) || 0 })}
                          className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                        <Eye size={10} /> Darkvision
                      </label>
                      {c.dndBeyondId ? (
                        <div className="px-2 py-1 font-mono text-sm">{c.darkvision || 0} ft</div>
                      ) : (
                        <input 
                          type="number"
                          value={c.darkvision || 0}
                          onChange={(e) => updateCombatant(c.id, { darkvision: parseInt(e.target.value) || 0 })}
                          className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Classes Section for Players */}
                {c.type === 'player' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50">Classes & Levels</h3>
                      {!c.dndBeyondId && (
                        <button 
                          onClick={() => addClass(c.id)}
                          className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent)] hover:underline flex items-center gap-1"
                        >
                          <Plus size={10} /> Add Class
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {c.classes?.map((cls, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-4 space-y-1">
                            <label className="text-[8px] uppercase tracking-widest opacity-30">Class</label>
                            {c.dndBeyondId ? (
                              <div className="px-2 py-1 text-xs font-medium">{cls.name}</div>
                            ) : (
                              <input 
                                value={cls.name}
                                onChange={(e) => updateClass(c.id, idx, { name: e.target.value })}
                                className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                              />
                            )}
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-[8px] uppercase tracking-widest opacity-30">Level</label>
                            {c.dndBeyondId ? (
                              <div className="px-2 py-1 font-mono text-xs">{cls.level}</div>
                            ) : (
                              <input 
                                type="number"
                                value={cls.level}
                                onChange={(e) => updateClass(c.id, idx, { level: parseInt(e.target.value) || 0 })}
                                className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-xs outline-none focus:border-[var(--accent)]"
                              />
                            )}
                          </div>
                          <div className="col-span-5 space-y-1">
                            <label className="text-[8px] uppercase tracking-widest opacity-30">Subclass</label>
                            {c.dndBeyondId ? (
                              <div className="px-2 py-1 text-xs font-medium">{cls.subclass || '—'}</div>
                            ) : (
                              <input 
                                value={cls.subclass || ''}
                                onChange={(e) => updateClass(c.id, idx, { subclass: e.target.value })}
                                className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                                placeholder="Subclass"
                              />
                            )}
                          </div>
                          {!c.dndBeyondId && (
                            <div className="col-span-1 pb-1">
                              <button 
                                onClick={() => removeClass(c.id, idx)}
                                className="p-1.5 text-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                      <Heart size={10} /> Max HP
                    </label>
                    {c.dndBeyondId ? (
                      <div className="px-2 py-1 font-mono text-sm">{c.maxHp}</div>
                    ) : (
                      <input 
                        type="number"
                        value={c.maxHp}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          updateCombatant(c.id, { maxHp: val, hp: val });
                        }}
                        className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                      <Shield size={10} /> Armor Class
                    </label>
                    {c.dndBeyondId ? (
                      <div className="px-2 py-1 font-mono text-sm">{c.ac}</div>
                    ) : (
                      <input 
                        type="number"
                        value={c.ac}
                        onChange={(e) => updateCombatant(c.id, { ac: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-50 flex items-center gap-1">
                      <Zap size={10} /> Base Init
                    </label>
                    {c.dndBeyondId ? (
                      <div className="px-2 py-1 font-mono text-sm">{c.initiative}</div>
                    ) : (
                      <input 
                        type="number"
                        value={c.initiative}
                        onChange={(e) => updateCombatant(c.id, { initiative: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black border border-[var(--line)] rounded px-2 py-1 font-mono text-sm outline-none focus:border-[var(--accent)]"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--line)] bg-[var(--surface-hover)] flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-widest opacity-30 font-mono">
            {currentList.length} {activeTab} total
          </div>
        </div>
      </div>
    </div>
  );
};
