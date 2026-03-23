import React from 'react';
import { cn } from '../types';

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

export const OnScreenKeyboard: React.FC<{
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}> = ({ onKeyPress, onBackspace, onClear }) => {
  const keyClass = 'flex items-center justify-center rounded bg-white/10 text-white/70 text-xs font-bold active:bg-purple-500/30 active:text-purple-300 transition-colors select-none';

  return (
    <div className="flex flex-col gap-1 py-2">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 justify-center">
          {row.map(ch => (
            <button
              key={ch}
              onPointerDown={(e) => { e.preventDefault(); onKeyPress(ch.toLowerCase()); }}
              className={cn(keyClass, 'w-[26px] h-[36px]')}
            >
              {ch}
            </button>
          ))}
        </div>
      ))}
      {/* Bottom row: Clear, Space, Backspace */}
      <div className="flex gap-1 justify-center">
        <button
          onPointerDown={(e) => { e.preventDefault(); onClear(); }}
          className={cn(keyClass, 'px-2 h-[36px] text-[10px] text-red-400/70')}
        >
          CLR
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onKeyPress(' '); }}
          className={cn(keyClass, 'flex-1 h-[36px] max-w-[140px]')}
        >
          space
        </button>
        <button
          onPointerDown={(e) => { e.preventDefault(); onBackspace(); }}
          className={cn(keyClass, 'px-2 h-[36px] text-[10px]')}
        >
          &#9003;
        </button>
      </div>
    </div>
  );
};
