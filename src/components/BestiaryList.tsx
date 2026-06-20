import { useRef, useState, useLayoutEffect } from 'react';
import { Skull } from 'lucide-react';
import { Monster, cn } from '../types';

const ROW_HEIGHT = 52; // px — must match the row's fixed height below
const OVERSCAN = 6; // extra rows rendered above/below the viewport for smooth scrolling

interface BestiaryListProps {
  monsters: Monster[];
  selectedId: string | null;
  onSelect: (m: Monster) => void;
}

/**
 * Virtualized monster list. Only the rows visible in the scroll viewport (plus a
 * small overscan) are mounted, so opening the Bestiary and selecting a monster stay
 * fast even with 1,000+ entries. A spacer div preserves the full scroll height.
 */
export function BestiaryList({ monsters, selectedId, onSelect }: BestiaryListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);

  // Track the viewport height (it changes when the bottom controls appear/disappear).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = monsters.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const visible = monsters.slice(startIdx, endIdx);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      className="flex-1 overflow-y-auto"
    >
      <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
        {visible.map((m, i) => {
          const idx = startIdx + i;
          const isSelected = selectedId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m)}
              style={{ position: 'absolute', top: idx * ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: 0 }}
              className={cn(
                "text-left px-3 text-sm transition-colors flex items-center gap-3 group",
                isSelected ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
              )}
            >
              {m.avatar ? (
                <img
                  src={m.avatar}
                  alt={m.name}
                  loading="lazy"
                  decoding="async"
                  className="w-9 h-9 rounded-full object-cover shrink-0 bg-black/20"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-black/20 flex items-center justify-center shrink-0">
                  <Skull size={14} className="opacity-30" />
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold truncate">{m.name}</span>
                <span className={cn("text-[10px] opacity-50 truncate", isSelected ? "text-white" : "")}>{m.type}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <span className={cn("text-[10px] font-sans opacity-50", isSelected ? "text-white" : "")}>CR {m.cr}</span>
                <span className={cn("text-[9px] font-sans opacity-30", isSelected ? "text-white" : "")}>{m.source}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
