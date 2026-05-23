import React, { useState, useEffect, useRef } from 'react';
import { Campaign } from '../types';
import { Plus, FolderOpen, Sword, Trash2, ChevronRight, Sparkles, Upload } from '../icons';
import { motion, AnimatePresence } from 'motion/react';
import { readCampaignFile } from '../utils/campaignFile';
import { removeImage } from '../utils/imageStore';

interface SplashScreenProps {
  onSelectCampaign: (campaign: Campaign) => void;
  onCreateCampaign: (name: string) => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onSelectCampaign, onCreateCampaign }) => {
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      const campaign = await readCampaignFile(file);
      setLoadError(null);
      onSelectCampaign(campaign);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  useEffect(() => {
    const campaigns = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]');
    setSavedCampaigns([...campaigns].reverse());
  }, []);

  const handleCreate = () => {
    if (newCampaignName.trim()) {
      onCreateCampaign(newCampaignName.trim());
    }
  };

  const deleteCampaign = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const all = JSON.parse(localStorage.getItem('dungeon_master_campaigns') || '[]') as Campaign[];
    // Clean up separately-stored map images for all scenarios in this campaign
    const toDelete = all.find((c: Campaign) => c.id === id);
    if (toDelete) {
      for (const s of toDelete.scenarios || []) {
        // Legacy single-map key
        removeImage(`map_img_${s.id}`);
        // Per-floor map images + image-note data
        for (const f of s.floors || []) {
          removeImage(`map_img_${s.id}_${f.id}`);
          for (const n of f.mapNotes || []) {
            if (n.type === 'image') removeImage(`note_img_${n.id}`);
          }
        }
      }
    }
    const updated = all.filter((c: Campaign) => c.id !== id);
    localStorage.setItem('dungeon_master_campaigns', JSON.stringify(updated));
    setSavedCampaigns([...updated].reverse());
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--bg)] text-[var(--ink)] flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--accent)]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[var(--accent)]/5 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[var(--parchment-texture)] opacity-40" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-4xl flex flex-col items-center"
      >
        {/* Logo / Title Area */}
        <div className="mb-12 text-center">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-[var(--btn-bg)] rounded-2xl shadow-2xl shadow-[var(--btn-bg)]/20 mb-6"
          >
            <Sword size={32} className="text-white" />
          </motion.div>
          <h1 className="text-7xl font-bold tracking-tighter mb-2 font-serif">
            Dungeon <span className="text-[var(--accent)]">Master</span>
          </h1>
          <p className="text-xs font-mono uppercase tracking-[0.4em] opacity-40">Campaign Orchestrator</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          {/* Create New Card */}
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 shadow-xl flex flex-col justify-between group cursor-pointer relative overflow-hidden"
            onClick={() => setIsCreating(true)}
          >
            <div className="absolute inset-0 bg-[var(--parchment-texture)] opacity-20 pointer-events-none" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-6 group-hover:bg-[var(--btn-bg)] group-hover:text-white transition-colors">
                <Plus size={24} />
              </div>
              <h2 className="text-3xl font-bold mb-2 font-serif">New Campaign</h2>
              <p className="text-sm opacity-60 leading-relaxed">Start a fresh adventure from scratch. Define your players, NPCs, and first scenario.</p>
            </div>
            
            <AnimatePresence mode="wait">
              {isCreating ? (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-8 space-y-4 relative z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Campaign Name..."
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    className="w-full bg-black border border-[var(--line)] rounded-xl px-4 py-3 text-lg outline-none focus:border-[var(--accent)] transition-all font-serif"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={handleCreate}
                      className="btn-filled flex-1 py-3 rounded-xl"
                    >
                      Initialize
                    </button>
                    <button 
                      onClick={() => setIsCreating(false)}
                      className="btn-ghost px-4 py-3 rounded-xl"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="mt-8 flex items-center gap-2 text-[var(--accent)] font-bold text-xs uppercase tracking-widest relative z-10">
                  Get Started <ChevronRight size={16} />
                </div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Load Existing Card */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 shadow-xl flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 bg-[var(--parchment-texture)] opacity-20 pointer-events-none" />
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
                    <FolderOpen size={20} />
                  </div>
                  <h2 className="text-xl font-bold font-serif">Recent Campaigns</h2>
                </div>
                <span className="text-[10px] font-mono opacity-30 uppercase tracking-widest">{savedCampaigns.length} Saved</span>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-2 custom-scrollbar">
                {savedCampaigns.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 py-12 border border-dashed border-[var(--line)] rounded-2xl">
                    <Sparkles size={32} />
                    <p className="mt-2 text-[10px] uppercase tracking-widest">No history found</p>
                  </div>
                ) : (
                  savedCampaigns.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onSelectCampaign(c)}
                      className="w-full group flex items-center justify-between p-4 rounded-2xl bg-black/5 hover:bg-black/10 border border-transparent hover:border-[var(--line)] transition-all text-left"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-lg group-hover:text-[var(--accent)] transition-colors font-serif">{c.name}</span>
                        <span className="text-[10px] opacity-40 uppercase tracking-widest">
                          {c.players.length} Players • {c.scenarios.length} Scenarios
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div 
                          onClick={(e) => deleteCampaign(c.id, e)}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:bg-[var(--accent)]/20 text-[var(--accent)] rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </div>
                        <ChevronRight size={18} className="opacity-20 group-hover:opacity-100 transition-all" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--line)]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleLoadFromFile}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-xs uppercase tracking-widest font-bold opacity-60 hover:opacity-100"
                >
                  <Upload size={14} />
                  Load from File
                </button>
                {loadError && (
                  <p className="mt-2 text-[11px] text-[var(--accent)] opacity-80 text-center">{loadError}</p>
                )}
              </div>
            </div>
          </div>
        </div>

      </motion.div>
    </div>
  );
};
