import { Campaign } from '../types';

interface CampaignFile {
  formatVersion: 1;
  exportedAt: string;
  campaign: Campaign;
}

export function downloadCampaign(campaign: Campaign) {
  const payload: CampaignFile = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    campaign,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = campaign.name.replace(/[^a-z0-9-_ ]/gi, '_').trim() || 'campaign';
  a.href = url;
  a.download = `${safeName}.dmcampaign.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readCampaignFile(file: File): Promise<Campaign> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const campaign: Campaign = parsed?.campaign ?? parsed;
  if (!campaign || typeof campaign !== 'object' || !campaign.id || !Array.isArray(campaign.scenarios)) {
    throw new Error('This file does not look like a campaign export.');
  }

  // Persist any embedded map images and note images into localStorage so the app's
  // normal rehydration path picks them up when the campaign is loaded.
  for (const s of campaign.scenarios) {
    if (s.floors) {
      for (const f of s.floors) {
        if (f.mapImage) {
          try { localStorage.setItem(`map_img_${s.id}_${f.id}`, f.mapImage); } catch { /* quota */ }
        }
        for (const n of f.mapNotes || []) {
          if (n.type === 'image' && n.imageData) {
            try { localStorage.setItem(`note_img_${n.id}`, n.imageData); } catch { /* quota */ }
          }
        }
      }
    }
    if (s.mapImage) {
      try { localStorage.setItem(`map_img_${s.id}`, s.mapImage); } catch { /* quota */ }
    }
  }

  return campaign;
}
