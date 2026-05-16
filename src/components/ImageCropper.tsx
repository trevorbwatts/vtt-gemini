import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, ZoomIn, ZoomOut, Check, RefreshCw } from '../icons';
import { cn } from '../types';

interface ImageCropperProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

const CANVAS_SIZE = 300;
const CROP_RADIUS = 120;
const OUTPUT_SIZE = 256;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onConfirm, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const initialZoom = useRef(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const scale = Math.max(CROP_RADIUS * 2 / img.width, CROP_RADIUS * 2 / img.height);
      initialZoom.current = scale;
      setZoom(scale);
      setOffset({ x: 0, y: 0 });
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const handleReset = () => {
    setZoom(initialZoom.current);
    setOffset({ x: 0, y: 0 });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const drawW = img.width * zoom;
    const drawH = img.height * zoom;
    const drawX = cx - drawW / 2 + offset.x;
    const drawY = cy - drawH / 2 + offset.y;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(cx, cy, CROP_RADIUS, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CROP_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }, [zoom, offset]);

  useEffect(() => {
    if (imageLoaded) draw();
  }, [imageLoaded, draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    });
  };

  const handlePointerUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * delta)));
  };

  const adjustZoom = (direction: 1 | -1) => {
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (1 + direction * 0.15))));
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = OUTPUT_SIZE;
    offscreen.height = OUTPUT_SIZE;
    const ctx = offscreen.getContext('2d')!;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = OUTPUT_SIZE / (CROP_RADIUS * 2);
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const drawW = img.width * zoom;
    const drawH = img.height * zoom;
    const drawX = cx - drawW / 2 + offset.x;
    const drawY = cy - drawH / 2 + offset.y;

    const srcX = (drawX - (cx - CROP_RADIUS)) * scale;
    const srcY = (drawY - (cy - CROP_RADIUS)) * scale;

    ctx.drawImage(img, srcX, srcY, drawW * scale, drawH * scale);
    onConfirm(offscreen.toDataURL('image/png'));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--line)] bg-black/10">
          <h2 className="text-lg font-serif font-bold tracking-tight">Crop Avatar</h2>
          <button onClick={onCancel} className="p-2 hover:bg-black/5 rounded-full transition-colors opacity-50 hover:opacity-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          <p className="text-xs opacity-40 text-center">Drag to reposition. Scroll to zoom.</p>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className={cn("rounded-xl border border-[var(--line)] bg-black", dragging ? "cursor-grabbing" : "cursor-grab")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          />

          <div className="flex items-center gap-3">
            <button onClick={() => adjustZoom(-1)} className="p-2 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100">
              <ZoomOut size={18} />
            </button>
            <div className="w-24 h-1.5 bg-white/10 rounded-full relative">
              <div
                className="absolute top-0 left-0 h-full bg-[var(--accent)] rounded-full"
                style={{ width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
              />
            </div>
            <button onClick={() => adjustZoom(1)} className="p-2 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100">
              <ZoomIn size={18} />
            </button>
            <button onClick={handleReset} className="p-2 rounded-lg hover:bg-white/10 transition-colors opacity-60 hover:opacity-100" title="Reset">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={onCancel} className="btn-text opacity-40 hover:opacity-100 px-4 py-2">
              Cancel
            </button>
            <button onClick={handleConfirm} className="btn-filled px-6 py-2.5 rounded-lg flex items-center gap-2">
              <Check size={14} />
              Apply Crop
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
