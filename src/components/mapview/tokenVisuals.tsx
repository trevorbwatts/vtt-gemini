import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Image as KonvaImage, Circle, Group, Arc, Line, Path, Rect, RegularPolygon } from 'react-konva';
import Konva from 'konva';

export const TOKEN_IMAGE_CACHE_MAX = 50;
export const tokenImageCache = new Map<string, HTMLImageElement>();

export const TokenAvatar: React.FC<{ url: string; radius: number }> = ({ url, radius }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) return;
    if (tokenImageCache.has(url)) {
      // Move to end (most recently used) for LRU ordering
      const cached = tokenImageCache.get(url)!;
      tokenImageCache.delete(url);
      tokenImageCache.set(url, cached);
      setImage(cached);
      return;
    }
    const img = new window.Image();
    img.src = url;
    img.onload = () => {
      // Evict oldest entry if cache is full
      if (tokenImageCache.size >= TOKEN_IMAGE_CACHE_MAX) {
        const oldest = tokenImageCache.keys().next().value;
        if (oldest !== undefined) tokenImageCache.delete(oldest);
      }
      tokenImageCache.set(url, img);
      setImage(img);
    };
  }, [url]);

  if (!image) return null;

  const size = radius * 2;
  const minDim = Math.min(image.width, image.height);

  return (
    <KonvaImage
      image={image}
      width={size}
      height={size}
      x={-radius}
      y={-radius}
      cornerRadius={radius}
      crop={{
        x: (image.width - minDim) / 2,
        y: (image.height - minDim) / 2,
        width: minDim,
        height: minDim,
      }}
    />
  );
};

/**
 * Static glowing ring around the active combatant's token.
 * No animation — avoids interfering with the Konva layer's rendering.
 */
export const ActiveTurnRing: React.FC<{ radius: number; tokenScale: number; color?: string }> = ({ radius, tokenScale, color }) => {
  const ringColor = color || '#fbbf24';
  return (
    <>
      {/* Outer glow — no shadowBlur for GPU perf */}
      <Circle
        radius={radius + 6 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={3 * tokenScale}
        opacity={0.15}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Mid glow */}
      <Circle
        radius={radius + 5 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={1.5 * tokenScale}
        opacity={0.3}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Inner bright ring */}
      <Circle
        radius={radius + 3 * tokenScale}
        fill=""
        stroke={ringColor}
        strokeWidth={2.5 * tokenScale}
        opacity={0.85}
        listening={false}
        perfectDrawEnabled={false}
      />
    </>
  );
};

/** Target crosshair — blue reticle for targeted monsters. Kept visually distinct from the red engaged-range ring. */
export const TargetRing: React.FC<{ radius: number; tokenScale: number }> = ({ radius, tokenScale }) => {
  const r = radius + 6 * tokenScale;
  const band = 2.5 * tokenScale;
  const tickIn = r - 5 * tokenScale;
  const tickOut = r + 5 * tokenScale;
  const BLUE = '#60A5FA';

  // Four 60° arc segments centered on the diagonals, leaving gaps on the axes for the ticks.
  const arcRotations = [15, 105, 195, 285];
  // Tick marks crossing the ring at 12/3/6/9 o'clock.
  const ticks = [
    [0, -tickIn, 0, -tickOut],
    [tickIn, 0, tickOut, 0],
    [0, tickIn, 0, tickOut],
    [-tickIn, 0, -tickOut, 0],
  ];

  return (
    <>
      {/* Dark halo behind the reticle so it reads on light maps */}
      {arcRotations.map(rot => (
        <Arc
          key={`halo-${rot}`}
          innerRadius={r - band}
          outerRadius={r + band}
          angle={60}
          rotation={rot}
          fill="#000000"
          opacity={0.45}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
      {ticks.map((pts, i) => (
        <Line
          key={`halo-tick-${i}`}
          points={pts}
          stroke="#000000"
          strokeWidth={4 * tokenScale}
          opacity={0.45}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
      {/* Blue reticle */}
      {arcRotations.map(rot => (
        <Arc
          key={`arc-${rot}`}
          innerRadius={r - band / 2}
          outerRadius={r + band / 2}
          angle={60}
          rotation={rot}
          fill={BLUE}
          opacity={0.95}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
      {ticks.map((pts, i) => (
        <Line
          key={`tick-${i}`}
          points={pts}
          stroke={BLUE}
          strokeWidth={2 * tokenScale}
          opacity={0.95}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
};

/** Animated countdown ring for abilities with a duration */
export const CountdownRing: React.FC<{ radius: number; tokenScale: number; startTime: number; durationMs: number; color?: string }> = ({ radius, tokenScale, startTime, durationMs, color }) => {
  const [remainingRatio, setRemainingRatio] = useState(() => {
    const elapsed = Date.now() - startTime;
    return Math.max(0, 1 - elapsed / durationMs);
  });

  useEffect(() => {
    let frameId: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const ratio = 1 - elapsed / durationMs;
      if (ratio <= 0) {
        setRemainingRatio(0);
        return;
      }
      setRemainingRatio(ratio);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [startTime, durationMs]);

  if (remainingRatio <= 0) return null;

  return (
    <Arc
      angle={360 * remainingRatio}
      rotation={-90 + 360 * (1 - remainingRatio)} /* Move starting angle clockwise as time drains */
      innerRadius={radius + 4 * tokenScale}
      outerRadius={radius + 8 * tokenScale}
      fill={color || '#fcd34d'}
      opacity={0.8}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};

/**
 * Animated 4-chevron turn indicator that zooms in and fades out over 3 seconds.
 * Each chevron points inward from one of the 4 cardinal directions.
 */
export const TurnIndicatorChevrons: React.FC<{ radius: number; tokenScale: number }> = ({ radius, tokenScale }) => {
  const [progress, setProgress] = useState(0); // 0..1 over 3 seconds
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    setProgress(0);
    let raf: number;
    let lastUpdate = 0;
    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / 3000, 1);
      // Throttle React state updates to ~20fps to reduce GPU load
      if (now - lastUpdate >= 50 || p >= 1) {
        lastUpdate = now;
        setProgress(p);
      }
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (progress >= 1) return null;

  // Chevrons start far away and zoom in, then fade out
  const easeOut = 1 - Math.pow(1 - progress, 3); // cubic ease-out for zoom
  const startDist = radius + 30 * tokenScale;
  const endDist = radius + 4 * tokenScale;
  const dist = startDist + (endDist - startDist) * Math.min(easeOut * 2, 1); // zoom-in happens in first half
  const opacity = progress < 0.5 ? 0.9 : 0.9 * (1 - (progress - 0.5) * 2); // fade in second half
  const chevSize = 6 * tokenScale;

  // 4 chevrons: top, right, bottom, left — each pointing inward
  const chevrons = [
    { angle: -Math.PI / 2, label: 'top' },    // points down
    { angle: 0, label: 'right' },               // points left
    { angle: Math.PI / 2, label: 'bottom' },    // points up
    { angle: Math.PI, label: 'left' },           // points right
  ];

  return (
    <>
      {chevrons.map(({ angle, label }) => {
        const cx = Math.cos(angle) * dist;
        const cy = Math.sin(angle) * dist;
        // Chevron points inward: two lines forming a V.
        // We want the vertex at `(cx, cy)` (closest to token) and the arms extending outward.
        // So they extend away from the token along the same `angle`.
        const armAngle = angle;
        const arm1Angle = armAngle - 0.5;
        const arm2Angle = armAngle + 0.5;
        return (
          <Line
            key={label}
            points={[
              cx + Math.cos(arm1Angle) * chevSize,
              cy + Math.sin(arm1Angle) * chevSize,
              cx,
              cy,
              cx + Math.cos(arm2Angle) * chevSize,
              cy + Math.sin(arm2Angle) * chevSize,
            ]}
            stroke="#fbbf24"
            strokeWidth={2.5 * tokenScale}
            lineCap="round"
            lineJoin="round"
            opacity={opacity}
          />
        );
      })}
    </>
  );
};

// ── Lucide SVG path data for viewpoint icon (Eye, 24×24 viewBox) ──
export type IconNode = ['path' | 'rect' | 'circle', Record<string, string>];
export const VIEWPOINT_NODES: IconNode[] = [
  ['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }],
  ['circle', { cx: '12', cy: '12', r: '3' }],
];

// ── Lucide SVG path data for portal icons (24×24 viewBox) ──
export const DOOR_CLOSED_NODES: IconNode[] = [
  ['path', { d: 'M10 12h.01' }],
  ['path', { d: 'M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14' }],
  ['path', { d: 'M2 20h20' }],
];
export const DOOR_OPEN_NODES: IconNode[] = [
  ['path', { d: 'M11 20H2' }],
  ['path', { d: 'M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z' }],
  ['path', { d: 'M11 4H8a2 2 0 0 0-2 2v14' }],
  ['path', { d: 'M14 12h.01' }],
  ['path', { d: 'M22 20h-3' }],
];
export const GRID2X2_NODES: IconNode[] = [
  ['path', { d: 'M12 3v18' }],
  ['path', { d: 'M3 12h18' }],
  ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }],
];
export const BLINDS_NODES: IconNode[] = [
  ['path', { d: 'M3 3h18' }],
  ['path', { d: 'M20 7H8' }],
  ['path', { d: 'M20 11H8' }],
  ['path', { d: 'M10 19h10' }],
  ['path', { d: 'M8 15h12' }],
  ['path', { d: 'M4 3v14' }],
  ['circle', { cx: '4', cy: '19', r: '2' }],
];
