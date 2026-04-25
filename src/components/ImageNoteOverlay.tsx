import React from 'react';
import { RotateCw, X } from '../icons';
import { motion, AnimatePresence } from 'motion/react';

interface ImageNoteOverlayProps {
  imageData?: string;
  caption?: string;
  rotation: number;
  onRotate: () => void;
  /** Only the DM passes this — players have no close button. */
  onClose?: () => void;
}

export const ImageNoteOverlay: React.FC<ImageNoteOverlayProps> = ({
  imageData,
  caption,
  rotation,
  onRotate,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {imageData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-8"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center"
          >
            <img
              src={imageData}
              alt={caption || ''}
              className="max-w-[90vw] max-h-[80vh] object-contain shadow-2xl"
              style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 300ms ease' }}
            />
          </motion.div>

          {caption && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-6 max-w-2xl text-center text-white/90 font-serif text-lg leading-relaxed px-4"
            >
              {caption}
            </motion.p>
          )}

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={onRotate}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm uppercase tracking-widest transition-colors"
              title="Rotate 90°"
            >
              <RotateCw size={16} />
              Rotate
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 hover:bg-[var(--accent)]/40 text-white font-bold text-sm uppercase tracking-widest transition-colors"
                title="Close for everyone"
              >
                <X size={16} />
                Close
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
