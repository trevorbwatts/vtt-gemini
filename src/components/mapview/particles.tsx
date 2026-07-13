import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Circle, Group, Arc, Line, Path, Rect, RegularPolygon } from 'react-konva';
import Konva from 'konva';
import { hexToRgb, getSchoolColor } from './helpers';

/**
 * Fire particles streaming outward from the hot face of Wall of Fire.
 * p0/p1 are the two endpoints of the hot edge in layer/world coords.
 * normalX/normalY is the unit vector pointing away from that face.
 */
export const WallOfFireParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 90;
  const BASE_PERIOD = 1300;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);                            // position along edge 0..1
    const drift = wallLen * (0.05 + rand(i, 4) * 0.16);  // outward drift distance
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.015; // tiny sideways wobble
    const sizeMul = 0.3 + rand(i, 6) * 0.85;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * phase * drift;
    const y = by + normalY * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice particles drifting outward from both faces of Wall of Ice.
 * Light blue shards, structure matches WallOfFireParticles.
 */
export const WallOfIceParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 100;
  const BASE_PERIOD = 1700;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.12);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wip${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#a7d8ff"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice particles for Wall of Ice (Dome). Emits from the dome circumference
 * drifting gently inward, light blue tones.
 */
export const WallOfIceDomeParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.1 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    // Mix: mostly inward, some outward for "frost shedding" feel
    const dir = rand(i, 11) < 0.7 ? -1 : 1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`widp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#a7d8ff"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Force particles shimmering along both faces of Wall of Force.
 * Purple/violet tones, bidirectional like WallOfIceParticles.
 */
export const WallOfForceParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 100;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.03 + rand(i, 4) * 0.1);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f3e8ff' : shade > 0.33 ? '#c084fc' : '#a855f7';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c084fc"
        shadowBlur={size * 3}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Force particles for Wall of Force (Dome). Emits along the dome circumference,
 * drifting gently, purple/violet tones.
 */
export const WallOfForceDomeParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1900;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.08 + rand(i, 4) * 0.18);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    const dir = rand(i, 11) < 0.5 ? -1 : 1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.1 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f3e8ff' : shade > 0.33 ? '#c084fc' : '#a855f7';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfdp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c084fc"
        shadowBlur={size * 3}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Wind particles streaming outward from both faces of Wind Wall.
 * Gray tones, same structure as WallOfFireParticles but bidirectional.
 */
export const WindWallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 110;
  const BASE_PERIOD = 1200;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);                            // position along edge 0..1
    const drift = wallLen * (0.06 + rand(i, 4) * 0.2);   // outward drift distance
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;  // sideways wobble
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    // Half the particles blow to each side
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wwp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#aaaaaa"
        shadowBlur={size * 2.5}
        shadowOpacity={0.7}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Radiant particles streaming outward from both faces of Wall of Light.
 * Yellow/gold tones, same bidirectional structure as WindWallParticles.
 */
export const WallOfLightParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 110;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.06 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#fff3a3' : '#ffd84a';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wlp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ffe066"
        shadowBlur={size * 3}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Sand particles swirling along both faces of Wall of Sand.
 * Tan/brown tones, with a gentle swirl to feel granular and dusty.
 */
export const WallOfSandParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 140;
  const BASE_PERIOD = 1600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.14);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.025;
    const sizeMul = 0.25 + rand(i, 6) * 0.7;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    // Swirl: sideways oscillation grows with phase for a dusty curl feel
    const swirlAmp = wallLen * 0.015 * sizeMul;
    const swirlFreq = 2 + rand(i, 12) * 3;
    const swirl = Math.sin(phase * Math.PI * swirlFreq + rand(i, 13) * Math.PI * 2) * swirlAmp * phase;

    const alongX = wallDirX * tAlong * wallLen + swirl * wallDirX;
    const alongY = wallDirY * tAlong * wallLen + swirl * wallDirY;
    const bx = p0.x + alongX + jitter * (-wallDirY);
    const by = p0.y + alongY + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.12;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.5);
    const size = Math.max(0.4, 1.6 * sizeMul * (1 - phase * 0.25));
    const shade = rand(i, 9);
    // Sand palette: pale dune → warm sand → dark ochre
    const fill = shade > 0.75 ? '#f5e4b5' : shade > 0.45 ? '#d9b982' : shade > 0.2 ? '#b5894f' : '#8b6230';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wsp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#c9a468"
        shadowBlur={size * 1.8}
        shadowOpacity={0.55}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Prismatic Wall — dense band of particles along the wall length. Color is
 * driven by the particle's position along the wall plus a time offset, so the
 * seven rainbow hues flow through the wall like colored water through a hose.
 */
export const PrismaticWallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  // Seven prismatic layers, red → violet
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#6366f1', '#a855f7'];
  const shadowPalette = ['#b91c1c', '#c2410c', '#a16207', '#15803d', '#1d4ed8', '#4338ca', '#7e22ce'];

  const COUNT = 180;
  // Speed of color flow along the wall (cycles per second)
  const FLOW_SPEED = 0.35;
  // How many full rainbow cycles fit along the wall length
  const BANDS = 2.5;
  const particles: React.ReactElement[] = [];

  // Pulse period for per-particle in/out fade
  const BASE_PERIOD = 1300;

  for (let i = 0; i < COUNT; i++) {
    const tAlong = rand(i, 3);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    // Small side sway around the wall plane
    const swaySide = (rand(i, 11) - 0.5) * 2;
    const swayAmp = wallLen * 0.012 * (0.4 + rand(i, 12) * 0.8);
    const swayFreq = 0.8 + rand(i, 13) * 1.2;
    const sway = Math.sin(tick / 1000 * swayFreq + rand(i, 14) * Math.PI * 2) * swayAmp * swaySide;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sway;
    const y = by + normalY * sway;

    // Color cycles based on position along the wall plus time — the "hose" flow
    const colorPhase = (tAlong * BANDS + (tick / 1000) * FLOW_SPEED) % 1;
    const colorIdx = Math.floor(colorPhase * palette.length) % palette.length;
    const fill = palette[colorIdx];
    const shadow = shadowPalette[colorIdx];

    // Per-particle pulse so not every dot has the same brightness
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const pulse = ((tick / period) + offset) % 1;
    const pulseFade = pulse < 0.5 ? pulse * 2 : (1 - pulse) * 2;
    const opacity = 0.55 + pulseFade * 0.4;

    const sizeMul = 0.4 + rand(i, 6) * 0.9;
    const size = Math.max(0.6, 2.0 * sizeMul);
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`pwp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor={shadow}
        shadowBlur={size * 3.5}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Thorn particles drifting along both faces of Wall of Thorns.
 * Green palette to evoke brambles and foliage.
 */
export const WallOfThornsParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 120;
  const BASE_PERIOD = 1500;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.05 + rand(i, 4) * 0.18);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.02;
    const sizeMul = 0.35 + rand(i, 6) * 0.9;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d1fae5' : shade > 0.4 ? '#86efac' : shade > 0.18 ? '#22c55e' : '#15803d';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wtp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#15803d"
        shadowBlur={size * 2.5}
        shadowOpacity={0.75}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Thorn particles for Wall of Thorns (Ring). Emits from the ring circumference
 * radially both inward and outward with a green palette.
 */
export const WallOfThornsRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 100;
  const BASE_PERIOD = 1500;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.1 + rand(i, 4) * 0.22);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;
    const dir = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d1fae5' : shade > 0.4 ? '#86efac' : shade > 0.18 ? '#22c55e' : '#15803d';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wtrp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#15803d"
        shadowBlur={size * 2.5}
        shadowOpacity={0.8}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Soft golden motes drifting throughout a Hallow sphere. Suggests
 * hallowed/sanctified ground — slow, warm, even glow across the area.
 */
export const HallowParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  // Density scales with area, capped so giant 60ft circles stay performant.
  const COUNT = Math.min(220, Math.max(40, Math.round((radiusPx * radiusPx) / 110)));
  const BASE_PERIOD = 2600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 1.0);
    const offset = rand(i, 2);
    const phase = ((tick / period) + offset) % 1;
    // Sample uniformly inside the disc: r = R * sqrt(u)
    const u = rand(i, 3);
    const r = radiusPx * Math.sqrt(u);
    const a = rand(i, 4) * Math.PI * 2;
    // Small slow upward drift so it feels alive, not static
    const drift = (phase - 0.5) * 4;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a) - drift;
    const fade = phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8;
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 5) * 0.4);
    const size = 1.0 + rand(i, 6) * 1.6;
    const shade = rand(i, 7);
    const fill = shade > 0.7 ? '#fff7d6' : shade > 0.4 ? '#fde68a' : shade > 0.18 ? '#fbbf24' : '#f59e0b';
    particles.push(
      <Circle
        key={`hp${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#fbbf24"
        shadowBlur={size * 2.2}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Vertical "bars" suggested by parallel rows of violet sparks across the
 * Forcecage (Cage) footprint. Bars run perpendicular to the long axis.
 */
export const ForcecageBarsParticles: React.FC<{
  cx: number;
  cy: number;
  lengthPx: number;
  thicknessPx: number;
  angleRad: number;
}> = ({ cx, cy, lengthPx, thicknessPx, angleRad }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (lengthPx < 1 || thicknessPx < 1) return null;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  // Local axes: u = along length, v = along thickness
  const ux = cosA, uy = sinA;
  const vx = -sinA, vy = cosA;

  const halfL = lengthPx / 2;
  const halfT = thicknessPx / 2;

  // Suggest bars: a regular row of "columns" running across length,
  // each column shimmering top-to-bottom along the thickness.
  const BAR_COUNT = Math.max(6, Math.round(lengthPx / 14));
  const PER_BAR = 9;
  const BASE_PERIOD = 1800;
  const particles: React.ReactElement[] = [];

  for (let b = 0; b < BAR_COUNT; b++) {
    const uFrac = (b + 0.5) / BAR_COUNT; // 0..1
    const u = -halfL + uFrac * lengthPx;
    for (let k = 0; k < PER_BAR; k++) {
      const i = b * PER_BAR + k;
      const period = BASE_PERIOD * (0.7 + rand(i, 1) * 0.6);
      const offset = rand(i, 2);
      const phase = ((tick / period) + offset) % 1;
      const vFrac = (k + rand(i, 3) * 0.6) / PER_BAR; // 0..1 along thickness
      const v = -halfT + vFrac * thicknessPx;
      const jitterU = (rand(i, 4) - 0.5) * 1.5;
      const jitterV = (rand(i, 5) - 0.5) * 1.5;
      const x = cx + (u + jitterU) * ux + (v + jitterV) * vx;
      const y = cy + (u + jitterU) * uy + (v + jitterV) * vy;
      const fade = phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85;
      const opacity = Math.max(0, fade) * (0.5 + rand(i, 6) * 0.4);
      const size = 1.2 + rand(i, 7) * 1.4;
      const shade = rand(i, 8);
      const fill = shade > 0.7 ? '#ede9fe' : shade > 0.4 ? '#c4b5fd' : shade > 0.18 ? '#a78bfa' : '#7c3aed';
      particles.push(
        <Circle
          key={`fcb${i}`}
          x={x}
          y={y}
          radius={size}
          fill={fill}
          shadowColor="#7c3aed"
          shadowBlur={size * 2}
          shadowOpacity={0.85}
          opacity={opacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

/**
 * Soft, even violet shimmer filling the Forcecage (Box) footprint.
 * Used for the solid-box variant — no visible bars.
 */
export const ForcecageBoxParticles: React.FC<{
  cx: number;
  cy: number;
  lengthPx: number;
  thicknessPx: number;
  angleRad: number;
}> = ({ cx, cy, lengthPx, thicknessPx, angleRad }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (lengthPx < 1 || thicknessPx < 1) return null;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const ux = cosA, uy = sinA;
  const vx = -sinA, vy = cosA;

  const COUNT = Math.max(40, Math.round((lengthPx * thicknessPx) / 80));
  const BASE_PERIOD = 2000;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const phase = ((tick / period) + offset) % 1;
    const u = (rand(i, 3) - 0.5) * lengthPx;
    const v = (rand(i, 4) - 0.5) * thicknessPx;
    const x = cx + u * ux + v * vx;
    const y = cy + u * uy + v * vy;
    const fade = phase < 0.2 ? phase / 0.2 : 1 - (phase - 0.2) / 0.8;
    const opacity = Math.max(0, fade) * (0.35 + rand(i, 5) * 0.35);
    const size = 1.0 + rand(i, 6) * 1.6;
    const shade = rand(i, 7);
    const fill = shade > 0.7 ? '#ede9fe' : shade > 0.4 ? '#c4b5fd' : '#a78bfa';
    particles.push(
      <Circle
        key={`fcx${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#a78bfa"
        shadowBlur={size * 2}
        shadowOpacity={0.7}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Stone-dust motes drifting lazily inside a Passwall passage.
 * Brown/tan palette to evoke a freshly opened tunnel through stone.
 */
export const PasswallParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 60;
  const BASE_PERIOD = 2600;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.6 + rand(i, 1) * 1.0);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    // Drift along the long axis of the passage (rather than perpendicular)
    const drift = wallLen * (0.2 + rand(i, 4) * 0.4);
    // Stay within the passage thickness
    const lateral = (rand(i, 5) - 0.5) * wallLen * 0.06;
    const sizeMul = 0.4 + rand(i, 6) * 0.9;
    const dirSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const baseAlong = tAlong * wallLen;
    const along = baseAlong + dirSign * phase * drift;
    const x = p0.x + wallDirX * along + normalX * lateral;
    const y = p0.y + wallDirY * along + normalY * lateral;

    const fadeIn = 0.1 + rand(i, 7) * 0.12;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.3 + rand(i, 8) * 0.35);
    const size = Math.max(0.5, 1.6 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.7 ? '#d6c4a8' : shade > 0.4 ? '#a88c66' : shade > 0.18 ? '#7a5e3e' : '#5a4226';

    particles.push(
      <Circle
        key={`pwp${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Blade shards spinning along both faces of Blade Barrier.
 * Metallic silver palette, square/diamond shapes to evoke whirling steel.
 */
export const BladeBarrierParticles: React.FC<{
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  normalX: number;
  normalY: number;
}> = ({ p0, p1, normalX, normalY }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const wallLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (wallLen < 1) return null;
  const wallDirX = (p1.x - p0.x) / wallLen;
  const wallDirY = (p1.y - p0.y) / wallLen;

  const COUNT = 130;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const tAlong = rand(i, 3);
    const drift = wallLen * (0.04 + rand(i, 4) * 0.16);
    const jitter = (rand(i, 5) - 0.5) * wallLen * 0.025;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const sideSign = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const bx = p0.x + wallDirX * tAlong * wallLen + jitter * (-wallDirY);
    const by = p0.y + wallDirY * tAlong * wallLen + jitter * wallDirX;
    const x = bx + normalX * sideSign * phase * drift;
    const y = by + normalY * sideSign * phase * drift;

    const fadeIn = 0.06 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 8) * 0.4);
    const size = Math.max(0.6, 2.4 * sizeMul * (1 - phase * 0.35));
    const shade = rand(i, 9);
    const fill = shade > 0.75 ? '#ffffff' : shade > 0.45 ? '#e2e8f0' : shade > 0.2 ? '#94a3b8' : '#64748b';
    const rotation = (rand(i, 10) * 360 + tick * (0.4 + rand(i, 12) * 0.6)) % 360;

    particles.push(
      <RegularPolygon
        key={`bbp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#cbd5e1"
        shadowBlur={size * 2.2}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Blade shards for Blade Barrier (Ring). Emits from the ring circumference
 * radially both inward and outward with a metallic silver palette.
 */
export const BladeBarrierRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
}> = ({ cx, cy, radiusPx }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 140;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.08 + rand(i, 4) * 0.2);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.4 + rand(i, 6) * 0.95;
    const dir = rand(i, 11) < 0.5 ? 1 : -1;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.06 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 8) * 0.4);
    const size = Math.max(0.6, 2.2 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 9);
    const fill = shade > 0.75 ? '#ffffff' : shade > 0.45 ? '#e2e8f0' : shade > 0.2 ? '#94a3b8' : '#64748b';
    const rotation = (rand(i, 10) * 360 + tick * (0.4 + rand(i, 12) * 0.6)) % 360;

    particles.push(
      <RegularPolygon
        key={`bbrp${i}`}
        x={x}
        y={y}
        sides={4}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#cbd5e1"
        shadowBlur={size * 2.2}
        shadowOpacity={0.9}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles for Wall of Fire (Ring). Emits from the ring circumference
 * radially inward or outward depending on hotSide.
 */
export const WallOfFireRingParticles: React.FC<{
  cx: number;
  cy: number;
  radiusPx: number;
  hotSide: 'inside' | 'outside';
}> = ({ cx, cy, radiusPx, hotSide }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  if (radiusPx < 1) return null;

  const COUNT = 90;
  const BASE_PERIOD = 1300;
  const dir = hotSide === 'outside' ? 1 : -1;
  const particles: React.ReactElement[] = [];

  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const drift = radiusPx * (0.12 + rand(i, 4) * 0.22);
    const jitter = (rand(i, 5) - 0.5) * 0.04;
    const sizeMul = 0.3 + rand(i, 6) * 0.85;

    const phase = ((tick / period) + offset) % 1;

    const angle = baseAngle + jitter;
    const nx = Math.cos(angle) * dir;
    const ny = Math.sin(angle) * dir;
    const bx = cx + Math.cos(angle) * radiusPx;
    const by = cy + Math.sin(angle) * radiusPx;
    const x = bx + nx * phase * drift;
    const y = by + ny * phase * drift;

    const fadeIn = 0.08 + rand(i, 7) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, 2 * sizeMul * (1 - phase * 0.45));
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';
    const rotation = rand(i, 10) * 360;

    particles.push(
      <RegularPolygon
        key={`wfrp${i}`}
        x={x}
        y={y}
        sides={3}
        radius={size}
        rotation={rotation}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.85}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Dr. Strange–style particle ring for Fireball. Particles orbit the AoE
 * perimeter clockwise, drifting outward with a small trail and fading.
 * Cheap: one RAF loop, pure trig — no per-particle state.
 */
export const FireballParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Deterministic hash-based pseudo-random in [0,1) so each particle keeps
  // its own stable "personality" across frames without any state.
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 120;
  const BASE_PERIOD = 1600;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const inward = rand(i, 11) < 0.38; // ~38% of particles spiral inward
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.45 + rand(i, 3) * 0.9);
    const drift = radius * (0.04 + rand(i, 4) * 0.22);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.04;
    const sizeMul = 0.35 + rand(i, 7) * 0.9;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    // Inward particles start at ring and travel toward center; outward drift away
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.55 + rand(i, 12) * 0.35))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.55 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.008 * sizeMul * (1 - phase * 0.4));
    const warm = rand(i, 10);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`p${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#ff5a00"
        shadowBlur={size * 2.5}
        shadowOpacity={0.8}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire-damage spells whose AoE shape should render with the same Fireball-style
 * ember/particle treatment. Centralized so it can be reused across the placed
 * preview, the remote echo, and persisted markers.
 */
export const FIRE_SPELLS_SPHERE = new Set<string>([
  'Fireball',
  'Flaming Sphere',
  'Delayed Blast Fireball',
  'Incendiary Cloud',
  'Meteor Swarm',
  'Flame Strike',
]);
export const FIRE_SPELLS_CONE = new Set<string>([
  'Burning Hands',
]);
export const FIRE_SPELLS_LINE = new Set<string>([
  "Aganazzar's Scorcher",
  'Investiture of Flame',
]);
export const FIRE_SPELLS_CUBE = new Set<string>([
  'Fire Storm',
]);
export const isFireSphereSpell = (n?: string) => !!n && FIRE_SPELLS_SPHERE.has(n);
export const isFireConeSpell = (n?: string) => !!n && FIRE_SPELLS_CONE.has(n);
export const isFireLineSpell = (n?: string) => !!n && FIRE_SPELLS_LINE.has(n);
export const isFireCubeSpell = (n?: string) => !!n && FIRE_SPELLS_CUBE.has(n);

export const THUNDER_SPELLS_SPHERE = new Set<string>(['Shatter', 'Storm of Vengeance']);
export const THUNDER_SPELLS_CUBE = new Set<string>(['Thunderwave']);
export const THUNDER_SPELLS_EMANATION = new Set<string>(['Thunderclap']);
export const isThunderSphereSpell = (n?: string) => !!n && THUNDER_SPELLS_SPHERE.has(n);
export const isThunderCubeSpell = (n?: string) => !!n && THUNDER_SPELLS_CUBE.has(n);
export const isThunderEmanationSpell = (n?: string) => !!n && THUNDER_SPELLS_EMANATION.has(n);

export const LIGHTNING_SPELLS_SPHERE = new Set<string>(['Call Lightning', 'Lightning Arrow', 'Lightning Lure']);
export const LIGHTNING_SPELLS_LINE = new Set<string>(['Lightning Bolt']);
export const isLightningSphereSpell = (n?: string) => !!n && LIGHTNING_SPELLS_SPHERE.has(n);
export const isLightningLineSpell = (n?: string) => !!n && LIGHTNING_SPELLS_LINE.has(n);

/**
 * Fire particles filling a cone (Burning Hands). Cone is rendered in a local
 * frame where +x is forward; halfAngle bounds it on each side. Particles flow
 * from the apex outward, wobbling slightly, and fade near the far edge.
 */
export const FireConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 110;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.85);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.08 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.003 + rand(i, 5) * 0.005;
    const sizeMul = 0.35 + rand(i, 6) * 0.95;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.78;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.012 * sizeMul * (1 - phase * 0.35));
    const warm = rand(i, 8);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`fc${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#ff5a00" shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles streaming along a line spell (Aganazzar's Scorcher,
 * Investiture of Flame). Particles flow from origin to far end, wobbling.
 */
export const FireLineParticles: React.FC<{ length: number; width: number }> = ({ length, width }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 1000;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.85;
    const waveAmp = width * (0.06 + rand(i, 4) * 0.14);
    const waveFreq = 0.003 + rand(i, 5) * 0.005;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.5);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.012 * sizeMul);
    const warm = rand(i, 9);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    particles.push(
      <Circle
        key={`fl${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#ff5a00" shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Fire particles raining within a square footprint (Fire Storm). Particles
 * appear at random points across the cube and rise upward briefly before
 * fading — evokes burning columns of flame across the area.
 */
export const FireCubeParticles: React.FC<{ size: number }> = ({ size }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 160;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];
  const half = size / 2;
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const cx = (rand(i, 3) - 0.5) * size * 0.96;
    const cy = (rand(i, 4) - 0.5) * size * 0.96;
    const rise = size * (0.06 + rand(i, 5) * 0.12);
    const sizeMul = 0.4 + rand(i, 6) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = cx;
    const y = cy - phase * rise;

    const fadeIn = 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 7) * 0.45);
    const sizePx = Math.max(0.5, size * 0.008 * sizeMul * (1 - phase * 0.4));
    const warm = rand(i, 8);
    const fill = warm > 0.66 ? '#fff3b0' : warm > 0.33 ? '#ffb347' : '#ff7a1f';

    // Clamp inside the cube to avoid bleed outside the footprint
    if (Math.abs(x) > half || Math.abs(y) > half) continue;

    particles.push(
      <Circle
        key={`fb${i}`}
        x={x} y={y} radius={sizePx} fill={fill}
        shadowColor="#ff5a00" shadowBlur={sizePx * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice/cold AoE spell sets for sphere/cylinder shapes (Ice Knife, Snilloc's
 * Snowball Swarm, Otiluke's Freezing Sphere, Ice Storm, Sleet Storm) and cone
 * shapes (Cone of Cold, Investiture of Ice). Wind sets cover cone (Investiture
 * of Wind) and line (Gust of Wind) shapes.
 */
export const ICE_SPELLS_SPHERE = new Set<string>([
  'Ice Knife',
  "Snilloc's Snowball Swarm",
  "Otiluke's Freezing Sphere",
  'Ice Storm',
  'Sleet Storm',
]);
export const ICE_SPELLS_CONE = new Set<string>([
  'Cone of Cold',
  'Investiture of Ice',
]);
export const WIND_SPELLS_CONE = new Set<string>([
  'Investiture of Wind',
]);
export const WIND_SPELLS_LINE = new Set<string>([
  'Gust of Wind',
]);
export const isIceSphereSpell = (n?: string) => !!n && ICE_SPELLS_SPHERE.has(n);
export const isIceConeSpell = (n?: string) => !!n && ICE_SPELLS_CONE.has(n);
export const isWindConeSpell = (n?: string) => !!n && WIND_SPELLS_CONE.has(n);
export const isWindLineSpell = (n?: string) => !!n && WIND_SPELLS_LINE.has(n);

/**
 * Ice shards drifting around a sphere/cylinder AoE. Mirrors FireballParticles'
 * structure but uses light blue/white triangular shards with cold glow.
 */
export const IceSphereParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 110;
  const BASE_PERIOD = 2000;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const inward = rand(i, 11) < 0.32;
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.3 + rand(i, 3) * 0.7);
    const drift = radius * (0.05 + rand(i, 4) * 0.2);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.05;
    const sizeMul = 0.4 + rand(i, 7) * 0.95;
    const rotation = rand(i, 13) * 360;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.45 + rand(i, 12) * 0.4))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.009 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 10);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';

    particles.push(
      <RegularPolygon
        key={`isp${i}`}
        x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
        shadowColor="#a7d8ff" shadowBlur={size * 3} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Ice shards spreading outward through a cone (Cone of Cold, Investiture of
 * Ice). Mirrors FireConeParticles but with cold tones and triangular shards.
 */
export const IceConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 1400;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.95);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.06 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.0025 + rand(i, 5) * 0.004;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const rotation = rand(i, 11) * 360;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.8;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.014 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? '#ffffff' : shade > 0.33 ? '#cfeeff' : '#7ec8ee';

    particles.push(
      <RegularPolygon
        key={`icc${i}`}
        x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
        shadowColor="#a7d8ff" shadowBlur={size * 3} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Wind streaks fanning through a cone (Investiture of Wind). Gray tones,
 * mirrors GustOfWindParticles but distributed within a cone wedge.
 */
export const WindConeParticles: React.FC<{ length: number; halfAngle: number }> = ({ length, halfAngle }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 130;
  const BASE_PERIOD = 950;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.1 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.003 + rand(i, 5) * 0.005;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.4 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.01 * sizeMul);
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';

    particles.push(
      <Circle
        key={`wcc${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#aaaaaa" shadowBlur={size * 2.5} shadowOpacity={0.6}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/**
 * Poison/Acid/Necrotic AoE spell sets. Shapes covered:
 *   - Poison sphere: Cloudkill, Stinking Cloud (sickly green wisps)
 *   - Acid sphere/line: Acid Splash, Vitriolic Sphere, Tasha's Caustic Brew
 *   - Necrotic sphere/cone: Circle of Death, Abi-Dalzim's Horrid Wilting
 */
export const POISON_SPELLS_SPHERE = new Set<string>([
  'Cloudkill',
  'Stinking Cloud',
]);
export const ACID_SPELLS_SPHERE = new Set<string>([
  'Acid Splash',
  'Vitriolic Sphere',
]);
export const ACID_SPELLS_LINE = new Set<string>([
  "Tasha's Caustic Brew",
]);
export const NECROTIC_SPELLS_SPHERE = new Set<string>([
  'Circle of Death',
]);
export const NECROTIC_SPELLS_CONE = new Set<string>([
  "Abi-Dalzim's Horrid Wilting",
]);
export const isPoisonSphereSpell = (n?: string) => !!n && POISON_SPELLS_SPHERE.has(n);
export const isAcidSphereSpell = (n?: string) => !!n && ACID_SPELLS_SPHERE.has(n);
export const isAcidLineSpell = (n?: string) => !!n && ACID_SPELLS_LINE.has(n);
export const isNecroticSphereSpell = (n?: string) => !!n && NECROTIC_SPELLS_SPHERE.has(n);
export const isNecroticConeSpell = (n?: string) => !!n && NECROTIC_SPELLS_CONE.has(n);

/** Generic radial-AoE particle component, parameterized by palette/glow. */
export const RadialAoEParticles: React.FC<{
  radius: number;
  count?: number;
  basePeriod?: number;
  inwardChance?: number;
  palette: [string, string, string];
  glow: string;
  shape?: 'circle' | 'triangle';
}> = ({ radius, count = 110, basePeriod = 1700, inwardChance = 0.35, palette, glow, shape = 'circle' }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    const inward = rand(i, 11) < inwardChance;
    const period = basePeriod * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const sweep = Math.PI * (0.3 + rand(i, 3) * 0.7);
    const drift = radius * (0.05 + rand(i, 4) * 0.22);
    const baseAngle = rand(i, 5) * Math.PI * 2;
    const jitterR = (rand(i, 6) - 0.5) * radius * 0.05;
    const sizeMul = 0.4 + rand(i, 7) * 0.95;
    const rotation = rand(i, 13) * 360;

    const phase = ((tick / period) + offset) % 1;
    const angle = baseAngle + phase * sweep;
    const r = inward
      ? (radius + jitterR) * (1 - phase * (0.45 + rand(i, 12) * 0.4))
      : radius + jitterR + phase * drift;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    const fadeIn = 0.12 + rand(i, 8) * 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 9) * 0.4);
    const size = Math.max(0.5, radius * 0.009 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 10);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    if (shape === 'triangle') {
      particles.push(
        <RegularPolygon
          key={`rp${i}`}
          x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
          shadowColor={glow} shadowBlur={size * 3} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    } else {
      particles.push(
        <Circle
          key={`rp${i}`}
          x={x} y={y} radius={size} fill={fill}
          shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

export const THUNDER_PALETTE: [string, string, string] = ['#f9fafb', '#9ca3af', '#374151'];
export const THUNDER_GRADIENT = [0, 'rgba(156,163,175,0.40)', 0.35, 'rgba(107,114,128,0.28)', 0.7, 'rgba(55,65,81,0.14)', 1, 'rgba(31,41,55,0)'];

export const ThunderShockwaveParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const RING_COUNT = 6;
  const RING_PERIOD = 2000;
  const DEBRIS_COUNT = 50;
  const DEBRIS_PERIOD = 2400;

  const elements: React.ReactElement[] = [];

  for (let i = 0; i < RING_COUNT; i++) {
    const offset = i / RING_COUNT;
    const phase = ((tick / RING_PERIOD) + offset) % 1;
    const r = phase * radius;
    const strokeW = Math.max(0.5, radius * 0.025 * (1 - phase * 0.8));
    const opacity = (1 - phase) * 0.7;
    const shade = rand(i, 1);
    const stroke = shade > 0.5 ? '#f9fafb' : '#d1d5db';
    elements.push(
      <Circle
        key={`tr${i}`}
        x={0} y={0} radius={r} fill="" stroke={stroke} strokeWidth={strokeW}
        shadowColor="#e5e7eb" shadowBlur={strokeW * 4} shadowOpacity={0.6}
        opacity={Math.max(0, opacity)}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }

  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const period = DEBRIS_PERIOD * (0.6 + rand(i, 1) * 0.8);
    const offset = rand(i, 2);
    const baseAngle = rand(i, 3) * Math.PI * 2;
    const rBase = radius * (0.2 + rand(i, 4) * 0.75);
    const drift = radius * 0.08 * (rand(i, 5) - 0.5);
    const sizeMul = 0.3 + rand(i, 6) * 0.7;

    const phase = ((tick / period) + offset) % 1;
    const wobble = Math.sin(tick * 0.002 + i * 1.7) * radius * 0.03;
    const r = rBase + phase * drift + wobble;
    const x = Math.cos(baseAngle + phase * 0.3) * r;
    const y = Math.sin(baseAngle + phase * 0.3) * r;

    const fadeIn = 0.15;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.25 + rand(i, 7) * 0.3);
    const size = Math.max(0.5, radius * 0.007 * sizeMul);
    const shade = rand(i, 8);
    const fill = shade > 0.6 ? '#6b7280' : shade > 0.3 ? '#4b5563' : '#374151';

    elements.push(
      <Circle
        key={`td${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor="#9ca3af" shadowBlur={size * 2} shadowOpacity={0.4}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{elements}</>;
};

export const ThunderCubeParticles: React.FC<{ size: number }> = ({ size }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const RING_COUNT = 5;
  const RING_PERIOD = 1800;
  const DEBRIS_COUNT = 45;
  const DEBRIS_PERIOD = 2200;
  const half = size / 2;
  const maxRing = half * 0.95;

  const elements: React.ReactElement[] = [];

  for (let i = 0; i < RING_COUNT; i++) {
    const offset = i / RING_COUNT;
    const phase = ((tick / RING_PERIOD) + offset) % 1;
    const r = phase * maxRing;
    const strokeW = Math.max(0.5, size * 0.015 * (1 - phase * 0.8));
    const opacity = (1 - phase) * 0.65;
    const shade = rand(i, 1);
    const stroke = shade > 0.5 ? '#f9fafb' : '#d1d5db';
    elements.push(
      <Circle
        key={`tcr${i}`}
        x={0} y={0} radius={r} fill="" stroke={stroke} strokeWidth={strokeW}
        shadowColor="#e5e7eb" shadowBlur={strokeW * 3.5} shadowOpacity={0.5}
        opacity={Math.max(0, opacity)}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }

  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const period = DEBRIS_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const cx = (rand(i, 3) - 0.5) * size * 0.9;
    const cy = (rand(i, 4) - 0.5) * size * 0.9;
    const rise = size * (0.04 + rand(i, 5) * 0.08);
    const sizeMul = 0.3 + rand(i, 6) * 0.7;

    const phase = ((tick / period) + offset) % 1;
    const x = cx;
    const y = cy - phase * rise;

    if (Math.abs(x) > half || Math.abs(y) > half) continue;

    const fadeIn = 0.12;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.2 + rand(i, 7) * 0.3);
    const sizePx = Math.max(0.5, size * 0.006 * sizeMul);
    const shade = rand(i, 8);
    const fill = shade > 0.6 ? '#6b7280' : shade > 0.3 ? '#4b5563' : '#374151';

    elements.push(
      <Circle
        key={`tcd${i}`}
        x={x} y={y} radius={sizePx} fill={fill}
        shadowColor="#9ca3af" shadowBlur={sizePx * 2} shadowOpacity={0.4}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{elements}</>;
};

export const LIGHTNING_GRADIENT = [0, 'rgba(254,249,195,0.55)', 0.3, 'rgba(253,224,71,0.38)', 0.65, 'rgba(96,165,250,0.18)', 1, 'rgba(30,30,120,0)'];

export const LightningSphereParticles: React.FC<{ radius: number }> = ({ radius }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const SPARK_COUNT = 70;
  const ARC_COUNT = 4;
  const SPARK_PERIOD = 1200;

  const elements: React.ReactElement[] = [];

  for (let i = 0; i < SPARK_COUNT; i++) {
    const period = SPARK_PERIOD * (0.5 + rand(i, 1) * 0.6);
    const offset = rand(i, 2);
    const angle = rand(i, 3) * Math.PI * 2;
    const startR = radius * (0.05 + rand(i, 4) * 0.3);
    const travel = radius * (0.3 + rand(i, 9) * 0.55);

    const phase = ((tick / period) + offset) % 1;
    const eased = 1 - (1 - phase) * (1 - phase);
    const r = startR + eased * travel;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    if (r > radius) continue;

    const decay = 1 - phase;
    const opacity = Math.max(0, decay * decay) * (0.7 + rand(i, 5) * 0.3);
    const baseSize = radius * 0.012 * (0.6 + rand(i, 6) * 0.5);
    const size = Math.max(0.4, baseSize * decay);
    const fill = phase < 0.15 ? '#ffffff' : phase < 0.4 ? '#fefce8' : '#fde047';
    const glowColor = phase < 0.3 ? '#ffffff' : '#facc15';

    elements.push(
      <Circle
        key={`ls${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor={glowColor}
        shadowBlur={size * 4} shadowOpacity={0.9}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }

  for (let a = 0; a < ARC_COUNT; a++) {
    const arcSeed = Math.floor(tick / 200) + a * 37;
    const arcPhase = ((tick % 200) / 200);
    const visible = rand(a, arcSeed) > 0.3;
    if (!visible) continue;

    const startAngle = rand(a, arcSeed + 1) * Math.PI * 2;
    const startR = radius * (0.15 + rand(a, arcSeed + 2) * 0.5);
    const endAngle = startAngle + (rand(a, arcSeed + 3) - 0.5) * 2.5;
    const endR = radius * (0.2 + rand(a, arcSeed + 4) * 0.65);
    const sx = Math.cos(startAngle) * startR;
    const sy = Math.sin(startAngle) * startR;
    const ex = Math.cos(endAngle) * endR;
    const ey = Math.sin(endAngle) * endR;

    const segments = 8;
    const points: number[] = [sx, sy];
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const perpX = -(ey - sy);
      const perpY = (ex - sx);
      const pLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const jag = (rand(a, arcSeed + s * 10 + 5) - 0.5) * radius * 0.3;
      const mx = sx + (ex - sx) * t + (perpX / pLen) * jag;
      const my = sy + (ey - sy) * t + (perpY / pLen) * jag;
      points.push(mx, my);
    }
    points.push(ex, ey);

    const arcOpacity = (1 - arcPhase) * 0.7;
    elements.push(
      <Line
        key={`la${a}`}
        points={points}
        stroke="#fefce8"
        strokeWidth={Math.max(0.5, radius * 0.008)}
        shadowColor="#facc15"
        shadowBlur={radius * 0.04}
        shadowOpacity={0.8}
        opacity={Math.max(0, arcOpacity)}
        listening={false} perfectDrawEnabled={false}
        lineJoin="bevel"
      />
    );
  }

  return <>{elements}</>;
};

export const LightningLineParticles: React.FC<{ length: number; width: number }> = ({ length, width }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const SPARK_COUNT = 80;
  const ARC_COUNT = 3;
  const SPARK_PERIOD = 1000;
  const halfW = width * 0.45;

  const elements: React.ReactElement[] = [];

  for (let i = 0; i < SPARK_COUNT; i++) {
    const period = SPARK_PERIOD * (0.45 + rand(i, 1) * 0.6);
    const offset = rand(i, 2);
    const spawnX = rand(i, 3) * length;
    const spawnY = (rand(i, 8) - 0.5) * width * 0.3;
    const ejAngle = (rand(i, 9) - 0.5) * Math.PI * 0.8;
    const ejDist = width * (0.3 + rand(i, 10) * 0.6);

    const phase = ((tick / period) + offset) % 1;
    const eased = 1 - (1 - phase) * (1 - phase);
    const x = spawnX + Math.cos(ejAngle) * eased * ejDist * 0.3;
    const y = spawnY + Math.sin(ejAngle) * eased * ejDist;

    if (Math.abs(y) > halfW) continue;

    const decay = 1 - phase;
    const opacity = Math.max(0, decay * decay) * (0.65 + rand(i, 5) * 0.35);
    const baseSize = Math.min(length, width * 4) * 0.011 * (0.5 + rand(i, 6) * 0.6);
    const size = Math.max(0.4, baseSize * decay);
    const fill = phase < 0.15 ? '#ffffff' : phase < 0.4 ? '#fefce8' : '#fde047';
    const glowColor = phase < 0.3 ? '#ffffff' : '#facc15';

    elements.push(
      <Circle
        key={`lls${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor={glowColor}
        shadowBlur={size * 4} shadowOpacity={0.9}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }

  for (let a = 0; a < ARC_COUNT; a++) {
    const arcSeed = Math.floor(tick / 180) + a * 41;
    const arcPhase = ((tick % 180) / 180);
    const visible = rand(a, arcSeed) > 0.25;
    if (!visible) continue;

    const sx = rand(a, arcSeed + 1) * length * 0.8;
    const sy = (rand(a, arcSeed + 2) - 0.5) * width * 0.4;
    const ex = sx + (rand(a, arcSeed + 3) - 0.3) * length * 0.3;
    const ey = (rand(a, arcSeed + 4) - 0.5) * width * 0.6;

    const segments = 7;
    const points: number[] = [sx, sy];
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const jag = (rand(a, arcSeed + s * 10 + 5) - 0.5) * width * 0.7;
      const mx = sx + (ex - sx) * t + (rand(a, arcSeed + s * 10 + 6) - 0.5) * width * 0.15;
      const my = sy + (ey - sy) * t + jag;
      points.push(mx, my);
    }
    points.push(ex, ey);

    const arcOpacity = (1 - arcPhase) * 0.65;
    elements.push(
      <Line
        key={`lla${a}`}
        points={points}
        stroke="#fefce8"
        strokeWidth={Math.max(0.5, width * 0.04)}
        shadowColor="#facc15"
        shadowBlur={width * 0.15}
        shadowOpacity={0.8}
        opacity={Math.max(0, arcOpacity)}
        listening={false} perfectDrawEnabled={false}
        lineJoin="bevel"
      />
    );
  }

  return <>{elements}</>;
};

/** Generic cone particle component, parameterized by palette/glow. */
export const ConeAoEParticles: React.FC<{
  length: number;
  halfAngle: number;
  count?: number;
  basePeriod?: number;
  palette: [string, string, string];
  glow: string;
  shape?: 'circle' | 'triangle';
}> = ({ length, halfAngle, count = 120, basePeriod = 1300, palette, glow, shape = 'circle' }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < count; i++) {
    const period = basePeriod * (0.55 + rand(i, 1) * 0.95);
    const offset = rand(i, 2);
    const angle = (rand(i, 3) - 0.5) * 2 * halfAngle * 0.95;
    const wobbleAmp = halfAngle * 0.07 * (0.5 + rand(i, 4));
    const wobbleFreq = 0.0025 + rand(i, 5) * 0.005;
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const rotation = rand(i, 11) * 360;

    const phase = ((tick / period) + offset) % 1;
    const r = phase * length;
    const a = angle + Math.sin(tick * wobbleFreq + i) * wobbleAmp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    const fadeIn = 0.08;
    const fadeOut = 0.8;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.5 + rand(i, 7) * 0.45);
    const size = Math.max(0.5, length * 0.013 * sizeMul * (1 - phase * 0.3));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    if (shape === 'triangle') {
      particles.push(
        <RegularPolygon
          key={`rcp${i}`}
          x={x} y={y} sides={3} radius={size} rotation={rotation} fill={fill}
          shadowColor={glow} shadowBlur={size * 3} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    } else {
      particles.push(
        <Circle
          key={`rcp${i}`}
          x={x} y={y} radius={size} fill={fill}
          shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
          opacity={opacity}
          listening={false} perfectDrawEnabled={false}
        />
      );
    }
  }
  return <>{particles}</>;
};

/** Generic line particle component, parameterized by palette/glow. */
export const LineAoEParticles: React.FC<{
  length: number;
  width: number;
  palette: [string, string, string];
  glow: string;
}> = ({ length, width, palette, glow }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const COUNT = 130;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.5 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.85;
    const waveAmp = width * (0.06 + rand(i, 4) * 0.14);
    const waveFreq = 0.003 + rand(i, 5) * 0.005;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 8) * 0.5);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.012 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];

    particles.push(
      <Circle
        key={`rl${i}`}
        x={x} y={y} radius={size} fill={fill}
        shadowColor={glow} shadowBlur={size * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

/** Generic cube particle component (rising motes within a square footprint). */
export const CubeAoEParticles: React.FC<{
  size: number;
  palette: [string, string, string];
  glow: string;
  count?: number;
  basePeriod?: number;
}> = ({ size, palette, glow, count = 150, basePeriod = 1300 }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  useEffect(() => {
    let raf: number;
    const loop = () => { setTick(Date.now() - startRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const particles: React.ReactElement[] = [];
  const half = size / 2;
  for (let i = 0; i < count; i++) {
    const period = basePeriod * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const cx = (rand(i, 3) - 0.5) * size * 0.96;
    const cy = (rand(i, 4) - 0.5) * size * 0.96;
    const rise = size * (0.06 + rand(i, 5) * 0.12);
    const sizeMul = 0.4 + rand(i, 6) * 1.0;
    const phase = ((tick / period) + offset) % 1;
    const x = cx;
    const y = cy - phase * rise;
    const fadeIn = 0.1;
    const fade = phase < fadeIn ? phase / fadeIn : 1 - (phase - fadeIn) / (1 - fadeIn);
    const opacity = Math.max(0, fade) * (0.45 + rand(i, 7) * 0.45);
    const sizePx = Math.max(0.5, size * 0.008 * sizeMul * (1 - phase * 0.4));
    const shade = rand(i, 8);
    const fill = shade > 0.66 ? palette[0] : shade > 0.33 ? palette[1] : palette[2];
    if (Math.abs(x) > half || Math.abs(y) > half) continue;
    particles.push(
      <Circle
        key={`cb${i}`}
        x={x} y={y} radius={sizePx} fill={fill}
        shadowColor={glow} shadowBlur={sizePx * 2.5} shadowOpacity={0.85}
        opacity={opacity}
        listening={false} perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};

export const POISON_PALETTE: [string, string, string] = ['#bef264', '#65a30d', '#365314'];
export const ACID_PALETTE:   [string, string, string] = ['#ecfccb', '#a3e635', '#65a30d'];
export const NECROTIC_PALETTE: [string, string, string] = ['#d8b4fe', '#7e22ce', '#1e1b2e'];

export const POISON_GRADIENT = [0, 'rgba(132,204,22,0.45)', 0.5, 'rgba(101,163,13,0.30)', 0.85, 'rgba(54,83,20,0.15)', 1, 'rgba(20,40,10,0)'] as any;
export const ACID_GRADIENT   = [0, 'rgba(236,252,203,0.50)', 0.5, 'rgba(163,230,53,0.34)', 0.85, 'rgba(101,163,13,0.16)', 1, 'rgba(60,100,10,0)'] as any;
export const NECROTIC_GRADIENT = [0, 'rgba(168,85,247,0.45)', 0.5, 'rgba(126,34,206,0.30)', 0.85, 'rgba(60,20,90,0.16)', 1, 'rgba(20,8,40,0)'] as any;

/**
 * Remaining elemental damage types (Lightning, Thunder, Radiant, Psychic,
 * Force) routed through a single style table. Each entry provides palette,
 * glow color, radial gradient, and tuning for the generic particle components.
 */
export type ElementKey = 'radiant' | 'psychic' | 'force';
export const ELEMENT_STYLES: Record<ElementKey, {
  palette: [string, string, string];
  glow: string;
  gradient: any;
  basePeriod: number;
  inwardChance: number;
  shape: 'circle' | 'triangle';
}> = {
  radiant: {
    palette: ['#fffbeb', '#fde047', '#eab308'],
    glow: '#facc15',
    gradient: [0, 'rgba(255,251,235,0.65)', 0.45, 'rgba(253,224,71,0.40)', 0.85, 'rgba(234,179,8,0.18)', 1, 'rgba(140,100,8,0)'],
    basePeriod: 1900,
    inwardChance: 0.2,
    shape: 'circle',
  },
  psychic: {
    palette: ['#fbcfe8', '#e879f9', '#7e22ce'],
    glow: '#d946ef',
    gradient: [0, 'rgba(232,121,249,0.45)', 0.5, 'rgba(126,34,206,0.30)', 0.85, 'rgba(60,20,90,0.16)', 1, 'rgba(20,8,40,0)'],
    basePeriod: 2100,
    inwardChance: 0.55,
    shape: 'triangle',
  },
  force: {
    palette: ['#dbeafe', '#93c5fd', '#3b82f6'],
    glow: '#60a5fa',
    gradient: [0, 'rgba(219,234,254,0.55)', 0.5, 'rgba(147,197,253,0.32)', 0.85, 'rgba(59,130,246,0.16)', 1, 'rgba(20,40,120,0)'],
    basePeriod: 1500,
    inwardChance: 0.4,
    shape: 'circle',
  },
};

export const SPHERE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Sunburst': 'radiant',
  'Sickening Radiance': 'radiant',
  'Moonbeam': 'radiant',
  'Dawn': 'radiant',
  "Jallarzi's Storm of Radiance": 'radiant',
  'Conjure Celestial': 'radiant',
  'Synaptic Static': 'psychic',
  'Weird': 'psychic',
  'Sword Burst': 'force',
  'Conjure Volley': 'force',
};
export const CONE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Conjure Barrage': 'force',
};
export const LINE_ELEMENT_MAP: Record<string, ElementKey> = {
  'Sunbeam': 'radiant',
};
export const CUBE_ELEMENT_MAP: Record<string, ElementKey> = {
};
export const getSphereElement = (n?: string) => (n && SPHERE_ELEMENT_MAP[n]) || null;
export const getConeElement = (n?: string) => (n && CONE_ELEMENT_MAP[n]) || null;
export const getLineElement = (n?: string) => (n && LINE_ELEMENT_MAP[n]) || null;
export const getCubeElement = (n?: string) => (n && CUBE_ELEMENT_MAP[n]) || null;

/**
 * Wind particles streaming along a line for Gust of Wind. Particles flow
 * from origin to far end with mild perpendicular wave, in gray tones.
 * One RAF loop, pure trig — no per-particle state.
 */
export const GustOfWindParticles: React.FC<{ length: number; width: number }> = ({ length, width }) => {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf: number;
    const loop = () => {
      setTick(Date.now() - startRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rand = (i: number, salt: number) => {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const COUNT = 140;
  const BASE_PERIOD = 1100;
  const particles: React.ReactElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const period = BASE_PERIOD * (0.55 + rand(i, 1) * 0.9);
    const offset = rand(i, 2);
    const yJitter = (rand(i, 3) - 0.5) * width * 0.92;
    const waveAmp = width * (0.05 + rand(i, 4) * 0.12);
    const waveFreq = 0.0025 + rand(i, 5) * 0.004;
    const wavePhase = rand(i, 6) * Math.PI * 2;
    const sizeMul = 0.4 + rand(i, 7) * 1.0;

    const phase = ((tick / period) + offset) % 1;
    const x = phase * length;
    const yWave = Math.sin(tick * waveFreq + wavePhase + phase * Math.PI * 2) * waveAmp;
    const y = yJitter + yWave;

    const fadeIn = 0.08;
    const fadeOut = 0.82;
    let fade = 1;
    if (phase < fadeIn) fade = phase / fadeIn;
    else if (phase > fadeOut) fade = 1 - (phase - fadeOut) / (1 - fadeOut);
    const opacity = Math.max(0, fade) * (0.4 + rand(i, 8) * 0.45);
    const size = Math.max(0.5, Math.min(length, width * 4) * 0.01 * sizeMul);
    const shade = rand(i, 9);
    const fill = shade > 0.66 ? '#f0f0f0' : shade > 0.33 ? '#b5b5b5' : '#777777';

    particles.push(
      <Circle
        key={`g${i}`}
        x={x}
        y={y}
        radius={size}
        fill={fill}
        shadowColor="#aaaaaa"
        shadowBlur={size * 2.5}
        shadowOpacity={0.6}
        opacity={opacity}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  }
  return <>{particles}</>;
};
