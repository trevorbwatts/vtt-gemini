import React from 'react';
import { Shape } from 'react-konva';
import { WallPoint } from '../types';

interface FogOfWarLayerProps {
  visibilityPolygons: WallPoint[][];
  dimPolygons?: WallPoint[][];
  mapWidth: number;
  mapHeight: number;
  opacity: number;
}

export const FogOfWarLayer: React.FC<FogOfWarLayerProps> = ({
  visibilityPolygons,
  dimPolygons,
  mapWidth,
  mapHeight,
  opacity,
}) => {
  return (
    <Shape
      sceneFunc={(ctx) => {
        const c = ctx._context as CanvasRenderingContext2D;

        c.save();

        // Fill the entire map with fog
        c.fillStyle = 'black';
        c.fillRect(0, 0, mapWidth, mapHeight);

        // Use destination-out to erase the visible areas
        // This way overlapping polygons just erase the same area — no inversion
        c.globalCompositeOperation = 'destination-out';

        for (const polygon of visibilityPolygons) {
          if (polygon.length < 3) continue;
          c.beginPath();
          c.moveTo(polygon[0].x, polygon[0].y);
          for (let i = 1; i < polygon.length; i++) {
            c.lineTo(polygon[i].x, polygon[i].y);
          }
          c.closePath();
          c.fillStyle = 'black';
          c.fill();
        }

        // Dim light overlay: re-darken areas where tokens see in dim light
        // (non-darkvision characters in Dim darkness mode)
        if (dimPolygons && dimPolygons.length > 0) {
          c.globalCompositeOperation = 'source-over';
          c.fillStyle = 'rgba(0, 0, 0, 0.42)';
          for (const polygon of dimPolygons) {
            if (polygon.length < 3) continue;
            c.beginPath();
            c.moveTo(polygon[0].x, polygon[0].y);
            for (let i = 1; i < polygon.length; i++) {
              c.lineTo(polygon[i].x, polygon[i].y);
            }
            c.closePath();
            c.fill();
          }
        }

        // Reset compositing
        c.globalCompositeOperation = 'source-over';
        c.restore();
      }}
      opacity={opacity}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};
