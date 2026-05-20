import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Music, Trash2, Edit2, Plus, Pencil } from '../icons';
import type { Floor, SoundZone } from '../types';
import { useSounds } from '../data/sounds';
import { SoundPicker } from './SoundPicker';
import { cn } from '../types';

interface SoundZonesPanelProps {
  floor: Floor;
  onUpdateZones: (zones: SoundZone[]) => void;
  onStartPainting: (template: { soundId: string; falloffPx: number; color: string; label?: string }) => void;
  onClose: () => void;
}

const DEFAULT_COLORS = ['#f59e0b', '#22d3ee', '#a78bfa', '#34d399', '#fb7185', '#60a5fa'];

/**
 * Tier 2 — manage painted sound zones on the active floor. Each zone has a
 * sound, a falloff radius (in map pixels), a per-zone volume, and an optional
 * label/color. The "Paint New Zone" button hands off to MapView which captures
 * polygon vertices on the canvas.
 */
export const SoundZonesPanel: React.FC<SoundZonesPanelProps> = ({
  floor,
  onUpdateZones,
  onStartPainting,
  onClose,
}) => {
  const { sounds } = useSounds();
  const zones = floor.soundZones ?? [];
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<{ soundId: string | null; falloffPx: number; color: string; label: string }>({
    soundId: null,
    falloffPx: 300,
    color: DEFAULT_COLORS[0],
    label: '',
  });
  const [pickerForNew, setPickerForNew] = useState(false);

  const soundName = (id: string) => sounds.find(s => s.id === id)?.name ?? id;

  const updateZone = (id: string, patch: Partial<SoundZone>) => {
    onUpdateZones(zones.map(z => z.id === id ? { ...z, ...patch } : z));
  };

  const deleteZone = (id: string) => {
    onUpdateZones(zones.filter(z => z.id !== id));
  };

  const startPaint = () => {
    if (!creatingTemplate.soundId) return;
    onStartPainting({
      soundId: creatingTemplate.soundId,
      falloffPx: creatingTemplate.falloffPx,
      color: creatingTemplate.color,
      label: creatingTemplate.label.trim() || undefined,
    });
  };

  const content = (
    <div
      className="fixed inset-0 z-[205] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--accent)]/20">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-sm uppercase tracking-[0.15em] font-bold">Sound Zones</h2>
              <div className="text-[10px] opacity-50">Tier 2 — {floor.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost px-2"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Existing zones */}
          {zones.length > 0 && (
            <div className="mb-5">
              <div className="text-[11px] uppercase tracking-[0.15em] opacity-60 font-bold mb-3">Existing zones</div>
              <div className="flex flex-col gap-2">
                {zones.map(z => (
                  <div key={z.id} className="p-3 bg-[#0f0c0a]/60 border border-[var(--accent)]/15 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: z.color ?? '#f59e0b' }} />
                      <input
                        type="text"
                        value={z.label ?? ''}
                        placeholder={soundName(z.soundId)}
                        onChange={(e) => updateZone(z.id, { label: e.target.value || undefined })}
                        className="flex-1 bg-transparent border-0 text-xs font-medium focus:outline-none"
                      />
                      <span className="text-[10px] opacity-60">{soundName(z.soundId)}</span>
                      <button
                        onClick={() => setPickerForId(z.id)}
                        className="btn-ghost px-1.5"
                        title="Change sound"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => deleteZone(z.id)}
                        className="btn-ghost px-1.5"
                        title="Delete zone"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Falloff (map px)</div>
                        <input
                          type="range"
                          min={50}
                          max={1500}
                          value={z.falloffPx}
                          onChange={(e) => updateZone(z.id, { falloffPx: Number(e.target.value) })}
                          className="w-full accent-[var(--accent)]"
                        />
                        <div className="text-[10px] opacity-60 text-right tabular-nums">{z.falloffPx}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Volume</div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round((z.volume ?? 1) * 100)}
                          onChange={(e) => updateZone(z.id, { volume: Number(e.target.value) / 100 })}
                          className="w-full accent-[var(--accent)]"
                        />
                        <div className="text-[10px] opacity-60 text-right tabular-nums">{Math.round((z.volume ?? 1) * 100)}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New zone */}
          <div className="p-3 bg-[#0f0c0a]/40 border border-[var(--accent)]/20 rounded-md">
            <div className="text-[11px] uppercase tracking-[0.15em] opacity-60 font-bold mb-3 flex items-center gap-1.5">
              <Pencil size={12} /> Paint a new zone
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Sound</div>
                {creatingTemplate.soundId ? (
                  <button
                    onClick={() => setPickerForNew(true)}
                    className="w-full text-left text-xs bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1.5 hover:border-[var(--accent)]/60"
                  >
                    {soundName(creatingTemplate.soundId)}
                  </button>
                ) : (
                  <button
                    onClick={() => setPickerForNew(true)}
                    className="w-full text-left text-xs bg-[#0f0c0a] border border-dashed border-[var(--accent)]/30 rounded px-2 py-1.5 opacity-70 hover:opacity-100"
                  >
                    Pick a sound…
                  </button>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Label (optional)</div>
                <input
                  type="text"
                  value={creatingTemplate.label}
                  onChange={(e) => setCreatingTemplate(p => ({ ...p, label: e.target.value }))}
                  className="w-full bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1.5 text-xs"
                  placeholder="e.g. River"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Falloff (map px)</div>
                <input
                  type="range"
                  min={50}
                  max={1500}
                  value={creatingTemplate.falloffPx}
                  onChange={(e) => setCreatingTemplate(p => ({ ...p, falloffPx: Number(e.target.value) }))}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="text-[10px] opacity-60 text-right tabular-nums">{creatingTemplate.falloffPx}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Color</div>
                <div className="flex gap-1.5 items-center h-[26px]">
                  {DEFAULT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setCreatingTemplate(p => ({ ...p, color: c }))}
                      className={cn(
                        'w-5 h-5 rounded',
                        creatingTemplate.color === c ? 'ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="text-[10px] opacity-50 mb-3 leading-relaxed">
              Click points on the map to outline the shape. <kbd className="px-1 bg-black/40 rounded">Enter</kbd> commits, <kbd className="px-1 bg-black/40 rounded">Esc</kbd> cancels.
            </div>
            <button
              disabled={!creatingTemplate.soundId}
              onClick={startPaint}
              className="btn-filled w-full py-2 rounded-lg disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Start Painting
            </button>
          </div>
        </div>
      </div>

      {/* Sound picker overlays */}
      {pickerForNew && (
        <SoundPicker
          title="Pick a Sound for the New Zone"
          subtitle="Tier 2 — looping with distance falloff"
          selectedId={creatingTemplate.soundId}
          defaultCategory="zone"
          onPick={(soundId) => setCreatingTemplate(p => ({ ...p, soundId }))}
          onClose={() => setPickerForNew(false)}
        />
      )}
      {pickerForId && (() => {
        const zone = zones.find(z => z.id === pickerForId);
        if (!zone) return null;
        return (
          <SoundPicker
            title="Change Zone Sound"
            subtitle={zone.label ?? soundName(zone.soundId)}
            selectedId={zone.soundId}
            defaultCategory="zone"
            onPick={(soundId) => { if (soundId) updateZone(pickerForId, { soundId }); }}
            onClose={() => setPickerForId(null)}
          />
        );
      })()}
    </div>
  );

  return createPortal(content, document.body);
};
