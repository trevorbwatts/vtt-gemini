import type { WallPoint } from '../types';
import type { Segment } from './visibility';
import type { Token } from '../types';

/**
 * Find the closest point on line segment (a, b) to point p.
 */
function closestPointOnSegment(p: WallPoint, a: WallPoint, b: WallPoint): WallPoint {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return a; // degenerate segment

  // Project p onto the line, clamp t to [0, 1]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

/**
 * Map token size to a collision radius in pixels.
 * Mirrors getTokenSizeMultiplier in MapView.tsx.
 */
export function getTokenCollisionRadius(size: Token['size'] | undefined, pixelsPerGrid: number): number {
  const base = pixelsPerGrid * 0.4;
  let multiplier: number;
  switch (size) {
    case 'Tiny':       multiplier = 0.5; break;
    case 'Small':      multiplier = 0.75; break;
    case 'Large':      multiplier = 2;   break;
    case 'Huge':       multiplier = 3;   break;
    case 'Gargantuan': multiplier = 4;   break;
    default:           multiplier = 1;   break; // Medium / unset
  }
  return base * multiplier;
}

const MAX_ITERATIONS = 3;
const EPSILON = 0.001;
// Step size relative to radius — keeps each step small enough that
// the circle center can never jump over a wall in a single frame.
const STEP_FRACTION = 0.5;

/**
 * Apply one round of iterative depenetration at position (px, py).
 * Returns the pushed-out position.
 */
function depenetrate(
  px: number,
  py: number,
  prevX: number,
  prevY: number,
  radius: number,
  segments: Segment[]
): { x: number; y: number } {
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let deepestDepth = 0;
    let normalX = 0;
    let normalY = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const closest = closestPointOnSegment({ x: px, y: py }, seg.a, seg.b);
      const dx = px - closest.x;
      const dy = py - closest.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const penetration = radius - dist;

      if (penetration > deepestDepth) {
        if (dist < EPSILON) {
          // Center is exactly on the segment — use perpendicular normal
          const edgeX = seg.b.x - seg.a.x;
          const edgeY = seg.b.y - seg.a.y;
          const edgeLen = Math.sqrt(edgeX * edgeX + edgeY * edgeY);
          if (edgeLen < EPSILON) continue;
          let nx = -edgeY / edgeLen;
          let ny = edgeX / edgeLen;
          // Pick the side facing prevPos
          if (nx * (prevX - closest.x) + ny * (prevY - closest.y) < 0) {
            nx = -nx;
            ny = -ny;
          }
          normalX = nx;
          normalY = ny;
        } else {
          normalX = dx / dist;
          normalY = dy / dist;
        }
        deepestDepth = penetration;
      }
    }

    if (deepestDepth <= 0) break;
    px += normalX * (deepestDepth + EPSILON);
    py += normalY * (deepestDepth + EPSILON);
  }

  return { x: px, y: py };
}

/**
 * Constrain a circle (token) against wall segments.
 *
 * Divides the movement into small steps (≤ radius * STEP_FRACTION) so the
 * circle center can never tunnel through a wall regardless of drag speed.
 * At each step, iterative depenetration produces natural sliding behavior.
 *
 * @param newPos   - Where the drag event wants to place the token center
 * @param prevPos  - Last valid (collision-free) position
 * @param radius   - Token collision radius in pixels
 * @param segments - Blocking wall segments (walls + object walls + closed portals)
 * @returns The corrected position
 */
export function constrainPositionAgainstWalls(
  newPos: WallPoint,
  prevPos: WallPoint,
  radius: number,
  segments: Segment[]
): WallPoint {
  const totalDx = newPos.x - prevPos.x;
  const totalDy = newPos.y - prevPos.y;
  const dist = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

  const stepSize = Math.max(1, radius * STEP_FRACTION);
  const steps = Math.max(1, Math.ceil(dist / stepSize));

  let px = prevPos.x;
  let py = prevPos.y;
  const stepX = totalDx / steps;
  const stepY = totalDy / steps;

  for (let s = 0; s < steps; s++) {
    const result = depenetrate(px + stepX, py + stepY, px, py, radius, segments);
    px = result.x;
    py = result.y;
  }

  return { x: px, y: py };
}
