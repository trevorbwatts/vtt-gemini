import React from 'react';
import { RotateCw, X } from '../icons';
import { motion, AnimatePresence } from 'motion/react';

interface ImageNoteOverlayProps {
  imageData?: string;
  caption?: string;
  rotation: number;
  /** Only the DM passes this — players cannot rotate. */
  onRotate?: () => void;
  /** Only the DM passes this — players have no close button. */
  onClose?: () => void;
}

// Reserve room at the bottom of the viewport for the controls bar + caption.
// Bar is ~72px (button height + padding); add breathing room for caption.
const BOTTOM_RESERVED = 200; // px

export const ImageNoteOverlay: React.FC<ImageNoteOverlayProps> = ({
  imageData,
  caption,
  rotation,
  onRotate,
  onClose,
}) => {
  const showBar = !!onRotate || !!onClose;
  // Only reserve bottom space when controls bar is present.
  const bottomReserved = showBar ? BOTTOM_RESERVED : 0;
  const maxImgHeight = `calc(100vh - ${bottomReserved}px - 4rem)`; // 4rem = p-8 padding

  return (
    <AnimatePresence>
      {imageData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm overflow-hidden"
        >
          {/* Image area — fills the viewport minus the reserved bottom space (if any). */}
          <div
            className="absolute inset-x-0 top-0 flex flex-col items-center justify-center p-8"
            style={{ bottom: `${bottomReserved}px` }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative flex items-center justify-center"
              style={{ maxWidth: '90vw', maxHeight: '100%' }}
            >
              <img
                src={imageData}
                alt={caption || ''}
                className="object-contain shadow-2xl"
                style={{
                  maxWidth: rotation % 180 !== 0 ? maxImgHeight : '90vw',
                  maxHeight: rotation % 180 !== 0 ? `min(90vw, ${maxImgHeight})` : maxImgHeight,
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 300ms ease',
                }}
              />
            </motion.div>

            {caption && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-4 max-w-2xl text-center text-white/90 font-serif text-lg leading-relaxed px-4"
              >
                {caption}
              </motion.p>
            )}
          </div>

          {/* Controls bar — fixed to the bottom, independent of the image layout. */}
          {showBar && (
            <div className="absolute inset-x-0 bottom-0 h-[120px] flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent">
              {onRotate && (
                <button
                  onClick={onRotate}
                  className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm uppercase tracking-widest transition-colors"
                  title="Rotate 90°"
                >
                  <RotateCw size={16} />
                  Rotate
                </button>
              )}
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
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
