import React from 'react';
import { Shape } from 'react-konva';
import { WallPoint } from '../types';

interface FogOfWarLayerProps {
  visibilityPolygons: WallPoint[][];
  mapWidth: number;
  mapHeight: number;
  opacity: number;
}

export const FogOfWarLayer: React.FC<FogOfWarLayerProps> = ({
  visibilityPolygons,
  mapWidth,
  mapHeight,
  opacity,
}) => {
  return (
    <Shape
      sceneFunc={(ctx) => {
        // Fill entire map with black
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, mapWidth, mapHeight);

        // Cut out visibility polygons using destination-out
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'white';

        for (const polygon of visibilityPolygons) {
          if (polygon.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(polygon[0].x, polygon[0].y);
          for (let i = 1; i < polygon.length; i++) {
            ctx.lineTo(polygon[i].x, polygon[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }

        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
      }}
      opacity={opacity}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};
