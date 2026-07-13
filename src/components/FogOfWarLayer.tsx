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
  /** StarCraft-style explored-area memory: a (possibly downscaled) canvas of
   *  the map terrain pre-dimmed by EXPLORED_DIM and masked to areas players
   *  have ever seen. Painted ON TOP of the fog (source-atop) so the fog stays
   *  fully opaque — tokens underneath are properly occluded, while explored
   *  terrain still reads through as dim "memory". */
  exploredOverlayCanvas?: HTMLCanvasElement | null;
  /** Bumped whenever the overlay canvas contents change, to trigger a redraw. */
  exploredMaskVersion?: number;
  mapWidth: number;
  mapHeight: number;
  opacity: number;
}

/** How much explored-but-not-visible terrain is darkened.
 *  0.65 → terrain shows at 35% brightness on the player screen. */
export const EXPLORED_DIM = 0.65;

export const FogOfWarLayer: React.FC<FogOfWarLayerProps> = ({
  visibilityPolygons,
  playerLOSPolygons,
  lightPolygons,
  darkZonePolygons = [],
  darkvisionRevealPolygons = [],
  exploredOverlayCanvas = null,
  exploredMaskVersion = 0,
  mapWidth,
  mapHeight,
  opacity,
}) => {
  // Konva only redraws when an attr changes; reference the version so the
  // sceneFunc closure is new (and the layer repaints) after async mask updates.
  void exploredMaskVersion;
  return (
    <Shape
      sceneFunc={(ctx) => {
        const c = ctx._context as CanvasRenderingContext2D;

        /** Trace a closed polygon path onto the context (no fill/stroke). */
        const trace = (polygon: WallPoint[]) => {
          c.beginPath();
          c.moveTo(polygon[0].x, polygon[0].y);
          for (let i = 1; i < polygon.length; i++) {
            c.lineTo(polygon[i].x, polygon[i].y);
          }
          c.closePath();
        };

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
          trace(polygon);
          c.fillStyle = 'black';
          c.fill();
        }

        // ── Dark Zones ──
        // Re-fog the inside of every dark-zone polygon so the floor goes dark
        // even though the LOS reveal above cleared it. Erase first, then paint,
        // so partially-fogged areas end up at a uniform opacity instead of
        // stacking darker than the surrounding fog (visible at DM preview opacity).
        if (darkZonePolygons.length) {
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = 'black';
          for (const polygon of darkZonePolygons) {
            if (polygon.length < 3) continue;
            trace(polygon);
            c.fill();
          }
          c.globalCompositeOperation = 'source-over';
          c.fillStyle = `rgba(0, 0, 0, ${opacity})`;
          for (const polygon of darkZonePolygons) {
            if (polygon.length < 3) continue;
            trace(polygon);
            c.fill();
          }

          // Darkvision-limited LOS: tokens with darkvision/blindsight see partway in.
          if (darkvisionRevealPolygons.length) {
            c.globalCompositeOperation = 'destination-out';
            c.fillStyle = 'black';
            for (const polygon of darkvisionRevealPolygons) {
              if (polygon.length < 3) continue;
              trace(polygon);
              c.fill();
            }
          }
        }

        // Light-source visibility: erase fog where a player has LOS to a lit area.
        // Runs AFTER the dark-zone re-fog so torches and other light sources carve
        // into dark zones too. Uses canvas clip() to compute the intersection of
        // player LOS and light illumination without any polygon math — clip()
        // restricts all drawing to the player's LOS polygon, so only the overlap
        // with the light polygon is erased.
        if (playerLOSPolygons.length && lightPolygons.length) {
          c.globalCompositeOperation = 'destination-out';
          for (const losPolygon of playerLOSPolygons) {
            if (losPolygon.length < 3) continue;
            for (const lightPolygon of lightPolygons) {
              if (lightPolygon.length < 3) continue;
              c.save();
              // Clip to player's line-of-sight (walls block vision from player's side)
              trace(losPolygon);
              c.clip();
              // Erase the light's illumination polygon within the clip
              trace(lightPolygon);
              c.fillStyle = 'black';
              c.fill();
              c.restore();
            }
          }
        }

        // ── Explored memory (StarCraft-style) ──
        // Paint pre-dimmed terrain on top of the remaining fog. source-atop
        // only draws where fog still exists, so currently-visible areas (fog
        // fully erased) are untouched, explored areas show dim terrain, and
        // never-seen areas stay black (the overlay is transparent there).
        // Because the fog itself stays opaque, tokens underneath are occluded
        // exactly at the visibility boundary — a half-exposed token shows half.
        if (exploredOverlayCanvas) {
          c.globalCompositeOperation = 'source-atop';
          c.drawImage(exploredOverlayCanvas, 0, 0, mapWidth, mapHeight);
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
