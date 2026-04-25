import React, { useState } from 'react';
import { Campaign } from '../types';
import { X, Settings, Download } from '../icons';
import { downloadCampaign } from '../utils/campaignFile';

interface CampaignSettingsProps {
  campaign: Campaign;
  onUpdate: (campaign: Campaign) => void;
  onClose: () => void;
}

export const CampaignSettings: React.FC<CampaignSettingsProps> = ({ campaign, onUpdate, onClose }) => {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = () => {
    downloadCampaign(campaign);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
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

            <div className="space-y-3 pt-2">
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-50 text-white">Backup</label>
              <div className="p-4 bg-black/20 border border-[var(--line)] rounded-xl space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-white">Save Campaign to File</h4>
                  <p className="text-xs opacity-60 leading-relaxed text-white mt-1">
                    Downloads a single <code className="opacity-80">.json</code> file with everything in this campaign — players, NPCs, scenarios, floors, and map images. Keep it somewhere safe (Dropbox, iCloud, email to yourself) so a cleared cache can't lose your work.
                  </p>
                </div>
                <button
                  onClick={handleSave}
                  className="btn-filled px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
                >
                  <Download size={16} />
                  {saveStatus === 'saved' ? 'Saved' : 'Save Campaign'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--line)] bg-[var(--surface-hover)] flex justify-between items-center shrink-0 text-white">
          <div className="text-[10px] uppercase tracking-widest opacity-30 font-mono">
            Global Settings
          </div>
        </div>
      </div>
    </div>
  );
};
