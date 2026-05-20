import React, { useState, useRef, useEffect } from 'react';
import { MapNote, MapNoteType } from '../types';
import {
  TreasureChest,
  BookOpenText,
  TriangleAlert,
  Sparkles,
  Skull,
  Trash2,
  Edit2,
  FileText,
  ChevronLeft,
  Info,
  Image as ImageIcon,
  Eye,
  EyeOff,
  RotateCw,
  Upload,
  Music,
} from '../icons';

interface DMNotesProps {
  notes: MapNote[];
  onChange: (notes: MapNote[]) => void;
  title: string;
  onTitleChange?: (title: string) => void;
  onClose?: () => void;
  highlightedNoteId?: string | null;
  onNoteNavigate?: (note: MapNote) => void;
  /** Currently displayed image-note id (from the active scenario), or null. Drives the Show/Hide button label. */
  displayedImageNoteId?: string | null;
  /** Toggle this image note as the active overlay on the player + DM screens. */
  onToggleDisplayImage?: (noteId: string) => void;
}

export const NoteIcon = ({ type, size = 16, className = "" }: { type: MapNoteType; size?: number; className?: string }) => {
  switch (type) {
    case 'quote': return <BookOpenText size={size} className={`text-blue-400 ${className}`} />;
    case 'treasure': return <TreasureChest size={size} className={`text-[var(--accent)] ${className}`} />;
    case 'warning': return <TriangleAlert size={size} className={`text-red-400 ${className}`} />;
    case 'magic': return <Sparkles size={size} className={`text-cyan-400 ${className}`} />;
    case 'poison': return <Skull size={size} className={`text-green-600 ${className}`} />;
    case 'image': return <ImageIcon size={size} className={`text-purple-400 ${className}`} />;
    case 'sound': return <Music size={size} className={`text-amber-400 ${className}`} />;
    default: return null;
  }
};

export const DMNotes: React.FC<DMNotesProps> = ({ notes, onChange, title, onTitleChange, onClose, highlightedNoteId, onNoteNavigate, displayedImageNoteId, onToggleDisplayImage }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightedRef = useRef<HTMLDivElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const [replacingNoteId, setReplacingNoteId] = useState<string | null>(null);

  const rotateNote = (id: string) => {
    onChange(notes.map(n => {
      if (n.id !== id) return n;
      const next = ((n.imageRotation || 0) + 90) % 360;
      return { ...n, imageRotation: next };
    }));
  };

  const replaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = replacingNoteId;
    setReplacingNoteId(null);
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : undefined;
      if (!data) return;
      onChange(notes.map(n => n.id === id ? { ...n, imageData: data, imageRotation: 0 } : n));
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (highlightedNoteId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedNoteId]);

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingId]);

  const removeNote = (id: string) => {
    onChange(notes.filter(n => n.id !== id));
  };

  const startEdit = (note: MapNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const commitEdit = () => {
    if (editingId) {
      onChange(notes.map(n => n.id === editingId ? { ...n, content: editContent } : n));
      setEditingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent relative z-10">
      <div className="h-10 px-3 border-b border-[var(--line)] bg-black/5 flex justify-between items-center shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity group"
        >
          <FileText size={12} className="opacity-50 group-hover:opacity-100 transition-opacity" />
          <h3 className="text-[10px] uppercase tracking-widest opacity-50 group-hover:opacity-100 font-sans font-bold transition-opacity">Notes</h3>
        </button>
        <button onClick={onClose} className="opacity-30 hover:opacity-100 transition-opacity">
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center p-4">
            <Info size={32} className="mb-2" />
            <p className="text-xs font-sans uppercase tracking-widest">No map notes yet</p>
            <p className="text-[10px] mt-1">Right-click on the map to add a note</p>
          </div>
        ) : (
          notes.map((note) => {
            const isHighlighted = note.id === highlightedNoteId;
            const isEditing = note.id === editingId;
            return (
              <div
                key={note.id}
                ref={isHighlighted ? highlightedRef : undefined}
                onClick={() => onNoteNavigate?.(note)}
                className={`group px-3 py-2 rounded border transition-all ${onNoteNavigate ? 'cursor-pointer' : ''} ${
                  isHighlighted
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--line)] bg-[var(--surface-hover)] hover:border-[var(--accent)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <NoteIcon type={note.type} />
                  </div>
                  {isEditing ? (
                    <textarea
                      ref={textareaRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                      className="flex-1 min-w-0 text-sm text-[var(--ink)] bg-black/20 border border-[var(--accent)]/50 rounded px-2 py-1 resize-none leading-relaxed font-sans"
                      rows={Math.max(2, Math.ceil(editContent.length / 30))}
                    />
                  ) : note.type === 'image' ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      {note.imageData ? (
                        <div className="rounded overflow-hidden border border-[var(--line)] bg-black/30 flex items-center justify-center" style={{ minHeight: 80 }}>
                          <img
                            src={note.imageData}
                            alt=""
                            className="max-w-full max-h-[140px] object-contain"
                            style={{ transform: `rotate(${note.imageRotation || 0}deg)`, transition: 'transform 200ms' }}
                          />
                        </div>
                      ) : (
                        <div className="rounded border border-dashed border-[var(--line)] py-4 text-center text-[10px] uppercase tracking-widest opacity-40">
                          No image
                        </div>
                      )}
                      {note.content && (
                        <p className="text-xs text-[var(--ink)] opacity-70 whitespace-pre-wrap break-words leading-relaxed font-sans">
                          {note.content}
                        </p>
                      )}
                      <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onToggleDisplayImage?.(note.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-widest font-bold transition-colors ${
                            displayedImageNoteId === note.id
                              ? 'bg-[var(--accent)] text-white'
                              : 'bg-black/20 hover:bg-[var(--accent)]/20 text-[var(--accent)]'
                          }`}
                          title={displayedImageNoteId === note.id ? 'Hide from players' : 'Show on player screen'}
                          disabled={!note.imageData}
                        >
                          {displayedImageNoteId === note.id ? <EyeOff size={11} /> : <Eye size={11} />}
                          {displayedImageNoteId === note.id ? 'Hide' : 'Show'}
                        </button>
                        <button
                          onClick={() => rotateNote(note.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-widest font-bold bg-black/20 hover:bg-[var(--accent)]/20 text-[var(--accent)] transition-colors"
                          title="Rotate 90°"
                          disabled={!note.imageData}
                        >
                          <RotateCw size={11} />
                          Rotate
                        </button>
                        <button
                          onClick={() => { setReplacingNoteId(note.id); replaceImageInputRef.current?.click(); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] uppercase tracking-widest font-bold bg-black/20 hover:bg-[var(--accent)]/20 text-[var(--accent)] transition-colors"
                          title="Replace image"
                        >
                          <Upload size={11} />
                          Replace
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--ink)] flex-1 min-w-0 whitespace-pre-wrap break-words leading-relaxed font-sans">
                      {note.content}
                    </p>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => startEdit(note)}
                      className="p-1 hover:bg-[var(--accent)]/10 rounded text-[var(--accent)] transition-all"
                      title={note.type === 'image' ? 'Edit caption' : 'Edit Note'}
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => removeNote(note.id)}
                      className="p-1 hover:bg-[var(--accent)]/10 rounded text-[var(--accent)] transition-all"
                      title="Remove Note"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <input
        ref={replaceImageInputRef}
        type="file"
        accept="image/*"
        onChange={replaceImage}
        className="hidden"
      />
    </div>
  );
};
