import React from 'react';
import { Layer } from 'react-konva';
import type { SpellMarker } from '../../types';
import { computeWallCorners } from './helpers';
import {
  WallOfFireParticles, WindWallParticles, WallOfLightParticles, WallOfSandParticles,
  WallOfFireRingParticles, WallOfIceParticles, WallOfIceDomeParticles, WallOfForceParticles,
  WallOfForceDomeParticles, PrismaticWallParticles, WallOfThornsParticles, WallOfThornsRingParticles,
  HallowParticles, ForcecageBarsParticles, ForcecageBoxParticles, PasswallParticles,
  BladeBarrierParticles, BladeBarrierRingParticles,
} from './particles';

/**
 * All wall/ring spell particle layers. Each spell gets its own Konva Layer,
 * isolated so RAF-driven particle redraws don't dirty the other layers.
 */
export const WallSpellParticleLayers: React.FC<{
  spellMarkers: SpellMarker[];
  isPlayerView?: boolean;
  activeFloorId?: string | null;
  ppg: number;
}> = ({ spellMarkers, isPlayerView, activeFloorId, ppg }) => {
  return (
    <>
      {/* ── Wall of Fire particle layer — isolated so RAF redraws don't dirty other layers ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Fire' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Fire' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 10, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfFireParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wind Wall particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wind Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wind Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WindWallParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Light particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Light' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Light' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfLightParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Sand particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Sand' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Sand' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfSandParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Fire Ring particle layer ── */}
      {spellMarkers.some(m => (m.shapeType === 'ring' || m.spellName === 'Wall of Fire (Ring)') && m.spellName !== 'Wall of Ice (Dome)' && m.spellName !== 'Wall of Force (Dome)' && m.spellName !== 'Wall of Thorns (Ring)' && m.spellName !== 'Blade Barrier (Ring)' && m.spellName !== 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => (m.shapeType === 'ring' || m.spellName === 'Wall of Fire (Ring)') && m.spellName !== 'Wall of Ice (Dome)' && m.spellName !== 'Wall of Force (Dome)' && m.spellName !== 'Wall of Thorns (Ring)' && m.spellName !== 'Blade Barrier (Ring)' && m.spellName !== 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <WallOfFireRingParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
                hotSide={m.hotSide ?? 'outside'}
              />
            ))}
        </Layer>
      )}

      {/* ── Wall of Ice particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Ice' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Ice' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfIceParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Ice Dome particle layer ── */}
      {spellMarkers.some(m => m.spellName === 'Wall of Ice (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.spellName === 'Wall of Ice (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <WallOfIceDomeParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
              />
            ))}
        </Layer>
      )}

      {/* ── Wall of Force particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Force' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Force' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 30, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfForceParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Force Dome particle layer ── */}
      {spellMarkers.some(m => m.spellName === 'Wall of Force (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.spellName === 'Wall of Force (Dome)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <WallOfForceDomeParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
              />
            ))}
        </Layer>
      )}

      {/* ── Prismatic Wall particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Prismatic Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Prismatic Wall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 90, m.thickness ?? 1, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <PrismaticWallParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Thorns particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Wall of Thorns' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Wall of Thorns' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 60, m.thickness ?? 5, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <WallOfThornsParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Wall of Thorns Ring particle layer ── */}
      {spellMarkers.some(m => m.spellName === 'Wall of Thorns (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.spellName === 'Wall of Thorns (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <WallOfThornsRingParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 10) / 5) * ppg}
              />
            ))}
        </Layer>
      )}

      {/* ── Hallow particle layer ── */}
      {spellMarkers.some(m => m.spellName === 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.spellName === 'Hallow' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <HallowParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 30) / 5) * ppg}
              />
            ))}
        </Layer>
      )}

      {/* ── Forcecage particle layer (Cage variant — bars) ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Forcecage' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Forcecage' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <ForcecageBarsParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                lengthPx={((m.length ?? 20) / 5) * ppg}
                thicknessPx={((m.thickness ?? 20) / 5) * ppg}
                angleRad={(m.angle ?? 0) * Math.PI / 180}
              />
            ))}
        </Layer>
      )}

      {/* ── Forcecage particle layer (Box variant — solid shimmer) ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Forcecage (Box)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Forcecage (Box)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <ForcecageBoxParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                lengthPx={((m.length ?? 10) / 5) * ppg}
                thicknessPx={((m.thickness ?? 10) / 5) * ppg}
                angleRad={(m.angle ?? 0) * Math.PI / 180}
              />
            ))}
        </Layer>
      )}

      {/* ── Passwall particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Passwall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Passwall' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 20, m.thickness ?? 5, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <PasswallParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Blade Barrier particle layer ── */}
      {spellMarkers.some(m => m.shapeType === 'wall' && m.spellName === 'Blade Barrier' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.shapeType === 'wall' && m.spellName === 'Blade Barrier' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => {
              const wCorners = computeWallCorners(m.x, m.y, m.length ?? 100, m.thickness ?? 5, m.angle ?? 0, ppg);
              const ang = (m.angle ?? 0) * Math.PI / 180;
              return (
                <BladeBarrierParticles
                  key={m.id}
                  p0={wCorners[0]}
                  p1={wCorners[1]}
                  normalX={Math.sin(ang)}
                  normalY={-Math.cos(ang)}
                />
              );
            })}
        </Layer>
      )}

      {/* ── Blade Barrier Ring particle layer ── */}
      {spellMarkers.some(m => m.spellName === 'Blade Barrier (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId)) && (
        <Layer listening={false}>
          {spellMarkers
            .filter(m => m.spellName === 'Blade Barrier (Ring)' && (!isPlayerView || m.visibleToPlayers) && (!m.floorId || m.floorId === activeFloorId))
            .map(m => (
              <BladeBarrierRingParticles
                key={m.id}
                cx={m.x}
                cy={m.y}
                radiusPx={((m.aoeSize ?? 30) / 5) * ppg}
              />
            ))}
        </Layer>
      )}
    </>
  );
};
