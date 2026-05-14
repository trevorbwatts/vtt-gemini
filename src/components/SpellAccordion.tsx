import React, { useState } from 'react';
import { cn } from '../types';
import { ChevronDown, Dices } from '../icons';
import { parseDamageType, DamageTypeBadge } from '../utils/damageColors';
import type { RollMode } from '../utils/actionParser';

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong><em>(.*?)<\/em><\/strong>/gi, '**$1**')
    .replace(/<em><\/em>/gi, '')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?[uo]l>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="text-white/80 font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function renderDesc(desc: string): React.ReactNode[] {
  const normalized = desc.includes('<') ? htmlToMarkdown(desc) : desc;
  return normalized.split('\n\n').map((block, i) => {
    const lines = block.split('\n');
    if (lines.length > 1 && lines.every(l => l.startsWith('• '))) {
      return (
        <ul key={i} className="space-y-0.5 ml-0.5">
          {lines.map((line, j) => (
            <li key={j} className="flex gap-1.5">
              <span className="opacity-50 shrink-0">•</span>
              <span>{renderInline(line.slice(2))}</span>
            </li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{renderInline(block)}</p>;
  });
}

/** Expandable spell card used in token detail panels and player drawers */
export const SpellAccordion: React.FC<{
  name: string; desc?: string; badge?: string; rangeBadge?: string; aoeBadge?: React.ReactNode; saveBadge?: string;
  onCast?: () => void;
  onPlace?: () => void;
  onRoll?: (mode: RollMode) => void;
}> = ({ name, desc, badge, rangeBadge, aoeBadge, saveBadge, onCast, onPlace, onRoll }) => {
  const damageType = desc ? parseDamageType(desc) : null;
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
            <DamageTypeBadge damageType={damageType} />
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
        {onPlace && !onCast && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlace(); }}
            className="shrink-0 px-2.5 py-1 mr-2 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
          >
            Place
          </button>
        )}
        {onRoll && !onCast && !onPlace && (
          <div className="flex items-center gap-1 mr-2 shrink-0">
            <Dices size={12} className="text-orange-400/50" />
            {(['NRML', 'ADV', 'DIS'] as const).map((label) => {
              const mode: RollMode = label === 'NRML' ? 'normal' : label === 'ADV' ? 'advantage' : 'disadvantage';
              return (
                <button
                  key={label}
                  onClick={(e) => { e.stopPropagation(); onRoll(mode); }}
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-orange-400/20 text-orange-400/60 hover:text-orange-400 hover:border-orange-400/50 hover:bg-orange-400/10 transition-all"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {hasDesc && open && (
        <div className="px-3 pb-2.5 text-[11px] opacity-60 leading-relaxed border-t border-white/5 pt-2 space-y-1.5">
          {renderDesc(desc!)}
        </div>
      )}
    </div>
  );
};
