import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Trash2, Search } from '../icons';
import type { Extra } from '../types';
import { allTags, extraImageUrl, filterExtras } from '../data/extras';
import { cn } from '../types';

interface PendingUpload {
  file: File;
  previewUrl: string;
  name: string;
  tags: string[];
}

interface ManageExtrasModalProps {
  extras: Extra[];
  onClose: () => void;
  onAdd: (
    files: File[],
    metaForFile: (file: File, index: number) => { name: string; tags: string[] }
  ) => Promise<{ added: Extra[]; errors: string[] }>;
  onUpdate: (id: string, patch: Partial<Pick<Extra, 'name' | 'tags'>>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

/**
 * Manage the global Extras gallery — bulk import images, edit names/tags, delete entries.
 * Files are written into public/extras/ via Electron IPC so they can be committed to git.
 */
export const ManageExtrasModal: React.FC<ManageExtrasModalProps> = ({
  extras,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [bulkTagsInput, setBulkTagsInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const tags = useMemo(() => allTags(extras), [extras]);
  const filtered = useMemo(() => filterExtras(extras, search, activeTags), [extras, search, activeTags]);

  const acceptFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) return;
    setPending(prev => [
      ...prev,
      ...arr.map(file => ({
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(),
        tags: [] as string[],
      })),
    ]);
  }, []);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      pending.forEach(p => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const addTagToPending = (idx: number, raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    setPending(prev => prev.map((p, i) => i === idx
      ? { ...p, tags: p.tags.includes(tag) ? p.tags : [...p.tags, tag] }
      : p
    ));
  };

  const removeTagFromPending = (idx: number, tag: string) => {
    setPending(prev => prev.map((p, i) => i === idx
      ? { ...p, tags: p.tags.filter(t => t !== tag) }
      : p
    ));
  };

  const applyBulkTags = () => {
    const newTags = bulkTagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (newTags.length === 0) return;
    setPending(prev => prev.map(p => ({
      ...p,
      tags: Array.from(new Set([...p.tags, ...newTags])),
    })));
    setBulkTagsInput('');
  };

  const saveAll = async () => {
    if (pending.length === 0) return;
    setSaving(true);
    setErrors([]);
    try {
      const res = await onAdd(
        pending.map(p => p.file),
        (_file, idx) => ({ name: pending[idx].name || pending[idx].file.name, tags: pending[idx].tags })
      );
      if (res.errors.length > 0) setErrors(res.errors);
      pending.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPending([]);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)] bg-black/10">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Manage Extras</h2>
            <p className="text-[11px] opacity-50 mt-0.5">Background-character avatars, shared across all campaigns.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Library */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-[var(--line)]">
            <div className="p-3 border-b border-[var(--line)] space-y-2">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name…"
                  className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-sm outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => {
                    const active = activeTags.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => setActiveTags(prev =>
                          active ? prev.filter(x => x !== t) : [...prev, t]
                        )}
                        className={cn(
                          "px-2 py-0.5 text-[10px] uppercase tracking-wider rounded-full border transition-colors",
                          active
                            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                            : "border-[var(--line)] opacity-60 hover:opacity-100"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                  {activeTags.length > 0 && (
                    <button
                      onClick={() => setActiveTags([])}
                      className="px-2 py-0.5 text-[10px] uppercase tracking-wider opacity-50 hover:opacity-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {extras.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center p-8">
                  <p className="text-sm">No Extras yet.</p>
                  <p className="text-xs mt-1">Drop images on the right to add some.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-40 text-sm">
                  No matches.
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
                  {filtered.map(e => (
                    <ExtraCard
                      key={e.id}
                      extra={e}
                      onUpdate={(patch) => onUpdate(e.id, patch)}
                      onDelete={() => onDelete(e.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Import */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "w-[400px] flex flex-col overflow-hidden transition-colors",
              isDragOver ? "bg-[var(--accent)]/10" : ""
            )}
          >
            <div className="p-3 border-b border-[var(--line)] flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest opacity-50">Import</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] uppercase tracking-wider opacity-70 hover:opacity-100 flex items-center gap-1.5"
              >
                <Upload size={11} /> Choose Files…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilePick}
                className="hidden"
              />
            </div>

            {pending.length === 0 ? (
              <div
                className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} className="mb-3 opacity-60" />
                <p className="text-sm">Drop images here</p>
                <p className="text-xs mt-1 opacity-70">or click to choose files</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-[var(--line)] bg-black/5 flex items-center gap-2">
                  <input
                    type="text"
                    value={bulkTagsInput}
                    onChange={(e) => setBulkTagsInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBulkTags(); } }}
                    placeholder="Tag all (comma-separated)…"
                    className="flex-1 bg-black border border-[var(--line)] rounded-md px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={applyBulkTags}
                    disabled={!bulkTagsInput.trim()}
                    className="px-2 py-1 text-[10px] uppercase tracking-wider rounded-md bg-[var(--accent)] text-white disabled:opacity-30"
                  >
                    Apply
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {pending.map((p, idx) => (
                    <PendingCard
                      key={idx}
                      pending={p}
                      existingTags={tags}
                      onChange={(patch) => updatePending(idx, patch)}
                      onAddTag={(tag) => addTagToPending(idx, tag)}
                      onRemoveTag={(tag) => removeTagFromPending(idx, tag)}
                      onRemove={() => removePending(idx)}
                    />
                  ))}
                </div>
                <div className="p-3 border-t border-[var(--line)] bg-black/5">
                  {errors.length > 0 && (
                    <div className="mb-2 text-[10px] text-red-400 max-h-16 overflow-y-auto">
                      {errors.map((er, i) => <div key={i}>{er}</div>)}
                    </div>
                  )}
                  <button
                    onClick={saveAll}
                    disabled={saving || pending.length === 0}
                    className="btn-filled w-full py-2 rounded-lg disabled:opacity-30"
                  >
                    {saving ? 'Saving…' : `Save ${pending.length} Extra${pending.length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── Library card (existing Extra) ──

interface ExtraCardProps {
  extra: Extra;
  onUpdate: (patch: Partial<Pick<Extra, 'name' | 'tags'>>) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
}

const ExtraCard: React.FC<ExtraCardProps> = ({ extra, onUpdate, onDelete }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(extra.name);
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setNameDraft(extra.name); }, [extra.name]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== extra.name) onUpdate({ name: trimmed });
    setEditingName(false);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || extra.tags.includes(t)) { setTagInput(''); return; }
    onUpdate({ tags: [...extra.tags, t] });
    setTagInput('');
  };

  const removeTag = (t: string) => {
    onUpdate({ tags: extra.tags.filter(x => x !== t) });
  };

  return (
    <div className="bg-black/20 rounded-lg overflow-hidden border border-[var(--line)] flex flex-col">
      <div className="relative aspect-square bg-black/40">
        <img
          src={extraImageUrl(extra.filename)}
          alt={extra.name}
          className="w-full h-full object-cover"
        />
        <button
          onClick={() => setConfirmDelete(true)}
          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity"
          title="Delete"
        >
          <Trash2 size={11} className="text-red-400" />
        </button>
        {confirmDelete && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2 p-2">
            <p className="text-[10px] text-center">Delete this Extra?</p>
            <div className="flex gap-1">
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="px-2 py-1 text-[10px] bg-red-500 text-white rounded"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-[10px] bg-white/10 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setNameDraft(extra.name); setEditingName(false); }
            }}
            className="w-full bg-black border border-[var(--accent)] rounded px-1.5 py-0.5 text-xs outline-none"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="w-full text-left text-xs font-bold truncate hover:text-[var(--accent)] transition-colors"
            title="Click to rename"
          >
            {extra.name}
          </button>
        )}
        <div className="flex flex-wrap gap-1">
          {extra.tags.map(t => (
            <button
              key={t}
              onClick={() => removeTag(t)}
              className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded-full bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-red-500/30 hover:text-red-300 transition-colors"
              title="Click to remove"
            >
              {t}
            </button>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            }}
            onBlur={addTag}
            placeholder="+tag"
            className="w-12 bg-transparent text-[9px] uppercase tracking-wider outline-none border-b border-transparent focus:border-[var(--accent)] placeholder:opacity-40"
          />
        </div>
      </div>
    </div>
  );
};

// ── Pending upload card ──

interface PendingCardProps {
  pending: PendingUpload;
  existingTags: string[];
  onChange: (patch: Partial<PendingUpload>) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onRemove: () => void;
}

const PendingCard: React.FC<PendingCardProps> = ({ pending, existingTags, onChange, onAddTag, onRemoveTag, onRemove }) => {
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    return existingTags.filter(t => t.includes(q) && !pending.tags.includes(t)).slice(0, 6);
  }, [tagInput, existingTags, pending.tags]);

  const commitTag = (raw: string) => {
    onAddTag(raw);
    setTagInput('');
    setShowSuggestions(false);
  };

  return (
    <div className="flex gap-2 bg-black/20 border border-[var(--line)] rounded-lg p-2">
      <img
        src={pending.previewUrl}
        alt=""
        className="w-16 h-16 object-cover rounded shrink-0 bg-black/30"
      />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={pending.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Name"
            className="flex-1 bg-black border border-[var(--line)] rounded px-1.5 py-1 text-xs outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={onRemove}
            className="p-1 opacity-50 hover:opacity-100 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {pending.tags.map(t => (
            <button
              key={t}
              onClick={() => onRemoveTag(t)}
              className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded-full bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-red-500/30 hover:text-red-300 transition-colors"
            >
              {t}
            </button>
          ))}
          <div className="relative flex-1 min-w-[80px]">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTag(tagInput); }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onFocus={() => setShowSuggestions(true)}
              placeholder="+ tag"
              className="w-full bg-transparent text-[10px] outline-none border-b border-transparent focus:border-[var(--accent)] placeholder:opacity-40"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 top-full mt-1 z-10 bg-[var(--surface)] border border-[var(--line)] rounded-md shadow-lg py-1 min-w-[120px]">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); commitTag(s); }}
                    className="w-full text-left px-2 py-1 text-[10px] hover:bg-[var(--accent)] hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageExtrasModal;
