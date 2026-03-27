import React, { useState } from 'react';
import { cn } from '../types';
import { ChevronDown } from '../icons';

/** Expandable spell card used in token detail panels and player drawers */
export const SpellAccordion: React.FC<{
  name: string; desc?: string; badge?: string; rangeBadge?: string; aoeBadge?: React.ReactNode; saveBadge?: string;
  onCast?: () => void;
}> = ({ name, desc, badge, rangeBadge, aoeBadge, saveBadge, onCast }) => {
  const [open, setOpen] = useState(false);
  const hasDesc = !!desc;
  return (
    <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg text-sm overflow-hidden">
      <div className="flex items-center">
        <button onClick={() => hasDesc && setOpen(o => !o)}
          className={cn('flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left',
            hasDesc ? 'cursor-pointer hover:bg-white/5 transition-colors' : 'cursor-default')}>
          <span className="font-bold flex-1 min-w-0 truncate text-purple-400 text-xs">{name}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {saveBadge && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-500/10 text-red-400">
                {saveBadge}
              </span>
            )}
            {aoeBadge && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-500/15 text-purple-300">
                {aoeBadge}
              </span>
            )}
            {rangeBadge && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 text-white/30">
                {rangeBadge}
              </span>
            )}
            {badge && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded opacity-40">
                {badge}
              </span>
            )}
          </div>
          {hasDesc && <ChevronDown size={13} className={cn('shrink-0 opacity-40 transition-transform duration-200', open && 'rotate-180')} />}
        </button>
        {onCast && (
          <button
            onClick={(e) => { e.stopPropagation(); onCast(); }}
            className="shrink-0 px-2.5 py-1 mr-2 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
          >
            Cast
          </button>
        )}
      </div>
      {hasDesc && open && (
        <div className="px-3 pb-2.5 text-[11px] opacity-60 leading-relaxed border-t border-white/5 pt-2">
          {desc}
        </div>
      )}
    </div>
  );
};
