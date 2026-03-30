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
        const c = ctx._context as CanvasRenderingContext2D;

        c.save();

        // Fill the entire map with fog, baking opacity into the fill color so
        // destination-out cuts clean holes without offscreen-buffer compositing
        // artifacts (which occur when the Shape node itself has opacity < 1).
        // Padding the rect slightly (-2) prevents edge bleeding artifacts from 
        // sub-pixel rendering.
        c.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        c.fillRect(-2, -2, mapWidth + 4, mapHeight + 4);

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

        // Reset compositing
        c.globalCompositeOperation = 'source-over';
        c.restore();
      }}
      opacity={1}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
};
