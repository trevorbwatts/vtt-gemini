import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Music, DoorClosed, Blinds, Sparkles, Trash2, Plus, Search } from '../icons';
import type { SoundBindings } from '../services/soundBindings';
import { loadSoundBindings, saveSoundBindings } from '../services/soundBindings';
import { useSounds } from '../data/sounds';
import { searchSpells } from '../data/spellDatabase';
import { SoundPicker } from './SoundPicker';
import { cn } from '../types';

interface SoundBindingsModalProps {
  onClose: () => void;
}

type InteractionKey = 'doorOpen' | 'doorClose' | 'windowOpen' | 'windowClose';

const INTERACTION_ROWS: { key: InteractionKey; label: string; sub: string; icon: 'door' | 'window' }[] = [
  { key: 'doorOpen',    label: 'Door opens',    sub: 'Plays when a closed door is opened',    icon: 'door' },
  { key: 'doorClose',   label: 'Door closes',   sub: 'Plays when an open door is closed',     icon: 'door' },
  { key: 'windowOpen',  label: 'Window opens',  sub: 'Plays when a closed window is opened',  icon: 'window' },
  { key: 'windowClose', label: 'Window closes', sub: 'Plays when an open window is closed',   icon: 'window' },
];

/**
 * Editor for the DM's global sound bindings. Two sections:
 *
 *   1. Built-in interactions: door open/close, window open/close.
 *   2. Spell sounds: search the spell database and bind any spell to a sound.
 *
 * All bindings are stored in localStorage (see services/soundBindings.ts).
 */
export const SoundBindingsModal: React.FC<SoundBindingsModalProps> = ({ onClose }) => {
  const { sounds } = useSounds();
  const [bindings, setBindings] = useState<SoundBindings>(() => loadSoundBindings());
  const [pickerFor, setPickerFor] = useState<{ kind: 'interaction'; key: InteractionKey } | { kind: 'spell'; spellName: string } | null>(null);
  const [spellSearch, setSpellSearch] = useState('');
  const [addSpellMode, setAddSpellMode] = useState(false);

  useEffect(() => {
    saveSoundBindings(bindings);
  }, [bindings]);

  const soundNameFor = (id: string | null): string => {
    if (!id) return '';
    return sounds.find(s => s.id === id)?.name ?? id;
  };

  const setInteraction = (key: InteractionKey, soundId: string | null) => {
    setBindings(prev => ({ ...prev, [key]: soundId }));
  };

  const setSpellBinding = (spellName: string, soundId: string | null) => {
    setBindings(prev => {
      const spells = { ...prev.spells };
      if (soundId) {
        spells[spellName] = soundId;
      } else {
        delete spells[spellName];
      }
      return { ...prev, spells };
    });
  };

  const spellResults = useMemo(() => {
    if (!spellSearch.trim()) return [];
    return searchSpells(spellSearch, 12);
  }, [spellSearch]);

  const boundSpellNames = useMemo(() => Object.keys(bindings.spells).sort((a, b) => a.localeCompare(b)), [bindings.spells]);

  const content = (
    <div
      className="fixed inset-0 z-[205] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1512] border border-[var(--accent)]/40 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--accent)]/20">
          <div className="flex items-center gap-2">
            <Music size={16} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-sm uppercase tracking-[0.15em] font-bold">Sound Bindings</h2>
              <div className="text-[10px] opacity-50">Tier 3 — interactions and spells</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost px-2">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Interactions */}
          <div className="p-5 border-b border-[var(--accent)]/15">
            <div className="text-[11px] uppercase tracking-[0.15em] opacity-60 font-bold mb-3">Interactions</div>
            <div className="flex flex-col gap-2">
              {INTERACTION_ROWS.map(row => {
                const soundId = bindings[row.key];
                const Icon = row.icon === 'door' ? DoorClosed : Blinds;
                return (
                  <div key={row.key} className="flex items-center gap-3 bg-[#0f0c0a]/60 border border-[var(--accent)]/15 rounded-md p-3">
                    <Icon size={16} className="opacity-60" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{row.label}</div>
                      <div className="text-[10px] opacity-50">{row.sub}</div>
                    </div>
                    <div className={cn('text-xs truncate max-w-[200px]', soundId ? 'opacity-80' : 'opacity-40 italic')}>
                      {soundId ? soundNameFor(soundId) : 'No sound bound'}
                    </div>
                    <button
                      onClick={() => setPickerFor({ kind: 'interaction', key: row.key })}
                      className="btn-ghost text-xs"
                    >
                      {soundId ? 'Change' : 'Bind'}
                    </button>
                    {soundId && (
                      <button
                        onClick={() => setInteraction(row.key, null)}
                        className="btn-ghost px-1.5"
                        title="Clear"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spells */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.15em] opacity-60 font-bold flex items-center gap-1.5">
                <Sparkles size={12} /> Spell Sounds
              </div>
              <button
                onClick={() => setAddSpellMode(v => !v)}
                className="btn-ghost text-xs"
              >
                <Plus size={12} />
                <span>{addSpellMode ? 'Done' : 'Bind a Spell'}</span>
              </button>
            </div>

            {addSpellMode && (
              <div className="mb-3 p-3 bg-[#0f0c0a]/40 border border-[var(--accent)]/20 rounded-md">
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search spells by name..."
                    value={spellSearch}
                    onChange={(e) => setSpellSearch(e.target.value)}
                    className="w-full bg-[#0f0c0a] border border-[var(--accent)]/20 rounded pl-7 pr-2 py-1.5 text-xs"
                  />
                </div>
                {spellResults.length > 0 ? (
                  <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                    {spellResults.map(s => {
                      const alreadyBound = bindings.spells[s.name];
                      return (
                        <button
                          key={`${s.name}-${s.source ?? ''}`}
                          onClick={() => {
                            setPickerFor({ kind: 'spell', spellName: s.name });
                            setAddSpellMode(false);
                            setSpellSearch('');
                          }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--accent)]/15 bg-[#1a1512] hover:border-[var(--accent)]/40 transition-colors text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">{s.name}</div>
                            <div className="text-[10px] opacity-50">Level {s.level} {s.school ? '• ' + s.school : ''}</div>
                          </div>
                          {alreadyBound && (
                            <span className="text-[10px] uppercase opacity-60">already bound</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : spellSearch.trim() ? (
                  <div className="text-[11px] opacity-50 text-center py-2">No matching spells.</div>
                ) : (
                  <div className="text-[11px] opacity-50 text-center py-2">Start typing to find a spell.</div>
                )}
              </div>
            )}

            {boundSpellNames.length === 0 ? (
              <div className="text-center text-xs opacity-50 py-8">
                No spells bound yet. Click <span className="text-[var(--accent)]">Bind a Spell</span> to add one.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {boundSpellNames.map(name => {
                  const soundId = bindings.spells[name];
                  return (
                    <div key={name} className="flex items-center gap-3 bg-[#0f0c0a]/60 border border-[var(--accent)]/15 rounded-md p-2.5">
                      <Sparkles size={14} className="opacity-50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{name}</div>
                        <div className="text-[10px] opacity-60 truncate">→ {soundNameFor(soundId)}</div>
                      </div>
                      <button
                        onClick={() => setPickerFor({ kind: 'spell', spellName: name })}
                        className="btn-ghost text-xs"
                      >
                        Change
                      </button>
                      <button
                        onClick={() => setSpellBinding(name, null)}
                        className="btn-ghost px-1.5"
                        title="Unbind"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {pickerFor && (
        <SoundPicker
          title={
            pickerFor.kind === 'interaction'
              ? INTERACTION_ROWS.find(r => r.key === pickerFor.key)?.label ?? 'Pick a sound'
              : pickerFor.spellName
          }
          subtitle={pickerFor.kind === 'spell' ? 'Plays on Confirm Cast' : undefined}
          selectedId={
            pickerFor.kind === 'interaction'
              ? bindings[pickerFor.key]
              : bindings.spells[pickerFor.spellName] ?? null
          }
          defaultCategory="interaction"
          allowClear
          onPick={(soundId) => {
            if (pickerFor.kind === 'interaction') {
              setInteraction(pickerFor.key, soundId);
            } else {
              setSpellBinding(pickerFor.spellName, soundId);
            }
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
};
