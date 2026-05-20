import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Trash2, Search, Play, StopCircle, Volume2, VolumeX, Music, Settings } from '../icons';
import type { SoundAsset, SoundCategory, MixerSettings, Floor } from '../types';
import { useSounds, filterSounds, soundUrl } from '../data/sounds';
import { audioEngine, loadMixerSettings, saveMixerSettings } from '../services/audioEngine';
import { SoundBindingsModal } from './SoundBindingsModal';
import { cn } from '../types';

interface MixerPanelProps {
  onClose: () => void;
  /** All floors in the active scenario — populates the audio focus override dropdown. */
  currentScenarioFloors?: Floor[];
  /** When non-null, only this floor's ambient/zone audio plays. */
  audioFocusFloorId?: string | null;
  onAudioFocusChange?: (floorId: string | null) => void;
}

const CATEGORIES: { value: SoundCategory; label: string; hint: string }[] = [
  { value: 'ambient',     label: 'Ambient',     hint: 'Looping floor beds (cave drips, tavern crowd)' },
  { value: 'zone',        label: 'Zone',        hint: 'Painted regions on a map (river, fire pit)' },
  { value: 'interaction', label: 'Interaction', hint: 'Doors, windows, spell casts' },
  { value: 'note',        label: 'Note',        hint: 'Pinned one-shots on the map' },
  { value: 'other',       label: 'Other',       hint: 'Uncategorized' },
];

const BUS_SLIDERS: { key: keyof MixerSettings; label: string; sub: string }[] = [
  { key: 'master',  label: 'Master',           sub: 'Everything' },
  { key: 'ambient', label: 'Ambient Beds',     sub: 'Tier 1 — floor loops' },
  { key: 'zones',   label: 'Sound Zones',      sub: 'Tier 2 — painted areas' },
  { key: 'sfx',     label: 'Interactions',     sub: 'Tier 3 — doors, spells' },
  { key: 'notes',   label: 'Sound Notes',      sub: 'Tier 4 — pinned cues' },
];

interface PendingUpload {
  file: File;
  previewUrl: string;
  name: string;
  category: SoundCategory;
  tagsInput: string;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({
  onClose,
  currentScenarioFloors = [],
  audioFocusFloorId = null,
  onAudioFocusChange,
}) => {
  const { sounds, addSounds, updateSound, deleteSound } = useSounds();
  const [settings, setSettings] = useState<MixerSettings>(() => loadMixerSettings());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SoundCategory | 'all'>('all');
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; category: SoundCategory; tags: string }>({ name: '', category: 'other', tags: '' });
  const [bindingsOpen, setBindingsOpen] = useState(false);

  // Initialize the audio engine on mount (this counts as a user gesture since
  // the panel only opens on a button click).
  useEffect(() => {
    audioEngine.ensure();
    audioEngine.setSettings(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist + apply settings whenever they change.
  useEffect(() => {
    audioEngine.setSettings(settings);
    saveMixerSettings(settings);
  }, [settings]);

  const filtered = useMemo(
    () => filterSounds(sounds, search, categoryFilter),
    [sounds, search, categoryFilter],
  );

  useEffect(() => {
    return () => {
      pending.forEach(p => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('audio/'));
    if (arr.length === 0) return;
    setPending(prev => [
      ...prev,
      ...arr.map(file => ({
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(),
        category: 'other' as SoundCategory,
        tagsInput: '',
      })),
    ]);
  }, []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) acceptFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) acceptFiles(e.dataTransfer.files);
  };

  const updatePending = (idx: number, patch: Partial<PendingUpload>) => {
    setPending(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const removePending = (idx: number) => {
    setPending(prev => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const commitUploads = async () => {
    if (pending.length === 0) return;
    setSaving(true);
    setErrors([]);
    try {
      const files = pending.map(p => p.file);
      const result = await addSounds(files, (_f, i) => ({
        name: pending[i].name.trim() || pending[i].file.name,
        category: pending[i].category,
        tags: pending[i].tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      }));
      if (result.errors.length > 0) setErrors(result.errors);
      pending.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
    } finally {
      setSaving(false);
    }
  };

  const previewSound = async (sound: SoundAsset) => {
    setPreviewingId(sound.id);
    try {
      await audioEngine.playOneShot(soundUrl(sound.filename), 'sfx', 1);
    } catch (err) {
      console.warn('Preview failed', err);
    }
    // Visual indicator clears after a short window; we don't track actual end-of-buffer here.
    setTimeout(() => setPreviewingId(prev => prev === sound.id ? null : prev), 1200);
  };

  const startEdit = (sound: SoundAsset) => {
    setEditingId(sound.id);
    setEditDraft({ name: sound.name, category: sound.category, tags: sound.tags.join(', ') });
  };

  const commitEdit = async () => {
    if (!editingId) return;
    await updateSound(editingId, {
      name: editDraft.name.trim(),
      category: editDraft.category,
      tags: editDraft.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
    setEditingId(null);
  };

  const renderSlider = (key: keyof MixerSettings, label: string, sub: string) => {
    const value = settings[key];
    const Icon = value === 0 ? VolumeX : Volume2;
    return (
      <div key={key} className="flex flex-col gap-1.5 p-3 rounded-md bg-[#0f0c0a]/40 border border-[var(--accent)]/15">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.1em] font-bold text-[var(--accent)]/90">{label}</div>
            <div className="text-[10px] opacity-50">{sub}</div>
          </div>
          <Icon size={14} className="opacity-60" />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(value * 100)}
            onChange={(e) => setSettings(prev => ({ ...prev, [key]: Number(e.target.value) / 100 }))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="text-[10px] w-8 text-right tabular-nums opacity-60">
            {Math.round(value * 100)}
          </span>
        </div>
      </div>
    );
  };

  const content = (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--accent)]/20">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-[var(--accent)]" />
            <h2 className="text-sm uppercase tracking-[0.15em] font-bold">Sound Mixer</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBindingsOpen(true)}
              className="btn-ghost text-xs"
              title="Bind sounds to doors, windows, and spells"
            >
              <Settings size={12} />
              <span>Bindings</span>
            </button>
            <button onClick={onClose} className="btn-ghost px-2" title="Close">
              <X size={16} />
            </button>
          </div>
        </div>
        {bindingsOpen && <SoundBindingsModal onClose={() => setBindingsOpen(false)} />}

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Mixer */}
          <div className="w-[280px] flex-shrink-0 border-r border-[var(--accent)]/20 p-4 overflow-y-auto">
            <div className="text-[11px] uppercase tracking-[0.15em] opacity-50 font-bold mb-3">Volume</div>
            <div className="flex flex-col gap-2">
              {BUS_SLIDERS.map(s => renderSlider(s.key, s.label, s.sub))}
            </div>

            {currentScenarioFloors.length > 1 && onAudioFocusChange && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-[0.15em] opacity-50 font-bold mb-2">Audio Focus</div>
                <div className="p-3 rounded-md bg-[#0f0c0a]/40 border border-[var(--accent)]/15">
                  <div className="text-[10px] opacity-60 mb-2 leading-relaxed">
                    Override the per-player-token mix. Only the chosen floor's ambient + zone audio will play.
                  </div>
                  <select
                    value={audioFocusFloorId ?? ''}
                    onChange={(e) => onAudioFocusChange(e.target.value || null)}
                    className="w-full bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1.5 text-xs"
                  >
                    <option value="">Auto (weighted by players)</option>
                    {currentScenarioFloors.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Right: Sound library */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Library toolbar */}
            <div className="flex items-center gap-2 p-3 border-b border-[var(--accent)]/15">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="text"
                  placeholder="Search sounds..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#0f0c0a] border border-[var(--accent)]/20 rounded pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-[var(--accent)]/60"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as SoundCategory | 'all')}
                className="bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1.5 text-xs"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button
                className="btn-ghost text-xs"
                onClick={() => fileInputRef.current?.click()}
                title="Upload audio files"
              >
                <Upload size={12} />
                <span>Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleFilePick}
                className="hidden"
              />
            </div>

            {/* Pending uploads bar */}
            {pending.length > 0 && (
              <div className="border-b border-[var(--accent)]/15 p-3 bg-[#0f0c0a]/40 max-h-[260px] overflow-y-auto">
                <div className="text-[10px] uppercase tracking-[0.15em] opacity-50 font-bold mb-2">
                  {pending.length} file{pending.length === 1 ? '' : 's'} pending
                </div>
                <div className="flex flex-col gap-2">
                  {pending.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#1a1512] border border-[var(--accent)]/15 rounded p-2">
                      <audio src={p.previewUrl} controls className="h-8" style={{ maxWidth: 200 }} />
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updatePending(i, { name: e.target.value })}
                        placeholder="Name"
                        className="flex-1 bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                      />
                      <select
                        value={p.category}
                        onChange={(e) => updatePending(i, { category: e.target.value as SoundCategory })}
                        className="bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                      >
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <input
                        type="text"
                        value={p.tagsInput}
                        onChange={(e) => updatePending(i, { tagsInput: e.target.value })}
                        placeholder="tags, comma, separated"
                        className="w-44 bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                      />
                      <button onClick={() => removePending(i)} className="btn-ghost px-1.5" title="Discard">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button onClick={() => { pending.forEach(p => URL.revokeObjectURL(p.previewUrl)); setPending([]); }} className="btn-ghost text-xs" disabled={saving}>
                    Discard all
                  </button>
                  <button onClick={commitUploads} className="btn-primary text-xs" disabled={saving}>
                    {saving ? 'Saving...' : `Save ${pending.length}`}
                  </button>
                </div>
                {errors.length > 0 && (
                  <div className="mt-2 text-[11px] text-red-300/80">
                    {errors.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Library list (with drop overlay) */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'flex-1 overflow-y-auto p-3 relative',
                isDragOver && 'bg-[var(--accent)]/10',
              )}
            >
              {isDragOver && (
                <div className="absolute inset-0 border-2 border-dashed border-[var(--accent)]/60 rounded-md flex items-center justify-center pointer-events-none">
                  <div className="text-sm text-[var(--accent)] font-bold">Drop audio files to add</div>
                </div>
              )}

              {filtered.length === 0 ? (
                <div className="text-center text-xs opacity-50 py-12">
                  {sounds.length === 0
                    ? 'No sounds in your library yet. Click Upload or drag audio files here.'
                    : 'No sounds match your filters.'}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filtered.map(s => {
                    const isEditing = editingId === s.id;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 bg-[#0f0c0a]/60 border border-[var(--accent)]/15 rounded px-2 py-1.5 hover:border-[var(--accent)]/40 transition-colors"
                      >
                        <button
                          onClick={() => previewSound(s)}
                          className="btn-ghost px-1.5"
                          title="Preview"
                        >
                          {previewingId === s.id ? <StopCircle size={14} /> : <Play size={14} />}
                        </button>

                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              value={editDraft.name}
                              onChange={(e) => setEditDraft(d => ({ ...d, name: e.target.value }))}
                              className="flex-1 bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                            />
                            <select
                              value={editDraft.category}
                              onChange={(e) => setEditDraft(d => ({ ...d, category: e.target.value as SoundCategory }))}
                              className="bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                            >
                              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <input
                              type="text"
                              value={editDraft.tags}
                              onChange={(e) => setEditDraft(d => ({ ...d, tags: e.target.value }))}
                              placeholder="tags"
                              className="w-44 bg-[#0f0c0a] border border-[var(--accent)]/20 rounded px-2 py-1 text-xs"
                            />
                            <button onClick={commitEdit} className="btn-primary text-xs px-2">Save</button>
                            <button onClick={() => setEditingId(null)} className="btn-ghost text-xs px-2">Cancel</button>
                          </>
                        ) : (
                          <>
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
                            <button onClick={() => startEdit(s)} className="btn-ghost text-[10px] px-2">
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${s.name}"? The audio file will be removed from disk.`)) {
                                  deleteSound(s.id);
                                }
                              }}
                              className="btn-ghost px-1.5"
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
