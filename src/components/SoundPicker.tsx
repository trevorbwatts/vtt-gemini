import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Play, StopCircle, Music } from '../icons';
import type { SoundAsset, SoundCategory } from '../types';
import { useSounds, filterSounds, soundUrl } from '../data/sounds';
import { audioEngine } from '../services/audioEngine';
import { cn } from '../types';

interface SoundPickerProps {
  /** Pre-select this sound (highlighted in the list). */
  selectedId?: string | null;
  /** Heading shown at the top of the picker. */
  title: string;
  /** Optional subtitle / context line. */
  subtitle?: string;
  /** Default category filter when the picker opens. */
  defaultCategory?: SoundCategory | 'all';
  /** When true, shows a "Clear / None" button that calls onPick(null). */
  allowClear?: boolean;
  onPick: (soundId: string | null) => void;
  onClose: () => void;
}

const CATEGORIES: { value: SoundCategory | 'all'; label: string }[] = [
  { value: 'all',         label: 'All' },
  { value: 'ambient',     label: 'Ambient' },
  { value: 'zone',        label: 'Zone' },
  { value: 'interaction', label: 'Interaction' },
  { value: 'note',        label: 'Note' },
  { value: 'other',       label: 'Other' },
];

/**
 * Reusable modal for choosing a sound from the global library. Used by:
 * floor ambient picker, sound note creator, spell→sound settings, sound zone
 * editor. Shows a category-filtered list with inline previews.
 */
export const SoundPicker: React.FC<SoundPickerProps> = ({
  selectedId,
  title,
  subtitle,
  defaultCategory = 'all',
  allowClear = false,
  onPick,
  onClose,
}) => {
  const { sounds } = useSounds();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<SoundCategory | 'all'>(defaultCategory);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    audioEngine.ensure();
  }, []);

  const filtered = useMemo(
    () => filterSounds(sounds, search, category),
    [sounds, search, category],
  );

  const preview = async (sound: SoundAsset) => {
    setPreviewingId(sound.id);
    try {
      await audioEngine.playOneShot(soundUrl(sound.filename), 'sfx', 1);
    } catch { /* ignore */ }
    setTimeout(() => setPreviewingId(prev => prev === sound.id ? null : prev), 1200);
  };

  const content = (
    <div
      className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--accent)]/20">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-sm uppercase tracking-[0.15em] font-bold">{title}</h2>
              {subtitle && <div className="text-[10px] opacity-50">{subtitle}</div>}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost px-2">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 p-3 border-b border-[var(--accent)]/15">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              autoFocus
              placeholder="Search sounds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0f0c0a] border border-[var(--accent)]/20 rounded pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]/60"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SoundCategory | 'all')}
            className="bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1.5 text-xs"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {allowClear && (
            <button
              onClick={() => { onPick(null); onClose(); }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded mb-2 border transition-colors',
                selectedId == null
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/60'
                  : 'bg-[#0f0c0a]/60 border-[var(--accent)]/15 hover:border-[var(--accent)]/40',
              )}
            >
              <span className="flex-1 text-left text-xs italic opacity-70">None / Silent</span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="text-center text-xs opacity-50 py-12">
              {sounds.length === 0
                ? 'No sounds in your library yet. Open the Sound Mixer to upload some.'
                : 'No sounds match your filters.'}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map(s => {
                const isSelected = s.id === selectedId;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded border transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-[var(--accent)]/15 border-[var(--accent)]/60'
                        : 'bg-[#0f0c0a]/60 border-[var(--accent)]/15 hover:border-[var(--accent)]/40',
                    )}
                    onClick={() => { onPick(s.id); onClose(); }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); preview(s); }}
                      className="btn-ghost px-1.5"
                      title="Preview"
                    >
                      {previewingId === s.id ? <StopCircle size={14} /> : <Play size={14} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{s.name}</div>
                      <div className="text-[10px] opacity-50 truncate">
                        {s.filename}
                        {s.tags.length > 0 && ' • ' + s.tags.join(', ')}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]/90">
                      {s.category}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
