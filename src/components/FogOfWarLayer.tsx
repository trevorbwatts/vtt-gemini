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
        // Access the native canvas 2D context
        const c = ctx._context as CanvasRenderingContext2D;

        c.save();
        c.beginPath();

        // Outer rectangle (the fog) — clockwise
        c.moveTo(0, 0);
        c.lineTo(mapWidth, 0);
        c.lineTo(mapWidth, mapHeight);
        c.lineTo(0, mapHeight);
        c.closePath();

        // Cut out each visibility polygon — counter-clockwise (evenodd will invert these)
        for (const polygon of visibilityPolygons) {
          if (polygon.length < 3) continue;
          c.moveTo(polygon[0].x, polygon[0].y);
          // Draw in reverse order to create counter-clockwise winding
          for (let i = polygon.length - 1; i >= 1; i--) {
            c.lineTo(polygon[i].x, polygon[i].y);
          }
          c.closePath();
        }

        c.fillStyle = 'black';
        c.fill('evenodd');
        c.restore();
      }}
      opacity={opacity}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};
