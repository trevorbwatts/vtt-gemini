import React from 'react';
import { MapNote, MapNoteType } from '../types';
import {
  TreasureChest,
  BookOpenText,
  TriangleAlert,
  Eye,
  Search,
  Trash2,
  FileText,
  ChevronLeft,
  Info,
} from '../icons';

interface DMNotesProps {
  notes: MapNote[];
  onChange: (notes: MapNote[]) => void;
  title: string;
  onTitleChange?: (title: string) => void;
  onClose?: () => void;
}

export const NoteIcon = ({ type, size = 16, className = "" }: { type: MapNoteType; size?: number; className?: string }) => {
  switch (type) {
    case 'treasure': return <TreasureChest size={size} className={`text-[var(--accent)] ${className}`} />;
    case 'quote': return <BookOpenText size={size} className={`text-blue-400 ${className}`} />;
    case 'warning': return <TriangleAlert size={size} className={`text-red-400 ${className}`} />;
    case 'secret': return <Eye size={size} className={`text-purple-400 ${className}`} />;
    case 'clue': return <Search size={size} className={`text-emerald-500 ${className}`} />;
    default: return null;
  }
};

export const DMNotes: React.FC<DMNotesProps> = ({ notes, onChange, title, onTitleChange, onClose }) => {
  const removeNote = (id: string) => {
    onChange(notes.filter(n => n.id !== id));
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
          notes.map((note) => (
            <div
              key={note.id}
              className="group px-3 py-2 rounded border border-[var(--line)] bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <NoteIcon type={note.type} />
                </div>
                <p className="text-sm text-[var(--ink)] flex-1 min-w-0 whitespace-pre-wrap break-words leading-relaxed font-serif italic">
                  {note.content}
                </p>
                <button
                  onClick={() => removeNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[var(--accent)]/10 rounded text-[var(--accent)] transition-all shrink-0"
                  title="Remove Note"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
