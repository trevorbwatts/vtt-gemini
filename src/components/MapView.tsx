import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Group, Rect, Path } from 'react-konva';
import { Token, MapNote, MapNoteType, cn, Combatant, Monster } from '../types';
import { Upload, User, Skull, Shield, Package, MessageSquareQuote, Swords, Info, X, EyeOff, Eye, Trash2, ChevronRight, PlusCircle, Search, Map as MapIcon, FileText } from 'lucide-react';
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
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  isPlayerView?: boolean;
}

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
  rightSidebarOpen,
  setRightSidebarOpen,
  isPlayerView = false
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
  const [tokenContextMenu, setTokenContextMenu] = useState<{ x: number, y: number, tokenId: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ type: MapNoteType, content: string }>({ type: 'info', content: '' });
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [monsterQuantity, setMonsterQuantity] = useState(1);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);

  const getNoteColor = (type: MapNoteType) => {
    switch (type) {
      case 'treasure': return '#E9BE59';
      case 'quote': return '#60a5fa';
      case 'combat': return '#f87171';
      case 'info': return '#34d399';
      case 'trap': return '#a78bfa';
      default: return '#ffffff';
    }
  };

  const NoteMapIcon = ({ type, color }: { type: MapNoteType, color: string }) => {
    const paths = {
      treasure: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1.5M21 7.5H3M21 7.5v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5M12 7.5V20",
      quote: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 7h8M8 11h8",
      combat: "M14.5 17.5 3 6V3h3l11.5 11.5M13 19l-2 2-3-3-2 2L3 17l2-2-3-3 2-2 3 3 2-2M14.5 17.5 19 13M21 6V3h-3l-4.5 4.5",
      info: "M12 16V12M12 8H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z",
      trap: "M9 10L9.01 10M15 10L15.01 10M12 2C7.03 2 3 6.03 3 11C3 13.08 3.71 14.99 4.9 16.5C5.45 17.19 6.13 17.8 6.9 18.27L6.9 20C6.9 21.1 7.8 22 8.9 22L15.1 22C16.2 22 17.1 21.1 17.1 20L17.1 18.27C17.87 17.8 18.55 17.19 19.1 16.5C20.29 14.99 21 13.08 21 11C21 6.03 16.97 2 12 2Z"
    };

    return (
      <Path
        data={paths[type]}
        stroke={color}
        strokeWidth={2}
        lineCap="round"
        lineJoin="round"
        scale={{ x: 0.5, y: 0.5 }}
        x={-6}
        y={-6}
      />
    );
  };

  useEffect(() => {
    if (mapImage) {
      const img = new Image();
      img.src = mapImage;
      img.onload = () => setLoadedImage(img);
    } else {
      setLoadedImage(null);
    }
  }, [mapImage]);

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
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onMapChange(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragEnd = (id: string, e: any) => {
    onTokensChange(tokens.map(t => 
      t.id === id ? { ...t, x: e.target.x(), y: e.target.y() } : t
    ));
  };

  const handleNoteDragEnd = (id: string, e: any) => {
    onMapNotesChange(mapNotes.map(n => 
      n.id === id ? { ...n, x: e.target.x(), y: e.target.y() } : n
    ));
  };

  const addToken = (type: Token['type']) => {
    const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#10b981' };
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
        t.id === existingToken.id ? { ...t, x: contextMenu.x, y: contextMenu.y } : t
      ));
    } else {
      // Add new token
      const colors = { player: '#3b82f6', enemy: '#ef4444', npc: '#10b981' };
      const newToken: Token = {
        id: Math.random().toString(36).substr(2, 9),
        combatantId: combatant.id,
        name: combatant.name,
        type,
        x: contextMenu.x,
        y: contextMenu.y,
        color: colors[type],
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
    setNoteDraft({ type: 'info', content: '' });
  };

  const [isPanning, setIsPanning] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  const handleStageMouseDown = (e: any) => {
    // Only pan on right click (button 2) or middle click (button 1)
    if (e.evt.button === 2 || e.evt.button === 1) {
      setIsPanning(true);
      setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
    }
  };

  const handleStageMouseMove = (e: any) => {
    if (!isPanning) return;

    const stage = e.target.getStage();
    const dx = e.evt.clientX - lastPos.x;
    const dy = e.evt.clientY - lastPos.y;

    const newPos = {
      x: stage.x() + dx,
      y: stage.y() + dy,
    };

    stage.position(newPos);
    setLastPos({ x: e.evt.clientX, y: e.evt.clientY });
  };

  const handleStageMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldPos = stage.position();
    
    // Update stage position based on wheel delta
    // This enables two-finger scroll (panning) on trackpads
    stage.position({
      x: oldPos.x - e.evt.deltaX,
      y: oldPos.y - e.evt.deltaY,
    });
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
                onClick={() => fileInputRef.current?.click()}
                className="btn-ghost py-1"
              >
                <Upload size={12} /> UPLOAD
              </button>
              <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
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
      
      <div className="flex-1 bg-[#111] relative overflow-hidden">
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
          onMouseDown={isPlayerView ? undefined : handleStageMouseDown}
          onMouseMove={isPlayerView ? undefined : handleStageMouseMove}
          onMouseUp={isPlayerView ? undefined : handleStageMouseUp}
          onMouseLeave={isPlayerView ? undefined : handleStageMouseUp}
          onContextMenu={isPlayerView ? undefined : handleContextMenu}
          onWheel={isPlayerView ? undefined : handleWheel}
          onClick={(e) => {
            if (isPlayerView) return;
            // Only close on left click
            if (e.evt.button === 0) {
              setContextMenu(null);
              setTokenContextMenu(null);
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
            
            {/* Render Map Notes */}
            {mapNotes.map(note => (
              <Group 
                key={note.id} 
                x={note.x} 
                y={note.y}
                draggable
                onDragEnd={(e) => handleNoteDragEnd(note.id, e)}
                onMouseEnter={() => setHoveredNoteId(note.id)}
                onMouseLeave={() => setHoveredNoteId(null)}
              >
                <Circle
                  radius={14}
                  fill="#1a1a1a"
                  stroke={hoveredNoteId === note.id ? "var(--accent)" : "#333"}
                  strokeWidth={1}
                  shadowBlur={hoveredNoteId === note.id ? 10 : 5}
                  shadowColor="black"
                />
                <NoteMapIcon type={note.type} color={getNoteColor(note.type)} />

                {/* Tooltip */}
                {hoveredNoteId === note.id && (
                  <Group y={-25} x={0}>
                    <Rect
                      fill="rgba(0,0,0,0.9)"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth={1}
                      cornerRadius={4}
                      width={Math.min(200, note.content.length * 8 + 20)}
                      height={Math.ceil(note.content.length / 25) * 16 + 12}
                      x={-Math.min(200, note.content.length * 8 + 20) / 2}
                      y={-(Math.ceil(note.content.length / 25) * 16 + 12)}
                      shadowBlur={10}
                    />
                    <Text
                      text={note.content}
                      fill="white"
                      fontSize={11}
                      padding={8}
                      width={Math.min(200, note.content.length * 8 + 20)}
                      x={-Math.min(200, note.content.length * 8 + 20) / 2}
                      y={-(Math.ceil(note.content.length / 25) * 16 + 12)}
                      align="center"
                      fontFamily="Inter"
                    />
                  </Group>
                )}
              </Group>
            ))}

            {tokens.map(token => (
              <Group
                key={token.id}
                x={token.x}
                y={token.y}
                draggable
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
                  radius={20}
                  fill={token.color}
                  stroke={selectedTokenIds.includes(token.id) ? "var(--accent)" : "white"}
                  strokeWidth={selectedTokenIds.includes(token.id) ? 4 : 2}
                  shadowBlur={selectedTokenIds.includes(token.id) ? 15 : 5}
                  shadowColor={selectedTokenIds.includes(token.id) ? "var(--accent)" : "black"}
                  opacity={token.hidden ? 0.4 : 1}
                />
                {token.hidden && (
                  <Path
                    data="M9.88 9.88l-3.29-3.29m7.53 7.53l3.29 3.29M3 3l18 18M10.37 4.37a11 11 0 0 1 10.63 7.63 11 11 0 0 1-7.01 6.14m-3.99-.14A11 11 0 0 1 3 12a11 11 0 0 1 3.17-4.83m2.22 2.22a3 3 0 0 0 4.24 4.24"
                    stroke="white"
                    strokeWidth={2}
                    lineCap="round"
                    lineJoin="round"
                    scale={{ x: 0.8, y: 0.8 }}
                    x={-10}
                    y={-10}
                  />
                )}
                <Text
                  text={token.name}
                  fontSize={12}
                  fill="white"
                  y={25}
                  align="center"
                  width={100}
                  x={-50}
                  fontStyle="bold"
                  fontFamily="Inter"
                  opacity={token.hidden ? 0.6 : 1}
                />
              </Group>
            ))}
          </Layer>
        </Stage>

        {/* Context Menu / Note Creator */}
        {contextMenu && (
          <div 
            className={cn(
              "absolute z-50 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200",
              contextMenu.view === 'add-enemy' ? "w-[600px]" : "w-64"
            )}
            style={
              contextMenu.view === 'add-enemy' 
                ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
                : { left: contextMenu.stageX, top: contextMenu.stageY }
            }
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.view === 'root' && (
              <div className="flex flex-col py-1">
                <button 
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'note' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors group"
                >
                  <PlusCircle size={14} className="opacity-50 group-hover:opacity-100" />
                  <span className="flex-1 text-left">Add a Note</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-50" />
                <button 
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-player' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-blue-500 hover:text-white transition-colors group"
                >
                  <User size={14} className="text-blue-500 group-hover:text-white" />
                  <span className="flex-1 text-left">Add/Move a Player</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                <button 
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-enemy' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-[var(--btn-bg)] hover:text-white transition-colors group"
                >
                  <Skull size={14} className="text-[var(--accent)] group-hover:text-white" />
                  <span className="flex-1 text-left">Add an Enemy</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
                <button 
                  onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'add-npc' } : null)}
                  className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-emerald-500 hover:text-white transition-colors group"
                >
                  <Shield size={14} className="text-emerald-500 group-hover:text-white" />
                  <span className="flex-1 text-left">Add an NPC</span>
                  <ChevronRight size={12} className="opacity-30" />
                </button>
              </div>
            )}

            {contextMenu.view === 'note' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Add Map Note</span>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>
                
                <div className="flex justify-between mb-3 bg-black/20 p-1 rounded-lg">
                  {(['treasure', 'quote', 'combat', 'info', 'trap'] as MapNoteType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoteDraft(prev => ({ ...prev, type }))}
                      className={cn(
                        "p-2 rounded-md transition-all",
                        noteDraft.type === type ? "bg-[var(--accent)] text-white scale-110 shadow-lg" : "hover:bg-white/5 opacity-40 hover:opacity-100"
                      )}
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

            {(contextMenu.view === 'add-player' || contextMenu.view === 'add-npc') && (
              <div className="flex flex-col">
                <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                    {contextMenu.view === 'add-player' ? 'Select Player' : 'Select NPC'}
                  </p>
                  <button onClick={() => setContextMenu(prev => prev ? { ...prev, view: 'root' } : null)} className="opacity-50 hover:opacity-100 text-[10px] uppercase font-bold tracking-tighter">Back</button>
                </div>
                <div className="max-h-[300px] overflow-y-auto py-1">
                  {(() => {
                    const type = contextMenu.view === 'add-player' ? 'player' : 'npc';
                    const availableCombatants = contextMenu.view === 'add-player' ? players : npcs;
                    
                    const onMap = availableCombatants.filter(c => tokens.some(t => t.combatantId === c.id));
                    const notOnMap = availableCombatants.filter(c => !tokens.some(t => t.combatantId === c.id));

                    return (
                      <>
                        {notOnMap.map(c => (
                          <button
                            key={c.id}
                            onClick={() => handleCombatantSelect(c, type)}
                            className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors flex items-center gap-2"
                          >
                            <PlusCircle size={12} className="opacity-50" />
                            {c.name}
                          </button>
                        ))}
                        
                        {onMap.length > 0 && (
                          <>
                            <div className="h-px bg-[var(--line)] my-1 mx-2 opacity-30" />
                            <div className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-30 bg-black/5">Already on the map</div>
                            {onMap.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleCombatantSelect(c, type)}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-[var(--accent)] hover:text-white transition-colors flex items-center gap-2"
                              >
                                <ChevronRight size={12} className="opacity-50" />
                                {c.name}
                              </button>
                            ))}
                          </>
                        )}

                        {availableCombatants.length === 0 && (
                          <div className="px-4 py-4 text-center opacity-30 text-[10px] italic">
                            No {type}s found in system
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {contextMenu.view === 'add-enemy' && (
              <div className="flex flex-col h-[400px]">
                <div className="p-3 border-b border-[var(--line)] bg-black/10 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Skull size={14} className="text-[var(--accent)]" />
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
                    <div className="flex-1 overflow-y-auto py-1">
                      {BESTIARY.filter(m => m.name.toLowerCase().includes(monsterSearch.toLowerCase())).map(m => (
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
                          <span className={cn("text-[9px] font-sans opacity-50", selectedMonster?.id === m.id ? "text-white" : "")}>CR {m.cr}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Panel: Details */}
                  <div className="w-1/2 flex flex-col overflow-hidden bg-black/5">
                    {selectedMonster ? (
                      <>
                        <div className="flex-1 overflow-y-auto p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-lg font-bold tracking-tight">{selectedMonster.name}</h4>
                            <div className="flex gap-2">
                              <div className="bg-[var(--accent)]/20 text-[var(--accent)] px-2 py-0.5 rounded text-[10px] font-bold">HP {selectedMonster.hp}</div>
                              <div className="bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded text-[10px] font-bold">AC {selectedMonster.ac}</div>
                            </div>
                          </div>
                          <p className="text-[10px] italic opacity-50 mb-4">{selectedMonster.type}</p>
                          
                          <div className="grid grid-cols-6 gap-1 mb-4 text-center">
                            {Object.entries(selectedMonster.stats).map(([stat, val]) => (
                              <div key={stat} className="bg-black/20 rounded p-1">
                                <div className="text-[8px] uppercase opacity-50">{stat}</div>
                                <div className="text-xs font-bold">{val}</div>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-3">
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Description</h5>
                              <p className="text-xs leading-relaxed opacity-70">{selectedMonster.description}</p>
                            </div>
                            <div>
                              <h5 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-1">Actions</h5>
                              <div className="space-y-2">
                                {selectedMonster.actions.map((action, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-bold italic">{action.name}.</span> {action.desc}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
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
                              for (let i = 0; i < monsterQuantity; i++) {
                                // Add a small offset for each subsequent token so they aren't perfectly stacked
                                onAddEnemy(selectedMonster, contextMenu.x + (i * 10), contextMenu.y + (i * 10));
                              }
                              setContextMenu(null);
                            }}
                            className="btn-filled w-full py-2 rounded-lg"
                          >
                            <PlusCircle size={14} />
                            Add {monsterQuantity > 1 ? `${monsterQuantity} Tokens` : 'to Map'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center opacity-20 p-8 text-center">
                        <Skull size={48} className="mb-4" />
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

        {/* Token Detail Panel */}
        {selectedTokenIds.length === 1 && (() => {
          const tokenId = selectedTokenIds[0];
          const token = tokens.find(t => t.id === tokenId);
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
      </div>
    </div>
  );
};
