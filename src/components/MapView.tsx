import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Path, Line } from 'react-konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster, WallSegment, Portal, GridResolution, WallPoint } from '../types';
import { parseUVTTFile } from '../services/uvttParser';
import { Upload, User, Skull, Shield, Swords, X, EyeOff, Eye, Trash2, ChevronRight, PlusCircle, Search, Map as MapIcon, FileText, Cloud, Sun, Moon, ChevronDown } from '../icons';
import { extractBlockingSegments, computeVisibilityPolygon, clipPolygonToCircle } from '../utils/visibility';
import { FogOfWarLayer } from './FogOfWarLayer';
import { motion, AnimatePresence } from 'motion/react';
import { NoteIcon } from './DMNotes';
import { BESTIARY } from '../data/bestiary';

interface MapViewProps {
  tokens: Token[];
  onTokensChange: (tokens: Token[]) => void;
  scenarioName: string;
  mapImage: string | undefined;
  onMapChange: (mapImage: string) => void;
  mapNotes: MapNote[];
  onMapNotesChange: (notes: MapNote[]) => void;
  players: Combatant[];
  npcs: Combatant[];
  persistentEnemies: Combatant[];
  scenarioCombatants: Combatant[];
  onAddEnemy: (monster: Monster, x: number, y: number) => void;
  onStartCombat: (tokenIds: string[]) => void;
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  onNoteClick?: (noteId: string) => void;
  onAddScenario?: () => void;
  panToNote?: MapNote | null;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  isPlayerView?: boolean;
  walls?: WallSegment[];
  objectWalls?: WallSegment[];
  portals?: Portal[];
  gridResolution?: GridResolution;
  onWallDataChange?: (walls: WallSegment[], objectWalls: WallSegment[], portals: Portal[], gridResolution: GridResolution) => void;
  onPortalToggle?: (portalId: string) => void;
  onDragStatusChange?: (isDragging: boolean) => void;
  onViewportCenter?: (center: { x: number; y: number }) => void;
  viewportCenter?: { x: number; y: number } | null;
  darknessLevel?: 'daylight' | 'dark';
  onDarknessLevelChange?: (level: 'daylight' | 'dark') => void;
}

function getTokenSizeMultiplier(size?: Token['size']): number {
  switch (size) {
    case 'Tiny':        return 0.5;
    case 'Small':       return 1;
    case 'Large':       return 2;
    case 'Huge':        return 3;
    case 'Gargantuan':  return 4;
    default:            return 1; // Medium / unset
  }
}

const TokenAvatar: React.FC<{ url: string; radius: number }> = ({ url, radius }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url;
    img.onload = () => setImage(img);
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

export const MapView: React.FC<MapViewProps> = ({
  tokens,
  onTokensChange,
  scenarioName,
  mapImage,
  onMapChange,
  mapNotes,
  onMapNotesChange,
  players,
  npcs,
  persistentEnemies,
  scenarioCombatants,
  onAddEnemy,
  onStartCombat,
  leftSidebarOpen,
  setLeftSidebarOpen,
  onNoteClick,
  onAddScenario,
  panToNote,
  rightSidebarOpen,
  setRightSidebarOpen,
  isPlayerView = false,
  walls,
  objectWalls,
  portals,
  gridResolution,
  onWallDataChange,
  onPortalToggle,
  onDragStatusChange,
  onViewportCenter,
  viewportCenter,
  darknessLevel,
  onDarknessLevelChange,
}) => {
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [contextMenu, setContextMenu] = useState<{
    x: number,
    y: number,
    stageX: number,
    stageY: number,
    view: 'root' | 'note' | 'add-player' | 'add-enemy' | 'add-npc'
  } | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'player' | 'npc' | null>(null);
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, tokenId: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string }>({ type: 'treasure', content: '' });
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [showChangeMapModal, setShowChangeMapModal] = useState(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [showSource2014, setShowSource2014] = useState(true);
  const [showSource2024, setShowSource2024] = useState(true);
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterQuantity, setMonsterQuantity] = useState(1);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [showWalls, setShowWalls] = useState(true);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const didMarqueeRef = useRef(false);

  const [showFog, setShowFog] = useState(true);
  const [darknessOpen, setDarknessOpen] = useState(false);
  // Use a ref for dragging positions so we can read them without triggering React re-renders.
  // Konva moves the node natively during drag; we just need the position for IPC broadcasts.
  const draggingPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const lastBroadcastRef = useRef(0);
  const BROADCAST_INTERVAL = 50; // ~20fps throttle — smooth on TV, much lighter on IPC
  // Live drag position overrides for player view — drives real-time fog recomputation
  const [livePlayerPos, setLivePlayerPos] = useState<Record<string, { x: number; y: number }>>({});

  const tokenRadius = gridResolution ? gridResolution.pixelsPerGrid * 0.4 : 20;
  const tokenScale = tokenRadius / 20;

  const blockingSegments = useMemo(
    () => extractBlockingSegments(walls || [], objectWalls || [], portals || []),
    [walls, objectWalls, portals]
  );

  const playerTokenPositions = useMemo(
    () => tokens.filter(t => t.type === 'player' && !t.hidden).map(t =>
      livePlayerPos[t.id] ? { ...t, ...livePlayerPos[t.id] } : t
    ),
    [tokens, livePlayerPos]
  );

  // DM-only unlimited visibility polygons (skip on player view — playerVisionData handles that)
  const visibilityPolygons = useMemo(
    () => {
      if (isPlayerView || !loadedImage) return [];
      return playerTokenPositions.map(t =>
        computeVisibilityPolygon(
          { x: t.x, y: t.y },
          blockingSegments,
          loadedImage.width,
          loadedImage.height
        )
      );
    },
    [playerTokenPositions, blockingSegments, loadedImage, isPlayerView]
  );

  // Player-view visibility: respects darkness level and per-token darkvision radius.
  // The DM view continues to use the unlimited `visibilityPolygons` above.
  const playerVisionData = useMemo((): WallPoint[][] => {
    if (!isPlayerView || !loadedImage) return [];

    const level = darknessLevel ?? 'dark';
    const allCombatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
    const fogPolygons: WallPoint[][] = [];
    const { width: mapW, height: mapH } = loadedImage;

    for (const t of playerTokenPositions) {
      const combatant = allCombatants.find(c => c.id === t.combatantId);
      const darkvisionFt = combatant?.darkvision ?? 0;
      const darkvisionPx = gridResolution
        ? (darkvisionFt / 5) * gridResolution.pixelsPerGrid
        : darkvisionFt * 4;
      const origin = { x: t.x, y: t.y };
      const fullPoly = computeVisibilityPolygon(origin, blockingSegments, mapW, mapH);

      if (level === 'daylight') {
        fogPolygons.push(fullPoly);
      } else {
        // Dark: only darkvision tokens can see, within their radius
        if (darkvisionFt > 0) {
          fogPolygons.push(clipPolygonToCircle(fullPoly, origin, darkvisionPx));
        }
        // 0 darkvision = no vision
      }
    }

    return fogPolygons;
  }, [isPlayerView, loadedImage, darknessLevel, playerTokenPositions, blockingSegments,
      players, npcs, persistentEnemies, scenarioCombatants, gridResolution]);

  const hasFogData = blockingSegments.length > 0;

  const getNoteColor = (type: MapNoteType) => {
    switch (type) {
      case 'treasure': return '#CD7F32';
      case 'quote': return '#60a5fa';
      case 'warning': return '#ef4444';
      case 'secret': return '#a855f7';
      case 'clue': return '#059669';
      default: return '#ffffff';
    }
  };

  const NoteMapIcon = ({ type }: { type: MapNoteType }) => {
    const noteRadius = tokenRadius * 0.6;
    const s = noteRadius / 28;
    const offset = -(12 * s);
    const sp = { stroke: 'white', strokeWidth: 2, lineCap: 'round' as const, lineJoin: 'round' as const, fill: '' };

    const icon = (() => {
      switch (type) {
        case 'treasure':
          return (
            <Group>
              <Path data="M10.5 3 8 9l4 13 4-13-2.5-6" {...sp} />
              <Path data="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" {...sp} />
              <Path data="M2 9h20" {...sp} />
            </Group>
          );
        case 'quote':
          return (
            <Group>
              <Path data="M12 7v14" {...sp} />
              <Path data="M16 12h2" {...sp} />
              <Path data="M16 8h2" {...sp} />
              <Path data="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" {...sp} />
              <Path data="M6 12h2" {...sp} />
              <Path data="M6 8h2" {...sp} />
            </Group>
          );
        case 'warning':
          return (
            <Group>
              <Path data="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" {...sp} />
              <Path data="M12 9v4" {...sp} />
              <Circle x={12} y={17} radius={0.5} fill="white" stroke="white" strokeWidth={1} />
            </Group>
          );
        case 'secret':
          return (
            <Group>
              <Path data="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" {...sp} />
              <Circle x={12} y={12} radius={3} {...sp} />
            </Group>
          );
        case 'clue':
          return (
            <Group>
              <Path data="m21 21-4.34-4.34" {...sp} />
              <Circle x={11} y={11} radius={8} {...sp} />
            </Group>
          );
        default:
          return null;
      }
    })();

    return <Group scale={{ x: s, y: s }} x={offset} y={offset}>{icon}</Group>;
  };

  useEffect(() => {
    if (mapImage) {
      const img = new Image();
      img.src = mapImage;
      img.onload = () => {
        setLoadedImage(img);
        if (dimensions.width > 0 && dimensions.height > 0) {
          // Target a consistent token screen size of ~40px radius
          const targetTokenScreenRadius = 18;
          let scale: number;

          if (gridResolution && gridResolution.pixelsPerGrid > 0) {
            // Token radius in source image = pixelsPerGrid * 0.4
            // We want (pixelsPerGrid * 0.4) * scale = targetTokenScreenRadius
            const sourceTokenRadius = gridResolution.pixelsPerGrid * 0.4;
            scale = targetTokenScreenRadius / sourceTokenRadius;
          } else {
            // No grid info: fit the map snugly in the viewport
            const padding = 80;
            scale = Math.min(
              (dimensions.width - padding) / img.width,
              (dimensions.height - padding) / img.height,
              1
            );
          }

          const clampedScale = Math.min(Math.max(scale, 0.05), 5);
          const finalScale = isPlayerView ? clampedScale * 1.15 : clampedScale;
          setStageScale(finalScale);
          if (isPlayerView && viewportCenter) {
            // Center the player's view on the same map-space point the DM is looking at
            setStagePos({
              x: dimensions.width / 2 - viewportCenter.x * finalScale,
              y: dimensions.height / 2 - viewportCenter.y * finalScale,
            });
          } else {
            setStagePos({
              x: (dimensions.width - img.width * finalScale) / 2,
              y: (dimensions.height - img.height * finalScale) / 2,
            });
          }
        }
      };
    } else {
      setLoadedImage(null);
    }
  }, [mapImage, gridResolution?.pixelsPerGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });

      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isUVTT = ['uvtt', 'dd2vtt', 'df2vtt'].includes(ext || '');

    if (isUVTT) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const result = parseUVTTFile(event.target?.result as string);
          onMapChange(result.mapImage);
          onWallDataChange?.(result.walls, result.objectWalls, result.portals, result.gridResolution);
        } catch (err) {
          alert(`Failed to parse UVTT file: ${(err as Error).message}`);
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onMapChange(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const multiDragStartRef = useRef<{
    draggedId: string;
    draggedStart: { x: number; y: number };
    othersStart: Record<string, { x: number; y: number }>;
  } | null>(null);

  const handleDragStart = (id: string) => {
    onDragStatusChange?.(true);
    const isMulti = selectedTokenIds.includes(id) && selectedTokenIds.length > 1;
    if (isMulti) {
      const draggedToken = tokens.find(t => t.id === id);
      if (!draggedToken) return;
      const othersStart: Record<string, { x: number; y: number }> = {};
      selectedTokenIds.forEach(tid => {
        if (tid !== id) {
          const t = tokens.find(tok => tok.id === tid);
          if (t) othersStart[tid] = { x: t.x, y: t.y };
        }
      });
      multiDragStartRef.current = {
        draggedId: id,
        draggedStart: { x: draggedToken.x, y: draggedToken.y },
        othersStart,
      };
    } else {
      multiDragStartRef.current = null;
    }
  };

  const handleDragMove = (id: string, e: any) => {
    const pos = { x: e.target.x(), y: e.target.y() };
    draggingPositionsRef.current[id] = pos;

    // Move all other selected tokens by the same delta
    const multi = multiDragStartRef.current;
    if (multi && multi.draggedId === id) {
      const dx = pos.x - multi.draggedStart.x;
      const dy = pos.y - multi.draggedStart.y;
      Object.entries(multi.othersStart).forEach(([tid, start]) => {
        draggingPositionsRef.current[tid] = { x: start.x + dx, y: start.y + dy };
      });
    }

    const now = Date.now();
    if (now - lastBroadcastRef.current < BROADCAST_INTERVAL) return;
    lastBroadcastRef.current = now;

    // Build live positions for fog/visibility and IPC
    const liveUpdates: Record<string, { x: number; y: number }> = { [id]: pos };
    const multi2 = multiDragStartRef.current;
    if (multi2 && multi2.draggedId === id) {
      const dx = pos.x - multi2.draggedStart.x;
      const dy = pos.y - multi2.draggedStart.y;
      Object.entries(multi2.othersStart).forEach(([tid, start]) => {
        liveUpdates[tid] = { x: start.x + dx, y: start.y + dy };
      });
    }
    setLivePlayerPos(prev => ({ ...prev, ...liveUpdates }));

    if (!isPlayerView) {
      const updatedTokens = tokens.map(t => liveUpdates[t.id] ? { ...t, ...liveUpdates[t.id] } : t);
      if (window.electronAPI?.sendDMTokenUpdate) {
        window.electronAPI.sendDMTokenUpdate(updatedTokens);
      }
    }
  };

  const handleDragEnd = (id: string, e: any) => {
    const finalPos = { x: e.target.x(), y: e.target.y() };
    const multi = multiDragStartRef.current;

    let updatedTokens;
    if (multi && multi.draggedId === id) {
      const dx = finalPos.x - multi.draggedStart.x;
      const dy = finalPos.y - multi.draggedStart.y;
      updatedTokens = tokens.map(t => {
        if (t.id === id) return { ...t, ...finalPos };
        if (multi.othersStart[t.id]) return { ...t, x: multi.othersStart[t.id].x + dx, y: multi.othersStart[t.id].y + dy };
        return t;
      });
      // Clear live overrides for all dragged tokens
      setLivePlayerPos(prev => {
        const next = { ...prev };
        delete next[id];
        Object.keys(multi.othersStart).forEach(tid => delete next[tid]);
        return next;
      });
      multiDragStartRef.current = null;
    } else {
      delete draggingPositionsRef.current[id];
      setLivePlayerPos(prev => { const next = { ...prev }; delete next[id]; return next; });
      updatedTokens = tokens.map(t => t.id === id ? { ...t, ...finalPos } : t);
    }

    onDragStatusChange?.(false);

    if (isPlayerView && window.electronAPI?.sendPlayerTokenUpdate) {
      window.electronAPI.sendPlayerTokenUpdate(updatedTokens);
    } else if (!isPlayerView && window.electronAPI?.sendDMTokenUpdate) {
      window.electronAPI.sendDMTokenUpdate(updatedTokens);
    }

    onTokensChange(updatedTokens);
  };

  const handleNoteDragEnd = (id: string, e: any) => {
    onMapNotesChange(mapNotes.map(n =>
      n.id === id ? { ...n, x: e.target.x(), y: e.target.y() } : n
    ));
  };

  const addToken = (type: Token['type']) => {
    const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#059669' };
    const newToken: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name: `New ${type}`,
      type,
      x: 50,
      y: 50,
      color: colors[type],
    };
    onTokensChange([...tokens, newToken]);
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();
    setTokenContextMenu(null);
    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    // Coordinates relative to the stage's draggable content
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(pointerPosition);

    setContextMenu({
      x: pos.x,
      y: pos.y,
      stageX: pointerPosition.x,
      stageY: pointerPosition.y,
      view: 'root'
    });
    setMonsterSearch('');
    setSelectedMonster(null);
    setMonsterQuantity(1);
    setActiveSubmenu(null);
  };

  const handleTokenContextMenu = (e: any, tokenId: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true; // Stop propagation to stage
    setContextMenu(null);

    const stage = e.target.getStage();
    const pointerPosition = stage.getPointerPosition();

    setTokenContextMenu({
      x: pointerPosition.x,
      y: pointerPosition.y,
      tokenId
    });
  };

  const toggleTokenVisibility = (tokenId: string) => {
    onTokensChange(tokens.map(t =>
      t.id === tokenId ? { ...t, hidden: !t.hidden } : t
    ));
    setTokenContextMenu(null);
  };

  const deleteToken = (tokenId: string) => {
    onTokensChange(tokens.filter(t => t.id !== tokenId));
    setSelectedTokenIds(prev => prev.filter(id => id !== tokenId));
    if (selectedTokenId === tokenId) {
      setSelectedTokenId(null);
    }
    setTokenContextMenu(null);
  };

  const handleCombatantSelect = (combatant: Combatant, type: Token['type']) => {
    if (!contextMenu) return;

    const existingToken = tokens.find(t => t.combatantId === combatant.id);

    if (existingToken) {
      // Move existing token
      onTokensChange(tokens.map(t =>
        t.id === existingToken.id ? { ...t, x: contextMenu.x, y: contextMenu.y, avatar: combatant.avatar, color: combatant.color || t.color } : t
      ));
    } else {
      // Add new token
      const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#059669' };
      const newToken: Token = {
        id: Math.random().toString(36).substr(2, 9),
        combatantId: combatant.id,
        name: combatant.name,
        type,
        x: contextMenu.x,
        y: contextMenu.y,
        color: combatant.color || colors[type],
        avatar: combatant.avatar,
      };
      onTokensChange([...tokens, newToken]);
    }
    setContextMenu(null);
  };

  const saveNote = () => {
    if (!contextMenu || !noteDraft.content.trim()) return;

    const newNote: MapNote = {
      id: Math.random().toString(36).substr(2, 9),
      type: noteDraft.type,
      content: noteDraft.content,
      x: contextMenu.x,
      y: contextMenu.y
    };

    onMapNotesChange([...mapNotes, newNote]);
    setContextMenu(null);
    setNoteDraft({ type: 'treasure', content: '' });
  };

  const [isPanning, setIsPanning] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    if (!panToNote) return;
    setStagePos({
      x: dimensions.width / 2 - panToNote.x * stageScale,
      y: dimensions.height / 2 - panToNote.y * stageScale,
    });
  }, [panToNote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isPlayerView) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
      setIsPanning(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isPlayerView]);

  // Two-finger pan for player view
  const twoFingerPanRef = useRef<{ midX: number; midY: number } | null>(null);

  const handleTouchStart = (e: any) => {
    if (e.evt.touches.length === 2) {
      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      twoFingerPanRef.current = {
        midX: (t1.clientX + t2.clientX) / 2,
        midY: (t1.clientY + t2.clientY) / 2,
      };
      e.evt.preventDefault();
    }
  };

  const handleTouchMove = (e: any) => {
    if (e.evt.touches.length === 2 && twoFingerPanRef.current) {
      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - twoFingerPanRef.current.midX;
      const dy = midY - twoFingerPanRef.current.midY;
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      twoFingerPanRef.current = { midX, midY };
      e.evt.preventDefault();
    }
  };

  const handleTouchEnd = (e: any) => {
    if (e.evt.touches.length < 2) {
      twoFingerPanRef.current = null;
    }
  };

  const getCanvasPos = (stage: any) => {
    const pos = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  };

  const handleStageMouseDown = (e: any) => {
    if (e.evt.button === 2 || e.evt.button === 1 || (e.evt.button === 0 && spaceHeldRef.current)) {
      setIsPanning(true);
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    } else if (e.evt.button === 0) {
      const canvas = getCanvasPos(e.target.getStage());
      selectionStartRef.current = canvas;
      selectionRectRef.current = { x: canvas.x, y: canvas.y, w: 0, h: 0 };
      setSelectionRect(selectionRectRef.current);
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (isPanning) {
      const dx = e.evt.clientX - lastPos.x;
      const dy = e.evt.clientY - lastPos.y;
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    } else if (selectionStartRef.current) {
      const canvas = getCanvasPos(e.target.getStage());
      const start = selectionStartRef.current;
      const rect = {
        x: Math.min(start.x, canvas.x),
        y: Math.min(start.y, canvas.y),
        w: Math.abs(canvas.x - start.x),
        h: Math.abs(canvas.y - start.y),
      };
      selectionRectRef.current = rect;
      setSelectionRect({ ...rect });
    }
  };

  const handleStageMouseUp = () => {
    setIsPanning(false);
    const rect = selectionRectRef.current;
    if (selectionStartRef.current && rect && (rect.w > 5 || rect.h > 5)) {
      const { x, y, w, h } = rect;
      const selected = tokens
        .filter(t => {
          const tx = livePlayerPos[t.id]?.x ?? t.x;
          const ty = livePlayerPos[t.id]?.y ?? t.y;
          return tx >= x && tx <= x + w && ty >= y && ty <= y + h;
        })
        .map(t => t.id);
      if (selected.length > 0) {
        setSelectedTokenIds(selected);
        didMarqueeRef.current = true;
      }
    }
    selectionStartRef.current = null;
    selectionRectRef.current = null;
    setSelectionRect(null);
  };

  // Emit the DM's current viewport center (in map-space) whenever pan/zoom changes
  useEffect(() => {
    if (!isPlayerView && dimensions.width > 0 && stageScale > 0) {
      const cx = (-stagePos.x + dimensions.width / 2) / stageScale;
      const cy = (-stagePos.y + dimensions.height / 2) / stageScale;
      onViewportCenter?.({ x: cx, y: cy });
    }
  }, [stagePos, stageScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();

    if (e.evt.ctrlKey || e.evt.metaKey) {
      // Ctrl+scroll = zoom toward pointer
      const scaleBy = 1.08;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - stagePos.x) / stageScale,
        y: (pointer.y - stagePos.y) / stageScale,
      };

      const newScale = e.evt.deltaY < 0
        ? stageScale * scaleBy
        : stageScale / scaleBy;

      const clampedScale = Math.min(Math.max(newScale, 0.05), 5);

      setStageScale(clampedScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    } else {
      // Plain scroll = pan
      setStagePos(prev => ({
        x: prev.x - e.evt.deltaX,
        y: prev.y - e.evt.deltaY,
      }));
    }
  };

  return (
    <div className="h-full flex flex-col relative" ref={containerRef}>
      {/* Toolbar - Only visible to DM */}
      {!isPlayerView && (
        <div className="h-10 border-b border-[var(--line)] bg-[var(--surface)] flex justify-between items-center shrink-0">
          <div className="flex items-center h-full">
            <AnimatePresence>
              {!leftSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { delay: 0.2, duration: 0.1 }
                  }}
                  exit={{
                    opacity: 0,
                    transition: { delay: 0, duration: 0.05 }
                  }}
                  className="flex items-center h-full"
                >
                  <button
                    onClick={() => setLeftSidebarOpen(true)}
                    className="h-full px-3 hover:bg-black/5 transition-colors flex items-center justify-center"
                    title="Open Notes"
                  >
                    <FileText size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="h-6 w-px bg-[var(--line)] shrink-0" />

            <div className="flex items-center gap-4 px-4">
              <div className="flex items-center gap-2">
                <MapIcon size={12} className="opacity-50" />
                <h3 className="text-[10px] uppercase tracking-widest opacity-50 font-sans font-bold">Map</h3>
              </div>
              <button
                onClick={() => {
                  if (mapImage && (tokens.length > 0 || mapNotes.length > 0)) {
                    setShowChangeMapModal(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="btn-ghost py-1"
              >
                <Upload size={12} /> {mapImage ? 'CHANGE MAP' : 'UPLOAD MAP'}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*,.uvtt,.dd2vtt,.df2vtt" />
              {walls && walls.length > 0 && (
                <button
                  onClick={() => setShowWalls(!showWalls)}
                  className="btn-ghost py-1"
                >
                  {showWalls ? <Eye size={12} /> : <EyeOff size={12} />} WALLS
                </button>
              )}
              {hasFogData && (
                <button
                  onClick={() => setShowFog(!showFog)}
                  className={cn("btn-ghost py-1", showFog && "bg-white/10")}
                >
                  <Cloud size={12} /> FOG
                </button>
              )}
              <div className="h-6 w-px bg-[var(--line)] shrink-0" />
              <div className="relative">
                <button
                  onClick={() => setDarknessOpen(o => !o)}
                  className="btn-ghost py-1 gap-2 w-[110px] justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    {(darknessLevel ?? 'dark') === 'daylight'
                      ? <Sun size={12} />
                      : <Moon size={12} />
                    }
                    {(darknessLevel ?? 'dark') === 'daylight' ? 'Daylight' : 'Dark'}
                  </span>
                  <ChevronDown size={10} className="opacity-50" />
                </button>
                {darknessOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-xl z-50 overflow-hidden">
                    {([['daylight', 'Daylight', Sun], ['dark', 'Dark', Moon]] as const).map(([val, label, Icon]) => (
                      <button
                        key={val}
                        onClick={() => { onDarknessLevelChange?.(val); setDarknessOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-white/5 transition-colors',
                          (darknessLevel ?? 'dark') === val && 'text-[var(--accent)]'
                        )}
                      >
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center h-full">
            {selectedTokenIds.length > 0 && (
              <button
                onClick={() => {
                  onStartCombat(selectedTokenIds);
                  setSelectedTokenIds([]);
                }}
                className="btn-filled px-4 py-1 rounded animate-in fade-in slide-in-from-right-4 mr-2"
              >
                <Swords size={12} /> Roll Initiative ({selectedTokenIds.length})
              </button>
            )}
            <AnimatePresence>
              {!rightSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { delay: 0.2, duration: 0.1 }
                  }}
                  exit={{
                    opacity: 0,
                    transition: { delay: 0, duration: 0.05 }
                  }}
                  className="flex items-center h-full"
                >
                  <div className="h-6 w-px bg-[var(--line)] shrink-0" />
                  <button
                    onClick={() => setRightSidebarOpen(true)}
                    className="h-full px-3 hover:bg-black/5 transition-colors flex items-center justify-center"
                    title="Open Initiative Tracker"
                  >
                    <Swords size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="flex-1 bg-[#111] relative overflow-hidden" style={{ cursor: isPanning && spaceHeld ? 'grabbing' : spaceHeld ? 'grab' : undefined }}>
        {!loadedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-10">
            <div className="max-w-md space-y-6">
              <h2 className="text-6xl font-serif font-bold tracking-tight">Scenario Map</h2>
              <p className="text-lg opacity-40 font-sans">Upload a map to get started</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-filled px-8 py-4 rounded-xl text-sm shadow-xl"
              >
                <Upload size={20} />
                <span>Upload Map</span>
              </button>
            </div>
          </div>
        )}
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          onMouseDown={isPlayerView ? undefined : handleStageMouseDown}
          onMouseMove={isPlayerView ? undefined : handleStageMouseMove}
          onMouseUp={isPlayerView ? undefined : handleStageMouseUp}
          onMouseLeave={isPlayerView ? undefined : handleStageMouseUp}
          onContextMenu={isPlayerView ? undefined : handleContextMenu}
          onWheel={isPlayerView ? undefined : handleWheel}
          onTouchStart={isPlayerView ? handleTouchStart : undefined}
          onTouchMove={isPlayerView ? handleTouchMove : undefined}
          onTouchEnd={isPlayerView ? handleTouchEnd : undefined}
          onClick={(e) => {
            if (isPlayerView) return;
            if (e.evt.button === 0) {
              if (didMarqueeRef.current) {
                didMarqueeRef.current = false;
                return;
              }
              setContextMenu(null);
              setTokenContextMenu(null);
              setLeftSidebarOpen(false);
              setSelectedTokenIds([]);
              setSelectedTokenId(null);
            }
          }}
        >
          <Layer>
            {loadedImage && (
              <KonvaImage
                image={loadedImage}
                width={loadedImage.width}
                height={loadedImage.height}
              />
            )}

            {/* Render Walls */}
            {showWalls && !isPlayerView && walls?.map(wall => (
              <Line
                key={wall.id}
                points={wall.points.flatMap(p => [p.x, p.y])}
                stroke="#ff6b35"
                strokeWidth={3}
                lineCap="round"
                lineJoin="round"
                opacity={0.8}
                listening={false}
              />
            ))}
            {showWalls && !isPlayerView && objectWalls?.map(wall => (
              <Line
                key={wall.id}
                points={wall.points.flatMap(p => [p.x, p.y])}
                stroke="#ff6b35"
                strokeWidth={2}
                lineCap="round"
                lineJoin="round"
                opacity={0.5}
                dash={[6, 3]}
                listening={false}
              />
            ))}
            {/* Render Portals (Doors/Windows) */}
            {showWalls && !isPlayerView && portals?.map(portal => (
              <Line
                key={portal.id}
                points={[portal.bounds[0].x, portal.bounds[0].y, portal.bounds[1].x, portal.bounds[1].y]}
                stroke={portal.closed ? '#4ade80' : '#60a5fa'}
                strokeWidth={portal.closed ? 4 : 3}
                lineCap="round"
                dash={portal.closed ? [] : [8, 6]}
                opacity={0.9}
                onClick={() => !isPlayerView && onPortalToggle?.(portal.id)}
                onTap={() => !isPlayerView && onPortalToggle?.(portal.id)}
                hitStrokeWidth={12}
              />
            ))}


            {/* Marquee selection rect (DM only) */}
            {!isPlayerView && selectionRect && selectionRect.w > 0 && (
              <Rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.w}
                height={selectionRect.h}
                fill="rgba(205,127,50,0.08)"
                stroke="#CD7F32"
                strokeWidth={1 / stageScale}
                dash={[6 / stageScale, 4 / stageScale]}
                listening={false}
              />
            )}

            {tokens.map(token => {
              const r = tokenRadius * getTokenSizeMultiplier(token.size);
              return (
              <Group
                key={token.id}
                x={livePlayerPos[token.id]?.x ?? token.x}
                y={livePlayerPos[token.id]?.y ?? token.y}
                draggable
                onMouseDown={(e) => { e.cancelBubble = true; }}
                onDragStart={() => handleDragStart(token.id)}
                onDragMove={(e) => handleDragMove(token.id, e)}
                onDragEnd={(e) => handleDragEnd(token.id, e)}
                onContextMenu={(e) => handleTokenContextMenu(e, token.id)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
                    setSelectedTokenIds(prev =>
                      prev.includes(token.id) ? prev.filter(id => id !== token.id) : [...prev, token.id]
                    );
                  } else {
                    setSelectedTokenIds([token.id]);
                    setSelectedTokenId(token.id);
                  }
                }}
              >
                <Circle
                  radius={r}
                  fill={token.avatar ? "transparent" : token.color}
                  stroke={token.color}
                  strokeWidth={2 * tokenScale}
                  shadowBlur={5 * tokenScale}
                  shadowColor="black"
                  opacity={token.hidden ? 0.4 : 1}
                />
                {selectedTokenIds.includes(token.id) && !isPlayerView && (
                  /* Inner rim — above drop shadow */
                  <Circle
                    radius={r * 1.05}
                    fill=""
                    stroke="white"
                    strokeWidth={tokenScale}
                    opacity={token.hidden ? 0.4 : 1}
                  />
                )}
                {token.avatar && (
                  <Group opacity={token.hidden ? 0.4 : 1}>
                    <TokenAvatar
                      url={token.avatar}
                      radius={r - tokenScale}
                    />
                  </Group>
                )}
                {token.hidden && (
                  <Path
                    data="M9.88 9.88l-3.29-3.29m7.53 7.53l3.29 3.29M3 3l18 18M10.37 4.37a11 11 0 0 1 10.63 7.63 11 11 0 0 1-7.01 6.14m-3.99-.14A11 11 0 0 1 3 12a11 11 0 0 1 3.17-4.83m2.22 2.22a3 3 0 0 0 4.24 4.24"
                    stroke="white"
                    strokeWidth={2}
                    lineCap="round"
                    lineJoin="round"
                    scale={{ x: tokenRadius / 25, y: tokenRadius / 25 }}
                    x={-12 * (tokenRadius / 25)}
                    y={-12 * (tokenRadius / 25)}
                  />
                )}
                <Text
                  text={token.name}
                  fontSize={Math.max(10, tokenRadius * 0.55)}
                  fill="white"
                  y={r + 5}
                  align="center"
                  width={tokenRadius * 5}
                  x={-tokenRadius * 2.5}
                  fontStyle="bold"
                  fontFamily="Inter"
                  opacity={token.hidden ? 0.6 : 1}
                />
              </Group>
              );
            })}
          </Layer>
          {(isPlayerView || showFog) && hasFogData && loadedImage && (
            <Layer listening={false}>
              <FogOfWarLayer
                visibilityPolygons={isPlayerView ? playerVisionData : visibilityPolygons}
                mapWidth={loadedImage.width}
                mapHeight={loadedImage.height}
                opacity={isPlayerView ? 1.0 : 0.7}
              />
            </Layer>
          )}
          {/* Map Notes — above fog so they're always visible to the DM */}
          {!isPlayerView && mapNotes.length > 0 && (
            <Layer>
              {mapNotes.map(note => (
                <Group
                  key={note.id}
                  x={note.x}
                  y={note.y}
                  draggable
                  onDragEnd={(e) => handleNoteDragEnd(note.id, e)}
                  onMouseEnter={() => setHoveredNoteId(note.id)}
                  onMouseLeave={() => setHoveredNoteId(null)}
                  onMouseDown={(e) => { e.cancelBubble = true; }}
                  onClick={(e) => { e.cancelBubble = true; setLeftSidebarOpen(true); onNoteClick?.(note.id); }}
                >
                  <Circle
                    radius={tokenRadius * 0.6}
                    fill={getNoteColor(note.type)}
                    stroke={hoveredNoteId === note.id ? "white" : "rgba(0,0,0,0.4)"}
                    strokeWidth={1}
                    shadowBlur={hoveredNoteId === note.id ? 10 : 5}
                    shadowColor="black"
                  />
                  <NoteMapIcon type={note.type} />

                  {/* Tooltip — scale-independent: cancel zoom so it's always the same screen size */}
                  {hoveredNoteId === note.id && (() => {
                    const s = 1 / stageScale;
                    const fontSize = 16;
                    const padding = 10;
                    const tooltipW = 280;
                    const tooltipH = fontSize + padding * 2;
                    return (
                      <Group scaleX={s} scaleY={s} y={-(tokenRadius * 0.6) - (tooltipH + 8) / stageScale} x={0}>
                        <Rect
                          fill="rgba(0,0,0,0.9)"
                          stroke="rgba(255,255,255,0.1)"
                          strokeWidth={1}
                          cornerRadius={4}
                          width={tooltipW}
                          height={tooltipH}
                          x={-tooltipW / 2}
                          y={0}
                          shadowBlur={10}
                        />
                        <Text
                          text={note.content.split('\n')[0]}
                          fill="white"
                          fontSize={16}
                          padding={padding}
                          wrap="none"
                          ellipsis={true}
                          width={tooltipW}
                          x={-tooltipW / 2}
                          y={0}
                          align="center"
                          fontFamily="Inter"
                        />
                      </Group>
                    );
                  })()}
                </Group>
              ))}
            </Layer>
          )}
        </Stage>

        {/* Context Menu / Note Creator */}
        {contextMenu && (
          <div
            className={cn(
              "absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl animate-in zoom-in-95 duration-200",
              contextMenu.view === 'add-enemy' ? "w-[600px] overflow-hidden" : "w-64"
            )}
            style={
              contextMenu.view === 'add-enemy'
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : { left: contextMenu.stageX, top: contextMenu.stageY }
            }
            onMouseLeave={() => setActiveSubmenu(null)}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.view === 'root' && (
              <div className="flex flex-col py-1 relative">
                <button
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'note' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <PlusCircle size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Note</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-50" />

                {/* Player Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => setActiveSubmenu('player')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'player' ? "bg-blue-500 text-white" : "hover:bg-blue-500 hover:text-white"
                    )}
                  >
                    <User size={14} className={cn(activeSubmenu === 'player' ? "text-white" : "text-blue-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add/Move a Player</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* Player Submenu */}
                  {activeSubmenu === 'player' && (
                    <div className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150">
                      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 border-b border-[var(--line)] mb-1">Select Player</div>
                      {(() => {
                        const onMap = players.filter(c => tokens.some(t => t.combatantId === c.id));
                        const notOnMap = players.filter(c => !tokens.some(t => t.combatantId === c.id));
                        return (
                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notOnMap.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleCombatantSelect(c, 'player')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-2"
                              >
                                <PlusCircle size={12} className="opacity-50" />
                                {c.name}
                              </button>
                            ))}
                            {onMap.length > 0 && (
                              <>
                                {notOnMap.length > 0 && <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-30" />}
                                {onMap.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => handleCombatantSelect(c, 'player')}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-blue-500 hover:text-white transition-colors flex items-center gap-2"
                                  >
                                    <ChevronRight size={12} className="opacity-50" />
                                    {c.name}
                                  </button>
                                ))}
                              </>
                            )}
                            {players.length === 0 && (
                              <div className="px-4 py-4 text-center opacity-30 text-[10px] italic">No players found</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <button
                  onMouseEnter={() => setActiveSubmenu(null)}
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-enemy' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[#ef4444] hover:text-white transition-colors group"
                >
                  <Skull size={14} className="text-[#ef4444] group-hover:text-white" />
                  <span className="flex-1 text-left">Add an Enemy</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>

                {/* NPC Flyout Trigger */}
                <div className="relative">
                  <button
                    onMouseEnter={() => setActiveSubmenu('npc')}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-xs transition-colors group",
                      activeSubmenu === 'npc' ? "bg-emerald-500 text-white" : "hover:bg-emerald-500 hover:text-white"
                    )}
                  >
                    <Shield size={14} className={cn(activeSubmenu === 'npc' ? "text-white" : "text-emerald-500 group-hover:text-white")} />
                    <span className="flex-1 text-left">Add an NPC</span>
                    <ChevronRight size={12} className="opacity-30" />
                  </button>

                  {/* NPC Submenu */}
                  {activeSubmenu === 'npc' && (
                    <div className="absolute left-full top-0 ml-0.5 w-64 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl py-1 animate-in slide-in-from-left-2 duration-150">
                      <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 border-b border-[var(--line)] mb-1">Select NPC</div>
                      {(() => {
                        const onMap = npcs.filter(c => tokens.some(t => t.combatantId === c.id));
                        const notOnMap = npcs.filter(c => !tokens.some(t => t.combatantId === c.id));
                        return (
                          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {notOnMap.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleCombatantSelect(c, 'npc')}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-2"
                              >
                                <PlusCircle size={12} className="opacity-50" />
                                {c.name}
                              </button>
                            ))}
                            {onMap.length > 0 && (
                              <>
                                {notOnMap.length > 0 && <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-30" />}
                                {onMap.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => handleCombatantSelect(c, 'npc')}
                                    className="w-full text-left px-4 py-2 text-xs hover:bg-emerald-500 hover:text-white transition-colors flex items-center gap-2"
                                  >
                                    <ChevronRight size={12} className="opacity-50" />
                                    {c.name}
                                  </button>
                                ))}
                              </>
                            )}
                            {npcs.length === 0 && (
                              <div className="px-4 py-4 text-center opacity-30 text-[10px] italic">No NPCs found</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {contextMenu.view === 'note' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Add Map Note</span>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex justify-between mb-3 bg-black/20 p-1 rounded-lg">
                  {(['treasure', 'quote', 'warning', 'secret', 'clue'] as MapNoteType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoteDraft(prev => ({ ...prev, type }))}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        noteDraft.type === type ? "scale-110 shadow-lg" : "hover:bg-white/5 opacity-40 hover:opacity-100"
                      )}
                      style={noteDraft.type === type ? { backgroundColor: getNoteColor(type) } : undefined}
                    >
                      <NoteIcon type={type} size={18} className={noteDraft.type === type ? "text-white" : ""} />
                    </button>
                  ))}
                </div>

                <textarea
                  autoFocus
                  value={noteDraft.content}
                  onChange={(e) => setNoteDraft(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Write note content..."
                  className="w-full bg-black border border-[var(--line)] rounded-lg p-2 text-sm outline-none focus:border-[var(--accent)] transition-colors min-h-[80px] resize-none mb-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveNote();
                    }
                  }}
                />

                <button
                  disabled={!noteDraft.content.trim()}
                  onClick={saveNote}
                  className="btn-filled w-full py-2 rounded-lg disabled:opacity-30"
                >
                  Save Note
                </button>
              </div>
            )}

            {contextMenu.view === 'add-enemy' && (
              <div className="flex flex-col h-[500px]">
                <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Skull size={14} className="text-[#ef4444]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Bestiary</p>
                  </div>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Left Panel: List */}
                  <div className="w-1/2 border-r border-[var(--line)] flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-[var(--line)]">
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-30" />
                        <input
                          autoFocus
                          type="text"
                          value={monsterSearch}
                          onChange={(e) => setMonsterSearch(e.target.value)}
                          placeholder="Search monsters..."
                          className="w-full bg-black border border-[var(--line)] rounded-md pl-7 pr-2 py-1.5 text-xs outline-none focus:border-[var(--accent)] transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--line)]">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2014} onChange={(e) => setShowSource2014(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-[10px] opacity-60">2014</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={showSource2024} onChange={(e) => setShowSource2024(e.target.checked)} className="w-3 h-3 accent-[var(--accent)]" />
                        <span className="text-[10px] opacity-60">2024</span>
                      </label>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1">
                      {BESTIARY.filter(m =>
                        m.name.toLowerCase().includes(monsterSearch.toLowerCase()) &&
                        ((showSource2014 && m.source === '2014') || (showSource2024 && m.source === '2024'))
                      ).map(m => (
                        <button
                          key={m.id}
                          onClick={() => setSelectedMonster(m)}
                          className={cn(
                            "w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between group",
                            selectedMonster?.id === m.id ? "bg-[var(--accent)] text-white" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold">{m.name}</span>
                            <span className={cn("text-[9px] opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>{m.type}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn("text-[9px] font-sans opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                            <span className={cn("text-[8px] font-sans opacity-30", selectedMonster?.id === m.id ? "text-white" : "")}>{m.source}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Details */}
                  <div className="w-1/2 flex flex-col overflow-hidden bg-black/5">
                    {selectedMonster ? (
                      <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {/* Header: Avatar + Name + Badges */}
                          <div className="flex items-center gap-3">
                            {selectedMonster.avatar && (
                              <img
                                src={selectedMonster.avatar}
                                alt={selectedMonster.name}
                                className="w-12 h-12 rounded-full object-cover shrink-0 bg-black/20"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-lg font-bold tracking-tight truncate">{selectedMonster.name}</h4>
                              <p className="text-[10px] italic opacity-50">{selectedMonster.type}</p>
                            </div>
                            <div className="flex flex-col gap-1 shrink-0 items-end">
                              <div className="flex gap-1.5">
                                <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-[10px] font-bold">HP {selectedMonster.hp}</div>
                                <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold">AC {selectedMonster.ac}</div>
                              </div>
                              <div className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold self-end">CR {selectedMonster.cr}</div>
                            </div>
                          </div>

                          {/* Speed / Senses / Languages */}
                          {(selectedMonster.speed || selectedMonster.senses || selectedMonster.languages) && (
                            <div className="text-[10px] space-y-0.5 opacity-60">
                              {selectedMonster.speed && <div><span className="font-bold">Speed:</span> {selectedMonster.speed}</div>}
                              {selectedMonster.senses && <div><span className="font-bold">Senses:</span> {selectedMonster.senses}</div>}
                              {selectedMonster.languages && <div><span className="font-bold">Languages:</span> {selectedMonster.languages}</div>}
                            </div>
                          )}

                          {/* Stats Grid */}
                          <div className="grid grid-cols-6 gap-1 text-center">
                            {Object.entries(selectedMonster.stats).map(([stat, val]) => (
                              <div key={stat} className="bg-black/20 rounded p-1">
                                <div className="text-[8px] uppercase opacity-50">{stat}</div>
                                <div className="text-xs font-bold">{val}</div>
                              </div>
                            ))}
                          </div>

                          {/* Saves & Defenses */}
                          {(selectedMonster.saves || selectedMonster.immunities || selectedMonster.resistances || selectedMonster.conditionImmunities) && (
                            <div className="text-[10px] space-y-0.5 opacity-60">
                              {selectedMonster.saves && <div><span className="font-bold">Saves:</span> {selectedMonster.saves}</div>}
                              {selectedMonster.resistances && <div><span className="font-bold">Resistances:</span> {selectedMonster.resistances}</div>}
                              {selectedMonster.immunities && <div><span className="font-bold">Immunities:</span> {selectedMonster.immunities}</div>}
                              {selectedMonster.conditionImmunities && <div><span className="font-bold">Cond. Immunities:</span> {selectedMonster.conditionImmunities}</div>}
                            </div>
                          )}

                          {/* Description */}
                          {selectedMonster.description && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Description</h5>
                              <p className="text-xs leading-relaxed opacity-70">{selectedMonster.description}</p>
                            </div>
                          )}

                          {/* Traits / Special Abilities */}
                          {selectedMonster.specialAbilities && selectedMonster.specialAbilities.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Traits</h5>
                              <div className="space-y-2">
                                {selectedMonster.specialAbilities.map((ability, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-purple-400">{ability.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{ability.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {selectedMonster.actions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.actions.map((action, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-[var(--accent)]">{action.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Reactions */}
                          {selectedMonster.reactions && selectedMonster.reactions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Reactions</h5>
                              <div className="space-y-2">
                                {selectedMonster.reactions.map((reaction, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-blue-400">{reaction.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{reaction.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Legendary Actions */}
                          {selectedMonster.legendaryActions && selectedMonster.legendaryActions.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Legendary Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.legendaryActions.map((action, i) => (
                                  <div key={i} className="text-xs leading-relaxed">
                                    <span className="font-bold italic text-amber-400">{action.name}.</span>{' '}
                                    <span className="opacity-80 whitespace-pre-wrap">{action.desc}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-3 border-t border-[var(--line)] bg-[var(--surface)] space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Quantity</span>
                            <div className="flex items-center gap-3 bg-black/20 rounded-lg p-1">
                              <button
                                onClick={() => setMonsterQuantity(Math.max(1, monsterQuantity - 1))}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold w-4 text-center">{monsterQuantity}</span>
                              <button
                                onClick={() => setMonsterQuantity(Math.min(20, monsterQuantity + 1))}
                                className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const offsetPx = 10 * getTokenSizeMultiplier(
                                (selectedMonster.size?.split('/')[0]?.trim() as Token['size']) || 'Medium'
                              );
                              for (let i = 0; i < monsterQuantity; i++) {
                                // Add a small offset for each subsequent token so they aren't perfectly stacked
                                onAddEnemy(selectedMonster, contextMenu.x + (i * offsetPx), contextMenu.y + (i * offsetPx));
                              }
                              setContextMenu(null);
                            }}
                            className="btn-filled w-full py-2 rounded-lg !bg-[#ef4444] shadow-lg shadow-[#ef4444]/20"
                          >
                            <PlusCircle size={14} />
                            Add {monsterQuantity > 1 ? `${monsterQuantity} Tokens` : 'to Map'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center opacity-20 p-8 text-center">
                        <Skull size={48} className="mb-4 text-[#ef4444]" />
                        <p className="text-sm font-sans uppercase tracking-widest">Select a monster to view details</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Token Context Menu */}
        {tokenContextMenu && (
          <div
            className="absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-2xl overflow-hidden w-48 animate-in fade-in zoom-in-95 duration-150"
            style={{ left: tokenContextMenu.x, top: tokenContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 border-b border-[var(--line)] bg-black/10">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 px-2">Token Options</p>
            </div>
            <button
              onClick={() => toggleTokenVisibility(tokenContextMenu.tokenId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              {tokens.find(t => t.id === tokenContextMenu.tokenId)?.hidden ? (
                <><Eye size={14} /> Show Token</>
              ) : (
                <><EyeOff size={14} /> Hide Token</>
              )}
            </button>
            <button
              onClick={() => deleteToken(tokenContextMenu.tokenId)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--btn-bg)] hover:text-white transition-colors text-[var(--btn-bg)]"
            >
              <Trash2 size={14} /> Delete Token
            </button>
          </div>
        )}

        {/* Token Detail Panel — only for non-player tokens; players use the Character Sheet modal */}
        {selectedTokenIds.length === 1 && (() => {
          const tokenId = selectedTokenIds[0];
          const token = tokens.find(t => t.id === tokenId);

          // Players get the dedicated Character Sheet modal via the main menu
          if (token?.type === 'player') return null;

          const combatants = [...players, ...npcs, ...persistentEnemies, ...scenarioCombatants];
          const combatant = combatants.find(c => c.id === token?.combatantId);

          if (!combatant) return null;

          return (
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--line)] shadow-2xl animate-in slide-in-from-bottom duration-300 z-40 max-h-[40%] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-[var(--line)] bg-black/20 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: token?.color }} />
                    <h4 className="font-bold text-sm tracking-tight">{combatant.name}</h4>
                  </div>
                  <div className="flex gap-3 text-[10px] font-sans opacity-50">
                    <span>HP: {combatant.hp}/{combatant.maxHp}</span>
                    <span>AC: {combatant.ac}</span>
                    {combatant.type === 'player' && combatant.classes && (
                      <span>{combatant.classes.map(c => `${c.name} ${c.level}`).join(' / ')}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedTokenId(null);
                    setSelectedTokenIds([]);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors opacity-50 hover:opacity-100"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-x-auto p-4 flex gap-8">
                {/* Column 1: Stats & Info */}
                <div className="min-w-[200px] flex flex-col gap-4">
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Attributes</h5>
                    {combatant.stats ? (
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(combatant.stats).map(([stat, val]) => (
                          <div key={stat} className="bg-black/20 rounded p-2 text-center">
                            <div className="text-[8px] uppercase opacity-50">{stat}</div>
                            <div className="text-sm font-bold">{val}</div>
                            <div className="text-[9px] opacity-30">
                              {Math.floor((val - 10) / 2) >= 0 ? '+' : ''}{Math.floor((val - 10) / 2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs opacity-40 italic">No stats available</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {combatant.species && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{combatant.species}</span>}
                    {combatant.speed && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{combatant.speed}ft Speed</span>}
                    {combatant.darkvision && <span className="px-2 py-1 bg-white/5 rounded text-[10px]">{combatant.darkvision}ft Darkvision</span>}
                  </div>
                </div>

                {/* Column 2: Description */}
                <div className="min-w-[250px] max-w-[400px]">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Description</h5>
                  <div className="text-xs leading-relaxed opacity-70 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {combatant.description || "No description provided for this character."}
                  </div>
                </div>

                {/* Column 3: Actions */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Actions</h5>
                  <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {combatant.actions && combatant.actions.length > 0 ? (
                      combatant.actions.map((action, i) => (
                        <div key={i} className="text-xs bg-white/5 p-2 rounded border border-white/5">
                          <span className="font-bold italic text-[var(--accent)]">{action.name}.</span> {action.desc}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs opacity-40 italic">No actions listed</p>
                    )}
                  </div>
                </div>

                {/* Column 4: Spells */}
                <div className="min-w-[250px] flex-1">
                  <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-2">Spells</h5>
                  <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {combatant.spells && combatant.spells.length > 0 ? (
                      combatant.spells.map((spell, i) => (
                        <div key={i} className="text-xs bg-blue-500/5 p-2 rounded border border-blue-500/10">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold italic text-blue-400">{spell.name}</span>
                            <span className="text-[9px] opacity-50 uppercase">Level {spell.level}</span>
                          </div>
                          <p className="opacity-70 text-[11px]">{spell.desc}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs opacity-40 italic">No spells listed</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Change Map Warning Modal */}
      <AnimatePresence>
        {showChangeMapModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowChangeMapModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl shadow-2xl w-[420px] p-6 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Upload size={18} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif mb-1">Change Map?</h3>
                  <p className="text-sm opacity-60 leading-relaxed">
                    This scenario has {tokens.length > 0 && mapNotes.length > 0
                      ? `${tokens.length} token${tokens.length !== 1 ? 's' : ''} and ${mapNotes.length} note${mapNotes.length !== 1 ? 's' : ''}`
                      : tokens.length > 0
                        ? `${tokens.length} token${tokens.length !== 1 ? 's' : ''}`
                        : `${mapNotes.length} note${mapNotes.length !== 1 ? 's' : ''}`
                    } placed on the current map. Uploading a new map will remove all of them.
                  </p>
                </div>
              </div>

              <div className="bg-black/20 border border-[var(--line)] rounded-xl p-3 mb-5 text-xs opacity-60 leading-relaxed">
                If you want to keep this scenario's content, consider creating a new scenario instead.
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowChangeMapModal(false);
                    fileInputRef.current?.click();
                  }}
                  className="btn-filled py-2.5 rounded-xl"
                >
                  Change Map Anyway
                </button>
                {onAddScenario && (
                  <button
                    onClick={() => {
                      setShowChangeMapModal(false);
                      onAddScenario();
                    }}
                    className="btn-ghost py-2.5 rounded-xl"
                  >
                    Create New Scenario Instead
                  </button>
                )}
                <button
                  onClick={() => setShowChangeMapModal(false)}
                  className="py-2 text-xs opacity-40 hover:opacity-70 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </div>
    </div>
  );
};
