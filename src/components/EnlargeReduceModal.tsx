import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronUp, ChevronDown } from '../icons';
import { cn } from '../types';

interface EnlargeReduceModalProps {
  isOpen: boolean;
  onConfirm: (mode: 'enlarge' | 'reduce') => void;
  onClose: () => void;
}

export const EnlargeReduceModal: React.FC<EnlargeReduceModalProps> = ({ isOpen, onConfirm, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onPointerDown={(e) => {
            // Only dismiss if the pointerdown originated on the backdrop itself,
            // not on the modal content. Prevents the triggering tap (which
            // opened the modal via onPointerDown on the Cast button) from
            // immediately dismissing it when the pointerup lands here.
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl p-5 w-[280px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/70"
            >
              <X size={14} />
            </button>

            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400 mb-0.5">Transmutation</p>
              <h2 className="text-base font-bold text-white">Enlarge / Reduce</h2>
              <p className="text-[11px] text-white/40 mt-1">Choose an effect, then click a token on the map.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onConfirm('enlarge')}
                className={cn(
                  'flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all',
                  'bg-orange-500/10 border-orange-500/30 text-orange-400',
                  'hover:bg-orange-500/20 hover:border-orange-500/50 active:scale-95'
                )}
              >
                <ChevronUp size={22} />
                <div className="text-center">
                  <p className="text-xs font-bold">Enlarge</p>
                  <p className="text-[9px] opacity-60 mt-0.5">+1 size category</p>
                </div>
              </button>

              <button
                onClick={() => onConfirm('reduce')}
                className={cn(
                  'flex flex-col items-center gap-2 py-4 px-3 rounded-xl border transition-all',
                  'bg-blue-500/10 border-blue-500/30 text-blue-400',
                  'hover:bg-blue-500/20 hover:border-blue-500/50 active:scale-95'
                )}
              >
                <ChevronDown size={22} />
                <div className="text-center">
                  <p className="text-xs font-bold">Reduce</p>
                  <p className="text-[9px] opacity-60 mt-0.5">−1 size category</p>
                </div>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
