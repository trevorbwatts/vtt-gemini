import React from 'react';
import { Shape } from 'react-konva';
import { WallPoint } from '../types';

interface FogOfWarLayerProps {
  visibilityPolygons: WallPoint[][];
  playerLOSPolygons: WallPoint[][];
  lightPolygons: WallPoint[][];
  /** Polygonal regions that should be re-fogged on top of the daylight reveal
   *  (e.g. caves/houses marked as Dark Zones). */
  darkZonePolygons?: WallPoint[][];
  /** Darkvision-limited LOS polygons used to re-erase fog inside dark zones —
   *  so a token with darkvision can still see partway into a dark room. */
  darkvisionRevealPolygons?: WallPoint[][];
  mapWidth: number;
  mapHeight: number;
  opacity: number;
}

export const FogOfWarLayer: React.FC<FogOfWarLayerProps> = ({
  visibilityPolygons,
  playerLOSPolygons,
  lightPolygons,
  darkZonePolygons = [],
  darkvisionRevealPolygons = [],
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

        // Light-source visibility: erase fog where a player has LOS to a lit area.
        // Uses canvas clip() to compute the intersection of player LOS and light
        // illumination without any polygon math — clip() restricts all drawing to
        // the player's LOS polygon, so only the overlap with the light polygon is erased.
        if (playerLOSPolygons.length && lightPolygons.length) {
          for (const losPolygon of playerLOSPolygons) {
            if (losPolygon.length < 3) continue;
            for (const lightPolygon of lightPolygons) {
              if (lightPolygon.length < 3) continue;
              c.save();
              // Clip to player's line-of-sight (walls block vision from player's side)
              c.beginPath();
              c.moveTo(losPolygon[0].x, losPolygon[0].y);
              for (let i = 1; i < losPolygon.length; i++) c.lineTo(losPolygon[i].x, losPolygon[i].y);
              c.closePath();
              c.clip();
              // Erase the light's illumination polygon within the clip
              c.beginPath();
              c.moveTo(lightPolygon[0].x, lightPolygon[0].y);
              for (let i = 1; i < lightPolygon.length; i++) c.lineTo(lightPolygon[i].x, lightPolygon[i].y);
              c.closePath();
              c.fillStyle = 'black';
              c.fill();
              c.restore();
            }
          }
        }

        // ── Dark Zones ──
        // Re-paint fog inside any dark-zone polygons so the floor goes dark
        // even though the LOS reveal above cleared it. Then erase again using
        // darkvision-limited LOS so tokens with darkvision can see partway in.
        if (darkZonePolygons.length) {
          c.globalCompositeOperation = 'source-over';
          c.fillStyle = `rgba(0, 0, 0, ${opacity})`;
          for (const polygon of darkZonePolygons) {
            if (polygon.length < 3) continue;
            c.beginPath();
            c.moveTo(polygon[0].x, polygon[0].y);
            for (let i = 1; i < polygon.length; i++) {
              c.lineTo(polygon[i].x, polygon[i].y);
            }
            c.closePath();
            c.fill();
          }

          if (darkvisionRevealPolygons.length) {
            c.globalCompositeOperation = 'destination-out';
            for (const polygon of darkvisionRevealPolygons) {
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
          }
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
