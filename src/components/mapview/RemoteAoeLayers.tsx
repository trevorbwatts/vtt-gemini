import React from 'react';
import { Layer, Circle, Group, Line, Rect } from 'react-konva';
import { getDamageRgb } from '../../utils/damageColors';
import type { AoeState } from './helpers';
import {
  FireballParticles, FireConeParticles, FireLineParticles, FireCubeParticles,
  IceSphereParticles, IceConeParticles, WindConeParticles, GustOfWindParticles,
  RadialAoEParticles, ConeAoEParticles, LineAoEParticles, CubeAoEParticles,
  ThunderShockwaveParticles, ThunderCubeParticles, LightningSphereParticles, LightningLineParticles,
  isFireSphereSpell, isFireConeSpell, isFireLineSpell, isFireCubeSpell,
  isIceSphereSpell, isIceConeSpell, isWindConeSpell,
  isPoisonSphereSpell, isAcidSphereSpell, isAcidLineSpell, isNecroticSphereSpell, isNecroticConeSpell,
  isThunderSphereSpell, isThunderCubeSpell, isLightningSphereSpell, isLightningLineSpell,
  getSphereElement, getConeElement, getLineElement, getCubeElement, ELEMENT_STYLES,
  POISON_PALETTE, ACID_PALETTE, NECROTIC_PALETTE, THUNDER_PALETTE,
  POISON_GRADIENT, ACID_GRADIENT, NECROTIC_GRADIENT, THUNDER_GRADIENT, LIGHTNING_GRADIENT,
} from './particles';

/** Renders the AoE broadcast from the other screen (DM ↔ player). Read-only, non-interactive. */
export const RemoteAoeLayers: React.FC<{
  remoteAoe: AoeState;
  stageScale: number;
  ppg: number;
}> = ({ remoteAoe, stageScale, ppg }) => {
  const feetToPx = (ft: number) => (ft / 5) * ppg;
  const sizePx = feetToPx(remoteAoe.aoeSize);
  const strokeW = 2 / stageScale;
  const hasRemoteSaveResults = !!remoteAoe.saveResults;
  const remoteRgb = getDamageRgb(remoteAoe.damageType);
  const fillColor = hasRemoteSaveResults ? 'transparent' : `rgba(${remoteRgb}, 0.25)`;
  const strokeColor = `rgba(${remoteRgb}, 0.6)`;
  const aRad = remoteAoe.angle * (Math.PI / 180);
  const edgeX = remoteAoe.originX + Math.cos(aRad) * remoteAoe.casterRadiusPx;
  const edgeY = remoteAoe.originY + Math.sin(aRad) * remoteAoe.casterRadiusPx;
  const isAnchored = remoteAoe.aoeType === 'cone' || remoteAoe.aoeType === 'line' || !!remoteAoe.selfOrigin;

  return (
    <>
    <Layer listening={false}>
      {(remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
        const cx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
        const cy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
        return (
          <>
            <Circle
              x={cx}
              y={cy}
              radius={sizePx}
              fill={isFireSphereSpell(remoteAoe.name) || isIceSphereSpell(remoteAoe.name) || isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name) || isThunderSphereSpell(remoteAoe.name) || isLightningSphereSpell(remoteAoe.name) || getSphereElement(remoteAoe.name) ? 'transparent' : fillColor}
              stroke={strokeColor} strokeWidth={strokeW}
              dash={[6 / stageScale, 4 / stageScale]}
            />
            {isIceSphereSpell(remoteAoe.name) && (
              <Circle
                x={cx}
                y={cy}
                radius={sizePx}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={sizePx}
                fillRadialGradientColorStops={[0, 'rgba(220,240,255,0.55)', 0.5, 'rgba(150,210,240,0.32)', 0.85, 'rgba(80,160,210,0.14)', 1, 'rgba(50,110,170,0)']}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {(isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name)) && (
              <Circle
                x={cx}
                y={cy}
                radius={sizePx}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={sizePx}
                fillRadialGradientColorStops={isNecroticSphereSpell(remoteAoe.name) ? NECROTIC_GRADIENT : isAcidSphereSpell(remoteAoe.name) ? ACID_GRADIENT : POISON_GRADIENT}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {isLightningSphereSpell(remoteAoe.name) && (
              <Circle
                x={cx}
                y={cy}
                radius={sizePx}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={sizePx}
                fillRadialGradientColorStops={LIGHTNING_GRADIENT}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {isThunderSphereSpell(remoteAoe.name) && (
              <Circle
                x={cx}
                y={cy}
                radius={sizePx}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={sizePx}
                fillRadialGradientColorStops={THUNDER_GRADIENT}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {getSphereElement(remoteAoe.name) && (
              <Circle
                x={cx}
                y={cy}
                radius={sizePx}
                fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                fillRadialGradientStartRadius={0}
                fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                fillRadialGradientEndRadius={sizePx}
                fillRadialGradientColorStops={ELEMENT_STYLES[getSphereElement(remoteAoe.name)!].gradient}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            {isFireSphereSpell(remoteAoe.name) && (
              <>
                <Circle
                  x={cx}
                  y={cy}
                  radius={sizePx}
                  fillRadialGradientStartPoint={{ x: 0, y: 0 }}
                  fillRadialGradientStartRadius={0}
                  fillRadialGradientEndPoint={{ x: 0, y: 0 }}
                  fillRadialGradientEndRadius={sizePx}
                  fillRadialGradientColorStops={[0, 'rgba(255,160,20,0.72)', 0.45, 'rgba(255,90,0,0.42)', 0.8, 'rgba(200,50,0,0.18)', 1, 'rgba(150,30,0,0)']}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </>
            )}
          </>
        );
      })()}
      {remoteAoe.aoeType === 'cube' && (() => {
        if (remoteAoe.selfOrigin) {
          const perpX = Math.cos(aRad + Math.PI / 2) * sizePx / 2;
          const perpY = Math.sin(aRad + Math.PI / 2) * sizePx / 2;
          const fwdX = Math.cos(aRad) * sizePx;
          const fwdY = Math.sin(aRad) * sizePx;
          const points = [-perpX, -perpY, perpX, perpY, perpX + fwdX, perpY + fwdY, -perpX + fwdX, -perpY + fwdY];
          return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
        }
        return <Rect x={remoteAoe.x - sizePx / 2} y={remoteAoe.y - sizePx / 2} width={sizePx} height={sizePx}
          fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
      })()}
      {remoteAoe.aoeType === 'cone' && (() => {
        const halfAngle = (53 / 2) * (Math.PI / 180);
        const points = [0, 0,
          Math.cos(aRad - halfAngle) * sizePx, Math.sin(aRad - halfAngle) * sizePx,
          Math.cos(aRad - halfAngle / 2) * sizePx, Math.sin(aRad - halfAngle / 2) * sizePx,
          Math.cos(aRad) * sizePx, Math.sin(aRad) * sizePx,
          Math.cos(aRad + halfAngle / 2) * sizePx, Math.sin(aRad + halfAngle / 2) * sizePx,
          Math.cos(aRad + halfAngle) * sizePx, Math.sin(aRad + halfAngle) * sizePx];
        return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
      })()}
      {remoteAoe.aoeType === 'line' && (() => {
        const halfWidth = feetToPx(5) / 2;
        const perpX = Math.cos(aRad + Math.PI / 2) * halfWidth;
        const perpY = Math.sin(aRad + Math.PI / 2) * halfWidth;
        const endX = Math.cos(aRad) * sizePx;
        const endY = Math.sin(aRad) * sizePx;
        const points = [-perpX, -perpY, endX - perpX, endY - perpY, endX + perpX, endY + perpY, perpX, perpY];
        return <Line x={edgeX} y={edgeY} points={points} closed fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} dash={[6 / stageScale, 4 / stageScale]} />;
      })()}
    </Layer>
    {isFireSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <FireballParticles radius={sizePx} />
          </Group>
        </Layer>
      );
    })()}
    {isFireConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <FireConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
        </Group>
      </Layer>
    )}
    {isFireLineSpell(remoteAoe.name) && remoteAoe.aoeType === 'line' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <FireLineParticles length={sizePx} width={feetToPx(5)} />
        </Group>
      </Layer>
    )}
    {isFireCubeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cube' && (
      <Layer listening={false}>
        {remoteAoe.selfOrigin ? (
          <Group
            x={edgeX + Math.cos(aRad) * sizePx / 2}
            y={edgeY + Math.sin(aRad) * sizePx / 2}
          >
            <FireCubeParticles size={sizePx} />
          </Group>
        ) : (
          <Group x={remoteAoe.x} y={remoteAoe.y}>
            <FireCubeParticles size={sizePx} />
          </Group>
        )}
      </Layer>
    )}
    {isIceSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <IceSphereParticles radius={sizePx} />
          </Group>
        </Layer>
      );
    })()}
    {isIceConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <IceConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
        </Group>
      </Layer>
    )}
    {isWindConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <WindConeParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} />
        </Group>
      </Layer>
    )}
    {(isPoisonSphereSpell(remoteAoe.name) || isAcidSphereSpell(remoteAoe.name) || isNecroticSphereSpell(remoteAoe.name)) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      const palette = isNecroticSphereSpell(remoteAoe.name) ? NECROTIC_PALETTE : isAcidSphereSpell(remoteAoe.name) ? ACID_PALETTE : POISON_PALETTE;
      const glow = isNecroticSphereSpell(remoteAoe.name) ? '#7e22ce' : isAcidSphereSpell(remoteAoe.name) ? '#a3e635' : '#65a30d';
      const shape: 'circle' | 'triangle' = isNecroticSphereSpell(remoteAoe.name) ? 'triangle' : 'circle';
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <RadialAoEParticles radius={sizePx} palette={palette} glow={glow} shape={shape} />
          </Group>
        </Layer>
      );
    })()}
    {isAcidLineSpell(remoteAoe.name) && remoteAoe.aoeType === 'line' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={ACID_PALETTE} glow="#a3e635" />
        </Group>
      </Layer>
    )}
    {isNecroticConeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={NECROTIC_PALETTE} glow="#7e22ce" shape="triangle" />
        </Group>
      </Layer>
    )}
    {isLightningSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <LightningSphereParticles radius={sizePx} />
          </Group>
        </Layer>
      );
    })()}
    {isLightningLineSpell(remoteAoe.name) && remoteAoe.aoeType === 'line' && (
      <Layer listening={false}>
        <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
          <LightningLineParticles length={sizePx} width={feetToPx(5)} />
        </Group>
      </Layer>
    )}
    {isThunderSphereSpell(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <ThunderShockwaveParticles radius={sizePx} />
          </Group>
        </Layer>
      );
    })()}
    {isThunderCubeSpell(remoteAoe.name) && remoteAoe.aoeType === 'cube' && (() => {
      const groupX = remoteAoe.selfOrigin ? edgeX + Math.cos(aRad) * sizePx / 2 : remoteAoe.x;
      const groupY = remoteAoe.selfOrigin ? edgeY + Math.sin(aRad) * sizePx / 2 : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={groupX} y={groupY}>
            <ThunderCubeParticles size={sizePx} />
          </Group>
        </Layer>
      );
    })()}
    {getSphereElement(remoteAoe.name) && (remoteAoe.aoeType === 'sphere' || remoteAoe.aoeType === 'cylinder') && (() => {
      const rcx = isAnchored ? remoteAoe.originX + Math.cos(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.x;
      const rcy = isAnchored ? remoteAoe.originY + Math.sin(aRad) * (remoteAoe.casterRadiusPx + sizePx) : remoteAoe.y;
      const s = ELEMENT_STYLES[getSphereElement(remoteAoe.name)!];
      return (
        <Layer listening={false}>
          <Group x={rcx} y={rcy}>
            <RadialAoEParticles radius={sizePx} palette={s.palette} glow={s.glow} basePeriod={s.basePeriod} inwardChance={s.inwardChance} shape={s.shape} />
          </Group>
        </Layer>
      );
    })()}
    {getConeElement(remoteAoe.name) && remoteAoe.aoeType === 'cone' && (() => {
      const s = ELEMENT_STYLES[getConeElement(remoteAoe.name)!];
      return (
        <Layer listening={false}>
          <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
            <ConeAoEParticles length={sizePx} halfAngle={(53 / 2) * (Math.PI / 180)} palette={s.palette} glow={s.glow} shape={s.shape} />
          </Group>
        </Layer>
      );
    })()}
    {getLineElement(remoteAoe.name) && remoteAoe.aoeType === 'line' && (() => {
      const s = ELEMENT_STYLES[getLineElement(remoteAoe.name)!];
      return (
        <Layer listening={false}>
          <Group x={edgeX} y={edgeY} rotation={(aRad * 180) / Math.PI}>
            <LineAoEParticles length={sizePx} width={feetToPx(5)} palette={s.palette} glow={s.glow} />
          </Group>
        </Layer>
      );
    })()}
    {getCubeElement(remoteAoe.name) && remoteAoe.aoeType === 'cube' && (() => {
      const s = ELEMENT_STYLES[getCubeElement(remoteAoe.name)!];
      const groupX = remoteAoe.selfOrigin ? edgeX + Math.cos(aRad) * sizePx / 2 : remoteAoe.x;
      const groupY = remoteAoe.selfOrigin ? edgeY + Math.sin(aRad) * sizePx / 2 : remoteAoe.y;
      return (
        <Layer listening={false}>
          <Group x={groupX} y={groupY}>
            <CubeAoEParticles size={sizePx} palette={s.palette} glow={s.glow} />
          </Group>
        </Layer>
      );
    })()}
    {remoteAoe.name === 'Gust of Wind' && remoteAoe.aoeType === 'line' && (
      <Layer listening={false}>
        <Group
          x={edgeX}
          y={edgeY}
          rotation={(aRad * 180) / Math.PI}
        >
          <GustOfWindParticles length={sizePx} width={feetToPx(5)} />
        </Group>
      </Layer>
    )}
  </>
  );
};
